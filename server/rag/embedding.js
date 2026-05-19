import { requestJson } from '../lib/httpClient.js';

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
