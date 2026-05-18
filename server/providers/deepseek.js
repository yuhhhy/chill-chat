import https from 'https';

const MAX_TOKENS = 8192;

function writeSseError(res, message) {
  if (!res.headersSent) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
  }

  res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
}

export function streamChat(messages, res) {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    writeSseError(res, 'DeepSeek API Key 未配置');
    return;
  }

  const requestBody = {
    model: 'deepseek-v4-flash',
    messages,
    max_tokens: MAX_TOKENS,
    temperature: 0.7,
    stream: true
  };

  const options = {
    hostname: 'api.deepseek.com',
    port: 443,
    path: '/v1/chat/completions',
    method: 'POST',
    timeout: 120000,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'User-Agent': 'Node.js-Client',
      'Accept': '*/*'
    }
  };

  const upstream = https.request(options, (upstreamRes) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    if (upstreamRes.statusCode < 200 || upstreamRes.statusCode >= 300) {
      let body = '';
      upstreamRes.on('data', chunk => { body += chunk; });
      upstreamRes.on('end', () => {
        let message = `DeepSeek 请求失败：HTTP ${upstreamRes.statusCode}`;
        try {
          const parsed = JSON.parse(body);
          message = parsed?.error?.message || message;
        } catch {
          if (body.trim()) message = body.trim();
        }

        writeSseError(res, message);
      });
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

  upstream.write(JSON.stringify(requestBody));
  upstream.end();
}
