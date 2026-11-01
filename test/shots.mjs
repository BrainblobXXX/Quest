import { chromium } from 'playwright';

const url = process.env.URL ?? 'http://127.0.0.1:3101/';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.goto(url);
await page.waitForSelector('button.list-item', { timeout: 15000 });
await page.waitForTimeout(500);
await page.screenshot({ path: 'shot-library.png' });

await page.locator('button.list-item').first().click();
await page.waitForTimeout(400);
await page.screenshot({ path: 'shot-game.png' });

const mobile = await browser.newPage({ viewport: { width: 420, height: 900 } });
await mobile.goto(url);
await mobile.waitForSelector('button.list-item', { timeout: 15000 });
await mobile.waitForTimeout(400);
await mobile.screenshot({ path: 'shot-mobile.png' });

await browser.close();
console.log('screenshots ready');
