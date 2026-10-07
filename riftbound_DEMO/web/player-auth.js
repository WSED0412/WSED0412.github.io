/**
 * 符文戰場賽事系統 — 選手登入與驗證共用模組 (web/player-auth.js)
 * 遵守 DATA-CONTRACT 3.1, 3.2 規範
 */

(function (window) {
  'use strict';

  const STORAGE_KEY = 'riftbound_player_auth';
  const LEGACY_STORAGE_KEY = 'elim_player_auth';

  function readStoredAuth() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        // 舊 key (elim_player_auth) 相容處理：若舊 key 有值，搬到新 key 並刪除舊 key
        const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacyRaw) {
          try {
            const legacyParsed = JSON.parse(legacyRaw);
            if (legacyParsed && legacyParsed.player_id && legacyParsed.pin) {
              localStorage.setItem(STORAGE_KEY, legacyRaw);
              localStorage.removeItem(LEGACY_STORAGE_KEY);
              return {
                player_id: String(legacyParsed.player_id).trim(),
                pin: String(legacyParsed.pin).trim()
              };
            }
          } catch (legacyErr) {
            console.error('[PlayerAuth] 舊版 elim_player_auth 解析失敗:', legacyErr);
            try {
              localStorage.removeItem(LEGACY_STORAGE_KEY);
            } catch (rmErr) {
              console.error('[PlayerAuth] 刪除舊版 key 失敗:', rmErr);
            }
          }
        }
        return null;
      }
      const parsed = JSON.parse(raw);
      if (parsed && parsed.player_id && parsed.pin) {
        return {
          player_id: String(parsed.player_id).trim(),
          pin: String(parsed.pin).trim()
        };
      }
      return null;
    } catch (err) {
      console.error('[PlayerAuth] 讀取 localStorage 失敗:', err);
      return null;
    }
  }

  function writeStoredAuth(auth) {
    try {
      if (!auth || !auth.player_id || !auth.pin) {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        return;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        player_id: String(auth.player_id).trim(),
        pin: String(auth.pin).trim()
      }));
      try {
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      } catch (rmErr) {
        console.error('[PlayerAuth] 清理舊版 key 失敗:', rmErr);
      }
    } catch (err) {
      console.error('[PlayerAuth] 寫入 localStorage 失敗:', err);
    }
  }

  function clearStoredAuth() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch (err) {
      console.error('[PlayerAuth] 清除 localStorage 失敗:', err);
    }
  }

  const PlayerAuth = {
    /**
     * 鎖定提示文字格式化
     * @param {number} secondsLeft 剩餘秒數
     * @returns {string} 提示文字
     */
    lockText: function (secondsLeft) {
      const totalSec = Math.max(0, Math.ceil(Number(secondsLeft) || 0));
      if (totalSec <= 0) {
        return '登入鎖定已解除，可以再次嘗試';
      }
      const mins = Math.floor(totalSec / 60);
      const secs = totalSec % 60;
      let timeStr = '';
      if (mins > 0 && secs > 0) {
        timeStr = `${mins} 分 ${secs} 秒`;
      } else if (mins > 0) {
        timeStr = `${mins} 分鐘`;
      } else {
        timeStr = `${secs} 秒`;
      }
      return `登入錯誤太多次，已暫時鎖住，${timeStr}後可以再試`;
    },

    /**
     * 倒數計時輔助函式（鎖定期間絕不自動重送）
     * @param {number} secondsLeft 剩餘秒數
     * @param {Function} onTick 每秒回呼 (secondsLeft)
     * @param {Function} onDone 倒數完成回呼 ()
     * @returns {{ stop: Function }}
     */
    startCountdown: function (secondsLeft, onTick, onDone) {
      let remaining = Math.max(0, Math.ceil(Number(secondsLeft) || 0));
      if (typeof onTick === 'function') {
        try {
          onTick(remaining);
        } catch (e) {
          console.error('[PlayerAuth] startCountdown onTick 例外:', e);
        }
      }
      if (remaining <= 0) {
        if (typeof onDone === 'function') {
          try {
            onDone();
          } catch (e) {
            console.error('[PlayerAuth] startCountdown onDone 例外:', e);
          }
        }
        return { stop: function () {} };
      }

      const timerId = setInterval(function () {
        remaining -= 1;
        if (remaining > 0) {
          if (typeof onTick === 'function') {
            try {
              onTick(remaining);
            } catch (e) {
              console.error('[PlayerAuth] startCountdown onTick 例外:', e);
            }
          }
        } else {
          clearInterval(timerId);
          if (typeof onTick === 'function') {
            try {
              onTick(0);
            } catch (e) {
              console.error('[PlayerAuth] startCountdown onTick 例外:', e);
            }
          }
          if (typeof onDone === 'function') {
            try {
              onDone();
            } catch (e) {
              console.error('[PlayerAuth] startCountdown onDone 例外:', e);
            }
          }
        }
      }, 1000);

      return {
        stop: function () {
          clearInterval(timerId);
        }
      };
    },

    /**
     * 建立 PlayerAuth 驗證物件
     * @param {Object} options
     * @param {Function} options.post post(path, body) 送出函式
     * @param {Function} options.onLogin onLogin(me, { auto }) 登入回呼
     * @param {Function} options.onLogout onLogout() 登出回呼
     * @param {Function} [options.now] now() 時間函式
     * @returns {Object} auth 實例
     */
    create: function (options) {
      const opts = options || {};
      const post = opts.post;
      const onLogin = opts.onLogin;
      const onLogout = opts.onLogout;

      if (typeof post !== 'function') {
        console.error('[PlayerAuth] 建立失敗: 缺少 post 函式');
        throw new Error('PlayerAuth.create 需要提供 post(path, body) 函式');
      }

      let currentAuth = null;
      let currentMe = null;

      async function restore() {
        const saved = readStoredAuth();
        if (!saved) {
          return null;
        }

        try {
          const me = await post('/api/player/me', {
            player_id: saved.player_id,
            pin: saved.pin
          });
          currentAuth = { player_id: saved.player_id, pin: saved.pin };
          currentMe = me;
          if (typeof onLogin === 'function') {
            try {
              onLogin(me, { auto: true });
            } catch (loginCbErr) {
              console.error('[PlayerAuth] onLogin 回呼執行失敗:', loginCbErr);
            }
          }
          return me;
        } catch (err) {
          console.error('[PlayerAuth] restore 驗證失敗:', err);
          if (err && err.status === 401) {
            clearStoredAuth();
            currentAuth = null;
            currentMe = null;
            if (typeof onLogout === 'function') {
              try {
                onLogout();
              } catch (logoutCbErr) {
                console.error('[PlayerAuth] onLogout 回呼執行失敗:', logoutCbErr);
              }
            }
          }
          // 連不上主機、5xx 等錯誤：不清掉記住的資料、也不登入（維持現狀）
          return null;
        }
      }

      async function login(id, pin) {
        const cleanId = String(id || '').trim();
        const cleanPin = String(pin || '').trim();
        if (!cleanId || !cleanPin) {
          const err = new Error('請輸入選手編號與 PIN 碼');
          err.status = 400;
          err.code = 'bad_request';
          console.error('[PlayerAuth] login 驗證失敗: 缺少編號或 PIN');
          throw err;
        }

        try {
          const me = await post('/api/player/me', {
            player_id: cleanId,
            pin: cleanPin
          });
          currentAuth = { player_id: cleanId, pin: cleanPin };
          currentMe = me;
          writeStoredAuth(currentAuth);
          if (typeof onLogin === 'function') {
            try {
              onLogin(me, { auto: false });
            } catch (loginCbErr) {
              console.error('[PlayerAuth] onLogin 回呼執行失敗:', loginCbErr);
            }
          }
          return me;
        } catch (err) {
          console.error('[PlayerAuth] login 驗證失敗:', err);
          if (err && typeof err === 'object') {
            const rawSec = err.retryAfterSec != null
              ? err.retryAfterSec
              : (err.retry_after_sec != null ? err.retry_after_sec : (err.data && err.data.retry_after_sec));
            if (rawSec != null) {
              const num = Number(rawSec);
              err.retryAfterSec = isNaN(num) ? 0 : num;
              err.retry_after_sec = err.retryAfterSec;
            }
          }
          throw err;
        }
      }

      function logout() {
        clearStoredAuth();
        currentAuth = null;
        currentMe = null;
        if (typeof onLogout === 'function') {
          try {
            onLogout();
          } catch (logoutCbErr) {
            console.error('[PlayerAuth] onLogout 回呼執行失敗:', logoutCbErr);
          }
        }
      }

      function get() {
        if (!currentAuth) return null;
        return {
          player_id: currentAuth.player_id,
          pin: currentAuth.pin
        };
      }

      function me() {
        return currentMe;
      }

      function setMe(newMe) {
        currentMe = newMe;
      }

      function handleStorage(e) {
        try {
          if (e.key === STORAGE_KEY || e.key === LEGACY_STORAGE_KEY) {
            const newVal = e.newValue;
            if (!newVal) {
              // 別的分頁登出（key 被刪除）
              if (currentAuth) {
                currentAuth = null;
                currentMe = null;
                if (typeof onLogout === 'function') {
                  try {
                    onLogout();
                  } catch (cbErr) {
                    console.error('[PlayerAuth] 跨分頁登出 onLogout 失敗:', cbErr);
                  }
                }
              }
            } else {
              // 別的分頁換人或登入（內容變動）
              let parsed = null;
              try {
                parsed = JSON.parse(newVal);
              } catch (jsonErr) {
                console.error('[PlayerAuth] storage 事件 JSON 解析失敗:', jsonErr);
              }
              if (parsed && parsed.player_id && parsed.pin) {
                const newId = String(parsed.player_id).trim();
                const newPin = String(parsed.pin).trim();
                if (!currentAuth || currentAuth.player_id !== newId || currentAuth.pin !== newPin) {
                  restore().catch(function (restoreErr) {
                    console.error('[PlayerAuth] 跨分頁換人 restore 失敗:', restoreErr);
                  });
                }
              }
            }
          }
        } catch (storageErr) {
          console.error('[PlayerAuth] storage 事件處理異常:', storageErr);
        }
      }

      window.addEventListener('storage', handleStorage);

      return {
        restore: restore,
        login: login,
        logout: logout,
        get: get,
        me: me,
        setMe: setMe,
        destroy: function () {
          window.removeEventListener('storage', handleStorage);
        }
      };
    }
  };

  window.PlayerAuth = PlayerAuth;
})(window);
