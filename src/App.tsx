
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
