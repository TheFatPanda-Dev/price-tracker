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
