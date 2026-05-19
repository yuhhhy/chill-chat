export function parseCustomModels() {
  if (!process.env.CUSTOM_MODELS) return [];

  try {
    let text = process.env.CUSTOM_MODELS;
    if (text.includes('\\"')) text = text.replace(/\\"/g, '"');

    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((m) => ({
        id: String(m.id || '').trim(),
        label: String(m.label || '').trim(),
        apiUrl: String(m.apiUrl || '').trim(),
        apiKey: String(m.apiKey || '').trim(),
        model: String(m.model || '').trim(),
        apiType: 'openai-compatible'
      }))
      .filter((m) => m.id && m.label && m.apiUrl && m.model);
  } catch (error) {
    console.error('CUSTOM_MODELS parse error:', error);
    return [];
  }
}

export function getCustomModel(provider) {
  return parseCustomModels().find((m) => m.id === provider);
}

export function getPublicCustomModels({ includeApiKey = false } = {}) {
  return parseCustomModels().map((m) => ({
    id: m.id,
    label: m.label,
    description: m.model,
    apiUrl: m.apiUrl,
    model: m.model,
    hasApiKey: Boolean(m.apiKey),
    ...(includeApiKey ? { apiKey: m.apiKey } : {})
  }));
}

export function saveCustomModels(models) {
  process.env.CUSTOM_MODELS = JSON.stringify(models);
}
