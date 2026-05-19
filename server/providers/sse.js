export function writeSseHeaders(res) {
  if (res.headersSent) return;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
}

export function writeSseError(res, message) {
  writeSseHeaders(res);
  res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
}

export function writeOpenAiChunk(res, content) {
  if (!content) return;
  res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
}

export function writeOpenAiDone(res) {
  res.write('data: [DONE]\n\n');
  res.end();
}
