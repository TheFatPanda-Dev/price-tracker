---
version: 1
slug: "src-app-app-page-tsx"
primary_target: "src/app/(app)/page.tsx"
related_targets: ["src/app/(app)/layout.tsx","src/app/(app)/products/[id]/page.tsx","src/app/(app)/settings/page.tsx"]
---

# Watchlist (app shell + every signed-in screen)

Mode: Operate. Scope: the watchlist home, product detail, activity, settings and admin screens share this world; sign-in/setup/invite pages use the board shell alone.

Audience and job: owner plus invited family/friends, 20–100 products each, half desktop (pasting links), half phone (glancing for drops). Job: know what moved, by how much, and whether a target was hit, without visiting shops.

Constraints: drops green, rises red, always with arrow and signed percentage (never colour alone). History stores only changes. Failed checks must be visible.

## Direction contract

THESIS: The watchlist is a station departures board. Every product is a timetable row, and a price change is the announcement. Refuses the category default: a white grid of product cards with pill badges and sparklines.

OWN-WORLD: Board-black shell (#15181e) with flap-white type; timetable yellow (#ffd23f) for the primary action, group bands and the next-check time; warm platform-paper content ground. Drop green and rise red appear only on rows that moved. One reserved signal blue marks target prices and nothing else. Barlow / Barlow Semi Condensed station-signage grotesk, tabular numerals everywhere. Superseded prices stay struck through; failed checks stamp the row.

STORY: At a glance the visitor sees which products moved since the last check, by how much, in which direction, which hit a target, and that every number was read recently. Pasting a link adds a row.

FIRST VIEWPORT: Full-width dark board header: brand left, nav (Watchlist, Activity, Settings), account right; full-width paste-a-link field with a yellow "Track price" button; a status line (products, changed today, targets hit, "Next check 18:00" in yellow). Below, on paper: Watchlist heading, filter chips and sort; a timetable table grouped by last change (Today / This week / Earlier) under yellow bands, with columns Changed, Product (thumb, name, shop), Price, Change ▲▼ %, Lowest–highest range bar, Checked, Next. On a phone the rows stack into two-line entries.

FORM: Departures Board, position 5 of the ordered list, seed:baf72a73619c97f8. Signature move: a price that changed since your last visit is set in split-flap cells that flip once; unchanged prices are plain type.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
