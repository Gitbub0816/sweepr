/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';

const targets = [
  ['marketing /',              'http://localhost:4173/'],
  ['marketing /clean-with-us', 'http://localhost:4173/clean-with-us'],
  ['marketing /status',        'http://localhost:4173/status'],
  ['marketing /privacy-request','http://localhost:4173/privacy-request'],
  ['marketing /accessibility', 'http://localhost:4173/accessibility'],
  ['legal /',                  'http://localhost:4174/'],
  ['legal /privacy',           'http://localhost:4174/privacy'],
  ['status /',                 'http://localhost:4175/'],
];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const context = await browser.newContext();
const page = await context.newPage();
let total = 0;
for (const [name, url] of targets) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(800);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    if (results.violations.length === 0) { console.log(`OK   ${name}`); continue; }
    for (const v of results.violations) {
      total += 1;
      console.log(`FAIL ${name} :: [${v.impact}] ${v.id} — ${v.help}`);
      for (const n of v.nodes.slice(0, 3)) console.log(`       ${n.target.join(' ')}`);
    }
  } catch (e) {
    console.log(`ERR  ${name}: ${String(e).slice(0, 120)}`);
  }
}
console.log(`\nTotal violations: ${total}`);
await browser.close();

// Usage:
//   1. Build the public apps:  pnpm --filter @sweepr/{marketing,legal,status} build
//   2. Start previews on ports 4173/4174/4175 (vite preview --port <n>)
//   3. npm i playwright @axe-core/playwright && node scripts/a11y-scan.mjs
// Exit is informational; violations print as FAIL lines. Last clean run: July 2026.
