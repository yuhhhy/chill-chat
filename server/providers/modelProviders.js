import https from 'https';

const MAX_TOKENS = 8192;
const DEFAULT_PROVIDER = 'deepseek';

const providerLabels = {
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  deepseek: 'DeepSeek',
  claude: 'Claude'
};

const providerConfig = {
  chatgpt: {
    apiKey: 'CHATGPT_API_KEY',
    apiType: 'CHATGPT_API_TYPE',
    apiUrl: 'CHATGPT_API_URL',
    defaultUrl: 'https://api.openai.com/v1/chat/completions',
    model: 'CHATGPT_MODEL',
    type: 'openai-compatible'
  },
  deepseek: {
    apiKey: 'DEEPSEEK_API_KEY',
    apiType: 'DEEPSEEK_API_TYPE',
    apiUrl: 'DEEPSEEK_API_URL',
    defaultUrl: 'https://api.deepseek.com/v1/chat/completions',
    model: 'DEEPSEEK_MODEL',
    type: 'openai-compatible'
  },
  gemini: {
    apiKey: 'GEMINI_API_KEY',
    apiType: 'GEMINI_API_TYPE',
    apiUrl: 'GEMINI_API_URL',
    defaultUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    model: 'GEMINI_MODEL',
    type: 'gemini'
  },
  claude: {
    apiKey: 'CLAUDE_API_KEY',
    apiType: 'CLAUDE_API_TYPE',
    apiUrl: 'CLAUDE_API_URL',
    defaultUrl: 'https://api.anthropic.com/v1/messages',
    model: 'CLAUDE_MODEL',
    type: 'claude'
  }
};

function writeSseHeaders(res) {
  if (res.headersSent) return;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
}

function writeSseError(res, message) {
  writeSseHeaders(res);
  res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
}

function writeOpenAiChunk(res, content) {
  if (!content) return;
  res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
}

function writeOpenAiDone(res) {
  res.write('data: [DONE]\n\n');
  res.end();
}

function resolveProvider(provider) {
  const normalized = String(provider || DEFAULT_PROVIDER).toLowerCase();
  return providerConfig[normalized] ? normalized : DEFAULT_PROVIDER;
}

function getRuntimeConfig(provider) {
  const config = providerConfig[provider];
  const label = providerLabels[provider];
  const apiKey = process.env[config.apiKey];
  const apiType = (process.env[config.apiType] || config.type).toLowerCase();
  const model = process.env[config.model];
  const apiUrl = process.env[config.apiUrl] || config.defaultUrl;

  return { ...config, apiKey, apiType, apiUrl, label, model };
}

function requestJsonStream({ body, headers, method = 'POST', timeout = 120000, url }, onResponse) {
  const endpoint = new URL(url);
  const payload = JSON.stringify(body);

  const request = https.request({
    hostname: endpoint.hostname,
    port: endpoint.port || 443,
    path: `${endpoint.pathname}${endpoint.search}`,
    method,
    timeout,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'User-Agent': 'Node.js-Client',
      'Accept': '*/*',
      ...headers
    }
  }, onResponse);

  request.write(payload);
  request.end();

  return request;
}

function handleUpstreamError(upstreamRes, res, label) {
  let body = '';
  upstreamRes.on('data', chunk => { body += chunk; });
  upstreamRes.on('end', () => {
    let message = `${label} 请求失败：HTTP ${upstreamRes.statusCode}`;
    try {
      const parsed = JSON.parse(body);
      message = parsed?.error?.message || parsed?.error?.status || message;
    } catch {
      if (body.trim()) message = body.trim();
    }
    writeSseError(res, message);
  });
}

function mapGeminiMessages(messages) {
  return messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }]
  }));
}

function mapClaudeMessages(messages) {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: message.role,
      content: message.content
    }));
}

function streamOpenAiCompatible(messages, res, config) {
  const requestBody = {
    model: config.model,
    messages,
    max_tokens: MAX_TOKENS,
    temperature: 0.7,
    stream: true
  };

  const upstream = requestJsonStream({
    url: config.apiUrl,
    body: requestBody,
    headers: {
      Authorization: `Bearer ${config.apiKey}`
    }
  }, (upstreamRes) => {
    writeSseHeaders(res);

    if (upstreamRes.statusCode < 200 || upstreamRes.statusCode >= 300) {
      handleUpstreamError(upstreamRes, res, config.label);
      return;
    }

    upstreamRes.pipe(res);
  });

  upstream.on('error', (error) => {
    writeSseError(res, `流式请求失败：${error.message}`);
  });

  upstream.on('timeout', () => {
    upstream.destroy();
    writeSseError(res, '请求超时');
  });

  return upstream;
}

