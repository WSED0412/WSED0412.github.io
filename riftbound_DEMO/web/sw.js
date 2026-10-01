/**
 * 符文戰場賽事系統 Service Worker (DATA-CONTRACT 1.17)
 * 快取名稱固定 rb-offline-v1
 * 只替找桌頁 (find-table.html) 服務，提供離線快照與頁面快取
 */

const CACHE_NAME = 'rb-offline-v1';

// 計算目標網址（跟著 sw.js 所在路徑走，支援子資料夾如 /demo/web/）
const TARGET_PAGE_URL = new URL('find-table.html', self.location).href;
const TARGET_SNAPSHOT_URL = new URL('../snapshot.json', self.location).href;

// 安裝時略過等待，並預先快取找桌頁
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      const cleanUrl = TARGET_PAGE_URL;
      const res = await fetch(cleanUrl);
      if (res.ok && res.status === 200) {
        await cache.put(cleanUrl, res);
      }
    } catch (e) {
      // 離線或網路失敗時略過
    }
  })());
});

// 啟用時立即接管所有客戶端，並刪除舊名稱快取
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// 檢查請求是否來自找桌頁 (find-table.html)
async function isClientFindTable(event) {
  if (event.clientId) {
    try {
      const client = await self.clients.get(event.clientId);
      if (client && client.url) {
        const clientClean = new URL(client.url).origin + new URL(client.url).pathname;
        return clientClean === TARGET_PAGE_URL || clientClean.endsWith('/find-table.html');
      }
    } catch (e) {}
  }
  if (event.request.referrer) {
    try {
      const refClean = new URL(event.request.referrer).origin + new URL(event.request.referrer).pathname;
      return refClean === TARGET_PAGE_URL || refClean.endsWith('/find-table.html');
    } catch (e) {}
  }
  return false;
}

// 帶逾時的 fetch
async function fetchWithTimeout(request, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// 取得帶有 X-Offline-Copy: 1 標頭的快取 snapshot.json
async function getCachedSnapshot(cleanUrl) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(cleanUrl);
  if (!cached) return null;

  const text = await cached.text();
  const headers = new Headers(cached.headers);
  headers.set('X-Offline-Copy', '1');

  return new Response(text, {
    status: cached.status,
    statusText: cached.statusText,
    headers: headers
  });
}

// 處理 find-table.html 頁面請求（4 秒逾時）
async function handlePageFetch(event) {
  const cleanUrl = TARGET_PAGE_URL;
  try {
    const response = await fetchWithTimeout(event.request, 4000);
    if (response.ok && response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(cleanUrl, response.clone());
      return response;
    }
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(cleanUrl);
    if (cached) return cached;
    return response;
  } catch (err) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(cleanUrl);
    if (cached) return cached;
    throw err;
  }
}

// 處理 snapshot.json 請求（限來自找桌頁，5 秒逾時）
async function handleSnapshotFetch(event) {
  const isFindTable = await isClientFindTable(event);
  if (!isFindTable) {
    return fetch(event.request);
  }

  const cleanUrl = TARGET_SNAPSHOT_URL;
  try {
    const response = await fetchWithTimeout(event.request, 5000);
    if (response.ok && response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(cleanUrl, response.clone());
      return response;
    }
    const cached = await getCachedSnapshot(cleanUrl);
    if (cached) return cached;
    return response;
  } catch (err) {
    const cached = await getCachedSnapshot(cleanUrl);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  // 只處理 GET 請求
  if (event.request.method !== 'GET') {
    return;
  }

  // 僅限同網站請求
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  // 比對時拿掉網址參數
  const cleanHref = url.origin + url.pathname;

  // 1. find-table.html 頁面請求
  if (cleanHref === TARGET_PAGE_URL) {
    event.respondWith(handlePageFetch(event));
    return;
  }

  // 2. snapshot.json 請求（限來自找桌頁）
  if (cleanHref === TARGET_SNAPSHOT_URL) {
    // 若 referrer 明確非找桌頁（例如大螢幕 clock.html），直接跳過不處理，不呼叫 respondWith
    if (event.request.referrer) {
      try {
        const refUrl = new URL(event.request.referrer);
        const refClean = refUrl.origin + refUrl.pathname;
        if (refClean !== TARGET_PAGE_URL && !refUrl.pathname.endsWith('/find-table.html')) {
          return;
        }
      } catch (e) {}
    }

    event.respondWith(handleSnapshotFetch(event));
    return;
  }

  // 其他請求（/api/、/sample/、其他 HTML 頁面等）一律不處理，交由瀏覽器走常規網路
});
