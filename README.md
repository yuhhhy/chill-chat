# chill-chat

一个基于 React + Node.js 的本地 AI 对话应用。它不是简单的“套壳聊天页”：项目围绕流式对话体验做了比较完整的工程化拆分，包括多模型供应商适配、可重连 SSE 生成任务、节奏化打字机渲染、会话持久化、暂停后 partial 内容保留、reasoning 内容展示、文件输入和语音输入。

## 功能特点

- 多模型供应商：ChatGPT、Gemini、DeepSeek、Claude
- 流式回复：基于 SSE、`ReadableStream` 和 `TextDecoder` 增量接收模型输出
- 可重连生成任务：使用 `runId + event id` 让前端短线断开后继续补发事件
- 节奏化渲染：网络接收速度和页面显示速度解耦，避免 chunk 抖动直接影响 UI
- 会话持久化：保留历史会话、消息内容、推理内容和生成状态
- 暂停生成：主动中断后保留已生成内容，切换 session 后仍可恢复 partial 回答
- Reasoning 展示：支持把推理内容和最终回答分开展示
- 文件输入：支持 TXT/MD 文件读取并拼入用户消息
- 语音输入：使用浏览器 SpeechRecognition 能力
- Markdown 渲染：支持 GFM、代码高亮和 HTML 渲染
- 设置面板：支持模型选择、上下文轮数、主题切换

## 技术栈

### 前端

- React 18
- Vite 5
- React Context
- React Virtuoso
- React Markdown
- rehype-highlight / rehype-raw / remark-gfm

### 后端

- Node.js ESM
- 原生 `http` / `https`
- better-sqlite3
- Server-Sent Events
- OpenAI-compatible Chat Completions
- Google Gemini streaming API
- Anthropic Claude Messages API

## 快速开始

### 环境要求

项目声明的运行环境：

```text
Node.js 24.15.0
npm >= 10
```

如果使用 nvm：

```bash
nvm use
```

### 安装依赖

```bash
npm install
```

如果 `better-sqlite3` 的 native binding 与当前 Node 版本不匹配：

```bash
npm run rebuild:native
```

### 配置环境变量

```bash
cp .env.example .env
```

按需填写你要使用的模型供应商：

```env
PORT=3001

CHATGPT_API_URL=https://api.openai.com/v1/chat/completions
CHATGPT_API_TYPE=openai
CHATGPT_API_KEY=your_chatgpt_api_key_here
CHATGPT_MODEL=gpt-4o-mini

GEMINI_API_URL=https://generativelanguage.googleapis.com/v1beta/models
GEMINI_API_TYPE=gemini
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash

DEEPSEEK_API_URL=https://api.deepseek.com/v1/chat/completions
DEEPSEEK_API_TYPE=openai
DEEPSEEK_API_KEY=your_deepseek_api_key_here
DEEPSEEK_MODEL=deepseek-v4-flash

CLAUDE_API_URL=https://api.anthropic.com/v1/messages
CLAUDE_API_TYPE=claude
CLAUDE_API_KEY=your_claude_api_key_here
CLAUDE_MODEL=claude-3-5-haiku-latest
CLAUDE_API_VERSION=2023-06-01

EMBEDDING_API_URL=https://api.openai.com/v1/embeddings
EMBEDDING_API_KEY=your_embedding_api_key_here
EMBEDDING_MODEL=text-embedding-3-small

CUSTOM_MODELS=[]
```

默认前端模型是 DeepSeek。只使用某一个供应商时，只需要配置对应的 `*_API_KEY` 和 `*_MODEL`。
也可以在“模型设置”里添加自定义模型，自定义模型会以 OpenAI-compatible Chat Completions 格式调用，并写入 `.env` 的 `CUSTOM_MODELS`。API 地址只需要填到 `/v1`，应用会自动补全 `/chat/completions`；已填写完整路径也兼容。

### 启动

同时启动前后端：

```bash
npm run start
```

或者分开启动：

```bash
npm run server
npm run dev
```

默认地址：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:3001`
- 健康检查：`http://localhost:3001/health`

