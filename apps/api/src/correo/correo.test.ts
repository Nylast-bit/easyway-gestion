import { expect, test, vi } from 'vitest';
import { crearEnviadorResend } from './enviador';
import { crearCorreoOtp } from './plantillaOtp';

test('plantilla OTP: colores de la marca, código, caducidad y nombre escapado', () => {
  const correo = crearCorreoOtp({ para: 'ana@ejemplo.do', nombre: '<b>Ana</b> Pérez', codigo: '048213', minutos: 10 });
  expect(correo.asunto).toBe('048213 es tu código de verificación de Easyway GPS');
  expect(correo.html).toContain('#00b494');
  expect(correo.html).toContain('10 minutos');
  expect(correo.html).toContain('&lt;b&gt;Ana&lt;/b&gt;');
  expect(correo.html).not.toContain('<b>Ana</b>');
  expect([...correo.html.matchAll(/>(\d)<\/div>/g)].map(m => m[1]).join('')).toBe('048213');
  expect(correo.texto).toContain('048213');
});

test('Resend: envía JSON autenticado y no expone la respuesta al fallar', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 200 }))
    .mockResolvedValueOnce(new Response('{"message":"dato privado"}', { status: 422 }));
  const enviador = crearEnviadorResend({ apiKey: 're_prueba', remitente: 'Easyway <no-reply@ejemplo.do>', fetch });
  const mensaje = { para: 'ana@ejemplo.do', asunto: 'Asunto', html: '<p>Hola</p>', texto: 'Hola' };
  await enviador.enviar(mensaje);
  const [url, opciones] = fetch.mock.calls[0];
  expect(url).toBe('https://api.resend.com/emails');
  expect(opciones.headers.Authorization).toBe('Bearer re_prueba');
  expect(JSON.parse(opciones.body)).toEqual({ from: 'Easyway <no-reply@ejemplo.do>', to: ['ana@ejemplo.do'], subject: 'Asunto', html: '<p>Hola</p>', text: 'Hola' });
  const error = await enviador.enviar(mensaje).catch((e: Error) => e);
  expect((error as Error).message).toBe('Resend rechazó el envío (HTTP 422)');
});
