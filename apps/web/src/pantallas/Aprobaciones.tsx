import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ClipboardCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import type { PlanFila, TrabajoCampo } from '@easyway/shared';
import Drawer from '../components/Drawer';
import GaleriaFotos from '../components/GaleriaFotos';
import { formatearFecha, mensajeError, solicitarApi } from '../lib/api';

// Cola de trabajos registrados por técnicos. Aprobar crea/enlaza cliente, vehículo, GPS y SIM y
// hace las asignaciones en una sola transacción; el costo del técnico se fija aquí.
const Aprobaciones: React.FC = () => {
  const [pendientes, setPendientes] = useState<TrabajoCampo[]>([]);
  const [planes, setPlanes] = useState<PlanFila[]>([]);
  const [actual, setActual] = useState<TrabajoCampo | null>(null);
  const [decision, setDecision] = useState({ costo_tecnico: '', cliente_id: '', vehiculo_id: '', plan_id: '' });
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    try { setPendientes(await solicitarApi<TrabajoCampo[]>('/aprobaciones')); }
    catch (error) { toast.error(mensajeError(error, 'No se pudo cargar la cola de aprobación')); }
  }, []);
  useEffect(() => {
    void cargar();
    solicitarApi<PlanFila[]>('/planes').then(lista => setPlanes(lista.filter(p => p.activo))).catch(() => setPlanes([]));
  }, [cargar]);

  const abrir = (t: TrabajoCampo) => {
    setActual(t);
    // Si hay un único cliente con el mismo nombre se propone unirlo; el admin decide.
    setDecision({ costo_tecnico: '', cliente_id: t.coincidencias.clientes.length === 1 ? String(t.coincidencias.clientes[0].id) : '', vehiculo_id: '', plan_id: '' });
  };

  const aprobar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actual) return;
    setEnviando(true);
    try {
      await solicitarApi(`/aprobaciones/${actual.id}/aprobar`, { cuerpo: decision });
      toast.success('Trabajo aprobado');
      setActual(null);
      void cargar();
    } catch (error) { toast.error(mensajeError(error, 'No se pudo aprobar')); }
    finally { setEnviando(false); }
  };

  const rechazar = async () => {
    if (!actual) return;
    const motivo = window.prompt('Motivo del rechazo (lo verá el técnico):');
    if (motivo === null) return;
    try {
      await solicitarApi(`/aprobaciones/${actual.id}/rechazar`, { cuerpo: { motivo } });
      toast.success('Trabajo rechazado');
      setActual(null);
      void cargar();
    } catch (error) { toast.error(mensajeError(error, 'No se pudo rechazar')); }
  };

  const p = actual?.propuesta;
  const gps = actual?.coincidencias.gps;
  return (
    <div>
      <div className="cabecera-pagina">
        <h1 style={{ fontSize: '1.5rem', fontWeight: '700' }}>Aprobaciones</h1>
        <span className="status-tag status-yellow">{pendientes.length} pendiente(s)</span>
      </div>
      <div className="entity-list">
        {pendientes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
            <ClipboardCheck size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
            <p>No hay trabajos pendientes de aprobación.</p>
          </div>
        ) : pendientes.map(t => (
          <button key={t.id} type="button" className="entity-card cuenta-deudor" onClick={() => abrir(t)}>
            <div className="entity-details">
              <h3>{t.tipo} · {t.cliente_nombre}</h3>
              <p>{t.vehiculo_descripcion} · IMEI {t.imei} · {t.tecnico_nombre ?? 'Sin técnico'} · {formatearFecha(t.fecha_instalacion)}</p>
            </div>
            {(t.coincidencias.clientes.length > 0 || t.coincidencias.gps?.estado === 'Instalado') && <span className="status-tag status-red">Revisar</span>}
          </button>
        ))}
      </div>

      <Drawer isOpen={actual !== null} onClose={() => setActual(null)} title={actual ? `Aprobar · ${actual.tipo}` : ''}>
        {actual && p && (
          <form onSubmit={aprobar}>
            <div className="cuenta-formulario">
              <p><strong>Técnico:</strong> {actual.tecnico_nombre ?? '—'} · {formatearFecha(actual.fecha_instalacion)}</p>
              <p><strong>Cliente:</strong> {actual.cliente_nombre}{p.cliente_nuevo?.telefono ? ` · ${p.cliente_nuevo.telefono}` : ''}</p>
              <p><strong>Vehículo:</strong> {actual.vehiculo_descripcion}</p>
              <p><strong>IMEI:</strong> {p.imei}{p.sim ? ` · SIM ${p.sim}` : ''}</p>
              {actual.notas && <p><strong>Notas:</strong> {actual.notas}</p>}
            </div>

            {gps && (
              <p className={gps.estado === 'Instalado' ? 'aviso-campo aviso-error' : 'aviso-campo'}>
                <AlertTriangle size={16} /> El GPS ya existe ({gps.estado}{gps.vehiculo ? ` en ${gps.vehiculo}` : ''}).
                {gps.estado === 'Instalado' ? ' Para instalarlo en otro vehículo primero hay que retirarlo.' : ''}
              </p>
            )}
            {actual.coincidencias.simcard && <p className="aviso-campo"><AlertTriangle size={16} /> La SIM ya existe ({actual.coincidencias.simcard.estado}).</p>}

            {p.cliente_nuevo && (
              <div className="form-group">
                <label className="form-label" htmlFor="aprobar-cliente">Cliente</label>
                <select id="aprobar-cliente" className="form-select" value={decision.cliente_id} onChange={e => setDecision({ ...decision, cliente_id: e.target.value })}>
                  <option value="">Crear «{p.cliente_nuevo.nombre}»</option>
                  {actual.coincidencias.clientes.map(c => <option key={c.id} value={c.id}>Usar existente: {c.nombre}</option>)}
                </select>
              </div>
            )}
            {p.vehiculo_nuevo && actual.coincidencias.vehiculos.length > 0 && (
              <div className="form-group">
                <label className="form-label" htmlFor="aprobar-vehiculo">Vehículo</label>
                <select id="aprobar-vehiculo" className="form-select" value={decision.vehiculo_id} onChange={e => setDecision({ ...decision, vehiculo_id: e.target.value })}>
                  <option value="">Crear vehículo nuevo</option>
                  {actual.coincidencias.vehiculos.map(v => <option key={v.id} value={v.id}>Usar existente: {v.descripcion}</option>)}
                </select>
              </div>
            )}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="aprobar-costo">Costo del técnico (RD$) *</label>
                <input id="aprobar-costo" className="form-input" inputMode="decimal" required value={decision.costo_tecnico}
                  onChange={e => setDecision({ ...decision, costo_tecnico: e.target.value.replace(/[^\d.]/g, '') })} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="aprobar-plan">Plan de cobro</label>
                <select id="aprobar-plan" className="form-select" value={decision.plan_id} onChange={e => setDecision({ ...decision, plan_id: e.target.value })}>
                  <option value="">Sin plan</option>
                  {planes.map(pl => <option key={pl.id} value={pl.id}>{pl.nombre}</option>)}
                </select>
              </div>
            </div>
            <GaleriaFotos key={`trabajo-${actual.id}`} trabajoId={actual.id} titulo="Fotos tomadas en el trabajo" />
            {actual.vehiculo_id && <GaleriaFotos key={actual.vehiculo_id} vehiculoId={actual.vehiculo_id} />}
            <div className="cuenta-botones">
              <button type="submit" className="btn-submit" disabled={enviando}>{enviando ? 'Aprobando…' : 'Aprobar'}</button>
              <button type="button" className="btn-cancel" onClick={rechazar}>Rechazar</button>
            </div>
          </form>
        )}
      </Drawer>
    </div>
  );
};

export default Aprobaciones;
