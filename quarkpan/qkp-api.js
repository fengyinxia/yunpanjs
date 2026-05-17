// qkp-api.js
// 夸克网盘接口请求、转存播放、下载和临时文件清理流程。
// 由 quarkpan_html5_player.user.js 通过 @require 远程加载。

'use strict';

const API_CONFIG = {
  BASE_URL: "https://drive-pc.quark.cn/1/clouddrive",
  DOWNLOAD_URL:
    "https://drive-pc.quark.cn/1/clouddrive/file/download?entry=ft&fr=pc&pr=ucpro",
  PLAY_URL:
    "https://drive-pc.quark.cn/1/clouddrive/file/v2/play?pr=ucpro&fr=pc&uc_param_str=",
  USER_AGENT:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) quark-cloud-drive/2.5.20 Chrome/100.0.4896.160 Electron/18.3.5.4-b478491100 Safari/537.36 Channel/pckk_other_ch",
  ENDPOINTS: {
    SAVE: "/share/sharepage/save?pr=ucpro&fr=pc",
    TASK: "/task?pr=ucpro&fr=pc&uc_param_str=",
    SORT: "/file/sort?pr=ucpro&fr=pc",
  },
};

function createApiError(apiName, message, extra = {}) {
  const error = new Error(message || `${apiName}请求失败`);
  error.apiName = apiName;
  Object.assign(error, extra);
  return error;
}

function handleApiError(apiName, error, showUser = false) {
  const message =
    error?.message ||
    error?.response?.message ||
    error?.statusText ||
    "未知错误";

  console.error(`❌ ${apiName}失败:`, error);

  if (showUser) {
    showToast(`${apiName}失败: ${message}`, "error");
  }

  return error;
}

function requestApi(config) {
  const { method, url, data, apiName, headers = {} } = config;

  return new Promise((resolve, reject) => {
    const requestConfig = {
      method,
      url,
      headers: {
        Cookie: globalCookieString,
        ...headers,
      },
      onload: function (response) {
        if (response.status < 200 || response.status >= 300) {
          reject(
            createApiError(apiName, `${apiName}请求失败: ${response.status}`, {
              response,
            }),
          );
          return;
        }

        let result = null;
        try {
          result = JSON.parse(response.responseText);
        } catch (error) {
          reject(
            createApiError(apiName, `解析${apiName}响应失败`, {
              response,
              cause: error,
            }),
          );
          return;
        }

        resolve({
          response,
          result,
        });
      },
      onerror: function (error) {
        reject(
          createApiError(apiName, `${apiName}网络错误`, {
            response: error,
          }),
        );
      },
      ontimeout: function (error) {
        reject(
          createApiError(apiName, `${apiName}请求超时`, {
            response: error,
          }),
        );
      },
    };

    if (data !== undefined) {
      if (!requestConfig.headers["Content-Type"]) {
        requestConfig.headers["Content-Type"] = "application/json";
      }
      requestConfig.data =
        typeof data === "string" ? data : JSON.stringify(data);
    }

    GM_xmlhttpRequest(requestConfig);
  });
}

// 通用API请求函数
function makeApiRequest(config) {
  const { method, url, data, onSuccess, onError, apiName } = config;

  requestApi({
    method,
    url,
    data,
    apiName,
  })
    .then(({ result }) => {
      if (onSuccess) onSuccess(result);
    })
    .catch((error) => {
      handleApiError(apiName, error);
      if (onError) onError(error);
    });
}

function initializeGlobalCookie() {
  return new Promise((resolve) => {
    GM_cookie.list({ domain: "quark.cn" }, (cookies) => {
      const pusCookie = cookies.find((cookie) => cookie.name === "__pus");
      if (pusCookie) {
        globalCookieString = `__pus=${pusCookie.value}`;
        console.log("🍪 全局Cookie已初始化（__pus）");
      } else {
        console.warn("⚠️ 未找到__pus Cookie");
      }
      resolve(globalCookieString);
    });
  });
}

