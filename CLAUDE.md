@AGENTS.md

# Price Tracker — project brief and handoff

Read `PRODUCT.md` (product truth) and `.impeccable/surfaces/src-app-app-page-tsx.md` (chosen design direction) before working. The Impeccable design skill is installed in `.claude/skills/impeccable` (project scope, design hook not enabled).

This repo replaced an older Python/Flask version (still in git history, last Flask commit `f25a991`; its `price_tracker/scraper.py` may have useful selectors).

## Decisions already made with the owner (do not re-ask)

- **Core:** paste a product link → app reads the current price → stores it → re-checks every 6 h. Same price: write nothing (only update "last checked"). Changed price: store new price + percent change. **Drop = green, rise = red**, always with an arrow and signed % (never colour alone).
- **Hosting:** owner's **Synology NAS** via Docker (Container Manager). Image must build for amd64 **and** arm64. A neoserv.si VPS (VPS 1, 2 GB) is the fallback; neoserv shared hosting is NOT suitable (no headless browser).
- **Shops:** anything — Amazon/eBay/AliExpress (need headless Chromium) and small local shops. Manual CSS-selector fallback when auto-extraction fails.
- **Accounts:** multi-user, **invite-only**. First account created becomes admin; admin creates invite links. Each user has own watchlist + settings.
- **Alerts:** all three — in-app activity feed, **Telegram**, **email**. Toggled per user in settings.
- **Target price** per product (optional): reaching it → highlighted alert + badge.
- Volume: 20–100 products per person. Devices: desktop and phone equally. UI language: **English**.
- **Design:** Impeccable flow done up to direction choice. Owner picked **"Departures Board"** (station split-flap board + yellow timetable). Contract in `.impeccable/surfaces/src-app-app-page-tsx.md`; static sketch in `docs/design/departures-board-sketch.html`. Operate mode, code-led build.

## Stack (chosen, delegated to Claude)

Next.js 16.4 App Router + React 19 + TypeScript + Tailwind v4 · SQLite via Drizzle ORM + better-sqlite3 · cheerio (static HTML) + playwright-core with Chromium (JS-heavy shops) · @node-rs/argon2 + custom DB sessions · nodemailer · Telegram Bot API (plain fetch) · zod · vitest. One Docker container (Next standalone server + in-process scheduler), SQLite file on a mounted volume.

Next 16 gotchas (read `node_modules/next/dist/docs/` before coding): `middleware` is now `proxy.ts`; `params`/`searchParams`/`cookies()` are async; `refresh()` from `next/cache` after mutations; `cacheComponents` was deliberately **removed** from next.config (every screen is per-user dynamic data written by a background scheduler); scheduler starts from `src/instrumentation.ts` (guard with `NEXT_RUNTIME === 'nodejs'` and a `globalThis` flag).

## Build plan

**DB (src/db/schema.ts)** — money stored as integer cents.
- `users` (id, email unique lowercase, name, passwordHash, role admin|member, createdAt)
- `sessions` (id = sha256(token), userId, expiresAt) — cookie `pt_session`, httpOnly, sameSite lax, `secure` only when APP_URL is https (Synology LAN may be plain http), 30-day sliding expiry
- `invites` (id, tokenHash, email?, createdBy, expiresAt 7d, usedAt, usedBy)
- `user_settings` (userId, checkIntervalHours=6, notifyEmail, emailAddress?, notifyTelegram, telegramChatId?, telegramLinkToken?, notifyOn any|drops, minChangePercent=0, lastSeenAt)
- `products` (id, userId, url, title, imageUrl, shop host, currency, currentPriceCents, previousPriceCents, lastChangePercent, lastChangedAt, lowestCents, highestCents, targetPriceCents?, targetHitAt?, inStock?, selector?, method static|browser|selector, status pending|ok|error, lastError, candidatesJson, failCount, lastCheckedAt, nextCheckAt, createdAt; unique userId+url)
- `price_history` (id, productId, priceCents, previousPriceCents, changePercent, recordedAt) — first reading + changes only
- `notifications` (in-app feed: id, userId, productId, type drop|rise|target|error, title, body, prices, changePercent, createdAt, readAt)

