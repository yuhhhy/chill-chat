export const DEFAULT_MAX_CHUNK = 1200;
export const DEFAULT_CHILD_CHUNK = 300;

function normalizeText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

const SENTENCE_END_RE = /[.。!！?？;；]/;

function splitBySentences(text, maxSize) {
  if (text.length <= maxSize) return [text];

  const results = [];
  let pos = 0;

  while (pos < text.length) {
    if (pos + maxSize >= text.length) {
      const tail = text.slice(pos).trim();
      if (tail) results.push(tail);
      break;
    }

    let cut = -1;
    for (let i = pos + maxSize - 1; i > pos + Math.floor(maxSize * 0.3); i--) {
      if (SENTENCE_END_RE.test(text[i])) { cut = i + 1; break; }
    }
    if (cut === -1) {
      const nl = text.lastIndexOf('\n', pos + maxSize);
      if (nl > pos + Math.floor(maxSize * 0.3)) cut = nl + 1;
    }
    if (cut === -1) cut = pos + maxSize;

    const piece = text.slice(pos, cut).trim();
    if (piece) results.push(piece);
    pos = cut;
    while (pos < text.length && text[pos] === '\n') pos++;
  }

  return results;
}

export function chunkText(text, { maxChunkSize = DEFAULT_MAX_CHUNK } = {}) {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const paragraphs = normalized.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  const chunks = [];
  let buffer = '';

  const flush = () => {
    const content = buffer.trim();
    if (content) {
      chunks.push(...(content.length > maxChunkSize
        ? splitBySentences(content, maxChunkSize)
        : [content]));
    }
    buffer = '';
  };

  for (const para of paragraphs) {
    // Markdown headings always start a new chunk
    if (/^#{1,6}\s/.test(para)) {
      flush();
      buffer = para;
      continue;
    }

    const joined = buffer ? `${buffer}\n\n${para}` : para;

    if (joined.length <= maxChunkSize) {
      buffer = joined;
    } else {
      flush();
      buffer = para;
    }
  }

  flush();
  return chunks.filter(Boolean);
}

export function chunkTextHierarchical(text, {
  parentMaxSize = DEFAULT_MAX_CHUNK,
  childMaxSize = DEFAULT_CHILD_CHUNK
} = {}) {
  const parents = chunkText(text, { maxChunkSize: parentMaxSize });
  const children = [];

  parents.forEach((parentContent, parentIndex) => {
    chunkText(parentContent, { maxChunkSize: childMaxSize }).forEach(content => {
      children.push({ parentIndex, content });
    });
  });

  return { parents, children };
}
