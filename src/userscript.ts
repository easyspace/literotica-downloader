export const USERSCRIPT = `// ==UserScript==
// @name         Literotica Downloader V2
// @namespace    https://studios.easyspace.in
// @version      2.0.0
// @description  Download complete author libraries from Literotica using the modern /api/3/ API. Supports ZIP, HTML, and EPUB export with full series grouping, filtering, and retry logic.
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

    // Literotica's /api/3/ is same-origin, so prefer native fetch. This avoids
    // userscript-manager differences around GM.xmlHttpRequest availability.
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

      try {
        const resp = await fetch(url, {
          method,
          headers,
          // For same-origin, browsers send cookies by default. Be explicit anyway.
          credentials: 'include',
          signal: controller ? controller.signal : undefined,
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
      }
    } catch (e) {
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
        exportEPUB: true,
        exportZIP: true,
        exportOmnibus: false,
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

  async function fetchAuthorProfile(username) {
    const url = API_BASE + '/users/' + username + '?params=' + encodeURIComponent(JSON.stringify({ withProfile: false }));
    try {
      const data = await fetchJSON(url);
      return data;
    } catch (err) {
      Logger.warn('Could not fetch author profile: ' + err.message);
      return null;
    }
  }

  async function fetchAuthorCatalog(username, onProgress) {
    const PAGE_SIZE = 500;
    let page = 1;
    let allItems = [];
    let totalExpected = null;

    Logger.info('Fetching story catalog for: ' + username);

    while (true) {
      const params = JSON.stringify({ page, pageSize: PAGE_SIZE, type: 'story', listType: 'expanded' });
      const url = API_BASE + '/users/' + username + '/series_and_works?params=' + encodeURIComponent(params);

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

  async function fetchStoryContent(story) {
    const slug = story.slug;
    const pages = [];
    const totalPages = story.pageCount || 1;

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const params = JSON.stringify({ page: pageNum });
      const url = API_BASE + '/stories/' + slug + '?params=' + encodeURIComponent(params);

      Logger.info('Fetching: ' + story.title + ' (page ' + pageNum + '/' + totalPages + ')');

      try {
        const data = await fetchJSON(url);
        const text = data.pageText || data.story?.pageText || data.content || data.text || '';
        pages.push({
          pageNum,
          text: text,
          title: data.pageTitle || data.title || (totalPages > 1 ? 'Page ' + pageNum : story.title),
        });
      } catch (err) {
        Logger.error('Failed page ' + pageNum + ' of "' + story.title + '": ' + err.message);
        pages.push({ pageNum, text: '[Error fetching this page: ' + err.message + ']', title: 'Page ' + pageNum });
      }
    }

    return {
      ...story,
      pages,
      totalPages,
    };
  }

  // ============================================================
  // PHASE 6: HTML BUILDER
  // ============================================================

  const HTMLBuilder = (() => {
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

    function buildStoryHTML(storyData) {
      const { title, author, authorName, category, rating, dateFormatted, description, pages } = storyData;

      const css = \`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: Georgia, 'Times New Roman', serif;
          font-size: 1.1rem;
          line-height: 1.8;
          color: #1a1a1a;
          background: #fafaf8;
          max-width: 720px;
          margin: 0 auto;
          padding: 2rem 1.5rem 4rem;
        }
        .metadata {
          border: 1px solid #e0e0d8;
          border-radius: 8px;
          padding: 1.5rem;
          margin-bottom: 2.5rem;
          background: #fff;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        }
        .metadata h1 {
          font-size: 1.8rem;
          font-weight: 700;
          color: #0a0a0a;
          margin-bottom: 0.5rem;
          line-height: 1.3;
        }
        .metadata .author { font-size: 1rem; color: #555; margin-bottom: 1rem; }
        .metadata .author a { color: #8b1538; text-decoration: none; }
        .metadata .tags {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }
        .metadata .tag {
          background: #f0ede8;
          color: #444;
          padding: 0.2rem 0.6rem;
          border-radius: 4px;
          font-size: 0.85rem;
          font-family: system-ui, sans-serif;
        }
        .metadata .tag.rating { background: #fff3cd; color: #856404; }
        .metadata .description {
          font-style: italic;
          color: #444;
          margin-top: 0.75rem;
          border-top: 1px solid #e8e8e0;
          padding-top: 0.75rem;
          font-size: 0.95rem;
        }
        .page-separator {
          text-align: center;
          margin: 2.5rem 0;
          color: #aaa;
          font-family: system-ui, sans-serif;
          font-size: 0.8rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .page-separator::before { content: '— '; }
        .page-separator::after { content: ' —'; }
        .story-content p { margin-bottom: 1.2rem; }
        .story-content { orphans: 3; widows: 3; }
        .footer {
          margin-top: 3rem;
          padding-top: 1rem;
          border-top: 1px solid #e0e0d8;
          text-align: center;
          font-family: system-ui, sans-serif;
          font-size: 0.78rem;
          color: #aaa;
        }
        @media print {
          body { background: white; padding: 0; max-width: none; }
          .metadata { box-shadow: none; border: 1px solid #ccc; }
        }
      \`;

      const pagesHTML = pages.map((pg, i) => \`
        \${i > 0 ? '<div class="page-separator">Page ' + pg.pageNum + '</div>' : ''}
        <div class="story-content" id="page-\${pg.pageNum}">\${processPageText(pg.text)}</div>
      \`).join('');

      return \`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>\${escapeHtml(title)}</title>
  <style>\${css}</style>
</head>
<body>
  <div class="metadata">
    <h1>\${escapeHtml(title)}</h1>
    <p class="author">by <a href="https://www.literotica.com/authors/\${escapeHtml(author)}">\${escapeHtml(authorName || author)}</a></p>
    <div class="tags">
      <span class="tag">\${escapeHtml(category)}</span>
      \${rating > 0 ? '<span class="tag rating">★ ' + formatRating(rating) + '</span>' : ''}
      <span class="tag">\${escapeHtml(dateFormatted)}</span>
      <span class="tag">\${pages.length} page\${pages.length !== 1 ? 's' : ''}</span>
    </div>
    \${description ? '<p class="description">' + escapeHtml(description) + '</p>' : ''}
  </div>
  \${pagesHTML}
  <div class="footer">
    Downloaded from Literotica.com • Literotica Downloader V2 • \${new Date().toLocaleDateString()}
  </div>
</body>
</html>\`;
    }

    function buildIndexHTML(author, authorName, standalones, seriesGroups) {
      const allStories = [...standalones, ...seriesGroups.flatMap(s => s.chapters)];
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
        .section-title { font-size: 1.3rem; font-weight: 600; color: #c0b0e0; margin: 2rem 0 1rem; padding-bottom: 0.5rem; border-bottom: 1px solid #2a2a3a; }
        .story-card { background: #1a1a24; border: 1px solid #2a2a3a; border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 0.75rem; transition: border-color 0.2s; }
        .story-card:hover { border-color: #6a4a9a; }
        .story-card a { color: #b48cf0; text-decoration: none; font-weight: 500; font-size: 1rem; }
        .story-card a:hover { color: #d4b0ff; text-decoration: underline; }
        .story-meta { font-size: 0.8rem; color: #666; margin-top: 0.25rem; display: flex; gap: 0.75rem; flex-wrap: wrap; }
        .story-meta span { color: #888; }
        .story-meta .rating { color: #f0c040; }
        .series-block { background: #16161e; border: 1px solid #2a2a3a; border-radius: 10px; margin-bottom: 1rem; overflow: hidden; }
        .series-header { padding: 1rem 1.25rem; background: #1e1628; border-bottom: 1px solid #2a2a3a; }
        .series-header .title { color: #c8a8ff; font-weight: 600; font-size: 1.05rem; }
        .series-header .meta { font-size: 0.78rem; color: #666; margin-top: 0.2rem; }
        .series-chapters { padding: 0.5rem 0; }
        .chapter-row { padding: 0.5rem 1.25rem; display: flex; align-items: center; gap: 1rem; border-bottom: 1px solid #1e1e28; }
        .chapter-row:last-child { border-bottom: none; }
        .chapter-num { width: 24px; height: 24px; background: #2a1a3e; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; color: #8a6ab0; flex-shrink: 0; }
        .chapter-row a { color: #a090c8; text-decoration: none; flex: 1; }
        .chapter-row a:hover { color: #c4b0e8; }
        .chapter-meta { font-size: 0.75rem; color: #555; }
        .footer { text-align: center; padding: 2rem; color: #444; font-size: 0.8rem; border-top: 1px solid #1a1a24; margin-top: 2rem; }
      \`;

      const seriesHTML = seriesGroups.map(s => \`
        <div class="series-block">
          <div class="series-header">
            <div class="title">📚 \${escapeHtml(s.title)}</div>
            <div class="meta">\${s.chapters.length} chapters • \${s.category} • ★ \${s.rating.toFixed(2)}</div>
          </div>
          <div class="series-chapters">
            \${s.chapters.map((ch, i) => \`
              <div class="chapter-row">
                <div class="chapter-num">\${i + 1}</div>
                <a href="epub/\${sanitizeFilename(s.title)}_ch\${String(i + 1).padStart(2, '0')}_\${sanitizeFilename(ch.title)}.html">\${escapeHtml(ch.title)}</a>
                <span class="chapter-meta">\${ch.pageCount}p • \${ch.dateFormatted}</span>
              </div>
            \`).join('')}
          </div>
        </div>
      \`).join('');

      const standalonesHTML = standalones.map(s => \`
        <div class="story-card">
          <div><a href="html/\${sanitizeFilename(s.title)}.html">\${escapeHtml(s.title)}</a></div>
          <div class="story-meta">
            <span>\${escapeHtml(s.category)}</span>
            \${s.rating > 0 ? '<span class="rating">★ ' + s.rating.toFixed(2) + '</span>' : ''}
            <span>\${s.dateFormatted}</span>
            <span>\${s.pageCount} page\${s.pageCount !== 1 ? 's' : ''}</span>
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
    <p class="sub">Literotica Author Collection</p>
    <div class="stats">
      <div class="stat"><div class="num">\${standalones.length}</div><div class="label">Standalone Stories</div></div>
      <div class="stat"><div class="num">\${seriesGroups.length}</div><div class="label">Series</div></div>
      <div class="stat"><div class="num">\${seriesGroups.reduce((s, g) => s + g.chapters.length, 0)}</div><div class="label">Series Chapters</div></div>
      <div class="stat"><div class="num">\${allStories.length}</div><div class="label">Total Works</div></div>
    </div>
  </div>
  <div class="container">
    \${seriesGroups.length > 0 ? '<h2 class="section-title">📖 Series Collections</h2>' + seriesHTML : ''}
    \${standalones.length > 0 ? '<h2 class="section-title">📄 Standalone Stories</h2>' + standalonesHTML : ''}
  </div>
  <div class="footer">Downloaded with Literotica Downloader V2 • \${new Date().toLocaleDateString()}</div>
</body>
</html>\`;
    }

    return { buildStoryHTML, buildIndexHTML, sanitizeFilename, escapeHtml };
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

    async function buildEPUB(storyData) {
      const zip = new JSZip();
      const uid = generateUUID();
      const { title, author, authorName, category, rating, dateFormatted, description, pages, slug } = storyData;
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

      // Cover page
      const coverXHTML = \`<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>\${safeTitle}</title>
  <style type="text/css">
    body { margin: 0; padding: 0; background: #0a0a12; color: #e8e0ff; font-family: Georgia, serif; }
    .cover { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 3rem 2rem; text-align: center; }
    .site { font-size: 0.85em; color: #6a5a8a; letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 3rem; }
    h1 { font-size: 2.2em; color: #c8a8ff; margin-bottom: 1rem; line-height: 1.3; }
    .by { font-size: 1.1em; color: #8870a8; margin-bottom: 2rem; }
    .meta { font-size: 0.85em; color: #555; line-height: 1.8; }
    .desc { font-style: italic; color: #6a6a8a; margin-top: 1.5rem; font-size: 0.95em; max-width: 480px; }
    .divider { border: none; border-top: 1px solid #2a2a3a; margin: 2rem auto; width: 60px; }
  </style>
</head>
<body>
  <div class="cover">
    <p class="site">Literotica.com</p>
    <h1>\${safeTitle}</h1>
    <p class="by">by \${safeAuthor}</p>
    <hr class="divider"/>
    <div class="meta">
      <p>Category: \${HTMLBuilder.escapeHtml(category)}</p>
      \${rating > 0 ? '<p>Rating: ★ ' + rating.toFixed(2) + ' / 5.00</p>' : ''}
      <p>Published: \${HTMLBuilder.escapeHtml(dateFormatted)}</p>
      <p>\${pages.length} Page\${pages.length !== 1 ? 's' : ''}</p>
    </div>
    \${description ? '<p class="desc">' + HTMLBuilder.escapeHtml(description) + '</p>' : ''}
  </div>
</body>
</html>\`;

      zip.file('OEBPS/cover.xhtml', coverXHTML);

      // Story pages
      const chapterFiles = [];
      pages.forEach((pg, i) => {
        const id = 'page-' + pg.pageNum;
        const filename = 'page' + String(pg.pageNum).padStart(3, '0') + '.xhtml';
        const pageContent = processPageTextEPUB(pg.text);

        const xhtml = \`<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>\${safeTitle}\${pages.length > 1 ? ' — Page ' + pg.pageNum : ''}</title>
  <style type="text/css">
    body { font-family: Georgia, 'Times New Roman', serif; font-size: 1em; line-height: 1.8; color: #1a1a1a; margin: 1.5em 2em; }
    p { margin-bottom: 1em; text-indent: 1.5em; }
    p:first-child { text-indent: 0; }
    h2 { font-size: 1.1em; color: #444; margin: 1.5em 0 0.5em; }
  </style>
</head>
<body>
  \${i === 0 ? '' : '<h2>— Page ' + pg.pageNum + ' —</h2>'}
  \${pageContent}
</body>
</html>\`;

        zip.file('OEBPS/' + filename, xhtml);
        chapterFiles.push({ id, filename, title: pages.length > 1 ? 'Page ' + pg.pageNum : title });
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

      const dateISO = storyData.date ? new Date(storyData.date * 1000).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

      const opf = \`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="BookId">urn:uuid:\${uid}</dc:identifier>
    <dc:title>\${safeTitle}</dc:title>
    <dc:creator opf:role="aut">\${safeAuthor}</dc:creator>
    <dc:subject>\${HTMLBuilder.escapeHtml(category)}</dc:subject>
    <dc:description>\${HTMLBuilder.escapeHtml(description)}</dc:description>
    <dc:publisher>Literotica.com</dc:publisher>
    <dc:date>\${dateISO}</dc:date>
    <dc:language>en</dc:language>
    <dc:source>https://www.literotica.com/s/\${slug}</dc:source>
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

    return { buildEPUB };
  })();

  // ============================================================
  // PHASE 8: ZIP PACKAGE GENERATOR
  // ============================================================

  const ZIPBuilder = (() => {
    async function buildCollection(author, authorName, downloadedStories, selectedFormats, onProgress, errors) {
      const zip = new JSZip();
      const htmlFolder = zip.folder('html');
      const epubFolder = zip.folder('epub');
      const omnibusFolder = zip.folder('omnibus');

      const manifest = {
        generated: new Date().toISOString(),
        author: author,
        authorName: authorName,
        totalStories: downloadedStories.length,
        formats: selectedFormats,
        stories: [],
      };

      let processed = 0;
      const errorLog = [...errors];

      for (const storyData of downloadedStories) {
        const safeName = HTMLBuilder.sanitizeFilename(storyData.title);
        processed++;
        if (onProgress) onProgress(processed, downloadedStories.length, storyData.title);

        try {
          if (selectedFormats.html) {
            const html = HTMLBuilder.buildStoryHTML(storyData);
            const filename = safeName + '.html';
            htmlFolder.file(filename, html);
            manifest.stories.push({ title: storyData.title, html: 'html/' + filename, slug: storyData.slug });
          }

          if (selectedFormats.epub) {
            Logger.info('Generating EPUB: ' + storyData.title);
            const epubBlob = await EPUBBuilder.buildEPUB(storyData);
            const arrayBuffer = await epubBlob.arrayBuffer();
            const filename = safeName + '.epub';
            epubFolder.file(filename, arrayBuffer);
            const lastStory = manifest.stories.find(s => s.slug === storyData.slug);
            if (lastStory) lastStory.epub = 'epub/' + filename;
            else manifest.stories.push({ title: storyData.title, epub: 'epub/' + filename, slug: storyData.slug });
          }
        } catch (err) {
          Logger.error('Export failed for "' + storyData.title + '": ' + err.message);
          errorLog.push({ story: storyData.title, error: err.message });
        }
      }

      // Index HTML
      const { standalones, series } = groupStories(downloadedStories.map(s => ({ ...s, isSeries: false })));
      // Group downloaded series chapters
      const seriesMap = new Map();
      downloadedStories.forEach(s => {
        if (s.seriesId) {
          if (!seriesMap.has(s.seriesId)) {
            seriesMap.set(s.seriesId, { title: s.seriesTitle || 'Unknown Series', chapters: [], category: s.category, rating: 0 });
          }
          seriesMap.get(s.seriesId).chapters.push(s);
        }
      });
      const seriesGroups = Array.from(seriesMap.values());
      const trueStandalones = downloadedStories.filter(s => !s.seriesId);
      const indexHTML = HTMLBuilder.buildIndexHTML(author, authorName, trueStandalones, seriesGroups);
      zip.file('index.html', indexHTML);

      // Manifest
      zip.file('manifest.json', JSON.stringify(manifest, null, 2));

      // Errors log
      if (errorLog.length > 0) {
        const errText = errorLog.map(e => '[ERROR] ' + e.story + ': ' + e.error).join('\\n');
        zip.file('errors.log', errText);
      }

      // Omnibus (combined HTML)
      if (selectedFormats.omnibus) {
        let omnibusHTML = \`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>\${HTMLBuilder.escapeHtml(authorName || author)} — Complete Collection</title>
<style>
  body { font-family: Georgia, serif; font-size: 1.05rem; line-height: 1.8; color: #1a1a1a; max-width: 720px; margin: 0 auto; padding: 2rem; background: #fafaf8; }
  .story-separator { page-break-before: always; border-top: 3px double #ccc; margin: 4rem 0 2rem; padding-top: 2rem; }
  h1.story-title { font-size: 1.8rem; color: #0a0a0a; }
  .story-meta { color: #666; font-size: 0.85rem; margin-bottom: 2rem; font-family: system-ui; }
  p { margin-bottom: 1rem; }
</style></head><body>
<h1 style="text-align:center;font-size:2.2rem;">\${HTMLBuilder.escapeHtml(authorName || author)}</h1>
<p style="text-align:center;color:#888;margin-bottom:3rem;">Complete Literotica Collection</p>\`;

        downloadedStories.forEach((s, i) => {
          omnibusHTML += \`\${i > 0 ? '<div class="story-separator"></div>' : ''}
<h1 class="story-title">\${HTMLBuilder.escapeHtml(s.title)}</h1>
<p class="story-meta">\${HTMLBuilder.escapeHtml(s.category)} • \${s.rating > 0 ? '★ ' + s.rating.toFixed(2) + ' • ' : ''}\${s.dateFormatted}</p>
\${s.pages.map(pg => '<div>' + pg.text + '</div>').join('<hr style="border:none;border-top:1px solid #ddd;margin:1.5rem 0">')}\`;
        });
        omnibusHTML += '</body></html>';
        omnibusFolder.file(HTMLBuilder.sanitizeFilename(authorName || author) + '_complete.html', omnibusHTML);
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

    function getAllStoryIds() {
      const ids = new Set();
      _state.grouped.standalones.forEach(s => ids.add(s.id));
      _state.grouped.series.forEach(s => s.chapters.forEach(c => ids.add(c.id)));
      return ids;
    }

    function selectAll() {
      setState({ selected: getAllStoryIds() });
    }

    function deselectAll() {
      setState({ selected: new Set() });
    }

    function selectRated(minRating) {
      const ids = new Set();
      _state.grouped.standalones.forEach(s => { if (s.rating >= minRating) ids.add(s.id); });
      _state.grouped.series.forEach(s => s.chapters.forEach(c => { if (c.rating >= minRating) ids.add(c.id); }));
      setState({ selected: ids });
    }

    function selectStandalones() {
      const ids = new Set();
      _state.grouped.standalones.forEach(s => ids.add(s.id));
      setState({ selected: ids });
    }

    function selectSeries() {
      const ids = new Set();
      _state.grouped.series.forEach(s => s.chapters.forEach(c => ids.add(c.id)));
      setState({ selected: ids });
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
            <button class="litdl-format-toggle active" id="litdl-fmt-epub">📚 EPUB</button>
            <button class="litdl-format-toggle active" id="litdl-fmt-zip">🗜 ZIP Package</button>
            <button class="litdl-format-toggle" id="litdl-fmt-omnibus">📖 Omnibus</button>
          </div>
          <div style="margin-top:10px;">
            <button class="litdl-btn primary" id="litdl-download-btn" style="width:100%;padding:8px;" disabled>
              ⬇ Download Selected Stories
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

      Logger.info('Literotica Downloader V2 initialized');
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

      // Format toggles
      ['html', 'epub', 'zip', 'omnibus'].forEach(fmt => {
        const btn = panelEl.querySelector('#litdl-fmt-' + fmt);
        btn.onclick = () => {
          btn.classList.toggle('active');
          Settings.set('export' + fmt.charAt(0).toUpperCase() + fmt.slice(1), btn.classList.contains('active'));
        };
      });

      // Apply saved format state
      ['html', 'epub', 'omnibus'].forEach(fmt => {
        const saved = Settings.get('export' + fmt.charAt(0).toUpperCase() + fmt.slice(1));
        if (saved === false) panelEl.querySelector('#litdl-fmt-' + fmt).classList.remove('active');
      });
      if (Settings.get('exportOmnibus')) panelEl.querySelector('#litdl-fmt-omnibus').classList.add('active');

      // Download button
      panelEl.querySelector('#litdl-download-btn').onclick = startDownload;
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

    State.setState({ downloading: true, errors: [] });
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

    for (let i = 0; i < selectedStories.length; i++) {
      const story = selectedStories[i];
      UI.updateProgress(i, selectedStories.length, 'Fetching: ' + story.title + ' (' + (i + 1) + '/' + selectedStories.length + ')');
      Logger.info('Fetching story ' + (i + 1) + ' of ' + selectedStories.length + ': "' + story.title + '"');

      try {
        const data = await fetchStoryContent(story);
        downloadedStories.push(data);
        Logger.success('✓ ' + story.title + ' — ' + data.pages.length + ' pages');
      } catch (err) {
        Logger.error('✗ Failed: ' + story.title + ' — ' + err.message);
        errors.push({ story: story.title, error: err.message });
        // Isolation: continue
      }
    }

    Logger.info('Content fetch complete. ' + downloadedStories.length + ' stories ready, ' + errors.length + ' failed.');

    if (downloadedStories.length === 0) {
      Logger.error('No stories could be downloaded. Check network or story availability.');
      State.setState({ downloading: false });
      UI.hideProgress();
      return;
    }

    // Determine formats
    function isFormatEnabled(selector, fallback) {
      const el = panelEl ? panelEl.querySelector(selector) : null;
      return el ? el.classList.contains('active') : fallback;
    }

    const fmtHTML = isFormatEnabled('#litdl-fmt-html', true);
    const fmtEPUB = isFormatEnabled('#litdl-fmt-epub', true);
    const fmtZIP = isFormatEnabled('#litdl-fmt-zip', true);
    const fmtOmnibus = isFormatEnabled('#litdl-fmt-omnibus', false);

    const selectedFormats = { html: fmtHTML, epub: fmtEPUB, zip: fmtZIP, omnibus: fmtOmnibus };

    if (!fmtZIP) {
      // Download individual files
      if (fmtHTML) {
        for (const story of downloadedStories) {
          const html = HTMLBuilder.buildStoryHTML(story);
          const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
          saveAs(blob, HTMLBuilder.sanitizeFilename(story.title) + '.html');
          await sleep(100);
        }
      }
      if (fmtEPUB) {
        for (let i = 0; i < downloadedStories.length; i++) {
          const story = downloadedStories[i];
          UI.updateProgress(i, downloadedStories.length, 'Generating EPUB: ' + story.title);
          Logger.info('Building EPUB: ' + story.title);
          try {
            const blob = await EPUBBuilder.buildEPUB(story);
            saveAs(blob, HTMLBuilder.sanitizeFilename(story.title) + '.epub');
          } catch (err) {
            Logger.error('EPUB failed for ' + story.title + ': ' + err.message);
          }
          await sleep(150);
        }
      }
    } else {
      // Build ZIP package
      UI.updateProgress(downloadedStories.length, downloadedStories.length, 'Building ZIP package...');
      Logger.info('Building ZIP package...');

      try {
        const zipBlob = await ZIPBuilder.buildCollection(
          state.author,
          state.authorName,
          downloadedStories,
          selectedFormats,
          (current, total, label) => {
            UI.updateProgress(current, total, 'Packaging: ' + label);
          },
          errors
        );

        const authorSafe = HTMLBuilder.sanitizeFilename(state.authorName || state.author || 'author');
        const filename = authorSafe + '_literotica_collection.zip';
        saveAs(zipBlob, filename);
        Logger.success('✓ ZIP saved: ' + filename + ' (' + downloadedStories.length + ' stories)');
      } catch (err) {
        Logger.error('ZIP generation failed: ' + err.message);
      }
    }

    State.setState({ downloading: false });
    UI.hideProgress();

    Logger.success('Download complete! ' + downloadedStories.length + ' stories, ' + errors.length + ' errors.');
  }

  // Store panel ref
  let panelEl;

  // ============================================================
  // MAIN INITIALIZATION
  // ============================================================

  let didInit = false;
  let initInFlight = false;
  let routeWatcherStarted = false;

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

    // Fetch author profile
    UI.setLoading('Fetching author profile...');
    Logger.info('Loading author profile for: ' + author);

    const profile = await fetchAuthorProfile(author);
    if (profile) {
      const authorName = profile.name || profile.username || author;
      State.setState({ authorProfile: profile, authorName });
      Logger.info('Author: ' + authorName);
    }

    // Fetch full catalog
    UI.setLoading('Fetching story catalog...');
    Logger.info('Loading full story catalog...');

    let catalog;
    try {
      catalog = await fetchAuthorCatalog(author, (loaded, total) => {
        UI.updateProgress(loaded, total || loaded, 'Fetching catalog: ' + loaded + (total ? ' of ' + total : '') + ' entries');
      });
    } catch (err) {
      Logger.error('Catalog fetch failed: ' + err.message);
      UI.setLoading('Failed to load catalog. Check console for details.');
      return false;
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

    initInFlight = true;
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
