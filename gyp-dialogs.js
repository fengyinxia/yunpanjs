// gyp-dialogs.js
// 通用 UI、弹窗、设置面板、通知和样式。
// 由 guangyapan_magnet_player.user.js 通过 @require 远程加载。

'use strict';

function ensureUi() {
  if (ui) {
    return ui;
  }

  const host = document.createElement('div');
  host.id = 'gyp-magnet-player-root';
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = buildStyles();
  const mount = document.createElement('div');
  shadow.append(style, mount);
  ui = { host, shadow, mount };
  return ui;
}

function copyArtPlayerStylesToShadow() {
  if (!ui || ui.shadow.querySelector('[data-gyp-artplayer-style]')) {
    return;
  }
  const styles = Array.from(document.querySelectorAll('style')).filter((style) => /art-video-player|artplayer/i.test(style.textContent || ''));
  for (const style of styles) {
    const clone = document.createElement('style');
    clone.setAttribute('data-gyp-artplayer-style', '1');
    clone.textContent = style.textContent || '';
    ui.shadow.insertBefore(clone, ui.mount);
  }
}

function createElement(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (key === 'className') {
      node.className = value;
    } else if (key === 'text') {
      node.textContent = value;
    } else if (key === 'html') {
      node.innerHTML = value;
    } else if (key === 'checked') {
      node.checked = Boolean(value);
    } else if (key === 'value') {
      node.value = value;
    } else if (key === 'type') {
      node.type = value;
    } else if (key === 'disabled') {
      node.disabled = Boolean(value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      node.setAttribute(key, value);
    }
  }
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child === undefined || child === null) {
      continue;
    }
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function clearModal() {
  if (state.currentModal) {
    const modal = state.currentModal;
    state.currentModal = null;
    if (typeof modal.__gypOnClose === 'function') {
      try {
        modal.__gypOnClose();
      } catch (_) {}
    }
    modal.remove();
  }
}

function mountModal(card, options = {}) {
  ensureUi();
  clearModal();
  const overlay = createElement('div', { className: 'gyp-overlay', role: 'dialog', 'aria-modal': 'true' }, [card]);
  if (typeof options.onClose === 'function') {
    overlay.__gypOnClose = options.onClose;
  }
  if (options.closeOnBackdrop !== false) {
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        clearModal();
      }
    });
  }
  ui.mount.appendChild(overlay);
  state.currentModal = overlay;
  return overlay;
}

function cardHeader(title, subtitle, onClose) {
  return createElement('div', { className: 'gyp-card-header' }, [
    createElement('div', {}, [
      createElement('div', { className: 'gyp-eyebrow', text: 'Guangya Magnet Player' }),
      createElement('h2', { text: title }),
      subtitle ? createElement('p', { text: subtitle }) : null,
    ]),
    createElement('button', { className: 'gyp-icon-button', type: 'button', text: '×', onclick: onClose || clearModal, 'aria-label': '关闭' }),
  ]);
}

function showProgressModal(title, message, options = {}) {
  const titleNode = createElement('h2', { text: title });
  const messageNode = createElement('p', { className: 'gyp-progress-message', text: message });
  let cancelButton = null;
  if (typeof options.onCancel === 'function') {
    cancelButton = createElement('button', {
      className: 'gyp-button gyp-button-secondary',
      type: 'button',
      text: options.cancelText || '退出',
      onclick: async () => {
        cancelButton.disabled = true;
        cancelButton.textContent = options.cancelingText || '正在取消...';
        try {
          await options.onCancel();
        } catch (error) {
          cancelButton.disabled = false;
          cancelButton.textContent = options.cancelText || '退出';
          showToast(options.cancelErrorTitle || '取消失败', errorToMessage(error), 'error');
        }
      },
    });
  }
  const card = createElement('section', { className: 'gyp-card gyp-progress-card' }, [
    createElement('div', { className: 'gyp-loader' }),
    titleNode,
    messageNode,
    cancelButton ? createElement('div', { className: 'gyp-actions gyp-progress-actions' }, [cancelButton]) : null,
  ]);
  mountModal(card, { closeOnBackdrop: false });
  return {
    update(nextTitle, nextMessage) {
      titleNode.textContent = nextTitle;
      messageNode.textContent = nextMessage;
    },
    close: clearModal,
  };
}

function showErrorModal(title, message) {
  const authSyncButton = isGuangyaSite()
    ? createElement('button', { className: 'gyp-button gyp-button-secondary', type: 'button', text: '同步官网认证', onclick: () => syncAuthFromCurrentPage({ showResult: true }) })
    : null;
  const card = createElement('section', { className: 'gyp-card' }, [
    cardHeader(title, '', clearModal),
    createElement('div', { className: 'gyp-card-body' }, [
      createElement('div', { className: 'gyp-alert gyp-alert-error', text: message }),
      createElement('div', { className: 'gyp-actions' }, [
        authSyncButton,
        createElement('button', { className: 'gyp-button gyp-button-secondary', type: 'button', text: '配置认证', onclick: showSettingsModal }),
        createElement('button', { className: 'gyp-button gyp-button-primary', type: 'button', text: '知道了', onclick: clearModal }),
      ]),
    ]),
  ]);
  mountModal(card);
}

