# Local saved YouTube Mix support

Based on Folia 0.7.23 (`c0742c0721020a1cbd603d8fbdc76e5c39131b27`).

## What changed

Saved Mixes from YouTube's Playlists page now appear alongside Folia's YouTube Music playlists. Open a Mix to load the personalized video queue using Folia's existing signed-in YouTube session. Streaming continues through Folia's existing player; no manual audio downloads or additional sign-in are required.

`electron/ytm/youtubeMixes.cjs` reads YouTube's WEB library cards and watch queue. `electron/ytm/ytmApiBridge.cjs` supplements the music library after its last page and routes these Mixes to the signed-in WEB client. The `youtube_mix_` collection-id prefix preserves the routing across restarts, using the existing Mix wire contract and Omni catalog flow. Credentials stay in the main process and retain the existing origin/redirect protections.

Saved Mixes now refill automatically when five songs remain. The provider asks YouTube for the sliding window around the last queued video and appends its successors, filtering duplicates. Stream identity travels with each song through the normal Omni interface. A single pending request is shared with the end-of-queue advance; switching or editing queues discards stale responses. Failed/empty refills retry at most once per 30 seconds while playing. A Mix never intentionally loops to its initial batch when its refill fails.

After installing, reopen the saved Mix and choose **Play all** once: queues restored from before this patch do not contain the new stream identity. The collection view still starts with 25 tracks; the playback queue grows during listening.

Automatic update checking (`ENABLE_UPDATE_CHECK`) and automatic downloads (`ENABLE_AUTO_UPDATE`) are both set to false in the installed app's settings. Manual updating or reinstalling can still replace the customization.

## Current limits

- Covers saved Mixes, not all unsaved recommendations on YouTube's homepage.
- Initially loads the current batch supplied by YouTube (25 songs in the live test), then refills the playback queue while listening. Internet access and a valid Folia YouTube sign-in remain necessary. Repeat-one still deliberately repeats the current track.
- Folia's existing Mix cache lasts five minutes. Reloading Folia clears that in-memory cache and refreshes saved playlists.
- Library additions/removals still happen on YouTube. These virtual Mix cards are not editable ordinary playlists.
- YouTube may change its private response formats; a future Folia update can replace this local patch.

## Validation

- 1,047 tests passed across 59 YouTube, playback and Omni architecture test files; TypeScript checking and the desktop production build passed.
- The isolated read-only probe expanded the saved Mix from 25 to 97 unique videos across three requests.
- The actual desktop renderer, using an isolated profile and the real signed-in API, automatically expanded 25 → 49 → 73 unique songs as the simulated current queue position approached each tail. Audio was not played during this verification.
- The installed app restarted successfully with its library and artwork intact; both update preferences were verified false after restart.
- Installed archive was validated using an independent ASAR reader; unchanged payload bytes were preserved.
- The maintenance packaging script also retains the user's Brave-first sign-in preference.

Run tests from this source folder:

```powershell
node node_modules/vitest/vitest.mjs run -c vitest.config.ts test/unit/ytm test/unit/playback test/unit/onlineMusic/omniArchitecture.test.ts
```

The Windows-only manual probe in `test/manual/ytmSavedMixProbe.cjs` accepts the existing Folia config path, an output JSON path, and optionally a raw Mix id. It uses a separate Electron profile and reads only the YouTube session from the existing config. Its output contains collection/song metadata, never credentials. It does not start playback.

## Installed patch and rollback

The installed app is `C:\Users\Hong Sheng\AppData\Local\Programs\Folia\Folia.exe`.

The original archive is backed up at `C:\Users\Hong Sheng\AppData\Local\Programs\Folia\backups\app.asar.before-youtube-mixes-0.7.23`.

The prior saved-Mix patch is backed up at `C:\Users\Hong Sheng\AppData\Local\Programs\Folia\backups\app.asar.before-endless-mixes-0.7.23`. The original settings are retained beside `config.json` as `config.before-endless-mixes-20261027.json`.

The adjacent `..\folia-maintenance\prepare-mixes.cjs` creates the version-checked patched archive from the original backup without changing the installation. Build the renderer first with `ELECTRON=true` and `ELECTRON_DEV=false`. `..\folia-maintenance\endless-patch-manifest.json` records hashes and all changed files. Do not apply this archive to another Folia version.

To undo the installed customization, close Folia and replace its `resources\app.asar` with the backup above, then reopen Folia. This restores the official 0.7.23 code, including its original browser preference, without deleting your settings or library.
