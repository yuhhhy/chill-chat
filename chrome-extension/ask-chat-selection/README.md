# Ask Chat Selection Chrome Extension

独立 Chrome 插件：在任意网页选中文字，右下角出现 `Ask Chat`，点击后用你填写的 OpenAI-compatible API Key 解释选中内容。

## 功能

- 不依赖 chill-chat 后端或前端代码。
- 选中词语/短语：200 个中文字符以内解释。
- 选中一段话：500 个中文字符以内解释这句话在当前上下文里的意思。
- 选中后按 `T`：直接翻译选中文本。
- 支持 OpenAI-compatible Chat Completions。
- API Key 存在 Chrome `storage.sync`。

## 安装

1. 打开 Chrome：`chrome://extensions`
2. 开启 Developer mode
3. 点击 Load unpacked
4. 选择这个目录：`chrome-extension/ask-chat-selection`
5. 点击扩展图标，填写 Base URL、Model 和 API Key

## 配置示例

OpenAI:

- Base URL: `https://api.openai.com/v1`
- Model: `gpt-4o-mini`

DeepSeek:

- Base URL: `https://api.deepseek.com/v1`
- Model: `deepseek-chat`

## 注意

- 插件需要 `<all_urls>` 权限，用于在网页中显示选区按钮。
- 模型请求由扩展 background service worker 发起，避免网页自身 CORS 限制。
- 当前版本只支持 OpenAI-compatible SSE 流式响应。
