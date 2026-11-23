# Vote Best NWA ballot-security runner

This Playwright runner uses Google Chrome in a visible Incognito window to test the authorized two-entry ballot flow:

## Install (macOS)

```sh
git clone https://github.com/maiglesi/votebestnwa-ballot-security-test.git
cd votebestnwa-ballot-security-test
npm install
```

- Services > Marketing / Creative Agency > Stay Entertained Media
- Motors > Power sports > Ozark Powersports

It starts each attempt in a fresh browser context, so repeat-vote protections are tested without relying on browser cookies. It does not solve or bypass CAPTCHA, anti-bot, or browser-security challenges.

## Commands

Run a visual dry run (the default) to confirm the flow reaches `Review and cast my ballot` without submitting:

```sh
npm run ballot-security-test
```

Run a chosen number of live security-test attempts:

```sh
npm run ballot-security-test -- --live --runs 10
```

Run with 2 seconds between attempts:

```sh
npm run ballot-security-test -- --live --runs 10 --pause-seconds 2
```

Run continuously every 10 seconds until you press `Ctrl+C`:

```sh
npm run ballot-security-test -- --live --loop --pause-seconds 10
```

Screenshots and `report.json` are written under `artifacts/votebestnwa-ballot-security-test` by default. The first accepted submission is recorded. A second accepted submission is treated as a security failure and stops the runner; normally the remaining attempts should show the site's 24-hour duplicate-ballot block.