function deleteTempFile(fid, options = {}) {
  if (!fid) return;

  const { silent = false } = options;

  console.log("🗑️ 正在删除临时文件，文件ID:", fid);
  if (!silent) {
    showToast("正在删除临时文件...", "info");
  }

  const requestData = {
    action_type: 2,
    filelist: [fid],
    exclude_fids: [],
  };

  makeApiRequest({
    method: "POST",
    url: "https://drive-pc.quark.cn/1/clouddrive/file/delete?pr=ucpro&fr=pc&uc_param_str=",
    data: requestData,
    apiName: "删除临时文件",
    onSuccess: (result) => {
      if (result?.code === 0) {
        console.log("✅ 临时文件删除成功");
        if (!silent) {
          showToast("临时文件已删除", "success");
        }
      } else {
        console.error("❌ 删除临时文件失败:", result?.message || "未知错误");
        if (!silent) {
          showToast(
            "删除临时文件失败: " + (result?.message || "未知错误"),
            "error",
          );
        }
      }
    },
    onError: (error) => {
      console.error("❌ 删除临时文件请求失败:", error);
      if (!silent) {
        showToast("删除临时文件请求失败", "error");
      }
    },
  });
}

function cancelPendingTempFileDeletion(fid) {
  const targetFid = String(fid || "");
  if (!targetFid) return;

  const timer = playerRuntimeState.pendingTempDeleteTimers.get(targetFid);
  if (timer) {
    clearTimeout(timer);
    playerRuntimeState.pendingTempDeleteTimers.delete(targetFid);
  }
}

function scheduleTempFileDeletion(fid, delay = 8000) {
  const targetFid = String(fid || "");
  if (!targetFid) return;

  cancelPendingTempFileDeletion(targetFid);
  const timer = window.setTimeout(() => {
    playerRuntimeState.pendingTempDeleteTimers.delete(targetFid);
    deleteTempFile(targetFid, { silent: true });
  }, delay);
  playerRuntimeState.pendingTempDeleteTimers.set(targetFid, timer);
}

function deletePendingTempFilesBeforeUnload() {
  const pendingFids = new Set();

  playerRuntimeState.pendingTempDeleteTimers.forEach((timer, fid) => {
    clearTimeout(timer);
    pendingFids.add(fid);
  });
  playerRuntimeState.pendingTempDeleteTimers.clear();

  if (playerRuntimeState.currentPlayingFid) {
    pendingFids.add(playerRuntimeState.currentPlayingFid);
    playerRuntimeState.currentPlayingFid = null;
  }

  pendingFids.forEach((fid) => {
    deleteTempFile(fid, { silent: true });
  });
}

function releaseCurrentTempFile() {
  if (!playerRuntimeState.currentPlayingFid) return;
  scheduleTempFileDeletion(playerRuntimeState.currentPlayingFid);
  playerRuntimeState.currentPlayingFid = null;
}

function adoptCurrentTempFile(fid) {
  const targetFid = String(fid || "");
  if (!targetFid) return;
  cancelPendingTempFileDeletion(targetFid);
  playerRuntimeState.currentPlayingFid = targetFid;
}

async function requestPlayUrl(fid, sourceFileData = null) {
  console.log("🎬 开始请求播放接口，文件ID:", fid);

  const requestData = {
    fid: fid,
    resolutions: "normal,low,high,super,2k,4k",
    supports: "fmp4,m3u8",
  };

  try {
    const { result } = await requestApi({
      method: "POST",
      url: API_CONFIG.PLAY_URL,
      headers: {
        "User-Agent": API_CONFIG.USER_AGENT,
      },
      data: requestData,
      apiName: "播放接口",
    });

    if (result?.code === 0 && result?.data?.video_list?.length > 0) {
      console.log("✅ 播放接口响应成功");

      const videoList = result.data.video_list;

      // 选择最佳分辨率（优先选择super，然后high，最后normal）
      let selectedVideo =
        videoList.find((v) => v.resolution === "super") ||
        videoList.find((v) => v.resolution === "high") ||
        videoList.find((v) => v.resolution === "normal") ||
        videoList[0];

      if (selectedVideo?.video_info?.url) {
        const playUrl = selectedVideo.video_info.url;
        const resolution = selectedVideo.resolution;
        console.log(`🎬 获取到播放链接，分辨率: ${resolution}`);

        // 获取同目录的视频文件作为剧集列表
        const currentFileName = sourceFileData?.file_name || result.data.file_name;
        const episodeList = getEpisodeList(sourceFileData);

        return {
          defaultUrl: playUrl,
          defaultResolution: resolution,
          fileName: currentFileName,
          videoList: videoList,
          episodeList: episodeList,
        };
      }

      throw createApiError("播放接口", "播放接口响应中未找到播放链接", {
        result,
      });
    }

    throw createApiError("播放接口", result?.message || "获取播放地址失败", {
      result,
    });
  } catch (error) {
    handleApiError("播放接口", error);
    throw error;
  }
}