function streamGemini(messages, res, config) {
  const baseUrl = config.apiUrl.replace(/\/$/, '');
  const url = `${baseUrl}/${encodeURIComponent(config.model)}:streamGenerateContent?alt=sse`;
  const requestBody = {
    contents: mapGeminiMessages(messages),
    generationConfig: {
      maxOutputTokens: MAX_TOKENS,
      temperature: 0.7
    }
  };

  const upstream = requestJsonStream({
    url,
    body: requestBody,
    headers: {
      'x-goog-api-key': config.apiKey
    }
  }, (upstreamRes) => {
    writeSseHeaders(res);

    if (upstreamRes.statusCode < 200 || upstreamRes.statusCode >= 300) {
      handleUpstreamError(upstreamRes, res, config.label);
      return;
    }

    let buffer = '';
    upstreamRes.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (!data || data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const parts = parsed?.candidates?.[0]?.content?.parts || [];
          for (const part of parts) {
            writeOpenAiChunk(res, part.text || '');
          }
        } catch (error) {
          console.error('Gemini stream parse error:', error);
        }
      }
    });

    upstreamRes.on('end', () => {
      writeOpenAiDone(res);
    });
  });

  upstream.on('error', (error) => {
    writeSseError(res, `流式请求失败：${error.message}`);
  });

  upstream.on('timeout', () => {
    upstream.destroy();
    writeSseError(res, '请求超时');
  });

  return upstream;
}

function streamClaude(messages, res, config) {
  const requestBody = {
    model: config.model,
    messages: mapClaudeMessages(messages),
    max_tokens: MAX_TOKENS,
    temperature: 0.7,
    stream: true
  };

  const upstream = requestJsonStream({
    url: config.apiUrl,
    body: requestBody,
    headers: {
      'anthropic-version': process.env.CLAUDE_API_VERSION || '2023-06-01',
      'x-api-key': config.apiKey
    }
  }, (upstreamRes) => {
    writeSseHeaders(res);

    if (upstreamRes.statusCode < 200 || upstreamRes.statusCode >= 300) {
      handleUpstreamError(upstreamRes, res, config.label);
      return;
    }

    let buffer = '';
    upstreamRes.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (!data || data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta') {
            writeOpenAiChunk(res, parsed.delta?.text || '');
          }
        } catch (error) {
          console.error('Claude stream parse error:', error);
        }
      }
    });

    upstreamRes.on('end', () => {
      writeOpenAiDone(res);
    });
  });

  upstream.on('error', (error) => {
    writeSseError(res, `流式请求失败：${error.message}`);
  });

  upstream.on('timeout', () => {
    upstream.destroy();
    writeSseError(res, '请求超时');
  });

  return upstream;
}

export function getModelNames() {
  return Object.fromEntries(
    Object.entries(providerConfig).map(([id, cfg]) => [id, process.env[cfg.model] || ''])
  );
}

export function streamChat(messages, res, provider) {
  if (provider === '__mock_stream__' && process.env.ENABLE_MOCK_PROVIDER === '1') {
    writeSseHeaders(res);
    const chunks = ['mock ', 'stream ', 'chunk ', 'reconnect ', 'ok'];
    let index = 0;
    const timer = setInterval(() => {
      if (index >= chunks.length) {
        clearInterval(timer);
        writeOpenAiDone(res);
        return;
      }
      writeOpenAiChunk(res, chunks[index]);
      index += 1;
    }, 40);

    return {
      destroy() {
        clearInterval(timer);
        writeSseError(res, 'mock stream cancelled');
      }
    };
  }

  const resolvedProvider = resolveProvider(provider);
  const config = getRuntimeConfig(resolvedProvider);

  if (!config.apiKey) {
    writeSseError(res, `${config.label} API Key 未配置`);
    return;
  }

  if (!config.model) {
    writeSseError(res, `${config.label} 模型名称未配置`);
    return;
  }

  try {
    if (config.apiType === 'openai' || config.apiType === 'openai-compatible') {
      return streamOpenAiCompatible(messages, res, config);
    }

    if (config.type === 'gemini') {
      return streamGemini(messages, res, config);
    }

    if (config.type === 'claude') {
      return streamClaude(messages, res, config);
    }

    return streamOpenAiCompatible(messages, res, config);
  } catch (error) {
    writeSseError(res, `${config.label} 配置错误：${error.message}`);
  }
}
