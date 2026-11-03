import { chromium } from 'playwright';
const url = process.env.URL ?? 'http://127.0.0.1:3137/';
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
  await page.waitForTimeout(600);
};

await page.goto(url);
await page.waitForSelector('button.list-item');

// монета
await openAt('34');
console.log('кнопка 34:', await page.locator('button.choice').allInnerTexts());
await page.screenshot({ path: 'shot-roll-coin-before.png' });
await page.locator('button.choice').first().click();
await page.waitForTimeout(400);
console.log('во время броска:', await page.locator('.roll-caption').innerText(), '| лицо:', await page.locator('.roll-coin').innerText());
await page.screenshot({ path: 'shot-roll-coin.png' });
await page.waitForTimeout(1200);
console.log('результат:', await page.locator('.roll-caption').innerText());
await page.screenshot({ path: 'shot-roll-coin-result.png' });
await page.waitForTimeout(1500);
console.log('после броска:', (await page.locator('.title-line').innerText()).split('\n')[0]);

// кубик
await openAt('5');
console.log('кнопка 5:', await page.locator('button.choice').allInnerTexts());
await page.locator('button.choice').first().click();
await page.waitForTimeout(1500);
console.log('результат кубика:', await page.locator('.roll-caption').innerText());
await page.screenshot({ path: 'shot-roll-die.png' });

await browser.close();
