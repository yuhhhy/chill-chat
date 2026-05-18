# chill-chat 功能实现说明

## 项目概览

基于 React + Node.js 的 AI 聊天应用，接入 DeepSeek API，支持流式输出、语音输入、多会话管理与持久化存储。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 18 + Vite |
| 状态管理 | React Context API + 自定义 Hooks |
| 路由 | react-router-dom v6 |
| 虚拟列表 | react-virtuoso |
| Markdown 渲染 | react-markdown + rehype-highlight + remark-gfm |
| 后端 | Node.js 原生 http 模块 |
| 数据库 | SQLite（better-sqlite3） |
| AI 接口 | DeepSeek API（SSE 流式） |
| 语音输入 | Web Speech API |

---

## 整体架构

### 后端分层

```
server/
├── index.js              HTTP 服务入口 + 路由分发
├── db.js                 SQLite 单例 + 所有 prepared statements
├── providers/
│   └── deepseek.js       DeepSeek 流式适配器（可替换为其他 AI 提供商）
└── handlers/
    ├── sessions.js       会话 CRUD 处理器
    ├── messages.js       消息读写处理器
    └── chat.js           流式聊天处理器（调用 provider）
```

> 新增 AI 提供商：在 `server/providers/` 添加文件，在 `server/handlers/chat.js` 引入即可。

### 前端分层

```
src/
├── api/                  HTTP 封装层（所有 fetch 在此集中）
│   ├── client.js         apiGet / apiPost / apiDelete 基础封装
│   ├── sessions.js       会话相关 API 函数
│   └── messages.js       消息相关 API 函数
├── hooks/                业务逻辑层
│   ├── useSessions.js    会话 CRUD + 路由导航状态
│   ├── useChat.js        消息加载 + SSE 流式生成状态
│   └── useSpeechRecognition.js  语音输入三态状态机
├── context/
│   └── Context.jsx       组合层：串联各 hook，对外暴露统一 contextValue
└── components/
    ├── Main/
    │   ├── Main.jsx          布局骨架（约 37 行）
    │   ├── WelcomeScreen.jsx 初始欢迎界面 + 建议卡片
    │   ├── MessageList.jsx   Virtuoso 虚拟消息列表
    │   └── ChatInput.jsx     输入框 + 语音 + 发送/停止
    ├── SideBar/          会话列表（可拖拽宽度调节）
    └── MarkdownRenderer/ 代码高亮 Markdown 渲染
```

---

## 1. 流式输出架构

### 四层分离设计

```
server/providers/deepseek.js   — 网络层：代理 SSE 到客户端
services/streamParser.js       — 解析层：SSE 拆包、renderBuffer 节流
hooks/useChat.js               — 状态层：消息生命周期管理、流式内容累积
components/Main/MessageList.jsx — 渲染层：Virtuoso 按需渲染，增量展示
```

### StreamParser

- 单例，维护一个 `AbortController`，支持随时中断
- SSE 解析：按行切分 `data: ...`，提取 JSON delta content
- 双缓冲设计：`sseBuffer` 处理 UTF-8 分包，`renderBuffer` 控制输出节奏
- 每 50ms flush 一次，每次最多 8 个字符，形成打字机效果
- `abort(flush?)` 支持两种模式：
  - `flush=true`（默认）：保留缓冲区，用于用户主动停止，能看到最后几字
  - `flush=false`：立即清空缓冲区并断开回调，用于切换 session，防止旧内容污染新 session

### 内容累积（避免 Array mutation）

`useChat` 使用组件级 `streamedContentRef`（useRef）累积已接收文本，每次 chunk 回调从 ref 读取完整内容映射到消息对象，避免了旧实现中 `Array.splice` mutation 的反模式。

---

## 2. 会话管理与持久化

### 数据库结构

```sql
sessions (
  id TEXT PRIMARY KEY,          -- UUID
  title TEXT DEFAULT 'New Chat',
  created_at INTEGER            -- unixepoch()
)

messages (
  id TEXT PRIMARY KEY,          -- UUID
  session_id TEXT,
  role TEXT,                    -- 'user' | 'assistant'
  content TEXT,
  created_at INTEGER,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
)
```

- WAL 模式（`PRAGMA journal_mode = WAL`）：写入性能更好，读写可并发
- 外键级联删除：删除 session 自动清理所有关联消息
- 首条用户消息自动截取前 20 字作为 session 标题

### REST 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/sessions` | 获取所有会话（按创建时间倒序） |
| POST | `/api/sessions` | 新建会话 |
| DELETE | `/api/sessions/:id` | 删除会话（级联删消息） |
| GET | `/api/sessions/:id/messages` | 获取会话消息列表 |
| POST | `/api/sessions/:id/messages` | 追加消息（首批自动更新标题） |
| POST | `/api/chat` | DeepSeek SSE 流式代理（不存储） |

### 消息保存时机

