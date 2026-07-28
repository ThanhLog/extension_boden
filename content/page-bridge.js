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
    const px = step > 0.5 ? 8 : 3; // thường 3px, Shift+Move = 8px
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
    if (!offset) {
      console.log('[BodenBridge] moveBox: no offset for direction', direction);
      return;
    }
    console.log('[BodenBridge] moveBox:', direction, 'offset:', offset, 'viewport:', hoveredViewport);

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

  // ─── Xoay box qua handle cursor-grab ──────────────

  function findRotationHandle() {
    // Tìm thẻ <img class="...cursor-grab!..."> gần canvas đang hover nhất
    const canvas = getActiveCanvas();
    if (!canvas) return null;

    // Đi ngược lên từ canvas qua các parent, tìm trong từng tầng
    let el = canvas;
    while (el && el !== document.body) {
      // Tìm tất cả img cursor-grab trong element hiện tại
      const imgs = el.querySelectorAll('img');
      for (const img of imgs) {
        if (img.classList.contains('cursor-grab!')) return img;
        if (img.className && img.className.includes('cursor-grab')) return img;
      }
      el = el.parentElement;
    }

    // Fallback: quét toàn bộ trang
    const allImgs = document.querySelectorAll('img');
    for (const img of allImgs) {
      if (img.classList.contains('cursor-grab!')) return img;
      if (img.className && img.className.includes('cursor-grab')) return img;
    }
    return null;
  }

  // Hướng drag xoay theo từng góc cam
  function getViewportRotateAxis() {
    // Tất cả viewport đều xoay bằng drag ngang trên handle cursor-grab
    return { useVertical: false };
  }

  function simulateRotateDrag(handle, degrees) {
    const rect = handle.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const axis = getViewportRotateAxis();
    const pixels = Math.round(Math.abs(degrees) * 3);
    let endX = cx, endY = cy;
    if (axis.useVertical) {
      endY = cy + pixels * (degrees > 0 ? -1 : 1);
    } else {
      endX = cx + pixels * (degrees > 0 ? 1 : -1);
    }

    const startOpts = { bubbles: true, cancelable: true, clientX: cx, clientY: cy,
                        screenX: cx, screenY: cy, button: 0, buttons: 1 };
    const endOpts   = { bubbles: true, cancelable: true, clientX: endX, clientY: endY,
                        screenX: endX, screenY: endY, button: 0, buttons: 1 };
    const upOpts    = { bubbles: true, cancelable: true, clientX: endX, clientY: endY,
                        screenX: endX, screenY: endY, button: 0, buttons: 0 };

    // B1: mousedown trên handle
    handle.dispatchEvent(new MouseEvent('mousedown', startOpts));
    try { handle.dispatchEvent(new PointerEvent('pointerdown', startOpts)); } catch(e) {}

    // B2: mousemove + mouseup trên document
    document.dispatchEvent(new MouseEvent('mousemove', endOpts));
    document.dispatchEvent(new MouseEvent('mouseup', upOpts));
    try {
      document.dispatchEvent(new PointerEvent('pointermove', endOpts));
      document.dispatchEvent(new PointerEvent('pointerup', upOpts));
    } catch(e) {}

    return true;
  }

  function rotateBox(direction, step) {
    checkSelection();
    if (!selectedBoxName) {
      sendToContent({ type: 'toast', message: '⚠️ Chưa chọn box nào' });
      return;
    }

    const angle = (step || 0.2) * 5; // ~1° mặc định, ~5° với Shift
    const degrees = direction === 'forward' ? angle : -angle;
    const dirLabel = direction === 'forward' ? '↺' : '↻';

    const handle = findRotationHandle();
    if (handle) {
      simulateRotateDrag(handle, degrees);
      sendToContent({ type: 'toast', message: dirLabel + ' Xoay ' + degrees.toFixed(1) + '°' });
      return;
    }

    if (tryModifyRotationInput(degrees)) {
      sendToContent({ type: 'toast', message: dirLabel + ' Đã xoay: ' + degrees.toFixed(1) + '°' });
      return;
    }

    sendToContent({ type: 'toast', message: '⚠️ Không tìm thấy handle xoay - F12' });
    console.log('[BodenBridge] Rotate failed. Viewport:', hoveredViewport);
  }

  function findRotationInputs() {
    // Tìm các input number có thể liên quan đến rotation
    const inputs = document.querySelectorAll('.n-input-number input, input[type="number"]');
    const results = [];
    for (const input of inputs) {
      const parent = input.closest('.boden-business-panel-card, .n-card, [class*="panel"]');
      if (parent) {
        const label = parent.querySelector('[class*="label"], [class*="title"], .n-form-item-label');
        results.push({
          value: input.value,
          label: label ? label.textContent.trim() : '',
          placeholder: input.placeholder || ''
        });
      }
    }
    return results;
  }

  function tryModifyRotationInput(degrees) {
    // Tìm input rotation Z (xoay trong mặt phẳng nhìn)
    const allInputs = document.querySelectorAll('.n-input-number input, input[type="number"]');
    const inputPairs = [];
    for (const input of allInputs) {
      const wrapper = input.closest('[class*="input-number"], .n-input-number');
      if (wrapper) {
        const parentRow = wrapper.closest('[class*="row"], [class*="item"], .n-form-item');
        if (parentRow) {
          const label = parentRow.querySelector('[class*="label"], [class*="title"]');
          inputPairs.push({
            input,
            label: label ? label.textContent.trim().toLowerCase() : ''
          });
        }
      }
    }
    // Tìm input có label liên quan đến rotation/z
    for (const pair of inputPairs) {
      if (pair.label.includes('rot') || pair.label.includes('xoay') ||
          pair.label.includes('z') || pair.label.includes('quay') ||
          pair.label.includes('rz') || pair.label.includes('yaw')) {
        const currentVal = parseFloat(pair.input.value) || 0;
        pair.input.value = (currentVal + degrees).toFixed(2);
        pair.input.dispatchEvent(new Event('input', { bubbles: true }));
        pair.input.dispatchEvent(new Event('change', { bubbles: true }));
        pair.input.dispatchEvent(new Event('blur', { bubbles: true }));
        return true;
      }
    }
    return false;
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
      case 'rotateBox': rotateBox(msg.direction, msg.step); break;
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
