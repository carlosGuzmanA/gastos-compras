import React, { useMemo } from 'react';
import { DollarSign, Wallet, CreditCard, PieChart as ChartIcon, BarChart2 } from 'lucide-react';

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
}

interface DashboardProps {
  expenses: Gasto[];
}

export const Dashboard: React.FC<DashboardProps> = ({ expenses }) => {
  // 1. Estadísticas Generales
  const stats = useMemo(() => {
    let totalMes = 0;
    let totalContado = 0;
    let totalFiadoPendiente = 0;
    let totalFiadoPagado = 0;

    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    expenses.forEach((exp) => {
      try {
        const expDate = new Date(exp.fecha + 'T00:00:00'); // Evitar problemas de zona horaria local
        if (expDate.getMonth() === currentMonth && expDate.getFullYear() === currentYear) {
          totalMes += exp.monto;
          if (exp.tipo === 'contado') {
            totalContado += exp.monto;
          } else {
            if (exp.pagado) {
              totalFiadoPagado += exp.monto;
            } else {
              totalFiadoPendiente += exp.monto;
            }
          }
        }
      } catch (e) {
        // Fallback si la fecha es inválida
        totalMes += exp.monto;
        if (exp.tipo === 'contado') totalContado += exp.monto;
        else if (exp.pagado) totalFiadoPagado += exp.monto;
        else totalFiadoPendiente += exp.monto;
      }
    });

    const totalPagado = totalContado + totalFiadoPagado;

    return {
      totalMes,
      totalPagado,
      totalFiadoPendiente
    };
  }, [expenses]);

  // 2. Datos para Gráfico de Barras: Categorías
  const categoryChartData = useMemo(() => {
    const categoriesMap: Record<string, number> = {
      'Materia Prima': 0,
      'Inventario': 0,
      'Servicios': 0,
      'Renta': 0,
      'Transporte': 0,
      'Otros': 0
    };

    expenses.forEach((exp) => {
      if (categoriesMap[exp.categoria] !== undefined) {
        categoriesMap[exp.categoria] += exp.monto;
      } else {
        categoriesMap['Otros'] += exp.monto;
      }
    });

    const data = Object.entries(categoriesMap).map(([name, value]) => ({ name, value }));
    const maxVal = Math.max(...data.map((d) => d.value), 1);

    return {
      data,
      maxVal
    };
  }, [expenses]);

  // 3. Datos para Gráfico Circular: Contado vs Fiado Pendiente vs Fiado Pagado
  const donutChartData = useMemo(() => {
    let contado = 0;
    let fiadoPendiente = 0;
    let fiadoPagado = 0;

    expenses.forEach((exp) => {
      if (exp.tipo === 'contado') {
        contado += exp.monto;
      } else if (exp.pagado) {
        fiadoPagado += exp.monto;
      } else {
        fiadoPendiente += exp.monto;
      }
    });

    const total = contado + fiadoPendiente + fiadoPagado || 1;
    return {
      contado,
      fiadoPendiente,
      fiadoPagado,
      pctContado: (contado / total) * 100,
      pctFiadoPendiente: (fiadoPendiente / total) * 100,
      pctFiadoPagado: (fiadoPagado / total) * 100,
      total
    };
  }, [expenses]);

  // Constantes para el Donut (Radio = 50, Perímetro = 314.16)
  const RADIUS = 50;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS; // 314.159

  const donutSegments = useMemo(() => {
    const { pctContado, pctFiadoPendiente, pctFiadoPagado } = donutChartData;
    
    // Calcular offsets de circunferencia
    const strokeContado = (pctContado / 100) * CIRCUMFERENCE;
    const strokeFiadoPendiente = (pctFiadoPendiente / 100) * CIRCUMFERENCE;
    const strokeFiadoPagado = (pctFiadoPagado / 100) * CIRCUMFERENCE;

    const offsetContado = 0;
    const offsetFiadoPendiente = -strokeContado;
    const offsetFiadoPagado = -(strokeContado + strokeFiadoPendiente);

    return [
      { 
        name: 'Al Contado', 
        val: donutChartData.contado, 
        color: 'var(--success)', 
        dashArray: `${strokeContado} ${CIRCUMFERENCE}`, 
        dashOffset: offsetContado.toString() 
      },
      { 
        name: 'Fiado Pendiente', 
        val: donutChartData.fiadoPendiente, 
        color: 'var(--warning)', 
        dashArray: `${strokeFiadoPendiente} ${CIRCUMFERENCE}`, 
        dashOffset: offsetFiadoPendiente.toString() 
      },
      { 
        name: 'Fiado Pagado', 
        val: donutChartData.fiadoPagado, 
        color: '#818cf8', 
        dashArray: `${strokeFiadoPagado} ${CIRCUMFERENCE}`, 
        dashOffset: offsetFiadoPagado.toString() 
      }
    ].filter(s => s.val > 0); // Solo dibujar segmentos con valores
  }, [donutChartData, CIRCUMFERENCE]);

  return (
    <div className="main-content">
      {/* Resumen de Tarjetas de Estadísticas */}
      <div className="stats-grid">
        <div className="glass-panel stat-card fade-in">
          <div className="stat-header">
            <span className="stat-title">Total del Mes</span>
            <div className="stat-icon primary">
              <DollarSign size={18} />
            </div>
          </div>
          <span className="stat-value">
            ${stats.totalMes.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="stat-desc">Acumulado del mes actual</span>
        </div>

        <div className="glass-panel stat-card fade-in" style={{ animationDelay: '0.1s' }}>
          <div className="stat-header">
            <span className="stat-title">Por Pagar a Fin de Mes</span>
            <div className="stat-icon warning">
              <CreditCard size={18} />
            </div>
          </div>
          <span className="stat-value" style={{ color: 'var(--warning)' }}>
            ${stats.totalFiadoPendiente.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="stat-desc">Compras fiadas pendientes de pago</span>
        </div>

        <div className="glass-panel stat-card fade-in" style={{ animationDelay: '0.2s' }}>
          <div className="stat-header">
            <span className="stat-title">Total Liquidado</span>
            <div className="stat-icon success">
              <Wallet size={18} />
            </div>
          </div>
          <span className="stat-value" style={{ color: 'var(--success)' }}>
            ${stats.totalPagado.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="stat-desc">Gastos pagados en efectivo / liquidados</span>
        </div>
      </div>

      {/* Grid de Gráficos */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
        {/* Gráfico 1: Categorías (Barras SVG) */}
        <div className="glass-panel fade-in" style={{ animationDelay: '0.3s' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem' }}>
            <BarChart2 size={18} color="var(--primary)" /> Distribución por Categorías
          </h3>
          <div className="chart-container">
            <svg className="chart-svg" viewBox="0 0 400 200" preserveAspectRatio="none">
              <defs>
                <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" />
                  <stop offset="100%" stopColor="rgba(99, 102, 241, 0.2)" />
                </linearGradient>
              </defs>
              
              {/* Ejes y líneas de fondo */}
              <line x1="40" y1="20" x2="40" y2="170" stroke="rgba(255, 255, 255, 0.1)" strokeWidth="1" />
              <line x1="40" y1="170" x2="380" y2="170" stroke="rgba(255, 255, 255, 0.1)" strokeWidth="1" />
              
              <line x1="40" y1="95" x2="380" y2="95" stroke="rgba(255, 255, 255, 0.04)" strokeWidth="1" strokeDasharray="4 4" />
              <line x1="40" y1="20" x2="380" y2="20" stroke="rgba(255, 255, 255, 0.04)" strokeWidth="1" strokeDasharray="4 4" />

              {/* Barras dinámicas */}
              {categoryChartData.data.map((item, idx) => {
                const barWidth = 32;
                const spacing = (340 - categoryChartData.data.length * barWidth) / (categoryChartData.data.length - 1 || 1);
                const x = 50 + idx * (barWidth + spacing);
                const height = (item.value / categoryChartData.maxVal) * 140; // Max height 140px
                const y = 170 - height;
                
                return (
                  <g key={item.name} className="chart-bar">
                    <rect
                      x={x}
                      y={y}
                      width={barWidth}
                      height={height}
                      rx="4"
                      fill="url(#barGrad)"
                    />
                    {/* Monto arriba de la barra */}
                    {item.value > 0 && (
                      <text
                        x={x + barWidth / 2}
                        y={y - 6}
                        fill="var(--text-primary)"
                        fontSize="8"
                        fontWeight="600"
                        textAnchor="middle"
                      >
                        ${Math.round(item.value)}
                      </text>
                    )}
                    {/* Etiqueta de Categoría debajo de la barra */}
                    <text
                      x={x + barWidth / 2}
                      y="185"
                      fill="var(--text-secondary)"
                      fontSize="8"
                      fontWeight="500"
                      textAnchor="middle"
                    >
                      {item.name.split(' ')[0]} {/* Primera palabra para que quepa */}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Gráfico 2: Contado vs Fiado (Donut SVG) */}
        <div className="glass-panel fade-in" style={{ animationDelay: '0.4s' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem' }}>
            <ChartIcon size={18} color="var(--primary)" /> Relación Contado / Fiados
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', padding: '10px 0' }}>
            {/* Contenedor Donut */}
            <div style={{ width: '160px', height: '160px', position: 'relative' }}>
              <svg viewBox="0 0 120 120" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                {/* Círculo base de fondo */}
                <circle
                  cx="60"
                  cy="60"
                  r={RADIUS}
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.04)"
                  strokeWidth="12"
                />
                
                {/* Segmentos Donut */}
                {donutSegments.map((segment, idx) => (
                  <circle
                    key={idx}
                    className="donut-segment"
                    cx="60"
                    cy="60"
                    r={RADIUS}
                    fill="none"
                    stroke={segment.color}
                    strokeWidth="16"
                    strokeDasharray={segment.dashArray}
                    strokeDashoffset={segment.dashOffset}
                    strokeLinecap="round"
                  />
                ))}
              </svg>
              
              {/* Texto central en el Donut */}
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  textAlign: 'center'
                }}
              >
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Total Hist.
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, fontFamily: 'var(--font-heading)' }}>
                  ${Math.round(donutChartData.total).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Leyenda */}
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '16px', width: '100%' }}>
              {/* Contado */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--success)' }}></div>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Contado ({Math.round(donutChartData.pctContado)}%):
                </span>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                  ${Math.round(donutChartData.contado).toLocaleString()}
                </span>
              </div>
              
              {/* Fiado Pendiente */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--warning)' }}></div>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Fiado Pend. ({Math.round(donutChartData.pctFiadoPendiente)}%):
                </span>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--warning)' }}>
                  ${Math.round(donutChartData.fiadoPendiente).toLocaleString()}
                </span>
              </div>

              {/* Fiado Pagado */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#818cf8' }}></div>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Fiado Pag. ({Math.round(donutChartData.pctFiadoPagado)}%):
                </span>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#818cf8' }}>
                  ${Math.round(donutChartData.fiadoPagado).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
