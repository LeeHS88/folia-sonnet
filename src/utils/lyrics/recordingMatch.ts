import type { SongResult } from '../../types';
import { calculateMatchScoreDetails, normalizeLyricMatchText } from './matchScore';

// Stronger gates for an identity inferred from an upload: no different rendition or loose title hit.
const versionFlags = (title: string) => {
    const text = normalizeLyricMatchText(title);
    return [
        /\blive\b|现场/, /\b(?:cover|covered)\b|翻唱/, /\bremix\b|混音/,
        /\b(?:instrumental|karaoke)\b|伴奏/, /\bacoustic\b|不插电/,
        /\b(?:sped up|nightcore)\b|加速/, /\bslowed\b|慢速|降调/,
    ].map(pattern => pattern.test(text));
};

export const isSameLyricRecording = (target: { title: string; artist: string; durationMs: number }, song: SongResult): boolean => {
    const score = calculateMatchScoreDetails(target, song);
    const targetVersions = versionFlags(target.title);
    const candidateVersions = versionFlags(song.name);
    return Boolean(target.artist.trim()) && score.titleSimilarity >= 0.9 && score.artistSimilarity >= 0.8
        && score.durationMatched === true
        && targetVersions.every((flag, index) => flag === candidateVersions[index]);
};
