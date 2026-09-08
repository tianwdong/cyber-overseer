import { build } from 'esbuild';
import { mkdir, copyFile, cp } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await copyFile('src/main/cli/launcher.py','dist/cli-launcher.py');
await mkdir('dist/assets/icon',{recursive:true});
await Promise.all(['icon.png','icon.ico'].map(name=>copyFile(`assets/icon/${name}`,`dist/assets/icon/${name}`)));
await cp('assets/characters','dist/assets/characters',{recursive:true});
await Promise.all([
  build({ entryPoints: ['src/main/main.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: 'dist/main.cjs', external: ['electron'] }),
  build({ entryPoints: ['src/main/watch-cli.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: 'dist/watch.cjs' }),
  build({ entryPoints: ['src/main/preload.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: 'dist/preload.cjs', external: ['electron'] }),
  build({ entryPoints: ['src/renderer/dashboard.ts', 'src/renderer/overlay.ts'], bundle: true, platform: 'browser', outdir: 'dist' }),
  ...['dashboard.html', 'overlay.html', 'style.css'].map(f => copyFile(`src/renderer/${f}`, `dist/${f}`)),
]);
