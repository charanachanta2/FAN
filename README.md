# 🏟️ Stadium Copilot — FIFA World Cup 2026

A GenAI-powered stadium operations and fan-experience platform. The entire
application — **frontend and backend** — deploys to Vercel as **one
serverless function** (`api/index.js`, a thin entry point over the modular
`src/` codebase) that serves the UI *and* the API.

Built for: **navigation & transportation, multilingual assistance, crowd
management, operational intelligence, real-time decision support, and
sustainability** during the FIFA World Cup 2026.

---

## ✨ Features

| Area | What it does | Powered by |
|---|---|---|
| Multilingual fan assistant | Chatbot answering wayfinding, accessibility, transport, and sustainability questions in 10+ languages | Gemini (`GEMINI_API_KEY`) |
| Translation | Translate any text to a target language | Google Cloud Translation (`GOOGLE_TRANSLATE_API_KEY`), falls back to Gemini if unset |
| Navigation & transportation | Turn-by-turn directions (walking/transit/driving/bicycling) between two points | Google Directions API (`GOOGLE_MAPS_API_KEY`) |
| Crowd management | Live (simulated) zone density dashboard with AI-generated flow guidance, refreshed every 20s | Gemini |
| Operational intelligence | Staff incident reporting with AI severity triage + AI-generated shift briefings | Gemini + Neon Postgres |
| Real-time decision support | Dedicated staff dashboard (`/api/dashboard`) that merges live crowd hot spots with open incidents into one ranked, refreshable priority queue — a first-class surface, not just individual AI recommendations scattered across other features | Gemini + live crowd data + Neon Postgres |
| Sustainability | Dedicated tab with AI-curated, cached eco tips (recycling, reusable cups/bottles, transit) — a first-class surface, not just a chat answer | Gemini, with a static fallback if unset |
| Accessibility | Skip links, ARIA live regions/tabs, high-contrast mode, adjustable text size, full keyboard support | Native HTML/CSS/JS |
| Auth | Email/password signup & login (fan/staff roles) with bcrypt + JWT sessions | Neon Postgres (swap in Neon Auth/Stack if preferred) |

---

## 📁 Project structure

The app still deploys as **one Vercel serverless function** — `api/index.js`
is a thin entry point that requires `src/app.js`, and Vercel's builder
bundles the entire `src/` dependency graph into that single function. The
code itself is split into small, single-purpose modules for readability,
testability, and easy extension:

```
.
├── api/
│   └── index.js              # Thin Vercel/local entry point — requires src/app.js
├── src/
│   ├── app.js                 # Wires config, middleware, routes, and the frontend together
│   ├── config/
│   │   └── env.js              # Env var reading + FEATURES capability flags
│   ├── db/
│   │   └── index.js            # Neon client init + idempotent schema bootstrap
│   ├── middleware/
│   │   ├── auth.js              # JWT signing + role-gated auth middleware
│   │   └── security.js          # CORS, Helmet/CSP, rate limiters
│   ├── services/
│   │   ├── gemini.js             # Gemini generateContent wrapper (+ JSON helper)
│   │   ├── translate.js          # Google Cloud Translation, falls back to Gemini
│   │   ├── directions.js         # Google Directions API wrapper
│   │   └── crowd.js               # Simulated zone telemetry + busiest-zone helper
│   ├── routes/
│   │   ├── health.js              # /api/health, /api/selftest
│   │   ├── auth.js                 # /api/auth/signup, /login, /me
│   │   ├── chat.js                  # /api/chat (multilingual assistant)
│   │   ├── translate.js             # /api/translate
│   │   ├── directions.js            # /api/directions
│   │   ├── crowd.js                  # /api/crowd
│   │   ├── sustainability.js         # /api/sustainability
│   │   ├── incidents.js               # /api/incidents (operational intelligence)
│   │   └── dashboard.js                # /api/dashboard (real-time decision support)
│   ├── frontend/
│   │   └── page.js                     # Server-rendered accessible HTML shell
│   ├── utils/
│   │   ├── cache.js                     # TTLCache class
│   │   ├── validation.js                 # cleanString / normalizeLang / escapeHtml
│   │   └── languages.js                   # Language <select> options + RTL set
│   └── cache.js                          # Shared TTLCache instance used by routes
├── public/
│   ├── styles.css              # Stylesheet, served as a static asset
│   └── app.js                    # Frontend behavior, served as a static asset
├── test/
│   ├── app.test.js              # Integration/contract tests (Node's built-in test runner)
│   └── unit.test.js              # Unit tests for utils/services (cache, validation, ranking)
├── package.json        # Dependencies + scripts
├── vercel.json          # Routes all requests to api/index.js
├── .eslintrc.json        # Lint rules (npm run lint)
├── .gitignore
└── .env.example         # List of every environment variable to configure
```

