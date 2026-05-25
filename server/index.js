import express from 'express';
import dotenv from 'dotenv';
import sessionsRouter from './routes/sessions.js';
import messagesRouter from './routes/messages.js';
import chatRunsRouter from './routes/chatRuns.js';
import modelConfigRouter from './routes/modelConfig.js';
import ragRouter from './routes/rag.js';
import promptsRouter from './routes/prompts.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/sessions', sessionsRouter);
app.use('/api/sessions/:sessionId/messages', messagesRouter);
app.use('/api/chat-runs', chatRunsRouter);
app.use('/api/config', modelConfigRouter);
app.use('/api/rag', ragRouter);
app.use('/api/prompts', promptsRouter);

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
