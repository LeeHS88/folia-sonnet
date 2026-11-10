import { afterEach, describe, expect, it, vi } from 'vitest';
import { appLocalAudioIsThere, isAppLocalAudioUrl } from '@/services/appLocalAudio';

// test/unit/playback/appLocalAudio.test.ts
// A downloaded song's WebView address is reused only while its file is still in the cache.

const local = 'https://localhost/_capacitor_file_/data/user/0/top.izuna.foliamajor/cache/ytm-audio/nK4NcXYn1n4-251.webm';

afterEach(() => vi.unstubAllGlobals());

describe('app-local audio addresses', () => {
    it('recognizes only the WebView addresses of app files', () => {
        expect(isAppLocalAudioUrl(local)).toBe(true);
        expect(isAppLocalAudioUrl('https://localhost/_capacitor_content_/media/1')).toBe(true);
        for (const url of ['https://rr3---sn.googlevideo.com/videoplayback', 'https://example.com/_capacitor_file_/x', 'file:///x', '', null]) {
            expect(isAppLocalAudioUrl(url)).toBe(false);
        }
    });

    it('checks the file of an app-local address and nothing else', async () => {
        const fetch = vi.fn(async (url: string) => ({ ok: url === local }));
        vi.stubGlobal('fetch', fetch);
        expect(await appLocalAudioIsThere(local)).toBe(true);
        expect(await appLocalAudioIsThere(local.replace('nK4NcXYn1n4', 'goneAAAAAAA'))).toBe(false);
        expect(await appLocalAudioIsThere('https://rr3---sn.googlevideo.com/videoplayback')).toBe(true);
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(fetch).toHaveBeenCalledWith(local, { method: 'HEAD', cache: 'no-store' });
    });

    it('treats an unreadable address as gone', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
        expect(await appLocalAudioIsThere(local)).toBe(false);
    });
});
