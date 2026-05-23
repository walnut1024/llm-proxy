# llm-proxy

LLM 协议转换代理。在不同 LLM API 协议之间做透明转换，让客户端无需修改即可接入任意模型后端。

## 解决什么问题

- **协议不兼容** — Claude Desktop 发 Anthropic Messages，DeepSeek 只提供 Chat Completions——llm-proxy 在中间做协议翻译
- **模型名伪装** — 客户端以为在调 `claude-sonnet`，实际请求被路由到 `deepseek-v4-pro`，对客户端完全透明
- **多提供商统一管理** — 一个配置文件定义所有 bridge 和 provider，客户端只需指向代理地址

## 支持的协议

三种 LLM API 格式：

| 协议 | 端点 | 使用者 |
|------|------|--------|
| Anthropic Messages | `/v1/messages` | Claude Desktop、Claude Code |
| Chat Completions | `/v1/chat/completions` | OpenAI 兼容客户端、大多数国产模型 |
| Responses API | `/v1/responses` | Codex TUI |

### 支持的转换

```
  Client          Protocol          llm-proxy          Protocol         Provider

┌──────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌──────────┐
│  Claude  │──►│ Anthropic  │──►│            │──►│ Anthropic  │──►│ DeepSeek │
│ Desktop  │   │ Messages   │   │  llm-proxy │   │ Messages   │   │   Zhipu  │
└──────────┘   └────────────┘   │            │   └────────────┘   └──────────┘
                                │  protocol  │
┌──────────┐   ┌────────────┐   │  convert   │   ┌────────────┐   ┌──────────┐
│  Codex   │──►│ Responses  │──►│  + model   │──►│    Chat    │──►│  OpenAI  │
│  TUI     │   │   API      │   │  mapping   │   │ Completion │   │  ...     │
└──────────┘   └────────────┘   └────────────┘   └────────────┘   └──────────┘
```

| 转换方向 | 状态 | 说明 |
|----------|------|------|
| Anthropic → Anthropic | **已接入** | 直通 + 模型名映射 |
| Anthropic → Chat Completions | 代码已完成 | 请求/响应/流式 SSE 转换均已实现，待接入管线 |
| Responses → Chat Completions | **已接入** | 请求/响应/流式 SSE 转换均已实现，含模型名映射 |
| Responses → Anthropic | 计划中 | 无直接转换代码，可通过 Responses→Chat→Anthropic 链式实现 |
| Chat Completions → Anthropic | 计划中 | 响应转换代码已有（`chat_to_anthropic`），请求转换待实现 |
| Chat Completions → Chat Completions | 计划中 | 直通 + 模型名映射，与 Anthropic→Anthropic 对称 |

## 工作原理

```
Claude Desktop
       │
       │  POST /deepseek/v1/messages
       │  {"model": "claude-sonnet", ...}
       ▼
   llm-proxy
       │  1. 路由到 bridge "deepseek"
       │  2. model: claude-sonnet → deepseek-v4-pro[1m]
       │  3. 注入 Provider API key
       │  4. 转发到上游
       ▼
   DeepSeek API (Anthropic 兼容端点)
       │  {"model": "deepseek-v4-pro[1m]", ...}
       │
       ▼
   llm-proxy
       │  model 字段自动还原: deepseek-v4-pro[1m] → claude-sonnet
       ▼
   Claude Desktop 收到响应，model 字段是 claude-sonnet
```

核心概念：

- **Provider** — 上游 LLM API（定义 base URL、协议格式、密钥来源）
- **Bridge** — 连接客户端入口和 Provider，包含协议格式和模型名映射
- **Model Mapping** — 请求中替换模型名，响应中自动还原，客户端无感知

## 快速开始

### 构建

```bash
cargo build --release
```

### 配置

创建 `proxy.toml`：

```toml
[server]
listen_addr = "127.0.0.1:8787"

[bridges.deepseek.agent]
base_url = "/deepseek"
api_format = "anthropic_messages"

[bridges.deepseek.provider]
name = "deepseek_anthropic"

[bridges.deepseek.models]
"claude-sonnet" = "deepseek-v4-pro[1m]"
"claude-haiku"  = "deepseek-v4-flash"
"claude-opus"   = "deepseek-v4-pro[1m]"

[providers.deepseek_anthropic]
base_url = "https://api.deepseek.com/anthropic"
api_format = "anthropic_messages"
api_key_env = "DEEPSEEK_API_KEY"
```

### 运行

```bash
export DEEPSEEK_API_KEY=sk-xxx
cargo run --release
# 或指定配置文件
cargo run --release -- /path/to/proxy.toml
```

### 客户端配置

以 Claude Desktop 为例，编辑 `claude_desktop_config.json`：

```json
{
  "apiUrl": "http://127.0.0.1:8787/deepseek"
}
```

## API 端点

| 路径 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/admin/status` | GET | 运行状态（RPS、延迟、错误统计） |
| `/admin/errors` | GET | 最近错误事件 |
| `/{bridge}/v1/messages` | POST | Anthropic Messages API 代理 |
| `/{bridge}/v1/models` | GET | 列出 bridge 支持的模型 |
| `/v1/models` | GET | 列出所有 bridge 的模型 |

## 模型名映射

```toml
[bridges.deepseek.models]
"claude-sonnet" = "deepseek-v4-pro[1m]"
```

- 请求到达时，`model` 字段从 `claude-sonnet` 替换为 `deepseek-v4-pro[1m]`
- 响应返回时，`model` 字段自动从 `deepseek-v4-pro[1m]` 还原为 `claude-sonnet`
- `[...]` 后缀智能匹配：`deepseek-v4-pro[1m]` 和 `deepseek-v4-pro` 都能被还原
- 未在映射表中的模型名会被拒绝

## 多 Bridge

同时配置多个 bridge，每个连接不同的 Provider：

```toml
[bridges.deepseek.agent]
base_url = "/deepseek"
api_format = "anthropic_messages"

[bridges.deepseek.provider]
name = "deepseek_anthropic"

[bridges.deepseek.models]
"claude-sonnet" = "deepseek-v4-pro[1m]"

[bridges.zhipu.agent]
base_url = "/zhipu"
api_format = "anthropic_messages"

[bridges.zhipu.provider]
name = "zhipu_anthropic"

[bridges.zhipu.models]
"claude-sonnet" = "glm-5.1"

[providers.deepseek_anthropic]
base_url = "https://api.deepseek.com/anthropic"
api_format = "anthropic_messages"
api_key_env = "DEEPSEEK_API_KEY"

[providers.zhipu_anthropic]
base_url = "https://open.bigmodel.cn/api/anthropic"
api_format = "anthropic_messages"
api_key_env = "ZHIPU_API_KEY"
```

## 认证

Provider 的 API 密钥通过环境变量注入：

```toml
[providers.deepseek]
api_key_env = "DEEPSEEK_API_KEY"
```

Anthropic 格式使用 `x-api-key` 头，Chat Completions / Responses 格式使用 `Authorization: Bearer` 头，代理自动处理。

## License

Private
