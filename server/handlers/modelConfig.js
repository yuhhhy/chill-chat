import fs from 'fs';
import path from 'path';
import { getPublicCustomModels, saveCustomModels } from '../providers/modelProviders.js';

const ENV_PATH = path.join(process.cwd(), '.env');

function normalizeTextValue(value) {
  return String(value || '').trim();
}

function validateCustomModel(input, existingModel = null) {
  const label = normalizeTextValue(input.label);
  const apiUrl = normalizeTextValue(input.apiUrl);
  const model = normalizeTextValue(input.model);
  const apiKey = normalizeTextValue(input.apiKey);

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
      if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== '') {
        nextLines.push('');
      }
      nextLines.push(`${key}=${quoteEnvValue(value)}`);
    }
  }

  fs.writeFileSync(ENV_PATH, nextLines.join('\n').replace(/\n*$/, '\n'));
}

function persistCustomModels(models) {
  const serialized = JSON.stringify(models);
  writeEnvValues({ CUSTOM_MODELS: serialized });
  saveCustomModels(models);
}

export function getCustomModels(_req, res, { json }) {
  json(res, { customModels: getPublicCustomModels() });
}

export async function createCustomModel(req, res, { json, parseBody }) {
  try {
    const body = await parseBody(req);
    const validated = validateCustomModel(body);

    if (validated.error) {
      json(res, { error: validated.error }, 400);
      return;
    }

    const models = [...getPublicCustomModels({ includeApiKey: true }), validated.value];
    persistCustomModels(models);
    json(res, { customModels: getPublicCustomModels() }, 201);
  } catch (error) {
    json(res, { error: error.message || '保存自定义模型失败' }, 400);
  }
}

export async function updateCustomModel(req, res, { customModelId, json, parseBody }) {
  try {
    const body = await parseBody(req);
    const models = getPublicCustomModels({ includeApiKey: true });
    const index = models.findIndex((model) => model.id === customModelId);

    if (index === -1) {
      json(res, { error: '自定义模型不存在' }, 404);
      return;
    }

    const validated = validateCustomModel(body, models[index]);
    if (validated.error) {
      json(res, { error: validated.error }, 400);
      return;
    }

    models[index] = validated.value;
    persistCustomModels(models);
    json(res, { customModels: getPublicCustomModels() });
  } catch (error) {
    json(res, { error: error.message || '保存自定义模型失败' }, 400);
  }
}

export function deleteCustomModel(_req, res, { customModelId, json }) {
  try {
    const models = getPublicCustomModels({ includeApiKey: true });
    const nextModels = models.filter((model) => model.id !== customModelId);

    if (nextModels.length === models.length) {
      json(res, { error: '自定义模型不存在' }, 404);
      return;
    }

    persistCustomModels(nextModels);
    json(res, { customModels: getPublicCustomModels() });
  } catch (error) {
    json(res, { error: error.message || '删除自定义模型失败' }, 400);
  }
}