function showSelectionModal(context) {
  const summaryText = createElement('span', { className: 'gyp-selection-summary', text: '' });
  const filterInput = createElement('input', { className: 'gyp-selection-search', type: 'search', placeholder: '搜索文件名...' });
  const typeSelect = createElement('select', { className: 'gyp-selection-type' }, [
    createElement('option', { value: 'all', text: '全部类型' }),
    createElement('option', { value: 'video', text: '视频' }),
    createElement('option', { value: 'audio', text: '音频' }),
    createElement('option', { value: 'subtitle', text: '字幕' }),
    createElement('option', { value: 'other', text: '其他' }),
  ]);
  const entries = context.options.map((item) => {
    const checkbox = createElement('input', { type: 'checkbox', checked: true });
    const row = createElement('label', { className: 'gyp-file-row' }, [
      createElement('span', { className: 'gyp-checkbox-shell' }, [checkbox]),
      createElement('span', { className: 'gyp-file-main' }, [
        createElement('strong', { text: item.path }),
        createElement('small', { text: `${item.fileIndex === null ? '完整资源' : `fileIndex=${item.fileIndex}`} · ${formatSize(item.fileSize)}` }),
      ]),
    ]);
    checkbox.addEventListener('change', refreshSummary);
    return { checkbox, item, row };
  });
  const fileList = createElement('div', { className: 'gyp-file-list' }, entries.map((entry) => entry.row));

  function getSelectedOptions() {
    return entries.filter((entry) => entry.checkbox.checked).map((entry) => entry.item);
  }

  function getItemType(item) {
    const fileType = safeInt(item && item.fileType, 0);
    if (fileType === 2) {
      return 'video';
    }
    if (fileType === 3) {
      return 'audio';
    }
    if (fileType === 6) {
      return 'subtitle';
    }
    const path = String((item && (item.path || item.fileName)) || '').toLowerCase();
    if (/\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|ts)$/i.test(path)) {
      return 'video';
    }
    if (/\.(mp3|flac|aac|wav|m4a|ogg)$/i.test(path)) {
      return 'audio';
    }
    if (/\.(srt|ass|ssa|vtt)$/i.test(path)) {
      return 'subtitle';
    }
    return 'other';
  }

  function matchesFilter(entry) {
    const keyword = filterInput.value.trim().toLowerCase();
    const type = typeSelect.value;
    const path = String((entry.item && (entry.item.path || entry.item.fileName)) || '').toLowerCase();
    return (!keyword || path.includes(keyword)) && (type === 'all' || getItemType(entry.item) === type);
  }

  function getVisibleEntries() {
    return entries.filter(matchesFilter);
  }

  function refreshSummary() {
    const selected = getSelectedOptions();
    const selectedSize = selected.reduce((sum, item) => sum + item.fileSize, 0);
    summaryText.textContent = `已选 ${selected.length}/${getVisibleEntries().length} · ${formatSize(selectedSize)}`;
  }

  function setAll(checked) {
    for (const entry of getVisibleEntries()) {
      entry.checkbox.checked = checked;
    }
    refreshSummary();
  }

  function applyFilter() {
    for (const entry of entries) {
      entry.row.hidden = !matchesFilter(entry);
    }
    refreshSummary();
  }

  function start(action) {
    const selected = getSelectedOptions();
    if (selected.length === 0) {
      showToast('没有选择文件', '请选择文件。', 'warn');
      return;
    }
    if (selected.some((item) => item.fileIndex === null) && selected.length !== entries.length) {
      showToast('保存完整资源', '', 'warn');
      for (const entry of entries) {
        entry.checkbox.checked = true;
      }
      refreshSummary();
      return;
    }
    clearModal();
    saveSelectedFiles(context.magnet, selected, action);
  }

  filterInput.addEventListener('input', applyFilter);
  typeSelect.addEventListener('change', applyFilter);

  const card = createElement('section', { className: 'gyp-card gyp-card-wide' }, [
    createElement('div', { className: 'gyp-selection-title', text: context.title || '磁力资源' }),
    createElement('div', { className: 'gyp-card-body' }, [
      createElement('div', { className: 'gyp-selection-controlbar' }, [
        createElement('div', { className: 'gyp-selection-filters' }, [filterInput, typeSelect]),
        createElement('div', { className: 'gyp-selection-meta' }, [
          summaryText,
          createElement('button', { className: 'gyp-text-button', type: 'button', text: '全选', onclick: () => setAll(true) }),
          createElement('button', { className: 'gyp-text-button', type: 'button', text: '清空', onclick: () => setAll(false) }),
        ]),
      ]),
      fileList,
      createElement('div', { className: 'gyp-actions' }, [
        createElement('button', { className: 'gyp-button gyp-button-secondary', type: 'button', text: '仅保存', onclick: () => start('save') }),
        createElement('button', { className: 'gyp-button gyp-button-secondary', type: 'button', text: '保存并播放', onclick: () => start('play') }),
        createElement('button', { className: 'gyp-button gyp-button-primary', type: 'button', text: '保存并下载', onclick: () => start('downloadList') }),
      ]),
    ]),
  ]);
  mountModal(card);
  applyFilter();
}

