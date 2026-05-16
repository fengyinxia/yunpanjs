// ==UserScript==
// @name         光鸭云盘磁力播放助手
// @namespace    https://www.guangyapan.com/
// @version      0.9.10
// @description  点击 magnet 后解析、保存、播放或下载。
// @author       opencode
// @match        *://*/*
// @updateURL    https://raw.githubusercontent.com/fengyinxia/guangya/main/guangyapan_magnet_player.user.js
// @downloadURL  https://raw.githubusercontent.com/fengyinxia/guangya/main/guangyapan_magnet_player.user.js
// @require      https://cdn.jsdelivr.net/npm/artplayer@5.4.0/dist/artplayer.js
// @require      https://raw.githubusercontent.com/fengyinxia/guangya/main/gyp-auth-api.js?v=0.9.10
// @require      https://raw.githubusercontent.com/fengyinxia/guangya/main/gyp-magnet.js?v=0.9.10
// @require      https://raw.githubusercontent.com/fengyinxia/guangya/main/gyp-dialogs.js?v=0.9.10
// @require      https://raw.githubusercontent.com/fengyinxia/guangya/main/gyp-player.js?v=0.9.10
// @connect      api.guangyapan.com
// @connect      account.guangyapan.com
// @connect      *
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @grant        GM_setClipboard
// @run-at       document-end
// ==/UserScript==

'use strict';

