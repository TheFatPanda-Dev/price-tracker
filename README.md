# Price Tracker

Self-hosted price watchlist for any online shop. Paste a product link; the tracker reads the price, stores it, and checks again on a fixed timetable (every 6 h by default: 00:00, 06:00, 12:00, 18:00). Unchanged prices write nothing. Changes are stored with the percent moved, announced in the in-app Activity feed, and optionally sent by Telegram and email. Drops are green, rises red, and both always carry an arrow and a signed percentage.

- Reads JSON-LD / meta tags / known shop selectors first, falls back to headless Chromium for JS-heavy shops, and lets you pick the price element by hand when both fail.
- Multi-user and invite-only: the first account becomes the admin, who creates invite links.
- One Docker container (amd64 + arm64) with a SQLite file on a mounted volume.

## Run locally

```bash
npm ci
cp .env.example .env
npx playwright-core install chromium   # headless browser for JS-heavy shops
npm run dev                             # http://localhost:3000 → /setup creates the admin
```

`npm test` runs the parser/extractor/scheduler tests. The database migrates itself on start (`drizzle/`); after changing `src/db/schema.ts`, run `npm run db:generate`.

## Synology NAS (Container Manager)

1. In **File Station**, create `docker/price-tracker` and put `docker-compose.yml` and a filled-in `.env` (copy `.env.example`) there. Create an empty `data` folder next to them.
2. The container runs as user id 1000. Over SSH: `sudo chown 1000:1000 /volume1/docker/price-tracker/data` (or give "Everyone" read/write on the `data` folder in File Station).
3. **Container Manager → Project → Create**, choose that folder, and let it use the existing `docker-compose.yml`.
   - To build on the NAS, copy the whole repository there instead (the compose file has `build: .`).
   - To pull a prebuilt image instead, replace `image:`/`build:` with `image: ghcr.io/thefatpanda-dev/price-tracker:latest` (published by the GitHub Action on every push to `main`; make the package public or log in to ghcr.io first).
4. Open `http://<nas-ip>:3000`. The first visit goes to `/setup` and creates the admin account.

**Remote access:** either **Control Panel → Login Portal → Advanced → Reverse Proxy** (HTTPS source on your DDNS name → `http://localhost:3000`) plus a Let's Encrypt certificate from **Control Panel → Security → Certificate**, or install Tailscale on the NAS and keep the app private. Set `APP_URL` to the address people actually use (it goes into invite links and alerts; an `https://` URL also turns on secure cookies).

**Backup:** copy `data/price-tracker.db` (stop the container first, or use Hyper Backup on the folder).

**Update:** pull/rebuild the image and restart the project. Migrations run automatically.

## Alerts

- **Email:** fill the `SMTP_*` values in `.env` (any SMTP: NeoServ mailbox, Gmail app password, Resend…). Each user turns email on in Settings and can send a test.
- **Telegram:** create a bot with @BotFather, put its token in `TELEGRAM_BOT_TOKEN`. In Settings each user presses *Connect Telegram*, presses *Start* in the bot chat, then *I pressed Start*.

## Notes

- Some shops block automated readers (eBay blocks some home connections even for the headless browser). Failed checks stay visible on the board with the reason, retry after 1 h (twice), then wait for the next slot; after 3 failures in a row the user gets one alert.
- When a shop lists a product as unavailable (e.g. Amazon "Currently unavailable" for your delivery country), the row shows *Out of stock* and keeps the last price instead of counting it as a failure.
- Env reference: see `.env.example`. Optional: `CHROMIUM_PATH` (use a system Chromium), `DISABLE_SCHEDULER=true` (web only, e.g. for a second instance).

<p align="center"><sub>Made by <a href="https://thefatpanda.uk">thefatpanda.uk</a></sub></p>
