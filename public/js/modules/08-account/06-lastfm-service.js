// ============================================================
// Last.fm 官方集成服务与智能相似歌曲推荐
// ============================================================

var lastFmState = {
  config: {
    enabled: true,
    scrobbleEnabled: true,
    hasKey: true,
    apiKey: '',
    username: '',
    hasSession: false,
  },
  currentSong: null,
  nowPlayingSent: false,
  scrobbled: false,
  playStartedAt: 0,
  similarTracks: [],
  similarLoading: false,
};

async function initLastFmService() {
  var api = window.desktopWindow;
  if (!api || typeof api.getLastFmConfig !== 'function') return;
  try {
    var res = await api.getLastFmConfig();
    if (res) {
      lastFmState.config = Object.assign({}, lastFmState.config, res);
      updateHomeLastFmStatus();
    }
  } catch (error) {
    console.warn('[LastFm] Failed to read config:', error);
  }
}

function updateHomeLastFmStatus() {
  var statusEl = document.getElementById('home-lastfm-status');
  if (!statusEl) return;
  var cfg = lastFmState.config;
  if (!cfg.enabled) {
    statusEl.textContent = 'Last.fm 同步服务已停用';
    statusEl.className = 'home-lastfm-status disabled';
    return;
  }
  if (cfg.hasSession && cfg.username) {
    statusEl.innerHTML = '<span class="lastfm-badge">已绑定</span> 账号: <b>' + escHtml(cfg.username) + '</b>（播放时自动打卡）';
    statusEl.className = 'home-lastfm-status connected';
  } else {
    statusEl.innerHTML = '<span class="lastfm-badge unlinked">未绑定</span> 绑定 Last.fm 账号可实时同步听歌足迹';
    statusEl.className = 'home-lastfm-status unlinked';
  }
}

function onLastFmTrackStart(song) {
  if (!song) return;
  var api = window.desktopWindow;
  lastFmState.currentSong = song;
  lastFmState.nowPlayingSent = false;
  lastFmState.scrobbled = false;
  lastFmState.playStartedAt = Math.floor(Date.now() / 1000);

  var artist = song.artist || song.singer || '';
  var title = song.name || song.title || '';
  if (!artist || !title || !api || typeof api.lastFmUpdateNowPlaying !== 'function') return;

  api.lastFmUpdateNowPlaying({
    artist: artist,
    track: title,
    album: song.album || '',
    duration: Math.round(Number(song.duration) || 0),
  }).then(function (res) {
    if (res && res.ok) {
      lastFmState.nowPlayingSent = true;
    }
  }).catch(function () {});
}

function onLastFmTimeUpdate(currentTime, duration) {
  if (lastFmState.scrobbled || !lastFmState.currentSong) return;
  var cur = Number(currentTime) || 0;
  var dur = Number(duration) || (lastFmState.currentSong ? Number(lastFmState.currentSong.duration) : 0) || 0;
  if (cur < 15) return; // 播放少于 15 秒不触发打卡

  // 达到总时长的 50% 或超过 240 秒
  var reachedHalf = dur > 0 && cur >= dur * 0.5;
  var reachedFourMinutes = cur >= 240;

  if (reachedHalf || reachedFourMinutes) {
    triggerLastFmScrobble();
  }
}

function triggerLastFmScrobble() {
  if (lastFmState.scrobbled || !lastFmState.currentSong) return;
  lastFmState.scrobbled = true;
  var api = window.desktopWindow;
  var song = lastFmState.currentSong;
  var artist = song.artist || song.singer || '';
  var title = song.name || song.title || '';
  if (!artist || !title || !api || typeof api.lastFmScrobble !== 'function') return;

  api.lastFmScrobble({
    artist: artist,
    track: title,
    album: song.album || '',
    duration: Math.round(Number(song.duration) || 0),
    timestamp: lastFmState.playStartedAt || Math.floor(Date.now() / 1000),
  }).then(function (res) {
    if (res && res.ok) {
      if (typeof showToast === 'function') {
        showToast('已打卡到 Last.fm: ' + title);
      }
    }
  }).catch(function (error) {
    console.warn('[LastFm] Scrobble failed:', error);
  });
}

