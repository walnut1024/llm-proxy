import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';

const i18n = {
  en: {
    langLabel: 'English',
    banner: ' llm-proxy config ',
    overwrite: (f) => `${f} already exists. Overwrite?`,
    aborted: 'Aborted',
    listenAddr: 'Listen address',
    required: 'Required',
    providerStep: 'Provider configuration',
    selectProvider: 'Select provider',
    customProvider: 'Custom provider...',
    providerName: 'Provider name',
    providerNamePh: 'e.g. my_provider',
    providerUrl: 'Provider base URL',
    providerUrlPh: 'e.g. https://api.example.com/v1',
    urlRequired: 'Must start with http(s)://',
    providerFormat: 'Provider API format',
    apiKeyEnv: 'API key environment variable',
    apiKeyEnvPh: 'e.g. MY_API_KEY',
    providerExists: (n) => `Provider "${n}" already exists, skipping.`,
    providerDone: (n) => `Provider "${n}" configured.`,
    bridgeStep: 'Bridge configuration',
    newProvider: 'New provider',
    newBridge: 'New bridge',
    bridgeName: 'Bridge name',
    bridgeNamePh: 'e.g. deepseek, codex',
    agentUrl: 'Agent base URL path',
    agentUrlPh: 'e.g. /deepseek',
    agentUrlRequired: 'Must start with /',
    agentFormat: 'Client API format',
    providerFormatInfo: (f) => `Provider format: ${f}`,
    selectBridgeProvider: 'Select provider',
    noProvider: (f) => `No ${f} provider found. Add one first.`,
    modelMappings: 'Model mappings (client model → provider model):',
    clientModel: 'Client model name',
    clientModelPh: 'e.g. claude-sonnet',
    providerModel: (m) => `Provider model name for "${m}"`,
    providerModelPh: 'e.g. deepseek-v4-pro',
    addModel: 'Add another model mapping?',
    bridgeDone: (n, models) => `Bridge "${n}" configured (${models}).`,
    nextStep: 'Next step',
    addBridge: 'Add another bridge',
    addProviderBridge: 'Add provider + bridge',
    doneWrite: 'Done — write config',
    summaryTitle: 'Config summary',
    summaryListen: 'Listen:',
    summaryBridges: 'Bridges:',
    summaryProviders: 'Providers:',
    writeConfirm: 'What next?',
    writeConfig: 'Write config',
    writing: 'Writing config...',
    written: (f) => `Written to ${f}`,
    startHint: 'Run llm-proxy start to start the proxy.',
    editListen: 'Edit listen address',
    editProvider: 'Edit provider',
    editBridge: 'Edit bridge',
    deleteProvider: 'Delete provider',
    deleteBridge: 'Delete bridge',
    deleted: (n) => `"${n}" deleted.`,
    navCancel: 'Cancel',
    navHint: 'You can go back and edit any section at any time.',
  },
  cn: {
    langLabel: '中文',
    banner: ' llm-proxy 配置 ',
    overwrite: (f) => `${f} 已存在，是否覆盖？`,
    aborted: '已取消',
    listenAddr: '监听地址',
    required: '必填',
    providerStep: 'Provider 配置',
    selectProvider: '选择 Provider',
    customProvider: '自定义 Provider...',
    providerName: 'Provider 名称',
    providerNamePh: '例如 my_provider',
    providerUrl: 'Provider API 地址',
    providerUrlPh: '例如 https://api.example.com/v1',
    urlRequired: '必须以 http(s):// 开头',
    providerFormat: 'Provider API 格式',
    apiKeyEnv: 'API Key 环境变量名',
    apiKeyEnvPh: '例如 MY_API_KEY',
    providerExists: (n) => `Provider "${n}" 已存在，跳过。`,
    providerDone: (n) => `Provider "${n}" 已配置。`,
    bridgeStep: 'Bridge 配置',
    newProvider: '新建 Provider',
    newBridge: '新建 Bridge',
    bridgeName: 'Bridge 名称',
    bridgeNamePh: '例如 deepseek、codex',
    agentUrl: 'Agent URL 路径',
    agentUrlPh: '例如 /deepseek',
    agentUrlRequired: '必须以 / 开头',
    agentFormat: '客户端 API 格式',
    providerFormatInfo: (f) => `Provider 格式: ${f}`,
    selectBridgeProvider: '选择 Provider',
    noProvider: (f) => `未找到 ${f} 格式的 Provider，请先添加。`,
    modelMappings: '模型映射（客户端模型 → Provider 模型）：',
    clientModel: '客户端模型名',
    clientModelPh: '例如 claude-sonnet',
    providerModel: (m) => `"${m}" 对应的 Provider 模型名`,
    providerModelPh: '例如 deepseek-v4-pro',
    addModel: '继续添加模型映射？',
    bridgeDone: (n, models) => `Bridge "${n}" 已配置 (${models})。`,
    nextStep: '下一步',
    addBridge: '添加另一个 Bridge',
    addProviderBridge: '添加 Provider + Bridge',
    doneWrite: '完成 — 写入配置',
    summaryTitle: '配置预览',
    summaryListen: '监听：',
    summaryBridges: 'Bridge：',
    summaryProviders: 'Provider：',
    writeConfirm: '下一步？',
    writeConfig: '写入配置',
    writing: '正在写入配置...',
    written: (f) => `已写入 ${f}`,
    startHint: '运行 llm-proxy start 启动代理。',
    editListen: '修改监听地址',
    editProvider: '修改 Provider',
    editBridge: '修改 Bridge',
    deleteProvider: '删除 Provider',
    deleteBridge: '删除 Bridge',
    deleted: (n) => `"${n}" 已删除。`,
    navCancel: '取消',
    navHint: '随时可以在菜单中回退修改任意配置项。',
  },
};

