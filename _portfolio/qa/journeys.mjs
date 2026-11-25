import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium } from 'playwright';

const [stage, origin, output] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome' });
const desktop = await browser.newContext({ viewport: {width: 1440, height: 900}, acceptDownloads: true });
const mobile = await browser.newContext({ viewport: {width: 375, height: 812}, reducedMotion: 'reduce' });
const page = await desktop.newPage();
const phone = await mobile.newPage();
page.setDefaultTimeout(6000);
phone.setDefaultTimeout(6000);

const visible = async locator => { await locator.waitFor({state:'visible'}); };
const heading = (target, name) => target.getByRole('heading', {name, exact: true}).first();
const link = (target, name) => target.getByRole('link', {name, exact: true}).first();
const open = async (target, route = '/') => {
  const response = await target.goto(origin + route, {waitUntil:'domcontentloaded'});
  assert.equal(response.status(), 200);
};
const journeys = [];
async function check(name, steps, action) {
  try {
    const details = await action();
    journeys.push({name, steps, status: 'pass', details});
  } catch (error) {
    journeys.push({name, steps, status: 'fail', details: error.message});
  }
}
function baseline(name, status, steps, details) { journeys.push({name, status, steps, details}); }

try {
  if (stage === 'before') {
    await open(page);
    await visible(heading(page, 'Steven Di Jorio'));
    baseline('Professional identity', 'partial', 0, 'Name is visible. Hero leads with outdated fellowship positioning and informal branding.');
    await link(page, 'View Research').click();
    await visible(heading(page, 'CURE Undergraduate Research Fellow'));
    baseline('Featured research accomplishment', 'pass', 1, 'Research anchor lands on the CURE fellowship and its project image.');
    assert.equal(await page.locator('a[href*="doi.org"],a[href*="ieeexplore.ieee.org"]').count(), 0);
    baseline('Published paper', 'fail', null, 'No publication navigation or IEEE/DOI link.');
    baseline('Individual research contribution', 'partial', 1, 'Fellowship bullets detail some work; there is no structured case study distinguishing individual and team outcomes.');
    await page.locator('header a[href="#projects"]').first().click();
    await visible(heading(page, 'Projects & Initiatives'));
    baseline('Engineering project', 'partial', 1, 'Projects anchor works, with a brief imaging software description. No substantial hardware or device case study.');
    await page.locator('header a[href="#resume"]').first().click();
    await visible(heading(page, 'Key Skills'));
    baseline('Demonstrated competencies', 'partial', 1, 'Skill tags are visible without direct links to evidence.');
    assert.equal(await page.locator('#resume-link-placeholder').count(), 0);
    assert.equal(await page.locator('a[href="#resume-link-placeholder"]').count(), 1);
    baseline('CV PDF download', 'fail', 2, 'Download link points to an absent fragment.');
    assert.equal(await page.locator('a[href*="linkedin.com"]').count(), 1);
    assert.equal(await page.locator('a[href*="github.com"],a[href*="scholar.google"]').count(), 0);
    baseline('GitHub, LinkedIn, and Google Scholar', 'partial', 1, 'LinkedIn is linked. GitHub and Scholar are absent.');
    await page.locator('header a[href="#contact"]').first().click();
    await visible(page.locator('#contact a[href^="mailto:"]'));
    baseline('Professional contact', 'pass', 1, 'Footer contact and mailto are present.');
    await open(phone);
    await phone.locator('#menu-toggle').click();
    assert.equal(await phone.locator('#mobile-menu a:visible').count(), 5);
    baseline('Mobile navigation', 'pass', 2, 'Menu toggle exposes five section links at 375 px.');
    await open(page, '/what_is_beales_sacculi.html');
    await page.locator('[data-target="definitions"]').click();
    assert.equal(await page.locator('#definitions').evaluate(element => element.classList.contains('active')), true);
    baseline('Interactive research resources', 'pass', 2, 'The peribiliary review loads and the section switch works. Secondary legacy faults are captured separately.');
    await open(page);
    assert.equal(await page.getByText('Pediatric Emergency Medicine', {exact:false}).count(), 0);
    baseline('Pediatric clinical research experience', 'fail', null, 'No PEMRaP or pediatric emergency medicine entry.');
  } else {
    await check('Professional identity', 0, async () => {
      await open(page);
      await visible(heading(page, 'Steven Di Jorio'));
      await visible(page.getByText('Biomedical engineering student and undergraduate researcher', {exact:true}));
      const hero = await heading(page, 'Steven Di Jorio').boundingBox();
      assert.ok(hero && hero.y + hero.height < 900);
      return 'Name and role are visible in the initial desktop viewport.';
    });
    await check('Featured research accomplishment', 1, async () => {
      await open(page);
      await link(page, 'Read the OCT case study').click();
      await visible(heading(page, 'Optical imaging for liver transplantation'));
      assert.equal(new URL(page.url()).hash, '#bile-duct-oct');
      await visible(page.getByText('The team studied 20 donor bile ducts ex vivo', {exact:false}));
      return 'Homepage feature lands at the project outcome and official abstract link.';
    });
    await check('Published paper', 1, async () => {
      await open(page);
      await link(page, 'View citation').click();
      assert.equal(new URL(page.url()).hash, '#neuromorphic-hardware');
      assert.equal(await link(page, 'DOI').getAttribute('href'), 'https://doi.org/10.1109/AIxDKE67294.2026.00035');
      assert.equal(await page.locator('#neuromorphic-hardware .authors strong').textContent(), 'Steven Di Jorio');
      return 'Citation identifies Steven in the ordered byline, with DOI and IEEE links.';
    });
    await check('Individual research contribution', 1, async () => {
      await open(page);
      await link(page, 'Read the OCT case study').click();
      await visible(heading(page.locator('#bile-duct-oct'), 'My contribution'));
      await visible(page.getByText('I processed donor bile duct OCT scans', {exact:false}));
      return 'An explicit contribution section describes processing, annotation, metadata, and boundary review.';
    });
    await check('Engineering project', 1, async () => {
      await open(page);
      await link(page, 'Wearable stretch-sensor prototype').click();
      assert.equal(new URL(page.url()).hash, '#wearable-sensor');
      await visible(page.getByText('I built the team’s Wheatstone-bridge sensor circuit', {exact:false}));
      assert.ok(await page.locator('#wearable-sensor img').evaluate(async img => {await img.decode(); return img.naturalWidth;}));
      return 'Prototype details and real bench image load at the project anchor.';
    });
    await check('Demonstrated competencies', 2, async () => {
      await open(page);
      await link(page, 'Experience').click();
      await link(page, 'Technical competencies').click();
      await visible(heading(page, 'Technical competencies'));
      await visible(link(page, 'Analog hardware case study'));
      return 'Competencies are grouped and linked to their evidence.';
    });
    await check('CV in the browser and PDF download', 2, async () => {
      await open(page);
      await link(page, 'View CV').click();
      await visible(heading(page, 'Research experience'));
      const section = page.getByRole('navigation', {name: 'CV sections'}).getByRole('link', {name: 'Selected scholarly work'});
      await section.focus();
      await page.keyboard.press('Enter');
      assert.equal(new URL(page.url()).hash, '#scholarly-work');
      const [download] = await Promise.all([
        page.waitForEvent('download'), link(page, 'Download CV (PDF)').click(),
      ]);
      const bytes = await readFile(await download.path());
      assert.equal(download.suggestedFilename(), 'steven-di-jorio-cv.pdf');
      assert.equal(bytes.subarray(0,5).toString(), '%PDF-');
      return `Browser downloaded the ${bytes.length}-byte review PDF. Approval of the document is a separate release gate.`;
    });
    await check('GitHub, LinkedIn, and Google Scholar', 0, async () => {
      await open(page);
      for (const [name, expected] of [
        ['GitHub','https://github.com/StevenDijorio'],
        ['LinkedIn','https://www.linkedin.com/in/steven-di-jorio-7634082b1/'],
        ['Google Scholar','https://scholar.google.com/citations?user=Hxj1rXIAAAAJ&hl=en'],
      ]) {
        await visible(link(page, name));
        assert.equal(await link(page, name).getAttribute('href'), expected);
        const box = await link(page, name).boundingBox();
        assert.ok(box && box.y + box.height < 900);
      }
      return 'Three visible hero links match the verified author profiles. External availability is recorded separately.';
    });
    await check('Professional contact', 1, async () => {
      await open(page);
      await link(page, 'Contact').click();
      assert.equal(new URL(page.url()).hash, '#contact');
      const contact = page.locator('#contact').getByRole('link', {name: 'Connect on LinkedIn'});
      await visible(contact);
      assert.match(await contact.getAttribute('href'), /^https:\/\/www\.linkedin\.com\/in\//);
      assert.equal(await page.locator('a[href^="mailto:"], a[href^="tel:"]').count(), 0);
      return 'Header Contact lands on the professional LinkedIn link.';
    });
    await check('Mobile navigation and keyboard focus', 2, async () => {
      for (const [label, path] of [['Research','/research/'],['Publications','/publications/'],
        ['Engineering','/engineering/'],['Experience','/experience/'],['CV','/cv/'],['Contact','/#contact']]) {
        await open(phone, '/engineering/');
        await phone.locator('.mobile-menu summary').click();
        assert.equal(await phone.locator('.mobile-menu').evaluate(element => element.open), true);
        await link(phone.locator('.mobile-menu'), label).click();
        assert.equal(phone.url().slice(origin.length), path);
      }
      await open(phone);
      await phone.keyboard.press('Tab');
      const focus = await phone.evaluate(() => ({target:document.activeElement.textContent.trim(),
        outline:getComputedStyle(document.activeElement).outlineWidth}));
      assert.deepEqual(focus, {target:'Skip to content', outline:'3px'});
      await phone.keyboard.press('Enter');
      assert.equal(await phone.evaluate(() => document.activeElement.id), 'main');
      return 'All six mobile menu destinations work. Keyboard focus and Skip to content were observed.';
    });
    await check('Interactive research resources', 3, async () => {
      await open(page);
      await link(page, 'Read the OCT case study').click();
      await link(page, 'Interactive peribiliary gland review').click();
      await page.locator('#definitions summary').focus();
      await page.keyboard.press('Space');
      assert.equal(await page.locator('#definitions').evaluate(element => element.open), true);
      await visible(link(page, 'Bosselmann et al. · Histopathology study (2020)'));
      await link(page, 'Explore the transplant injury overview').click();
      await link(page, 'Cytomegalovirus and biliary complications').click();
      await visible(heading(page, 'Cytomegalovirus and biliary complications'));
      for (const alias of ['/cystic_dilation_review', '/cystic_dilation_review/']) {
        await page.goto(origin + alias);
        await page.waitForURL(origin + '/what_is_beales_sacculi.html');
      }
      return 'Keyboard disclosure, overview, restored CMV page, and both historic alias forms work.';
    });
    await check('Pediatric clinical research experience', 1, async () => {
      await open(page);
      await link(page, 'Clinical research experience').click();
      assert.equal(new URL(page.url()).hash, '#pemrap');
      await visible(heading(page, 'Student Research Associate'));
      await visible(page.getByText('entry of study data in REDCap', {exact:false}));
      return 'PEMRaP duties and clinical program link are available at a direct anchor.';
    });
  }
} finally {
  await browser.close();
  await mkdir(dirname(output), {recursive:true});
  await writeFile(output, JSON.stringify({stage, origin, journeys}, null, 2));
}
console.log(journeys.map(result => `${result.status.toUpperCase()} ${result.name}`).join('\n'));
if (stage !== 'before' && journeys.some(result => result.status !== 'pass')) process.exitCode = 1;
