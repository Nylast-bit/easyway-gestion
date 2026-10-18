import { z } from 'zod';

const vacios = new Set(['', '-', 'N/A', '#VALUE!', '#ERROR!']);

export function normalizarTexto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim().replace(/\s+/g, ' ');
  return vacios.has(texto.toUpperCase()) ? null : texto;
}

export function normalizarTelefono(valor: unknown): string | null {
  const texto = normalizarTexto(valor);
  if (!texto) return null;
  const digitos = texto.replace(/\D/g, '');
  const numero = digitos.length === 11 && digitos.startsWith('1') ? digitos.slice(1) : digitos;
  return /^\d{10}$/.test(numero) ? numero : null;
}

export function normalizarCorreo(valor: unknown): { valor: string | null; advertencia?: string } {
  const correo = normalizarTexto(valor)?.toLowerCase();
  if (!correo) return { valor: null };
  if (!z.email().safeParse(correo).success) return { valor: null, advertencia: 'Correo inválido' };
  return { valor: correo };
}

export function normalizarClaveNombre(valor: unknown): string | null {
  const texto = normalizarTexto(valor);
  if (!texto) return null;
  return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(?:s\.?\s*r\.?\s*l\.?|e\.?\s*i\.?\s*r\.?\s*l\.?)\s*$/g, '')
    .replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, ' ');
}

export const esquemaConexion = z.object({
  DATABASE_URL: z.string().url().refine(valor => /^postgres(?:ql)?:\/\//.test(valor), 'Debe ser una conexión PostgreSQL'),
});
