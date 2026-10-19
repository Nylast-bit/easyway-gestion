import type { MensajeCorreo } from './enviador';

// Paleta de la aplicación (apps/web/src/styles/global.css).
const COLOR = {
  principal: '#00b494',
  principalOscuro: '#008f76',
  claro: '#d2f9f0',
  texto: '#111827',
  secundario: '#6b7280',
  borde: '#e5e7eb',
  fondo: '#f9fafb',
};

const escapar = (valor: string) => valor.replace(/[&<>"']/g, caracter =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[caracter]!);

// Maquetación con tablas y estilos en línea: es lo que Outlook, Gmail y clientes móviles respetan.
export type PropositoCodigo = 'verificar' | 'recuperar';

const TEXTOS: Record<PropositoCodigo, { titulo: string; tipo: string; explicacion: string; aviso: string }> = {
  verificar: {
    titulo: 'Verifica tu correo', tipo: 'verificación',
    explicacion: 'Introduce este código en la pantalla de inicio de sesión para confirmar que esta dirección te pertenece.',
    aviso: 'Si no intentaste iniciar sesión en Easyway GPS Gestión, ignora este mensaje; tu cuenta sigue protegida por tu contraseña.',
  },
  recuperar: {
    titulo: 'Restablece tu contraseña', tipo: 'recuperación',
    explicacion: 'Recibimos una solicitud para restablecer tu contraseña. Introduce este código en la pantalla de recuperación y elige una contraseña nueva.',
    aviso: 'Si no pediste restablecer tu contraseña, ignora este mensaje: tu contraseña actual sigue funcionando.',
  },
};

export function crearCorreoOtp(datos: { para: string; nombre: string; codigo: string; minutos: number; proposito?: PropositoCodigo }): MensajeCorreo {
  const t = TEXTOS[datos.proposito ?? 'verificar'];
  const nombre = escapar(datos.nombre.split(' ')[0] || datos.nombre);
  const casillas = [...datos.codigo].map(digito => `<td style="padding:0 4px;">
    <div style="width:44px;height:56px;line-height:56px;border-radius:10px;background:${COLOR.claro};border:1px solid ${COLOR.principal};font-family:'Courier New',Courier,monospace;font-size:28px;font-weight:700;color:${COLOR.texto};text-align:center;">${digito}</div></td>`).join('');

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${t.titulo}</title>
</head>
<body style="margin:0;padding:0;background:${COLOR.fondo};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Tu código de ${t.tipo} de Easyway GPS es ${datos.codigo}. Caduca en ${datos.minutos} minutos.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR.fondo};">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid ${COLOR.borde};border-radius:16px;overflow:hidden;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <tr><td style="background:${COLOR.principal};background-image:linear-gradient(135deg,${COLOR.principal},${COLOR.principalOscuro});padding:28px 32px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="width:40px;height:40px;border-radius:10px;background:#ffffff;text-align:center;vertical-align:middle;font-size:20px;font-weight:800;color:${COLOR.principal};">E</td>
        <td style="padding-left:12px;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:0.3px;">Easyway GPS</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:32px 32px 8px;">
      <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:${COLOR.texto};">${t.titulo}</h1>
      <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:${COLOR.texto};">Hola ${nombre},</p>
      <p style="margin:0;font-size:15px;line-height:1.6;color:${COLOR.secundario};">${t.explicacion}</p>
    </td></tr>
    <tr><td align="center" style="padding:24px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${casillas}</tr></table>
    </td></tr>
    <tr><td style="padding:0 32px 28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR.fondo};border-radius:10px;">
        <tr><td style="padding:14px 16px;font-size:13px;line-height:1.5;color:${COLOR.secundario};">
          El código caduca en <strong style="color:${COLOR.texto};">${datos.minutos} minutos</strong> y solo puede usarse una vez. Nunca te lo pediremos por teléfono ni por chat.
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:20px 32px;border-top:1px solid ${COLOR.borde};font-size:12px;line-height:1.5;color:${COLOR.secundario};">
      ${t.aviso}
    </td></tr>
  </table>
  <p style="margin:16px 0 0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:${COLOR.secundario};">Easyway GPS · República Dominicana</p>
</td></tr>
</table>
</body>
</html>`;

  const texto = [
    `Hola ${datos.nombre.split(' ')[0] || datos.nombre},`,
    '',
    `Tu código de ${t.tipo} de Easyway GPS es: ${datos.codigo}`,
    `Caduca en ${datos.minutos} minutos y solo puede usarse una vez.`,
    '',
    t.aviso,
  ].join('\n');

  return { para: datos.para, asunto: `${datos.codigo} es tu código de ${t.tipo} de Easyway GPS`, html, texto };
}
