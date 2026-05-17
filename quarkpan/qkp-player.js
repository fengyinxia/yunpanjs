// qkp-player.js
// Video.js 播放器、自定义控制条、画质切换和播放列表。
// 由 quarkpan_html5_player.user.js 通过 @require 远程加载。

'use strict';

function getEpisodeList(currentFileData = null) {
  const currentDirectoryFiles = Array.isArray(detailData?.list) ? detailData.list : [];
  if (currentDirectoryFiles.length === 0) {
    return [];
  }

  // 只筛选当前目录的视频文件
  const videoFiles = currentDirectoryFiles.filter((file) => {
    return isVideoFile(String(file?.file_name || ""));
  });

  if (videoFiles.length <= 1) {
    return videoFiles;
  }

  // 智能排序算法
  return videoFiles.sort((a, b) => {
    const nameA = a.file_name;
    const nameB = b.file_name;

    // 提取数字进行自然排序
    const extractNumbers = (str) => {
      const matches = str.match(/\d+/g);
      return matches ? matches.map((num) => parseInt(num, 10)) : [];
    };

    const numsA = extractNumbers(nameA);
    const numsB = extractNumbers(nameB);

    // 比较数字序列
    for (let i = 0; i < Math.max(numsA.length, numsB.length); i++) {
      const numA = numsA[i] || 0;
      const numB = numsB[i] || 0;
      if (numA !== numB) {
        return numA - numB;
      }
    }

    // 如果数字相同，按字符串排序
    return nameA.localeCompare(nameB, "zh-CN", { numeric: true });
  });
}

// 切换剧集
function setActivePlaybackItem(fileData) {
  const targetFid = String(fileData?.fid || "");
  const targetName = fileData?.file_name || "";

  document.querySelectorAll(".episode-pill, .playlist-card").forEach((item) => {
    const itemFid = String(item.getAttribute("data-fid") || "");
    const itemName = item.getAttribute("data-file-name") || "";
    const isActive =
      (targetFid && itemFid === targetFid) ||
      (!targetFid && targetName && itemName === targetName);

    item.classList.toggle("playing", isActive);
    item.classList.toggle("active", isActive);
    item.classList.toggle("is-active", isActive);
    if (isActive) {
      item.setAttribute("aria-current", "true");
    } else {
      item.removeAttribute("aria-current");
    }
  });
}

function switchEpisode(fileData, clickedItem) {
  if (!fileData) return;

  console.log("🎬 切换到剧集:", fileData.file_name);
  showToast(`正在切换到: ${fileData.file_name}`, "info");

  // 删除当前播放的临时文件
  releaseCurrentTempFile();

  // 先同步目标项高亮，避免上下集按钮切换时列表状态丢失
  setActivePlaybackItem(fileData);
  if (clickedItem) {
    clickedItem.classList.add("playing", "active", "is-active");
    clickedItem.setAttribute("aria-current", "true");
  }

  // 请求新的播放地址
  startPlaybackFlow(fileData, fileData.file_name);
}

const RESOLUTION_LABELS = {
  low: "流畅",
  normal: "标清",
  high: "高清",
  super: "超清",
  "2k": "2K",
  "4k": "4K",
  original: "原画",
};

const RESOLUTION_PRIORITY = {
  low: 1,
  normal: 2,
  high: 3,
  super: 4,
  "2k": 5,
  "4k": 6,
  original: 7,
};

function getResolutionLabel(resolution) {
  return RESOLUTION_LABELS[resolution] || resolution || "原画";
}

function getSourceBadgeText(videoUrl) {
  return "视频";
}

function getActiveVideoItem(videoList, activeUrl) {
  if (!Array.isArray(videoList) || videoList.length === 0) {
    return null;
  }

  return (
    videoList.find((video) => video?.video_info?.url === activeUrl) ||
    videoList[0]
  );
}

function buildPlayerSubtitle(videoUrl, videoList, episodeList, activeUrl) {
  const subtitleParts = ["在线播放"];
  const activeVideo = getActiveVideoItem(videoList, activeUrl || videoUrl);

  if (activeVideo?.resolution) {
    subtitleParts.push(`当前 ${getResolutionLabel(activeVideo.resolution)}`);
  }

  if (Array.isArray(videoList) && videoList.length > 1) {
    subtitleParts.push(`${videoList.length} 档画质`);
  }

  if (Array.isArray(episodeList) && episodeList.length > 1) {
    subtitleParts.push(`${episodeList.length} 集`);
  }

  return subtitleParts.join(" · ");
}

function sortVideoListByResolution(videoList = []) {
  return [...videoList].sort((a, b) => {
    const aPriority = RESOLUTION_PRIORITY[a?.resolution] || 0;
    const bPriority = RESOLUTION_PRIORITY[b?.resolution] || 0;
    return bPriority - aPriority;
  });
}

function getCurrentPlaybackState() {
  const resumeTime =
    typeof playerRuntimeState.currentPlayer?.currentTime === "function"
      ? Number(playerRuntimeState.currentPlayer.currentTime()) || 0
      : 0;
  const autoplay =
    typeof playerRuntimeState.currentPlayer?.paused === "function"
      ? !playerRuntimeState.currentPlayer.paused()
      : false;
  return {
    resumeTime: Math.max(0, resumeTime),
    autoplay,
  };
}

