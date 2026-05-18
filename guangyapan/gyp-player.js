// gyp-player.js
// ArtPlayer 播放器、选集列表和播放资源清理。
// 由 guangyapan_magnet_player.user.js 通过 @require 远程加载。

'use strict';

function showPlayerModal(videos, meta) {
  const ArtPlayerCtor = typeof Artplayer === 'function' ? Artplayer : window.Artplayer;
  if (typeof ArtPlayerCtor !== 'function') {
    showErrorModal('播放器加载失败', 'ArtPlayer 未加载。');
    return;
  }

  let currentIndex = 0;
  let currentLink = '';
  let art = null;
  let playerDestroyed = false;
  let playerFullscreen = false;
  let loadSeq = 0;
  let chromeHideTimer = 0;
  let cleanupStarted = false;
  const urlCache = new Map();
  const episodeButtons = [];
  const titleNode = createElement('strong', { className: 'gyp-player-title', text: videos[0] ? videos[0].fileName : '-' });
  const artHost = createElement('div', { className: 'gyp-artplayer-app' });
  const loadingNode = createElement('div', { className: 'gyp-player-loading', 'aria-hidden': 'true' });
  const floatingNode = createElement('div', { className: 'gyp-player-floating' }, [titleNode]);

  function setLoading(loading) {
    loadingNode.classList.toggle('is-visible', Boolean(loading));
  }

  function syncEpisodeState() {
    for (const [buttonIndex, button] of episodeButtons.entries()) {
      const active = buttonIndex === currentIndex;
      button.classList.toggle('is-active', active);
      if (active) {
        button.setAttribute('aria-current', 'true');
      } else {
        button.removeAttribute('aria-current');
      }
      const statusNode = button.querySelector('.gyp-episode-status');
      if (statusNode) {
        statusNode.textContent = active ? '正在播放' : '待播放';
      }
      if (!active) {
        const progressNode = button.querySelector('.gyp-episode-progress > span');
        if (progressNode) {
          progressNode.style.width = '0%';
        }
      }
    }
  }

  function formatDuration(value) {
    const totalSeconds = Math.floor(Number(value) || 0);
    if (totalSeconds <= 0) {
      return '--:--';
    }
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  function getVideoDuration() {
    if (art && art.video) {
      return Number(art.video.duration) || 0;
    }
    return 0;
  }

  function getVideoCurrentTime() {
    if (art && art.video) {
      return Number(art.video.currentTime) || 0;
    }
    return 0;
  }

  function updateActiveEpisodeProgress() {
    const activeButton = episodeButtons[currentIndex];
    if (!activeButton) {
      return;
    }
    const duration = getVideoDuration();
    const currentTime = getVideoCurrentTime();
    const percent = duration > 0 ? Math.max(0, Math.min(100, (currentTime / duration) * 100)) : 0;
    const statusNode = activeButton.querySelector('.gyp-episode-status');
    const progressNode = activeButton.querySelector('.gyp-episode-progress > span');
    const durationNode = activeButton.querySelector('.gyp-episode-duration');
    if (statusNode) {
      statusNode.textContent = duration > 0 && percent > 0 ? `已观看 ${Math.round(percent)}%` : '正在播放';
    }
    if (progressNode) {
      progressNode.style.width = `${percent}%`;
    }
    if (durationNode && duration > 0) {
      durationNode.textContent = formatDuration(duration);
    }
  }

  function downloadCurrentLink() {
    if (!currentLink) {
      return;
    }
    const item = videos[currentIndex] || {};
    const link = document.createElement('a');
    link.href = currentLink;
    link.download = sanitizeDownloadFileName(item.fileName || '');
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function setChromeIdle(idle) {
    const isIdle = Boolean(idle);
    layout.classList.toggle('is-chrome-idle', isIdle);
    const artRoot = getArtRoot();
    if (artRoot) {
      artRoot.classList.toggle('gyp-is-chrome-idle', isIdle);
      artRoot.classList.toggle('gyp-is-playlist-open', playlistPanel.classList.contains('is-open'));
    }
  }

  function scheduleChromeHide() {
    window.clearTimeout(chromeHideTimer);
    setChromeIdle(false);
    chromeHideTimer = window.setTimeout(() => setChromeIdle(true), PLAYER_CHROME_HIDE_DELAY_MS);
  }

  function getArtRoot() {
    return artHost.querySelector('.art-video-player');
  }

  function isArtFullscreen() {
    const artRoot = getArtRoot();
    return Boolean(
      document.fullscreenElement
      || (art && art.fullscreen)
      || (art && art.fullscreenWeb)
      || (artRoot && (artRoot.classList.contains('art-fullscreen') || artRoot.classList.contains('art-fullscreen-web')))
    );
  }

  function mountPlaylistForFullscreen(fullscreen) {
    const artRoot = getArtRoot();
    const target = fullscreen && artRoot ? artRoot : layout;
    if (floatingNode.parentElement === target && playlistToggle.parentElement === target && playlistBackdrop.parentElement === target && playlistPanel.parentElement === target) {
      return;
    }
    target.append(floatingNode, playlistToggle, playlistBackdrop, playlistPanel);
  }

  function setPlayerFullscreen(fullscreen) {
    playerFullscreen = typeof fullscreen === 'boolean' ? fullscreen : isArtFullscreen();
    layout.classList.toggle('is-player-fullscreen', playerFullscreen);
    mountPlaylistForFullscreen(playerFullscreen);
  }

  function handleFullscreenChange(fullscreen) {
    if (typeof fullscreen === 'boolean') {
      setPlayerFullscreen(fullscreen);
      return;
    }
    window.setTimeout(() => setPlayerFullscreen(isArtFullscreen()), 0);
  }

  function handlePlayerKeydown(event) {
    if (event.key !== 'Escape' || isArtFullscreen()) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    clearModal();
  }

  function createArt(url, title) {
    art = new ArtPlayerCtor({
      container: artHost,
      url,
      title,
      theme: '#72d7ff',
      setting: true,
      playbackRate: true,
      aspectRatio: true,
      pip: true,
      fullscreen: true,
      fullscreenWeb: true,
      controls: [
        {
          name: 'gyp-prev',
          position: 'left',
          html: '<span class="gyp-transport-icon gyp-transport-icon-prev" aria-hidden="true"></span>',
          tooltip: '上一集',
          click: () => playAt(currentIndex - 1),
        },
        {
          name: 'gyp-next',
          position: 'left',
          html: '<span class="gyp-transport-icon gyp-transport-icon-next" aria-hidden="true"></span>',
          tooltip: '下一集',
          click: () => playAt(currentIndex + 1),
        },
        {
          name: 'gyp-download',
          position: 'right',
          html: '下载',
          tooltip: '下载当前视频',
          click: downloadCurrentLink,
        },
      ],
      icons: {
        state: '<svg width="92" height="92" viewBox="0 0 92 92" xmlns="http://www.w3.org/2000/svg"><circle cx="46" cy="46" r="45" fill="rgba(0,0,0,.45)" stroke="rgba(255,255,255,.18)"/><path d="M37 28v36l29-18-29-18z" fill="#fff"/></svg>',
      },
    });
    copyArtPlayerStylesToShadow();

    art.on('video:ended', () => {
      if (currentIndex + 1 < videos.length) {
        playAt(currentIndex + 1);
      }
    });
    art.on('error', () => {
      if (art && art.notice) {
        art.notice.show = '播放失败';
      }
    });
    art.on('video:timeupdate', updateActiveEpisodeProgress);
    art.on('video:durationchange', updateActiveEpisodeProgress);
    art.on('video:loadedmetadata', updateActiveEpisodeProgress);
    art.on('fullscreen', handleFullscreenChange);
    art.on('fullscreenWeb', handleFullscreenChange);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    handleFullscreenChange();
    scheduleChromeHide();
  }

  async function playAt(index) {
    if (index < 0 || index >= videos.length || playerDestroyed) {
      return;
    }
    const seq = ++loadSeq;
    currentIndex = index;
    currentLink = '';
    const item = videos[index];
    titleNode.textContent = item.fileName;
    syncEpisodeState();
    setLoading(true);

    try {
      let link = urlCache.get(item.fileId);
      if (!link) {
        link = await fetchPlayableUrl(item.fileId);
        urlCache.set(item.fileId, link);
      }
      if (playerDestroyed || seq !== loadSeq) {
        return;
      }
      currentLink = link.url;
      if (!art) {
        createArt(link.url, item.fileName);
      } else {
        art.switchUrl(link.url);
        art.title = item.fileName;
      }
      updateActiveEpisodeProgress();
      scheduleChromeHide();
      const playPromise = art.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {});
      }
    } catch (error) {
      if (seq === loadSeq && !playerDestroyed) {
        showToast('获取播放地址失败', errorToMessage(error), 'error');
      }
    } finally {
      if (seq === loadSeq && !playerDestroyed) {
        setLoading(false);
      }
    }
  }

  function destroyPlayer() {
    playerDestroyed = true;
    loadSeq += 1;
    window.clearTimeout(chromeHideTimer);
    document.removeEventListener('fullscreenchange', handleFullscreenChange);
    document.removeEventListener('keydown', handlePlayerKeydown, true);
    if (art) {
      try {
        art.destroy();
      } catch (_) {}
      art = null;
    }
    cleanupCreatedResource();
  }

  function cleanupCreatedResource() {
    if (cleanupStarted || !meta || !meta.folderId) {
      return;
    }
    cleanupStarted = true;
    deleteCloudFiles([meta.folderId]).catch((error) => {
      showToast('自动删除失败', errorToMessage(error), 'error');
    });
  }

  const episodeList = createElement('div', { className: 'gyp-episode-list', 'aria-label': '剧集列表' });
  videos.forEach((item, index) => {
    const thumbAttrs = { className: 'gyp-episode-thumb' };
    if (item.thumbnail) {
      thumbAttrs.style = `background-image:url("${String(item.thumbnail).replace(/"/g, '%22')}")`;
    }
    const button = createElement('button', {
      className: 'gyp-episode',
      type: 'button',
      title: item.path,
      'aria-label': `播放第 ${index + 1} 集：${item.fileName}`,
      onclick: () => playAt(index),
    }, [
      createElement('span', thumbAttrs, [
        createElement('span', { className: 'gyp-episode-duration', text: formatDuration(item.duration) }),
      ]),
      createElement('span', { className: 'gyp-episode-content' }, [
        createElement('span', { className: 'gyp-episode-info' }, [
          createElement('strong', { text: item.fileName }),
        ]),
        createElement('span', { className: 'gyp-episode-status', text: index === currentIndex ? '正在播放' : '待播放' }),
        createElement('span', { className: 'gyp-episode-progress', 'aria-hidden': 'true' }, [
          createElement('span'),
        ]),
      ]),
    ]);
    episodeButtons.push(button);
    episodeList.appendChild(button);
  });

  const playlistToggle = createElement('button', {
    className: 'gyp-playlist-toggle',
    type: 'button',
    'aria-label': '展开播放列表',
    'aria-expanded': 'false',
    text: '<',
  });
  const playlistClose = createElement('button', { className: 'gyp-playlist-close', type: 'button', text: '×', 'aria-label': '关闭播放列表' });
  const playlistPanel = createElement('aside', { className: 'gyp-player-playlist' }, [
    createElement('div', { className: 'gyp-playlist-header' }, [
      createElement('span', { text: '选集' }),
      playlistClose,
    ]),
    episodeList,
  ]);
  const playlistBackdrop = createElement('div', { className: 'gyp-playlist-backdrop' });
  const layout = createElement('div', { className: 'gyp-player-layout' }, [
    createElement('main', { className: 'gyp-player-stage' }, [
      createElement('div', { className: 'gyp-player-frame' }, [artHost, loadingNode]),
    ]),
    floatingNode,
    playlistToggle,
    playlistBackdrop,
    playlistPanel,
  ]);

  function setPlaylistOpen(open) {
    const nextOpen = Boolean(open);
    layout.classList.toggle('is-playlist-open', nextOpen);
    playlistPanel.classList.toggle('is-open', nextOpen);
    playlistBackdrop.classList.toggle('is-visible', nextOpen);
    playlistToggle.setAttribute('aria-expanded', String(nextOpen));
    playlistToggle.setAttribute('aria-label', nextOpen ? '收起播放列表' : '展开播放列表');
    const artRoot = getArtRoot();
    if (artRoot) {
      artRoot.classList.toggle('gyp-is-playlist-open', nextOpen);
    }
    scheduleChromeHide();
  }

  playlistToggle.addEventListener('click', () => setPlaylistOpen(!playlistPanel.classList.contains('is-open')));
  playlistClose.addEventListener('click', () => setPlaylistOpen(false));
  playlistBackdrop.addEventListener('click', () => setPlaylistOpen(false));
  ['mousemove', 'mousedown', 'touchstart', 'keydown'].forEach((eventName) => {
    layout.addEventListener(eventName, scheduleChromeHide, { passive: true, capture: true });
    artHost.addEventListener(eventName, scheduleChromeHide, { passive: true, capture: true });
  });
  document.addEventListener('keydown', handlePlayerKeydown, true);

  const card = createElement('section', { className: 'gyp-player-card', 'aria-label': '光鸭剧集播放器' }, [
    layout,
  ]);
  mountModal(card, { closeOnBackdrop: false, onClose: destroyPlayer });
  playAt(0);
}
