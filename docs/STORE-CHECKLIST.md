# App Store checklist: Lyrica (native iPhone app)

Lyrica is already a native SwiftUI app, so there is no Capacitor wrapper. The web app in `web/` is a separate PWA. Nothing here was built or signed: the iOS target was only type-checked against the iOS 27.2 simulator SDK (`swiftc -typecheck`, 0 errors) and `swift test` runs the 25 LyricaCore tests.

## Placeholders to replace before submitting

| Placeholder | Where | Needs |
| --- | --- | --- |
| `https://example.com/TODO_PRIVACY_URL` | `Lyrica/Models/AppSettings.swift` (`AppLinks.privacyPolicy`), `web/app.mjs` (`PRIVACY_URL`) | A hosted privacy policy (also required in App Store Connect) |
| `https://example.com/TODO_SUPPORT_URL` | `AppLinks.support`, `web/app.mjs` (`SUPPORT_URL`) | A support page or contact address |

Settings > About shows both links plus the version and build.

## Project settings (already in place)

- `INFOPLIST_KEY_ITSAppUsesNonExemptEncryption = NO` (export compliance) is set in both build configurations.
- `Lyrica/PrivacyInfo.xcprivacy`: no tracking, no collected data types, UserDefaults reason `CA92.1`. Re-check it if you add any SDK.
- App icon: `AppIcon.png` is 1024x1024, opaque, no alpha. `web/icon*.png` carry the same artwork (`web/apple-touch-icon.png` is the 180px version).
- Launch screen: `INFOPLIST_KEY_UILaunchScreen_BackgroundColor = Paper` was added so the launch background follows the asset (white in light, black in dark). Not verified in Xcode: open the project once and confirm the setting is accepted, then check a cold launch in dark mode on a device.

## App Store Connect

- Privacy "nutrition label": Data Not Collected. Search terms go to Apple (iTunes Search API) and song metadata to LRCLIB, neither tied to an identity; Lyrica has no analytics, accounts or backend.
- Age rating, category (Music), screenshots (6.9" and 6.5" iPhone; `docs/ios/` holds simulator captures, not store assets), keywords, review notes (no login; translation uses Apple's on-device Translation framework, language downloads need a connection).
- Needs the owner: copyright review of LRCLIB lyrics. Lyrics belong to their rights holders; storing them offline is an opt-in the user confirms. This is flagged here and in Settings > About, not resolved.

## Not verified

- No Xcode build, no device run: the Translation framework, Dynamic Type, VoiceOver, haptics and the launch screen need a physical iPhone.
- The `Tests/` vs `tests/` folders are one directory on macOS (see the repo notes): git tracks `Tests/LyricaCoreTests` and `tests/web` under different cases. The owner needs to pick one spelling (and update `.github/workflows/*.yml`) before the repo is cloned on a case-sensitive file system.
