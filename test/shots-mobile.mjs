import { chromium, devices } from 'playwright';

const url = process.env.URL ?? 'http://127.0.0.1:3121/';
const browser = await chromium.launch({ args: ['--no-sandbox'] });

const iphone = await browser.newPage({ ...devices['iPhone 13'] });
await iphone.goto(url);
await iphone.waitForSelector('button.list-item', { timeout: 15000 });
await iphone.screenshot({ path: 'shot-mobile-library.png' });
await iphone.getByRole('button', { name: /Стань стальной/i }).click();
await iphone.waitForTimeout(600);
await iphone.screenshot({ path: 'shot-mobile-game.png' });

const small = await browser.newPage({ viewport: { width: 360, height: 740 } });
await small.goto(url);
await small.waitForSelector('button.list-item', { timeout: 15000 });
await small.getByRole('button', { name: /Стань стальной/i }).click();
await small.waitForTimeout(600);
await small.screenshot({ path: 'shot-mobile-small.png' });

await browser.close();
console.log('ok');
