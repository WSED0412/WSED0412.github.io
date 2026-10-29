/**
 * 符文戰場賽事系統 — 選手對戰紀錄共用模組 (web/match-history.js)
 * 遵守 DATA-CONTRACT-SHARED 10.18 與前端硬性規定
 * 提供 MatchHistory.render(container, pid, opts)
 */
(function (root) {
  'use strict';

  function ensureStyle() {
    if (document.getElementById('matchHistoryStyle')) return;
    const style = document.createElement('style');
    style.id = 'matchHistoryStyle';
    style.textContent = `
      .mh-box {
        background: var(--input-bg, #011A24);
        border: 1px solid var(--card-border, #0A5570);
        border-radius: var(--radius-md, 6px);
        padding: 10px 12px;
        box-sizing: border-box;
        width: 100%;
        max-width: 100%;
        overflow-x: hidden;
      }
      .mh-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 8px;
        padding-bottom: 6px;
        border-bottom: 1px solid var(--card-border, #0A5570);
      }
      .mh-title {
        font-size: var(--fs-base, 1rem);
        font-weight: 800;
        color: var(--text-primary, #F9F9F9);
      }
      .mh-summary {
        font-size: var(--fs-sm, 0.875rem);
        font-weight: 700;
        color: var(--accent-text, #FF941E);
      }
      .mh-empty {
        text-align: center;
        padding: 12px;
        color: var(--text-secondary, #9FB8C4);
        font-size: var(--fs-sm, 0.875rem);
      }
      .mh-error {
        text-align: center;
        padding: 10px;
        color: var(--danger-text, #ED807A);
        font-size: var(--fs-sm, 0.875rem);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
      }
      .mh-retry-btn {
        min-height: 44px;
        min-width: 44px;
        padding: 8px 16px;
        background: var(--chip-bg, #0A4A63);
        color: var(--text-primary, #F9F9F9);
        border: 1px solid var(--card-border, #0A5570);
        border-radius: var(--radius-md, 6px);
        cursor: pointer;
        font-size: var(--fs-sm, 0.875rem);
        font-weight: 700;
        box-sizing: border-box;
      }
      .mh-retry-btn:active {
        background: var(--card-border, #0A5570);
      }
      .mh-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        width: 100%;
        max-width: 100%;
      }
      .mh-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        padding: 6px 8px;
        border-radius: var(--radius-md, 6px);
        background: var(--card-bg, #013951);
        border: 1px solid var(--card-border, #0A5570);
        box-sizing: border-box;
        font-size: var(--fs-sm, 0.875rem);
        width: 100%;
        max-width: 100%;
        overflow: hidden;
      }
      .mh-row-left {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        flex: 1;
        overflow: hidden;
      }
      .mh-label {
        font-weight: 700;
        color: var(--text-secondary, #9FB8C4);
        white-space: nowrap;
        flex-shrink: 0;
        font-size: var(--fs-xs, 0.75rem);
      }
      .mh-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 2px 5px;
        border-radius: var(--radius-sm, 4px);
        font-size: var(--fs-xs, 0.75rem);
        font-weight: 800;
        white-space: nowrap;
        flex-shrink: 0;
        line-height: 1.2;
      }
      .mh-badge-win {
        background: var(--success-bg, #0A3F33);
        color: var(--success-text, #2FB574);
        border: 1px solid var(--success-border, #1F7A55);
      }
      .mh-badge-loss {
        background: var(--danger-bg, #4A1F1C);
        color: var(--danger-text, #ED807A);
        border: 1px solid var(--danger-border, #A8443C);
      }
      .mh-badge-draw {
        background: var(--warning-bg, #3E3312);
        color: var(--warning-text, #F2C94C);
        border: 1px solid var(--warning-border, #8A6D1F);
      }
      .mh-badge-bye {
        background: var(--info-bg, #1B2F4A);
        color: var(--info-text, #4FA8D8);
        border: 1px solid var(--info-border, #2F5A80);
      }
      .mh-badge-double_loss {
        background: var(--danger-bg, #4A1F1C);
        color: var(--danger-text, #ED807A);
        border: 1px solid var(--danger-border, #A8443C);
      }
      .mh-badge-unknown {
        background: var(--chip-bg, #0A4A63);
        color: var(--text-secondary, #9FB8C4);
        border: 1px solid var(--card-border, #0A5570);
      }
      .mh-opp-wrap {
        min-width: 0;
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .mh-opp-btn {
        background: none;
        border: none;
        padding: 0;
        margin: 0;
        font: inherit;
        color: var(--accent-text, #FF941E);
        text-decoration: underline;
        cursor: pointer;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        min-height: 44px;
        display: inline-flex;
        align-items: center;
        max-width: 100%;
        box-sizing: border-box;
      }
      .mh-opp-btn:active {
        color: var(--accent, #EF7D00);
      }
      .mh-opp-text {
        color: var(--text-primary, #F9F9F9);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        display: inline-block;
        max-width: 100%;
      }
      .mh-score {
        font-weight: 800;
        color: var(--text-primary, #F9F9F9);
        white-space: nowrap;
        flex-shrink: 0;
        text-align: right;
        font-size: var(--fs-sm, 0.875rem);
        margin-left: 4px;
      }
    `;
    document.head.appendChild(style);
  }

  const OUTCOME_CONFIG = {
    win: { text: '勝', className: 'mh-badge-win' },
    loss: { text: '敗', className: 'mh-badge-loss' },
    draw: { text: '和', className: 'mh-badge-draw' },
    bye: { text: '輪空', className: 'mh-badge-bye' },
    double_loss: { text: '雙方判負', className: 'mh-badge-double_loss' }
  };

  function getEscapeHtml() {
    if (typeof root.escapeHtml === 'function') {
      return root.escapeHtml;
    }
    return function (str) {
      if (str == null) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };
  }

  const HISTORY_CACHE = {};
  const HISTORY_CACHE_MS = 10000;

  async function render(container, pid, opts = {}) {
    const el = (typeof container === 'string') ? document.getElementById(container) : container;
    if (!el) return;

    // 離線舊資料狀態 (data-offline="true") 不顯示、不報錯 (DATA-CONTRACT 10.18, 1.17)
    if (document.body && document.body.getAttribute('data-offline') === 'true') {
      el.innerHTML = '';
      el.style.display = 'none';
      return;
    }

    // 示範模式 (?demo=) 安靜略過，不報錯 (DATA-CONTRACT 10.18)
    const isDemo = Boolean(window.location && window.location.search && window.location.search.includes('demo='));
    if (isDemo) {
      el.innerHTML = '';
      el.style.display = 'none';
      return;
    }

    // 無選手編號安靜略過
    if (!pid || typeof pid !== 'string' || !pid.trim()) {
      el.innerHTML = '';
      el.style.display = 'none';
      return;
    }

    const trimmedPid = pid.trim();
    const esc = getEscapeHtml();
    ensureStyle();

    // 避免非同步快速查詢時舊請求覆寫新請求
    if (!el._mhSeq) el._mhSeq = 0;
    const currentSeq = ++el._mhSeq;

    let apiBase = '';
    if (opts && opts.api_base != null) {
      apiBase = opts.api_base;
    }

    const url = apiBase
      ? `${apiBase.replace(/\/+$/, '')}/history/${encodeURIComponent(trimmedPid)}.json`
      : `../history/${encodeURIComponent(trimmedPid)}.json`;

    try {
      // 頁面每 5 秒會重畫一次：10 秒內同一位選手直接用剛抓的，不重複向主機要（512 人同時開著頁面時差很多）
      const hit = HISTORY_CACHE[trimmedPid];
      const fresh = !!hit && (Date.now() - hit.at) < HISTORY_CACHE_MS;
      const res = fresh ? { ok: true, status: 200, json: async () => hit.data }
                        : await fetch(url, { cache: 'no-store' });

      // 若在載入期間切換至離線或序列號已過期
      if (currentSeq !== el._mhSeq) return;
      if (document.body && document.body.getAttribute('data-offline') === 'true') {
        el.innerHTML = '';
        el.style.display = 'none';
        return;
      }

      // 404 安靜略過 (DATA-CONTRACT 10.18)
      if (res.status === 404) {
        el.innerHTML = '';
        el.style.display = 'none';
        return;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      if (currentSeq !== el._mhSeq) return;
      if (!fresh && data && data.ok !== false) HISTORY_CACHE[trimmedPid] = { at: Date.now(), data };
      if (!data || data.ok === false) {
        throw new Error((data && data.message) ? data.message : '資料格式錯誤');
      }

      const matches = Array.isArray(data.matches) ? data.matches : [];
      if (matches.length === 0) {
        el.style.display = '';
        el.innerHTML = `
          <div class="mh-box">
            <div class="mh-header">
              <span class="mh-title">對戰紀錄</span>
            </div>
            <div class="mh-empty">還沒有對戰紀錄</div>
          </div>
        `;
        return;
      }

      // 總計一行：「N 勝 N 敗 N 和」（有輪空再加「N 輪空」）
      const rec = data.record || { win: 0, loss: 0, draw: 0, bye: 0 };
      const win = Number(rec.win) || 0;
      const loss = Number(rec.loss) || 0;
      const draw = Number(rec.draw) || 0;
      const bye = Number(rec.bye) || 0;
      let summaryText = `${win} 勝 ${loss} 敗 ${draw} 和`;
      if (bye > 0) {
        summaryText += ` ${bye} 輪空`;
      }

      // 清單：最新一場排最上面（後端是由舊到新）
      const reversedMatches = matches.slice().reverse();

      const allowSelectOpponent = (opts && typeof opts.onSelectOpponent === 'function');

      const rowsHtml = reversedMatches.map((m) => {
        const outcomeKey = m.outcome || '';
        const outcomeCfg = OUTCOME_CONFIG[outcomeKey] || { text: outcomeKey || '—', className: 'mh-badge-unknown' };
        const labelText = m.label || '';
        const displayScore = m.display ? esc(m.display) : '—';

        let oppHtml = '<span class="mh-opp-text" style="color: var(--text-secondary);">—</span>';
        if (m.opponent && m.opponent.id) {
          const oppName = m.opponent.name || m.opponent.id;
          const oppDisplay = `${oppName} (${m.opponent.id})`;
          if (allowSelectOpponent) {
            oppHtml = `<button type="button" class="mh-opp-btn" data-opp-id="${esc(m.opponent.id)}">${esc(oppDisplay)}</button>`;
          } else {
            oppHtml = `<span class="mh-opp-text">${esc(oppDisplay)}</span>`;
          }
        }

        return `
          <div class="mh-row">
            <div class="mh-row-left">
              <span class="mh-label">${esc(labelText)}</span>
              <span class="mh-badge ${outcomeCfg.className}">${esc(outcomeCfg.text)}</span>
              <div class="mh-opp-wrap">${oppHtml}</div>
            </div>
            <span class="mh-score">${displayScore}</span>
          </div>
        `;
      }).join('');

      el.style.display = '';
      el.innerHTML = `
        <div class="mh-box">
          <div class="mh-header">
            <span class="mh-title">對戰紀錄</span>
            <span class="mh-summary">${esc(summaryText)}</span>
          </div>
          <div class="mh-list">
            ${rowsHtml}
          </div>
        </div>
      `;

      // 綁定點擊對手事件
      if (allowSelectOpponent) {
        const oppBtns = el.querySelectorAll('.mh-opp-btn');
        oppBtns.forEach((btn) => {
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            const oppId = btn.getAttribute('data-opp-id');
            if (oppId) {
              opts.onSelectOpponent(oppId);
            }
          });
        });
      }

    } catch (err) {
      if (currentSeq !== el._mhSeq) return;
      if (document.body && document.body.getAttribute('data-offline') === 'true') {
        el.innerHTML = '';
        el.style.display = 'none';
        return;
      }

      el.style.display = '';
      el.innerHTML = `
        <div class="mh-box">
          <div class="mh-header">
            <span class="mh-title">對戰紀錄</span>
          </div>
          <div class="mh-error">
            <span>讀不到對戰紀錄，請稍後再試</span>
            <button type="button" class="mh-retry-btn">重試</button>
          </div>
        </div>
      `;

      const retryBtn = el.querySelector('.mh-retry-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => {
          render(el, pid, opts);
        });
      }
    }
  }

  root.MatchHistory = {
    render
  };

})(typeof window !== 'undefined' ? window : this);
