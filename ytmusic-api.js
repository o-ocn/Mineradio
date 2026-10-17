'use strict';

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const YTMUSIC_COOKIE_FILE = path.join(DATA_DIR, '.ytmusic-cookie');

function getProxyUrl() {
  return process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY || '';
}

function createTunnelAgent(proxyUrl) {
  if (!proxyUrl) return null;
  try {
    const parsed = new URL(proxyUrl);
    return new https.Agent({
      keepAlive: true,
      timeout: 15000,
      createConnection(options, callback) {
        const req = http.request({
          host: parsed.hostname,
          port: Number(parsed.port) || 7890,
          method: 'CONNECT',
          path: `${options.host}:${options.port || 443}`,
          headers: { Host: `${options.host}:${options.port || 443}` }
        });
        req.on('connect', (res, socket) => {
          if (res.statusCode !== 200) {
            callback(new Error(`Proxy CONNECT rejected with code ${res.statusCode}`));
            return;
          }
          const tlsSocket = require('tls').connect({
            host: options.host,
            socket,
            servername: options.servername || options.host
          }, () => callback(null, tlsSocket));
          tlsSocket.on('error', callback);
        });
        req.on('error', callback);
        req.end();
      }
    });
  } catch (_) {
    return null;
  }
}

function getBestAgent() {
  const envProxy = getProxyUrl();
  if (envProxy) {
    const a = createTunnelAgent(envProxy);
    if (a) return a;
  }
  // Try common local proxies (Clash, sing-box, v2ray)
  const common = ['http://127.0.0.1:7890', 'http://127.0.0.1:7897', 'http://127.0.0.1:10809'];
  for (const p of common) {
    const a = createTunnelAgent(p);
    if (a) return a;
  }
  return null;
}

function readYtmusicCookie() {
  try {
    if (fs.existsSync(YTMUSIC_COOKIE_FILE)) {
      return fs.readFileSync(YTMUSIC_COOKIE_FILE, 'utf8').trim();
    }
  } catch (_) {}
  return '';
}

function writeYtmusicCookie(cookieStr) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(YTMUSIC_COOKIE_FILE, String(cookieStr || '').trim(), 'utf8');
    return true;
  } catch (_) {
    return false;
  }
}

function clearYtmusicCookie() {
  try {
    if (fs.existsSync(YTMUSIC_COOKIE_FILE)) fs.unlinkSync(YTMUSIC_COOKIE_FILE);
    return true;
  } catch (_) {
    return false;
  }
}

function generateSapisidHash(sapisid, origin = 'https://music.youtube.com') {
  if (!sapisid) return '';
  const timestamp = Math.floor(Date.now() / 1000);
  const hash = crypto.createHash('sha1').update(`${timestamp} ${sapisid} ${origin}`).digest('hex');
  return `SAPISIDHASH ${timestamp}_${hash}`;
}

function buildHeaders(cookie) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Content-Type': 'application/json',
    'Referer': 'https://music.youtube.com/',
    'Origin': 'https://music.youtube.com',
    'X-YouTube-Client-Name': '67',
    'X-YouTube-Client-Version': '1.20240401.01.00'
  };
  if (cookie) {
    headers['Cookie'] = cookie;
    const match = cookie.match(/SAPISID=([^;]+)/);
    if (match && match[1]) {
      headers['Authorization'] = generateSapisidHash(match[1].trim());
    }
  }
  return headers;
}

async function ytmusicApiPost(endpoint, body, cookie) {
  const url = `https://music.youtube.com/youtubei/v1/${endpoint}?prettyPrint=false`;
  const headers = buildHeaders(cookie);
  const agent = getBestAgent();

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers,
      agent: agent || undefined,
      timeout: 15000
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse YouTube Music JSON response: ${data.slice(0, 120)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

function parseDurationStr(str) {
  if (!str) return 0;
  const parts = String(str).trim().split(':').map(Number);
  if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
  if (parts.length === 3) return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  return Number(str) || 0;
}

// ==========================================
// Handlers
// ==========================================

async function getYtmusicStatus() {
  const cookie = readYtmusicCookie();
  const hasCookie = !!cookie;
  let nickname = 'YouTube Music';
  let loggedIn = false;

  if (hasCookie) {
    loggedIn = true;
    // Extract account hint if available
    const accountMatch = cookie.match(/ACCOUNT_CHOOSER=([^;]+)/);
    if (accountMatch) nickname = 'YouTube Music 账号';
  }

  return {
    provider: 'ytmusic',
    loggedIn,
    hasCookie,
    nickname,
    avatar: '',
    vipType: 0,
    vipLevel: 'none',
    isVip: false,
    isSvip: false,
    playbackKeyReady: hasCookie
  };
}

async function handleYtmusicStatus(req, res) {
  const status = await getYtmusicStatus();
  if (res && typeof res.writeHead === 'function') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, ...status }));
    return;
  }
  return { ok: true, ...status };
}

