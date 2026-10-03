/**
 * 符文戰場賽事系統 — 淘汰賽模式共通邏輯 (DATA-CONTRACT 第 7 節)
 * web/elim-common.js
 */

const ELIM_CONTRACT_VERSION = 1;

/**
 * HTML 跳脫函式，防止 XSS
 */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 取得淘汰賽 snapshot 資料網址 (DATA-CONTRACT 7.0 / 1.10)
 */
function getDataSourceUrl() {
  const params = new URLSearchParams(window.location.search);
  const demo = params.get('demo');
  if (demo === '1') {
    return '../sample/elim.sample.json';
  } else if (demo === 'done') {
    return '../sample/elim.done.sample.json';
  } else if (demo === 'finals') {
    return '../sample/elim.finals.sample.json';
  } else if (demo === 'finalsdone' || demo === 'finals.done') {
    return '../sample/elim.finals.done.sample.json';
  } else if (demo === 'checkin') {
    return '../sample/elim.checkin.sample.json';
  }
  return '../snapshot.json';
}

/**
 * 共通 API 呼叫函式
 * 斷網時拋出「沒有送出：連不上主機，請確認網路後再按一次」
 */
async function callApi(endpoint, body = {}) {
  let apiBase = '';
  if (window.elimSnapshot && window.elimSnapshot.event && typeof window.elimSnapshot.event.api_base === 'string') {
    apiBase = window.elimSnapshot.event.api_base;
  }
  const url = apiBase + endpoint;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
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
    throw new Error('伺服器回應格式錯誤');
  }

  if (!res.ok) {
    const msg = (data && data.message) ? data.message : `請求失敗 (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/**
 * 逐分勝利方式中文名稱對照 (DATA-CONTRACT 7.3)
 */
const POINT_TYPE_NAMES = {
  xtreme: '極限',
  over: '擊飛',
  burst: '爆裂',
  spin: '迴轉'
};

function getPointTypeName(type) {
  return POINT_TYPE_NAMES[type] || type || '';
}

/**
 * 時間格式化 (Asia/Taipei HH:MM)
 */
function formatTimeHHMM(ms) {
  if (!ms) return '--:--';
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
 * 淘汰賽資料輪詢與狀態監控器
 */
class ElimPoller {
  constructor({ onData, onError, interval = 5000 }) {
    this.onData = onData;
    this.onError = onError;
    this.interval = interval;
    this.timer = null;
    this.staleTimer = null;
    this.lastContentHash = '';
    this.lastChangeTime = Date.now();
    this.serverOffsetMs = 0;

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.fetchOnce();
        this.start();
      } else {
        this.stop();
      }
    });
  }

  start() {
    this.stop();
    this.timer = setInterval(() => {
      if (document.visibilityState !== 'hidden') {
        this.fetchOnce();
      }
    }, this.interval);

    if (!this.staleTimer) {
      this.staleTimer = setInterval(() => {
        this.checkStale();
      }, 5000);
    }
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  checkStale() {
    const isStale = (Date.now() - this.lastChangeTime) > 90000;
    const el = document.getElementById('elimStaleWarning');
    if (el) {
      el.style.display = isStale ? 'block' : 'none';
    }
  }

  async fetchOnce() {
    const url = getDataSourceUrl();
    try {
      const reqTime = Date.now();
      let res = await fetch(url, { cache: 'no-store' });
      if (!res.ok && url.startsWith('../')) {
        res = await fetch(url.replace(/^\.\.\//, '/'), { cache: 'no-store' });
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const dateHeader = res.headers.get('Date');
      if (dateHeader && !window.location.search.includes('demo=')) {
        const serverDate = new Date(dateHeader).getTime();
        if (!isNaN(serverDate)) {
          this.serverOffsetMs = serverDate - reqTime;
        }
      }

      const text = await res.text();
      const data = JSON.parse(text);
      window.elimSnapshot = data;

      if (text !== this.lastContentHash) {
        this.lastContentHash = text;
        this.lastChangeTime = Date.now();
        this.checkStale();
      }

      const dcWarn = document.getElementById('elimContractWarning');
      if (dcWarn) {
        if (data.contract_version && data.contract_version > ELIM_CONTRACT_VERSION) {
          dcWarn.style.display = 'block';
        } else {
          dcWarn.style.display = 'none';
        }
      }

      const disScreen = document.getElementById('elimDisconnectedScreen');
      if (disScreen) {
        disScreen.style.display = 'none';
      }

      if (this.onData) this.onData(data);
    } catch (err) {
      if (this.onError) this.onError(err);
      const disScreen = document.getElementById('elimDisconnectedScreen');
      if (disScreen && !window.elimSnapshot) {
        disScreen.style.display = 'flex';
      }
    }
  }
}
