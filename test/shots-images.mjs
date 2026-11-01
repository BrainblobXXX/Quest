import { chromium } from 'playwright';

const url = process.env.URL ?? 'http://127.0.0.1:3100/';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.goto(url);
await page.waitForSelector('button.list-item');
await page.locator('button.list-item').first().click();
await page.waitForTimeout(400);
await page.screenshot({ path: 'shot-scene1.png' });

await page.locator('button.choice').first().click();
await page.waitForTimeout(300);
await page.screenshot({ path: 'shot-scene2.png' });

// вариант «крупнее»: кадр 60% высоты
await page.addStyleTag({ content: '.scene-image { height: 60% !important; }' });
await page.waitForTimeout(200);
await page.screenshot({ path: 'shot-scene2-big.png' });

await browser.close();
console.log('ok');