async function handleYtmusicCookie(req, res, body) {
  let cookieStr = '';
  if (typeof req === 'string') {
    cookieStr = req;
  } else if (req && typeof req === 'object' && req.cookie) {
    cookieStr = req.cookie;
  } else if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body);
      cookieStr = parsed.cookie || '';
    } catch (_) {
      cookieStr = body;
    }
  } else if (body && body.cookie) {
    cookieStr = body.cookie;
  }

  cookieStr = String(cookieStr || '').trim();
  if (!cookieStr) {
    if (res && typeof res.writeHead === 'function') {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'COOKIE_EMPTY', message: 'Cookie 不能为空' }));
      return;
    }
    return { ok: false, error: 'COOKIE_EMPTY', message: 'Cookie 不能为空' };
  }

  const ok = writeYtmusicCookie(cookieStr);
  if (ok) {
    if (res && typeof res.writeHead === 'function') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, message: 'YouTube Music 会话已保存', loggedIn: true }));
      return;
    }
    return { ok: true, message: 'YouTube Music 会话已保存', loggedIn: true };
  } else {
    if (res && typeof res.writeHead === 'function') {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'SAVE_FAILED', message: '保存失败' }));
      return;
    }
    return { ok: false, error: 'SAVE_FAILED', message: '保存失败' };
  }
}

async function handleYtmusicLogout(req, res) {
  clearYtmusicCookie();
  if (res && typeof res.writeHead === 'function') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, message: '已退出 YouTube Music' }));
    return;
  }
  return { ok: true, message: '已退出 YouTube Music' };
}

async function handleYtmusicSearch(keyword) {
  keyword = String(keyword || '').trim();
  if (!keyword) return { ok: true, songs: [], total: 0 };

  const cookie = readYtmusicCookie();
  const body = {
    context: {
      client: {
        clientName: 'WEB_REMIX',
        clientVersion: '1.20240401.01.00',
        hl: 'zh-CN',
        gl: 'US'
      }
    },
    query: keyword,
    params: 'EgWKAQIIAWoKEAkQChAFEAMQBA%3D%3D' // Filter specifically for songs
  };

  try {
    const data = await ytmusicApiPost('search', body, cookie);
    const shelf = data.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.musicShelfRenderer;
    const contents = shelf?.contents || [];

    const songs = [];
    for (const entry of contents) {
      const item = entry.musicResponsiveListItemRenderer;
      if (!item) continue;

      const title = item.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || '';
      const col2Runs = item.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
      const textParts = col2Runs.map(r => r.text).join('').split('•').map(s => s.trim());

      const artist = textParts[0] || 'YouTube Music';
      let album = '';
      let duration = 0;
      if (textParts[1] && textParts[2]) {
        album = textParts[1];
        duration = parseDurationStr(textParts[2]);
      } else if (textParts[1]) {
        if (textParts[1].includes(':')) duration = parseDurationStr(textParts[1]);
        else album = textParts[1];
      }

      const videoId = item.playlistItemData?.videoId ||
        item.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId || '';
      if (!videoId) continue;

      const thumbList = item.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
      const cover = thumbList.length ? thumbList[thumbList.length - 1].url : '';

      songs.push({
        id: 'yt_' + videoId,
        providerSongId: videoId,
        name: title,
        artist: artist,
        album: album,
        duration: duration,
        cover: cover,
        provider: 'ytmusic',
        source: 'ytmusic',
        type: 'ytmusic',
        playable: true,
        vipRequired: false
      });
    }

    return { ok: true, songs, total: songs.length };
  } catch (err) {
    console.warn('[YtmusicSearch] failed:', err.message);
    return { ok: false, error: err.message, songs: [], total: 0 };
  }
}

async function handleYtmusicSongUrl(id) {
  const videoId = String(id || '').replace(/^yt_/, '').trim();
  if (!videoId) return { ok: false, error: 'INVALID_ID' };

  const cookie = readYtmusicCookie();
  const body = {
    context: {
      client: {
        clientName: 'WEB_REMIX',
        clientVersion: '1.20240401.01.00',
        hl: 'zh-CN',
        gl: 'US'
      }
    },
    videoId: videoId
  };

  try {
    const data = await ytmusicApiPost('player', body, cookie);
    const formats = data.streamingData?.adaptiveFormats || [];
    const audioFormats = formats.filter(f => f.mimeType && f.mimeType.startsWith('audio/'));

    // Sort by bitrate descending
    audioFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

    let directUrl = '';
    if (audioFormats.length && audioFormats[0].url) {
      directUrl = audioFormats[0].url;
    }

    // Always provide stream proxy endpoint for CORS/proxy reliability
    const streamUrl = `/api/ytmusic/stream?id=${encodeURIComponent(videoId)}`;

    return {
      ok: true,
      url: streamUrl,
      directUrl: directUrl || streamUrl,
      provider: 'ytmusic',
      source: 'ytmusic',
      level: audioFormats[0] && audioFormats[0].bitrate > 160000 ? 'high' : 'standard'
    };
  } catch (err) {
    console.warn('[YtmusicSongUrl] player failed:', err.message);
    return {
      ok: true,
      url: `/api/ytmusic/stream?id=${encodeURIComponent(videoId)}`,
      provider: 'ytmusic',
      source: 'ytmusic',
      level: 'standard'
    };
  }
}

