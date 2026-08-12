import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const screenshotRoot = path.join(root, 'qa', 'screenshots');
const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4173/mini';
const slugs = [
  '3-minute-brain-check',
  'schulte-speed',
  'reaction-duel',
  'memory-matrix',
  'stroop-challenge',
  'n-back-daily',
  'impulse-control',
  'tower-puzzle',
  'focus-defender',
];
const requestedSlug = process.env.QA_SLUG;
const selectedSlugs = requestedSlug ? slugs.filter((slug) => slug === requestedSlug) : slugs;
const useLocalPreview = !process.env.QA_BASE_URL;

if (requestedSlug && selectedSlugs.length === 0) {
  throw new Error(`Unknown QA_SLUG: ${requestedSlug}`);
}

await mkdir(screenshotRoot, { recursive: true });

const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const preview = useLocalPreview
  ? spawn(process.execPath, [viteBin, 'preview', '--host', '127.0.0.1', '--port', '4173'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  : null;

let previewLog = '';
preview?.stdout.on('data', (chunk) => { previewLog += chunk.toString(); });
preview?.stderr.on('data', (chunk) => { previewLog += chunk.toString(); });

async function waitForServer() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Local preview did not start.\n${previewLog}`);
}

function chromeExecutable() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  return candidates.find(existsSync);
}

async function waitUnlocked(page, selector) {
  await page.waitForFunction((rawSelector) => {
    const element = document.querySelector(rawSelector);
    return element instanceof HTMLButtonElement && !element.disabled;
  }, selector, { timeout: 5_000 });
}

async function completeBrainCheck(page) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.locator('.brain-reaction.ready').waitFor({ timeout: 4_000 });
    await page.locator('.brain-reaction').click();
  }
  await page.waitForFunction(() => document.querySelectorAll('.mini-matrix button.active').length > 0);
  const targets = await page.locator('.mini-matrix button').evaluateAll((nodes) => nodes
    .map((node, index) => node.classList.contains('active') ? index : -1)
    .filter((index) => index >= 0));
  await waitUnlocked(page, '.mini-matrix button');
  for (const index of targets) await page.locator('.mini-matrix button').nth(index).click();
  await page.locator('.stroop-word').waitFor();
  for (let round = 0; round < 3; round += 1) {
    const className = await page.locator('.stroop-word').getAttribute('class');
    const color = className?.match(/ink-(red|blue|green|yellow)/)?.[1];
    if (!color) throw new Error('Brain Check: Stroop color was not detected.');
    await waitUnlocked(page, `.color-${color}`);
    await page.locator(`.color-${color}`).click();
  }
  await page.locator('.control-signal').waitFor();
  for (let round = 0; round < 4; round += 1) {
    const className = await page.locator('.control-signal').getAttribute('class');
    const label = className?.includes(' go') ? 'Tap' : 'Stop';
    const button = page.getByRole('button', { name: label, exact: true });
    await button.waitFor();
    await page.waitForFunction((text) => {
      const element = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim() === text);
      return element instanceof HTMLButtonElement && !element.disabled;
    }, label);
    await button.click();
  }
}

async function completeSchulte(page) {
  for (let number = 1; number <= 25; number += 1) {
    await page.getByRole('button', { name: String(number), exact: true }).click();
  }
}

async function completeReaction(page) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.locator('.reaction-field.ready').waitFor({ timeout: 4_000 });
    await page.locator('.reaction-field').click();
  }
}

async function completeMemory(page) {
  for (let round = 0; round < 2; round += 1) {
    await page.waitForFunction(() => {
      const grid = document.querySelector('.matrix-grid.phase-showing');
      return Boolean(grid && grid.querySelectorAll('.matrix-cell.active').length);
    });
    const targets = await page.locator('.matrix-cell').evaluateAll((nodes) => nodes
      .map((node, index) => node.classList.contains('active') ? index : -1)
      .filter((index) => index >= 0));
    await page.locator('.matrix-grid.phase-input').waitFor();
    for (const index of targets) await page.locator('.matrix-cell').nth(index).click();
  }
}

async function completeStroop(page) {
  for (let round = 0; round < 5; round += 1) {
    const className = await page.locator('.stroop-word').getAttribute('class');
    const color = className?.match(/ink-(red|blue|green|yellow)/)?.[1];
    if (!color) throw new Error('Stroop color was not detected.');
    await waitUnlocked(page, `.color-${color}`);
    await page.locator(`.color-${color}`).click();
  }
}

async function completeNBack(page) {
  const button = page.getByRole('button', { name: 'Different', exact: true });
  for (let round = 0; round < 6; round += 1) {
    await waitUnlocked(page, '.choice-button');
    await button.click();
  }
}

async function completeGoNoGo(page) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline && await page.locator('.result-card').count() === 0) {
    await page.waitForFunction(() => {
      if (document.querySelector('.result-card')) return true;
      const field = document.querySelector('.gonogo-field');
      return Boolean(field?.classList.contains('go') || field?.classList.contains('nogo'));
    }, null, { timeout: 4_000 });
    if (await page.locator('.result-card').count()) break;
    const className = await page.locator('.gonogo-field').getAttribute('class');
    if (className?.includes(' go')) await page.locator('.gonogo-field').click();
    await page.waitForFunction(() => {
      const field = document.querySelector('.gonogo-field');
      return Boolean(document.querySelector('.result-card') || field?.classList.contains('hidden'));
    }, null, { timeout: 4_000 });
  }
  if (await page.locator('.result-card').count() === 0) {
    throw new Error('Impulse Control did not reach the result screen.');
  }
}

async function completeTower(page) {
  const moves = [[0, 2], [0, 1], [2, 1], [0, 2], [1, 0], [1, 2], [0, 2]];
  for (const [from, to] of moves) {
    await page.locator('.tower-peg').nth(from).click();
    await page.locator('.tower-peg').nth(to).click();
  }
}

async function completeFlanker(page) {
  const deadline = Date.now() + 6_000;
  while (Date.now() < deadline && await page.locator('.result-card').count() === 0) {
    await page.waitForFunction(() => {
      if (document.querySelector('.result-card')) return true;
      return [...document.querySelectorAll('.choice-button')].some((element) => element instanceof HTMLButtonElement && !element.disabled);
    });
    if (await page.locator('.result-card').count()) break;
    const direction = (await page.locator('.flanker-stimulus .center').textContent())?.trim();
    if (direction !== '←' && direction !== '→') throw new Error('Flanker direction was not detected.');
    const accessibleName = direction === '←' ? 'Left' : 'Right';
    try {
      await page.getByRole('button', { name: accessibleName, exact: true }).click({ timeout: 1_000 });
    } catch (error) {
      if (await page.locator('.result-card').count() === 0) throw error;
      break;
    }
    await page.waitForTimeout(40);
  }
}

const completers = {
  '3-minute-brain-check': completeBrainCheck,
  'schulte-speed': completeSchulte,
  'reaction-duel': completeReaction,
  'memory-matrix': completeMemory,
  'stroop-challenge': completeStroop,
  'n-back-daily': completeNBack,
  'impulse-control': completeGoNoGo,
  'tower-puzzle': completeTower,
  'focus-defender': completeFlanker,
};

async function viewportMetrics(page) {
  return page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    innerHeight: window.innerHeight,
    scrollHeight: document.documentElement.scrollHeight,
  }));
}

function assertNoHorizontalOverflow(slug, state, metrics) {
  if (metrics.scrollWidth > metrics.innerWidth + 1) {
    throw new Error(`${slug} (${state}) overflows horizontally: ${metrics.scrollWidth}px > ${metrics.innerWidth}px.`);
  }
}

let browser;
try {
  await waitForServer();
  const executablePath = chromeExecutable();
  browser = await chromium.launch(executablePath ? { headless: true, executablePath } : { headless: true });
  const hubPage = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: 'dark', locale: 'en-US' });
  const hubErrors = [];
  hubPage.on('console', (message) => { if (message.type() === 'error') hubErrors.push(message.text()); });
  hubPage.on('pageerror', (error) => hubErrors.push(error.message));
  hubPage.on('response', (response) => { if (response.status() >= 400) hubErrors.push(`${response.status()} ${response.url()}`); });
  await hubPage.goto(`${baseUrl}/?platform=web`, { waitUntil: 'networkidle' });
  const hubLanguage = await hubPage.locator('html').getAttribute('lang');
  if (hubLanguage !== 'en') throw new Error(`Default document language is ${hubLanguage ?? 'missing'} instead of en.`);
  await hubPage.locator('.game-grid').waitFor();
  const hubCardCount = await hubPage.locator('.game-card').count();
  if (hubCardCount !== 9) throw new Error(`Hub contains ${hubCardCount} cards instead of 9.`);
  const hubMetrics = await viewportMetrics(hubPage);
  assertNoHorizontalOverflow('hub', 'mobile', hubMetrics);
  await hubPage.screenshot({ path: path.join(screenshotRoot, 'hub--mobile.png'), fullPage: true });
  if (hubErrors.length) throw new Error(`Hub browser errors:\n${hubErrors.join('\n')}`);
  await hubPage.close();

  const desktopPage = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark', locale: 'en-US' });
  await desktopPage.goto(`${baseUrl}/?platform=web`, { waitUntil: 'networkidle' });
  await desktopPage.locator('.game-grid').waitFor();
  const desktopMetrics = await viewportMetrics(desktopPage);
  assertNoHorizontalOverflow('hub', 'desktop', desktopMetrics);
  await desktopPage.screenshot({ path: path.join(screenshotRoot, 'hub--desktop.png'), fullPage: true });
  await desktopPage.close();

  const report = [];

  for (const slug of selectedSlugs) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: 'dark', locale: 'en-US' });
    const browserErrors = [];
    page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });
    page.on('pageerror', (error) => browserErrors.push(error.message));
    page.on('response', (response) => { if (response.status() >= 400) browserErrors.push(`${response.status()} ${response.url()}`); });

    await page.goto(`${baseUrl}/${slug}/?fast=1&platform=web`, { waitUntil: 'networkidle' });
    await page.locator('.intro-card').waitFor();
    const introMetrics = await viewportMetrics(page);
    assertNoHorizontalOverflow(slug, 'intro', introMetrics);
    await page.screenshot({ path: path.join(screenshotRoot, `${slug}--intro.png`), fullPage: false });

    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await page.locator('.game-stage').waitFor();
    await page.waitForTimeout(90);
    const playMetrics = await viewportMetrics(page);
    assertNoHorizontalOverflow(slug, 'play', playMetrics);
    await page.screenshot({ path: path.join(screenshotRoot, `${slug}--play.png`), fullPage: false });

    await completers[slug](page);
    await page.locator('.result-card').waitFor({ timeout: 10_000 });
    const ctaHref = await page.locator('a.full-app').getAttribute('href');
    if (!ctaHref) throw new Error(`${slug} result is missing the PsyGames download CTA.`);
    const ctaUrl = new URL(ctaHref);
    if (ctaUrl.origin + ctaUrl.pathname !== 'https://psy-games.pro/download/' ||
        ctaUrl.searchParams.get('utm_source') !== 'web' ||
        ctaUrl.searchParams.get('utm_medium') !== 'miniapp' ||
        ctaUrl.searchParams.get('utm_campaign') !== slug) {
      throw new Error(`${slug} has an invalid conversion URL: ${ctaHref}`);
    }
    const resultMetrics = await viewportMetrics(page);
    assertNoHorizontalOverflow(slug, 'result', resultMetrics);
    await page.screenshot({ path: path.join(screenshotRoot, `${slug}--result.png`), fullPage: false });

    if (browserErrors.length) throw new Error(`${slug} browser errors:\n${browserErrors.join('\n')}`);
    report.push({ slug, states: ['intro', 'play', 'result'], ctaHref, introMetrics, playMetrics, resultMetrics, browserErrors });
    await page.close();
  }

  await writeFile(path.join(root, 'qa', 'mobile-report.json'), `${JSON.stringify({ viewport: '390x844', hub: { cards: hubCardCount, mobileMetrics: hubMetrics, desktopMetrics }, passed: report.length, report }, null, 2)}\n`, 'utf8');
  console.log(`Responsive QA passed: hub + ${report.length}/${selectedSlugs.length} games, intro/play/result, 390x844; desktop hub 1440x900.`);
} finally {
  if (browser) await browser.close();
  preview?.kill();
}
