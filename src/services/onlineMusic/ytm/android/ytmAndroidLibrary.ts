import type { YtmWireCollection, YtmWireSong } from '../ytmTransport';
import { VIDEO_ID, thumbnailUrl } from './ytmAndroidCatalog';

// src/services/onlineMusic/ytm/android/ytmAndroidLibrary.ts
// Reads the raw JSON of the account's library on Android: the playlist cards of YouTube Music's
// library tab, and the saved Mixes of the regular YouTube library (FEplaylist_aggregation) with
// their personalized WEB queues. Ported from the desktop readers (electron/ytm/webPages.cjs and
// electron/ytm/youtubeMixes.cjs) so a saved Mix card and its queue look the same on both.

/* eslint-disable @typescript-eslint/no-explicit-any */

export const MIX_PREFIX = 'youtube_mix_';
export const MIX_PAGE_PREFIX = 'youtube-mixes ';
const MIX_ID = /^RD[\w-]{1,112}$/;

const textOf = (value: any): string => (
    typeof value?.simpleText === 'string' ? value.simpleText
        : typeof value?.content === 'string' ? value.content
            : Array.isArray(value?.runs) ? value.runs.map((run: any) => run?.text ?? '').join('') : ''
);

/** The YouTube playlist id inside a saved Mix's collection id; null for any other id. */
export const youtubeMixId = (id: unknown): string | null => (
    typeof id === 'string' && id.startsWith(MIX_PREFIX) && MIX_ID.test(id.slice(MIX_PREFIX.length))
        ? id.slice(MIX_PREFIX.length) : null
);

/** '1' when YouTube answered a signed-in account, '0' for a guest's page. */
export function signedInMarkOf(data: any): string | undefined {
    const feedback = (data?.responseContext?.serviceTrackingParams ?? []).find((service: any) => service?.service === 'GFEEDBACK');
    const mark = (feedback?.params ?? []).find((param: any) => param?.key === 'logged_in')?.value;
    return typeof mark === 'string' ? mark : undefined;
}

// ---- YouTube Music library tab ----

export function readGrid(data: any): { rows: any[]; continuation?: string } {
    let grid: any;
    const visit = (value: any): void => {
        if (grid || !value || typeof value !== 'object') return;
        if (Array.isArray(value)) { value.forEach(visit); return; }
        for (const [key, child] of Object.entries(value)) {
            if (key === 'gridRenderer' || key === 'gridContinuation') grid ??= child;
            else visit(child);
        }
    };
    visit(data);
    const rows = (Array.isArray(grid?.items) ? grid.items : []).map((item: any) => item?.musicTwoRowItemRenderer).filter(Boolean);
    const continuation = grid?.continuations?.[0]?.nextContinuationData?.continuation;
    return { rows, ...(typeof continuation === 'string' && continuation ? { continuation } : {}) };
}

const countIn = (text: string): number | undefined => {
    const count = [...String(text).matchAll(/(?<!\d[.,   ]?)(\d+(?:[.,   ]\d{3})*)\s*(?:首歌曲|首曲目|(?:songs?|videos?|tracks?|lagu)\b)/gi)].at(-1)?.[1];
    return count ? Number(count.replace(/[.,   ]/g, '')) : undefined;
};

const holds = (value: any, keys: string[]): boolean => Boolean(value) && typeof value === 'object'
    && Object.entries(value).some(([key, child]) => keys.includes(key) || holds(child, keys));

/** A playlist card of the library tab; null for any other card (the tab starts with a "new playlist" one). */
export function playlistFromRow(row: any): YtmWireCollection | null {
    const browseId = row?.navigationEndpoint?.browseEndpoint?.browseId;
    const name = textOf(row?.title).trim();
    if (typeof browseId !== 'string' || !name || !browseId.startsWith('VL') || browseId.length < 4) return null;
    const id = browseId.slice(2);
    const runs = Array.isArray(row.subtitle?.runs) ? row.subtitle.runs : [];
    const count = countIn(String(runs.at(-1)?.text ?? ''));
    return {
        id, type: 'playlist', name,
        coverUrl: thumbnailUrl(row.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails),
        ...(count !== undefined ? { trackCount: count } : {}),
        ...(id === 'LM' ? { isLiked: true } : {}),
        ...(holds(row.menu, ['playlistEditorEndpoint', 'deletePlaylistEndpoint']) ? { isOwned: true } : {}),
    };
}

