import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, vi } from 'vitest';
import { detectarTipoImagen, validarRuta } from './almacen';
import { crearAlmacenLocal } from './local';
import { crearAlmacenSupabase } from './supabase';

test('detecta imágenes por su firma, no por la extensión', () => {
  expect(detectarTipoImagen(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0]))).toBe('image/jpeg');
  expect(detectarTipoImagen(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png');
  expect(detectarTipoImagen(new Uint8Array([...new TextEncoder().encode('RIFF'), 0, 0, 0, 0, ...new TextEncoder().encode('WEBP')]))).toBe('image/webp');
  expect(detectarTipoImagen(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
  expect(detectarTipoImagen(new TextEncoder().encode('GIF89a'))).toBeNull();
});

test('rechaza rutas con recorrido de directorios o caracteres extraños', () => {
  expect(validarRuta('vehiculos/1/abc.jpg')).toBe('vehiculos/1/abc.jpg');
  for (const ruta of ['../secreto', 'vehiculos/../../etc/passwd', '/absoluta.jpg', 'Vehiculos/A.JPG', 'a//b', 'a\\b']) {
    expect(() => validarRuta(ruta)).toThrow('Ruta de archivo inválida');
  }
});

test('almacén local: no sobrescribe, firma enlaces y los invalida al caducar o alterarse', async () => {
  let ahora = Date.parse('2026-10-18T12:00:00Z');
  const almacen = crearAlmacenLocal({ directorio: mkdtempSync(join(tmpdir(), 'easyway-local-')), reloj: () => new Date(ahora) });
  const datos = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
  await almacen.subir('vehiculos/1/a.jpg', datos, 'image/jpeg');
  await expect(almacen.subir('vehiculos/1/a.jpg', datos, 'image/jpeg')).rejects.toThrow();
  const url = (await almacen.urlsTemporales(['vehiculos/1/a.jpg'], 60)).get('vehiculos/1/a.jpg')!;
  const token = url.replace('/api/archivos/', '');
  expect(await almacen.leerFirmado!(token)).toEqual({ datos: Buffer.from(datos), tipo: 'image/jpeg' });

  const [carga, firma] = token.split('.');
  const falsa = Buffer.from(JSON.stringify({ r: 'vehiculos/2/b.jpg', e: ahora + 60_000 })).toString('base64url');
  expect(await almacen.leerFirmado!(`${falsa}.${firma}`)).toBeNull();
  expect(await almacen.leerFirmado!(carga)).toBeNull();
  ahora += 61_000;
  expect(await almacen.leerFirmado!(token)).toBeNull();

  await almacen.borrar(['vehiculos/1/a.jpg']);
  ahora -= 61_000;
  expect(await almacen.leerFirmado!(token)).toBeNull();
});

test('Supabase: sube sin sobrescribir, firma en lote y borra en el bucket privado', async () => {
  const fetch = vi.fn(async (url: string | URL | Request, opciones?: RequestInit) => {
    const ruta = String(url);
    if (ruta.includes('/object/sign/vehicles')) {
      return Response.json([{ path: 'vehiculos/1/a.jpg', signedURL: '/object/sign/vehicles/vehiculos/1/a.jpg?token=t', error: null }]);
    }
    if (opciones?.method === 'DELETE') return Response.json([{ name: 'vehiculos/1/a.jpg' }]);
    return Response.json({ Key: 'vehicles/vehiculos/1/a.jpg' });
  });
  const almacen = crearAlmacenSupabase({ url: 'https://proyecto.supabase.co', claveSecreta: 'sb_secret_prueba_0123456789', bucket: 'vehicles', fetch });

  await almacen.subir('vehiculos/1/a.jpg', new Uint8Array([1]), 'image/jpeg');
  const [urlSubida, subida] = fetch.mock.calls[0];
  expect(String(urlSubida)).toBe('https://proyecto.supabase.co/storage/v1/object/vehicles/vehiculos/1/a.jpg');
  expect(new Headers(subida?.headers).get('x-upsert')).toBe('false');
  expect(new Headers(subida?.headers).get('apikey')).toBe('sb_secret_prueba_0123456789');

  const urls = await almacen.urlsTemporales(['vehiculos/1/a.jpg'], 600);
  expect(urls.get('vehiculos/1/a.jpg')).toMatch(/^https:\/\/proyecto\.supabase\.co\/storage\/v1\/object\/sign\/vehicles\/vehiculos\/1\/a\.jpg\?token=t/);
  expect(JSON.parse(String(fetch.mock.calls[1][1]?.body))).toEqual({ expiresIn: 600, paths: ['vehiculos/1/a.jpg'] });

  await almacen.borrar(['vehiculos/1/a.jpg']);
  expect(JSON.parse(String(fetch.mock.calls[2][1]?.body))).toEqual({ prefixes: ['vehiculos/1/a.jpg'] });
  await expect(almacen.subir('../x', new Uint8Array([1]), 'image/jpeg')).rejects.toThrow('Ruta de archivo inválida');
});