const API_BASE = 'https://api.guangyapan.com';
const ACCOUNT_BASE = 'https://account.guangyapan.com';
const SITE_URL = 'https://www.guangyapan.com';
const DEFAULT_REFERER = `${SITE_URL}/#/transfer/cloud`;
const DEFAULT_CLIENT_ID = 'aMe-8VSlkrbQXpUR';
const CONFIG_KEY = 'gyp_magnet_player_config_v1';
const AUTH_MESSAGE_SOURCE = 'gyp-magnet-player-auth';
const REQUEST_TIMEOUT = 60 * 1000;
const DEFAULT_CONFIG = {
  clientId: DEFAULT_CLIENT_ID,
  tokenType: 'Bearer',
  accessToken: '',
  refreshToken: '',
  expiresAt: 0,
  parentId: '',
  lastAuthSyncAt: 0,
  lastTokenRefreshAt: 0,
  pollIntervalMs: 2000,
  maxWaitMs: 30 * 60 * 1000,
  maxTreeDepth: 8,
  pageSize: 100,
  earlyStablePolls: 5,
};
const PLAYER_CHROME_HIDE_DELAY_MS = 1000;
const MAGNET_PATTERN = /magnet:\?xt=urn:btih:[^\s"'<>]+/i;
const MAGNET_TEXT_PATTERN = /magnet:\?xt=urn:btih:[^\s"'<>]+/gi;
const MAGNET_SKIP_SELECTOR = [
  'a',
  'button',
  'input',
  'textarea',
  'select',
  'option',
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  '#gyp-magnet-player-root',
  '[data-gyp-magnet-text]',
  '[data-gyp-magnet]',
].join(',');

const state = {
  busy: false,
  currentModal: null,
  currentToastTimer: 0,
  authHookInstalled: false,
  refreshPromise: null,
  decorationObserver: null,
  decorationTimer: 0,
  pendingDecorationRoots: new Set(),
};

let ui = null;

class ApiError extends Error {
  constructor(path, code, message, payload) {
    super(`${path} failed: code=${code} msg=${message || '无消息'}`);
    this.name = 'ApiError';
    this.path = path;
    this.code = code;
    this.payload = payload;
  }
}

class HttpError extends Error {
  constructor(path, status, payload) {
    const message = payload && payload.msg ? String(payload.msg) : `HTTP ${status}`;
    super(`${path} failed: ${message}`);
    this.name = 'HttpError';
    this.path = path;
    this.status = status;
    this.payload = payload;
  }
}

function getConfig() {
  const raw = safeGmGet(CONFIG_KEY, '');
  if (!raw) {
    return { ...DEFAULT_CONFIG };
  }
  try {
    return normalizeConfig(JSON.parse(raw));
  } catch (error) {
    console.warn('[光鸭磁力助手] 配置解析失败，已使用默认配置', error);
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(nextConfig) {
  safeGmSet(CONFIG_KEY, JSON.stringify(normalizeConfig(nextConfig)));
}

function normalizeConfig(config) {
  const source = config && typeof config === 'object' ? config : {};
  const accessToken = cleanAccessToken(source.accessToken);
  const expiresAt = safeTime(source.expiresAt) || getJwtExpiresAt(accessToken, 120 * 1000);
  return {
    clientId: String(source.clientId || DEFAULT_CONFIG.clientId).trim() || DEFAULT_CONFIG.clientId,
    tokenType: normalizeTokenType(source.tokenType || DEFAULT_CONFIG.tokenType),
    accessToken,
    refreshToken: cleanRefreshToken(source.refreshToken),
    expiresAt,
    parentId: String(source.parentId || '').trim(),
    lastAuthSyncAt: safeInt(source.lastAuthSyncAt, DEFAULT_CONFIG.lastAuthSyncAt),
    lastTokenRefreshAt: safeInt(source.lastTokenRefreshAt, DEFAULT_CONFIG.lastTokenRefreshAt),
    pollIntervalMs: Math.max(1000, safeInt(source.pollIntervalMs, DEFAULT_CONFIG.pollIntervalMs)),
    maxWaitMs: Math.max(60 * 1000, safeInt(source.maxWaitMs, DEFAULT_CONFIG.maxWaitMs)),
    maxTreeDepth: Math.max(1, safeInt(source.maxTreeDepth, DEFAULT_CONFIG.maxTreeDepth)),
    pageSize: Math.max(20, safeInt(source.pageSize, DEFAULT_CONFIG.pageSize)),
    earlyStablePolls: Math.max(0, safeInt(source.earlyStablePolls, DEFAULT_CONFIG.earlyStablePolls)),
  };
}

function safeGmGet(key, fallback) {
  try {
    return typeof GM_getValue === 'function' ? GM_getValue(key, fallback) : fallback;
  } catch (error) {
    console.warn('[光鸭磁力助手] 读取配置失败', error);
    return fallback;
  }
}

function safeGmSet(key, value) {
  try {
    if (typeof GM_setValue === 'function') {
      GM_setValue(key, value);
    }
  } catch (error) {
    console.warn('[光鸭磁力助手] 保存配置失败', error);
  }
}

function safeGmDelete(key) {
  try {
    if (typeof GM_deleteValue === 'function') {
      GM_deleteValue(key);
    }
  } catch (error) {
    console.warn('[光鸭磁力助手] 删除配置失败', error);
  }
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function safeInt(value, fallback = 0) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}

function cleanAccessToken(raw) {
  return String(raw || '').trim().replace(/^bearer\s+/i, '').trim();
}

function cleanRefreshToken(raw) {
  return String(raw || '').trim();
}

function normalizeTokenType(raw) {
  const value = String(raw || '').trim();
  return value || DEFAULT_CONFIG.tokenType;
}

function safeTime(value) {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) && time > 0 ? time : 0;
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value < 10000000000 ? value * 1000 : value;
  }
  if (typeof value === 'string' && value.trim()) {
    const trimmed = value.trim();
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric < 10000000000 ? numeric * 1000 : numeric;
    }
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }
  return 0;
}

function getJwtExpiresAt(token, safetyMs = 0) {
  const payload = parseJwtPayload(token);
  const exp = payload && Number(payload.exp);
  if (!Number.isFinite(exp) || exp <= 0) {
    return 0;
  }
  return Math.max(0, exp * 1000 - safetyMs);
}

function parseJwtPayload(token) {
  const parts = cleanAccessToken(token).split('.');
  if (parts.length < 2) {
    return null;
  }
  try {
    let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (payload.length % 4) {
      payload += '=';
    }
    const binary = atob(payload);
    const json = decodeURIComponent(Array.from(binary, (char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''));
    return JSON.parse(json);
  } catch (_) {
    return null;
  }
}

function computeExpiresAt(expiresIn) {
  const seconds = Number(expiresIn);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 0;
  }
  const safetySeconds = seconds >= 600 ? 120 : 30;
  return Date.now() + Math.max(0, seconds - safetySeconds) * 1000;
}

function resolveCredentialsExpiresAt(credentials, accessToken) {
  const direct = safeTime(credentials && (credentials.expires_at || credentials.expiresAt));
  if (direct) {
    return direct;
  }
  const computed = computeExpiresAt(credentials && (credentials.expires_in || credentials.expiresIn));
  return computed || getJwtExpiresAt(accessToken, 120 * 1000);
}

function parseApiJson(text) {
  return JSON.parse(String(text || '').replace(/("(?:fileId|parentId|id|taskId|gcid|requestId|fullParentIds)"\s*:\s*)(\d{16,})/g, '$1"$2"'));
}

function extractAccessToken(raw) {
  if (!raw) {
    return '';
  }
  const text = String(raw).trim().slice(0, 200000);
  if (!text) {
    return '';
  }

  const bearer = text.match(/\bBearer\s+([A-Za-z0-9._~+/=-]{20,})/i);
  if (bearer) {
    return cleanAccessToken(bearer[1]);
  }

  if (!/[=;{}:[\]"]/u.test(text) && text.length >= 20) {
    return cleanAccessToken(text);
  }

  try {
    const parsed = JSON.parse(text);
    const token = findValueByKeys(parsed, ['access_token', 'accessToken', 'access-token', 'token']);
    if (token) {
      return cleanAccessToken(token);
    }
  } catch (_) {}

  const quoted = text.match(/["'](?:access_token|accessToken|access-token|token)["']\s*[:=]\s*["']([^"']{20,})["']/i);
  if (quoted) {
    return cleanAccessToken(quoted[1]);
  }

  const plain = text.match(/(?:access_token|accessToken|access-token|token)=([^;\s&]{20,})/i);
  return plain ? cleanAccessToken(plain[1]) : '';
}

function findValueByKeys(value, keys, depth = 0) {
  if (!value || depth > 8) {
    return '';
  }
  if (typeof value === 'string') {
    return extractAccessToken(value);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findValueByKeys(item, keys, depth + 1);
      if (found) {
        return found;
      }
    }
    return '';
  }
  if (typeof value !== 'object') {
    return '';
  }

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(value, key) && value[key]) {
      return String(value[key]);
    }
  }
  for (const [key, item] of Object.entries(value)) {
    if (/refresh/i.test(key)) {
      continue;
    }
    const found = findValueByKeys(item, keys, depth + 1);
    if (found) {
      return found;
    }
  }
  return '';
}

function extractManualAuthInput(raw, fallbackConfig) {
  const text = String(raw || '').trim();
  if (!text) {
    return { accessToken: '' };
  }
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      const accessToken = cleanAccessToken(parsed.access_token || parsed.accessToken || parsed.token || findValueByKeys(parsed, ['access_token', 'accessToken', 'token']));
      return {
        clientId: String(parsed.client_id || parsed.clientId || (fallbackConfig && fallbackConfig.clientId) || DEFAULT_CLIENT_ID).trim() || DEFAULT_CLIENT_ID,
        tokenType: normalizeTokenType(parsed.token_type || parsed.tokenType || (fallbackConfig && fallbackConfig.tokenType)),
        accessToken,
        refreshToken: cleanRefreshToken(parsed.refresh_token || parsed.refreshToken || (fallbackConfig && fallbackConfig.refreshToken)),
        expiresAt: resolveCredentialsExpiresAt(parsed, accessToken) || safeTime(fallbackConfig && fallbackConfig.expiresAt),
      };
    }
  } catch (_) {}
  const accessToken = extractAccessToken(text);
  return {
    clientId: fallbackConfig && fallbackConfig.clientId,
    tokenType: fallbackConfig && fallbackConfig.tokenType,
    accessToken,
    refreshToken: fallbackConfig && fallbackConfig.refreshToken,
    expiresAt: getJwtExpiresAt(accessToken, 120 * 1000) || safeTime(fallbackConfig && fallbackConfig.expiresAt),
  };
}

