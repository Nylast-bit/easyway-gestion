import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as esquema from './esquema';

export type BaseDatos = PostgresJsDatabase<typeof esquema>;

// El backend usa el rol propietario: RLS sigue cerrando el acceso a roles públicos.
export function crearBaseDatos(url: string, opciones: { max?: number } = {}) {
  const cliente = postgres(url, { max: opciones.max ?? 10, connect_timeout: 10 });
  return { bd: drizzle(cliente, { schema: esquema }), cerrar: () => cliente.end() };
}
