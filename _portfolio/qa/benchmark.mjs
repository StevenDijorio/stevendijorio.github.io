import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const [stage, origin, out] = process.argv.slice(2);
await mkdir(out + '/screenshots', {recursive:true});
await mkdir(out + '/audits', {recursive:true});
const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
const pages = stage === 'before'
  ? ['/', '/what_is_beales_sacculi.html', '/infographic.html']
  : ['/', '/research/', '/publications/', '/engineering/', '/experience/', '/cv/', '/what_is_beales_sacculi.html', '/infographic.html', '/CMVInfection.html', '/criticalresilienceunit.html', '/IRI.html', '/allograftrejection.html', '/NASFormation.html', '/DiagnosticSummary.html', '/brawl.stars.html'];
const results = {stage, origin, browser: browser.version(), viewports: [], accessibility: []};
try {
  for (const width of [375, 768, 1440, 1920]) {
    const context = await browser.newContext({viewport: {width, height: width === 375 ? 812 : 900}, reducedMotion: 'reduce'});
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    for (const path of pages) {
      const errors = [];
      const collect = err => errors.push(err.message);
      page.on('pageerror', collect);
      const response = await page.goto(origin + path, {waitUntil: 'load', timeout: 40000});
      await page.evaluate(() => document.fonts.ready);
      if (path === '/') {
        await page.locator('h1').first().waitFor();
        await page.waitForTimeout(1000);
      }
      const layout = await page.evaluate(async () => {
        const images = await Promise.all([...document.images].map(async image => {
          image.loading = 'eager';
          try { await image.decode(); } catch { /* reported as a missing image */ }
          return {src: image.getAttribute('src'), loaded: image.naturalWidth > 0};
        }));
        return {scrollWidth: document.documentElement.scrollWidth, innerWidth, images,
          h1: document.querySelector('h1')?.textContent.trim() || null};
      });
      results.viewports.push({path, width, status: response.status(), ...layout, errors});
      page.off('pageerror', collect);
      if (path === '/' && [375, 1440].includes(width)) {
        const name = width === 375 ? 'mobile' : 'desktop';
        await page.screenshot({path: out + '/screenshots/' + stage + '-' + name + '.png', animations: 'disabled'});
        if (width === 1440) {
          await page.screenshot({path: out + '/screenshots/' + stage + '-desktop-full.png', fullPage: true, animations: 'disabled'});
        }
      }
      if (stage === 'after' || width === 375 || width === 1440) {
        if (stage === 'after' && path === '/what_is_beales_sacculi.html') {
          await page.locator('details.reading-panel').evaluateAll(items => items.forEach(item => item.open = true));
        }
        const audit = await new AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
        results.accessibility.push({path, width, passed: audit.passes.length, incomplete: audit.incomplete.map(({id}) => id),
          violations: audit.violations.map(({id, impact, description, nodes}) => ({id, impact, description, targets: nodes.map(({target}) => target)}))});
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(out + '/audits/' + stage + '-browser.json', JSON.stringify(results, null, 2));
}
