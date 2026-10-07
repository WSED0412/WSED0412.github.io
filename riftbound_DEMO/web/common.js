/**
 * 符文戰場賽事系統 — 前端共用模組 (web/common.js)
 * 遵守 DATA-CONTRACT 1.10, 1.17, 3.1 及 PROJECT.md 第 10 節規範
 */

/**
 * HTML 跳脫函式，防止 XSS
 * null 或 undefined 回傳空字串
 */
function escapeHtml(x) {
  if (x == null) return '';
  return String(x)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 台灣時間格式化 (Asia/Taipei HH:MM)
 * 未公布或無數值時回傳「待定」
 */
function formatTimeHHMM(ms) {
  if (!ms) return '待定';
  try {
    return new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date(ms));
  } catch (e) {
    const d = new Date(ms);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
}

/**
 * 共通 API 呼叫函式
 * - 來源位置只能來自 snapshot 的 event.api_base (null=不能送; ""=同網站)
 * - fetch 失敗時拋出固定中文錯誤「沒有送出：連不上主機，請確認網路後再按一次」
 * - HTTP 錯誤時拋出的 Error 物件保留 status, code, message, data (完整回應)
 * - 不自動重送
 */
async function callApi(path, body = {}, opts = {}) {
  let apiBase = '';
  if (opts && opts.api_base !== undefined) {
    apiBase = opts.api_base;
  } else {
    const snap = (opts && opts.snapshot) || window.snapshotData || window.elimSnapshot;
    if (snap && snap.event && snap.event.api_base !== undefined) {
      apiBase = snap.event.api_base;
    }
  }

  const payload = (body && typeof body === 'object') ? Object.assign({}, body) : (body || {});
  if (payload && typeof payload === 'object' && !('staff_pin' in payload) && window.staffPin) {
    payload.staff_pin = window.staffPin;
  }

  // 工作人員 API（/api/staff/, /api/admin/ 或帶有 staff_pin）走同網站主機，不受選手線上回報關閉（api_base === null）限制
  const isStaffApi = path.startsWith('/api/staff/') || path.startsWith('/api/admin/') || Boolean(payload && payload.staff_pin);
  if (apiBase === null && isStaffApi) {
    apiBase = '';
  }

  if (apiBase === null) {
    const err = new Error('目前無法送出：賽事未開放線上 API');
    err.code = 'no_api';
    throw err;
  }

  const url = apiBase + path;

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (netErr) {
    const err = new Error('沒有送出：連不上主機，請確認網路後再按一次');
    err.isNetwork = true;
    throw err;
  }

  let data;
  try {
    data = await res.json();
  } catch (parseErr) {
    const err = new Error('伺服器回應格式錯誤');
    err.status = res.status;
    throw err;
  }

  if (!res.ok || !data || data.ok === false) {
    const msg = (data && (data.message || data.detail || data.error))
      ? (data.message || data.detail || data.error)
      : `操作失敗 (HTTP ${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.code = data ? data.error : null;
    err.message = msg;
    err.data = data;
    if (data && typeof data === 'object') {
      for (const k of Object.keys(data)) {
        if (!(k in err)) {
          err[k] = data[k];
        }
      }
    }
    throw err;
  }

  return data;
}

/**
 * 資料輪詢與狀態監控器
 * - DATA-CONTRACT 1.10 時間換算 (Date 標頭; 示範模式只在第一次算)
 * - 內容指紋沒變就不呼叫 onData
 * - 90 秒沒新內容呼叫 onStale
 * - pauseInBackground (預設 true; clock, overlay, elim 大螢幕傳 false)
 * - 回前景立刻讀一次 (讀不到馬上算沒更新)
 * - poller.now() 回傳目前主機時間
 */
function createPoller(opts = {}) {
  const {
    url,
    onData,
    onError,
    onStale,
    onRaw,
    interval = 5000,
    pauseInBackground = true
  } = opts;

  let timer = null;
  let staleTimer = null;
  let lastContentHash = '';
  let lastChangeTime = Date.now();
  let serverOffsetMs = 0;
  let demoOffsetCalculated = false;
  let isRunning = false;

  function resolveUrl() {
    if (typeof url === 'function') return url();
    if (typeof url === 'string' && url) return url;
    const params = new URLSearchParams(window.location.search);
    const demo = params.get('demo');
    if (demo === '1') return '../sample/snapshot.sample.json';
    if (demo === 'break') return '../sample/snapshot.break.sample.json';
    if (demo === 'topcut') return '../sample/snapshot.topcut.sample.json';
    return '../snapshot.json';
  }

  function checkStale() {
    const isDemo = window.location.search.includes('demo=');
    if (isDemo) {
      if (typeof onStale === 'function') onStale(false, 0);
      const staleEl = document.getElementById('staleBanner');
      if (staleEl) staleEl.style.display = 'none';
      return;
    }
    const diffMs = Date.now() - lastChangeTime;
    const isStale = diffMs > 90000;
    const mins = Math.max(1, Math.floor(diffMs / 60000));
    if (typeof onStale === 'function') {
      onStale(isStale, mins);
    }
    const staleEl = document.getElementById('staleBanner');
    if (staleEl) {
      if (isStale && document.visibilityState !== 'hidden') {
        staleEl.textContent = `資料已 ${mins} 分鐘沒更新，請留意現場廣播`;
        staleEl.style.display = 'block';
      } else {
        staleEl.style.display = 'none';
      }
    }
  }

  async function fetchOnce() {
    const targetUrl = resolveUrl();
    const reqTime = Date.now();
    try {
      let res = await fetch(targetUrl, { cache: 'no-store' });
      if (!res.ok && targetUrl.startsWith('../')) {
        res = await fetch(targetUrl.replace(/^\.\.\//, '/'), { cache: 'no-store' });
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error('JSON 解析失敗');
      }

      // DATA-CONTRACT 1.10 時間換算
      const isDemo = window.location.search.includes('demo=');
      if (isDemo) {
        if (!demoOffsetCalculated && data && data.server_now) {
          serverOffsetMs = data.server_now - reqTime;
          demoOffsetCalculated = true;
        }
      } else {
        let dateHeaderMs = null;
        try {
          const dateHeader = res.headers.get('Date');
          if (dateHeader) {
            const t = new Date(dateHeader).getTime();
            if (!isNaN(t)) dateHeaderMs = t;
          }
        } catch (e) {}

        if (dateHeaderMs !== null) {
          serverOffsetMs = dateHeaderMs - reqTime;
        } else if (data && data.server_now) {
          serverOffsetMs = data.server_now - reqTime;
        }
      }

      if (typeof onRaw === 'function') {
        onRaw(res, text, data);
      }

      if (text !== lastContentHash) {
        lastContentHash = text;
        lastChangeTime = Date.now();
        checkStale();
        if (typeof onData === 'function') {
          onData(data, text, res);
        }
      }

      return data;
    } catch (err) {
      checkStale();
      if (typeof onError === 'function') {
        onError(err);
      }
      return null;
    }
  }

  function start() {
    isRunning = true;
    stop();
    fetchOnce();
    timer = setInterval(() => {
      if (!pauseInBackground || document.visibilityState !== 'hidden') {
        fetchOnce();
      }
    }, interval);

    if (!staleTimer) {
      staleTimer = setInterval(checkStale, 5000);
    }
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (isRunning) {
        fetchOnce().catch(() => {});
        if (pauseInBackground) {
          start();
        }
      }
    } else {
      if (pauseInBackground) {
        stop();
      }
    }
  });

  return {
    start,
    stop,
    fetchOnce,
    now: () => Date.now() + serverOffsetMs,
    get serverOffsetMs() { return serverOffsetMs; },
    set serverOffsetMs(v) { serverOffsetMs = v; },
    get lastContentHash() { return lastContentHash; },
    get lastChangeTime() { return lastChangeTime; },
    checkStale
  };
}

/**
 * 彈窗確認元件
 * - 回傳 Promise<boolean>
 * - 使用 DOM 遮罩（不呼叫 window.confirm）
 * - 按鈕 id 固定 confirmYes / confirmNo
 * - 文字一律使用 textContent 防止 XSS
 * - 360x640 視窗免捲動可見，按鈕高度 >= 44px
 * - 點擊後立即 disabled 防止連按
 */
function confirmDialog(opts = {}) {
  const title = (opts && opts.title != null) ? String(opts.title) : '確認';
  const message = (opts && opts.message != null) ? String(opts.message) : '';
  const yesText = (opts && opts.yes != null) ? String(opts.yes) : '確定';
  const noText = (opts && opts.no != null) ? String(opts.no) : '取消';

  return new Promise((resolve) => {
    let modal = document.getElementById('confirmModal');
    let titleEl = document.getElementById('confirmTitle');
    let msgEl = document.getElementById('confirmMessage');
    let yesBtn = document.getElementById('confirmYes');
    let noBtn = document.getElementById('confirmNo');

    if (!modal || !yesBtn || !noBtn) {
      if (modal) modal.remove();
      modal = document.createElement('div');
      modal.id = 'confirmModal';
      modal.className = 'modal-overlay';
      modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;padding:16px;z-index:99999;box-sizing:border-box;';
      modal.innerHTML = `
        <div class="modal-box" style="background:#0b1924;border:2px solid #ef4444;border-radius:12px;max-width:340px;width:100%;padding:16px;box-sizing:border-box;color:#fff;text-align:center;">
          <div id="confirmTitle" class="modal-title" style="font-size:1.1rem;font-weight:800;color:#f87171;margin-bottom:8px;"></div>
          <div id="confirmMessage" class="modal-msg" style="font-size:0.9rem;color:#e2e8f0;margin-bottom:14px;line-height:1.4;white-space:pre-line;"></div>
          <div class="modal-btns" style="display:flex;justify-content:center;gap:10px;">
            <button type="button" id="confirmYes" class="btn btn-danger" style="min-height:44px;min-width:80px;height:44px;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:700;font-size:0.9rem;background:#ef4444;color:#fff;border:none;box-sizing:border-box;"></button>
            <button type="button" id="confirmNo" class="btn btn-secondary" style="min-height:44px;min-width:80px;height:44px;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:700;font-size:0.9rem;background:#334155;color:#fff;border:none;box-sizing:border-box;"></button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      titleEl = document.getElementById('confirmTitle');
      msgEl = document.getElementById('confirmMessage');
      yesBtn = document.getElementById('confirmYes');
      noBtn = document.getElementById('confirmNo');
    }

    if (titleEl) titleEl.textContent = title;
    if (msgEl) {
      msgEl.style.whiteSpace = 'pre-line';
      msgEl.textContent = message;
    }
    if (yesBtn) {
      yesBtn.textContent = yesText;
      yesBtn.disabled = false;
      yesBtn.style.minHeight = '44px';
    }
    if (noBtn) {
      noBtn.textContent = noText;
      noBtn.disabled = false;
      noBtn.style.minHeight = '44px';
    }

    modal.style.display = 'flex';

    yesBtn.onclick = () => {
      yesBtn.disabled = true;
      if (noBtn) noBtn.disabled = true;
      modal.style.display = 'none';
      yesBtn.onclick = null;
      if (noBtn) noBtn.onclick = null;
      resolve(true);
    };

    noBtn.onclick = () => {
      yesBtn.disabled = true;
      noBtn.disabled = true;
      modal.style.display = 'none';
      yesBtn.onclick = null;
      noBtn.onclick = null;
      resolve(false);
    };
  });
}
