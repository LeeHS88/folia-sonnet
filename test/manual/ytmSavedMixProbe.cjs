const fs = require('node:fs');
const path = require('node:path');
const { app, net, safeStorage } = require('electron');
const { createYtmWebSessionRepository } = require('../../electron/ytm/webSignIn.cjs');

// Read-only, opt-in compatibility probe. Credentials stay in memory and never enter its output.
const output = path.resolve(process.argv[3]);
const profile = path.join(path.dirname(output), 'probe-profile');
fs.mkdirSync(profile, { recursive: true });
const { os_crypt } = JSON.parse(fs.readFileSync(path.join(path.dirname(process.argv[2]), 'Local State'), 'utf8'));
fs.writeFileSync(path.join(profile, 'Local State'), JSON.stringify({ os_crypt }));
app.setPath('userData', profile);
let stage = 'read stored sign-in';
app.whenReady().then(async () => {
    const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    const store = { get: key => key === 'YTM_WEB_SESSION_V1' ? config[key] : undefined };
    const stored = createYtmWebSessionRepository({ store, safeStorage, log() {}, warn() {} }).get();
    if (!stored) throw new Error('No readable Folia YouTube session');
    stage = 'read library through the bridge';
    const { createYtmApiBridge } = require('../../electron/ytm/ytmApiBridge.cjs');
    const { MIX_PREFIX } = require('../../electron/ytm/youtubeMixes.cjs');
    let lastPanel;
    const bridge = createYtmApiBridge({ store, safeStorage,
        fetch: async (url, init) => {
            const response = await net.fetch(url, { ...init, credentials: 'omit' });
            if (String(url).includes('/next')) {
                const data = await response.clone().json().catch(() => null);
                lastPanel = data?.contents?.twoColumnWatchNextResults?.playlist?.playlist;
            }
            return response;
        },
        evaluate() { throw new Error('Playback is outside this read-only probe'); },
        language: () => 'en', log() {}, warn() {} });
    const collections = [];
    let continuation;
    for (let page = 0; page < 30; page++) {
        const result = await bridge.request('user_playlists', continuation ? { continuation } : {});
        if (!result.ok) throw new Error('Library operation failed');
        collections.push(...result.data.items);
        if (!result.data.continuation) break;
        continuation = result.data.continuation;
    }
    const mixes = collections.filter(item => item.id.startsWith(MIX_PREFIX));
    const selected = process.argv[4] ? mixes.find(item => item.id === MIX_PREFIX + process.argv[4]) : mixes[0];
    if (!selected) throw new Error('Saved Mix was not returned');
    stage = 'read Mix through the bridge';
    const queue = await bridge.request('mix', { id: selected.id, videoId: selected.videoId });
    if (!queue.ok) throw new Error('Mix operation failed');
    const result = { collections: collections.length, savedMixes: mixes.length,
        selected: { id: selected.id, name: selected.name, coverUrl: selected.coverUrl },
        songs: queue.data.items.length, firstSong: queue.data.items[0]?.name };
    result.batches = [];
    const seen = new Set(queue.data.items.map(item => item.id));
    let current = queue.data;
    for (let page = 0; page < 3; page++) {
        const anchor = current.items.at(-1).id;
        const row = lastPanel?.contents?.find(entry => entry.playlistPanelVideoRenderer?.videoId === anchor)?.playlistPanelVideoRenderer;
        const endpoint = row?.navigationEndpoint?.watchEndpoint;
        const next = await bridge.request('mix', { id: selected.id, videoId: anchor });
        if (!next.ok) throw new Error('Mix refill failed');
        const fresh = next.data.items.filter(item => !seen.has(item.id));
        result.batches.push({ anchor, endpoint, count: next.data.items.length, fresh: fresh.length,
            anchorIndex: next.data.items.findIndex(item => item.id === anchor), currentIndex: lastPanel?.currentIndex,
            infinite: lastPanel?.isInfinite });
        next.data.items.forEach(item => seen.add(item.id));
        current = next.data;
    }
    result.uniqueSongs = seen.size;
    fs.writeFileSync(output, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
    app.quit();
}).catch(error => { console.error('Mix probe failed:', stage, error.name); app.exit(1); });
setTimeout(() => app.exit(2), 60000).unref();
