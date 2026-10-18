import {
  claveTexto, mesesPorPeriodo, normalizarClaveNombre, sumarMeses,
  type CatalogoDetectado, type ConteoImportacion, type DatosFilaInstalacion, type DecisionCatalogo, type OpcionesImportacion,
} from '@easyway/shared';

// Planificación pura de una importación: a partir de las filas normalizadas, una instantánea de
// la BD y las decisiones de catálogo, calcula todo lo que se creará. La vista previa la usa en
// seco; la confirmación la ejecuta dentro de una transacción. No inventa fechas ni técnicos.

export interface Instantanea {
  clientes: { id: number; nombre: string }[];
  vehiculos: { id: number; cliente_id: number; placa: string | null; chasis: string | null }[];
  gps: { id: number; imei: string }[];
  simcards: { id: number; numero: string }[];
  tecnicos: { id: number; nombre: string }[];
  planes: { id: number; nombre: string; activo: boolean; periodicidad: 'Mensual' | 'Anual'; precio: number }[];
  tipos: { id: number; nombre: string }[];
  vehiculosConServicio: number[];
}

export interface FilaPlanificable { id: number; fila: number; datos: DatosFilaInstalacion }
export interface SimHoja { numero: string; fecha_compra: string | null; fecha_vencimiento: string | null }

/** Referencia a un registro existente (id) o a uno que se creará (clave interna). */
export type Ref = { id: number } | { nuevo: string };

export interface PlanImportacion {
  tecnicos: { clave: string; nombre: string }[];
  planes: { clave: string; nombre: string; periodicidad: 'Mensual' | 'Anual' }[];
  tipos: { clave: string; nombre: string }[];
  clientes: { clave: string; nombre: string; telefono: string | null; correo: string | null; tipo: 'Particular' | 'Empresa' }[];
  vehiculos: { clave: string; cliente: Ref; marca: string | null; modelo: string | null; año: number | null; color: string | null; placa: string | null; chasis: string | null; tipo: 'Carro' | 'Motor' | 'Camión' | 'Otro' }[];
  gps: { clave: string; imei: string; estado: 'Disponible' | 'Instalado' | 'Retirado'; fecha_vencimiento: string | null }[];
  simcards: { clave: string; numero: string; estado: 'Disponible' | 'Asignada' | 'Vencida'; fecha_compra: string | null; fecha_vencimiento: string | null }[];
  instalaciones: { fila: number; vehiculo: Ref; gps: Ref; simcard: Ref | null; tecnico: Ref | null; tipo: Ref; fecha: string | null }[];
  asignacionesGps: { gps: Ref; vehiculo: Ref; inicio: string | null; fin: string | null }[];
  asignacionesSim: { simcard: Ref; gps: Ref; inicio: string | null; fin: string | null }[];
  servicios: { vehiculo: Ref; plan: Ref; precio: number; fecha_inicio: string; proximo_cobro: string }[];
  /** Notas por id de fila de staging (p. ej. IMEI ya existente). */
  notas: Map<number, string[]>;
  conteo: ConteoImportacion;
  existentes: { clientes: number; vehiculos: number; gps: number; simcards: number };
}

const SIN_TECNICO = new Set(['', '-', 'tecnico', 'n/a']);
const SIN_PLAN = new Set(['', '-', 'plan', 'n/a']);
const PLAN_ANUAL = new Set(['plan anual', 'anual', 'plan anual (monitoreo)']);
const SINONIMOS_TIPO: Record<string, string> = { cambio: 'cambio de equipo', asunto: 'instalacion', '': 'instalacion' };
const VIGENCIA_MESES = 12;

