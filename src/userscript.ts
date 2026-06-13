export const USERSCRIPT = `// ==UserScript==
// @name         Literotica Downloader V2
// @namespace    https://studios.easyspace.in
// @version      2.1.5
// @description  Download complete author libraries from Literotica using the site HTML. Supports ZIP, HTML, EPUB, and TXT export with full series grouping, filtering, and retry logic.
// @author       easyspace
// @license      All Rights Reserved
// @homepageURL  https://studios.easyspace.in
// @supportURL   https://studios.easyspace.in
// @match        https://www.literotica.com/authors/*
// @match        https://literotica.com/authors/*
// @match        https://www.literotica.com/stories/memberpage.php*
// @match        https://literotica.com/stories/memberpage.php*
// @grant        GM.getValue
// @grant        GM.setValue
// @connect      literotica.com
// @connect      www.literotica.com
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js
// @run-at       document-end
// @noframes
// ==/UserScript==

/* ============================================================
   LITEROTICA DOWNLOADER V2
   Production-Quality Author Library Downloader
   
   Architecture:
   - Phase 1: API Layer + Retry Engine
   - Phase 2: Author Catalog Retrieval + Pagination
   - Phase 3: Series Grouping Logic
   - Phase 4: UI Shell
   - Phase 5: Story Content Fetching
   - Phase 6: HTML Builder
   - Phase 7: EPUB Builder
   - Phase 8: ZIP Package Generator
   - Phase 9: Persistent Settings
   - Phase 10: Polish + Edge Cases
   ============================================================ */

(function () {
  'use strict';

  // ============================================================
  // PHASE 1: API LAYER + RETRY ENGINE
  // ============================================================

  const API_BASE = 'https://www.literotica.com/api/3';
  const SCRIPT_VERSION = '2.1.5';
  const REQUEST_DELAY_MIN = 300;
  const REQUEST_DELAY_MAX = 500;
  const MAX_RETRIES = 3;
  const RETRY_BASE_DELAY = 1000;
  const ALLOWED_HOSTS = new Set(['www.literotica.com', 'literotica.com']);

  const GMCompat = (() => {
    const gmObj = typeof GM === 'object' && GM ? GM : null;

    function getValue(key, fallback) {
      if (gmObj && typeof gmObj.getValue === 'function') {
        return gmObj.getValue(key, fallback);
      }
      if (typeof GM_getValue === 'function') {
        return Promise.resolve(GM_getValue(key, fallback));
      }
      return Promise.resolve(fallback);
    }

    function setValue(key, value) {
      if (gmObj && typeof gmObj.setValue === 'function') {
        return gmObj.setValue(key, value);
      }
      if (typeof GM_setValue === 'function') {
        GM_setValue(key, value);
        return Promise.resolve();
      }
      return Promise.resolve();
    }

    function xmlHttpRequest(options) {
      if (gmObj && typeof gmObj.xmlHttpRequest === 'function') {
        return gmObj.xmlHttpRequest(options);
      }
      if (typeof GM_xmlhttpRequest === 'function') {
        return GM_xmlhttpRequest(options);
      }
      throw new Error('No userscript HTTP API available in this manager');
    }

    return { getValue, setValue, xmlHttpRequest };
  })();

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function makeAbortError(message = 'Download aborted by user.') {
    const err = new Error(message);
    err.name = 'AbortError';
    return err;
  }

  function isAbortError(err) {
    return !!(err && (err.name === 'AbortError' || /aborted/i.test(err.message || '')));
  }

  function throwIfAborted(signal, message) {
    if (signal && signal.aborted) {
      throw makeAbortError(message);
    }
  }

  function randomDelay() {
    const ms = REQUEST_DELAY_MIN + Math.random() * (REQUEST_DELAY_MAX - REQUEST_DELAY_MIN);
    return sleep(ms);
  }

  async function gmFetch(url, options = {}) {
    const method = options.method || 'GET';
    const headers = {
      'Accept': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...options.headers
    };
    const timeoutMs = options.timeout || 30000;
    const externalSignal = options.signal;

    // Literotica's /api/3/ is same-origin, so prefer native fetch. This avoids
    // userscript-manager differences around GM.xmlHttpRequest availability.
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const abortHandler = controller && externalSignal
        ? () => controller.abort(externalSignal.reason)
        : null;
      if (externalSignal && abortHandler) {
        if (externalSignal.aborted) {
          controller.abort(externalSignal.reason);
        } else {
          externalSignal.addEventListener('abort', abortHandler, { once: true });
        }
      }
      const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

      try {
        throwIfAborted(externalSignal);
        const resp = await fetch(url, {
          method,
          headers,
          // For same-origin, browsers send cookies by default. Be explicit anyway.
          credentials: 'include',
          signal: controller ? controller.signal : externalSignal,
        });

        const text = await resp.text();
        return {
          status: resp.status,
          statusText: resp.statusText,
          text: () => Promise.resolve(text),
          json: () => {
            try {
              return Promise.resolve(JSON.parse(text));
            } catch (e) {
              return Promise.reject(new Error('Invalid JSON: ' + e.message));
            }
          },
          ok: resp.ok
        };
      } finally {
        if (timer) clearTimeout(timer);
        if (externalSignal && abortHandler) {
          externalSignal.removeEventListener('abort', abortHandler);
        }
      }
    } catch (e) {
      if (isAbortError(e)) {
        throw makeAbortError();
      }
      // Fall back to userscript HTTP APIs if fetch is blocked for some reason.
      return new Promise((resolve, reject) => {
        try {
          GMCompat.xmlHttpRequest({
            method,
            url,
            headers,
            timeout: timeoutMs,
            onload: (response) => {
              resolve({
                status: response.status,
                statusText: response.statusText,
                text: () => Promise.resolve(response.responseText),
                json: () => {
                  try {
                    return Promise.resolve(JSON.parse(response.responseText));
                  } catch (err) {
                    return Promise.reject(new Error('Invalid JSON: ' + err.message));
                  }
                },
                ok: response.status >= 200 && response.status < 300
              });
            },
            onerror: (err) => reject(new Error('Network error: ' + JSON.stringify(err))),
            ontimeout: () => reject(new Error('Request timed out: ' + url))
          });
        } catch (err) {
          reject(err);
        }
      });
    }
  }

  async function fetchWithRetry(url, options = {}, attempt = 0) {
    try {
      await randomDelay();
      const response = await gmFetch(url, options);

      if (response.status === 429) {
        if (attempt >= MAX_RETRIES) throw new Error('Rate limited after ' + MAX_RETRIES + ' retries');
        const backoff = RETRY_BASE_DELAY * Math.pow(2, attempt);
        Logger.warn('Rate limited. Retrying in ' + (backoff / 1000).toFixed(1) + 's... (attempt ' + (attempt + 1) + ')');
        await sleep(backoff);
        return fetchWithRetry(url, options, attempt + 1);
      }

      if (response.status === 404) {
        throw new Error('Not found (404): ' + url);
      }

      if (!response.ok) {
        throw new Error('HTTP ' + response.status + ' for ' + url);
      }

      return response;
    } catch (err) {
      if (isAbortError(err)) throw err;
      if (attempt < MAX_RETRIES && !err.message.includes('404')) {
        const backoff = RETRY_BASE_DELAY * Math.pow(2, attempt);
        Logger.warn('Request failed (' + err.message + '). Retrying in ' + (backoff / 1000).toFixed(1) + 's...');
        await sleep(backoff);
        return fetchWithRetry(url, options, attempt + 1);
      }
      throw err;
    }
  }

  async function fetchJSON(url, options = {}) {
    const response = await fetchWithRetry(url, options);
    return response.json();
  }

  // ============================================================
  // LOGGER MODULE
  // ============================================================

  const Logger = (() => {
    const listeners = [];

    function emit(level, msg) {
      const entry = { level, msg, time: new Date().toLocaleTimeString() };
      listeners.forEach(fn => fn(entry));
      if (level === 'error') console.error('[LitDL]', msg);
      else if (level === 'warn') console.warn('[LitDL]', msg);
      else console.log('[LitDL]', msg);
    }

    return {
      info: (msg) => emit('info', msg),
      warn: (msg) => emit('warn', msg),
      error: (msg) => emit('error', msg),
      success: (msg) => emit('success', msg),
      onLog: (fn) => listeners.push(fn),
    };
  })();

  // ============================================================
  // PHASE 9: PERSISTENT SETTINGS
  // ============================================================

  const Settings = (() => {
    const KEY = 'litdl_v2_settings';

    function defaults() {
      return {
        panelOpen: true,
        exportHTML: true,
        exportEPUB: false,
        exportTXT: false,
        exportZIP: true,
        exportMode: 'combined',
        filterCategory: 'all',
        filterRating: 0,
        filterType: 'all',
        sortBy: 'date',
        searchQuery: '',
        lastAuthor: '',
        lastSelection: [],
      };
    }

    async function load() {
      try {
        const raw = await GMCompat.getValue(KEY, null);
        if (!raw) return defaults();
        return { ...defaults(), ...JSON.parse(raw) };
      } catch { return defaults(); }
    }

    function save(data) {
      GMCompat.setValue(KEY, JSON.stringify(data)).catch(() => { });
    }

    let _state = defaults();
    let _ready = false;

    return {
      init: async () => {
        if (_ready) return { ..._state };
        _state = await load();
        _ready = true;
        return { ..._state };
      },
      get: (key) => _state[key],
      set: (key, value) => {
        _state[key] = value;
        save(_state);
      },
      setMany: (obj) => {
        _state = { ..._state, ...obj };
        save(_state);
      },
      all: () => ({ ..._state }),
    };
  })();

  // ============================================================
  // PHASE 2: AUTHOR CATALOG RETRIEVAL + PAGINATION
  // ============================================================

  function detectAuthor() {
    try {
      const url = new URL(window.location.href);
      if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) return null;

      const pathParts = url.pathname.split('/').filter(Boolean);
      if (pathParts[0] === 'authors' && pathParts[1]) {
        return decodeURIComponent(pathParts[1]);
      }

      if (url.pathname === '/stories/memberpage.php') {
        const uid = url.searchParams.get('uid');
        if (uid && /^\\d+$/.test(uid)) return uid;
      }

      return null;
    } catch {
      return null;
    }
  }

  function extractStorySlug(value) {
    if (!value) return '';
    const raw = String(value).trim();
    if (!raw) return '';

    try {
      const url = new URL(raw, window.location.origin);
      const parts = url.pathname.split('/').filter(Boolean);
      const storyIndex = parts.indexOf('s');
      if (storyIndex !== -1 && parts[storyIndex + 1]) {
        return parts[storyIndex + 1];
      }
      return parts[parts.length - 1] || raw;
    } catch {
      const match = raw.match(new RegExp('/s/([^/?#]+)', 'i'));
      if (match) return match[1];
      return raw.replace(new RegExp('^/+|/+$', 'g'), '');
    }
  }

  function escapeRegex(str) {
    return String(str || '').replace(new RegExp('[-/\\\\^$*+?.()|[\\]{}]', 'g'), '\\$&');
  }

  function extractAuthorUserIdFromHtml(html, author) {
    if (!html) return null;
    const safeAuthor = escapeRegex(author);
    const patterns = [
      new RegExp('userid:(\\d+),username:"' + safeAuthor + '"', 'i'),
      new RegExp('username:"' + safeAuthor + '".{0,400}?userid:(\\d+)', 'i'),
      new RegExp('author:\\{userid:(\\d+),username:"' + safeAuthor + '"', 'i'),
      new RegExp('memberpage\\.php\\?uid=(\\d{2,})', 'i'),
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) return match[1];
    }

    return null;
  }

  async function resolveAuthorApiIdentifier(author) {
    const normalized = String(author || '').trim();
    if (!normalized) return normalized;
    if (/^\\d+$/.test(normalized)) return normalized;

    try {
      const url = new URL(window.location.href);
      const uid = url.searchParams.get('uid');
      if (uid && /^\\d+$/.test(uid)) {
        Logger.info('Resolved author API identifier: ' + uid);
        return uid;
      }
    } catch { }

    try {
      const html = document.documentElement ? document.documentElement.innerHTML : '';
      const uid = extractAuthorUserIdFromHtml(html, normalized);
      if (uid) {
        Logger.info('Resolved author API identifier: ' + uid);
        return uid;
      }
    } catch { }

    try {
      const response = await gmFetch(window.location.href, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: 30000,
      });
      const html = await response.text();
      const uid = extractAuthorUserIdFromHtml(html, normalized);
      if (uid) {
        Logger.info('Resolved author API identifier: ' + uid);
        return uid;
      }
    } catch { }

    return normalized;
  }

  async function fetchAuthorProfile(identifier) {
    const resolved = await resolveAuthorApiIdentifier(identifier);
    const url = API_BASE + '/users/' + resolved + '?params=' + encodeURIComponent(JSON.stringify({ withProfile: false }));
    try {
      const data = await fetchJSON(url);
      if (data && typeof data === 'object') {
        data.__resolvedAuthor = resolved;
      }
      return data;
    } catch (err) {
      Logger.warn('Could not fetch author profile: ' + err.message);
      return null;
    }
  }

  async function fetchCatalogForIdentifier(identifier, onProgress) {
    const PAGE_SIZE = 500;
    let page = 1;
    let allItems = [];
    let totalExpected = null;

    Logger.info('Fetching story catalog for: ' + identifier);

    while (true) {
      const params = JSON.stringify({ page, pageSize: PAGE_SIZE, type: 'story', listType: 'expanded' });
      const url = API_BASE + '/users/' + identifier + '/series_and_works?params=' + encodeURIComponent(params);

      Logger.info('Fetching catalog page ' + page + '...');

      let data;
      try {
        data = await fetchJSON(url);
      } catch (err) {
        Logger.error('Failed to fetch catalog page ' + page + ': ' + err.message);
        if (page === 1) throw err;
        Logger.warn('Continuing with partial catalog after page ' + page + ' failure');
        break;
      }

      // Handle response structure
      const items = data.submissions || data.works || data.data || data.stories || [];
      if (items.length === 0) break;

      if (totalExpected === null && data.total !== undefined) {
        totalExpected = data.total;
      }

      allItems = allItems.concat(items);

      if (onProgress) onProgress(allItems.length, totalExpected);

      Logger.info('Fetched ' + allItems.length + (totalExpected ? ' of ' + totalExpected : '') + ' entries');

      // Check if we have more pages
      const hasMore = data.hasNextPage || data.has_more || (totalExpected && allItems.length < totalExpected) || items.length === PAGE_SIZE;
      if (!hasMore || items.length < PAGE_SIZE) break;

      page++;
    }

    Logger.success('Catalog complete: ' + allItems.length + ' entries fetched');
    return allItems;
  }

  async function fetchAuthorCatalog(identifier, onProgress) {
    const resolved = await resolveAuthorApiIdentifier(identifier);
    return fetchCatalogForIdentifier(resolved, onProgress);
  }

  function titleFromCategorySlug(slug) {
    if (!slug) return 'Unknown';
    return String(slug)
      .split('-')
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  function buildAuthorWorksUrl(author, mode) {
    const safeAuthor = encodeURIComponent(String(author || '').trim());
    const base = window.location.origin + '/authors/' + safeAuthor + '/works/stories';
    if (mode === 'all') return base + '/all';
    return base;
  }

  function extractCatalogFromDocument(doc, author) {
    const items = [];
    const seen = new Set();
    const authorName = doc.querySelector('meta[property="profile:username"]')?.getAttribute('content')
      || doc.querySelector('meta[name="author"]')?.getAttribute('content')
      || author;

    const cards = Array.from(doc.querySelectorAll('[role="article"]'));
    cards.forEach(card => {
      const link = card.querySelector('a[href*="/s/"]');
      if (!link) return;

      const slug = extractStorySlug(link.getAttribute('href') || link.href || '');
      const title = (link.textContent || '').trim();
      if (!slug || !title || seen.has(slug)) return;
      seen.add(slug);

      const description = (card.querySelector('p')?.textContent || '').trim();
      const categoryLink = card.querySelector('a[href*="/c/"], a[href*="/categories/"]');
      const categoryHref = categoryLink?.getAttribute('href') || categoryLink?.href || '';
      const categorySlug = categoryHref ? extractStorySlug(categoryHref) : '';
      const category = (categoryLink?.textContent || '').trim() || titleFromCategorySlug(categorySlug);
      const text = card.textContent || '';
      const dateMatch = text.match(/\\b\\d{1,2}\\/\\d{1,2}\\/\\d{4}\\b/);
      const ratingMatch = text.match(/\\b([0-4]\\.\\d{1,2}|5(?:\\.0{1,2})?)\\b/);

      items.push({
        id: slug,
        slug,
        url: slug,
        title,
        description,
        category: category || 'Unknown',
        categorySlug,
        rating: ratingMatch ? parseFloat(ratingMatch[1]) : 0,
        voteCount: 0,
        views: 0,
        date: dateMatch ? dateMatch[0] : '',
        dateFormatted: dateMatch ? dateMatch[0] : '',
        pageCount: 1,
        seriesId: null,
        seriesTitle: null,
        seriesIndex: 0,
        isSeries: false,
        chapters: null,
        author: author,
        authorName,
        wordCount: 0,
        hot: false,
      });
    });

    return { authorName, items };
  }

  async function fetchCatalogFromCurrentPage(author, onProgress) {
    let parsed = extractCatalogFromDocument(document, author);
    if (parsed.items.length > 0 && onProgress) {
      onProgress(parsed.items.length, parsed.items.length);
    }

    Logger.info('Fetching full author listing from /all page...');
    const response = await gmFetch(buildAuthorWorksUrl(author, 'all'), {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 30000,
    });
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    parsed = extractCatalogFromDocument(doc, author);
    if (onProgress && parsed.items.length > 0) {
      onProgress(parsed.items.length, parsed.items.length);
    }
    return parsed;
  }

  // ============================================================
  // PHASE 3: SERIES GROUPING LOGIC
  // ============================================================

  function normalizeStory(raw) {
    // Handle both flat stories and series entries
    const story = {
      id: raw.id || raw.url || raw.slug,
      slug: raw.url || raw.slug || raw.id,
      title: raw.title || 'Untitled',
      description: raw.description || raw.meta_description || '',
      category: raw.category_info?.pageTitle || raw.category || 'Unknown',
      categorySlug: raw.category_info?.url || raw.category_url || '',
      rating: parseFloat(raw.rate || raw.rating || raw.voteTotal || 0),
      voteCount: parseInt(raw.total_votes || raw.vote_count || raw.voteCount || 0, 10),
      views: parseInt(raw.view_count || raw.views || raw.totalPageViews || 0, 10),
      date: raw.date_approve || raw.publishDate || raw.date || '',
      dateFormatted: raw.date_approve ? new Date(raw.date_approve * 1000).toLocaleDateString() : (raw.date || ''),
      pageCount: parseInt(raw.meta_pages || raw.pages || raw.page_count || 1, 10),
      seriesId: raw.series?.id || raw.seriesId || null,
      seriesTitle: raw.series?.title || raw.seriesTitle || null,
      seriesIndex: parseInt(raw.series_number || raw.chapterIndex || raw.series_index || 0, 10),
      isSeries: !!(raw.series_works || raw.chapters || raw.works),
      chapters: raw.series_works || raw.chapters || raw.works || null,
      author: raw.author?.username || raw.authorname || '',
      authorName: raw.author?.name || raw.author_name || raw.authorname || '',
      wordCount: parseInt(raw.words || raw.word_count || 0, 10),
      hot: raw.rate_view_hot || raw.hot || false,
    };

    // If this is a series container, normalize its chapters
    if (story.isSeries && story.chapters) {
      story.chapters = story.chapters.map((ch, i) => normalizeStory({ ...ch, series: { id: story.id, title: story.title }, seriesIndex: i + 1 }));
    }

    return story;
  }

  function groupStories(rawItems) {
    const standalones = [];
    const seriesMap = new Map();

    rawItems.forEach(raw => {
      const story = normalizeStory(raw);

      if (story.isSeries && story.chapters && story.chapters.length > 0) {
        // This is a series parent
        const series = {
          id: story.id,
          title: story.title,
          description: story.description,
          category: story.category,
          rating: story.rating,
          date: story.date,
          dateFormatted: story.dateFormatted,
          author: story.author,
          authorName: story.authorName,
          isSeries: true,
          chapters: story.chapters.sort((a, b) => a.seriesIndex - b.seriesIndex),
          pageCount: story.chapters.reduce((s, c) => s + c.pageCount, 0),
        };
        seriesMap.set(story.id, series);
      } else if (story.seriesId) {
        // Chapter belonging to a series
        if (!seriesMap.has(story.seriesId)) {
          seriesMap.set(story.seriesId, {
            id: story.seriesId,
            title: story.seriesTitle || 'Unknown Series',
            description: '',
            category: story.category,
            rating: 0,
            date: story.date,
            dateFormatted: story.dateFormatted,
            author: story.author,
            authorName: story.authorName,
            isSeries: true,
            chapters: [],
            pageCount: 0,
          });
        }
        const series = seriesMap.get(story.seriesId);
        // Avoid duplicates
        if (!series.chapters.find(c => c.id === story.id)) {
          series.chapters.push(story);
          series.pageCount += story.pageCount;
          // Update series rating as max
          if (story.rating > series.rating) series.rating = story.rating;
        }
      } else {
        standalones.push(story);
      }
    });

    // Sort series chapters
    seriesMap.forEach(series => {
      series.chapters.sort((a, b) => a.seriesIndex - b.seriesIndex);
    });

    return {
      standalones: standalones.sort((a, b) => (b.date || '') > (a.date || '') ? 1 : -1),
      series: Array.from(seriesMap.values()).sort((a, b) => (b.date || '') > (a.date || '') ? 1 : -1),
    };
  }

  // ============================================================
  // PHASE 5: STORY CONTENT FETCHING
  // ============================================================

  async function fetchStoryContent(story, signal) {
    const slug = story.slug;
    const pages = [];
    let totalPages = story.pageCount || 1;
    let successfulPages = 0;

    function buildStoryPageUrl(pageNum) {
      const base = window.location.origin + '/s/' + slug;
      return pageNum > 1 ? base + '?page=' + pageNum : base;
    }

    function decodeEmbeddedString(value) {
      if (!value) return '';
      try {
        return JSON.parse('"' + value + '"');
      } catch {
        const slash = String.fromCharCode(92);
        const newline = String.fromCharCode(10);
        return value
          .split(slash + 'r' + slash + 'n').join(newline)
          .split(slash + 'n').join(newline)
          .split(slash + '"').join('"')
          .split(slash + slash).join(slash);
      }
    }

    function extractPagePayload(html, pageNum) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const pageTextMarker = 'pageText:"';
      const pageTextStart = html.indexOf(pageTextMarker);
      let pageTextValue = '';
      const slash = String.fromCharCode(92);

      if (pageTextStart !== -1) {
        let idx = pageTextStart + pageTextMarker.length;
        while (idx < html.length) {
          const ch = html.charAt(idx);
          if (ch === '"') break;
          if (ch === slash && idx + 1 < html.length) {
            pageTextValue += ch + html.charAt(idx + 1);
            idx += 2;
            continue;
          }
          pageTextValue += ch;
          idx++;
        }
      }

      const title = doc.querySelector('meta[property="og:title"]')?.getAttribute('content')
        || doc.title
        || story.title;

      const pageLinks = Array.from(doc.querySelectorAll('a[href*="?page="]'))
        .map(link => {
          const href = link.getAttribute('href') || link.href || '';
          const match = href.match(new RegExp('[?&]page=(\\\\d+)'));
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter(Boolean);

      const detectedTotalPages = pageLinks.length ? Math.max(pageNum, ...pageLinks) : 1;

      return {
        text: pageTextValue ? decodeEmbeddedString(pageTextValue) : '',
        title,
        totalPages: detectedTotalPages,
      };
    }

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      throwIfAborted(signal);
      const url = buildStoryPageUrl(pageNum);

      Logger.info('Fetching: ' + story.title + ' (page ' + pageNum + '/' + totalPages + ')');

      try {
        const response = await gmFetch(url, {
          headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
          timeout: 30000,
          signal,
        });

        if (response.status === 404) {
          throw new Error('Not found (404): ' + url);
        }
        if (!response.ok) {
          throw new Error('HTTP ' + response.status + ' for ' + url);
        }

        const html = await response.text();
        throwIfAborted(signal);
        const payload = extractPagePayload(html, pageNum);
        if (!payload.text) {
          throw new Error('No pageText found in story HTML: ' + url);
        }

        if (pageNum === 1) {
          totalPages = payload.totalPages || story.pageCount || 1;
        }

        successfulPages++;
        pages.push({
          pageNum,
          text: payload.text,
          title: payload.title || (totalPages > 1 ? 'Page ' + pageNum : story.title),
        });
      } catch (err) {
        if (isAbortError(err)) throw err;
        Logger.error('Failed page ' + pageNum + ' of "' + story.title + '": ' + err.message);
        if (pageNum === 1) {
          throw err;
        }
        pages.push({ pageNum, text: '[Error fetching this page: ' + err.message + ']', title: 'Page ' + pageNum });
      }
    }

    if (successfulPages === 0) {
      throw new Error('No story pages could be fetched for "' + story.title + '"');
    }

    return {
      ...story,
      pages,
      totalPages,
    };
  }

  function buildExportGroups(downloadedStories) {
    const groups = [];
    const seriesMap = new Map();

    downloadedStories.forEach(story => {
      if (story.seriesId) {
        if (!seriesMap.has(story.seriesId)) {
          seriesMap.set(story.seriesId, {
            id: story.seriesId,
            title: story.seriesTitle || story.title,
            author: story.author,
            authorName: story.authorName,
            category: story.category,
            rating: story.rating || 0,
            date: story.date,
            dateFormatted: story.dateFormatted,
            description: story.description || '',
            slug: story.slug,
            isSeries: true,
            stories: [],
          });
        }

        const group = seriesMap.get(story.seriesId);
        group.stories.push(story);
        if (story.rating > group.rating) group.rating = story.rating;
        if (!group.description && story.description) group.description = story.description;
      } else {
        groups.push({
          id: story.id,
          title: story.title,
          author: story.author,
          authorName: story.authorName,
          category: story.category,
          rating: story.rating,
          date: story.date,
          dateFormatted: story.dateFormatted,
          description: story.description || '',
          slug: story.slug,
          isSeries: false,
          stories: [story],
        });
      }
    });

    seriesMap.forEach(group => {
      group.stories.sort((a, b) => (a.seriesIndex || 0) - (b.seriesIndex || 0));
      groups.push(group);
    });

    return groups.sort((a, b) => (b.date || '') > (a.date || '') ? 1 : -1);
  }

  function buildSelectedCollectionGroup(author, authorName, downloadedStories) {
    const sortedStories = downloadedStories.slice().sort((a, b) => {
      if (a.seriesId && b.seriesId && a.seriesId === b.seriesId) {
        return (a.seriesIndex || 0) - (b.seriesIndex || 0);
      }
      return (b.date || '') > (a.date || '') ? 1 : -1;
    });

    const lead = sortedStories[0] || {};
    return {
      id: 'selected-collection',
      title: (authorName || author || 'Author') + ' - Selected Stories',
      author: author,
      authorName: authorName,
      category: '',
      rating: 0,
      date: lead.date || '',
      dateFormatted: lead.dateFormatted || '',
      description: 'Combined export of selected stories.',
      slug: '',
      isSeries: false,
      stories: sortedStories,
    };
  }

  // ============================================================
  // PHASE 6: HTML BUILDER
  // ============================================================

  const HTMLBuilder = (() => {
    const studioUrl = 'https://studios.easyspace.in';
    const studioName = 'Easy Space Studios';

    function getDownloadedDate() {
      return new Date().toLocaleDateString();
    }

    function buildFooterPlainText() {
      return 'Downloaded with Literotica Downloader • '
        + getDownloadedDate()
        + ' from '
        + studioName
        + ' @ '
        + studioUrl;
    }

    function buildDownloadFooter() {
      return '<footer class="download-footer">Downloaded with Literotica Downloader • '
        + escapeHtml(getDownloadedDate())
        + ' from <a href="'
        + studioUrl
        + '" target="_blank" rel="noopener noreferrer">'
        + studioName
        + '</a></footer>';
    }

    function buildDownloadFooterXHTML() {
      return '<p class="download-footer">Downloaded with Literotica Downloader &#8226; '
        + escapeHtml(getDownloadedDate())
        + ' from <a href="'
        + studioUrl
        + '">'
        + studioName
        + '</a></p>';
    }

    function sanitizeFilename(str) {
      return str
        .replace(/[<>:"/\\\\|?*]/g, '')
        .replace(/\\s+/g, '_')
        .replace(/_+/g, '_')
        .trim()
        .substring(0, 100);
    }

    function formatRating(rating) {
      if (!rating || rating === 0) return 'Not rated';
      return rating.toFixed(2) + ' / 5.00';
    }

    function escapeHtml(str) {
      if (!str) return '';
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function processPageText(text) {
      if (!text) return '<p><em>[No content]</em></p>';
      // The API returns HTML content in pageText
      // Sanitize but preserve paragraph structure
      return text
        .replace(/<script[\\s\\S]*?<\\/script>/gi, '')
        .replace(/<style[\\s\\S]*?<\\/style>/gi, '')
        .replace(/on\\w+="[^"]*"/gi, '')
        .replace(/on\\w+='[^']*'/gi, '')
        || '<p>' + escapeHtml(text) + '</p>';
    }

    function storyFilename(storyData) {
      if (storyData.seriesId) {
        const seriesTitle = storyData.seriesTitle || 'Series';
        const chapterIndex = String(storyData.seriesIndex || 0).padStart(2, '0');
        return sanitizeFilename(seriesTitle + '_ch' + chapterIndex + '_' + storyData.title);
      }
      return sanitizeFilename(storyData.title);
    }

    function groupFilename(group) {
      return sanitizeFilename(group.title || 'collection');
    }

    function readingCSS() {
      return \`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: Georgia, 'Times New Roman', serif;
          font-size: 1.1rem;
          line-height: 1.8;
          color: #1a1a1a;
          background: #fafaf8;
          max-width: 760px;
          margin: 0 auto;
          padding: 2rem 1.5rem 4rem;
        }
        .story-section + .story-section,
        .story-separator {
          margin-top: 3rem;
        }
        .story-separator {
          border-top: 2px solid #ddd7cf;
          padding-top: 2rem;
        }
        .story-kicker {
          font-family: system-ui, sans-serif;
          font-size: 0.8rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #6c6257;
          margin-bottom: 0.75rem;
        }
        .story-title {
          font-size: 1.9rem;
          line-height: 1.3;
          color: #121212;
          margin-bottom: 1.5rem;
        }
        .story-section h2.story-title {
          font-size: 1.45rem;
        }
        .page-separator {
          text-align: center;
          margin: 2rem 0;
          color: #8e877f;
          font-family: system-ui, sans-serif;
          font-size: 0.8rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .page-separator::before,
        .page-separator::after {
          content: '—';
          margin: 0 0.5rem;
        }
        .story-content p { margin-bottom: 1.2rem; }
        .story-content { orphans: 3; widows: 3; }
        .download-footer {
          margin-top: 3rem;
          padding-top: 1rem;
          border-top: 1px solid #ddd7cf;
          color: #6c6257;
          font-family: system-ui, sans-serif;
          font-size: 0.9rem;
        }
        .download-footer a {
          color: #8b1538;
          text-decoration: none;
        }
        .download-footer a:hover {
          text-decoration: underline;
        }
        @media print {
          body { background: white; padding: 0; max-width: none; }
        }
      \`;
    }

    function buildStoryBody(storyData, options = {}) {
      const showStoryTitle = options.showStoryTitle !== false;
      const titleTag = options.titleTag || 'h1';
      const chapterLabel = options.chapterLabel || '';
      const pages = storyData.pages || [];
      const heading = showStoryTitle
        ? '<' + titleTag + ' class="story-title">' + escapeHtml(storyData.title) + '</' + titleTag + '>'
        : '';
      const label = chapterLabel ? '<p class="story-kicker">' + escapeHtml(chapterLabel) + '</p>' : '';
      const pagesHTML = pages.map((pg, i) => \`
        \${i > 0 ? '<div class="page-separator">Page ' + pg.pageNum + '</div>' : ''}
        <div class="story-content" id="page-\${pg.pageNum}">\${processPageText(pg.text)}</div>
      \`).join('');

      return \`
        <section class="story-section">
          \${label}
          \${heading}
          \${pagesHTML}
        </section>
      \`;
    }

    function buildStoryHTML(storyData) {
      return \`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>\${escapeHtml(storyData.title)}</title>
  <style>\${readingCSS()}</style>
</head>
<body>
  \${buildStoryBody(storyData)}
  \${buildDownloadFooter()}
</body>
</html>\`;
    }

    function buildCombinedHTML(group) {
      const storiesHTML = group.stories.map((storyData, index) => {
        const chapterLabel = group.isSeries ? 'Chapter ' + (index + 1) : '';
        const titleTag = group.isSeries ? 'h2' : 'h1';
        return \`\${index > 0 ? '<div class="story-separator"></div>' : ''}\${buildStoryBody(storyData, { chapterLabel, titleTag })}\`;
      }).join('');

      return \`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>\${escapeHtml(group.title)}</title>
  <style>\${readingCSS()}</style>
</head>
<body>
  \${storiesHTML}
  \${buildDownloadFooter()}
</body>
</html>\`;
    }

    function buildIndexHTML(author, authorName, manifestEntries, exportMode) {
      const css = \`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: system-ui, -apple-system, sans-serif; background: #0f0f14; color: #e0e0e8; min-height: 100vh; }
        .header { background: linear-gradient(135deg, #1a0a24, #0a1a2e); padding: 3rem 2rem; text-align: center; border-bottom: 1px solid #2a2a3a; }
        .header h1 { font-size: 2.5rem; font-weight: 700; color: #f0e8ff; margin-bottom: 0.5rem; }
        .header .sub { color: #a0a0b8; font-size: 1rem; }
        .header .stats { margin-top: 1.5rem; display: flex; gap: 2rem; justify-content: center; flex-wrap: wrap; }
        .stat { background: rgba(255,255,255,0.05); padding: 0.75rem 1.5rem; border-radius: 8px; text-align: center; }
        .stat .num { font-size: 1.8rem; font-weight: 700; color: #b48cf0; }
        .stat .label { font-size: 0.75rem; color: #888; text-transform: uppercase; letter-spacing: 0.05em; }
        .container { max-width: 900px; margin: 0 auto; padding: 2rem; }
        .story-card { background: #1a1a24; border: 1px solid #2a2a3a; border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 0.75rem; transition: border-color 0.2s; }
        .story-card:hover { border-color: #6a4a9a; }
        .story-card h2 { color: #f0e8ff; font-size: 1rem; margin-bottom: 0.5rem; }
        .story-meta { font-size: 0.8rem; color: #666; margin-top: 0.25rem; display: flex; gap: 0.75rem; flex-wrap: wrap; }
        .story-meta span { color: #888; }
        .story-meta .rating { color: #f0c040; }
        .file-links { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 0.85rem; }
        .file-links a { color: #b48cf0; text-decoration: none; font-weight: 500; font-size: 0.9rem; }
        .file-links a:hover { color: #d4b0ff; text-decoration: underline; }
        .footer { text-align: center; padding: 2rem; color: #444; font-size: 0.8rem; border-top: 1px solid #1a1a24; margin-top: 2rem; }
        .footer a { color: #b48cf0; text-decoration: none; }
        .footer a:hover { text-decoration: underline; }
      \`;
      const entriesHTML = manifestEntries.map(entry => \`
        <div class="story-card">
          <h2>\${escapeHtml(entry.title)}</h2>
            <div class="story-meta">
              <span>\${entry.kind === 'series' ? 'Series' : 'Story'}</span>
              \${entry.category ? '<span>' + escapeHtml(entry.category) + '</span>' : ''}
              \${entry.rating > 0 ? '<span class="rating">★ ' + entry.rating.toFixed(2) + '</span>' : ''}
              \${entry.dateFormatted ? '<span>' + escapeHtml(entry.dateFormatted) + '</span>' : ''}
              \${entry.parts ? '<span>' + entry.parts + ' format' + (entry.parts !== 1 ? 's' : '') + '</span>' : ''}
            </div>
          <div class="file-links">
            \${entry.html ? '<a href="' + entry.html + '">HTML</a>' : ''}
            \${entry.epub ? '<a href="' + entry.epub + '">EPUB</a>' : ''}
            \${entry.txt ? '<a href="' + entry.txt + '">TXT</a>' : ''}
          </div>
        </div>
      \`).join('');

      return \`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>\${escapeHtml(authorName || author)} — Literotica Collection</title>
  <style>\${css}</style>
</head>
<body>
  <div class="header">
    <h1>📚 \${escapeHtml(authorName || author)}</h1>
    <p class="sub">Literotica Author Collection • \${exportMode === 'combined' ? 'Combined files' : 'Separate chapter files'}</p>
    <div class="stats">
      <div class="stat"><div class="num">\${manifestEntries.length}</div><div class="label">Exported Entries</div></div>
      <div class="stat"><div class="num">\${manifestEntries.filter(entry => entry.kind === 'series').length}</div><div class="label">Series</div></div>
      <div class="stat"><div class="num">\${manifestEntries.filter(entry => entry.kind === 'story').length}</div><div class="label">Stories</div></div>
    </div>
  </div>
  <div class="container">
    \${entriesHTML}
  </div>
  <div class="footer">Downloaded with Literotica Downloader • \${getDownloadedDate()} from <a href="\${studioUrl}" target="_blank" rel="noopener noreferrer">\${studioName}</a></div>
</body>
</html>\`;
    }

    return {
      buildStoryHTML,
      buildCombinedHTML,
      buildIndexHTML,
      buildDownloadFooter,
      buildDownloadFooterXHTML,
      buildFooterPlainText,
      sanitizeFilename,
      escapeHtml,
      storyFilename,
      groupFilename
    };
  })();

  const TextBuilder = (() => {
    const NEWLINE = String.fromCharCode(10);

    function cleanHtml(text) {
      return String(text || '')
        .replace(/<script[\\s\\S]*?<\\/script>/gi, '')
        .replace(/<style[\\s\\S]*?<\\/style>/gi, '')
        .replace(/on\\w+="[^"]*"/gi, '')
        .replace(/on\\w+='[^']*'/gi, '');
    }

    function htmlToText(text) {
      const container = document.createElement('div');
      container.innerHTML = cleanHtml(text);
      const parts = [];

      function visit(node) {
        if (!node) return;
        if (node.nodeType === Node.TEXT_NODE) {
          parts.push(node.nodeValue || '');
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;

        const tag = node.tagName.toLowerCase();
        if (tag === 'br') {
          parts.push(NEWLINE);
          return;
        }

        const blockTags = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'blockquote', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
        const isBlock = blockTags.has(tag);
        if (isBlock && parts.length > 0) parts.push(NEWLINE);
        if (tag === 'li') parts.push('- ');

        Array.from(node.childNodes).forEach(visit);

        if (isBlock) parts.push(NEWLINE);
      }

      Array.from(container.childNodes).forEach(visit);
      return normalizePlainText(parts.join(''));
    }

    function normalizePlainText(text) {
      const lines = String(text || '').split(NEWLINE);
      const result = [];
      let previousBlank = false;

      lines.forEach(line => {
        const cleanedLine = line.replace(/[ \t]+$/g, '');
        const isBlank = cleanedLine.trim() === '';
        if (isBlank) {
          if (!previousBlank && result.length > 0) result.push('');
          previousBlank = true;
          return;
        }
        result.push(cleanedLine);
        previousBlank = false;
      });

      return result.join(NEWLINE).trim();
    }

    function buildTextFooter() {
      return [
        '==================================================',
        HTMLBuilder.buildFooterPlainText(),
        '=================================================='
      ].join(NEWLINE);
    }

    function buildStoryText(storyData, options = {}) {
      const showStoryTitle = options.showStoryTitle !== false;
      const chapterLabel = options.chapterLabel || '';
      const includeFooter = options.includeFooter !== false;
      const parts = [];

      if (chapterLabel) parts.push(chapterLabel);
      if (showStoryTitle) parts.push(storyData.title);

      (storyData.pages || []).forEach((page, index) => {
        if (index > 0) parts.push('Page ' + page.pageNum);
        parts.push(htmlToText(page.text));
      });

      if (includeFooter) {
        parts.push(buildTextFooter());
      }

      return normalizePlainText(parts.join(NEWLINE + NEWLINE));
    }

    function buildCombinedText(group) {
      const sections = group.stories.map((storyData, index) => {
        const chapterLabel = group.isSeries ? 'Chapter ' + (index + 1) : '';
        return buildStoryText(storyData, { chapterLabel, showStoryTitle: true, includeFooter: false });
      });
      return normalizePlainText(
        sections.join(NEWLINE + NEWLINE + '==================================================' + NEWLINE + NEWLINE)
        + NEWLINE + NEWLINE
        + buildTextFooter()
      );
    }

    return { buildStoryText, buildCombinedText };
  })();

  // ============================================================
  // PHASE 7: EPUB BUILDER
  // ============================================================

  const EPUBBuilder = (() => {
    function generateUUID() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }

    function makeSlug(str) {
      return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 60);
    }

    function processPageTextEPUB(text) {
      if (!text) return '<p><em>[No content available]</em></p>';
      let processed = text
        .replace(/<script[\\s\\S]*?<\\/script>/gi, '')
        .replace(/<style[\\s\\S]*?<\\/style>/gi, '')
        .replace(/on\\w+="[^"]*"/gi, '')
        .replace(/on\\w+='[^']*'/gi, '');
      if (!processed.trim().startsWith('<')) {
        processed = processed.split('\\n\\n').map(p => '<p>' + p.replace(/\\n/g, '<br/>') + '</p>').join('\\n');
      }
      return processed;
    }

    function buildStorySectionBody(storyData, options = {}) {
      const showStoryTitle = options.showStoryTitle !== false;
      const chapterLabel = options.chapterLabel || '';
      const headingTag = options.headingTag || 'h1';
      const includeFooter = options.includeFooter !== false;
      const pages = storyData.pages || [];
      const titleHtml = showStoryTitle ? '<' + headingTag + '>' + HTMLBuilder.escapeHtml(storyData.title) + '</' + headingTag + '>' : '';
      const labelHtml = chapterLabel ? '<p class="section-label">' + HTMLBuilder.escapeHtml(chapterLabel) + '</p>' : '';
      const pagesHTML = pages.map((pg, index) => {
        const pageLabel = index > 0 ? '<h2>Page ' + pg.pageNum + '</h2>' : '';
        return pageLabel + processPageTextEPUB(pg.text);
      }).join('\\n');
      const footerHtml = includeFooter ? HTMLBuilder.buildDownloadFooterXHTML() : '';
      return labelHtml + titleHtml + pagesHTML + footerHtml;
    }

    async function buildEPUBBook(book) {
      const zip = new JSZip();
      const uid = generateUUID();
      const { title, author, authorName, category, description, sections, slug, dateISO } = book;
      const safeTitle = HTMLBuilder.escapeHtml(title);
      const safeAuthor = HTMLBuilder.escapeHtml(authorName || author);

      // mimetype (must be first, uncompressed)
      zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

      // META-INF/container.xml
      zip.file('META-INF/container.xml', \`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:schemas:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>\`);

      // Title page
      const coverXHTML = \`<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>\${safeTitle}</title>
  <style type="text/css">
    body { margin: 0; padding: 0; background: #fafaf8; color: #1a1a1a; font-family: Georgia, serif; }
    .cover { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 3rem 2rem; text-align: center; }
    h1 { font-size: 2.2em; color: #121212; margin-bottom: 1rem; line-height: 1.3; }
    .by { font-size: 1.1em; color: #555; margin-bottom: 1rem; }
    .desc { font-style: italic; color: #666; margin-top: 1rem; font-size: 0.95em; max-width: 480px; }
  </style>
</head>
<body>
  <div class="cover">
    <h1>\${safeTitle}</h1>
    <p class="by">by \${safeAuthor}</p>
    \${description ? '<p class="desc">' + HTMLBuilder.escapeHtml(description) + '</p>' : ''}
  </div>
</body>
</html>\`;

      zip.file('OEBPS/cover.xhtml', coverXHTML);

      // Content sections
      const chapterFiles = [];
      sections.forEach((section, i) => {
        const id = 'section-' + String(i + 1).padStart(3, '0');
        const filename = 'section' + String(i + 1).padStart(3, '0') + '.xhtml';

        const xhtml = \`<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>\${HTMLBuilder.escapeHtml(section.title)}</title>
  <style type="text/css">
    body { font-family: Georgia, 'Times New Roman', serif; font-size: 1em; line-height: 1.8; color: #1a1a1a; margin: 1.5em 2em; }
    p { margin-bottom: 1em; text-indent: 1.5em; }
    p:first-child { text-indent: 0; }
    h1, h2 { color: #444; margin: 1.5em 0 0.5em; }
    .section-label { font-size: 0.8em; letter-spacing: 0.08em; text-transform: uppercase; color: #666; margin-bottom: 1em; }
    .download-footer { margin-top: 2.5em; padding-top: 1em; border-top: 1px solid #d8d1c8; color: #666; font-size: 0.9em; }
    .download-footer a { color: #8b1538; text-decoration: none; }
  </style>
</head>
<body>
  \${section.body}
</body>
</html>\`;

        zip.file('OEBPS/' + filename, xhtml);
        chapterFiles.push({ id, filename, title: section.title });
      });

      // content.opf
      const manifestItems = [
        '<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>',
        ...chapterFiles.map(c => \`<item id="\${c.id}" href="\${c.filename}" media-type="application/xhtml+xml"/>\`)
      ].join('\\n    ');

      const spineItems = [
        '<itemref idref="cover"/>',
        ...chapterFiles.map(c => \`<itemref idref="\${c.id}"/>\`)
      ].join('\\n    ');

      const opf = \`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="BookId">urn:uuid:\${uid}</dc:identifier>
    <dc:title>\${safeTitle}</dc:title>
    <dc:creator opf:role="aut">\${safeAuthor}</dc:creator>
    <dc:subject>\${HTMLBuilder.escapeHtml(category)}</dc:subject>
    <dc:description>\${HTMLBuilder.escapeHtml(description)}</dc:description>
    <dc:publisher>Literotica Downloader V2</dc:publisher>
    <dc:date>\${dateISO}</dc:date>
    <dc:language>en</dc:language>
    \${slug ? '<dc:source>https://www.literotica.com/s/' + slug + '</dc:source>' : ''}
    <meta name="cover" content="cover"/>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    \${manifestItems}
  </manifest>
  <spine toc="ncx">
    \${spineItems}
  </spine>
</package>\`;

      zip.file('OEBPS/content.opf', opf);

      // toc.ncx
      const navPoints = [
        \`<navPoint id="cover" playOrder="1"><navLabel><text>Cover</text></navLabel><content src="cover.xhtml"/></navPoint>\`,
        ...chapterFiles.map((c, i) => \`<navPoint id="\${c.id}" playOrder="\${i + 2}"><navLabel><text>\${HTMLBuilder.escapeHtml(c.title)}</text></navLabel><content src="\${c.filename}"/></navPoint>\`)
      ].join('\\n    ');

      const ncx = \`<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:\${uid}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>\${safeTitle}</text></docTitle>
  <navMap>
    \${navPoints}
  </navMap>
</ncx>\`;

      zip.file('OEBPS/toc.ncx', ncx);

      return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
    }

    async function buildEPUB(storyData) {
      return buildEPUBBook({
        title: storyData.title,
        author: storyData.author,
        authorName: storyData.authorName,
        category: storyData.category,
        description: storyData.description || '',
        slug: storyData.slug,
        dateISO: storyData.date ? new Date(storyData.date * 1000).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        sections: [{
          title: storyData.title,
          body: buildStorySectionBody(storyData, { showStoryTitle: false }),
        }],
      });
    }

    async function buildCombinedEPUB(group) {
      return buildEPUBBook({
        title: group.title,
        author: group.author,
        authorName: group.authorName,
        category: group.category,
        description: group.description || '',
        slug: group.slug,
        dateISO: group.date ? new Date(group.date * 1000).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        sections: group.stories.map((storyData, index) => ({
          title: group.isSeries ? 'Chapter ' + (index + 1) + ': ' + storyData.title : storyData.title,
          body: buildStorySectionBody(storyData, {
            showStoryTitle: true,
            headingTag: group.isSeries ? 'h2' : 'h1',
            chapterLabel: group.isSeries ? 'Chapter ' + (index + 1) : '',
          }),
        })),
      });
    }

    return { buildEPUB, buildCombinedEPUB };
  })();

  // ============================================================
  // PHASE 8: ZIP PACKAGE GENERATOR
  // ============================================================

  const ZIPBuilder = (() => {
    async function buildCollection(author, authorName, downloadedStories, selectedFormats, exportMode, onProgress, errors, shouldCancel) {
      const zip = new JSZip();
      const htmlFolder = selectedFormats.html ? zip.folder('html') : null;
      const epubFolder = selectedFormats.epub ? zip.folder('epub') : null;
      const txtFolder = selectedFormats.txt ? zip.folder('txt') : null;
      const exportGroups = exportMode === 'combined'
        ? [buildSelectedCollectionGroup(author, authorName, downloadedStories)]
        : buildExportGroups(downloadedStories);

      const manifest = {
        generated: new Date().toISOString(),
        author: author,
        authorName: authorName,
        totalStories: downloadedStories.length,
        formats: selectedFormats,
        exportMode: exportMode,
        entries: [],
      };

      let processed = 0;
      const errorLog = [...errors];
      const selectedFormatCount = ['html', 'epub', 'txt'].filter(fmt => !!selectedFormats[fmt]).length;

      for (const group of exportGroups) {
        if (shouldCancel && shouldCancel()) {
          throw makeAbortError();
        }
        processed++;
        if (onProgress) onProgress(processed, exportGroups.length, group.title);

        try {
          if (exportMode === 'combined') {
            const entry = {
              title: group.title,
              slug: group.slug,
              kind: group.isSeries ? 'series' : 'story',
              category: group.category,
              rating: group.rating,
              dateFormatted: group.dateFormatted,
              parts: selectedFormatCount,
            };

            if (selectedFormats.html && htmlFolder) {
              if (shouldCancel && shouldCancel()) throw makeAbortError();
              const filename = HTMLBuilder.groupFilename(group) + '.html';
              const html = group.stories.length === 1 ? HTMLBuilder.buildStoryHTML(group.stories[0]) : HTMLBuilder.buildCombinedHTML(group);
              htmlFolder.file(filename, html);
              entry.html = 'html/' + filename;
            }

            if (selectedFormats.epub && epubFolder) {
              if (shouldCancel && shouldCancel()) throw makeAbortError();
              Logger.info('Generating combined EPUB: ' + group.title);
              const epubBlob = group.stories.length === 1
                ? await EPUBBuilder.buildEPUB(group.stories[0])
                : await EPUBBuilder.buildCombinedEPUB(group);
              const arrayBuffer = await epubBlob.arrayBuffer();
              const filename = HTMLBuilder.groupFilename(group) + '.epub';
              epubFolder.file(filename, arrayBuffer);
              entry.epub = 'epub/' + filename;
            }

            if (selectedFormats.txt && txtFolder) {
              if (shouldCancel && shouldCancel()) throw makeAbortError();
              const filename = HTMLBuilder.groupFilename(group) + '.txt';
              const text = group.stories.length === 1
                ? TextBuilder.buildStoryText(group.stories[0])
                : TextBuilder.buildCombinedText(group);
              txtFolder.file(filename, text);
              entry.txt = 'txt/' + filename;
            }

            manifest.entries.push(entry);
          } else {
            for (const storyData of group.stories) {
              if (shouldCancel && shouldCancel()) throw makeAbortError();
              const entry = {
                title: group.isSeries ? group.title + ' — ' + storyData.title : storyData.title,
                slug: storyData.slug,
                kind: group.isSeries ? 'series' : 'story',
                category: storyData.category,
                rating: storyData.rating,
                dateFormatted: storyData.dateFormatted,
                parts: selectedFormatCount,
              };

              if (selectedFormats.html && htmlFolder) {
                if (shouldCancel && shouldCancel()) throw makeAbortError();
                const filename = HTMLBuilder.storyFilename(storyData) + '.html';
                htmlFolder.file(filename, HTMLBuilder.buildStoryHTML(storyData));
                entry.html = 'html/' + filename;
              }

              if (selectedFormats.epub && epubFolder) {
                if (shouldCancel && shouldCancel()) throw makeAbortError();
                Logger.info('Generating EPUB: ' + storyData.title);
                const epubBlob = await EPUBBuilder.buildEPUB(storyData);
                const arrayBuffer = await epubBlob.arrayBuffer();
                const filename = HTMLBuilder.storyFilename(storyData) + '.epub';
                epubFolder.file(filename, arrayBuffer);
                entry.epub = 'epub/' + filename;
              }

              if (selectedFormats.txt && txtFolder) {
                if (shouldCancel && shouldCancel()) throw makeAbortError();
                const filename = HTMLBuilder.storyFilename(storyData) + '.txt';
                txtFolder.file(filename, TextBuilder.buildStoryText(storyData));
                entry.txt = 'txt/' + filename;
              }

              manifest.entries.push(entry);
            }
          }
        } catch (err) {
          Logger.error('Export failed for "' + group.title + '": ' + err.message);
          errorLog.push({ story: group.title, error: err.message });
        }
      }

      // Index HTML
      const indexHTML = HTMLBuilder.buildIndexHTML(author, authorName, manifest.entries, exportMode);
      zip.file('index.html', indexHTML);

      // Manifest
      zip.file('manifest.json', JSON.stringify(manifest, null, 2));

      // Errors log
      if (errorLog.length > 0) {
        const errText = errorLog.map(e => '[ERROR] ' + e.story + ': ' + e.error).join('\\n');
        zip.file('errors.log', errText);
      }

      return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    }

    return { buildCollection };
  })();

  // ============================================================
  // STATE MANAGER
  // ============================================================

  const State = (() => {
    let _state = {
      author: null,
      authorName: null,
      authorProfile: null,
      catalog: [],
      grouped: { standalones: [], series: [] },
      selected: new Set(),
      downloading: false,
      cancelRequested: false,
      progress: { current: 0, total: 0, label: '' },
      errors: [],
      filterCategory: 'all',
      filterRating: 0,
      filterType: 'all',
      sortBy: 'date',
      searchQuery: '',
      expandedSeries: new Set(),
    };

    const listeners = new Set();

    function getState() { return { ..._state }; }

    function setState(partial) {
      _state = { ..._state, ...partial };
      listeners.forEach(fn => fn(_state));
    }

    function subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }

    function getFilteredItems() {
      const { grouped, filterCategory, filterRating, filterType, sortBy, searchQuery } = _state;
      const q = searchQuery.toLowerCase();

      function matchesFilters(story) {
        if (q && !story.title.toLowerCase().includes(q)) return false;
        if (filterCategory !== 'all' && story.category !== filterCategory) return false;
        if (filterRating > 0 && story.rating < filterRating) return false;
        return true;
      }

      let items = [];
      if (filterType !== 'series') {
        items = [...items, ...grouped.standalones.filter(matchesFilters).map(s => ({ ...s, _type: 'standalone' }))];
      }
      if (filterType !== 'standalone') {
        grouped.series.forEach(series => {
          const matchingChapters = series.chapters.filter(matchesFilters);
          if (matchingChapters.length > 0 || matchesFilters({ ...series, title: series.title })) {
            items.push({ ...series, _type: 'series', chapters: matchingChapters.length > 0 ? matchingChapters : series.chapters });
          }
        });
      }

      items.sort((a, b) => {
        if (sortBy === 'rating') return b.rating - a.rating;
        if (sortBy === 'alpha') return a.title.localeCompare(b.title);
        if (sortBy === 'pages') return b.pageCount - a.pageCount;
        // date (default)
        return (b.date || '') > (a.date || '') ? 1 : -1;
      });

      return items;
    }

    function getStoryIdsFromItems(items) {
      const ids = new Set();
      items.forEach(item => {
        if (item._type === 'series') {
          item.chapters.forEach(ch => ids.add(ch.id));
        } else {
          ids.add(item.id);
        }
      });
      return ids;
    }

    function getAllStoryIds() {
      const ids = new Set();
      _state.grouped.standalones.forEach(s => ids.add(s.id));
      _state.grouped.series.forEach(s => s.chapters.forEach(c => ids.add(c.id)));
      return ids;
    }

    function selectAll() {
      setState({ selected: getStoryIdsFromItems(getFilteredItems()) });
    }

    function deselectAll() {
      setState({ selected: new Set() });
    }

    function selectRated(minRating) {
      const ids = new Set();
      getFilteredItems().forEach(item => {
        if (item._type === 'series') {
          item.chapters.forEach(ch => {
            if (ch.rating >= minRating) ids.add(ch.id);
          });
          return;
        }
        if (item.rating >= minRating) ids.add(item.id);
      });
      setState({ selected: ids });
    }

    function selectStandalones() {
      setState({
        selected: getStoryIdsFromItems(getFilteredItems().filter(item => item._type === 'standalone'))
      });
    }

    function selectSeries() {
      setState({
        selected: getStoryIdsFromItems(getFilteredItems().filter(item => item._type === 'series'))
      });
    }

    function toggleItem(id) {
      const next = new Set(_state.selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setState({ selected: next });
    }

    function toggleSeries(series) {
      const next = new Set(_state.selected);
      const ids = series.chapters.map(c => c.id);
      const allSelected = ids.every(id => next.has(id));
      if (allSelected) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      setState({ selected: next });
    }

    function toggleSeriesExpand(id) {
      const next = new Set(_state.expandedSeries);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setState({ expandedSeries: next });
    }

    function getCategories() {
      const cats = new Set();
      _state.grouped.standalones.forEach(s => cats.add(s.category));
      _state.grouped.series.forEach(s => s.chapters.forEach(c => cats.add(c.category)));
      return ['all', ...Array.from(cats).sort()];
    }

    function getTotalCount() {
      return _state.grouped.standalones.length + _state.grouped.series.reduce((s, g) => s + g.chapters.length, 0);
    }

    return {
      getState, setState, subscribe,
      getFilteredItems, getAllStoryIds,
      selectAll, deselectAll, selectRated, selectStandalones, selectSeries,
      toggleItem, toggleSeries, toggleSeriesExpand,
      getCategories, getTotalCount,
    };
  })();

  // ============================================================
  // PHASE 4: UI SHELL
  // ============================================================

  const UI = (() => {
    let panelEl = null;
    let logEl = null;
    let progressBarEl = null;
    let progressLabelEl = null;
    let progressFillEl = null;
    let storyListEl = null;
    let statusCountEl = null;
    let selectedCountEl = null;
    let isOpen = true;

    const CSS = \`
      #litdl-panel {
        position: fixed;
        top: 0;
        right: 0;
        width: 380px;
        height: 100vh;
        background: #0d0d14;
        border-left: 1px solid #1e1e2e;
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
        font-size: 13px;
        color: #c0c0d0;
        box-shadow: -4px 0 24px rgba(0,0,0,0.5);
        transition: transform 0.3s cubic-bezier(0.4,0,0.2,1);
        overflow: hidden;
      }
      #litdl-panel.collapsed { transform: translateX(360px); }
      #litdl-toggle {
        position: fixed;
        right: 0;
        top: 50%;
        transform: translateY(-50%);
        z-index: 2147483646;
        background: #6a1aaf;
        color: #fff;
        border: none;
        padding: 14px 8px;
        border-radius: 8px 0 0 8px;
        cursor: pointer;
        font-size: 16px;
        writing-mode: vertical-rl;
        text-orientation: mixed;
        letter-spacing: 0.05em;
        box-shadow: -2px 0 10px rgba(100,20,180,0.3);
        font-family: system-ui;
        font-weight: 600;
      }
      #litdl-panel .litdl-header {
        background: linear-gradient(135deg, #1a0a28 0%, #0a1428 100%);
        padding: 14px 16px 12px;
        border-bottom: 1px solid #2a1a3e;
        flex-shrink: 0;
      }
      #litdl-panel .litdl-header h2 {
        font-size: 14px;
        font-weight: 700;
        color: #d4b0ff;
        margin: 0 0 4px;
        display: flex;
        align-items: center;
        gap: 6px;
        letter-spacing: 0.03em;
      }
      #litdl-panel .litdl-header .meta-line {
        font-size: 11px;
        color: #666;
        display: flex;
        gap: 12px;
      }
      #litdl-panel .litdl-header .meta-count {
        color: #8870c0;
        font-weight: 600;
      }
      .litdl-section {
        padding: 10px 14px;
        border-bottom: 1px solid #1a1a28;
        flex-shrink: 0;
      }
      .litdl-section-title {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: #555;
        margin-bottom: 8px;
        font-weight: 600;
      }
      .litdl-scroll {
        flex: 1;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: #2a2a3e transparent;
      }
      .litdl-scroll::-webkit-scrollbar { width: 4px; }
      .litdl-scroll::-webkit-scrollbar-track { background: transparent; }
      .litdl-scroll::-webkit-scrollbar-thumb { background: #2a2a3e; border-radius: 2px; }
      
      /* Filters */
      .litdl-filter-row { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
      .litdl-label { font-size: 10px; color: #555; min-width: 50px; }
      .litdl-select, .litdl-input {
        background: #1a1a28;
        border: 1px solid #2a2a3e;
        color: #c0c0d0;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 11px;
        flex: 1;
        outline: none;
        font-family: inherit;
      }
      .litdl-select:focus, .litdl-input:focus { border-color: #6a3a9e; }
      .litdl-input::placeholder { color: #444; }
      
      /* Buttons */
      .litdl-btn-row { display: flex; gap: 5px; flex-wrap: wrap; }
      .litdl-btn {
        background: #1e1e30;
        border: 1px solid #2a2a3e;
        color: #a0a0c0;
        padding: 5px 9px;
        border-radius: 5px;
        font-size: 10.5px;
        cursor: pointer;
        transition: all 0.15s;
        font-family: inherit;
        white-space: nowrap;
      }
      .litdl-btn:hover { background: #2a2a40; border-color: #4a4a6e; color: #d0d0f0; }
      .litdl-btn.primary {
        background: linear-gradient(135deg, #5a1a8e, #3a1a6e);
        border-color: #7a3aae;
        color: #e8d0ff;
        font-weight: 600;
        font-size: 11px;
      }
      .litdl-btn.primary:hover { background: linear-gradient(135deg, #6a2a9e, #4a2a7e); }
      .litdl-btn.primary:disabled { opacity: 0.5; cursor: not-allowed; }
      .litdl-btn.danger { border-color: #6e2a2a; color: #e07070; }
      .litdl-btn.danger:hover { background: #2e1a1a; }
      .litdl-btn.success { border-color: #1e5e2e; color: #60c080; }
      
      /* Format toggles */
      .litdl-format-row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
      .litdl-format-toggle {
        background: #1a1a28;
        border: 1px solid #2a2a3e;
        border-radius: 5px;
        padding: 5px 10px;
        cursor: pointer;
        font-size: 11px;
        color: #666;
        transition: all 0.15s;
        user-select: none;
        font-family: inherit;
      }
      .litdl-format-toggle.active { background: #1e2a1e; border-color: #2e5e2e; color: #70d070; }
      
      /* Story list */
      .litdl-story-item {
        padding: 8px 14px;
        border-bottom: 1px solid #15151e;
        display: flex;
        align-items: flex-start;
        gap: 8px;
        cursor: pointer;
        transition: background 0.1s;
      }
      .litdl-story-item:hover { background: #13131e; }
      .litdl-story-item.series-parent { background: #0e0e1a; }
      .litdl-story-item.series-parent:hover { background: #121218; }
      .litdl-checkbox {
        width: 14px;
        height: 14px;
        border: 1px solid #3a3a5e;
        border-radius: 3px;
        background: #1a1a28;
        flex-shrink: 0;
        margin-top: 2px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s;
        cursor: pointer;
      }
      .litdl-checkbox.checked { background: #5a1a9e; border-color: #8a3ade; }
      .litdl-checkbox.partial { background: #3a2a5e; border-color: #6a4aae; }
      .litdl-checkbox.checked::after { content: '✓'; font-size: 9px; color: #fff; }
      .litdl-checkbox.partial::after { content: '−'; font-size: 11px; color: #c0a0ff; }
      .litdl-story-info { flex: 1; min-width: 0; }
      .litdl-story-title {
        font-size: 12px;
        color: #b0b0d0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.4;
      }
      .litdl-story-meta {
        font-size: 10px;
        color: #505060;
        display: flex;
        gap: 8px;
        margin-top: 2px;
        flex-wrap: wrap;
      }
      .litdl-rating { color: #c0902a; }
      .litdl-series-label {
        font-size: 9.5px;
        background: #1e1a2e;
        border: 1px solid #3a2a5e;
        color: #8060b0;
        padding: 1px 5px;
        border-radius: 3px;
        margin-top: 1px;
        display: inline-block;
        font-weight: 600;
        letter-spacing: 0.03em;
      }
      .litdl-expand-btn {
        background: none;
        border: none;
        color: #4a4a6e;
        cursor: pointer;
        padding: 0 4px;
        font-size: 12px;
        flex-shrink: 0;
        margin-top: 1px;
        transition: transform 0.2s;
      }
      .litdl-expand-btn.open { transform: rotate(90deg); }
      .litdl-chapter-list { background: #0b0b12; }
      
      /* Progress */
      .litdl-progress-bar {
        height: 4px;
        background: #1a1a28;
        border-radius: 2px;
        overflow: hidden;
        margin-top: 6px;
      }
      .litdl-progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #5a1aae, #8a3ae0);
        border-radius: 2px;
        transition: width 0.3s;
        width: 0%;
      }
      .litdl-progress-label { font-size: 10.5px; color: #6a5a8a; margin-top: 4px; }
      
      /* Log */
      .litdl-log {
        font-size: 10.5px;
        line-height: 1.6;
        color: #505060;
        font-family: 'SF Mono', 'Consolas', 'Monaco', monospace;
        padding: 8px 14px;
        height: 120px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: #1e1e2e transparent;
      }
      .litdl-log .log-info { color: #4a6a8a; }
      .litdl-log .log-warn { color: #8a6a2a; }
      .litdl-log .log-error { color: #8a3a3a; }
      .litdl-log .log-success { color: #2a6a4a; }
      
      /* Page body adjustment */
      body.litdl-active { margin-right: 380px !important; }
      
      @media (max-width: 500px) {
        #litdl-panel { width: 100vw; height: 50vh; top: auto; bottom: 0; border-left: none; border-top: 1px solid #2a2a3e; }
        #litdl-panel.collapsed { transform: translateY(calc(50vh - 30px)); }
        body.litdl-active { margin-right: 0 !important; margin-bottom: 50vh !important; }
      }
    \`;

    function createPanel() {
      isOpen = Settings.get('panelOpen') !== false;

      if (document.getElementById('litdl-panel') || document.getElementById('litdl-toggle')) {
        Logger.warn('UI already mounted; skipping duplicate panel injection');
        return;
      }

      // Add styles
      const style = document.createElement('style');
      style.id = 'litdl-styles';
      style.textContent = CSS;
      document.head.appendChild(style);

      // Toggle button
      const toggle = document.createElement('button');
      toggle.id = 'litdl-toggle';
      toggle.textContent = '📥 Download';
      toggle.onclick = () => {
        isOpen = !isOpen;
        Settings.set('panelOpen', isOpen);
        panelEl.classList.toggle('collapsed', !isOpen);
        document.body.classList.toggle('litdl-active', isOpen);
      };
      document.body.appendChild(toggle);

      // Panel
      panelEl = document.createElement('div');
      panelEl.id = 'litdl-panel';
      if (!isOpen) panelEl.classList.add('collapsed');

      panelEl.innerHTML = \`
        <div class="litdl-header">
          <h2>📥 Literotica Downloader <span style="color:#5a3a8a;font-size:10px;font-weight:400;">V2</span></h2>
          <div class="meta-line">
            <span>Version: <span class="meta-count" id="litdl-version">\${SCRIPT_VERSION}</span></span>
            <span>Author: <span class="meta-count" id="litdl-author-name">Detecting...</span></span>
            <span><span class="meta-count" id="litdl-total-count">0</span> stories</span>
            <span><span class="meta-count" id="litdl-selected-count">0</span> selected</span>
          </div>
        </div>
        
        <div class="litdl-section">
          <div class="litdl-section-title">Filters</div>
          <div class="litdl-filter-row">
            <span class="litdl-label">Search</span>
            <input class="litdl-input" id="litdl-search" type="text" placeholder="Title search..." />
          </div>
          <div class="litdl-filter-row">
            <span class="litdl-label">Category</span>
            <select class="litdl-select" id="litdl-filter-cat">
              <option value="all">All Categories</option>
            </select>
          </div>
          <div class="litdl-filter-row">
            <span class="litdl-label">Rating ≥</span>
            <select class="litdl-select" id="litdl-filter-rating">
              <option value="0">Any Rating</option>
              <option value="3">3.0+</option>
              <option value="3.5">3.5+</option>
              <option value="4">4.0+</option>
              <option value="4.5">4.5+</option>
            </select>
            <select class="litdl-select" id="litdl-filter-type" style="margin-left:6px;">
              <option value="all">All Types</option>
              <option value="standalone">Standalones</option>
              <option value="series">Series Only</option>
            </select>
          </div>
          <div class="litdl-filter-row">
            <span class="litdl-label">Sort</span>
            <select class="litdl-select" id="litdl-sort">
              <option value="date">Date (newest)</option>
              <option value="rating">Rating (highest)</option>
              <option value="alpha">Alphabetical</option>
              <option value="pages">Pages (most)</option>
            </select>
          </div>
        </div>
        
        <div class="litdl-section">
          <div class="litdl-section-title">Selection</div>
          <div class="litdl-btn-row">
            <button class="litdl-btn" id="litdl-sel-all">Select All</button>
            <button class="litdl-btn" id="litdl-desel-all">Deselect All</button>
            <button class="litdl-btn" id="litdl-sel-rated">★ 4.0+</button>
            <button class="litdl-btn" id="litdl-sel-standalone">Standalones</button>
            <button class="litdl-btn" id="litdl-sel-series">Series</button>
            <button class="litdl-btn" id="litdl-restore-sel">Restore Last</button>
          </div>
        </div>
        
        <div class="litdl-section">
          <div class="litdl-section-title">Export Formats</div>
          <div class="litdl-format-row">
            <button class="litdl-format-toggle active" id="litdl-fmt-html">📄 HTML</button>
            <button class="litdl-format-toggle" id="litdl-fmt-epub">📚 EPUB</button>
            <button class="litdl-format-toggle" id="litdl-fmt-txt">📝 TXT</button>
            <button class="litdl-format-toggle active" id="litdl-fmt-zip">🗜 ZIP Package</button>
          </div>
          <div class="litdl-section-title" style="margin-top:10px;">File Structure</div>
          <div class="litdl-format-row">
            <button class="litdl-format-toggle active" id="litdl-mode-combined">📚 Combined Files</button>
            <button class="litdl-format-toggle" id="litdl-mode-separate">🧩 Separate Chapters</button>
          </div>
          <div style="margin-top:10px;">
            <button class="litdl-btn primary" id="litdl-download-btn" style="width:100%;padding:8px;" disabled>
              ⬇ Download Selected Stories
            </button>
            <button class="litdl-btn" id="litdl-abort-btn" style="width:100%;padding:8px;margin-top:6px;display:none;">
              Stop Download
            </button>
          </div>
        </div>
        
        <div class="litdl-section" id="litdl-progress-section" style="display:none;">
          <div class="litdl-section-title">Progress</div>
          <div class="litdl-progress-label" id="litdl-progress-label">Initializing...</div>
          <div class="litdl-progress-bar"><div class="litdl-progress-fill" id="litdl-progress-fill"></div></div>
        </div>
        
        <div class="litdl-scroll" id="litdl-story-list">
          <div style="padding:20px;text-align:center;color:#333;">Loading catalog...</div>
        </div>
        
        <div class="litdl-section" style="padding:6px 14px;flex-shrink:0;">
          <div class="litdl-section-title" style="margin-bottom:4px;">Console</div>
          <div class="litdl-log" id="litdl-log"></div>
        </div>
      \`;

      document.body.appendChild(panelEl);
      if (isOpen) document.body.classList.add('litdl-active');

      // Cache refs
      logEl = panelEl.querySelector('#litdl-log');
      progressFillEl = panelEl.querySelector('#litdl-progress-fill');
      progressLabelEl = panelEl.querySelector('#litdl-progress-label');
      storyListEl = panelEl.querySelector('#litdl-story-list');
      statusCountEl = panelEl.querySelector('#litdl-total-count');
      selectedCountEl = panelEl.querySelector('#litdl-selected-count');

      // Wire up events
      wireEvents();

      // Subscribe to logger
      Logger.onLog(entry => appendLog(entry));

      // Subscribe to state
      State.subscribe(state => renderState(state));

      Logger.info('Literotica Downloader V2 initialized (v' + SCRIPT_VERSION + ')');
    }

    function wireEvents() {
      // Filters
      panelEl.querySelector('#litdl-search').addEventListener('input', e => {
        State.setState({ searchQuery: e.target.value });
        Settings.set('searchQuery', e.target.value);
        renderStoryList();
      });
      panelEl.querySelector('#litdl-filter-cat').addEventListener('change', e => {
        State.setState({ filterCategory: e.target.value });
        Settings.set('filterCategory', e.target.value);
        renderStoryList();
      });
      panelEl.querySelector('#litdl-filter-rating').addEventListener('change', e => {
        State.setState({ filterRating: parseFloat(e.target.value) });
        Settings.set('filterRating', parseFloat(e.target.value));
        renderStoryList();
      });
      panelEl.querySelector('#litdl-filter-type').addEventListener('change', e => {
        State.setState({ filterType: e.target.value });
        renderStoryList();
      });
      panelEl.querySelector('#litdl-sort').addEventListener('change', e => {
        State.setState({ sortBy: e.target.value });
        Settings.set('sortBy', e.target.value);
        renderStoryList();
      });

      // Selection buttons
      panelEl.querySelector('#litdl-sel-all').onclick = () => State.selectAll();
      panelEl.querySelector('#litdl-desel-all').onclick = () => State.deselectAll();
      panelEl.querySelector('#litdl-sel-rated').onclick = () => State.selectRated(4.0);
      panelEl.querySelector('#litdl-sel-standalone').onclick = () => State.selectStandalones();
      panelEl.querySelector('#litdl-sel-series').onclick = () => State.selectSeries();
      panelEl.querySelector('#litdl-restore-sel').onclick = () => {
        const last = Settings.get('lastSelection');
        if (last && last.length > 0) {
          State.setState({ selected: new Set(last) });
          Logger.info('Restored previous selection: ' + last.length + ' items');
        }
      };

      const contentFormats = ['html', 'epub', 'txt'];
      const allFormatButtons = ['html', 'epub', 'txt', 'zip'].reduce((acc, fmt) => {
        acc[fmt] = panelEl.querySelector('#litdl-fmt-' + fmt);
        return acc;
      }, {});

      const getActiveContentFormatCount = () => contentFormats.filter(fmt => allFormatButtons[fmt].classList.contains('active')).length;
      const ensureAtLeastOneContentFormat = () => {
        if (getActiveContentFormatCount() === 0) {
          allFormatButtons.html.classList.add('active');
          Settings.set('exportHtml', true);
        }
      };

      contentFormats.forEach(fmt => {
        const btn = allFormatButtons[fmt];
        btn.onclick = () => {
          const isActive = btn.classList.contains('active');
          if (isActive && getActiveContentFormatCount() === 1) {
            Logger.warn('At least one content format must remain selected.');
            return;
          }
          btn.classList.toggle('active');
          Settings.set('export' + fmt.charAt(0).toUpperCase() + fmt.slice(1), btn.classList.contains('active'));
          ensureAtLeastOneContentFormat();
        };
      });

      allFormatButtons.zip.onclick = () => {
        allFormatButtons.zip.classList.toggle('active');
        Settings.set('exportZip', allFormatButtons.zip.classList.contains('active'));
      };

      // Apply saved format state
      ['html', 'epub', 'txt', 'zip'].forEach(fmt => {
        const saved = Settings.get('export' + fmt.charAt(0).toUpperCase() + fmt.slice(1));
        if (saved === false) allFormatButtons[fmt].classList.remove('active');
        if (saved === true) allFormatButtons[fmt].classList.add('active');
      });
      ensureAtLeastOneContentFormat();

      const modeButtons = {
        combined: panelEl.querySelector('#litdl-mode-combined'),
        separate: panelEl.querySelector('#litdl-mode-separate'),
      };
      const applyExportMode = (mode) => {
        modeButtons.combined.classList.toggle('active', mode === 'combined');
        modeButtons.separate.classList.toggle('active', mode === 'separate');
        Settings.set('exportMode', mode);
      };
      applyExportMode(Settings.get('exportMode') === 'separate' ? 'separate' : 'combined');
      modeButtons.combined.onclick = () => applyExportMode('combined');
      modeButtons.separate.onclick = () => applyExportMode('separate');

      // Download button
      panelEl.querySelector('#litdl-download-btn').onclick = startDownload;
      panelEl.querySelector('#litdl-abort-btn').onclick = requestDownloadAbort;
    }

    function appendLog(entry) {
      if (!logEl) return;
      const line = document.createElement('div');
      line.className = 'log-' + entry.level;
      line.textContent = '[' + entry.time + '] ' + entry.msg;
      logEl.appendChild(line);
      logEl.scrollTop = logEl.scrollHeight;
      // Trim log to 200 entries
      while (logEl.children.length > 200) logEl.removeChild(logEl.firstChild);
    }

    function updateProgress(current, total, label) {
      const section = panelEl.querySelector('#litdl-progress-section');
      section.style.display = 'block';
      if (progressLabelEl) progressLabelEl.textContent = label || '';
      if (progressFillEl && total > 0) {
        progressFillEl.style.width = Math.min(100, (current / total) * 100) + '%';
      }
    }

    function hideProgress() {
      const section = panelEl.querySelector('#litdl-progress-section');
      if (section) section.style.display = 'none';
    }

    function renderState(state) {
      // Update counts
      const total = State.getTotalCount();
      if (statusCountEl) statusCountEl.textContent = total;
      if (selectedCountEl) selectedCountEl.textContent = state.selected.size;

      // Update author name
      const authorEl = panelEl.querySelector('#litdl-author-name');
      if (authorEl && state.author) authorEl.textContent = state.authorName || state.author;

      // Update download button
      const dlBtn = panelEl.querySelector('#litdl-download-btn');
      if (dlBtn) {
        dlBtn.disabled = state.selected.size === 0 || state.downloading;
        dlBtn.textContent = state.downloading
          ? '⏳ Downloading...'
          : '⬇ Download ' + state.selected.size + ' Selected';
      }
      const abortBtn = panelEl.querySelector('#litdl-abort-btn');
      if (abortBtn) {
        abortBtn.style.display = state.downloading ? 'block' : 'none';
        abortBtn.disabled = !state.downloading || state.cancelRequested;
        abortBtn.textContent = state.cancelRequested ? 'Stopping...' : 'Stop Download';
      }

      // Update category filter
      const catSelect = panelEl.querySelector('#litdl-filter-cat');
      if (catSelect && state.grouped) {
        const cats = State.getCategories();
        const current = catSelect.value;
        catSelect.innerHTML = cats.map(c => \`<option value="\${c}" \${c === current ? 'selected' : ''}>\${c === 'all' ? 'All Categories' : c}</option>\`).join('');
      }

      renderStoryList();
    }

    function renderStoryList() {
      if (!storyListEl) return;
      const state = State.getState();
      const items = State.getFilteredItems();

      if (items.length === 0) {
        storyListEl.innerHTML = '<div style="padding:20px;text-align:center;color:#333;">No stories match filters</div>';
        return;
      }

      const fragment = document.createDocumentFragment();

      items.forEach(item => {
        if (item._type === 'series') {
          fragment.appendChild(renderSeriesItem(item, state));
        } else {
          fragment.appendChild(renderStoryItem(item, state));
        }
      });

      storyListEl.innerHTML = '';
      storyListEl.appendChild(fragment);
    }

    function renderStoryItem(story, state) {
      const el = document.createElement('div');
      el.className = 'litdl-story-item';
      const checked = state.selected.has(story.id);
      el.innerHTML = \`
        <div class="litdl-checkbox \${checked ? 'checked' : ''}" data-id="\${story.id}"></div>
        <div class="litdl-story-info">
          <div class="litdl-story-title" title="\${HTMLBuilder.escapeHtml(story.title)}">\${HTMLBuilder.escapeHtml(story.title)}</div>
          <div class="litdl-story-meta">
            <span>\${HTMLBuilder.escapeHtml(story.category)}</span>
            \${story.rating > 0 ? '<span class="litdl-rating">★ ' + story.rating.toFixed(2) + '</span>' : ''}
            <span>\${story.dateFormatted}</span>
            <span>\${story.pageCount}p</span>
            \${story.wordCount > 0 ? '<span>~' + Math.round(story.wordCount / 1000) + 'k words</span>' : ''}
          </div>
        </div>
      \`;
      el.querySelector('.litdl-checkbox').onclick = (e) => {
        e.stopPropagation();
        State.toggleItem(story.id);
        Settings.set('lastSelection', Array.from(State.getState().selected));
      };
      el.onclick = () => {
        State.toggleItem(story.id);
        Settings.set('lastSelection', Array.from(State.getState().selected));
      };
      return el;
    }

    function renderSeriesItem(series, state) {
      const el = document.createElement('div');
      const isExpanded = state.expandedSeries.has(series.id);
      const chapterIds = series.chapters.map(c => c.id);
      const selectedCount = chapterIds.filter(id => state.selected.has(id)).length;
      const allSelected = selectedCount === chapterIds.length && chapterIds.length > 0;
      const partialSelected = selectedCount > 0 && !allSelected;

      const checkClass = allSelected ? 'checked' : partialSelected ? 'partial' : '';

      el.innerHTML = \`
        <div class="litdl-story-item series-parent" style="padding-right:8px;">
          <div class="litdl-checkbox \${checkClass}" data-series-id="\${series.id}"></div>
          <div class="litdl-story-info">
            <div class="litdl-story-title" title="\${HTMLBuilder.escapeHtml(series.title)}">📚 \${HTMLBuilder.escapeHtml(series.title)}</div>
            <div class="litdl-story-meta">
              <span>\${HTMLBuilder.escapeHtml(series.category)}</span>
              \${series.rating > 0 ? '<span class="litdl-rating">★ ' + series.rating.toFixed(2) + '</span>' : ''}
              <span>\${series.chapters.length} chapters</span>
              <span>\${series.pageCount}p total</span>
            </div>
            <span class="litdl-series-label">SERIES — \${selectedCount}/\${series.chapters.length} selected</span>
          </div>
          <button class="litdl-expand-btn \${isExpanded ? 'open' : ''}" data-expand-id="\${series.id}">▶</button>
        </div>
        \${isExpanded ? '<div class="litdl-chapter-list">' + series.chapters.map((ch, i) => {
          const chChecked = state.selected.has(ch.id);
          return \`<div class="litdl-story-item" style="padding-left:32px;" data-ch-id="\${ch.id}">
            <div class="litdl-checkbox \${chChecked ? 'checked' : ''}" data-id="\${ch.id}"></div>
            <div class="litdl-story-info">
              <div class="litdl-story-title" title="\${HTMLBuilder.escapeHtml(ch.title)}">\${i + 1}. \${HTMLBuilder.escapeHtml(ch.title)}</div>
              <div class="litdl-story-meta">
                \${ch.rating > 0 ? '<span class="litdl-rating">★ ' + ch.rating.toFixed(2) + '</span>' : ''}
                <span>\${ch.dateFormatted}</span>
                <span>\${ch.pageCount}p</span>
              </div>
            </div>
          </div>\`;
        }).join('') + '</div>' : ''}
      \`;

      // Series checkbox
      el.querySelector('[data-series-id]').onclick = (e) => {
        e.stopPropagation();
        State.toggleSeries(series);
        Settings.set('lastSelection', Array.from(State.getState().selected));
      };

      // Expand button
      el.querySelector('[data-expand-id]').onclick = (e) => {
        e.stopPropagation();
        State.toggleSeriesExpand(series.id);
      };

      // Chapter checkboxes
      el.querySelectorAll('[data-ch-id]').forEach(chEl => {
        chEl.onclick = (e) => {
          const id = chEl.getAttribute('data-ch-id');
          State.toggleItem(id);
          Settings.set('lastSelection', Array.from(State.getState().selected));
        };
      });

      return el;
    }

    function setLoading(msg) {
      if (storyListEl) {
        storyListEl.innerHTML = \`<div style="padding:30px;text-align:center;color:#444;">\${msg}</div>\`;
      }
    }

    return { createPanel, updateProgress, hideProgress, setLoading, renderStoryList };
  })();

  // ============================================================
  // DOWNLOAD ORCHESTRATION
  // ============================================================

  let activeDownloadController = null;
  let downloadAbortRequested = false;

  function beginDownloadSession() {
    downloadAbortRequested = false;
    activeDownloadController = typeof AbortController !== 'undefined' ? new AbortController() : null;
    State.setState({ cancelRequested: false });
    return activeDownloadController ? activeDownloadController.signal : null;
  }

  function requestDownloadAbort() {
    if (!State.getState().downloading || downloadAbortRequested) return;
    downloadAbortRequested = true;
    State.setState({ cancelRequested: true });
    if (activeDownloadController) {
      activeDownloadController.abort();
    }
    Logger.warn('Abort requested. Stopping after the current step...');
  }

  function isDownloadAbortRequested() {
    return downloadAbortRequested;
  }

  function ensureDownloadNotAborted() {
    if (downloadAbortRequested) {
      throw makeAbortError();
    }
  }

  function finishDownloadSession() {
    activeDownloadController = null;
    downloadAbortRequested = false;
  }

  async function startDownload() {
    const state = State.getState();
    if (state.selected.size === 0 || state.downloading) return;

    if (typeof saveAs !== 'function') {
      Logger.error('FileSaver is not available. Verify @require for FileSaver.js in Tampermonkey.');
      return;
    }
    if (typeof JSZip === 'undefined') {
      Logger.error('JSZip is not available. Verify @require for JSZip in Tampermonkey.');
      return;
    }

    const downloadSignal = beginDownloadSession();
    State.setState({ downloading: true, errors: [], cancelRequested: false });
    Logger.info('Starting download of ' + state.selected.size + ' stories');

    // Collect all selected story metadata
    const { grouped } = state;
    const selectedStories = [];

    grouped.standalones.forEach(s => {
      if (state.selected.has(s.id)) selectedStories.push(s);
    });
    grouped.series.forEach(series => {
      series.chapters.forEach(ch => {
        if (state.selected.has(ch.id)) selectedStories.push(ch);
      });
    });

    Logger.info('Fetching content for ' + selectedStories.length + ' stories...');

    const downloadedStories = [];
    const errors = [];

    try {
      for (let i = 0; i < selectedStories.length; i++) {
        ensureDownloadNotAborted();
        const story = selectedStories[i];
        UI.updateProgress(i, selectedStories.length, 'Fetching: ' + story.title + ' (' + (i + 1) + '/' + selectedStories.length + ')');
        Logger.info('Fetching story ' + (i + 1) + ' of ' + selectedStories.length + ': "' + story.title + '"');

        try {
          const data = await fetchStoryContent(story, downloadSignal);
          downloadedStories.push(data);
          Logger.success('✓ ' + story.title + ' — ' + data.pages.length + ' pages');
        } catch (err) {
          if (isAbortError(err)) throw err;
          Logger.error('✗ Failed: ' + story.title + ' — ' + err.message);
          errors.push({ story: story.title, error: err.message });
        }
      }

      Logger.info('Content fetch complete. ' + downloadedStories.length + ' stories ready, ' + errors.length + ' failed.');

      if (downloadedStories.length === 0) {
        Logger.error('No stories could be downloaded. Check network or story availability.');
        return;
      }

      function isFormatEnabled(selector, fallback) {
        const el = panelEl ? panelEl.querySelector(selector) : null;
        return el ? el.classList.contains('active') : fallback;
      }

      const fmtHTML = isFormatEnabled('#litdl-fmt-html', true);
      const fmtEPUB = isFormatEnabled('#litdl-fmt-epub', true);
      const fmtTXT = isFormatEnabled('#litdl-fmt-txt', false);
      const fmtZIP = isFormatEnabled('#litdl-fmt-zip', true);
      const exportMode = panelEl && panelEl.querySelector('#litdl-mode-separate').classList.contains('active')
        ? 'separate'
        : 'combined';

      const selectedFormats = { html: fmtHTML, epub: fmtEPUB, txt: fmtTXT, zip: fmtZIP };

      if (!fmtHTML && !fmtEPUB && !fmtTXT) {
        Logger.error('Enable HTML, EPUB, or TXT before downloading.');
        return;
      }

      if (!fmtZIP) {
        if (exportMode === 'combined') {
          const collectionGroup = buildSelectedCollectionGroup(state.author, state.authorName, downloadedStories);
          if (fmtHTML) {
            ensureDownloadNotAborted();
            const html = collectionGroup.stories.length === 1
              ? HTMLBuilder.buildStoryHTML(collectionGroup.stories[0])
              : HTMLBuilder.buildCombinedHTML(collectionGroup);
            const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
            saveAs(blob, HTMLBuilder.groupFilename(collectionGroup) + '.html');
            await sleep(100);
          }
          if (fmtEPUB) {
            ensureDownloadNotAborted();
            UI.updateProgress(0, 1, 'Generating EPUB: ' + collectionGroup.title);
            Logger.info('Building EPUB: ' + collectionGroup.title);
            try {
              const blob = collectionGroup.stories.length === 1
                ? await EPUBBuilder.buildEPUB(collectionGroup.stories[0])
                : await EPUBBuilder.buildCombinedEPUB(collectionGroup);
              ensureDownloadNotAborted();
              saveAs(blob, HTMLBuilder.groupFilename(collectionGroup) + '.epub');
            } catch (err) {
              if (isAbortError(err)) throw err;
              Logger.error('EPUB failed for ' + collectionGroup.title + ': ' + err.message);
            }
            await sleep(150);
          }
          if (fmtTXT) {
            ensureDownloadNotAborted();
            const text = collectionGroup.stories.length === 1
              ? TextBuilder.buildStoryText(collectionGroup.stories[0])
              : TextBuilder.buildCombinedText(collectionGroup);
            const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
            saveAs(blob, HTMLBuilder.groupFilename(collectionGroup) + '.txt');
            await sleep(100);
          }
        } else {
          if (fmtHTML) {
            for (const story of downloadedStories) {
              ensureDownloadNotAborted();
              const html = HTMLBuilder.buildStoryHTML(story);
              const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
              saveAs(blob, HTMLBuilder.storyFilename(story) + '.html');
              await sleep(100);
            }
          }
          if (fmtEPUB) {
            for (let i = 0; i < downloadedStories.length; i++) {
              ensureDownloadNotAborted();
              const story = downloadedStories[i];
              UI.updateProgress(i, downloadedStories.length, 'Generating EPUB: ' + story.title);
              Logger.info('Building EPUB: ' + story.title);
              try {
                const blob = await EPUBBuilder.buildEPUB(story);
                ensureDownloadNotAborted();
                saveAs(blob, HTMLBuilder.storyFilename(story) + '.epub');
              } catch (err) {
                if (isAbortError(err)) throw err;
                Logger.error('EPUB failed for ' + story.title + ': ' + err.message);
              }
              await sleep(150);
            }
          }
          if (fmtTXT) {
            for (const story of downloadedStories) {
              ensureDownloadNotAborted();
              const text = TextBuilder.buildStoryText(story);
              const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
              saveAs(blob, HTMLBuilder.storyFilename(story) + '.txt');
              await sleep(100);
            }
          }
        }
      } else {
        ensureDownloadNotAborted();
        UI.updateProgress(downloadedStories.length, downloadedStories.length, 'Building ZIP package...');
        Logger.info('Building ZIP package...');

        try {
          const zipBlob = await ZIPBuilder.buildCollection(
            state.author,
            state.authorName,
            downloadedStories,
            selectedFormats,
            exportMode,
            (current, total, label) => {
              UI.updateProgress(current, total, 'Packaging: ' + label);
            },
            errors,
            isDownloadAbortRequested
          );

          ensureDownloadNotAborted();
          const authorSafe = HTMLBuilder.sanitizeFilename(state.authorName || state.author || 'author');
          const filename = authorSafe + '_literotica_collection.zip';
          saveAs(zipBlob, filename);
          Logger.success('✓ ZIP saved: ' + filename + ' (' + downloadedStories.length + ' stories)');
        } catch (err) {
          if (isAbortError(err)) throw err;
          Logger.error('ZIP generation failed: ' + err.message);
        }
      }

      Logger.success('Download complete! ' + downloadedStories.length + ' stories, ' + errors.length + ' errors.');
    } catch (err) {
      if (isAbortError(err)) {
        Logger.warn('Download aborted. Prepared ' + downloadedStories.length + ' stories before stopping.');
      } else {
        Logger.error('Download failed: ' + err.message);
      }
    } finally {
      finishDownloadSession();
      State.setState({ downloading: false, cancelRequested: false });
      UI.hideProgress();
    }
  }

  // Store panel ref
  let panelEl;

  // ============================================================
  // MAIN INITIALIZATION
  // ============================================================

  let didInit = false;
  let initInFlight = false;
  let routeWatcherStarted = false;
  let lastAttemptHref = null;

  async function init() {
    // Detect author from URL
    const author = detectAuthor();

    if (!author) {
      console.log('[LitDL] Not an author page, skipping.');
      return false;
    }

    await Settings.init();

    Logger.info('Detected author: ' + author);

    // Create UI
    UI.createPanel();
    panelEl = document.getElementById('litdl-panel');

    State.setState({ author });

    // Restore saved filter settings
    const savedSettings = Settings.all();
    State.setState({
      filterCategory: savedSettings.filterCategory || 'all',
      filterRating: savedSettings.filterRating || 0,
      sortBy: savedSettings.sortBy || 'date',
      searchQuery: savedSettings.searchQuery || '',
    });

    // Apply saved search/sort to UI
    const searchEl = panelEl.querySelector('#litdl-search');
    const sortEl = panelEl.querySelector('#litdl-sort');
    if (searchEl && savedSettings.searchQuery) searchEl.value = savedSettings.searchQuery;
    if (sortEl && savedSettings.sortBy) sortEl.value = savedSettings.sortBy;

    const pageAuthorName = document.querySelector('meta[property="profile:username"]')?.getAttribute('content')
      || document.querySelector('meta[name="author"]')?.getAttribute('content')
      || author;
    State.setState({ authorName: pageAuthorName });
    Logger.info('Author: ' + pageAuthorName);

    // Fetch full catalog
    UI.setLoading('Fetching story catalog...');
    Logger.info('Loading full story catalog...');

    let catalog;
    try {
      Logger.info('Reading author story pages directly...');
      const parsed = await fetchCatalogFromCurrentPage(author, (loaded, total) => {
        UI.updateProgress(loaded, total || loaded, 'Fetching catalog: ' + loaded + (total ? ' of ' + total : '') + ' entries');
      });
      catalog = parsed.items;
      if (parsed.authorName) {
        State.setState({ authorName: parsed.authorName });
      }
    } catch (err) {
      Logger.warn('Author page catalog fetch failed: ' + err.message);
      Logger.info('Falling back to legacy API catalog fetch...');
      try {
        Logger.info('Loading author profile for: ' + author);
        const profile = await fetchAuthorProfile(author);
        if (profile) {
          const authorName = profile.name || profile.username || author;
          const resolvedAuthor = String(profile.__resolvedAuthor || profile.userid || profile.id || profile.username || author);
          State.setState({ authorProfile: profile, authorName, author: resolvedAuthor });
          Logger.info('Author API identifier: ' + resolvedAuthor);
        }

        const authorForCatalog = State.getState().author || author;
        catalog = await fetchAuthorCatalog(authorForCatalog, (loaded, total) => {
          UI.updateProgress(loaded, total || loaded, 'Fetching catalog: ' + loaded + (total ? ' of ' + total : '') + ' entries');
        });
      } catch (fallbackErr) {
        if (!catalog || !catalog.length) {
          Logger.error('Catalog fetch failed: ' + fallbackErr.message);
          UI.setLoading('Failed to load catalog. Check console for details.');
          return false;
        }
      }
    }

    if (!catalog || catalog.length === 0) {
      UI.setLoading('No stories found for this author.');
      Logger.warn('Empty catalog returned');
      return false;
    }

    UI.hideProgress();

    // Group stories
    const grouped = groupStories(catalog);
    State.setState({ catalog, grouped });

    const totalCount = State.getTotalCount();
    Logger.success('Catalog loaded: ' + grouped.standalones.length + ' standalones, ' + grouped.series.length + ' series (' + totalCount + ' total)');

    Settings.set('lastAuthor', author);
    return true;
  }

  async function initOnceIfEligible() {
    if (didInit || initInFlight) return;
    if (!detectAuthor()) return;
    if (lastAttemptHref === location.href) return;

    initInFlight = true;
    lastAttemptHref = location.href;
    try {
      didInit = await init();
    } catch (err) {
      Logger.error('Initialization failed: ' + (err && err.message ? err.message : String(err)));
      didInit = false;
    } finally {
      initInFlight = false;
    }
  }

  function installRouteWatcher() {
    if (routeWatcherStarted) return;
    routeWatcherStarted = true;

    const trigger = () => setTimeout(() => { initOnceIfEligible(); }, 250);

    const patchHistory = (methodName) => {
      const original = history[methodName];
      if (typeof original !== 'function') return;
      history[methodName] = function () {
        const result = original.apply(this, arguments);
        trigger();
        return result;
      };
    };

    patchHistory('pushState');
    patchHistory('replaceState');
    window.addEventListener('popstate', trigger);

    let lastHref = location.href;
    setInterval(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        trigger();
      }
    }, 1000);
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      installRouteWatcher();
      initOnceIfEligible();
    });
  } else {
    installRouteWatcher();
    setTimeout(() => { initOnceIfEligible(); }, 500);
  }

})();
`;
