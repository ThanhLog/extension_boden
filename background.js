// Service worker - Boden Label Assistant
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('🎮 Boden Label Assistant installed');
    console.log('  1-5       : Góc cam');
    console.log('  WASD/Arrows: Di chuyển box');
    console.log('  Q/E       : Xoay box');
    console.log('  Ctrl+C    : Copy box');
    console.log('  Ctrl+V    : Paste box');
    console.log('  Delete    : Xóa box');
    console.log('  Ctrl+B    : Sidebar');
  }
});
