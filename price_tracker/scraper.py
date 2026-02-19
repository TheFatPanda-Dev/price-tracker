import re
from decimal import Decimal, InvalidOperation
import json
from typing import Iterable
from urllib.parse import urlparse

import requests
from scrapy import Selector


KNOWN_CURRENCY_CODES = {
    "USD", "EUR", "GBP", "JPY", "CNY", "INR", "CAD", "AUD", "CHF", "SEK",
    "NOK", "DKK", "PLN", "CZK", "HUF", "RON", "TRY", "BRL", "MXN", "ZAR",
    "AED", "SAR", "ILS", "KRW", "RUB",
}

KNOWN_CURRENCY_SYMBOLS = [
    "R$", "zł", "lei", "€", "£", "$", "¥", "₩", "₹", "₽", "₺", "₴", "₫", "₦", "₪", "₱",
]


REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    )
}


def _normalize_price(raw_text: str) -> float | None:
    match = re.search(r"[-+]?\d[\d.,\s]*", raw_text)
    if not match:
        return None

    value = match.group(0).strip().replace(" ", "")

    if "," in value and "." in value:
        if value.rfind(",") > value.rfind("."):
            value = value.replace(".", "")
            value = value.replace(",", ".")
        else:
            value = value.replace(",", "")
    elif value.count(",") == 1 and value.count(".") == 0:
        value = value.replace(",", ".")
    else:
        value = value.replace(",", "")

    try:
        return float(Decimal(value))
    except (InvalidOperation, ValueError):
        return None


def _first_non_empty_text(candidates: Iterable[str]) -> str | None:
    for candidate in candidates:
        if not candidate:
            continue

        value = candidate.strip()
        if not value:
            continue

        if "<" in value and ">" in value:
            text = Selector(text=value).xpath("string()").get()
            if text and text.strip():
                return text.strip()
            continue

        return value

    return None


def _detect_currency_from_text(text: str | None) -> str | None:
    if not text:
        return None

    upper_text = text.upper()
    code_match = re.search(r"\b[A-Z]{3}\b", upper_text)
    if code_match and code_match.group(0) in KNOWN_CURRENCY_CODES:
        return code_match.group(0)

    for symbol in KNOWN_CURRENCY_SYMBOLS:
        if symbol in text:
            return symbol

    return None


def _is_reasonable_price(value: float | None) -> bool:
    if value is None:
        return False
    return 0 < value < 10_000_000


def _extract_price_from_json_ld(html: str) -> str | None:
    selector = Selector(text=html)
    scripts = selector.css('script[type="application/ld+json"]::text').getall()

    def _walk(node):
        if isinstance(node, dict):
            for key in ("price", "lowPrice", "highPrice"):
                value = node.get(key)
                if isinstance(value, (str, int, float)) and str(value).strip():
                    return str(value)

            for key in ("offers", "mainEntity", "itemOffered"):
                nested = node.get(key)
                price = _walk(nested)
                if price:
                    return price

            for value in node.values():
                price = _walk(value)
                if price:
                    return price

        if isinstance(node, list):
            for item in node:
                price = _walk(item)
                if price:
                    return price

        return None

    for script in scripts:
        if not script or not script.strip():
            continue
        try:
            payload = json.loads(script)
        except json.JSONDecodeError:
            continue

        price = _walk(payload)
        if price:
            return price

    return None


def _extract_currency_from_json_ld(html: str) -> str | None:
    selector = Selector(text=html)
    scripts = selector.css('script[type="application/ld+json"]::text').getall()

    def _walk(node):
        if isinstance(node, dict):
            currency = node.get("priceCurrency")
            if isinstance(currency, str) and currency.strip():
                value = currency.strip().upper()
                if value in KNOWN_CURRENCY_CODES:
                    return value
                return currency.strip()

            for value in node.values():
                found = _walk(value)
                if found:
                    return found

        if isinstance(node, list):
            for item in node:
                found = _walk(item)
                if found:
                    return found

        return None

    for script in scripts:
        if not script or not script.strip():
            continue
        try:
            payload = json.loads(script)
        except json.JSONDecodeError:
            continue

        currency = _walk(payload)
        if currency:
            return currency

    return None


def _extract_price_from_common_meta(html: str) -> str | None:
    selector = Selector(text=html)
    meta_selectors = [
        'meta[property="product:price:amount"]::attr(content)',
        'meta[property="og:price:amount"]::attr(content)',
        'meta[property="og:price:standard_amount"]::attr(content)',
        'meta[name="twitter:data1"]::attr(content)',
        'meta[itemprop="price"]::attr(content)',
    ]

    for meta_selector in meta_selectors:
        values = selector.css(meta_selector).getall()
        extracted = _first_non_empty_text(values)
        if extracted:
            return extracted

    return None


def _extract_currency_from_common_meta(html: str) -> str | None:
    selector = Selector(text=html)
    meta_selectors = [
        'meta[property="product:price:currency"]::attr(content)',
        'meta[property="og:price:currency"]::attr(content)',
        'meta[itemprop="priceCurrency"]::attr(content)',
    ]

    for meta_selector in meta_selectors:
        values = selector.css(meta_selector).getall()
        extracted = _first_non_empty_text(values)
        if extracted:
            value = extracted.upper()
            return value if value in KNOWN_CURRENCY_CODES else extracted

    return None


