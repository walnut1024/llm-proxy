import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';
import * as p from '@clack/prompts';
import pc from 'picocolors';

function cancel(v) {
  if (p.isCancel(v)) {
    p.cancel('Aborted');
    process.exit(0);
  }
  return v;
}

export default async function start(opts) {
  const configPath = path.resolve(opts.config);

  if (!fs.existsSync(configPath)) {
    p.log.error(`Config not found: ${pc.red(configPath)}`);
    p.log.info(`Run ${pc.cyan('llm-proxy init')} to generate one.`);
    process.exit(1);
  }

  const binaryPath = opts.binary || findBinary();
  if (!binaryPath) {
    p.log.error('llm-proxy binary not found.');
    p.log.info(`Build: ${pc.cyan('cd packages/core && cargo build --release')}`);
    p.log.info(`Or specify: ${pc.cyan('--binary /path/to/llm-proxy')}`);
    process.exit(1);
  }

  if (opts.foreground) {
    return startForeground(binaryPath, configPath);
  }

  return startDaemon(binaryPath, configPath);
}

function startForeground(binaryPath, configPath) {
  p.intro(pc.bgCyan(pc.black(' llm-proxy ')));
  p.log.info(`Config: ${pc.cyan(configPath)}`);
  p.log.info('Press Ctrl+C to stop.');

  const child = spawn(binaryPath, [configPath], { stdio: 'inherit' });

  child.on('error', (err) => {
    p.log.error(`Failed to start: ${err.message}`);
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
    p.log.error(`Failed to start: ${err.message}`);
    process.exit(1);
  });

  child.unref();

  const s = p.spinner();
  s.start('Starting proxy...');

  setTimeout(() => {
    try {
      process.kill(child.pid, 0);
      s.stop('Proxy started');

      p.note(
        [
          `${pc.bold('PID:')}     ${child.pid}`,
          `${pc.bold('Config:')}  ${configPath}`,
          `${pc.bold('Log:')}     ${logPath}`,
        ].join('\n'),
        'Proxy running'
      );

      p.outro(`Run ${pc.cyan('llm-proxy stop')} to stop.`);
    } catch {
      s.stop('Proxy exited unexpectedly');
      p.log.error(`Check log: ${pc.red(logPath)}`);
      process.exit(1);
    }
  }, 500);
}

function findBinary() {
  const cliDir = path.dirname(import.meta.dirname || new URL('.', import.meta.url).pathname);

  // 1. Adjacent: ../core/target/release/llm-proxy
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
