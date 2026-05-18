import { streamChat } from '../providers/modelProviders.js';

export function handleChatStream(req, res) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const { messages, provider } = JSON.parse(body);
      streamChat(messages, res, provider);
    } catch {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: '请求格式错误' }));
    }
  });
}
