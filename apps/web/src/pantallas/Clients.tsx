import React from 'react';
import { Users } from 'lucide-react';
import ListaPersonas from '../components/ListaPersonas';

const Clients: React.FC = () => <ListaPersonas titulo="Clientes" ruta="/clientes" singular="Cliente" icono={Users} />;

export default Clients;
