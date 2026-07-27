/**
 * Sidebar - Bảng phím tắt & trạng thái
 */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  let state = {
    boxSelected: false,
    boxData: null,
    threeConnected: false,
    boxCount: 0,
    viewport: null
  };

  // ─── Communication ──────────────────────────────────
  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'init':
        break;

      case 'boxSelected':
        state.boxSelected = true;
        state.boxData = msg.boxData;
        renderBox();
        break;

      case 'boxDeselected':
      case 'boxDeleted':
        state.boxSelected = false;
        state.boxData = null;
        renderBox();
        break;

      case 'boxCopied':
        state.lastAction = '📋 Copied: ' + (msg.boxData?.name || '');
        renderStatus();
        break;

      case 'boxPasted':
        state.boxSelected = true;
        state.boxData = msg.boxData;
        state.lastAction = '✅ Pasted';
        renderBox();
        renderStatus();
        break;

      case 'boxMoved':
        if (state.boxData && msg.position) {
          state.boxData.position = msg.position;
          renderBox();
        }
        break;

      case 'boxesUpdated':
        state.boxCount = msg.boxes?.length || 0;
        renderStatus();
        break;

      case 'threeState':
        state.threeConnected = msg.hasScene || false;
        state.boxCount = msg.boxCount || 0;
        state.viewport = msg.hoveredViewport || null;
        renderStatus();
        break;
    }
  });

  function sendToParent(msg) {
    window.parent.postMessage(msg, '*');
  }

  // ─── Render ────────────────────────────────────────
  const viewportNames = {
    top: '📐 Trên xuống',
    front: '📐 Phía trước',
    side: '📐 Góc bên',
    main: '📐 Chính',
    other: '📐 Khác'
  };

  function renderBox() {
    const panel = $('#selectedBoxPanel');
    if (!state.boxSelected || !state.boxData) {
      panel.innerHTML = '<div class="empty-state">Click chọn box trên canvas</div>';
      return;
    }

    const d = state.boxData;
    const pos = d.position || [0, 0, 0];
    panel.innerHTML = `
      <div class="box-info">
        <div class="box-info-row">
          <span class="box-info-label">Tên</span>
          <span class="box-info-value">${esc(d.name || '—')}</span>
        </div>
        <div class="box-info-row">
          <span class="box-info-label">ID</span>
          <span class="box-info-value">${esc(String(d.id || '').slice(0, 12))}</span>
        </div>
        <div class="box-info-row">
          <span class="box-info-label">Vị trí</span>
          <span class="box-info-value">
            X:${pos[0].toFixed(2)} Y:${pos[1].toFixed(2)} Z:${pos[2].toFixed(2)}
          </span>
        </div>
      </div>
    `;
  }

  function renderStatus() {
    // Three.js status
    const dot = $('#statusThreeDot');
    const txt = $('#statusThreeText');
    if (dot) dot.className = 'status-dot' + (state.threeConnected ? ' connected' : '');
    if (txt) txt.textContent = state.threeConnected
      ? 'Đã kết nối Three.js'
      : 'Chưa kết nối Three.js';

    // Box count
    const countEl = $('#statusBoxCount');
    if (countEl) countEl.textContent = state.boxCount;

    // Hovered viewport
    const vpEl = $('#statusViewport');
    if (vpEl) vpEl.textContent = viewportNames[state.viewport] || '—';

    // Last action
    const actEl = $('#statusLastAction');
    if (actEl && state.lastAction) {
      actEl.textContent = state.lastAction;
      setTimeout(() => { state.lastAction = null; if (actEl) actEl.textContent = '—'; }, 2000);
    }
  }

  function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Signal ready
  sendToParent({ type: 'sidebarReady' });
})();