const API_FORMATS = {
  en: [
    { value: 'anthropic_messages', label: 'Anthropic Messages (Claude Desktop / Claude Code)' },
    { value: 'chat_completions', label: 'Chat Completions (OpenAI compatible)' },
    { value: 'responses', label: 'Responses API (Codex TUI)' },
  ],
  cn: [
    { value: 'anthropic_messages', label: 'Anthropic Messages（Claude Desktop / Claude Code）' },
    { value: 'chat_completions', label: 'Chat Completions（OpenAI 兼容）' },
    { value: 'responses', label: 'Responses API（Codex TUI）' },
  ],
};

const PROVIDER_FORMAT_MAP = {
  anthropic_messages: 'anthropic_messages',
  responses: 'chat_completions',
  chat_completions: 'chat_completions',
};

function cancel(v, t) {
  if (p.isCancel(v)) {
    p.cancel(t.aborted);
    process.exit(0);
  }
  return v;
}

export default async function init(opts) {
  const outputPath = opts.output;

  const lang = cancel(await p.select({
    message: 'Language / 语言',
    options: [
      { value: 'en', label: 'English' },
      { value: 'cn', label: '中文' },
    ],
  }), i18n.en);

  const t = i18n[lang];

  if (fs.existsSync(outputPath)) {
    const overwrite = cancel(await p.confirm({
      message: t.overwrite(outputPath),
      initialValue: false,
    }), t);
    if (!overwrite) {
      p.cancel(t.aborted);
      return;
    }
  }

  p.intro(pc.bgCyan(pc.black(t.banner)));
  p.log.info(pc.dim(t.navHint));

  const state = {
    listenAddr: '127.0.0.1:8787',
    providers: {},
    bridges: {},
    _returnTo: null,
  };

  // State machine: server → provider → bridge → loop → summary
  let step = 'server';

  while (step !== 'done') {
    if (step === 'server') {
      await runServer(state, t);
      step = state._returnTo || 'provider';
      state._returnTo = null;
      continue;
    }

    if (step === 'provider') {
      await askProvider(state.providers, t, lang);
      step = state._returnTo || 'bridge';
      state._returnTo = null;
      continue;
    }

    if (step.startsWith('provider:')) {
      const name = step.slice('provider:'.length);
      const existing = state.providers[name];
      if (existing) {
        delete state.providers[name];
        await askProvider(state.providers, t, lang, { name, ...existing });
      }
      step = state._returnTo || 'loop';
      state._returnTo = null;
      continue;
    }

    if (step === 'bridge') {
      await askBridge(state.bridges, state.providers, t, lang);
      step = state._returnTo || 'loop';
      state._returnTo = null;
      continue;
    }

    if (step.startsWith('bridge:')) {
      const name = step.slice('bridge:'.length);
      const existing = state.bridges[name];
      if (existing) {
        delete state.bridges[name];
        await askBridge(state.bridges, state.providers, t, lang, { name, ...existing });
      }
      step = state._returnTo || 'loop';
      state._returnTo = null;
      continue;
    }

    if (step === 'loop') {
      p.log.info(pc.dim(t.navHint));
      step = await runLoop(state, t, lang);
      continue;
    }

    if (step === 'summary') {
      step = await runSummary(state, t, lang, outputPath);
      continue;
    }
  }
}

// ── Step: server ──────────────────────────────────────────────

async function runServer(state, t) {
  state.listenAddr = cancel(await p.text({
    message: t.listenAddr,
    initialValue: state.listenAddr,
    validate: v => v.trim() ? undefined : t.required,
  }), t);
}

// ── Step: loop (next step menu with back navigation) ─────────

