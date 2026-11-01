import { chromium } from 'playwright';

const url = process.env.URL ?? 'http://127.0.0.1:3100/';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.goto(url);
await page.waitForSelector('button.list-item');
await page.getByRole('button', { name: /Стань стальной/i }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: 'shot-ill-0.png' });

for (const scene of ['30', '42', '62']) {
  await page.evaluate((s) => {
    localStorage.setItem('quest:save:steel-rat', JSON.stringify({
      game: 'steel-rat', format: 'quest/1', scene: s,
      inventory: { sword: 1, smoke_grenades: 2, sleep_grenades: 2 },
      flags: [], stats: {}, visited: [s], updated: new Date().toISOString(),
    }));
  }, scene);
  await page.reload();
  await page.waitForSelector('button.list-item');
  await page.getByRole('button', { name: /Стань стальной/i }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `shot-ill-${scene}.png` });
}

await browser.close();
console.log('ok');
