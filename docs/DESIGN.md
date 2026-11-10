# Lyrica interface

Lyrica is a lyrics reader. Search identifies a recording; the reader pairs its original words with a translation. The interface is soft and modern: familiar platform controls, generous spacing, rounded surfaces, and springy motion, with system typography so those two tasks stay clear.

## Typography and layout

The web app uses the platform font stack: `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `system-ui`, and sans-serif. It loads no custom font. The Lyrica wordmark uses the same family as the controls. iPhone uses standard SwiftUI text styles, SF Symbols, Dynamic Type, and native List/Form layouts.

Web page titles are 36px bold with tight tracking (34px on phones), song titles in the reader are 30px bold, section headings 22px, and ordinary interface text is 15–17px. Interface sizes are written in `rem` so browser and system text-size settings apply; lyrics use the reader’s own adjustable size and a regular weight. Keep labels readable and use weight, alignment, and spacing to establish hierarchy.

Use 24px content insets on phones and 32px on larger web layouts. Spacing follows a 4/8 rhythm (4, 8, 12, 16, 24, 32, 48), with 32–48px between sections. The main web content has a maximum width of 1088px including its insets. Related controls sit close together; sections are separated by space or a single divider. Radii come from one scale: 10px (small controls), 16px (fields, rows, cards), 24px (example card, settings groups, dialogs, floating tab bar), and full pills (segmented control, nav, chips). Touch actions target 44px/pt.

Elevation has three levels, declared once per surface: E1 for cards and rows, E2 for the floating tab bar, menus and toasts, E3 for dialogs. Dark mode uses a hairline ring plus a deeper shadow. Avoid gradients, glass or blur as decoration, nested cards, and oversized promotional headings.

## Color and surfaces

The web tokens in `web/style.css` are:

| Role | Light | Dark |
| --- | --- | --- |
| Canvas | `#F6F6F9` | `#0B0B0D` |
| Surface | `#FFFFFF` | `#1C1C1E` |
| Field | `#F2F2F7` | `#262628` |
| Primary text | `#1D1D1F` | `#F5F5F7` |
| Secondary text | `#606065` | `#B0B0B5` |
| Divider | `#DEDEE3` | `#38383A` |
| Accent | `#0066CC` | `#64A8FF` |
| Selected lyric row | `#EAF3FF` | `#172C47` |
| Filled action (white text) | `#0066CC` | `#0066CC` |
| Selected segment | `#FFFFFF` | `#48484A` |
| Switch off | `#8A8A8E` | `#7C7C80` |

Settings uses the grouped color (`#F6F6F9` / `#0B0B0D`) as its page background with one level of surface cards on top — never a panel inside a panel.

Native views use system background, grouped background, and separator colors, the `SecondaryInk` asset for secondary text (the system secondary label is dimmer than the web’s 4.5:1 token), and the `AccentColor` / `AccentInk` assets: the accent supplies the same blue pair as the web app, and filled actions use `AccentInk` for their label so contrast holds in dark mode. Use color for actions, selection, and meaningful status. Artwork supplies the recording’s identity; it is not a reason to tint the interface.

## Motion

Motion uses springs with a little bounce so the interface feels physical, never slow. Tokens in `web/style.css`: `--spring-snappy` (about 380ms, slight overshoot) for presses, hovers and menus; `--spring-bouncy` (about 520ms, visible overshoot) for the favorite heart, switches, dialogs and toasts; `--ease-out` for page and list entrances. Buttons and cards sink to 0.96–0.985 when pressed. A page change rises 12px with a short stagger; re-rendering the same page does not replay it. On iPhone, `LyricaStyle.spring` and `PressScaleStyle` do the same job, the Search example card zooms into the Reader, and favorites and line selection give haptics. Reduced motion removes travel, scale and springs on both platforms; color and opacity changes remain.

## Screens