### 构建

```bash
npm run build
```

构建产物输出到 `dist/`。

## 常用脚本

```bash
npm run start           # rebuild native 依赖，并同时启动 server + Vite
npm run dev             # 启动 Vite 开发服务器
npm run server          # 启动 Node 后端
npm run build           # 构建前端产物
npm run preview         # 预览构建产物
npm run rebuild:native  # 重建 better-sqlite3 native binding
npm run lint            # 运行 ESLint
```

## 项目结构

```text
.
├── server.js                         # 后端入口，委托到 server/index.js
├── server/
│   ├── index.js                      # HTTP 路由入口
│   ├── db.js                         # 本地持久化模块
│   ├── handlers/
│   │   ├── chat.js                   # 旧版直接 SSE chat 接口
│   │   ├── chatRuns.js               # 可重连生成任务接口
│   │   ├── messages.js               # 消息读写
│   │   └── sessions.js               # 会话读写
│   ├── providers/
│   │   ├── deepseek.js               # 历史 provider 文件
│   │   └── modelProviders.js         # 多供应商统一流式适配
│   └── runs/
│       └── runManager.js             # runId、事件缓存、SSE 订阅与补发
├── src/
│   ├── api/                          # 前端请求封装
│   ├── assets/                       # 图标与静态资源
│   ├── components/                   # UI 组件
│   ├── config/modelProviders.js      # 前端模型选项配置
│   ├── context/Context.jsx           # 全局上下文
│   ├── hooks/                        # 会话、聊天、文件、语音 hooks
│   └── services/streamParser.js      # SSE 解析、重连、打字机缓冲
├── docs/                             # 历史文档和结构说明
├── tests/                            # Playwright 测试
├── .env.example                      # 环境变量示例
├── package.json
└── vite.config.js
```

## 核心设计

项目的核心是流式对话体验。这里分成三层：

### 1. 网络与生成任务层

前端不会直接把一次流式请求当成唯一事实来源，而是先创建一个生成任务：

```text
创建生成任务
  -> 返回 runId
  -> 后端开始请求模型上游
```

后端 `runManager` 维护运行中的任务：

```js
{
  id,
  provider,
  status: 'running' | 'completed' | 'failed' | 'cancelled',
  events: [
    { id: 1, type: 'delta', data: { type: 'content', content: '...' } },
    { id: 2, type: 'done', data: {} }
  ],
  subscribers,
  upstream,
  createdAt,
  updatedAt
}
```

这样“生成任务”和“浏览器当前这条 SSE 连接”被拆开了：连接可以断，但 run 还在，事件也还在。

### 2. SSE 解析与补发层

前端订阅：

```text
订阅 run 事件流，并携带 lastEventId
```

后端每个事件都写入 event log，并以标准 SSE 格式发送：

```text
id: 12
event: delta
data: {"type":"content","content":"你好"}
```

如果连接短暂断开，`StreamParser` 会记录最后收到的 `event id`，然后用指数退避重新请求：

```text
使用 lastEventId 重新订阅 run 事件流
```

后端会先补发 `id > 12` 的历史事件，再继续实时推送。这个机制解决的是“前端到后端连接短线”的恢复。

需要注意：如果模型上游本身已经断了，不能真正从模型的第 N 个 token 继续拉同一条流。当前项目不会做自动续写，而是进入失败或中断状态，把已经收到的内容保留下来。

### 3. 渲染节奏层

网络 chunk 的到达是不稳定的：有时很快，有时停顿，有时一个 chunk 包含很多字符。项目没有直接把网络 chunk 立即渲染到页面，而是放入 `renderQueue`：

```text
SSE delta
  -> renderQueue
  -> setInterval flush
  -> onChunk
  -> React state
  -> UI
```

`StreamParser.flushChunk()` 会根据当前积压字符数动态决定每次 flush 的大小：

```js
const pendingChars = this.renderQueue.reduce((sum, item) => sum + item.content.length, 0);
const chunkSize = Math.max(12, Math.ceil(pendingChars / 20));
```

