// gyp-core.js
// 由主 userscript 通过 @require 远程加载；不要单独安装。
// 主脚本地址：guangyapan_magnet_player.user.js

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

function isGuangyaSite() {
  return /(^|\.)guangyapan\.com$/i.test(window.location.hostname);
}

function readCurrentPageAuth() {
  const auth = { accessToken: '', refreshToken: '', tokenType: DEFAULT_CONFIG.tokenType, expiresAt: 0, clientId: DEFAULT_CONFIG.clientId };
  const sources = [];

  try {
    if (document.cookie) {
      sources.push(['document.cookie', document.cookie]);
    }
  } catch (_) {}

  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (!key) {
          continue;
        }
        const value = storage.getItem(key) || '';
        if (/^credentials_/i.test(key)) {
          const credentialsAuth = parseStoredCredentials(key, value);
          if (credentialsAuth.accessToken) {
            return credentialsAuth;
          }
        }
        sources.push([key, value]);
      }
    } catch (_) {}
  }

  for (const [key, value] of sources) {
    const combined = `${key}=${value}`;
    if (!auth.accessToken && /token|auth|login/i.test(key + value)) {
      auth.accessToken = extractAccessToken(combined);
    }
    if (auth.accessToken) {
      break;
    }
  }

  return auth;
}

function parseStoredCredentials(key, value) {
  try {
    const credentials = JSON.parse(value);
    if (!credentials || typeof credentials !== 'object') {
      return { accessToken: '' };
    }
    const accessToken = cleanAccessToken(credentials.access_token || credentials.accessToken);
    if (!accessToken) {
      return { accessToken: '' };
    }
    const clientId = String(key || '').replace(/^credentials_/i, '').trim() || DEFAULT_CONFIG.clientId;
    return {
      clientId,
      tokenType: normalizeTokenType(credentials.token_type || credentials.tokenType),
      accessToken,
      refreshToken: cleanRefreshToken(credentials.refresh_token || credentials.refreshToken),
      expiresAt: resolveCredentialsExpiresAt(credentials, accessToken),
    };
  } catch (_) {
    return { accessToken: '' };
  }
}

