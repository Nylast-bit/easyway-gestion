import ExcelJS from 'exceljs';
import {
  claveTexto, interpretarVehiculo, normalizarClaveNombre, normalizarCorreo, normalizarFecha, normalizarImei, normalizarSim,
  normalizarTelefono, normalizarTexto, pareceEmpresa, separarPlacaChasis, type DatosFilaInstalacion,
} from '@easyway/shared';

// Lectura del Excel histórico. Función pura sobre el contenido del archivo: no toca la BD.
// Las columnas se localizan por su título (el Excel real tiene título en la fila 2 y cabecera en la 4).

export interface FilaLeida { hoja: string; fila: number; datos: DatosFilaInstalacion | null; advertencias: string[]; errores: string[]; omitida?: boolean }
export interface SimLeida { numero: string; fecha_compra: string | null; fecha_vencimiento: string | null }
export interface LibroLeido { hoja: string; filas: FilaLeida[]; simcards: SimLeida[] }

const COLUMNAS = {
  nombre: 'nombres', telefono: 'numero', correo: 'correo', vehiculo: 'vehiculo', placa: 'placa/ch',
  imei: 'imei', sim: 'simcard', fecha: 'fecha', tecnico: 'tecnico', plan: 'plan', asunto: 'asunto',
} as const;
type Columna = keyof typeof COLUMNAS;

// Valor plano de una celda de ExcelJS (fórmulas, texto enriquecido, hipervínculos).
function valorCelda(valor: ExcelJS.CellValue): unknown {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date || typeof valor !== 'object') return valor;
  if ('result' in valor) return valorCelda(valor.result as ExcelJS.CellValue);
  if ('richText' in valor) return valor.richText.map(t => t.text).join('');
  if ('text' in valor) return String(valor.text);
  if ('error' in valor) return null;
  return null;
}

/** Busca en las 10 primeras filas la que contiene los títulos indicados; devuelve fila y columnas. */
function localizarCabecera(hoja: ExcelJS.Worksheet, titulos: readonly string[]) {
  for (let fila = 1; fila <= Math.min(10, hoja.rowCount); fila++) {
    const indices = new Map<string, number>();
    hoja.getRow(fila).eachCell((celda, columna) => { indices.set(claveTexto(valorCelda(celda.value)), columna); });
    if (titulos.every(t => indices.has(t))) return { fila, indices };
  }
  return null;
}

