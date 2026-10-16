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
  if (lastFmAuthPollingTimer) {
    clearInterval(lastFmAuthPollingTimer);
    lastFmAuthPollingTimer = null;
  }
  var modal = document.getElementById('lastfm-settings-modal');
  if (modal && typeof closeGsapModal === 'function') closeGsapModal(modal);
}

var lastFmAuthPollingTimer = null;
var lastFmCurrentAuthToken = '';
var lastFmAuthStage = 'idle';

function updateLastFmModalUi() {
  var cfg = lastFmState.config || {};
  var userInp = document.getElementById('lastfm-username-input');
  var keyInp = document.getElementById('lastfm-session-input');
  var apiKeyInp = document.getElementById('lastfm-apikey-input');
  var secretInp = document.getElementById('lastfm-apisecret-input');
  var scrobbleCheck = document.getElementById('lastfm-scrobble-toggle');
  var statusBadge = document.getElementById('lastfm-modal-status-badge');
  var authBtn = document.getElementById('lastfm-auth-main-btn');
  var unlinkBtn = document.getElementById('lastfm-unlink-btn');
  var subAction = document.getElementById('lastfm-auth-sub-action');

  if (userInp) userInp.value = cfg.username || '';
  if (keyInp) keyInp.value = cfg.sessionKey || '';
  if (apiKeyInp) apiKeyInp.value = cfg.apiKey || '';
  if (secretInp) secretInp.value = cfg.apiSecret || '';
  if (scrobbleCheck) scrobbleCheck.checked = cfg.scrobbleEnabled !== false;

  var isConnected = !!(cfg.hasSession && cfg.username);
  if (statusBadge) {
    if (isConnected) {
      statusBadge.innerHTML = '<span class="status-dot green"></span>已绑定账号：<b>' + escHtml(cfg.username) + '</b>（听歌将自动打卡）';
      statusBadge.className = 'lastfm-modal-status-badge connected';
    } else if (lastFmAuthStage === 'verifying') {
      statusBadge.innerHTML = '<span class="status-dot pulsing"></span>已打开浏览器，请在网页允许后点击下方检查…';
      statusBadge.className = 'lastfm-modal-status-badge verifying';
    } else {
      statusBadge.innerHTML = '<span class="status-dot gray"></span>未绑定账号，点击下方按钮前往授权';
      statusBadge.className = 'lastfm-modal-status-badge';
    }
  }

  if (authBtn) {
    if (isConnected) {
      authBtn.innerHTML = '<span>🔄 重新授权或切换账号</span>';
      authBtn.className = 'modal-btn full-width';
    } else if (lastFmAuthStage === 'verifying') {
      authBtn.innerHTML = '<span>⚡ 检查授权状态</span>';
      authBtn.className = 'modal-btn primary full-width';
    } else {
      authBtn.innerHTML = '<span>🌐 浏览器一键授权</span>';
      authBtn.className = 'modal-btn primary full-width';
    }
  }

  if (subAction) {
    subAction.style.display = (!isConnected && lastFmAuthStage === 'verifying') ? 'block' : 'none';
  }

  if (unlinkBtn) {
    unlinkBtn.style.display = isConnected ? 'inline-flex' : 'none';
  }
}

async function unlinkLastFmAccount() {
  var api = window.desktopWindow;
  if (!api || typeof api.saveLastFmConfig !== 'function') return;
  try {
    var res = await api.saveLastFmConfig({ username: '', sessionKey: '', hasSession: false });
    if (res && res.ok) {
      lastFmState.config.username = '';
      lastFmState.config.sessionKey = '';
      lastFmState.config.hasSession = false;
      updateHomeLastFmStatus();
      updateLastFmModalUi();
      if (typeof showToast === 'function') showToast('已解除 Last.fm 账号绑定');
    }
  } catch (e) {
    if (typeof showToast === 'function') showToast('解绑失败: ' + e.message);
  }
}

