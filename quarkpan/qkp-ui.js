// qkp-ui.js
// 样式注入、Toast、播放器模态框和基础 DOM 事件。
// 由 quarkpan_html5_player.user.js 通过 @require 远程加载。

'use strict';

const VIDEOJS_VERSION = "8.23.4";
const VIDEOJS_CSS_URL = `https://vjs.zencdn.net/${VIDEOJS_VERSION}/video-js.min.css`;

const VIDEO_PLAYER_CSS = `
.video-player-modal{position:fixed;inset:0;z-index:10000;display:none;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.68);backdrop-filter:blur(6px)}
.video-player-container{position:relative;width:min(94vw,1480px);height:min(88vh,920px);background:#0f1012;color:#fff;overflow:hidden;border-radius:20px;box-shadow:0 28px 80px rgba(0,0,0,.42),0 0 0 1px rgba(255,255,255,.06)}
.video-player-close{position:absolute;top:11px;right:16px;z-index:10008;display:flex;align-items:center;justify-content:center;min-width:32px;min-height:32px;padding:0;border:none;border-radius:8px;background:transparent;color:rgba(255,255,255,.78);font-size:24px;line-height:1;cursor:pointer;transition:opacity .22s ease,transform .22s ease,background .18s ease,color .18s ease}
.video-player-close:hover{background:rgba(255,255,255,.08);color:#fff}
.video-player-wrapper{width:100%;height:100%}
.player-shell{display:flex;flex-direction:column;width:100%;height:100%;background:#0f1012}
.player-titlebar{position:absolute;top:0;left:0;right:0;z-index:7;display:flex;align-items:center;justify-content:space-between;gap:12px;height:54px;padding:0 56px 0 18px;background:linear-gradient(180deg,rgba(9,10,12,.86) 0%,rgba(9,10,12,.58) 72%,rgba(9,10,12,0) 100%)}
.player-titlebar,.player-bottom-dock,.player-sidebar-toggle{transition:opacity .22s ease,transform .22s ease,background .16s ease,color .16s ease,right .18s ease}
.player-shell.controls-hidden .player-titlebar{opacity:0;transform:translateY(-16px);pointer-events:none}
.video-player-container.controls-hidden .video-player-close{opacity:0;transform:translateY(-16px);pointer-events:none}
.player-meta{display:flex;align-items:center;gap:10px;min-width:0;flex:1}
.player-badge{display:inline-flex;align-items:center;justify-content:center;min-width:36px;height:22px;padding:0 8px;border-radius:11px;background:rgba(255,255,255,.08);color:#d5d8de;font-size:12px;font-weight:500;white-space:nowrap}
.video-player-title{min-width:0;font-size:14px;font-weight:500;line-height:1.2;color:#f5f7fa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.player-subtitle{font-size:12px;line-height:1.4;color:rgba(255,255,255,.44);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.player-titlebar-right{display:flex;align-items:center;gap:10px;color:rgba(255,255,255,.38);font-size:12px}
.player-body{display:flex;flex:1;min-height:0;background:#111214}
.player-body.sidebar-collapsed .player-sidebar{width:0;min-width:0;border-left:none;opacity:0;pointer-events:none;overflow:hidden}
.player-left{display:flex;flex:1;min-width:0;min-height:0;background:#000}
.player-stage{position:relative;display:flex;flex:1;min-width:0;min-height:0;background:#000}
.player-stage-frame{position:relative;display:flex;flex:1;min-width:0;min-height:0;background:#000;overflow:hidden}
.videojs-host{position:relative;flex:1;min-width:0;min-height:0;background:#000}
.videojs-host .video-js,.videojs-host video{width:100%!important;height:100%!important}
.videojs-host .video-js{background:#000!important;color:#fff;font-family:inherit}
.videojs-host .vjs-tech{object-fit:contain}
.videojs-host .vjs-poster{background-size:contain;background-color:#000}
.videojs-host .vjs-big-play-button{display:none!important}
.videojs-host .vjs-loading-spinner,.videojs-host .vjs-control-bar{display:none!important}
.player-control-menu{position:absolute;left:50%;bottom:calc(100% + 8px);display:flex;flex-direction:column;gap:4px;min-width:108px;padding:6px;background:rgba(18,18,20,.92);border:1px solid rgba(255,255,255,.08);border-radius:10px;box-shadow:0 12px 36px rgba(0,0,0,.42);opacity:0;transform:translate(-50%,10px);pointer-events:none;transition:opacity .16s ease,transform .16s ease}
.player-control-menu.show{opacity:1;transform:translate(-50%,0);pointer-events:auto}
.player-control-menu-btn{display:flex;align-items:center;justify-content:flex-start;min-height:34px;padding:0 12px;border:none;border-radius:8px;background:transparent;color:#fff;font:inherit;font-size:13px;cursor:pointer}
.player-control-menu-btn:hover,.player-control-menu-btn.active{background:rgba(255,255,255,.12)}
.player-volume-indicator{position:absolute;left:50%;top:50%;z-index:5;color:#fff;font-size:28px;font-weight:700;line-height:1;letter-spacing:0;font-variant-numeric:tabular-nums;white-space:nowrap;text-shadow:0 2px 12px rgba(0,0,0,.45),0 0 24px rgba(0,0,0,.2);opacity:0;transform:translate(-50%,-50%) scale(.96);pointer-events:none;transition:opacity .16s ease,transform .16s ease}
.player-volume-indicator.show{opacity:1;transform:translate(-50%,-50%) scale(1)}
.player-bottom-dock{position:absolute;left:0;right:0;bottom:0;z-index:6;display:flex;flex-direction:column;gap:12px;padding:18px 22px 18px;background:linear-gradient(180deg,rgba(0,0,0,0) 0%,rgba(0,0,0,.15) 16%,rgba(0,0,0,.78) 100%)}
.player-shell.controls-hidden .player-bottom-dock{opacity:0;transform:translateY(18px);pointer-events:none}
.player-progress-row{display:flex;align-items:center;gap:12px}
.player-progress-time{flex:none;min-width:40px;color:#fff;font-size:12px;line-height:1;text-align:center}
.player-progress-slider{flex:1;min-width:80px;height:4px;margin:0;appearance:none;border-radius:999px;background:linear-gradient(90deg,#fff 0%,#fff 0%,rgba(255,255,255,.22) 0%,rgba(255,255,255,.22) 100%);outline:none;cursor:pointer}
.player-progress-slider::-webkit-slider-thumb{appearance:none;width:12px;height:12px;border-radius:50%;background:#fff;border:none;box-shadow:0 2px 8px rgba(0,0,0,.3)}
.player-progress-slider::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:#fff;border:none;box-shadow:0 2px 8px rgba(0,0,0,.3)}
.player-progress-slider::-moz-range-track{height:4px;border:none;border-radius:999px;background:transparent}
.player-actions-row{position:relative;display:flex;align-items:center;justify-content:space-between;gap:18px}
.player-action-group{display:flex;align-items:center;gap:6px;min-width:0}
.player-action-group.is-left{justify-content:flex-start;flex:none}
.player-action-group.is-center{justify-content:flex-end;gap:10px;flex:1;margin-left:auto}
.player-action-group.is-right{justify-content:flex-end;flex:none}
.player-dock-menu-anchor{position:relative;display:inline-flex;align-items:center;justify-content:center;flex:none}
.player-dock-btn{display:inline-flex;align-items:center;justify-content:center;height:34px;padding:0 10px;border:none;border-radius:8px;background:transparent;color:rgba(255,255,255,.92);font:inherit;font-size:14px;line-height:1;cursor:pointer;white-space:nowrap;transition:background .16s ease,color .16s ease}
.player-dock-btn:hover,.player-dock-btn.is-open,.player-dock-btn.is-active{background:rgba(255,255,255,.12);color:#fff}
.player-dock-btn.is-icon{width:34px;padding:0;font-size:18px}
.player-dock-btn.is-text{font-size:13px}
.player-dock-btn.is-quality{min-width:58px}
.player-dock-btn.is-transport{position:relative;width:38px;height:38px;padding:0;border-radius:12px;background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
.player-dock-btn.is-transport:hover,.player-dock-btn.is-transport.is-active{background:rgba(255,255,255,.12);box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}
.player-transport-icon{position:relative;display:block;width:18px;height:18px;color:inherit}
.player-transport-icon:before,.player-transport-icon:after{content:"";position:absolute;top:50%;transform:translateY(-50%)}
.player-transport-icon-play:before{left:5px;width:0;height:0;border-top:6px solid transparent;border-bottom:6px solid transparent;border-left:9px solid currentColor}
.player-dock-btn.is-playing .player-transport-icon-play:before{left:4px;width:4px;height:12px;border:none;border-radius:999px;background:currentColor;box-shadow:7px 0 0 currentColor}
.player-transport-icon-prev:before{left:2px;width:2px;height:12px;border-radius:999px;background:currentColor}
.player-transport-icon-prev:after{left:6px;width:0;height:0;border-top:6px solid transparent;border-bottom:6px solid transparent;border-right:8px solid currentColor;box-shadow:-6px 0 0 -1px rgba(0,0,0,0)}
.player-transport-icon-next:before{right:2px;width:2px;height:12px;border-radius:999px;background:currentColor}
.player-transport-icon-next:after{right:6px;width:0;height:0;border-top:6px solid transparent;border-bottom:6px solid transparent;border-left:8px solid currentColor;box-shadow:6px 0 0 -1px rgba(0,0,0,0)}
.player-sidebar{display:flex;flex-direction:column;flex:none;width:360px;min-width:320px;background:#151619;border-left:1px solid rgba(255,255,255,.06);transition:width .18s ease,min-width .18s ease,opacity .18s ease,border-color .18s ease}
.player-sidebar-body{flex:1;min-height:0;overflow:auto;padding:18px 20px 22px}
.player-sidebar-toggle{position:absolute;top:50%;right:360px;z-index:7;display:inline-flex;align-items:center;justify-content:center;width:28px;height:64px;padding:0;border:none;border-radius:14px 0 0 14px;background:rgba(21,22,25,.92);box-shadow:0 10px 24px rgba(0,0,0,.28);color:rgba(255,255,255,.88);cursor:pointer;transform:translateY(-50%);transition:right .18s ease,background .16s ease,color .16s ease}
.player-shell.controls-hidden .player-sidebar-toggle{opacity:0;pointer-events:none}
.player-sidebar-toggle:hover{background:rgba(33,35,40,.96);color:#fff}
.player-body.sidebar-collapsed .player-sidebar-toggle{right:0;border-radius:14px 0 0 14px}
.player-sidebar-toggle-icon{position:relative;display:block;width:10px;height:10px}
.player-sidebar-toggle-icon:before{content:"";position:absolute;top:50%;left:50%;width:8px;height:8px;border-top:2px solid currentColor;border-right:2px solid currentColor;transform:translate(-60%,-50%) rotate(-135deg)}
.player-body.sidebar-collapsed .player-sidebar-toggle-icon:before{transform:translate(-40%,-50%) rotate(45deg)}
.player-section-title{margin:0 0 12px;font-size:14px;font-weight:600;color:#fff}
.player-playlist{display:flex;flex-direction:column;gap:12px}
.playlist-card{display:flex;gap:12px;padding:12px;border:1px solid rgba(255,255,255,.04);border-radius:12px;background:#1b1c20;cursor:pointer;transition:all .16s ease}
.playlist-card:hover{background:#22242a;border-color:rgba(255,255,255,.1)}
.playlist-card.is-active{background:#20242d;border-color:rgba(77,141,255,.45);box-shadow:inset 0 0 0 1px rgba(77,141,255,.2)}
.playlist-thumb{position:relative;flex:none;width:124px;height:78px;border-radius:10px;background:#0d0d0d center/cover no-repeat;overflow:hidden}
.playlist-thumb:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.02),rgba(0,0,0,.18) 52%,rgba(0,0,0,.42))}
.playlist-duration{position:absolute;right:8px;bottom:6px;z-index:1;font-size:12px;color:#fff}
.playlist-content{display:flex;flex-direction:column;justify-content:space-between;min-width:0;flex:1}
.playlist-name{font-size:14px;line-height:1.5;color:#fff;word-break:break-word}
.playlist-status{font-size:13px;color:rgba(255,255,255,.52)}
.playlist-progress{height:4px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden}
.playlist-progress>span{display:block;width:0;height:100%;background:#4d8dff;transition:width .18s ease}
.error-overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:24px;background:rgba(0,0,0,.76);color:#fff;text-align:center}
.error-icon{margin-bottom:6px;font-size:40px;opacity:.78}
.error-message{font-size:16px;font-weight:600}
.error-details{font-size:12px;line-height:1.5;opacity:.82;max-width:360px}
.toast-container{position:fixed;top:20px;right:20px;z-index:10006;pointer-events:none}
.toast-notification{max-width:320px;margin-bottom:10px;padding:10px 14px;border-radius:8px;color:#fff;line-height:1.5;white-space:pre-line;word-break:break-word;opacity:0;transform:translateX(16px);transition:all .2s ease;pointer-events:auto;box-shadow:0 10px 24px rgba(0,0,0,.22)}
.toast-notification.show{opacity:1;transform:none}
.toast-notification.hide{opacity:0;transform:translateY(-10px);margin-bottom:0;padding-top:0;padding-bottom:0;max-height:0}
.toast-success{background:rgba(49,194,124,.94)}
.toast-error{background:rgba(245,108,108,.96)}
.toast-info{background:rgba(79,124,255,.95)}
.toast-warning{background:rgba(230,162,60,.96)}
.video-player-container:fullscreen{width:100vw;height:100dvh;max-width:none;max-height:none;border-radius:0;box-shadow:none}
.player-sidebar-body::-webkit-scrollbar{width:8px}.player-sidebar-body::-webkit-scrollbar-thumb{background:rgba(255,255,255,.12);border-radius:999px}
.video-player-close:focus,.playlist-card:focus,.player-control-menu-btn:focus,.player-dock-btn:focus{outline:2px solid #61a0ff;outline-offset:2px}
@media (max-width:1080px){.player-sidebar{width:320px;min-width:300px}.player-sidebar-toggle{right:320px}}
@media (max-width:860px){.video-player-modal{padding:16px}.video-player-container{width:min(96vw,1480px);height:min(90vh,920px);border-radius:18px}.player-body{flex-direction:column}.player-body.sidebar-collapsed .player-sidebar{height:0;border-top:none}.player-sidebar{width:100%;min-width:0;height:42vh;border-left:none;border-top:1px solid rgba(255,255,255,.06)}.player-left{min-height:58vh}.player-sidebar-toggle{top:auto;right:18px;bottom:calc(42vh + 18px);width:34px;height:34px;border-radius:999px;transform:none}.player-body.sidebar-collapsed .player-sidebar-toggle{right:18px;bottom:18px;border-radius:999px}.player-sidebar-toggle-icon:before{transform:translate(-50%,-38%) rotate(-45deg)}.player-body.sidebar-collapsed .player-sidebar-toggle-icon:before{transform:translate(-50%,-62%) rotate(135deg)}.video-player-close{right:10px}.player-bottom-dock{padding:14px 14px 16px}}
@media (max-width:640px){.video-player-modal{padding:0}.video-player-container{width:100vw;height:100dvh;border-radius:0;box-shadow:none}.player-titlebar{padding:0 44px 0 12px}.player-badge{display:none}.player-sidebar-body{padding:18px 14px 22px}.playlist-thumb{width:110px;height:70px}.player-progress-time{min-width:34px;font-size:11px}.player-actions-row{flex-wrap:wrap;justify-content:space-between;gap:10px}.player-action-group.is-center{flex-basis:100%;justify-content:flex-end;order:2;margin-left:0}.player-action-group.is-right{order:3}.player-dock-btn{height:30px;padding:0 8px;font-size:12px}.player-dock-btn.is-icon{width:30px;font-size:16px}.player-dock-btn.is-transport{width:34px;height:34px;padding:0}.player-transport-icon{transform:scale(.92)}}
@media (prefers-reduced-motion: reduce){.video-player-close,.player-dock-btn,.playlist-card,.player-control-menu,.toast-notification,.playlist-progress>span{transition:none!important}}
`;