async function requestTaskStatus(taskId, sourceFileData = null, requestId = playerRuntimeState.activePlayRequestId) {
  console.log("⏳ 开始轮询任务状态...");

  let firstFid = "";
  try {
    const maxAttempts = 30;
    const pollInterval = 1000;
    const taskUrl = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.TASK}&task_id=${taskId}`;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (attempt > 1) {
        await sleep(pollInterval);
      }

      console.log(`🔍 开始第 ${attempt}/${maxAttempts} 次请求task接口...`);

      const { result } = await requestApi({
        method: "GET",
        url: taskUrl,
        apiName: "task接口",
      });

      if (!result?.data) {
        throw createApiError("task接口", "task接口未返回任务数据", {
          result,
        });
      }

      const taskData = result.data;
      console.log(
        "🔍 任务状态:",
        taskData.status,
        "进度:",
        taskData.progress,
      );

      if (taskData.status === 2) {
        firstFid = taskData.save_as?.save_as_top_fids?.[0] || "";
        if (!firstFid) {
          throw createApiError("task接口", "转存完成，但未获取到文件ID", {
            result,
          });
        }
        break;
      }

      if (taskData.status === 3) {
        throw createApiError(
          "task接口",
          `转存任务失败: ${taskData.error_code || "未知错误"}`,
          {
            result,
          },
        );
      }
    }

    if (!firstFid) {
      throw createApiError("task接口", "转存任务轮询超时，请稍后重试");
    }

    if (requestId !== playerRuntimeState.activePlayRequestId) {
      deleteTempFile(firstFid, { silent: true });
      return null;
    }

    console.log("🎬 优先尝试播放接口，文件ID:", firstFid);
    const [videoData, originalUrl] = await Promise.all([
      requestPlayUrl(firstFid, sourceFileData),
      requestDownloadUrl(firstFid),
    ]);
    if (requestId !== playerRuntimeState.activePlayRequestId) {
      deleteTempFile(firstFid, { silent: true });
      return null;
    }

    if (!videoData) {
      deleteTempFile(firstFid, { silent: true });
      return null;
    }

    if (originalUrl) {
      const hasOriginal = videoData.videoList.some((video) => video?.resolution === "original");
      if (!hasOriginal) {
        videoData.videoList = [
          ...videoData.videoList,
          {
            resolution: "original",
            video_info: {
              url: originalUrl,
            },
          },
        ];
      }
    }

    console.log("🎬 播放接口成功，开始播放视频:", videoData.fileName);

    adoptCurrentTempFile(firstFid);

    showPlayer(
      videoData.defaultUrl,
      videoData.fileName,
      videoData.videoList,
      videoData.episodeList,
    );
  } catch (error) {
    if (firstFid) {
      deleteTempFile(firstFid, { silent: true });
    }
    if (requestId !== playerRuntimeState.activePlayRequestId) {
      return null;
    }
    handleApiError(error?.apiName || "task接口", error, true);
  }
}

async function requestDownloadUrl(fid) {
  console.log("📥 开始请求下载接口，文件ID:", fid);

  const requestData = {
    fids: [fid],
  };

  try {
    const { result } = await requestApi({
      method: "POST",
      url: API_CONFIG.DOWNLOAD_URL,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": API_CONFIG.USER_AGENT,
      },
      data: requestData,
      apiName: "下载接口",
    });

    if (result?.code === 0 && Array.isArray(result?.data) && result.data[0]?.download_url) {
      return result.data[0].download_url;
    }

    throw createApiError("下载接口", result?.message || "获取原画下载地址失败", {
      result,
    });
  } catch (error) {
    handleApiError("下载接口", error);
    return null;
  }
}

async function requestTaskDownloadStatus(taskId, fileName = null) {
  console.log("⏳ 开始轮询下载转存任务状态...");

  try {
    const maxAttempts = 30;
    const pollInterval = 1000;
    const taskUrl = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.TASK}&task_id=${taskId}`;
    let firstFid = "";

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (attempt > 1) {
        await sleep(pollInterval);
      }

      console.log(`🔍 开始第 ${attempt}/${maxAttempts} 次请求task接口（下载）...`);

      const { result } = await requestApi({
        method: "GET",
        url: taskUrl,
        apiName: "下载task接口",
      });

      if (!result?.data) {
        throw createApiError("下载task接口", "task接口未返回任务数据", {
          result,
        });
      }

      const taskData = result.data;
      console.log(
        "🔍 下载任务状态:",
        taskData.status,
        "进度:",
        taskData.progress,
      );

      if (taskData.status === 2) {
        firstFid = taskData.save_as?.save_as_top_fids?.[0] || "";
        if (!firstFid) {
          throw createApiError("下载task接口", "转存完成，但未获取到文件ID", {
            result,
          });
        }
        break;
      }

      if (taskData.status === 3) {
        throw createApiError(
          "下载task接口",
          `转存任务失败: ${taskData.error_code || "未知错误"}`,
          {
            result,
          },
        );
      }
    }

    if (!firstFid) {
      throw createApiError("下载task接口", "转存任务轮询超时，请稍后重试");
    }

    const downloadUrl = await requestDownloadUrl(firstFid);
    if (!downloadUrl) {
      throw createApiError("下载接口", "未获取到下载地址");
    }

    triggerBrowserDownload(
      downloadUrl,
      sanitizeDownloadFileName(fileName || "quark-file"),
    );
    scheduleTempFileDeletion(firstFid, TEMP_DOWNLOAD_DELETE_DELAY);

    return {
      fid: firstFid,
      downloadUrl,
    };
  } catch (error) {
    handleApiError(error?.apiName || "下载task接口", error);
    throw error;
  }
}