export async function leerLibro(contenido: ArrayBuffer | Uint8Array): Promise<LibroLeido> {
  const libro = new ExcelJS.Workbook();
  try { await libro.xlsx.load(contenido as ArrayBuffer); }
  catch { throw new Error('El archivo no es un Excel (.xlsx) válido'); }

  const titulos = Object.values(COLUMNAS);
  // Preferencia acordada: la hoja "Data de instalaciones e cliente"; si no, la primera con esas columnas.
  const candidatas = [...libro.worksheets].sort((a, b) => Number(claveTexto(b.name).startsWith('data de instalaciones')) - Number(claveTexto(a.name).startsWith('data de instalaciones')));
  let hoja: ExcelJS.Worksheet | undefined;
  let cabecera: ReturnType<typeof localizarCabecera> = null;
  for (const candidata of candidatas) {
    cabecera = localizarCabecera(candidata, titulos);
    if (cabecera) { hoja = candidata; break; }
  }
  if (!hoja || !cabecera) throw new Error('No se encontró una hoja con las columnas Nombres, IMEI, Simcard, Fecha, Tecnico, Plan y Asunto');

  // Clientes marcados como empresa en "Listado de Clientes".
  const empresas = new Set<string>();
  const listado = libro.worksheets.find(h => claveTexto(h.name) === 'listado de clientes');
  const cabListado = listado && localizarCabecera(listado, ['nombres', 'tipo']);
  if (listado && cabListado) {
    for (let f = cabListado.fila + 1; f <= listado.rowCount; f++) {
      const fila = listado.getRow(f);
      if (claveTexto(valorCelda(fila.getCell(cabListado.indices.get('tipo')!).value)) === 'empresa') {
        const clave = normalizarClaveNombre(valorCelda(fila.getCell(cabListado.indices.get('nombres')!).value));
        if (clave) empresas.add(clave);
      }
    }
  }

  const filas: FilaLeida[] = [];
  const indice = (columna: Columna) => cabecera!.indices.get(COLUMNAS[columna])!;
  for (let numero = cabecera.fila + 1; numero <= hoja.rowCount; numero++) {
    const fila = hoja.getRow(numero);
    const celda = (columna: Columna) => valorCelda(fila.getCell(indice(columna)).value);
    const valores = (Object.keys(COLUMNAS) as Columna[]).map(celda);
    if (valores.every(v => normalizarTexto(v) === null)) continue;
    const registro: FilaLeida = { hoja: hoja.name, fila: numero, datos: null, advertencias: [], errores: [] };
    filas.push(registro);

    // Cabecera repetida dentro de los datos.
    if (claveTexto(celda('imei')) === 'imei' || (claveTexto(celda('plan')) === 'plan' && claveTexto(celda('asunto')) === 'asunto')) {
      registro.omitida = true;
      registro.advertencias.push('Fila de títulos repetida: se omite');
      continue;
    }

    const nombre = normalizarTexto(celda('nombre'));
    const clave = normalizarClaveNombre(nombre);
    if (!nombre || !clave) registro.errores.push('Fila sin nombre de cliente');

    const telefonoTexto = normalizarTexto(celda('telefono'));
    const telefono = normalizarTelefono(telefonoTexto);
    if (telefonoTexto && !telefono) registro.advertencias.push(`Teléfono no reconocido: "${telefonoTexto.slice(0, 20)}"`);
    const correo = normalizarCorreo(celda('correo'));
    if (correo.advertencia) registro.advertencias.push(correo.advertencia);

    const vehiculo = interpretarVehiculo(celda('vehiculo'));
    const placaChasis = separarPlacaChasis(celda('placa'));
    if (placaChasis.advertencia) registro.advertencias.push(placaChasis.advertencia);
    const placa = placaChasis.placa ?? vehiculo.placa;
    if (!placa && !placaChasis.chasis && !vehiculo.marca) registro.advertencias.push('Vehículo sin placa ni descripción: se identifica por el IMEI');

    const imei = normalizarImei(celda('imei'));
    if (imei.error) registro.errores.push(imei.error);
    const sim = normalizarSim(celda('sim'));
    if (sim.advertencia) registro.advertencias.push(sim.advertencia);
    const fecha = normalizarFecha(celda('fecha'));
    if (fecha.advertencia) registro.advertencias.push(fecha.advertencia === 'Sin fecha' ? 'Sin fecha: no cambia el historial de asignaciones' : fecha.advertencia);

    if (registro.errores.length) continue;
    registro.datos = {
      cliente: { nombre: nombre!, clave: clave!, telefono, correo: correo.valor, empresa: pareceEmpresa(nombre) || empresas.has(clave!) },
      vehiculo: { ...vehiculo, placa, chasis: placaChasis.chasis, descripcion: normalizarTexto(celda('vehiculo')) },
      imei: imei.valor!, sim: sim.valor, fecha: fecha.valor,
      tecnico: normalizarTexto(celda('tecnico')), plan: normalizarTexto(celda('plan')), tipo_servicio: normalizarTexto(celda('asunto')),
    };
  }

  // Hoja "Simcards": solo completa fechas de compra y vencimiento.
  const simcards: SimLeida[] = [];
  const hojaSim = libro.worksheets.find(h => claveTexto(h.name) === 'simcards');
  const cabSim = hojaSim && localizarCabecera(hojaSim, ['numero', 'fecha de compra', 'fecha vencimiento']);
  if (hojaSim && cabSim) {
    for (let f = cabSim.fila + 1; f <= hojaSim.rowCount; f++) {
      const fila = hojaSim.getRow(f);
      const numero = normalizarSim(valorCelda(fila.getCell(cabSim.indices.get('numero')!).value)).valor;
      if (!numero) continue;
      simcards.push({
        numero,
        fecha_compra: normalizarFecha(valorCelda(fila.getCell(cabSim.indices.get('fecha de compra')!).value)).valor,
        fecha_vencimiento: normalizarFecha(valorCelda(fila.getCell(cabSim.indices.get('fecha vencimiento')!).value)).valor,
      });
    }
  }
  return { hoja: hoja.name, filas, simcards };
}
