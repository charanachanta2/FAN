'use strict';

const { LANGUAGE_OPTIONS } = require('../utils/languages');

/** Renders the full accessible HTML shell served at `GET /`. */
function renderPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Stadium Copilot — FIFA World Cup 2026</title>
<meta name="description" content="GenAI-powered stadium navigation, crowd guidance, multilingual assistance, and operations support for FIFA World Cup 2026." />
<link rel="stylesheet" href="/styles.css" />
</head>
<body data-contrast="normal">
<a class="skip-link" href="#main-content">Skip to main content</a>

<header class="top">
  <h1><span aria-hidden="true">⚽</span> Stadium Copilot <span class="badge">WORLD CUP 2026</span></h1>
  <div class="toolbar" role="group" aria-label="Accessibility settings">
    <button id="btn-contrast" aria-pressed="false">High contrast</button>
    <button id="btn-fontsize" aria-label="Increase text size">A+</button>
    <label for="lang-select" class="visually-hidden">Assistant language</label>
    <select id="lang-select" aria-label="Assistant language">
      ${LANGUAGE_OPTIONS.map((l) => `<option value="${l.code}"${l.code === 'en' ? ' selected' : ''}>${l.name}</option>`).join('\n      ')}
      <option value="other">Other — type a language code…</option>
    </select>
    <label for="lang-custom" class="visually-hidden">Custom language code</label>
    <input type="text" id="lang-custom" class="lang-custom-input" placeholder="e.g. eo, gd, br" maxlength="20" aria-label="Custom BCP-47 language code" />
  </div>
</header>

<nav class="tabs" role="tablist" aria-label="Sections">
  <button role="tab" aria-selected="true" aria-controls="panel-fan" id="tab-fan">Fan Assistant</button>
  <button role="tab" aria-selected="false" aria-controls="panel-crowd" id="tab-crowd">Crowd &amp; Navigation</button>
  <button role="tab" aria-selected="false" aria-controls="panel-sustainability" id="tab-sustainability">Sustainability</button>
  <button role="tab" aria-selected="false" aria-controls="panel-staff" id="tab-staff">Staff Dashboard</button>
</nav>

<main id="main-content">

  <section class="panel" id="panel-fan" role="tabpanel" aria-labelledby="tab-fan">
    <h2>Ask the multilingual match-day assistant</h2>
    <p class="status">Ask about wayfinding, accessibility, transport options, or sustainability tips — the assistant replies in your selected language.</p>
    <div class="chat-log" id="chat-log" role="log" aria-live="polite" aria-relevant="additions"></div>
    <form class="row" id="chat-form">
      <label class="visually-hidden" for="chat-input">Your question</label>
      <input type="text" id="chat-input" placeholder="e.g. Where can I refill water near Gate C?" maxlength="1000" required />
      <button type="submit">Send</button>
    </form>
  </section>

  <section class="panel" id="panel-crowd" role="tabpanel" aria-labelledby="tab-crowd" hidden>
    <h2>Live crowd levels &amp; AI guidance</h2>
    <div class="grid" id="crowd-grid" aria-live="polite"></div>
    <p id="crowd-guidance" class="status" role="status"></p>
    <button id="btn-refresh-crowd">Refresh crowd data</button>

    <h2 class="mt-lg">Get directions</h2>
    <form class="row" id="directions-form">
      <div class="flex-1">
        <label for="origin">From</label>
        <input type="text" id="origin" placeholder="Your current location" required />
      </div>
      <div class="flex-1">
        <label for="destination">To</label>
        <input type="text" id="destination" placeholder="Stadium gate or landmark" required />
      </div>
      <div>
        <label for="mode">Mode</label>
        <select id="mode">
          <option value="walking">Walking</option>
          <option value="transit">Transit</option>
          <option value="driving">Driving</option>
          <option value="bicycling">Bicycling</option>
        </select>
      </div>
      <button type="submit" class="align-end">Get route</button>
    </form>
    <div id="directions-result" role="status" aria-live="polite"></div>
  </section>

  <section class="panel" id="panel-sustainability" role="tabpanel" aria-labelledby="tab-sustainability" hidden>
    <h2>Match-day sustainability tips</h2>
    <p class="status">AI-curated, stadium-specific guidance on recycling, reusable containers, and low-carbon transport.</p>
    <ul id="sustainability-list" class="grid" aria-live="polite"></ul>
    <button id="btn-refresh-sustainability">Refresh tips</button>
  </section>

  <section class="panel" id="panel-staff" role="tabpanel" aria-labelledby="tab-staff" hidden>
    <h2>Staff sign-in</h2>
    <p class="status">Log in to report incidents and view the AI operations briefing. New staff need a signup code from an administrator.</p>
    <div class="grid">
      <form id="signup-form">
        <div class="field"><label for="su-email">Email</label><input type="email" id="su-email" autocomplete="email" required /></div>
        <div class="field"><label for="su-pass">Password (8+ chars)</label><input type="password" id="su-pass" autocomplete="new-password" minlength="8" required /></div>
        <div class="field"><label for="su-code">Staff signup code (leave blank to sign up as a fan)</label><input type="password" id="su-code" autocomplete="off" /></div>
        <button type="submit">Create account</button>
      </form>
      <form id="login-form">
        <div class="field"><label for="li-email">Email</label><input type="email" id="li-email" autocomplete="email" required /></div>
        <div class="field"><label for="li-pass">Password</label><input type="password" id="li-pass" autocomplete="current-password" required /></div>
        <button type="submit">Log in</button>
      </form>
    </div>
    <p id="auth-status" role="status" class="status"></p>

    <div id="staff-tools" hidden>
      <h2 class="mt-lg">Real-time decision support</h2>
      <p class="status">Live crowd hot spots and open incidents, merged and ranked so the most urgent items surface first.</p>
      <ol id="priority-queue" class="grid" aria-live="polite"></ol>
      <button id="btn-refresh-dashboard">Refresh priority queue</button>

      <h2 class="mt-lg">Report an incident</h2>
      <form class="row" id="incident-form">
        <div class="flex-1-narrow">
          <label for="inc-zone">Zone</label>
          <input type="text" id="inc-zone" placeholder="e.g. East Concourse" required />
        </div>
        <div class="flex-2">
          <label for="inc-desc">Description</label>
          <input type="text" id="inc-desc" placeholder="What's happening?" required />
        </div>
        <button type="submit" class="align-end">Submit</button>
      </form>

      <h2 class="mt-lg">AI shift briefing</h2>
      <p id="briefing-text" role="status" class="status"></p>

      <h2 class="mt-md">Recent incidents</h2>
      <table>
        <caption class="visually-hidden">Recent stadium incidents with AI-assessed severity</caption>
        <thead><tr><th scope="col">Zone</th><th scope="col">Description</th><th scope="col">Severity</th><th scope="col">Recommended action</th></tr></thead>
        <tbody id="incidents-body"></tbody>
      </table>
      <button id="btn-refresh-incidents">Refresh incidents</button>
    </div>
  </section>

</main>

<footer>Built for FIFA World Cup 2026 stadium operations · GenAI-powered · Accessible by design</footer>

<script src="/app.js"></script>
</body>
</html>`;
}

module.exports = { renderPage };
