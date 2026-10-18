import React, { useCallback, useEffect, useState } from 'react';
import { Ban, FileText, Plus, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import { fechaEnRD, metodosPago, type CargoFila, type EstadoCuenta, type PlanFila, type ServicioFila, type VehiculoFila } from '@easyway/shared';
import { formatearDia, formatearDinero, mensajeError, solicitarApi } from '../lib/api';

const claseEstado: Record<CargoFila['estado'], string> = { Pendiente: 'status-yellow', Parcial: 'status-yellow', Pagado: 'status-green', Anulado: 'status-gray' };
type Formulario = 'pago' | 'cargo' | 'servicio' | null;

// Estado de cuenta de un cliente: planes por vehículo, cargos, pagos y saldos.
// Las facturas fiscales se emiten fuera; aquí se anota su número como referencia.
const EstadoCuentaCliente: React.FC<{ clienteId: number; onCambio?: () => void }> = ({ clienteId, onCambio }) => {
  const [cuenta, setCuenta] = useState<EstadoCuenta | null>(null);
  const [formulario, setFormulario] = useState<Formulario>(null);
  const [vehiculos, setVehiculos] = useState<VehiculoFila[]>([]);
  const [planes, setPlanes] = useState<PlanFila[]>([]);
  const hoy = fechaEnRD();
  const [pago, setPago] = useState({ monto: '', fecha: hoy, metodo: 'Transferencia', referencia: '', notas: '' });
  const [cargo, setCargo] = useState({ concepto: '', monto: '', fecha_vencimiento: hoy, referencia_factura: '' });
  const [servicio, setServicio] = useState({ vehiculo_id: '', plan_id: '', fecha_inicio: hoy, precio: '' });

  const cargar = useCallback(async () => {
    try { setCuenta(await solicitarApi<EstadoCuenta>(`/cobros/estado-cuenta/${clienteId}`)); }
    catch (error) { toast.error(mensajeError(error, 'No se pudo cargar el estado de cuenta')); }
  }, [clienteId]);
  useEffect(() => { void cargar(); }, [cargar]);

  const ejecutar = async (accion: () => Promise<unknown>, exito: string) => {
    try {
      await accion();
      toast.success(exito);
      setFormulario(null);
      await cargar();
      onCambio?.();
    } catch (error) { toast.error(mensajeError(error, 'No se pudo completar la operación')); }
  };

  const abrirServicio = async () => {
    setFormulario('servicio');
    const [listaVehiculos, listaPlanes] = await Promise.all([
      solicitarApi<VehiculoFila[]>(`/vehiculos?cliente_id=${clienteId}`).catch(() => [] as VehiculoFila[]),
      solicitarApi<PlanFila[]>('/planes').catch(() => [] as PlanFila[]),
    ]);
    setVehiculos(listaVehiculos);
    setPlanes(listaPlanes.filter(p => p.activo));
    setServicio(s => ({ ...s, plan_id: s.plan_id || String(listaPlanes.find(p => p.activo)?.id ?? '') }));
  };

  const anular = (tipo: 'cargos' | 'pagos', id: number) => {
    const motivo = window.prompt('Motivo de la anulación (queda registrado):');
    if (motivo === null) return;
    void ejecutar(() => solicitarApi(`/${tipo}/${id}/anular`, { cuerpo: { motivo } }), tipo === 'cargos' ? 'Cargo anulado' : 'Pago anulado');
  };

  const referenciar = (fila: CargoFila) => {
    const referencia = window.prompt('Número de factura o NCF (sistema de facturación):', fila.referencia_factura ?? '');
    if (referencia === null) return;
    void ejecutar(() => solicitarApi(`/cargos/${fila.id}/referencia`, { metodo: 'PUT', cuerpo: { referencia_factura: referencia } }), 'Referencia guardada');
  };

  const cambiarServicio = (fila: ServicioFila, estado: ServicioFila['estado']) => {
    if (!window.confirm(`¿Marcar el plan de ${fila.vehiculo.placa || 'este vehículo'} como ${estado.toLowerCase()}?`)) return;
    void ejecutar(() => solicitarApi(`/servicios/${fila.id}`, {
      metodo: 'PUT', cuerpo: { precio: fila.precio, proximo_cobro: fila.proximo_cobro, estado, notas: fila.notas },
    }), 'Plan actualizado');
  };

  if (!cuenta) return <p>Cargando…</p>;
  const vigentes = cuenta.cargos.filter(c => c.estado !== 'Anulado');

  return (
    <div className="estado-cuenta">
      <div className="cuenta-totales">
        <div><small>Saldo pendiente</small><strong>{formatearDinero(cuenta.saldo_pendiente)}</strong></div>
        <div className={cuenta.saldo_vencido > 0 ? 'cuenta-alerta' : ''}><small>Vencido</small><strong>{formatearDinero(cuenta.saldo_vencido)}</strong></div>
        <div><small>Saldo a favor</small><strong>{formatearDinero(cuenta.saldo_a_favor)}</strong></div>
      </div>

      <div className="cuenta-acciones">
        <button className="btn-primary" onClick={() => setFormulario('pago')}><Wallet size={16} /> Registrar pago</button>
        <button className="vehicle-action-btn" onClick={() => setFormulario('cargo')}><Plus size={16} /> Nuevo cargo</button>
        <button className="vehicle-action-btn" onClick={abrirServicio}><Plus size={16} /> Agregar plan</button>
      </div>

      {formulario === 'pago' && (
        <form className="cuenta-formulario" onSubmit={e => { e.preventDefault(); void ejecutar(() => solicitarApi('/pagos', { cuerpo: { ...pago, cliente_id: clienteId } }), 'Pago registrado'); }}>
          <div className="form-row">
            <div className="form-group"><label className="form-label" htmlFor="pago-monto">Monto (RD$) *</label>
              <input id="pago-monto" className="form-input" inputMode="decimal" required value={pago.monto} onChange={e => setPago({ ...pago, monto: e.target.value.replace(/[^\d.]/g, '') })} /></div>
            <div className="form-group"><label className="form-label" htmlFor="pago-fecha">Fecha *</label>
              <input id="pago-fecha" type="date" className="form-input" required value={pago.fecha} onChange={e => setPago({ ...pago, fecha: e.target.value })} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label" htmlFor="pago-metodo">Método</label>
              <select id="pago-metodo" className="form-select" value={pago.metodo} onChange={e => setPago({ ...pago, metodo: e.target.value })}>
                {metodosPago.map(m => <option key={m} value={m}>{m}</option>)}
              </select></div>
            <div className="form-group"><label className="form-label" htmlFor="pago-referencia">Referencia / factura</label>
              <input id="pago-referencia" className="form-input" maxLength={100} value={pago.referencia} onChange={e => setPago({ ...pago, referencia: e.target.value })} /></div>
          </div>
          <p className="cuenta-ayuda">Se aplica a los cargos pendientes más antiguos. Lo que sobre queda como saldo a favor.</p>
          <div className="cuenta-botones"><button type="submit" className="btn-submit">Guardar pago</button>
            <button type="button" className="btn-cancel" onClick={() => setFormulario(null)}>Cancelar</button></div>
        </form>
      )}

      {formulario === 'cargo' && (
        <form className="cuenta-formulario" onSubmit={e => { e.preventDefault(); void ejecutar(() => solicitarApi('/cargos', { cuerpo: { ...cargo, cliente_id: clienteId } }), 'Cargo creado'); }}>
          <div className="form-group"><label className="form-label" htmlFor="cargo-concepto">Concepto *</label>
            <input id="cargo-concepto" className="form-input" maxLength={200} required placeholder="Venta de equipo, reinstalación…" value={cargo.concepto} onChange={e => setCargo({ ...cargo, concepto: e.target.value })} /></div>
          <div className="form-row">
            <div className="form-group"><label className="form-label" htmlFor="cargo-monto">Monto (RD$) *</label>
              <input id="cargo-monto" className="form-input" inputMode="decimal" required value={cargo.monto} onChange={e => setCargo({ ...cargo, monto: e.target.value.replace(/[^\d.]/g, '') })} /></div>
            <div className="form-group"><label className="form-label" htmlFor="cargo-vence">Vence *</label>
              <input id="cargo-vence" type="date" className="form-input" required value={cargo.fecha_vencimiento} onChange={e => setCargo({ ...cargo, fecha_vencimiento: e.target.value })} /></div>
          </div>
          <div className="form-group"><label className="form-label" htmlFor="cargo-factura">Factura / NCF</label>
            <input id="cargo-factura" className="form-input" maxLength={60} value={cargo.referencia_factura} onChange={e => setCargo({ ...cargo, referencia_factura: e.target.value })} /></div>
          <div className="cuenta-botones"><button type="submit" className="btn-submit">Crear cargo</button>
            <button type="button" className="btn-cancel" onClick={() => setFormulario(null)}>Cancelar</button></div>
        </form>
      )}

      {formulario === 'servicio' && (
        <form className="cuenta-formulario" onSubmit={e => { e.preventDefault(); void ejecutar(() => solicitarApi('/servicios', { cuerpo: servicio }), 'Plan asignado'); }}>
          <div className="form-row">
            <div className="form-group"><label className="form-label" htmlFor="servicio-vehiculo">Vehículo *</label>
              <select id="servicio-vehiculo" className="form-select" required value={servicio.vehiculo_id} onChange={e => setServicio({ ...servicio, vehiculo_id: e.target.value })}>
                <option value="">Selecciona…</option>
                {vehiculos.map(v => <option key={v.id} value={v.id}>{[v.marca, v.modelo].filter(Boolean).join(' ') || 'Vehículo'} ({v.placa || 'S/P'})</option>)}
              </select></div>
            <div className="form-group"><label className="form-label" htmlFor="servicio-plan">Plan *</label>
              <select id="servicio-plan" className="form-select" required value={servicio.plan_id} onChange={e => setServicio({ ...servicio, plan_id: e.target.value })}>
                {planes.map(p => <option key={p.id} value={p.id}>{p.nombre} · {formatearDinero(p.precio)}</option>)}
              </select></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label" htmlFor="servicio-inicio">Inicio *</label>
              <input id="servicio-inicio" type="date" className="form-input" required value={servicio.fecha_inicio} onChange={e => setServicio({ ...servicio, fecha_inicio: e.target.value })} /></div>
            <div className="form-group"><label className="form-label" htmlFor="servicio-precio">Precio pactado</label>
              <input id="servicio-precio" className="form-input" inputMode="decimal" placeholder="El del plan" value={servicio.precio} onChange={e => setServicio({ ...servicio, precio: e.target.value.replace(/[^\d.]/g, '') })} /></div>
          </div>
          <p className="cuenta-ayuda">El primer cargo se genera desde la fecha de inicio al pulsar “Generar cargos”.</p>
          <div className="cuenta-botones"><button type="submit" className="btn-submit">Asignar plan</button>
            <button type="button" className="btn-cancel" onClick={() => setFormulario(null)}>Cancelar</button></div>
        </form>
      )}

      <h3 className="cuenta-titulo">Planes</h3>
      {cuenta.servicios.length === 0 ? <p className="cuenta-vacio">Sin planes asignados.</p> : cuenta.servicios.map(s => (
        <div key={s.id} className="cuenta-fila">
          <div>
            <strong>{s.plan_nombre}</strong> · {[s.vehiculo.marca, s.vehiculo.modelo].filter(Boolean).join(' ') || 'Vehículo'} ({s.vehiculo.placa || 'S/P'})
            <small>{formatearDinero(s.precio)} {s.periodicidad.toLowerCase()} · próximo cobro {formatearDia(s.proximo_cobro)}</small>
          </div>
          <div className="cuenta-fila-acciones">
            <span className={`status-tag ${s.estado === 'Activo' ? 'status-green' : 'status-gray'}`}>{s.estado}</span>
            {s.estado === 'Activo'
              ? <button className="login-enlace" onClick={() => cambiarServicio(s, 'Suspendido')}>Suspender</button>
              : s.estado === 'Suspendido' && <button className="login-enlace" onClick={() => cambiarServicio(s, 'Activo')}>Reactivar</button>}
            {s.estado !== 'Cancelado' && <button className="login-enlace" onClick={() => cambiarServicio(s, 'Cancelado')}>Cancelar</button>}
          </div>
        </div>
      ))}

      <h3 className="cuenta-titulo">Cargos ({vigentes.length})</h3>
      {cuenta.cargos.length === 0 ? <p className="cuenta-vacio">Sin cargos.</p> : cuenta.cargos.map(c => (
        <div key={c.id} className="cuenta-fila" style={{ opacity: c.estado === 'Anulado' ? 0.6 : 1 }}>
          <div>
            <strong>{c.concepto}</strong>
            <small>
              {c.periodo_inicio ? `${formatearDia(c.periodo_inicio)} – ${formatearDia(c.periodo_fin)} · ` : ''}vence {formatearDia(c.fecha_vencimiento)}
              {c.referencia_factura ? ` · ${c.referencia_factura}` : ''}{c.motivo_anulacion ? ` · Anulado: ${c.motivo_anulacion}` : ''}
            </small>
          </div>
          <div className="cuenta-fila-acciones">
            <span className="cuenta-importe">{formatearDinero(c.monto)}{c.saldo > 0 && c.saldo < c.monto ? <small>saldo {formatearDinero(c.saldo)}</small> : null}</span>
            <span className={`status-tag ${c.vencido ? 'status-red' : claseEstado[c.estado]}`}>{c.vencido ? 'Vencido' : c.estado}</span>
            {c.estado !== 'Anulado' && <>
              <button className="btn-icon" aria-label="Referencia de factura" title="Factura / NCF" onClick={() => referenciar(c)}><FileText size={16} /></button>
              <button className="btn-icon danger" aria-label="Anular cargo" title="Anular" onClick={() => anular('cargos', c.id)}><Ban size={16} /></button>
            </>}
          </div>
        </div>
      ))}

      <h3 className="cuenta-titulo">Pagos</h3>
      {cuenta.pagos.length === 0 ? <p className="cuenta-vacio">Sin pagos.</p> : cuenta.pagos.map(p => (
        <div key={p.id} className="cuenta-fila" style={{ opacity: p.anulado ? 0.6 : 1 }}>
          <div>
            <strong>{formatearDia(p.fecha)} · {p.metodo}</strong>
            <small>{p.referencia ?? 'Sin referencia'}{p.sin_aplicar > 0 ? ` · ${formatearDinero(p.sin_aplicar)} a favor` : ''}{p.anulado ? ` · Anulado: ${p.motivo_anulacion}` : ''}</small>
          </div>
          <div className="cuenta-fila-acciones">
            <span className="cuenta-importe">{formatearDinero(p.monto)}</span>
            {!p.anulado && <button className="btn-icon danger" aria-label="Anular pago" title="Anular" onClick={() => anular('pagos', p.id)}><Ban size={16} /></button>}
          </div>
        </div>
      ))}
    </div>
  );
};

export default EstadoCuentaCliente;
