function decodeHeaderValue(value) {
  return Buffer.from(value, 'binary').toString('utf8');
}

function decodeExtendedHeaderValue(value) {
  const match = value.match(/^([^']*)'[^']*'(.*)$/);
  if (!match) return decodeHeaderValue(value);

  const charset = match[1].toLowerCase();
  const encodedValue = match[2];
  if (charset && charset !== 'utf-8') {
    return decodeHeaderValue(encodedValue);
  }

  try {
    return decodeURIComponent(encodedValue);
  } catch {
    return decodeHeaderValue(encodedValue);
  }
}

function parseContentDisposition(value) {
  const params = {};
  for (const part of value.split(';')) {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (!rawValue.length) continue;
    const key = rawKey.toLowerCase();
    const rawParamValue = rawValue.join('=').replace(/^"|"$/g, '');
    params[key] = key.endsWith('*')
      ? decodeExtendedHeaderValue(rawParamValue)
      : decodeHeaderValue(rawParamValue);
  }
  if (params['filename*']) {
    params.filename = params['filename*'];
  }
  return params;
}

function parsePartHeaders(text) {
  const headers = {};
  for (const line of text.split('\r\n')) {
    const index = line.indexOf(':');
    if (index === -1) continue;
    headers[line.slice(0, index).toLowerCase()] = line.slice(index + 1).trim();
  }
  return headers;
}

export function readRequestBuffer(req, maxBytes = 50 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('上传文件总大小不能超过 50MB'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function parseMultipartForm(buffer, contentType) {
  const boundary = contentType.match(/boundary=([^;]+)/)?.[1]?.replace(/^"|"$/g, '');
  if (!boundary) throw new Error('缺少 multipart boundary');

  const body = buffer.toString('binary');
  const marker = `--${boundary}`;
  const parts = body.split(marker).slice(1, -1);
  const files = [];
  const fields = {};

  for (const rawPart of parts) {
    const part = rawPart.replace(/^\r\n/, '').replace(/\r\n$/, '');
    const separatorIndex = part.indexOf('\r\n\r\n');
    if (separatorIndex === -1) continue;

    const headers = parsePartHeaders(part.slice(0, separatorIndex));
    const disposition = parseContentDisposition(headers['content-disposition'] || '');
    const content = part.slice(separatorIndex + 4);
    const contentBuffer = Buffer.from(content, 'binary');

    if (disposition.filename) {
      files.push({
        fieldName: disposition.name || 'files',
        filename: disposition.filename,
        mimeType: headers['content-type'] || '',
        buffer: contentBuffer,
        size: contentBuffer.length
      });
    } else if (disposition.name) {
      fields[disposition.name] = contentBuffer.toString('utf8');
    }
  }

  return { fields, files };
}
