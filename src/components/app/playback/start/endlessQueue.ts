import type { SongResult } from '../../../../types';
import { getPlaybackSongKey } from '../../../../utils/appPlaybackGuards';
import { queueIndexOf } from '../../../../utils/playbackNeighbors';

// A bounded, single-flight refill; fetching never starts playback or replaces a different queue.
export interface EndlessQueueSnapshot {
    queue: SongResult[];
    current: SongResult | null;
    enabled: boolean;
    generation: string;
}
type StreamKey = (song: SongResult) => string | null;

export const endlessQueueKey = (snapshot: EndlessQueueSnapshot, keyOf: StreamKey): string | null => {
    if (!snapshot.enabled || !snapshot.current || !snapshot.queue.length || queueIndexOf(snapshot.queue, snapshot.current) < 0) return null;
    const key = keyOf(snapshot.current);
    return key && keyOf(snapshot.queue[snapshot.queue.length - 1]) === key ? key : null;
};

export const endlessQueueNeedsMore = (snapshot: EndlessQueueSnapshot, keyOf: StreamKey): boolean => (
    Boolean(endlessQueueKey(snapshot, keyOf)) && queueIndexOf(snapshot.queue, snapshot.current) >= snapshot.queue.length - 6
);

export function createEndlessQueueRefiller(deps: {
    read: () => EndlessQueueSnapshot;
    keyOf: StreamKey;
    load: (tail: SongResult) => Promise<SongResult[]>;
    append: (queue: SongResult[]) => void;
    failed: (error: unknown) => void;
    now?: () => number;
}) {
    let pending: Promise<void> | null = null;
    let retryAt = 0;
    let lastAttempt = '';
    let disposed = false;
    let cancellations = 0;
    const now = deps.now ?? Date.now;
    return {
        dispose() { disposed = true; },
        cancel() { cancellations += 1; },
        refill(): Promise<void> {
            if (pending) return pending;
            const before = deps.read();
            const key = endlessQueueKey(before, deps.keyOf);
            if (disposed || !key || !endlessQueueNeedsMore(before, deps.keyOf)) return Promise.resolve();
            const tail = before.queue[before.queue.length - 1];
            const attempt = `${before.generation}:${key}:${getPlaybackSongKey(tail)}`;
            if (attempt === lastAttempt && now() < retryAt) return Promise.resolve();
            lastAttempt = attempt;
            retryAt = now() + 30000;
            const cancellation = cancellations;
            pending = Promise.resolve().then(async () => {
                const batch = await deps.load(tail);
                const live = deps.read();
                // Identity also rejects edits/clear-and-restore during the wait. A later attempt
                // starts from the edited tail, never from a stale copy of the user's queue.
                if (disposed || cancellation !== cancellations || live.queue !== before.queue || live.generation !== before.generation
                    || endlessQueueKey(live, deps.keyOf) !== key) return;
                const seen = new Set(live.queue.map(getPlaybackSongKey));
                const fresh = batch.filter(song => {
                    const id = getPlaybackSongKey(song);
                    if (deps.keyOf(song) !== key || seen.has(id)) return false;
                    seen.add(id);
                    return true;
                });
                if (fresh.length) deps.append([...live.queue, ...fresh]);
            }).catch(deps.failed).finally(() => { pending = null; });
            return pending;
        },
    };
}
