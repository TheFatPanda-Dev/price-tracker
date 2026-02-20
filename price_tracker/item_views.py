from flask import flash, redirect, render_template, request, url_for

from price_tracker import db
from price_tracker.auth import current_user_id, login_required
from price_tracker.scraper import check_item_price, detect_item_name

AUTO_SELECTOR_HINT = "Could not automatically detect a price. Add a selector for better accuracy."


def _build_item_payload(form: dict) -> dict:
    return {
        "name": form.get("name", "").strip(),
        "url": form.get("url", "").strip(),
        "selector": form.get("selector", "").strip(),
        "selector_type": form.get("selector_type", "css").strip().lower() or "css",
        "currency": "EUR",
    }


def _run_and_store_check(item: dict, user_id: int) -> tuple[bool, float | None, str | None, str]:
    success, price, raw_text, error, detected_currency = check_item_price(item)
    db.insert_price_check(
        item_id=item["id"],
        success=success,
        price=price,
        raw_text=raw_text,
        error=error,
    )

    if success and detected_currency:
        db.update_item_currency(item["id"], detected_currency, user_id=user_id)
        item_currency = detected_currency
    else:
        item_currency = item["currency"] or "$"

    return success, price, error, item_currency


def _flash_check_result(success: bool, price: float | None, error: str | None, item_currency: str, prefix: str = "") -> None:
    if success and price is not None:
        flash(f"{prefix}Price check complete: {price:.2f} {item_currency}", "success")
    else:
        flash(f"{prefix}Price check failed: {error}", "error")


def register_item_routes(app) -> None:
    @app.route("/")
    @login_required
    def index():
        user_id = current_user_id()
        items = db.list_items_with_stats(user_id=user_id)
        return render_template("index.html", items=items)

    @app.route("/items", methods=["POST"])
    @login_required
    def add_item():
        user_id = current_user_id()
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

        item_id = db.create_item(user_id=user_id, **payload)

        item = db.get_item(item_id, user_id=user_id)
        if item:
            success, price, error, item_currency = _run_and_store_check(item, user_id)
            _flash_check_result(success, price, error, item_currency, prefix="Item added. ")
            if not success and not item["selector"] and error == AUTO_SELECTOR_HINT:
                flash("Price not found automatically. Open View details and add a selector.", "error")

        return redirect(url_for("index"))

    @app.route("/items/check-all", methods=["POST"])
    @login_required
    def run_check_all():
        user_id = current_user_id()
        items = db.list_items(user_id=user_id)
        if not items:
            flash("No items to check yet.", "error")
            return redirect(url_for("index"))

        successful = 0
        failed = 0

        for item in items:
            success, _, _, _ = _run_and_store_check(item, user_id)
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
    @login_required
    def item_detail(item_id: int):
        user_id = current_user_id()
        item = db.get_item(item_id, user_id=user_id)
        if not item:
            flash("Item not found.", "error")
            return redirect(url_for("index"))

        history = db.get_item_history(item_id, user_id=user_id)
        stats = db.get_item_stats(item_id, user_id=user_id)
        return render_template("item_detail.html", item=item, history=history, stats=stats)

    @app.route("/items/<int:item_id>/selector", methods=["POST"])
    @login_required
    def update_selector(item_id: int):
        user_id = current_user_id()
        item = db.get_item(item_id, user_id=user_id)
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

        updated_rows = db.update_item_selector(item_id, selector, selector_type, user_id=user_id)
        if updated_rows:
            flash("Selector saved.", "success")
        else:
            flash("Item not found.", "error")
            return redirect(url_for("item_detail", item_id=item_id))

        should_run_check = request.form.get("run_check") == "1"
        if should_run_check:
            updated_item = db.get_item(item_id, user_id=user_id)
            if not updated_item:
                flash("Item not found.", "error")
                return redirect(url_for("index"))

            success, price, error, item_currency = _run_and_store_check(updated_item, user_id)
            _flash_check_result(success, price, error, item_currency)

        return redirect(url_for("item_detail", item_id=item_id))

    @app.route("/items/<int:item_id>/check", methods=["POST"])
    @login_required
    def run_check(item_id: int):
        user_id = current_user_id()
        next_url = request.form.get("next") or request.referrer

        item = db.get_item(item_id, user_id=user_id)
        if not item:
            flash("Item not found.", "error")
            return redirect(url_for("index"))

        success, price, error, item_currency = _run_and_store_check(item, user_id)
        _flash_check_result(success, price, error, item_currency)
        if not success and not item["selector"] and error == AUTO_SELECTOR_HINT:
            flash("Auto-detection failed. Add a selector in View details and run check again.", "error")

        if next_url:
            return redirect(next_url)

        return redirect(url_for("item_detail", item_id=item_id))

    @app.route("/items/<int:item_id>/delete", methods=["POST"])
    @login_required
    def remove_item(item_id: int):
        user_id = current_user_id()
        next_url = request.form.get("next") or request.referrer or url_for("index")
        deleted_rows = db.delete_item(item_id, user_id=user_id)

        if deleted_rows:
            flash("Item removed.", "success")
        else:
            flash("Item not found.", "error")

        return redirect(next_url)
