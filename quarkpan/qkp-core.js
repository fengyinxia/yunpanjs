// qkp-core.js
// 共享状态、通用工具和文件类型判断。
// 由 quarkpan_html5_player.user.js 通过 @require 远程加载。

'use strict';

let modal = null;
let fileListData = [];
let stoken = "";
let sortData = null;
let detailData = null;
let globalCookieString = "";
let fileContextByFid = new Map();
let isShareDownloadPending = false;
const TEMP_DOWNLOAD_DELETE_DELAY = 60000;
const SHARE_DOWNLOAD_BUTTON_SELECTOR =
  ".share-hover-menu-download.share-hover-menu-item";

const playerRuntimeState = {
  currentPlayer: null,
  currentPlayerCleanup: null,
  currentPlayingFid: null, // 当前播放的文件ID，用于删除临时文件
  isSidebarCollapsed: true,
  activePlayRequestId: 0,
  pendingTempDeleteTimers: new Map(),
};
let toastContainer = null;

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function formatTime(seconds) {
  const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${mins
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function sanitizeDownloadFileName(fileName) {
  const normalizedName = String(fileName || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_");
  return normalizedName || "quark-file";
}

function triggerBrowserDownload(downloadUrl, fileName = "") {
  if (!downloadUrl) {
    throw new Error("下载地址为空");
  }

  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  if (fileName) {
    anchor.download = sanitizeDownloadFileName(fileName);
  }
  anchor.style.display = "none";
  (document.body || document.documentElement).appendChild(anchor);
  anchor.click();
  anchor.remove();
}

const videoExtensions = [
  "mp4",
  "avi",
  "mkv",
  "mov",
  "wmv",
  "flv",
  "webm",
  "m4v",
  "mpg",
  "mpeg",
  "3gp",
  "rm",
  "rmvb",
  "asf",
  "divx",
  "xvid",
  "ts",
  "m2ts",
  "mts",
  "vob",
  "ogv",
  "f4v",
];

// 检查文件是否为视频格式
function isVideoFile(fileName) {
  if (!fileName) return false;
  const extension = fileName.toLowerCase().split(".").pop();
  return videoExtensions.includes(extension);
}