// 加载CSS样式（内联，不依赖外部@resource）
function loadCSS() {
  if (!document.head) {
    console.error("❌ document.head 不可用，无法注入CSS");
    return;
  }

  if (!document.getElementById("videojs-style-link")) {
    const link = document.createElement("link");
    link.id = "videojs-style-link";
    link.rel = "stylesheet";
    link.href = VIDEOJS_CSS_URL;
    document.head.appendChild(link);
  }

  if (document.getElementById("kuake-player-style")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "kuake-player-style";
  style.textContent = VIDEO_PLAYER_CSS;
  document.head.appendChild(style);
  console.log("✅ CSS样式已加载（内联）");
}

function initializeAll() {
  if (document.head && document.body) {
    if (modal && document.body.contains(modal)) {
      return;
    }

    // 加载CSS样式
    loadCSS();

    // 创建播放器模态框
    modal = document.createElement("div");
    modal.className = "video-player-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "夸克视频播放器");
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
              <div class="video-player-container" tabindex="-1">
                  <button class="video-player-close" type="button" aria-label="关闭播放器" title="关闭播放器">×</button>
                  <div class="video-player-wrapper" id="video-container" role="region" aria-label="播放器内容区域"></div>
              </div>
          `;
    document.body.appendChild(modal);

    // 设置事件监听器
    setupModalEvents();

    // 启动MutationObserver
    const observer = new MutationObserver(debouncedMutationHandler);
    observer.observe(document.body, { childList: true, subtree: true });

    console.log("DOM初始化完成，MutationObserver已启动");
  } else {
    setTimeout(initializeAll, 100);
  }
}

function initToastContainer() {
  if (!toastContainer && document.body) {
    toastContainer = document.createElement("div");
    toastContainer.className = "toast-container";
    toastContainer.setAttribute("aria-live", "polite");
    toastContainer.setAttribute("aria-atomic", "true");
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

function showToast(message, type = "info") {
  if (!document.body) return console.log(`Toast: ${message}`);

  const container = initToastContainer();
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast-notification toast-${type}`;
  toast.textContent = message;

  // 添加到容器顶部
  container.insertBefore(toast, container.firstChild);

  // 显示动画
  requestAnimationFrame(() => toast.classList.add("show"));

  // 自动隐藏
  setTimeout(() => {
    toast.classList.add("hide");
    setTimeout(() => {
      if (container.contains(toast)) {
        container.removeChild(toast);
      }
    }, 300);
  }, 3000);
}

function showPlayer(videoUrl, title, videoList = null, episodeList = null) {
  if (!modal) return console.log("播放器模态框未初始化");

  // 显示播放器
  modal.style.display = "flex";
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  // 直接创建播放器，传递视频列表用于清晰度切换和剧集列表
  createPlayer(videoUrl, title, videoList, episodeList);

  const playerContainer = modal.querySelector(".video-player-container");
  playerContainer?.focus();
}

function clearAllVideos() {
  destroyCurrentPlayer();
  const container = document.getElementById("video-container");
  if (container) {
    container.innerHTML = "";
  }
}

function hidePlayer() {
  if (!modal) return;

  playerRuntimeState.activePlayRequestId += 1;
  playerRuntimeState.isSidebarCollapsed = true;

  modal.querySelector(".player-shell")?.classList.remove("controls-hidden");
  modal.querySelector(".video-player-container")?.classList.remove("controls-hidden");
  modal.querySelector(".player-body")?.classList.remove("sidebar-collapsed");

  // 如果处于全屏状态，先退出全屏
  if (document.fullscreenElement) {
    document.exitFullscreen();
  }

  modal.style.display = "none";
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "auto";

  // 全局清理所有video元素
  clearAllVideos();

  // 删除临时文件
  releaseCurrentTempFile();
}

// 设置模态框事件监听器
function setupModalEvents() {
  if (!modal) return;

  modal
    .querySelector(".video-player-close")
    .addEventListener("click", hidePlayer);
  modal.addEventListener("click", (e) => e.target === modal && hidePlayer());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal?.style.display === "flex") hidePlayer();
  });
}
