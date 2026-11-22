import { spawn } from 'node:child_process';
import process from 'node:process';

const port = 5173;
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: process.env
});

async function waitForServer(url, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not ready yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('Vite dev server did not start in time');
}

let electron = null;
let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  try { electron?.kill('SIGTERM'); } catch { /* ignore */ }
  try { vite.kill('SIGTERM'); } catch { /* ignore */ }
  setTimeout(() => process.exit(code), 400);
}

try {
  await waitForServer(`http://127.0.0.1:${port}/`);
  electron = spawn(process.execPath, ['node_modules/electron/cli.js', '.'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: `http://127.0.0.1:${port}/`,
      GITGLANCE_DISABLE_SINGLE_INSTANCE: '1'
    }
  });
  electron.on('exit', (code) => shutdown(code ?? 0));
} catch (error) {
  console.error(error);
  shutdown(1);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
