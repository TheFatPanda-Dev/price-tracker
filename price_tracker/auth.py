from functools import wraps

from flask import flash, g, redirect, render_template, request, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash

from price_tracker import db


def current_user_id() -> int | None:
    user_id = session.get("user_id")
    if not user_id:
        return None
    return int(user_id)


def login_required(view_func):
    @wraps(view_func)
    def wrapper(*args, **kwargs):
        if current_user_id() is None:
            flash("Please log in first.", "error")
            return redirect(url_for("login"))
        return view_func(*args, **kwargs)

    return wrapper


def load_current_user() -> None:
    user_id = current_user_id()
    g.current_user = db.get_user(user_id) if user_id else None


def inject_auth_context() -> dict:
    return {"current_user": g.get("current_user")}


def register_auth_routes(app) -> None:
    @app.route("/login", methods=["GET", "POST"])
    def login():
        if current_user_id() is not None:
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
        if current_user_id() is not None:
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
