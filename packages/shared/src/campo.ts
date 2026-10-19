import { z } from 'zod';
import { dinero } from './cobros';
import { esquemaCliente, idObligatorio, textoOpcional, tiposVehiculo, type EstadoInstalacion, type TipoVehiculo } from './entidades';
import { normalizarSim } from './importacion';

// Trabajo de campo (fase 7): el técnico registra; el administrador aprueba, fija el costo y paga.

const textoMayus = (maximo: number) => textoOpcional(maximo).transform(v => v?.toUpperCase() ?? null);

export const esquemaVehiculoPropuesto = z.object({
  marca: textoMayus(50), modelo: textoMayus(50),
  año: z.union([z.literal(''), z.null(), z.coerce.number().int().min(1950, 'Año inválido').max(2100, 'Año inválido')]).optional()
    .transform(v => (v === '' || v === undefined ? null : v)),
  placa: textoMayus(20).transform(v => v?.replace(/[\s-]/g, '') || null),
  chasis: textoMayus(30), color: textoMayus(30),
  tipo: z.enum(tiposVehiculo).default('Carro'),
}).refine(v => v.placa || v.chasis || v.marca, { message: 'Indica placa, chasis o al menos la marca del vehículo', path: ['placa'] });

export const esquemaTrabajoCampo = z.object({
  // Cliente existente (id) o propuesto; el admin puede unirlo a uno existente al aprobar.
  cliente_id: z.union([z.literal(''), z.null(), z.coerce.number().int().positive()]).optional().transform(v => (v === '' || v === undefined ? null : v)),
  cliente_nuevo: esquemaCliente.nullable().optional().transform(v => v ?? null),
  vehiculo_id: z.union([z.literal(''), z.null(), z.coerce.number().int().positive()]).optional().transform(v => (v === '' || v === undefined ? null : v)),
  vehiculo_nuevo: esquemaVehiculoPropuesto.nullable().optional().transform(v => v ?? null),
  imei: z.string().transform(v => v.replace(/\s+/g, '')).pipe(z.string().regex(/^\d{15}$/, 'El IMEI debe tener 15 dígitos')),
  sim: z.union([z.literal(''), z.null(), z.string()]).optional()
    .transform((v, ctx) => {
      if (!v) return null;
      const resultado = normalizarSim(v);
      if (!resultado.valor) { ctx.addIssue({ code: 'custom', message: 'Número de SIM inválido' }); return z.NEVER; }
      return resultado.valor;
    }),
  tipo_servicio_id: idObligatorio('un tipo de servicio'),
  fecha_instalacion: z.iso.datetime({ offset: true, error: 'Fecha y hora inválidas' }),
  notas: textoOpcional(2000),
  // Clave que genera el teléfono para cada borrador: un reenvío con la misma clave devuelve el trabajo ya creado.
  clave_idempotencia: z.uuid('Clave de envío inválida').nullable().optional().transform(v => v ?? null),
}).refine(d => Boolean(d.cliente_id) !== Boolean(d.cliente_nuevo), { message: 'Elige un cliente o registra uno nuevo', path: ['cliente_id'] })
  .refine(d => Boolean(d.vehiculo_id) !== Boolean(d.vehiculo_nuevo), { message: 'Elige un vehículo o registra uno nuevo', path: ['vehiculo_id'] })
  .refine(d => !d.vehiculo_id || d.cliente_id, { message: 'Un vehículo existente pertenece a un cliente existente', path: ['vehiculo_id'] });

export type DatosTrabajoCampo = z.output<typeof esquemaTrabajoCampo>;

/** Lo que se guarda en instalaciones.propuesta hasta la aprobación. */
export interface PropuestaCampo {
  cliente_id: number | null;
  cliente_nuevo: z.output<typeof esquemaCliente> | null;
  vehiculo_nuevo: z.output<typeof esquemaVehiculoPropuesto> | null;
  imei: string;
  sim: string | null;
}

export const esquemaAprobacion = z.object({
  costo_tecnico: dinero('Costo del técnico', { permitirCero: true }),
  // Unir lo propuesto a registros existentes (duplicados detectados por el admin).
  cliente_id: z.union([z.literal(''), z.null(), z.coerce.number().int().positive()]).optional().transform(v => (v === '' || v === undefined ? null : v)),
  vehiculo_id: z.union([z.literal(''), z.null(), z.coerce.number().int().positive()]).optional().transform(v => (v === '' || v === undefined ? null : v)),
  // Plan de cobro para el vehículo desde la fecha del trabajo (opcional).
  plan_id: z.union([z.literal(''), z.null(), z.coerce.number().int().positive()]).optional().transform(v => (v === '' || v === undefined ? null : v)),
  notas: textoOpcional(2000),
});

export const esquemaRechazo = z.object({ motivo: z.string().trim().min(3, 'Indica el motivo del rechazo').max(500) });

export const esquemaPagoCostos = z.object({
  instalacion_ids: z.array(idObligatorio('una instalación')).min(1, 'Elige al menos un trabajo').max(500),
  referencia: textoOpcional(100),
});

export const esquemaDesmarcarCosto = z.object({ motivo: z.string().trim().min(3, 'Indica el motivo').max(500) });

// Respuestas.
export interface ClienteCampo { id: number; nombre: string }
export interface VehiculoCampo { id: number; descripcion: string; placa: string | null; tipo: TipoVehiculo }

export interface TrabajoCampo {
  id: number; aprobacion: 'Pendiente' | 'Aprobada' | 'Rechazada'; estado: EstadoInstalacion; tipo: string;
  fecha_instalacion: string | null; created_at: string; motivo_rechazo: string | null; notas: string | null;
  cliente_nombre: string; vehiculo_descripcion: string; imei: string; sim: string | null;
  vehiculo_id: number | null; costo_tecnico: number | null; costo_pagado_at: string | null;
  tecnico_nombre: string | null; registrada_por_nombre: string | null;
  fotos: number;
  // Detalle para el admin al aprobar.
  propuesta: PropuestaCampo | null;
  coincidencias: { clientes: ClienteCampo[]; vehiculos: VehiculoCampo[]; gps: { id: number; estado: string; vehiculo: string | null } | null; simcard: { id: number; estado: string } | null };
}

export interface CostoTecnicoFila {
  instalacion_id: number; tecnico_id: number; tecnico_nombre: string; fecha_instalacion: string | null; tipo: string;
  cliente_nombre: string; vehiculo_descripcion: string; costo: number; pagado_at: string | null; referencia: string | null;
}

export interface ResumenCostoTecnico { tecnico_id: number; tecnico_nombre: string; trabajos: number; total: number; pagado: number; pendiente: number }
