import { randomUUID } from 'crypto';
import * as promptsDb from '../db/prompts.js';

export function getPrompts(req, res) {
  res.json(promptsDb.listPrompts());
}

export function createPrompt(req, res) {
  const { title, content } = req.body;
  if (typeof title !== 'string' || !title.trim()) {
    res.status(400).json({ error: 'title 不能为空' });
    return;
  }
  if (typeof content !== 'string' || !content.trim()) {
    res.status(400).json({ error: 'content 不能为空' });
    return;
  }
  const prompt = promptsDb.insertPrompt(randomUUID(), title.trim(), content.trim());
  res.status(201).json(prompt);
}

export function updatePrompt(req, res) {
  const { title, content } = req.body;
  if (typeof title !== 'string' || !title.trim()) {
    res.status(400).json({ error: 'title 不能为空' });
    return;
  }
  if (typeof content !== 'string' || !content.trim()) {
    res.status(400).json({ error: 'content 不能为空' });
    return;
  }
  if (!promptsDb.getPrompt(req.params.promptId)) {
    res.status(404).json({ error: '提示词不存在' });
    return;
  }
  res.json(promptsDb.updatePrompt(req.params.promptId, title.trim(), content.trim()));
}

export function deletePrompt(req, res) {
  promptsDb.deletePrompt(req.params.promptId);
  res.json({ ok: true });
}