这让渲染有“逐步输出”的感觉，同时避免大块文本突然跳出来。

## 数据流

### 正常生成

```text
用户输入
  -> 持久化用户消息
  -> 创建生成任务
  -> runManager.startRun()
  -> provider stream
  -> run events
  -> browser subscribes events
  -> StreamParser renderQueue
  -> React messages state
  -> done
  -> 持久化 assistant 消息
```

### 断线重连

```text
前端已收到 event id = 8
  -> SSE 连接异常断开
  -> waitForReconnect()
  -> 使用 event id = 8 重新订阅
  -> 后端补发 9, 10, 11...
  -> 前端继续渲染
```

### 主动暂停

```text
用户点击暂停
  -> 取消当前生成任务
  -> parser.abort()
  -> flushAll()
  -> 状态变为 aborted
  -> 保留 partial assistant message
```

这里有一个重要细节：暂停时需要先 flush 已接收但尚未显示的渲染队列，再关闭 `onChunk`，否则异步 chunk 可能把刚设置的 `aborted` 状态覆盖回 `generating`。

## 为什么使用 TextDecoder

模型输出中经常包含中文、emoji 或其他多字节字符。浏览器从 `ReadableStream` 读到的是字节 chunk，一个字符可能被拆在两个 chunk 中。

所以项目使用：

```js
new TextDecoder('utf-8', { stream: true });
```

并在每次读取时：

```js
this.textDecoder.decode(value, { stream: true });
```

这样 `TextDecoder` 会保留未完成的字节序列，等下一段 chunk 到来后再完整解码，避免乱码。

## 为什么不用 WebSocket

这个项目的模型生成流主要是单向的：

```text
client -> server: 创建任务 / 取消任务
server -> client: 持续推送 token
```

SSE 更贴合这个模式：

- 浏览器原生支持事件流格式
- 与 HTTP 代理、网关、日志链路更兼容
- 调试成本低，可以直接用普通 HTTP 工具观察
- 语义上就是服务端向客户端持续推送事件

项目没有直接使用 `EventSource`，因为创建生成任务需要携带请求体；实际实现是 `fetch + ReadableStream` 手动解析 SSE，因此可以更精细地控制重连、取消、缓冲和错误处理。

## 多模型适配

后端统一把不同供应商转换成 OpenAI-style delta：

```json
{
  "choices": [
    {
      "delta": {
        "content": "..."
      }
    }
  ]
}
```

当前供应商处理方式：

- ChatGPT / DeepSeek：OpenAI-compatible，直接请求 `/v1/chat/completions`
- Gemini：请求 `streamGenerateContent?alt=sse`，再把 `candidates[].content.parts[].text` 转成 delta
- Claude：请求 Anthropic Messages API，把 `content_block_delta` 转成 delta

provider 的核心入口在：

```text
server/providers/modelProviders.js
```

前端模型展示配置在：

```text
src/config/modelProviders.js
```

## 调整流式体验

核心文件：

```text
src/services/streamParser.js
```

可调整的点：

- `waitForReconnect()`：重连退避时间和最大重试次数
- `startFlush()`：渲染 flush 间隔
- `flushChunk()`：每次 flush 的字符数策略
- `markStreamDone()`：流结束后等待渲染队列自然排空

当前设计倾向是：网络尽量快地收，UI 稳定地吐。

## 测试

构建：

```bash
npm run build
```

Playwright：

```bash
npx playwright test
```

运行 Playwright 前需要确保：

- 后端服务正在运行
- 前端服务正在运行
- `.env` 中至少配置了当前模型供应商的 key 和模型名

## 已知边界

- `runManager` 当前使用进程内事件缓存，适合单进程本地应用；如果要部署多实例，需要替换成共享事件存储
- 当前重连解决的是前端到后端的 SSE 短线，不解决模型上游流断开后的真正断点续传
- 自动续写策略尚未实现；上游异常时不会自动构造 prompt 继续补写
- 旧版直接流式请求仍保留用于兼容和调试，主流程使用 run-based streaming
