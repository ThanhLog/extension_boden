/**
 * Page Bridge - MAIN world
 * Phát hiện box qua DOM + simulate event để di chuyển/copy/paste
 */
(function () {
  'use strict';

  let hoveredViewport = null;
  let selectedBoxName = null;
  let copiedBoxName = null;

  // ─── Phát hiện viewport đang hover ──────────────────
  function setupViewportTracking() {
    document.addEventListener('mousemove', (e) => {
      if (e.target.tagName !== 'CANVAS') return;
      const engine = e.target.getAttribute('data-engine');
      if (!engine || !engine.includes('three.js')) return;

      const parent = e.target.closest('[class*="overflow-hidden"]');
      if (!parent) { hoveredViewport = 'main'; return; }

      const labelEls = parent.querySelectorAll('div');
      for (const el of labelEls) {
        const text = el.textContent.trim();
        if (text.includes('trên xuống')) { hoveredViewport = 'top'; return; }
        if (text.includes('phía trước')) { hoveredViewport = 'front'; return; }
        if (text.includes('bên')) { hoveredViewport = 'side'; return; }
      }
      if (e.target.closest('.pointcloud-stage')) hoveredViewport = 'main';
    });
  }

  // ─── Phát hiện box được chọn ────────────────────────
  function getSelectedBoxName() {
    // Selector đã test: span.truncate → "轿车#20"
    const el = document.querySelector('span.truncate');
    if (el) {
      const name = el.textContent.trim();
      if (name && name.length > 0 && name.length < 100) return name;
    }
    return null;
  }

  function checkSelection() {
    const name = getSelectedBoxName();
    if (name !== selectedBoxName) {
      selectedBoxName = name;
      if (name) {
        sendToContent({
          type: 'boxSelected',
          boxId: name,
          boxData: { id: name, name: name, position: [0, 0, 0] }
        });
      } else {
        sendToContent({ type: 'boxDeselected' });
      }
    }
  }

  // ─── Lấy canvas đang active ─────────────────────────
  function getActiveCanvas() {
    // Ưu tiên canvas viewport đang hover
    const canvases = document.querySelectorAll('canvas[data-engine*="three.js"]');
    for (const c of canvases) {
      const rect = c.getBoundingClientRect();
      if (rect.width > 100 && rect.height > 100) {
        // Kiểm tra xem có đang ở viewport hover không
        const parent = c.closest('[class*="overflow-hidden"]');
        if (parent) {
          const labelEls = parent.querySelectorAll('div');
          for (const el of labelEls) {
            const text = el.textContent.trim();
            if (hoveredViewport === 'top' && text.includes('trên xuống')) return c;
            if (hoveredViewport === 'front' && text.includes('phía trước')) return c;
            if (hoveredViewport === 'side' && text.includes('bên')) return c;
          }
        }
      }
    }
    // Fallback: canvas lớn nhất
    let best = null, maxArea = 0;
    for (const c of canvases) {
      const rect = c.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area > maxArea) { maxArea = area; best = c; }
    }
    return best;
  }

  // ─── Di chuyển box: simulate drag event ─────────────
  function getPixelOffset(direction, step) {
    const px = step > 0.5 ? 5 : 1; // thường 1px, Shift+Move = 5px
    let dx = 0, dy = 0;

    switch (hoveredViewport) {
      case 'top': // Trên xuống: X/Y trên màn hình
        switch (direction) {
          case 'up': dy = -px; break;
          case 'down': dy = px; break;
          case 'left': dx = -px; break;
          case 'right': dx = px; break;
          default: return null;
        }
        break;
      case 'front': // Phía trước: X/Z
        switch (direction) {
          case 'up': dy = -px; break;    // Z axis trên màn hình
          case 'down': dy = px; break;
          case 'left': dx = -px; break;   // X axis
          case 'right': dx = px; break;
          default: return null;
        }
        break;
      case 'side': // Góc bên: Z/Y
        switch (direction) {
          case 'up': dy = -px; break;
          case 'down': dy = px; break;
          case 'left': dx = -px; break;
          case 'right': dx = px; break;
          default: return null;
        }
        break;
      default: // Main
        switch (direction) {
          case 'up': dy = -px; break;
          case 'down': dy = px; break;
          case 'left': dx = -px; break;
          case 'right': dx = px; break;
          default: return null;
        }
    }
    return { dx, dy };
  }

  function simulateDrag(dx, dy) {
    const canvas = getActiveCanvas();
    if (!canvas) return false;

    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const opts = { bubbles: true, cancelable: true, clientX: cx, clientY: cy };

    // Không dùng PointerEvent vì có thể bị filter - thử MouseEvent
    canvas.dispatchEvent(new MouseEvent('mousedown', opts));
    canvas.dispatchEvent(new MouseEvent('mousemove', { ...opts, clientX: cx + dx, clientY: cy + dy }));
    canvas.dispatchEvent(new MouseEvent('mouseup', { ...opts, clientX: cx + dx, clientY: cy + dy }));

    return true;
  }

  function moveBox(direction, step) {
    checkSelection();
    if (!selectedBoxName) {
      sendToContent({ type: 'toast', message: '⚠️ Chưa chọn box nào' });
      return;
    }
    const offset = getPixelOffset(direction, step || 0.2);
    if (!offset) return;

    if (simulateDrag(offset.dx, offset.dy)) {
      sendToContent({ type: 'boxMoved', boxId: selectedBoxName });
    }
  }

  // ─── Copy box ──────────────────────────────────────
  function copyBox() {
    checkSelection();
    if (!selectedBoxName) {
      sendToContent({ type: 'toast', message: '⚠️ Chưa chọn box nào để copy' });
      return;
    }
    copiedBoxName = selectedBoxName;
    sendToContent({ type: 'toast', message: '📋 Đã copy: ' + selectedBoxName });
    sendToContent({ type: 'boxCopied', boxData: { name: selectedBoxName } });
  }

  // ─── Paste box ─────────────────────────────────────
  function pasteBox() {
    if (!copiedBoxName) {
      sendToContent({ type: 'toast', message: '⚠️ Chưa copy box nào (Ctrl+C trước)' });
      return;
    }
    // Simulate Ctrl+V trên canvas - app có thể có handler riêng
    const canvas = getActiveCanvas();
    if (canvas) {
      canvas.focus();
      canvas.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'v', ctrlKey: true, metaKey: true,
        bubbles: true, cancelable: true
      }));
    }
    sendToContent({ type: 'toast', message: '✅ Đã paste: ' + copiedBoxName });
    sendToContent({ type: 'boxPasted', boxData: { name: copiedBoxName } });
  }

  // ─── Xóa box ──────────────────────────────────────
  function deleteBox() {
    checkSelection();
    if (!selectedBoxName) {
      sendToContent({ type: 'toast', message: '⚠️ Chưa chọn box nào để xóa' });
      return;
    }
    const canvas = getActiveCanvas();
    if (canvas) {
      canvas.focus();
      canvas.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Delete', code: 'Delete', bubbles: true, cancelable: true
      }));
    }
    sendToContent({ type: 'toast', message: '🗑️ Đã gửi lệnh xóa: ' + selectedBoxName });
    sendToContent({ type: 'boxDeleted' });
  }

  // ─── Communication ──────────────────────────────────
  function sendToContent(msg) {
    window.postMessage({ source: 'boden-page-bridge', ...msg }, '*');
  }

  window.addEventListener('message', (event) => {
    if (!event.data || event.data.source !== 'boden-extension') return;
    const msg = event.data;
    switch (msg.action) {
      case 'moveBox':   moveBox(msg.direction, msg.step); break;
      case 'copyBox':   copyBox(); break;
      case 'pasteBox':  pasteBox(); break;
      case 'deleteBox': deleteBox(); break;
      case 'getState':
        checkSelection();
        sendToContent({
          type: 'threeState',
          hasScene: false,
          boxCount: 0,
          hoveredViewport,
          hasSelection: !!selectedBoxName
        });
        break;
    }
  });

  // ─── Selection polling ─────────────────────────────
  setInterval(checkSelection, 300);

  // ─── Init ──────────────────────────────────────────
  setupViewportTracking();
  checkSelection();
  console.log('[BodenBridge] Ready - Event simulation mode');
})();
