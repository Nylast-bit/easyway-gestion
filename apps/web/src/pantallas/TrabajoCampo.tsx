import React, { useCallback, useEffect, useState } from 'react';
import { Camera, CloudOff, Plus, RotateCw, Smartphone, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { tiposVehiculo, type ClienteCampo, type ResumenCostoTecnico, type TipoServicioFila, type TrabajoCampo as Trabajo, type VehiculoCampo } from '@easyway/shared';
import Drawer from '../components/Drawer';
import GaleriaFotos from '../components/GaleriaFotos';
import FotosPendientes from '../components/FotosPendientes';
import BotonInstalar from '../components/BotonInstalar';
import { prepararFoto } from '../lib/imagenes';
import { aFechaHoraLocal, desdeFechaHoraLocal, formatearDinero, formatearFecha, mensajeError, solicitarApi } from '../lib/api';
import { useSesion } from '../lib/sesion';
import {
  aFotoBorrador, descartarBorrador, enviarBorrador, enviarPendientes, esFalloTransitorio, guardarBorrador, listarBorradores, nuevaClave,
  sinConexion, suscribirCola, type Borrador,
} from '../lib/colaCampo';

const claseAprobacion = { Pendiente: 'status-yellow', Aprobada: 'status-green', Rechazada: 'status-red' } as const;
const formularioVacio = () => ({
  cliente: null as ClienteCampo | null, clienteNuevo: false, nuevoCliente: { nombre: '', telefono: '', tipo: 'Particular' },
  vehiculo_id: '' as string, vehiculoNuevo: false, nuevoVehiculo: { placa: '', marca: '', modelo: '', color: '', tipo: 'Carro' },
  imei: '', sim: '', tipo_servicio_id: '' as string, fecha: aFechaHoraLocal(null), notas: '',
});

// Pantalla del técnico en campo: registra trabajos (quedan pendientes de aprobación) y ve su historial y costos.
const TrabajoCampo: React.FC = () => {
  const usuario = useSesion();
  const [borradores, setBorradores] = useState<Borrador[]>([]);
  const [reintentando, setReintentando] = useState(false);
  const [trabajos, setTrabajos] = useState<Trabajo[]>([]);
  const [costos, setCostos] = useState<ResumenCostoTecnico | null>(null);
  const [tipos, setTipos] = useState<TipoServicioFila[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [fotos, setFotos] = useState<{ vehiculoId?: number; trabajoId?: number } | null>(null);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [progreso, setProgreso] = useState('');
  const [f, setF] = useState(formularioVacio);
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<ClienteCampo[]>([]);
  const [vehiculos, setVehiculos] = useState<VehiculoCampo[]>([]);
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [lista, resumen] = await Promise.all([solicitarApi<Trabajo[]>('/campo/trabajos'), solicitarApi<ResumenCostoTecnico>('/campo/costos')]);
      setTrabajos(lista);
      setCostos(resumen);
    } catch (error) { toast.error(mensajeError(error, 'No se pudieron cargar tus trabajos')); }
  }, []);

  // Trabajos guardados en el teléfono sin señal; cuando alguno se envía, se recarga la lista del servidor.
  useEffect(() => {
    if (!usuario) return;
    let previos = -1;
    const leer = () => listarBorradores(usuario.id).then(lista => {
      if (previos > lista.length) void cargar();
      previos = lista.length;
      setBorradores(lista);
    }).catch(() => setBorradores([]));
    void leer();
    return suscribirCola(() => void leer());
  }, [usuario, cargar]);

  useEffect(() => {
    void cargar();
    solicitarApi<TipoServicioFila[]>('/tipos-servicio?activos=1').then(setTipos).catch(() => setTipos([]));
  }, [cargar]);

  // Si los tipos llegan con el formulario ya abierto, se propone el primero.
  useEffect(() => {
    if (tipos.length) setF(prev => (prev.tipo_servicio_id ? prev : { ...prev, tipo_servicio_id: String(tipos[0].id) }));
  }, [tipos]);

  // Búsqueda de clientes con espera corta para no consultar en cada tecla.
  useEffect(() => {
    if (f.cliente || f.clienteNuevo || busqueda.trim().length < 2) { setResultados([]); return; }
    const temporizador = setTimeout(() => {
      solicitarApi<ClienteCampo[]>(`/campo/clientes?q=${encodeURIComponent(busqueda.trim())}`).then(setResultados).catch(() => setResultados([]));
    }, 250);
    return () => clearTimeout(temporizador);
  }, [busqueda, f.cliente, f.clienteNuevo]);

  const elegirCliente = async (cliente: ClienteCampo) => {
    setF(prev => ({ ...prev, cliente, vehiculo_id: '', vehiculoNuevo: false }));
    setVehiculos(await solicitarApi<VehiculoCampo[]>(`/campo/vehiculos?cliente_id=${cliente.id}`).catch(() => []));
  };

  const nuevo = () => {
    setF({ ...formularioVacio(), tipo_servicio_id: String(tipos[0]?.id ?? '') });
    setBusqueda('');
    setVehiculos([]);
    setArchivos([]);
    setAbierto(true);
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const vehiculoNuevo = f.vehiculoNuevo || !f.cliente;
    setEnviando(true);
    try {
      // Las fotos se reducen antes de nada: así lo que se guarda sin señal ya ocupa poco.
      let fallidas = 0;
      const fotosListas: Borrador['fotos'] = [];
      for (const [i, original] of archivos.entries()) {
        setProgreso(`Preparando fotos ${i + 1}/${archivos.length}…`);
        try { fotosListas.push(await aFotoBorrador(await prepararFoto(original))); } catch { fallidas++; }
      }
      const clave = nuevaClave();
      const borrador: Borrador = {
        clave, usuario_id: usuario?.id ?? 0, creado: new Date().toISOString(), trabajo_id: null, fotos: fotosListas, fotos_fallidas: fallidas, error: null,
        cuerpo: {
          cliente_id: f.clienteNuevo ? null : f.cliente?.id ?? null,
          cliente_nuevo: f.clienteNuevo ? f.nuevoCliente : null,
          vehiculo_id: vehiculoNuevo ? null : f.vehiculo_id || null,
          vehiculo_nuevo: vehiculoNuevo ? f.nuevoVehiculo : null,
          imei: f.imei, sim: f.sim, tipo_servicio_id: f.tipo_servicio_id, fecha_instalacion: desdeFechaHoraLocal(f.fecha), notas: f.notas,
          clave_idempotencia: clave,
        },
        resumen: {
          tipo: tipos.find(t => String(t.id) === f.tipo_servicio_id)?.nombre ?? 'Trabajo',
          cliente: f.clienteNuevo ? `${f.nuevoCliente.nombre} · nuevo` : f.cliente?.nombre ?? 'Sin cliente',
          vehiculo: vehiculoNuevo
            ? `${[f.nuevoVehiculo.marca, f.nuevoVehiculo.modelo].filter(Boolean).join(' ') || 'Vehículo'} (${f.nuevoVehiculo.placa || 'S/P'}) · nuevo`
            : vehiculos.find(v => String(v.id) === f.vehiculo_id)?.descripcion ?? 'Vehículo',
          imei: f.imei.replace(/\s+/g, ''), fecha: desdeFechaHoraLocal(f.fecha),
        },
      };
      const cerrar = () => { setAbierto(false); setArchivos([]); };
      // Sin señal (o si se corta a mitad): el trabajo queda en el teléfono y se envía solo al volver la conexión.
      const guardarSinSenal = async () => {
        await guardarBorrador(borrador);
        toast.success('Sin señal: el trabajo quedó guardado en el teléfono y se enviará al volver la señal');
        cerrar();
      };
      if (usuario && sinConexion()) return await guardarSinSenal();
      try {
        // El trabajo se crea primero; las fotos después, una a una. Si alguna se rechaza se agrega desde "Mis trabajos".
        const resultado = await enviarBorrador(borrador, { guardado: false, progreso: setProgreso });
        if (resultado.fotos_fallidas) toast.error(`${resultado.fotos_fallidas} foto(s) no se pudieron subir; agrégalas desde “Mis trabajos”.`);
        toast.success('Trabajo enviado; queda pendiente de aprobación');
        cerrar();
        void cargar();
      } catch (error) {
        if (!usuario || !esFalloTransitorio(error)) throw error;
        await guardarSinSenal();
      }
    } catch (error) { toast.error(mensajeError(error, 'No se pudo registrar el trabajo ni guardarlo en el teléfono')); }
    finally { setEnviando(false); setProgreso(''); }
  };

  const reintentar = async () => {
    if (!usuario) return;
    setReintentando(true);
    try {
      const { enviados, fotos_fallidas } = await enviarPendientes(usuario.id, { conError: true });
      if (enviados) toast.success(enviados === 1 ? 'Trabajo enviado; queda pendiente de aprobación' : `Se enviaron ${enviados} trabajos`);
      else toast.error(sinConexion() ? 'Sigue sin señal; se enviará al volver la conexión' : 'No se pudo enviar; revisa el aviso del trabajo');
      if (fotos_fallidas) toast.error(`${fotos_fallidas} foto(s) no se pudieron subir; agrégalas desde “Mis trabajos”.`);
    } catch { toast.error('No se pudo leer la cola del teléfono'); }
    finally { setReintentando(false); }
  };

  const descartar = async (b: Borrador) => {
    const fotos = b.fotos.length ? ` con ${b.fotos.length} foto(s)` : '';
    if (!window.confirm(`¿Descartar el trabajo de ${b.resumen.cliente}? Se borrará del teléfono${fotos}.`)) return;
    await descartarBorrador(b.clave).catch(() => toast.error('No se pudo descartar'));
  };

  const pedirVehiculoNuevo = f.clienteNuevo || f.vehiculoNuevo || (f.cliente !== null && vehiculos.length === 0);

  return (
    <div>
      <div className="cabecera-pagina">
        <h1 style={{ fontSize: '1.5rem', fontWeight: '700' }}>Trabajo de campo</h1>
        <div className="cabecera-acciones">
          <BotonInstalar />
          <button className="btn-primary" onClick={nuevo}><Plus size={18} /> Nuevo trabajo</button>
        </div>
      </div>

      {costos && (
        <div className="cuenta-totales" style={{ marginBottom: '1.25rem' }}>
          <div><small>Trabajos aprobados</small><strong>{costos.trabajos}</strong></div>
          <div><small>Pendiente de pago</small><strong>{formatearDinero(costos.pendiente)}</strong></div>
          <div><small>Cobrado</small><strong>{formatearDinero(costos.pagado)}</strong></div>
        </div>
      )}

      <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Mis trabajos</h2>
      <div className="entity-list">
        {borradores.map(b => (
          <div key={b.clave} className="vehicle-card borrador-campo" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
              <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                <div className="vehicle-title">{b.resumen.tipo} · {b.resumen.cliente}</div>
                <div className="vehicle-owner">{b.resumen.vehiculo} · IMEI {b.resumen.imei}</div>
              </div>
              <span className="status-tag status-gray borrador-etiqueta"><CloudOff size={13} /> Sin enviar</span>
            </div>
            <p className={b.error ? 'borrador-aviso importacion-error' : 'borrador-aviso'}>
              {b.error ? `No se pudo enviar: ${b.error}` : b.trabajo_id ? 'Trabajo recibido; faltan fotos · se enviarán al volver la señal' : 'Sin enviar · se enviará al volver la señal'}
            </p>
            <div className="vehicle-tags" style={{ marginTop: '0.5rem' }}>
              <span className="vehicle-tag">{formatearFecha(b.resumen.fecha)}</span>
              {b.fotos.length > 0 && <span className="vehicle-tag">{b.fotos.length} foto(s) en el teléfono</span>}
              <button type="button" className="login-enlace" disabled={reintentando} onClick={() => void reintentar()}><RotateCw size={14} /> Reintentar</button>
              <button type="button" className="login-enlace borrador-descartar" onClick={() => void descartar(b)}><Trash2 size={14} /> Descartar</button>
            </div>
          </div>
        ))}
        {trabajos.length === 0 && borradores.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
            <Smartphone size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
            <p>Aún no has registrado trabajos.</p>
          </div>
        ) : trabajos.map(t => (
          <div key={t.id} className="vehicle-card" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
              <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                <div className="vehicle-title">{t.tipo} · {t.cliente_nombre}</div>
                <div className="vehicle-owner">{t.vehiculo_descripcion} · IMEI {t.imei}{t.sim ? ` · SIM ${t.sim}` : ''}</div>
              </div>
              <span className={`status-tag ${claseAprobacion[t.aprobacion]}`} style={{ alignSelf: 'flex-start' }}>{t.aprobacion}</span>
            </div>
            <div className="vehicle-tags" style={{ marginTop: '0.5rem' }}>
              <span className="vehicle-tag">{formatearFecha(t.fecha_instalacion)}</span>
              {t.costo_tecnico !== null && <span className="vehicle-tag">{formatearDinero(t.costo_tecnico)} · {t.costo_pagado_at ? 'pagado' : 'por cobrar'}</span>}
              {t.aprobacion === 'Pendiente' ? (
                <button type="button" className="login-enlace" onClick={() => setFotos({ trabajoId: t.id })}><Camera size={14} /> {t.fotos ? `Fotos (${t.fotos})` : 'Agregar fotos'}</button>
              ) : t.vehiculo_id && (
                <button type="button" className="login-enlace" onClick={() => setFotos({ vehiculoId: t.vehiculo_id! })}><Camera size={14} /> Fotos</button>
              )}
            </div>
            {t.motivo_rechazo && <p className="importacion-error" style={{ fontSize: '0.85rem', marginTop: '0.4rem' }}>Rechazado: {t.motivo_rechazo}</p>}
          </div>
        ))}
      </div>

      <Drawer isOpen={abierto} onClose={() => setAbierto(false)} title="Nuevo trabajo">
        <form onSubmit={enviar}>
          <div className="form-group">
            <label className="form-label" htmlFor="campo-tipo">Tipo de servicio *</label>
            <select id="campo-tipo" className="form-select" required value={f.tipo_servicio_id} onChange={e => setF({ ...f, tipo_servicio_id: e.target.value })}>
              {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="campo-cliente">Cliente *</label>
            {f.clienteNuevo ? (
              <>
                <input id="campo-cliente" className="form-input" placeholder="Nombre o razón social" required maxLength={120}
                  value={f.nuevoCliente.nombre} onChange={e => setF({ ...f, nuevoCliente: { ...f.nuevoCliente, nombre: e.target.value } })} />
                <div className="form-row" style={{ marginTop: '0.5rem' }}>
                  <input className="form-input" aria-label="Teléfono del cliente" placeholder="Teléfono" inputMode="tel" maxLength={40}
                    value={f.nuevoCliente.telefono} onChange={e => setF({ ...f, nuevoCliente: { ...f.nuevoCliente, telefono: e.target.value } })} />
                  <select className="form-select" aria-label="Tipo de cliente" value={f.nuevoCliente.tipo} onChange={e => setF({ ...f, nuevoCliente: { ...f.nuevoCliente, tipo: e.target.value } })}>
                    <option>Particular</option><option>Empresa</option>
                  </select>
                </div>
              </>
            ) : f.cliente ? (
              <div className="campo-elegido"><span>{f.cliente.nombre}</span>
                <button type="button" className="login-enlace" onClick={() => { setF({ ...f, cliente: null, vehiculo_id: '' }); setVehiculos([]); }}>Cambiar</button></div>
            ) : (
              <>
                <input id="campo-cliente" className="form-input" placeholder="Buscar por nombre…" value={busqueda} onChange={e => setBusqueda(e.target.value)} autoComplete="off" />
                {resultados.length > 0 && (
                  <ul className="campo-resultados" role="listbox" aria-label="Clientes encontrados">
                    {resultados.map(c => <li key={c.id}><button type="button" role="option" aria-selected={false} onClick={() => void elegirCliente(c)}>{c.nombre}</button></li>)}
                  </ul>
                )}
              </>
            )}
            <button type="button" className="login-enlace" onClick={() => setF({ ...f, clienteNuevo: !f.clienteNuevo, cliente: null, vehiculo_id: '', vehiculoNuevo: false })}>
              {f.clienteNuevo ? 'Buscar un cliente existente' : 'Es un cliente nuevo'}
            </button>
          </div>

          {(f.cliente || f.clienteNuevo) && (
            <div className="form-group">
              <label className="form-label" htmlFor="campo-vehiculo">Vehículo *</label>
              {!pedirVehiculoNuevo ? (
                <select id="campo-vehiculo" className="form-select" required value={f.vehiculo_id} onChange={e => setF({ ...f, vehiculo_id: e.target.value })}>
                  <option value="">Selecciona…</option>
                  {vehiculos.map(v => <option key={v.id} value={v.id}>{v.descripcion}</option>)}
                </select>
              ) : (
                <>
                  <div className="form-row">
                    <input id="campo-vehiculo" className="form-input" placeholder="Placa" maxLength={20} value={f.nuevoVehiculo.placa}
                      onChange={e => setF({ ...f, nuevoVehiculo: { ...f.nuevoVehiculo, placa: e.target.value.toUpperCase() } })} />
                    <select className="form-select" aria-label="Tipo de vehículo" value={f.nuevoVehiculo.tipo} onChange={e => setF({ ...f, nuevoVehiculo: { ...f.nuevoVehiculo, tipo: e.target.value } })}>
                      {tiposVehiculo.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-row" style={{ marginTop: '0.5rem' }}>
                    <input className="form-input" aria-label="Marca" placeholder="Marca" maxLength={50} value={f.nuevoVehiculo.marca} onChange={e => setF({ ...f, nuevoVehiculo: { ...f.nuevoVehiculo, marca: e.target.value.toUpperCase() } })} />
                    <input className="form-input" aria-label="Modelo" placeholder="Modelo" maxLength={50} value={f.nuevoVehiculo.modelo} onChange={e => setF({ ...f, nuevoVehiculo: { ...f.nuevoVehiculo, modelo: e.target.value.toUpperCase() } })} />
                  </div>
                </>
              )}
              {f.cliente && vehiculos.length > 0 && (
                <button type="button" className="login-enlace" onClick={() => setF({ ...f, vehiculoNuevo: !f.vehiculoNuevo, vehiculo_id: '' })}>
                  {f.vehiculoNuevo ? 'Elegir un vehículo del cliente' : 'Es un vehículo nuevo'}
                </button>
              )}
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="campo-imei">IMEI *</label>
              <input id="campo-imei" className="form-input" inputMode="numeric" maxLength={20} required value={f.imei} onChange={e => setF({ ...f, imei: e.target.value.replace(/[^\d\s]/g, '') })} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="campo-sim">SIM</label>
              <input id="campo-sim" className="form-input" inputMode="tel" maxLength={25} value={f.sim} onChange={e => setF({ ...f, sim: e.target.value })} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="campo-fecha">Fecha y hora *</label>
            <input id="campo-fecha" type="datetime-local" className="form-input" required value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="campo-notas">Notas</label>
            <textarea id="campo-notas" className="form-textarea" maxLength={2000} value={f.notas} onChange={e => setF({ ...f, notas: e.target.value })} />
          </div>
          <FotosPendientes archivos={archivos} onCambio={setArchivos} />
          <p className="cuenta-ayuda">Un administrador revisará y aprobará el trabajo; al aprobarlo, las fotos pasan a la galería del vehículo.</p>
          <button type="submit" className="btn-submit" disabled={enviando}>{enviando ? progreso || 'Enviando…' : 'Enviar trabajo'}</button>
        </form>
      </Drawer>

      <Drawer isOpen={fotos !== null} onClose={() => { setFotos(null); void cargar(); }} title={fotos?.trabajoId ? 'Fotos del trabajo' : 'Fotos del vehículo'}>
        {fotos !== null && <GaleriaFotos key={`${fotos.trabajoId}-${fotos.vehiculoId}`} {...fotos} />}
      </Drawer>
    </div>
  );
};

export default TrabajoCampo;
