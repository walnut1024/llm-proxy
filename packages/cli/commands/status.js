import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import * as p from '@clack/prompts';
import pc from 'picocolors';

const PID_DIR = path.join(os.tmpdir(), 'llm-proxy');
const PID_FILE = path.join(PID_DIR, 'proxy.pid');

export default async function status(opts) {
  // PID check
  let pidStatus = pc.gray('not running');
  let pid = null;
  if (fs.existsSync(PID_FILE)) {
    pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim(), 10);
    if (!isNaN(pid)) {
      try {
        process.kill(pid, 0);
        pidStatus = pc.green(`running (pid ${pid})`);
      } catch {
        pidStatus = pc.red(`not running (stale pid ${pid})`);
        pid = null;
      }
    }
  }

  // Health check
  const configPath = path.resolve(opts.config);
  let listenAddr = '127.0.0.1:8787';
  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, 'utf-8');
    const match = content.match(/listen_addr\s*=\s*"([^"]+)"/);
    if (match) listenAddr = match[1];
  }

  let healthStatus = pc.red('offline');
  let healthBody = '';

  try {
    healthBody = await httpGet(`http://${listenAddr}/health`);
    healthStatus = pc.green('online');
  } catch {
    // offline
  }

  const lines = [
    `${pc.bold('Status:')}   ${healthStatus}`,
    `${pc.bold('Process:')}  ${pidStatus}`,
    `${pc.bold('Listen:')}   ${listenAddr}`,
  ];

  if (healthBody) {
    try {
      const data = JSON.parse(healthBody);
      if (data.uptime) lines.push(`${pc.bold('Uptime:')}   ${formatDuration(data.uptime)}`);
      if (data.requests !== undefined) lines.push(`${pc.bold('Requests:')} ${data.requests}`);
    } catch {
      // non-JSON health response
    }
  }

  p.note(lines.join('\n'), 'llm-proxy status');
}

function formatDuration(secs) {
  if (secs < 60) return `${Math.floor(secs)}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${Math.floor(secs % 60)}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
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
