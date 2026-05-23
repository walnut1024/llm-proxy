import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const PID_DIR = path.join(os.tmpdir(), 'llm-proxy');
const PID_FILE = path.join(PID_DIR, 'proxy.pid');

export default async function status(opts) {
  // Check PID file
  let pidInfo = '';
  if (fs.existsSync(PID_FILE)) {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim(), 10);
    if (!isNaN(pid)) {
      try {
        process.kill(pid, 0);
        pidInfo = `Process: running (pid ${pid})`;
      } catch {
        pidInfo = `Process: not running (stale pid ${pid})`;
      }
    }
  } else {
    pidInfo = 'Process: not running';
  }

  // Check health endpoint
  const configPath = path.resolve(opts.config);
  let listenAddr = '127.0.0.1:8787';
  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, 'utf-8');
    const match = content.match(/listen_addr\s*=\s*"([^"]+)"/);
    if (match) listenAddr = match[1];
  }

  const healthUrl = `http://${listenAddr}/health`;
  try {
    const res = await httpGet(healthUrl);
    console.log(`Status:  online`);
    console.log(`Health:  ${listenAddr}/health → ${res}`);
    console.log(pidInfo);
  } catch {
    console.log(`Status:  offline`);
    console.log(`Listen:  ${listenAddr}`);
    console.log(pidInfo);
  }
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 2000 }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) resolve(body.trim());
        else reject(new Error(`HTTP ${res.statusCode}`));
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}
