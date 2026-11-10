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
