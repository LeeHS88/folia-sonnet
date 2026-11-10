import { describe, expect, it } from 'vitest';
import type { SongResult } from '@/types';
import { ytmLyricIdentity } from '@/services/onlineMusic/ytm/ytmLyricIdentity';
import { isSameLyricRecording } from '@/utils/lyrics/recordingMatch';

// Upload descriptions must not become artist/title data or make a wrong recording look exact.
const video = (name: string, artist = 'EHPMusicChannel'): SongResult => ({ id: 'video', name,
    artists: [{ id: '', name: artist }], album: { id: '', name: '' }, durationMs: 280000,
    sourceRef: { kind: 'online', providerId: 'ytm', mediaId: 'video' } });

describe('YouTube lyric identity', () => {
    it('extracts the song and singer from the user’s lyric-upload format', () => {
        const song = video('盧盧快閉嘴 - 流離『是不是那一刻 掌心空了，雨還下著』【動態歌詞MV】');
        const original = structuredClone(song);
        expect(ytmLyricIdentity(song)).toEqual({ title: '流離', artist: '盧盧快閉嘴', durationMs: 280000, strictRecordingMatch: true });
        expect(song).toEqual(original);
    });
    it.each([
        ['王唯旖 - 无情画 (《双世宠妃》第二季片头曲)『愿为你』【动态歌词MV】', '无情画', '王唯旖'],
        ['Artist - Song (Official Music Video)', 'Song', 'Artist'],
        ['AC-DC - Song [Lyrics]', 'Song', 'AC-DC'],
        ['盧盧快閉嘴 - 流離『是不是那一刻』【高音質|動態歌詞Lyrics】♫', '流離', '盧盧快閉嘴'],
        ['Artist - Song (Live)', 'Song (Live)', 'Artist'],
        ['Artist - Song (Remix) [Lyrics]', 'Song (Remix)', 'Artist'],
        ['歌手 - 歌名（翻唱版）【动态歌词】', '歌名（翻唱版）', '歌手'],
    ])('cleans %s without stripping rendition markers', (name, title, artist) => {
        expect(ytmLyricIdentity(video(name))).toMatchObject({ title, artist });
    });
    it('uses an explicit Topic channel but does not guess an arbitrary uploader is the singer', () => {
        expect(ytmLyricIdentity(video('Song', 'Artist - Topic'))).toMatchObject({ title: 'Song', artist: 'Artist' });
        expect(ytmLyricIdentity(video('Song [Lyrics]'))).toBeNull();
        expect(ytmLyricIdentity(video('Mix - Artist - Songs'))).toBeNull();
    });
    it('matches traditional/simplified names while rejecting covers, different lengths and missing timing metadata', () => {
        const target = ytmLyricIdentity(video('盧盧快閉嘴 - 流離【動態歌詞MV】'))!;
        const correct = video('流离', '卢卢快闭嘴');
        expect(isSameLyricRecording(target, correct)).toBe(true);
        expect(isSameLyricRecording(target, video('流离', '金淳'))).toBe(false);
        expect(isSameLyricRecording(target, video('流离 (Live)', '卢卢快闭嘴'))).toBe(false);
        expect(isSameLyricRecording(target, { ...correct, durationMs: 320000 })).toBe(false);
        expect(isSameLyricRecording(target, { ...correct, durationMs: 0 })).toBe(false);
    });
});
