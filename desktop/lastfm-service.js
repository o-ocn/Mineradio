'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

// 默认内建 API Key（兼容 Last.fm 官方开放 API）
const DEFAULT_API_KEY = 'b25b959554ed76058ac220b7b2e0a026';
const DEFAULT_API_SECRET = '425b7747e90890696b998cfb62e49752';

class LastFmService {
  constructor(options = {}) {
    this.userDataPath = path.resolve(String(options.userDataPath || path.join(__dirname, '..', 'data')));
    this.configFile = path.join(this.userDataPath, 'lastfm-config.json');
    this.config = this.readConfig();
  }

  readConfig() {
    try {
      if (fs.existsSync(this.configFile)) {
        const raw = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
        return {
          enabled: raw.enabled !== false,
          scrobbleEnabled: raw.scrobbleEnabled !== false,
          apiKey: String(raw.apiKey || DEFAULT_API_KEY).trim(),
          apiSecret: String(raw.apiSecret || DEFAULT_API_SECRET).trim(),
          username: String(raw.username || '').trim(),
          sessionKey: String(raw.sessionKey || '').trim(),
        };
      }
    } catch (_) {}
    return {
      enabled: true,
      scrobbleEnabled: true,
      apiKey: DEFAULT_API_KEY,
      apiSecret: DEFAULT_API_SECRET,
      username: '',
      sessionKey: '',
    };
  }

  saveConfig(nextConfig = {}) {
    this.config = Object.assign({}, this.config, nextConfig);
    try {
      fs.mkdirSync(path.dirname(this.configFile), { recursive: true });
      fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2), 'utf8');
      return { ok: true, config: this.config };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  getConfig() {
    return {
      enabled: this.config.enabled,
      scrobbleEnabled: this.config.scrobbleEnabled,
      hasKey: !!this.config.apiKey,
      apiKey: this.config.apiKey,
      username: this.config.username,
      hasSession: !!this.config.sessionKey,
    };
  }

  createSignature(params, secret) {
    const keys = Object.keys(params).filter((k) => k !== 'format' && k !== 'callback').sort();
    let str = '';
    for (const k of keys) {
      str += k + params[k];
    }
    str += (secret || this.config.apiSecret);
    return crypto.createHash('md5').update(str, 'utf8').digest('hex');
  }