function getDisplayFileName(item) {
  const directName = String((item && item.fileName) || '').trim();
  if (directName) {
    return directName;
  }
  const path = String((item && item.path) || '').trim();
  const parts = path.split(/[\\/]+/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : '未命名文件';
}

function triggerBrowserDownload(url, name, callbacks = {}) {
  if (typeof GM_download === 'function') {
    GM_download({
      url,
      name,
      saveAs: false,
      onload: callbacks.onload,
      onerror: callbacks.onerror,
      ontimeout: callbacks.onerror,
    });
    return;
  }
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.click();
  if (typeof callbacks.onload === 'function') {
    callbacks.onload();
  }
}

function showDownloadListModal(items) {
  const rows = [];
  const entries = (Array.isArray(items) ? items : []).map((item, index) => {
    const fileName = getDisplayFileName(item);
    const stateInfo = { url: '', loading: false, error: '' };
    const nameNode = createElement('strong', { text: fileName });
    const sizeNode = createElement('small', { text: formatSize(item && item.fileSize) });
    const statusNode = createElement('span', { className: 'gyp-download-status', text: '' });
    const downloadButton = createElement('button', { className: 'gyp-text-button', type: 'button', text: '下载' });
    const copyButton = createElement('button', { className: 'gyp-text-button', type: 'button', text: '复制' });

    function setBusy(loading) {
      stateInfo.loading = Boolean(loading);
      downloadButton.disabled = stateInfo.loading;
      copyButton.disabled = stateInfo.loading;
      statusNode.textContent = stateInfo.loading ? '获取中' : stateInfo.error;
      statusNode.classList.toggle('is-error', Boolean(stateInfo.error));
    }

    async function getDownloadUrl() {
      if (stateInfo.url) {
        return stateInfo.url;
      }
      stateInfo.error = '';
      setBusy(true);
      try {
        const link = await fetchPlayableUrl(item.fileId);
        stateInfo.url = link.url;
        statusNode.textContent = '';
        return stateInfo.url;
      } catch (error) {
        stateInfo.error = '失败';
        statusNode.title = errorToMessage(error);
        throw error;
      } finally {
        setBusy(false);
      }
    }

    downloadButton.addEventListener('click', async () => {
      try {
        const url = await getDownloadUrl();
        triggerBrowserDownload(url, fileName, {
          onload: () => {
            statusNode.textContent = '';
          },
          onerror: (error) => {
            stateInfo.error = '失败';
            statusNode.textContent = '失败';
            statusNode.title = errorToMessage(error);
            statusNode.classList.add('is-error');
          },
        });
      } catch (error) {
        showToast('获取下载链接失败', errorToMessage(error), 'error');
      }
    });

    copyButton.addEventListener('click', async () => {
      try {
        copyText(await getDownloadUrl());
      } catch (error) {
        showToast('获取下载链接失败', errorToMessage(error), 'error');
      }
    });

    const row = createElement('div', { className: 'gyp-download-row' }, [
      createElement('span', { className: 'gyp-download-index', text: String(index + 1).padStart(2, '0') }),
      createElement('span', { className: 'gyp-download-main' }, [nameNode, sizeNode]),
      statusNode,
      createElement('span', { className: 'gyp-download-actions' }, [downloadButton, copyButton]),
    ]);
    rows.push(row);
    return { getDownloadUrl };
  });

  const copyAllButton = createElement('button', {
    className: 'gyp-button gyp-button-secondary',
    type: 'button',
    text: '复制全部链接',
    disabled: entries.length === 0,
    onclick: async () => {
      copyAllButton.disabled = true;
      copyAllButton.textContent = '获取中';
      try {
        const urls = [];
        for (const entry of entries) {
          urls.push(await entry.getDownloadUrl());
        }
        copyText(urls.join('\n'));
      } catch (error) {
        showToast('复制失败', errorToMessage(error), 'error');
      } finally {
        copyAllButton.disabled = entries.length === 0;
        copyAllButton.textContent = '复制全部链接';
      }
    },
  });

  const card = createElement('section', { className: 'gyp-card gyp-download-card' }, [
    createElement('div', { className: 'gyp-download-header' }, [
      createElement('div', { className: 'gyp-download-heading' }, [
        createElement('h2', { text: '下载列表' }),
        createElement('span', { text: `${entries.length} 个文件` }),
      ]),
      createElement('div', { className: 'gyp-download-top-actions' }, [
        copyAllButton,
        createElement('button', { className: 'gyp-icon-button', type: 'button', text: '×', onclick: clearModal, 'aria-label': '关闭' }),
      ]),
    ]),
    createElement('div', { className: 'gyp-card-body gyp-download-body' }, [
      createElement('div', { className: 'gyp-download-list' }, rows),
    ]),
  ]);
  mountModal(card);
}

function showSettingsModal() {
  syncAuthFromCurrentPage({ silent: true });
  const config = getConfig();
  const accessTokenInput = createElement('textarea', { className: 'gyp-input gyp-token-input', placeholder: 'Bearer token 或 access_token', text: config.accessToken || '' });
  const parentIdInput = createElement('input', { className: 'gyp-input', type: 'text', placeholder: 'parentId', value: config.parentId || '' });
  const pollInput = createElement('input', { className: 'gyp-input', type: 'number', min: '1000', step: '500', value: String(config.pollIntervalMs || DEFAULT_CONFIG.pollIntervalMs) });
  const maxWaitInput = createElement('input', { className: 'gyp-input', type: 'number', min: '60', step: '30', value: String(Math.round((config.maxWaitMs || DEFAULT_CONFIG.maxWaitMs) / 1000)) });
  const authStatus = createElement('div', {
    className: 'gyp-auth-status',
    text: buildAuthStatusText(config),
  });
  const syncButton = createElement('button', {
    className: 'gyp-button gyp-button-secondary',
    type: 'button',
    text: '从当前光鸭页面同步',
    onclick: () => {
      const synced = syncAuthFromCurrentPage({ showResult: true });
      if (!synced) {
        return;
      }
      const nextConfig = getConfig();
      accessTokenInput.value = nextConfig.accessToken || '';
      authStatus.textContent = buildAuthStatusText(nextConfig);
    },
  });
  const refreshButton = createElement('button', {
    className: 'gyp-button gyp-button-secondary',
    type: 'button',
    text: '强制刷新 Token',
    onclick: async () => {
      refreshButton.disabled = true;
      refreshButton.textContent = '刷新中...';
      try {
        await ensureFreshAccessToken({ force: true });
        const nextConfig = getConfig();
        accessTokenInput.value = nextConfig.accessToken || '';
        authStatus.textContent = buildAuthStatusText(nextConfig);
        showToast('刷新成功', 'Access Token 已更新。', 'success');
      } catch (error) {
        showToast('刷新失败', errorToMessage(error), 'error');
      } finally {
        refreshButton.disabled = false;
        refreshButton.textContent = '强制刷新 Token';
      }
    },
  });

  const saveButton = createElement('button', {
    className: 'gyp-button gyp-button-primary',
    type: 'button',
    text: '保存配置',
    onclick: () => {
      const manualAuth = extractManualAuthInput(accessTokenInput.value, config);
      saveConfig({
        ...config,
        clientId: manualAuth.clientId || config.clientId,
        tokenType: manualAuth.tokenType || config.tokenType,
        accessToken: manualAuth.accessToken,
        refreshToken: manualAuth.refreshToken || '',
        expiresAt: manualAuth.expiresAt || 0,
        parentId: parentIdInput.value.trim(),
        pollIntervalMs: Math.max(1000, safeInt(pollInput.value, DEFAULT_CONFIG.pollIntervalMs)),
        maxWaitMs: Math.max(60, safeInt(maxWaitInput.value, DEFAULT_CONFIG.maxWaitMs / 1000)) * 1000,
      });
      clearModal();
      showToast('配置已保存', '', 'success');
    },
  });

  const card = createElement('section', { className: 'gyp-card' }, [
    cardHeader('配置认证', '', clearModal),
    createElement('div', { className: 'gyp-card-body' }, [
      authStatus,
      fieldBlock('Access Token / credentials JSON', accessTokenInput, '推荐在光鸭官网使用“同步官网认证”，会自动保存 refresh token。'),
      fieldBlock('parentId', parentIdInput, ''),
      createElement('div', { className: 'gyp-form-grid' }, [
        fieldBlock('轮询间隔 ms', pollInput, ''),
        fieldBlock('最长等待秒数', maxWaitInput, ''),
      ]),
      createElement('div', { className: 'gyp-actions' }, [
        createElement('button', { className: 'gyp-button gyp-button-secondary', type: 'button', text: '取消', onclick: clearModal }),
        syncButton,
        refreshButton,
        saveButton,
      ]),
    ]),
  ]);
  mountModal(card);
}

function fieldBlock(label, input, hint) {
  return createElement('label', { className: 'gyp-field' }, [
    createElement('span', { text: label }),
    input,
    hint ? createElement('small', { text: hint }) : null,
  ]);
}

function showManualMagnetPrompt() {
  const input = createElement('textarea', { className: 'gyp-input gyp-token-input', placeholder: '粘贴 magnet:?xt=urn:btih:...' });
  const card = createElement('section', { className: 'gyp-card' }, [
    cardHeader('手动解析', '', clearModal),
    createElement('div', { className: 'gyp-card-body' }, [
      fieldBlock('磁力链接', input, ''),
      createElement('div', { className: 'gyp-actions' }, [
        createElement('button', { className: 'gyp-button gyp-button-secondary', type: 'button', text: '取消', onclick: clearModal }),
        createElement('button', {
          className: 'gyp-button gyp-button-primary',
          type: 'button',
          text: '开始解析',
          onclick: () => {
            const magnet = extractMagnetFromText(input.value);
            if (!magnet) {
              showToast('磁力链接无效', '没有识别到 magnet:?xt=urn:btih: 格式。', 'warn');
              return;
            }
            clearModal();
            handleMagnet(magnet);
          },
        }),
      ]),
    ]),
  ]);
  mountModal(card);
  input.focus();
}

function showToast(title, message, tone = 'info') {
  ensureUi();
  const oldToast = ui.mount.querySelector('.gyp-toast');
  if (oldToast) {
    oldToast.remove();
  }
  window.clearTimeout(state.currentToastTimer);
  const toast = createElement('div', { className: `gyp-toast gyp-toast-${tone}` }, [
    createElement('strong', { text: title }),
    createElement('span', { text: message }),
  ]);
  ui.mount.appendChild(toast);
  state.currentToastTimer = window.setTimeout(() => toast.remove(), 4800);

  try {
    if (typeof GM_notification === 'function' && tone === 'error') {
      GM_notification({ title, text: message, timeout: 5000 });
    }
  } catch (_) {}
}

function copyText(text) {
  if (typeof GM_setClipboard === 'function') {
    GM_setClipboard(text, 'text');
    showToast('已复制链接', '链接已写入剪贴板。', 'success');
    return;
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('已复制链接', '链接已写入剪贴板。', 'success');
    }).catch(() => {
      showToast('复制失败', '浏览器拒绝写入剪贴板。', 'error');
    });
  }
}

