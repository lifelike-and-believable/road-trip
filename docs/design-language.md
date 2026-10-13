# Design language

Road Trip and the Montreal Weekend Board are companion apps. They share one look and one set of interaction rules, so that someone who uses one finds the other familiar and so that code and components can move between them. The Montreal board is the reference: its whole front end is `public/index.html` in the `montreal-weekend-board` repository, and this document records what is in it, how Road Trip applies it, and the few places where Road Trip deliberately differs.

When the two disagree and nothing here says why, Road Trip follows Montreal. A deliberate difference is listed under "Differences" and in the table of each section; add to that list when you make one.

## Tokens

Colours are custom properties on `:root` in `src/app/globals.css`, with dark values under `prefers-color-scheme: dark`. The names and values are Montreal's. A page never uses a literal colour.

| Role | Token | Light | Dark |
|---|---|---|---|
| Page | `--ground` | `#E7E8E4` | `#121614` |
| Card and row surface | `--surface`, `--surface-2` | `#FCFCFB`, `#F3F4F0` | `#1B211E`, `#222925` |
| Rules | `--line`, `--line-soft` | `#CDD0C8`, `#DFE1DA` | `#333C37`, `#2A322D` |
| Text | `--ink`, `--ink-2`, `--ink-3` | `#1A201E`, `#4C5551`, `#5F6862` | `#E7EAE5`, `#A9B2AC`, `#8F9A93` |
| Accent (oxidized copper) | `--accent`, `--accent-2`, `--accent-wash` | `#1F6F5C`, `#155244`, `#DCE9E3` | `#4FC3A1`, `#7FD8BD`, `#17302A` |
| Warning (brick) | `--brick`, `--brick-wash` | `#A6402F`, `#F2DED9` | `#E08573`, `#33201C` |
| Dark panel | `--panel`, `--panel-ink` | `#22302A`, `#EAEEE8` | `#080B0A`, `#EAEEE8` |
| Star | `--star` | `#8A5E08` | `#E8B94A` |
| Focus | `--focus` | `#1F6F5C` | `#4FC3A1` |

Category colours are `--c-theatre`, `--c-film`, `--c-music`, `--c-dance`, `--c-museum`, `--c-fest` and `--c-market`, each with a light and a dark value. Road Trip maps its own categories onto them in `src/components/categories.ts`. A category colour is never the only signal: the name is always printed beside it.

Other values: radius `--r: 4px` (3px on small controls, 2px on tags, 999px on chips), and `--shadow: 0 1px 2px rgba(26,32,30,.05), 0 8px 24px -14px rgba(26,32,30,.22)`. There are no spacing tokens. Spacing is literal and drawn from 5, 6, 8, 10, 12, 14, 18, 20, 26, 30, 34 and 44 px.

### Fonts

Three faces, loaded with `next/font/google` in `src/app/layout.tsx` (Montreal loads the same three from Google Fonts):

- **Newsreader** (serif): body text, descriptions, notes. Only the regular weight and its italic are used, so they are loaded as static files rather than the variable font.
- **Archivo** (sans, variable width and weight): every heading and every piece of interface text, at a chosen width through `font-variation-settings: "wdth" N, "wght" N`. This is the signature of the look.
- **IBM Plex Mono**: times, dates, counts and small print, with tabular numerals.

Faces are loaded with `font-display: optional`, so text is never held back or re-laid out when a face arrives; on a slow first visit the page shows a close fallback and the faces apply from the next load. Only Archivo and Newsreader are preloaded. Plex Mono and the italic are used on the board and not on the home page, so they load when needed. This keeps the home page inside the 2.5 s Largest Contentful Paint budget: loading the variable Newsreader with its optical-size axis and italic, and preloading everything, measured 4.2 s locally in Lighthouse's slow-4G simulation, and the shipped set measures about the same as before the design change (2.1 s median over seven runs).

## Type

Labels are small, uppercase and tracked. Content is mixed case. The scale:

