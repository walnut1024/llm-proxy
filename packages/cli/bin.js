#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';

const defaultConfig = path.join(os.homedir(), '.llm-proxy', 'proxy.toml');

const program = new Command();

program
  .name('llm-proxy')
  .description('LLM protocol conversion proxy')
  .version('0.1.0');

program.command('init')
  .description('Generate proxy config interactively')
  .option('-o, --output <path>', 'Output config file path', defaultConfig)
  .action(async (opts) => {
    const { default: init } = await import('./commands/init.js');
    return init(opts);
  });

program.command('start')
  .description('Start the proxy')
  .option('-c, --config <path>', 'Config file path', defaultConfig)
  .option('--binary <path>', 'Path to llm-proxy binary')
  .option('-f, --foreground', 'Run in foreground')
  .action(async (opts) => {
    const { default: start } = await import('./commands/start.js');
    return start(opts);
  });

program.command('stop')
  .description('Stop the proxy')
  .action(async () => {
    const { default: stop } = await import('./commands/stop.js');
    return stop();
  });

program.command('status')
  .description('Check proxy status')
  .option('-c, --config <path>', 'Config file path', defaultConfig)
  .action(async (opts) => {
    const { default: status } = await import('./commands/status.js');
    return status(opts);
  });

program.parse();
