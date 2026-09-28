# Nexus API 文档

Nexus 提供兼容多种客户端协议的 API。先在 [Nexus 控制台](https://chream.me/)创建密钥，再按所用客户端选择厂商与分组。图文操作见[使用教程](/tutorials)。

> 本文示例使用控制台当前提供的 API 地址 `https://www.chream.me`。具体可用模型和能力取决于密钥所属分组；请先查询模型列表，不要把示例中的 `MODEL_ID` 当成真实模型名。

## 开始使用

### 创建密钥

1. 登录 [Nexus 控制台](https://chream.me/)，打开左侧的 **API 密钥** 页面。
2. 点击 **创建密钥**，填写名称，选择厂商与分组。
3. 保存密钥。密钥只应保存在自己的客户端或服务端环境变量中，不要写进网页前端代码或提交到仓库。

Claude Code 通常选择 **Anthropic** 厂商；Codex 和 OpenAI 兼容客户端通常选择 **OpenAI** 厂商。分组会影响可用模型及计费，请以控制台显示的信息为准。

### 地址与认证

| 用途 | 地址 |
| --- | --- |
| 原始请求根地址 | `https://www.chream.me` |
| OpenAI SDK / Codex 的 API Base URL | `https://www.chream.me/v1` |
| Anthropic 客户端的 Base URL | `https://www.chream.me` |

下文的路径均相对于**原始请求根地址**。例如 `/v1/models` 的完整地址是 `https://www.chream.me/v1/models`，不要再重复拼接 `/v1`。

通用请求使用：

```http
Authorization: Bearer YOUR_NEXUS_API_KEY
```

Anthropic Messages 客户端也可使用 `x-api-key`；Gemini 原生客户端可使用 `x-goog-api-key`。JSON 请求还需发送 `Content-Type: application/json`。

下面的命令使用 Bash 语法，并以环境变量保存密钥：

```bash
export NEXUS_API_KEY='sk-你的密钥'
export NEXUS_BASE_URL='https://www.chream.me'
```

## 查询模型与用量

### 模型列表

```text
GET /v1/models
```

```bash
curl "$NEXUS_BASE_URL/v1/models" \
  -H "Authorization: Bearer $NEXUS_API_KEY"
```

从响应的模型 ID 中选择当前密钥可用的模型，替换下文的 `MODEL_ID`。更换分组后重新查询；不要假定不同密钥的模型列表相同。

### 用量

```text
GET /v1/usage
```

```bash
curl "$NEXUS_BASE_URL/v1/usage" \
  -H "Authorization: Bearer $NEXUS_API_KEY"
```

## OpenAI 兼容接口

使用 OpenAI 兼容客户端时，API Base URL 设为 `https://www.chream.me/v1`，密钥使用在 Nexus 创建的 API 密钥。

### Chat Completions

```text
POST /v1/chat/completions
```

```bash
curl "$NEXUS_BASE_URL/v1/chat/completions" \
  -H "Authorization: Bearer $NEXUS_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "MODEL_ID",
    "messages": [{ "role": "user", "content": "你好，请简要介绍自己。" }],
    "stream": false
  }'
```

需要流式输出时将 `stream` 改为 `true`，并在 curl 中添加 `-N`。

### Responses

Codex 等使用 Responses 协议的客户端调用：

```text
POST /v1/responses
```

```bash
curl "$NEXUS_BASE_URL/v1/responses" \
  -H "Authorization: Bearer $NEXUS_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "MODEL_ID",
    "input": "用一句话解释什么是 API。",
    "stream": false
  }'
```

客户端若要求流式响应，将 `stream` 设为 `true`。请为 Codex 选择支持 Responses 协议的模型与分组。

### 其他 OpenAI 兼容能力

部分分组和模型还可能提供 Embeddings 或图片接口：

| 能力 | 接口 |
| --- | --- |
| 文本向量 | `POST /v1/embeddings` |
| 图片生成 | `POST /v1/images/generations` |
| 图片编辑 | `POST /v1/images/edits` |

这些接口是否可用以当前密钥的模型和分组为准。不要仅凭接口路径存在就推断某个模型支持该能力。

## Anthropic Messages

Claude Code 或 Anthropic 兼容客户端使用 `https://www.chream.me` 作为 Base URL，调用：

```text
POST /v1/messages
```

```bash
curl "$NEXUS_BASE_URL/v1/messages" \
  -H "x-api-key: $NEXUS_API_KEY" \
  -H 'anthropic-version: 2023-06-01' \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "MODEL_ID",
    "max_tokens": 1024,
    "messages": [{ "role": "user", "content": "你好，请简要介绍自己。" }],
    "stream": false
  }'
```

模型名应从当前密钥可用列表中选择。需要统计输入 Token 时，可使用 `POST /v1/messages/count_tokens`，请求体包含 `model` 和 `messages`。

若希望通过界面完成 Claude Code 配置，可按[使用教程](/tutorials)将密钥导入 CC Switch。

## Gemini 原生接口

仅在密钥分组支持 Gemini 原生协议时使用此节。模型列表路径为 `GET /v1beta/models`；内容生成路径为：

```text
POST /v1beta/models/MODEL_ID:generateContent
```

```bash
curl "$NEXUS_BASE_URL/v1beta/models/MODEL_ID:generateContent" \
  -H "x-goog-api-key: $NEXUS_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "contents": [{ "role": "user", "parts": [{ "text": "你好" }] }]
  }'
```

要使用流式结果，可调用 `POST /v1beta/models/MODEL_ID:streamGenerateContent?alt=sse`。

## Codex 配置示例

Codex 使用 Responses 协议。先为 Codex 创建 **OpenAI** 厂商密钥，并确认所选模型可通过 `/v1/responses` 使用。将以下内容放在**用户级** `~/.codex/config.toml`，把 `MODEL_ID` 换成实际模型 ID：

```toml
model = "MODEL_ID"
model_provider = "nexus"

[model_providers.nexus]
name = "Nexus"
base_url = "https://www.chream.me/v1"
env_key = "NEXUS_API_KEY"
wire_api = "responses"
```

启动 Codex 前设置 `NEXUS_API_KEY` 环境变量。这里的 `env_key` 是**环境变量名**，不是密钥本身。Codex 对自定义提供商的配置要求见[官方配置参考](https://developers.openai.com/codex/config-reference)。

## 常见问题

| 现象 | 优先检查 |
| --- | --- |
| `401` / API Key 无效 | Header 是否带有正确密钥，密钥是否已启用，是否误用了其他站点的密钥。 |
| 找不到模型或模型不可用 | 重新请求 `/v1/models`，确认密钥厂商、分组与模型 ID。 |
| `404` | 检查 Base URL 与路径：SDK 配置 `/v1`，手写完整路径时不要重复 `/v1`。 |
| 流式响应异常 | 检查客户端是否支持该协议，并确认 `stream` 设置与模型能力。 |

需要配置界面步骤时，请查看[使用教程](/tutorials)。