function formatTime(time) {
  const value = safeTime(time);
  return value ? new Date(value).toLocaleString() : '未知';
}

function buildAuthStatusText(config) {
  const hasAccessToken = Boolean(cleanAccessToken(config && config.accessToken));
  const hasRefreshToken = Boolean(cleanRefreshToken(config && config.refreshToken));
  const parts = [
    `Access Token：${hasAccessToken ? '已保存' : '未保存'}`,
    `刷新凭证：${hasRefreshToken ? '已保存' : '未保存'}`,
  ];
  if (hasAccessToken) {
    parts.push(`本地过期时间：${formatTime(config.expiresAt)}`);
  }
  if (config && config.lastAuthSyncAt) {
    parts.push(`同步时间：${formatTime(config.lastAuthSyncAt)}`);
  }
  if (config && config.lastTokenRefreshAt) {
    parts.push(`刷新时间：${formatTime(config.lastTokenRefreshAt)}`);
  }
  return `当前状态：${parts.join('，')}`;
}

function formatSize(size) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Number(size) || 0;
  for (const unit of units) {
    if (value < 1024 || unit === units[units.length - 1]) {
      return unit === 'B' ? `${Math.round(value)}B` : `${value.toFixed(1)}${unit}`;
    }
    value /= 1024;
  }
  return `${size}B`;
}

function naturalCompare(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'zh-Hans-CN', {
    numeric: true,
    sensitivity: 'base',
  });
}

function buildTraceparent() {
  return `00-${randomHex(16)}-${randomHex(8)}-01`;
}

function randomHex(byteLength) {
  const bytes = new Uint8Array(byteLength);
  if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function buildCommonHeaders(extra = {}) {
  return {
    Accept: 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    Origin: SITE_URL,
    Referer: DEFAULT_REFERER,
    dt: '4',
    traceparent: buildTraceparent(),
    ...extra,
  };
}

function registerMenuCommands() {
  if (typeof GM_registerMenuCommand !== 'function') {
    return;
  }
  GM_registerMenuCommand('光鸭磁力助手：配置认证', showSettingsModal);
  GM_registerMenuCommand('光鸭磁力助手：同步官网认证', () => syncAuthFromCurrentPage({ showResult: true }));
  GM_registerMenuCommand('光鸭磁力助手：手动解析磁力', showManualMagnetPrompt);
  GM_registerMenuCommand('光鸭磁力助手：清空配置', () => {
    safeGmDelete(CONFIG_KEY);
    showToast('配置已清空', '', 'success');
  });
}

function attachClickInterceptor() {
  document.addEventListener(
    'click',
    (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }
      const magnet = findClickedMagnet(event);
      if (!magnet) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      handleMagnet(magnet);
    },
    true,
  );
}

registerMenuCommands();
syncAuthFromCurrentPage({ silent: true });
installMagnetDecorationObserver();
attachClickInterceptor();
