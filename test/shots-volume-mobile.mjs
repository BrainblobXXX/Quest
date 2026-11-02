import { chromium, devices } from 'playwright';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ ...devices['iPhone 13'] });
await page.goto('http://127.0.0.1:3134/');
await page.waitForSelector('button.list-item');
await page.screenshot({ path: 'shot-volume-mobile.png' });
await browser.close();
console.log('ok');
