from dotenv import load_dotenv

from price_tracker import db
from price_tracker.scheduler import run_price_checks


def main() -> None:
    load_dotenv()
    db.init_db()
    run_price_checks()


if __name__ == "__main__":
    main()
