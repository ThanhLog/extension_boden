/**
 * Boden Label Assistant - Content Script
 * Phím tắt + sidebar cho trang label BodenAI
 */
(function () {
  'use strict';

  let sidebarVisible = true;
  let sidebarIframe = null;
  let toggleBtn = null;
  let currentViewport = null;

  // ─── Inject Page Bridge (MAIN world) ────────────────
  let pageBridgeReady = false;

  function injectPageBridge() {
    return new Promise((resolve) => {
      // Kiểm tra nếu đã inject rồi (tránh duplicate)
      if (document.getElementById('boden-page-bridge')) {
        pageBridgeReady = true;
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.id = 'boden-page-bridge';
      script.src = chrome.runtime.getURL('content/page-bridge.js');
      script.onload = () => {
        pageBridgeReady = true;
        resolve();
      };
      script.onerror = () => {
        // Retry sau 500ms nếu load thất bại
        setTimeout(() => {
          const retry = document.createElement('script');
          retry.id = 'boden-page-bridge';
          retry.src = chrome.runtime.getURL('content/page-bridge.js');
          retry.onload = () => { pageBridgeReady = true; resolve(); };
          retry.onerror = () => { console.error('[Boden] Page bridge load failed'); resolve(); };
          (document.head || document.documentElement).appendChild(retry);
        }, 500);
      };
      (document.head || document.documentElement).appendChild(script);
    });
  }

  // ─── Keyboard Handler ──────────────────────────────
  function handleKeyDown(e) {
    try {
      // Bỏ qua event synthetic từ page-bridge (tránh vòng lặp)
      if (e._fromExtension) return;
      if (isEditingField(e.target)) return;

      const key = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      const alt = e.altKey;
      const shift = e.shiftKey;

    // ── Camera presets: 1-5 (không modifier) ──
    if (!ctrl && !alt && !shift && key >= '1' && key <= '5') {
      e.preventDefault();
      e.stopPropagation();
      clickCameraPreset(parseInt(key));
      return;
    }

    // ── Frame navigation: , . / ──
    if (!ctrl && !alt) {
      if (key === ',' || key === '<') {
        e.preventDefault(); e.stopPropagation();
        clickFrameButton(shift ? 'first' : 'prev');
        return;
      }
      if (key === '.' || key === '>') {
        e.preventDefault(); e.stopPropagation();
        clickFrameButton(shift ? 'last' : 'next');
        return;
      }
      if (key === '/') {
        e.preventDefault(); e.stopPropagation();
        clickFrameButton('play');
        return;
      }
    }

    // ── Move box: WASD / Arrows ──
    if (!ctrl && !alt) {
      let direction = null;
      switch (key) {
        case 'arrowup': case 'w': direction = 'up'; break;
        case 'arrowdown': case 's': direction = 'down'; break;
        case 'arrowleft': case 'a': direction = 'left'; break;
        case 'arrowright': case 'd': direction = 'right'; break;
        case 'q': direction = 'forward'; break;
        case 'e': direction = 'backward'; break;
      }
      if (direction) {
        e.preventDefault();
        e.stopPropagation();
        if (direction === 'forward' || direction === 'backward') {
          sendToPageBridge({ action: 'rotateBox', direction, step: shift ? 1.0 : 0.2 });
        } else {
          sendToPageBridge({ action: 'moveBox', direction, step: shift ? 1.0 : 0.2 });
        }
        return;
      }
    }

    // ── Copy: Ctrl+C ──
    if (ctrl && !alt && !shift && key === 'c') {
      e.preventDefault();
      e.stopPropagation();
      sendToPageBridge({ action: 'copyBox' });
      return;
    }

    // ── Paste: Ctrl+V ──
    if (ctrl && !alt && !shift && key === 'v') {
      e.preventDefault();
      e.stopPropagation();
      sendToPageBridge({ action: 'pasteBox' });
      return;
    }

    // ── Delete ──
    if (!ctrl && !alt && key === 'delete') {
      e.preventDefault();
      e.stopPropagation();
      sendToPageBridge({ action: 'deleteBox' });
      return;
    }

    // ── Sidebar: Ctrl+B ──
    if (ctrl && !alt && !shift && key === 'b') {
      e.preventDefault();
      e.stopPropagation();
      toggleSidebar();
      return;
    }
    } catch (err) {
      console.error('[Boden] Key handler error:', err.message || err);
    }
  }

  function isEditingField(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (el.isContentEditable) return true;
    // Kiểm tra Naive UI select/input đang focus
    if (el.closest('.n-select') || el.closest('.n-input') ||
        el.closest('.n-base-selection')) return true;
    return false;
  }

  // ─── Camera Presets ────────────────────────────────
  function findCameraPresetButtons() {
    // Tìm trong left panel: container flex chứa 5 nút 1-5
    const containers = document.querySelectorAll('.flex.w-full.h-full');
    for (const container of containers) {
      const children = container.querySelectorAll(':scope > .cursor-pointer');
      if (children.length >= 5) {
        const texts = Array.from(children).map(c => c.textContent.trim());
        if (texts.join('') === '12345') return Array.from(children);
      }
    }
    // Fallback: tìm div có text 1-5 với class cursor-pointer
    const allBtns = document.querySelectorAll('.cursor-pointer.relative.flex-c');
    if (allBtns.length >= 5) {
      const filtered = Array.from(allBtns).filter(el =>
        /^[1-5]$/.test(el.textContent.trim())
      );
      if (filtered.length === 5) return filtered;
    }
    return null;
  }

  function clickCameraPreset(index) {
    const buttons = findCameraPresetButtons();
    if (buttons && buttons[index - 1]) {
      buttons[index - 1].click();
      showToast('📷 Góc cam ' + index);
    } else {
      showToast('⚠️ Không tìm thấy nút góc cam');
    }
  }

  // ─── Frame Navigation ──────────────────────────────
  function findFrameButton(action) {
    const icons = document.querySelectorAll('[data-v-2e205d2c] .boden-icon.cursor-pointer');
    for (const icon of icons) {
      const use = icon.querySelector('use');
      if (!use) continue;
      const href = use.getAttribute('xlink:href') || use.getAttribute('href') || '';
      if (action === 'prev' && href.includes('pre-frame')) return icon;
      if (action === 'next' && href.includes('next-frame')) return icon;
      if (action === 'play' && (href.includes('play') || href.includes('pause'))) return icon;
    }
    return null;
  }

  function clickFrameButton(action) {
    if (action === 'first') {
      // Click vào frame đầu tiên trong timeline
      const firstFrame = document.querySelector('.frame-item');
      if (firstFrame) { firstFrame.click(); showToast('⏮ Frame đầu'); }
      return;
    }
    if (action === 'last') {
      // Click frame cuối
      const allFrames = document.querySelectorAll('.frame-item');
      if (allFrames.length > 0) {
        allFrames[allFrames.length - 1].click();
        showToast('⏭ Frame cuối');
      }
      return;
    }
    const btn = findFrameButton(action);
    if (btn) {
      btn.click();
      const labels = { prev: '⏮', next: '⏭', play: '▶/⏸' };
      showToast(labels[action] + ' Frame: ' + action);
    }
  }

  // ─── Sidebar ───────────────────────────────────────
  function injectSidebar() {
    if (document.getElementById('boden-sidebar-container')) return;

    const container = document.createElement('div');
    container.id = 'boden-sidebar-container';
    container.innerHTML = `
      <div id="boden-sidebar-resize-handle"></div>
      <iframe id="boden-sidebar-iframe" src="${chrome.runtime.getURL('sidebar/sidebar.html')}"></iframe>
    `;
    document.body.appendChild(container);

    toggleBtn = document.createElement('div');
    toggleBtn.id = 'boden-sidebar-toggle';
    toggleBtn.innerHTML = '◀';
    toggleBtn.title = 'Ctrl+B: Đóng/Mở sidebar';
    toggleBtn.addEventListener('click', toggleSidebar);
    document.body.appendChild(toggleBtn);

    sidebarIframe = document.getElementById('boden-sidebar-iframe');

    // Resize
    const handle = document.getElementById('boden-sidebar-resize-handle');
    let resizing = false, startX = 0, startW = 0;
    handle.addEventListener('mousedown', (e) => {
      resizing = true; startX = e.clientX; startW = container.offsetWidth;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!resizing) return;
      container.style.width = Math.max(260, Math.min(500, startW + (startX - e.clientX))) + 'px';
    });
    document.addEventListener('mouseup', () => {
      resizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    });

    window.addEventListener('message', handleSidebarMsg);
    sidebarIframe.addEventListener('load', () => {
      sendToSidebar({ type: 'init' });
    });
  }

  function toggleSidebar() {
    sidebarVisible = !sidebarVisible;
    const c = document.getElementById('boden-sidebar-container');
    if (c) c.classList.toggle('boden-hidden', !sidebarVisible);
    if (toggleBtn) toggleBtn.innerHTML = sidebarVisible ? '◀' : '▶';
  }

  function handleSidebarMsg(event) {
    if (!sidebarIframe || event.source !== sidebarIframe.contentWindow) return;
    if (event.data?.type === 'sidebarReady') {
      sendToSidebar({ type: 'init' });
    }
  }

  function sendToSidebar(msg) {
    if (sidebarIframe?.contentWindow) {
      sidebarIframe.contentWindow.postMessage(msg, '*');
    }
  }

  // ─── Page Bridge Communication ─────────────────────
  function sendToPageBridge(msg) {
    window.postMessage({ source: 'boden-extension', ...msg }, '*');
  }

  window.addEventListener('message', (event) => {
    if (!event.data || event.data.source !== 'boden-page-bridge') return;
    const msg = event.data;

    switch (msg.type) {
      case 'boxSelected':
        sendToSidebar({ type: 'boxSelected', boxId: msg.boxId, boxData: msg.boxData });
        break;
      case 'boxDeselected':
        sendToSidebar({ type: 'boxDeselected' });
        break;
      case 'boxCopied':
        sendToSidebar({ type: 'boxCopied', boxData: msg.boxData });
        break;
      case 'boxPasted':
        sendToSidebar({ type: 'boxPasted', boxData: msg.boxData });
        break;
      case 'boxDeleted':
        sendToSidebar({ type: 'boxDeleted' });
        break;
      case 'boxesUpdated':
        sendToSidebar({ type: 'boxesUpdated', boxes: msg.boxes });
        break;
      case 'threeState':
        sendToSidebar({ type: 'threeState', ...msg });
        break;
      case 'boxMoved':
        sendToSidebar({ type: 'boxMoved', boxId: msg.boxId, position: msg.position });
        break;
      case 'toast':
        showToast(msg.message);
        break;
    }
  });

  // ─── Viewport hover tracking ──────────────────────
  function setupViewportLabels() {
    // Gửi tên viewport đang hover đến sidebar mỗi 500ms
    setInterval(() => {
      sendToPageBridge({ action: 'getState' });
    }, 500);
  }

  // ─── Toast ─────────────────────────────────────────
  function showToast(msg) {
    let toast = document.getElementById('boden-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'boden-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('boden-toast-show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => toast.classList.remove('boden-toast-show'), 1500);
  }

  // ─── Init ──────────────────────────────────────────
  let _initialized = false;

  function init() {
    if (_initialized) {
      console.log('[Boden] Already initialized, skipping duplicate');
      return;
    }
    _initialized = true;

    // Inject page bridge (fire-and-forget, không cần await)
    injectPageBridge();

    // Inject sidebar
    injectSidebar();
    setupViewportLabels();

    // Luôn lắng nghe keydown — các hàm DOM-dependent sẽ tự fallback
    document.addEventListener('keydown', handleKeyDown, true);
    console.log('🎮 Boden Label Assistant ready');
    console.log('  1-5       : Camera presets');
    console.log('  , . /     : Frame trước/sau/play');
    console.log('  < >       : Frame đầu/cuối (Shift)');
    console.log('  WASD/Arrows: Di chuyển box (3px, Shift=8px)');
    console.log('  Q/E       : Xoay box (theo góc cam)');
    console.log('  Ctrl+C/V  : Copy/Paste box');
    console.log('  Delete    : Xóa box');
    console.log('  Ctrl+B    : Sidebar');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