| Element | Face and setting | Size |
|---|---|---|
| Page title (`h1`) | Archivo wdth 118, wght 800, uppercase, `-0.018em`, line height .94 | `clamp(30px, 6.2vw, 54px)` |
| Kicker (small line above the title) | Archivo wdth 82, wght 600, uppercase, `.14em` | 11px |
| Dateline | Newsreader | 15px |
| Stamp (status, last read) | Plex Mono | 11px |
| Day title | Archivo wdth 120, wght 800, uppercase, `-0.02em` | `clamp(26px, 4.4vw, 38px)` |
| Section and band labels | Archivo wdth 80, wght 700, uppercase, `.13em` | 10.5 to 11px |
| Event title | Archivo wdth 98, wght 700 | 15.5px |
| Event time | Plex Mono 500, `-0.02em` | 12.5px |
| Tags | Archivo wdth 80, wght 700, uppercase, `.09em` | 9.5px |
| Chips | Archivo wdth 88, wght 600, uppercase, `.07em` | 11px |
| Buttons | Archivo wdth 84 to 86, wght 700, uppercase, `.08em` | 10 to 11px |
| Body | Newsreader, line height 1.5 | 16px (venue 14px, notes 13.5px italic) |

## Layout

- **Header.** A hairline rule underneath, not a coloured band: kicker, title, dateline on the left, the stamp on the right. The dark `--panel` is kept for highlighted blocks.
- **Page.** A column at most 1240px wide with 20px gutters (16px under 560px), and room at the bottom for the plan. Safe-area insets are applied to the page, the filter bar and the plan, and standalone mode switches off pull-to-refresh bounce.
- **Filter bar.** Sticky at the top, translucent (`color-mix` of `--ground` with a 10px blur), pills that wrap and never scroll sideways. A focused element is never hidden behind it: `scroll-padding-top` on `html` leaves room.
- **Days.** Each day opens with a full-width button: the weekday in the day-title style, the date and the count on the right, a chevron that turns when the day is folded, and a 2px `--ink` rule under it. A day that is already past starts folded.
- **Inside a day.** Scheduled events are grouped under Morning (to 11:59), Afternoon (from noon), Evening (from 5 p.m.) and Late (from 8:30 p.m.), each with a band label and a count. Places with opening hours have no start time, so they are shown apart, in a group of cards headed "Open today" (the counterpart of Montreal's "Running all weekend").
- **Plan.** A drawer fixed to the bottom of the screen, as on Montreal: a bar with the count, "Copy plan" and "Clear" (when there are picks) and "Show itinerary" / "Hide itinerary". It starts closed, opens to the itinerary, and Escape closes it. The page keeps room at its end so the bar never covers the last card, and the toast sits above it.
- **Breakpoints** are 460, 560, 700, 720 and 760px.

## Components

- **Event row.** A grid of time, body and controls. The body is, in order: the title (a link) with its tags, an italic sub line, the venue and place, a note, and a clash line if the pick runs into another. The category is a coloured tag, never colour alone.
- **Card.** For places that are open rather than timed: a 3px top border in the category colour, the title, a Plex Mono line for the hours, the venue, tags and the buttons.
- **Tags.** Uppercase, 2px radius. The category tag is filled with the category colour. "Free" is outlined in `--c-market`. A price is shown as printed, in grey, and a bare "Ticketed" is shown when nothing more is known.
- **Add button.** A small toggle. Resting it is outlined and reads "Add". Added, it is filled with `--accent`, has a tick before the label and reads "On the plan". On the Montreal board a pick that runs into a calendar entry is dashed in brick until it is added, with a sentence beside it; Road Trip has no calendar, so an overlap between two picks is reported in the plan instead.
- **Star.** A small ☆ or ★ icon button with `aria-pressed`, dimmed until hovered or focused, filled with `--star` when on. It means "I like this", not "I am going", and does not add to the plan.
- **Hide.** A small ✕ with a brick hover. A hidden entry is dimmed and struck through, with "Bring back" in place of the controls, and hiding also removes any pick under it. Hidden entries are listed again through a "Hidden" chip in the filter bar.
- **Filter chips.** One per category, filled with the category colour when pressed. Then "Starred", "Free only", "Hidden" when something is hidden, and "Reset".
- **Plan row.** A grid of time, title with its place, and a remove control. Between two rows is the gap: 11px Plex Mono, in brick when it is a warning.
- **Copy plan.** Copies the plan as plain text, a heading per day then a line per pick, with a toast to say so.
- **Toast.** A small dark bubble above the plan, visible for about 1.6 seconds.
- **Map (Road Trip only).** The road is a 4 px line in `--accent`, a pin for each town where something has been found (none for a town with nothing listed) is a circle outlined in `--ink` and filled with `--surface` (filled with `--accent` when a pick on the plan is there, and larger when it is the chosen town). A pin's tooltip is a dark bubble like the toast and says the town and how many listings are near it. Leaflet's controls and attribution take the page's colours, and in dark mode the tiles are darkened with a filter. A listing with coordinates is a small pin in its category's colour, ringed in `--accent` when it is on the plan; choosing it takes the traveller to its card, which is outlined for a moment, and the card's Map button does the reverse. Under the map a row of chips, one per such town with its count, does the same from the keyboard. The map never draws a road it does not have.
- **Getting ready (Road Trip only).** A quiet box ("Getting this trip ready.") with three steps, each a mark (✓ done, … in progress, ○ waiting, ⚠ did not finish) and its name in the text, a small grey note where there is something to say, and a "Try again" button only after a failure. It replaces the buttons that used to build the route and find sources by hand: nothing is started by hand.
- **Banners.** A brick box with a thick left border for a problem, a quiet box for a note.
- **Gate.** A full-screen cover with a short title, one sentence, a passcode field and an "Unlock" button. It shows an error under the field and focuses the field when it opens.

## Interaction

- Toggles use `aria-pressed`, folds use `aria-expanded`, and icon buttons carry the item's name in their label ("Star Jazz night", "Hide Jazz night").
- Focus is a 2px outline in `--focus`, offset 2px.
- Transitions are 0.12s on controls, 0.18s on the chevron and 0.2s on the toast, and are switched off under `prefers-reduced-motion`.
- Colour is never the only signal. A dashed border on a clash is matched by a sentence; a category colour by its name.
- What persists: picks, stars and hidden entries are saved per trip on the server, so they follow the traveller between devices. Fold state and other per-device preferences stay in the browser (the day folds are kept per trip under `rt-folds-<id>`; a browser that will not store anything starts every day open). Filters last only for the visit.

## Voice

Plain, warm and second person, with short sentences, no exclamation marks, and no emoji. The symbols used are ✓ ★ ☆ ✕ × ⚠ and →. Canadian English throughout: "colour", "neighbourhood", `en-CA` dates, times as `7:00 p.m.` and durations as `45 min` or `1 h 15 min`. A time that is not known says so ("time to be confirmed") and a figure that is not known is left out. A drive time is only shown when the routing service gave one, and says so.

## Differences from the Montreal board

These are deliberate. Each has a reason.

| Montreal | Road Trip | Why |
|---|---|---|
| `--ink-3: #767F79` (light) and `#7F8A84` (dark) | `#5F6862` and `#8F9A93` | The Montreal values are about 3.4:1 against the page and are used for text as small as 9.5px. Road Trip meets 4.5:1. |
| `--c-fest: #B8631F` (light) | `#A3541A` | The same reason. |
| Icon controls are 22px | The glyph is the same size, but the control keeps a 44px hit area | WCAG 2.2 target size, and a phone in a car. |
| Pills and buttons have no minimum height | At least 44px | The same. |
| Focus outline is 2px | 3px | More visible. |
| Calendar clashes, "+ Calendar", posters, weather, métro and neighbourhood, "Don't miss", the taste profile | Not carried over | They depend on a calendar, a home city and a single weekend, which a road trip does not have. The drive time between picks takes the place of the neighbourhood and line. |
| Em dashes in copy | The copy written so far uses commas and colons | Kept as it is. Match Montreal's dashes only if asked. |
| Button "Unlock", gate title "The Weekend Board" | "Unlock", gate title "Road Trip" | The same words, with the app's own name. |

## Status of Road Trip against this document

| Part | State |
|---|---|
| Tokens, fonts, type scale | Built |
| Header, filter bar, day folds (a past day starts folded), bands, "Open today" | Built |
| Event row, card, tags, Add, Star | Built |
| Plan rows and the gaps between them | Built |
| Gate | Built |
| Hide, "Bring back", "Hidden" chip | Built |
| Copy plan, Clear, toast | Built |
| Getting-ready steps that follow themselves | Built (Road Trip only) |
| Map of the route with a row of stops under it | Built (new; Montreal has no map) |
| Plan as a bottom drawer | Built |
| Days side by side in columns on wide screens | Built |
| Fold state kept in the browser (per trip, `rt-folds-<id>`) | Built |
| Map | Not in Montreal; designed for Road Trip first, see `PLAN.md` |