async function runLoop(state, t, lang) {
  const options = [
    { value: 'bridge', label: t.addBridge },
    { value: 'provider', label: t.addProviderBridge },
    ...buildEditNav(state, t),
    { value: 'summary', label: t.doneWrite },
  ];

  const next = cancel(await p.select({
    message: t.nextStep,
    options,
  }), t);

  if (next.startsWith('edit:')) {
    state._returnTo = 'loop';
    return next.slice(5);
  }
  if (next.startsWith('del_provider:')) {
    const name = next.slice('del_provider:'.length);
    delete state.providers[name];
    p.log.success(t.deleted(name));
    return 'loop';
  }
  if (next.startsWith('del_bridge:')) {
    const name = next.slice('del_bridge:'.length);
    delete state.bridges[name];
    p.log.success(t.deleted(name));
    return 'loop';
  }
  return next;
}

// ── Step: summary ─────────────────────────────────────────────

async function runSummary(state, t, lang, outputPath) {
  const summary = [
    `${pc.bold(t.summaryListen)}    ${state.listenAddr}`,
    `${pc.bold(t.summaryBridges)}   ${Object.keys(state.bridges).length}`,
    ...Object.entries(state.bridges).map(([name, b]) =>
      `  ${pc.cyan(name)} → ${b.provider.name}  (${Object.entries(b.models).map(([k, v]) => `${k}→${v}`).join(', ')})`
    ),
    `${pc.bold(t.summaryProviders)} ${Object.keys(state.providers).length}`,
    ...Object.keys(state.providers).map(k => `  ${pc.cyan(k)}`),
  ].join('\n');

  p.note(summary, t.summaryTitle);

  const options = [
    { value: 'write', label: `✓ ${t.writeConfig}` },
    ...buildEditNav(state, t),
    { value: 'cancel', label: t.navCancel },
  ];

  const action = cancel(await p.select({
    message: t.writeConfirm,
    options,
  }), t);

  if (action === 'write') {
    const toml = generateToml(state);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    const s = p.spinner();
    s.start(t.writing);
    fs.writeFileSync(outputPath, toml);
    s.stop(t.written(pc.cyan(outputPath)));

    p.outro(t.startHint);
    return 'done';
  }

  if (action === 'cancel') {
    p.cancel(t.aborted);
    return 'done';
  }

  // Navigate to edit
  if (action.startsWith('edit:')) {
    state._returnTo = 'summary';
    return action.slice(5);
  }
  if (action.startsWith('del_provider:')) {
    const name = action.slice('del_provider:'.length);
    delete state.providers[name];
    p.log.success(t.deleted(name));
    return 'summary';
  }
  if (action.startsWith('del_bridge:')) {
    const name = action.slice('del_bridge:'.length);
    delete state.bridges[name];
    p.log.success(t.deleted(name));
    return 'summary';
  }

  return action;
}

// ── Navigation helpers ────────────────────────────────────────

function buildEditNav(state, t) {
  const nav = [];
  nav.push({ value: 'edit:server', label: `← ${t.editListen}` });
  for (const name of Object.keys(state.providers)) {
    nav.push({ value: `edit:provider:${name}`, label: `← ${t.editProvider}: ${name}` });
    nav.push({ value: `del_provider:${name}`, label: `  ${t.deleteProvider}: ${name}` });
  }
  for (const name of Object.keys(state.bridges)) {
    nav.push({ value: `edit:bridge:${name}`, label: `← ${t.editBridge}: ${name}` });
    nav.push({ value: `del_bridge:${name}`, label: `  ${t.deleteBridge}: ${name}` });
  }
  return nav;
}

// ── Provider ──────────────────────────────────────────────────

function getProviderPresets(lang) {
  const custom = lang === 'cn' ? '自定义 Provider...' : 'Custom provider...';
  return [
    { value: 'deepseek_anthropic', label: 'DeepSeek (Anthropic)', base_url: 'https://api.deepseek.com/anthropic', api_format: 'anthropic_messages', api_key_env: 'DEEPSEEK_API_KEY' },
    { value: 'deepseek_chat', label: 'DeepSeek (Chat Completions)', base_url: 'https://api.deepseek.com', api_format: 'chat_completions', api_key_env: 'DEEPSEEK_API_KEY' },
    { value: 'glm_anthropic', label: 'GLM / Zhipu (Anthropic)', base_url: 'https://open.bigmodel.cn/api/anthropic', api_format: 'anthropic_messages', api_key_env: 'ZHIPU_API_KEY' },
    { value: '__custom__', label: custom },
  ];
}

