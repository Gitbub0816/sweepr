/*
 * Copyright © 2026–Present ClearKey Solutions, LLC.
 * All Rights Reserved.
 *
 * Proprietary and Confidential.
 *
 * Unauthorized copying, modification, disclosure,
 * distribution, reverse engineering, or use is prohibited.
 */

/**
 * Customer-look simulator page, server-rendered from the Worker. Read-only:
 * it renders the admin's sandbox config and quotes against it via
 * POST /simulator/quote. It NEVER writes anything.
 *
 * Access: signed 7-day share token ({admin_email, name, exp}) minted by the
 * get_simulator_link tool. Styling approximates the Sweepr look (seafoam
 * brand scale + warm graphite neutrals from packages/config/tailwind.ts);
 * fonts are an Inter attempt with a system-ui fallback since this page does
 * not ship the self-hosted font pipeline.
 */

import type { ExtraDefV2 } from "@sweepr/quote-engine";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const BASE_STYLE = `
  :root {
    --seafoam-500: #14b8a6; --seafoam-600: #0d9488; --seafoam-700: #0f766e;
    --seafoam-50: #f0fdfa; --seafoam-100: #ccfbf1;
    --ink: #1c1a17; --ink-soft: #57524c; --ink-mute: #78726b;
    --paper: #f9f8f6; --card: #ffffff; --line: #e7e5e2;
    --amber: #f59e0b;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--paper); color: var(--ink);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    line-height: 1.5;
  }
  .wrap { max-width: 760px; margin: 0 auto; padding: 24px 16px 64px; }
  header.brand {
    display: flex; align-items: center; justify-content: space-between;
    padding: 4px 0 16px;
  }
  .wordmark { font-weight: 800; font-size: 22px; letter-spacing: -0.02em; color: var(--ink); }
  .wordmark .dot { color: var(--seafoam-600); }
  .sim-banner {
    background: #fef3c7; border: 1px solid var(--amber); color: #78350f;
    border-radius: 10px; padding: 10px 14px; font-weight: 600; font-size: 14px;
    margin-bottom: 20px;
  }
  .card {
    background: var(--card); border: 1px solid var(--line); border-radius: 16px;
    padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 2px rgba(28,26,23,0.04);
  }
  h1 { font-size: 20px; margin: 0 0 4px; letter-spacing: -0.01em; }
  h2 { font-size: 15px; margin: 0 0 12px; color: var(--ink-soft); }
  .sub { color: var(--ink-mute); font-size: 13px; margin: 0 0 8px; }
  label { display: block; font-size: 13px; font-weight: 600; color: var(--ink-soft); margin-bottom: 4px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
  input[type="number"], select {
    width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px;
    font: inherit; background: #fff; color: var(--ink);
  }
  input:focus, select:focus { outline: 2px solid var(--seafoam-500); outline-offset: 1px; border-color: var(--seafoam-500); }
  .extras { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 8px; }
  .extra {
    display: flex; gap: 8px; align-items: center; border: 1px solid var(--line);
    border-radius: 10px; padding: 8px 10px; font-size: 13px; background: #fff;
  }
  .extra input { accent-color: var(--seafoam-600); }
  button.quote {
    width: 100%; margin-top: 16px; padding: 12px; border: 0; border-radius: 12px;
    background: var(--seafoam-600); color: #fff; font: inherit; font-weight: 700;
    font-size: 15px; cursor: pointer;
  }
  button.quote:hover { background: var(--seafoam-700); }
  .price-card { border: 1px solid var(--seafoam-100); background: var(--seafoam-50); }
  .total { font-size: 40px; font-weight: 800; letter-spacing: -0.02em; color: var(--ink); }
  .total small { font-size: 15px; font-weight: 600; color: var(--ink-mute); }
  .meta-row { display: flex; gap: 20px; flex-wrap: wrap; margin-top: 10px; font-size: 13px; color: var(--ink-soft); }
  .meta-row b { color: var(--ink); }
  .lines { margin-top: 12px; border-top: 1px solid var(--line); padding-top: 10px; font-size: 13px; }
  .line { display: flex; justify-content: space-between; padding: 2px 0; color: var(--ink-soft); }
  .line.total-line { font-weight: 700; color: var(--ink); border-top: 1px solid var(--line); margin-top: 6px; padding-top: 8px; }
  .warn { color: #92400e; font-size: 13px; margin-top: 8px; }
  .err { color: #b91c1c; font-size: 14px; margin-top: 10px; }
  footer { color: var(--ink-mute); font-size: 12px; margin-top: 28px; text-align: center; }
`;

function pageShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<style>${BASE_STYLE}</style>
</head>
<body>
<div class="wrap">
<header class="brand"><div class="wordmark">Sweepr<span class="dot">.</span></div>
<div style="font-size:12px;color:var(--ink-mute)">Pricing simulator</div></header>
${body}
<footer>Internal pricing simulation tool. Figures shown are proposals under review, not offers.</footer>
</div>
</body>
</html>`;
}

/** Friendly page for a missing/expired/invalid share token. */
export function renderSimulatorErrorPage(): string {
  return pageShell(
    "Sweepr simulator link",
    `<div class="sim-banner">SIMULATION &middot; not live pricing</div>
     <div class="card">
       <h1>This simulator link is not valid anymore</h1>
       <p class="sub">Share links expire after 7 days for safety. Ask your assistant for a fresh link
       (the <code>get_simulator_link</code> tool) and try again.</p>
     </div>`,
  );
}

/** Main simulator page for a resolved sandbox config. */
export function renderSimulatorPage(opts: {
  token: string;
  name: string;
  extras: ExtraDefV2[];
  configFound: boolean;
}): string {
  const activeExtras = opts.extras.filter((e) => e.active);
  const extrasHtml =
    activeExtras.length === 0
      ? `<p class="sub">No extras are active in this configuration.</p>`
      : activeExtras
          .map(
            (e) => `<label class="extra"><input type="checkbox" name="extra" value="${esc(e.key)}"> ${esc(
              e.label,
            )}</label>`,
          )
          .join("\n");

  const condSelect = (id: string, label: string) => `
    <div><label for="${id}">${label} condition</label>
    <select id="${id}">
      <option value="1">1 &middot; Light</option>
      <option value="2" selected>2 &middot; Average</option>
      <option value="3">3 &middot; Needs extra attention</option>
      <option value="4">4 &middot; Heavy</option>
    </select></div>`;

  const notice = opts.configFound
    ? ""
    : `<p class="warn">No sandbox config named &quot;${esc(opts.name)}&quot; is stored yet, so quotes below use the cold-start defaults.</p>`;

  const body = `
