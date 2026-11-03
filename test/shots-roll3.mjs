import { chromium } from 'playwright';
const url = process.env.URL ?? 'http://127.0.0.1:3138/';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const openAt = async (scene) => {
  await page.evaluate((s) => localStorage.setItem('quest:save:steel-rat', JSON.stringify({
    game: 'steel-rat', format: 'quest/1', scene: s, inventory: { sword: 1 }, flags: [], stats: {},
    visited: [s], updated: new Date().toISOString(),
  })), scene);
  await page.reload();
  await page.waitForSelector('button.list-item');
  await page.getByRole('button', { name: /Стань стальной/i }).click();
  await page.waitForTimeout(500);
};
await page.goto(url);
await page.waitForSelector('button.list-item');
await openAt('34');
await page.screenshot({ path: 'shot-roll-before.png' });
await page.locator('button.choice').first().click();
await page.waitForTimeout(520);
await page.screenshot({ path: 'shot-roll-coin.png' });
await page.waitForTimeout(900);
await page.screenshot({ path: 'shot-roll-coin-result.png' });
await page.waitForTimeout(1200);
await openAt('5');
await page.locator('button.choice').first().click();
await page.waitForTimeout(520);
await page.screenshot({ path: 'shot-roll-die.png' });
await page.waitForTimeout(900);
await page.screenshot({ path: 'shot-roll-die-result.png' });
await browser.close();
