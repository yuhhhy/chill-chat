const DEFAULT_CHUNK_SIZE = 800;
const DEFAULT_OVERLAP = 150;

function normalizeText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

export function chunkText(text, { chunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_OVERLAP } = {}) {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const chunks = [];
  let start = 0;

  while (start < normalized.length) {
    const hardEnd = Math.min(start + chunkSize, normalized.length);
    let end = hardEnd;

    if (hardEnd < normalized.length) {
      const paragraphBreak = normalized.lastIndexOf('\n\n', hardEnd);
      const sentenceBreak = Math.max(
        normalized.lastIndexOf('。', hardEnd),
        normalized.lastIndexOf('.', hardEnd),
        normalized.lastIndexOf('！', hardEnd),
        normalized.lastIndexOf('?', hardEnd),
        normalized.lastIndexOf('？', hardEnd)
      );
      const softBreak = Math.max(paragraphBreak, sentenceBreak);
      if (softBreak > start + Math.floor(chunkSize * 0.55)) {
        end = softBreak + 1;
      }
    }

    const content = normalized.slice(start, end).trim();
    if (content) chunks.push(content);

    if (end >= normalized.length) break;
    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}

export { DEFAULT_CHUNK_SIZE, DEFAULT_OVERLAP };
