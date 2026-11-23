# Vote Best NWA ballot-security runner

This Playwright runner uses Google Chrome in a visible Incognito window to test the authorized two-entry ballot flow:

## Install (macOS)

```sh
git clone https://github.com/maiglesi/votebestnwa-ballot-security-test.git
cd votebestnwa-ballot-security-test
npm install
```

Requirements: macOS, Google Chrome, and Node.js 20 or newer. The runner opens a visible Chrome Incognito window for every attempt.

- Services > Marketing / Creative Agency > Stay Entertained Media
- Motors > Power sports > Ozark Powersports

It starts each attempt in a fresh browser context, so repeat-vote protections are tested without relying on browser cookies. It does not solve or bypass CAPTCHA, anti-bot, or browser-security challenges.

## Commands

Start with a visual dry run. It selects both test entries, reaches `Review and cast my ballot`, saves a screenshot, and does **not** submit a ballot:

```sh
npm run ballot-security-test
```

Run a fixed number of live security-test attempts. Each attempt includes both designated test entries:

```sh
npm run ballot-security-test -- --live --runs 10
```

Add a delay between fixed attempts:

```sh
npm run ballot-security-test -- --live --runs 10 --pause-seconds 2
```

By default, the runner stops after a second accepted submission and returns a failure code. For an authorized test that must continue collecting accepted attempts, add `--continue-after-acceptance`:

```sh
npm run ballot-security-test -- --live --runs 10 --pause-seconds 2 --continue-after-acceptance
```

Run continuously every 10 seconds until you press `Ctrl+C`. The runner finishes its active attempt and writes `report.json` before exiting:

```sh
npm run ballot-security-test -- --live --loop --pause-seconds 10
```

## Results and safety

Screenshots and `report.json` are written under `artifacts/votebestnwa-ballot-security-test` by default. The first accepted submission is recorded. A second accepted submission is treated as a security failure and stops the runner; normally the remaining attempts should show the site's 24-hour duplicate-ballot block.

Use `--live` only for authorized testing. The runner does not solve or bypass CAPTCHA, anti-bot, or browser-security challenges; it records a screenshot and error instead.

