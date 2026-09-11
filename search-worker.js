const cache = new Map();
const ASSET_VERSION = "20260716-4";

async function loadTranslation(translation) {
  if (cache.has(translation)) return cache.get(translation);
  const response = await fetch(`./data/search/${translation}.json?v=${ASSET_VERSION}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load ${translation} search data (${response.status})`);
  const data = await response.json();
  cache.set(translation, data);
  return data;
}

self.addEventListener("message", async (event) => {
  const { type, requestId, query, translations } = event.data;
  if (type !== "search") return;

  const started = performance.now();
  try {
    const datasets = [];
    for (let index = 0; index < translations.length; index += 1) {
      const translation = translations[index];
      self.postMessage({
        type: "progress",
        requestId,
        text: `Preparing ${translation} search data · ${index + 1}/${translations.length}`,
      });
      datasets.push([translation, await loadTranslation(translation)]);
    }

    // Space-separated terms are independent search words, matched in any
    // order/position (e.g. "예수 하나님" finds verses containing both words
    // anywhere, not just that exact two-word phrase).
    const terms = query.normalize("NFKC").toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const matches = [];
    const verseKeysByBook = new Map();
    let totalTranslationMatches = 0;

    for (const [translation, rows] of datasets) {
      for (const [book, chapter, verse, text] of rows) {
        const normalizedText = text.normalize("NFKC").toLocaleLowerCase();
        if (terms.every((term) => normalizedText.includes(term))) {
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
