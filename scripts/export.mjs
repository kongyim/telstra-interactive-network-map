import { cpSync, existsSync, lstatSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'out');
const destination = resolve(root, '../kongyim.github.io/telstra');

if (!existsSync(dirname(destination))) {
  throw new Error(`GitHub Pages repository not found: ${dirname(destination)}`);
}
if (existsSync(destination) && lstatSync(destination).isSymbolicLink()) {
  throw new Error(`Export destination must be a directory, not a symbolic link: ${destination}`);
}

// basePath is embedded into Next.js bundles at build time.
const build = spawnSync(process.execPath, [resolve(root, 'node_modules/next/dist/bin/next'), 'build'], {
  cwd: root,
  env: { ...process.env, TELSTRA_BASE_PATH: '/telstra' },
  stdio: 'inherit',
});
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);
if (!existsSync(resolve(output, 'index.html'))) throw new Error('Static build did not produce out/index.html.');

writeFileSync(resolve(output, '.nojekyll'), '');
// Replace only this project's folder, after a successful build.
rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
cpSync(output, destination, { recursive: true });
console.log(`\nExported to ${destination}\nReady to review and commit in kongyim.github.io.`);
