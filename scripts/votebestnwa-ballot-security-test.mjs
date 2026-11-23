#!/usr/bin/env node

import { mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const BALLOT_URL = 'https://www.votebestnwa.com/';
const SUCCESS_MESSAGE = 'Congratulations, your ballot has been submitted!';
const DUPLICATE_BALLOT_MESSAGE =
  "It looks like you've recently submitted a ballot. You will not be able to vote again within 24 hours of your last submission.";

const TEST_BALLOT = [
  {
    mainCategory: 'Services',
    subcategory: 'Marketing / Creative Agency',
    nominee: 'Stay Entertained Media',
  },
  {
    mainCategory: 'Motors',
    subcategory: 'Power sports',
    nominee: 'Ozark Powersports',
  },
];

const DEFAULTS = {
  artifactsDir: 'artifacts/votebestnwa-ballot-security-test',
  live: false,
  loop: false,
  pauseSeconds: 0,
  runs: 1,
  timeoutMs: 30_000,
};

function usage() {
  console.log(`
Usage:
  npm run ballot-security-test -- [options]

The test ballot contains only the authorized test entries:
  - Services > Marketing / Creative Agency > Stay Entertained Media
  - Motors > Power sports > Ozark Powersports

Options:
  --runs <number>          Number of fresh-browser test attempts (default: 1)
  --live                   Submit the ballot. Without this, the runner stops before Cast Ballot.
  --loop                   Repeat until interrupted with Ctrl+C (requires --pause-seconds).
  --pause-seconds <number> Delay between runs in seconds (default: 0)
  --timeout-ms <number>    Per-step timeout in milliseconds (default: 30000)
  --artifacts-dir <path>   Directory for screenshots and the report
  --help                   Show this help

Expected live-test result:
  The first valid submission may show the confirmation message. Additional
  fresh-browser attempts should show the 24-hour duplicate-ballot block. A
  second accepted submission is reported as a security failure and stops the run.
`);
}

function requiredInteger(value, name, minimum = 0) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}.`);
  }
  return parsed;
}

function parseArgs(argumentsList) {
  const options = { ...DEFAULTS };

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    const value = argumentsList[index + 1];

    switch (argument) {
      case '--help':
        usage();
        process.exit(0);
        break;
      case '--live':
        options.live = true;
        break;
      case '--loop':
        options.loop = true;
        break;
      case '--runs':
        options.runs = requiredInteger(value, '--runs', 1);
        index += 1;
        break;
      case '--pause-seconds':
        options.pauseSeconds = requiredInteger(value, '--pause-seconds');
        index += 1;
        break;
      case '--timeout-ms':
        options.timeoutMs = requiredInteger(value, '--timeout-ms', 1);
        index += 1;
        break;
      case '--artifacts-dir':
        if (!value || value.startsWith('--')) {
          throw new Error('--artifacts-dir requires a directory path.');
        }
        options.artifactsDir = value;
        index += 1;
        break;
      default:
        throw new Error(`Unknown option: ${argument}`);
    }
  }

  if (options.loop && options.pauseSeconds === 0) {
    throw new Error('--loop requires --pause-seconds greater than 0.');
  }

  return options;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function textMatcher(label) {
  return new RegExp(escapeRegExp(label).replaceAll(' ', '\\s+'), 'i');
}

function filenamePart(value) {
  return value.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
}

async function visibleLocator(locators, description, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    for (const locator of locators) {
      const count = await locator.count();

      for (let index = 0; index < Math.min(count, 20); index += 1) {
        const candidate = locator.nth(index);
        if (await candidate.isVisible().catch(() => false)) {
          return candidate;
        }
      }
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }

  throw new Error(`Timed out waiting for a visible control for ${description}.`);
}

async function clickLabeledControl(page, label, timeoutMs) {
  const matcher = textMatcher(label);
  const candidateLocators = [
    page.getByRole('button', { name: matcher }),
    page.getByRole('link', { name: matcher }),
    page.locator('label').filter({ hasText: matcher }),
    page.getByRole('checkbox', { name: matcher }),
    page.getByRole('radio', { name: matcher }),
    page.getByText(matcher),
  ];

  const candidate = await visibleLocator(candidateLocators, label, timeoutMs);
  await candidate.scrollIntoViewIfNeeded();
  await candidate.click({ timeout: timeoutMs });
}

async function waitForVisibleText(page, label, timeoutMs) {
  await visibleLocator([page.getByText(textMatcher(label))], label, timeoutMs);
}

async function botCheckPresent(page) {
  const selector = [
    'iframe[src*="recaptcha"]',
    'iframe[title*="recaptcha" i]',
    '.g-recaptcha',
    '[data-sitekey]',
    '#challenge-form',
    '[class*="cf-challenge"]',
  ].join(', ');

  const checker = page.locator(selector);
  const count = await checker.count();
  for (let index = 0; index < count; index += 1) {
    if (await checker.nth(index).isVisible().catch(() => false)) {
      return true;
    }
  }

  const pageText = await page.locator('body').innerText().catch(() => '');
  return /verify (you are )?human|security check|unusual traffic|access denied/i.test(pageText);
}

async function throwIfBotCheckPresent(page) {
  if (await botCheckPresent(page)) {
    throw new Error('Bot-check challenge detected. The runner will not bypass or solve it.');
  }
}

async function selectBallotEntry(page, entry, shouldAddAnotherCategory, timeoutMs) {
  await clickLabeledControl(page, entry.mainCategory, timeoutMs);
  await throwIfBotCheckPresent(page);
  await waitForVisibleText(page, entry.subcategory, timeoutMs);

  await clickLabeledControl(page, entry.subcategory, timeoutMs);
  await throwIfBotCheckPresent(page);
  await waitForVisibleText(page, entry.nominee, timeoutMs);

  await clickLabeledControl(page, entry.nominee, timeoutMs);
  await throwIfBotCheckPresent(page);

  if (shouldAddAnotherCategory) {
    const anotherCategory = 'Vote in another main category';
    await waitForVisibleText(page, anotherCategory, timeoutMs);
    await clickLabeledControl(page, anotherCategory, timeoutMs);
  }
}

async function awaitSubmissionResult(page, timeoutMs) {
  await page.waitForFunction(
    ({ successMessage, duplicateMessage }) => {
      const pageText = document.body?.innerText ?? '';
      return pageText.includes(successMessage) || pageText.includes(duplicateMessage);
    },
    { successMessage: SUCCESS_MESSAGE, duplicateMessage: DUPLICATE_BALLOT_MESSAGE },
    { timeout: timeoutMs },
  );

  const pageText = await page.locator('body').innerText();
  if (pageText.includes(SUCCESS_MESSAGE)) {
    return 'accepted';
  }
  if (pageText.includes(DUPLICATE_BALLOT_MESSAGE)) {
    return 'blocked';
  }
  throw new Error('The ballot responded without a recognized result message.');
}

async function saveScreenshot(page, directory, runNumber, state) {
  const filename = `${String(runNumber).padStart(3, '0')}-${filenamePart(state)}.png`;
  const path = resolve(directory, filename);
  await page.screenshot({ path, fullPage: true });
  return path;
}

async function pauseBetweenAttempts(seconds, stopRequested) {
  let remainingMilliseconds = seconds * 1_000;

  while (remainingMilliseconds > 0 && !stopRequested()) {
    const delay = Math.min(remainingMilliseconds, 1_000);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
    remainingMilliseconds -= delay;
  }
}

async function executeAttempt(browser, options, runNumber) {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(BALLOT_URL, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
    await throwIfBotCheckPresent(page);

    for (const [index, entry] of TEST_BALLOT.entries()) {
      await selectBallotEntry(page, entry, index < TEST_BALLOT.length - 1, options.timeoutMs);
    }

    const reviewBallot = 'Review and cast my ballot';
    await waitForVisibleText(page, reviewBallot, options.timeoutMs);
    if (!options.live) {
      const screenshot = await saveScreenshot(page, options.artifactsDir, runNumber, 'dry-run-ready');
      return { runNumber, status: 'dry-run-ready', screenshot };
    }

    await clickLabeledControl(page, reviewBallot, options.timeoutMs);
    await throwIfBotCheckPresent(page);
    await waitForVisibleText(page, 'Submit Ballot', options.timeoutMs);
    await clickLabeledControl(page, 'Submit Ballot', options.timeoutMs);
    const status = await awaitSubmissionResult(page, options.timeoutMs);
    const screenshot = await saveScreenshot(page, options.artifactsDir, runNumber, status);
    return { runNumber, status, screenshot };
  } catch (error) {
    const screenshot = await saveScreenshot(page, options.artifactsDir, runNumber, 'error').catch(() => null);
    const errorPath = resolve(options.artifactsDir, `${String(runNumber).padStart(3, '0')}-error.txt`);
    await writeFile(errorPath, `${error.stack ?? error.message}\n`).catch(() => null);
    return { runNumber, status: 'error', error: error.message, errorPath, screenshot };
  } finally {
    await context.close();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  options.artifactsDir = resolve(options.artifactsDir);
  mkdirSync(options.artifactsDir, { recursive: true });

  console.log(`Running ${options.runs} ballot-security ${options.live ? 'submission' : 'dry-run'} attempt(s).`);
  if (options.loop) {
    console.log(`Loop mode enabled: a new attempt will start every ${options.pauseSeconds} second(s). Press Ctrl+C to stop.`);
  }
  console.log(`Artifacts: ${options.artifactsDir}`);

  const browser = await chromium.launch({
    args: ['--incognito'],
    channel: 'chrome',
    headless: false,
  });
  const results = [];
  let stopRequested = false;
  process.once('SIGINT', () => {
    stopRequested = true;
    console.log('\nStop requested. Finishing the current attempt and writing the report.');
  });

  try {
    for (let runNumber = 1; !stopRequested && (options.loop || runNumber <= options.runs); runNumber += 1) {
      console.log(`Starting attempt ${runNumber}/${options.runs}...`);
      const result = await executeAttempt(browser, options, runNumber);
      results.push(result);
      console.log(`Attempt ${runNumber}: ${result.status}`);

      if (result.status === 'accepted' && results.some((entry) => entry.status === 'accepted')) {
        const acceptedCount = results.filter((entry) => entry.status === 'accepted').length;
        if (acceptedCount > 1) {
          console.error('Security failure: a second ballot submission was accepted. Stopping further attempts.');
          break;
        }
      }

      if (result.status === 'error') {
        console.error(`Attempt ${runNumber} failed: ${result.error}`);
      }

      if (!stopRequested && (options.loop || runNumber < options.runs) && options.pauseSeconds > 0) {
        await pauseBetweenAttempts(options.pauseSeconds, () => stopRequested);
      }
    }
  } finally {
    await browser.close();
  }

  const report = {
    ballot: TEST_BALLOT,
    completedAt: new Date().toISOString(),
    live: options.live,
    results,
  };
  const reportPath = resolve(options.artifactsDir, 'report.json');
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Report: ${reportPath}`);

  const acceptedCount = results.filter((result) => result.status === 'accepted').length;
  const unexpectedAcceptance = acceptedCount > 1;
  const errors = results.some((result) => result.status === 'error');
  process.exitCode = unexpectedAcceptance || errors ? 1 : 0;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

