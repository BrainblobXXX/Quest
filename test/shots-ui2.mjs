import { chromium, devices } from 'playwright';

const url = process.env.URL ?? 'http://127.0.0.1:3122/';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.goto(url);
await page.waitForSelector('button.list-item');
await page.getByRole('button', { name: /Стань стальной/i }).click();
await page.waitForTimeout(500);

// инвентарь — раскрыть
await page.locator('.inventory-toggle').click();
await page.waitForTimeout(200);
await page.screenshot({ path: 'shot-inv-desktop.png' });
await page.locator('.inventory-toggle').click();

// перезапуск через кнопку питания
await page.locator('.power-btn').click();
await page.waitForTimeout(200);
await page.screenshot({ path: 'shot-power-confirm.png' });
await page.locator('.confirm-box .choice').nth(1).click();

// прокрутка → библиотека → игра: позиция должна сохраниться
const scroller = page.locator('.scene-scroll');
await scroller.evaluate((el) => { el.scrollTop = 120; });
const before = await scroller.evaluate((el) => el.scrollTop);
await page.locator('.panel-btn').first().click(); // движок
await page.waitForTimeout(200);
await page.locator('.panel-btn').nth(1).click(); // игра
await page.waitForTimeout(300);
const after = await scroller.evaluate((el) => el.scrollTop);
console.log('скролл: до', before, 'после возврата', after);

// новая сцена — прокрутка наверх
await page.locator('.scene-scroll').evaluate((el) => { el.scrollTop = 120; });
await page.getByRole('button', { name: /ДАЛЕЕ/i }).click();
await page.waitForTimeout(400);
const newScene = await page.locator('.scene-scroll').evaluate((el) => el.scrollTop);
console.log('скролл в новой сцене:', newScene);

// мобильный инвентарь
const phone = await browser.newPage({ ...devices['iPhone 13'] });
await phone.goto(url);
await phone.waitForSelector('button.list-item');
await phone.getByRole('button', { name: /Стань стальной/i }).click();
await phone.waitForTimeout(500);
await phone.locator('.inventory-toggle').click();
await phone.waitForTimeout(200);
await phone.screenshot({ path: 'shot-inv-mobile.png' });

await browser.close();
console.log('ok');
