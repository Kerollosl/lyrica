# Lyrica visual system

Lyrica is a focused music-reading app. Artwork identifies the song; language controls explain the pairing; typography and a single scroll surface do the reading work. The website and iPhone app share hierarchy, surfaces, and color while using controls appropriate to each platform.

## Tokens

| Role | Light | Dark |
| --- | --- | --- |
| Canvas | `#F7F7F4` | `#171A18` |
| Raised surface | `#FFFFFF` | `#202522` |
| Primary text | `#20231F` | `#F0F3EC` |
| Secondary text | `#656B63` | `#A6AEA5` |
| Accent | `#C45238` | `#F2A58C` |
| Subtle selected surface (web) | `#FCEBE5` | `#3E2B25` |

The table lists web tokens in `web/style.css`. Native semantic colors live in the asset catalog and are exposed through `LyricaStyle`; the dark native text colors are slightly brighter (`#F3F4F0` primary and `#B1B8AF` secondary), while canvas, surfaces, and accent are shared. Native selected rows use a subtle accent tint over the canvas. Accent buttons use explicit contrasting foreground colors: white in light mode, dark ink in dark mode. Measured web ratios: white on coral 4.55:1, secondary text on the light canvas 5.10:1, and secondary text on the dark surface 6.83:1.

Web uses locally hosted variable Manrope (400–800), with its SIL Open Font License in `web/fonts/OFL.txt`. Other scripts fall back to platform fonts. iOS uses SF typography and Dynamic Type. The italic Lyrica wordmark is the only prominent serif treatment. Display text is concise and balanced; utility text uses sentence case.

Use a 4-point spacing rhythm, with 16–24-point content insets. Web surface corners are 24px, controls 12–16px; native surfaces use 18–20pt and system control conventions. Interactive controls target at least 44px/pt. Icons use a consistent local SVG set on web and SF Symbols on iOS. Do not use platform-dependent text glyphs as controls.

## Screens

- **Discover:** search is the primary action. Show real recent history and recent queries, never invented trending songs. The web demo is explicitly authored sample content with included translations.
- **Reader:** compact metadata, paired source/target controls, then aligned lyric rows. Both columns share a single scroll surface. Original remains physically left in columns; each text cell independently controls its text direction. Translation is secondary in hierarchy, not low contrast. Highlight both versions together.
- **Adaptive reader:** web automatically stacks below 600px; native automatically stacks below 375pt or at accessibility text sizes. A manual stacked preference remains available.
- **Library:** favorite artwork cards and recently viewed rows. A saved badge means content is stored; a favorite alone can be a metadata bookmark. Show clear empty/search states.
- **Settings:** Reading, Appearance, and Storage are separate groups. Keep service availability, privacy, and rights explanations accessible without dominating the primary tasks.

On web, the navigation is horizontal on larger screens and fixed at the bottom on phones. Bottom padding accounts for that bar and safe areas. Native retains its standard tab/navigation stack. Language controls stay visible while scrolling the reader. Reader options group text size, layout, and manual input, with keyboard focus preserved when web controls rerender.

## Motion and accessibility

Use short color/surface/pressed transitions. Do not restart decorative entry animation on language or translation updates. Loading placeholders match the shape of the content, with a semantic loading status. Reduced-motion preferences disable animation. Preserve visible keyboard focus, skip navigation, readable wrapped titles, independent RTL text, native VoiceOver labels, and normal browser zoom.

## Verification and captures

`tests/web/browser.py` verifies the primary workflows, loading/errors/empty results, keyboard behavior, long wrapped text, Arabic, both themes, and the responsive viewport matrix. `tests/web/capture.py` captures the real app at 390, 768, and 1440px in both themes using only the original demo. Mobile captures show the viewport so the fixed navigation appears as on a device. Desktop/tablet captures include full content.

Native CI builds device and simulator paths, runs persistence/view-model tests, and captures light/dark Search screens. Simulator images are runtime evidence, not physical-device translation or accessibility acceptance. Browser model downloads and native Translation consent still need compatible real-device checks. Source services, storage schemas, and permission defaults are unchanged by the visual redesign.
