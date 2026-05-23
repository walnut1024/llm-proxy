import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';

const API_FORMATS = [
  { value: 'anthropic_messages', label: 'Anthropic Messages (Claude Desktop / Claude Code)' },
  { value: 'chat_completions', label: 'Chat Completions (OpenAI compatible)' },
  { value: 'responses', label: 'Responses API (Codex TUI)' },
];

const PROVIDER_FORMAT_MAP = {
  anthropic_messages: 'anthropic_messages',
  responses: 'chat_completions',
  chat_completions: 'chat_completions',
};

function cancel(v) {
  if (p.isCancel(v)) {
    p.cancel('Aborted');
    process.exit(0);
  }
  return v;
}

export default async function init(opts) {
  const outputPath = opts.output;

  if (fs.existsSync(outputPath)) {
    const overwrite = cancel(await p.confirm({
      message: `${outputPath} already exists. Overwrite?`,
      initialValue: false,
    }));
    if (!overwrite) {
      p.cancel('Aborted');
      return;
    }
  }

  p.intro(pc.bgCyan(pc.black(' llm-proxy config ')));

  const listenAddr = cancel(await p.text({
    message: 'Listen address',
    initialValue: '127.0.0.1:8787',
    validate: v => v.trim() ? undefined : 'Required',
  }));

  const providers = {};
  const bridges = {};

  p.log.step('Provider configuration');
  await askProvider(providers);

  p.log.step('Bridge configuration');
  await askBridge(bridges, providers);

  while (true) {
    const next = cancel(await p.select({
      message: 'Next step',
      options: [
        { value: 'bridge', label: 'Add another bridge' },
        { value: 'provider', label: 'Add provider + bridge' },
        { value: 'done', label: 'Done — write config' },
      ],
    }));

    if (next === 'done') break;

    if (next === 'provider') {
      p.log.step('New provider');
      await askProvider(providers);
    }

    p.log.step('New bridge');
    await askBridge(bridges, providers);
  }

  // Summary
  const summary = [
    `${pc.bold('Listen:')}    ${listenAddr}`,
    `${pc.bold('Bridges:')}   ${Object.keys(bridges).length}`,
    ...Object.entries(bridges).map(([name, b]) =>
      `  ${pc.cyan(name)} → ${b.provider.name}  (${Object.entries(b.models).map(([k, v]) => `${k}→${v}`).join(', ')})`
    ),
    `${pc.bold('Providers:')} ${Object.keys(providers).length}`,
    ...Object.keys(providers).map(k => `  ${pc.cyan(k)}`),
  ].join('\n');

  p.note(summary, 'Config summary');

  const confirm = cancel(await p.confirm({
    message: 'Write config?',
    initialValue: true,
  }));

  if (!confirm) {
    p.cancel('Aborted');
    return;
  }

  const toml = generateToml({ listenAddr, providers, bridges });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const s = p.spinner();
  s.start('Writing config...');
  fs.writeFileSync(outputPath, toml);
  s.stop(`Written to ${pc.cyan(outputPath)}`);

  p.outro(`Run ${pc.cyan('llm-proxy start')} to start the proxy.`);
}

const PROVIDER_PRESETS = [
  { value: 'deepseek_anthropic', label: 'DeepSeek (Anthropic)', base_url: 'https://api.deepseek.com/anthropic', api_format: 'anthropic_messages', api_key_env: 'DEEPSEEK_API_KEY' },
  { value: 'deepseek_chat', label: 'DeepSeek (Chat Completions)', base_url: 'https://api.deepseek.com', api_format: 'chat_completions', api_key_env: 'DEEPSEEK_API_KEY' },
  { value: 'glm_anthropic', label: 'GLM / Zhipu (Anthropic)', base_url: 'https://open.bigmodel.cn/api/anthropic', api_format: 'anthropic_messages', api_key_env: 'ZHIPU_API_KEY' },
  { value: '__custom__', label: 'Custom provider...' },
];

async function askProvider(providers) {
  const choice = cancel(await p.select({
    message: 'Select provider',
    options: PROVIDER_PRESETS,
  }));

  let name, config;

  if (choice === '__custom__') {
    name = cancel(await p.text({
      message: 'Provider name',
      placeholder: 'e.g. my_provider',
      validate: v => v.trim() ? undefined : 'Required',
    }));

    const baseUrl = cancel(await p.text({
      message: 'Provider base URL',
      placeholder: 'e.g. https://api.example.com/v1',
      validate: v => v.startsWith('http') ? undefined : 'Must start with http(s)://',
    }));

    const apiFormat = cancel(await p.select({
      message: 'Provider API format',
      options: API_FORMATS,
    }));

    const apiKeyEnv = cancel(await p.text({
      message: 'API key environment variable',
      placeholder: 'e.g. MY_API_KEY',
      validate: v => v.trim() ? undefined : 'Required',
    }));

    config = { base_url: baseUrl, api_format: apiFormat, api_key_env: apiKeyEnv };
  } else {
    const preset = PROVIDER_PRESETS.find(p => p.value === choice);
    name = choice;
    config = { base_url: preset.base_url, api_format: preset.api_format, api_key_env: preset.api_key_env };
  }

  if (providers[name]) {
    p.log.warn(`Provider "${name}" already exists, skipping.`);
    return;
  }

  providers[name] = config;
  p.log.success(`Provider "${pc.cyan(name)}" configured.`);
}

async function askBridge(bridges, providers) {
  const name = cancel(await p.text({
    message: 'Bridge name',
    placeholder: 'e.g. deepseek, codex',
    validate: v => v.trim() ? undefined : 'Required',
  }));

  const baseUrl = cancel(await p.text({
    message: 'Agent base URL path',
    placeholder: 'e.g. /deepseek',
    validate: v => v.startsWith('/') ? undefined : 'Must start with /',
  }));

  const agentFormat = cancel(await p.select({
    message: 'Client API format',
    options: API_FORMATS,
  }));

  const providerFormat = PROVIDER_FORMAT_MAP[agentFormat];
  p.log.info(`Provider format: ${pc.yellow(providerFormat)}`);

  const providerOpts = Object.entries(providers)
    .filter(([, v]) => v.api_format === providerFormat)
    .map(([k]) => ({ value: k, label: k }));

  let providerName;
  if (providerOpts.length > 0) {
    providerName = cancel(await p.select({
      message: 'Select provider',
      options: providerOpts,
    }));
  } else {
    p.log.warn(`No ${providerFormat} provider found. Add one first.`);
    await askProvider(providers);
    providerName = Object.keys(providers).find(k => providers[k].api_format === providerFormat);
  }

  // Model mappings
  p.log.message('Model mappings (client model → provider model):');

  const models = {};
  while (true) {
    const agentModel = cancel(await p.text({
      message: 'Client model name',
      placeholder: 'e.g. claude-sonnet',
      validate: v => v.trim() ? undefined : 'Required',
    }));

    const providerModel = cancel(await p.text({
      message: `Provider model name for "${agentModel}"`,
      placeholder: 'e.g. deepseek-v4-pro',
      validate: v => v.trim() ? undefined : 'Required',
    }));

    models[agentModel] = providerModel;

    const addMore = cancel(await p.confirm({
      message: 'Add another model mapping?',
      initialValue: true,
    }));
    if (!addMore) break;
  }

  bridges[name] = {
    agent: { base_url: baseUrl, api_format: agentFormat },
    provider: { name: providerName },
    models,
  };

  p.log.success(`Bridge "${pc.cyan(name)}" configured (${Object.keys(models).join(', ')}).`);
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
