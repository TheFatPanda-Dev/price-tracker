# Price Tracker (Flask + Scrapy)

A web app to track product prices with user accounts, per-user watchlists, and automatic background checks.

## Features

- User authentication:
  - Register
  - Login / Logout
  - Each user tracks only their own items
- Add products with:
  - Product URL (required)
  - Name (optional, auto-detected when missing)
  - Price selector (optional)
- Automatic price detection even without selector (best-effort)
- Selector management on details page (`Save` / `Save + check`)
- Stores historical checks in DB
- Displays:
  - Current price (latest successful check)
  - Lowest recorded price
  - Full check history (success/failure + error)
- Automatic background checks every 4 hours
- Manual check actions:
  - Check now (details page)
  - Check all (dashboard)

## Stack

- Python
- Flask
- Scrapy (selector parsing)
- APScheduler
- SQLite (default)
- MySQL (optional)
- Tailwind CSS (CDN)

## Project Structure

- `app.py`:
  - App bootstrap
  - Context injection
  - Route module registration
- `price_tracker/auth.py`:
  - Auth routes (`/login`, `/register`, `/logout`)
  - Session user helpers and `login_required`
- `price_tracker/item_views.py`:
  - Item/dashboard routes
  - Price-check orchestration + flash messaging
- `price_tracker/db.py`:
  - Database abstraction (SQLite/MySQL)
  - Schema init/migrations
  - Data access methods for users/items/checks
- `price_tracker/scraper.py`:
  - Price extraction logic
  - Currency detection
  - Auto product name detection
- `price_tracker/scheduler.py`:
  - Background check job (every 4 hours)
- `templates/`:
  - `base.html` layout
  - `index.html` dashboard
  - `item_detail.html` item details/history
  - `login.html` and `register.html` auth pages

## Setup

```bash
python3 -m venv .venv &&
source .venv/bin/activate &&
pip install -r requirements.txt &&
python3 app.py
```

Open: `http://127.0.0.1:5000`

First run:

- Create an account on `/register`
- Login on `/login`

## MySQL settings (optional)

Set `DB_BACKEND=mysql` to use MySQL instead of SQLite. Example:

```bash
export DB_BACKEND=mysql
export DB_HOST=127.0.0.1
export DB_PORT=3306
export DB_NAME=price_tracker
export DB_USER=root
export DB_PASSWORD=your_password
```

Then start the app normally. Tables are created automatically on launch.
If the database does not exist yet, it will be created automatically.

## Scheduler toggle

By default, the background scheduler starts on app boot.
If your hosting setup already runs multiple workers (for example Passenger/WSGI) or you see startup issues, disable it:

```bash
export ENABLE_SCHEDULER=0
```

## Cron-based checks (recommended on shared hosting)

If your hosting restarts worker processes often, keep `ENABLE_SCHEDULER=0` and run checks via cron.

Use a cron job every 4 hours:

```bash
0 */4 * * * cd /home/afrim/subdomains/price-tracker && /home/afrim/virtualenv/subdomains/price-tracker/3.11/bin/python run_price_checks_once.py >> /home/afrim/subdomains/price-tracker/cron.log 2>&1
```

Adjust the virtualenv Python path if your panel uses a different location.

## Email notifications on price changes

When a scheduled check (APScheduler or cron via `run_price_checks_once.py`) finds a changed price,
the app sends an email summary to the item's owner email.

Each email includes:

- Product name as a clickable link to the product URL
- Previous price
- New price
- New price in **red** when the price increased
- New price in **green** when the price decreased

Configure SMTP in `.env`:

```bash
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_FROM=no-reply@example.com
SMTP_USER=your_smtp_username
SMTP_PASSWORD=your_smtp_password
SMTP_USE_TLS=1
SMTP_USE_SSL=0
```

To use NeoServ mailer, set:

```bash
MAILER_PROVIDER=neoserv
NEOSERV_SMTP_HOST=your-neoserv-smtp-host
NEOSERV_SMTP_PORT=465
NEOSERV_SMTP_FROM=no-reply@your-domain.com
NEOSERV_SMTP_USER=your-neoserv-user
NEOSERV_SMTP_PASSWORD=your-neoserv-password
NEOSERV_SMTP_USE_TLS=0
NEOSERV_SMTP_USE_SSL=1
```

If a NeoServ variable is missing, the app falls back to the matching `SMTP_*` value.

Notes:

- `SMTP_HOST` and `SMTP_FROM` are required to send emails.
- Use TLS (`SMTP_USE_TLS=1`) for port `587`.
- Use SSL (`SMTP_USE_SSL=1`) for port `465` and usually set `SMTP_USE_TLS=0`.

Quick email test command:

```bash
python3 test_email.py your-email@example.com
```

To test the red "higher" styling:

```bash
python3 test_email.py your-email@example.com --direction higher
```

## Passenger / WSGI deployment note

If you deploy with Passenger, `passenger_wsgi.py` must expose a Python variable named `application`.
Use Python import syntax (not Gunicorn style):

```python
from wsgi import app as application
```

Do **not** use `application = wsgi.app:app` (this causes a `SyntaxError` and HTTP 500).

### Using a .env file

Copy [./.env.example](.env.example) to `.env` and edit values. The app loads it automatically on startup.

## Notes on selectors

- CSS examples:
  - `.price`
  - `#product-price`
  - `span[class*='price']`
- XPath examples:
  - `//span[@class='price']/text()`
  - `//*[contains(@class, 'price')]/text()`

If a selector fails, open the item detail page and check the latest error message.
You can leave selector empty initially and add one later from the details page for better accuracy.

## Data location

- SQLite database file (default): `price_tracker.sqlite3`

## Important

Many ecommerce websites have anti-bot protections and terms of service restrictions. Use this project responsibly and only where allowed.
