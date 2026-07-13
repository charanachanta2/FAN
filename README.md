# 🏟️ Stadium Copilot — FIFA World Cup 2026

A GenAI-powered stadium operations and fan-experience platform. The entire
application — **frontend and backend** — lives in a single file
(`api/index.js`) so it deploys to Vercel as one serverless function that
serves the UI *and* the API.

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
| Accessibility | Skip links, ARIA live regions/tabs, high-contrast mode, adjustable text size, full keyboard support | Native HTML/CSS/JS |
| Auth | Email/password signup & login (fan/staff roles) with bcrypt + JWT sessions | Neon Postgres (swap in Neon Auth/Stack if preferred) |

---

## 📁 Project structure

```
.
├── api/
│   └── index.js       # ENTIRE app: Express backend + embedded HTML/CSS/JS frontend
├── test/
│   └── app.test.js    # Automated tests (Node's built-in test runner)
├── package.json        # Dependencies + scripts
├── vercel.json          # Routes all requests to api/index.js
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
| `STACK_PROJECT_ID` | Optional | Neon Auth (Stack Auth) project ID — only needed if you swap in your own Neon Auth code |
| `STACK_PUBLISHABLE_CLIENT_KEY` | Optional | Neon Auth (Stack Auth) publishable key |
| `STACK_SECRET_SERVER_KEY` | Optional | Neon Auth (Stack Auth) secret server key |
| `NODE_ENV` | Optional | Set to `production` on Vercel (Vercel sets this automatically) |

> **Note on Neon Auth:** the app ships with a working built-in email/password
> + JWT auth (bcrypt-hashed passwords, 12-hour signed sessions) so everything
> runs out of the box. If you have your own Neon Auth (Stack Auth) snippet,
> open `api/index.js` and look for the comment block:
> `>>> NEON AUTH INTEGRATION POINT <<<` — that's where to swap in your code.
> Every other route only depends on `authMiddleware` returning
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
npm test
```

Runs `test/app.test.js` using Node's built-in test runner — covers the HTML
shell/accessibility landmarks, health/selftest endpoints, input validation,
graceful degradation when optional keys are absent, auth gating on staff
routes, and clean 404/error handling (no stack traces leaked).

---

## 🔒 Security highlights

- Strict CSP via Helmet, using a per-request nonce for the one inline
  bootstrap script (no `unsafe-inline` for scripts).
- Rate limiting on all `/api/*` routes, with a stricter limit on `/api/chat`.
- All SQL goes through Neon's tagged-template driver (auto-parameterized —
  no string concatenation, no SQL injection).
- Passwords hashed with bcrypt (cost factor 12); sessions are short-lived
  signed JWTs.
- All third-party API keys (Gemini, Maps, Translate) are used **only**
  server-side — never exposed to the browser.
- Centralized error handler returns generic messages and never leaks stack
  traces or internal error details to clients.

## ♿ Accessibility highlights

- Skip-to-content link, semantic landmarks, and an ARIA `tablist` for section navigation.
- `aria-live` regions for chat replies, crowd guidance, directions, and incident briefings.
- High-contrast mode toggle and a 3-step text-size control (`A+`).
- Every input has an associated `<label>`; focus-visible outlines throughout.
- Respects `prefers-reduced-motion`.

---

## 📌 Notes

- Crowd density is currently **simulated** (`simulateCrowdSnapshot()`); swap
  this for a real IoT/camera-feed data source when available — everything
  downstream (AI guidance, caching, UI) already expects that shape of data.
- In-memory caching (directions, crowd snapshot, briefings) is per serverless
  instance and resets on cold start — sufficient for reducing redundant AI/API
  calls without needing an external cache for this scope.
