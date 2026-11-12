// src/services/nativeQueueAudio.ts
//
// Background play on Android of the platforms whose songs are downloaded before they play. The
// native player moves to the next song on its own when one ends, but it cannot fetch such a song
// (that needs the WebView: platform token, download into the cache), and with the screen off
// Android freezes the WebView. So the songs ahead
// are downloaded while the app is in front, and the native queue mirror carries their files: the
// native player then plays on through them without the WebView. Past the downloaded ones it hands
// the song back to the WebView as before, which plays it once the app is in front again.

import type { SongResult } from '../types';
import type { AudioQualityPreference } from '../types/onlineMusic';
import type { QueueMirrorEntry } from '../utils/queueMirrorEntry';
import { isAppLocalAudioUrl } from './appLocalAudio';
import { toNativeMediaUrl } from './playbackEngine/nativePlaybackEngine';
import { getPrefetchedData, warmupSongAudio } from './prefetchService';

// 原生队列镜像带上「已下载到缓存」的歌的文件，让原生在 WebView 被冻住时也能接着放。

/** How many songs ahead are kept downloaded (about 4–5 MB each; the cache keeps 20). */
export const NATIVE_AUDIO_AHEAD = 5;
/** Files are handed over for the songs in this window around the playing one. */
const WINDOW_BEHIND = 1;
const WINDOW_AHEAD = 8;

const listeners = new Set<() => void>();

/** Called when a song ahead has been downloaded, so the mirror can be pushed again with its file. */
export const subscribeNativeQueueAudio = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};

/** The downloaded file of a song, as the native player reads it; null when it has none. */
const downloadedFileOf = (song: SongResult): string | null => {
    const url = getPrefetchedData(song)?.audioUrl;
    return url && isAppLocalAudioUrl(url) ? toNativeMediaUrl(url) : null;
};

/**
 * The mirror entries with the files of the downloaded songs near the playing one. Entries that
 * already carry an address, songs of other platforms and songs outside the window stay as they are
 * (the native player resolves those itself, or hands them back to the WebView).
 */
export const withDownloadedAudio = <T extends QueueMirrorEntry & { url?: string }>(
    list: SongResult[],
    entries: T[],
    playingIndex: number,
): T[] => {
    if (playingIndex < 0) return entries;
    return entries.map((entry, index) => {
        if (entry.url || index < playingIndex - WINDOW_BEHIND || index > playingIndex + WINDOW_AHEAD) return entry;
        const song = list[index];
        const file = song ? downloadedFileOf(song) : null;
        return file ? { ...entry, url: file } : entry;
    });
};

let keepAheadRun = 0;

/**
 * Downloads, one after another, the next {@link NATIVE_AUDIO_AHEAD} songs of the queue (audio only:
 * no lyrics or cover). Only while the playing song is itself a downloaded file: that is the platform
 * whose songs the native player cannot fetch, and other platforms are left to their own resolver.
 * Each new file is announced to the subscribers. A newer call supersedes an older one between songs.
 */
export const keepAudioAhead = async (
    list: SongResult[],
    playingIndex: number,
    playingAudioUrl: string | null | undefined,
    quality: AudioQualityPreference,
): Promise<void> => {
    const run = ++keepAheadRun;
    if (playingIndex < 0 || !isAppLocalAudioUrl(playingAudioUrl)) return;
    const ahead = list.slice(playingIndex + 1, playingIndex + 1 + NATIVE_AUDIO_AHEAD);
    // Files the ordinary prefetch already downloaded count too: the mirror may have been pushed
    // before they existed, so it is pushed again once here.
    if (ahead.some(song => downloadedFileOf(song))) listeners.forEach(listener => listener());
    for (const song of ahead) {
        if (run !== keepAheadRun) return;
        if (downloadedFileOf(song)) continue;
        try {
            const resolved = await warmupSongAudio(song, quality);
            if (run !== keepAheadRun) return;
            if (resolved && isAppLocalAudioUrl(resolved.audioUrl)) listeners.forEach(listener => listener());
        } catch {
            // One song that cannot be fetched does not stop the ones after it.
        }
    }
};
