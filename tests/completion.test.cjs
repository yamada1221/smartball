const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

for (const [stage, name] of ['EASY', 'NORMAL', 'VERY HARD'].entries()) {
  test(`${name}: AI AUTO fills all 16 holes with exactly 16 consecutive shots`, { timeout: 180000 }, async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://smartball.test/**', route => route.fulfill({ contentType: 'text/html', body: html }));
      await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
      await page.goto('https://smartball.test/');
      await page.locator('#stageSelect').selectOption(String(stage));
      await page.clock.pauseAt(new Date('2026-01-01T00:01:00Z'));
      // Observe the real HUD only. Never replace physics, trajectories, AI, or filled-hole state.
      await page.evaluate(() => {
        window.completionObservation = { shots: 0, cups: 0, progress: [] };
        const state = window.completionObservation;
        let previousBalls = Number(document.getElementById('balls').textContent);
        const observer = new MutationObserver(records => {
          for (const record of records) {
            const text = Array.from(record.addedNodes, node => node.textContent).join('');
            if (record.target.id === 'balls') {
              const balls = Number(text);
              if (Number.isFinite(balls)) {
                if (balls < previousBalls) state.shots += previousBalls - balls;
                previousBalls = balls;
              }
            } else if (record.target.id === 'cupStatus') {
              const cups = Number(text.match(/CUPS (\d+)\/16/)?.[1]);
              if (cups > state.cups) {
                state.cups = cups;
                state.progress.push({ cups, shots: state.shots });
              }
            }
          }
        });
        observer.observe(document.getElementById('balls'), { childList: true });
        observer.observe(document.getElementById('cupStatus'), { childList: true });
      });
      await page.locator('#aiAuto').dispatchEvent('click');
      let result;
      for (let second = 0; second < 360; second++) {
        // runFor executes every animation frame; fastForward would skip frames.
        await page.clock.runFor(1000);
        result = await page.evaluate(() => window.completionObservation);
        if (result.cups === 16 || result.shots > 16) break;
      }
      console.log(`${name}: ${JSON.stringify(result)}`);
      assert.equal(result.cups, 16, 'all holes must fill without resetting the board');
      assert.equal(result.shots, 16, 'misses or retries must not be hidden by bonus balls');
      assert.deepEqual(result.progress.map(step => step.cups), Array.from({ length: 16 }, (_, i) => i + 1));
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });
}
