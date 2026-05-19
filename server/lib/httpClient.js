import https from 'https';
import http from 'http';

export function requestStream({ url, body, headers = {}, method = 'POST', timeout = 120000 }, onResponse) {
  const endpoint = new URL(url);
  const payload = JSON.stringify(body);
  const transport = endpoint.protocol === 'http:' ? http : https;

  const request = transport.request({
    hostname: endpoint.hostname,
    port: endpoint.port || (endpoint.protocol === 'http:' ? 80 : 443),
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

export function requestJson({ url, body, headers = {}, timeout = 120000 }) {
  return new Promise((resolve, reject) => {
    const request = requestStream({ url, body, headers, timeout }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = null;
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          const message = parsed?.error?.message || parsed?.error || data.trim() || `HTTP ${res.statusCode}`;
          reject(new Error(message));
          return;
        }

        if (!parsed) {
          reject(new Error('响应不是合法 JSON'));
          return;
        }

        resolve(parsed);
      });
    });

    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy(new Error('请求超时'));
    });
  });
}

export function parseSseStream(stream, onData, onDone) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (!data) continue;
      if (data === '[DONE]') {
        onDone?.();
        return;
      }
      onData(data);
    }
  });
  stream.on('end', () => onDone?.());
}
