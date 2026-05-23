#!/usr/bin/env node
import { Command } from 'commander';
import init from './commands/init.js';
import start from './commands/start.js';
import stop from './commands/stop.js';
import status from './commands/status.js';

const program = new Command();

program
  .name('llm-proxy')
  .description('LLM protocol conversion proxy')
  .version('0.1.0');

program.command('init')
  .description('Generate proxy config interactively')
  .option('-o, --output <path>', 'Output config file path', 'proxy.toml')
  .action(init);

program.command('start')
  .description('Start the proxy')
  .option('-c, --config <path>', 'Config file path', 'proxy.toml')
  .option('--binary <path>', 'Path to llm-proxy binary')
  .option('-f, --foreground', 'Run in foreground')
  .action(start);

program.command('stop')
  .description('Stop the proxy')
  .action(stop);

program.command('status')
  .description('Check proxy status')
  .option('-c, --config <path>', 'Config file path', 'proxy.toml')
  .action(status);

program.parse();
