// Bundles the client (React + three.js + shared game code) into public/assets.
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const options = {
  entryPoints: { main: 'client/main.jsx', sandbox: 'client/dev/sandbox.jsx' },
  bundle: true,
  format: 'esm',
  target: ['es2020'],
  outdir: 'public/assets',
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  jsx: 'automatic',
  loader: { '.js': 'jsx', '.woff': 'file', '.woff2': 'file' },
  external: ['/fonts/*'],
  define: { 'process.env.NODE_ENV': watch ? '"development"' : '"production"' },
  logLevel: 'info',
  legalComments: 'none',
};

if (watch) {
  const c = await esbuild.context(options);
  await c.watch();
  console.log('Watching client sources…');
} else {
  const r = await esbuild.build({ ...options, metafile: true });
  const outs = Object.entries(r.metafile.outputs).map(([f, o]) => `${f} ${(o.bytes / 1024).toFixed(0)} KB`);
  console.log(outs.join('\n'));
}
