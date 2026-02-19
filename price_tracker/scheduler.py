from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler

from price_tracker import db
from price_tracker.scraper import check_item_price


def run_price_checks() -> None:
    items = db.list_items()
    for item in items:
        success, price, raw_text, error, detected_currency = check_item_price(item)
        db.insert_price_check(
            item_id=item["id"],
            success=success,
            price=price,
            raw_text=raw_text,
            error=error,
        )
        if success and detected_currency:
            db.update_item_currency(item["id"], detected_currency)


def start_scheduler() -> BackgroundScheduler:
    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(
        run_price_checks,
        trigger="interval",
        hours=4,
        next_run_time=datetime.utcnow(),
        id="price_check_job",
        replace_existing=True,
        max_instances=1,
    )
    scheduler.start()
    return scheduler
