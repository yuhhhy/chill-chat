import https from 'https';

const API_KEY = process.env.DEEPSEEK_API_KEY;

export function streamChat(messages, res) {
  const requestBody = {
    model: 'deepseek-v4-flash',
    messages,
    max_tokens: 4000,
    temperature: 0.7,
    stream: true
  };

  const options = {
    hostname: 'api.deepseek.com',
    port: 443,
    path: '/v1/chat/completions',
    method: 'POST',
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'User-Agent': 'Node.js-Client',
      'Accept': '*/*'
    }
  };

  const upstream = https.request(options, (upstreamRes) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    upstreamRes.pipe(res);
  });

  upstream.on('error', (error) => {
    res.write(`data: {"error": "流式请求失败：${error.message}"}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  });

  upstream.on('timeout', () => {
    upstream.destroy();
    res.write('data: {"error": "请求超时"}\n\n');
    res.write('data: [DONE]\n\n');
    res.end();
  });

  upstream.write(JSON.stringify(requestBody));
  upstream.end();
}
