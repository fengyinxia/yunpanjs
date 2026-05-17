// ==UserScript==
// @name         夸克网盘HTML5播放器
// @namespace    http://tampermonkey.net/
// @version      1.3.0
// @description  拦截file-click-wrap点击事件，弹出 Video.js 播放器
// @author       Assistant
// @match        https://pan.quark.cn/s/*
// @updateURL    https://raw.githubusercontent.com/fengyinxia/yunpanjs/main/quarkpan/quarkpan_html5_player.user.js
// @downloadURL  https://raw.githubusercontent.com/fengyinxia/yunpanjs/main/quarkpan/quarkpan_html5_player.user.js
// @grant        GM_cookie
// @grant        GM_xmlhttpRequest
// @require      https://vjs.zencdn.net/8.23.4/video.min.js
// @require      https://raw.githubusercontent.com/fengyinxia/yunpanjs/main/quarkpan/qkp-core.js?v=1.3.0
// @require      https://raw.githubusercontent.com/fengyinxia/yunpanjs/main/quarkpan/qkp-ui.js?v=1.3.0
// @require      https://raw.githubusercontent.com/fengyinxia/yunpanjs/main/quarkpan/qkp-share.js?v=1.3.0
// @require      https://raw.githubusercontent.com/fengyinxia/yunpanjs/main/quarkpan/qkp-api.js?v=1.3.0
// @require      https://raw.githubusercontent.com/fengyinxia/yunpanjs/main/quarkpan/qkp-player.js?v=1.3.0
// @require      https://raw.githubusercontent.com/fengyinxia/yunpanjs/main/quarkpan/qkp-interactions.js?v=1.3.0
// @run-at       document-start
// ==/UserScript==

'use strict';

// 等待页面加载完成后初始化交互钩子。
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeInteractionHooks);
} else {
  initializeInteractionHooks();
}

const cookieInitializationTask = initializeGlobalCookie();
initializeAll();

monitorUrlChanges();

if (!window.__kuakePlayerPendingDeleteCleanupInstalled) {
  window.__kuakePlayerPendingDeleteCleanupInstalled = true;
  window.addEventListener("beforeunload", deletePendingTempFilesBeforeUnload);
  window.addEventListener("pagehide", deletePendingTempFilesBeforeUnload);
}

interceptNetworkRequests();

cookieInitializationTask.then(() => {
  fetchSortData();
  console.log("夸克网盘HTML5播放器脚本已加载");
});