/** Agrupa los textos de una columna por clave y propone qué hacer con cada uno. */
export function detectarCatalogos(filas: FilaPlanificable[], instantanea: Instantanea) {
  const agrupar = (valor: (d: DatosFilaInstalacion) => string | null) => {
    const grupos = new Map<string, { textos: Map<string, number>; filas: number }>();
    for (const { datos } of filas) {
      const texto = valor(datos) ?? '';
      const clave = claveTexto(texto);
      const grupo = grupos.get(clave) ?? { textos: new Map(), filas: 0 };
      grupo.textos.set(texto, (grupo.textos.get(texto) ?? 0) + 1);
      grupo.filas++;
      grupos.set(clave, grupo);
    }
    // La grafía más frecuente representa al grupo.
    return [...grupos].map(([clave, g]) => ({ clave, texto: [...g.textos].sort((a, b) => b[1] - a[1])[0][0], filas: g.filas }))
      .sort((a, b) => b.filas - a.filas);
  };
  const buscar = <T extends { id: number; nombre: string }>(lista: T[], clave: string) => lista.find(x => claveTexto(x.nombre) === clave);

  const tecnicos: CatalogoDetectado[] = agrupar(d => d.tecnico).map(g => {
    const existente = buscar(instantanea.tecnicos, g.clave);
    const sugerencia: DecisionCatalogo = SIN_TECNICO.has(g.clave) ? { accion: 'ninguno' }
      : existente ? { accion: 'existente', id: existente.id } : { accion: 'crear', nombre: g.texto };
    return { ...g, sugerencia };
  });
  const planAnual = instantanea.planes.find(p => claveTexto(p.nombre) === 'plan anual');
  const planes: CatalogoDetectado[] = agrupar(d => d.plan).map(g => {
    const existente = buscar(instantanea.planes, g.clave);
    const sugerencia: DecisionCatalogo = SIN_PLAN.has(g.clave) ? { accion: 'ninguno' }
      : PLAN_ANUAL.has(g.clave) && planAnual ? { accion: 'existente', id: planAnual.id }
      : existente ? { accion: 'existente', id: existente.id } : { accion: 'crear', nombre: g.texto };
    return { ...g, sugerencia };
  });
  const tipos: CatalogoDetectado[] = agrupar(d => d.tipo_servicio).map(g => {
    const existente = buscar(instantanea.tipos, SINONIMOS_TIPO[g.clave] ?? g.clave);
    const sugerencia: DecisionCatalogo = existente ? { accion: 'existente', id: existente.id } : { accion: 'crear', nombre: g.texto };
    return { ...g, sugerencia };
  });
  return { tecnicos, planes, tipos };
}

export function opcionesSugeridas(catalogos: ReturnType<typeof detectarCatalogos>): OpcionesImportacion {
  const mapa = (lista: CatalogoDetectado[]) => Object.fromEntries(lista.map(c => [c.clave, c.sugerencia]));
  return { tecnicos: mapa(catalogos.tecnicos), planes: mapa(catalogos.planes), tipos: mapa(catalogos.tipos), crear_servicios: true };
}

/** Primera fecha de cobro ≥ hoy contando periodos desde el inicio: no se facturan años pasados. */
export function proximaRenovacion(inicio: string, meses: number, hoy: string) {
  let fecha = inicio;
  for (let i = 0; fecha < hoy && i < 1200; i++) fecha = sumarMeses(fecha, meses);
  return fecha;
}

