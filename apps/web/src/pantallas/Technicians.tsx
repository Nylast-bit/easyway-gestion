import React from 'react';
import { Wrench } from 'lucide-react';
import ListaPersonas from '../components/ListaPersonas';

const Technicians: React.FC = () => <ListaPersonas titulo="Técnicos" ruta="/tecnicos" singular="Técnico" icono={Wrench} />;

export default Technicians;
