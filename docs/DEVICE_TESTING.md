# Device acceptance checklist

Run on an iPhone with iOS 18 or later. This is a manual release checklist, not a record of checks already completed.

## Search and lyrics

- Search by title, artist, and album; type rapidly and verify stale results never replace a newer query.
- Paste both an Apple Music `/song/.../id` link and an album link with `?i=...`; verify the selected recording’s title, artist, album, and duration.
- Paste an album-only link and a non-Apple URL; verify understandable guidance.
- Choose a Spanish song for which LRCLIB has lyrics. Confirm the recording matches, stanza breaks survive, and timestamped fallback has no LRC tags.
- Verify empty results, ambiguous recordings, instrumental tracks, offline search, timeout, and rate-limit guidance.
- Paste authorized lyrics manually when none are found, and replace them later; confirm any old translation disappears.

## Translation and reading

- Translate Spanish → English with installed models and with a model not yet installed. Verify Apple’s download consent flow and retry after cancellation.
- Correct a wrongly detected source language. Verify unsupported/same-language pairs are explained.
- Switch target while translation is running, leave the reader during a download, and return; ensure no old-language result overwrites the selected target.
- Verify line breaks, repeated lines, blank stanzas, punctuation-only lines, and long wrapped translations stay paired.
- Tap a line and confirm both versions highlight. Test stacked and side-by-side layouts.
- Use an available Arabic language pair. Confirm original/translation directions are independent and structural columns do not reverse unexpectedly.
- Test the smallest supported iPhone width, landscape, the largest Accessibility text size, VoiceOver, Increase Contrast, Reduce Motion, light mode, and dark mode.

## Library and local data

- Before storage opt-in, read a song and favorite it; confirm metadata persists without a lyric copy.
- Opt in only for permitted material. Save and translate a song; relaunch in airplane mode and verify cached originals and translations open.
- Switch to a cached target offline; confirm it appears immediately. Switch to an uncached target and verify the model/download limitation is clear.
- Search library history and favorites. Remove an individual song and confirm its saved translations are also removed.
- Clear lyric/translation caches, retaining song metadata. Then remove all app data and confirm library and recent searches are empty.
- Change default language, text size, and appearance; relaunch and confirm the choices persist.

## Release evidence

Record the device/OS, tested language pairs, build commit, Xcode version, `swift test` result, `xcodebuild test` result, and remaining known limitations in the release or pull request. Capture real screenshots after runtime verification to supplement the illustrated design previews.