<div class="sim-banner">SIMULATION &middot; not live pricing. Sandbox: &quot;${esc(opts.name)}&quot;</div>
<div class="card">
  <h1>What would this home cost?</h1>
  <p class="sub">Describe the home the way a customer would in the booking flow. The price is computed by the
  real Sweepr pricing engine against the proposed (sandbox) configuration.</p>
  ${notice}
  <h2>Rooms</h2>
  <div class="grid">
    <div><label for="bedrooms">Bedrooms</label><input id="bedrooms" type="number" min="0" max="12" value="3"></div>
    <div><label for="bathrooms">Bathrooms</label><input id="bathrooms" type="number" min="0" max="10" value="2"></div>
    <div><label for="kitchens">Kitchens</label><input id="kitchens" type="number" min="0" max="4" value="1"></div>
    <div><label for="livings">Living rooms</label><input id="livings" type="number" min="0" max="6" value="1"></div>
  </div>
  <h2 style="margin-top:16px">Condition (worst room of each type)</h2>
  <div class="grid">
    ${condSelect("cond_bedroom", "Bedroom")}
    ${condSelect("cond_bathroom", "Bathroom")}
    ${condSelect("cond_kitchen", "Kitchen")}
    ${condSelect("cond_living_room", "Living room")}
  </div>
  <h2 style="margin-top:16px">Size</h2>
  <div class="grid">
    <div><label for="sqft">Square footage</label><input id="sqft" type="number" min="200" max="20000" value="1600"></div>
  </div>
  <h2 style="margin-top:16px">Extras</h2>
  <div class="extras">${extrasHtml}</div>
  <button class="quote" id="go">See simulated price</button>
  <div class="err" id="err" hidden></div>
</div>

<div class="card price-card" id="result" hidden>
  <h2>Simulated price</h2>
  <div class="total" id="total"></div>
  <div class="meta-row">
    <div>Expected labor: <b id="labor"></b></div>
    <div>Team: <b id="team"></b></div>
    <div>On-site estimate: <b id="elapsed"></b></div>
  </div>
  <div class="lines" id="lines"></div>
  <div class="warn" id="warnings" hidden></div>
</div>

<script>
const TOKEN = ${JSON.stringify(opts.token)};
const $ = (id) => document.getElementById(id);
function fmt(cents) { return "$" + (cents / 100).toFixed(2); }
function minutes(m) {
  const h = Math.floor(m / 60), r = m % 60;
  return h > 0 ? h + "h " + r + "m" : r + "m";
}
$("go").addEventListener("click", async () => {
  $("err").hidden = true;
  const extras = Array.from(document.querySelectorAll('input[name="extra"]:checked'))
    .map((el) => ({ key: el.value, quantity: 1 }));
  const payload = {
    token: TOKEN,
    input: {
      counts: {
        bedroom: Number($("bedrooms").value) || 0,
        bathroom: Number($("bathrooms").value) || 0,
        kitchen: Number($("kitchens").value) || 0,
        living_room: Number($("livings").value) || 0,
      },
      conditions: {
        bedroom: Number($("cond_bedroom").value),
        bathroom: Number($("cond_bathroom").value),
        kitchen: Number($("cond_kitchen").value),
        living_room: Number($("cond_living_room").value),
      },
      sqft: Number($("sqft").value) || undefined,
      extras,
    },
  };
  try {
    const res = await fetch("/simulator/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "Quote failed");
    const q = data.result;
    $("total").innerHTML = fmt(q.totalCents) + ' <small>simulated total, incl. tax</small>';
    $("labor").textContent = minutes(q.expectedLaborMinutes);
    $("team").textContent = q.recommendedTeamSize + (q.recommendedTeamSize > 1 ? " cleaners" : " cleaner");
    $("elapsed").textContent = minutes(q.estimatedElapsedMinutes);
    const lines = q.components.map((cmp) =>
      '<div class="line"><span>' + cmp.label + '</span><span>' + fmt(cmp.amountCents) + "</span></div>").join("");
    $("lines").innerHTML = lines +
      '<div class="line"><span>Tax</span><span>' + fmt(q.taxCents) + "</span></div>" +
      '<div class="line total-line"><span>Total</span><span>' + fmt(q.totalCents) + "</span></div>";
    if (q.warnings && q.warnings.length) {
      $("warnings").hidden = false;
      $("warnings").textContent = q.warnings.join(" ");
    } else { $("warnings").hidden = true; }
    $("result").hidden = false;
    $("result").scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (e) {
    $("err").hidden = false;
    $("err").textContent = e.message || String(e);
  }
});
</script>`;

  return pageShell("Sweepr pricing simulator", body);
}
