/**
 * 符文戰場賽事系統 — 工作人員與主辦共用面板模組 (web/admin-panels.js)
 * 這份檔案現在主辦頁與裁判頁共用（面板名稱仍叫 AdminPanels，避免改名連動驗收）。
 * 提供工作人員登入、系統健康、工作人員管理、結束賽事、選手協助、牌表設定、抽驗牌共用面板
 * 遵守 DATA-CONTRACT 3.3, 3.8, 3.9, 6.2, 10.4, 10.5 與前端硬性規定
 */

(function (window) {
  'use strict';

  /**
   * 1. 工作人員登入面板
   * @param {Object} options
   *   ids: { section, pin, btn, error, logout? }
   *   storageKey: sessionStorage key (例如 riftbound_staff_pin 或 riftbound_elim_admin_pin)
   *   allowedRoles: Array (預設 ['admin'])
   *   onLogin: async (who) => void
   *   onLogout: () => void
   * @returns {{ getPin: () => string, logout: () => void }}
   */
  function mountLogin(options = {}) {
    const {
      ids = {},
      storageKey = 'riftbound_staff_pin',
      allowedRoles = ['admin'],
      onLogin,
      onLogout
    } = options;

    const sectionId = ids.section || 'loginSection';
    const pinId = ids.pin || 'staffPin';
    const btnId = ids.btn || 'staffLogin';
    const errorId = ids.error || 'loginError';
    const logoutId = ids.logout || 'staffLogout';

    let currentPin = '';
    let isLoggingIn = false;

    const getEl = (id) => document.getElementById(id);

    function getPin() {
      return currentPin;
    }

    function showError(msg) {
      const errorEl = getEl(errorId);
      if (errorEl) {
        errorEl.textContent = msg;
        errorEl.className = 'msg-box error';
        errorEl.style.display = 'block';
      }
    }

    function hideError() {
      const errorEl = getEl(errorId);
      if (errorEl) {
        errorEl.textContent = '';
        errorEl.style.display = 'none';
      }
    }

    async function doLogin(pinToUse) {
      if (isLoggingIn) return;
      const pinEl = getEl(pinId);
      const btnEl = getEl(btnId);
      const sectionEl = getEl(sectionId);
      const logoutEl = getEl(logoutId);

      const pinVal = (pinToUse != null ? String(pinToUse) : (pinEl ? pinEl.value : '')).trim();
      if (!pinVal) {
        showError(allowedRoles.includes('judge') ? '請輸入工作人員 PIN 碼' : '請輸入主辦 PIN 碼');
        return;
      }

      isLoggingIn = true;
      const origBtnText = btnEl ? btnEl.textContent : '';
      if (btnEl) {
        btnEl.disabled = true;
        btnEl.textContent = '登入中…';
      }
      hideError();

      try {
        const res = await callApi('/api/staff/whoami', { staff_pin: pinVal });
        if (!res || !allowedRoles.includes(res.role)) {
          currentPin = '';
          try {
            sessionStorage.removeItem(storageKey);
          } catch (storageErr) {
            console.error('sessionStorage removeItem error:', storageErr);
          }
          showError('只有主辦可以使用此頁面（裁判請使用裁判頁）');
          return;
        }

        currentPin = pinVal;
        try {
          sessionStorage.setItem(storageKey, pinVal);
        } catch (storageErr) {
          console.error('sessionStorage setItem error:', storageErr);
        }

        if (sectionEl) sectionEl.style.display = 'none';
        if (pinEl) pinEl.value = '';
        hideError();
        if (logoutEl) logoutEl.style.display = '';

        if (typeof onLogin === 'function') {
          try {
            await onLogin(res);
          } catch (loginCbErr) {
            console.error('onLogin callback error:', loginCbErr);
          }
        }
      } catch (err) {
        console.error('Login error:', err);
        // 401 錯誤清掉已記住的 PIN，連不上主機等網路錯誤則不清掉
        if (err && (err.status === 401 || err.code === 'wrong_pin')) {
          currentPin = '';
          try {
            sessionStorage.removeItem(storageKey);
          } catch (storageErr) {
            console.error('sessionStorage removeItem error:', storageErr);
          }
          if (pinEl) pinEl.value = '';
        }
        showError(err.message || '登入失敗，請確認 PIN 碼');
      } finally {
        isLoggingIn = false;
        if (btnEl) {
          btnEl.disabled = false;
          btnEl.textContent = origBtnText;
        }
      }
    }

    function logout() {
      currentPin = '';
      try {
        sessionStorage.removeItem(storageKey);
      } catch (storageErr) {
        console.error('sessionStorage removeItem error:', storageErr);
      }
      const sectionEl = getEl(sectionId);
      const pinEl = getEl(pinId);
      const logoutEl = getEl(logoutId);

      if (sectionEl) sectionEl.style.display = 'block';
      if (pinEl) pinEl.value = '';
      hideError();
      if (logoutEl) logoutEl.style.display = 'none';

      if (typeof onLogout === 'function') {
        try {
          onLogout();
        } catch (logoutCbErr) {
          console.error('onLogout callback error:', logoutCbErr);
        }
      }
    }

    function initListeners() {
      const btnEl = getEl(btnId);
      const pinEl = getEl(pinId);
      const logoutEl = getEl(logoutId);

      if (btnEl) {
        btnEl.addEventListener('click', () => doLogin());
      }
      if (pinEl) {
        pinEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') doLogin();
        });
      }
      if (logoutEl) {
        logoutEl.addEventListener('click', () => logout());
      }

      let savedPin = null;
      try {
        savedPin = sessionStorage.getItem(storageKey);
      } catch (storageErr) {
        console.error('sessionStorage getItem error:', storageErr);
      }
      if (savedPin) {
        if (pinEl) pinEl.value = savedPin;
        doLogin(savedPin);
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initListeners);
    } else {
      initListeners();
    }

    return { getPin, logout };
  }

  /**
   * 2. 系統健康面板
   * @param {Object} options
   *   ids: { panel?, statusBadge?, version?, extraInfo?, problemsList? }
   *   getPin: () => string
   *   intervalMs: number (預設 3000)
   * @returns {{ start: () => void, stop: () => void }}
   */
  function mountHealth(options = {}) {
    const {
      ids = {},
      getPin,
      intervalMs = 3000
    } = options;

    const panelId = ids.panel || ids.healthPanel || 'healthPanel';
    const statusBadgeId = ids.statusBadge || ids.healthStatusBadge || 'healthStatusBadge';
    const versionId = ids.version || ids.healthVersion || 'healthVersion';
    const extraInfoId = ids.extraInfo || ids.healthExtraInfo || 'healthExtraInfo';
    const problemsListId = ids.problemsList || ids.healthProblemsList || 'healthProblemsList';

    let timer = null;
    let isFetching = false;
    let isRunning = false;
    let lastDataJson = '';

    const getEl = (id) => document.getElementById(id);

    async function fetchHealth() {
      const pin = typeof getPin === 'function' ? getPin() : '';
      if (!pin || document.visibilityState === 'hidden') return;
      if (isFetching) return; // 防連打旗標
      isFetching = true;

      try {
        const data = await callApi('/api/admin/health', { staff_pin: pin });
        renderHealth(data);
      } catch (err) {
        console.error('fetchHealth error:', err);
      } finally {
        isFetching = false;
      }
    }

    function renderHealth(data) {
      if (!data) return;
      const jsonStr = JSON.stringify(data);
      if (jsonStr === lastDataJson) return; // 內容沒變就不重畫
      lastDataJson = jsonStr;

      const verEl = getEl(versionId);
      if (verEl) {
        verEl.textContent = data.version || '未知';
      }

      const extraInfoEl = getEl(extraInfoId);
      if (extraInfoEl) {
        const parts = [];
        if (data.snapshot && typeof data.snapshot.age_sec === 'number') {
          parts.push(`畫面資料 ${data.snapshot.age_sec} 秒前更新`);
        }
        if (data.log && typeof data.log.ops === 'number') {
          parts.push(`操作紀錄 ${data.log.ops} 筆`);
        }
        if (parts.length > 0) {
          extraInfoEl.textContent = parts.join(' · ');
          extraInfoEl.style.display = 'block';
        } else {
          extraInfoEl.style.display = 'none';
        }
      }

      const statusBadgeEl = getEl(statusBadgeId);
      const problemsListEl = getEl(problemsListId);
      const problems = Array.isArray(data.problems) ? data.problems : [];

      if (problems.length === 0) {
        if (statusBadgeEl) {
          statusBadgeEl.textContent = '正常';
          statusBadgeEl.style.background = 'var(--success-bg)';
          statusBadgeEl.style.color = 'var(--success-text)';
          statusBadgeEl.style.borderColor = 'var(--success-border)';
          statusBadgeEl.style.display = 'inline-block';
        }
        if (problemsListEl) {
          problemsListEl.innerHTML = '';
          problemsListEl.style.display = 'none';
        }
      } else {
        if (statusBadgeEl) {
          statusBadgeEl.textContent = '注意';
          statusBadgeEl.style.background = 'var(--danger-bg)';
          statusBadgeEl.style.color = 'var(--danger-text)';
          statusBadgeEl.style.borderColor = 'var(--danger-border)';
          statusBadgeEl.style.display = 'inline-block';
        }
        if (problemsListEl) {
          problemsListEl.innerHTML = '';
          for (const p of problems) {
            const itemEl = document.createElement('div');
            itemEl.className = 'health-problem';
            itemEl.setAttribute('data-level', p.level || 'warn');
            itemEl.textContent = p.msg;
            problemsListEl.appendChild(itemEl);
          }
          problemsListEl.style.display = 'block';
        }
      }
    }

    function stopTimer() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    function clearUI() {
      lastDataJson = '';
      const verEl = getEl(versionId);
      if (verEl) verEl.textContent = '';
      const statusBadgeEl = getEl(statusBadgeId);
      if (statusBadgeEl) {
        statusBadgeEl.textContent = '正常';
        statusBadgeEl.style.background = 'var(--success-bg)';
        statusBadgeEl.style.color = 'var(--success-text)';
        statusBadgeEl.style.borderColor = 'var(--success-border)';
      }
      const problemsListEl = getEl(problemsListId);
      if (problemsListEl) {
        problemsListEl.innerHTML = '';
        problemsListEl.style.display = 'none';
      }
      const extraInfoEl = getEl(extraInfoId);
      if (extraInfoEl) {
        extraInfoEl.textContent = '';
        extraInfoEl.style.display = 'none';
      }
    }

    function start() {
      isRunning = true;
      stopTimer();
      fetchHealth();
      timer = setInterval(fetchHealth, intervalMs);
    }

    function stop() {
      isRunning = false;
      stopTimer();
      clearUI();
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        stopTimer();
      } else if (isRunning) {
        fetchHealth();
        stopTimer();
        timer = setInterval(fetchHealth, intervalMs);
      }
    });

    return { start, stop };
  }

  /**
   * 3. 工作人員管理面板
   * @param {Object} options
   *   ids: { refresh?, addName?, addRole?, addBtn?, pinBox?, pinShow?, pinDone?, msg?, list? }
   *   getPin: () => string
   * @returns {{ refresh: () => Promise<void>, stop: () => void }}
   */
  function mountStaff(options = {}) {
    const {
      ids = {},
      getPin
    } = options;

    const refreshId = ids.refresh || ids.staffRefresh || 'staffRefresh';
    const addNameId = ids.addName || ids.staffAddName || 'staffAddName';
    const addRoleId = ids.addRole || ids.staffAddRole || 'staffAddRole';
    const addBtnId = ids.addBtn || ids.staffAddBtn || 'staffAddBtn';
    const pinBoxId = ids.pinBox || ids.staffPinBox || 'staffPinBox';
    const pinShowId = ids.pinShow || ids.staffPinShow || 'staffPinShow';
    const pinDoneId = ids.pinDone || ids.staffPinDone || 'staffPinDone';
    const msgId = ids.msg || ids.staffMsg || 'staffMsg';
    const listId = ids.list || ids.staffList || 'staffList';

    let currentStaffMe = '';
    let isFetching = false;
    let isAdding = false;
    let lastStaffHash = '';

    const getEl = (id) => document.getElementById(id);

    function showStaffMsg(text, isError = true) {
      const msgEl = getEl(msgId);
      if (msgEl) {
        msgEl.textContent = text;
        msgEl.className = isError ? 'msg-box error' : 'msg-box success';
        msgEl.style.display = 'block';
      }
    }

    function hideStaffMsg() {
      const msgEl = getEl(msgId);
      if (msgEl) {
        msgEl.textContent = '';
        msgEl.style.display = 'none';
      }
    }

    function showNewPin(pin) {
      const pinShowEl = getEl(pinShowId);
      const pinBoxEl = getEl(pinBoxId);
      if (pinShowEl) pinShowEl.textContent = pin;
      if (pinBoxEl) pinBoxEl.style.display = 'block';
    }

    function handlePinDone() {
      const pinShowEl = getEl(pinShowId);
      const pinBoxEl = getEl(pinBoxId);
      if (pinShowEl) pinShowEl.textContent = '';
      if (pinBoxEl) pinBoxEl.style.display = 'none';
    }

    async function fetchStaffList() {
      const pin = typeof getPin === 'function' ? getPin() : '';
      if (!pin) return;
      hideStaffMsg();
      if (isFetching) return;
      isFetching = true;

      const refreshBtnEl = getEl(refreshId);
      if (refreshBtnEl) refreshBtnEl.disabled = true;

      try {
        const res = await callApi('/api/admin/staff_list', { staff_pin: pin });
        if (res.me) {
          currentStaffMe = res.me;
        }
        renderStaffList(res.staff);
      } catch (err) {
        console.error('fetchStaffList error:', err);
        showStaffMsg(err.message || '讀取工作人員清單失敗', true);
      } finally {
        isFetching = false;
        if (refreshBtnEl) refreshBtnEl.disabled = false;
      }
    }

    function renderStaffList(staff) {
      const listEl = getEl(listId);
      if (!listEl) return;

      const staffHash = JSON.stringify({ me: currentStaffMe, staff });
      if (staffHash === lastStaffHash) return; // 清單內容沒變就不重畫
      lastStaffHash = staffHash;

      if (!Array.isArray(staff) || staff.length === 0) {
        listEl.innerHTML = '<div class="empty-state-sm" style="color: var(--text-secondary); font-size: 0.85rem; padding: 12px; text-align: center;">目前無工作人員名單</div>';
        return;
      }

      listEl.innerHTML = '';
      for (const item of staff) {
        const rowEl = document.createElement('div');
        rowEl.className = `staff-row${item.active ? '' : ' staff-disabled'}`;
        rowEl.setAttribute('data-id', item.id);

        const isMe = (item.id === currentStaffMe);
        const roleText = (item.role === 'admin' ? '主辦' : '裁判');

        // 左側資訊區
        const infoDiv = document.createElement('div');
        infoDiv.style.display = 'flex';
        infoDiv.style.alignItems = 'center';
        infoDiv.style.flexWrap = 'wrap';
        infoDiv.style.gap = '8px';

        const idSpan = document.createElement('strong');
        idSpan.style.color = 'var(--text-primary)';
        idSpan.style.fontSize = '1rem';
        idSpan.textContent = item.id;
        infoDiv.appendChild(idSpan);

        const nameSpan = document.createElement('span');
        nameSpan.style.fontWeight = '700';
        nameSpan.style.color = 'var(--text-primary)';
        nameSpan.textContent = item.name;
        infoDiv.appendChild(nameSpan);

        if (isMe) {
          const meBadge = document.createElement('span');
          meBadge.className = 'badge';
          meBadge.style.cssText = 'background: rgba(239, 125, 0, 0.2); color: var(--accent-text); padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; border: 1px solid rgba(239, 125, 0, 0.4);';
          meBadge.textContent = '你';
          infoDiv.appendChild(meBadge);
        }

        const roleBadge = document.createElement('span');
        roleBadge.className = 'badge';
        roleBadge.style.cssText = 'background: var(--card-bg); color: var(--text-secondary); border: 1px solid var(--card-border); padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;';
        roleBadge.textContent = roleText;
        infoDiv.appendChild(roleBadge);

        if (!item.active) {
          const disabledBadge = document.createElement('span');
          disabledBadge.className = 'badge';
          disabledBadge.style.cssText = 'background: var(--danger-bg); color: var(--danger-text); border: 1px solid var(--danger-border); padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700;';
          disabledBadge.textContent = '停用';
          infoDiv.appendChild(disabledBadge);
        }

        rowEl.appendChild(infoDiv);

        // 右側操作區
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'staff-row-actions';

        // 停用 / 恢復按鈕
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = `btn ${item.active ? 'btn-warning staff-disable' : 'btn-success staff-enable'}`;
        toggleBtn.textContent = item.active ? '停用' : '恢復';
        toggleBtn.addEventListener('click', async () => {
          const pin = typeof getPin === 'function' ? getPin() : '';
          if (item.active) {
            const ok = await confirmDialog({
              title: '停用工作人員確認',
              message: `確定要停用「${item.name}」嗎？停用後該 PIN 碼將無法登入。`,
              yes: '確認執行',
              no: '取消',
              danger: true
            });
            if (!ok) return;
            hideStaffMsg();
            try {
              const res = await callApi('/api/admin/staff_set', {
                staff_pin: pin,
                id: item.id,
                action: 'disable'
              });
              renderStaffList(res.staff);
            } catch (err) {
              console.error('disable staff error:', err);
              showStaffMsg(err.message || '停用失敗', true);
            }
          } else {
            const ok = await confirmDialog({
              title: '恢復工作人員確認',
              message: `確定要恢復「${item.name}」的權限嗎？`,
              yes: '確認執行',
              no: '取消'
            });
            if (!ok) return;
            hideStaffMsg();
            try {
              const res = await callApi('/api/admin/staff_set', {
                staff_pin: pin,
                id: item.id,
                action: 'enable'
              });
              renderStaffList(res.staff);
            } catch (err) {
              console.error('enable staff error:', err);
              showStaffMsg(err.message || '恢復失敗', true);
            }
          }
        });
        actionsDiv.appendChild(toggleBtn);

        // 改角色按鈕
        const roleBtn = document.createElement('button');
        roleBtn.type = 'button';
        roleBtn.className = 'btn btn-secondary staff-role';
        const nextRole = (item.role === 'admin' ? 'judge' : 'admin');
        const nextRoleLabel = (nextRole === 'admin' ? '主辦' : '裁判');
        roleBtn.textContent = `改為${nextRoleLabel}`;
        roleBtn.addEventListener('click', async () => {
          const pin = typeof getPin === 'function' ? getPin() : '';
          const ok = await confirmDialog({
            title: '變更角色確認',
            message: `確定要將「${item.name}」的角色變更為${nextRoleLabel}嗎？`,
            yes: '確認執行',
            no: '取消'
          });
          if (!ok) return;
          hideStaffMsg();
          try {
            const res = await callApi('/api/admin/staff_set', {
              staff_pin: pin,
              id: item.id,
              action: 'set_role',
              role: nextRole
            });
            renderStaffList(res.staff);
          } catch (err) {
            console.error('set_role staff error:', err);
            showStaffMsg(err.message || '變更角色失敗', true);
          }
        });
        actionsDiv.appendChild(roleBtn);

        // 重設 PIN 按鈕
        const pinResetBtn = document.createElement('button');
        pinResetBtn.type = 'button';
        pinResetBtn.className = 'btn btn-secondary staff-pinreset';
        pinResetBtn.textContent = '重設 PIN';
        pinResetBtn.addEventListener('click', async () => {
          const pin = typeof getPin === 'function' ? getPin() : '';
          const ok = await confirmDialog({
            title: '重設 PIN 碼確認',
            message: `確定要重設「${item.name}」的 PIN 碼嗎？舊 PIN 將立即失效。`,
            yes: '確認執行',
            no: '取消',
            danger: true
          });
          if (!ok) return;
          hideStaffMsg();
          try {
            const res = await callApi('/api/admin/staff_pin_reset', {
              staff_pin: pin,
              id: item.id
            });
            showNewPin(res.pin);
            await fetchStaffList();
          } catch (err) {
            console.error('staff_pin_reset error:', err);
            showStaffMsg(err.message || '重設 PIN 失敗', true);
          }
        });
        actionsDiv.appendChild(pinResetBtn);

        // 移除按鈕
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn btn-danger staff-remove';
        removeBtn.textContent = '移除';
        removeBtn.addEventListener('click', async () => {
          const pin = typeof getPin === 'function' ? getPin() : '';
          const ok = await confirmDialog({
            title: '移除工作人員確認',
            message: `確定要移除「${item.name}」嗎？移除後將刪除此工作人員紀錄。`,
            yes: '確認執行',
            no: '取消',
            danger: true
          });
          if (!ok) return;
          hideStaffMsg();
          try {
            const res = await callApi('/api/admin/staff_set', {
              staff_pin: pin,
              id: item.id,
              action: 'remove'
            });
            renderStaffList(res.staff);
          } catch (err) {
            console.error('remove staff error:', err);
            showStaffMsg(err.message || '移除失敗', true);
          }
        });
        actionsDiv.appendChild(removeBtn);

        rowEl.appendChild(actionsDiv);
        listEl.appendChild(rowEl);
      }
    }

    async function handleAddStaff() {
      const addBtnEl = getEl(addBtnId);
      if (isAdding || (addBtnEl && addBtnEl.disabled)) return;
      hideStaffMsg();

      const nameInput = getEl(addNameId);
      const roleSelect = getEl(addRoleId);
      const name = (nameInput ? nameInput.value : '').trim();
      const role = (roleSelect ? roleSelect.value : 'judge');

      if (!name) {
        showStaffMsg('請輸入工作人員姓名', true);
        return;
      }

      const pin = typeof getPin === 'function' ? getPin() : '';
      isAdding = true;
      const origText = addBtnEl ? addBtnEl.textContent : '';
      if (addBtnEl) {
        addBtnEl.disabled = true;
        addBtnEl.textContent = '新增中…';
      }

      try {
        const res = await callApi('/api/admin/staff_add', {
          staff_pin: pin,
          name,
          role
        });
        if (nameInput) nameInput.value = '';
        showNewPin(res.pin);
        if (res.staff) {
          renderStaffList(res.staff);
        } else {
          await fetchStaffList();
        }
      } catch (err) {
        console.error('staff_add error:', err);
        showStaffMsg(err.message || '新增工作人員失敗', true);
      } finally {
        isAdding = false;
        if (addBtnEl) {
          addBtnEl.disabled = false;
          addBtnEl.textContent = origText;
        }
      }
    }

    function stop() {
      lastStaffHash = '';
      const listEl = getEl(listId);
      if (listEl) {
        listEl.innerHTML = '<div class="empty-state-sm" style="color: var(--text-secondary); font-size: 0.85rem; padding: 12px; text-align: center;">請點擊「重新整理清單」載入工作人員</div>';
      }
      handlePinDone();
      hideStaffMsg();
      const nameInput = getEl(addNameId);
      if (nameInput) nameInput.value = '';
    }

    function initListeners() {
      const refreshBtnEl = getEl(refreshId);
      const addBtnEl = getEl(addBtnId);
      const addNameEl = getEl(addNameId);
      const pinDoneBtnEl = getEl(pinDoneId);

      if (refreshBtnEl) {
        refreshBtnEl.addEventListener('click', fetchStaffList);
      }
      if (addBtnEl) {
        addBtnEl.addEventListener('click', handleAddStaff);
      }
      if (addNameEl) {
        addNameEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') handleAddStaff();
        });
      }
      if (pinDoneBtnEl) {
        pinDoneBtnEl.addEventListener('click', handlePinDone);
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initListeners);
    } else {
      initListeners();
    }

    return { refresh: fetchStaffList, stop };
  }

  /**
   * 4. 結束賽事面板
   * @param {Object} options
   *   ids: { btn?, msg? }
   *   getPin: () => string
   *   onFinished: () => Promise<void>|void
   *   confirmTitle?: string
   *   confirmMessage?: string
   * @returns {{ finish: () => Promise<void> }}
   */
  function mountFinish(options = {}) {
    const {
      ids = {},
      getPin,
      onFinished,
      confirmTitle = '結束賽事確認',
      confirmMessage
    } = options;

    const btnId = ids.btn || ids.finishBtn || 'finishBtn';
    const msgId = ids.msg || ids.finishMsg || 'finishMsg';

    const getEl = (id) => document.getElementById(id);

    const defaultMsg = (btnId === 'eaFinish')
      ? '確定要結束整場賽事嗎？結束後就不能再報分。'
      : '確定要結束整場賽事嗎？此操作將賽事狀態設為已結束（done）。';
    const finalConfirmMsg = confirmMessage || defaultMsg;

    async function triggerFinish() {
      const msgEl = getEl(msgId);
      if (msgEl) {
        msgEl.textContent = '';
        msgEl.style.display = 'none';
      }

      const ok = await confirmDialog({
        title: confirmTitle,
        message: finalConfirmMsg,
        yes: '確認執行',
        no: '取消',
        danger: true
      });
      if (!ok) return;

      const pin = typeof getPin === 'function' ? getPin() : '';
      try {
        await callApi('/api/admin/finish', { staff_pin: pin });
        if (msgEl) {
          msgEl.textContent = '賽事已正式結束';
          msgEl.className = 'msg-box success';
          msgEl.style.display = 'block';
        }
        if (typeof onFinished === 'function') {
          await onFinished();
        }
      } catch (err) {
        console.error('finish error:', err);
        if (msgEl) {
          msgEl.textContent = err.message || '結束賽事失敗';
          msgEl.className = 'msg-box error';
          msgEl.style.display = 'block';
        }
      }
    }

    function initListeners() {
      const btnEl = getEl(btnId);
      if (btnEl) {
        btnEl.addEventListener('click', triggerFinish);
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initListeners);
    } else {
      initListeners();
    }

    return { finish: triggerFinish };
  }

  /**
   * 5. 選手協助面板 (重設 PIN、解鎖選手)
   * @param {Object} options
   *   ids: { playerId, resetBtn, unlockBtn, pinDisplay, pinDone, msg, pinBox? }
   *   getPin: () => string
   * @returns {{ clear: () => void }}
   */
  function mountPlayerAssist(options = {}) {
    const {
      ids = {},
      getPin
    } = options;

    const playerIdId = ids.playerId || 'playerId';
    const resetBtnId = ids.resetBtn || 'pinResetBtn';
    const unlockBtnId = ids.unlockBtn || 'unlockBtn';
    const pinDisplayId = ids.pinDisplay || 'newPinDisplay';
    const pinDoneId = ids.pinDone || 'newPinDone';
    const msgId = ids.msg || 'assistMsg';
    const pinBoxId = ids.pinBox;

    let isResetting = false;
    let isUnlocking = false;

    const getEl = (id) => id ? document.getElementById(id) : null;

    function showAssistMsg(text, isError = true) {
      const msgEl = getEl(msgId);
      if (msgEl) {
        msgEl.textContent = text;
        msgEl.className = isError ? 'msg-box error' : 'msg-box success';
        msgEl.style.display = 'block';
      }
    }

    function hideAssistMsg() {
      const msgEl = getEl(msgId);
      if (msgEl) {
        msgEl.textContent = '';
        msgEl.style.display = 'none';
      }
    }

    function showNewPin(pin) {
      const pinBoxEl = getEl(pinBoxId);
      const pinDisplayEl = getEl(pinDisplayId);
      const pinDoneEl = getEl(pinDoneId);

      if (pinBoxEl) {
        if (pinDisplayEl) pinDisplayEl.textContent = pin;
        pinBoxEl.style.display = 'block';
      } else {
        if (pinDisplayEl) {
          pinDisplayEl.textContent = `新 PIN：${pin}`;
          pinDisplayEl.style.display = 'block';
        }
        if (pinDoneEl) {
          pinDoneEl.style.display = 'inline-flex';
        }
      }
    }

    function handlePinDone() {
      const pinBoxEl = getEl(pinBoxId);
      const pinDisplayEl = getEl(pinDisplayId);
      const pinDoneEl = getEl(pinDoneId);

      if (pinDisplayEl) {
        pinDisplayEl.textContent = '';
        if (!pinBoxEl) {
          pinDisplayEl.style.display = 'none';
        }
      }
      if (pinBoxEl) {
        pinBoxEl.style.display = 'none';
      }
      if (!pinBoxEl && pinDoneEl) {
        pinDoneEl.style.display = 'none';
      }
    }

    async function handleResetPin() {
      const resetBtnEl = getEl(resetBtnId);
      if (isResetting || (resetBtnEl && resetBtnEl.disabled)) return;
      hideAssistMsg();

      const pidEl = getEl(playerIdId);
      const pid = (pidEl ? pidEl.value : '').trim().toUpperCase();
      if (!pid) {
        showAssistMsg('請輸入選手編號', true);
        return;
      }

      const ok = await confirmDialog({
        title: '重設選手 PIN 確認',
        message: `確定要重設選手 ${pid} 的 PIN 碼嗎？舊 PIN 將立即失效。`,
        yes: '確認執行',
        no: '取消',
        danger: true
      });
      if (!ok) return;

      const pin = typeof getPin === 'function' ? getPin() : '';
      isResetting = true;
      const origText = resetBtnEl ? resetBtnEl.textContent : '';
      if (resetBtnEl) {
        resetBtnEl.disabled = true;
        resetBtnEl.textContent = '重設中…';
      }

      try {
        const res = await callApi('/api/staff/player_pin_reset', {
          staff_pin: pin,
          player_id: pid
        });
        showNewPin(res.pin);
        showAssistMsg(`選手 ${pid} PIN 已重設，請口述給選手抄寫`, false);
      } catch (err) {
        console.error('player_pin_reset error:', err);
        showAssistMsg(err.message || '重設 PIN 失敗', true);
      } finally {
        isResetting = false;
        if (resetBtnEl) {
          resetBtnEl.disabled = false;
          resetBtnEl.textContent = origText;
        }
      }
    }

    async function handleUnlock() {
      const unlockBtnEl = getEl(unlockBtnId);
      if (isUnlocking || (unlockBtnEl && unlockBtnEl.disabled)) return;
      hideAssistMsg();

      const pidEl = getEl(playerIdId);
      const pid = (pidEl ? pidEl.value : '').trim().toUpperCase();
      if (!pid) {
        showAssistMsg('請輸入選手編號', true);
        return;
      }

      const pin = typeof getPin === 'function' ? getPin() : '';
      isUnlocking = true;
      const origText = unlockBtnEl ? unlockBtnEl.textContent : '';
      if (unlockBtnEl) {
        unlockBtnEl.disabled = true;
        unlockBtnEl.textContent = '解鎖中…';
      }

      try {
        await callApi('/api/staff/player_unlock', {
          staff_pin: pin,
          player_id: pid
        });
        showAssistMsg(`選手 ${pid} 已成功解鎖`, false);
      } catch (err) {
        console.error('player_unlock error:', err);
        showAssistMsg(err.message || '解鎖失敗', true);
      } finally {
        isUnlocking = false;
        if (unlockBtnEl) {
          unlockBtnEl.disabled = false;
          unlockBtnEl.textContent = origText;
        }
      }
    }

    function clear() {
      handlePinDone();
      hideAssistMsg();
      const pidEl = getEl(playerIdId);
      if (pidEl) {
        pidEl.value = '';
      }
    }

    function initListeners() {
      const resetBtnEl = getEl(resetBtnId);
      const unlockBtnEl = getEl(unlockBtnId);
      const pinDoneEl = getEl(pinDoneId);

      if (resetBtnEl) {
        resetBtnEl.addEventListener('click', handleResetPin);
      }
      if (unlockBtnEl) {
        unlockBtnEl.addEventListener('click', handleUnlock);
      }
      if (pinDoneEl) {
        pinDoneEl.addEventListener('click', handlePinDone);
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initListeners);
    } else {
      initListeners();
    }

    return { clear };
  }

  /**
   * 台灣時間 (Asia/Taipei) 轉為 datetime-local 輸入框格式 YYYY-MM-DDTHH:mm
   * @param {number|null} ms Unix 毫秒
   * @returns {string}
   */
  function msToDateTimeLocalTW(ms) {
    if (!ms) return '';
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      const parts = formatter.formatToParts(new Date(ms));
      const p = {};
      for (const part of parts) {
        p[part.type] = part.value;
      }
      const hour = p.hour === '24' ? '00' : p.hour;
      return `${p.year}-${p.month}-${p.day}T${hour}:${p.minute}`;
    } catch (e) {
      console.error('msToDateTimeLocalTW error:', e);
      try {
        const d = new Date(ms);
        return d.toISOString().slice(0, 16);
      } catch (err2) {
        console.error('msToDateTimeLocalTW fallback error:', err2);
        return '';
      }
    }
  }

  /**
   * 將 datetime-local 輸入值（假設為台灣時間 Asia/Taipei）轉為 Unix 毫秒
   * @param {string} val YYYY-MM-DDTHH:mm
   * @returns {number|null}
   */
  function dateTimeLocalToMsTW(val) {
    if (!val) return null;
    const parsed = Date.parse(val + ':00+08:00');
    return isNaN(parsed) ? null : parsed;
  }

  /**
   * 格式化台灣時間為 MM/DD HH:mm 字串（或「到賽事開始為止」）
   * @param {number|null} ms
   * @returns {string}
   */
  function formatDateTimeTW(ms) {
    if (!ms) return '到賽事開始為止';
    try {
      return new Intl.DateTimeFormat('zh-TW', {
        timeZone: 'Asia/Taipei',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(new Date(ms));
    } catch (e) {
      console.error('formatDateTimeTW error:', e);
      if (typeof formatTimeHHMM === 'function') {
        return formatTimeHHMM(ms);
      }
      return '';
    }
  }

  /**
   * 6. 牌表鎖定方式與截止時間面板 (DATA-CONTRACT 10.5)
   * @param {Object} options
   *   ids: { section?, lock?, deadline?, clear?, save?, msg? }
   *   getPin: () => string
   *   readConfig: (snapshot: any) => { required: boolean, lock?: string, deadline_at?: number|null }
   *   afterSave?: (res: any) => Promise<void>|void
   * @returns {{ update: (snapshot: any) => void, reset: () => void }}
   */
  function mountDeckConfig(options = {}) {
    const {
      ids = {},
      getPin,
      readConfig,
      afterSave
    } = options;

    const sectionId = ids.section || 'adminDeckSection';
    const lockId = ids.lock || 'adminDeckLock';
    const deadlineId = ids.deadline || 'adminDeckDeadline';
    const clearId = ids.clear || 'adminDeckClear';
    const saveId = ids.save || 'adminDeckSave';
    const msgId = ids.msg || 'adminDeckMsg';

    let userDirty = false;
    let isSaving = false;

    const getEl = (id) => id ? document.getElementById(id) : null;

    function showMsg(text, isError = true) {
      const el = getEl(msgId);
      if (!el) return;
      el.textContent = text;
      el.className = isError ? 'msg-box error' : 'msg-box success';
      el.style.display = 'block';
    }

    function hideMsg() {
      const el = getEl(msgId);
      if (!el) return;
      el.textContent = '';
      el.style.display = 'none';
    }

    function update(snapshot) {
      const sectionEl = getEl(sectionId);
      if (!sectionEl) return;

      const pin = typeof getPin === 'function' ? getPin() : '';
      if (!pin) {
        sectionEl.style.display = 'none';
        return;
      }

      const config = (typeof readConfig === 'function') ? readConfig(snapshot) : null;
      const isReq = Boolean(config && config.required);
      if (!isReq) {
        sectionEl.style.display = 'none';
        return;
      }

      sectionEl.style.display = 'block';

      const lockEl = getEl(lockId);
      const deadlineEl = getEl(deadlineId);
      const hasFocus = (document.activeElement === lockEl || document.activeElement === deadlineEl);

      if (!userDirty && !hasFocus) {
        const lockVal = (config && config.lock) || 'submit';
        if (lockEl) lockEl.value = lockVal;

        const deadlineMs = config ? config.deadline_at : null;
        if (deadlineEl) {
          deadlineEl.value = deadlineMs ? msToDateTimeLocalTW(deadlineMs) : '';
        }
      }
    }

    async function handleSave() {
      if (isSaving) return;
      const pin = typeof getPin === 'function' ? getPin() : '';
      if (!pin) return;

      const lockEl = getEl(lockId);
      const deadlineEl = getEl(deadlineId);
      const newLock = lockEl ? lockEl.value : 'submit';
      const deadlineVal = deadlineEl ? deadlineEl.value.trim() : '';
      const newDeadlineMs = deadlineVal ? dateTimeLocalToMsTW(deadlineVal) : null;

      const lockLabel = newLock === 'deadline' ? '截止前可以修改' : '送出就鎖';
      let deadlineLabel = '到賽事開始為止';
      if (newDeadlineMs) {
        deadlineLabel = formatDateTimeTW(newDeadlineMs);
      }

      const confirmMsg = `確定要儲存牌表設定嗎？\n改成：${lockLabel}，截止時間 ${deadlineLabel}`;

      const ok = await confirmDialog({
        title: '變更牌表設定確認',
        message: confirmMsg,
        yes: '確認儲存',
        no: '取消'
      });
      if (!ok) return;

      isSaving = true;
      const saveEl = getEl(saveId);
      const origText = saveEl ? saveEl.textContent : '';
      if (saveEl) {
        saveEl.disabled = true;
        saveEl.textContent = '儲存中…';
      }
      hideMsg();

      try {
        const payload = {
          staff_pin: pin,
          lock: newLock,
          deadline_at: newDeadlineMs
        };
        const res = await callApi('/api/admin/decklist_config', payload);
        userDirty = false;
        showMsg('已儲存', false);
        if (typeof afterSave === 'function') {
          await afterSave(res);
        }
      } catch (err) {
        console.error('decklist_config save error:', err);
        showMsg(err.message || '儲存失敗', true);
      } finally {
        isSaving = false;
        if (saveEl) {
          saveEl.disabled = false;
          saveEl.textContent = origText;
        }
      }
    }

    function reset() {
      userDirty = false;
      const sectionEl = getEl(sectionId);
      if (sectionEl) sectionEl.style.display = 'none';
      hideMsg();
    }

    function initListeners() {
      const lockEl = getEl(lockId);
      if (lockEl) {
        lockEl.addEventListener('change', () => { userDirty = true; });
      }
      const deadlineEl = getEl(deadlineId);
      if (deadlineEl) {
        deadlineEl.addEventListener('input', () => { userDirty = true; });
        deadlineEl.addEventListener('change', () => { userDirty = true; });
      }
      const clearEl = getEl(clearId);
      if (clearEl) {
        clearEl.addEventListener('click', () => {
          const dlEl = getEl(deadlineId);
          if (dlEl) {
            dlEl.value = '';
          }
          userDirty = true;
        });
      }
      const saveEl = getEl(saveId);
      if (saveEl) {
        saveEl.addEventListener('click', handleSave);
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initListeners);
    } else {
      initListeners();
    }

    return { update, reset };
  }

  /**
   * 7. 抽驗牌面板 (DATA-CONTRACT 6.2, 10.4)
   * @param {Object} options
   *   ids: { section?, percent?, btn, msg, list }
   *   getPin: () => string
   *   readRequired?: (snapshot: any) => boolean
   *   renderResult: (res: any, listEl: HTMLElement) => void
   *   successText?: (res: any) => string
   *   emptyText?: (res: any) => string
   * @returns {{ update: (snapshot: any) => void, reset: () => void, sample: () => Promise<void> }}
   */
  function mountDeckSample(options = {}) {
    const {
      ids = {},
      getPin,
      readRequired,
      renderResult,
      successText,
      emptyText
    } = options;

    const sectionId = ids.section;
    const percentId = ids.percent;
    const btnId = ids.btn;
    const msgId = ids.msg;
    const listId = ids.list;

    let isSampling = false;

    const getEl = (id) => id ? document.getElementById(id) : null;

    function showMsg(text, isError = true) {
      const el = getEl(msgId);
      if (!el) return;
      el.textContent = text;
      el.className = isError ? 'msg-box error' : 'msg-box success';
      el.style.display = 'block';
    }

    function hideMsg() {
      const el = getEl(msgId);
      if (!el) return;
      el.textContent = '';
      el.style.display = 'none';
    }

    function update(snapshot) {
      if (!sectionId) return;
      const sectionEl = getEl(sectionId);
      if (!sectionEl) return;
      const pin = typeof getPin === 'function' ? getPin() : '';
      if (!pin) {
        sectionEl.style.display = 'none';
        return;
      }
      const isReq = typeof readRequired === 'function' ? Boolean(readRequired(snapshot)) : true;
      sectionEl.style.display = isReq ? 'block' : 'none';
    }

    async function doSample() {
      if (isSampling) return;
      const btnEl = getEl(btnId);
      if (btnEl && btnEl.disabled) return;
      const pin = typeof getPin === 'function' ? getPin() : '';
      if (!pin) return;

      hideMsg();
      const listEl = getEl(listId);
      const percentEl = getEl(percentId);

      const reqBody = { staff_pin: pin };
      if (percentId && percentEl) {
        let percent = parseInt(percentEl.value, 10);
        if (isNaN(percent) || percent <= 0) percent = 10;
        if (percent > 100) percent = 100;
        reqBody.percent = percent;
      }

      isSampling = true;
      const origBtnText = btnEl ? btnEl.textContent : '';
      if (btnEl) {
        btnEl.disabled = true;
        btnEl.textContent = '抽驗中…';
      }

      try {
        const res = await callApi('/api/admin/deck_check_sample', reqBody);
        const sampleTables = (res && Array.isArray(res.tables)) ? res.tables : [];
        if (typeof renderResult === 'function' && listEl) {
          renderResult(res, listEl);
        }
        if (sampleTables.length === 0) {
          if (typeof emptyText === 'function') {
            const text = emptyText(res);
            if (text) showMsg(text, false);
          }
        } else {
          if (typeof successText === 'function') {
            const text = successText(res);
            if (text) showMsg(text, false);
          }
        }
      } catch (err) {
        console.error('deck_check_sample error:', err);
        showMsg(err.message || '抽驗牌失敗', true);
      } finally {
        isSampling = false;
        if (btnEl) {
          btnEl.disabled = false;
          btnEl.textContent = origBtnText;
        }
      }
    }

    function reset() {
      if (sectionId) {
        const sectionEl = getEl(sectionId);
        if (sectionEl) sectionEl.style.display = 'none';
        const listEl = getEl(listId);
        if (listEl) listEl.innerHTML = '';
      }
      hideMsg();
    }

    function initListeners() {
      const btnEl = getEl(btnId);
      if (btnEl) {
        btnEl.addEventListener('click', doSample);
      }
      const percentEl = getEl(percentId);
      if (percentEl) {
        percentEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') doSample();
        });
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initListeners);
    } else {
      initListeners();
    }

    return { update, reset, sample: doSample };
  }

  window.AdminPanels = {
    mountLogin,
    mountHealth,
    mountStaff,
    mountFinish,
    mountPlayerAssist,
    mountDeckConfig,
    mountDeckSample,
    msToDateTimeLocalTW,
    dateTimeLocalToMsTW,
    formatDateTimeTW
  };

})(window);
