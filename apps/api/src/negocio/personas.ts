import { Hono } from 'hono';
import { asc, desc, eq } from 'drizzle-orm';
import { esquemaCliente, esquemaPersona, type Persona } from '@easyway/shared';
import type { BaseDatos } from '../db/cliente';
import { clientes, tecnicos } from '../db/esquema';
import type { Entorno } from '../auth/middleware';
import { leerId } from '../http/erroresBd';
import { ErrorHttp, leerJson } from '../http/validacion';

const aPersona = (fila: typeof clientes.$inferSelect | typeof tecnicos.$inferSelect): Persona => ({ ...fila, created_at: fila.created_at.toISOString() });

// Clientes y técnicos comparten forma (nombre, teléfono, correo) y reglas.
export function crearRutasPersonas(bd: BaseDatos, tabla: typeof clientes | typeof tecnicos, etiqueta: string) {
  const orden = tabla === tecnicos ? asc(tabla.nombre) : desc(tabla.created_at);
  // Clientes añaden tipo, documento y notas; los técnicos solo nombre y contacto.
  const esquema = tabla === clientes ? esquemaCliente : esquemaPersona;
  return new Hono<Entorno>()
    .get('/', async c => c.json((await bd.select().from(tabla).orderBy(orden)).map(aPersona)))
    .post('/', async c => {
      const datos = await leerJson(c, esquema);
      const [fila] = await bd.insert(tabla).values(datos).returning();
      return c.json(aPersona(fila), 201);
    })
    .put('/:id', async c => {
      const id = leerId(c);
      const datos = await leerJson(c, esquema);
      const [fila] = await bd.update(tabla).set(datos).where(eq(tabla.id, id)).returning();
      if (!fila) throw new ErrorHttp(404, `${etiqueta} no encontrado`);
      return c.json(aPersona(fila));
    })
    .delete('/:id', async c => {
      const [fila] = await bd.delete(tabla).where(eq(tabla.id, leerId(c))).returning({ id: tabla.id });
      if (!fila) throw new ErrorHttp(404, `${etiqueta} no encontrado`);
      return c.body(null, 204);
    });
}
