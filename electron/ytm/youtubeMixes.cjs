const { VIDEO_ID } = require('./tiles.cjs');
const { thumbnailUrl } = require('./catalog.cjs');
const { ytmError } = require('./errors.cjs');

// Saved YouTube Mixes use the regular WEB library and queue, not YouTube Music's browse pages.
// Namespace their collection ids so a persisted card can select the right client after restart.
const MIX_PREFIX = 'youtube_mix_';
const PAGE_PREFIX = 'youtube-mixes ';
const MIX_ID = /^RD[\w-]{1,112}$/;
const textOf = value => typeof value?.simpleText === 'string' ? value.simpleText
    : typeof value?.content === 'string' ? value.content
        : Array.isArray(value?.runs) ? value.runs.map(run => run.text ?? '').join('') : '';
const youtubeMixId = id => typeof id === 'string' && id.startsWith(MIX_PREFIX)
    && MIX_ID.test(id.slice(MIX_PREFIX.length)) ? id.slice(MIX_PREFIX.length) : null;

function collectionOf(card, modern) {
    const endpoint = modern ? card.rendererContext?.commandContext?.onTap?.innertubeCommand : card.navigationEndpoint;
    const watch = endpoint?.watchEndpoint ?? endpoint?.watchPlaylistEndpoint;
    const id = watch?.playlistId;
    const name = textOf(modern ? card.metadata?.lockupMetadataViewModel?.title : card.title).trim();
    // The Mix icon is independent of UI language. RDCL... editorial playlists can have RD ids too.
    const thumbnail = modern ? card.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel : null;
    const isMix = !modern || thumbnail?.overlays?.some(overlay => overlay.thumbnailOverlayBadgeViewModel?.thumbnailBadges
        ?.some(badge => badge.thumbnailBadgeViewModel?.icon?.sources?.some(source => source.clientResource?.imageName === 'MIX')));
    if (!name || !MIX_ID.test(id ?? '') || !isMix || (modern && card.contentType !== 'LOCKUP_CONTENT_TYPE_PLAYLIST')) return null;
    const videoId = VIDEO_ID.test(watch?.videoId ?? '') ? watch.videoId : undefined;
    return { id: `${MIX_PREFIX}${id}`, type: 'playlist', name,
        coverUrl: thumbnailUrl(modern ? thumbnail?.image?.sources : card.thumbnail?.thumbnails ?? card.thumbnails?.[0]?.thumbnails),
        mix: true, ...(videoId ? { videoId } : {}) };
}

// Only page contents and appended rows are visited; menus, filter chips and account headers are not feeds.
function readSavedMixesPage(data) {
    const items = new Map();
    let continuation;
    const visit = value => {
        if (!value || typeof value !== 'object') return;
        if (Array.isArray(value)) { value.forEach(visit); return; }
        for (const [key, child] of Object.entries(value)) {
            if (['header', 'menu', 'navigationEndpoint', 'chipCloudRenderer', 'metadata'].includes(key)) continue;
            if (['lockupViewModel', 'radioRenderer', 'gridRadioRenderer'].includes(key)) {
                const item = child && collectionOf(child, key === 'lockupViewModel');
                if (item) items.set(item.id, item);
            } else if (key === 'continuationItemRenderer') {
                const token = child?.continuationEndpoint?.continuationCommand?.token;
                if (typeof token === 'string' && token && token.length <= 8000) continuation ??= token;
            } else visit(child);
        }
    };
    visit(data?.contents);
    for (const action of [...(data?.onResponseReceivedActions ?? []), ...(data?.onResponseReceivedEndpoints ?? [])]) {
        visit(action.appendContinuationItemsAction?.continuationItems);
        visit(action.reloadContinuationItemsCommand?.continuationItems);
    }
    return { items: [...items.values()], ...(continuation ? { continuation } : {}) };
}

// Keep the WEB queue's original videos and ordering. No guest fallback may replace a personalized Mix.
function readSavedMixQueue(data, id) {
    const panel = data?.contents?.twoColumnWatchNextResults?.playlist?.playlist;
    if (panel?.playlistId !== id || !Array.isArray(panel.contents)) {
        throw ytmError('invalid-response', 'YouTube did not return this Mix queue');
    }
    const items = [];
    const seen = new Set();
    for (const entry of panel.contents) {
        const row = entry?.playlistPanelVideoRenderer;
        const name = textOf(row?.title).trim();
        if (!row || !VIDEO_ID.test(row.videoId ?? '') || !name || row.unplayableText || row.isPlayable === false || seen.has(row.videoId)) continue;
        seen.add(row.videoId);
        const duration = textOf(row.lengthText);
        const seconds = /^\d+(?::[0-5]\d){1,2}$/.test(duration) ? duration.split(':').reduce((total, part) => total * 60 + Number(part), 0) : 0;
        const byline = textOf(row.shortBylineText);
        items.push({ id: row.videoId, name, artists: byline ? [{ id: '', name: byline }] : [],
            album: { id: '', name: '', coverUrl: thumbnailUrl(row.thumbnail?.thumbnails) }, durationMs: seconds * 1000, video: true });
    }
    if (!items.length) throw ytmError('unavailable', 'YouTube returned no playable entries for this Mix');
    return { items };
}

module.exports = { MIX_PREFIX, PAGE_PREFIX, youtubeMixId, readSavedMixesPage, readSavedMixQueue };
