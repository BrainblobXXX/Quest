import { chromium } from 'playwright';

const url = process.env.URL ?? 'http://127.0.0.1:3131/';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const track = () => page.evaluate(() => document.documentElement.dataset.track ?? 'тишина');
const settings = () => page.evaluate(() => localStorage.getItem('quest:settings'));

await page.goto(url);
await page.waitForSelector('button.list-item');
await page.screenshot({ path: 'shot-steel-library.png' });

await page.getByRole('button', { name: /Стань стальной/i }).click();
await page.waitForTimeout(800);
console.log('крыса, пролог:', await track());

// кнопка музыки
console.log('до нажатия aria-pressed:', await page.locator('.music-btn').getAttribute('aria-pressed'));
await page.locator('.music-btn').click();
await page.waitForTimeout(300);
console.log('после нажатия:', await page.locator('.music-btn').getAttribute('aria-pressed'), '| настройки:', await settings());
await page.screenshot({ path: 'shot-steel-game.png' });

// выключенная музыка переживает перезагрузку
await page.reload();
await page.waitForSelector('button.list-item');
await page.getByRole('button', { name: /Стань стальной/i }).click();
await page.waitForTimeout(700);
console.log('после перезагрузки aria-pressed:', await page.locator('.music-btn').getAttribute('aria-pressed'));

// загрузка сохранения на главе 232 — музыка должна быть
await page.evaluate(() => {
  localStorage.setItem('quest:save:steel-rat', JSON.stringify({
    game: 'steel-rat', format: 'quest/1', scene: '232',
    inventory: { sword: 1, smoke_grenades: 2, sleep_grenades: 2 },
    flags: [], stats: {}, visited: ['232'], updated: new Date().toISOString(),
  }));
  localStorage.setItem('quest:settings', JSON.stringify({ sound: true, music: true }));
});
await page.reload();
await page.waitForSelector('button.list-item');
await page.getByRole('button', { name: /Стань стальной/i }).click();
await page.waitForTimeout(800);
console.log('глава 232:', await track());

await browser.close();