function buildFriendlyError(error) {
  if (error instanceof HttpError) {
    if (error.status === 401 || error.status === 403) {
      return `HTTP ${error.status}，请配置 Access Token。`;
    }
    return `接口 ${error.path} 请求失败：HTTP ${error.status}`;
  }
  if (error instanceof ApiError) {
    if (error.code === 101) {
      return '接口返回 code=101。';
    }
    if ([100, 102, 103, 104, 401, 403].includes(error.code)) {
      return `认证失败：${error.message}`;
    }
    return error.message;
  }
  return errorToMessage(error);
}

function errorToMessage(error) {
  if (!error) {
    return '未知错误';
  }
  if (error instanceof Error) {
    return error.message || String(error);
  }
  return String(error);
}

function buildStyles() {
  return `
    :host { all: initial; }
    *, *::before, *::after { box-sizing: border-box; }
    .gyp-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background:
        radial-gradient(circle at top left, rgba(64, 186, 255, 0.22), transparent 34%),
        radial-gradient(circle at bottom right, rgba(52, 211, 153, 0.18), transparent 30%),
        rgba(3, 9, 18, 0.76);
      color: #e7f7ff;
      font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif;
      backdrop-filter: blur(10px);
    }
    .gyp-card {
      width: min(720px, calc(100vw - 32px));
      max-height: min(860px, calc(100vh - 32px));
      overflow: hidden;
      border: 1px solid rgba(126, 211, 255, 0.24);
      border-radius: 26px;
      background:
        linear-gradient(145deg, rgba(8, 22, 38, 0.98), rgba(5, 12, 24, 0.98)),
        #081426;
      box-shadow: 0 30px 90px rgba(0, 0, 0, 0.54), inset 0 1px 0 rgba(255, 255, 255, 0.08);
    }
    .gyp-card-wide { width: min(960px, calc(100vw - 32px)); }
    .gyp-player-card {
      width: min(1480px, calc(100vw - 16px));
      height: auto;
      aspect-ratio: 16 / 9;
      overflow: hidden;
      border: 0;
      border-radius: 18px;
      background: #000;
      box-shadow: 0 28px 90px rgba(0, 0, 0, 0.58);
      color: #f4f7fb;
    }
    @media (min-aspect-ratio: 16 / 9) {
      .gyp-player-card {
        width: auto;
        height: min(832px, calc(100vh - 16px));
      }
    }
    .gyp-player-floating {
      position: absolute;
      top: 14px;
      left: 50%;
      z-index: 100;
      width: min(720px, calc(100% - 96px));
      pointer-events: none;
      text-align: center;
      transform: translateX(-50%);
      transition: opacity 180ms ease, transform 180ms ease;
    }
    .gyp-player-title {
      display: block;
      overflow: hidden;
      color: rgba(255, 255, 255, 0.92);
      font-size: 15px;
      font-weight: 900;
      letter-spacing: 0.02em;
      text-shadow: 0 2px 18px rgba(0, 0, 0, 0.72);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .gyp-playlist-close {
      width: 34px;
      min-height: 34px;
      padding: 0;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.045);
      color: #b8c3d1;
      cursor: pointer;
      font: inherit;
      font-size: 18px;
      font-weight: 800;
      line-height: 1;
    }
    .gyp-playlist-close:hover {
      border-color: rgba(114, 215, 255, 0.38);
      background: rgba(114, 215, 255, 0.1);
      color: #fff;
    }
    .gyp-card-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 20px;
      padding: 24px 26px 18px;
      border-bottom: 1px solid rgba(126, 211, 255, 0.14);
    }
    .gyp-eyebrow {
      margin-bottom: 8px;
      color: #66e0ff;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }
    h2, h3, p { margin: 0; }
    h2 { color: #f6fdff; font-size: 24px; line-height: 1.2; }
    h3 { color: #f6fdff; font-size: 18px; line-height: 1.35; }
    .gyp-card-header p { margin-top: 8px; color: #9fb6c8; font-size: 13px; line-height: 1.6; }
    .gyp-card-body { max-height: calc(100vh - 180px); overflow: auto; padding: 22px 26px 26px; }
    .gyp-icon-button {
      width: 34px;
      height: 34px;
      flex: 0 0 auto;
      border: 1px solid rgba(126, 211, 255, 0.18);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.06);
      color: #d7f7ff;
      cursor: pointer;
      font-size: 24px;
      line-height: 30px;
    }
    .gyp-icon-button:hover { background: rgba(102, 224, 255, 0.16); }
    .gyp-alert {
      margin-bottom: 16px;
      padding: 14px 16px;
      border: 1px solid rgba(102, 224, 255, 0.22);
      border-radius: 16px;
      background: rgba(102, 224, 255, 0.08);
      color: #cdefff;
      font-size: 13px;
      line-height: 1.7;
    }
    .gyp-alert-error { border-color: rgba(255, 112, 112, 0.34); background: rgba(255, 82, 82, 0.1); color: #ffd6d6; }
    .gyp-selection-title {
      overflow: hidden;
      padding: 20px 26px 14px;
      border-bottom: 1px solid rgba(126, 211, 255, 0.14);
      color: #f6fdff;
      font-size: 18px;
      font-weight: 900;
      line-height: 1.35;
      text-align: center;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .gyp-selection-controlbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 14px;
      padding: 10px 12px;
      border: 1px solid rgba(126, 211, 255, 0.13);
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.045);
    }
    .gyp-selection-filters {
      display: flex;
      flex: 1 1 auto;
      gap: 10px;
      min-width: 260px;
    }
    .gyp-selection-search,
    .gyp-selection-type {
      min-height: 34px;
      border: 1px solid rgba(126, 211, 255, 0.16);
      border-radius: 999px;
      background: rgba(3, 12, 24, 0.58);
      color: #e9fbff;
      font: inherit;
      font-size: 13px;
      outline: none;
    }
    .gyp-selection-search {
      width: min(260px, 34vw);
      padding: 0 14px;
    }
    .gyp-selection-type {
      flex: 0 0 auto;
      padding: 0 12px;
    }
    .gyp-selection-search:focus,
    .gyp-selection-type:focus { border-color: rgba(102, 224, 255, 0.48); }
    .gyp-selection-meta {
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      gap: 12px;
      color: #a9bdcf;
      font-size: 13px;
      white-space: nowrap;
    }
    .gyp-selection-summary { color: #eafcff; font-weight: 800; }
    .gyp-text-button {
      border: 0;
      background: transparent;
      color: #66e0ff;
      cursor: pointer;
      font: inherit;
      font-size: 13px;
      font-weight: 700;
    }
    .gyp-text-button:hover { color: #9df1ff; }
    .gyp-file-list {
      display: grid;
      gap: 10px;
      max-height: min(420px, 48vh);
      overflow: auto;
      padding-right: 4px;
    }
    .gyp-file-row {
      display: grid;
      grid-template-columns: 30px minmax(0, 1fr);
      gap: 12px;
      align-items: center;
      padding: 14px;
      border: 1px solid rgba(126, 211, 255, 0.13);
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.045);
      cursor: pointer;
    }
    .gyp-file-row:hover { border-color: rgba(102, 224, 255, 0.35); background: rgba(102, 224, 255, 0.075); }
    .gyp-file-row[hidden] { display: none; }
    .gyp-checkbox-shell input { width: 18px; height: 18px; accent-color: #33d6a6; }
    .gyp-file-main { min-width: 0; }
    .gyp-file-main strong, .gyp-episode-info strong {
      display: block;
      overflow: hidden;
      color: #eefbff;
      font-size: 14px;
      line-height: 1.45;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .gyp-file-main small, .gyp-episode-info small, .gyp-field small {
      display: block;
      margin-top: 5px;
      overflow: hidden;
      color: #8fa7ba;
      font-size: 12px;
      line-height: 1.45;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .gyp-download-card { width: min(820px, calc(100vw - 32px)); }
    .gyp-download-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      padding: 22px 26px 16px;
      border-bottom: 1px solid rgba(126, 211, 255, 0.14);
    }
    .gyp-download-heading {
      display: flex;
      min-width: 0;
      align-items: baseline;
      gap: 12px;
    }
    .gyp-download-heading span {
      flex: 0 0 auto;
      color: #8fa7ba;
      font-size: 13px;
      font-weight: 800;
    }
    .gyp-download-top-actions {
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      gap: 10px;
    }
    .gyp-download-body { max-height: calc(100vh - 148px); }
    .gyp-download-list {
      display: grid;
      gap: 10px;
      max-height: min(560px, 62vh);
      overflow: auto;
      padding-right: 4px;
    }
    .gyp-download-row {
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr) auto auto;
      gap: 12px;
      align-items: center;
      padding: 13px 14px;
      border: 1px solid rgba(126, 211, 255, 0.13);
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.045);
    }
    .gyp-download-index {
      display: grid;
      width: 34px;
      height: 34px;
      place-items: center;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.045);
      color: #a9bdcf;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 0.04em;
    }
    .gyp-download-main { min-width: 0; }
    .gyp-download-main strong {
      display: block;
      overflow: hidden;
      color: #eefbff;
      font-size: 14px;
      line-height: 1.45;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .gyp-download-main small {
      display: block;
      margin-top: 4px;
      color: #8fa7ba;
      font-size: 12px;
      line-height: 1.3;
    }
    .gyp-download-status {
      min-width: 42px;
      color: #8fa7ba;
      font-size: 12px;
      font-weight: 800;
      text-align: right;
    }
    .gyp-download-status.is-error { color: #ff9a9a; }
    .gyp-download-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      white-space: nowrap;
    }
    .gyp-details { margin-top: 16px; color: #a9bdcf; font-size: 13px; }
    .gyp-details summary { cursor: pointer; color: #66e0ff; font-weight: 700; }
    .gyp-details textarea { width: 100%; min-height: 74px; margin-top: 10px; resize: vertical; }
    .gyp-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; flex-wrap: wrap; }
    .gyp-button {
      min-height: 40px;
      padding: 0 16px;
      border-radius: 999px;
      border: 1px solid transparent;
      cursor: pointer;
      font: inherit;
      font-size: 14px;
      font-weight: 800;
    }
    .gyp-button:disabled { cursor: not-allowed; opacity: 0.48; }
    .gyp-button-primary {
      background: linear-gradient(135deg, #34f5c5, #36b5ff);
      color: #03101a;
      box-shadow: 0 12px 30px rgba(54, 181, 255, 0.25);
    }
    .gyp-button-primary:hover { filter: brightness(1.08); }
    .gyp-button-secondary {
      border-color: rgba(126, 211, 255, 0.22);
      background: rgba(255, 255, 255, 0.06);
      color: #dff8ff;
    }
    .gyp-button-secondary:hover { background: rgba(102, 224, 255, 0.12); }
    .gyp-progress-card {
      width: min(460px, calc(100vw - 32px));
      padding: 34px;
      text-align: center;
    }
    .gyp-loader {
      width: 54px;
      height: 54px;
      margin: 0 auto 18px;
      border: 3px solid rgba(102, 224, 255, 0.18);
      border-top-color: #34f5c5;
      border-radius: 50%;
      animation: gyp-spin 0.9s linear infinite;
    }
    .gyp-progress-message { margin-top: 12px; color: #c4d9e9; font-size: 14px; line-height: 1.7; }
    .gyp-progress-actions { justify-content: center; }
    .gyp-muted { margin-top: 10px; color: #7e94a6; font-size: 12px; line-height: 1.6; }
    .gyp-muted-block {
      margin: 12px 0;
      padding: 10px 12px;
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.045);
      color: #9fb6c8;
      font-size: 12px;
      line-height: 1.6;
    }
    .gyp-player-layout {
      --gyp-playlist-width: min(390px, calc(100% - 76px));
      position: relative;
      display: block;
      height: 100%;
      min-height: 0;
      overflow: hidden;
      background: #000;
    }
    .gyp-player-stage {
      display: block;
      height: 100%;
      min-width: 0;
      min-height: 0;
      padding: 0;
      background: #000;
      transition: filter 240ms ease;
    }
    .gyp-player-layout.is-playlist-open .gyp-player-stage {
      filter: brightness(0.76);
    }
    .gyp-player-frame {
      position: relative;
      height: 100%;
      min-height: 0;
      overflow: hidden;
      border: 0;
      border-radius: 0;
      background: #000;
      box-shadow: none;
    }
    .gyp-artplayer-app {
      width: 100%;
      height: 100%;
      min-height: 420px;
      background: #000;
    }
    .gyp-artplayer-app .art-video-player {
      --art-theme: #72d7ff;
      --gyp-playlist-width: min(390px, calc(100% - 76px));
      font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
      position: relative;
    }
    .gyp-artplayer-app .art-bottom,
    .gyp-artplayer-app .art-controls,
    .gyp-artplayer-app .art-progress,
    .gyp-artplayer-app .art-layers {
      transition: opacity 180ms ease, transform 180ms ease !important;
    }
    .gyp-player-layout.is-chrome-idle:not(.is-playlist-open) > .gyp-playlist-toggle,
    .gyp-player-layout.is-chrome-idle > .gyp-player-floating,
    .gyp-artplayer-app .art-video-player.gyp-is-chrome-idle > .gyp-player-floating,
    .gyp-artplayer-app .art-video-player.gyp-is-chrome-idle:not(.gyp-is-playlist-open) > .gyp-playlist-toggle,
    .gyp-artplayer-app .art-video-player.gyp-is-chrome-idle .art-bottom,
    .gyp-artplayer-app .art-video-player.gyp-is-chrome-idle .art-controls,
    .gyp-artplayer-app .art-video-player.gyp-is-chrome-idle .art-progress {
      opacity: 0 !important;
      pointer-events: none !important;
    }
    .gyp-artplayer-app .art-video-player.gyp-is-chrome-idle .art-bottom,
    .gyp-artplayer-app .art-video-player.gyp-is-chrome-idle .art-controls {
      transform: translateY(10px) !important;
    }
    .gyp-player-layout.is-playlist-open > .gyp-playlist-toggle,
    .gyp-artplayer-app .art-video-player.gyp-is-playlist-open > .gyp-playlist-toggle {
      opacity: 1 !important;
      pointer-events: auto !important;
    }
    .gyp-player-layout.is-playlist-open > .gyp-playlist-toggle,
    .gyp-artplayer-app .art-video-player.gyp-is-playlist-open > .gyp-playlist-toggle {
      right: var(--gyp-playlist-width);
    }
    .gyp-artplayer-app .art-control-gyp-prev,
    .gyp-artplayer-app .art-control-gyp-next,
    .gyp-artplayer-app .art-control-gyp-open,
    .gyp-artplayer-app .art-control-gyp-copy {
      min-width: auto !important;
      padding: 0 9px !important;
      border-radius: 8px !important;
      color: rgba(255, 255, 255, 0.88) !important;
      font-size: 12px !important;
      font-weight: 800 !important;
    }
    .gyp-artplayer-app .art-control-gyp-prev:hover,
    .gyp-artplayer-app .art-control-gyp-next:hover,
    .gyp-artplayer-app .art-control-gyp-open:hover,
    .gyp-artplayer-app .art-control-gyp-copy:hover {
      background: rgba(114, 215, 255, 0.16) !important;
      color: #fff !important;
    }
    .gyp-player-loading {
      position: absolute;
      top: 18px;
      left: 18px;
      z-index: 4;
      display: none;
      width: 32px;
      height: 32px;
      border: 2px solid rgba(114, 215, 255, 0.18);
      border-top-color: #72d7ff;
      border-radius: 50%;
      animation: gyp-spin 0.9s linear infinite;
      pointer-events: none;
    }
    .gyp-player-loading.is-visible {
      display: block;
    }
    .gyp-player-playlist {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      z-index: 3;
      display: grid;
      width: var(--gyp-playlist-width);
      min-width: 0;
      min-height: 0;
      grid-template-rows: minmax(0, 1fr);
      border-left: 1px solid rgba(170, 185, 210, 0.14);
      background: linear-gradient(180deg, rgba(17, 21, 31, 0.94), rgba(9, 11, 16, 0.98)), #0e1118;
      box-shadow: -26px 0 70px rgba(0, 0, 0, 0.44);
      transform: translateX(100%);
      transition: transform 240ms ease, box-shadow 240ms ease;
      will-change: transform;
    }
    .gyp-player-playlist.is-open {
      transform: translateX(0);
      box-shadow: -16px 0 44px rgba(0, 0, 0, 0.32);
    }
    .art-video-player > .gyp-player-playlist {
      z-index: 99;
    }
    .art-video-player > .gyp-playlist-toggle,
    .art-video-player > .gyp-player-floating {
      z-index: 101;
    }
    .art-video-player > .gyp-playlist-backdrop {
      z-index: 98;
    }
    .gyp-playlist-toggle {
      position: absolute;
      top: 50%;
      right: 0;
      z-index: 101;
      display: grid;
      width: 28px;
      height: 64px;
      padding: 0;
      place-items: center;
      border: 1px solid rgba(206, 222, 255, 0.26);
      border-right: 0;
      border-radius: 12px 0 0 12px;
      background: linear-gradient(180deg, rgba(23, 29, 40, 0.96), rgba(9, 12, 18, 0.96)), #111720;
      box-shadow: -10px 0 30px rgba(0, 0, 0, 0.32);
      color: #d8e6f5;
      cursor: pointer;
      font: inherit;
      font-size: 18px;
      font-weight: 900;
      line-height: 1;
      transform: translateY(-50%);
      transition: right 240ms ease, opacity 180ms ease, border-color 180ms ease, color 180ms ease;
    }
    .gyp-playlist-toggle:hover {
      border-color: rgba(114, 215, 255, 0.36);
      color: #fff;
    }
    .gyp-playlist-backdrop {
      position: absolute;
      inset: 0;
      z-index: 2;
      pointer-events: none;
      background: linear-gradient(90deg, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.32));
      opacity: 0;
      transition: opacity 240ms ease;
    }
    .gyp-playlist-backdrop.is-visible {
      pointer-events: auto;
      opacity: 1;
    }
    .gyp-playlist-header {
      display: none;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      border-bottom: 1px solid rgba(170, 185, 210, 0.14);
    }
    .gyp-playlist-header span {
      color: #f4f7fb;
      font-size: 14px;
      font-weight: 800;
    }
    .gyp-episode-list {
      min-height: 0;
      overflow: auto;
      padding: 12px;
      scrollbar-width: thin;
      scrollbar-color: rgba(114, 215, 255, 0.26) transparent;
    }
    .gyp-episode {
      position: relative;
      display: grid;
      width: 100%;
      grid-template-columns: 44px minmax(0, 1fr);
      gap: 12px;
      align-items: center;
      margin: 0 0 9px;
      padding: 12px;
      border: 1px solid transparent;
      border-radius: 18px;
      background: transparent;
      color: inherit;
      cursor: pointer;
      font: inherit;
      text-align: left;
      transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
    }
    .gyp-episode::before {
      position: absolute;
      inset: 12px auto 12px 0;
      width: 3px;
      border-radius: 999px;
      background: transparent;
      content: "";
    }
    .gyp-episode:hover {
      border-color: rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.045);
      transform: translateX(-2px);
    }
    .gyp-episode.is-active {
      border-color: rgba(114, 215, 255, 0.28);
      background: linear-gradient(90deg, rgba(114, 215, 255, 0.13), rgba(255, 255, 255, 0.045)), rgba(255, 255, 255, 0.04);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
    }
    .gyp-episode.is-active::before {
      background: #72d7ff;
      box-shadow: 0 0 18px rgba(114, 215, 255, 0.8);
    }
    .gyp-episode-index {
      display: grid;
      width: 42px;
      height: 42px;
      place-items: center;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.045);
      color: #c8d3e4;
      font-size: 13px;
      font-weight: 900;
      letter-spacing: 0.04em;
    }
    .gyp-episode.is-active .gyp-episode-index {
      border-color: rgba(114, 215, 255, 0.4);
      background: rgba(114, 215, 255, 0.13);
      color: #ecfbff;
    }
    .gyp-field { display: grid; gap: 8px; margin-bottom: 16px; color: #d8edf7; font-size: 13px; font-weight: 800; }
    .gyp-field > span { color: #eaf9ff; }
    .gyp-input {
      width: 100%;
      min-height: 40px;
      padding: 10px 12px;
      border: 1px solid rgba(126, 211, 255, 0.18);
      border-radius: 14px;
      outline: none;
      background: rgba(255, 255, 255, 0.06);
      color: #f4fdff;
      font: inherit;
      font-size: 13px;
    }
    .gyp-input:focus { border-color: rgba(52, 245, 197, 0.5); box-shadow: 0 0 0 3px rgba(52, 245, 197, 0.1); }
    .gyp-token-input { min-height: 90px; resize: vertical; }
    .gyp-auth-status {
      margin-bottom: 16px;
      padding: 10px 12px;
      border-radius: 14px;
      background: rgba(52, 245, 197, 0.08);
      color: #bff8ea;
      font-size: 12px;
      line-height: 1.6;
    }
    .gyp-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .gyp-check-line { display: flex; align-items: center; gap: 10px; margin: 12px 0; color: #cdefff; font-size: 13px; }
    .gyp-check-line input { width: 17px; height: 17px; accent-color: #34f5c5; }
    .gyp-toast {
      position: fixed;
      right: 22px;
      bottom: 22px;
      z-index: 2147483647;
      width: min(380px, calc(100vw - 44px));
      padding: 14px 16px;
      border: 1px solid rgba(126, 211, 255, 0.22);
      border-radius: 18px;
      background: rgba(5, 14, 27, 0.96);
      color: #e7f7ff;
      box-shadow: 0 18px 50px rgba(0, 0, 0, 0.42);
      font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif;
    }
    .gyp-toast strong { display: block; margin-bottom: 4px; font-size: 14px; }
    .gyp-toast span { display: block; color: #a8bece; font-size: 13px; line-height: 1.55; }
    .gyp-toast-success { border-color: rgba(52, 245, 197, 0.36); }
    .gyp-toast-warn { border-color: rgba(255, 198, 87, 0.4); }
    .gyp-toast-error { border-color: rgba(255, 112, 112, 0.45); }
    @keyframes gyp-spin { to { transform: rotate(360deg); } }
    @media (max-width: 760px) {
      .gyp-overlay { padding: 10px; align-items: stretch; }
      .gyp-card, .gyp-card-wide { width: 100%; max-height: calc(100vh - 20px); border-radius: 20px; }
      .gyp-player-card { width: 100%; height: auto; max-height: calc(100vh - 20px); border-radius: 14px; }
      .gyp-card-header { padding: 18px; }
      .gyp-selection-title { padding: 16px 18px 12px; font-size: 16px; }
      .gyp-card-body { padding: 18px; max-height: calc(100vh - 132px); }
      .gyp-form-grid { grid-template-columns: 1fr; }
      .gyp-selection-controlbar { align-items: stretch; flex-direction: column; }
      .gyp-selection-filters { width: 100%; min-width: 0; }
      .gyp-selection-search { width: 100%; flex: 1 1 auto; }
      .gyp-selection-meta { width: 100%; justify-content: flex-end; flex-wrap: wrap; }
      .gyp-download-header { align-items: flex-start; padding: 18px; }
      .gyp-download-heading { flex-direction: column; gap: 4px; }
      .gyp-download-top-actions { gap: 8px; }
      .gyp-download-body { max-height: calc(100vh - 116px); }
      .gyp-download-row { grid-template-columns: 34px minmax(0, 1fr); align-items: flex-start; }
      .gyp-download-status { grid-column: 1 / -1; min-width: 0; text-align: left; }
      .gyp-download-actions { grid-column: 1 / -1; justify-content: flex-end; }
      .gyp-player-floating { top: 10px; width: calc(100% - 96px); }
      .gyp-player-title { display: -webkit-box; white-space: normal; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
      .gyp-player-layout { --gyp-playlist-width: min(360px, 88vw); height: 100%; }
      .gyp-artplayer-app .art-video-player { --gyp-playlist-width: min(360px, 88vw); }
      .gyp-player-stage { padding: 0; }
      .gyp-player-frame { height: 100%; border-radius: 0; }
      .gyp-artplayer-app { min-height: 0; }
      .gyp-player-playlist {
        width: var(--gyp-playlist-width);
        grid-template-rows: auto minmax(0, 1fr);
        border-left: 0;
      }
      .gyp-playlist-toggle {
        width: 28px;
        height: 56px;
        min-height: 0;
        border-radius: 12px 0 0 12px;
      }
      .gyp-playlist-header { display: flex; }
    }
    @media (max-width: 760px) and (min-aspect-ratio: 16 / 9) {
      .gyp-player-card { width: auto; height: min(832px, calc(100vh - 20px)); }
    }
    @media (max-width: 760px) and (max-aspect-ratio: 16 / 9) {
      .gyp-player-card { width: 100%; height: auto; }
    }
    @media (max-width: 640px) {
      .gyp-player-layout { --gyp-playlist-width: 100%; }
      .gyp-artplayer-app .art-video-player { --gyp-playlist-width: 100%; }
      .gyp-player-playlist {
        top: auto;
        right: 0;
        bottom: 0;
        left: 0;
        width: 100%;
        height: min(72vh, 560px);
        border-top: 1px solid rgba(206, 222, 255, 0.26);
        border-radius: 24px 24px 0 0;
        box-shadow: 0 -26px 70px rgba(0, 0, 0, 0.5);
        transform: translateY(calc(100% + 28px));
      }
      .gyp-player-playlist.is-open { transform: translateY(0); }
      .gyp-playlist-toggle {
        top: auto;
        right: 50%;
        bottom: 0;
        width: 42px;
        height: 28px;
        padding: 0;
        border-right: 1px solid rgba(206, 222, 255, 0.26);
        border-bottom: 1px solid rgba(206, 222, 255, 0.26);
        border-radius: 14px 14px 0 0;
        transform: rotate(90deg);
      }
      .gyp-player-layout.is-playlist-open > .gyp-playlist-toggle,
      .gyp-artplayer-app .art-video-player.gyp-is-playlist-open > .gyp-playlist-toggle {
        right: 50%;
        bottom: min(72vh, 560px);
      }
      .gyp-playlist-backdrop { background: linear-gradient(180deg, rgba(0, 0, 0, 0.12), rgba(0, 0, 0, 0.48)); }
    }
  `;
}
