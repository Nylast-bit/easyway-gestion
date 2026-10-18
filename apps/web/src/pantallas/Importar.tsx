import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FileUp, RotateCcw, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import type {
  CatalogoDetectado, DecisionCatalogo, FilaVistaPrevia, ImportacionFila, OpcionesImportacion, Persona, PlanFila, ResumenImportacion, TipoServicioFila,
} from '@easyway/shared';
import { formatearFecha, mensajeError, solicitarApi } from '../lib/api';

const claseEstado: Record<ImportacionFila['estado'], string> = { Analizada: 'status-yellow', Confirmada: 'status-green', Revertida: 'status-gray', Descartada: 'status-gray' };
type Catalogo = 'tecnicos' | 'planes' | 'tipos';
const titulos: Record<Catalogo, string> = { tecnicos: 'Técnicos', planes: 'Planes', tipos: 'Tipos de servicio' };

// Una decisión se codifica en el <select> como "crear:Nombre", "ninguno" o "id:5".
const codificar = (d: DecisionCatalogo) => (d.accion === 'existente' ? `id:${d.id}` : d.accion === 'crear' ? `crear:${d.nombre}` : 'ninguno');
const decodificar = (valor: string): DecisionCatalogo =>
  valor.startsWith('id:') ? { accion: 'existente', id: Number(valor.slice(3)) } : valor.startsWith('crear:') ? { accion: 'crear', nombre: valor.slice(6) } : { accion: 'ninguno' };