function destroyCurrentPlayer() {
  if (typeof playerRuntimeState.currentPlayerCleanup === "function") {
    try {
      playerRuntimeState.currentPlayerCleanup();
    } catch (error) {
      console.warn("清理播放器事件时出错:", error);
    } finally {
      playerRuntimeState.currentPlayerCleanup = null;
    }
  }

  if (!playerRuntimeState.currentPlayer) {
    return;
  }

  try {
    if (typeof playerRuntimeState.currentPlayer.dispose === "function") {
      playerRuntimeState.currentPlayer.dispose();
    }
  } catch (error) {
    console.warn("清理 Video.js 实例时出错:", error);
  } finally {
    playerRuntimeState.currentPlayer = null;
  }
}

function getCurrentEpisodeIndex(episodeList = [], currentTitle = "") {
  return episodeList.findIndex((file) => file?.file_name === currentTitle);
}

function getCurrentEpisodeFile(episodeList = [], currentTitle = "") {
  return (
    episodeList.find((file) => file?.file_name === currentTitle) ||
    episodeList[0] ||
    null
  );
}

function getPreviewImage(file) {
  return file?.big_thumbnail || file?.thumbnail || file?.preview_url || "";
}

function createControlMenu(items = []) {
  const menu = document.createElement("div");
  menu.className = "player-control-menu";
  let isOpen = false;
  let visibilityHandler = null;
  const buttons = [];

  const setActiveIndex = (activeIndex = -1) => {
    buttons.forEach((button, index) => {
      const isActive = index === activeIndex;
      button.classList.toggle("active", isActive);
      if (isActive) {
        button.setAttribute("aria-current", "true");
      } else {
        button.removeAttribute("aria-current");
      }
    });
  };

  const close = () => {
    isOpen = false;
    menu.classList.remove("show");
    visibilityHandler?.(false);
  };

  const open = () => {
    if (!items.length) return;
    isOpen = true;
    menu.classList.add("show");
    visibilityHandler?.(true);
  };

  const toggle = () => {
    if (isOpen) {
      close();
    } else {
      open();
    }
  };

  items.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "player-control-menu-btn";
    button.textContent = item.label;
    buttons.push(button);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      item.onClick?.();
      close();
    });
    menu.appendChild(button);
  });

  setActiveIndex(items.findIndex((item) => item.active));

  menu.addEventListener("click", (event) => event.stopPropagation());
  return {
    element: menu,
    open,
    close,
    toggle,
    isOpen: () => isOpen,
    setActiveIndex,
    onVisibilityChange(handler) {
      visibilityHandler = handler;
    },
  };
}

function createQualityMenu(videoList, activeUrl, title, episodeList) {
  if (!Array.isArray(videoList) || videoList.length <= 1) {
    return null;
  }

  const menu = createControlMenu(
    sortVideoListByResolution(videoList)
      .filter((video) => video?.video_info?.url)
      .map((video) => {
        const url = video.video_info.url;
        const label = getResolutionLabel(video.resolution);
        return {
          label,
          active: url === activeUrl,
          onClick: () => {
            if (url === activeUrl) {
              return;
            }
            const playbackState = getCurrentPlaybackState();
            showToast(`切换到 ${label}`, "info");
            createPlayer(url, title, videoList, episodeList, {
              ...playbackState,
              activeUrl: url,
            });
          },
        };
      }),
  );

  const currentVideo = getActiveVideoItem(videoList, activeUrl);
  return {
    ...menu,
    label: getResolutionLabel(currentVideo?.resolution),
  };
}

function createSpeedMenu(player) {
  const speedList = [0.75, 1, 1.25, 1.5, 2];
  const menu = createControlMenu(
    speedList.map((rate) => ({
      label: `${rate}x`,
      active: Math.abs((player.playbackRate?.() || 1) - rate) < 0.001,
      onClick: () => {
        player.playbackRate(rate);
        showToast(`倍速切换到 ${rate}x`, "info");
      },
    })),
  );

  return {
    ...menu,
    getCurrentLabel() {
      const currentRate = Number(player.playbackRate?.()) || 1;
      const matchedRate = speedList.find((rate) => Math.abs(currentRate - rate) < 0.001);
      return `${matchedRate || currentRate}x`;
    },
    syncActive() {
      const currentRate = Number(player.playbackRate?.()) || 1;
      menu.setActiveIndex(
        speedList.findIndex((rate) => Math.abs(currentRate - rate) < 0.001),
      );
    },
  };
}

