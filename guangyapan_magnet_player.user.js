// ==UserScript==
// @name         光鸭云盘磁力播放助手
// @namespace    https://www.guangyapan.com/
// @version      0.9.4
// @description  点击 magnet 后解析、保存并播放。
// @author       opencode
// @match        *://*/*
// @require      https://cdn.jsdelivr.net/npm/artplayer@5.4.0/dist/artplayer.js
// @require      https://raw.githubusercontent.com/fengyinxia/guangya/main/gyp-core.js
// @require      https://raw.githubusercontent.com/fengyinxia/guangya/main/gyp-ui.js
// @connect      api.guangyapan.com
// @connect      account.guangyapan.com
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @grant        GM_setClipboard
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  function registerMenuCommands() {
    if (typeof GM_registerMenuCommand !== 'function') {
      return;
    }
    GM_registerMenuCommand('光鸭磁力助手：配置认证', showSettingsModal);
    GM_registerMenuCommand('光鸭磁力助手：同步官网认证', () => syncAuthFromCurrentPage({ showResult: true }));
    GM_registerMenuCommand('光鸭磁力助手：手动解析磁力', showManualMagnetPrompt);
    GM_registerMenuCommand('光鸭磁力助手：清空配置', () => {
      safeGmDelete(CONFIG_KEY);
      showToast('配置已清空', '', 'success');
    });
  }

  function attachClickInterceptor() {
    document.addEventListener(
      'click',
      (event) => {
        if (event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
          return;
        }
        const magnet = findClickedMagnet(event);
        if (!magnet) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        handleMagnet(magnet);
      },
      true,
    );
  }

  registerMenuCommands();
  syncAuthFromCurrentPage({ silent: true });
  installMagnetDecorationObserver();
  attachClickInterceptor();
})();
