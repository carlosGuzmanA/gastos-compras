import { useState, useEffect, useCallback } from 'react';
import { LayoutDashboard, PlusCircle, History, LogOut, Wifi, WifiOff, Bell, Settings } from 'lucide-react';
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

  // Toast in-app cuando llega un gasto nuevo por realtime
  const [toast, setToast] = useState<{ title: string; body: string } | null>(null);

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
        (payload: { eventType: string; new: Gasto }) => {
          fetchExpenses();

          // Solo notificar dentro de la app en INSERTs de otros usuarios
          if (payload.eventType === 'INSERT') {
            const g = payload.new;
            if (g && g.creado_por && g.creado_por !== currentUser) {
              setToast({
                title: '💸 Nuevo Gasto Registrado',
                body: `${g.creado_por} anotó: $${Math.round(g.monto).toLocaleString('es-CL')} en "${g.concepto}" (${g.tipo === 'contado' ? 'Al Contado' : 'Fiado'})`,
              });
              try {
                // Beep corto generado con WebAudio (no necesita asset)
                const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
                if (Ctx) {
                  const ctx = new Ctx();
                  const osc = ctx.createOscillator();
                  const gain = ctx.createGain();
                  osc.connect(gain);
                  gain.connect(ctx.destination);
                  osc.type = 'sine';
                  osc.frequency.setValueAtTime(880, ctx.currentTime);
                  osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.18);
                  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
                  gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
                  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
                  osc.start();
                  osc.stop(ctx.currentTime + 0.36);
                }
              } catch {
                /* sonido opcional, no romper si el navegador lo bloquea */
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchExpenses, isOnline, currentUser]);

  // Auto-ocultar el toast tras 5s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

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
      {/* Topbar compacto: título + estado por iconos + usuario + logout */}
      <aside className="app-topbar glass-panel">
        <div className="topbar-brand">
          <span className="topbar-emoji">💰</span>
          <h1 className="topbar-title">Control</h1>
        </div>

        <div className="topbar-actions">
          <div
            className={`topbar-icon-btn status-dot ${isOnline ? 'is-online' : 'is-offline'}`}
            title={isOnline ? 'Conectado a Internet' : 'Sin conexión — guardando local'}
            aria-label={isOnline ? 'Conectado' : 'Sin conexión'}
          >
            {isOnline ? <Wifi size={16} /> : <WifiOff size={16} />}
          </div>

          {NotificationManager.isSupported() && isSupabaseConfigured && (
            <button
              type="button"
              className={`topbar-icon-btn ${pushSubscribed ? 'is-active' : ''}`}
              onClick={pushSubscribed ? handleUnsubscribePush : handleSubscribePush}
              title={pushSubscribed ? 'Notificaciones activas (toca para desactivar)' : 'Activar notificaciones'}
              aria-label={pushSubscribed ? 'Desactivar notificaciones' : 'Activar notificaciones'}
            >
              <Bell size={16} fill={pushSubscribed ? 'currentColor' : 'none'} />
            </button>
          )}

          <div className="topbar-user" title={currentUser}>
            <div className="topbar-avatar">{currentUser.charAt(0).toUpperCase()}</div>
            <span className="topbar-username">{currentUser}</span>
          </div>

          <button
            type="button"
            className="topbar-icon-btn is-danger"
            onClick={handleLogout}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
          >
            <LogOut size={16} />
          </button>
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

        {/* Toast in-app de nuevo gasto */}
        {toast && (
          <div
            onClick={() => setToast(null)}
            style={{
              position: 'fixed',
              top: '16px',
              right: '16px',
              zIndex: 1000,
              maxWidth: '360px',
              background: 'rgba(20, 20, 30, 0.95)',
              border: '1px solid var(--primary)',
              borderRadius: '12px',
              padding: '14px 16px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
              backdropFilter: 'blur(10px)',
              cursor: 'pointer',
              animation: 'fade-in 0.25s ease-out'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <Bell size={18} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: '2px' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '4px' }}>
                  {toast.title}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {toast.body}
                </div>
              </div>
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

      {/* Navegación inferior móvil con FAB central */}
      <nav className="mobile-bottom-nav">
        <button
          className={`mobile-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
          aria-label="Dashboard"
        >
          <LayoutDashboard size={22} />
          <span>Dashboard</span>
        </button>

        <button
          className={`mobile-nav-fab ${activeTab === 'form' ? 'active' : ''}`}
          onClick={() => setActiveTab('form')}
          aria-label="Nuevo Gasto"
        >
          <PlusCircle size={28} />
        </button>

        <button
          className={`mobile-nav-item ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
          aria-label="Historial"
        >
          <History size={22} />
          <span>Historial</span>
        </button>
      </nav>
    </div>
  );
}

export default App;
