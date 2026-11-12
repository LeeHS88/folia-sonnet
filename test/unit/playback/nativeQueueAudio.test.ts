import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SongResult } from '@/types';
import type { QueueMirrorEntry } from '@/utils/queueMirrorEntry';

// test/unit/playback/nativeQueueAudio.test.ts
// The native queue mirror carries the files of the downloaded songs around the playing one, and the
// songs ahead are downloaded while the app is in front, so the native player can play on with the
// screen off (the WebView is frozen then).

const h = vi.hoisted(() => ({
    urls: new Map<string, string>(),
    warmup: vi.fn(),
}));

vi.mock('@/services/prefetchService', () => ({
    getPrefetchedData: (song: { id: string }) => (h.urls.has(song.id) ? { audioUrl: h.urls.get(song.id) } : null),
    warmupSongAudio: h.warmup,
}));
vi.mock('@/services/playbackEngine/nativePlaybackEngine', () => ({
    toNativeMediaUrl: (url: string) => url.replace(/^https:\/\/localhost\/_capacitor_file_/, 'file://'),
}));

const { keepAudioAhead, subscribeNativeQueueAudio, withDownloadedAudio, NATIVE_AUDIO_AHEAD } = await import('@/services/nativeQueueAudio');

const local = (id: string) => `https://localhost/_capacitor_file_/data/cache/ytm-audio/${id}-251.webm`;
const song = (id: string) => ({ id, name: id }) as unknown as SongResult;
const entry = (id: string) => ({ songKey: id, title: id, artist: '' }) as unknown as QueueMirrorEntry & { url?: string };
const queue = Array.from({ length: 14 }, (_, index) => song(`s${index}`));

beforeEach(() => {
    h.urls.clear();
    h.warmup.mockReset();
});

describe('mirror entries with downloaded files', () => {
    it('adds the file of downloaded songs from one behind to eight ahead of the playing one', () => {
        for (const item of queue) h.urls.set(String(item.id), local(String(item.id)));
        h.urls.set('s5', 'https://rr3---sn.googlevideo.com/videoplayback');
        const entries = withDownloadedAudio(queue, queue.map(item => entry(String(item.id))), 2);
        const urls = entries.map((item: { url?: string }) => item.url ?? null);
        expect(urls[0]).toBeNull();
        expect(urls[1]).toBe('file:///data/cache/ytm-audio/s1-251.webm');
        expect(urls[2]).toBe('file:///data/cache/ytm-audio/s2-251.webm');
        expect(urls[5]).toBeNull();
        expect(urls[10]).toBe('file:///data/cache/ytm-audio/s10-251.webm');
        expect(urls[11]).toBeNull();
    });

    it('keeps an address an entry already has, and changes nothing without a playing song', () => {
        h.urls.set('s1', local('s1'));
        const entries = [{ ...entry('s0'), url: 'https://kept' }, entry('s1')];
        expect(withDownloadedAudio(queue, entries, 0).map((item: { url?: string }) => item.url)).toEqual(['https://kept', 'file:///data/cache/ytm-audio/s1-251.webm']);
        expect(withDownloadedAudio(queue, entries, -1)).toBe(entries);
    });
});

describe('downloading the songs ahead', () => {
    it('downloads the next ones that have no file yet, one after another, and announces each file', async () => {
        h.urls.set('s4', local('s4'));
        h.warmup.mockImplementation(async (item: SongResult) => ({ audioUrl: local(String(item.id)) }));
        const heard = vi.fn();
        const stop = subscribeNativeQueueAudio(heard);
        await keepAudioAhead(queue, 2, local('s2'), 'high');
        stop();
        const fetched = h.warmup.mock.calls.map(([item]) => (item as { id: string }).id);
        expect(fetched).toEqual(['s3', 's5', 's6', 's7'].slice(0, NATIVE_AUDIO_AHEAD - 1));
        // Once for s4, already downloaded by the ordinary prefetch, then once per new file.
        expect(heard).toHaveBeenCalledTimes(fetched.length + 1);
    });

    it('does nothing while the playing song is not a downloaded file', async () => {
        await keepAudioAhead(queue, 2, 'https://rr3---sn.googlevideo.com/videoplayback', 'high');
        await keepAudioAhead(queue, 2, null, 'high');
        expect(h.warmup).not.toHaveBeenCalled();
    });

    it('goes on past a song that cannot be fetched, and stops when a newer call takes over', async () => {
        h.warmup.mockImplementationOnce(async () => { throw new Error('unavailable'); })
            .mockImplementation(async (item: SongResult) => ({ audioUrl: local(String(item.id)) }));
        await keepAudioAhead(queue, 0, local('s0'), 'high');
        expect(h.warmup).toHaveBeenCalledTimes(NATIVE_AUDIO_AHEAD);

        h.warmup.mockReset();
        let release: () => void = () => undefined;
        h.warmup.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve({ audioUrl: local('s1') }); }));
        const first = keepAudioAhead(queue, 0, local('s0'), 'high');
        const second = keepAudioAhead(queue, 9, local('s9'), 'high');
        release();
        await Promise.all([first, second]);
        expect(h.warmup.mock.calls.map(([item]) => (item as { id: string }).id)).toEqual(['s1', 's10', 's11', 's12', 's13']);
    });
});