**Scraper (src/lib/scraper/)**
1. URL guard: http/https only, block private/loopback IPs (also on each redirect; manual redirects, max 5) — the app runs on a home NAS.
2. Static fetch with real-browser headers → cheerio → extract.
3. Extraction order: user selector → JSON-LD Product/Offer/AggregateOffer (price, lowPrice, priceSpecification, priceCurrency, availability, name, image) → meta (`product:price:amount`, `og:price:amount`, `itemprop=price`) → site selectors (Amazon `#corePrice_feature_div .a-offscreen`, `#corePriceDisplay_desktop_feature_div .a-offscreen`, `#priceblock_ourprice`, `#priceblock_dealprice`; eBay `.x-price-primary`) → generic `[class*=price]` heuristics (prefer current/sale/final, skip old/was/strike/list/del) which also become **candidates** shown to the user when everything fails.
4. Fallback to Playwright Chromium if no price or blocked (403/429/503/captcha text). Lazy singleton browser, closed after idle; block images/fonts/media; realistic UA (no "HeadlessChrome"), timezone Europe/Ljubljana. Remember per product which method worked.
5. `parsePrice()` must handle `1.299,99 €`, `€1,299.99`, `1 299,99` (nbsp / narrow nbsp), `1'299.00`, `12,-`, `199.-`, `EUR 49.90`, ranges (take first). Currency from data, else symbol (€ $ £ zł Kč Ft lei CHF…), else TLD. Cover with vitest.

**Scheduler (src/lib/scheduler.ts)** — fixed slots like a timetable: next check = next multiple of the user's interval from local midnight (6 h → 00/06/12/18), so the UI can say "Next check departs 18:00". Tick every 60 s, pick due products, concurrency 2 (NAS RAM). New product = immediate first check. Failure → retry after 1 h (max 2), then next slot; notify user once at 3 consecutive failures.

**Check logic (src/lib/tracker.ts)** — same cents → update lastCheckedAt only. Different → history row, update current/previous/low/high/lastChange*, in-app notification always, email/Telegram per settings (notifyOn, minChangePercent). Target: alert when price crosses to ≤ target; reset when it goes back above.

**Notifications** — SMTP from env (settings page shows "not configured" if missing + "send test"). Telegram: settings "Connect Telegram" → deep link `https://t.me/<bot>?start=<token>` (bot name via getMe) → scheduler/refresh button polls `getUpdates` for `/start <token>` → save chat id → confirmation message. Message: `▼ Name: €399.00 → €349.00 (−12.5%)` + shop + link.

**Routes**
- Public: `/login`, `/setup` (only when no users exist → creates admin), `/invite/[token]`. Board-dark full screen.
- App `(app)/`: `/` watchlist (dark board header + paste field + status line; table grouped Today / This week / Earlier; filters all|dropped|rose|target|failed, search, sort; phone = stacked rows), `/products/[id]` (big price, step chart of history in SVG, history table, target form, check now, edit name/selector, candidates when failing, delete), `/activity` (feed, unread badge in nav), `/settings` (profile, password, check interval, notifications, Telegram, members & invites for admin).
- `proxy.ts`: optimistic redirect to /login without session cookie; refresh cookie maxAge.
- `/api/health` for the Docker healthcheck.
- Signature move: prices that changed since the user's last visit (`lastSeenAt`) render in split-flap cells that flip once; unchanged prices are plain. Fonts Barlow + Barlow Semi Condensed (next/font), tabular numerals; icons from lucide-react (no unicode glyph icons).

**Docker** — `node:22-bookworm-slim` multi-stage; `npx playwright-core install --with-deps chromium`; standalone output; volume `/data`; env from `.env`; `docker-compose.yml` for Synology Container Manager "Project"; healthcheck. README: Synology setup (Container Manager, reverse proxy + Let's Encrypt for remote access, or Tailscale), backup = copy `/data/price-tracker.db`.

**Impeccable finish (required by the skill)** — after building: screenshots `desktop.png` (1440) + `mobile.png` (390) into `.impeccable/review/`, run `.claude/skills/impeccable/scripts/impeccable detect --json <changed files>`, spawn `impeccable-finish-reviewer` with the contract + screenshots, apply fixes, then `impeccable-documenter` writes DESIGN.md + `.impeccable/design.json`.

## Status (2026-11-16)

Done: Next.js scaffold, deps installed (`drizzle-orm better-sqlite3 cheerio playwright-core @node-rs/argon2 nodemailer zod croner server-only`; dev `drizzle-kit tsx vitest @types/*`), next.config (standalone, external packages), `.env.example`, PRODUCT.md, direction contract.

Next, in order: DB schema + migrations → auth (setup/login/invite/proxy) → price parser + tests → scraper + browser fallback → tracker + scheduler → notifications → UI screens in the Departures Board world → Dockerfile/compose + README → test against real shop links → Impeccable finish review + DESIGN.md.