function createSidebar(title, videoList, episodeList, activeUrl) {
  const sidebar = document.createElement("aside");
  sidebar.className = "player-sidebar";

  const currentFile = getCurrentEpisodeFile(episodeList, title);

  const body = document.createElement("div");
  body.className = "player-sidebar-body";

  const playlistTitle = document.createElement("div");
  playlistTitle.className = "player-section-title";
  playlistTitle.textContent = "播放列表";
  body.appendChild(playlistTitle);

  const playlist = document.createElement("div");
  playlist.className = "player-playlist";
  const sourceList = Array.isArray(episodeList) && episodeList.length ? episodeList : [currentFile].filter(Boolean);

  sourceList.forEach((file, index) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "playlist-card";
    if (file?.file_name === title) {
      card.classList.add("is-active");
      card.setAttribute("aria-current", "true");
    }
    card.dataset.fileName = file?.file_name || "";
    card.dataset.fid = String(file?.fid || "");
    card.setAttribute("aria-label", `播放 ${file?.file_name || `第${index + 1}项`}`);

    const thumb = document.createElement("div");
    thumb.className = "playlist-thumb";
    const previewImage = getPreviewImage(file);
    if (previewImage) {
      thumb.style.backgroundImage = `url("${previewImage}")`;
    }

    const duration = document.createElement("div");
    duration.className = "playlist-duration";
    duration.textContent = file?.duration ? formatTime(file.duration) : "--:--";
    thumb.appendChild(duration);

    const content = document.createElement("div");
    content.className = "playlist-content";

    const name = document.createElement("div");
    name.className = "playlist-name";
    name.textContent = file?.file_name || `第 ${index + 1} 项`;

    const status = document.createElement("div");
    status.className = "playlist-status";
    status.textContent = file?.file_name === title ? "正在播放" : "待播放";

    const progress = document.createElement("div");
    progress.className = "playlist-progress";
    const progressInner = document.createElement("span");
    progress.appendChild(progressInner);

    content.appendChild(name);
    content.appendChild(status);
    content.appendChild(progress);

    card.appendChild(thumb);
    card.appendChild(content);
    card.addEventListener("click", () => switchEpisode(file, card));
    playlist.appendChild(card);
  });

  body.appendChild(playlist);
  sidebar.appendChild(body);
  setActivePlaybackItem(currentFile);
  sidebar.updatePlaybackProgress = ({ currentTime = 0, duration = 0 }) => {
    const safeDuration = Number(duration) || 0;
    const safeCurrentTime = Number(currentTime) || 0;
    const percent = safeDuration > 0 ? Math.min(100, (safeCurrentTime / safeDuration) * 100) : 0;
    const activeCard = sidebar.querySelector(".playlist-card.is-active");
    if (!activeCard) return;
    const status = activeCard.querySelector(".playlist-status");
    const progress = activeCard.querySelector(".playlist-progress > span");
    if (status) {
      status.textContent = safeDuration > 0 ? `已观看 ${Math.round(percent)}%` : "正在播放";
    }
    if (progress) {
      progress.style.width = `${percent}%`;
    }
  };

  return sidebar;
}

