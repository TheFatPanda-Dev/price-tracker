import logging
import os
import smtplib
from email.message import EmailMessage
from html import escape

logger = logging.getLogger(__name__)


def _to_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _current_mailer() -> str:
    return os.getenv("MAILER_PROVIDER", "smtp").strip().lower()


def _env_with_fallback(primary_key: str, fallback_key: str, default: str = "") -> str:
    primary_value = os.getenv(primary_key)
    if primary_value is not None and primary_value.strip() != "":
        return primary_value.strip()
    return os.getenv(fallback_key, default).strip()


def _smtp_settings() -> dict | None:
    provider = _current_mailer()
    if provider == "neoserv":
        host = _env_with_fallback("NEOSERV_SMTP_HOST", "SMTP_HOST")
        port_raw = _env_with_fallback("NEOSERV_SMTP_PORT", "SMTP_PORT", "465")
        sender = _env_with_fallback("NEOSERV_SMTP_FROM", "SMTP_FROM")
        username = _env_with_fallback("NEOSERV_SMTP_USER", "SMTP_USER")
        password = _env_with_fallback("NEOSERV_SMTP_PASSWORD", "SMTP_PASSWORD")
        use_tls = _to_bool(_env_with_fallback("NEOSERV_SMTP_USE_TLS", "SMTP_USE_TLS", "0"), default=False)
        use_ssl = _to_bool(_env_with_fallback("NEOSERV_SMTP_USE_SSL", "SMTP_USE_SSL", "1"), default=True)
    else:
        host = os.getenv("SMTP_HOST", "").strip()
        port_raw = os.getenv("SMTP_PORT", "587").strip()
        sender = os.getenv("SMTP_FROM", "").strip()
        username = os.getenv("SMTP_USER", "").strip()
        password = os.getenv("SMTP_PASSWORD", "").strip()
        use_tls = _to_bool(os.getenv("SMTP_USE_TLS", "1"), default=True)
        use_ssl = _to_bool(os.getenv("SMTP_USE_SSL", "0"), default=False)

    if not host or not sender:
        return None

    try:
        port = int(port_raw)
    except ValueError:
        logger.warning("SMTP_PORT is invalid: %s", port_raw)
        return None

    return {
        "host": host,
        "port": port,
        "sender": sender,
        "username": username,
        "password": password,
        "use_tls": use_tls,
        "use_ssl": use_ssl,
    }


def is_email_enabled() -> bool:
    return _smtp_settings() is not None


def _format_price(currency: str, value: float) -> str:
    return f"{currency}{value:.2f}"


def _build_html(changes: list[dict]) -> str:
    rows: list[str] = []
    for change in changes:
        name = escape(change["name"])
        url = escape(change["url"], quote=True)
        currency = str(change.get("currency") or "$")
        old_price = float(change["old_price"])
        new_price = float(change["new_price"])
        direction = str(change["direction"])
        color = "red" if direction == "higher" else "green"

        rows.append(
            "<tr>"
            f"<td style=\"padding:8px; border-bottom:1px solid #ddd;\"><a href=\"{url}\">{name}</a></td>"
            f"<td style=\"padding:8px; border-bottom:1px solid #ddd;\">{escape(_format_price(currency, old_price))}</td>"
            f"<td style=\"padding:8px; border-bottom:1px solid #ddd; color:{color}; font-weight:700;\">{escape(_format_price(currency, new_price))}</td>"
            "</tr>"
        )

    row_markup = "".join(rows)
    return (
        "<html><body>"
        "<p>Price changes were detected for your tracked items:</p>"
        "<table style=\"border-collapse:collapse; width:100%;\">"
        "<thead><tr>"
        "<th style=\"text-align:left; padding:8px; border-bottom:2px solid #333;\">Product</th>"
        "<th style=\"text-align:left; padding:8px; border-bottom:2px solid #333;\">Previous</th>"
        "<th style=\"text-align:left; padding:8px; border-bottom:2px solid #333;\">New</th>"
        "</tr></thead>"
        f"<tbody>{row_markup}</tbody>"
        "</table>"
        "</body></html>"
    )


def _build_plain_text(changes: list[dict]) -> str:
    lines = ["Price changes were detected:", ""]
    for change in changes:
        currency = str(change.get("currency") or "$")
        lines.append(
            f"- {change['name']}: {_format_price(currency, float(change['old_price']))} -> "
            f"{_format_price(currency, float(change['new_price']))} ({change['url']})"
        )
    return "\n".join(lines)


def send_price_change_email(recipient: str, changes: list[dict]) -> bool:
    if not changes:
        return True

    settings = _smtp_settings()
    if settings is None:
        logger.info("Email notifications are not configured. Skipping notification send.")
        return False

    message = EmailMessage()
    message["Subject"] = f"Price Tracker: {len(changes)} item(s) changed"
    message["From"] = settings["sender"]
    message["To"] = recipient
    message.set_content(_build_plain_text(changes))
    message.add_alternative(_build_html(changes), subtype="html")

    try:
        if settings["use_ssl"]:
            with smtplib.SMTP_SSL(settings["host"], settings["port"], timeout=20) as smtp:
                if settings["username"]:
                    smtp.login(settings["username"], settings["password"])
                smtp.send_message(message)
            return True

        with smtplib.SMTP(settings["host"], settings["port"], timeout=20) as smtp:
            if settings["use_tls"]:
                smtp.starttls()
            if settings["username"]:
                smtp.login(settings["username"], settings["password"])
            smtp.send_message(message)
        return True
    except Exception as exc:
        logger.exception("Failed to send price-change email to %s: %s", recipient, exc)
        return False
