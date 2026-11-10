import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
    MIX_PAGE_PREFIX, MIX_PREFIX, playlistFromRow, readGrid, readSavedMixQueue, readSavedMixesPage, signedInMarkOf, youtubeMixId,
} from '../../../src/services/onlineMusic/ytm/android/ytmAndroidLibrary';

// The Android readers are ports of the desktop ones: the same answers must give the same cards
// and queues, so a saved Mix behaves alike on both. Names, ids and artwork here are synthetic.
const require = createRequire(import.meta.url);
const desktopMixes = require('../../../electron/ytm/youtubeMixes.cjs');
const desktopPages = require('../../../electron/ytm/webPages.cjs');

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
const legacyCard = { gridRadioRenderer: {
    title: { simpleText: 'Mix - Legacy' }, thumbnail: { thumbnails: [{ url: 'https://i.ytimg.com/legacy.jpg', width: 336 }] },
    navigationEndpoint: { watchEndpoint: { playlistId: 'RDlegacyAAAA', videoId: 'legacyAAAAA' } },
} };
const more = (token: string) => ({ continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token } } } });
const page = (contents: unknown[]) => ({ contents: { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: {
    content: { richGridRenderer: { contents } },
} }] } } });
const song = (id = video) => ({ playlistPanelVideoRenderer: {
    videoId: id, title: { simpleText: `Song ${id}` }, shortBylineText: { runs: [{ text: 'Uploader' }] },
    lengthText: { simpleText: '1:04:16' }, thumbnail: { thumbnails: [{ url: 'https://i.ytimg.com/cover.jpg', width: 480 }] },
} });
const queue = (contents: unknown[], id = mix) => ({ contents: { twoColumnWatchNextResults: { playlist: { playlist: { playlistId: id, contents } } } } });
const marked = (value: string, data: object) => ({ ...data, responseContext: { serviceTrackingParams: [
    { service: 'GFEEDBACK', params: [{ key: 'logged_in', value }] },
] } });
const playlistRow = (id: string, name: string, menu: unknown[] = [], count = '12 songs') => ({ musicTwoRowItemRenderer: {
    title: { runs: [{ text: name }] }, subtitle: { runs: [{ text: 'Playlist' }, { text: ' • ' }, { text: count }] },
    navigationEndpoint: { browseEndpoint: { browseId: `VL${id}` } },
    thumbnailRenderer: { musicThumbnailRenderer: { thumbnail: { thumbnails: [{ url: `https://lh3.googleusercontent.com/${id}=w226-h226`, width: 226 }] } } },
    menu: { menuRenderer: { items: menu } },
} });
const grid = (rows: unknown[], continuation?: string) => ({ contents: { singleColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: { content: {
    sectionListRenderer: { contents: [{ gridRenderer: { items: rows, ...(continuation
        ? { continuations: [{ nextContinuationData: { continuation } }] } : {}) } }] },
} } }] } } });

describe('YouTube library readers on Android', () => {
    it('reads the same saved Mix cards as the desktop, page tokens included', () => {
        const samples = [
            page([card(), card(), more('second')]),
            page([card('PLfixture'), card('RDCLAK5uy_fixture', 'PLAYLIST'), card('../escape'), card('', 'MIX'), legacyCard]),
            { header: more('wrong'), contents: { chipCloudRenderer: more('wrong'), menu: card() },
                onResponseReceivedActions: [{ appendContinuationItemsAction: { continuationItems: [card(), more('right')] } }] },
            {},
        ];
        for (const data of samples) expect(readSavedMixesPage(data)).toEqual(desktopMixes.readSavedMixesPage(data));
        expect(readSavedMixesPage(samples[0]).items).toEqual([{
            id: MIX_PREFIX + mix, type: 'playlist', name: 'Mix - A song', mix: true, videoId: video,
            coverUrl: 'https://i.ytimg.com/vi/seedAAAAAAA/hqdefault.jpg',
        }]);
        expect(MIX_PREFIX).toBe(desktopMixes.MIX_PREFIX);
        expect(MIX_PAGE_PREFIX).toBe(desktopMixes.PAGE_PREFIX);
    });

    it('accepts only live Mix ids', () => {
        for (const id of [MIX_PREFIX + mix, MIX_PREFIX + 'PLfixture', mix, MIX_PREFIX + 'RD../x', 7, undefined]) {
            expect(youtubeMixId(id)).toBe(desktopMixes.youtubeMixId(id));
        }
        expect(youtubeMixId(MIX_PREFIX + mix)).toBe(mix);
    });

    it('reads the same Mix queue as the desktop and refuses a different or changed one', () => {
        const data = queue([song(), song('nextBBBBBBB'), song(), song('bad'),
            { playlistPanelVideoRenderer: { ...song().playlistPanelVideoRenderer, videoId: 'goneCCCCCCC', unplayableText: { simpleText: 'Removed' } } }]);
        expect(readSavedMixQueue(data, mix)).toEqual(desktopMixes.readSavedMixQueue(data, mix));
        expect(readSavedMixQueue(data, mix)?.items.map(item => item.id)).toEqual([video, 'nextBBBBBBB']);
        expect(readSavedMixQueue({}, mix)).toBeNull();
        expect(readSavedMixQueue(queue([song()], 'RDother'), mix)).toBeNull();
        expect(readSavedMixQueue(queue([]), mix)).toEqual({ items: [] });
    });

    it('reads library playlist cards and the sign-in mark like the desktop', () => {
        const owned = [{ menuNavigationItemRenderer: { navigationEndpoint: { playlistEditorEndpoint: { playlistId: 'PLown01' } } } }];
        const data = grid([
            { musicTwoRowItemRenderer: { title: { runs: [{ text: 'New playlist' }] }, navigationEndpoint: { createPlaylistEndpoint: {} } } },
            playlistRow('LM', 'Liked music', [], '1,234 songs'), playlistRow('PLown01', 'loop', owned), playlistRow('PLsaved01', 'Saved'),
        ], 'grid-2');
        const read = readGrid(data);
        expect(read.continuation).toBe('grid-2');
        expect(read.rows.map(playlistFromRow)).toEqual(desktopPages.readGrid(data).rows.map(desktopPages.collectionFromRow));
        expect(read.rows.map(playlistFromRow).filter(Boolean).map(item => [item!.id, item!.trackCount, item!.isOwned, item!.isLiked]))
            .toEqual([['LM', 1234, undefined, true], ['PLown01', 12, true, undefined], ['PLsaved01', 12, undefined, undefined]]);
        for (const value of ['1', '0']) expect(signedInMarkOf(marked(value, {}))).toBe(desktopPages.signedInMarkOf(marked(value, {})));
        expect(signedInMarkOf({})).toBeUndefined();
    });
});
