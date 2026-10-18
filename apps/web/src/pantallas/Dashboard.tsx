import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import type { Resumen } from '@easyway/shared';
import { mensajeError, solicitarApi } from '../lib/api';
import { Users, Car, Satellite, Cpu } from 'lucide-react';

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState({
    clients: 0,
    vehicles: 0,
    gps: 0,
    simcards: 0
  });

  useEffect(() => {
    solicitarApi<Resumen>('/resumen')
      .then(r => setStats({ clients: r.clientes, vehicles: r.vehiculos, gps: r.gps, simcards: r.simcards }))
      .catch(error => toast.error(mensajeError(error, 'Error al cargar el resumen')));
  }, []);

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1.5rem' }}>Dashboard</h1>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon"><Users size={24} /></div>
          <h3>{stats.clients}</h3>
          <p>Clientes Registrados</p>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Car size={24} /></div>
          <h3>{stats.vehicles}</h3>
          <p>Vehículos Asignados</p>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Satellite size={24} /></div>
          <h3>{stats.gps}</h3>
          <p>Equipos GPS</p>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Cpu size={24} /></div>
          <h3>{stats.simcards}</h3>
          <p>Simcards en Inventario</p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
