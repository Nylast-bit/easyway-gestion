// Hook PostToolUse (Edit|Write) de Claude Code: tras editar UI web, recuerda validar
// las pantallas con capturas en cuatro tamaños. Solo informa; nunca bloquea.
let entrada = '';
for await (const trozo of process.stdin) entrada += trozo;

let ruta = '';
try {
  const datos = JSON.parse(entrada);
  ruta = String(datos.tool_input?.file_path ?? datos.tool_response?.filePath ?? '').replaceAll('\\', '/');
} catch { process.exit(0); }

const esUi = /\/apps\/web\/src\/.+\.(tsx|css)$/.test(ruta) || ruta.endsWith('/e2e/capturas.spec.ts');
if (!esUi) process.exit(0);

console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PostToolUse',
    additionalContext: 'Cambio de UI detectado (' + ruta.split('/').slice(-2).join('/') + '). Antes de terminar: ejecutar `npm run test:capturas`, '
      + 'abrir con Read las capturas de capturas/{movil,tablet,laptop,pc}/ de las pantallas afectadas y corregir lo que se vea mal. '
      + 'Si es una pantalla, panel o modal nuevo, añadirlo a e2e/capturas.spec.ts con datos de textos largos.',
  },
}));
