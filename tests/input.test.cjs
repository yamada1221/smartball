const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
let browser;

before(async () => {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {})
  });
});
after(async () => { await browser?.close(); });

async function withPage(viewport, run) {
  const page = await browser.newPage({ viewport, isMobile: viewport.width < 600 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://smartball.test/**', route => route.fulfill({ contentType: 'text/html', body: html }));
  try {
    await page.goto('https://smartball.test/');
    assert.equal(await page.locator('#balls').textContent(), '40');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await run(page);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
  test(`${viewport.width}px: pointer click and focused Enter each launch exactly one ball`, async () => {
    await withPage(viewport, async page => {
      await page.locator('#launch').click();
      assert.equal(await page.locator('#balls').textContent(), '39');
      await page.reload();
      await page.locator('#launch').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#balls').textContent(), '39');
    });
  });

  test(`${viewport.width}px: editing prevents pointer, keyboard and precision launches`, async () => {
    await withPage(viewport, async page => {
      await page.locator('#editMode').click();
      await page.locator('#launch').click();
      assert.equal(await page.locator('#balls').textContent(), '40');
      await page.locator('#launch').focus();
      await page.keyboard.press('Enter');
      await page.locator('#precisionFire').click();
      assert.equal(await page.locator('#balls').textContent(), '40');
    });
  });

  test(`${viewport.width}px: Enter in a setting does not fire, while normal shortcuts still work`, async () => {
    await withPage(viewport, async page => {
      await page.locator('#precisionPower').fill('75');
      await page.locator('#precisionPower').press('Enter');
      assert.equal(await page.locator('#balls').textContent(), '40');
      await page.locator('#precisionFire').click();
      assert.equal(await page.locator('#balls').textContent(), '39');
      await page.reload();
      await page.evaluate(() => document.activeElement.blur());
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#balls').textContent(), '39');
    });
  });
}