---

## 🚀 Deploy to Vercel

1. **Push these files to a GitHub repo** (or drag-and-drop into a new Vercel project).
2. **Import the repo in Vercel** → Vercel auto-detects `vercel.json` and `api/index.js`.
3. **Add environment variables** in Vercel → your project → **Settings → Environment Variables**
   (see the full table below). Add them to all environments (Production, Preview, Development).
4. **Deploy.** Vercel builds `api/index.js` as a Node serverless function and
   rewrites all routes (`/`, `/api/*`) to it, so both the UI and the API are
   live at your `*.vercel.app` URL.
5. After deploy, sanity-check with:
   - `GET /api/health` → `{"status":"ok"}`
   - `GET /api/selftest` → shows which features are active + DB connectivity
   - `GET /api/dashboard` (with a staff bearer token) → the real-time
     decision-support priority queue (crowd hot spots + open incidents, ranked)

---

## 🔑 Environment variables

Copy `.env.example` → `.env` for local development. In Vercel, add each one
under **Settings → Environment Variables**.

| Variable | Required? | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ Required | Neon Postgres connection string (used for users, incidents, chat logs) |
| `JWT_SECRET` | ✅ Required | Long random string used to sign staff auth session tokens |
| `GEMINI_API_KEY` | ✅ Required | Google AI Studio / Gemini key — powers the chat assistant, crowd guidance, incident triage, and shift briefings |
| `GOOGLE_MAPS_API_KEY` | Optional | Enables `/api/directions` (navigation & transportation). Without it, the endpoint returns a clear 503 instead of crashing |
| `GOOGLE_TRANSLATE_API_KEY` | Optional | Enables `/api/translate` via Google Cloud Translation. Without it, translation falls back to Gemini automatically |
| `ALLOWED_ORIGIN` | Optional | Comma-separated CORS allow-list, e.g. `https://your-app.vercel.app`. Defaults to permissive same-origin-friendly behavior if unset |
| `STAFF_SIGNUP_CODE` | Optional | Shared secret required to self-register a `staff` account via `/api/auth/signup`. **Unset by default**, which disables staff self-signup entirely — fans can still sign up, and staff accounts must be provisioned another way until you set this |
| `STACK_PROJECT_ID` | Optional | Neon Auth (Stack Auth) project ID — only needed if you swap in your own Neon Auth code |
| `STACK_PUBLISHABLE_CLIENT_KEY` | Optional | Neon Auth (Stack Auth) publishable key |
| `STACK_SECRET_SERVER_KEY` | Optional | Neon Auth (Stack Auth) secret server key |
| `NODE_ENV` | Optional | Set to `production` on Vercel (Vercel sets this automatically) |

> **Note on Neon Auth:** the app ships with a working built-in email/password
> + JWT auth (bcrypt-hashed passwords, 12-hour signed sessions) so everything
> runs out of the box. If you have your own Neon Auth (Stack Auth) snippet,
> open `src/middleware/auth.js` and look for the comment block:
> `>>> NEON AUTH INTEGRATION POINT <<<` — that's where to swap in your code
> (along with the signup/login handlers in `src/routes/auth.js`). Every other
> route only depends on `authMiddleware` returning
> `req.user = { id, email, role }`, so nothing else needs to change.