function mergeCapturedAuth(auth, options = {}) {
  const token = extractAccessToken(auth && (auth.accessToken || auth.authorization || auth.Authorization || auth.token));
  if (!token) {
    return false;
  }

  const config = getConfig();
  const refreshToken = cleanRefreshToken(auth && (auth.refreshToken || auth.refresh_token)) || config.refreshToken;
  const expiresAt = safeTime(auth && (auth.expiresAt || auth.expires_at)) || getJwtExpiresAt(token, 120 * 1000) || config.expiresAt;
  const nextConfig = {
    ...config,
    clientId: String((auth && (auth.clientId || auth.client_id)) || config.clientId || DEFAULT_CONFIG.clientId).trim() || DEFAULT_CONFIG.clientId,
    tokenType: normalizeTokenType((auth && (auth.tokenType || auth.token_type)) || config.tokenType),
    accessToken: token || config.accessToken,
    refreshToken,
    expiresAt,
    lastAuthSyncAt: Date.now(),
  };
  const changed = nextConfig.accessToken !== config.accessToken || nextConfig.refreshToken !== config.refreshToken || nextConfig.expiresAt !== config.expiresAt;
  saveConfig(nextConfig);

  if (!options.silent && changed) {
    showToast('认证已同步', refreshToken ? 'Access Token 和刷新凭证已保存。' : 'Access Token 已保存，未发现刷新凭证。', 'success');
  }
  return true;
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

function syncAuthFromCurrentPage(options = {}) {
  if (!isGuangyaSite()) {
    if (options.showResult) {
      showToast('未登录', '打开光鸭云盘。', 'warn');
    }
    return false;
  }

  installOfficialAuthHook();
  const synced = mergeCapturedAuth(readCurrentPageAuth(), { silent: !options.showResult });
  if (options.showResult) {
    const config = getConfig();
    showToast(
      synced ? '认证已同步' : '未发现认证',
      synced ? (config.refreshToken ? 'Access Token 和刷新凭证已保存。' : 'Access Token 已保存，未发现刷新凭证。') : '刷新后再试。',
      synced ? 'success' : 'warn',
    );
  }
  return synced;
}

function installOfficialAuthHook() {
  if (!isGuangyaSite() || state.authHookInstalled) {
    return;
  }
  state.authHookInstalled = true;

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.source !== AUTH_MESSAGE_SOURCE) {
      return;
    }
    mergeCapturedAuth(event.data, { silent: true });
  });

  const script = document.createElement('script');
  script.textContent = `(${function injectAuthHook(source) {
    if (window.__GYP_MAGNET_PLAYER_AUTH_HOOKED__) {
      return;
    }
    window.__GYP_MAGNET_PLAYER_AUTH_HOOKED__ = true;

    function emit(headers) {
      if (!headers) {
        return;
      }
      const authorization = headers.authorization || headers.Authorization || '';
      if (!authorization) {
        return;
      }
      window.postMessage({ source, authorization }, window.location.origin);
    }

    function readHeaders(input) {
      const headers = {};
      if (!input) {
        return headers;
      }
      try {
        if (typeof Headers !== 'undefined' && input instanceof Headers) {
          input.forEach((value, key) => {
            headers[key] = value;
          });
          return headers;
        }
      } catch (_) {}
      if (Array.isArray(input)) {
        for (const pair of input) {
          if (Array.isArray(pair) && pair.length >= 2) {
            headers[String(pair[0])] = String(pair[1]);
          }
        }
        return headers;
      }
      if (typeof input === 'object') {
        for (const key of Object.keys(input)) {
          headers[key] = String(input[key]);
        }
      }
      return headers;
    }

    const originalFetch = window.fetch;
    if (typeof originalFetch === 'function') {
      window.fetch = function patchedFetch(input, init) {
        try {
          const headers = {};
          if (typeof Request !== 'undefined' && input instanceof Request) {
            Object.assign(headers, readHeaders(input.headers));
          }
          if (init && init.headers) {
            Object.assign(headers, readHeaders(init.headers));
          }
          emit(headers);
        } catch (_) {}
        return originalFetch.apply(this, arguments);
      };
    }

    const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.setRequestHeader = function patchedSetRequestHeader(name, value) {
      try {
        this.__gypMagnetHeaders = this.__gypMagnetHeaders || {};
        this.__gypMagnetHeaders[String(name)] = String(value);
      } catch (_) {}
      return originalSetRequestHeader.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function patchedSend() {
      try {
        emit(this.__gypMagnetHeaders || {});
      } catch (_) {}
      return originalSend.apply(this, arguments);
    };
  }.toString()})(${JSON.stringify(AUTH_MESSAGE_SOURCE)});`;
  (document.documentElement || document.head || document.body).appendChild(script);
  script.remove();
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

function gmRequestJson(method, url, payload, options = {}) {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method,
      url,
      data: payload === undefined ? undefined : JSON.stringify(payload || {}),
      headers: options.headers || buildCommonHeaders(),
      responseType: 'text',
      timeout: options.timeout || REQUEST_TIMEOUT,
      anonymous: false,
      onload(response) {
        let data = null;
        if (response.responseText) {
          try {
            data = parseApiJson(response.responseText);
          } catch (error) {
            reject(new Error(`接口 ${url} 返回的不是 JSON：HTTP ${response.status}`));
            return;
          }
        }
        if (response.status >= 400) {
          reject(new HttpError(url, response.status, data));
          return;
        }
        if (!data || typeof data !== 'object') {
          reject(new Error(`接口 ${url} 返回为空`));
          return;
        }
        resolve(data);
      },
      onerror(error) {
        reject(new Error(`接口 ${url} 网络错误：${error.error || '未知错误'}`));
      },
      ontimeout() {
        reject(new Error(`接口 ${url} 请求超时`));
      },
    });
  });
}

function isAccessTokenFresh(config, skewMs = 30 * 1000) {
  const token = cleanAccessToken(config && config.accessToken);
  if (!token) {
    return false;
  }
  const expiresAt = safeTime(config && config.expiresAt) || getJwtExpiresAt(token, 0);
  return !expiresAt || expiresAt - Date.now() > skewMs;
}

async function ensureFreshAccessToken(options = {}) {
  if (isGuangyaSite()) {
    syncAuthFromCurrentPage({ silent: true });
  }
  const config = getConfig();
  if (!options.force && isAccessTokenFresh(config)) {
    return config;
  }
  if (!cleanRefreshToken(config.refreshToken)) {
    if (cleanAccessToken(config.accessToken) && !options.force) {
      return config;
    }
    throw new Error('缺少刷新凭证，请打开光鸭云盘后同步官网认证。');
  }
  if (!state.refreshPromise) {
    state.refreshPromise = refreshAccessToken(config).finally(() => {
      state.refreshPromise = null;
    });
  }
  return state.refreshPromise;
}