async function saveLastFmSettingsFromModal() {
  var userInp = document.getElementById('lastfm-username-input');
  var keyInp = document.getElementById('lastfm-session-input');
  var apiKeyInp = document.getElementById('lastfm-apikey-input');
  var secretInp = document.getElementById('lastfm-apisecret-input');
  var scrobbleCheck = document.getElementById('lastfm-scrobble-toggle');
  var api = window.desktopWindow;
  if (!api || typeof api.saveLastFmConfig !== 'function') return;

  var newConfig = {
    username: userInp ? userInp.value.trim() : '',
    sessionKey: keyInp ? keyInp.value.trim() : '',
    apiKey: apiKeyInp && apiKeyInp.value.trim() ? apiKeyInp.value.trim() : undefined,
    apiSecret: secretInp && secretInp.value.trim() ? secretInp.value.trim() : undefined,
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

async function handleLastFmAuthButtonClick() {
  if (lastFmAuthStage === 'verifying') {
    await checkLastFmAuthStatus(true);
  } else {
    await startLastFmAuthFlow();
  }
}

async function reopenLastFmAuthPage() {
  lastFmAuthStage = 'idle';
  await startLastFmAuthFlow();
}

async function checkLastFmAuthStatus(manualClick) {
  var api = window.desktopWindow;
  var authBtn = document.getElementById('lastfm-auth-main-btn');
  var statusBadge = document.getElementById('lastfm-modal-status-badge');

  if (!api || typeof api.lastFmCheckAuth !== 'function') {
    if (manualClick && typeof showToast === 'function') showToast('桌面端接口未就绪');
    return false;
  }

  if (manualClick && authBtn) {
    authBtn.innerHTML = '<span>⏳ 正在核对网页授权…</span>';
  }

  try {
    var checkRes = await api.lastFmCheckAuth(lastFmCurrentAuthToken);
    if (checkRes && checkRes.ok && checkRes.sessionKey) {
      if (lastFmAuthPollingTimer) { clearInterval(lastFmAuthPollingTimer); lastFmAuthPollingTimer = null; }
      lastFmCurrentAuthToken = '';
      lastFmAuthStage = 'idle';
      lastFmState.config = Object.assign({}, lastFmState.config, {
        username: checkRes.username,
        sessionKey: checkRes.sessionKey,
        hasSession: true,
        enabled: true,
      });
      updateHomeLastFmStatus();
      updateLastFmModalUi();
      if (typeof showToast === 'function') showToast('🎉 Last.fm 账号已成功绑定：' + checkRes.username + '！');
      setTimeout(closeLastFmSettingsModal, 900);
      return true;
    } else {
      if (manualClick) {
        if (authBtn) authBtn.innerHTML = '<span>⚡ 检查授权状态</span>';
        if (statusBadge) {
          statusBadge.innerHTML = '<span class="status-dot pulsing"></span>网页尚未确认授权，请在网页允许后再次检查';
          statusBadge.className = 'lastfm-modal-status-badge verifying';
        }
        if (typeof showToast === 'function') showToast('网页端尚未完成授权，请在浏览器点击允许后再检查');
      }
      return false;
    }
  } catch (err) {
    if (manualClick) {
      if (authBtn) authBtn.innerHTML = '<span>⚡ 检查授权状态</span>';
      if (typeof showToast === 'function') showToast('检查授权失败: ' + err.message);
    }
    return false;
  }
}

async function startLastFmAuthFlow() {
  var api = window.desktopWindow;
  var authBtn = document.getElementById('lastfm-auth-main-btn');
  var statusBadge = document.getElementById('lastfm-modal-status-badge');

  var apiKeyInp = document.getElementById('lastfm-apikey-input');
  var secretInp = document.getElementById('lastfm-apisecret-input');
  if (api && typeof api.saveLastFmConfig === 'function' && ((apiKeyInp && apiKeyInp.value.trim()) || (secretInp && secretInp.value.trim()))) {
    await api.saveLastFmConfig({
      apiKey: apiKeyInp && apiKeyInp.value.trim() ? apiKeyInp.value.trim() : undefined,
      apiSecret: secretInp && secretInp.value.trim() ? secretInp.value.trim() : undefined,
    });
  }

  if (authBtn) authBtn.innerHTML = '<span>⏳ 正在唤起授权页面…</span>';

  var fallbackAuthUrl = 'https://www.last.fm/api/auth/?api_key=b25b959554ed76058ac220b7b2e0a026';
  var token = '';

  try {
    if (api && typeof api.lastFmStartAuth === 'function') {
      var startRes = await api.lastFmStartAuth();
      if (startRes && startRes.ok) {
        token = startRes.token || '';
        lastFmCurrentAuthToken = token;
      }
    } else if (api && typeof api.lastFmOpenAuth === 'function') {
      var openRes = await api.lastFmOpenAuth();
      if (openRes && openRes.ok) {
        token = openRes.token || '';
        lastFmCurrentAuthToken = token;
      }
    } else {
      window.open(fallbackAuthUrl, '_blank');
      if (typeof showToast === 'function') showToast('已在浏览器打开 Last.fm 授权页');
    }

    lastFmAuthStage = 'verifying';
    updateLastFmModalUi();

    if (typeof showToast === 'function') {
      showToast('已在浏览器打开 Last.fm 授权页，确认后返回点击“检查授权状态”');
    }

    // 开启自动轮询验证
    if (api && typeof api.lastFmCheckAuth === 'function') {
      if (lastFmAuthPollingTimer) clearInterval(lastFmAuthPollingTimer);
      var attempts = 0;
      lastFmAuthPollingTimer = setInterval(async function () {
        attempts++;
        if (attempts > 60 || lastFmAuthStage !== 'verifying') {
          if (lastFmAuthPollingTimer) { clearInterval(lastFmAuthPollingTimer); lastFmAuthPollingTimer = null; }
          return;
        }
        await checkLastFmAuthStatus(false);
      }, 2500);
    }
  } catch (err) {
    if (typeof showToast === 'function') showToast('启动授权失败: ' + err.message);
    lastFmAuthStage = 'idle';
    updateLastFmModalUi();
  }
}

function openLastFmWebAuth() {
  return handleLastFmAuthButtonClick();
}

function createLastFmSettingsModal() {
  var shell = document.createElement('div');
  shell.id = 'lastfm-settings-modal';
  shell.className = 'modal-mask lastfm-settings-modal';
  shell.innerHTML = '<div class="modal lastfm-modal-card">' +
    '<div class="lastfm-modal-head">' +
      '<div class="lastfm-modal-title-wrap">' +
        '<span class="home-insight-kicker">LAST.FM · 音乐社区</span>' +
        '<h3 class="lastfm-modal-title">服务与授权设置</h3>' +
      '</div>' +
      '<button class="modal-close-btn lastfm-modal-close-btn" type="button" onclick="closeLastFmSettingsModal()" title="关闭" aria-label="关闭">' +
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' +
      '</button>' +
    '</div>' +
    '<div class="lastfm-modal-body">' +
      '<div id="lastfm-modal-status-badge" class="lastfm-modal-status-badge"></div>' +
      '<div class="lastfm-auth-action-area">' +
        '<p class="lastfm-desc-text">绑定后听歌将自动打卡记录到你的个人听歌图谱，并可随时根据正在播放的歌曲匹配全球相似音乐风格。</p>' +
        '<div class="lastfm-primary-action-wrap">' +
          '<button id="lastfm-auth-main-btn" class="modal-btn primary full-width" type="button" onclick="handleLastFmAuthButtonClick()">' +
            '<span>🌐 浏览器一键授权</span>' +
          '</button>' +
          '<div id="lastfm-auth-sub-action" style="display:none;margin-top:10px;text-align:center">' +
            '<button type="button" onclick="reopenLastFmAuthPage()" style="background:none;border:none;color:rgba(255,255,255,0.48);font-size:12px;cursor:pointer;text-decoration:underline">未弹出网页？点击重新打开授权页</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="lastfm-form-toggle-row">' +
        '<label><input id="lastfm-scrobble-toggle" type="checkbox" checked> 开启播放时自动 Scrobble 打卡</label>' +
      '</div>' +
      '<details class="lastfm-advanced-fold">' +
        '<summary>高级：自定义 API 密钥与 Session Key</summary>' +
        '<div class="lastfm-fold-content">' +
          '<div class="lastfm-form-row">' +
            '<label>API Key</label>' +
            '<input id="lastfm-apikey-input" type="text" placeholder="留空使用默认 Key 或填自定义 API Key" autocomplete="off" spellcheck="false">' +
          '</div>' +
          '<div class="lastfm-form-row">' +
            '<label>Shared Secret</label>' +
            '<input id="lastfm-apisecret-input" type="password" placeholder="填写对应的 Shared Secret" autocomplete="off" spellcheck="false">' +
          '</div>' +
          '<div class="lastfm-form-row">' +
            '<label>Last.fm 用户名</label>' +
            '<input id="lastfm-username-input" type="text" placeholder="例如: your_username" autocomplete="off" spellcheck="false">' +
          '</div>' +
          '<div class="lastfm-form-row">' +
            '<label>Session Key</label>' +
            '<input id="lastfm-session-input" type="password" placeholder="填写或直接粘贴 Session Key（若已有）" autocomplete="off" spellcheck="false">' +
          '</div>' +
          '<div class="lastfm-form-hint" style="margin-top:8px;font-size:12px">' +
            '<a href="https://www.last.fm/api/account/create" target="_blank" onclick="window.desktopWindow && window.desktopWindow.openExternalUrl ? (window.desktopWindow.openExternalUrl(\'https://www.last.fm/api/account/create\'), event.preventDefault()) : null" style="color:var(--champagne);text-decoration:none">🔗 免费申请 Last.fm API Key (秒级下发)</a>' +
          '</div>' +
        '</div>' +
      '</details>' +
      '<div class="lastfm-btn-row">' +
        '<button id="lastfm-unlink-btn" class="modal-btn danger" type="button" onclick="unlinkLastFmAccount()" style="display:none">解除绑定</button>' +
        '<button class="modal-btn" type="button" onclick="saveLastFmSettingsFromModal()">保存设置</button>' +
      '</div>' +
    '</div>' +
  '</div>';
  document.body.appendChild(shell);
}

// 页面加载完成后自动初始化 Last.fm
document.addEventListener('DOMContentLoaded', function () {
  setTimeout(initLastFmService, 350);
});
