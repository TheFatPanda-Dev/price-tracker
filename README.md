# Price Tracker (Flask + Scrapy + SQLite)

A simple website to track product prices by URL and selector.

## Features
- Add products with:
  - Name
  - Product URL
  - Selector type (`css` or `xpath`)
  - Selector for the price element
- Stores historical checks in local SQLite
- Displays:
  - Current price (latest successful check)
  - Lowest recorded price
  - Full check history (success/failure + error)
- Automatic background checks every 4 hours
- Manual check button per item

## Stack
- Python
- Flask
- Scrapy (selector parsing)
- APScheduler
- SQLite (local file)
- Tailwind CSS (CDN)

## Setup
```bash
python3 -m venv .venv &&
source .venv/bin/activate &&
pip install -r requirements.txt &&
python3 app.py
```

Open: `http://127.0.0.1:5000`

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

## Data location
- SQLite database file: `price_tracker.sqlite3`

## Important
Many ecommerce websites have anti-bot protections and terms of service restrictions. Use this project responsibly and only where allowed.
