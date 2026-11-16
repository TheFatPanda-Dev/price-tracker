# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated: Next.js 16 (App Router, Server Actions) + TypeScript + Tailwind CSS v4, SQLite through Drizzle ORM, Playwright (headless Chromium) for reading prices off JS-heavy shops, an in-process scheduler, and Nodemailer + Telegram Bot API for alerts. Chosen because the whole thing ships as one Docker image that runs on a Synology NAS (amd64 or arm64) and can move unchanged to a VPS later.

## Users

The owner, plus family and friends the owner invites. Each person keeps their own watchlist of roughly 20–100 products they are waiting to buy. They paste product links on a computer and glance at what changed on a phone, about equally often. Interface language is English.

## Product Purpose

Paste a product link from any online shop. The tracker reads the current price, records it, and checks again every 6 hours. If the price is the same, nothing is written. If it changes, the new price is stored together with the percentage it moved: drops shown in green, rises in red. Success means a person never has to revisit a shop to know whether a product got cheaper.

## Positioning

Self-hosted and shop-agnostic. It is not tied to one retailer the way most price trackers are: it reads structured product data first, falls back to a real headless browser for heavy shops (Amazon, eBay, AliExpress), and lets the user point at the price element by hand when both fail. It runs from the owner's home connection, which shops block far less often than datacenter IPs.

## Operating Context

- Adding a product: copy a URL from a shop tab, paste it, see name, image and price confirmed within seconds.
- Checking in: a short glance on a phone ("did anything drop?"), sorted by what moved most recently.
- Alerts arrive outside the app: in-app feed, Telegram message, and email, each toggled per user in settings.
- Target price per product (optional): reaching it triggers a highlighted alert and a badge.
- Accounts are invite-only. The first account becomes the admin and creates invite links.

## Capabilities and Constraints

- Price checks every 6 hours by default (per-user setting); a manual "check now" per product.
- History stores only changes (plus the first reading), each with the previous price and percent change.
- Prices stay in the currency the shop shows; there is no currency conversion.
- Some shops block automated readers; failed checks must be visible and recoverable, not silent.
- Runs as a single Docker container with a SQLite file on a mounted volume (backup = copy the file).
- Undecided: final product name ("Price Tracker" is a working name).

## Evidence on Hand

No real users, testimonials, logos or screenshots yet. Demo data in development must be labeled as sample data.

## Product Principles

1. The change is the news: what moved, by how much, in which direction, comes before everything else.
2. Trust the number: always show when a price was last checked and whether that check worked.
3. Pasting a link is the whole onboarding.
4. Quiet when nothing happens; loud only when a price moves or a target is hit.

## Accessibility & Inclusion

Up/down must never be conveyed by red/green color alone: every change carries an arrow and a signed percentage, so the data stays readable for color-blind users.
