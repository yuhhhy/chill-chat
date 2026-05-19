import https from 'https';

const DEFAULT_EMBEDDING_URL = 'https://api.openai.com/v1/embeddings';

function resolveEmbeddingUrl() {
  const rawUrl = process.env.EMBEDDING_API_URL || DEFAULT_EMBEDDING_URL;
  const endpoint = new URL(rawUrl);
  const pathname = endpoint.pathname.replace(/\/+$/, '');

  if (!pathname.endsWith('/embeddings')) {
    endpoint.pathname = `${pathname || '/v1'}/embeddings`;
  }

  return endpoint.toString();
}

function requestJson({ body, headers = {}, timeout = 120000, url }) {
  return new Promise((resolve, reject) => {
    const endpoint = new URL(url);
    const payload = JSON.stringify(body);

    const req = https.request({
      hostname: endpoint.hostname,
      port: endpoint.port || 443,
      path: `${endpoint.pathname}${endpoint.search}`,
      method: 'POST',
      timeout,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': 'Node.js-Client',
        ...headers
      }
    }, (upstreamRes) => {
      let data = '';
      upstreamRes.on('data', chunk => { data += chunk; });
      upstreamRes.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = null;
        }

        if (upstreamRes.statusCode < 200 || upstreamRes.statusCode >= 300) {
          const message = parsed?.error?.message || parsed?.error || data.trim() || `Embedding 请求失败：HTTP ${upstreamRes.statusCode}`;
          reject(new Error(message));
          return;
        }

        if (!parsed) {
          reject(new Error('Embedding 响应不是合法 JSON'));
          return;
        }

        resolve(parsed);
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('Embedding 请求超时'));
    });
    req.write(payload);
    req.end();
  });
}

export async function createEmbeddings(input) {
  const apiKey = process.env.EMBEDDING_API_KEY;
  const model = process.env.EMBEDDING_MODEL;

  if (!apiKey) throw new Error('EMBEDDING_API_KEY 未配置');
  if (!model) throw new Error('EMBEDDING_MODEL 未配置');

  const inputs = Array.isArray(input) ? input : [input];
  if (inputs.length === 0) return [];

  const parsed = await requestJson({
    url: resolveEmbeddingUrl(),
    body: { model, input: inputs },
    headers: { Authorization: `Bearer ${apiKey}` }
  });

  const vectors = parsed?.data
    ?.slice()
    ?.sort((a, b) => a.index - b.index)
    ?.map(item => item.embedding);

  if (!Array.isArray(vectors) || vectors.length !== inputs.length || vectors.some(vector => !Array.isArray(vector))) {
    throw new Error('Embedding 响应缺少向量数据');
  }

  return vectors;
}
