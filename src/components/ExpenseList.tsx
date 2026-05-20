import React, { useState, useMemo } from 'react';
import { Search, Calendar, CheckCircle2, User, HelpCircle, ArchiveRestore } from 'lucide-react';
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

export const ExpenseList: React.FC<ExpenseListProps> = ({ expenses, isLoading, onExpenseUpdated }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedType, setSelectedType] = useState('All'); // All, contado, fiado_pending, fiado_paid
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Obtener meses únicos presentes para filtros (opcional, usaremos filtrado simple de categorías y tipos por ahora)
  const categories = ['All', 'Materia Prima', 'Inventario', 'Servicios', 'Renta', 'Transporte', 'Otros'];

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
      <h3 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <ArchiveRestore size={20} color="var(--primary)" /> Historial de Transacciones
      </h3>

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
            {filteredExpenses.map((expense) => {
              const isFiadoUnpaid = expense.tipo === 'fiado' && !expense.pagado;
              
              return (
                <div key={expense.id} className="expense-item fade-in">
                  <div className="expense-info">
                    <div className="expense-header-info">
                      <span className="expense-title">{expense.concepto}</span>
                      {expense.tipo === 'contado' ? (
                        <span className="badge badge-contado">Contado</span>
                      ) : expense.pagado ? (
                        <span className="badge badge-pagado">Pagado</span>
                      ) : (
                        <span className="badge badge-fiado">Fiado</span>
                      )}
                      
                      {expense.is_offline && (
                        <span 
                          className="badge" 
                          style={{ background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-secondary)', border: '1px dashed rgba(255,255,255,0.15)' }}
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
                        onClick={() => handleSettleDebt(expense.id, expense.is_offline)}
                        disabled={updatingId === expense.id}
                      >
                        <CheckCircle2 size={12} />
                        {updatingId === expense.id ? 'Pagando...' : 'Marcar Pagado'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
