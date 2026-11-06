import { chromium } from 'playwright';

const url = process.env.URL ?? 'http://127.0.0.1:3129/';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const track = () => page.evaluate(() => document.documentElement.dataset.track ?? 'тишина');

await page.goto(url);
await page.waitForSelector('.lib-table');

// «Стань стальной крысой!» — moods с реальными треками
await page.keyboard.press('1');
await page.waitForSelector('.title-line');
await page.waitForTimeout(700);
console.log('стальная крыса, пролог:', await track());
await page.keyboard.press('Enter');
await page.waitForTimeout(700);
console.log('стальная крыса, следующая сцена:', await track());

// «Кровь зомби» — moods объявлены, но все null → музыки быть не должно
await page.keyboard.press('Escape');
await page.waitForSelector('.lib-table');
await page.keyboard.press('2');
await page.waitForSelector('.title-line');
await page.waitForTimeout(700);
console.log('кровь зомби (moods null):', await track());

await browser.close();
