import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PID_DIR = path.join(os.tmpdir(), 'llm-proxy');
const PID_FILE = path.join(PID_DIR, 'proxy.pid');

export default async function stop() {
  if (!fs.existsSync(PID_FILE)) {
    console.log('Proxy is not running (no PID file found).');
    return;
  }

  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim(), 10);
  if (isNaN(pid)) {
    console.error('Invalid PID file. Removing.');
    fs.unlinkSync(PID_FILE);
    return;
  }

  try {
    process.kill(pid, 0);
  } catch {
    console.log(`Proxy (pid ${pid}) is not running. Cleaning up PID file.`);
    fs.unlinkSync(PID_FILE);
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
    console.log(`Sent SIGTERM to proxy (pid ${pid}).`);

    // Wait for process to exit (max 5s)
    for (let i = 0; i < 50; i++) {
      await new Promise(r => setTimeout(r, 100));
      try {
        process.kill(pid, 0);
      } catch {
        console.log('Proxy stopped.');
        try { fs.unlinkSync(PID_FILE); } catch {}
        return;
      }
    }

    console.log('Proxy did not exit in 5s, sending SIGKILL...');
    process.kill(pid, 'SIGKILL');
    console.log('Proxy killed.');
    try { fs.unlinkSync(PID_FILE); } catch {}
  } catch (err) {
    console.error(`Failed to stop: ${err.message}`);
    process.exit(1);
  }
}
