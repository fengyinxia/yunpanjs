// qkp-share.js
// 分享页文件上下文、URL 监听和页面接口响应拦截。
// 由 quarkpan_html5_player.user.js 通过 @require 远程加载。

'use strict';

function isLikelyFid(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{6,}$/.test(value);
}

function cacheDetailFiles(detailResponse) {
  const list = Array.isArray(detailResponse?.list) ? detailResponse.list : [];
  const parentPdirFid = String(detailResponse?.pdir_fid || "");
  let newFileCount = 0;

  list.forEach((file) => {
    const fid = String(file?.fid || "");
    if (!fid) return;

    const previousContext = fileContextByFid.get(fid) || null;
    const mergedFileData = {
      ...(previousContext?.fileData || {}),
      ...file,
    };

    if (!previousContext) {
      newFileCount += 1;
    }

    fileContextByFid.set(fid, {
      fid,
      fileData: mergedFileData,
      fileName: mergedFileData.file_name || "",
      pdirFid: parentPdirFid || previousContext?.pdirFid || "",
      shareFidToken:
        mergedFileData.share_fid_token ||
        previousContext?.shareFidToken ||
        "",
      capturedAt: Date.now(),
    });
  });

  fileListData = Array.from(fileContextByFid.values(), (context) => context.fileData);
  return newFileCount;
}

function extractFidFromElement(element) {
  if (!(element instanceof Element)) return "";

  const rowElement = element.closest("[data-row-key]");
  if (!(rowElement instanceof HTMLElement)) {
    return "";
  }

  const fid = String(rowElement.dataset?.rowKey || rowElement.getAttribute("data-row-key") || "").trim();
  if (!isLikelyFid(fid)) {
    return "";
  }

  return fileContextByFid.has(fid) ? fid : "";
}

function resolveClickedVideo(target) {
  const filenameTextElement = target.querySelector(".filename-text");
  const domFileName =
    filenameTextElement?.textContent ||
    target.querySelector(".file-name")?.textContent ||
    "";
  const fid = extractFidFromElement(target);
  const fileContext = fid ? fileContextByFid.get(fid) || null : null;
  const fileData = fileContext?.fileData || null;
  const fileName = fileData?.file_name || domFileName;

  return {
    fid,
    fileContext,
    fileData,
    fileName,
  };
}

function resolveShareDownloadFileContext(triggerElement = null) {
  if (!(triggerElement instanceof Element)) {
    return null;
  }

  const fid = extractFidFromElement(triggerElement);
  if (!fid) {
    return null;
  }

  return fileContextByFid.get(fid) || null;
}

function extractShareId() {
  const url = window.location.href;
  const match = url.match(/https:\/\/pan\.quark\.cn\/s\/([a-zA-Z0-9]+)/);
  if (match && match[1]) {
    const shareId = match[1];
    console.log("🔍 提取到分享ID:", shareId);
    return shareId;
  }
  return null;
}

// 监听URL变化
function monitorUrlChanges() {
  if (window.__kuakePlayerUrlMonitorInitialized) {
    return;
  }
  window.__kuakePlayerUrlMonitorInitialized = true;

  extractShareId(); // 初始检查

  const handleUrlChange = () => extractShareId();

  // 拦截history API
  ["pushState", "replaceState"].forEach((method) => {
    const original = history[method];
    history[method] = function () {
      original.apply(history, arguments);
      handleUrlChange();
    };
  });

  // 监听popstate
  window.addEventListener("popstate", handleUrlChange);
}

function handleInterceptResponse(responseText, urlType) {
  try {
    const response = JSON.parse(responseText);
    if (urlType === "token" && response?.data?.stoken) {
      stoken = response.data.stoken; // 存储stoken
      console.log("🔍 获取到stoken:", response.data.stoken);
    } else if (urlType === "detail" && response?.data?.list) {
      const newFileCount = cacheDetailFiles(response.data);
      detailData = response.data; // 存储detail完整数据
      console.log(
        "🔍 当前目录缓存完成:",
        response.data.list.map((file) => file.fid),
      );
      console.log("🔍 当前总文件列表:", fileListData);
      console.log("🔍 获取到detail数据:", detailData);
      if (newFileCount > 0) {
        console.log("文件列表结构示例:", response.data.list[0]); // 显示第一个新文件的结构
      }
      console.log(
        `新增${newFileCount}个文件，总计${fileListData.length}个文件`,
      );
    } else if (urlType === "member" && response?.data) {
      const memberData = response.data;
      const memberType = memberData.member_type;
      const superVipExpAt = memberData.super_vip_exp_at;

      console.log("🔍 获取到会员信息:", memberData);

      if (memberType === "NORMAL") {
        showToast("该脚本只适用于会员用户", "error");
      } else {
        // 格式化会员信息显示 - 多行显示所有关键信息
        let vipInfo = [];

        // 基本信息
        vipInfo.push(`会员类型: ${memberType || "未知"}`);

        // 到期时间
        if (superVipExpAt) {
          const expDate = new Date(superVipExpAt).toLocaleDateString("zh-CN");
          vipInfo.push(`超级VIP到期: ${expDate}`);
        }

        // 容量信息
        if (memberData.use_capacity && memberData.total_capacity) {
          const usedGB = (
            memberData.use_capacity /
            (1024 * 1024 * 1024)
          ).toFixed(2);
          const totalGB = (
            memberData.total_capacity /
            (1024 * 1024 * 1024)
          ).toFixed(2);
          vipInfo.push(`存储: ${usedGB}GB / ${totalGB}GB`);
        }

        showToast(vipInfo.join("\n"), "info");
      }
    }
  } catch (e) {
    console.error(`解析${urlType}响应失败:`, e);
  }
}

// 网络请求拦截器
function interceptNetworkRequests() {
  if (XMLHttpRequest.prototype.__kuakePlayerInterceptInstalled) {
    return;
  }
  XMLHttpRequest.prototype.__kuakePlayerInterceptInstalled = true;

  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...args) {
    this._url = url;
    return originalXHROpen.apply(this, [method, url, ...args]);
  };

  XMLHttpRequest.prototype.send = function (data) {
    const url = this._url;
    if (url?.includes("/sharepage/token")) {
      this.addEventListener("load", () =>
        handleInterceptResponse(this.responseText, "token"),
      );
    } else if (url?.includes("/sharepage/detail")) {
      this.addEventListener("load", () =>
        handleInterceptResponse(this.responseText, "detail"),
      );
    } else if (url?.includes("/clouddrive/member")) {
      this.addEventListener("load", () =>
        handleInterceptResponse(this.responseText, "member"),
      );
    }
    return originalXHRSend.apply(this, arguments);
  };

  // Fetch拦截器已移除，仅使用XMLHttpRequest拦截

  console.log("✅ 网络请求拦截器已启动，正在监听stoken和文件列表...");
}
