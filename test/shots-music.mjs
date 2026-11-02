import { chromium } from 'playwright';

const url = process.env.URL ?? 'http://127.0.0.1:3129/';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const track = () => page.evaluate(() => document.documentElement.dataset.track ?? 'тишина');

await page.goto(url);
await page.waitForSelector('button.list-item');

// с настроениями
await page.getByRole('button', { name: /Кощеева пещера/i }).click();
await page.waitForTimeout(700);
console.log('пещера, глава 1:', await track());
await page.getByRole('button', { name: /Войти внутрь/i }).click();
await page.waitForTimeout(700);
console.log('пещера, глава 2:', await track());
await page.getByRole('button', { name: /Уйти ни с чем/i }).click();
await page.waitForTimeout(700);
console.log('пещера, глава 5:', await track());

// книга без настроений — музыка не должна появляться
await page.locator('.panel-btn').first().click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: /Стань стальной/i }).click();
await page.waitForTimeout(700);
console.log('стальная крыса (без moods):', await track());

await browser.close();
