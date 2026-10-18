import React, { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Cpu, Pencil, Receipt, Satellite } from 'lucide-react';
import toast from 'react-hot-toast';
import type { VencimientoFila } from '@easyway/shared';
import { formatearDia, mensajeError, solicitarApi } from '../lib/api';

const PLAZOS = [30, 60, 90, 365];
const iconos = { gps: Satellite, simcard: Cpu, servicio: Receipt };
const nombres = { gps: 'GPS', simcard: 'SIM', servicio: 'Plan por cobrar' };

// GPS (1 año tras instalarse), SIM y planes cuyo vencimiento llega en el plazo elegido, incluidos los vencidos.
const Vencimientos: React.FC = () => {
  const [dias, setDias] = useState(30);
  const [filas, setFilas] = useState<VencimientoFila[]>([]);

  const cargar = useCallback(async () => {
    try { setFilas(await solicitarApi<VencimientoFila[]>(`/vencimientos?dias=${dias}`)); }
    catch (error) { toast.error(mensajeError(error, 'No se pudieron cargar los vencimientos')); }
  }, [dias]);
  useEffect(() => { void cargar(); }, [cargar]);

  const editar = async (fila: VencimientoFila) => {
    const fecha = window.prompt(`Nueva fecha de vencimiento para ${nombres[fila.tipo]} ${fila.identificador} (AAAA-MM-DD):`, fila.fecha);
    if (fecha === null) return;
    try {
      await solicitarApi(`/vencimientos/${fila.tipo}/${fila.id}`, { metodo: 'PUT', cuerpo: { fecha_vencimiento: fecha } });
      toast.success('Vencimiento actualizado');
      void cargar();
    } catch (error) { toast.error(mensajeError(error, 'No se pudo actualizar')); }
  };

  return (
    <div>
      <div className="cabecera-pagina">
        <h1 style={{ fontSize: '1.5rem', fontWeight: '700' }}>Vencimientos</h1>
        <div className="cabecera-acciones" role="group" aria-label="Plazo">
          {PLAZOS.map(p => (
            <button key={p} type="button" className={p === dias ? 'btn-primary' : 'vehicle-action-btn'} aria-pressed={p === dias} onClick={() => setDias(p)}>
              {p === 365 ? '1 año' : `${p} días`}
            </button>
          ))}
        </div>
      </div>

      <div className="entity-list">
        {filas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
            <CalendarClock size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
            <p>Nada vence en los próximos {dias} días.</p>
          </div>
        ) : filas.map(fila => {
          const Icono = iconos[fila.tipo];
          const vencido = fila.dias_restantes < 0;
          return (
            <div key={`${fila.tipo}-${fila.id}`} className="entity-card">
              <div className="entity-info">
                <div className="avatar"><Icono size={18} /></div>
                <div className="entity-details">
                  <h3>{nombres[fila.tipo]} · {fila.identificador}</h3>
                  <p>{fila.vehiculo ? `${fila.vehiculo.cliente_nombre} · ${fila.vehiculo.descripcion}` : 'Sin vehículo asignado'}</p>
                </div>
              </div>
              <div className="entity-actions" style={{ alignItems: 'center' }}>
                <span className={`status-tag ${vencido ? 'status-red' : fila.dias_restantes <= 15 ? 'status-yellow' : 'status-gray'}`}>
                  {vencido ? `Venció hace ${-fila.dias_restantes} d` : fila.dias_restantes === 0 ? 'Vence hoy' : `${formatearDia(fila.fecha)} · ${fila.dias_restantes} d`}
                </span>
                {fila.tipo !== 'servicio' && (
                  <button className="btn-icon" aria-label={`Cambiar vencimiento de ${fila.identificador}`} onClick={() => editar(fila)}><Pencil size={18} /></button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Vencimientos;
