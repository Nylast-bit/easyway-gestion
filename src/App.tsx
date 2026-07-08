import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import MainLayout from './layouts/MainLayout';
import Clients from './pages/Clients';
import Technicians from './pages/Technicians';
import Vehicles from './pages/Vehicles';
import Simcards from './pages/Simcards';
import Gps from './pages/Gps';
import Dashboard from './pages/Dashboard';
import Installations from './pages/Installations';

// const PlaceholderPage: React.FC<{ title: string }> = ({ title }) => (
//   <div>
//     <h1 style={{ fontSize: '1.5rem', fontWeight: '700' }}>{title}</h1>
//     <p style={{ color: '#6b7280', marginTop: '1rem' }}>Próximamente...</p>
//   </div>
// );

const App: React.FC = () => {
  return (
    <Router>
      <Toaster position="bottom-right" />
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="clients" element={<Clients />} /> {/* CAMBIADO */}
          <Route path="technicians" element={<Technicians />} />
          <Route path="vehicles" element={<Vehicles />} />
          <Route path="gps" element={<Gps />} />
          <Route path="simcards" element={<Simcards />} />
          <Route path="installations" element={<Installations />} />
        </Route>
      </Routes>
    </Router>
  );
};

export default App;
