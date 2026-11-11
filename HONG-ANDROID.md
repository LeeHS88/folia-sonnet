# Hong's customized Folia for Android

Branch `hong-custom`: [maimai993/folia-sonnet](https://github.com/maimai993/folia-sonnet) (the community
Android port of Folia, 0.7.27.x) with the customizations made on the desktop Folia 0.7.23
(`OneDrive\Documents\ChatGPT\GIT Music\folia-source`) carried over.

## What's in it

| Customization | Desktop notes | On Android |
|---|---|---|
| Saved YouTube Mixes in the playlist list | `LOCAL-YOUTUBE-MIXES.md` | New: the Android bridge now lists your YouTube Music library playlists, followed by the saved Mixes from your YouTube library (`ytmAndroidLibrary.ts`, `user_playlists` / `playlist` / `mix` in `ytmAndroidBridge.ts`). |
| Endless autoplay for saved Mixes (refill when 5 songs remain) | `LOCAL-YOUTUBE-MIXES.md` | Same renderer code (`useEndlessQueue.ts`); refills go through the Android bridge and reach the native player through its queue mirror. |
| Automatic lyric matching for YouTube uploads | `LOCAL-AUTO-LYRICS.md` | Same code, merged with the port's newer lyric options (search aliases, keep-own-word-timing). |
| Artwork-only queue tiles | `LOCAL-ARTWORK-ONLY.md` | Same code; tap a tile to show its title (phones have no hover). |
| Brave first for sign-in | — | Not needed: Android signs in inside the app. |
| Automatic updates off | — | A sideloaded APK never updates itself. |

## Fixes to the port itself

- **No sound for YouTube Music (fixed):** the port's native audio engine (ExoPlayer) was handed the
  WebView-only address of the downloaded song (`https://localhost/_capacitor_file_/…`) and failed with
  `ERROR_CODE_IO_NETWORK_CONNECTION_FAILED`. `toNativeMediaUrl` in `nativePlaybackEngine.ts` now
  gives it the file itself, and `FoliaNativePlayer.kt` now builds its players on `DefaultDataSource`
  (it was HTTP-only, so any `file://` failed with `ERROR_CODE_IO_UNSPECIFIED`).

- **Endless autoplay never refilled on Android (fixed):** the refill waited for the store's
  `playerState` to be PLAYING, which the native player never sets (it stays IDLE from the song change
  while ExoPlayer plays). `useEndlessQueue.ts` now refills unless playback is paused.

- **Next song jumped back to song 1 in the background (fixed):** when a song ended, the native
  player tried to fetch the next YouTube Music song itself (it can't: only the WebView can), and
  in the background it silently skipped each one until the queue wrapped. `FoliaPlaybackService.kt`
  now hands YouTube Music songs to the WebView right away (`nativePlayFailed`), foreground or not.
- **"Playback error" on a replayed song (fixed):** only 6 downloads were kept, while the prefetch
  cache still held the address of deleted ones (`ERROR_CODE_IO_FILE_NOT_FOUND`). Now 20 are kept,
  and a cached app-local address is checked before reuse (`appLocalAudio.ts`); a missing file is
  fetched again.
- **Beat analysis / lyric auto-calibration after returning to the app (fixed):** the native player
  reports `file://`, which the WebView cannot read; `toWebMediaUrl` turns it back into the WebView
  address.

- **Stuck at the end of a song with the screen off (fixed):** the hand-over above runs in the
  WebView, and Android froze the WebView's renderer as soon as the app was not visible (the hand-over
  was only handled when the app was opened again). `MainActivity.kt` now keeps the renderer at
  IMPORTANT priority while hidden (`setRendererPriorityPolicy(RENDERER_PRIORITY_IMPORTANT, false)`).

- **Still stuck with the screen off on some phones:** the renderer priority alone was not enough on
  Hong's phone (the WebView was still frozen). `nativeQueueAudio.ts` now keeps the next 5 songs
  downloaded while the app is in front and the native queue mirror carries their files, so the
  native player plays on through them by itself (about 20 minutes with the screen off). Past them
  it hands the next song to the WebView, which plays it once the app is opened.

## Building

`.github/workflows/hong-apk.yml` builds a debug-signed APK on every push to `hong-custom` (or by hand
from the Actions tab) and publishes it as a GitHub Release. Install it on the phone from the
release page (allow "install unknown apps" for the browser when asked).

## Limits

- The Android port has no Explore page; your Mixes come from the saved Mixes in your YouTube library.
  Save a Mix on YouTube (Save → playlist/library), then reopen the playlist list in Folia.
- Endless refill runs in the app's JavaScript. If Android pauses the app in the background for
  long stretches, the queue can run out before it refills; opening Folia lets it catch up.
- Not tested on a real phone from this build environment: everything is covered by unit tests
  (typecheck, 449 YouTube tests, playback and lyric suites), not by a device run.
