// gyp-magnet.js
// 磁力链接识别、页面装饰和文本扫描。
// 由 guangyapan_magnet_player.user.js 通过 @require 远程加载。

'use strict';

function extractMagnetFromText(value) {
  if (!value) {
    return '';
  }

  const candidates = [String(value)];
  for (let index = 0; index < 2; index += 1) {
    try {
      candidates.push(decodeURIComponent(candidates[candidates.length - 1]));
    } catch (_) {
      break;
    }
  }

  for (const candidate of candidates) {
    const match = candidate.match(MAGNET_PATTERN);
    if (match) {
      return match[0].replace(/&amp;/g, '&');
    }
  }
  return '';
}

function findClickedMagnet(event) {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  if (ui && path.includes(ui.host)) {
    return '';
  }
  for (const node of path) {
    if (!node || node === window || node === document) {
      continue;
    }
    if (!(node instanceof HTMLElement)) {
      continue;
    }
    const explicitMagnet = extractMagnetFromText(node.getAttribute('data-gyp-magnet'));
    if (explicitMagnet) {
      return explicitMagnet;
    }
    if (node instanceof HTMLAnchorElement) {
      const magnet = extractMagnetFromText(node.href) || extractMagnetFromText(node.getAttribute('href'));
      if (magnet) {
        return magnet;
      }
    }
  }
  return '';
}

function ensurePageDecorationStyles() {
  if (document.getElementById('gyp-magnet-player-page-style')) {
    return;
  }
  const style = document.createElement('style');
  style.id = 'gyp-magnet-player-page-style';
  style.textContent = `
    .gyp-inline-play-button {
      all: initial;
      display: inline-flex;
      align-items: center;
      margin: 0 4px;
      padding: 2px 8px;
      border: 1px solid rgba(29, 155, 240, 0.42);
      border-radius: 999px;
      background: rgba(29, 155, 240, 0.1);
      color: #0f8ad8;
      cursor: pointer;
      font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
      font-size: 12px;
      font-weight: 700;
      line-height: 1.6;
      vertical-align: baseline;
    }
    .gyp-inline-play-button:hover {
      background: rgba(29, 155, 240, 0.18);
      border-color: rgba(29, 155, 240, 0.68);
      color: #0877bd;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function createInlineMagnetButton(magnet) {
  ensurePageDecorationStyles();
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'gyp-inline-play-button';
  button.textContent = '光鸭播放';
  button.setAttribute('data-gyp-magnet', magnet);
  button.setAttribute('aria-label', '用光鸭播放这个磁力链接');
  return button;
}

function shouldSkipMagnetDecoration(parent) {
  return !parent || Boolean(parent.closest(MAGNET_SKIP_SELECTOR));
}

function canDecorateTextNode(node) {
  const text = node && node.nodeValue ? node.nodeValue : '';
  if (!text || text.length > 5000 || shouldSkipMagnetDecoration(node.parentElement)) {
    return false;
  }
  MAGNET_TEXT_PATTERN.lastIndex = 0;
  return MAGNET_TEXT_PATTERN.test(text);
}

function decorateTextNode(node) {
  const text = node && node.nodeValue ? node.nodeValue : '';
  if (!canDecorateTextNode(node)) {
    return 0;
  }

  MAGNET_TEXT_PATTERN.lastIndex = 0;
  const fragment = document.createDocumentFragment();
  let lastIndex = 0;
  let count = 0;
  let match = null;
  while ((match = MAGNET_TEXT_PATTERN.exec(text))) {
    const rawMagnet = match[0];
    const magnet = rawMagnet.replace(/&amp;/g, '&');
    if (match.index > lastIndex) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    const magnetText = document.createElement('span');
    magnetText.setAttribute('data-gyp-magnet-text', '1');
    magnetText.textContent = rawMagnet;
    fragment.appendChild(magnetText);
    fragment.appendChild(document.createTextNode(' '));
    fragment.appendChild(createInlineMagnetButton(magnet));
    lastIndex = match.index + rawMagnet.length;
    count += 1;
  }
  if (!count) {
    return 0;
  }
  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
  node.parentNode.replaceChild(fragment, node);
  return count;
}

function decorateMagnets(root) {
  if (!root) {
    return 0;
  }
  if (root.nodeType === Node.TEXT_NODE) {
    return decorateTextNode(root);
  }
  const start = root.nodeType === Node.DOCUMENT_NODE ? document.body || document.documentElement : root;
  if (!(start instanceof HTMLElement) || (start.parentElement && shouldSkipMagnetDecoration(start.parentElement)) || start.matches(MAGNET_SKIP_SELECTOR)) {
    return 0;
  }

  const textNodes = [];
  const walker = document.createTreeWalker(start, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return canDecorateTextNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  while (textNodes.length < 100) {
    const node = walker.nextNode();
    if (!node) {
      break;
    }
    textNodes.push(node);
  }
  return textNodes.reduce((sum, node) => sum + decorateTextNode(node), 0);
}

function scheduleMagnetDecoration(root) {
  if (!root) {
    return;
  }
  const decorationRoot = root.nodeType === Node.TEXT_NODE ? root.parentElement : root;
  if (!decorationRoot) {
    return;
  }
  state.pendingDecorationRoots.add(decorationRoot);
  if (state.decorationTimer) {
    return;
  }
  state.decorationTimer = window.setTimeout(() => {
    state.decorationTimer = 0;
    const roots = Array.from(state.pendingDecorationRoots);
    state.pendingDecorationRoots.clear();
    for (const item of roots) {
      decorateMagnets(item);
    }
  }, 250);
}

function installMagnetDecorationObserver() {
  const root = document.body || document.documentElement;
  if (!root || state.decorationObserver) {
    return;
  }
  scheduleMagnetDecoration(root);
  state.decorationObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          scheduleMagnetDecoration(node.parentElement);
          continue;
        }
        if (node.nodeType === Node.ELEMENT_NODE && !shouldSkipMagnetDecoration(node)) {
          scheduleMagnetDecoration(node);
        }
      }
    }
  });
  state.decorationObserver.observe(root, { childList: true, subtree: true });
}
