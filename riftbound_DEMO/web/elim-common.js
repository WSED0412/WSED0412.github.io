/**
 * 符文戰場賽事系統 — 淘汰賽模式共通邏輯 (DATA-CONTRACT 第 7 節)
 * web/elim-common.js
 */

const ELIM_CONTRACT_VERSION = 1;

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
 * 淘汰賽資料輪詢與狀態監控器（包裝 common.js 的 createPoller）
 */
class ElimPoller {
  constructor({ onData, onError, interval = 5000, pauseInBackground = true }) {
    this.onData = onData;
    this.onError = onError;
    this.poller = createPoller({
      url: () => getDataSourceUrl(),
      interval,
      pauseInBackground,
      onData: (data, text, res) => {
        window.elimSnapshot = data;
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
      },
      onError: (err) => {
        if (this.onError) this.onError(err);
        const disScreen = document.getElementById('elimDisconnectedScreen');
        if (disScreen && !window.elimSnapshot) {
          disScreen.style.display = 'flex';
        }
      },
      onStale: (isStale) => {
        const el = document.getElementById('elimStaleWarning');
        if (el) {
          el.style.display = isStale ? 'block' : 'none';
        }
      }
    });
  }

  start() {
    this.poller.start();
  }

  stop() {
    this.poller.stop();
  }

  fetchOnce() {
    return this.poller.fetchOnce();
  }

  now() {
    return this.poller.now();
  }

  get serverOffsetMs() {
    return this.poller.serverOffsetMs;
  }

  set serverOffsetMs(v) {
    this.poller.serverOffsetMs = v;
  }

  get lastContentHash() {
    return this.poller.lastContentHash;
  }

  get lastChangeTime() {
    return this.poller.lastChangeTime;
  }

  checkStale() {
    this.poller.checkStale();
  }
}
