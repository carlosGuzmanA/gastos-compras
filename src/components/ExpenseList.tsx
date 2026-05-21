import React, { useState, useMemo } from 'react';
import { Search, Calendar, CheckCircle2, User, HelpCircle, ArchiveRestore, Clock, CreditCard } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../utils/supabaseClient';

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

interface ExpenseListProps {
  expenses: Gasto[];
  isLoading: boolean;
  onExpenseUpdated: () => void;
}

interface ExpenseItemComponentProps {
  expense: Gasto;
  updatingId: string | null;
  onSettlePrompt: (expense: Gasto) => void;
  formatDate: (dateStr: string) => string;
}

const ExpenseItemComponent: React.FC<ExpenseItemComponentProps> = ({
  expense,
  updatingId,
  onSettlePrompt,
  formatDate
}) => {
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchDelta, setTouchDelta] = useState<number>(0);
  const [isSwiping, setIsSwiping] = useState(false);

  const isFiadoUnpaid = expense.tipo === 'fiado' && !expense.pagado;

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isFiadoUnpaid) return;
    setTouchStart(e.touches[0].clientX);
    setIsSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStart === null || !isFiadoUnpaid) return;
    const currentX = e.touches[0].clientX;
    const delta = currentX - touchStart;

    // Solo permitir deslizar hacia la derecha (valores positivos)
    if (delta > 0) {
      setTouchDelta(Math.min(delta, 120)); // Limitar a 120px para una mejor sensación
    } else {
      setTouchDelta(0);
    }
  };

  const handleTouchEnd = () => {
    if (touchStart === null || !isFiadoUnpaid) return;
    setIsSwiping(false);

    // Si se desliza más de 80px, disparamos el modal de confirmación
    if (touchDelta > 80) {
      onSettlePrompt(expense);
    }

    setTouchDelta(0);
    setTouchStart(null);
  };

  const itemStyle = isFiadoUnpaid ? {
    transform: `translateX(${touchDelta}px)`,
    transition: isSwiping ? 'none' : 'transform 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28)',
  } : {};

  return (
    <div className="expense-swipe-container" style={{ position: 'relative' }}>
      {/* Fondo que se revela al deslizar */}
      {isFiadoUnpaid && touchDelta > 0 && (
        <div
          className="expense-swipe-bg"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${touchDelta}px`,
            background: 'linear-gradient(90deg, var(--success) 0%, rgba(16, 185, 129, 0.4) 100%)',
            display: 'flex',
            alignItems: 'center',
            paddingLeft: '16px',
            color: '#fff',
            borderRadius: 'var(--radius-sm) 0 0 var(--radius-sm)',
            zIndex: 1,
            pointerEvents: 'none',
            fontSize: '0.85rem',
            fontWeight: 600
          }}
        >
          <CheckCircle2 size={16} style={{ marginRight: '8px', animation: 'pulse 1s infinite' }} />
          {touchDelta > 80 ? 'Pagar' : ''}
        </div>
      )}

      {/* Contenedor del Item */}
      <div
        className={`expense-item fade-in ${isFiadoUnpaid ? 'swipeable' : ''}`}
        style={{ ...itemStyle, zIndex: 2, position: 'relative', background: 'var(--bg-card)' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="expense-info">
          <div className="expense-header-info">
            <span className="expense-title">{expense.concepto}</span>
            {expense.tipo === 'contado' ? (
              <span className="badge badge-contado">
                <CreditCard size={12} />
                <span className="badge-text">Contado</span>
              </span>
            ) : expense.pagado ? (
              <span className="badge badge-pagado">
                <CheckCircle2 size={12} />
                <span className="badge-text">Pagado</span>
              </span>
            ) : (
              <span className="badge badge-fiado">
                <Clock size={12} />
                <span className="badge-text">Fiado</span>
              </span>
            )}

            {expense.is_offline && (
              <span
                className="badge"
                style={{ background: 'var(--bg-card-hover)', color: 'var(--text-secondary)', border: '1px dashed var(--border-glow)' }}
                title="Guardado localmente sin sincronizar"
              >
                Local
              </span>
            )}
          </div>

          <div className="expense-meta">
            <Calendar size={12} />
            <span>{formatDate(expense.fecha)}</span>
            <span>•</span>
            <User size={12} />
            <span>{expense.creado_por}</span>
            {expense.proveedor && (
              <>
                <span>•</span>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                  Prov: {expense.proveedor}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="expense-amount-area">
          <span className={`expense-amount ${expense.tipo === 'contado' ? 'contado' : expense.pagado ? 'pagado' : 'fiado'}`}>
            ${expense.monto.toLocaleString('es-CL', { maximumFractionDigits: 0 })}
          </span>

          {isFiadoUnpaid && (
            <button
              className="btn btn-success"
              style={{ padding: '6px 12px', fontSize: '0.8rem', borderRadius: '6px' }}
              onClick={() => onSettlePrompt(expense)}
              disabled={updatingId === expense.id}
            >
              <CheckCircle2 size={12} />
              <span className="badge-text">{updatingId === expense.id ? '...' : 'Pagar'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export const ExpenseList: React.FC<ExpenseListProps> = ({ expenses, isLoading, onExpenseUpdated }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedType, setSelectedType] = useState('All'); // All, contado, fiado_pending, fiado_paid
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  
  // Estados para liquidación masiva y modal de confirmación
  const [isSettlingAll, setIsSettlingAll] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const categories = ['All', 'Materia Prima', 'Inventario', 'Servicios', 'Renta', 'Transporte', 'Otros'];

  // Contar cuántos fiados pendientes hay
  const pendingFiadosCount = useMemo(() => {
    return expenses.filter(exp => exp.tipo === 'fiado' && !exp.pagado).length;
  }, [expenses]);

  const handleSettleDebt = async (id: string, isOffline?: boolean) => {
    setUpdatingId(id);
    try {
      if (isOffline) {
        // Actualizar en localStorage
        const offlineExpenses = JSON.parse(localStorage.getItem('offline_expenses') || '[]');
        const updated = offlineExpenses.map((exp: any) => 
          exp.id === id ? { ...exp, pagado: true, is_dirty: true } : exp
        );
        localStorage.setItem('offline_expenses', JSON.stringify(updated));
      } else if (isSupabaseConfigured) {
        // Actualizar en Supabase
        const { error } = await supabase
          .from('gastos')
          .update({ pagado: true })
          .eq('id', id);

        if (error) throw error;
      }
      onExpenseUpdated();
    } catch (error) {
      console.error('Error al liquidar deuda:', error);
      alert('No se pudo liquidar la deuda. Inténtalo de nuevo.');
    } finally {
      setUpdatingId(null);
    }
  };

  // Función para liquidar todas las deudas pendientes
  const handleSettleAllDebts = async () => {
    setIsSettlingAll(true);
    try {
      const offlineExpenses = JSON.parse(localStorage.getItem('offline_expenses') || '[]');
      let updatedOffline = false;
      const updatedOfflineExpenses = offlineExpenses.map((exp: any) => {
        if (exp.tipo === 'fiado' && !exp.pagado) {
          updatedOffline = true;
          return { ...exp, pagado: true, is_dirty: true };
        }
        return exp;
      });
      if (updatedOffline) {
        localStorage.setItem('offline_expenses', JSON.stringify(updatedOfflineExpenses));
      }

      if (isSupabaseConfigured) {
        const { error } = await supabase
          .from('gastos')
          .update({ pagado: true })
          .eq('tipo', 'fiado')
          .eq('pagado', false);

        if (error) throw error;
      }
      onExpenseUpdated();
    } catch (error) {
      console.error('Error al liquidar todas las deudas:', error);
      alert('No se pudieron liquidar todas las deudas. Inténtalo de nuevo.');
    } finally {
      setIsSettlingAll(false);
      setShowConfirmModal(null);
    }
  };

  const handlePromptSettleAll = () => {
    setShowConfirmModal({
      title: '¿Poner todo al día?',
      message: `¿Estás seguro de que deseas marcar todos los ${pendingFiadosCount} gastos fiados pendientes como pagados?`,
      onConfirm: handleSettleAllDebts
    });
  };

  const handlePromptSettleDebt = (expense: Gasto) => {
    setShowConfirmModal({
      title: '¿Confirmar Pago?',
      message: `¿Estás seguro de que deseas marcar el gasto "${expense.concepto}" de $${expense.monto.toLocaleString('es-CL')} como pagado?`,
      onConfirm: () => {
        handleSettleDebt(expense.id, expense.is_offline);
        setShowConfirmModal(null);
      }
    });
  };

  // Filtrado y búsqueda
  const filteredExpenses = useMemo(() => {
    return expenses.filter((exp) => {
      const matchesSearch = 
        exp.concepto.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (exp.proveedor && exp.proveedor.toLowerCase().includes(searchTerm.toLowerCase())) ||
        exp.creado_por.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCategory = selectedCategory === 'All' || exp.categoria === selectedCategory;

      let matchesType = true;
      if (selectedType === 'contado') {
        matchesType = exp.tipo === 'contado';
      } else if (selectedType === 'fiado_pending') {
        matchesType = exp.tipo === 'fiado' && !exp.pagado;
      } else if (selectedType === 'fiado_paid') {
        matchesType = exp.tipo === 'fiado' && exp.pagado;
      }

      return matchesSearch && matchesCategory && matchesType;
    });
  }, [expenses, searchTerm, selectedCategory, selectedType]);

  const formatDate = (dateStr: string) => {
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: '2-digit' });
      }
      return dateStr;
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <div className="glass-panel fade-in" style={{ flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ArchiveRestore size={20} color="var(--primary)" /> Historial de Transacciones
        </h3>
        {pendingFiadosCount > 0 && (
          <button
            type="button"
            className="btn btn-success"
            style={{ padding: '8px 14px', fontSize: '0.85rem', borderRadius: '8px', height: 'fit-content' }}
            onClick={handlePromptSettleAll}
            disabled={isSettlingAll}
          >
            <CheckCircle2 size={14} />
            {isSettlingAll ? 'Procesando...' : 'Poner todo al día'}
          </button>
        )}
      </div>

      {/* Buscador y Filtros */}
      <div className="filters-panel">
        <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
          <label className="form-label" htmlFor="buscar">Buscar</label>
          <div style={{ position: 'relative' }}>
            <Search 
              size={18} 
              style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} 
            />
            <input
              id="buscar"
              type="text"
              className="form-input"
              style={{ paddingLeft: '42px' }}
              placeholder="Buscar por concepto o proveedor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="filters-row">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="filtro-categoria">Categoría</label>
            <select
              id="filtro-categoria"
              className="form-select"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === 'All' ? 'Todas' : cat}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="filtro-tipo">Tipo / Estado</label>
            <select
              id="filtro-tipo"
              className="form-select"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
            >
              <option value="All">Todos</option>
              <option value="contado">Al Contado</option>
              <option value="fiado_pending">Fiados (Pendientes)</option>
              <option value="fiado_paid">Fiados (Pagados)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Lista */}
      <div style={{ marginTop: '24px', maxHeight: '450px', overflowY: 'auto' }}>
        {isLoading ? (
          <div className="loading-spinner"></div>
        ) : filteredExpenses.length === 0 ? (
          <div className="empty-state">
            <HelpCircle size={48} className="empty-icon" />
            <p style={{ fontWeight: 500, marginBottom: '4px' }}>No se encontraron transacciones</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Intenta cambiar los filtros o agrega un nuevo gasto.
            </p>
          </div>
        ) : (
          <div>
            {filteredExpenses.map((expense) => (
              <ExpenseItemComponent
                key={expense.id}
                expense={expense}
                updatingId={updatingId}
                onSettlePrompt={handlePromptSettleDebt}
                formatDate={formatDate}
              />
            ))}
          </div>
        )}
      </div>

      {/* Confirm Modal */}
      {showConfirmModal && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div className="glass-panel" style={{
            width: '100%',
            maxWidth: '400px',
            border: '1px solid var(--border-glow)',
            boxShadow: 'var(--shadow-lg), var(--shadow-glow)',
            textAlign: 'center',
            padding: '24px'
          }}>
            <h4 style={{ fontSize: '1.25rem', marginBottom: '12px', fontWeight: 700 }}>
              {showConfirmModal.title}
            </h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '24px', lineHeight: '1.5' }}>
              {showConfirmModal.message}
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button 
                type="button"
                className="btn btn-secondary" 
                onClick={() => setShowConfirmModal(null)}
                style={{ flex: 1, padding: '10px' }}
              >
                Cancelar
              </button>
              <button 
                type="button"
                className="btn btn-success" 
                onClick={showConfirmModal.onConfirm}
                style={{ flex: 1, padding: '10px' }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