// ---- Saved YouTube Mixes ----

function mixFromCard(card: any, modern: boolean): YtmWireCollection | null {
    const endpoint = modern ? card.rendererContext?.commandContext?.onTap?.innertubeCommand : card.navigationEndpoint;
    const watch = endpoint?.watchEndpoint ?? endpoint?.watchPlaylistEndpoint;
    const id = watch?.playlistId;
    const name = textOf(modern ? card.metadata?.lockupMetadataViewModel?.title : card.title).trim();
    // The Mix badge is independent of UI language; RDCL… editorial playlists can have RD ids too.
    const thumbnail = modern ? card.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel : null;
    const isMix = !modern || thumbnail?.overlays?.some((overlay: any) => overlay.thumbnailOverlayBadgeViewModel?.thumbnailBadges
        ?.some((badge: any) => badge.thumbnailBadgeViewModel?.icon?.sources?.some((source: any) => source.clientResource?.imageName === 'MIX')));
    if (!name || !MIX_ID.test(id ?? '') || !isMix || (modern && card.contentType !== 'LOCKUP_CONTENT_TYPE_PLAYLIST')) return null;
    const videoId = VIDEO_ID.test(watch?.videoId ?? '') ? watch.videoId : undefined;
    return {
        id: `${MIX_PREFIX}${id}`, type: 'playlist', name,
        coverUrl: thumbnailUrl(modern ? thumbnail?.image?.sources : card.thumbnail?.thumbnails ?? card.thumbnails?.[0]?.thumbnails),
        mix: true, ...(videoId ? { videoId } : {}),
    };
}

/** The saved Mix cards of one page of the WEB library; menus, chips and headers are not feeds. */
export function readSavedMixesPage(data: any): { items: YtmWireCollection[]; continuation?: string } {
    const items = new Map<string, YtmWireCollection>();
    let continuation: string | undefined;
    const visit = (value: any): void => {
        if (!value || typeof value !== 'object') return;
        if (Array.isArray(value)) { value.forEach(visit); return; }
        for (const [key, child] of Object.entries<any>(value)) {
            if (['header', 'menu', 'navigationEndpoint', 'chipCloudRenderer', 'metadata'].includes(key)) continue;
            if (['lockupViewModel', 'radioRenderer', 'gridRadioRenderer'].includes(key)) {
                const item = child && mixFromCard(child, key === 'lockupViewModel');
                if (item) items.set(item.id, item);
            } else if (key === 'continuationItemRenderer') {
                const token = child?.continuationEndpoint?.continuationCommand?.token;
                if (typeof token === 'string' && token && token.length <= 8000) continuation ??= token;
            } else visit(child);
        }
    };
    visit(data?.contents);
    for (const action of [...(data?.onResponseReceivedActions ?? []), ...(data?.onResponseReceivedEndpoints ?? [])]) {
        visit(action?.appendContinuationItemsAction?.continuationItems);
        visit(action?.reloadContinuationItemsCommand?.continuationItems);
    }
    return { items: [...items.values()], ...(continuation ? { continuation } : {}) };
}

/** The WEB queue of a saved Mix in its own order. No guest fallback may replace a personalized Mix. */
export function readSavedMixQueue(data: any, id: string): { items: YtmWireSong[] } | null {
    const panel = data?.contents?.twoColumnWatchNextResults?.playlist?.playlist;
    if (panel?.playlistId !== id || !Array.isArray(panel.contents)) return null;
    const items: YtmWireSong[] = [];
    const seen = new Set<string>();
    for (const entry of panel.contents) {
        const row = entry?.playlistPanelVideoRenderer;
        const name = textOf(row?.title).trim();
        if (!row || !VIDEO_ID.test(row.videoId ?? '') || !name || row.unplayableText || row.isPlayable === false || seen.has(row.videoId)) continue;
        seen.add(row.videoId);
        const duration = textOf(row.lengthText);
        const seconds = /^\d+(?::[0-5]\d){1,2}$/.test(duration)
            ? duration.split(':').reduce((total, part) => total * 60 + Number(part), 0) : 0;
        const byline = textOf(row.shortBylineText);
        items.push({
            id: row.videoId, name, artists: byline ? [{ id: '', name: byline }] : [],
            album: { id: '', name: '', coverUrl: thumbnailUrl(row.thumbnail?.thumbnails) }, durationMs: seconds * 1000, video: true,
        });
    }
    return { items };
}
