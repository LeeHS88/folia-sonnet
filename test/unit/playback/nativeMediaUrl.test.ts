import { describe, expect, it, vi } from 'vitest';
import type { NativePlaybackEvent } from '@/services/playbackEngine/nativePlayerPlugin';

// test/unit/playback/nativeMediaUrl.test.ts
// ExoPlayer is handed the file a WebView-only Capacitor address stands for (downloaded YouTube
// Music audio on Android); an ordinary stream address goes through unchanged.

const harness = vi.hoisted(() => {
    const listeners = new Set<(event: NativePlaybackEvent) => void>();
    const nativePlayer = {
        prepare: vi.fn(async () => ({ ok: true })),
        play: vi.fn(async () => undefined),
        pause: vi.fn(async () => undefined),
        stop: vi.fn(async () => undefined),
        seek: vi.fn(async () => undefined),
        setVolume: vi.fn(async () => undefined),
        setSpeed: vi.fn(async () => undefined),
        getSnapshot: vi.fn(async () => ({ positionMs: 0, durationMs: 0, playing: false })),
        release: vi.fn(async () => undefined),
        addListener: vi.fn((listener: (event: NativePlaybackEvent) => void) => {
            listeners.add(listener);
            return Promise.resolve(() => listeners.delete(listener));
        }),
    };
    return { listeners, nativePlayer };
});

vi.mock('@/services/playbackEngine/nativePlayerPlugin', () => ({
    nativePlayer: harness.nativePlayer,
    isNativePlayerAvailable: () => true,
}));

const { nativePlaybackEngine, toNativeMediaUrl } = await import('@/services/playbackEngine/nativePlaybackEngine');


const file = '/data/user/0/top.izuna.foliamajor/cache/ytm-audio/nK4NcXYn1n4-251.webm';

describe('the address the native player is handed', () => {
    it('turns WebView-only Capacitor addresses back into the file or content they stand for', () => {
        expect(toNativeMediaUrl(`https://localhost/_capacitor_file_${file}`)).toBe(`file://${file}`);
        expect(toNativeMediaUrl(`http://localhost/_capacitor_file_${file}`)).toBe(`file://${file}`);
        expect(toNativeMediaUrl('https://localhost/_capacitor_content_/media/external/audio/media/42'))
            .toBe('content:///media/external/audio/media/42');
        expect(toNativeMediaUrl('https://localhost/_capacitor_file_/storage/emulated/0/My%20Music/a.m4a'))
            .toBe('file:///storage/emulated/0/My%20Music/a.m4a');
    });

    it('leaves real stream addresses and other strings alone', () => {
        for (const url of [
            'https://rr3---sn-a5mekn6s.googlevideo.com/videoplayback?itag=251',
            'https://example.com/_capacitor_file_/data/x.mp3',
            'file:///data/x.mp3', 'content://media/external/audio/media/1', 'not a url',
        ]) expect(toNativeMediaUrl(url)).toBe(url);
    });

    it('prepares ExoPlayer with the file, once per song', async () => {
        const web = `https://localhost/_capacitor_file_${file}`;
        await nativePlaybackEngine.setSource(web, { songKey: 'online:ytm:nK4NcXYn1n4' });
        await nativePlaybackEngine.setSource(web, { songKey: 'online:ytm:nK4NcXYn1n4' });
        expect(harness.nativePlayer.prepare).toHaveBeenCalledTimes(1);
        expect(harness.nativePlayer.prepare).toHaveBeenCalledWith(expect.objectContaining({ url: `file://${file}` }));
    });
});
