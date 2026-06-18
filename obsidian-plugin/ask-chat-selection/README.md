# Ask Chat Selection Obsidian Plugin

在 Obsidian 中选中文字，用 OpenAI-compatible Chat Completions 结合当前笔记上下文解释、翻译或追问。

## 功能

- 命令面板：
  - `Ask Chat Selection: Explain selected text`
  - `Ask Chat Selection: Translate selected text`
  - `Ask Chat Selection: Ask about selected text`
- 编辑器右键菜单：
  - `Ask Chat: Explain selection`
  - `Ask Chat: Translate selection`
  - `Ask Chat: Ask about selection`
- 左侧 ribbon 图标：对当前选区发起追加提问。
- 支持 OpenAI-compatible Chat Completions 流式响应。
- API Key、Base URL、Model、Temperature 和自定义回答要求都保存在 Obsidian 插件数据中。

## 安装

1. 在你的 vault 中创建目录：
   `.obsidian/plugins/ask-chat-selection`
2. 把本目录里的这些文件复制进去：
   - `manifest.json`
   - `main.js`
   - `styles.css`
3. 重启 Obsidian，或在 Community plugins 页面点击刷新。
4. 进入 `Settings -> Community plugins`，启用 `Ask Chat Selection`。
5. 进入 `Settings -> Ask Chat Selection`，填写 Base URL、Model 和 API Key。

## 配置示例

OpenAI:

- Base URL: `https://api.openai.com/v1`
- Model: `gpt-4o-mini`

DeepSeek:

- Base URL: `https://api.deepseek.com/v1`
- Model: `deepseek-chat`

## 使用

打开一篇 Markdown 笔记，选中文字后：

- 从命令面板执行 Explain/Translate/Ask。
- 或右键选区，选择 Ask Chat 菜单项。
- 或点击左侧 ribbon 图标发起追加提问。

插件会把选中文本、当前笔记标题、路径、标题链路、选区附近段落一起发给模型，用来判断上下文。