async function refreshHomeLastFmSimilar() {
  var listEl = document.getElementById('home-lastfm-recommend-list');
  var btn = document.getElementById('home-lastfm-action-btn');
  if (!listEl) return;

  var current = lastFmState.currentSong || (typeof currentCoverSong === 'function' ? currentCoverSong() : null);
  if (!current && playQueue && playQueue.length && currentIdx >= 0) {
    current = playQueue[currentIdx];
  }

  if (!current) {
    listEl.innerHTML = '<div class="home-lastfm-empty">先播放一首歌曲，即可在此探索相似风格的宝藏音乐</div>';
    return;
  }

  var artist = current.artist || current.singer || '';
  var track = current.name || current.title || '';
  if (!artist || !track) {
    listEl.innerHTML = '<div class="home-lastfm-empty">当前歌曲缺少歌手或曲名信息，无法匹配</div>';
    return;
  }

  var api = window.desktopWindow;
  if (!api || typeof api.lastFmGetSimilar !== 'function') {
    listEl.innerHTML = '<div class="home-lastfm-empty">桌面端接口未就绪</div>';
    return;
  }

  if (btn) btn.textContent = '正在获取相似推荐…';
  listEl.innerHTML = '<div class="home-lastfm-loading">正在从 Last.fm 全球音乐库匹配与《' + escHtml(track) + '》风格相似的歌曲…</div>';

  try {
    var res = await api.lastFmGetSimilar({ artist: artist, track: track, limit: 6 });
    if (res && res.ok && Array.isArray(res.tracks) && res.tracks.length) {
      lastFmState.similarTracks = res.tracks;
      listEl.innerHTML = res.tracks.map(function (item) {
        var matchPct = Math.round((Number(item.match) || 0) * 100);
        return '<div class="home-lastfm-track-row" onclick="playOrSearchSimilarTrack(\'' + escHtml(item.name).replace(/'/g, "\\'") + '\', \'' + escHtml(item.artist).replace(/'/g, "\\'") + '\')">' +
          '<div class="home-lastfm-track-info">' +
          '<span class="home-lastfm-track-name">' + escHtml(item.name) + '</span>' +
          '<span class="home-lastfm-track-artist">' + escHtml(item.artist) + '</span>' +
          '</div>' +
          (matchPct > 0 ? '<span class="home-lastfm-match-tag">相似度 ' + matchPct + '%</span>' : '') +
          '</div>';
      }).join('');
    } else {
      listEl.innerHTML = '<div class="home-lastfm-empty">未匹配到《' + escHtml(track) + '》的直接相似歌曲，可换一首试试</div>';
    }
  } catch (error) {
    listEl.innerHTML = '<div class="home-lastfm-empty">获取推荐失败，请检查网络连接</div>';
  } finally {
    if (btn) btn.textContent = '探索当前歌曲的相似音乐';
  }
}

function playOrSearchSimilarTrack(track, artist) {
  var keyword = (artist ? artist + ' ' : '') + track;
  if (typeof openSearchWithKeyword === 'function') {
    openSearchWithKeyword(keyword);
    return;
  }
  var input = document.getElementById('search-input');
  if (input) {
    input.value = keyword;
    if (typeof setSearchMode === 'function') setSearchMode('song');
    if (typeof doSearch === 'function') doSearch();
    if (typeof showToast === 'function') showToast('正在搜索相似歌曲: ' + keyword);
  }
}

function openLastFmSettingsModal() {
  var modal = document.getElementById('lastfm-settings-modal');
  if (!modal) {
    createLastFmSettingsModal();
    modal = document.getElementById('lastfm-settings-modal');
  }
  updateLastFmModalUi();
  if (typeof openGsapModal === 'function') openGsapModal(modal);
}

function closeLastFmSettingsModal() {
  var modal = document.getElementById('lastfm-settings-modal');
  if (modal && typeof closeGsapModal === 'function') closeGsapModal(modal);
}

function updateLastFmModalUi() {
  var cfg = lastFmState.config;
  var userInp = document.getElementById('lastfm-username-input');
  var keyInp = document.getElementById('lastfm-session-input');
  var scrobbleCheck = document.getElementById('lastfm-scrobble-toggle');
  var statusBadge = document.getElementById('lastfm-modal-status-badge');

  if (userInp) userInp.value = cfg.username || '';
  if (keyInp) keyInp.value = cfg.sessionKey || '';
  if (scrobbleCheck) scrobbleCheck.checked = !!cfg.scrobbleEnabled;

  if (statusBadge) {
    if (cfg.hasSession && cfg.username) {
      statusBadge.innerHTML = '<span class="status-dot green"></span>已绑定账号：<b>' + escHtml(cfg.username) + '</b>';
    } else {
      statusBadge.innerHTML = '<span class="status-dot gray"></span>未绑定 Session Key';
    }
  }
}

async function saveLastFmSettingsFromModal() {
  var userInp = document.getElementById('lastfm-username-input');
  var keyInp = document.getElementById('lastfm-session-input');
  var scrobbleCheck = document.getElementById('lastfm-scrobble-toggle');
  var api = window.desktopWindow;
  if (!api || typeof api.saveLastFmConfig !== 'function') return;

  var newConfig = {
    username: userInp ? userInp.value.trim() : '',
    sessionKey: keyInp ? keyInp.value.trim() : '',
    scrobbleEnabled: scrobbleCheck ? scrobbleCheck.checked : true,
    enabled: true,
  };

  try {
    var res = await api.saveLastFmConfig(newConfig);
    if (res && res.ok) {
      lastFmState.config = Object.assign({}, lastFmState.config, newConfig, { hasSession: !!newConfig.sessionKey });
      updateHomeLastFmStatus();
      updateLastFmModalUi();
      if (typeof showToast === 'function') showToast('Last.fm 设置已保存');
      closeLastFmSettingsModal();
    }
  } catch (error) {
    if (typeof showToast === 'function') showToast('保存失败: ' + error.message);
  }
}

async function openLastFmWebAuth() {
  var api = window.desktopWindow;
  if (!api || typeof api.getLastFmAuthUrl !== 'function') return;
  try {
    var res = await api.getLastFmAuthUrl();
    if (res && res.url) {
      if (typeof api.openUpdatePage === 'function') {
        api.openUpdatePage(res.url);
      } else {
        window.open(res.url, '_blank');
      }
      if (typeof showToast === 'function') {
        showToast('已在浏览器打开 Last.fm 授权页，授权完成后请填入 Session 或用户名');
      }
    }
  } catch (error) {
    if (typeof showToast === 'function') showToast('打开授权链接失败');
  }
}

function createLastFmSettingsModal() {
  var shell = document.createElement('div');
  shell.id = 'lastfm-settings-modal';
  shell.className = 'modal-mask lastfm-settings-modal';
  shell.innerHTML = '<div class="modal lastfm-modal-card">' +
    '<div class="login-panel-head">' +
    '<div><b>Last.fm 服务与打卡设置</b><small>Scrobble & 推荐</small></div>' +
    '<button class="login-panel-close" type="button" onclick="closeLastFmSettingsModal()">×</button>' +
    '</div>' +
    '<div class="lastfm-modal-body">' +
    '<div id="lastfm-modal-status-badge" class="lastfm-modal-status-badge"></div>' +
    '<div class="lastfm-form-row">' +
    '<label>Last.fm 用户名</label>' +
    '<input id="lastfm-username-input" type="text" placeholder="例如: your_username" autocomplete="off" spellcheck="false">' +
    '</div>' +
    '<div class="lastfm-form-row">' +
    '<label>Session Key（授权密钥）</label>' +
    '<input id="lastfm-session-input" type="password" placeholder="填写你的 Last.fm Session Key" autocomplete="off" spellcheck="false">' +
    '</div>' +
    '<div class="lastfm-form-toggle-row">' +
    '<label><input id="lastfm-scrobble-toggle" type="checkbox" checked> 开启播放时自动 Scrobble 打卡</label>' +
    '</div>' +
    '<div class="lastfm-help-text">' +
    'Last.fm 是全球音乐记录社区。开启后，软件会在你听歌时自动打卡记录到你的个人听歌图谱，并可随时根据正在听的歌曲推荐相似风格音乐。' +
    '</div>' +
    '<div class="btn-row">' +
    '<button class="modal-btn" type="button" onclick="openLastFmWebAuth()">浏览器授权</button>' +
    '<button class="modal-btn primary" type="button" onclick="saveLastFmSettingsFromModal()">保存设置</button>' +
    '</div>' +
    '</div>' +
    '</div>';
  document.body.appendChild(shell);
}

// 页面加载完成后自动初始化 Last.fm
document.addEventListener('DOMContentLoaded', function () {
  setTimeout(initLastFmService, 350);
});
