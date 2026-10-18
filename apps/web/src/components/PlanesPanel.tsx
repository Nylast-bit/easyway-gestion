import React, { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { periodicidades, type PlanFila } from '@easyway/shared';
import { formatearDinero, mensajeError, solicitarApi } from '../lib/api';

type Borrador = { id?: number; nombre: string; periodicidad: string; precio: string; activo: boolean };
const vacio: Borrador = { nombre: '', periodicidad: 'Anual', precio: '', activo: true };

// Catálogo de planes. Un plan no se borra: se desactiva y los servicios conservan su precio pactado.
const PlanesPanel: React.FC<{ onCambio?: () => void }> = ({ onCambio }) => {
  const [planes, setPlanes] = useState<PlanFila[]>([]);
  const [borrador, setBorrador] = useState<Borrador | null>(null);

  const cargar = useCallback(async () => {
    try { setPlanes(await solicitarApi<PlanFila[]>('/planes')); }
    catch (error) { toast.error(mensajeError(error, 'No se pudieron cargar los planes')); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!borrador) return;
    const { id, ...cuerpo } = borrador;
    try {
      if (id) await solicitarApi(`/planes/${id}`, { metodo: 'PUT', cuerpo });
      else await solicitarApi('/planes', { cuerpo });
      toast.success(id ? 'Plan actualizado' : 'Plan creado');
      setBorrador(null);
      await cargar();
      onCambio?.();
    } catch (error) { toast.error(mensajeError(error, 'No se pudo guardar el plan')); }
  };

  return (
    <div>
      {borrador ? (
        <form onSubmit={guardar} style={{ marginBottom: '1.5rem' }}>
          <div className="form-group">
            <label className="form-label" htmlFor="plan-nombre">Nombre *</label>
            <input id="plan-nombre" className="form-input" value={borrador.nombre} maxLength={80} required
              onChange={e => setBorrador({ ...borrador, nombre: e.target.value })} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="plan-periodicidad">Periodicidad</label>
              <select id="plan-periodicidad" className="form-select" value={borrador.periodicidad}
                onChange={e => setBorrador({ ...borrador, periodicidad: e.target.value })}>
                {periodicidades.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="plan-precio">Precio (RD$) *</label>
              <input id="plan-precio" className="form-input" inputMode="decimal" value={borrador.precio} required
                onChange={e => setBorrador({ ...borrador, precio: e.target.value.replace(/[^\d.]/g, '') })} />
            </div>
          </div>
          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem', fontSize: '0.9rem' }}>
            <input type="checkbox" checked={borrador.activo} onChange={e => setBorrador({ ...borrador, activo: e.target.checked })} />
            Disponible para nuevos servicios
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" className="btn-submit">{borrador.id ? 'Guardar plan' : 'Crear plan'}</button>
            <button type="button" className="btn-cancel" onClick={() => setBorrador(null)}>Cancelar</button>
          </div>
        </form>
      ) : (
        <button className="btn-primary" style={{ marginBottom: '1rem' }} onClick={() => setBorrador(vacio)}><Plus size={18} /> Nuevo plan</button>
      )}

      <div className="entity-list">
        {planes.map(plan => (
          <div key={plan.id} className="entity-card" style={{ opacity: plan.activo ? 1 : 0.6 }}>
            <div className="entity-info">
              <div className="entity-details">
                <h3>{plan.nombre}</h3>
                <p>{formatearDinero(plan.precio)} · {plan.periodicidad} · {plan.servicios_activos} servicio(s) activo(s)</p>
              </div>
            </div>
            <div className="entity-actions" style={{ alignItems: 'center' }}>
              {!plan.activo && <span className="status-tag status-gray">Inactivo</span>}
              <button className="btn-icon" aria-label={`Editar ${plan.nombre}`}
                onClick={() => setBorrador({ id: plan.id, nombre: plan.nombre, periodicidad: plan.periodicidad, precio: String(plan.precio), activo: plan.activo })}>
                <Pencil size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PlanesPanel;
