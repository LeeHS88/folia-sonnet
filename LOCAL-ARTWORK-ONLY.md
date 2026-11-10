# Local artwork-only queue wall

The Lattice queue wall hides its title and artist overlays when a tile has artwork.
Hover reveals the labels; keyboard focus reveals collapsed labels and the existing
expanded controls reveal the playing tile's labels. Touch users can use the
existing tap disclosure. Tiles without artwork retain their text. Lyrics,
playback controls, queue badges and the accessible song name are preserved.
The library wall and other pages retain their existing presentation.

The change is scoped to `LatticePoster.tsx` and `Lattice.css`. It reuses the
existing disclosure state. Automatic focus on the expanded playing tile does
not reveal its title by itself.

Validated with TypeScript, the existing isolated desktop Lattice probe, and
screenshots: hidden idle titles, hover reveal, keyboard reveal, visible synced
lyrics, and all labels retained for a queue without covers. Built the desktop
renderer for installation. Existing YouTube Mix and lyric customizations remain.

Installation is guarded by the previous archive's SHA-256 and retains a backup at
`%LOCALAPPDATA%/Programs/Folia/backups/app.asar.before-artwork-only-0.7.23`.
To roll back, exit Folia and restore that archive as `resources/app.asar` in the
same installation. The patch does not edit user settings or account data.
