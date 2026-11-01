import { chromium } from 'playwright';

const url = process.env.URL ?? 'http://127.0.0.1:3100/';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.goto(url);
await page.waitForSelector('button.list-item');
await page.screenshot({ path: 'shot-library.png' });

await page.getByRole('button', { name: /Стань стальной/i }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: 'shot-book-scene1.png' });

// первый выбор в главе 1
await page.locator('button.choice').first().click();
await page.waitForTimeout(400);
await page.screenshot({ path: 'shot-book-scene2.png' });

const body = await page.locator('.screen-content').innerText();
console.log(body.slice(0, 220).replace(/\n/g, ' | '));
await browser.close();
