import { conectar, informarError } from './conexion.js';

// Solo inspección de metadatos: las operaciones de archivos usarán la API de Storage.
try {
  const cliente = conectar();
  try {
    await cliente.begin('read only', async (consulta) => {
      const buckets = await consulta`
        SELECT id, name, public FROM storage.buckets WHERE id = 'vehicles'
      `;
      if (buckets.length !== 1) throw new Error('No existe el bucket vehicles');
      console.log(JSON.stringify({ bucket: buckets[0] }, null, 2));
      if (buckets[0].public) {
        console.error('El bucket vehicles es público; cambiarlo a privado para las fotos autorizadas.');
        process.exitCode = 1;
      }
    });
  } finally { await cliente.end(); }
} catch (error) { informarError(error); }
