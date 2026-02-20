from functools import wraps

from flask import Flask, flash, g, redirect, render_template, request, session, url_for
from dotenv import load_dotenv
from werkzeug.security import check_password_hash, generate_password_hash

from price_tracker import db
from price_tracker.scheduler import start_scheduler
from price_tracker.scraper import check_item_price, detect_item_name

load_dotenv()

app = Flask(__name__)
app.config["SECRET_KEY"] = "dev-secret-change-me"


@app.context_processor
def inject_backend() -> dict:
    return {"db_backend": db.get_backend(), "current_user": g.get("current_user")}


AUTO_SELECTOR_HINT = "Could not automatically detect a price. Add a selector for better accuracy."


def _current_user_id() -> int | None:
    user_id = session.get("user_id")
    if not user_id:
        return None
    return int(user_id)


def login_required(view_func):
    @wraps(view_func)
    def wrapper(*args, **kwargs):
        if _current_user_id() is None:
            flash("Please log in first.", "error")
            return redirect(url_for("login"))
        return view_func(*args, **kwargs)

    return wrapper


@app.before_request
def load_current_user() -> None:
    user_id = _current_user_id()
    g.current_user = db.get_user(user_id) if user_id else None


@app.route("/login", methods=["GET", "POST"])
def login():
    if _current_user_id() is not None:
        return redirect(url_for("index"))

    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")

        if not email or not password:
            flash("Email and password are required.", "error")
            return render_template("login.html")

        user = db.get_user_by_email(email)
        if not user or not check_password_hash(user["password_hash"], password):
            flash("Invalid email or password.", "error")
            return render_template("login.html")

        session["user_id"] = user["id"]
        flash("Logged in successfully.", "success")
        return redirect(url_for("index"))

    return render_template("login.html")


@app.route("/register", methods=["GET", "POST"])
def register():
    if _current_user_id() is not None:
        return redirect(url_for("index"))

    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        confirm_password = request.form.get("confirm_password", "")

        if not email or not password:
            flash("Email and password are required.", "error")
            return render_template("register.html")

        if password != confirm_password:
            flash("Passwords do not match.", "error")
            return render_template("register.html")

        if len(password) < 8:
            flash("Password must be at least 8 characters.", "error")
            return render_template("register.html")

        user_id = db.create_user(email=email, password_hash=generate_password_hash(password))
        if user_id is None:
            flash("Email is already registered.", "error")
            return render_template("register.html")

        session["user_id"] = user_id
        flash("Account created.", "success")
        return redirect(url_for("index"))

    return render_template("register.html")


@app.route("/logout", methods=["POST"])
def logout():
    session.pop("user_id", None)
    flash("Logged out.", "success")
    return redirect(url_for("login"))


def _build_item_payload(form: dict) -> dict:
    return {
        "name": form.get("name", "").strip(),
        "url": form.get("url", "").strip(),
        "selector": form.get("selector", "").strip(),
        "selector_type": form.get("selector_type", "css").strip().lower() or "css",
        "currency": "EUR",
    }


@app.route("/")
@login_required
def index():
    user_id = _current_user_id()
    items = db.list_items_with_stats(user_id=user_id)
    return render_template("index.html", items=items)


@app.route("/items", methods=["POST"])
@login_required
def add_item():
    user_id = _current_user_id()
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
@login_required
def run_check_all():
    user_id = _current_user_id()
    items = db.list_items(user_id=user_id)
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
            db.update_item_currency(item["id"], detected_currency, user_id=user_id)
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
    user_id = _current_user_id()
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
    user_id = _current_user_id()
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

        success, price, raw_text, error, detected_currency = check_item_price(updated_item)
        db.insert_price_check(
            item_id=item_id,
            success=success,
            price=price,
            raw_text=raw_text,
            error=error,
        )

        if success and detected_currency:
            db.update_item_currency(item_id, detected_currency, user_id=user_id)
            item_currency = detected_currency
        else:
            item_currency = updated_item["currency"] or "$"

        if success:
            flash(f"Price check complete: {price:.2f} {item_currency}", "success")
        else:
            flash(f"Price check failed: {error}", "error")

    return redirect(url_for("item_detail", item_id=item_id))


@app.route("/items/<int:item_id>/check", methods=["POST"])
@login_required
def run_check(item_id: int):
    user_id = _current_user_id()
    next_url = request.form.get("next") or request.referrer

    item = db.get_item(item_id, user_id=user_id)
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
        db.update_item_currency(item_id, detected_currency, user_id=user_id)
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
@login_required
def remove_item(item_id: int):
    user_id = _current_user_id()
    next_url = request.form.get("next") or request.referrer or url_for("index")
    deleted_rows = db.delete_item(item_id, user_id=user_id)

    if deleted_rows:
        flash("Item removed.", "success")
    else:
        flash("Item not found.", "error")

    return redirect(next_url)


db.init_db()
SCHEDULER = start_scheduler()


if __name__ == "__main__":
    app.run(debug=True)
