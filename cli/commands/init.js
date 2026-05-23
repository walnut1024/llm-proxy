import fs from 'node:fs';
import path from 'node:path';
import inquirer from 'inquirer';

const API_FORMATS = [
  { name: 'Anthropic Messages (Claude Desktop, Claude Code)', value: 'anthropic_messages' },
  { name: 'Chat Completions (OpenAI compatible)', value: 'chat_completions' },
  { name: 'Responses API (Codex TUI)', value: 'responses' },
];

const PROVIDER_FORMAT_MAP = {
  anthropic_messages: 'anthropic_messages',
  responses: 'chat_completions',
  chat_completions: 'chat_completions',
};

export default async function init(opts) {
  const outputPath = opts.output;

  if (fs.existsSync(outputPath)) {
    const { overwrite } = await inquirer.prompt([{
      type: 'confirm',
      name: 'overwrite',
      message: `${outputPath} already exists. Overwrite?`,
      default: false,
    }]);
    if (!overwrite) {
      console.log('Aborted.');
      return;
    }
  }

  const { listenAddr } = await inquirer.prompt([{
    type: 'input',
    name: 'listenAddr',
    message: 'Listen address',
    default: '127.0.0.1:8787',
  }]);

  const providers = {};
  const bridges = {};

  let addBridge = true;
  while (addBridge) {
    const bridge = await askBridge(Object.keys(providers));
    bridges[bridge.name] = bridge.config;
    if (!providers[bridge.providerName]) {
      providers[bridge.providerName] = bridge.providerConfig;
    }

    const { more } = await inquirer.prompt([{
      type: 'confirm',
      name: 'more',
      message: 'Add another bridge?',
      default: false,
    }]);
    addBridge = more;
  }

  const toml = generateToml({ listenAddr, providers, bridges });
  fs.writeFileSync(outputPath, toml);
  console.log(`\nConfig written to ${outputPath}`);
  console.log('Run `llm-proxy start` to start the proxy.');
}

async function askBridge(existingProviders) {
  const { name } = await inquirer.prompt([{
    type: 'input',
    name: 'name',
    message: 'Bridge name (e.g. deepseek, codex):',
    validate: v => v.trim() ? true : 'Required',
  }]);

  const { baseUrl } = await inquirer.prompt([{
    type: 'input',
    name: 'baseUrl',
    message: 'Agent base URL path (e.g. /deepseek):',
    validate: v => v.startsWith('/') ? true : 'Must start with /',
  }]);

  const { agentFormat } = await inquirer.prompt([{
    type: 'list',
    name: 'agentFormat',
    message: 'Client API format:',
    choices: API_FORMATS,
  }]);

  const providerFormat = PROVIDER_FORMAT_MAP[agentFormat];

  let providerName;
  let providerConfig;

  if (existingProviders.length > 0) {
    const { providerChoice } = await inquirer.prompt([{
      type: 'list',
      name: 'providerChoice',
      message: 'Select provider:',
      choices: [
        ...existingProviders.map(p => ({ name: p, value: p })),
        { name: '(create new provider)', value: '__new__' },
      ],
    }]);

    if (providerChoice !== '__new__') {
      providerName = providerChoice;
      const { models } = await askModels();
      return { name, config: buildBridgeConfig(baseUrl, agentFormat, providerName, models), providerName, providerConfig: null };
    }
  }

  const provider = await askProvider(providerFormat);
  providerName = provider.name;
  providerConfig = provider.config;

  const { models } = await askModels();
  return { name, config: buildBridgeConfig(baseUrl, agentFormat, providerName, models), providerName, providerConfig };
}

async function askProvider(defaultFormat) {
  const { name, baseUrl, apiKeyEnv } = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Provider name (e.g. deepseek_anthropic):',
      validate: v => v.trim() ? true : 'Required',
    },
    {
      type: 'input',
      name: 'baseUrl',
      message: 'Provider base URL (e.g. https://api.deepseek.com):',
      validate: v => v.startsWith('http') ? true : 'Must be a URL',
    },
    {
      type: 'input',
      name: 'apiKeyEnv',
      message: 'API key environment variable name:',
      validate: v => v.trim() ? true : 'Required',
    },
  ]);

  return {
    name,
    config: {
      base_url: baseUrl,
      api_format: defaultFormat,
      api_key_env: apiKeyEnv,
    },
  };
}

async function askModels() {
  const models = {};
  let addModel = true;

  console.log('\nModel mappings (client model name -> provider model name):');

  while (addModel) {
    const { agentModel, providerModel } = await inquirer.prompt([
      {
        type: 'input',
        name: 'agentModel',
        message: 'Client model name (e.g. claude-sonnet):',
        validate: v => v.trim() ? true : 'Required',
      },
      {
        type: 'input',
        name: 'providerModel',
        message: 'Provider model name (e.g. deepseek-v4-pro):',
        validate: v => v.trim() ? true : 'Required',
      },
    ]);
    models[agentModel] = providerModel;

    const { more } = await inquirer.prompt([{
      type: 'confirm',
      name: 'more',
      message: 'Add another model mapping?',
      default: true,
    }]);
    addModel = more;
  }

  return { models };
}

function buildBridgeConfig(baseUrl, agentFormat, providerName, models) {
  return {
    agent: { base_url: baseUrl, api_format: agentFormat },
    provider: { name: providerName },
    models,
  };
}

function generateToml({ listenAddr, providers, bridges }) {
  let out = '';

  out += `[server]\n`;
  out += `listen_addr = "${listenAddr}"\n\n`;

  for (const [name, config] of Object.entries(providers)) {
    out += `[providers.${name}]\n`;
    out += `base_url = "${config.base_url}"\n`;
    out += `api_format = "${config.api_format}"\n`;
    if (config.api_key_env) {
      out += `api_key_env = "${config.api_key_env}"\n`;
    }
    out += '\n';
  }

  for (const [name, config] of Object.entries(bridges)) {
    out += `[bridges.${name}.agent]\n`;
    out += `base_url = "${config.agent.base_url}"\n`;
    out += `api_format = "${config.agent.api_format}"\n\n`;

    out += `[bridges.${name}.provider]\n`;
    out += `name = "${config.provider.name}"\n\n`;

    out += `[bridges.${name}.models]\n`;
    for (const [agent, provider] of Object.entries(config.models)) {
      out += `"${agent}" = "${provider}"\n`;
    }
    out += '\n';
  }

  return out;
}
