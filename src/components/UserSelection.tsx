import React, { useState } from 'react';
import { User, Sparkles, Building2, Store } from 'lucide-react';

interface UserSelectionProps {
  onSelectUser: (userName: string) => void;
}

const PRESET_USERS = [
  { name: 'Carlos', icon: Store, color: 'var(--success)' },
  { name: 'María', icon: Sparkles, color: 'var(--primary)' },
  { name: 'Negocio', icon: Building2, color: 'var(--warning)' }
];

export const UserSelection: React.FC<UserSelectionProps> = ({ onSelectUser }) => {
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [customName, setCustomName] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = showCustomInput ? customName.trim() : selectedPreset;
    if (finalName) {
      localStorage.setItem('negocio_gasto_user', finalName);
      onSelectUser(finalName);
    }
  };

  return (
    <div className="user-overlay">
      <div className="user-modal glass-panel fade-in">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          <div className="avatar-icon-circle" style={{ width: '64px', height: '64px', background: 'var(--primary-glow)', color: 'var(--primary)' }}>
            <User size={32} />
          </div>
        </div>
        
        <h2 style={{ fontSize: '1.6rem', marginBottom: '8px' }}>¿Quién está usando la App?</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '24px' }}>
          Selecciona tu nombre para registrar quién anota los gastos en el negocio.
        </p>

        <form onSubmit={handleSubmit}>
          {!showCustomInput ? (
            <>
              <div className="avatar-grid">
                {PRESET_USERS.map((user) => {
                  const Icon = user.icon;
                  const isSelected = selectedPreset === user.name;
                  return (
                    <button
                      key={user.name}
                      type="button"
                      className={`avatar-btn ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedPreset(user.name)}
                    >
                      <div className="avatar-icon-circle">
                        <Icon size={20} style={{ color: isSelected ? '#fff' : user.color }} />
                      </div>
                      <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{user.name}</span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: '100%', marginBottom: '16px', padding: '10px' }}
                onClick={() => {
                  setShowCustomInput(true);
                  setSelectedPreset(null);
                }}
              >
                Otro nombre...
              </button>
            </>
          ) : (
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label" htmlFor="custom-username">Nombre de usuario</label>
              <input
                id="custom-username"
                type="text"
                className="form-input"
                placeholder="Escribe tu nombre..."
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                autoFocus
                required
              />
              <button
                type="button"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '0.8rem',
                  textAlign: 'right',
                  cursor: 'pointer',
                  marginTop: '4px'
                }}
                onClick={() => setShowCustomInput(false)}
              >
                Volver a la lista
              </button>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '14px' }}
            disabled={!selectedPreset && !customName.trim()}
          >
            Confirmar e Ingresar
          </button>
        </form>
      </div>
    </div>
  );
};
