import { beforeEach, describe, expect, it, vi } from 'vitest';

// test/unit/ytm/ytmAndroidMixes.test.ts
// The account's library and saved YouTube Mixes on Android (harness shared with ytmAndroidGate.test.ts).
// Android 上的会话门（ytmAndroidBridge.ts）：登录以外的每个操作都得等已登录的门；没有访客模式。
// 会话的生命周期也在这里：登录屏交回的要验证过账号才落盘；冷启动读回的要对过真账号才过门；
// 登出清掉内存里和盘上的；在途的那一轮在取消或登出之后，晚到的原生结果不许再立会话。

const native = vi.hoisted(() => ({
    signIn: vi.fn(),
    restoreSession: vi.fn(),
    saveSession: vi.fn(),
    clearSession: vi.fn(),
}));
const youtube = vi.hoisted(() => ({ create: vi.fn() }));
const httpons = vi.hoisted(() => ({ request: vi.fn() }));
const filesystem = vi.hoisted(() => ({
    readdir: vi.fn(), deleteFile: vi.fn(), mkdir: vi.fn(), stat: vi.fn(), downloadFile: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
    registerPlugin: (name: string) => (name === 'FoliaYtm' ? native : undefined),
    Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android', convertFileSrc: (x: string) => `converted:${x}` },
    CapacitorHttp: httpons,
}));
vi.mock('@capacitor/filesystem', () => ({ Directory: { Cache: 'CACHE' }, Filesystem: filesystem }));
// youtubei.js 在 WebView 里加载；门要关上时留给它的唯一证据就是它一次也没被加载。
vi.mock('youtubei.js', () => ({
    Innertube: { create: youtube.create },
    Platform: { shim: {} },
    Parser: { setParserErrorHandler: () => undefined },
    Constants: { CLIENTS: { YTMUSIC: { NAME: 'YTMUSIC', VERSION: '1.0' } } },
    YTNodes: {},
}));
vi.mock('@/i18n/config', () => ({ default: { t: (key: string) => key } }));
import type { YtmOperation } from '@/services/onlineMusic/ytm/ytmTransport';

// 原生那一罐的假账：restore 读到的就是罐里存的，save 写进去，clear 抹掉。
const cannedSession = vi.hoisted(() => ({ box: null as unknown }));
cannedSession.box = null;
native.restoreSession.mockImplementation(async () => ({ ok: true, session: cannedSession.box }));
native.saveSession.mockImplementation(async (options: unknown) => {
    cannedSession.box = options ?? null;
    return { ok: true };
});
native.clearSession.mockImplementation(async () => {
    cannedSession.box = null;
    return { ok: true };
});

// 会话状态在模块的闭包里：每个用例都换一个全新的模块，从干净出发。
let requestYtmOnAndroid!: typeof import('@/services/onlineMusic/ytm/android/ytmAndroidBridge').requestYtmOnAndroid;
beforeEach(async () => {
    cannedSession.box = null;
    native.signIn.mockReset();
    native.signIn.mockResolvedValue(undefined);
    native.restoreSession.mockReset();
    native.saveSession.mockReset();
    native.clearSession.mockReset();
    native.restoreSession.mockImplementation(async () => ({ ok: true, session: cannedSession.box }));
    native.saveSession.mockImplementation(async (options: unknown) => {
        cannedSession.box = options ?? null;
        return { ok: true };
    });
    native.clearSession.mockImplementation(async () => {
        cannedSession.box = null;
        return { ok: true };
    });
    youtube.create.mockReset();
    httpons.request.mockReset();
    vi.resetModules();
    ({ requestYtmOnAndroid } = await import('@/services/onlineMusic/ytm/android/ytmAndroidBridge'));
});

const signedIn = async () => {
    native.signIn.mockResolvedValue({ ok: true, session: { cookie: 'SAPISID=sap; SID=sid', userAgent: 'UA' } });
    expect(await requestYtmOnAndroid('web_login_start', {})).toEqual({ ok: true, data: {} });
};


const marked = (value: string, data: object = {}) => ({ ...data, responseContext: { serviceTrackingParams: [
    { service: 'GFEEDBACK', params: [{ key: 'logged_in', value }] },
] } });
const webAccount = () => ({ data: marked('1', { actions: [{ getMultiPageMenuAction: { menu: { multiPageMenuRenderer: { sections: [{ accountSectionListRenderer: { contents: [{ accountItemSectionRenderer: { contents: [{ accountItem: { isSelected: true, accountName: { simpleText: 'Fixture' }, channelHandle: { simpleText: '@fixture' }, accountPhoto: { thumbnails: [{ url: 'photo' }] } } }] } }] } }] } } } }] }) });
const video = 'seedAAAAAAA';
const mix = `RD${video}`;
const mixCard = { gridRadioRenderer: { title: { simpleText: 'Mix - 无情画' }, thumbnail: { thumbnails: [{ url: 'https://i.ytimg.com/mix.jpg', width: 336 }] },
    navigationEndpoint: { watchEndpoint: { playlistId: mix, videoId: video } } } };
const playlistRow = (id: string, name: string) => ({ musicTwoRowItemRenderer: {
    title: { runs: [{ text: name }] }, subtitle: { runs: [{ text: '3 songs' }] },
    navigationEndpoint: { browseEndpoint: { browseId: `VL${id}` } },
} });
const grid = (rows: unknown[], continuation?: string) => ({ contents: { gridRenderer: { items: rows,
    ...(continuation ? { continuations: [{ nextContinuationData: { continuation } }] } : {}) } } });
