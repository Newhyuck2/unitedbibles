// The asset version this worker was started with (the page loads it as
// search-worker.js?v=<version>), so the index files below are requested at, and
// cached under, the same version as the rest of the site. (It used to carry a
// hard-coded version of its own that nothing kept up to date.)
const ASSET_VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE_PREFIX = "search-index:";
const CACHE_NAME = `${CACHE_PREFIX}${ASSET_VERSION}`;

// translation -> Promise of { rows, normalized }. Kept as the promise itself so
// two searches in a row (or one asking for the same version twice) share one
// download; a failed one is dropped so the next search tries again.
const loaded = new Map();

let cachePromise = null;

// Each translation's search index is 4-6 MB (1.2-1.5 MB on the wire). Besides
// the browser's own HTTP cache, they are kept in Cache Storage under the
// current asset version, so a later visit reads them from disk instead of
// downloading them again; a new asset version starts a fresh cache and drops
// the old ones. Where Cache Storage isn't available this is just a fetch.
function openIndexCache() {
  if (!cachePromise) {
    cachePromise = (async () => {
      try {
        if (typeof caches === "undefined") return null;
        const cache = await caches.open(CACHE_NAME);
        caches.keys()
          .then((names) => Promise.all(names
            .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
            .map((name) => caches.delete(name))))
          .catch(() => {});
        return cache;
      } catch {
        return null;
      }
    })();
  }
  return cachePromise;
}

async function fetchIndexRows(url, translation) {
  const cache = await openIndexCache();
  if (cache) {
    try {
      const hit = await cache.match(url);
      if (hit) return await hit.json();
    } catch {
      // An unreadable entry just means going to the network below.
    }
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${translation} search data (${response.status})`);
  if (cache) cache.put(url, response.clone()).catch(() => {});
  return response.json();
}

// The text of every verse is normalized (NFKC, lower-cased) once, when its
// translation is loaded, rather than again for every verse on every search:
// that was most of what a search cost once the index was in memory. A verse
// that comes out the same (most Korean and Chinese text, which has no case)
// shares its original string instead of holding a second copy.
function loadTranslation(translation) {
  if (!loaded.has(translation)) {
    const promise = fetchIndexRows(`./data/search/${translation}.json?v=${ASSET_VERSION}`, translation).then((rows) => {
      const normalized = new Array(rows.length);
      for (let index = 0; index < rows.length; index += 1) {
        const text = rows[index][3];
        const folded = text.normalize("NFKC").toLocaleLowerCase();
        normalized[index] = folded === text ? text : folded;
      }
      return { rows, normalized };
    });
    loaded.set(translation, promise);
    promise.catch(() => {
      if (loaded.get(translation) === promise) loaded.delete(translation);
    });
  }
  return loaded.get(translation);
}

self.addEventListener("message", async (event) => {
  const { type, requestId, query, translations } = event.data;
  if (type !== "search") return;

  const started = performance.now();
  try {
    // All the translations' indexes are fetched at once (they used to be
    // fetched one after another), the search waiting for the slowest.
    let ready = 0;
    const datasets = await Promise.all(translations.map(async (translation) => {
      const dataset = await loadTranslation(translation);
      ready += 1;
      self.postMessage({
        type: "progress",
        requestId,
        text: `Preparing ${translation} search data · ${ready}/${translations.length}`,
      });
      return [translation, dataset];
    }));

    // Space-separated terms are independent search words, matched in any
    // order/position (e.g. "예수 하나님" finds verses containing both words
    // anywhere, not just that exact two-word phrase).
    const terms = query.normalize("NFKC").toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const matches = [];
    const verseKeysByBook = new Map();
    let totalTranslationMatches = 0;

    for (const [translation, { rows, normalized }] of datasets) {
      for (let index = 0; index < rows.length; index += 1) {
        const normalizedText = normalized[index];
        if (terms.every((term) => normalizedText.includes(term))) {
          const [book, chapter, verse, text] = rows[index];
          totalTranslationMatches += 1;
          if (!verseKeysByBook.has(book)) verseKeysByBook.set(book, new Set());
          verseKeysByBook.get(book).add(`${chapter}:${verse}`);
          matches.push([translation, book, chapter, verse, text]);
        }
      }
    }

    const bookCounts = [...verseKeysByBook]
      .map(([book, verses]) => [book, verses.size])
      .sort((a, b) => a[0] - b[0]);

    self.postMessage({
      type: "result",
      requestId,
      query,
      matches,
      bookCounts,
      totalTranslationMatches,
      elapsedMs: performance.now() - started,
    });
  } catch (error) {
    self.postMessage({ type: "error", requestId, error: error.message });
  }
});
