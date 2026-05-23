import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';

export default async function start(opts) {
  const configPath = path.resolve(opts.config);

  if (!fs.existsSync(configPath)) {
    console.error(`Config not found: ${configPath}`);
    console.error('Run `llm-proxy init` to generate one.');
    process.exit(1);
  }

  const binaryPath = opts.binary || findBinary();
  if (!binaryPath) {
    console.error('llm-proxy binary not found.');
    console.error('Build it with: cargo build --release');
    console.error('Or specify path with: --binary /path/to/llm-proxy');
    process.exit(1);
  }

  if (opts.foreground) {
    return startForeground(binaryPath, configPath);
  }

  return startDaemon(binaryPath, configPath);
}

function startForeground(binaryPath, configPath) {
  const child = spawn(binaryPath, [configPath], { stdio: 'inherit' });

  child.on('error', (err) => {
    console.error('Failed to start:', err.message);
    process.exit(1);
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });

  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));
}

function startDaemon(binaryPath, configPath) {
  const logPath = path.join(path.dirname(configPath), 'proxy.log');
  const logFd = fs.openSync(logPath, 'a');

  const child = spawn(binaryPath, [configPath], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });

  child.on('error', (err) => {
    console.error('Failed to start:', err.message);
    process.exit(1);
  });

  child.unref();

  // Give it a moment to start, then check if still alive
  setTimeout(() => {
    try {
      process.kill(child.pid, 0);
      console.log(`Proxy started (pid: ${child.pid})`);
      console.log(`Config: ${configPath}`);
      console.log(`Log:    ${logPath}`);
    } catch {
      console.error('Proxy exited immediately. Check log:', logPath);
      process.exit(1);
    }
  }, 500);
}

function findBinary() {
  // 1. Adjacent: ../core/target/release/llm-proxy
  const cliDir = path.dirname(import.meta.dirname || new URL('.', import.meta.url).pathname);
  const localBuild = path.resolve(cliDir, '..', 'core', 'target', 'release', 'llm-proxy');
  if (fs.existsSync(localBuild)) return localBuild;

  // 2. In PATH
  const pathExt = os.platform() === 'win32' ? '.exe' : '';
  for (const dir of process.env.PATH.split(path.delimiter)) {
    const candidate = path.join(dir, `llm-proxy${pathExt}`);
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}
