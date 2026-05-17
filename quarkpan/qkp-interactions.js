// qkp-interactions.js
// 页面点击拦截和动态内容监听。
// 由 quarkpan_html5_player.user.js 通过 @require 远程加载。

'use strict';

function interceptFileClicks() {
  document.addEventListener(
    "click",
    (e) => {
      if (!(e.target instanceof Element)) return;

      const target = e.target.closest(".file-click-wrap");
      if (target) {
        const { fid, fileData, fileName } = resolveClickedVideo(target);

        // 只有当文件名包含视频格式后缀时才拦截
        if (fileName && isVideoFile(fileName)) {
          e.preventDefault();
          e.stopPropagation();

          console.log("拦截到视频文件点击事件:", fileName, target);

          // 在控制台打印当前文件列表数据和点击的文件信息
          console.log("=== 点击事件触发 ===");
          console.log("点击的文件名:", fileName);
          console.log("点击解析出的fid:", fid);
          console.log("匹配到的文件数据:", fileData);

          if (fileData) {
            console.log("文件详细信息:", {
              文件ID: fileData.fid,
              文件名: fileData.file_name,
              文件大小: fileData.size,
              文件类型: fileData.file_type,
              格式类型: fileData.format_type,
              预览地址: fileData.preview_url,
              缩略图: fileData.thumbnail,
              大缩略图: fileData.big_thumbnail,
              视频分辨率: fileData.video_max_resolution,
              视频宽度: fileData.video_width,
              视频高度: fileData.video_height,
              视频时长: fileData.duration,
              帧率: fileData.fps,
              分享令牌: fileData.share_fid_token,
              完整数据: fileData,
            });

            showToast(`开始播放: ${fileData.file_name}`, "info");
            // 请求save接口，播放将在获取下载链接后进行
            startPlaybackFlow(fileData, fileName);
          } else {
            console.log("未找到匹配的文件数据，fid:", fid);
            console.log(
              "当前已缓存的fid列表:",
              Array.from(fileContextByFid.keys()),
            );
            showToast(
              fid
                ? `未找到 fid=${fid} 对应的文件上下文`
                : "未能从当前点击元素解析出文件fid",
              "error",
            );
          }

          return false;
        } else {
          // 非视频文件，不拦截，让原始事件继续执行
          console.log("非视频文件，不拦截:", fileName);
        }
      }
    },
    true,
  );
}

function interceptShareDownloadClicks() {
  document.addEventListener(
    "click",
    (event) => {
      if (!(event.target instanceof Element)) return;

      const downloadTrigger = event.target.closest(SHARE_DOWNLOAD_BUTTON_SELECTOR);
      if (!downloadTrigger) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const fileContext = resolveShareDownloadFileContext(downloadTrigger);
      if (!stoken || !fileContext?.fileData) {
        showToast(
          !stoken
            ? "页面数据尚未准备完成，请稍后重试"
            : "未从当前下载按钮定位到文件",
          "warning",
        );
        return;
      }

      handleShareDownloadClick(downloadTrigger);
    },
    true,
  );
}

function initializeInteractionHooks() {
  interceptShareDownloadClicks();
  interceptFileClicks();
}

// 检测DPlayer是否加载成功

// 优化的动态内容监听（使用防抖）
const debouncedMutationHandler = debounce((mutations) => {
  let hasNewFileElements = false;
  mutations.forEach((mutation) => {
    if (mutation.type === "childList") {
      mutation.addedNodes.forEach((node) => {
        if (
          node.nodeType === 1 &&
          node.querySelector &&
          node.querySelector(".file-click-wrap")
        ) {
          hasNewFileElements = true;
        }
      });
    }
  });
  if (hasNewFileElements) {
    console.log("检测到新的file-click-wrap元素");
  }
}, 300);
