import argparse

from dotenv import load_dotenv

from price_tracker.notifier import is_email_enabled, send_price_change_email


def _build_changes(direction: str) -> list[dict]:
    old_price = 100.00
    new_price = 120.00 if direction == "higher" else 90.00
    return [
        {
            "name": "Notifier Test Product",
            "url": "https://example.com/product",
            "currency": "€",
            "old_price": old_price,
            "new_price": new_price,
            "direction": direction,
        }
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description="Send a test price-change email.")
    parser.add_argument("recipient", help="Recipient email address")
    parser.add_argument(
        "--direction",
        choices=["lower", "higher"],
        default="lower",
        help="Price direction to preview in the email (green lower / red higher).",
    )
    args = parser.parse_args()

    load_dotenv()

    enabled = is_email_enabled()
    print(f"email_enabled: {enabled}")
    if not enabled:
        print("Email settings are not configured. Check your .env values.")
        return 1

    sent = send_price_change_email(args.recipient, _build_changes(args.direction))
    print(f"sent: {sent}")
    return 0 if sent else 1


if __name__ == "__main__":
    raise SystemExit(main())