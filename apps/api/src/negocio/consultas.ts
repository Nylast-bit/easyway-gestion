import { Hono } from 'hono';
import { asc, count, ilike, or } from 'drizzle-orm';
import type { Resumen, ResultadoBusqueda } from '@easyway/shared';
import type { BaseDatos } from '../db/cliente';
import { clientes, gps, simcards, vehiculos } from '../db/esquema';
import type { Entorno } from '../auth/middleware';

// Comodines de LIKE escapados: buscar "50%" no debe coincidir con todo.
const patron = (texto: string) => `%${texto.replace(/[\\%_]/g, caracter => `\\${caracter}`)}%`;

export function crearRutasConsultas(bd: BaseDatos) {
  return new Hono<Entorno>()
    .get('/resumen', async c => {
      const contar = async (tabla: typeof clientes | typeof vehiculos | typeof gps | typeof simcards) =>
        (await bd.select({ total: count() }).from(tabla))[0].total;
      const [cli, veh, equipos, sims] = await Promise.all([contar(clientes), contar(vehiculos), contar(gps), contar(simcards)]);
      const resumen: Resumen = { clientes: cli, vehiculos: veh, gps: equipos, simcards: sims };
      return c.json(resumen);
    })
    .get('/buscar', async c => {
      const texto = (c.req.query('q') ?? '').trim().slice(0, 100);
      if (!texto) return c.json([] as ResultadoBusqueda[]);
      const busqueda = patron(texto);
      const [cli, veh, equipos] = await Promise.all([
        bd.select({ id: clientes.id, nombre: clientes.nombre }).from(clientes).where(ilike(clientes.nombre, busqueda)).orderBy(asc(clientes.nombre)).limit(5),
        bd.select({ id: vehiculos.id, marca: vehiculos.marca, modelo: vehiculos.modelo, placa: vehiculos.placa }).from(vehiculos)
          .where(or(ilike(vehiculos.placa, busqueda), ilike(vehiculos.chasis, busqueda))).limit(5),
        bd.select({ id: gps.id, imei: gps.imei }).from(gps).where(ilike(gps.imei, busqueda)).limit(5),
      ]);
      const resultados: ResultadoBusqueda[] = [
        ...cli.map(f => ({ tipo: 'cliente' as const, id: f.id, etiqueta: f.nombre })),
        ...veh.map(f => ({ tipo: 'vehiculo' as const, id: f.id, etiqueta: `${[f.marca, f.modelo].filter(Boolean).join(' ') || 'Vehículo'} (${f.placa ?? 'S/P'})` })),
        ...equipos.map(f => ({ tipo: 'gps' as const, id: f.id, etiqueta: f.imei })),
      ];
      return c.json(resultados);
    });
}
