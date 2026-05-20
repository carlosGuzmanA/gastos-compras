import { useState, useEffect, useCallback } from 'react';
import { LayoutDashboard, PlusCircle, History, User, LogOut, WifiOff, Bell, Settings } from 'lucide-react';
import { supabase, isSupabaseConfigured } from './utils/supabaseClient';
import { NotificationManager } from './utils/NotificationManager';
import { UserSelection } from './components/UserSelection';
import { Dashboard } from './components/Dashboard';
import { ExpenseForm } from './components/ExpenseForm';
import { ExpenseList } from './components/ExpenseList';

interface Gasto {
  id: string;
  concepto: string;
  monto: number;
  categoria: string;
  tipo: 'contado' | 'fiado';
  proveedor: string | null;
  pagado: boolean;
  creado_por: string;
  fecha: string;
  created_at?: string;
  is_offline?: boolean;
}

function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'form' | 'history'>('dashboard');
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<Gasto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  // Estado de Notificaciones Push
  const [showNotificationBanner, setShowNotificationBanner] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushDenied, setPushDenied] = useState(false);

  // Cargar usuario del almacenamiento local
  useEffect(() => {
    const user = localStorage.getItem('negocio_gasto_user');
    if (user) {
      setCurrentUser(user);
    }
  }, []);

  // Escuchar cambios de conexión de red
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncOfflineExpenses();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Obtener gastos (de Supabase u Offline)
  const fetchExpenses = useCallback(async () => {
    setIsLoading(true);
    let allExpenses: Gasto[] = [];

    // 1. Obtener gastos locales (offline)
    const localExpenses = JSON.parse(localStorage.getItem('offline_expenses') || '[]');
    const localExpensesMapped = localExpenses.map((exp: any) => ({ ...exp, is_offline: true }));

    if (isSupabaseConfigured && navigator.onLine) {
      try {
        // 2. Obtener gastos de Supabase ordenados por fecha y creación
        const { data, error } = await supabase
          .from('gastos')
          .select('*')
          .order('fecha', { ascending: false })
          .order('created_at', { ascending: false });

        if (error) throw error;
        
        if (data) {
          allExpenses = [...localExpensesMapped, ...data];
          // Guardar copia limpia en caché local para lectura offline posterior
          localStorage.setItem('cached_expenses', JSON.stringify(data));
        }
      } catch (err) {
        console.error('Error al descargar gastos de Supabase:', err);
        // Fallback a caché
        const cached = JSON.parse(localStorage.getItem('cached_expenses') || '[]');
        allExpenses = [...localExpensesMapped, ...cached];
      }
    } else {
      // Offline o sin configuración
      const cached = JSON.parse(localStorage.getItem('cached_expenses') || '[]');
      allExpenses = [...localExpensesMapped, ...cached];
    }

    setExpenses(allExpenses);
    setIsLoading(false);
  }, []);

  // Sincronizar gastos locales sin conexión a Supabase
  const syncOfflineExpenses = async () => {
    if (!isSupabaseConfigured || !navigator.onLine) return;
    const offlineExpenses = JSON.parse(localStorage.getItem('offline_expenses') || '[]');
    if (offlineExpenses.length === 0) return;

    try {
      // Filtrar campos temporales locales como 'id' y banderas offline
      const toUpload = offlineExpenses.map(({ id, is_offline, is_dirty, ...rest }: any) => rest);
      
      const { error } = await supabase.from('gastos').insert(toUpload);
      if (!error) {
        console.log('Gastos offline sincronizados con éxito en Supabase.');
        localStorage.removeItem('offline_expenses');
        fetchExpenses();
      }
    } catch (err) {
      console.error('Error durante la sincronización offline:', err);
    }
  };

  // Cargar datos en el inicio y configurar oyentes en tiempo real
  useEffect(() => {
    fetchExpenses();

    // Sincronizar si corresponde
    if (isOnline) {
      syncOfflineExpenses();
    }

    if (!isSupabaseConfigured) return;

    // Escuchar cambios en tiempo real
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'gastos' },
        () => {
          fetchExpenses();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchExpenses, isOnline]);

  // Verificar estado de notificaciones push para mostrar banner o inicializar estado
  useEffect(() => {
    if (NotificationManager.isSupported() && isSupabaseConfigured) {
      const state = NotificationManager.getPermissionState();
      
      // Comprobar si ya existe suscripción activa
      if (state === 'denied') {
        setPushDenied(true);
        setShowNotificationBanner(true);
        return;
      }

      navigator.serviceWorker.ready.then((registration) => {
        registration.pushManager.getSubscription().then((sub) => {
          if (sub) {
            setPushSubscribed(true);
            setShowNotificationBanner(false);
          } else if (state === 'default' || state === 'granted') {
            // Mostrar banner si el permiso es por defecto o si ya fue concedido pero no hay suscripción activa
            setShowNotificationBanner(true);
          }
        });
      });
    }
  }, []);

  const handleSubscribePush = async () => {
    if (!currentUser || !currentUser.trim()) {
      alert('Selecciona tu usuario antes de activar las notificaciones.');
      return;
    }
    try {
      const sub = await NotificationManager.requestPermissionAndSubscribe(currentUser);
      if (sub) {
        setPushSubscribed(true);
        setShowNotificationBanner(false);
        alert('¡Suscrito con éxito! Recibirás notificaciones cuando se anoten gastos.');
      }
    } catch (err) {
      console.error(err);
      alert('No se pudo activar las notificaciones. Verifica los permisos del navegador.');
    }
  };

  const handleUnsubscribePush = async () => {
    try {
      const success = await NotificationManager.unsubscribe();
      if (success) {
        setPushSubscribed(false);
        alert('Notificaciones desactivadas en este dispositivo.');
      } else {
        alert('No se pudo desactivar las notificaciones o ya estaban inactivas.');
      }
    } catch (err) {
      console.error(err);
      alert('Error al intentar desactivar las notificaciones.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('negocio_gasto_user');
    setCurrentUser(null);
  };

  if (!currentUser) {
    return <UserSelection onSelectUser={setCurrentUser} />;
  }

  return (
    <div className="app-container">
      {/* Sidebar para desktop, Header para móvil */}
      <aside className="glass-panel" style={{ display: 'flex', flexDirection: 'column', height: 'fit-content' }}>
        <div className="app-header" style={{ marginBottom: '16px', borderBottom: 'none', paddingBottom: 0 }}>
          <h1 className="app-title">
            <span style={{ fontSize: '2rem' }}>💰</span> Control
          </h1>
        </div>

        {/* Info de Usuario y Estado */}
        <div style={{ background: 'rgba(0,0,0,0.15)', padding: '12px', borderRadius: 'var(--radius-sm)', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="avatar-icon-circle" style={{ width: '28px', height: '28px', background: 'var(--primary-glow)', color: 'var(--primary)' }}>
                <User size={14} />
              </div>
              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{currentUser}</span>
              {pushSubscribed && (
                <span title="Notificaciones push activas" style={{ display: 'inline-flex', alignSelf: 'center', marginLeft: '4px', color: 'var(--success)' }}>
                  <Bell size={12} fill="var(--success)" />
                </span>
              )}
            </div>
            <button 
              onClick={handleLogout} 
              style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              title="Cerrar perfil"
            >
              <LogOut size={16} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isOnline ? 'var(--success)' : 'var(--danger)' }}></div>
              <span>{isOnline ? 'Conectado a Internet' : 'Modo Offline (Local)'}</span>
            </div>
            {!isOnline && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--warning)' }}>
                <WifiOff size={12} />
                <span>Los cambios se guardan localmente</span>
              </div>
            )}

            {NotificationManager.isSupported() && isSupabaseConfigured && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '8px' }}>
                <button
                  onClick={pushSubscribed ? handleUnsubscribePush : handleSubscribePush}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: pushSubscribed ? 'var(--success)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    width: '100%',
                    textAlign: 'left'
                  }}
                >
                  <Bell size={12} fill={pushSubscribed ? 'var(--success)' : 'none'} style={{ color: pushSubscribed ? 'var(--success)' : 'var(--text-secondary)' }} />
                  <span>{pushSubscribed ? 'Notificaciones Activas' : 'Activar Notificaciones'}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Navegación Desktop */}
        <nav className="nav-bar">
          <button 
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <LayoutDashboard size={20} />
            <span>Dashboard</span>
          </button>
          <button 
            className={`nav-item ${activeTab === 'form' ? 'active' : ''}`}
            onClick={() => setActiveTab('form')}
          >
            <PlusCircle size={20} />
            <span>Registrar Gasto</span>
          </button>
          <button 
            className={`nav-item ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <History size={20} />
            <span>Historial</span>
          </button>
        </nav>
      </aside>

      {/* Área de Contenido Principal */}
      <main style={{ width: '100%' }}>
        {/* Banner de Supabase No Configurado */}
        {!isSupabaseConfigured && (
          <div 
            className="glass-panel" 
            style={{ 
              marginBottom: '20px', 
              background: 'rgba(245, 158, 11, 0.08)', 
              borderColor: 'rgba(245, 158, 11, 0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}
          >
            <Settings size={24} style={{ color: 'var(--warning)', flexShrink: 0 }} />
            <div style={{ fontSize: '0.85rem' }}>
              <p style={{ fontWeight: 600, color: 'var(--warning)', marginBottom: '2px' }}>Modo de Demostración Activo</p>
              <p style={{ color: 'var(--text-secondary)' }}>
                Configura tu base de datos y notificaciones push gratuitas siguiendo las instrucciones en el archivo 
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', marginLeft: '4px', color: '#fff' }}>SUPABASE_SETUP.md</code>.
              </p>
            </div>
          </div>
        )}

        {/* Banner de Notificaciones Push */}
        {showNotificationBanner && (
          <div className="notification-banner fade-in">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Bell size={18} style={{ color: pushDenied ? 'var(--warning)' : 'var(--primary)', flexShrink: 0 }} />
              <span className="notification-banner-text">
                {pushDenied
                  ? 'Las notificaciones están bloqueadas. Haz clic en el candado de la URL → Configuración del sitio → Notificaciones → Permitir, y recarga la página.'
                  : '¿Deseas activar las notificaciones push al registrar gastos en el negocio?'}
              </span>
            </div>
            <div className="notification-banner-actions">
              {!pushDenied && (
                <button
                  className="btn btn-primary notification-banner-btn"
                  onClick={handleSubscribePush}
                >
                  Activar
                </button>
              )}
              <button
                className="btn btn-secondary notification-banner-btn"
                onClick={() => setShowNotificationBanner(false)}
              >
                {pushDenied ? 'Entendido' : 'Omitir'}
              </button>
            </div>
          </div>
        )}

        {/* Renderizado dinámico de Vistas */}
        {activeTab === 'dashboard' && <Dashboard expenses={expenses} />}
        
        {activeTab === 'form' && (
          <ExpenseForm 
            currentUser={currentUser} 
            onExpenseAdded={() => {
              fetchExpenses();
              setActiveTab('dashboard'); // Volver a dashboard tras agregar
            }} 
          />
        )}
        
        {activeTab === 'history' && (
          <ExpenseList 
            expenses={expenses} 
            isLoading={isLoading} 
            onExpenseUpdated={fetchExpenses} 
          />
        )}
      </main>

      {/* Navegación Móvil (Solo visible mediante CSS media-queries en index.css) */}
      <div className="nav-bar-mobile-only" style={{ display: 'none' }}>
        {/* Esto se controla por CSS en index.css, pero para seguridad inyectamos el HTML correspondiente aquí */}
        <style>{`
          @media (max-width: 1023px) {
            .nav-bar-mobile-only {
              display: flex !important;
              position: fixed;
              bottom: 0;
              left: 0;
              right: 0;
              height: 72px;
              background: rgba(12, 12, 24, 0.9);
              backdrop-filter: blur(20px);
              -webkit-backdrop-filter: blur(20px);
              border-top: 1px solid var(--border-light);
              justify-content: space-around;
              align-items: center;
              padding: 0 12px;
              z-index: 100;
            }
            .mobile-nav-item {
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 4px;
              background: none;
              border: none;
              color: var(--text-secondary);
              font-family: var(--font-body);
              font-size: 0.75rem;
              cursor: pointer;
              padding: 8px 16px;
              border-radius: 12px;
            }
            .mobile-nav-item.active {
              color: var(--primary);
              background: rgba(99, 102, 241, 0.08);
            }
          }
        `}</style>
        <button 
          className={`mobile-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          <LayoutDashboard size={20} />
          <span>Dashboard</span>
        </button>
        <button 
          className={`mobile-nav-item ${activeTab === 'form' ? 'active' : ''}`}
          onClick={() => setActiveTab('form')}
        >
          <PlusCircle size={20} />
          <span>Nuevo Gasto</span>
        </button>
        <button 
          className={`mobile-nav-item ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <History size={20} />
          <span>Historial</span>
        </button>
      </div>
    </div>
  );
}

export default App;