### Where to get each key
- **Neon `DATABASE_URL`**: Neon Console → your project → **Connection Details** → copy the pooled connection string.
- **`GEMINI_API_KEY`**: [Google AI Studio](https://aistudio.google.com/) → Get API key.
- **`GOOGLE_MAPS_API_KEY`**: Google Cloud Console → enable **Directions API** → Credentials → API key.
- **`GOOGLE_TRANSLATE_API_KEY`**: Google Cloud Console → enable **Cloud Translation API** → Credentials → API key.
- **`JWT_SECRET`**: any long random string, e.g. generate with `openssl rand -hex 32`.

---

## 🧪 Local development

```bash
npm install
cp .env.example .env    # fill in at least DATABASE_URL, JWT_SECRET, GEMINI_API_KEY
npm run dev              # starts on http://localhost:3000
```

The app degrades gracefully if optional keys are missing — e.g. without
`GOOGLE_MAPS_API_KEY` the directions endpoint returns a clean 503 instead of
crashing, and without `GEMINI_API_KEY` the chat assistant returns a labeled
demo-mode response instead of failing.

## ✅ Running tests

```bash
npm test              # run the test suite
npm run test:coverage # run with Node's built-in coverage reporter
npm run lint           # ESLint
```

Runs `test/app.test.js` and `test/unit.test.js` using Node's built-in test
runner.

- `app.test.js` — integration/contract tests: the HTML shell/accessibility
  landmarks, static assets (`/styles.css`, `/app.js`), health/selftest
  endpoints, input validation, graceful degradation when optional keys are
  absent, auth gating on staff/dashboard routes, translate/directions
  validation, security headers, and clean 404/error handling (no stack
  traces leaked).
- `unit.test.js` — fast, dependency-free unit tests for the extracted
  utility/service modules: `TTLCache` expiry, string/language validation,
  crowd density-to-level thresholds, and the real-time decision-support
  priority-queue ranking logic.

---

## 🔒 Security highlights

- Strict CSP via Helmet — `script-src` and `style-src` are both `'self'`
  only, with no `unsafe-inline` and no nonce bookkeeping needed anywhere,
  because the frontend's behavior and layout live in same-origin static
  files (`public/app.js`, `public/styles.css`) instead of inline `<script>`/
  `style="..."` in the HTML.
- Rate limiting on all `/api/*` routes, with a stricter limit on `/api/chat`
  and an even stricter limit on `/api/auth/signup` and `/api/auth/login`
  (10/min) to blunt credential-stuffing and password-guessing attempts.
- Self-service `staff` account creation requires `STAFF_SIGNUP_CODE`
  (compared with a constant-time hash comparison) and is disabled by default
  if that variable is unset — a public signup form can no longer be used to
  grant yourself elevated privileges by simply passing `role: "staff"`.
- Emails are normalized to lowercase before lookup/storage so `A@x.com` and
  `a@x.com` can't be used to bypass duplicate-account checks.
- All SQL goes through Neon's tagged-template driver (auto-parameterized —
  no string concatenation, no SQL injection).
- Passwords hashed with bcrypt (cost factor 12); sessions are short-lived
  signed JWTs. Password `<input>` fields use `type="password"`.
- All third-party API keys (Gemini, Maps, Translate) are used **only**
  server-side — never exposed to the browser.
- Centralized error handler returns generic messages and never leaks stack
  traces or internal error details to clients.

## ♿ Accessibility highlights

- Skip-to-content link, semantic landmarks, and an ARIA `tablist` for section navigation.
- `aria-live` regions for chat replies, crowd guidance, directions, sustainability tips, and incident briefings.
- The document's `lang` and `dir` attributes update to match the assistant's
  reply language (including RTL scripts), so screen readers use correct
  pronunciation rules instead of always reading replies as English.
- High-contrast mode toggle and a 3-step text-size control (`A+`).
- Every input has an associated `<label>`, correct `type`/`autocomplete`
  (e.g. password fields are real `type="password"` fields, not plain text),
  and focus-visible outlines throughout.
- Decorative emoji (e.g. the header icon) are marked `aria-hidden` so they
  aren't announced redundantly by screen readers.
- Respects `prefers-reduced-motion`.

---

## 📌 Notes

- Crowd density is currently **simulated** (`simulateCrowdSnapshot()`); swap
  this for a real IoT/camera-feed data source when available — everything
  downstream (AI guidance, caching, UI) already expects that shape of data.
- In-memory caching (directions, crowd snapshot, briefings) is per serverless
  instance and resets on cold start — sufficient for reducing redundant AI/API
  calls without needing an external cache for this scope.
