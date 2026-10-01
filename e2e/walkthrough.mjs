// End-to-end walkthrough of the web build: onboarding → every tab → key detail screens, light and dark.
// Usage: node e2e/walkthrough.mjs [webUrl] [outDir]   (API must be running on :4000, web build served on webUrl)
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require('/opt/node-tools/node_modules/playwright');
}

const WEB = process.argv[2] ?? 'http://localhost:8081';
const OUT = process.argv[3] ?? new URL('./screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const phone = `9${Math.floor(100000000 + Math.random() * 899999999)}`;
const errors = [];
const browser = await playwright.chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'light' });
const page = await context.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});
page.on('response', (r) => {
  if (r.url().includes(':4000') && r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`);
});

let n = 0;
const shot = async (name, opts = {}) => {
  n += 1;
  const file = `${OUT}/${String(n).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: file, ...opts });
  console.log('shot', file);
};
const text = (t) => page.getByText(t, { exact: false }).filter({ visible: true }).first();
const step = async (label, fn) => {
  try {
    await fn();
  } catch (e) {
    errors.push(`step "${label}" failed: ${e.message.split('\n')[0]}`);
    await shot(`FAILED-${label.replace(/\W+/g, '-')}`);
    throw e;
  }
};

try {
  await step('splash', async () => {
    await page.goto(WEB);
    await text('Finance Buddy').waitFor();
    await page.waitForTimeout(350);
    await shot('splash');
  });
  await step('phone', async () => {
    await text('all in one place').waitFor({ timeout: 15000 });
    await page.getByLabel('Mobile number').filter({ visible: true }).last().fill(phone);
    await page.waitForTimeout(300);
    await shot('phone');
    await page.getByRole('button', { name: 'Continue' }).filter({ visible: true }).last().click();
  });
  await step('otp', async () => {
    await text('Verify your number').waitFor();
    await page.getByLabel('One-time code').filter({ visible: true }).last().fill('123');
    await shot('otp');
    await page.getByLabel('One-time code').filter({ visible: true }).last().fill('123456');
  });
  await step('discover', async () => {
    await text('Finding your').waitFor();
    await page.waitForTimeout(500);
    await shot('discover');
  });
  await step('accounts', async () => {
    await text('We found your').waitFor({ timeout: 20000 });
    await text('Savings Account').waitFor();
    await shot('accounts');
    await page.getByRole('button', { name: /Continue \(\d+ selected\)/ }).filter({ visible: true }).last().click();
  });
  await step('consent', async () => {
    await text('What you’ll share').waitFor();
    await page.waitForTimeout(400);
    await shot('consent');
    await page.getByRole('button', { name: 'Approve & connect' }).filter({ visible: true }).last().click();
  });
  await step('sync', async () => {
    await text('Understanding').waitFor();
    await page.waitForTimeout(700);
    await shot('sync');
  });
  await step('success', async () => {
    await text('You’re all set').waitFor({ timeout: 30000 });
    await page.waitForTimeout(400);
    await shot('success');
    await page.getByRole('button', { name: 'Continue' }).filter({ visible: true }).last().click();
  });
  await step('home', async () => {
    await text('Total Balance').waitFor({ timeout: 15000 });
    await text('This Month').waitFor();
    await page.waitForTimeout(900);
    await shot('home-light');
    await shot('home-light-full', { fullPage: true });
  });
  await step('send-sheet', async () => {
    await page.getByRole('button', { name: 'Send' }).filter({ visible: true }).last().click();
    await text('Send money').waitFor();
    await shot('send-sheet');
    await page.getByRole('button', { name: 'Close' }).filter({ visible: true }).last().click();
  });
  await step('activity', async () => {
    await page.getByRole('tab', { name: 'Activity' }).filter({ visible: true }).last().click();
    await text('Transactions').waitFor();
    await page.waitForTimeout(600);
    await shot('activity');
  });
  await step('txn-detail', async () => {
    await page.getByRole('button', { name: /Swiggy|Zomato|Blinkit|A2B/ }).filter({ visible: true }).last().click();
    await text('Details').waitFor();
    await page.waitForTimeout(300);
    await shot('transaction-detail');
    await page.getByRole('button', { name: /^Category:/ }).filter({ visible: true }).last().click();
    await text('Use for all').waitFor();
    await shot('category-sheet');
    await page.getByRole('button', { name: 'Close' }).filter({ visible: true }).last().click();
    await page.getByLabel('Go back').filter({ visible: true }).last().click();
  });
  await step('si', async () => {
    await page.getByRole('tab', { name: 'SI' }).filter({ visible: true }).last().click();
    await text('Super Intelligence').waitFor();
    await page.waitForTimeout(500);
    await shot('si');
    await page.getByRole('button', { name: 'Show my subscription payments' }).filter({ visible: true }).last().click();
    await text('subscriptions found').waitFor({ timeout: 15000 });
    await page.waitForTimeout(400);
    await shot('si-answer');
    await page.getByLabel('Ask SI a question').filter({ visible: true }).last().fill('Can I afford ₹30,000?');
    await page.getByLabel('Send').filter({ visible: true }).last().click();
    await text('safety buffer').waitFor({ timeout: 15000 });
    await page.waitForTimeout(400);
    await shot('si-afford');
  });
  await step('wealth', async () => {
    await page.getByRole('tab', { name: 'Wealth' }).filter({ visible: true }).last().click();
    await text('Total Net Worth').waitFor();
    await page.waitForTimeout(900);
    await shot('wealth');
    await shot('wealth-full', { fullPage: true });
  });
  await step('plan-goal', async () => {
    await page.getByRole('tab', { name: 'Plan' }).filter({ visible: true }).last().click();
    await text('Projection').waitFor();
    await page.getByRole('button', { name: 'Add a New Goal' }).filter({ visible: true }).last().click();
    await text('New goal').waitFor();
    await page.getByRole('button', { name: 'Emergency Fund' }).filter({ visible: true }).last().click();
    await page.getByRole('button', { name: '₹5L' }).filter({ visible: true }).last().click();
    await page.getByRole('button', { name: /reaches it on time/ }).filter({ visible: true }).last().click();
    await shot('goal-new');
    await page.getByRole('button', { name: 'Create goal' }).filter({ visible: true }).last().click();
    await text('Emergency Fund').waitFor();
    await page.waitForTimeout(800);
    await shot('plan-goals');
  });
  await step('forecast', async () => {
    await page.getByRole('tab', { name: 'Forecast' }).filter({ visible: true }).last().click();
    await text('How we got this').waitFor();
    await page.waitForTimeout(800);
    await shot('plan-forecast');
  });
  await step('budget', async () => {
    await page.getByRole('tab', { name: 'Budget' }).filter({ visible: true }).last().click();
    await text('Add a budget').waitFor();
    await page.getByRole('button', { name: /Food/ }).filter({ visible: true }).last().click();
    await page.getByPlaceholder('5000').filter({ visible: true }).last().fill('8000');
    await page.getByRole('button', { name: 'Save budget' }).filter({ visible: true }).last().click();
    await text(' left').waitFor();
    await shot('plan-budget');
  });
  await step('accounts-screen', async () => {
    await page.getByRole('tab', { name: 'Home' }).filter({ visible: true }).last().click();
    await page.getByRole('button', { name: 'View Accounts' }).filter({ visible: true }).last().click();
    await text('Total in bank accounts').waitFor();
    await page.waitForTimeout(400);
    if (await page.getByText('Balance mismatch').filter({ visible: true }).count()) errors.push('an account failed reconciliation');
    await shot('accounts-consents');
    await page.getByLabel('Go back').filter({ visible: true }).last().click();
  });
  await step('notifications', async () => {
    await page.getByRole('button', { name: /^Notifications/ }).filter({ visible: true }).last().click();
    await text('Notifications').waitFor();
    await page.waitForTimeout(500);
    await shot('notifications');
    await page.getByLabel('Go back').filter({ visible: true }).last().click();
  });
  await step('dark', async () => {
    await page.getByRole('button', { name: 'Profile and settings' }).filter({ visible: true }).last().click();
    await text('Appearance').waitFor();
    await shot('settings');
    await page.getByRole('tab', { name: 'Dark' }).filter({ visible: true }).last().click();
    await page.waitForTimeout(300);
    await page.getByLabel('Go back').filter({ visible: true }).last().click();
    await text('Total Balance').waitFor();
    await page.waitForTimeout(800);
    await shot('home-dark');
    await page.getByRole('tab', { name: 'Activity' }).filter({ visible: true }).last().click();
    await page.waitForTimeout(800);
    await shot('activity-dark');
    await page.getByRole('tab', { name: 'SI' }).filter({ visible: true }).last().click();
    await page.waitForTimeout(800);
    await shot('si-dark');
    await page.getByRole('tab', { name: 'Wealth' }).filter({ visible: true }).last().click();
    await page.waitForTimeout(1000);
    await shot('wealth-dark');
    await page.getByRole('tab', { name: 'Plan' }).filter({ visible: true }).last().click();
    await page.waitForTimeout(1000);
    await shot('plan-dark');
  });
} catch {
  // recorded in errors
} finally {
  await browser.close();
}

console.log(`\nphone used: ${phone}`);
if (errors.length) {
  console.log(`\n${errors.length} problem(s):`);
  for (const e of [...new Set(errors)]) console.log(' -', e);
  process.exitCode = 1;
} else {
  console.log('\nWalkthrough completed with no runtime errors.');
}
