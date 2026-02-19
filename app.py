from flask import Flask, flash, redirect, render_template, request, url_for
from dotenv import load_dotenv

from price_tracker import db
from price_tracker.scheduler import start_scheduler
from price_tracker.scraper import check_item_price, detect_item_name

load_dotenv()

app = Flask(__name__)
app.config["SECRET_KEY"] = "dev-secret-change-me"


@app.context_processor
def inject_backend() -> dict:
    return {"db_backend": db.get_backend()}


AUTO_SELECTOR_HINT = "Could not automatically detect a price. Add a selector for better accuracy."


def _build_item_payload(form: dict) -> dict:
    return {
        "name": form.get("name", "").strip(),
        "url": form.get("url", "").strip(),
        "selector": form.get("selector", "").strip(),
        "selector_type": form.get("selector_type", "css").strip().lower() or "css",
        "currency": "EUR",
    }


@app.route("/")
def index():
    items = db.list_items_with_stats()
    return render_template("index.html", items=items)


@app.route("/items", methods=["POST"])
def add_item():
    payload = _build_item_payload(request.form)

    if not payload["url"]:
        flash("URL is required.", "error")
        return redirect(url_for("index"))

    if not payload["name"]:
        detected_name = detect_item_name(payload["url"])
        payload["name"] = detected_name or "Untitled item"

    if payload["selector"] and payload["selector_type"] not in {"css", "xpath"}:
        flash("Selector type must be CSS or XPath.", "error")
        return redirect(url_for("index"))

    item_id = db.create_item(**payload)

    item = db.get_item(item_id)
    if item:
        success, price, raw_text, error, detected_currency = check_item_price(item)
        db.insert_price_check(
            item_id=item_id,
            success=success,
            price=price,
            raw_text=raw_text,
            error=error,
        )
        if success and detected_currency:
            db.update_item_currency(item_id, detected_currency)
            item_currency = detected_currency
        else:
            item_currency = item["currency"] or "$"

        if success:
            flash(f"Item added. Price check complete: {price:.2f} {item_currency}", "success")
        else:
            flash(f"Item added. Price check failed: {error}", "error")
        if not success and not item["selector"] and error == AUTO_SELECTOR_HINT:
            flash("Price not found automatically. Open View details and add a selector.", "error")

    return redirect(url_for("index"))


@app.route("/items/check-all", methods=["POST"])
def run_check_all():
    items = db.list_items()
    if not items:
        flash("No items to check yet.", "error")
        return redirect(url_for("index"))

    successful = 0
    failed = 0

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
        if success:
            successful += 1
        else:
            failed += 1

    flash(
        f"Check all complete. Success: {successful}, Failed: {failed}.",
        "success" if failed == 0 else "error",
    )
    return redirect(url_for("index"))


@app.route("/items/<int:item_id>")
def item_detail(item_id: int):
    item = db.get_item(item_id)
    if not item:
        flash("Item not found.", "error")
        return redirect(url_for("index"))

    history = db.get_item_history(item_id)
    stats = db.get_item_stats(item_id)
    return render_template("item_detail.html", item=item, history=history, stats=stats)


@app.route("/items/<int:item_id>/selector", methods=["POST"])
def update_selector(item_id: int):
    item = db.get_item(item_id)
    if not item:
        flash("Item not found.", "error")
        return redirect(url_for("index"))

    selector = request.form.get("selector", "").strip()
    selector_type = request.form.get("selector_type", "css").strip().lower() or "css"

    if not selector:
        flash("Selector is required.", "error")
        return redirect(url_for("item_detail", item_id=item_id))

    if selector_type not in {"css", "xpath"}:
        flash("Selector type must be CSS or XPath.", "error")
        return redirect(url_for("item_detail", item_id=item_id))

    updated_rows = db.update_item_selector(item_id, selector, selector_type)
    if updated_rows:
        flash("Selector saved.", "success")
    else:
        flash("Item not found.", "error")
        return redirect(url_for("item_detail", item_id=item_id))

    should_run_check = request.form.get("run_check") == "1"
    if should_run_check:
        updated_item = db.get_item(item_id)
        if not updated_item:
            flash("Item not found.", "error")
            return redirect(url_for("index"))

        success, price, raw_text, error, detected_currency = check_item_price(updated_item)
        db.insert_price_check(
            item_id=item_id,
            success=success,
            price=price,
            raw_text=raw_text,
            error=error,
        )

        if success and detected_currency:
            db.update_item_currency(item_id, detected_currency)
            item_currency = detected_currency
        else:
            item_currency = updated_item["currency"] or "$"

        if success:
            flash(f"Price check complete: {price:.2f} {item_currency}", "success")
        else:
            flash(f"Price check failed: {error}", "error")

    return redirect(url_for("item_detail", item_id=item_id))


@app.route("/items/<int:item_id>/check", methods=["POST"])
def run_check(item_id: int):
    next_url = request.form.get("next") or request.referrer

    item = db.get_item(item_id)
    if not item:
        flash("Item not found.", "error")
        return redirect(url_for("index"))

    success, price, raw_text, error, detected_currency = check_item_price(item)
    db.insert_price_check(
        item_id=item_id,
        success=success,
        price=price,
        raw_text=raw_text,
        error=error,
    )
    if success and detected_currency:
        db.update_item_currency(item_id, detected_currency)
        item_currency = detected_currency
    else:
        item_currency = item["currency"] or "$"

    if success:
        flash(f"Price check complete: {price:.2f} {item_currency}", "success")
    else:
        flash(f"Price check failed: {error}", "error")
        if not item["selector"] and error == AUTO_SELECTOR_HINT:
            flash("Auto-detection failed. Add a selector in View details and run check again.", "error")

    if next_url:
        return redirect(next_url)

    return redirect(url_for("item_detail", item_id=item_id))


@app.route("/items/<int:item_id>/delete", methods=["POST"])
def remove_item(item_id: int):
    next_url = request.form.get("next") or request.referrer or url_for("index")
    deleted_rows = db.delete_item(item_id)

    if deleted_rows:
        flash("Item removed.", "success")
    else:
        flash("Item not found.", "error")

    return redirect(next_url)


db.init_db()
SCHEDULER = start_scheduler()


if __name__ == "__main__":
    app.run(debug=True)