async function requestDownloadBySaveFlow(fileData) {
  const fid = String(fileData?.fid || "");
  if (!fid) {
    throw createApiError("下载流程", "无效文件ID");
  }

  if (!stoken) {
    throw createApiError("下载流程", "stoken未获取到");
  }

  const fileContext = fileContextByFid.get(fid) || null;
  if (!fileContext) {
    throw createApiError("下载流程", `未找到 fid=${fid} 对应的文件上下文`);
  }

  if (!sortData || !sortData.list || !sortData.list[0]) {
    throw createApiError("下载流程", "sortData未获取到，无法请求save接口");
  }

  const pwdId = extractShareId();
  if (!pwdId) {
    throw createApiError("下载流程", "无法从地址栏获取分享ID");
  }

  const shareFidToken = String(fileContext.shareFidToken || "").trim();
  if (!shareFidToken) {
    throw createApiError("下载流程", "未找到分享文件令牌");
  }

  const requestData = {
    fid_list: [fileContext.fileData.fid],
    fid_token_list: [shareFidToken],
    to_pdir_fid: sortData.list[0]?.fid || "",
    pwd_id: pwdId,
    stoken: stoken,
    pdir_fid: fileContext.pdirFid || "",
    pdir_save_all: false,
    exclude_fids: [],
    scene: "link",
  };

  console.log("📦 下载流程 save接口请求参数:", requestData);

  const { result } = await requestApi({
    method: "POST",
    url: API_CONFIG.BASE_URL + API_CONFIG.ENDPOINTS.SAVE,
    data: requestData,
    apiName: "下载save接口",
  });

  if (result?.data?.task_id) {
    return requestTaskDownloadStatus(
      result.data.task_id,
      fileContext.fileName || fileData.file_name || "quark-file",
    );
  }

  throw createApiError(
    "下载save接口",
    result?.message || "save接口请求成功，但未返回task_id",
    {
      result,
    },
  );
}