- **Search:** show a direct heading, song search, Apple Music link guidance, and actual recent activity. Native search remains in the navigation bar and runs when the user presses Return, not on every keystroke. The web example is a small optional row using original fictional lyrics and included translations. Do not invent recommendations or trending songs.
- **Reader:** show compact recording metadata, source/target language controls, then aligned lyric rows on a single scrolling surface. Language pickers are borderless accent text with a chevron, like the native Menu; their edges and widths match their lyric columns. Original stays physically left in columns; each text cell controls its own text direction. Selecting a row highlights both versions, but lyric text stays selectable so a phrase can be copied or looked up. Stanza breaks scale with the reading size. Until a translation exists the reader shows the original alone, never placeholder dashes. Rows wrap naturally without separate scroll views.
- **Study:** Hide translations covers each translation with a quiet field-colored bar until its line is tapped. It is a reading aid, not a separate mode: the same rows, the same highlight.
- **Addresses:** every song has a `#song/<id>` URL. Refresh keeps it open, Back returns to the list position it was opened from, and Share or Copy link reuses the same address.
- **Adaptive reader:** web stacks below 600px; native automatically stacks below 600pt (every iPhone in portrait) or at accessibility text sizes. Manual stacked layout remains available. Keep the translation legible rather than lowering its contrast for decoration.
- **Library:** favorites use artwork with plain labels; recently viewed songs use rows. “Offline” means lyric content is stored, on both platforms; “Favorite” only ever means the bookmark. A favorite can be only a metadata bookmark. On Favorites, the card’s filled heart unfavorites with Undo; on Recently viewed, × removes the song after confirmation. Both platforms list Recently viewed first. Retain empty states, search, and individual removal.
- **Settings:** use familiar Reading, Appearance, and Storage groups. Storage actions are full-width rows (export and import a backup, remove models, clear content, delete). “Remember recent searches and songs” turns history off; favorites and offline songs are separate choices. About lists the version, Privacy Policy and Support links. Keep service compatibility, privacy, and rights details accessible without repeating them across the primary screens.

Web navigation is a header with a pill-shaped active item on larger screens and a floating tab bar on phones. Bottom padding accounts for the tab bar and safe area. Native keeps standard tabs and navigation stacks. The reader’s language controls stay visible while scrolling; on phones the header scrolls away in the reader and the language row collapses to one line (`Español → English`), and on short viewports (landscape, heavy zoom) nothing is pinned but the tab bar. Native unpins the language bar at accessibility text sizes. Reader options group text size, layout, and manual input; rerendering web controls preserves keyboard focus. Phone readers get one brief hint that the two languages stack. Keep other repeated headings and status labels out of the lyric reading area.

## States and accessibility

Keep loading, empty, error, unsupported-language, and model-download states explicit and recoverable. Browser translator and language-detector checks time out after three seconds instead of freezing the reader. When detection fails, the status offers to choose the language; Arabic, Hebrew, Korean, Japanese, Chinese, and Hindi are recognised from their script. If the browser blocks storage, the app keeps working for the session and says so. Loading placeholders follow the content’s dimensions. Manual translation explains the expected line count and provides an optional expandable original. Protect unsaved manual edits and return focus to the opener after a dialog. A favorite remains a bookmark when offline storage is declined, and the offer is made once; removing a saved song explains that its lyrics and translations will also be deleted, and turning offline storage off asks before deleting anything. Keep transitions short and respect reduced-motion preferences. Preserve keyboard focus, skip navigation, normal browser zoom, wrapped text, independent RTL direction, and native accessibility labels. Lyrics are one Tab stop: arrow keys or J/K move the highlighted line, Space/Enter toggles it, Escape clears it. Typing in Search or Library updates only the results, so the caret and IME composition are never disturbed. Short status messages go through one persistent screen-reader announcer.

Lyrics storage remains opt-in. Cosmetic changes must not change API behavior, local schemas, cache permission, attribution, or rights explanations.

## Verification and captures

`tests/web/browser.py` exercises reading, storage, search, failure states, keyboard behavior, dialog drafts, focus restoration, long wrapped text, Arabic, both appearances, and responsive layouts. It also covers song URLs, keyboard line navigation, selectable text, copying, study mode, storage safety, Undo, backup, session-only storage, and caret stability. `tests/web/capture.py` records Search, Reader, Library, and Settings at 390, 768, and 1440px in both themes using only the original demo. Phone captures show the viewport and fixed navigation; larger captures include full content. See the [comprehensive UI audit](UI_AUDIT.md) for the review findings and limits.

Native CI builds device and simulator paths, runs core and persistence/view-model tests, and captures light/dark Search screens. Debug builds accept `-LyricaOpenExample` to open the example reader for simulator captures. A simulator capture does not verify physical-device translation or accessibility. Actual model downloads, translation quality, VoiceOver, and device-specific behavior remain part of the device acceptance checks. Consult the workflow results and `docs/VALIDATION.md` for the status of a particular revision.
