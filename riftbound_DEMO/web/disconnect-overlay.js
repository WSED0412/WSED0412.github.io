(function () {
  'use strict';

  function ensureStyle() {
    if (document.getElementById('dco-style')) return;
    const style = document.createElement('style');
    style.id = 'dco-style';
    style.textContent = `
.dco-overlay {
  position: fixed;
  inset: 0;
  background: #01222F;
  display: none;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  text-align: center;
  z-index: 9999;
  box-sizing: border-box;
  width: 100vw;
  max-width: 100vw;
  overflow-x: hidden;
}

.dco-icon {
  font-size: 3.5rem;
  line-height: 1;
  margin-bottom: 14px;
}

.dco-title {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--danger-text, #ef4444);
  margin: 0 0 10px 0;
  line-height: 1.3;
}

.dco-desc {
  font-size: 1rem;
  color: var(--text-secondary, #94a3b8);
  max-width: 440px;
  margin: 0 0 20px 0;
  line-height: 1.6;
  word-break: break-word;
}

.dco-btn {
  min-width: 44px;
  min-height: 44px;
  padding: 12px 28px;
  background: var(--accent, #ef7d00);
  color: #141212;
  font-size: 1rem;
  font-weight: 800;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  transition: opacity 0.15s ease;
  box-sizing: border-box;
}

.dco-btn:hover {
  opacity: 0.9;
}

.dco-btn:active {
  opacity: 0.8;
}

.dco-overlay.dco-size-big .dco-icon {
  font-size: clamp(3.5rem, 6vw, 4.5rem);
  margin-bottom: 16px;
}

.dco-overlay.dco-size-big .dco-title {
  font-size: clamp(1.8rem, 3.5vw, 2.6rem);
  margin-bottom: 12px;
}

.dco-overlay.dco-size-big .dco-desc {
  font-size: clamp(1rem, 1.8vw, 1.35rem);
  max-width: 500px;
  margin-bottom: 24px;
}

.dco-overlay.dco-size-big .dco-btn {
  font-size: clamp(1rem, 1.6vw, 1.25rem);
  padding: 14px 36px;
  min-height: 48px;
}

@media print {
  .dco-overlay {
    display: none !important;
  }
}
`;
    (document.head || document.documentElement).appendChild(style);
  }

  function createOverlay(options) {
    ensureStyle();

    const opts = options || {};
    const overlayId = opts.id || 'disconnectedScreen';
    const descText = opts.desc || '';
    const sizeMode = opts.size || 'normal';
    const retryBtnId = opts.retryId || '';
    const onRetryCallback = opts.onRetry;

    const oldEl = document.getElementById(overlayId);
    if (oldEl && oldEl.parentNode) {
      oldEl.parentNode.removeChild(oldEl);
    }

    const overlay = document.createElement('div');
    overlay.id = overlayId;
    overlay.className = 'dco-overlay' + (sizeMode === 'big' ? ' dco-size-big' : '');
    overlay.style.display = 'none';

    const icon = document.createElement('div');
    icon.className = 'dco-icon';
    icon.textContent = '⚠️';

    const title = document.createElement('div');
    title.className = 'dco-title';
    title.textContent = '尚未連上賽務系統';

    const desc = document.createElement('div');
    desc.className = 'dco-desc';
    const lines = String(descText).split(/<br\s*\/?>|\n/gi);
    lines.forEach((line, index) => {
      if (index > 0) {
        desc.appendChild(document.createElement('br'));
      }
      desc.appendChild(document.createTextNode(line));
    });

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dco-btn';
    if (retryBtnId) {
      btn.id = retryBtnId;
    }
    btn.textContent = '重新連線';

    if (typeof onRetryCallback === 'function') {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        try {
          onRetryCallback();
        } catch (err) {
          console.error('重新連線失敗:', err);
        }
      });
    }

    overlay.appendChild(icon);
    overlay.appendChild(title);
    overlay.appendChild(desc);
    overlay.appendChild(btn);

    function mount() {
      if (!overlay.parentNode && document.body) {
        document.body.appendChild(overlay);
      }
    }

    if (document.body) {
      mount();
    } else {
      document.addEventListener('DOMContentLoaded', mount);
    }

    return {
      show: function () {
        mount();
        overlay.style.display = 'flex';
      },
      hide: function () {
        overlay.style.display = 'none';
      },
      element: overlay
    };
  }

  window.DisconnectOverlay = {
    create: createOverlay
  };
})();
