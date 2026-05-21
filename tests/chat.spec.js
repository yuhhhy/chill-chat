import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';

test('能发消息并收到 AI 回复', async ({ page }) => {
  page.on('console', msg => {
    if (msg.text().includes('[stream]') || msg.type() === 'error') {
      console.log(`[browser ${msg.type()}]`, msg.text());
    }
  });

  await page.goto(BASE_URL);
  await page.waitForURL(/\/chat\/.+/, { timeout: 10000 });

  const input = page.locator('textarea[placeholder="给 chillAI 发送消息"]').first();
  await input.fill('你好，请用一句话介绍你自己');
  await input.press('Enter');

  // 等待 AI 消息出现
  await page.waitForSelector('.ai-message', { timeout: 10000 });

  // 等待推理完成（thinking-indicator 消失）或超时
  await page.waitForFunction(() => {
    const msgs = document.querySelectorAll('.ai-message');
    if (!msgs.length) return false;
    const last = msgs[msgs.length - 1];
    return !last.querySelector('.thinking-indicator');
  }, { timeout: 60000 });

  // 再等 2 秒让 React 完成最后渲染
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/chat-result3.png', fullPage: true });

  const content = await page.locator('.ai-message .markdown-content').last().textContent();
  const failed = await page.locator('.message-status.failed').count();

  console.log('AI 内容:', JSON.stringify(content?.slice(0, 200)));
  console.log('failed 数量:', failed);

  expect(failed).toBe(0);
  expect(content?.trim().length).toBeGreaterThan(5);
});

test('RAG 来源完整展示并支持点击回答引用', async ({ page }) => {
  const session = { id: 'rag-source-test', title: 'RAG source test', created_at: 1 };
  const sources = Array.from({ length: 4 }, (_, index) => ({
    id: `source-${index + 1}`,
    chunkId: `chunk-${index + 1}`,
    order: index + 1,
    score: 0.82 - (index * 0.04),
    collectionId: 'collection-1',
    documentId: 'document-1',
    documentName: `测试文档 ${index + 1}.md`,
    chunkIndex: index,
    excerpt: `这是第 ${index + 1} 条来源摘要。`,
    content: `这是第 ${index + 1} 条来源的完整片段内容，用于验证历史快照和展开展示。`
  }));

  await page.route(`${BASE_URL}/api/**`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path === '/api/sessions') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify([session]) });
      return;
    }
    if (path === '/api/config/models') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ deepseek: 'DeepSeek' }) });
      return;
    }
    if (path === '/api/config/custom-models') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ customModels: [] }) });
      return;
    }
    if (path === '/api/rag/collections') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }
    if (path === `/api/sessions/${session.id}/messages`) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'user-1',
            session_id: session.id,
            role: 'user',
            content: '请总结 RAG 策略',
            created_at: 1,
            reasoning_content: '',
            model_provider: 'deepseek',
            status: 'completed',
            sources: []
          },
          {
            id: 'assistant-1',
            session_id: session.id,
            role: 'assistant',
            content: '可以参考第一个来源 [1]，也可以直接查看第四个来源 [4]。',
            created_at: 2,
            reasoning_content: '',
            model_provider: 'deepseek',
            status: 'completed',
            sources
          }
        ])
      });
      return;
    }

    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: path }) });
  });

  await page.goto(`${BASE_URL}/chat/${session.id}`);
  await expect(page.locator('.source-status')).toHaveText('已检索到 4 条来源');
  await expect(page.locator('.source-chip')).toHaveCount(3);

  await page.locator('.citation-link', { hasText: '[4]' }).click();
  await expect(page.locator('.source-chip')).toHaveCount(4);
  await expect(page.locator('.source-chip').nth(3)).toHaveAttribute('open', '');
  await expect(page.locator('.source-chip').nth(3).locator('.source-full-content')).toContainText('完整片段内容');
});