export function planificar(
  filas: FilaPlanificable[], simsHoja: SimHoja[], instantanea: Instantanea, opciones: OpcionesImportacion, hoy: string,
): PlanImportacion {
  const notas = new Map<number, string[]>();
  const anotar = (id: number, nota: string) => notas.set(id, [...(notas.get(id) ?? []), nota]);

  // ---- Catálogos según las decisiones ----
  const decision = (mapa: Record<string, DecisionCatalogo>, texto: string | null): DecisionCatalogo => mapa[claveTexto(texto ?? '')] ?? { accion: 'ninguno' };
  const nuevosCatalogo = <T extends { clave: string; nombre: string }>(destino: T[], nombre: string, extra: Omit<T, 'clave' | 'nombre'>): Ref => {
    const clave = claveTexto(nombre);
    if (!destino.some(x => x.clave === clave)) destino.push({ clave, nombre, ...extra } as T);
    return { nuevo: clave };
  };
  const tecnicos: PlanImportacion['tecnicos'] = [];
  const planes: PlanImportacion['planes'] = [];
  const tipos: PlanImportacion['tipos'] = [];
  const refCatalogo = (d: DecisionCatalogo, destino: 'tecnicos' | 'planes' | 'tipos'): Ref | null => {
    if (d.accion === 'existente') return { id: d.id };
    if (d.accion === 'ninguno') return null;
    if (destino === 'tecnicos') return nuevosCatalogo(tecnicos, d.nombre, {});
    if (destino === 'tipos') return nuevosCatalogo(tipos, d.nombre, {});
    return nuevosCatalogo(planes, d.nombre, { periodicidad: claveTexto(d.nombre).includes('mensual') ? 'Mensual' : 'Anual' });
  };
  const instalacionTipo = instantanea.tipos.find(t => claveTexto(t.nombre) === 'instalacion');
  const esDesinstalacion = (ref: Ref) => {
    const nombre = 'id' in ref ? instantanea.tipos.find(t => t.id === ref.id)?.nombre : tipos.find(t => t.clave === ref.nuevo)?.nombre;
    return /desinstal|retiro/.test(claveTexto(nombre ?? ''));
  };

  // ---- Filas utilizables: IMEI existente en el sistema → se omite (la importación es de carga inicial) ----
  const gpsExistente = new Map(instantanea.gps.map(g => [g.imei, g.id]));
  const simExistente = new Map(instantanea.simcards.map(s => [s.numero, s.id]));
  const utilizables = filas.filter(f => {
    if (!gpsExistente.has(f.datos.imei)) return true;
    anotar(f.id, 'El IMEI ya existe en el sistema: fila omitida para no alterar sus datos');
    return false;
  });

  // ---- Clientes ----
  const clientesExistentes = new Map<string, number>();
  for (const c of instantanea.clientes) { const clave = normalizarClaveNombre(c.nombre); if (clave && !clientesExistentes.has(clave)) clientesExistentes.set(clave, c.id); }
  const clientes = new Map<string, PlanImportacion['clientes'][number]>();
  const refCliente = new Map<string, Ref>();
  let clientesReutilizados = 0;
  for (const { datos } of utilizables) {
    const { clave } = datos.cliente;
    if (refCliente.has(clave)) {
      const nuevo = clientes.get(clave);
      if (nuevo) {
        nuevo.telefono ??= datos.cliente.telefono;
        nuevo.correo ??= datos.cliente.correo;
        if (datos.cliente.empresa) nuevo.tipo = 'Empresa';
      }
      continue;
    }
    const existente = clientesExistentes.get(clave);
    if (existente) { refCliente.set(clave, { id: existente }); clientesReutilizados++; continue; }
    clientes.set(clave, { clave, nombre: datos.cliente.nombre, telefono: datos.cliente.telefono, correo: datos.cliente.correo, tipo: datos.cliente.empresa ? 'Empresa' : 'Particular' });
    refCliente.set(clave, { nuevo: clave });
  }

  // ---- Vehículos: por placa, chasis o, si no hay, por el IMEI que llevó ----
  const vehiculos = new Map<string, PlanImportacion['vehiculos'][number]>();
  const refVehiculo = new Map<string, Ref>();
  let vehiculosReutilizados = 0;
  const claveVehiculo = (d: DatosFilaInstalacion) => `${d.cliente.clave}|${d.vehiculo.placa ? `p:${d.vehiculo.placa}` : d.vehiculo.chasis ? `c:${d.vehiculo.chasis}` : `i:${d.imei}`}`;
  for (const { datos } of utilizables) {
    const clave = claveVehiculo(datos);
    const actual = vehiculos.get(clave);
    if (actual) {
      actual.marca ??= datos.vehiculo.marca; actual.modelo ??= datos.vehiculo.modelo; actual.año ??= datos.vehiculo.año; actual.color ??= datos.vehiculo.color;
      continue;
    }
    if (refVehiculo.has(clave)) continue;
    const cliente = refCliente.get(datos.cliente.clave)!;
    const existente = 'id' in cliente && (datos.vehiculo.placa || datos.vehiculo.chasis)
      ? instantanea.vehiculos.find(v => v.cliente_id === cliente.id && ((datos.vehiculo.placa && v.placa === datos.vehiculo.placa) || (datos.vehiculo.chasis && v.chasis === datos.vehiculo.chasis)))
      : undefined;
    if (existente) { refVehiculo.set(clave, { id: existente.id }); vehiculosReutilizados++; continue; }
    const { marca, modelo, año, color, placa, chasis, tipo } = datos.vehiculo;
    vehiculos.set(clave, { clave, cliente, marca, modelo, año, color, placa, chasis, tipo });
    refVehiculo.set(clave, { nuevo: clave });
  }

  // ---- Historial en orden cronológico: cada fila es un evento sobre su GPS y su SIM ----
  const ordenadas = [...utilizables].sort((a, b) => (a.datos.fecha ?? '9999').localeCompare(b.datos.fecha ?? '9999') || a.fila - b.fila);
  const asignacionesGps: PlanImportacion['asignacionesGps'] = [];
  const asignacionesSim: PlanImportacion['asignacionesSim'] = [];
  const gpsActual = new Map<string, { vehiculo: string; indice: number }>();
  const gpsRetirado = new Set<string>();
  const simActual = new Map<string, { imei: string; indice: number }>();
  const simDeGps = new Map<string, string>();
  const ultimaFechaGps = new Map<string, string>();
  const ultimaFechaSim = new Map<string, string>();
  const simsUsadas = new Set<string>();
  const instalaciones: PlanImportacion['instalaciones'] = [];
  const planPorVehiculo = new Map<string, { plan: Ref | null; fecha: string | null }>();

  const cerrarSim = (numero: string, fin: string | null) => {
    const actual = simActual.get(numero);
    if (!actual) return;
    asignacionesSim[actual.indice].fin = fin;
    simActual.delete(numero);
    if (simDeGps.get(actual.imei) === numero) simDeGps.delete(actual.imei);
  };

  for (const { id, fila, datos } of ordenadas) {
    const vehiculoClave = claveVehiculo(datos);
    // Un tipo de servicio es obligatorio: sin decisión se usa Instalación.
    const tipoRef = refCatalogo(decision(opciones.tipos, datos.tipo_servicio), 'tipos')
      ?? (instalacionTipo ? { id: instalacionTipo.id } : nuevosCatalogo(tipos, 'Instalación', {}));
    const tecnicoRef = refCatalogo(decision(opciones.tecnicos, datos.tecnico), 'tecnicos');
    const planRef = refCatalogo(decision(opciones.planes, datos.plan), 'planes');
    const imeiClave = datos.imei;

    let simRef: Ref | null = null;
    if (datos.sim) {
      if (simExistente.has(datos.sim)) anotar(id, 'La SIM ya existe en el sistema: se importa la instalación sin SIM');
      else { simRef = { nuevo: datos.sim }; simsUsadas.add(datos.sim); }
    }
    instalaciones.push({ fila, vehiculo: refVehiculo.get(vehiculoClave)!, gps: { nuevo: imeiClave }, simcard: simRef, tecnico: tecnicoRef, tipo: tipoRef, fecha: datos.fecha });
    planPorVehiculo.set(vehiculoClave, { plan: planRef, fecha: datos.fecha });

    // Sin fecha solo crea historial si el equipo no tiene ningún otro evento.
    const fecha = datos.fecha;
    if (!fecha && (gpsActual.has(imeiClave) || ultimaFechaGps.has(imeiClave))) continue;

    if (esDesinstalacion(tipoRef)) {
      const actual = gpsActual.get(imeiClave);
      if (actual) { asignacionesGps[actual.indice].fin = fecha; gpsActual.delete(imeiClave); }
      gpsRetirado.add(imeiClave);
      if (fecha) ultimaFechaGps.set(imeiClave, fecha);
      continue;
    }
    gpsRetirado.delete(imeiClave);
    const actual = gpsActual.get(imeiClave);
    if (!actual || actual.vehiculo !== vehiculoClave) {
      if (actual) asignacionesGps[actual.indice].fin = fecha;
      asignacionesGps.push({ gps: { nuevo: imeiClave }, vehiculo: refVehiculo.get(vehiculoClave)!, inicio: fecha, fin: null });
      gpsActual.set(imeiClave, { vehiculo: vehiculoClave, indice: asignacionesGps.length - 1 });
      if (fecha) ultimaFechaGps.set(imeiClave, fecha);
    }
    if (simRef && datos.sim) {
      const simDelGps = simDeGps.get(imeiClave);
      const ocupada = simActual.get(datos.sim);
      if (simDelGps !== datos.sim) {
        if (simDelGps) cerrarSim(simDelGps, fecha);
        if (ocupada) cerrarSim(datos.sim, fecha);
        asignacionesSim.push({ simcard: simRef, gps: { nuevo: imeiClave }, inicio: fecha, fin: null });
        simActual.set(datos.sim, { imei: imeiClave, indice: asignacionesSim.length - 1 });
        simDeGps.set(imeiClave, datos.sim);
        if (fecha) ultimaFechaSim.set(datos.sim, fecha);
      }
    }
  }

  // ---- Estado final y vencimientos (1 año desde la última instalación; SIM con la fecha de su hoja si existe) ----
  const imeis = [...new Set(utilizables.map(f => f.datos.imei))];
  const gps: PlanImportacion['gps'] = imeis.map(imei => {
    const activa = gpsActual.has(imei);
    const ultima = ultimaFechaGps.get(imei);
    return {
      clave: imei, imei, estado: activa ? 'Instalado' : gpsRetirado.has(imei) ? 'Retirado' : 'Disponible',
      fecha_vencimiento: activa && ultima ? sumarMeses(ultima, VIGENCIA_MESES) : null,
    };
  });
  const hojaPorNumero = new Map(simsHoja.map(s => [s.numero, s]));
  const numeros = [...new Set([...simsUsadas, ...simsHoja.map(s => s.numero).filter(n => !simExistente.has(n))])];
  const simcards: PlanImportacion['simcards'] = numeros.map(numero => {
    const hoja = hojaPorNumero.get(numero);
    const activa = simActual.has(numero);
    const ultima = ultimaFechaSim.get(numero);
    const vence = hoja?.fecha_vencimiento ?? (activa && ultima ? sumarMeses(ultima, VIGENCIA_MESES) : null);
    return {
      clave: numero, numero, estado: activa ? 'Asignada' : vence && vence < hoy ? 'Vencida' : 'Disponible',
      fecha_compra: hoja?.fecha_compra ?? null, fecha_vencimiento: vence,
    };
  });

  // ---- Planes de cobro: solo vehículos con GPS instalado cuyo último plan es uno activo ----
  const servicios: PlanImportacion['servicios'] = [];
  if (opciones.crear_servicios) {
    const vehiculoConGps = new Map<string, string>();
    for (const { vehiculo, indice } of gpsActual.values()) vehiculoConGps.set(vehiculo, asignacionesGps[indice].inicio ?? hoy);
    for (const [vehiculoClave, inicio] of vehiculoConGps) {
      const ref = refVehiculo.get(vehiculoClave)!;
      if ('id' in ref && instantanea.vehiculosConServicio.includes(ref.id)) continue;
      const plan = planPorVehiculo.get(vehiculoClave)?.plan;
      const existente = plan && 'id' in plan ? instantanea.planes.find(p => p.id === plan.id) : undefined;
      if (!plan || !existente?.activo) continue;
      servicios.push({ vehiculo: ref, plan, precio: existente.precio, fecha_inicio: inicio, proximo_cobro: proximaRenovacion(inicio, mesesPorPeriodo[existente.periodicidad], hoy) });
    }
  }

  return {
    tecnicos, planes, tipos, clientes: [...clientes.values()], vehiculos: [...vehiculos.values()], gps, simcards,
    instalaciones, asignacionesGps, asignacionesSim, servicios, notas,
    conteo: {
      clientes: clientes.size, vehiculos: vehiculos.size, gps: gps.length, simcards: simcards.length, instalaciones: instalaciones.length,
      tecnicos: tecnicos.length, planes: planes.length, tipos_servicio: tipos.length, servicios: servicios.length,
      asignaciones_gps: asignacionesGps.length, asignaciones_sim: asignacionesSim.length,
    },
    existentes: { clientes: clientesReutilizados, vehiculos: vehiculosReutilizados, gps: new Set(filas.filter(f => gpsExistente.has(f.datos.imei)).map(f => f.datos.imei)).size, simcards: [...new Set(filas.map(f => f.datos.sim).filter(s => s && simExistente.has(s)))].length },
  };
}
