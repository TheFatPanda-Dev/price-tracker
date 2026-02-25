import os
import logging
from flask import Flask
from dotenv import load_dotenv

from price_tracker import db
from price_tracker.auth import inject_auth_context, load_current_user, register_auth_routes
from price_tracker.item_views import register_item_routes
from price_tracker.scheduler import start_scheduler

load_dotenv()

logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-secret-change-me")


@app.before_request
def load_user() -> None:
    load_current_user()


@app.context_processor
def inject_context() -> dict:
    context = {"db_backend": db.get_backend()}
    context.update(inject_auth_context())
    return context


register_auth_routes(app)
register_item_routes(app)

db.init_db()


def _is_scheduler_enabled() -> bool:
    return os.getenv("ENABLE_SCHEDULER", "1").strip().lower() in {"1", "true", "yes", "on"}


SCHEDULER = None
if _is_scheduler_enabled():
    try:
        SCHEDULER = start_scheduler()
    except Exception as exc:
        logger.exception("Scheduler failed to start: %s", exc)


if __name__ == "__main__":
    app.run(debug=True)
