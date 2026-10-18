export function esArchivoProhibido(ruta) {
  const archivo = ruta.replaceAll('\\', '/');
  return (/(^|\/)\.env(?:\.|$)/i.test(archivo) && !archivo.endsWith('/.env.example') && archivo !== '.env.example') ||
    /(^|\/)backups\//i.test(archivo) ||
    (/\.xlsx$/i.test(archivo) && archivo !== 'tests/fixtures/excel-muestra.xlsx');
}