// Importación del Excel histórico: análisis sin escribir, decisiones de catálogo, confirmación
// transaccional y reversión. El archivo no se guarda; solo las filas normalizadas.
const Importar: React.FC = () => {
  const [historial, setHistorial] = useState<ImportacionFila[]>([]);
  const [actual, setActual] = useState<ImportacionFila | null>(null);
  const [opciones, setOpciones] = useState<OpcionesImportacion | null>(null);
  const [resumen, setResumen] = useState<ResumenImportacion | null>(null);
  const [problemas, setProblemas] = useState<FilaVistaPrevia[]>([]);
  const [existentes, setExistentes] = useState<Record<Catalogo, { id: number; nombre: string }[]>>({ tecnicos: [], planes: [], tipos: [] });
  const [ocupado, setOcupado] = useState(false);
  const archivoRef = useRef<HTMLInputElement>(null);

  const cargarHistorial = useCallback(async () => {
    try { setHistorial(await solicitarApi<ImportacionFila[]>('/importaciones')); }
    catch (error) { toast.error(mensajeError(error, 'No se pudo cargar el historial')); }
  }, []);

  useEffect(() => {
    void cargarHistorial();
    void Promise.all([
      solicitarApi<Persona[]>('/tecnicos').catch(() => [] as Persona[]),
      solicitarApi<PlanFila[]>('/planes').catch(() => [] as PlanFila[]),
      solicitarApi<TipoServicioFila[]>('/tipos-servicio').catch(() => [] as TipoServicioFila[]),
    ]).then(([tecnicos, planes, tipos]) => setExistentes({
      tecnicos, planes: planes.map(p => ({ id: p.id, nombre: `${p.nombre}${p.activo ? '' : ' (inactivo)'}` })), tipos,
    }));
  }, [cargarHistorial]);

  const abrir = async (importacion: ImportacionFila) => {
    setActual(importacion);
    setOpciones(importacion.opciones);
    setResumen(importacion.resumen);
    setProblemas([]);
    if (importacion.estado === 'Analizada') {
      setProblemas(await solicitarApi<FilaVistaPrevia[]>(`/importaciones/${importacion.id}/filas?filtro=problemas`).catch(() => []));
    }
  };

  const subir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setOcupado(true);
    try {
      const formulario = new FormData();
      formulario.set('archivo', archivo);
      const nueva = await solicitarApi<ImportacionFila>('/importaciones', { cuerpo: formulario });
      toast.success('Archivo analizado; revisa la vista previa antes de confirmar');
      await abrir(nueva);
      void cargarHistorial();
    } catch (error) { toast.error(mensajeError(error, 'No se pudo analizar el archivo')); }
    finally { setOcupado(false); }
  };

  const cambiarDecision = async (catalogo: Catalogo, clave: string, valor: string) => {
    if (!opciones || !actual) return;
    const nuevas = { ...opciones, [catalogo]: { ...opciones[catalogo], [clave]: decodificar(valor) } };
    setOpciones(nuevas);
    try { setResumen(await solicitarApi<ResumenImportacion>(`/importaciones/${actual.id}/previsualizar`, { cuerpo: nuevas })); }
    catch (error) { toast.error(mensajeError(error, 'No se pudo actualizar la vista previa')); }
  };

  const accion = async (tipo: 'confirmar' | 'descartar' | 'revertir') => {
    if (!actual) return;
    const preguntas = {
      confirmar: `Se crearán ${resumen?.nuevos.clientes} clientes, ${resumen?.nuevos.vehiculos} vehículos y ${resumen?.nuevos.instalaciones} instalaciones. ¿Confirmar la importación?`,
      descartar: '¿Descartar este análisis? Se borran las filas en espera.',
      revertir: 'Se borrará todo lo que creó esta importación (si nada lo usa después). Los cambios hechos a mano sobre esos registros se perderán. ¿Revertir?',
    };
    if (!window.confirm(preguntas[tipo])) return;
    setOcupado(true);
    try {
      const resultado = await solicitarApi<ImportacionFila>(`/importaciones/${actual.id}/${tipo}`, { cuerpo: tipo === 'confirmar' ? opciones : {} });
      toast.success({ confirmar: 'Importación confirmada', descartar: 'Análisis descartado', revertir: 'Importación revertida' }[tipo]);
      await abrir(resultado);
      void cargarHistorial();
    } catch (error) { toast.error(mensajeError(error, 'No se pudo completar la operación')); }
    finally { setOcupado(false); }
  };

  const opcionesDe = (catalogo: Catalogo, detectado: CatalogoDetectado, lista: CatalogoDetectado[]) => {
    const otros = lista.filter(o => o.clave !== detectado.clave && o.texto);
    return (
      <>
        {detectado.texto && <option value={`crear:${detectado.texto}`}>Crear «{detectado.texto}»</option>}
        {catalogo !== 'tipos' && <option value="ninguno">{catalogo === 'tecnicos' ? 'Sin técnico' : 'Sin plan'}</option>}
        {existentes[catalogo].length > 0 && <optgroup label="Existentes">
          {existentes[catalogo].map(e => <option key={e.id} value={`id:${e.id}`}>{e.nombre}</option>)}
        </optgroup>}
        {otros.length > 0 && <optgroup label="Unir con otro texto del Excel">
          {otros.map(o => <option key={o.clave} value={`crear:${o.texto}`}>Igual que «{o.texto}»</option>)}
        </optgroup>}
      </>
    );
  };

  const n = resumen?.nuevos;
  return (
    <div>
      <div className="cabecera-pagina">
        <h1 style={{ fontSize: '1.5rem', fontWeight: '700' }}>Importar Excel</h1>
        <div className="cabecera-acciones">
          <button className="btn-primary" onClick={() => archivoRef.current?.click()} disabled={ocupado}>
            <FileUp size={18} /> {ocupado ? 'Procesando…' : 'Analizar archivo'}
          </button>
          <input ref={archivoRef} type="file" accept=".xlsx" hidden onChange={subir} data-testid="archivo-excel" />
        </div>
      </div>
      <p className="cuenta-ayuda" style={{ marginTop: '-0.75rem', marginBottom: '1.25rem' }}>
        Se lee la hoja “Data de instalaciones e cliente” (y “Simcards” para fechas de SIM). Analizar no modifica nada; los datos se crean al confirmar.
      </p>

      {actual && resumen && (
        <section className="importacion-detalle" aria-label="Vista previa de la importación">
          <div className="importacion-cabecera">
            <div>
              <h2>{actual.archivo_nombre}</h2>
              <small>Hoja «{resumen.hoja}» · {resumen.filas} filas · {resumen.filas_validas} válidas · {resumen.filas_con_error} con error · {resumen.filas_con_advertencia} con advertencias{resumen.filas_omitidas ? ` · ${resumen.filas_omitidas} omitidas` : ''}</small>
            </div>
            <span className={`status-tag ${claseEstado[actual.estado]}`}>{actual.estado}</span>
          </div>

          {n && (
            <div className="importacion-conteos">
              {([['Clientes', n.clientes, resumen.existentes.clientes], ['Vehículos', n.vehiculos, resumen.existentes.vehiculos], ['GPS', n.gps, resumen.existentes.gps],
                ['SIM', n.simcards, resumen.existentes.simcards], ['Instalaciones', n.instalaciones, 0], ['Técnicos', n.tecnicos, 0], ['Planes', n.planes, 0],
                ['Planes de cobro', n.servicios, 0]] as const).map(([etiqueta, nuevos, reutilizados]) => (
                <div key={etiqueta}><strong>{nuevos}</strong><small>{etiqueta}{reutilizados ? ` · ${reutilizados} ya existían` : ''}</small></div>
              ))}
            </div>
          )}

          {actual.estado === 'Analizada' && opciones && (
            <>
              {(['tecnicos', 'planes', 'tipos'] as const).map(catalogo => (
                <div key={catalogo} className="importacion-catalogo">
                  <h3>{titulos[catalogo]}</h3>
                  {resumen[catalogo].map(detectado => (
                    <div key={detectado.clave} className="importacion-decision">
                      <label htmlFor={`decision-${catalogo}-${detectado.clave}`}>
                        <span>{detectado.texto || '(vacío)'}</span><small>{detectado.filas} fila(s)</small>
                      </label>
                      <select id={`decision-${catalogo}-${detectado.clave}`} className="form-select"
                        value={codificar(opciones[catalogo][detectado.clave] ?? detectado.sugerencia)}
                        onChange={e => cambiarDecision(catalogo, detectado.clave, e.target.value)}>
                        {opcionesDe(catalogo, detectado, resumen[catalogo])}
                      </select>
                    </div>
                  ))}
                </div>
              ))}
              <label className="importacion-opcion">
                <input type="checkbox" checked={opciones.crear_servicios}
                  onChange={e => { const nuevas = { ...opciones, crear_servicios: e.target.checked }; setOpciones(nuevas);
                    void solicitarApi<ResumenImportacion>(`/importaciones/${actual.id}/previsualizar`, { cuerpo: nuevas }).then(setResumen).catch(() => undefined); }} />
                Crear planes de cobro para vehículos con GPS instalado y plan vigente, desde su próxima renovación (no genera deuda de años pasados).
              </label>

              <h3 className="cuenta-titulo">Filas con errores o advertencias ({problemas.length}{problemas.length === 200 ? '+' : ''})</h3>
              <div className="importacion-filas">
                {problemas.map(f => (
                  <div key={f.id} className="cuenta-fila">
                    <div>
                      <strong>Fila {f.fila}{f.datos ? ` · ${f.datos.cliente.nombre} · IMEI ${f.datos.imei}` : ''}</strong>
                      {f.errores.map(m => <small key={m} className="importacion-error">{m}</small>)}
                      {f.advertencias.map(m => <small key={m}>{m}</small>)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="cuenta-acciones" style={{ marginTop: '1rem' }}>
                <button className="btn-primary" onClick={() => accion('confirmar')} disabled={ocupado}>Confirmar importación</button>
                <button className="vehicle-action-btn" onClick={() => accion('descartar')} disabled={ocupado}><Trash2 size={16} /> Descartar</button>
              </div>
            </>
          )}
          {actual.estado === 'Confirmada' && (
            <div className="cuenta-acciones" style={{ marginTop: '1rem' }}>
              <button className="vehicle-action-btn" onClick={() => accion('revertir')} disabled={ocupado}><RotateCcw size={16} /> Revertir importación</button>
            </div>
          )}
        </section>
      )}

      <h2 style={{ fontSize: '1.1rem', margin: '1.5rem 0 0.75rem' }}>Historial</h2>
      <div className="entity-list">
        {historial.length === 0 ? <p className="cuenta-vacio">Todavía no se ha importado ningún archivo.</p> : historial.map(imp => (
          <button key={imp.id} type="button" className="entity-card cuenta-deudor" onClick={() => abrir(imp)}>
            <div className="entity-details">
              <h3>{imp.archivo_nombre}</h3>
              <p>{formatearFecha(imp.created_at)} · {imp.creado_por_nombre ?? 'Usuario eliminado'} · {imp.resumen.nuevos.instalaciones} instalaciones</p>
            </div>
            <span className={`status-tag ${claseEstado[imp.estado]}`}>{imp.estado}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default Importar;