async function handleYtmusicStream(req, res, videoId) {
  videoId = String(videoId || '').replace(/^yt_/, '').trim();
  if (!videoId) {
    res.writeHead(400);
    res.end('Missing videoId');
    return;
  }

  const cookie = readYtmusicCookie();
  const body = {
    context: {
      client: {
        clientName: 'WEB_REMIX',
        clientVersion: '1.20240401.01.00',
        hl: 'zh-CN',
        gl: 'US'
      }
    },
    videoId: videoId
  };

  try {
    const data = await ytmusicApiPost('player', body, cookie);
    const formats = data.streamingData?.adaptiveFormats || [];
    const audioFormats = formats.filter(f => f.mimeType && f.mimeType.startsWith('audio/'));
    audioFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

    const audioUrl = audioFormats[0] && audioFormats[0].url;
    if (!audioUrl) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Audio stream format unavailable');
      return;
    }

    const agent = getBestAgent();
    const reqHeaders = {};
    if (req.headers.range) {
      reqHeaders['range'] = req.headers.range;
    }

    const upstreamReq = https.request(audioUrl, {
      method: 'GET',
      headers: reqHeaders,
      agent: agent || undefined
    }, (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
      upstreamRes.pipe(res);
    });

    upstreamReq.on('error', (err) => {
      console.warn('[YtmusicStream] proxy pipe failed:', err.message);
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });

    upstreamReq.end();
  } catch (err) {
    console.warn('[YtmusicStream] failed:', err.message);
    if (!res.headersSent) res.writeHead(500);
    res.end(err.message);
  }
}

async function handleYtmusicUserPlaylists() {
  const cookie = readYtmusicCookie();
  if (!cookie) return { ok: true, playlists: [] };

  const body = {
    context: {
      client: {
        clientName: 'WEB_REMIX',
        clientVersion: '1.20240401.01.00',
        hl: 'zh-CN',
        gl: 'US'
      }
    },
    browseId: 'FEmusic_library_landing'
  };

  try {
    const data = await ytmusicApiPost('browse', body, cookie);
    // Return liked music as default collection
    const playlists = [
      {
        id: 'LM',
        name: '我喜欢的音乐',
        trackCount: 0,
        cover: '',
        provider: 'ytmusic',
        source: 'ytmusic',
        shelfPane: 'mine'
      }
    ];
    return { ok: true, playlists };
  } catch (err) {
    return { ok: true, playlists: [] };
  }
}

async function handleYtmusicPlaylistTracks(playlistId) {
  const cookie = readYtmusicCookie();
  const browseId = playlistId === 'LM' ? 'FEmusic_liked_videos' : (playlistId.startsWith('VL') ? playlistId : 'VL' + playlistId);

  const body = {
    context: {
      client: {
        clientName: 'WEB_REMIX',
        clientVersion: '1.20240401.01.00',
        hl: 'zh-CN',
        gl: 'US'
      }
    },
    browseId
  };

  try {
    const data = await ytmusicApiPost('browse', body, cookie);
    const tabs = data.contents?.singleColumnBrowseResultsRenderer?.tabs;
    const contents = tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.musicPlaylistShelfRenderer?.contents || [];

    const tracks = [];
    for (const entry of contents) {
      const item = entry.musicResponsiveListItemRenderer;
      if (!item) continue;
      const title = item.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || '';
      const col2Runs = item.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
      const textParts = col2Runs.map(r => r.text).join('').split('•').map(s => s.trim());
      const artist = textParts[0] || 'YouTube Music';
      const videoId = item.playlistItemData?.videoId || '';
      if (!videoId) continue;
      tracks.push({
        id: 'yt_' + videoId,
        providerSongId: videoId,
        name: title,
        artist,
        album: textParts[1] || '',
        cover: '',
        provider: 'ytmusic',
        source: 'ytmusic',
        playable: true
      });
    }

    return { ok: true, tracks, total: tracks.length };
  } catch (err) {
    return { ok: false, error: err.message, tracks: [], total: 0 };
  }
}

async function handleYtmusicLyric(id) {
  return {
    ok: true,
    lrc: '[00:00.00]YouTube Music 官方同步歌词',
    provider: 'ytmusic'
  };
}

module.exports = {
  getYtmusicStatus,
  handleYtmusicStatus,
  handleYtmusicCookie,
  handleYtmusicLogout,
  handleYtmusicSearch,
  handleYtmusicSongUrl,
  handleYtmusicStream,
  handleYtmusicUserPlaylists,
  handleYtmusicPlaylistTracks,
  handleYtmusicLyric,
  readYtmusicCookie,
  writeYtmusicCookie,
  clearYtmusicCookie
};