async function askProvider(providers, t, lang, existing = null) {
  const presets = getProviderPresets(lang);

  const choice = cancel(await p.select({
    message: t.selectProvider,
    options: presets,
    initialValue: existing ? presets.findIndex(p => p.value === existing.name) : undefined,
  }), t);

  let name, config;

  if (choice === '__custom__') {
    name = cancel(await p.text({
      message: t.providerName,
      placeholder: t.providerNamePh,
      initialValue: existing && !presets.find(p => p.value === existing.name) ? existing.name : undefined,
      validate: v => v.trim() ? undefined : t.required,
    }), t);

    const baseUrl = cancel(await p.text({
      message: t.providerUrl,
      placeholder: t.providerUrlPh,
      initialValue: existing ? existing.base_url : undefined,
      validate: v => v.startsWith('http') ? undefined : t.urlRequired,
    }), t);

    const apiFormat = cancel(await p.select({
      message: t.providerFormat,
      options: API_FORMATS[lang],
      initialValue: existing ? API_FORMATS[lang].findIndex(f => f.value === existing.api_format) : undefined,
    }), t);

    const apiKeyEnv = cancel(await p.text({
      message: t.apiKeyEnv,
      placeholder: t.apiKeyEnvPh,
      initialValue: existing ? existing.api_key_env : undefined,
      validate: v => v.trim() ? undefined : t.required,
    }), t);

    config = { base_url: baseUrl, api_format: apiFormat, api_key_env: apiKeyEnv };
  } else {
    const preset = presets.find(p => p.value === choice);
    name = choice;
    config = { base_url: preset.base_url, api_format: preset.api_format, api_key_env: preset.api_key_env };
  }

  if (providers[name] && name !== existing?.name) {
    p.log.warn(t.providerExists(name));
    return;
  }

  providers[name] = config;
  p.log.success(t.providerDone(pc.cyan(name)));
}

// ── Bridge ────────────────────────────────────────────────────

async function askBridge(bridges, providers, t, lang, existing = null) {
  const name = cancel(await p.text({
    message: t.bridgeName,
    placeholder: t.bridgeNamePh,
    initialValue: existing ? existing.name : undefined,
    validate: v => v.trim() ? undefined : t.required,
  }), t);

  const baseUrl = cancel(await p.text({
    message: t.agentUrl,
    placeholder: t.agentUrlPh,
    initialValue: existing ? existing.agent.base_url : undefined,
    validate: v => v.startsWith('/') ? undefined : t.agentUrlRequired,
  }), t);

  const agentFormat = cancel(await p.select({
    message: t.agentFormat,
    options: API_FORMATS[lang],
    initialValue: existing ? API_FORMATS[lang].findIndex(f => f.value === existing.agent.api_format) : undefined,
  }), t);

  const providerFormat = PROVIDER_FORMAT_MAP[agentFormat];
  p.log.info(t.providerFormatInfo(pc.yellow(providerFormat)));

  const providerOpts = Object.entries(providers)
    .filter(([, v]) => v.api_format === providerFormat)
    .map(([k]) => ({ value: k, label: k }));

  let providerName;
  if (providerOpts.length > 0) {
    providerName = cancel(await p.select({
      message: t.selectBridgeProvider,
      options: providerOpts,
      initialValue: existing ? providerOpts.findIndex(o => o.value === existing.provider.name) : undefined,
    }), t);
  } else {
    p.log.warn(t.noProvider(providerFormat));
    await askProvider(providers, t, lang);
    providerName = Object.keys(providers).find(k => providers[k].api_format === providerFormat);
  }

  // Model mappings
  p.log.message(t.modelMappings);

  const models = existing ? { ...existing.models } : {};
  if (Object.keys(models).length > 0) {
    const keepModels = cancel(await p.confirm({
      message: `Keep existing ${Object.keys(models).length} model mapping(s)?`,
      initialValue: true,
    }), t);
    if (!keepModels) {
      Object.keys(models).forEach(k => delete models[k]);
    }
  }

  while (true) {
    const agentModel = cancel(await p.text({
      message: t.clientModel,
      placeholder: t.clientModelPh,
      validate: v => v.trim() ? undefined : t.required,
    }), t);

    const providerModel = cancel(await p.text({
      message: t.providerModel(agentModel),
      placeholder: t.providerModelPh,
      validate: v => v.trim() ? undefined : t.required,
    }), t);

    models[agentModel] = providerModel;

    const addMore = cancel(await p.confirm({
      message: t.addModel,
      initialValue: true,
    }), t);
    if (!addMore) break;
  }

  bridges[name] = {
    agent: { base_url: baseUrl, api_format: agentFormat },
    provider: { name: providerName },
    models,
  };

  p.log.success(t.bridgeDone(pc.cyan(name), Object.keys(models).join(', ')));
}

// ── TOML generation ───────────────────────────────────────────

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
