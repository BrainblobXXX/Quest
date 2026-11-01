import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(process.env.URL ?? 'http://127.0.0.1:3120/');
await page.waitForSelector('button.list-item', { timeout: 15000 });
await page.screenshot({ path: 'shot-deploy.png' });
await browser.close();
console.log('ok');
