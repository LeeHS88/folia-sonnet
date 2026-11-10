import type { SongResult } from '../../../types';
import type { LyricMatchIdentity } from '../../../types/onlineMusic';

// Use upload titles for lyric searches only; the video and its playback identity stay intact.
const VERSION = /\b(?:live|cover|remix|instrumental|karaoke|acoustic|sped\s*up|slowed|nightcore)\b|翻唱|现场|現場|伴奏|改编|改編|加速|慢速|降调|降調/i;
const PRESENTATION = /^(?:official\s*)?(?:(?:music|lyric|lyrics|audio)\s*)?(?:video|mv|lyrics?|audio|hd|hq|4k|1080p)(?:\s*(?:video|hd|4k|1080p))*$|^(?:動態|动态|高音質|高音质|超高音質|超高音质|高清|完整版|中文|繁體|简体|字幕|歌詞|歌词|音樂|音乐|MV|Lyrics|Video|4K|HD|\s)+$/i;

const cleanTitle = (value: string): string => value
    // Uploader quotations are lyric excerpts, not part of the song title.
    .replace(/『[^』]*』|「[^」]*」/gu, '')
    .replace(/[（(【\[]([^）)】\]]*)[）)】\]]/gu, (whole, content: string) => {
        if (VERSION.test(content)) return whole;
        return content.split(/[|｜/]/u).every(part => PRESENTATION.test(part.trim()))
            || /《.+》.*(?:主题曲|主題曲|片头曲|片頭曲|片尾曲|插曲)/u.test(content) ? '' : whole;
    })
    .replace(/\s*[|｜]\s*(?:official\s*)?(?:lyrics?|music video|audio|mv|4k|hd).*$/iu, '')
    .replace(/\s+(?:official\s+(?:music\s+)?video|official\s+audio|lyrics?\s*(?:video)?|動態歌詞MV|动态歌词MV)\s*$/iu, '')
    .replace(/^[\s《》“”"']+|[\s《》“”"']+$/gu, '')
    .replace(/[♫♪🎵🎶]+$/gu, '')
    .trim();

export function ytmLyricIdentity(song: SongResult): LyricMatchIdentity | null {
    if (song.sourceRef?.kind !== 'online' || song.sourceRef.providerId !== 'ytm') return null;
    // Explicit artist - song is common on lyric-upload channels. Do not infer an artist from
    // an arbitrary channel name, or split hyphens inside names such as AC-DC.
    const parts = song.name.match(/^(.{1,80}?)\s+[\-–—]\s+(.+)$/u);
    const topic = song.artists.length === 1 ? song.artists[0].name.match(/^(.+?)\s+-\s+Topic$/iu) : null;
    if (!parts && !topic) return null;
    const artist = (parts?.[1] ?? topic![1]).trim();
    const title = cleanTitle(parts?.[2] ?? song.name);
    if (!title || title.length > 100 || !artist || /\b(?:mix|playlist|compilation|hours?)\b|合集|合輯|串烧|串燒|歌曲集/i.test(song.name)) return null;
    return { title, artist, durationMs: song.durationMs, strictRecordingMatch: true };
}
