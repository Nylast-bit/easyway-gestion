import React, { useCallback, useEffect, useState } from 'react';
import { CalendarPlus, Layers, Receipt } from 'lucide-react';
import toast from 'react-hot-toast';
import { fechaEnRD, type Persona, type ResumenCobros } from '@easyway/shared';
import Drawer from '../components/Drawer';
import SearchableSelect from '../components/SearchableSelect';
import EstadoCuentaCliente from '../components/EstadoCuentaCliente';
import PlanesPanel from '../components/PlanesPanel';
import { formatearDinero, mensajeError, solicitarApi } from '../lib/api';

// Cobros a clientes: planes recurrentes por vehículo, cargos por periodo y pagos.
const Cobros: React.FC = () => {
  const [resumen, setResumen] = useState<ResumenCobros | null>(null);
  const [clientes, setClientes] = useState<Persona[]>([]);
  const [cliente, setCliente] = useState<{ id: number; nombre: string } | null>(null);
  const [verPlanes, setVerPlanes] = useState(false);
  const [generando, setGenerando] = useState(false);

  const cargar = useCallback(async () => {
    try { setResumen(await solicitarApi<ResumenCobros>('/cobros/resumen')); }
    catch (error) { toast.error(mensajeError(error, 'No se pudo cargar el resumen de cobros')); }
  }, []);

  useEffect(() => {
    void cargar();
    solicitarApi<Persona[]>('/clientes').then(setClientes).catch(() => setClientes([]));
  }, [cargar]);

  const generar = async () => {
    setGenerando(true);
    try {
      const { creados } = await solicitarApi<{ creados: number }>('/cargos/generar', { cuerpo: { hasta: fechaEnRD() } });
      toast.success(creados ? `${creados} cargo(s) generado(s)` : 'No había periodos por facturar');
      await cargar();
    } catch (error) { toast.error(mensajeError(error, 'No se pudieron generar los cargos')); }
    finally { setGenerando(false); }
  };

  return (
    <div>
      <div className="cabecera-pagina">
        <h1 style={{ fontSize: '1.5rem', fontWeight: '700' }}>Cobros</h1>
        <div className="cabecera-acciones">
          <button className="vehicle-action-btn" onClick={() => setVerPlanes(true)}><Layers size={16} /> Planes</button>
          <button className="btn-primary" onClick={generar} disabled={generando}>
            <CalendarPlus size={18} /> {generando ? 'Generando…' : 'Generar cargos'}
          </button>
        </div>
      </div>

      {resumen && (
        <div className="stats-grid stats-dinero" style={{ marginBottom: '1.5rem' }}>
          <div className="stat-card"><h3 className="stat-importe">{formatearDinero(resumen.pendiente)}</h3><p>Pendiente de cobro</p></div>
          <div className="stat-card"><h3 className="stat-importe" style={{ color: resumen.vencido > 0 ? '#b91c1c' : undefined }}>{formatearDinero(resumen.vencido)}</h3><p>Vencido</p></div>
          <div className="stat-card"><h3 className="stat-importe">{formatearDinero(resumen.cobrado_mes)}</h3><p>Cobrado este mes</p></div>
          <div className="stat-card"><h3 className="stat-importe">{resumen.por_generar}</h3><p>Planes por facturar hoy</p></div>
        </div>
      )}

      <div style={{ maxWidth: '400px', marginBottom: '1.5rem' }}>
        <SearchableSelect
          options={clientes.map(c => ({ id: c.id, label: c.nombre }))}
          value={cliente?.id ?? ''}
          onChange={id => { const elegido = clientes.find(c => c.id === Number(id)); if (elegido) setCliente({ id: elegido.id, nombre: elegido.nombre }); }}
          placeholder="Abrir estado de cuenta de un cliente…"
        />
      </div>

      <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Clientes con saldo pendiente ({resumen?.clientes_con_deuda ?? 0})</h2>
      <div className="entity-list">
        {!resumen?.deudores.length ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
            <Receipt size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
            <p>No hay saldos pendientes.</p>
          </div>
        ) : resumen.deudores.map(d => (
          <button key={d.cliente_id} type="button" className="entity-card cuenta-deudor" onClick={() => setCliente({ id: d.cliente_id, nombre: d.cliente_nombre })}>
            <div className="entity-details"><h3>{d.cliente_nombre}</h3><p>Pendiente {formatearDinero(d.saldo)}</p></div>
            {d.vencido > 0 && <span className="status-tag status-red">Vencido {formatearDinero(d.vencido)}</span>}
          </button>
        ))}
      </div>

      <Drawer isOpen={cliente !== null} onClose={() => setCliente(null)} title={cliente ? `Estado de cuenta · ${cliente.nombre}` : ''}>
        {cliente && <EstadoCuentaCliente key={cliente.id} clienteId={cliente.id} onCambio={cargar} />}
      </Drawer>
      <Drawer isOpen={verPlanes} onClose={() => setVerPlanes(false)} title="Planes">
        {verPlanes && <PlanesPanel onCambio={cargar} />}
      </Drawer>
    </div>
  );
};

export default Cobros;
