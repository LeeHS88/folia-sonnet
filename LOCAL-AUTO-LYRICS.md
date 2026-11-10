# Automatic lyrics for YouTube uploads

Local customization of Folia 0.7.23, retaining the saved-Mix/endless-playback patch.

## Behavior

Folia's existing automatic lyric matcher now receives a clean song identity for structured YouTube upload titles, such as `盧盧快閉嘴 - 流離『…』【動態歌詞MV】`. The title and singer are extracted for searching; playback still uses the original video. An explicit `Artist - Topic` channel is also recognized. Arbitrary channel names are not assumed to be singers.

Upload presentation labels and quoted lyric excerpts are removed. Live, cover, remix and other rendition markers are preserved. Automatic selection requires a close title/artist match, matching rendition markers, and a known duration within three seconds. Missing durations are resolved from cached video details before matching. Ambiguous uploads keep the manual Match Online option.

The normal cross-source matcher searches Folia's available lyric sources, with the configured priority and preference for word-by-word timing. Playback is released before this background search. Upcoming-song prefetch uses the same identity rules. Successful matches are stored by original provider/video identity and reused on later plays. Imported/manual selections take precedence, including selections made while an automatic search is in progress. A response for a song no longer current is not displayed on its replacement.

This matches existing timestamped lyrics; it is not audio fingerprinting or automatic measurement of an upload's added intro/outro. Such edits can still require a manual timeline offset. Missing lyrics, ambiguous metadata, long compilations and significantly different recordings are not guessed.

## Verification

- 1,288 focused lyric/YouTube/playback/prefetch tests passed; one pre-existing test is skipped. The separate Omni architecture suite passed (3 tests). Final online-playback/architecture checks passed (42 tests, overlapping those totals).
- TypeScript checking and the desktop production build passed.
- A live QQ search identified `流离` by `卢卢快闭嘴` (ID 610979971), duration 279 seconds, with 72 word-by-word timed lines.
- The isolated desktop profile read the actual saved video from the `loop` playlist. Its raw row lacked artist and duration; video details recovered 277 seconds and the cleaned identity matched the same QQ recording.
- The normal lyric-loading pipeline stored that match; the next load returned its 72 timed lines from the saved match in 7 ms with no automatic search.
- No audio was started during the isolated checks. The temporary test profile is removed after verification.
- After installation, the real app opened successfully. Its Lyrics settings show Auto Use Best Lyric enabled and QQ Music selected as the preferred source; both automatic-update settings remain false.

## Files and rollback

Provider rules: `src/services/onlineMusic/ytm/ytmLyricIdentity.ts`, `ytmProvider.ts`, `ytmCatalog.ts`. The capability goes through `types/onlineMusic.ts` and `services/onlineMusic/omni.ts`. Shared matching gates are in `utils/lyrics/recordingMatch.ts` and `autoMatchBestLyric.ts`. Playback, prefetch and manual search all use the same resolved identity.

Installed archive backup: `C:\Users\Hong Sheng\AppData\Local\Programs\Folia\backups\app.asar.before-auto-lyrics-0.7.23`.

To undo only this improvement, close Folia, copy that backup over `resources\app.asar`, and restart Folia. That backup retains the endless-Mix patch. Automatic update checking and downloads remain disabled in the existing settings.

The packaging manifest is `..\folia-maintenance\lyrics-patch-manifest.json`. To rebuild, produce the desktop Vite build with `ELECTRON=true`, then run `prepare-mixes.cjs` against the original 0.7.23 archive backup with `lyrics` as the third argument. Do not use the archive with another Folia version.