  request(method, params = {}, isPost = false) {
    return new Promise((resolve) => {
      const apiKey = this.config.apiKey || DEFAULT_API_KEY;
      const allParams = Object.assign({
        api_key: apiKey,
        format: 'json',
      }, params);

      if (this.config.sessionKey && !allParams.sk) {
        allParams.sk = this.config.sessionKey;
      }

      if (isPost || allParams.sk) {
        allParams.api_sig = this.createSignature(allParams, this.config.apiSecret || DEFAULT_API_SECRET);
      }

      const postData = Object.keys(allParams)
        .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(allParams[k]))
        .join('&');

      let url = 'https://ws.audioscrobbler.com/2.0/';
      const headers = {
        'User-Agent': 'Mineradio/1.0.0 (https://github.com/o-ocn/Mineradio)',
      };

      if (!isPost) {
        url += '?' + postData;
      } else {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        headers['Content-Length'] = Buffer.byteLength(postData);
      }

      const req = https.request(url, {
        method: isPost ? 'POST' : 'GET',
        headers,
        timeout: 10000,
      }, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.error) {
              resolve({ ok: false, error: data.message || `LastFM_ERROR_${data.error}`, code: data.error });
            } else {
              resolve({ ok: true, data });
            }
          } catch (_) {
            resolve({ ok: false, error: 'INVALID_JSON_RESPONSE', raw: body.slice(0, 200) });
          }
        });
      });

      req.on('error', (err) => {
        resolve({ ok: false, error: err.message || 'NETWORK_ERROR' });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, error: 'TIMEOUT' });
      });

      if (isPost) {
        req.write(postData);
      }
      req.end();
    });
  }

  getAuthUrl() {
    const apiKey = this.config.apiKey || DEFAULT_API_KEY;
    return `https://www.last.fm/api/auth/?api_key=${encodeURIComponent(apiKey)}`;
  }

  async createSession(token) {
    if (!token) return { ok: false, error: 'MISSING_TOKEN' };
    const res = await this.request('auth.getSession', {
      method: 'auth.getSession',
      token: String(token).trim(),
    }, true);

    if (res.ok && res.data && res.data.session) {
      const session = res.data.session;
      this.saveConfig({
        username: session.name,
        sessionKey: session.key,
      });
      return { ok: true, username: session.name, sessionKey: session.key };
    }
    return { ok: false, error: res.error || 'AUTH_GET_SESSION_FAILED' };
  }

  async updateNowPlaying(trackInfo = {}) {
    if (!this.config.enabled || !this.config.sessionKey) {
      return { ok: false, skipped: true, reason: 'NOT_LOGGED_IN_OR_DISABLED' };
    }
    const { artist, track, album, duration } = trackInfo;
    if (!artist || !track) {
      return { ok: false, error: 'MISSING_ARTIST_OR_TRACK' };
    }

    const params = {
      method: 'track.updateNowPlaying',
      artist: String(artist).trim(),
      track: String(track).trim(),
    };
    if (album) params.album = String(album).trim();
    if (duration && Number(duration) > 0) params.duration = Math.round(Number(duration));

    return this.request('track.updateNowPlaying', params, true);
  }

  async scrobble(trackInfo = {}) {
    if (!this.config.enabled || !this.config.scrobbleEnabled || !this.config.sessionKey) {
      return { ok: false, skipped: true, reason: 'NOT_LOGGED_IN_OR_DISABLED' };
    }
    const { artist, track, album, duration, timestamp } = trackInfo;
    if (!artist || !track) {
      return { ok: false, error: 'MISSING_ARTIST_OR_TRACK' };
    }

    const params = {
      method: 'track.scrobble',
      artist: String(artist).trim(),
      track: String(track).trim(),
      timestamp: timestamp ? Math.floor(timestamp) : Math.floor(Date.now() / 1000),
    };
    if (album) params.album = String(album).trim();
    if (duration && Number(duration) > 0) params.duration = Math.round(Number(duration));

    return this.request('track.scrobble', params, true);
  }

  async getSimilarTracks(trackInfo = {}) {
    const { artist, track, limit = 8 } = trackInfo;
    if (!artist || !track) {
      return { ok: false, error: 'MISSING_ARTIST_OR_TRACK', tracks: [] };
    }
    const res = await this.request('track.getSimilar', {
      method: 'track.getSimilar',
      artist: String(artist).trim(),
      track: String(track).trim(),
      limit: Math.max(1, Math.min(30, Number(limit) || 8)),
      autocorrect: 1,
    }, false);

    if (res.ok && res.data && res.data.similartracks && Array.isArray(res.data.similartracks.track)) {
      const list = res.data.similartracks.track.map((item) => ({
        name: item.name,
        artist: typeof item.artist === 'object' ? item.artist.name : item.artist,
        match: parseFloat(item.match || 0),
        url: item.url || '',
        image: Array.isArray(item.image) && item.image[item.image.length - 1] ? item.image[item.image.length - 1]['#text'] : '',
      }));
      return { ok: true, tracks: list };
    }
    return { ok: false, error: res.error || 'NO_SIMILAR_TRACKS_FOUND', tracks: [] };
  }

  async getRecentTracks(options = {}) {
    const username = options.username || this.config.username;
    if (!username) {
      return { ok: false, error: 'NO_USERNAME', tracks: [] };
    }
    const limit = Math.max(1, Math.min(30, Number(options.limit) || 10));
    const res = await this.request('user.getRecentTracks', {
      method: 'user.getRecentTracks',
      user: username,
      limit,
    }, false);

    if (res.ok && res.data && res.data.recenttracks && Array.isArray(res.data.recenttracks.track)) {
      const list = res.data.recenttracks.track.map((item) => ({
        name: item.name,
        artist: typeof item.artist === 'object' ? (item.artist['#text'] || item.artist.name) : item.artist,
        album: typeof item.album === 'object' ? item.album['#text'] : item.album,
        nowPlaying: !!(item['@attr'] && item['@attr'].nowplaying),
        date: item.date ? item.date['#text'] : '',
      }));
      return { ok: true, tracks: list };
    }
    return { ok: false, error: res.error || 'FAILED_TO_GET_RECENT_TRACKS', tracks: [] };
  }
}

module.exports = {
  LastFmService,
};