function attachCustomControlBar(player, options = {}) {
  const {
    stageFrame,
    sidebar,
    qualityMenu,
    episodeList = [],
    title = "",
    syncSidebarState = null,
    shell = null,
    titlebar = null,
    sidebarToggle = null,
    playerContainer = null,
    closeButton = null,
  } = options;
  if (!player || !stageFrame) {
    return;
  }

  stageFrame.querySelector(".player-bottom-dock")?.remove();
  const speedMenu = createSpeedMenu(player);
  let wasSidebarCollapsedBeforeFullscreen = null;
  let controlsHideTimer = null;
  let controlsPinnedVisible = false;
  let controlsInteractionLocked = false;
  const sidebarToggleControl = sidebarToggle;
  const closeButtonControl = closeButton;

  const dock = document.createElement("div");
  dock.className = "player-bottom-dock";
  dock.addEventListener("click", (event) => event.stopPropagation());
  const volumeIndicator = document.createElement("div");
  volumeIndicator.className = "player-volume-indicator";
  let volumeIndicatorTimer = null;

  const progressRow = document.createElement("div");
  progressRow.className = "player-progress-row";

  const currentTimeLabel = document.createElement("div");
  currentTimeLabel.className = "player-progress-time";
  currentTimeLabel.textContent = "00:00";

  const progressSlider = document.createElement("input");
  progressSlider.type = "range";
  progressSlider.className = "player-progress-slider";
  progressSlider.min = "0";
  progressSlider.max = "1000";
  progressSlider.step = "1";
  progressSlider.value = "0";

  const durationLabel = document.createElement("div");
  durationLabel.className = "player-progress-time";
  durationLabel.textContent = "00:00";

  progressRow.appendChild(currentTimeLabel);
  progressRow.appendChild(progressSlider);
  progressRow.appendChild(durationLabel);

  const actionsRow = document.createElement("div");
  actionsRow.className = "player-actions-row";

  const leftGroup = document.createElement("div");
  leftGroup.className = "player-action-group is-left";

  const centerGroup = document.createElement("div");
  centerGroup.className = "player-action-group is-center";

  const rightGroup = document.createElement("div");
  rightGroup.className = "player-action-group is-right";

  const updateSliderBackground = (value) => {
    const percent = Math.max(0, Math.min(100, Number(value) || 0));
    progressSlider.style.background = `linear-gradient(90deg,#fff 0%,#fff ${percent}%,rgba(255,255,255,.22) ${percent}%,rgba(255,255,255,.22) 100%)`;
  };

  const closeMenus = () => {
    const wasPinnedVisible = controlsPinnedVisible;
    speedMenu.close();
    qualityMenu?.close();
    dock.querySelectorAll(".player-dock-btn").forEach((button) => {
      button.classList.remove("is-open");
    });
    controlsPinnedVisible = false;
    if (wasPinnedVisible) {
      scheduleControlsHide();
    }
  };

  const setControlsVisible = (visible) => {
    shell?.classList.toggle("controls-hidden", !visible);
    playerContainer?.classList.toggle("controls-hidden", !visible);
  };

  const scheduleControlsHide = () => {
    clearTimeout(controlsHideTimer);
    if (controlsPinnedVisible || controlsInteractionLocked) {
      setControlsVisible(true);
      return;
    }
    controlsHideTimer = window.setTimeout(() => {
      if (!controlsPinnedVisible && !controlsInteractionLocked) {
        setControlsVisible(false);
      }
    }, 2000);
  };

  const showControls = () => {
    setControlsVisible(true);
    scheduleControlsHide();
  };

  const hideControlsNow = () => {
    clearTimeout(controlsHideTimer);
    if (!controlsPinnedVisible && !controlsInteractionLocked) {
      setControlsVisible(false);
    }
  };

  const setControlsInteractionLocked = (locked) => {
    controlsInteractionLocked = locked;
    if (locked) {
      clearTimeout(controlsHideTimer);
      setControlsVisible(true);
      return;
    }
    scheduleControlsHide();
  };

  const handlePointerEnterControlsArea = () => {
    showControls();
  };

  const handlePointerLeaveControlsArea = (event) => {
    const container = modal?.querySelector?.(".video-player-container");
    const relatedTarget = event.relatedTarget;
    if (container && relatedTarget instanceof Node && container.contains(relatedTarget)) {
      return;
    }
    hideControlsNow();
  };

  const handleProgressSliderFocus = () => {
    setControlsInteractionLocked(true);
  };

  const handleProgressSliderBlur = () => {
    setControlsInteractionLocked(false);
  };

  const handleStageTouchStart = () => {
    showControls();
  };

  const handleProgressSliderPointerDown = () => {
    setControlsInteractionLocked(true);
  };

  const handleProgressSliderPointerUp = () => {
    setControlsInteractionLocked(false);
  };

  stageFrame.addEventListener("click", closeMenus);

  const makeButton = (label, options = {}) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `player-dock-btn${options.icon ? " is-icon" : " is-text"}${options.extraClass ? ` ${options.extraClass}` : ""}`;
    if (options.iconClass) {
      const icon = document.createElement("span");
      icon.className = `player-transport-icon ${options.iconClass}`;
      icon.setAttribute("aria-hidden", "true");
      button.appendChild(icon);
    } else {
      button.textContent = label;
    }
    if (options.ariaLabel) {
      button.setAttribute("aria-label", options.ariaLabel);
    }
    button.title = options.title || label;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      options.onClick?.(button);
    });
    return button;
  };

  const currentIndex = getCurrentEpisodeIndex(episodeList, title);
  const previousEpisode = currentIndex > 0 ? episodeList[currentIndex - 1] : null;
  const nextEpisode =
    currentIndex >= 0 && currentIndex < episodeList.length - 1
      ? episodeList[currentIndex + 1]
      : null;

  const playButton = makeButton("播放/暂停", {
    icon: true,
    extraClass: "is-transport",
    iconClass: "player-transport-icon-play",
    ariaLabel: "播放/暂停",
    title: "播放/暂停",
    onClick: () => {
      if (typeof player.paused === "function" && player.paused()) {
        player.play()?.catch?.(() => {});
      } else {
        player.pause?.();
      }
    },
  });

  const prevButton = makeButton("上一集", {
    icon: true,
    extraClass: "is-transport",
    iconClass: "player-transport-icon-prev",
    ariaLabel: previousEpisode ? `上一集：${previousEpisode.file_name}` : "没有上一集",
    title: previousEpisode ? `上一集：${previousEpisode.file_name}` : "没有上一集",
    onClick: () => {
      if (!previousEpisode) {
        showToast("已经是第一项", "info");
        return;
      }
      switchEpisode(previousEpisode, null);
    },
  });

  const nextButton = makeButton("下一集", {
    icon: true,
    extraClass: "is-transport",
    iconClass: "player-transport-icon-next",
    ariaLabel: nextEpisode ? `下一集：${nextEpisode.file_name}` : "没有下一集",
    title: nextEpisode ? `下一集：${nextEpisode.file_name}` : "没有下一集",
    onClick: () => {
      if (!nextEpisode) {
        showToast("已经是最后一项", "info");
        return;
      }
      switchEpisode(nextEpisode, null);
    },
  });

  const speedButton = makeButton("倍速", {
    onClick: (button) => {
      qualityMenu?.close();
      dock.querySelectorAll(".player-dock-btn").forEach((node) => {
        if (node !== button) node.classList.remove("is-open");
      });
      speedMenu.toggle();
      refocusPlayer();
    },
  });
  speedButton.textContent = speedMenu.getCurrentLabel();
  speedButton.title = `倍速 ${speedMenu.getCurrentLabel()}`;

  const speedMenuAnchor = document.createElement("div");
  speedMenuAnchor.className = "player-dock-menu-anchor";
  speedMenuAnchor.appendChild(speedButton);
  speedMenuAnchor.appendChild(speedMenu.element);

  const qualityButton = qualityMenu
    ? makeButton(qualityMenu.label || "画质", {
        extraClass: "is-quality",
        onClick: (button) => {
          speedMenu.close();
          dock.querySelectorAll(".player-dock-btn").forEach((node) => {
            if (node !== button) node.classList.remove("is-open");
          });
          qualityMenu.toggle();
          refocusPlayer();
        },
      })
    : null;

  const qualityMenuAnchor = qualityButton
    ? document.createElement("div")
    : null;
  if (qualityMenuAnchor && qualityButton && qualityMenu) {
    qualityMenuAnchor.className = "player-dock-menu-anchor";
    qualityMenuAnchor.appendChild(qualityButton);
    qualityMenuAnchor.appendChild(qualityMenu.element);
  }

  let floatingMenuHideTimer = null;

  const refocusPlayer = () => {
    playerContainer?.focus();
  };

  const clearFloatingMenuHideTimer = () => {
    clearTimeout(floatingMenuHideTimer);
    floatingMenuHideTimer = null;
  };

  const scheduleFloatingMenuHide = () => {
    clearFloatingMenuHideTimer();
    floatingMenuHideTimer = window.setTimeout(() => {
      speedMenu.close();
      qualityMenu?.close();
      refocusPlayer();
    }, 140);
  };

  const bindFloatingMenuAutoHide = (anchor, menuApi) => {
    if (!anchor || !menuApi) {
      return;
    }
    anchor.addEventListener("mouseenter", clearFloatingMenuHideTimer);
    anchor.addEventListener("mouseleave", () => {
      if (menuApi.isOpen()) {
        scheduleFloatingMenuHide();
      }
    });
    menuApi.element.addEventListener("mouseenter", clearFloatingMenuHideTimer);
    menuApi.element.addEventListener("mouseleave", () => {
      if (menuApi.isOpen()) {
        scheduleFloatingMenuHide();
      }
    });
  };

  bindFloatingMenuAutoHide(speedMenuAnchor, speedMenu);
  bindFloatingMenuAutoHide(qualityMenuAnchor, qualityMenu);

  const toggleFullscreen = async () => {
    const container = modal?.querySelector?.(".video-player-container");
    if (!container) return;
    container.focus();
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await container.requestFullscreen();
      }
      container.focus();
    } catch (error) {
      console.warn("切换全屏失败:", error);
      container.focus();
    }
  };

  const fullscreenButton = makeButton("⛶", {
    icon: true,
    title: "全屏",
    onClick: () => {
      playerContainer?.focus();
      toggleFullscreen();
    },
  });

  leftGroup.appendChild(playButton);
  leftGroup.appendChild(prevButton);
  leftGroup.appendChild(nextButton);

  centerGroup.appendChild(speedMenuAnchor);
  if (qualityMenuAnchor) {
    centerGroup.appendChild(qualityMenuAnchor);
  }

  rightGroup.appendChild(fullscreenButton);

  actionsRow.appendChild(leftGroup);
  actionsRow.appendChild(centerGroup);
  actionsRow.appendChild(rightGroup);

  dock.appendChild(progressRow);
  dock.appendChild(actionsRow);
  stageFrame.appendChild(dock);
  stageFrame.appendChild(volumeIndicator);

  const syncPlayButton = () => {
    const paused = typeof player.paused === "function" ? player.paused() : true;
    playButton.classList.toggle("is-playing", !paused);
    playButton.title = paused ? "播放" : "暂停";
    playButton.setAttribute("aria-label", paused ? "播放" : "暂停");
  };

  const applyVolume = (volumePercent) => {
    const normalizedVolume = Math.max(0, Math.min(1, volumePercent / 100));
    player.volume?.(normalizedVolume);
    player.muted?.(normalizedVolume <= 0);
  };

  const showVolumeIndicator = () => {
    const muted = typeof player.muted === "function" ? player.muted() : false;
    const volume = muted ? 0 : Math.round((Number(player.volume?.()) || 0) * 100);
    volumeIndicator.textContent = `${volume}%`;
    volumeIndicator.classList.add("show");
    clearTimeout(volumeIndicatorTimer);
    volumeIndicatorTimer = window.setTimeout(() => {
      volumeIndicator.classList.remove("show");
    }, 900);
  };

  const syncSpeedButton = () => {
    const speedLabel = speedMenu.getCurrentLabel();
    speedMenu.syncActive();
    speedButton.textContent = speedLabel;
    speedButton.title = `倍速 ${speedLabel}`;
  };

  const syncProgress = () => {
    const duration = Number(player.duration?.()) || 0;
    const currentTime = Number(player.currentTime?.()) || 0;
    currentTimeLabel.textContent = formatTime(currentTime);
    durationLabel.textContent = formatTime(duration);
    const percent = duration > 0 ? (currentTime / duration) * 100 : 0;
    progressSlider.value = String(Math.round((duration > 0 ? currentTime / duration : 0) * 1000));
    updateSliderBackground(percent);
  };

  progressSlider.addEventListener("input", () => {
    const duration = Number(player.duration?.()) || 0;
    if (!duration) return;
    const nextTime = (Number(progressSlider.value) / 1000) * duration;
    currentTimeLabel.textContent = formatTime(nextTime);
    updateSliderBackground((Number(progressSlider.value) / 1000) * 100);
  });

  progressSlider.addEventListener("change", () => {
    const duration = Number(player.duration?.()) || 0;
    if (!duration) return;
    player.currentTime?.((Number(progressSlider.value) / 1000) * duration);
  });

  speedMenu.onVisibilityChange((open) => {
    controlsPinnedVisible = open || qualityMenu?.isOpen?.();
    speedButton.classList.toggle("is-open", open);
    if (controlsPinnedVisible) {
      setControlsVisible(true);
    } else {
      scheduleControlsHide();
      refocusPlayer();
    }
  });

  qualityMenu?.onVisibilityChange((open) => {
    controlsPinnedVisible = open || speedMenu.isOpen();
    qualityButton?.classList.toggle("is-open", open);
    if (controlsPinnedVisible) {
      setControlsVisible(true);
    } else {
      scheduleControlsHide();
      refocusPlayer();
    }
  });

  const handleFullscreenChange = () => {
    const container = modal?.querySelector?.(".video-player-container");
    const isFullscreen = !!container && document.fullscreenElement === container;
    if (isFullscreen) {
      wasSidebarCollapsedBeforeFullscreen = playerRuntimeState.isSidebarCollapsed;
      if (!playerRuntimeState.isSidebarCollapsed) {
        playerRuntimeState.isSidebarCollapsed = true;
        syncSidebarState?.();
      }
    } else if (wasSidebarCollapsedBeforeFullscreen !== null) {
      playerRuntimeState.isSidebarCollapsed = wasSidebarCollapsedBeforeFullscreen;
      syncSidebarState?.();
      wasSidebarCollapsedBeforeFullscreen = null;
    }
    playerContainer?.focus();
  };

  const handleKeyboardShortcuts = (event) => {
    if (modal?.style.display !== "flex") return;
    const target = event.target;
    const isInteractiveTarget =
      target instanceof HTMLElement &&
      (target.tagName === "BUTTON" ||
        target.tagName === "A" ||
        target.getAttribute("role") === "button");
    const isTypingTarget =
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable);
    if (target === progressSlider) {
      return;
    }
    if (isTypingTarget && target !== progressSlider) {
      return;
    }

    if ((event.key === " " || event.code === "Space") && !isInteractiveTarget) {
      event.preventDefault();
      if (typeof player.paused === "function" && player.paused()) {
        player.play()?.catch?.(() => {});
      } else {
        player.pause?.();
      }
      return;
    }

    if ((event.key === "m" || event.key === "M") && !isInteractiveTarget) {
      event.preventDefault();
      player.muted?.(!player.muted?.());
      showVolumeIndicator();
      return;
    }

    if ((event.key === "f" || event.key === "F") && !isInteractiveTarget) {
      event.preventDefault();
      toggleFullscreen();
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const duration = Number(player.duration?.()) || 0;
      if (!duration) return;
      const delta = event.key === "ArrowRight" ? 5 : -5;
      const nextTime = Math.max(0, Math.min(duration, (Number(player.currentTime?.()) || 0) + delta));
      player.currentTime?.(nextTime);
      syncProgress();
      return;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const currentVolume = typeof player.muted === "function" && player.muted() ? 0 : (Number(player.volume?.()) || 0);
      const delta = event.key === "ArrowUp" ? 0.05 : -0.05;
      applyVolume(Math.round((currentVolume + delta) * 100));
      showVolumeIndicator();
    }
  };

  document.addEventListener("fullscreenchange", handleFullscreenChange);
  document.addEventListener("keydown", handleKeyboardShortcuts);
  stageFrame.addEventListener("mousemove", showControls);
  stageFrame.addEventListener("mouseenter", handlePointerEnterControlsArea);
  stageFrame.addEventListener("mouseleave", handlePointerLeaveControlsArea);
  stageFrame.addEventListener("touchstart", handleStageTouchStart, { passive: true });
  progressSlider.addEventListener("focus", handleProgressSliderFocus);
  progressSlider.addEventListener("blur", handleProgressSliderBlur);
  progressSlider.addEventListener("pointerdown", handleProgressSliderPointerDown);
  progressSlider.addEventListener("pointerup", handleProgressSliderPointerUp);
  progressSlider.addEventListener("pointercancel", handleProgressSliderPointerUp);
  titlebar?.addEventListener("mousemove", showControls);
  titlebar?.addEventListener("mouseenter", handlePointerEnterControlsArea);
  titlebar?.addEventListener("mouseleave", handlePointerLeaveControlsArea);
  sidebarToggleControl?.addEventListener("mousemove", showControls);
  sidebarToggleControl?.addEventListener("mouseenter", handlePointerEnterControlsArea);
  sidebarToggleControl?.addEventListener("mouseleave", handlePointerLeaveControlsArea);
  closeButtonControl?.addEventListener("mousemove", showControls);
  closeButtonControl?.addEventListener("mouseenter", handlePointerEnterControlsArea);
  closeButtonControl?.addEventListener("mouseleave", handlePointerLeaveControlsArea);

  player.on("play", syncPlayButton);
  player.on("pause", syncPlayButton);
  player.on("timeupdate", syncProgress);
  player.on("loadedmetadata", syncProgress);
  player.on("durationchange", syncProgress);
  player.on("ratechange", syncSpeedButton);
  player.on("ended", syncPlayButton);
  playerRuntimeState.currentPlayerCleanup = () => {
    clearTimeout(controlsHideTimer);
    clearTimeout(volumeIndicatorTimer);
    clearFloatingMenuHideTimer();
    document.removeEventListener("fullscreenchange", handleFullscreenChange);
    document.removeEventListener("keydown", handleKeyboardShortcuts);
    stageFrame.removeEventListener("mousemove", showControls);
    stageFrame.removeEventListener("mouseenter", handlePointerEnterControlsArea);
    stageFrame.removeEventListener("mouseleave", handlePointerLeaveControlsArea);
    stageFrame.removeEventListener("touchstart", handleStageTouchStart);
    progressSlider.removeEventListener("focus", handleProgressSliderFocus);
    progressSlider.removeEventListener("blur", handleProgressSliderBlur);
    progressSlider.removeEventListener("pointerdown", handleProgressSliderPointerDown);
    progressSlider.removeEventListener("pointerup", handleProgressSliderPointerUp);
    progressSlider.removeEventListener("pointercancel", handleProgressSliderPointerUp);
    titlebar?.removeEventListener("mousemove", showControls);
    titlebar?.removeEventListener("mouseenter", handlePointerEnterControlsArea);
    titlebar?.removeEventListener("mouseleave", handlePointerLeaveControlsArea);
    sidebarToggleControl?.removeEventListener("mousemove", showControls);
    sidebarToggleControl?.removeEventListener("mouseenter", handlePointerEnterControlsArea);
    sidebarToggleControl?.removeEventListener("mouseleave", handlePointerLeaveControlsArea);
    closeButtonControl?.removeEventListener("mousemove", showControls);
    closeButtonControl?.removeEventListener("mouseenter", handlePointerEnterControlsArea);
    closeButtonControl?.removeEventListener("mouseleave", handlePointerLeaveControlsArea);
  };

  syncPlayButton();
  syncSpeedButton();
  syncProgress();
  showControls();
}

