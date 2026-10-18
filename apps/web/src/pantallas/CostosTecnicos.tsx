import React, { useCallback, useEffect, useState } from 'react';
import { HandCoins, Undo2 } from 'lucide-react';
import toast from 'react-hot-toast';
import type { CostoTecnicoFila, ResumenCostoTecnico } from '@easyway/shared';
import { formatearDinero, formatearFecha, mensajeError, solicitarApi } from '../lib/api';

// Lo que se debe a cada técnico por trabajos aprobados y el registro de su pago.
const CostosTecnicos: React.FC = () => {
  const [resumen, setResumen] = useState<ResumenCostoTecnico[]>([]);
  const [filas, setFilas] = useState<CostoTecnicoFila[]>([]);
  const [estado, setEstado] = useState<'pendientes' | 'pagados'>('pendientes');
  const [tecnico, setTecnico] = useState('');
  const [elegidos, setElegidos] = useState<number[]>([]);

  const cargar = useCallback(async () => {
    try {
      const filtro = `estado=${estado}${tecnico ? `&tecnico_id=${tecnico}` : ''}`;
      const [totales, lista] = await Promise.all([
        solicitarApi<ResumenCostoTecnico[]>('/costos-tecnicos/resumen'), solicitarApi<CostoTecnicoFila[]>(`/costos-tecnicos?${filtro}`),
      ]);
      setResumen(totales);
      setFilas(lista);
      setElegidos([]);
    } catch (error) { toast.error(mensajeError(error, 'No se pudieron cargar los costos')); }
  }, [estado, tecnico]);
  useEffect(() => { void cargar(); }, [cargar]);

  const pagar = async () => {
    const referencia = window.prompt('Referencia del pago (transferencia, recibo…):', '');
    if (referencia === null) return;
    try {
      const { total } = await solicitarApi<{ marcados: number; total: number }>('/costos-tecnicos/pagar', { cuerpo: { instalacion_ids: elegidos, referencia } });
      toast.success(`Pago registrado por ${formatearDinero(total)}`);
      void cargar();
    } catch (error) { toast.error(mensajeError(error, 'No se pudo registrar el pago')); }
  };

  const desmarcar = async (fila: CostoTecnicoFila) => {
    const motivo = window.prompt('Motivo para desmarcar el pago (queda auditado):');
    if (motivo === null) return;
    try {
      await solicitarApi(`/costos-tecnicos/${fila.instalacion_id}/desmarcar`, { cuerpo: { motivo } });
      toast.success('Pago desmarcado');
      void cargar();
    } catch (error) { toast.error(mensajeError(error, 'No se pudo desmarcar')); }
  };

  const totalElegido = filas.filter(f => elegidos.includes(f.instalacion_id)).reduce((t, f) => t + Math.round(f.costo * 100), 0) / 100;
  return (
    <div>
      <div className="cabecera-pagina">
        <h1 style={{ fontSize: '1.5rem', fontWeight: '700' }}>Costos de técnicos</h1>
        <div className="cabecera-acciones" role="group" aria-label="Estado">
          {(['pendientes', 'pagados'] as const).map(e => (
            <button key={e} type="button" className={e === estado ? 'btn-primary' : 'vehicle-action-btn'} aria-pressed={e === estado} onClick={() => setEstado(e)}>
              {e === 'pendientes' ? 'Por pagar' : 'Pagados'}
            </button>
          ))}
        </div>
      </div>

      <div className="entity-list" style={{ marginBottom: '1.5rem' }}>
        {resumen.map(r => (
          <button key={r.tecnico_id} type="button" className={`entity-card cuenta-deudor${String(r.tecnico_id) === tecnico ? ' seleccionada' : ''}`}
            onClick={() => setTecnico(String(r.tecnico_id) === tecnico ? '' : String(r.tecnico_id))} aria-pressed={String(r.tecnico_id) === tecnico}>
            <div className="entity-details"><h3>{r.tecnico_nombre}</h3><p>{r.trabajos} trabajo(s) · total {formatearDinero(r.total)} · pagado {formatearDinero(r.pagado)}</p></div>
            {r.pendiente > 0 && <span className="status-tag status-yellow">Debe {formatearDinero(r.pendiente)}</span>}
          </button>
        ))}
      </div>

      {estado === 'pendientes' && elegidos.length > 0 && (
        <div className="cuenta-acciones">
          <button className="btn-primary" onClick={pagar}><HandCoins size={16} /> Marcar pagado ({elegidos.length}) · {formatearDinero(totalElegido)}</button>
        </div>
      )}
      <div className="entity-list">
        {filas.length === 0 ? <p className="cuenta-vacio">No hay trabajos {estado === 'pendientes' ? 'por pagar' : 'pagados'}.</p> : filas.map(f => (
          <label key={f.instalacion_id} className="entity-card costo-fila">
            {estado === 'pendientes' && (
              <input type="checkbox" checked={elegidos.includes(f.instalacion_id)} aria-label={`Elegir trabajo ${f.instalacion_id}`}
                onChange={e => setElegidos(e.target.checked ? [...elegidos, f.instalacion_id] : elegidos.filter(x => x !== f.instalacion_id))} />
            )}
            <div className="entity-details">
              <h3>{f.tecnico_nombre} · {f.tipo}</h3>
              <p>{f.cliente_nombre} · {f.vehiculo_descripcion} · {formatearFecha(f.fecha_instalacion)}{f.referencia ? ` · ${f.referencia}` : ''}</p>
            </div>
            <span className="cuenta-importe">{formatearDinero(f.costo)}</span>
            {estado === 'pagados' && (
              <button type="button" className="btn-icon" aria-label={`Desmarcar pago del trabajo ${f.instalacion_id}`} onClick={e => { e.preventDefault(); void desmarcar(f); }}>
                <Undo2 size={16} />
              </button>
            )}
          </label>
        ))}
      </div>
    </div>
  );
};

export default CostosTecnicos;
