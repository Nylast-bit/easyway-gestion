'use client';

import { createContext, useContext } from 'react';
import type { UsuarioSesion } from '@easyway/shared';

// Usuario de la sesión actual, cargado por MainLayout. null mientras se comprueba.
export const ContextoSesion = createContext<UsuarioSesion | null>(null);

export const useSesion = () => useContext(ContextoSesion);

// Rutas visibles para un técnico; el resto del portal es de administración.
export const RUTAS_TECNICO = ['/field', '/installations'];
