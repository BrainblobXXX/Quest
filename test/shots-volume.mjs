import { chromium } from 'playwright';

const url = process.env.URL ?? 'http://127.0.0.1:3134/';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.goto(url);
await page.waitForSelector('button.list-item');

const setSlider = async (label, value) => {
  await page.locator(`input[aria-label="${label}"]`).evaluate((el, v) => {
    const input = el;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, String(v));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
};

await setSlider('Громкость музыки', 30);
await setSlider('Громкость звука', 80);
await page.waitForTimeout(300);
console.log('настройки:', await page.evaluate(() => localStorage.getItem('quest:settings')));
await page.screenshot({ path: 'shot-volume.png' });

// после перезагрузки значения сохранены
await page.reload();
await page.waitForSelector('button.list-item');
console.log('музыка:', await page.locator('.volume-value').nth(1).innerText());
console.log('звук:', await page.locator('.volume-value').nth(0).innerText());

await browser.close();
console.log('ok');
