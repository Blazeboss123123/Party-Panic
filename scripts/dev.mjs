// Development: rebuild the client on change and restart the server on change.
// Works the same on Windows, macOS and Linux.
import { spawn } from 'node:child_process';

const procs = [
  spawn(process.execPath, ['build.mjs', '--watch'], { stdio: 'inherit' }),
  spawn(process.execPath, ['--watch-path=server', '--watch-path=shared', 'server/index.js'], { stdio: 'inherit' }),
];

function shutdown() {
  for (const p of procs) p.kill();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
for (const p of procs) p.on('exit', (code) => { if (code) console.error(`dev process exited with ${code}`); });
