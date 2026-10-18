import type { Metadata } from 'next';
import Login from '../../pantallas/Login';

// oxlint-disable-next-line react/only-export-components -- exportación requerida por Next.js App Router
export const metadata: Metadata = { title: 'Iniciar sesión · Easyway GPS' };

export default function Pagina() { return <Login />; }