async function refreshAccessToken(config) {
  const clientId = String(config.clientId || DEFAULT_CLIENT_ID).trim() || DEFAULT_CLIENT_ID;
  const payload = {
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: cleanRefreshToken(config.refreshToken),
  };
  const data = await gmRequestJson('POST', `${ACCOUNT_BASE}/v1/auth/token`, payload, {
    headers: buildCommonHeaders({ 'x-action': '401', 'x-client-id': clientId }),
  });
  const accessToken = cleanAccessToken(data.access_token || data.accessToken || (data.data && (data.data.access_token || data.data.accessToken)));
  if (!accessToken) {
    throw new Error('刷新 Access Token 失败：接口未返回 access_token');
  }
  const refreshToken = cleanRefreshToken(data.refresh_token || data.refreshToken || (data.data && (data.data.refresh_token || data.data.refreshToken))) || cleanRefreshToken(config.refreshToken);
  const expiresAt = resolveCredentialsExpiresAt(data.data && typeof data.data === 'object' ? data.data : data, accessToken);
  const nextConfig = normalizeConfig({
    ...config,
    clientId,
    tokenType: normalizeTokenType(data.token_type || data.tokenType || (data.data && (data.data.token_type || data.data.tokenType)) || config.tokenType),
    accessToken,
    refreshToken,
    expiresAt,
    lastTokenRefreshAt: Date.now(),
  });
  saveConfig(nextConfig);
  return nextConfig;
}

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

async function gmPostJson(path, payload, options = {}) {
  const config = await ensureFreshAccessToken({ force: options.forceRefresh === true });
  const headers = buildCommonHeaders();
  const token = cleanAccessToken(config.accessToken);
  if (token) {
    headers.Authorization = `${normalizeTokenType(config.tokenType)} ${token}`;
  }
  return gmRequestJson('POST', `${API_BASE}${path}`, payload, {
    ...options,
    headers,
  });
}

function isAuthFailure(error) {
  if (error instanceof HttpError) {
    return error.status === 401 || error.status === 403;
  }
  if (error instanceof ApiError) {
    return [100, 102, 103, 104, 401, 403].includes(error.code);
  }
  return false;
}

