import { useEffect, useMemo, useRef } from 'react';
import { PlayerState } from '../../../../types';
import { omni } from '../../../../services/onlineMusic/omni';
import { wholeQueueWritesSoFar } from '../../../../services/wholeQueueWrites';
import { setPlayQueue, usePlaybackStore } from '../../../../stores/usePlaybackStore';
import { queueStartsSoFar } from './queueStarts';
import { createEndlessQueueRefiller, endlessQueueKey, endlessQueueNeedsMore } from './endlessQueue';

// Refill before the last five songs, and retry transient failures at most once per 30 seconds.
const keyOf = (song: Parameters<typeof omni.getQueueContinuationKey>[0]) => omni.getQueueContinuationKey?.(song) ?? null;
const snapshot = () => {
    const live = usePlaybackStore.getState();
    return { queue: live.playQueue, current: live.currentSong,
        enabled: live.activePlaybackContext === 'main' && !live.isFmMode,
        generation: `${queueStartsSoFar()}:${wholeQueueWritesSoFar()}` };
};

export function useEndlessQueue() {
    const queue = usePlaybackStore(state => state.playQueue);
    const current = usePlaybackStore(state => state.currentSong);
    // Not "=== PLAYING": on Android the native player (ExoPlayer) plays while the store's raw state
    // stays IDLE from the song change (selectDisplayPlayerState shows it as playing). Only a pause
    // holds the refill back; with no current song there is nothing to refill anyway.
    const playing = usePlaybackStore(state => state.playerState !== PlayerState.PAUSED);
    const context = usePlaybackStore(state => state.activePlaybackContext);
    const isFm = usePlaybackStore(state => state.isFmMode);
    const ref = useRef<ReturnType<typeof createEndlessQueueRefiller> | null>(null);
    if (!ref.current) ref.current = createEndlessQueueRefiller({
        read: snapshot, keyOf, load: song => omni.getQueueContinuation(song), append: setPlayQueue,
        failed: error => console.warn('[Playback] Mix refill failed; the existing queue is kept', error),
    });
    useEffect(() => () => ref.current?.cancel(), []);
    useEffect(() => {
        if (!playing || !endlessQueueNeedsMore(snapshot(), keyOf)) return;
        void ref.current!.refill();
        const timer = setInterval(() => { void ref.current!.refill(); }, 30000);
        return () => clearInterval(timer);
    }, [queue, current, playing, context, isFm]);
    return useMemo(() => ({ isEndless: () => Boolean(endlessQueueKey(snapshot(), keyOf)), refill: () => ref.current!.refill() }), []);
}
