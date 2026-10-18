export interface MensajeCorreo {
  para: string;
  asunto: string;
  html: string;
  texto: string;
}

export interface EnviadorCorreo {
  enviar(mensaje: MensajeCorreo): Promise<void>;
}

// Resend por HTTP: sin SDK para mantener el adaptador pequeño y simulable en pruebas.
export function crearEnviadorResend(opciones: { apiKey: string; remitente: string; fetch?: typeof fetch }): EnviadorCorreo {
  const solicitar = opciones.fetch ?? fetch;
  return {
    async enviar({ para, asunto, html, texto }) {
      const respuesta = await solicitar('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${opciones.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: opciones.remitente, to: [para], subject: asunto, html, text: texto }),
        signal: AbortSignal.timeout(10000),
      });
      // No se incluye el cuerpo de la respuesta: podría contener datos del destinatario.
      if (!respuesta.ok) throw new Error(`Resend rechazó el envío (HTTP ${respuesta.status})`);
    },
  };
}

// Solo desarrollo sin RESEND_API_KEY: muestra el texto en consola para poder probar el flujo.
export function crearEnviadorConsola(): EnviadorCorreo {
  return {
    async enviar({ para, asunto, texto }) {
      console.info(`[correo simulado] Para: ${para}\nAsunto: ${asunto}\n${texto}`);
    },
  };
}
