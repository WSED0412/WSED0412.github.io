/**
 * 符文戰場賽事系統 — 叫裁判共用模組 (web/call-judge.js)
 * DATA-CONTRACT 1.15, 3.5, 7.11 規範
 */

(function (window) {
  'use strict';

  function escapeText(str) {
    if (typeof escapeHtml === 'function') return escapeHtml(str);
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  let activeInstance = null;

  class CallJudgeModule {
    constructor(opts = {}, prevInstance = null) {
      this.opts = opts || {};
      this.formVisible = prevInstance ? prevInstance.formVisible : false;
      this.selectedReason = prevInstance ? prevInstance.selectedReason : 'rules';
      this.currentNote = prevInstance ? prevInstance.currentNote : '';
      this.currentJudgeCall = prevInstance ? prevInstance.currentJudgeCall : null;
      this.canCall = prevInstance ? prevInstance.canCall : false;
      this.isSubmitting = false;
      this.isCanceling = false;

      this.timer = setInterval(() => {
        try {
          if (this.currentJudgeCall) {
            this.renderStatusBox(this.currentJudgeCall);
          }
        } catch (err) {
          console.error('[CallJudge] 定時更新狀態失敗:', err);
        }
      }, 15000);

      this.bindElements();
    }

    destroy() {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }

    getElements() {
      const ids = (this.opts && this.opts.ids) || {};
      let cardEl = ids.card ? document.getElementById(ids.card) : (ids.section ? document.getElementById(ids.section) : null);
      if (!cardEl && ids.btn) {
        const btn = document.getElementById(ids.btn);
        if (btn) cardEl = btn.closest('.call-judge-card');
      }
      const formEl = ids.form ? document.getElementById(ids.form) : null;
      let errorEl = ids.error ? document.getElementById(ids.error) : null;
      if (!errorEl && formEl) {
        errorEl = formEl.querySelector('.call-judge-error') || formEl.querySelector('.error-message');
      }
      if (!errorEl && cardEl) {
        errorEl = cardEl.querySelector('.call-judge-error') || cardEl.querySelector('.error-message');
      }
      return {
        cardEl,
        btnEl: ids.btn ? document.getElementById(ids.btn) : null,
        formEl,
        noteEl: ids.note ? document.getElementById(ids.note) : null,
        submitEl: ids.submit ? document.getElementById(ids.submit) : null,
        cancelEl: ids.cancel ? document.getElementById(ids.cancel) : null,
        statusEl: ids.status ? document.getElementById(ids.status) : null,
        statusTitleEl: ids.statusTitle ? document.getElementById(ids.statusTitle) : null,
        errorEl
      };
    }

    bindElements() {
      const els = this.getElements();
      const { btnEl, formEl, noteEl, submitEl, cancelEl, errorEl } = els;

      if (btnEl && !btnEl._cjBound) {
        btnEl._cjBound = true;
        btnEl.addEventListener('click', () => {
          this.formVisible = true;
          btnEl.style.display = 'none';
          if (formEl) formEl.style.display = 'block';
          const { errorEl } = this.getElements();
          if (errorEl) {
            errorEl.textContent = '';
            errorEl.style.display = 'none';
          }
        });
      }

      if (formEl && !formEl._cjBound) {
        formEl._cjBound = true;
        const reasonBtns = formEl.querySelectorAll('[data-reason]');
        reasonBtns.forEach(btn => {
          btn.classList.toggle('active', btn.getAttribute('data-reason') === this.selectedReason);
          btn.addEventListener('click', () => {
            this.selectedReason = btn.getAttribute('data-reason') || 'rules';
            reasonBtns.forEach(b => {
              b.classList.toggle('active', b.getAttribute('data-reason') === this.selectedReason);
            });
          });
        });
      }

      if (noteEl && !noteEl._cjBound) {
        noteEl._cjBound = true;
        if (this.currentNote && !noteEl.value) {
          noteEl.value = this.currentNote;
        } else if (noteEl.value) {
          this.currentNote = noteEl.value;
        }
        noteEl.addEventListener('input', () => {
          this.currentNote = noteEl.value;
        });
      }

      if (submitEl && !submitEl._cjBound) {
        submitEl._cjBound = true;
        submitEl.addEventListener('click', () => this.handleSubmit());
      }

      if (cancelEl && !cancelEl._cjBound) {
        cancelEl._cjBound = true;
        cancelEl.addEventListener('click', () => this.handleCancel());
      }
    }

    async handleSubmit() {
      if (this.isSubmitting || this.isCanceling) return;
      const els = this.getElements();
      const { formEl, noteEl, submitEl, errorEl } = els;

      if (errorEl) {
        errorEl.textContent = '';
        errorEl.style.display = 'none';
      }

      const auth = (this.opts.getAuth && typeof this.opts.getAuth === 'function')
        ? this.opts.getAuth()
        : null;

      if (!auth || !auth.player_id || !auth.pin) {
        if (errorEl) {
          errorEl.textContent = '請先登入選手身分';
          errorEl.style.display = 'block';
        }
        return;
      }

      const noteVal = noteEl ? (noteEl.value || '').trim().slice(0, 40) : '';
      const extra = (this.opts.extraPayload && typeof this.opts.extraPayload === 'function')
        ? this.opts.extraPayload()
        : {};

      const payload = Object.assign({
        player_id: auth.player_id,
        pin: auth.pin,
        reason: this.selectedReason || 'rules',
        note: noteVal
      }, extra);

      this.isSubmitting = true;
      const origText = submitEl ? submitEl.textContent : '送出呼叫';
      if (submitEl) {
        submitEl.disabled = true;
        submitEl.textContent = '處理中…';
      }

      try {
        const res = await this.opts.post('/api/player/call_judge', payload);
        this.formVisible = false;
        this.currentNote = '';
        if (noteEl) noteEl.value = '';
        this.selectedReason = 'rules';
        if (formEl) {
          const reasonBtns = formEl.querySelectorAll('[data-reason]');
          reasonBtns.forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-reason') === 'rules');
          });
        }
        if (this.opts.afterChange && typeof this.opts.afterChange === 'function') {
          this.opts.afterChange(res);
        }
      } catch (err) {
        console.error('[CallJudge] handleSubmit error:', err);
        if (errorEl) {
          errorEl.textContent = err.message || '呼叫裁判失敗';
          errorEl.style.display = 'block';
        }
      } finally {
        this.isSubmitting = false;
        if (submitEl) {
          submitEl.disabled = false;
          submitEl.textContent = origText;
        }
      }
    }

    async handleCancel() {
      if (this.isSubmitting || this.isCanceling) return;
      const els = this.getElements();
      const { cancelEl, errorEl } = els;

      if (errorEl) {
        errorEl.textContent = '';
        errorEl.style.display = 'none';
      }

      const auth = (this.opts.getAuth && typeof this.opts.getAuth === 'function')
        ? this.opts.getAuth()
        : null;

      if (!auth || !auth.player_id || !auth.pin) {
        return;
      }

      const extra = (this.opts.extraPayload && typeof this.opts.extraPayload === 'function')
        ? this.opts.extraPayload()
        : {};

      const payload = Object.assign({
        player_id: auth.player_id,
        pin: auth.pin
      }, extra);

      this.isCanceling = true;
      const origText = cancelEl ? cancelEl.textContent : '取消呼叫裁判';
      if (cancelEl) {
        cancelEl.disabled = true;
        cancelEl.textContent = '處理中…';
      }

      try {
        const res = await this.opts.post('/api/player/call_cancel', payload);
        this.formVisible = false;
        this.currentJudgeCall = null;
        if (this.opts.afterChange && typeof this.opts.afterChange === 'function') {
          this.opts.afterChange(res);
        }
      } catch (err) {
        console.error('[CallJudge] handleCancel error:', err);
        if (errorEl) {
          errorEl.textContent = err.message || '取消呼叫失敗';
          errorEl.style.display = 'block';
        }
      } finally {
        this.isCanceling = false;
        if (cancelEl) {
          cancelEl.disabled = false;
          cancelEl.textContent = origText;
        }
      }
    }

    renderStatusBox(jc) {
      try {
        if (!jc) return;
        const els = this.getElements();
        const { statusEl, statusTitleEl } = els;
        if (!statusEl) return;

        const currentServerNow = (this.opts.now && typeof this.opts.now === 'function')
          ? this.opts.now()
          : Date.now();
        const diffMin = Math.floor(Math.max(0, currentServerNow - (jc.called_at || currentServerNow)) / 60000);

        let statusText = '';
        if (jc.state === 'taken') {
          statusText = jc.by_me
            ? `裁判已經在處理（已等 ${diffMin} 分鐘）`
            : `裁判已經在處理對手的呼叫（已等 ${diffMin} 分鐘）`;
        } else {
          statusText = jc.by_me
            ? `已通知裁判，請在座位上等（已等 ${diffMin} 分鐘）`
            : `對手叫了裁判，請在座位上等（已等 ${diffMin} 分鐘）`;
        }

        statusEl.className = 'call-status-box' + (jc.state === 'taken' ? ' taken' : '');

        const reasonLabel = jc.reason_label || jc.reason;
        const reasonHtml = reasonLabel
          ? `<div style="font-size: 0.85rem; margin-top: 4px; color: var(--text-secondary);">原因：${escapeText(reasonLabel)}</div>`
          : '';
        const noteHtml = jc.note
          ? `<div style="font-size: 0.85rem; margin-top: 2px; color: var(--text-secondary);">備註：${escapeText(jc.note)}</div>`
          : '';

        const titleIdAttr = (this.opts.ids && this.opts.ids.statusTitle)
          ? ` id="${escapeText(this.opts.ids.statusTitle)}"`
          : (statusTitleEl ? ` id="${escapeText(statusTitleEl.id)}"` : '');

        statusEl.innerHTML = `
          <div${titleIdAttr} style="font-weight: 700;">${escapeText(statusText)}</div>
          ${reasonHtml}
          ${noteHtml}
        `;
      } catch (err) {
        console.error('[CallJudge] renderStatusBox error:', err);
      }
    }

    update({ judge_call, canCall } = {}) {
      try {
        this.bindElements();
        const els = this.getElements();
        const { cardEl, btnEl, formEl, statusEl, cancelEl, errorEl } = els;

        const hadCall = Boolean(this.currentJudgeCall);
        this.currentJudgeCall = judge_call || null;
        this.canCall = Boolean(canCall);

        if (hadCall && !this.currentJudgeCall) {
          this.formVisible = false;
        }

        if (cardEl) {
          cardEl.style.display = (this.currentJudgeCall || this.canCall) ? 'block' : 'none';
        }

        if (this.currentJudgeCall) {
          if (btnEl) btnEl.style.display = 'none';
          if (formEl) formEl.style.display = 'none';
          if (errorEl) errorEl.style.display = 'none';
          if (statusEl) {
            statusEl.style.display = 'block';
            this.renderStatusBox(this.currentJudgeCall);
          }
          if (cancelEl) {
            cancelEl.style.display = this.currentJudgeCall.by_me ? 'block' : 'none';
          }
        } else {
          if (statusEl) statusEl.style.display = 'none';
          if (cancelEl) cancelEl.style.display = 'none';

          if (this.canCall) {
            if (this.formVisible) {
              if (btnEl) btnEl.style.display = 'none';
              if (formEl) formEl.style.display = 'block';
            } else {
              if (btnEl) btnEl.style.display = '';
              if (formEl) formEl.style.display = 'none';
            }
          } else {
            if (btnEl) btnEl.style.display = 'none';
            if (formEl) formEl.style.display = 'none';
          }
        }
      } catch (err) {
        console.error('[CallJudge] update error:', err);
      }
    }
  }

  window.CallJudge = {
    mount: function (opts) {
      try {
        let prev = null;
        if (activeInstance) {
          prev = activeInstance;
          activeInstance.destroy();
        }
        activeInstance = new CallJudgeModule(opts, prev);
        return activeInstance;
      } catch (err) {
        console.error('[CallJudge] mount error:', err);
        return null;
      }
    },
    update: function (params) {
      try {
        if (activeInstance) {
          activeInstance.update(params);
        }
      } catch (err) {
        console.error('[CallJudge] update error:', err);
      }
    }
  };
})(window);
