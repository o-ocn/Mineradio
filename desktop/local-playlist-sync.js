const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { localFileId } = require('./local-music-library');
const { sanitizeTrack } = require('./built-in-playlist-library');

const DEFAULT_PLAYLIST_ROOTS = [
  path.resolve('E:/Document/Google drive/Music/播放列表'),
  path.resolve('C:/Users/oocn/OneDrive/娱乐/Music/播放列表'),
];

function resolveActivePlaylistDirectory() {
  for (const candidate of DEFAULT_PLAYLIST_ROOTS) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        return candidate;
      }
    } catch (_) {}
  }
  return '';
}

function parseM3u8File(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    const audioFiles = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const absPath = path.resolve(path.dirname(filePath), line);
      if (fs.existsSync(absPath)) {
        audioFiles.push(absPath);
      }
    }
    return audioFiles;
  } catch (error) {
    console.warn('[LocalPlaylistSync] parseM3u8File failed:', filePath, error.message);
    return [];
  }
}

async function syncLocalM3uPlaylists(localLib, playlistLib, options = {}) {
  const playlistDir = options.playlistDir || resolveActivePlaylistDirectory();
  if (!playlistDir) {
    return { ok: false, error: 'PLAYLIST_DIR_NOT_FOUND', playlists: [] };
  }

  const targetPlaylists = [
    { key: 'm3u8:donggan', name: '动感', fileName: '动感.m3u8' },
    { key: 'm3u8:jingmo', name: '静默', fileName: '静默.m3u8' },
  ];

  const filesByPlaylist = new Map();
  const allNeededFiles = new Set();

  for (const item of targetPlaylists) {
    const filePath = path.join(playlistDir, item.fileName);
    const audioFiles = parseM3u8File(filePath);
    filesByPlaylist.set(item.key, audioFiles);
    audioFiles.forEach((f) => allNeededFiles.add(f));
  }

  // Find unimported audio files
  const unimported = [];
  for (const filePath of allNeededFiles) {
    const id = localFileId(filePath);
    if (!localLib.records.has(id)) {
      unimported.push({
        path: filePath,
        relativePath: path.basename(filePath),
      });
    }
  }

  if (unimported.length > 0) {
    console.log(`[LocalPlaylistSync] Importing ${unimported.length} new local tracks...`);
    await localLib.importFiles(unimported, { replace: false });
  }

  // Sync playlists
  const results = [];
  for (const item of targetPlaylists) {
    const audioFiles = filesByPlaylist.get(item.key) || [];
    const id = crypto.createHash('sha256').update(item.key).digest('hex').slice(0, 24);
    const tracks = [];
    for (const filePath of audioFiles) {
      const fileId = localFileId(filePath);
      const record = localLib.records.get(fileId);
      if (record) {
        const sanitized = sanitizeTrack(localLib.serializeRecord(record));
        if (sanitized) tracks.push(sanitized);
      }
    }

    let playlist = playlistLib.playlists.find((p) => p.id === id);
    if (!playlist) {
      playlist = {
        id,
        name: item.name,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tracks,
      };
      playlistLib.playlists.push(playlist);
    } else {
      playlist.name = item.name;
      playlist.tracks = tracks;
      playlist.updatedAt = Date.now();
    }
    results.push({ id, name: item.name, trackCount: tracks.length });
  }

  await playlistLib.persist(playlistLib.playlists);
  return { ok: true, playlistDir, playlists: results };
}

module.exports = {
  resolveActivePlaylistDirectory,
  syncLocalM3uPlaylists,
};