function bindSidebarPlayback(player, sidebar) {
  if (!player || !sidebar?.updatePlaybackProgress) {
    return;
  }

  const update = () => {
    sidebar.updatePlaybackProgress({
      currentTime: typeof player.currentTime === "function" ? player.currentTime() : 0,
      duration: typeof player.duration === "function" ? player.duration() : 0,
    });
  };

  player.on("loadedmetadata", update);
  player.on("timeupdate", update);
  player.on("ended", update);
  update();
}

function createPlayerErrorOverlay(message, details = "") {
  const overlay = document.createElement("div");
  overlay.className = "error-overlay";

  const icon = document.createElement("div");
  icon.className = "error-icon";
  icon.textContent = "⚠️";

  const messageElement = document.createElement("div");
  messageElement.className = "error-message";
  messageElement.textContent = message;

  const detailsElement = document.createElement("div");
  detailsElement.className = "error-details";
  detailsElement.textContent = details;

  overlay.appendChild(icon);
  overlay.appendChild(messageElement);
  overlay.appendChild(detailsElement);
  return overlay;
}

function createVideojsInstance(host, videoUrl, playOptions = {}) {
  const videojsLib = window.videojs;
  if (!videojsLib) {
    throw new Error("Video.js 未加载");
  }

  host.innerHTML = "";

  const videoElement = document.createElement("video");
  videoElement.className = "video-js vjs-fill";
  videoElement.controls = false;
  videoElement.preload = "auto";
  videoElement.setAttribute("playsinline", "true");
  videoElement.setAttribute("webkit-playsinline", "true");
  videoElement.setAttribute("x5-playsinline", "true");
  videoElement.setAttribute("x5-video-player-type", "h5");
  host.appendChild(videoElement);

  const isM3U8 = /\.m3u8(?:$|\?)/i.test(videoUrl);
  const sourceType = isM3U8 ? "application/x-mpegURL" : "video/mp4";
  const player = videojsLib(videoElement, {
    language: "zh-CN",
    controls: false,
    preload: "auto",
    autoplay: false,
    muted: false,
    fluid: false,
    fill: true,
    responsive: true,
    errorDisplay: true,
    bigPlayButton: false,
    disablePictureInPicture: true,
    textTrackDisplay: false,
    controlBar: false,
    html5: {
      vhs: {
        withCredentials: true,
        overrideNative:
          videojsLib.browser?.IS_SAFARI || videojsLib.browser?.IS_IOS
            ? false
            : true,
      },
      nativeAudioTracks: false,
      nativeVideoTracks: false,
    },
    sources: [
      {
        src: videoUrl,
        type: sourceType,
      },
    ],
  });

  const resumePlayback = () => {
    if (playOptions.resumeTime > 0) {
      try {
        player.currentTime(playOptions.resumeTime);
      } catch (error) {
        console.warn("恢复播放进度失败:", error);
      }
    }

    if (playOptions.autoplay) {
      const playResult = player.play();
      if (playResult && typeof playResult.catch === "function") {
        playResult.catch(() => {});
      }
    }
  };

  player.ready(() => {
    if (player.readyState() >= 1) {
      resumePlayback();
    } else {
      player.one("loadedmetadata", resumePlayback);
    }
  });

  player.on("error", () => {
    const error = player.error();
    console.error("❌ Video.js 播放错误:", error);
    showToast(
      `播放器错误: ${error?.message || error?.code || "未知错误"}`,
      "error",
    );
  });

  return player;
}

