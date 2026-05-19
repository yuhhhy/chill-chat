const textDecoder = new TextDecoder('utf-8', { fatal: false });

function extensionFor(filename) {
  return filename.toLowerCase().split('.').pop() || '';
}

async function parsePdf(buffer) {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text || '';
  } finally {
    await parser.destroy();
  }
}

async function parseDocx(buffer) {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return result.value || '';
}

export async function extractTextFromFile({ buffer, filename, mimeType }) {
  const ext = extensionFor(filename);

  if (ext === 'txt' || ext === 'md' || mimeType.startsWith('text/')) {
    return textDecoder.decode(buffer);
  }

  if (ext === 'pdf' || mimeType === 'application/pdf') {
    return parsePdf(buffer);
  }

  if (
    ext === 'docx' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return parseDocx(buffer);
  }

  throw new Error('仅支持 TXT、MD、PDF、DOCX 文件');
}

export const RAG_ACCEPT_EXTENSIONS = ['.txt', '.md', '.pdf', '.docx'];