1. 用户发送时：立即 `POST /api/sessions/:id/messages`（role: user），同步更新侧边栏标题
2. 流式完成后：`POST /api/sessions/:id/messages`（role: assistant），fire-and-forget
3. 生成中断/切换 session：当前未完成的 AI 消息不写库（partial response 不持久化）

---

## 3. 路由设计

- `BrowserRouter` 包裹整个应用（`main.jsx`）
- URL 格式：`/chat/:sessionId`
- `currentSessionId` 从 `useLocation().pathname` 派生，不作为独立 state
- `loadSession` 只调 `navigate('/chat/:id')`，`useEffect([currentSessionId])` 监听 URL 变化后自动从后端拉取消息
- 刷新页面时 URL 中的 sessionId 直接恢复上次会话

### 初始化流程

```
应用启动
  → fetch /api/sessions
  → 有历史 session → navigate /chat/:first_id（replace）
  → 无历史 session → POST /api/sessions → navigate /chat/:new_id（replace）
```

---

## 4. 语音输入状态机

### 三态设计（`useSpeechRecognition.js`）

```
idle ──────────────────────────── toggle ──→ recording
recording ─── toggle / stop ──────────────→ processing
processing ─── onend（成功）──────────────→ idle（自动发送）
processing ─── onend（无内容）────────────→ idle（显示错误）
任意状态 ─── onerror ─────────────────────→ idle（显示错误）
```

- `continuous = true`：持续接收中间结果，实时展示转写中文字
- `interimResults = true`：显示草稿文本，完整文本追加到 finalTranscriptRef
- session 切换时（sessionId 变化）：`useEffect` 自动触发 `resetState()`，清除残留错误提示

### 错误码映射

| 错误码 | 提示 |
|--------|------|
| `audio-capture` | 无法访问麦克风，请检查设备权限 |
| `network` | 语音识别网络异常，请稍后重试 |
| `no-speech` | 没有检测到语音，请再试一次 |
| `not-allowed` | 麦克风权限被拒绝 |
| `service-not-allowed` | 当前环境不允许使用语音识别服务 |

---

## 5. 虚拟列表

- 使用 `react-virtuoso` 替代 `messages.map(...)` 全量渲染
- `followOutput`：用户在底部时自动跟随流式输出滚动，上滑时不强制抢焦
- `atBottomStateChange`：追踪滚动位置，存入 Context 的 `isAtBottom` 状态
- `overscan={240}`：预渲染临近区域节点，避免快速滚动时白屏
- `scrollToIndex`：生成中自动滚到最新消息（`behavior: 'auto'`），生成结束后平滑滚动（`'smooth'`）

---

## 6. 本地开发

```bash
# 安装依赖
npm install

# 启动（前后端并行）
npm start
# 等价于：
# node server.js        → http://localhost:3001
# vite dev server       → http://localhost:5173（代理 /api → 3001）

# 清空所有聊天记录
rm chat.db

# 构建
npm run build
```

### 环境变量（.env）

```
DEEPSEEK_API_KEY=your_key_here
PORT=3001
```

---

## 7. 文件结构

```
├── server.js                        入口（委托给 server/index.js）
├── server/
│   ├── index.js                     HTTP 服务 + 路由分发
│   ├── db.js                        SQLite 单例 + prepared statements
│   ├── providers/
│   │   └── deepseek.js              DeepSeek 流式适配器
│   └── handlers/
│       ├── sessions.js              会话 CRUD
│       ├── messages.js              消息读写
│       └── chat.js                  流式聊天（调用 provider）
├── chat.db                          SQLite 数据库（本地，不入库）
├── vite.config.js                   Vite 配置（dev proxy /api → 3001）
└── src/
    ├── main.jsx                     入口，BrowserRouter + ContextProvider
    ├── App.jsx                      根组件
    ├── api/
    │   ├── client.js                apiGet / apiPost / apiDelete 封装
    │   ├── sessions.js              会话 API 函数
    │   └── messages.js              消息 API 函数
    ├── context/
    │   └── Context.jsx              组合层：串联各 hook，暴露 contextValue
    ├── services/
    │   └── streamParser.js          SSE 解析 + 打字机节流输出
    ├── hooks/
    │   ├── useSessions.js           会话 CRUD + 路由导航
    │   ├── useChat.js               消息加载 + 流式生成
    │   └── useSpeechRecognition.js  语音输入三态状态机
    └── components/
        ├── Main/
        │   ├── Main.jsx             布局骨架
        │   ├── WelcomeScreen.jsx    欢迎界面 + 建议卡片
        │   ├── MessageList.jsx      Virtuoso 虚拟消息列表
        │   └── ChatInput.jsx        输入框 + 语音 + 发送/停止
        ├── SideBar/                 会话列表（可拖拽宽度）
        └── MarkdownRenderer/        代码高亮 Markdown 渲染
```
