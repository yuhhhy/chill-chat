import { assets } from '../assets/assets';

export const modelProviderOptions = [
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    description: 'OpenAI Chat Completions',
    icon: assets.chatgpt_icon,
    initials: 'C',
    tone: 'chatgpt'
  },
  {
    id: 'gemini',
    label: 'Gemini',
    description: 'Google Gemini API',
    icon: assets.gemini_icon,
    initials: 'G',
    tone: 'gemini'
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    description: 'DeepSeek Chat Completions',
    icon: assets.deepseek_icon,
    initials: 'D',
    tone: 'deepseek'
  },
  {
    id: 'claude',
    label: 'Claude',
    description: 'Anthropic Messages API',
    icon: assets.claude_icon,
    initials: 'C',
    tone: 'claude'
  }
];

export function getModelProviderMeta(provider = 'deepseek') {
  return modelProviderOptions.find((model) => model.id === provider) || modelProviderOptions[2];
}