// 更新播放器视频源：当前试验版直接重建实例，逻辑更简单
function updatePlayerSource(newUrl, newTitle, videoList = null, episodeList = null) {
  const playbackState = getCurrentPlaybackState();
  createPlayer(newUrl, newTitle, videoList, episodeList, {
    ...playbackState,
    activeUrl: newUrl,
  });
}

// 创建播放器实例
function createPlayer(
  videoUrl,
  title = "视频播放",
  videoList = null,
  episodeList = null,
  playOptions = {},
) {
  const container = document.getElementById("video-container");
  if (!container) return;
  const playerContainer = modal?.querySelector?.(".video-player-container") || null;
  const closeButton = modal?.querySelector?.(".video-player-close") || null;

  destroyCurrentPlayer();
  container.innerHTML = "";

  const activeUrl = playOptions.activeUrl || videoUrl;
  const shell = document.createElement("div");
  shell.className = "player-shell";

  const titlebar = document.createElement("div");
  titlebar.className = "player-titlebar";

  const meta = document.createElement("div");
  meta.className = "player-meta";

  const badge = document.createElement("span");
  badge.className = "player-badge";
  badge.textContent = getSourceBadgeText(videoUrl);

  const titleElement = document.createElement("div");
  titleElement.className = "video-player-title";
  titleElement.textContent = title;

  const subtitleElement = document.createElement("div");
  subtitleElement.className = "player-subtitle";
  subtitleElement.textContent = buildPlayerSubtitle(
    videoUrl,
    videoList,
    episodeList,
    activeUrl,
  );

  const titlebarRight = document.createElement("div");
  titlebarRight.className = "player-titlebar-right";
  titlebarRight.textContent = "超级播放器";

  meta.appendChild(badge);
  meta.appendChild(titleElement);
  meta.appendChild(subtitleElement);
  titlebar.appendChild(meta);
  titlebar.appendChild(titlebarRight);

  const body = document.createElement("div");
  body.className = "player-body";

  const left = document.createElement("div");
  left.className = "player-left";

  const stage = document.createElement("div");
  stage.className = "player-stage";

  const stageFrame = document.createElement("div");
  stageFrame.className = "player-stage-frame";

  const host = document.createElement("div");
  host.className = "videojs-host";
  host.id = `videojs-host-${Date.now()}`;

  const currentFile = getCurrentEpisodeFile(episodeList, title);
  const qualityMenu = createQualityMenu(videoList, activeUrl, title, episodeList);
  const sidebar = createSidebar(title, videoList, episodeList, activeUrl);
  const sidebarToggle = document.createElement("button");
  sidebarToggle.type = "button";
  sidebarToggle.className = "player-sidebar-toggle";
  sidebarToggle.title = playerRuntimeState.isSidebarCollapsed ? "显示侧栏" : "隐藏侧栏";
  sidebarToggle.setAttribute(
    "aria-label",
    playerRuntimeState.isSidebarCollapsed ? "显示侧栏" : "隐藏侧栏",
  );
  const sidebarToggleIcon = document.createElement("span");
  sidebarToggleIcon.className = "player-sidebar-toggle-icon";
  sidebarToggleIcon.setAttribute("aria-hidden", "true");
  sidebarToggle.appendChild(sidebarToggleIcon);

  const syncSidebarState = () => {
    body.classList.toggle("sidebar-collapsed", playerRuntimeState.isSidebarCollapsed);
    sidebarToggle.title = playerRuntimeState.isSidebarCollapsed ? "显示侧栏" : "隐藏侧栏";
    sidebarToggle.setAttribute(
      "aria-label",
      playerRuntimeState.isSidebarCollapsed ? "显示侧栏" : "隐藏侧栏",
    );
  };

  sidebarToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    playerRuntimeState.isSidebarCollapsed = !playerRuntimeState.isSidebarCollapsed;
    syncSidebarState();
  });

  stageFrame.appendChild(host);
  stage.appendChild(stageFrame);
  left.appendChild(stage);
  body.appendChild(left);
  body.appendChild(sidebar);
  body.appendChild(sidebarToggle);
  syncSidebarState();

  shell.appendChild(titlebar);
  shell.appendChild(body);
  container.appendChild(shell);

  try {
    playerRuntimeState.currentPlayer = createVideojsInstance(host, videoUrl, playOptions);
    attachCustomControlBar(playerRuntimeState.currentPlayer, {
      stageFrame,
      sidebar,
      qualityMenu,
      episodeList,
      title,
      syncSidebarState,
      shell,
      titlebar,
      sidebarToggle,
      playerContainer,
      closeButton,
    });
    bindSidebarPlayback(playerRuntimeState.currentPlayer, sidebar);
    if (/\.m3u8(?:$|\?)/i.test(videoUrl)) {
      showToast("已使用 Video.js 加载 m3u8", "info");
    }
  } catch (error) {
    console.error("❌ Video.js 初始化失败:", error);
    host.appendChild(
      createPlayerErrorOverlay(
        "播放器初始化失败",
        error?.message || "请稍后重试",
      ),
    );
    showToast(`播放器初始化失败: ${error?.message || "未知错误"}`, "error");
  }
}
