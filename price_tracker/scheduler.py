from datetime import datetime
import logging

from apscheduler.schedulers.background import BackgroundScheduler

from price_tracker import db
from price_tracker.notifier import send_price_change_email
from price_tracker.scraper import check_item_price


logger = logging.getLogger(__name__)


def _has_price_changed(previous_price: float | None, new_price: float | None) -> bool:
    if previous_price is None or new_price is None:
        return False
    return abs(previous_price - new_price) > 1e-9


def run_price_checks() -> None:
    items = db.list_items()
    changes_by_user: dict[int, list[dict]] = {}

    for item in items:
        previous_price = db.get_latest_successful_price(item["id"])
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

        if not success or not _has_price_changed(previous_price, price):
            continue

        user_id = item.get("user_id")
        if user_id is None:
            continue

        direction = "higher" if float(price) > float(previous_price) else "lower"
        changes_by_user.setdefault(user_id, []).append(
            {
                "name": item["name"],
                "url": item["url"],
                "currency": detected_currency or item.get("currency") or "$",
                "old_price": float(previous_price),
                "new_price": float(price),
                "direction": direction,
            }
        )

    for user_id, changes in changes_by_user.items():
        user = db.get_user(user_id)
        if not user or not user.get("email"):
            continue
        send_price_change_email(user["email"], changes)

    if changes_by_user:
        total_changes = sum(len(changes) for changes in changes_by_user.values())
        logger.info("Price checks complete. Sent notifications for %s changed items.", total_changes)


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
