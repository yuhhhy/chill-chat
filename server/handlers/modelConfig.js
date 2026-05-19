import fs from 'fs';
import path from 'path';
import { getPublicCustomModels, saveCustomModels } from '../providers/customModels.js';

const ENV_PATH = path.join(process.cwd(), '.env');

function validateCustomModel(input, existingModel = null) {
  const label = String(input.label || '').trim();
  const apiUrl = String(input.apiUrl || '').trim();
  const model = String(input.model || '').trim();
  const apiKey = String(input.apiKey || '').trim();

  if (!label) return { error: '模型名称不能为空' };
  if (!apiUrl) return { error: 'API 地址不能为空' };
  if (!model) return { error: '模型 ID 不能为空' };

  try {
    const url = new URL(apiUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return { error: 'API 地址必须是 http 或 https' };
    }
  } catch {
    return { error: 'API 地址格式不正确' };
  }

  if (!existingModel && !apiKey) return { error: 'API key 不能为空' };

  return {
    value: {
      id: existingModel?.id || `custom-${crypto.randomUUID()}`,
      label,
      apiUrl,
      apiKey: apiKey || existingModel?.apiKey || '',
      model,
      apiType: 'openai-compatible'
    }
  };
}

function readEnvFile() {
  try {
    return fs.readFileSync(ENV_PATH, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
}

function quoteEnvValue(value) {
  const text = String(value);
  if (text.startsWith('[') || text.startsWith('{')) return text;
  return JSON.stringify(text);
}

function writeEnvValues(values) {
  const source = readEnvFile();
  const lines = source ? source.split(/\r?\n/) : [];
  const seen = new Set();
  const nextLines = lines.map((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match || !(match[1] in values)) return line;
    seen.add(match[1]);
    return `${match[1]}=${quoteEnvValue(values[match[1]])}`;
  });

  for (const [key, value] of Object.entries(values)) {
    if (!seen.has(key)) {
      if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== '') nextLines.push('');
      nextLines.push(`${key}=${quoteEnvValue(value)}`);
    }
  }

  fs.writeFileSync(ENV_PATH, nextLines.join('\n').replace(/\n*$/, '\n'));
}

function persistCustomModels(models) {
  writeEnvValues({ CUSTOM_MODELS: JSON.stringify(models) });
  saveCustomModels(models);
}

export function getCustomModels(req, res) {
  res.json({ customModels: getPublicCustomModels() });
}

export function createCustomModel(req, res) {
  const validated = validateCustomModel(req.body);
  if (validated.error) {
    res.status(400).json({ error: validated.error });
    return;
  }

  const models = [...getPublicCustomModels({ includeApiKey: true }), validated.value];
  persistCustomModels(models);
  res.status(201).json({ customModels: getPublicCustomModels() });
}

export function updateCustomModel(req, res) {
  const models = getPublicCustomModels({ includeApiKey: true });
  const index = models.findIndex((m) => m.id === req.params.customModelId);

  if (index === -1) {
    res.status(404).json({ error: '自定义模型不存在' });
    return;
  }

  const validated = validateCustomModel(req.body, models[index]);
  if (validated.error) {
    res.status(400).json({ error: validated.error });
    return;
  }

  models[index] = validated.value;
  persistCustomModels(models);
  res.json({ customModels: getPublicCustomModels() });
}

export function deleteCustomModel(req, res) {
  const models = getPublicCustomModels({ includeApiKey: true });
  const nextModels = models.filter((m) => m.id !== req.params.customModelId);

  if (nextModels.length === models.length) {
    res.status(404).json({ error: '自定义模型不存在' });
    return;
  }

  persistCustomModels(nextModels);
  res.json({ customModels: getPublicCustomModels() });
}
