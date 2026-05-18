import { test, expect } from '@playwright/test';

test('能发消息并收到 AI 回复', async ({ page }) => {
  page.on('console', msg => {
    if (msg.text().includes('[stream]') || msg.type() === 'error') {
      console.log(`[browser ${msg.type()}]`, msg.text());
    }
  });

  await page.goto('http://localhost:5173');
  await page.waitForURL(/\/chat\/.+/, { timeout: 10000 });

  const input = page.locator('input[type="text"]').first();
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