async function handleShareDownloadClick(triggerElement) {
  if (isShareDownloadPending) {
    showToast("正在准备下载，请稍候...", "info");
    return;
  }

  const fileContext = resolveShareDownloadFileContext(triggerElement);
  if (!fileContext?.fileData) {
    showToast("未从当前下载按钮定位到文件", "warning");
    return;
  }

  isShareDownloadPending = true;
  try {
    showToast(`正在准备下载: ${fileContext.fileName || fileContext.fileData.file_name}`, "info");
    await requestDownloadBySaveFlow(fileContext.fileData);
    showToast(
      `开始下载: ${sanitizeDownloadFileName(fileContext.fileName || fileContext.fileData.file_name)}`,
      "success",
    );
  } catch (error) {
    console.error("❌ 通过脚本下载流程下载失败:", error);
    showToast(`下载失败: ${error?.message || "未知错误"}`, "error");
  } finally {
    isShareDownloadPending = false;
  }
}

async function startPlaybackFlow(fileData, fileName = null, requestId = null) {
  if (!fileData) {
    return null;
  }

  const effectiveFileName = fileName || fileData.file_name || null;
  return requestSaveInterface(fileData, effectiveFileName, requestId);
}

// 请求save接口
async function requestSaveInterface(fileData, fileName = null, requestId = null) {
  const effectiveRequestId = requestId ?? ++playerRuntimeState.activePlayRequestId;

  try {
    if (!stoken) {
      throw createApiError("save接口", "stoken未获取到，无法请求save接口");
    }

    const fileContext = fileContextByFid.get(String(fileData?.fid || "")) || null;
    if (!fileContext) {
      throw createApiError(
        "save接口",
        `未找到文件上下文，无法转存，fid: ${fileData?.fid || "未知"}`,
      );
    }

    if (!sortData || !sortData.list || !sortData.list[0]) {
      throw createApiError("save接口", "sortData未获取到，无法请求save接口");
    }

    const shareFidToken = String(fileContext.shareFidToken || "").trim();
    if (!shareFidToken) {
      throw createApiError("save接口", "未找到分享文件令牌");
    }

    // 从地址栏获取pwd_id
    const pwd_id = extractShareId();
    if (!pwd_id) {
      throw createApiError("save接口", "无法从地址栏获取分享ID");
    }

    // 构建请求参数
    const requestData = {
      fid_list: [fileContext.fileData.fid],
      fid_token_list: [shareFidToken],
      to_pdir_fid: sortData.list[0]?.fid || "",
      pwd_id: pwd_id,
      stoken: stoken,
      pdir_fid: fileContext.pdirFid || "",
      pdir_save_all: false,
      exclude_fids: [],
      scene: "link",
    };

    console.log("📦 save接口请求参数:", requestData);

    if (effectiveRequestId !== playerRuntimeState.activePlayRequestId) {
      return null;
    }

    const { result } = await requestApi({
      method: "POST",
      url: API_CONFIG.BASE_URL + API_CONFIG.ENDPOINTS.SAVE,
      data: requestData,
      apiName: "save接口",
    });

    if (effectiveRequestId !== playerRuntimeState.activePlayRequestId) {
      return null;
    }

    if (result?.data?.task_id) {
      console.log("save接口请求成功，开始轮询任务状态");
      await requestTaskStatus(
        result.data.task_id,
        fileContext.fileData,
        effectiveRequestId,
      );
      return;
    }

    throw createApiError(
      "save接口",
      result?.message || "save接口请求成功，但未返回task_id",
      {
        result,
      },
    );
  } catch (error) {
    if (effectiveRequestId !== playerRuntimeState.activePlayRequestId) {
      return null;
    }
    handleApiError("save接口", error, true);
  }
}

// 主动请求sort接口
function fetchSortData() {
  makeApiRequest({
    method: "GET",
    url: API_CONFIG.BASE_URL + API_CONFIG.ENDPOINTS.SORT,
    apiName: "sort接口",
    onSuccess: function (data) {
      if (data.data && data.data.list && data.data.list[0]) {
        sortData = data.data;
        console.log("Sort数据获取成功");
      }
    },
  });
}