async function requestJson(path, payload, options = {}) {
  const retries = options.retries || 0;
  const retryCodes = new Set(options.retryCodes || []);
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      let data = await gmPostJson(path, payload, options);
      const rawCode = data.code;
      const code = rawCode === undefined || rawCode === null || rawCode === '' ? 0 : safeInt(rawCode, -1);
      if ([100, 102, 103, 104, 401, 403].includes(code) && !options.forceRefresh) {
        data = await gmPostJson(path, payload, { ...options, forceRefresh: true });
        const retryRawCode = data.code;
        const retryCode = retryRawCode === undefined || retryRawCode === null || retryRawCode === '' ? 0 : safeInt(retryRawCode, -1);
        if (retryCode !== 0) {
          throw new ApiError(path, retryCode, data.msg || '', data);
        }
        return data;
      }
      if (retryCodes.has(code) && attempt < retries) {
        lastError = new ApiError(path, code, data.msg || '', data);
        await delay(Math.min(2000 * (attempt + 1), 5000));
        continue;
      }
      if (code !== 0) {
        throw new ApiError(path, code, data.msg || '', data);
      }
      return data;
    } catch (error) {
      lastError = error;
      if (isAuthFailure(error) && !options.forceRefresh) {
        try {
          return await requestJson(path, payload, { ...options, retries: 0, forceRefresh: true });
        } catch (refreshError) {
          throw refreshError;
        }
      }
      if (attempt < retries && !(error instanceof ApiError)) {
        await delay(Math.min(2000 * (attempt + 1), 5000));
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error(`接口 ${path} 请求失败`);
}

async function resolveResource(magnet) {
  const data = await requestJson('/cloudcollection/v1/resolve_res', { url: magnet }, { retries: 1, retryCodes: [101] });
  const result = data.data || {};
  if (!result || typeof result !== 'object') {
    throw new Error('解析接口没有返回有效数据');
  }
  if (!result.btResInfo) {
    throw new Error('当前输入不是 BT 资源，或服务端未返回 BT 文件列表');
  }
  return result;
}

function flattenBtFileOptions(btInfo) {
  const options = [];

  function makeOption(node, path, fileIndex) {
    const fileName = String((node && node.fileName) || path || '完整资源');
    return {
      fileIndex,
      fileName,
      fileSize: safeInt(node && node.fileSize, 0),
      fileType: safeInt(node && node.fileType, 0),
      path: path || fileName,
      isWholeResource: fileIndex === null,
    };
  }

  function walk(nodes, prefix) {
    if (!Array.isArray(nodes)) {
      return;
    }
    for (const node of nodes) {
      if (!node || typeof node !== 'object') {
        continue;
      }
      const fileName = String(node.fileName || '未命名文件');
      const path = prefix ? `${prefix}/${fileName}` : fileName;
      if (Array.isArray(node.subfiles) && node.subfiles.length > 0) {
        walk(node.subfiles, path);
        continue;
      }
      const fileIndex = node.fileIndex === undefined || node.fileIndex === null ? null : safeInt(node.fileIndex, -1);
      options.push(makeOption(node, path, fileIndex));
    }
  }

  walk(btInfo && btInfo.subfiles ? btInfo.subfiles : [], '');
  const indexedOptions = options.filter((item) => item.fileIndex >= 0).sort((a, b) => naturalCompare(a.path, b.path));
  if (indexedOptions.length > 0) {
    return indexedOptions;
  }

  if (btInfo && typeof btInfo === 'object') {
    const fileName = String(btInfo.fileName || '未命名文件');
    const fileIndex = btInfo.fileIndex === undefined || btInfo.fileIndex === null ? null : safeInt(btInfo.fileIndex, -1);
    return [makeOption(btInfo, fileName, fileIndex)].filter((item) => item.fileIndex === null || item.fileIndex >= 0);
  }
  return [];
}

async function createTask(magnet, fileIndexes) {
  const config = getConfig();
  const payload = {
    url: magnet,
    parentId: config.parentId || '',
  };
  if (Array.isArray(fileIndexes) && fileIndexes.length > 0) {
    payload.fileIndexes = fileIndexes;
  }
  const data = await requestJson('/cloudcollection/v1/create_task', payload);
  const taskId = data.data && data.data.taskId;
  if (!taskId) {
    throw new Error('创建云添加任务失败：接口未返回 taskId');
  }
  return String(taskId);
}

async function pollTask(taskId, onProgress) {
  const config = getConfig();
  const deadline = Date.now() + safeInt(config.maxWaitMs, DEFAULT_CONFIG.maxWaitMs);
  const pollIntervalMs = Math.max(1000, safeInt(config.pollIntervalMs, DEFAULT_CONFIG.pollIntervalMs));
  const earlyStablePolls = Math.max(0, safeInt(config.earlyStablePolls, DEFAULT_CONFIG.earlyStablePolls));
  let stableFileId = '';
  let stableCount = 0;

  while (Date.now() < deadline) {
    const data = await requestJson('/cloudcollection/v1/list_task', { taskIds: [taskId] }, { retries: 1, retryCodes: [101] });
    const payload = data.data || {};
    const tasks = Array.isArray(payload.list) ? payload.list : [];
    if (tasks.length === 0) {
      throw new Error('查询云添加任务失败：任务列表为空');
    }

    const task = tasks[0] || {};
    const status = safeInt(task.status, -1);
    const progress = safeInt(task.progress, 0);
    const fileId = task.fileId ? String(task.fileId) : '';
    if (typeof onProgress === 'function') {
      onProgress(task);
    }

    if ((status === 2 || status === 5) && fileId) {
      return task;
    }
    if (status === 3 || status === 4) {
      throw new Error(`云添加失败：status=${status}`);
    }

    if (status === 1 && fileId && progress >= 99 && earlyStablePolls > 0) {
      if (fileId === stableFileId) {
        stableCount += 1;
      } else {
        stableFileId = fileId;
        stableCount = 1;
      }
      if (stableCount >= earlyStablePolls) {
        return task;
      }
    } else {
      stableFileId = '';
      stableCount = 0;
    }

    await delay(pollIntervalMs);
  }

  throw new Error(`轮询云添加任务超时：taskId=${taskId}`);
}

async function listFolderChildren(folderId) {
  const config = getConfig();
  const pageSize = Math.max(20, safeInt(config.pageSize, DEFAULT_CONFIG.pageSize));
  const children = [];

  for (let page = 0; ; page += 1) {
    const data = await requestJson(
      '/userres/v1/file/get_file_list',
      {
        page,
        pageSize,
        parentId: folderId,
        orderBy: 3,
        sortType: 1,
        fileTypes: [],
      },
      { retries: 1, retryCodes: [101] },
    );
    const payload = data.data || {};
    const list = Array.isArray(payload.list) ? payload.list : [];
    children.push(...list.filter((item) => item && typeof item === 'object'));
    if (list.length < pageSize) {
      break;
    }
  }

  return children;
}

function normalizeFileItem(item, fallbackFileId = '', fallbackPath = '') {
  if (!item || typeof item !== 'object') {
    return null;
  }
  const fileInfo = item.fileInfo && typeof item.fileInfo === 'object' ? item.fileInfo : item;
  const fileId = String(fileInfo.fileId || fileInfo.id || fallbackFileId || '');
  const fileName = String(fileInfo.fileName || fileInfo.name || fallbackPath || '未命名文件');
  const outerResType = safeInt(item.resType, 0);
  const outerIsDir = item.isDir === true;
  const outerDirType = safeInt(item.dirType, 0);
  const resType = safeInt(fileInfo.resType, outerResType === 2 || outerIsDir || outerDirType === 2 ? 2 : safeInt(fileInfo.dirType, 1));
  const isDir = outerIsDir || fileInfo.isDir === true || resType === 2 || outerResType === 2 || outerDirType === 2 || safeInt(fileInfo.dirType, 0) === 2;
  if (!fileId) {
    return null;
  }
  return {
    fileId,
    fileName,
    fileSize: safeInt(fileInfo.fileSize ?? fileInfo.size, 0),
    fileType: safeInt(fileInfo.fileType, 0),
    resType: isDir ? 2 : resType,
    isDir,
    dirType: safeInt(fileInfo.dirType, outerDirType),
    path: fallbackPath || fileName,
  };
}

function isDirectoryItem(item) {
  return Boolean(item && (item.resType === 2 || item.isDir));
}

async function getFileInfo(fileId) {
  const data = await requestJson('/userres/v1/file/get_info_by_file_id', { fileId }, { retries: 1, retryCodes: [101] });
  return normalizeFileItem(data.data || {}, fileId);
}

async function collectFileCandidates(folderId, prefix = '', depth = 0) {
  const config = getConfig();
  if (depth > safeInt(config.maxTreeDepth, DEFAULT_CONFIG.maxTreeDepth)) {
    return [];
  }

  const candidates = [];
  const children = await listFolderChildren(folderId);
  for (const item of children) {
    const normalized = normalizeFileItem(item);
    if (!normalized) {
      continue;
    }
    const fileId = normalized.fileId;
    const fileName = normalized.fileName;
    const currentPath = prefix ? `${prefix}${fileName}` : fileName;
    const candidate = {
      fileId,
      fileName,
      fileSize: normalized.fileSize,
      fileType: normalized.fileType,
      resType: normalized.resType,
      isDir: normalized.isDir,
      dirType: normalized.dirType,
      path: currentPath,
    };

    if (!isDirectoryItem(normalized)) {
      candidates.push(candidate);
    } else {
      const nested = await collectFileCandidates(fileId, `${currentPath}/`, depth + 1);
      candidates.push(...nested);
    }
  }
  return candidates;
}

async function waitForFileCandidates(folderId, onProgress) {
  let lastError = null;
  for (let attempt = 0; attempt <= 20; attempt += 1) {
    try {
      const rootItem = await getFileInfo(folderId).catch(() => null);
      if (rootItem && !isDirectoryItem(rootItem)) {
        return [{
          fileId: rootItem.fileId,
          fileName: rootItem.fileName,
          fileSize: rootItem.fileSize,
          fileType: rootItem.fileType,
          resType: rootItem.resType,
          isDir: rootItem.isDir,
          dirType: rootItem.dirType,
          path: rootItem.fileName,
        }];
      }
      const candidates = await collectFileCandidates(folderId);
      if (candidates.length > 0) {
        return candidates;
      }
    } catch (error) {
      lastError = error;
    }
    if (typeof onProgress === 'function') {
      onProgress(attempt + 1);
    }
    await delay(2000);
  }
  if (lastError) {
    throw lastError;
  }
  return [];
}

async function fetchPlayableUrl(fileId) {
  const errors = [];
  const fileInfo = await getFileInfo(fileId).catch((error) => {
    errors.push(`get_info_by_file_id: ${errorToMessage(error)}`);
    return null;
  });
  if (fileInfo && isDirectoryItem(fileInfo)) {
    throw new Error(`当前选中的是目录，不能直接下载。fileId=${fileInfo.fileId} fileName=${fileInfo.fileName} resType=${fileInfo.resType} isDir=${fileInfo.isDir}`);
  }

  try {
    const data = await requestJson('/userres/v1/get_res_download_url', { fileId }, { retries: 8, retryCodes: [101] });
    const url = data.data && data.data.signedURL;
    if (url) {
      return { url: String(url), kind: 'download', fileInfo };
    }
    errors.push('get_res_download_url 未返回 signedURL');
  } catch (error) {
    errors.push(`get_res_download_url: ${errorToMessage(error)}`);
  }

  throw new Error(`无法获取播放地址。${errors.join('；')}`);
}

async function deleteCloudFiles(fileIds) {
  const ids = Array.from(new Set((Array.isArray(fileIds) ? fileIds : [fileIds]).map((id) => String(id || '').trim()).filter(Boolean)));
  if (ids.length === 0) {
    return '';
  }
  const data = await requestJson('/userres/v1/file/delete_file', { fileIds: ids });
  return data.data && data.data.taskId ? String(data.data.taskId) : '';
}

async function handleMagnet(magnet) {
  if (state.busy) {
    showToast('任务运行中', '稍后再试。', 'warn');
    return;
  }
  state.busy = true;

  const progress = showProgressModal('解析磁力链接', '解析中...');
  try {
    const resolved = await resolveResource(magnet);
    const options = flattenBtFileOptions(resolved.btResInfo || {});
    progress.close();
    if (options.length === 0) {
      showErrorModal('没有可选文件', 'BT 文件列表为空。');
      return;
    }
    showSelectionModal({
      magnet: resolved.url || magnet,
      title: resolved.btResInfo && resolved.btResInfo.fileName ? String(resolved.btResInfo.fileName) : '磁力资源',
      options,
    });
  } catch (error) {
    progress.close();
    showErrorModal('解析失败', buildFriendlyError(error));
  } finally {
    state.busy = false;
  }
}

async function saveSelectedFiles(magnet, selectedOptions, playAfterSave) {
  state.busy = true;
  const canSelectByIndex = selectedOptions.every((item) => item.fileIndex !== null);
  const fileIndexes = canSelectByIndex ? selectedOptions.map((item) => item.fileIndex) : null;
  const progress = showProgressModal('保存文件', `准备保存 ${selectedOptions.length} 个文件`);
  try {
    progress.update('创建云添加任务', fileIndexes ? `保存 ${selectedOptions.length} 个文件` : '保存完整资源');
    const taskId = await createTask(magnet, fileIndexes);
    progress.update('等待云添加完成', `taskId=${taskId}`);
    const task = await pollTask(taskId, (taskInfo) => {
      const status = safeInt(taskInfo.status, -1);
      const progressValue = taskInfo.progress === undefined ? '-' : `${taskInfo.progress}%`;
      progress.update('等待云添加完成', `status=${status} progress=${progressValue} ${taskInfo.fileName || ''}`.trim());
    });
    const folderId = String(task.fileId || '');
    if (!folderId) {
      throw new Error('云添加完成，但任务没有返回结果目录 fileId');
    }

    progress.update('读取剧集列表', '读取中...');
    const candidates = await waitForFileCandidates(folderId, (attempt) => {
      progress.update('读取剧集列表', `等待目录 (${attempt}/21)`);
    });
    const playableItems = candidates.sort((a, b) => naturalCompare(a.path, b.path));
    progress.close();

    if (playableItems.length === 0) {
      showErrorModal('未找到文件', '结果目录为空。');
      return;
    }

    showToast('保存完成', `已找到 ${playableItems.length} 个文件。`, 'success');
    if (playAfterSave) {
      showPlayerModal(playableItems, { taskId, folderId });
    }
  } catch (error) {
    progress.close();
    showErrorModal('保存或播放准备失败', buildFriendlyError(error));
  } finally {
    state.busy = false;
  }
}
