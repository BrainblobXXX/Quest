import { chromium } from 'playwright';

const url = process.env.URL ?? 'http://127.0.0.1:3100/';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.goto(url);
await page.waitForSelector('button.list-item');

// пролог → глава 30
await page.getByRole('button', { name: /Стань стальной/i }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: 'shot-fix-prologue.png' });
await page.locator('button.choice').first().click();
await page.waitForTimeout(400);
console.log('после ДАЛЕЕ:', (await page.locator('.title-line').innerText()).replace(/\n/g, ' | '));

// инвентарь и кнопка «заново» на главе 64
await page.evaluate(() => {
  localStorage.setItem('quest:save:steel-rat', JSON.stringify({
    game: 'steel-rat', format: 'quest/1', scene: '64',
    inventory: { sword: 1, smoke_grenades: 2, sleep_grenades: 2 },
    flags: [], stats: {}, visited: ['64'], updated: new Date().toISOString(),
  }));
});
await page.reload();
await page.waitForSelector('button.list-item');
await page.screenshot({ path: 'shot-fix-library.png' });
await page.getByRole('button', { name: /Стань стальной/i }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: 'shot-fix-inventory.png' });

await browser.close();
console.log('ok');
