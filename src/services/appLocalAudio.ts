// src/services/appLocalAudio.ts
// Songs some platforms download into the app's cache before playing (on Android) are
// addressed through the WebView as `https://localhost/_capacitor_file_/…`. The cache keeps only a
// few of them, so such an address can outlive its file while the prefetch cache still holds it
// (a replayed song then fails with ERROR_CODE_IO_FILE_NOT_FOUND). Before such an address is reused
// it is checked; a missing file means the platform is asked again (which downloads it anew).

const APP_LOCAL = /^https?:\/\/localhost\/_capacitor_(?:file|content)_\//;

export const isAppLocalAudioUrl = (url: string | null | undefined): boolean => Boolean(url && APP_LOCAL.test(url));

/** False only for an app-local address whose file is gone; any other address is not checked. */
export const appLocalAudioIsThere = async (url: string): Promise<boolean> => {
    if (!isAppLocalAudioUrl(url)) return true;
    try {
        const response = await fetch(url, { method: 'HEAD', cache: 'no-store' });
        return response.ok;
    } catch {
        return false;
    }
};
