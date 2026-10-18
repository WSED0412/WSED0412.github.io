/**
 * 符文戰場賽事系統 — 緊急廣播與跑馬燈顯示元件 (web/broadcast.js)
 * 遵守 DATA-CONTRACT 1.10, 1.17, 10.12 與前端硬性規定
 */
(function (window) {
  'use strict';

  let lastMarqueeKey = '';
  let marqueeCycleTimer = null;
  let marqueeReducedIndex = 0;

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getSeenId() {
    try {
      const val = localStorage.getItem('riftbound_bc_seen');
      if (val != null) {
        const n = parseInt(val, 10);
        return isNaN(n) ? 0 : n;
      }
    } catch (e) {}
    return 0;
  }

  function setSeenId(id) {
    try {
      const current = getSeenId();
      const n = parseInt(id, 10) || 0;
      localStorage.setItem('riftbound_bc_seen', String(Math.max(current, n)));
    } catch (e) {}
  }

  function ensureStyle() {
    if (!document.getElementById('bcStyle')) {
      const style = document.createElement('style');
      style.id = 'bcStyle';
      style.textContent = `
        #bcBanner {
          position: relative;
          width: 100%;
          box-sizing: border-box;
          background: var(--warning-bg);
          border-bottom: 2px solid var(--warning-border);
          color: var(--warning-text);
          padding: 10px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          z-index: 9990;
          font-size: 0.95rem;
          line-height: 1.4;
        }
        #bcBannerText {
          flex: 1;
          word-break: break-word;
        }
        #bcBannerOk {
          flex-shrink: 0;
          min-height: 38px;
          min-width: 68px;
          padding: 6px 14px;
          background: var(--accent);
          color: #ffffff;
          border: none;
          border-radius: 6px;
          font-size: 0.9rem;
          font-weight: 700;
          cursor: pointer;
        }
        #bcBannerOk:active {
          background: var(--accent-hover);
        }
        #bcUrgent {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 99999;
          background: var(--danger-border);
          color: #ffffff;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 20px;
          box-sizing: border-box;
          text-align: center;
        }
        #bcUrgentText {
          font-size: 1.5rem;
          font-weight: 800;
          line-height: 1.5;
          margin-bottom: 24px;
          max-width: 90%;
          max-height: 60vh;
          overflow-y: auto;
          word-break: break-word;
          color: #ffffff;
          text-align: center;
        }
        #bcUrgentOk {
          min-height: 56px;
          min-width: 160px;
          padding: 12px 36px;
          font-size: 1.2rem;
          font-weight: 800;
          border-radius: 8px;
          border: 2px solid #ffffff;
          background: #ffffff;
          color: var(--danger-border);
          cursor: pointer;
          flex-shrink: 0;
        }
        #bcMarquee {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          height: 40px;
          line-height: 40px;
          z-index: 9980;
          background: rgba(1, 43, 60, 0.95);
          border-top: 1px solid var(--card-border);
          color: var(--text-primary);
          overflow: hidden;
          white-space: nowrap;
          pointer-events: none;
          font-size: 0.95rem;
          box-sizing: border-box;
          display: flex;
          align-items: center;
        }
        .bc-marquee-track {
          display: inline-flex;
          white-space: nowrap;
          animation: bcMarqueeScroll 25s linear infinite;
        }
        .bc-marquee-item {
          display: inline-block;
          white-space: nowrap;
        }
        @keyframes bcMarqueeScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `;
      document.head.appendChild(style);
    }
  }

  function removeBroadcast() {
    const banner = document.getElementById('bcBanner');
    if (banner) banner.remove();
    const urgent = document.getElementById('bcUrgent');
    if (urgent) urgent.remove();
  }

  function removeMarquee() {
    const marquee = document.getElementById('bcMarquee');
    if (marquee) marquee.remove();
    if (marqueeCycleTimer) {
      clearInterval(marqueeCycleTimer);
      marqueeCycleTimer = null;
    }
    lastMarqueeKey = '';
  }

  function update(snapshot, opts = {}) {
    if (!document.body) return;

    // 離線舊資料狀態 (body[data-offline="true"]) 或讀不到資料時，不顯示任何廣播與跑馬燈
    const isOffline = (document.body.getAttribute('data-offline') === 'true');
    if (isOffline || !snapshot || !snapshot.event) {
      removeBroadcast();
      removeMarquee();
      return;
    }

    const event = snapshot.event;
    const broadcast = event.broadcast;

    // 1. 緊急廣播處理
    if (!broadcast || typeof broadcast !== 'object' || !broadcast.id) {
      removeBroadcast();
    } else {
      const bcId = parseInt(broadcast.id, 10);
      const seenId = getSeenId();
      if (isNaN(bcId) || bcId <= seenId) {
        removeBroadcast();
      } else {
        ensureStyle();
        const level = broadcast.level === 'urgent' ? 'urgent' : 'notice';
        if (level === 'urgent') {
          // 移除 banner（若有）
          const curBanner = document.getElementById('bcBanner');
          if (curBanner) curBanner.remove();

          const curUrgent = document.getElementById('bcUrgent');
          if (curUrgent && curUrgent.getAttribute('data-id') === String(bcId)) {
            // 同一個 id 輪詢重複收到時不要重畫、不要搶焦點
          } else {
            if (curUrgent) curUrgent.remove();
            const urgentEl = document.createElement('div');
            urgentEl.id = 'bcUrgent';
            urgentEl.setAttribute('role', 'alertdialog');
            urgentEl.setAttribute('aria-modal', 'true');
            urgentEl.setAttribute('data-id', String(bcId));
            urgentEl.innerHTML = `
              <div id="bcUrgentText">${escapeHtml(broadcast.text || '')}</div>
              <button type="button" id="bcUrgentOk">知道了</button>
            `;
            const okBtn = urgentEl.querySelector('#bcUrgentOk');
            okBtn.onclick = () => {
              setSeenId(bcId);
              urgentEl.remove();
            };
            document.body.appendChild(urgentEl);
            try {
              okBtn.focus();
            } catch (e) {}
          }
        } else {
          // level === 'notice'
          const curUrgent = document.getElementById('bcUrgent');
          if (curUrgent) curUrgent.remove();

          const curBanner = document.getElementById('bcBanner');
          if (curBanner && curBanner.getAttribute('data-id') === String(bcId)) {
            // 同一個 id 不重畫
          } else {
            if (curBanner) curBanner.remove();
            const bannerEl = document.createElement('div');
            bannerEl.id = 'bcBanner';
            bannerEl.setAttribute('role', 'status');
            bannerEl.setAttribute('data-id', String(bcId));
            bannerEl.innerHTML = `
              <div id="bcBannerText">${escapeHtml(broadcast.text || '')}</div>
              <button type="button" id="bcBannerOk">知道了</button>
            `;
            bannerEl.querySelector('#bcBannerOk').onclick = () => {
              setSeenId(bcId);
              bannerEl.remove();
            };
            document.body.insertBefore(bannerEl, document.body.firstChild);
          }
        }
      }
    }

    // 2. 跑馬燈處理
    const allowMarquee = Boolean(opts && opts.marquee);
    const marqueeLines = Array.isArray(event.marquee) ? event.marquee.filter(l => typeof l === 'string' && l.trim() !== '') : [];

    if (!allowMarquee || marqueeLines.length === 0) {
      removeMarquee();
    } else {
      const prefersReduced = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      const marqueeKey = JSON.stringify(marqueeLines) + '|' + prefersReduced;

      if (marqueeKey === lastMarqueeKey && document.getElementById('bcMarquee')) {
        // 內容沒變，不要重畫、不要重置動畫
      } else {
        lastMarqueeKey = marqueeKey;
        removeMarquee();
        ensureStyle();

        const marqueeEl = document.createElement('div');
        marqueeEl.id = 'bcMarquee';

        if (prefersReduced) {
          marqueeReducedIndex = 0;
          marqueeEl.innerHTML = `<div id="bcMarqueeReduced" style="width: 100%; text-align: center; overflow: hidden; text-overflow: ellipsis; padding: 0 16px;">${escapeHtml(marqueeLines[0])}</div>`;
          document.body.appendChild(marqueeEl);

          if (marqueeLines.length > 1) {
            marqueeCycleTimer = setInterval(() => {
              marqueeReducedIndex = (marqueeReducedIndex + 1) % marqueeLines.length;
              const reducedEl = document.getElementById('bcMarqueeReduced');
              if (reducedEl) {
                reducedEl.textContent = marqueeLines[marqueeReducedIndex];
              }
            }, 6000);
          }
        } else {
          // 文字由右往左捲動、無縫輪播所有行（行與行之間用「　◆　」隔開）
          let unit = marqueeLines.join('　◆　') + '　◆　';
          while (unit.length < 50) {
            unit += unit;
          }
          const escapedUnit = escapeHtml(unit);
          const duration = Math.max(16, Math.round(unit.length * 0.35));

          marqueeEl.innerHTML = `
            <div class="bc-marquee-track" style="animation-duration: ${duration}s;">
              <span class="bc-marquee-item">${escapedUnit}</span>
              <span class="bc-marquee-item">${escapedUnit}</span>
            </div>
          `;
          document.body.appendChild(marqueeEl);
        }
      }
    }
  }

  window.BroadcastDisplay = {
    update
  };

})(window);
