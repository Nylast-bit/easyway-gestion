import { spawnSync, execFileSync } from 'node:child_process';
import { esArchivoProhibido } from './archivos-prohibidos.mjs';

const archivos = process.argv.slice(2).map(archivo => archivo.replaceAll('\\', '/'));
const relativos = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const prohibidos = relativos.filter(esArchivoProhibido);
if (prohibidos.length) {
  console.error('Commit bloqueado: secretos o datos privados en el índice:', prohibidos.join(', '));
  process.exit(1);
}

function ejecutar(argumentos, cwd = process.cwd()) {
  const resultado = spawnSync(process.execPath, argumentos, { stdio: 'inherit', cwd });
  if (resultado.status !== 0) process.exit(resultado.status ?? 1);
}

const codigo = archivos.filter(archivo => /\.[cm]?[jt]sx?$/.test(archivo));
if (codigo.length) ejecutar(['node_modules/oxlint/bin/oxlint', ...codigo]);
const global = relativos.some(archivo => /^(package(-lock)?\.json|tsconfig.*\.json|scripts\/|vitest\.config|packages\/shared\/)/.test(archivo));
for (const ruta of ['apps/web', 'apps/api', 'packages/shared']) {
  const afectados = codigo.filter(archivo => archivo.includes(`/${ruta}/`));
  if (!global && !afectados.length && !relativos.some(archivo => archivo.startsWith(`${ruta}/`))) continue;
  if (ruta === 'apps/web') ejecutar([`${process.cwd()}/node_modules/next/dist/bin/next`, 'typegen'], ruta);
  ejecutar(['node_modules/typescript/bin/tsc', '--noEmit', '-p', `${ruta}/tsconfig.json`]);
  const base = ['node_modules/vitest/vitest.mjs'];
  const opciones = ['--root', ruta, '--config', `${process.cwd()}/${ruta}/vitest.config.ts`];
  if (global) ejecutar([...base, 'run', ...opciones]);
  else if (afectados.length) ejecutar([...base, 'related', '--run', '--passWithNoTests', ...opciones, ...afectados]);
}
if (global) {
  ejecutar(['node_modules/typescript/bin/tsc', '-p', 'tsconfig.db.json']);
  ejecutar(['--test', 'scripts/calidad.test.mjs']);
}
