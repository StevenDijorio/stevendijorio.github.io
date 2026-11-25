import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const [origin, out] = process.argv.slice(2);
await mkdir(out, {recursive:true});
const browser = await chromium.launch({channel:'chrome'});
const checks = [];
const sizes = [[320,568],[375,812],[390,844],[430,932]];
const routes = ['/', '/research/', '/publications/', '/engineering/', '/experience/', '/cv/', '/what_is_beales_sacculi.html'];
try {
  for (const [width,height] of sizes) {
    const context = await browser.newContext({viewport:{width,height}, deviceScaleFactor:2, isMobile:true,
      hasTouch:true, reducedMotion:'reduce'});
    const page = await context.newPage();
    for (const route of routes) {
      const response = await page.goto(origin + route, {waitUntil:'load'});
      assert.equal(response.status(), 200);
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, route);
      const roles = await page.locator('.site-header').boundingBox();
      assert.ok(roles.height >= 56 && roles.height <= 80);
      checks.push({width, height, route, status:'pass'});
    }
    await page.goto(origin + '/');
    const trigger = page.locator('.mobile-menu summary');
    const menu = page.locator('.mobile-menu');
    const buttonSize = await trigger.boundingBox();
    assert.ok(buttonSize.height >= 44 && buttonSize.width >= 44);
    await page.evaluate(() => window.scrollTo(0, 900));
    assert.equal(Math.round((await trigger.boundingBox()).y), 8);
    await trigger.tap();
    assert.equal(await menu.evaluate(element => element.open), true);
    await page.keyboard.press('Escape');
    assert.equal(await menu.evaluate(element => element.open), false);
    assert.equal(await trigger.evaluate(element => element === document.activeElement), true);
    await trigger.tap();
    await menu.getByRole('link',{name:'Contact',exact:true}).tap();
    assert.equal(new URL(page.url()).hash, '#contact');
    assert.equal(await menu.evaluate(element => element.open), false);
    await page.goto(origin + '/research/#bile-duct-oct');
    const header = await page.locator('.site-header').boundingBox();
    const target = await page.locator('#bile-duct-oct').boundingBox();
    assert.ok(target.y > header.height, 'Sticky header must leave the case heading visible.');
    if (width === 375 || width === 390) {
      await page.screenshot({path:out + '/research-' + width + '.png', fullPage:true, scale:'css'});
      await page.goto(origin + '/');
      await page.screenshot({path:out + '/homepage-' + width + '.png', scale:'css'});
      await trigger.tap();
      await page.screenshot({path:out + '/menu-' + width + '.png', scale:'css'});
    }
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(out + '/phone-results.json', JSON.stringify({checks},null,2));
}
console.log(`${checks.length} phone viewport and route checks passed.`);
