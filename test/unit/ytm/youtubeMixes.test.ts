import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

// The WEB card and queue shapes were verified on 2026-10-27; names, ids and artwork here are synthetic.
const require = createRequire(import.meta.url);
const { MIX_PREFIX, youtubeMixId, readSavedMixesPage, readSavedMixQueue } = require('../../../electron/ytm/youtubeMixes.cjs');
const video = 'seedAAAAAAA';
const mix = `RD${video}`;
const card = (id = mix, badge = 'MIX') => ({ lockupViewModel: {
    contentId: id, contentType: 'LOCKUP_CONTENT_TYPE_PLAYLIST',
    metadata: { lockupMetadataViewModel: { title: { content: 'Mix - A song' } } },
    contentImage: { collectionThumbnailViewModel: { primaryThumbnail: { thumbnailViewModel: {
        image: { sources: [{ url: 'https://i.ytimg.com/vi/seedAAAAAAA/hqdefault.jpg', width: 480, height: 270 }] },
        overlays: [{ thumbnailOverlayBadgeViewModel: { thumbnailBadges: [{ thumbnailBadgeViewModel: {
            icon: { sources: [{ clientResource: { imageName: badge } }] },
        } }] } }],
    } } } },
    rendererContext: { commandContext: { onTap: { innertubeCommand: { watchEndpoint: { playlistId: id, videoId: video } } } } },
} });
const more = (token: string) => ({ continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token } } } });
const page = (contents: unknown[]) => ({ contents: { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: {
    content: { richGridRenderer: { contents } },
} }] } } });
const song = (id = video) => ({ playlistPanelVideoRenderer: {
    videoId: id, title: { simpleText: `Song ${id}` }, shortBylineText: { runs: [{ text: 'Uploader' }] },
    lengthText: { simpleText: '1:04:16' }, thumbnail: { thumbnails: [{ url: 'https://i.ytimg.com/cover.jpg', width: 480 }] },
} });
const queue = (contents: unknown[], id = mix) => ({ contents: { twoColumnWatchNextResults: { playlist: { playlist: { playlistId: id, contents } } } } });

describe('saved YouTube Mixes', () => {
    it('reads a real WEB card shape without carrying tracking or raw commands into the renderer', () => {
        expect(readSavedMixesPage(page([card(), card(), more('second')]))).toEqual({ items: [{
            id: MIX_PREFIX + mix, type: 'playlist', name: 'Mix - A song', mix: true, videoId: video,
            coverUrl: 'https://i.ytimg.com/vi/seedAAAAAAA/hqdefault.jpg',
        }], continuation: 'second' });
        expect(youtubeMixId(MIX_PREFIX + mix)).toBe(mix);
    });
    it('does not mistake ordinary or editorial playlists for live Mixes, even with RD ids', () => {
        expect(readSavedMixesPage(page([card('PLfixture'), card('RDCLAK5uy_fixture', 'PLAYLIST'), card('../escape'), card('', 'MIX')])).items).toEqual([]);
        const malformed = card();
        malformed.lockupViewModel.contentType = 'LOCKUP_CONTENT_TYPE_VIDEO';
        expect(readSavedMixesPage(page([malformed])).items).toEqual([]);
        expect(youtubeMixId(MIX_PREFIX + 'PLfixture')).toBeNull();
        expect(youtubeMixId(mix)).toBeNull();
    });
    it('reads continuation rows and ignores unrelated chips, headers and menus', () => {
        const data = { header: more('wrong'), contents: { chipCloudRenderer: more('wrong'), menu: card() },
            onResponseReceivedActions: [{ appendContinuationItemsAction: { continuationItems: [card(), more('right')] } }] };
        expect(readSavedMixesPage(data)).toMatchObject({ items: [{ id: MIX_PREFIX + mix }], continuation: 'right' });
        expect(readSavedMixesPage({})).toEqual({ items: [] });
    });
    it('retains original video order, cover, duration and uploader; skips unusable and repeated rows', () => {
        expect(readSavedMixQueue(queue([song(), song('nextBBBBBBB'), song(), song('bad'),
            { playlistPanelVideoRenderer: { ...song().playlistPanelVideoRenderer, videoId: 'goneCCCCCCC', unplayableText: { simpleText: 'Removed' } } }]), mix).items)
            .toEqual([video, 'nextBBBBBBB'].map(id => ({ id, name: `Song ${id}`, artists: [{ id: '', name: 'Uploader' }],
                album: { id: '', name: '', coverUrl: 'https://i.ytimg.com/cover.jpg' }, durationMs: 3856000, video: true })));
    });
    it('fails clearly for a changed layout, a different queue, or no usable entries', () => {
        for (const data of [{}, queue([], mix), queue([song()], 'RDother')]) expect(() => readSavedMixQueue(data, mix)).toThrow();
    });
});
