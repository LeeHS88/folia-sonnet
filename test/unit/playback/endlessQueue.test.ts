import { describe, expect, it, vi } from 'vitest';
import type { SongResult } from '@/types';
import { createEndlessQueueRefiller, endlessQueueNeedsMore, type EndlessQueueSnapshot } from '@/components/app/playback/start/endlessQueue';

// Exercise queue ownership and retry timing without a network or a playing audio element.
const song = (id: string, mix = 'mix'): SongResult => ({ id, name: id, artists: [], album: { id: '', name: '' }, durationMs: 1,
    sourceRef: { kind: 'online', providerId: 'ytm', mediaId: id, providerData: { mix } } });
const keyOf = (item: SongResult) => item.sourceRef?.kind === 'online' ? String(item.sourceRef.providerData?.mix || '') || null : null;
function setup() {
    const queue = Array.from({ length: 25 }, (_, i) => song(String(i)));
    let state: EndlessQueueSnapshot = { queue, current: queue[19], enabled: true, generation: '1' };
    let time = 0;
    const load = vi.fn(async () => [song('24'), song('25'), song('25'), song('26'), song('other', 'different')]);
    const append = vi.fn((next: SongResult[]) => { state = { ...state, queue: next }; });
    const failed = vi.fn();
    const refiller = createEndlessQueueRefiller({ read: () => state, keyOf, load, append, failed, now: () => time });
    return { queue, load, append, failed, refiller, read: () => state, change: (next: Partial<EndlessQueueSnapshot>) => { state = { ...state, ...next }; },
        tick: () => { time += 30000; } };
}

describe('endless queue refill', () => {
    it('starts with five songs remaining, never for a finite or unrelated queue', () => {
        const t = setup();
        expect(endlessQueueNeedsMore(t.read(), keyOf)).toBe(true);
        t.change({ current: t.queue[18] });
        expect(endlessQueueNeedsMore(t.read(), keyOf)).toBe(false);
        t.change({ current: song('outside') });
        expect(endlessQueueNeedsMore(t.read(), keyOf)).toBe(false);
        t.change({ current: t.queue[24], enabled: false });
        expect(endlessQueueNeedsMore(t.read(), keyOf)).toBe(false);
    });
    it('shares a pending request, deduplicates the batch, and preserves existing order', async () => {
        const t = setup();
        await Promise.all([t.refiller.refill(), t.refiller.refill()]);
        expect(t.load).toHaveBeenCalledExactlyOnceWith(t.queue[24]);
        expect(t.read().queue.map(item => item.id)).toEqual([...t.queue.map(item => item.id), '25', '26']);
        expect(t.read().current).toBe(t.queue[19]);
    });
    it.each(['clear', 'replace', 'edit', 'generation', 'stage', 'current', 'dispose', 'cancel'])('drops a late batch after %s', async action => {
        const t = setup();
        let release!: (songs: SongResult[]) => void;
        t.load.mockImplementation(() => new Promise(resolve => { release = resolve; }));
        const pending = t.refiller.refill();
        await Promise.resolve();
        if (action === 'clear') t.change({ queue: [] });
        if (action === 'replace') t.change({ queue: [...t.queue] });
        if (action === 'edit') t.change({ queue: t.queue.slice(0, -1) });
        if (action === 'generation') t.change({ generation: '2' });
        if (action === 'stage') t.change({ enabled: false });
        if (action === 'current') t.change({ current: song('19', 'other') });
        if (action === 'dispose') t.refiller.dispose();
        if (action === 'cancel') t.refiller.cancel();
        release([song('25')]);
        await pending;
        expect(t.append).not.toHaveBeenCalled();
    });
    it('keeps existing songs on failure and retries without a request loop', async () => {
        const t = setup();
        t.load.mockRejectedValueOnce(new Error('offline'));
        await t.refiller.refill();
        await t.refiller.refill();
        expect(t.load).toHaveBeenCalledTimes(1);
        expect(t.read().queue).toBe(t.queue);
        expect(t.failed).toHaveBeenCalledTimes(1);
        t.tick();
        await t.refiller.refill();
        expect(t.read().queue).toHaveLength(27);
    });
    it('backs off when YouTube returns no new songs', async () => {
        const t = setup();
        t.load.mockResolvedValue([t.queue[24]]);
        await t.refiller.refill();
        await t.refiller.refill();
        expect(t.load).toHaveBeenCalledTimes(1);
        expect(t.append).not.toHaveBeenCalled();
        t.tick();
        await t.refiller.refill();
        expect(t.load).toHaveBeenCalledTimes(2);
    });
    it('keeps extending from each new tail, with no fixed batch limit', async () => {
        const t = setup();
        for (let page = 0; page < 4; page++) {
            const tail = t.read().queue[t.read().queue.length - 1];
            t.change({ current: tail });
            t.load.mockResolvedValue([tail, song(`new-${page}`)]);
            await t.refiller.refill();
            expect(t.load).toHaveBeenLastCalledWith(tail);
        }
        expect(t.read().queue).toHaveLength(29);
    });
});