const queueOf = (ids: string[]) => ({ contents: { twoColumnWatchNextResults: { playlist: { playlist: { playlistId: mix, contents: ids.map(id => ({
    playlistPanelVideoRenderer: { videoId: id, title: { simpleText: `Song ${id}` }, lengthText: { simpleText: '4:16' } },
})) } } } } });

type Call = { endpoint: string; args: Record<string, unknown> };
const restoredSession = (answer: (call: Call) => unknown) => {
    cannedSession.box = { cookie: 'SAPISID=kept', userAgent: 'kept UA' };
    const calls: Call[] = [];
    const execute = vi.fn(async (endpoint: string, args: Record<string, unknown>) => {
        if (endpoint === '/account/accounts_list') return webAccount();
        calls.push({ endpoint, args });
        return { data: await answer({ endpoint, args }) };
    });
    youtube.create.mockResolvedValue({ actions: { execute }, music: { search: vi.fn() } });
    return calls;
};

describe('YouTube library and saved Mixes on Android', () => {
    it('lists library playlists, then the saved Mixes after the last page', async () => {
        const calls = restoredSession(({ args }) => {
            if (args.browseId === 'FEmusic_liked_playlists') return marked('1', grid([playlistRow('LM', 'Liked music')], 'grid-2'));
            if (args.continuation === 'grid-2') return marked('1', grid([playlistRow('PLloop', 'loop')]));
            if (args.browseId === 'FEplaylist_aggregation') return marked('1', { contents: { richGridRenderer: { contents: [mixCard,
                { continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: 'web-more' } } } }] } } });
            if (args.continuation === 'web-more') return marked('1', { onResponseReceivedActions: [] });
            throw new Error('unexpected');
        });
        expect(await requestYtmOnAndroid('user_playlists', {})).toMatchObject({ ok: true, data: { items: [{ id: 'LM', isLiked: true }], continuation: 'grid-2' } });
        const last = await requestYtmOnAndroid('user_playlists', { continuation: 'grid-2' });
        expect(last).toEqual({ ok: true, data: { items: [
            { id: 'PLloop', type: 'playlist', name: 'loop', coverUrl: '', trackCount: 3 },
            { id: `youtube_mix_${mix}`, type: 'playlist', name: 'Mix - 无情画', coverUrl: 'https://i.ytimg.com/mix.jpg', mix: true, videoId: video },
        ], continuation: 'youtube-mixes web-more' } });
        expect(await requestYtmOnAndroid('user_playlists', { continuation: 'youtube-mixes web-more' })).toEqual({ ok: true, data: { items: [] } });
        expect(calls.map(({ endpoint, args }) => [endpoint, args.client, args.browseId ?? args.continuation])).toEqual([
            ['/browse', 'YTMUSIC', 'FEmusic_liked_playlists'], ['/browse', 'YTMUSIC', 'grid-2'],
            ['/browse', 'WEB', 'FEplaylist_aggregation'], ['/browse', 'WEB', 'web-more'],
        ]);
    });

    it('keeps the music playlists when the saved Mixes cannot be read, and never takes a guest Mix page', async () => {
        restoredSession(({ args }) => {
            if (args.browseId === 'FEmusic_liked_playlists') return marked('1', grid([playlistRow('PLloop', 'loop')]));
            return marked('0', { contents: { richGridRenderer: { contents: [mixCard] } } });
        });
        expect(await requestYtmOnAndroid('user_playlists', {})).toEqual({ ok: true, data: { items: [
            { id: 'PLloop', type: 'playlist', name: 'loop', coverUrl: '', trackCount: 3 },
        ] } });
    });

    it('reads a saved Mix queue as the account and refills from the last queued song', async () => {
        const calls = restoredSession(({ args }) => marked('1', args.videoId === 'lastBBBBBBB'
            ? queueOf(['lastBBBBBBB', 'nextCCCCCCC', 'nextDDDDDDD']) : queueOf([video, 'lastBBBBBBB'])));
        const first = await requestYtmOnAndroid('mix', { id: `youtube_mix_${mix}`, videoId: video });
        expect(first).toMatchObject({ ok: true, data: { items: [{ id: video, durationMs: 256000, video: true }, { id: 'lastBBBBBBB' }] } });
        const refill = await requestYtmOnAndroid('mix', { id: `youtube_mix_${mix}`, videoId: 'lastBBBBBBB' });
        expect((refill as { data: { items: Array<{ id: string }> } }).data.items.map(item => item.id)).toEqual(['lastBBBBBBB', 'nextCCCCCCC', 'nextDDDDDDD']);
        expect(calls.map(({ endpoint, args }) => [endpoint, args.client, args.playlistId, args.videoId])).toEqual([
            ['/next', 'WEB', mix, video], ['/next', 'WEB', mix, 'lastBBBBBBB'],
        ]);
    });

    it('refuses invalid ids, a guest queue, or a queue for another Mix', async () => {
        restoredSession(({ args }) => (args.videoId === 'guestAAAAAA' ? marked('0', queueOf([video])) : marked('1', { contents: {} })));
        expect(await requestYtmOnAndroid('mix', { id: 'youtube_mix_PLnotamix' })).toMatchObject({ ok: false, error: { code: 'invalid-response' } });
        expect(await requestYtmOnAndroid('mix', { id: `youtube_mix_${mix}`, videoId: 'guestAAAAAA' })).toMatchObject({ ok: false, error: { code: 'unavailable' } });
        expect(await requestYtmOnAndroid('mix', { id: `youtube_mix_${mix}` })).toMatchObject({ ok: false, error: { code: 'invalid-response' } });
    });
});
