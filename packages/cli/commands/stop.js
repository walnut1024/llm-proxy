import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';

const PID_DIR = path.join(os.tmpdir(), 'llm-proxy');
const PID_FILE = path.join(PID_DIR, 'proxy.pid');

export default async function stop() {
  if (!fs.existsSync(PID_FILE)) {
    p.log.warn('Proxy is not running (no PID file found).');
    return;
  }

  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim(), 10);
  if (isNaN(pid)) {
    p.log.warn('Invalid PID file. Removing.');
    fs.unlinkSync(PID_FILE);
    return;
  }

  try {
    process.kill(pid, 0);
  } catch {
    p.log.warn(`Proxy (pid ${pid}) is not running. Cleaning up.`);
    fs.unlinkSync(PID_FILE);
    return;
  }

  const s = p.spinner();
  s.start(`Stopping proxy (pid ${pid})...`);

  try {
    process.kill(pid, 'SIGTERM');

    for (let i = 0; i < 50; i++) {
      await new Promise(r => setTimeout(r, 100));
      try {
        process.kill(pid, 0);
      } catch {
        s.stop('Proxy stopped');
        try { fs.unlinkSync(PID_FILE); } catch {}
        return;
      }
    }

    s.stop('Timeout, forcing...');
    process.kill(pid, 'SIGKILL');
    p.log.warn('Proxy killed (SIGKILL).');
    try { fs.unlinkSync(PID_FILE); } catch {}
  } catch (err) {
    s.stop('Failed');
    p.log.error(`Failed to stop: ${err.message}`);
    process.exit(1);
  }
}
