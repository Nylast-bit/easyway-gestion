import React, { useEffect, useState } from 'react';
import { estadosInstalacion, type PeriodoFiltro, type Persona, type ResumenInstalaciones, type TipoServicioFila } from '@easyway/shared';
import { solicitarApi } from '../lib/api';
import { filtroInicial, type Filtro } from '../lib/filtrosInstalaciones';

const etiquetasPeriodo: Record<PeriodoFiltro, string> = {
  todo: 'Todas', semana: 'Esta semana', mes: 'Este mes', mes_anterior: 'Mes anterior', anio: 'Este año', personalizado: 'Rango personalizado',
};

// Barra de filtros y resumen de instalaciones: cuántas hay en el periodo y cuántas por técnico.
const FiltrosInstalaciones: React.FC<{ filtro: Filtro; onCambio: (filtro: Filtro) => void; resumen: ResumenInstalaciones | null; esTecnico: boolean }> =
  ({ filtro, onCambio, resumen, esTecnico }) => {
    const [tecnicos, setTecnicos] = useState<Persona[]>([]);
    const [tipos, setTipos] = useState<TipoServicioFila[]>([]);

    useEffect(() => {
      solicitarApi<TipoServicioFila[]>('/tipos-servicio').then(setTipos).catch(() => setTipos([]));
      if (!esTecnico) solicitarApi<Persona[]>('/tecnicos').then(setTecnicos).catch(() => setTecnicos([]));
    }, [esTecnico]);

    const cambiar = (cambios: Partial<Filtro>) => onCambio({ ...filtro, ...cambios });
    const activo = JSON.stringify(filtro) !== JSON.stringify(filtroInicial);

    return (
      <section className="filtros-instalaciones" aria-label="Filtros de instalaciones">
        <div className="filtros-campos">
          <label><span>Periodo</span>
            <select className="form-select" value={filtro.periodo} onChange={e => cambiar({ periodo: e.target.value as PeriodoFiltro })}>
              {(Object.keys(etiquetasPeriodo) as PeriodoFiltro[]).map(p => <option key={p} value={p}>{etiquetasPeriodo[p]}</option>)}
            </select>
          </label>
          {filtro.periodo === 'personalizado' && <>
            <label><span>Desde</span><input type="date" className="form-input" value={filtro.desde} onChange={e => cambiar({ desde: e.target.value })} /></label>
            <label><span>Hasta</span><input type="date" className="form-input" value={filtro.hasta} onChange={e => cambiar({ hasta: e.target.value })} /></label>
          </>}
          {!esTecnico && (
            <label><span>Técnico</span>
              <select className="form-select" value={filtro.tecnico} onChange={e => cambiar({ tecnico: e.target.value })}>
                <option value="">Todos</option>
                <option value="sin">Sin técnico</option>
                {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </label>
          )}
          <label><span>Tipo</span>
            <select className="form-select" value={filtro.tipo_servicio_id} onChange={e => cambiar({ tipo_servicio_id: e.target.value })}>
              <option value="">Todos</option>
              {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </label>
          <label><span>Estado</span>
            <select className="form-select" value={filtro.estado} onChange={e => cambiar({ estado: e.target.value })}>
              <option value="">Todos</option>
              {estadosInstalacion.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </label>
        </div>

        {resumen && (
          <div className="filtros-resumen">
            <strong>{resumen.total} instalacion{resumen.total === 1 ? '' : 'es'}</strong>
            {activo && <button type="button" className="login-enlace" onClick={() => onCambio(filtroInicial)}>Quitar filtros</button>}
            {!esTecnico && resumen.por_tecnico.length > 0 && (
              <div className="filtros-chips" aria-label="Instalaciones por técnico">
                {resumen.por_tecnico.map(t => {
                  const valor = t.tecnico_id === null ? 'sin' : String(t.tecnico_id);
                  return (
                    <button key={valor} type="button" className={`filtro-chip${filtro.tecnico === valor ? ' activo' : ''}`} aria-pressed={filtro.tecnico === valor}
                      onClick={() => cambiar({ tecnico: filtro.tecnico === valor ? '' : valor })}>
                      {t.nombre} <b>{t.total}</b>
                    </button>
                  );
                })}
              </div>
            )}
            {resumen.por_tipo.length > 1 && (
              <p className="filtros-tipos">{resumen.por_tipo.map(t => `${t.nombre}: ${t.total}`).join(' · ')}</p>
            )}
          </div>
        )}
      </section>
    );
  };

export default FiltrosInstalaciones;