def _fallback_extract_currency(html: str, raw_text: str | None) -> str | None:
    from_text = _detect_currency_from_text(raw_text)
    if from_text:
        return from_text

    from_json_ld = _extract_currency_from_json_ld(html)
    if from_json_ld:
        return from_json_ld

    from_meta = _extract_currency_from_common_meta(html)
    if from_meta:
        return from_meta

    return None


def _fallback_extract_price_text(html: str) -> str | None:
    from_json_ld = _extract_price_from_json_ld(html)
    if from_json_ld:
        return from_json_ld

    from_meta = _extract_price_from_common_meta(html)
    if from_meta:
        return from_meta

    selector = Selector(text=html)
    candidate_texts: list[str] = []

    candidate_texts.extend(
        selector.xpath(
            "//*[contains(translate(@class, 'PRICE', 'price'), 'price') "
            "or contains(translate(@id, 'PRICE', 'price'), 'price')]/text()"
        ).getall()
    )
    candidate_texts.extend(
        selector.xpath(
            "//*[contains(translate(@class, 'AMOUNT', 'amount'), 'amount') "
            "or contains(translate(@id, 'AMOUNT', 'amount'), 'amount')]/text()"
        ).getall()
    )
    candidate_texts.extend(
        selector.xpath(
            "//text()[contains(., '$') or contains(., '€') or contains(., '£') "
            "or contains(., '¥') or contains(., '₹')]"
        ).getall()
    )

    scored: list[tuple[int, str]] = []
    for text in candidate_texts:
        if not text:
            continue

        value = text.strip()
        if not value or len(value) > 120:
            continue

        price = _normalize_price(value)
        if not _is_reasonable_price(price):
            continue

        lower_value = value.lower()
        score = 0
        if _detect_currency_from_text(value):
            score += 3
        if re.search(r"\d+[.,]\d{2}\b", value):
            score += 2
        if any(word in lower_value for word in ("price", "sale", "now", "from")):
            score += 1
        if len(value) < 32:
            score += 1

        scored.append((score, value))

    if scored:
        scored.sort(key=lambda row: row[0], reverse=True)
        return scored[0][1]

    return None


def _extract_raw_text(html: str, selector: str, selector_type: str) -> tuple[str | None, str | None]:
    parsed = Selector(text=html)

    if selector_type == "xpath":
        try:
            results = parsed.xpath(selector)
            matches = results.getall()
        except Exception as exc:
            return None, f"Invalid XPath selector: {exc}"

        extracted = _first_non_empty_text(matches)
        if extracted:
            return extracted, None

        return None, None

    if selector_type != "css":
        return None, "Selector type must be css or xpath."

    try:
        matches = parsed.css(selector).getall()
    except Exception as exc:
        return None, f"Invalid CSS selector: {exc}"

    extracted = _first_non_empty_text(matches)
    if extracted:
        return extracted, None

    if "::" not in selector:
        try:
            text_matches = parsed.css(f"{selector}::text").getall()
            extracted = _first_non_empty_text(text_matches)
            if extracted:
                return extracted, None
        except Exception:
            pass

        try:
            content_matches = parsed.css(f"{selector}::attr(content)").getall()
            extracted = _first_non_empty_text(content_matches)
            if extracted:
                return extracted, None
        except Exception:
            pass

    return None, None


def detect_item_name(url: str) -> str | None:
    try:
        response = requests.get(url, headers=REQUEST_HEADERS, timeout=20)
        response.raise_for_status()
    except requests.RequestException:
        return None

    parsed = Selector(text=response.text)

    candidates = []
    candidates.extend(parsed.css('meta[property="og:title"]::attr(content)').getall())
    candidates.extend(parsed.css('meta[name="twitter:title"]::attr(content)').getall())
    candidates.extend(parsed.css("h1::text").getall())
    candidates.extend(parsed.css("title::text").getall())

    name = _first_non_empty_text(candidates)
    if name:
        cleaned = re.sub(r"\s+", " ", name).strip()
        if cleaned:
            return cleaned[:180]

    parsed_url = urlparse(url)
    if parsed_url.netloc:
        return f"Item from {parsed_url.netloc}"

    return None


def check_item_price(item) -> tuple[bool, float | None, str | None, str | None, str | None]:
    try:
        response = requests.get(item["url"], headers=REQUEST_HEADERS, timeout=20)
        response.raise_for_status()
    except requests.RequestException as exc:
        return False, None, None, f"HTTP error: {exc}", None

    raw_text = None
    selector_value = (item["selector"] or "").strip()

    if selector_value:
        raw_text, selector_error = _extract_raw_text(response.text, selector_value, item["selector_type"])
        if selector_error:
            return False, None, None, selector_error, None

    if not raw_text:
        raw_text = _fallback_extract_price_text(response.text)
        if not raw_text:
            return (
                False,
                None,
                None,
                "Could not automatically detect a price. Add a selector for better accuracy.",
                None,
            )

    price = _normalize_price(raw_text)
    if price is None:
        return False, None, raw_text, "Could not parse numeric price from matched content.", None

    currency = _fallback_extract_currency(response.text, raw_text)

    return True, price, raw_text, None, currency
