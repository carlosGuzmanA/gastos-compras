import React, { useState } from 'react';
import { Package, Zap, DollarSign, Home, Truck, MoreHorizontal, Plus } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../utils/supabaseClient';

interface ExpenseFormProps {
  currentUser: string;
  onExpenseAdded: () => void;
}

const CATEGORIES = [
  { id: 'Materia Prima', label: 'Mat. Prima', icon: DollarSign, color: '#10b981' },
  { id: 'Inventario', label: 'Inventario', icon: Package, color: '#6366f1' },
  { id: 'Servicios', label: 'Servicios', icon: Zap, color: '#f59e0b' },
  { id: 'Renta', label: 'Renta', icon: Home, color: '#ec4899' },
  { id: 'Transporte', label: 'Transporte', icon: Truck, color: '#3b82f6' },
  { id: 'Otros', label: 'Otros', icon: MoreHorizontal, color: '#94a3b8' }
];

export const ExpenseForm: React.FC<ExpenseFormProps> = ({ currentUser, onExpenseAdded }) => {
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  const [categoria, setCategoria] = useState('Otros');
  const [tipo, setTipo] = useState<'contado' | 'fiado'>('fiado');
  const [proveedorTipo, setProveedorTipo] = useState<'negocio' | 'otro'>('negocio');
  const [proveedor, setProveedor] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!concepto.trim() || !monto || parseFloat(monto) <= 0) {
      setMessage({ text: 'Por favor, introduce un concepto y un monto válido.', type: 'error' });
      return;
    }
    if (tipo === 'fiado' && proveedorTipo === 'otro' && !proveedor.trim()) {
      setMessage({ text: 'Indica el nombre del proveedor o acreedor.', type: 'error' });
      return;
    }

    setIsSaving(true);
    setMessage(null);

    const expenseData = {
      concepto: concepto.trim(),
      monto: Math.round(parseFloat(monto)),
      categoria,
      tipo,
      proveedor:
        tipo === 'fiado'
          ? proveedorTipo === 'negocio'
            ? 'Negocio'
            : proveedor.trim()
          : null,
      pagado: tipo === 'contado', // Si es contado, ya está pagado. Si es fiado, inicia como no pagado (false)
      creado_por: currentUser,
      fecha: new Date().toISOString().split('T')[0] // Formato YYYY-MM-DD
    };

    // Guardado local (offline-first fallback)
    try {
      const offlineExpenses = JSON.parse(localStorage.getItem('offline_expenses') || '[]');
      
      if (isSupabaseConfigured) {
        // Enviar a Supabase
        const { error } = await supabase.from('gastos').insert([expenseData]);
        if (error) throw error;
        
        setMessage({ text: 'Gasto registrado con éxito y sincronizado.', type: 'success' });
      } else {
        // Si no está configurado Supabase, guardar como offline
        const localId = 'local_' + Math.random().toString(36).substr(2, 9);
        offlineExpenses.push({ id: localId, ...expenseData, created_at: new Date().toISOString() });
        localStorage.setItem('offline_expenses', JSON.stringify(offlineExpenses));
        setMessage({ text: 'Guardado localmente (Configura Supabase para sincronizar en tiempo real).', type: 'success' });
      }

      // Reiniciar formulario
      setConcepto('');
      setMonto('');
      setCategoria('Otros');
      setTipo('contado');
      setProveedor('');
      onExpenseAdded();
    } catch (error: any) {
      console.error('Error al guardar el gasto:', error);
      // Fallback a almacenamiento local si la red falla
      try {
        const localId = 'local_' + Math.random().toString(36).substr(2, 9);
        const offlineExpenses = JSON.parse(localStorage.getItem('offline_expenses') || '[]');
        offlineExpenses.push({ id: localId, ...expenseData, created_at: new Date().toISOString(), is_dirty: true });
        localStorage.setItem('offline_expenses', JSON.stringify(offlineExpenses));
        setMessage({ text: 'Error de red. Gasto guardado localmente, se sincronizará luego.', type: 'success' });
        onExpenseAdded();
      } catch (localErr) {
        setMessage({ text: 'Error al registrar el gasto: ' + error.message, type: 'error' });
      }
    } finally {
      setIsSaving(false);
      // Ocultar mensaje de éxito después de 4 segundos
      setTimeout(() => setMessage(null), 4000);
    }
  };

  return (
    <div className="glass-panel fade-in">
      <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
        <Plus size={20} color="var(--primary)" /> Registrar Gasto / Compra
      </h3>

      {message && (
        <div 
          className="fade-in"
          style={{
            padding: '12px 16px',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '16px',
            fontSize: '0.9rem',
            backgroundColor: message.type === 'success' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)',
            color: message.type === 'success' ? 'var(--success)' : 'var(--danger)',
            border: `1px solid ${message.type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)'}`
          }}
        >
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="concepto">Producto</label>
            <input
              id="concepto"
              type="text"
              className="form-input"
              placeholder="Ej. Envases, Luz, Harina..."
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="monto">Monto ($)</label>
            <input
              id="monto"
              type="number"
              step="1"
              min="1"
              inputMode="numeric"
              className="form-input"
              placeholder="0"
              value={monto}
              onChange={(e) => setMonto(e.target.value.replace(/[^\d]/g, ''))}
              required
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Tipo de Gasto</label>
          <div className="tab-group">
            <button
              type="button"
              className={`tab-btn ${tipo === 'fiado' ? 'active' : ''}`}
              onClick={() => setTipo('fiado')}
            >
              Fiado (Cuentas por Pagar)
            </button>
            <button
              type="button"
              className={`tab-btn ${tipo === 'contado' ? 'active' : ''}`}
              onClick={() => setTipo('contado')}
            >
              Al Contado (Pagado)
            </button>
          </div>
        </div>

        {tipo === 'fiado' && (
          <div className="form-group fade-in">
            <label className="form-label">Proveedor / Acreedor</label>
            <div className="tab-group">
              <button
                type="button"
                className={`tab-btn ${proveedorTipo === 'negocio' ? 'active' : ''}`}
                onClick={() => setProveedorTipo('negocio')}
              >
                Negocio
              </button>
              <button
                type="button"
                className={`tab-btn ${proveedorTipo === 'otro' ? 'active' : ''}`}
                onClick={() => setProveedorTipo('otro')}
              >
                Otro
              </button>
            </div>

            {proveedorTipo === 'otro' && (
              <input
                id="proveedor"
                type="text"
                className="form-input fade-in"
                style={{ marginTop: '10px' }}
                placeholder="Ej. Distribuidora Gómez, Pancho..."
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
                required
                autoFocus
              />
            )}
          </div>
        )}

        <div className="form-group" style={{ marginBottom: '24px' }}>
          <label className="form-label">Categoría</label>
          <div className="category-picker">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isSelected = categoria === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  className={`category-option ${isSelected ? 'selected' : ''}`}
                  onClick={() => setCategoria(cat.id)}
                >
                  <Icon size={18} style={{ color: isSelected ? '#fff' : cat.color }} />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: '100%', padding: '14px' }}
          disabled={isSaving}
        >
          {isSaving ? 'Guardando...' : 'Registrar Gasto'}
        </button>
      </form>
    </div>
  );
};
