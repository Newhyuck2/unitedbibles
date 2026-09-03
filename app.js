const STORAGE_KEY = "side-by-side-bible:v1";
const TRANSLATION_COLORS = {
  ESV: "#9b5c34",
  NIV: "#476f9b",
  KJV: "#79652f",
  NASB: "#42808a",
  NRSV: "#8a6d1f",
  NLT: "#8c4678",
  GAE: "#2f7663",
  KRV: "#6b7d3d",
  SAENEW: "#805692",
  WLB: "#a24f62",
  KLB: "#b0632e",
  EASY: "#3c8c46",
  CNV: "#5d5fa0",
  TB: "#c1442d",
  HEB: "#9c6b1f",
  GRK: "#4a5aa8",
  STR: "#96591f",
  TSK: "#5a6b8a",
  NOTE: "#3d7a7a",
};
// The six options in the highlight dialog's own color picker (see
// #highlight-color-group in index.html, whose swatches paint these same
// hex values via a matching data-highlight-color CSS selector) -- kept
// here too since applyHighlight/buildTranslationLinesInto need the actual
// color to set as each highlighted verse's own --highlight-color.
const HIGHLIGHT_COLORS = {
  red: "#ffd9d9",
  orange: "#ffebd3",
  yellow: "#fff9cf",
  green: "#dbf2d7",
  blue: "#d9ecfb",
  purple: "#eee2f8",
};
const TRANSLATION_GROUPS = [
  { label: "English", ids: ["NIV", "ESV", "KJV", "NASB", "NRSV", "NLT"] },
  { label: "Korean", ids: ["GAE", "KRV", "SAENEW", "WLB", "KLB", "EASY"] },
  { label: "Chinese", ids: ["CNV"] },
  { label: "Indonesian", ids: ["TB"] },
];
const TRANSLATION_CANONICAL_ORDER = TRANSLATION_GROUPS.flatMap((group) => group.ids);
const DEFAULT_ENABLED_TRANSLATIONS = ["NIV", "GAE"];
const DEFAULT_HIGHLIGHTED_TRANSLATIONS = [];
const DEFAULT_DIMMED_TRANSLATIONS = [];

// Hebrew/Greek interlinear "translations" are synthetic: they are not part of
// manifest.translations (no exported text data exists for them yet), so they
// are resolved via ORIGINAL_LANGUAGE_META instead of the manifest lookup.
// Exactly one of the two may be enabled per panel at a time, and it always
// tracks the testament of the panel's current book (see
// syncOriginalLanguageForTestament).
const ORIGINAL_LANGUAGE_META = {
  HEB: { id: "HEB", label: "HEB", name: "Hebrew Interlinear", testament: "old" },
  GRK: { id: "GRK", label: "GRK", name: "Greek Interlinear", testament: "new" },
};
const ORIGINAL_LANGUAGE_IDS = Object.keys(ORIGINAL_LANGUAGE_META);

// STR/TSK are "study tool" slots, not translations: picking one shows that
// tool's own content (Strong's dictionary, TSK cross-references) embedded in
// the panel instead of a version's Bible text, in place of whatever
// translations are currently enabled there (see
// toggleStudyTool/renderPanelBody). Like HEB/GRK, they carry no manifest
// entry, so they're resolved here rather than through the manifest lookup.
const STUDY_TOOL_META = {
  STR: { id: "STR", label: "STR", name: "Strong's Concordance" },
  TSK: { id: "TSK", label: "TSK", name: "Treasury of Scripture Knowledge" },
};
const STUDY_TOOL_IDS = Object.keys(STUDY_TOOL_META);

// NOTE sits in the translation picker's own "Study" section alongside STR/
// TSK (see renderDialogTranslationPickerMenu), but unlike them it is NOT a
// study tool: it never replaces the panel's own translations (see
// STUDY_TAB_IDS below, kept deliberately separate from STUDY_TOOL_IDS so
// none of the exclusive-pane logic above ever picks it up), and it carries
// no Bible text of its own to search/copy/index (see isIndexableTranslationId)
// -- see buildTranslationLinesInto's own NOTE branch for what it renders
// instead: one row per already-enabled real translation, showing that
// translation's own note for this verse in place of its Bible text.
const NOTE_TRANSLATION_META = { NOTE: { id: "NOTE", label: "NOTE", name: "Note" } };
const STUDY_TAB_IDS = [...STUDY_TOOL_IDS, "NOTE"];

function blendTranslationColors(whiteRatio) {
  return Object.fromEntries(
    Object.entries(TRANSLATION_COLORS).map(([id, hex]) => {
      const channel = (start) => {
        const value = Number.parseInt(hex.slice(start, start + 2), 16);
        return Math.round(value + (255 - value) * whiteRatio);
      };
      return [id, `rgb(${channel(1)}, ${channel(3)}, ${channel(5)})`];
    }),
  );
}
// Chip background: very pale. Chip border, once highlighted: midway between
// that pale background and the translation's own full-strength text color.
// Dimmed chip text: paler than full strength but still legible on white.
const PALE_TRANSLATION_COLORS = blendTranslationColors(0.85);
const MEDIUM_TRANSLATION_COLORS = blendTranslationColors(0.45);
const DIM_TRANSLATION_COLORS = blendTranslationColors(0.55);
const ASSET_VERSION = document.querySelector('meta[name="asset-version"]').content;
const MOBILE_LAYOUT_QUERY = "(max-width: 820px), (max-width: 1366px) and (any-pointer: coarse)";
const mobileLayout = window.matchMedia(MOBILE_LAYOUT_QUERY);
const landscapeMobile = window.matchMedia(
  "(orientation: landscape) and (max-width: 1366px) and (any-pointer: coarse)",
);
const touchPanelToggleLayout = window.matchMedia(
  "(orientation: landscape) and (max-width: 1366px) and (any-pointer: coarse), "
    + "(min-width: 600px) and (max-width: 1366px) and (any-pointer: coarse)",
);
const phonePortraitLayout = window.matchMedia("(orientation: portrait) and (max-width: 599px)");
const portraitLayout = window.matchMedia("(orientation: portrait)");
// Bare touch-capability check, independent of width -- used to tell a
// genuine touch/mobile layout (where touchPanelCount's own 1-or-2 choice
// is a real, deliberate preference) apart from a plain mouse-driven
// desktop window that has simply narrowed past mobileLayout's own
// width-only breakpoint (where it isn't a preference at all, just this
// session's last-saved default -- see updatePanelCountControls).
const coarsePointer = window.matchMedia("(any-pointer: coarse)");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const panelTrack = document.querySelector("#panel-track");
const panelTemplate = document.querySelector("#panel-template");
const addPanelButton = document.querySelector("#add-panel");
const cancelMovePickingButton = document.querySelector("#cancel-move-picking");
const searchDialog = document.querySelector("#search-dialog");
const openSearchButton = document.querySelector("#open-search");
const closeSearchButton = document.querySelector("#close-search");
const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#search-input");
const searchInputClear = document.querySelector("#search-input-clear");
const searchHistoryBackButton = document.querySelector("#search-history-back");
const searchHistoryForwardButton = document.querySelector("#search-history-forward");
const searchTranslationList = document.querySelector("#search-translation-list");
const searchTranslationPicker = document.querySelector("#search-translation-picker");
const searchTranslationPickerToggle = document.querySelector("#search-translation-picker-toggle");
const searchTranslationPickerMenu = document.querySelector("#search-translation-picker-menu");
const searchMeta = document.querySelector("#search-meta");
const searchTranslationControls = document.querySelector("#search-translation-controls");
const searchBookList = document.querySelector("#search-book-list");
const searchResults = document.querySelector("#search-results");
const fontSizeDownButton = document.querySelector("#font-size-down");
const fontSizeUpButton = document.querySelector("#font-size-up");
const fontSizeValue = document.querySelector("#font-size-value");
const panelCountOneButton = document.querySelector("#panel-count-one");
const panelCountTwoButton = document.querySelector("#panel-count-two");
const panelFitCountInput = document.querySelector("#panel-fit-count-input");
const panelFitCountMenu = document.querySelector(".panel-fit-count-combo .combo-menu");
const copyDialog = document.querySelector("#copy-dialog");
const closeCopyButton = document.querySelector("#close-copy");
const cancelCopyButton = document.querySelector("#cancel-copy");
const confirmCopyButton = document.querySelector("#confirm-copy");
const copyBookInput = document.querySelector("#copy-book-input");
const copyChapterInput = document.querySelector("#copy-chapter-input");
const copyStartVerseInput = document.querySelector("#copy-start-verse-input");
const copyEndVerseInput = document.querySelector("#copy-end-verse-input");
const copyTranslations = document.querySelector("#copy-translations");
const copyTranslationPicker = document.querySelector("#copy-translation-picker");
const copyTranslationPickerToggle = document.querySelector("#copy-translation-picker-toggle");
const copyTranslationPickerMenu = document.querySelector("#copy-translation-picker-menu");
const copyStatus = document.querySelector("#copy-status");
const copyOrderOptions = copyDialog.querySelectorAll(".copy-order-option[data-copy-order]");
const copyReadingModeToggle = document.querySelector("#copy-reading-mode-toggle");
const copyOrderLegendEl = document.querySelector("#copy-order-legend");
const copyOrderGroupEl = document.querySelector("#copy-order-group");
const copyNumberingGroupEl = document.querySelector("#copy-numbering-group");
const copyNumberingOptions = copyNumberingGroupEl.querySelectorAll(".copy-order-option[data-copy-numbering]");
let copyOrder = "verse";
let copyReadingModeOn = false;
let copyReadingNumbering = "off";
let copyBook = 0;
let copyChapter = 1;
let copyStartVerse = 1;
let copyEndVerse = 1;
// The exact verse numbers selected when the dialog was opened (see
// openCopyDialog/openCopyDialogForVerse) -- distinct from the
// copyStartVerse..copyEndVerse span only when that selection was
// individual-mode with gaps (see copyEffectiveVerseNumbers, which is what
// actually decides what gets copied).
let copySelectedVerseNumbers = null;
let copySelectedVerseNumbersBook = null;
let copySelectedVerseNumbersChapter = null;
let copyChapterDataCache = null;
let copyBookCombo = null;
let copyChapterCombo = null;
let copyStartVerseCombo = null;
let copyEndVerseCombo = null;
const highlightDialog = document.querySelector("#highlight-dialog");
const closeHighlightButton = document.querySelector("#close-highlight");
const confirmHighlightButton = document.querySelector("#confirm-highlight");
const highlightBookInput = document.querySelector("#highlight-book-input");
const highlightChapterInput = document.querySelector("#highlight-chapter-input");
const highlightStartVerseInput = document.querySelector("#highlight-start-verse-input");
const highlightEndVerseInput = document.querySelector("#highlight-end-verse-input");
const highlightTranslations = document.querySelector("#highlight-translations");
const highlightTranslationPicker = document.querySelector("#highlight-translation-picker");
const highlightTranslationPickerToggle = document.querySelector("#highlight-translation-picker-toggle");
const highlightTranslationPickerMenu = document.querySelector("#highlight-translation-picker-menu");
const highlightStatus = document.querySelector("#highlight-status");
const highlightColorOptions = highlightDialog.querySelectorAll(".highlight-color-option[data-highlight-color]");
const highlightManagePopup = document.querySelector("#highlight-manage-popup");
const highlightManageSwatch = document.querySelector("#highlight-manage-swatch");
const highlightManageRemoveButton = document.querySelector("#highlight-manage-remove");
const highlightManageColors = document.querySelector("#highlight-manage-colors");
const highlightManageColorOptions = highlightManageColors.querySelectorAll(".highlight-color-option[data-highlight-color]");
let highlightColor = "red";
let highlightBook = 0;
let highlightChapter = 1;
let highlightStartVerse = 1;
let highlightEndVerse = 1;
// The exact verse numbers selected when the dialog was opened (see
// openHighlightDialog) -- distinct from the
// highlightStartVerse..highlightEndVerse span only when that selection was
// individual-mode with gaps (see highlightEffectiveVerseNumbers, which is
// what applyHighlight actually marks). Mirrors copySelectedVerseNumbers
// in the copy dialog above.
let highlightSelectedVerseNumbers = null;
let highlightSelectedVerseNumbersBook = null;
let highlightSelectedVerseNumbersChapter = null;
let highlightChapterDataCache = null;
let highlightBookCombo = null;
let highlightChapterCombo = null;
let highlightStartVerseCombo = null;
let highlightEndVerseCombo = null;
let highlightPanelState = null;
let highlightTranslationOrder = [];
let highlightTranslationControl = null;
// The verse+translation a still-open highlight-manage popup (see
// showHighlightManagePopup) is currently pointed at -- null whenever it's
// hidden, since there's nothing for its own remove button to act on then.
let highlightManageTarget = null;
// The last-character rect the popup was opened against, and the panel its
// own bounds get clamped to (see positionHighlightManagePopup) -- both
// null whenever the popup is hidden. Cached rather than re-read from the
// original .translation-text-highlight element each time, since that
// element gets replaced whenever a re-color triggers a re-render.
let highlightManageAnchorRect = null;
let highlightManagePanelEl = null;
const bookmarkManagePopup = document.querySelector("#bookmark-manage-popup");
const bookmarkManageRemoveButton = document.querySelector("#bookmark-manage-remove");
// The verse a still-open bookmark-manage popup (see showBookmarkManagePopup)
// is currently pointed at -- null whenever it's hidden.
let bookmarkManageTarget = null;
let bookmarkManageAnchorRect = null;
let bookmarkManagePanelEl = null;
// ---- Note dialog -- same shape as the highlight dialog above (range
// row, version picker, showModal/populate/close), minus the color picker
// (see #note-dialog in index.html: a free-text textarea sits in that
// fieldset's spot instead) and with a note icon on its own confirm
// button instead. ----
const noteDialog = document.querySelector("#note-dialog");
const closeNoteButton = document.querySelector("#close-note");
const confirmNoteButton = document.querySelector("#confirm-note");
const noteBookInput = document.querySelector("#note-book-input");
const noteChapterInput = document.querySelector("#note-chapter-input");
const noteStartVerseInput = document.querySelector("#note-start-verse-input");
const noteEndVerseInput = document.querySelector("#note-end-verse-input");
const noteStatus = document.querySelector("#note-status");
const noteTextarea = document.querySelector("#note-textarea");
let noteBook = 0;
let noteChapter = 1;
let noteStartVerse = 1;
let noteEndVerse = 1;
// Mirrors copySelectedVerseNumbers/highlightSelectedVerseNumbers above --
// see noteEffectiveVerseNumbers.
let noteSelectedVerseNumbers = null;
let noteSelectedVerseNumbersBook = null;
let noteSelectedVerseNumbersChapter = null;
let noteChapterDataCache = null;
let noteBookCombo = null;
let noteChapterCombo = null;
let noteStartVerseCombo = null;
let noteEndVerseCombo = null;
let notePanelState = null;
const noteViewPopup = document.querySelector("#note-view-popup");
const noteViewTitle = document.querySelector("#note-view-title");
const noteViewBody = document.querySelector("#note-view-body");
const noteViewRemoveButton = document.querySelector("#note-view-remove");
// The translation/book/chapter/verse a still-open note-view popup is
// currently showing -- null whenever hidden.
let noteViewTarget = null;
// The anchor rect (and panel bounds to clamp against) a still-open
// note-view popup is currently positioned from -- null whenever hidden.
let noteViewAnchorRect = null;
let noteViewPanelEl = null;
let pendingMoveReference = null;
const cancelLinkPickingButton = document.querySelector("#cancel-link-picking");
// Which panel is currently picking a link target (see enterLinkPicking) --
// null outside link-picking mode. Never persisted: unlike linkGroupId
// itself (below), which survives reload, mid-pick state has no picking UI
// left open to resume once the page reloads, so a stale source here would
// be meaningless to keep around, same as move-picking's own
// pendingMoveReference already is.
let pendingLinkSource = null;
// Which panel's own "..." popup (see togglePanelMoreMenu) is currently
// open -- null otherwise. Same "never persisted, resets on reload" as
// pendingLinkSource above -- there's no popup left open to resume either.
let openPanelMoreMenuId = null;
// Panels that share a linkGroupId always show the same book/chapter/verse
// (see goToPassage's own fan-out), scroll together, and match verse-row
// heights (see equalizeGroupRowHeights). Each panel's own linkGroupId *is*
// persisted (see saveState/sanitizeState), so restored groups survive
// reload -- only this counter resets to 0 each session; init() catches it
// up to whatever ids come back from storage so a group created fresh this
// session can never collide with (and silently merge into) one just
// restored.
let linkGroupIdCounter = 0;
const strongsDialog = document.querySelector("#strongs-dialog");
const closeStrongsButton = document.querySelector("#close-strongs");
const strongsDialogTitle = document.querySelector("#strongs-dialog-title");
const strongsBiblehubLink = document.querySelector("#strongs-biblehub-link");
const strongsDialogBody = document.querySelector("#strongs-dialog-body");
const strongsNav = document.querySelector("#strongs-nav");
const strongsNavPrev = document.querySelector("#strongs-nav-prev");
const strongsNavNext = document.querySelector("#strongs-nav-next");
const strongsLangPicker = document.querySelector("#strongs-lang-picker");
const strongsLangToggle = document.querySelector("#strongs-lang-toggle");
const strongsLangToggleLabel = document.querySelector("#strongs-lang-toggle-label");
const strongsLangMenu = document.querySelector("#strongs-lang-menu");
const strongsNavNumber = document.querySelector("#strongs-nav-number");
const strongsNavEnglish = document.querySelector("#strongs-nav-english");
const strongsNavEnglishClear = document.querySelector("#strongs-nav-english-clear");
const strongsNavEnglishWrap = document.querySelector("#strongs-nav-english-wrap");
const strongsNavSuggestions = document.querySelector("#strongs-nav-suggestions");
const strongsNavSearch = document.querySelector("#strongs-nav-search");
const STRONGS_MAX_NUMBER = { H: 8674, G: 5624 };
const tskDialog = document.querySelector("#tsk-dialog");
const closeTskButton = document.querySelector("#close-tsk");
const tskDialogBody = document.querySelector("#tsk-dialog-body");
const tskHistoryBackButton = document.querySelector("#tsk-history-back");
const tskHistoryForwardButton = document.querySelector("#tsk-history-forward");
const tskBookInput = document.querySelector("#tsk-book-input");
const tskChapterInput = document.querySelector("#tsk-chapter-input");
const tskVerseInput = document.querySelector("#tsk-verse-input");
const tskTranslationControls = document.querySelector("#tsk-translation-controls");
const tskTranslationPicker = document.querySelector("#tsk-translation-picker");
const tskTranslationPickerToggle = document.querySelector("#tsk-translation-picker-toggle");
const tskTranslationPickerMenu = document.querySelector("#tsk-translation-picker-menu");
const tskTranslationList = document.querySelector("#tsk-translations");
const tskVerseText = document.querySelector("#tsk-verse-text");
const siteBrand = document.querySelector("#site-brand");
const panelOptionsToggle = document.querySelector("#panel-options-toggle");
const panelOptionsDialog = document.querySelector("#panel-options-dialog");
const panelOptionsHighlightButton = document.querySelector("#panel-options-highlight");
const panelOptionsBookmarkButton = document.querySelector("#panel-options-bookmark");
const panelOptionsNoteButton = document.querySelector("#panel-options-note");
const panelOptionsDictionaryButton = document.querySelector("#panel-options-dictionary");
const panelOptionsTskButton = document.querySelector("#panel-options-tsk");
const panelOptionsInfoButton = document.querySelector("#panel-options-info");
const highlightListDialog = document.querySelector("#highlight-list-dialog");
const closeHighlightListButton = document.querySelector("#close-highlight-list");
const highlightListBody = document.querySelector("#highlight-list-body");
const bookmarkListDialog = document.querySelector("#bookmark-list-dialog");
const closeBookmarkListButton = document.querySelector("#close-bookmark-list");
const bookmarkListBody = document.querySelector("#bookmark-list-body");
const bookmarkListTranslationPicker = document.querySelector("#bookmark-list-translation-picker");
const bookmarkListTranslationPickerToggle = document.querySelector("#bookmark-list-translation-picker-toggle");
const bookmarkListTranslationPickerMenu = document.querySelector("#bookmark-list-translation-picker-menu");
const bookmarkListTranslationList = document.querySelector("#bookmark-list-translations");
const noteListDialog = document.querySelector("#note-list-dialog");
const closeNoteListButton = document.querySelector("#close-note-list");
const noteListBody = document.querySelector("#note-list-body");
const infoDialog = document.querySelector("#info-dialog");
const closeInfoButton = document.querySelector("#close-info");
const infoNav = document.querySelector("#info-nav");
const infoContent = document.querySelector("#info-content");

let manifest;
let state;
let activePanelId;
let panelIdCounter = 0;
let searchRequestId = 0;
let copyPanelState = null;
let copyTranslationOrder = [];
let copyTranslationControl = null;
let searchTranslationOrder = [];
let searchTranslationControl = null;
// The TSK dialog browses independently of any reading panel, like a small
// panel of its own -- book/chapter/verse combos, a translation picker, and
// the verse text (data), all scoped to whichever verse the link icon in
// copy-mode was last opened for.
const tskViewState = { book: 0, chapter: 1, verse: 1, data: null, anchors: [] };
let tskTranslationOrder = ["KJV"];
let tskTranslationControl = null;
let tskBookCombo = null;
let tskChapterCombo = null;
let tskVerseCombo = null;
let panelMutationInProgress = false;
let panelLayoutFrame = 0;
const chapterCache = new Map();
const interlinearCache = new Map();
let strongsDataPromise = null;
const englishmansCache = new Map();
const tskCache = new Map();
const panelElements = new Map();
const searchWorker = new Worker(`./search-worker.js?v=${ASSET_VERSION}`);

function freshState() {
  return {
    fontSize: 14,
    touchPanelCount: null,
    desktopPanelMode: null,
    // How many panels' worth of width the "fit" preset (see
    // setDesktopPanelMode) divides the screen into -- shown and changed via
    // its own selector, independent of whether that preset is actually the
    // active desktopPanelMode right now.
    panelFitCount: 2,
    copySelectionMode: "range",
    // Verse-text highlights, global rather than per-panel -- keyed by
    // translation/book/chapter/verse (see highlightKey), independent of
    // which panel(s) happen to be showing that passage right now, so a
    // highlight made in one panel shows up in any other panel (or a fresh
    // one added later) displaying the same translation/verse.
    highlights: {},
    // Bookmarked verse numbers -- keyed by book/chapter/verse only (see
    // bookmarkKey), independent of translation and panel, same as
    // highlights above.
    bookmarks: {},
    // Per-verse notes -- keyed by book/chapter/verse only (see noteKey),
    // independent of translation and panel, same shape as bookmarks above.
    notes: {},
    panels: [{
      book: 0,
      chapter: 1,
      verse: 1,
      enabledTranslations: [...DEFAULT_ENABLED_TRANSLATIONS],
      highlightedTranslations: [...DEFAULT_HIGHLIGHTED_TRANSLATIONS],
      dimmedTranslations: [...DEFAULT_DIMMED_TRANSLATIONS],
      originalLanguageHidden: false,
      activeStudyTool: null,
      readingMode: false,
      translationNamesShown: true,
      history: [{ book: 0, chapter: 1, verse: 1 }],
      historyIndex: 0,
    }],
  };
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!stored || !Array.isArray(stored.panels)) return freshState();
    return { ...freshState(), ...stored };
  } catch {
    return freshState();
  }
}

function sanitizeState() {
  const validTranslations = new Set([
    ...manifest.translations.map((item) => item.id),
    ...ORIGINAL_LANGUAGE_IDS,
    ...STUDY_TAB_IDS,
  ]);

  // Translations and verse layout used to be single global settings shared
  // by every panel; saves from before the per-panel switch carry them at
  // the top level here. Treat those as each panel's starting point, then
  // drop the globals so the per-panel fields are the only source of truth.
  let legacyEnabled = null;
  if (Array.isArray(state.enabledTranslations)) {
    legacyEnabled = state.enabledTranslations.filter((id) => validTranslations.has(id));
    if (Array.isArray(state.translationOrder)) {
      // Migrate saves from when a separate translationOrder drove the chip row.
      const position = new Map(state.translationOrder.map((id, index) => [id, index]));
      legacyEnabled.sort((a, b) => (position.get(a) ?? 0) - (position.get(b) ?? 0));
    }
    legacyEnabled = [...new Set(legacyEnabled)];
  }
  delete state.enabledTranslations;
  delete state.translationOrder;
  delete state.verseLayout;

  state.fontSize = Math.max(10, Math.min(Number(state.fontSize) || 14, 23));
  state.copySelectionMode = state.copySelectionMode === "individual" ? "individual" : "range";
  {
    const rawHighlights = state.highlights && typeof state.highlights === "object" && !Array.isArray(state.highlights)
      ? state.highlights
      : {};
    state.highlights = Object.fromEntries(
      Object.entries(rawHighlights).filter(([, color]) => Object.hasOwn(HIGHLIGHT_COLORS, color)),
    );
  }
  {
    const rawBookmarks = state.bookmarks && typeof state.bookmarks === "object" && !Array.isArray(state.bookmarks)
      ? state.bookmarks
      : {};
    // bookmarkKey is "book:chapter:verse" (3 numeric parts) -- a save from
    // this app's earlier, since-reverted per-translation bookmark dialog
    // used a 4-part "translation:book:chapter:verse" key instead, and any
    // left over from that phase would otherwise silently pass the
    // marked === true check below and crash the Bookmark list dialog later
    // (manifest.books[NaN] from parsing "translation" as the book number).
    state.bookmarks = Object.fromEntries(
      Object.entries(rawBookmarks).filter(([key, marked]) => {
        if (marked !== true) return false;
        const parts = key.split(":");
        return parts.length === 3 && parts.every((part) => /^\d+$/.test(part));
      }),
    );
  }
  {
    const rawNotes = state.notes && typeof state.notes === "object" && !Array.isArray(state.notes)
      ? state.notes
      : {};
    // noteKey is "book:chapter:verse" (3 numeric parts) -- a save from this
    // app's earlier, since-reverted per-translation note design used a
    // 4-part "translation:book:chapter:verse" key instead, and any left
    // over from that phase would otherwise pass the text check below and
    // crash the same way a leftover 4-part bookmark key did (see above).
    state.notes = Object.fromEntries(
      Object.entries(rawNotes).filter(([key, text]) => {
        if (typeof text !== "string" || text.trim() === "") return false;
        const parts = key.split(":");
        return parts.length === 3 && parts.every((part) => /^\d+$/.test(part));
      }),
    );
  }
  const savedPanelCount = Number(state.touchPanelCount);
  state.touchPanelCount = phonePortraitLayout.matches
    ? 1
    : savedPanelCount === 1 || savedPanelCount === 2
    ? savedPanelCount
    : landscapeMobile.matches ? 2 : 1;
  const savedFitCount = Number(state.panelFitCount);
  state.panelFitCount = [2, 3, 4].includes(savedFitCount) ? savedFitCount : 2;
  // "many" (a since-removed persisted mode -- see setDesktopPanelMode's own
  // history) never left a value Number() resolves to 1 or panelFitCount's
  // own {2,3,4} range, so a leftover save from before that change just
  // falls through to the same default an invalid/missing one already would.
  const savedDesktopMode = Number(state.desktopPanelMode);
  state.desktopPanelMode = savedDesktopMode === 1 || [2, 3, 4].includes(savedDesktopMode)
    ? savedDesktopMode
    : desktopLikePanels() ? 2 : null;
  state.panels = state.panels
    .map((panel) => {
      const book = Math.max(0, Math.min(Number(panel.book) || 0, manifest.books.length - 1));
      const chapter = Math.max(1, Math.min(Number(panel.chapter) || 1, manifest.books[book].chapters));
      const verse = Math.max(1, Number(panel.verse) || 1);
      const width = panel.width == null ? Number.NaN : Number(panel.width);
      const history = Array.isArray(panel.history)
        ? panel.history
            .map((item) => ({
              book: Math.max(0, Math.min(Number(item.book) || 0, manifest.books.length - 1)),
              chapter: Math.max(1, Math.min(Number(item.chapter) || 1, manifest.books[
                Math.max(0, Math.min(Number(item.book) || 0, manifest.books.length - 1))
              ].chapters)),
              verse: Math.max(1, Number(item.verse) || 1),
            }))
            .slice(-100)
        : [];
      if (!history.length) history.push({ book, chapter, verse });
      const historyIndex = Math.max(0, Math.min(Number(panel.historyIndex) || 0, history.length - 1));
      const enabledTranslations = [...new Set(
        (Array.isArray(panel.enabledTranslations) ? panel.enabledTranslations : legacyEnabled ?? DEFAULT_ENABLED_TRANSLATIONS)
          .filter((id) => validTranslations.has(id)),
      )];
      const highlightedTranslations = [...new Set(
        (Array.isArray(panel.highlightedTranslations) ? panel.highlightedTranslations : DEFAULT_HIGHLIGHTED_TRANSLATIONS)
          .filter((id) => enabledTranslations.includes(id)),
      )];
      const dimmedTranslations = [...new Set(
        (Array.isArray(panel.dimmedTranslations) ? panel.dimmedTranslations : DEFAULT_DIMMED_TRANSLATIONS)
          .filter((id) => enabledTranslations.includes(id) && !highlightedTranslations.includes(id)),
      )];
      const activeStudyTool = STUDY_TOOL_IDS.includes(panel.activeStudyTool) && enabledTranslations.includes(panel.activeStudyTool)
        ? panel.activeStudyTool
        : null;
      const originalLanguageHidden = Boolean(panel.originalLanguageHidden);
      const readingMode = Boolean(panel.readingMode);
      const linkGroupId = Number.isInteger(panel.linkGroupId) && panel.linkGroupId >= 0 ? panel.linkGroupId : null;
      // Defaults true (shown) for both a fresh panel and an older save from
      // before this toggle existed -- explicit false is the only way to
      // end up hidden, matching the toggle's own default-on state (see the
      // "..." popup menu).
      const translationNamesShown = panel.translationNamesShown !== false;
      return {
        book,
        chapter,
        verse,
        history,
        historyIndex,
        width: Number.isFinite(width) ? Math.max(1, Math.min(width, 5000)) : null,
        enabledTranslations,
        highlightedTranslations,
        dimmedTranslations,
        originalLanguageHidden,
        activeStudyTool,
        readingMode,
        translationNamesShown,
        linkGroupId,
      };
    })
    .slice(0, 12);
  if (!state.panels.length) state.panels = freshState().panels;
  // A restored group of one (e.g. a hand-edited or truncated localStorage
  // entry) isn't a group at all -- same rule enforced live by unlinkPanel
  // and removePanel -- so any linkGroupId held by exactly one panel here
  // gets cleared back to null rather than leaving that panel stuck showing
  // a "linked" icon with no actual partner.
  const groupCounts = new Map();
  for (const panel of state.panels) {
    if (panel.linkGroupId != null) groupCounts.set(panel.linkGroupId, (groupCounts.get(panel.linkGroupId) ?? 0) + 1);
  }
  for (const panel of state.panels) {
    if (panel.linkGroupId != null && groupCounts.get(panel.linkGroupId) === 1) panel.linkGroupId = null;
  }
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      fontSize: state.fontSize,
      touchPanelCount: state.touchPanelCount,
      desktopPanelMode: state.desktopPanelMode,
      panelFitCount: state.panelFitCount,
      highlights: state.highlights,
      bookmarks: state.bookmarks,
      notes: state.notes,
      copySelectionMode: state.copySelectionMode,
      panels: state.panels.map(({
        book,
        chapter,
        verse,
        history,
        historyIndex,
        width,
        enabledTranslations,
        highlightedTranslations,
        dimmedTranslations,
        originalLanguageHidden,
        activeStudyTool,
        readingMode,
        translationNamesShown,
        linkGroupId,
      }) => ({
        book,
        chapter,
        verse,
        history,
        historyIndex,
        width,
        enabledTranslations,
        highlightedTranslations,
        dimmedTranslations,
        originalLanguageHidden,
        activeStudyTool,
        readingMode,
        translationNamesShown,
        linkGroupId,
      })),
    }),
  );
}

// Phones in landscape and tablets use the exact desktop panel mechanism
// (pixel widths, free scrolling, the 1/2/fit presets); only phone portrait
// keeps the one-panel pager.
function desktopLikePanels() {
  return !mobileLayout.matches || touchPanelToggleLayout.matches;
}

function forcePhonePortraitOnePanel() {
  if (!phonePortraitLayout.matches || !state) return false;
  panelTrack.classList.remove("fit-all-panels");
  resetPanelWidths();
  state.touchPanelCount = 1;
  return true;
}

// Touch layouts running the two-panel desktop preset keep the long-press
// panel swap (the hover move buttons need a mouse).
function isTwoPanelTouchMode() {
  return Boolean(state && touchPanelToggleLayout.matches && state.desktopPanelMode === 2);
}

function enabledTranslationIds(panelState) {
  return panelState ? panelState.enabledTranslations : [];
}

// Neither has any actual verse text of its own to search or index (Hebrew/
// Greek are interlinear tokens, not sentence text; STR/TSK are study-tool
// panes, not translations at all) -- shared by every "default this dialog's
// own version list to whatever the source panel is showing" call site
// (openTskFromResult, openTskPassage's own two branches, openSearch) so a
// panel with either enabled never leaks it into a dialog whose own picker
// was never offering it as a choice in the first place.
function isIndexableTranslationId(id) {
  return !ORIGINAL_LANGUAGE_IDS.includes(id) && !STUDY_TOOL_IDS.includes(id) && id !== "NOTE";
}

// Only excluded while linked: a linked group always shows the same passage
// across every member (see goToPassage's own fan-out), which reading
// mode's own per-panel book/chapter flow has no way to follow, and a
// linked panel is already excluded as a link-picking target the moment it
// enters reading mode anyway (see enterLinkPicking) -- so the reverse
// (linking, then trying to read) is blocked here for the same reason.
// The reading-mode icon itself (see the "..." popup menu) always shows
// regardless of translation count now; only whether it's *enabled* depends
// on this function's result (see updateReadingModeControls/toggleReadingMode
// below). Translation count is singleReadableTranslation's concern instead
// (below) -- reading mode can be turned on with zero or several versions
// selected, it just has nothing to actually render until exactly one is.
function readingModeEligible(panelState) {
  return panelState.linkGroupId == null;
}

// Whichever single version reading mode actually has something to render
// for right now -- null covers both "nothing selected yet" and "more than
// one selected, ambiguous which to read" alike, both handled the same way
// by renderPanelBody (empty flow, translation picker open) and by
// updateReadingModeControls (toggle shown enabled/active regardless, per
// readingModeEligible above, just with no version name to display yet).
// Also null for Hebrew/Greek -- no plain sentence text to flow, just
// per-word interlinear tokens (see renderPanelBody).
function singleReadableTranslation(panelState) {
  if (!readingModeEligible(panelState)) return null;
  const enabled = enabledTranslationIds(panelState);
  if (enabled.length !== 1) return null;
  const [only] = enabled;
  return isIndexableTranslationId(only) ? only : null;
}

function updateReadingModeControls(panelState) {
  const elements = panelElements.get(panelState.id);
  if (!elements) return;
  const translation = singleReadableTranslation(panelState);
  const eligible = readingModeEligible(panelState);
  elements.readingModeToggle.disabled = !eligible;
  const active = eligible && Boolean(panelState.readingMode);
  elements.readingModeToggle.classList.toggle("selected", active);
  elements.readingModeToggle.setAttribute("aria-pressed", String(active));
  elements.panel.classList.toggle("reading-mode-active", active);
  if (active) {
    // No single readable version yet (none selected, or more than one) --
    // renderPanelBody leaves the flow empty and opens the translation
    // picker instead; the nav row still shows, just with a blank version
    // label (no placeholder text) and the current book in English until
    // one is actually picked.
    const lang = translation ? translationLanguage(translation) : "en";
    const book = manifest.books[panelState.book];
    elements.readingBookCombo.setItems(readingBookItems());
    elements.readingBookCombo.setValue(panelState.book);
    // setValue above always shows the bilingual list label; overwrite it
    // with just the current translation's own language, matching what the
    // reading flow itself is rendered in.
    elements.readingBookInput.value = lang === "ko" ? book.ko : book.en;
    elements.readingTranslationName.textContent = translation ? translationMeta(translation).label : "";
    elements.readingTranslationName.lang = lang;
    if (translation) {
      elements.readingTranslationName.style.setProperty("--translation-color", TRANSLATION_COLORS[translation]);
    } else {
      elements.readingTranslationName.style.removeProperty("--translation-color");
    }
    elements.readingBookPrev.disabled = panelState.book <= 0;
    elements.readingBookNext.disabled = panelState.book >= manifest.books.length - 1;
  }
}

// Moves the whole reading flow to the previous/next book, staying in
// reading mode throughout (goToPassage doesn't touch panelState.readingMode
// itself, and renderPanelBody's reading branch re-fetches for whatever book
// it lands on).
function navigateReadingBook(panelState, direction) {
  const book = panelState.book + direction;
  if (book < 0 || book >= manifest.books.length) return;
  goToPassage(panelState, { book, chapter: 1, verse: 1 }, { record: true });
}

function toggleReadingNumbering(panelState) {
  panelState.readingNumbering = !panelState.readingNumbering;
  const elements = panelElements.get(panelState.id);
  if (!elements) return;
  elements.numberingToggle.classList.toggle("selected", panelState.readingNumbering);
  elements.numberingToggle.setAttribute("aria-pressed", String(panelState.readingNumbering));
  elements.panel.classList.toggle("reading-numbering-active", panelState.readingNumbering);
}

// Finds whichever chapter's span sits at (or just above) the top of the
// scrolled flow -- the chapter the reader is currently on -- mirroring
// captureVerseAnchor's own "nearest the top" heuristic for the normal verse
// view.
function currentReadingChapter(panelState) {
  const elements = panelElements.get(panelState.id);
  if (!elements) return null;
  const contentRect = elements.content.getBoundingClientRect();
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const span of elements.content.querySelectorAll(".reading-chapter")) {
    const rect = span.getBoundingClientRect();
    if (rect.bottom <= contentRect.top || rect.top >= contentRect.bottom) continue;
    const distance = Math.abs(rect.top - contentRect.top);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = Number(span.dataset.chapter);
    }
  }
  return best;
}

// Lands the chapter's own first line exactly one line-height below the
// panel's header -- not flush against it -- while the previous chapter's
// last line (immediately above, since chapters are back-to-back blocks)
// stays fully scrolled out of view. Each .reading-chapter after the first
// carries margin-top: one line-height (see styles.css) specifically so
// that gap is real blank space in the layout rather than something this
// scroll math has to fake: scrolling the chapter's own border-box top to
// content-top + lineHeight puts the visible viewport's first lineHeight
// worth of space exactly over that margin, with the previous chapter's
// text ending right where the margin (and the scrolled-past region) began.
function scrollReadingFlowToChapter(elements, chapter) {
  const span = elements.content.querySelector(`.reading-chapter[data-chapter="${chapter}"]`);
  if (!span) return;
  const contentRect = elements.content.getBoundingClientRect();
  const spanRect = span.getBoundingClientRect();
  elements.content.scrollTop += spanRect.top - contentRect.top;
}

function applyReadingMode(panelState) {
  if (panelState.readingMode) panelState.scrollTargetChapter = panelState.chapter;
  renderPanelBody(panelState);
  const elements = panelElements.get(panelState.id);
  if (elements && !panelState.readingMode) elements.content.scrollTop = 0;
}

// Turning reading mode off resumes the normal verse view at whichever
// chapter the flow was scrolled to (not whatever chapter was loaded before
// reading mode started) -- turning it on does the reverse, opening the flow
// scrolled to the chapter that was on screen (see scrollTargetChapter above).
async function toggleReadingMode(panelState) {
  if (!readingModeEligible(panelState)) return;
  const turningOn = !panelState.readingMode;
  const resumeChapter = turningOn ? null : currentReadingChapter(panelState);
  panelState.readingMode = turningOn;
  // Reading mode's flow has no verses or words to select -- drop any
  // leftover selection/lookup from before switching, so its floating
  // toolbar doesn't linger orphaned over the flow (or over the restored
  // verse view, if a selection carries back the other way).
  clearPanelSelection(panelState);
  clearWordLookup(panelState);
  saveState();
  if (resumeChapter != null && resumeChapter !== panelState.chapter) {
    await goToPassage(panelState, { book: panelState.book, chapter: resumeChapter, verse: 1 }, { record: true });
    return;
  }
  applyReadingMode(panelState);
  // Turned on with no single version to actually read (none selected, or
  // more than one) -- renderPanelBody (via applyReadingMode above) already
  // left the flow empty; open the picker right away instead of making the
  // reader hunt for it themselves.
  if (turningOn && singleReadableTranslation(panelState) == null) {
    panelElements.get(panelState.id)?.readingTranslationPicker.open();
  }
}

// Both number markers stay in the DOM unconditionally -- see
// .reading-chapter-number/.reading-verse-number in styles.css -- so turning
// numbering on/off (toggleReadingNumbering) is a pure CSS class flip on the
// panel, never a re-render.
function buildReadingChapter(chapter, verses) {
  const wrapper = document.createElement("span");
  wrapper.className = "reading-chapter";
  wrapper.dataset.chapter = String(chapter);

  const chapterNumber = document.createElement("span");
  chapterNumber.className = "reading-chapter-number";
  chapterNumber.textContent = String(chapter);
  wrapper.append(chapterNumber, " ");

  verses.forEach(({ verse, text }, index) => {
    if (index > 0) wrapper.append(" ");
    const verseNumber = document.createElement("sup");
    verseNumber.className = "reading-verse-number";
    verseNumber.textContent = String(verse);
    wrapper.append(verseNumber, " ", text);
  });
  return wrapper;
}

function renderReadingFlowText(elements, translationId, chapters) {
  const flow = document.createElement("p");
  flow.className = "reading-flow";
  flow.lang = translationLanguage(translationId);
  chapters.forEach(({ chapter, verses }, index) => {
    if (index > 0) flow.append(" ");
    flow.append(buildReadingChapter(chapter, verses));
  });
  elements.content.replaceChildren(flow);
}

// Fetches every chapter of a book for one translation, shaped for the
// reading flow -- shared by renderReadingFlow below (the panel's own
// whole-book view) and the reading-copy dialog's book selector (which can
// point at a different book than whatever the panel itself is showing).
async function fetchReadingChapters(bookIndex, translationId) {
  const chapterCount = manifest.books[bookIndex].chapters;
  // allSettled rather than all: a book like Psalms fires 150 chapter
  // fetches at once, and any single one of them hitting a transient
  // network blip used to sink the whole batch, leaving the reading flow
  // stuck on "Loading…" forever (nothing else would ever retry it) --
  // see renderReadingFlow's own "complete" check below for how a failed
  // chapter is kept from being cached that way permanently.
  const chapterResults = await Promise.allSettled(
    Array.from({ length: chapterCount }, (_, index) => getChapter(bookIndex, index + 1)),
  );
  // A verse with no real text still keeps its own entry (and so its own
  // number, with numbering on) rather than vanishing from the flow -- just
  // with nothing but the verse-number/text separator space as its "body".
  // Real omission notes like "(24절 없음)" already read as ordinary text
  // to hasVerseText and are left untouched either way. A chapter whose own
  // fetch failed reads the same as one with no verses at all.
  const chapters = chapterResults.map((result, index) => {
    const verses = result.status === "fulfilled"
      ? result.value.v.map(([verse, texts]) => {
        const text = texts[translationId];
        return { verse, text: hasVerseText(text) ? text : "" };
      })
      : [];
    return { chapter: index + 1, verses };
  });
  return { chapters, complete: chapterResults.every((result) => result.status === "fulfilled") };
}

// Flattens the whole book into one unbroken run of prose -- no selection/
// copy affordance, just reading -- fetching every chapter (past whatever
// single chapter the panel itself has loaded) the first time this book/
// translation combination is read, then reusing that flattened text on
// subsequent renders (font-size changes, etc). Each chapter and verse
// keeps its own number, hidden by default (see buildReadingChapter above),
// both for the optional numbering display and so scrolling can be tied
// back to a chapter -- see currentReadingChapter and scrollTargetChapter
// above.
async function renderReadingFlow(panelState, translationId) {
  const elements = panelElements.get(panelState.id);
  if (!elements) return;
  const bookIndex = panelState.book;
  const cache = panelState.readingFlowCache;
  const scrollTarget = panelState.scrollTargetChapter;
  panelState.scrollTargetChapter = null;
  if (cache && cache.book === bookIndex && cache.translation === translationId) {
    renderReadingFlowText(elements, translationId, cache.chapters);
    if (scrollTarget != null) scrollReadingFlowToChapter(elements, scrollTarget);
    return;
  }
  elements.content.innerHTML = '<div class="panel-message">Loading…</div>';
  const { chapters, complete } = await fetchReadingChapters(bookIndex, translationId);
  // The panel may have moved on (a different book, or reading mode turned
  // back off) while all those chapters were loading.
  if (panelState.book !== bookIndex || !panelState.readingMode) return;
  // Only cached when every chapter came back -- a partial result (one
  // chapter's fetch failed) stays uncached so turning reading mode on for
  // this book again retries the whole thing instead of permanently
  // showing that one chapter's gap.
  if (complete) panelState.readingFlowCache = { book: bookIndex, translation: translationId, chapters };
  renderReadingFlowText(elements, translationId, chapters);
  if (scrollTarget != null) scrollReadingFlowToChapter(elements, scrollTarget);
}

// Shared by renderReadingFlow above (the panel's own whole-book view) and
// buildReadingStyleCopyText below (the normal copy dialog's reading-mode-on
// branch) -- both flatten a range of {verse, text} entries into flowing
// prose, with or without inline verse numbers.
function buildReadingCopyBody(chapters, start, end, numbering) {
  const parts = [];
  for (const { chapter, verses } of chapters) {
    if (chapter < start.chapter || chapter > end.chapter) continue;
    const selected = verses.filter(({ verse }) => {
      if (chapter === start.chapter && verse < start.verse) return false;
      if (chapter === end.chapter && verse > end.verse) return false;
      return true;
    });
    if (!selected.length) continue;
    if (numbering) {
      // No chapter number here -- the reference line above already states
      // the chapter (or chapter range), per explicit request.
      const versePieces = selected.map(({ verse, text }) => (text ? `${verse} ${text}` : String(verse)));
      parts.push(versePieces.join(" "));
    } else {
      const text = selected.map(({ text }) => text).filter(Boolean).join(" ");
      if (text) parts.push(text);
    }
  }
  return parts.join(" ").trim();
}

function updatePanelCountControls() {
  if (!state) return;
  const desktop = desktopLikePanels();
  // !desktop alone doesn't mean a genuinely touch/mobile layout -- a plain
  // mouse-driven desktop window narrower than mobileLayout's own
  // width-only breakpoint gets here too (see applyDesktopPanelWidths's own
  // comment), and for it touchPanelCount is never a real preference the
  // reader made, just whatever this session's own default/last-touch-value
  // happens to be -- showing either icon "selected" off the back of that
  // would be misleading. Only read it at all once a coarse (touch) pointer
  // confirms this really is that kind of layout.
  const touchLike = desktop ? false : coarsePointer.matches;
  const oneSelected = desktop ? state.desktopPanelMode === 1 : touchLike && state.touchPanelCount === 1;
  // "Two" now means "the fit-count preset is active," whatever its own
  // selector last chose (see panelFitCount) -- 2, 3, or 4 -- not literally
  // just the number 2 anymore.
  const twoSelected = desktop ? [2, 3, 4].includes(state.desktopPanelMode) : touchLike && state.touchPanelCount !== 1;
  panelCountOneButton.classList.toggle("selected", oneSelected);
  panelCountTwoButton.classList.toggle("selected", twoSelected);
  panelCountOneButton.setAttribute("aria-pressed", String(oneSelected));
  panelCountTwoButton.setAttribute("aria-pressed", String(twoSelected));
  // Both the reading-mode and link-mode icons (see the "..." popup menu)
  // always show now, but link mode still only ever makes sense once a
  // second panel exists to link with (see updateLinkModeControls) --
  // disabled otherwise. This is the one place every panel-count change
  // (add, remove, reset) already funnels through, so it's what keeps every
  // *existing* panel's own toggle in sync too, not just a freshly created
  // one.
  for (const panelState of state.panels) {
    updateReadingModeControls(panelState);
    updateLinkModeControls(panelState);
  }
}

// Below this, the header's own history/selector/remove-button row (see
// .panel-selectors in styles.css) runs out of room and its later children
// spill past the panel's own right edge instead of shrinking to fit --
// verified empirically (a plain width sweep against the live header) as
// the narrowest width that still keeps every one of those children fully
// inside the panel. Manual drag-resize (see setupPanelResize) already
// floors at this same value; applyDesktopPanelWidths below enforces it for
// the N-panel presets too, since dividing the window width by a fixed
// count has no floor of its own otherwise.
const MIN_PANEL_WIDTH = 320;

function panelAvailableWidth() {
  const trackStyle = getComputedStyle(panelTrack);
  const horizontalPadding = (Number.parseFloat(trackStyle.paddingLeft) || 0)
    + (Number.parseFloat(trackStyle.paddingRight) || 0);
  return Math.max(1, panelTrack.clientWidth - horizontalPadding);
}

function exactPanelFitWidth(count) {
  const gap = Number.parseFloat(getComputedStyle(panelTrack).columnGap) || 0;
  return Math.max(1, (panelAvailableWidth() - gap * (count - 1)) / count);
}

function applyPanelWidth(panel, width, important = false) {
  panel.style.removeProperty("flex-basis");
  panel.style.removeProperty("width");
  panel.style.setProperty("flex-basis", `${width}px`, important ? "important" : "");
  if (important) panel.style.setProperty("width", `${width}px`, "important");
  refreshTranslationListOverflow(panel);
}

// iPadOS Safari can leave a panel's translation-chip row sized as if its
// horizontal scrollbar were still there after a width change resolves the
// overflow that caused it -- the same class of stale-layout bug
// setDesktopPanelMode's own comment already works around for verse text
// (changing width via inline flex-basis/width alone doesn't always trigger
// a full relayout there). Toggling display forces WebKit to recompute
// whether the row still needs that scrollbar and, with it, the row's own
// height.
function refreshTranslationListOverflow(panel) {
  const list = panel.querySelector(".panel-translation-list");
  if (!list) return;
  const previousDisplay = list.style.display;
  list.style.display = "none";
  void list.offsetHeight;
  list.style.display = previousDisplay;
}

function setAllDesktopPanelWidths(width, important = false) {
  for (const panelState of state.panels) {
    panelState.width = width;
    const elements = panelElements.get(panelState.id);
    if (elements) applyPanelWidth(elements.panel, width, important);
  }
}

function resetPanelWidths() {
  for (const panelState of state.panels) {
    panelState.width = null;
    const panel = panelElements.get(panelState.id)?.panel;
    if (!panel) continue;
    panel.style.removeProperty("flex-basis");
    panel.style.removeProperty("width");
  }
}

// mode itself *is* the panel count to fit -- 1 for the single-panel preset,
// or whichever of {2,3,4} the fit-count selector last chose (see
// panelFitCount) for the other. A plain, fixed divisor either way: it
// doesn't track how many panels actually happen to be open or visible, the
// same way the original 1/2-panel presets never did (see setDesktopPanelMode).
function applyDesktopPanelWidths() {
  if (!state?.desktopPanelMode) return;
  // A real touch tablet never actually leaves desktop-like layout this way
  // (see touchPanelToggleLayout's own any-pointer: coarse requirement,
  // which keeps desktopLikePanels() true for it across any width or
  // rotation change) -- this branch only ever fires for a plain desktop
  // mouse window narrowed past the mobile-layout breakpoint, where a
  // completely different, touch-oriented panel-count mechanism takes over
  // instead (see applyTouchPanelCount/fitVisiblePanels) and the N-panel-fit
  // preset this tracks has nothing left to mean. Cleared the same way
  // hitting MIN_PANEL_WIDTH below already is -- without this, the resize
  // handler that calls this function used to stop calling it at all the
  // moment desktopLikePanels() went false, leaving both the preset (and
  // its own header icon, styled green while "selected") and every panel's
  // own inline width frozen at whatever they were the instant that
  // happened, never actually reaching the floor below or the touch
  // layout's own width for however much further the window kept shrinking.
  if (!desktopLikePanels()) {
    state.desktopPanelMode = null;
    resetPanelWidths();
    updatePanelCountControls();
    return;
  }
  const width = exactPanelFitWidth(state.desktopPanelMode);
  // The window has shrunk too far for this preset's own fixed divisor to
  // keep every panel's header readable (see MIN_PANEL_WIDTH) -- rather than
  // let panels keep shrinking past that and spill their own header
  // controls past their right edge, drop the preset itself (same as a
  // manual drag-resize already does the instant it happens) and settle
  // every panel at the floor width instead, same as dragging one down to
  // that same floor would.
  if (width < MIN_PANEL_WIDTH) {
    state.desktopPanelMode = null;
    setAllDesktopPanelWidths(MIN_PANEL_WIDTH);
    updatePanelCountControls();
    return;
  }
  setAllDesktopPanelWidths(width);
}

function setDesktopPanelMode(mode) {
  if (mode !== 1 && mode !== 2 && mode !== 3 && mode !== 4) return;
  panelTrack.classList.remove("fit-all-panels");
  state.desktopPanelMode = mode;
  applyDesktopPanelWidths();
  // Changing width via inline flex-basis/width alone leaves each panel's
  // already-laid-out verse text stuck at however many lines it wrapped to
  // at the OLD width on some WebKit builds (notably iPadOS Safari) --
  // rather than reflowing to the new width, translation lines keep their
  // previous line count/positions and end up overlapping the row below
  // once the panel is narrower (or leaving a too-tall gap once it's
  // wider). Re-rendering every panel's body forces fresh text layout at
  // the new width, which sidesteps that stale-reflow bug entirely.
  refreshPanelBodies();
  updatePanelCountControls();
  saveState();
  alignPanelsAfterLayoutChange(panelIndexAtViewportStart());
}

// Manually resizing a panel breaks the uniform widths the desktop one/two
// panel presets promise, so the preset selection is dropped. Saving is left
// to the caller.
function clearDesktopPanelMode() {
  if (!state?.desktopPanelMode) return;
  state.desktopPanelMode = null;
  updatePanelCountControls();
}

function visiblePanelSpan() {
  const trackRect = panelTrack.getBoundingClientRect();
  let first = -1;
  let count = 0;
  state.panels.forEach((panelState, index) => {
    const panel = panelElements.get(panelState.id)?.panel;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    if (rect.right > trackRect.left + 1 && rect.left < trackRect.right - 1) {
      if (first < 0) first = index;
      count += 1;
    }
  });
  return { first: Math.max(0, first), count: Math.max(1, count) };
}

// Desktop fits the panels currently on screen; touch layouts fit every panel
// into the screen, no matter how many panels are open.
function fitVisiblePanels() {
  if (mobileLayout.matches || state.panels.length < 2) return;
  const touchLayout = mobileLayout.matches;
  const { first, count: visibleCount } = visiblePanelSpan();
  const count = touchLayout ? state.panels.length : visibleCount;
  panelTrack.classList.toggle("fit-all-panels", touchLayout);
  setAllDesktopPanelWidths(exactPanelFitWidth(count), touchLayout);
  clearDesktopPanelMode();
  saveState();
  alignPanelsAfterLayoutChange(touchLayout ? 0 : first);
}

function alignPanelsAfterLayoutChange(index) {
  if (!state?.panels?.length || index < 0) return;
  const targetIndex = Math.max(0, Math.min(index, state.panels.length - 1));
  panelTrack.classList.add("panel-count-changing");
  requestAnimationFrame(() => {
    panelTrack.scrollLeft = panelScrollLeft(targetIndex);
    requestAnimationFrame(() => {
      panelTrack.scrollLeft = panelScrollLeft(targetIndex);
      panelTrack.classList.remove("panel-count-changing");
      panelTrack.scrollLeft = panelScrollLeft(targetIndex);
    });
  });
}

function applyTouchPanelCount(alignmentIndex = -1) {
  if (!state) return;
  forcePhonePortraitOnePanel();
  document.documentElement.dataset.touchPanelCount = String(state.touchPanelCount);
  updatePanelCountControls();
  if (panelElements.size) refreshPanelBodies();
  alignPanelsAfterLayoutChange(alignmentIndex);
}

function setTouchPanelCount(count) {
  if (count !== 1 && count !== 2) return;
  if (phonePortraitLayout.matches) {
    state.touchPanelCount = 1;
    saveState();
    applyTouchPanelCount(panelIndexAtViewportStart());
    return;
  }
  panelTrack.classList.remove("fit-all-panels");
  resetPanelWidths();
  const alignmentIndex = state.panels.length ? panelIndexAtViewportStart() : -1;
  state.touchPanelCount = count;
  saveState();
  applyTouchPanelCount(alignmentIndex);
}

function schedulePanelLayoutAlignment() {
  if (!state) return;
  cancelAnimationFrame(panelLayoutFrame);
  const activeIndex = state.panels.findIndex((panelState) => panelState.id === activePanelId);
  panelLayoutFrame = requestAnimationFrame(() => {
    if (touchPanelToggleLayout.matches) {
      panelTrack.classList.remove("fit-all-panels");
      if (state.desktopPanelMode !== 1 && state.desktopPanelMode !== 2) state.desktopPanelMode = 2;
      applyDesktopPanelWidths();
      saveState();
    }
    applyTouchPanelCount(Math.max(0, activeIndex));
  });
}

// Collapses back to just the leftmost panel, keeping its own passage/
// translations/study-tool exactly as they already were -- every *other*
// panel is discarded, and every study-tool lookup/history is cleared
// alongside them. Unlike an actual factory reset, this never touches
// localStorage wholesale (so font size, touch panel count, desktop panel
// mode, and copy selection mode all survive exactly as they were) and
// never clears the browser's own cache. Per explicit request: a quick way
// back to a single panel specifically, not a wipe of its own content or
// every preference along with it.
function resetSite() {
  if (searchDialog.open) closeSearch();
  if (copyDialog.open) closeCopyDialog();
  if (strongsDialog.open) closeStrongsDialog();
  if (tskDialog.open) closeTskDialog();
  if (pendingMoveReference) exitMovePicking();
  if (pendingLinkSource) exitLinkPicking();
  if (openPanelMoreMenuId != null) closePanelMoreMenu();

  // Captured before the teardown loops below (which never touch
  // state.panels itself) so its own passage/translations/study-tool carry
  // over untouched into the rebuilt state.panels array further down.
  const leftmost = state.panels[0];

  for (const { panel, translationControl, readingTranslationPicker } of panelElements.values()) {
    translationControl.destroy();
    readingTranslationPicker.destroy();
    panel.remove();
  }
  for (const panelState of state.panels) {
    panelState.strNav?.destroy();
    destroyStudyToolInstances(panelState);
  }
  panelElements.clear();
  // A lone survivor's own link (if any) no longer means anything -- its
  // partner(s) are all gone (same rule as unlinkPanel's single-survivor
  // branch).
  leftmost.linkGroupId = null;
  state.panels = [leftmost];
  sanitizeState();
  if (desktopLikePanels()) {
    if (touchPanelToggleLayout.matches) state.desktopPanelMode = 2;
    state.panels[0].width = touchPanelToggleLayout.matches
      ? exactPanelFitWidth(state.desktopPanelMode === 2 ? 2 : 1)
      : exactPanelFitWidth(2);
  }
  applyTouchPanelCount();
  activePanelId = undefined;
  for (const panel of state.panels) createPanelElement(panel);
  if (desktopLikePanels()) applyDesktopPanelWidths();
  saveState();

  searchInput.value = "";
  searchMeta.textContent = "";
  searchBookList.replaceChildren();
  searchResults.replaceChildren();
  searchRequestId += 1;

  // The shared STR/TSK/SRCH lookup history (each spans both an embedded
  // pane and its own standalone dialog -- see recordStrongsHistory/
  // recordTskHistory/recordSearchHistory) lives outside state/localStorage
  // entirely, so the panel rebuild above never touches it on its own.
  strongsHistory = [];
  strongsHistoryIndex = -1;
  updateStrongsHistoryButtons();
  tskHistory = [];
  tskHistoryIndex = -1;
  updateTskHistoryButtons();
  searchHistory = [];
  searchHistoryIndex = -1;
  updateSearchHistoryButtons();

  // The standalone TSK dialog's own current passage -- same idea, lives
  // outside state and would otherwise still show whatever was last
  // looked up the next time it opens.
  tskViewState.book = 0;
  tskViewState.chapter = 1;
  tskViewState.verse = 1;
  tskViewState.data = null;
  tskViewState.anchors = [];
}

function translationMeta(id) {
  return ORIGINAL_LANGUAGE_META[id] ?? STUDY_TOOL_META[id] ?? NOTE_TRANSLATION_META[id]
    ?? manifest.translations.find((item) => item.id === id);
}

function translationLanguage(id) {
  if (id === "HEB") return "he";
  if (id === "GRK") return "grc";
  if (id === "CNV") return "zh";
  if (STUDY_TOOL_IDS.includes(id) || id === "NOTE") return "en";
  return ["ESV", "NIV", "KJV", "NASB", "NRSV", "NLT", "TB"].includes(id) ? "en" : "ko";
}

function testamentForBook(bookId) {
  return bookId < 39 ? "old" : "new";
}

function originalLanguageForTestament(testament) {
  return testament === "old" ? "HEB" : "GRK";
}

function activeOriginalLanguageId(enabledTranslations) {
  return enabledTranslations.find((id) => ORIGINAL_LANGUAGE_IDS.includes(id)) ?? null;
}

function canonicalTranslationRank(id) {
  const rank = TRANSLATION_CANONICAL_ORDER.indexOf(id);
  if (rank >= 0) return rank;
  // STR/TSK aren't in TRANSLATION_CANONICAL_ORDER at all (they're not real
  // translations), so without this they'd all tie at the same fallback
  // rank -- insertTranslationInOrder's own "insert before the first
  // strictly greater rank" search never finds one among ties, so a freshly
  // re-added one would always land at the very end instead of back in its
  // own STR -> TSK slot.
  // HEB/GRK sit in their own slot between the real translations and
  // STR/TSK, rather than tying with (and landing after) the study tools at
  // the shared fallback rank below.
  if (ORIGINAL_LANGUAGE_IDS.includes(id)) return TRANSLATION_CANONICAL_ORDER.length;
  const studyRank = STUDY_TOOL_IDS.indexOf(id);
  if (studyRank >= 0) return TRANSLATION_CANONICAL_ORDER.length + 1 + studyRank;
  return TRANSLATION_CANONICAL_ORDER.length + 1 + STUDY_TOOL_IDS.length;
}

function insertTranslationInOrder(order, id) {
  if (!translationMeta(id) || order.includes(id)) return false;
  const rank = canonicalTranslationRank(id);
  let index = order.findIndex((existing) => canonicalTranslationRank(existing) > rank);
  if (index < 0) index = order.length;
  order.splice(index, 0, id);
  return true;
}

function moveTranslationInOrder(order, from, to) {
  if (from < 0 || to < 0 || from >= order.length || to >= order.length) return false;
  const [item] = order.splice(from, 1);
  order.splice(to, 0, item);
  return true;
}

// The per-column state fields a STUDY_TOOL_IDS entry (or its activation)
// needs to update, bundled so left/right callers can pass their own field
// names once instead of repeating ternaries each. preToolHighlighted/
// preToolDimmed hold a snapshot of highlighted/dimmed from just before a
// study tool took over -- see toggleTranslationChip's own entering branch
// and restorePreStudyToolEmphasis below.
function studyToolFieldNames() {
  return { active: "activeStudyTool", enabled: "enabledTranslations",
      highlighted: "highlightedTranslations", dimmed: "dimmedTranslations",
      hidden: "originalLanguageHidden",
      preToolHighlighted: "preStudyToolHighlighted", preToolDimmed: "preStudyToolDimmed" };
}

// Restores whatever highlight/dim split the *other* chips had right before
// a study tool started dimming them all uniformly (see the snapshot taken
// in toggleTranslationChip's own STUDY_TOOL_IDS branch below), instead of
// leaving every chip at plain normal strength once the tool goes away.
// Filtered against the current enabled list, since a chip could have been
// removed while the tool was showing; STUDY_TOOL_IDS themselves always end
// up dimmed regardless of what the snapshot says, matching every other
// exit-a-study-tool path's own convention.
function restorePreStudyToolEmphasis(panelState, fields) {
  const enabled = panelState[fields.enabled];
  const highlighted = (panelState[fields.preToolHighlighted] ?? []).filter((id) => enabled.includes(id));
  const dimmed = (panelState[fields.preToolDimmed] ?? []).filter((id) => enabled.includes(id) && !highlighted.includes(id));
  panelState[fields.highlighted] = highlighted;
  panelState[fields.dimmed] = [...new Set([...dimmed, ...STUDY_TOOL_IDS])];
  panelState[fields.preToolHighlighted] = null;
  panelState[fields.preToolDimmed] = null;
}

// STR/TSK (see STUDY_TOOL_META) are mutually exclusive with each other
// and with the normal highlight/dim cycle: picking one shows that tool's
// own content in place of verse text for this column (see renderPanelBody)
// and dims every other id currently enabled there -- both real translations
// and any other study tool -- so its own chip is the only one left at
// normal strength. Picking a normal translation while a study tool is
// active doesn't run the usual cycle on it; the click's only job then is
// "go back to normal verse text," which clears the study tool and returns
// every chip (not just the one clicked) to normal strength.
function toggleTranslationChip(panelState, id, { isNewlyAdded = false } = {}) {
  const fields = studyToolFieldNames();
  const activeStudyTool = panelState[fields.active];

  if (STUDY_TOOL_IDS.includes(id)) {
    // Already showing -- unlike a normal chip's own normal -> highlight ->
    // dim -> normal click cycle, this one has no "click again to turn it
    // off": the only way off is picking a different chip (either branch
    // below), which is what actually decides what should show instead.
    if (activeStudyTool === id) return;
    // Snapshot only on the first hop into a tool, not a later STR<->TSK
    // switch -- otherwise switching again would snapshot the *dimmed-for-
    // a-tool* state instead of what was there before either tool showed up.
    if (!activeStudyTool) {
      panelState[fields.preToolHighlighted] = panelState[fields.highlighted];
      panelState[fields.preToolDimmed] = panelState[fields.dimmed];
    }
    panelState[fields.active] = id;
    // Left at normal strength rather than highlighted: everything *else*
    // dims, so the active one reading as the lone plain-colored icon among
    // faded siblings is itself what marks it as "this is what's showing" --
    // no separate colored chip-active treatment needed.
    panelState[fields.highlighted] = [];
    panelState[fields.dimmed] = panelState[fields.enabled].filter((otherId) => otherId !== id);
    return;
  }

  // HEB/GRK's own chip never shows the normal highlight/dim *cycle* --
  // the "selection mode" some earlier revisions of this gave the chip
  // itself turned out to be about individual .interlinear-word blocks in
  // the rendered text instead, not this chip (see
  // .interlinear-word.selected/selectInterlinearWord). Clicking it still
  // dims STR/TSK specifically (only those, not any other real translation)
  // and exits whichever study tool was active, every time.
  // It does have its own separate on/off toggle, though (fields.hidden):
  // on hides the original-language text entirely for this panel/side (see
  // buildTranslationLinesInto and getEmphasis's own OR with it below),
  // reading exactly as if the chip itself had been removed, while the
  // chip stays put so it can be clicked again to bring the text back.
  // That toggle only actually flips on a "plain" click, though -- one
  // that isn't also doing something else already: isNewlyAdded (passed
  // only from the picker's own "just added, activate it" call -- see
  // onToggle in setupDialogTranslationControl) or exiting a study tool
  // (wasShowingStudyTool) both force it back to shown instead, so neither
  // "just added" nor "clicked to get back to reading" is a coin flip on
  // whether the text that click was reaching for actually shows up.
  if (ORIGINAL_LANGUAGE_IDS.includes(id)) {
    const wasShowingStudyTool = Boolean(activeStudyTool);
    panelState[fields.active] = null;
    if (wasShowingStudyTool) {
      restorePreStudyToolEmphasis(panelState, fields);
    } else {
      panelState[fields.highlighted] = [];
      panelState[fields.dimmed] = [...STUDY_TOOL_IDS];
    }
    panelState[fields.hidden] = (isNewlyAdded || wasShowingStudyTool) ? false : !panelState[fields.hidden];
    return;
  }

  if (activeStudyTool) {
    panelState[fields.active] = null;
    restorePreStudyToolEmphasis(panelState, fields);
    return;
  }

  const highlighted = new Set(panelState[fields.highlighted]);
  const dimmed = new Set(panelState[fields.dimmed]);
  if (highlighted.has(id)) {
    highlighted.delete(id);
    dimmed.add(id);
  } else if (dimmed.has(id)) {
    dimmed.delete(id);
  } else {
    highlighted.add(id);
  }
  // A real translation chip's own click cycle only ever touches itself
  // above -- but whichever one just became "what's showing" still reads
  // as such against STR/TSK specifically, so those dim here too, same as
  // an original-language chip's click does.
  for (const toolId of STUDY_TOOL_IDS) {
    highlighted.delete(toolId);
    dimmed.add(toolId);
  }
  panelState[fields.highlighted] = [...highlighted];
  panelState[fields.dimmed] = [...dimmed];
}

// Shared by both columns' setOrder (see createPanelElement): keeps the
// active-study-tool dimming in sync whenever the enabled set itself
// changes, not just on a chip click -- adding a new translation while a
// study tool is active dims it immediately instead of leaving it at normal
// strength until the next click, and removing the active study tool itself
// (via the picker or the chip's own remove button) drops every other chip
// back to normal instead of leaving them stuck dimmed with nothing active.
function applyTranslationOrder(panelState, order) {
  const fields = studyToolFieldNames();
  const previousOrder = panelState[fields.enabled];
  panelState[fields.enabled] = order;
  // Adding a plain translation (or HEB/GRK) while a study tool is showing
  // should switch to displaying it, the same as clicking the active tool's
  // own chip to exit -- otherwise the new chip just sits there dimmed next
  // to a tool pane that's still all that's visible.
  if (panelState[fields.active] && order.some((id) => !previousOrder.includes(id) && !STUDY_TOOL_IDS.includes(id))) {
    panelState[fields.active] = null;
    restorePreStudyToolEmphasis(panelState, fields);
    return;
  }
  const studyToolRemoved = panelState[fields.active] && !order.includes(panelState[fields.active]);
  if (studyToolRemoved) panelState[fields.active] = null;
  // A study tool chip can end up enabled but not active -- dimmed alongside
  // a real translation that's the one actually showing, or left that way
  // once that translation is removed. If nothing else is left to show at
  // all (every remaining id is a study tool -- HEB/GRK still count as
  // something to show, so this only fires once even those are gone too),
  // the column would otherwise render as blank verse rows with a chip
  // sitting right there that could show something; activate it instead.
  if (!panelState[fields.active] && order.length && !order.some((id) => !STUDY_TOOL_IDS.includes(id))) {
    panelState[fields.active] = order.find((id) => STUDY_TOOL_IDS.includes(id));
  }
  if (panelState[fields.active]) {
    // Left at normal strength, not highlighted -- see toggleTranslationChip's
    // own matching comment: dimming every other chip is what marks the
    // active one, not a separate colored treatment on this one.
    panelState[fields.highlighted] = [];
    panelState[fields.dimmed] = order.filter((otherId) => otherId !== panelState[fields.active]);
  } else if (studyToolRemoved) {
    restorePreStudyToolEmphasis(panelState, fields);
  } else {
    panelState[fields.highlighted] = panelState[fields.highlighted].filter((otherId) => order.includes(otherId));
    panelState[fields.dimmed] = panelState[fields.dimmed].filter((otherId) => order.includes(otherId));
  }
}

function renderTranslationChipList({ list, order, getEmphasis, onToggleActive, onRemove, onMove }) {
  list.replaceChildren();

  // Everything else that
  // reuses this function (copy/search/TSK dialogs) has no counterpart list
  // and leaves this undefined, which keeps drops confined to this one list
  for (const id of order) {
    const meta = translationMeta(id);
    if (!meta) continue;
    const emphasis = getEmphasis?.(id) ?? "normal";
    const chip = document.createElement("div");
    chip.className = "translation-chip";
    chip.classList.toggle("chip-active", emphasis === "highlight");
    chip.classList.toggle("chip-dimmed", emphasis === "dim");
    chip.style.setProperty("--translation-color-pale", PALE_TRANSLATION_COLORS[id]);
    chip.style.setProperty("--translation-color-medium", MEDIUM_TRANSLATION_COLORS[id]);
    chip.style.setProperty("--translation-color-dim", DIM_TRANSLATION_COLORS[id]);
    chip.draggable = true;
    chip.dataset.translation = id;
    chip.setAttribute("aria-label", `${meta.label} translation`);

    const handle = document.createElement("span");
    handle.className = "drag-handle";
    handle.textContent = "⠿";
    handle.title = "Drag to reorder";
    handle.setAttribute("aria-hidden", "true");
    setupTouchReorder({
      item: chip,
      handle,
      container: list,
      itemClass: "translation-chip",
      id,
      getOrder: () => order,
      onReorder: onMove,
    });

    const name = document.createElement("span");
    name.className = "translation-name";
    name.lang = translationLanguage(id);
    name.textContent = meta.label;
    name.style.setProperty("--translation-color", TRANSLATION_COLORS[id]);

    if (onToggleActive) {
      chip.addEventListener("click", () => onToggleActive(id));
    }

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "chip-remove close-button";
    removeButton.setAttribute("aria-label", `Remove ${meta.label}`);
    removeButton.title = `Remove ${meta.label}`;
    const removeIcon = document.createElement("span");
    removeIcon.setAttribute("aria-hidden", "true");
    removeButton.append(removeIcon);
    removeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      onRemove(id);
    });
    removeButton.addEventListener("pointerdown", (event) => event.stopPropagation());

    chip.addEventListener("dragstart", (event) => {
      chip.classList.add("dragging");
      event.dataTransfer.setData("text/plain", id);
      event.dataTransfer.effectAllowed = "move";
    });
    chip.addEventListener("dragend", () => chip.classList.remove("dragging"));
    chip.addEventListener("dragover", (event) => event.preventDefault());
    chip.addEventListener("drop", (event) => {
      event.preventDefault();
      const draggedId = event.dataTransfer.getData("text/plain");
      const from = order.indexOf(draggedId);
      const to = order.indexOf(id);
      if (from >= 0 && to >= 0 && from !== to) onMove(from, to);
    });

    chip.append(handle, name, removeButton);
    list.append(chip);
  }

  // Deferred a frame so a dialog opening in this same tick (showModal right
  // after render) has already become visible — scrollWidth/clientWidth read
  // 0/0 on a still-hidden <dialog>, which would misjudge overflow.
  requestAnimationFrame(() => {
    list.classList.toggle("translation-list--overflowing", list.scrollWidth > list.clientWidth + 1);
  });
}

// Native HTML5 drag-and-drop (dragstart/dragover/drop) does not fire on touch
// input, so touch reordering is driven by Pointer Events instead: the dragged
// item is lifted with a transform, elementFromPoint finds the item underneath
// the finger, and the swap only happens once on release (mirroring the mouse
// drop handler above). Touch drags start only on the ⠿ handle so that a swipe
// on the item body stays a native scroll of the surrounding list.
function setupTouchReorder({ item, handle, container, itemClass, id, getOrder, onReorder }) {
  let suppressClick = false;

  item.addEventListener("click", (event) => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressClick = false;
  }, true);

  item.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch") return;
    if (handle && !handle.contains(event.target)) return;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    let hoverTarget = null;
    let dragging = false;

    item.setPointerCapture(pointerId);

    const move = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (!dragging && Math.hypot(dx, dy) < 6) return;
      if (!dragging) {
        dragging = true;
        item.classList.add("dragging");
        item.style.position = "relative";
        item.style.zIndex = "5";
        item.style.pointerEvents = "none";
        document.body.classList.add("reordering-chip");
      }
      moveEvent.preventDefault();
      moveEvent.stopPropagation();
      item.style.transform = `translate(${dx}px, ${dy}px)`;
      const elementUnderPointer = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
      const target = elementUnderPointer?.closest(`.${itemClass}`);
      const next = target && target !== item && target.parentElement === container ? target : null;
      if (hoverTarget && hoverTarget !== next) hoverTarget.classList.remove("drag-over");
      hoverTarget = next;
      hoverTarget?.classList.add("drag-over");
    };

    const finish = (finishEvent) => {
      if (finishEvent.pointerId !== pointerId) return;
      if (item.hasPointerCapture(pointerId)) item.releasePointerCapture(pointerId);
      item.removeEventListener("pointermove", move);
      item.removeEventListener("pointerup", finish);
      item.removeEventListener("pointercancel", finish);
      item.classList.remove("dragging");
      item.style.position = "";
      item.style.zIndex = "";
      item.style.pointerEvents = "";
      item.style.transform = "";
      document.body.classList.remove("reordering-chip");
      hoverTarget?.classList.remove("drag-over");
      if (dragging) {
        finishEvent.preventDefault();
        suppressClick = true;
        window.setTimeout(() => {
          suppressClick = false;
        }, 350);
      }
      if (dragging && hoverTarget) {
        const order = getOrder();
        const from = order.indexOf(id);
        const to = order.indexOf(hoverTarget.dataset.translation);
        if (from >= 0 && to >= 0 && from !== to) onReorder(from, to);
      }
    };

    item.addEventListener("pointermove", move, { passive: false });
    item.addEventListener("pointerup", finish);
    item.addEventListener("pointercancel", finish);
  });
}

// Native-select feel for touch: a press that starts on `opener` opens the
// menu, sliding the finger highlights the option underneath (auto-scrolling
// near the menu's edges), and lifting on an option picks it. A drag that
// starts on the menu itself stays a normal scroll, and a plain tap falls
// through to the regular click handlers.
function setupPressDragPick({ opener, menu, optionSelector, onOpen, onPick, onGestureEnd }) {
  opener.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch") return;
    onOpen?.();
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const startMenuScrollTop = menu.scrollTop;
    let dragging = false;
    let highlighted = null;
    let lastX = startX;
    let lastY = startY;
    let scrollFrame = 0;

    try {
      opener.setPointerCapture(pointerId);
    } catch {
      return;
    }

    const optionUnder = (x, y) => {
      const option = document.elementFromPoint(x, y)?.closest(optionSelector);
      return option && menu.contains(option) ? option : null;
    };
    const setHighlight = (option) => {
      if (highlighted === option) return;
      highlighted?.classList.remove("highlighted");
      highlighted = option;
      highlighted?.classList.add("highlighted");
    };
    const autoScroll = () => {
      scrollFrame = 0;
      if (!dragging || menu.scrollHeight <= menu.clientHeight) return;
      const rect = menu.getBoundingClientRect();
      const delta = lastY < rect.top + 36 ? -8 : lastY > rect.bottom - 36 ? 8 : 0;
      if (!delta) return;
      menu.scrollTop += delta;
      setHighlight(optionUnder(lastX, lastY));
      scrollFrame = requestAnimationFrame(autoScroll);
    };

    const move = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      lastX = moveEvent.clientX;
      lastY = moveEvent.clientY;
      if (!dragging && Math.hypot(lastX - startX, lastY - startY) < 7) return;
      dragging = true;
      moveEvent.preventDefault();
      menu.scrollTop = startMenuScrollTop - (lastY - startY);
      setHighlight(optionUnder(lastX, lastY));
      if (!scrollFrame) scrollFrame = requestAnimationFrame(autoScroll);
    };
    const finish = (finishEvent) => {
      if (finishEvent.pointerId !== pointerId) return;
      opener.removeEventListener("pointermove", move);
      opener.removeEventListener("pointerup", finish);
      opener.removeEventListener("pointercancel", cancel);
      cancelAnimationFrame(scrollFrame);
      if (opener.hasPointerCapture(pointerId)) opener.releasePointerCapture(pointerId);
      const picked = dragging ? highlighted : null;
      setHighlight(null);
      if (dragging) finishEvent.preventDefault();
      if (picked) onPick(picked);
      if (dragging) onGestureEnd?.(Boolean(picked));
    };
    const cancel = (cancelEvent) => {
      if (cancelEvent.pointerId !== pointerId) return;
      opener.removeEventListener("pointermove", move);
      opener.removeEventListener("pointerup", finish);
      opener.removeEventListener("pointercancel", cancel);
      cancelAnimationFrame(scrollFrame);
      setHighlight(null);
      if (dragging) onGestureEnd?.(false);
    };

    opener.addEventListener("pointermove", move, { passive: false });
    opener.addEventListener("pointerup", finish);
    opener.addEventListener("pointercancel", cancel);
  });
}

function buildTranslationPickerOption({ id, meta, isEnabled, disabled, onPick }) {
  const option = document.createElement("button");
  option.type = "button";
  option.className = "translation-picker-option";
  option.classList.toggle("selected", isEnabled);
  option.classList.toggle("translation-picker-option-disabled", disabled);
  option.disabled = disabled;
  option.dataset.translation = id;
  option.setAttribute("role", "option");
  option.setAttribute("aria-selected", String(isEnabled));
  if (disabled) option.setAttribute("aria-disabled", "true");

  const label = document.createElement("span");
  label.className = "picker-label";
  label.lang = translationLanguage(id);
  label.textContent = meta.label;
  label.style.setProperty("--translation-color", TRANSLATION_COLORS[id]);
  const name = document.createElement("span");
  name.className = "picker-name";
  name.textContent = meta.name;
  option.append(label, name);

  option.addEventListener("click", onPick);
  return option;
}

// originalLanguageTestament, when provided, adds a second menu column for the
// Hebrew/Greek interlinear "translations" — only the option matching the
// panel's current testament is clickable; the other is shown disabled.
function renderDialogTranslationPickerMenu({ menu, picker, getOrder, onToggle, originalLanguageTestament, showStudyTools }) {
  menu.replaceChildren();
  // Callers that never pass getOriginalLanguageTestament (TSK's own panes
  // and dialogs) never render the second "Original languages" column
  // below -- the menu would otherwise sit at its fixed two-column width
  // with nothing but empty space where that column would have been.
  menu.classList.toggle("translation-picker-menu--single-column", !originalLanguageTestament);
  if (!manifest) return;
  const order = getOrder();
  const rerender = () => {
    renderDialogTranslationPickerMenu({ menu, picker, getOrder, onToggle, originalLanguageTestament, showStudyTools });
    positionTranslationPickerMenuFor(picker, menu);
  };

  const columns = document.createElement("div");
  columns.className = "translation-picker-columns";

  const mainColumn = document.createElement("div");
  mainColumn.className = "translation-picker-column";
  for (const group of TRANSLATION_GROUPS) {
    const ids = group.ids.filter((id) => translationMeta(id));
    if (!ids.length) continue;
    const section = document.createElement("div");
    section.className = "translation-picker-group";
    const heading = document.createElement("div");
    heading.className = "translation-picker-group-label";
    heading.textContent = group.label;
    section.append(heading);
    for (const id of ids) {
      const isEnabled = order.includes(id);
      const option = buildTranslationPickerOption({
        id,
        meta: translationMeta(id),
        isEnabled,
        disabled: false,
        onPick: () => {
          onToggle(id);
          rerender();
        },
      });
      section.append(option);
    }
    mainColumn.append(section);
  }
  columns.append(mainColumn);

  if (originalLanguageTestament) {
    const languageColumn = document.createElement("div");
    languageColumn.className = "translation-picker-column translation-picker-column-languages";

    const originalGroup = document.createElement("div");
    originalGroup.className = "translation-picker-group";
    const heading = document.createElement("div");
    heading.className = "translation-picker-group-label";
    heading.textContent = "Original";
    originalGroup.append(heading);
    for (const id of ORIGINAL_LANGUAGE_IDS) {
      const isEnabled = order.includes(id);
      const disabled = !isEnabled && ORIGINAL_LANGUAGE_META[id].testament !== originalLanguageTestament;
      const option = buildTranslationPickerOption({
        id,
        meta: translationMeta(id),
        isEnabled,
        disabled,
        onPick: () => {
          onToggle(id);
          rerender();
        },
      });
      originalGroup.append(option);
    }
    languageColumn.append(originalGroup);

    // A second group stacked below Original within the same column (not a
    // separate side-by-side column) -- .translation-picker-group +
    // .translation-picker-group already draws exactly the divider line
    // this needs, the same one that separates English/Korean/Chinese in
    // the main column, so it collapses the same way on narrow widths too
    // (below Original/GRK, with that same divider, once the columns wrap).
    if (showStudyTools) {
      const studyGroup = document.createElement("div");
      studyGroup.className = "translation-picker-group";
      const studyHeading = document.createElement("div");
      studyHeading.className = "translation-picker-group-label";
      studyHeading.textContent = "Study";
      studyGroup.append(studyHeading);
      for (const id of STUDY_TAB_IDS) {
        const isEnabled = order.includes(id);
        const option = buildTranslationPickerOption({
          id,
          meta: translationMeta(id),
          isEnabled,
          disabled: false,
          onPick: () => {
            onToggle(id);
            rerender();
          },
        });
        studyGroup.append(option);
      }
      languageColumn.append(studyGroup);
    }

    columns.append(languageColumn);
  }

  menu.append(columns);
}

function positionTranslationPickerMenuFor(picker, menu) {
  if (menu.hidden) return;
  // A study tool's own embedded shell (see getStudyToolInstance) has a
  // fixed, JS-measured height with overflow: hidden, same as a dialog's
  // own fixed height -- without escaping to position: fixed the same way,
  // a picker menu taller than the room left in that shell gets clipped
  // instead of flipping above/shrinking to fit.
  const inDialog = Boolean(picker.closest("dialog") || picker.closest(".study-tool-pane"));
  const width = menu.getBoundingClientRect().width;
  const anchor = picker.getBoundingClientRect();
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
  if (inDialog) {
    const gap = 6;
    const below = window.innerHeight - anchor.bottom - gap - 8;
    const above = anchor.top - gap - 8;
    const openAbove = below < 220 && above > below;
    const maxHeight = Math.max(160, Math.min(480, openAbove ? above : below));
    menu.style.position = "fixed";
    menu.style.right = "auto";
    menu.style.left = `${left}px`;
    menu.style.top = openAbove ? "auto" : `${anchor.bottom + gap}px`;
    menu.style.bottom = openAbove ? `${window.innerHeight - anchor.top + gap}px` : "auto";
    menu.style.maxHeight = `${maxHeight}px`;
    return;
  }
  menu.style.position = "";
  menu.style.right = "auto";
  menu.style.left = `${left - anchor.left}px`;
  menu.style.top = "";
  menu.style.bottom = "";
  menu.style.maxHeight = "";
}

function setupDialogTranslationControl({
  picker,
  toggle,
  menu,
  list,
  getOrder,
  setOrder,
  getEmphasis,
  onToggleActive,
  onChange,
  getOriginalLanguageTestament,
  showStudyTools,
}) {
  let suppressClickUntil = 0;
  let openedByTouchPress = false;
  const controls = picker.closest(".translation-controls");

  const renderMenu = () => {
    renderDialogTranslationPickerMenu({
      menu,
      picker,
      getOrder,
      onToggle,
      originalLanguageTestament: getOriginalLanguageTestament?.(),
      showStudyTools,
    });
  };

  const render = () => {
    renderTranslationChipList({
      list,
      order: getOrder(),
      getEmphasis,
      onToggleActive: onToggleActive && ((id) => {
        onToggleActive(id);
        render();
        onChange?.();
      }),
      onRemove: (id) => {
        setOrder(getOrder().filter((item) => item !== id));
        render();
        onChange?.();
      },
      onMove: (from, to) => {
        const order = [...getOrder()];
        if (!moveTranslationInOrder(order, from, to)) return;
        setOrder(order);
        render();
        onChange?.();
      },
    });
    if (!menu.hidden) renderMenu();
  };

  // Hebrew and Greek occupy a single shared "original language" slot: picking
  // one always replaces the other rather than allowing both at once.
  // Hebrew and Greek occupy a single shared "original language" slot: picking
  // one always replaces the other rather than allowing both at once. Once
  // added, though, it's a full peer of any other translation -- reorderable,
  // participates in stacked/columns layout the same way.
  const onToggle = (id) => {
    const order = [...getOrder()];
    let added = false;
    if (order.includes(id)) {
      setOrder(order.filter((item) => item !== id));
    } else {
      if (ORIGINAL_LANGUAGE_IDS.includes(id)) {
        const other = id === "HEB" ? "GRK" : "HEB";
        const otherIndex = order.indexOf(other);
        if (otherIndex >= 0) order.splice(otherIndex, 1);
      }
      if (insertTranslationInOrder(order, id)) {
        setOrder(order);
        added = true;
        // STR/TSK have no per-verse text of their own to show in the
        // meantime -- there's no useful "added but still inactive" state
        // for one of these the way there is for a normal translation, so
        // picking one activates it immediately, exactly as if its own chip
        // had just been clicked. HEB/GRK could just sit there added but
        // not yet "clicked," same as any other translation, but its own
        // green active state (see the ORIGINAL_LANGUAGE_IDS branch in
        // toggleTranslationChip) reading as "not yet showing" the instant
        // it's added would be a confusing first impression, so it gets the
        // same immediate activation. isNewlyAdded tells that branch this
        // is that first activation, not a re-click -- otherwise its own
        // show/hide toggle would have a coin flip's chance of hiding the
        // text again the instant it appears.
        if (STUDY_TOOL_IDS.includes(id) || ORIGINAL_LANGUAGE_IDS.includes(id)) onToggleActive?.(id, { isNewlyAdded: true });
      }
    }
    render();
    // The chip list scrolls horizontally once it overflows its own width
    // (see .translation-list) -- a newly added chip can land off-screen
    // past whatever's currently scrolled into view, so bring it in.
    if (added) list.querySelector(`[data-translation="${id}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    onChange?.();
  };

  const open = () => {
    if (!menu.hidden) return;
    renderMenu();
    menu.hidden = false;
    controls?.classList.add("translation-picker-open");
    positionTranslationPickerMenuFor(picker, menu);
    toggle.setAttribute("aria-expanded", "true");
  };

  const close = () => {
    openedByTouchPress = false;
    if (menu.hidden) return;
    menu.hidden = true;
    controls?.classList.remove("translation-picker-open");
    toggle.setAttribute("aria-expanded", "false");
  };

  toggle.addEventListener("click", () => {
    const openedByThisPress = openedByTouchPress;
    openedByTouchPress = false;
    if (Date.now() < suppressClickUntil) return;
    if (menu.hidden) open();
    else if (!openedByThisPress) close();
  });

  const onOutsidePointerDown = (event) => {
    if (menu.hidden) return;
    if (picker.contains(event.target)) return;
    close();
    shieldOutsidePress(event);
  };
  document.addEventListener("pointerdown", onOutsidePointerDown, true);

  const onKeydown = (event) => {
    if (event.key === "Escape" && !menu.hidden) close();
  };
  document.addEventListener("keydown", onKeydown);

  setupPressDragPick({
    opener: toggle,
    menu,
    optionSelector: ".translation-picker-option",
    onOpen: () => {
      if (!menu.hidden) return;
      open();
      openedByTouchPress = true;
    },
    onPick: (option) => option.click(),
    onGestureEnd: () => {
      suppressClickUntil = Date.now() + 500;
    },
  });

  // Callers wired to a panel (which can be destroyed mid-session, unlike the
  // two dialogs this was originally built for) must be able to drop these
  // document-level listeners so a removed panel's picker/menu aren't kept
  // alive forever by them.
  const destroy = () => {
    controls?.classList.remove("translation-picker-open");
    document.removeEventListener("pointerdown", onOutsidePointerDown, true);
    document.removeEventListener("keydown", onKeydown);
  };

  // Scrolls an already-enabled chip into view within this list's own
  // horizontal scroller, without touching the page's own scroll position --
  // used when something other than a direct chip click activates one (see
  // the word-click/verse-click auto-show in buildTranslationLinesInto/
  // renderPanelBody), so a chip pushed off-screen by a long chip list still
  // gets shown once it's the one now active. A no-op if it's already in
  // view. Computes this list's own scrollLeft directly rather than calling
  // the chip's scrollIntoView -- that would also walk up to the panel-track
  // (every panel's own shared outer horizontal scroller) if this panel
  // itself happens to be scrolled/paged out of view, which is exactly the
  // case a *linked* panel's cross-panel activation (see linkGroupPartners)
  // hits constantly -- e.g. clicking a word in one linked panel opening STR
  // in another, off-screen one. That must only ever reveal the chip within
  // this one list; it must never yank an off-screen linked panel into view
  // on its own, only an explicit move by the reader should do that.
  const revealChip = (id) => {
    const chip = list.querySelector(`[data-translation="${id}"]`);
    if (!chip) return;
    const listRect = list.getBoundingClientRect();
    const chipRect = chip.getBoundingClientRect();
    if (chipRect.left < listRect.left) {
      list.scrollLeft -= listRect.left - chipRect.left;
    } else if (chipRect.right > listRect.right) {
      list.scrollLeft += chipRect.right - listRect.right;
    }
  };

  return { render, open, close, destroy, revealChip };
}

// Reading mode's translation button is a lighter, single-select cousin of
// setupDialogTranslationControl above: there's no chip list to manage and
// no add/remove, just "pick a different translation to read in" -- picking
// one replaces the panel's sole enabled translation outright. Reuses the
// same option markup (buildTranslationPickerOption) and the same
// clipping-safe positioning (positionTranslationPickerMenuFor) as every
// other translation picker in the app.
// getPanelState is a getter rather than a fixed value because the reading-
// copy dialog's own version icon (unlike each panel's own, which is
// permanently bound to that one panel) is a singleton shared across
// whichever panel's copy dialog happens to be open at the time.
function setupReadingTranslationPicker(toggle, menu, getPanelState, { afterPick } = {}) {
  const picker = toggle.closest(".panel-reading-translation-picker");

  const render = () => {
    menu.replaceChildren();
    if (!manifest) return;
    const panelState = getPanelState();
    const current = panelState && singleReadableTranslation(panelState);
    const columns = document.createElement("div");
    columns.className = "translation-picker-columns";
    const mainColumn = document.createElement("div");
    mainColumn.className = "translation-picker-column";
    for (const group of TRANSLATION_GROUPS) {
      const ids = group.ids.filter((id) => translationMeta(id));
      if (!ids.length) continue;
      const section = document.createElement("div");
      section.className = "translation-picker-group";
      const heading = document.createElement("div");
      heading.className = "translation-picker-group-label";
      heading.textContent = group.label;
      section.append(heading);
      for (const id of ids) {
        section.append(
          buildTranslationPickerOption({
            id,
            meta: translationMeta(id),
            isEnabled: id === current,
            disabled: false,
            onPick: () => pick(id),
          }),
        );
      }
      mainColumn.append(section);
    }
    columns.append(mainColumn);
    menu.append(columns);
  };

  const close = () => {
    if (menu.hidden) return;
    menu.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  };

  const open = () => {
    if (!menu.hidden) return;
    render();
    menu.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    positionTranslationPickerMenuFor(picker, menu);
  };

  function pick(id) {
    close();
    const panelState = getPanelState();
    if (!panelState) return;
    if (id !== singleReadableTranslation(panelState)) {
      panelState.enabledTranslations = [id];
      panelState.highlightedTranslations = [];
      panelState.dimmedTranslations = [];
      saveState();
      renderPanelBody(panelState);
    }
    afterPick?.(id);
  }

  toggle.addEventListener("click", () => {
    if (menu.hidden) open();
    else close();
  });

  const onOutsidePointerDown = (event) => {
    if (menu.hidden) return;
    if (picker.contains(event.target)) return;
    close();
    shieldOutsidePress(event);
  };
  document.addEventListener("pointerdown", onOutsidePointerDown, true);

  const onKeydown = (event) => {
    if (event.key === "Escape" && !menu.hidden) close();
  };
  document.addEventListener("keydown", onKeydown);

  const destroy = () => {
    document.removeEventListener("pointerdown", onOutsidePointerDown, true);
    document.removeEventListener("keydown", onKeydown);
  };

  return { open, close, destroy };
}

const HANGUL_INITIALS = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";

function hangulInitials(value) {
  return [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      if (code < 0xac00 || code > 0xd7a3) return character;
      return HANGUL_INITIALS[Math.floor((code - 0xac00) / 588)];
    })
    .join("");
}

function matchesBook(item, query) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  if (`${item.ko} ${item.en}`.toLocaleLowerCase().includes(needle)) return true;
  const compact = needle.replace(/\s+/g, "");
  return [...compact].every((character) => HANGUL_INITIALS.includes(character))
    && hangulInitials(item.ko).includes(compact);
}

function syncTrackFreeScroll() {
  panelTrack.classList.toggle("free-scroll", desktopLikePanels());
}
syncTrackFreeScroll();

mobileLayout.addEventListener("change", () => {
  updatePanelCountControls();
  syncTrackFreeScroll();
});

// Swallow the press that closed an open dropdown so it cannot reach — and
// act on — whatever sits underneath (e.g. a verse tap starting copy mode).
// Only that press's own click is swallowed: a new press or a short timeout
// disarms the guard.
function shieldOutsidePress(event) {
  event.preventDefault();
  event.stopPropagation();
  const swallowClick = (clickEvent) => {
    clickEvent.preventDefault();
    clickEvent.stopPropagation();
    disarm();
  };
  const disarm = () => {
    document.removeEventListener("click", swallowClick, true);
    document.removeEventListener("pointerdown", disarm, true);
    window.clearTimeout(timer);
  };
  document.addEventListener("click", swallowClick, true);
  document.addEventListener("pointerdown", disarm, true);
  const timer = window.setTimeout(disarm, 700);
}

// A press outside an open book/chapter dropdown closes it; the input's text
// snaps back to the current selection (the combo listens for combo-restore).
// On touch the press is fully swallowed — it only dismisses the menu.
document.addEventListener(
  "pointerdown",
  (event) => {
    let closedByTouch = false;
    for (const menu of document.querySelectorAll(".combo-menu:not([hidden])")) {
      const combo = menu.closest(".combo");
      if (!combo || combo.contains(event.target)) continue;
      const input = combo.querySelector(".combo-input");
      if (event.pointerType === "touch") closedByTouch = true;
      if (document.activeElement === input) {
        // Blur closes the menu, restores the label, and puts the on-screen
        // keyboard away; on desktop the focus shift does it naturally.
        if (event.pointerType === "touch") input.blur();
        continue;
      }
      menu.hidden = true;
      input.setAttribute("aria-expanded", "false");
      combo.dispatchEvent(new CustomEvent("combo-restore"));
    }
    if (closedByTouch) shieldOutsidePress(event);
  },
  true,
);

// The portrait two-row header keeps the "Holy Bible" label only while it
// fits. The panel-count control sits in the flexible column of the top row,
// so when space runs out it is the first thing pushed into the brand: that
// overlap is the signal to drop the label (and re-measure on every resize
// so it comes back as soon as it fits again).
const brandLabel = siteBrand.querySelector("span:last-child");
const panelCountControl = panelCountOneButton.closest(".panel-count-control");

function updateBrandLabelVisibility() {
  if (!brandLabel) return;
  document.body.classList.remove("brand-label-hidden");
  if (phonePortraitLayout.matches) return;
  if (!mobileLayout.matches || touchPanelToggleLayout.matches) return;
  const brandRect = siteBrand.getBoundingClientRect();
  const controlLeft = panelCountControl.getBoundingClientRect().left;
  if (controlLeft < brandRect.right + 2) {
    document.body.classList.add("brand-label-hidden");
  }
}

let brandLabelFrame = 0;
function scheduleBrandLabelUpdate() {
  window.cancelAnimationFrame(brandLabelFrame);
  brandLabelFrame = window.requestAnimationFrame(updateBrandLabelVisibility);
}

window.addEventListener("resize", scheduleBrandLabelUpdate);
mobileLayout.addEventListener("change", scheduleBrandLabelUpdate);
phonePortraitLayout.addEventListener("change", scheduleBrandLabelUpdate);
touchPanelToggleLayout.addEventListener("change", scheduleBrandLabelUpdate);
scheduleBrandLabelUpdate();

// On desktop, wheel scrolling anywhere outside the reading surface — the app
// header bar, each panel's header bar, and the empty strips around the panels
// — pans the panel track. Wheel ticks arrive in coarse jumps, so instead of
// stepping instantly the deltas accumulate into a target the track glides
// toward each frame.
let headerPanTarget = null;
let headerPanFrame = 0;
let desktopPanelSnapTimer = 0;
let desktopPanelSnapping = false;

function shouldSnapDesktopPanels() {
  return !mobileLayout.matches && Boolean(state?.desktopPanelMode);
}

function scheduleDesktopPanelSnap(delay = 140) {
  if (!shouldSnapDesktopPanels() || desktopPanelSnapping) return;
  window.clearTimeout(desktopPanelSnapTimer);
  desktopPanelSnapTimer = window.setTimeout(snapDesktopPanelsToNearest, delay);
}

function snapDesktopPanelsToNearest() {
  desktopPanelSnapTimer = 0;
  if (!shouldSnapDesktopPanels() || desktopPanelSnapping) return;
  if (headerPanTarget != null || headerPanFrame) {
    scheduleDesktopPanelSnap(120);
    return;
  }
  const targetLeft = panelScrollLeft(panelIndexAtViewportStart());
  if (Math.abs(panelTrack.scrollLeft - targetLeft) <= 1) {
    panelTrack.scrollTo({ left: targetLeft, behavior: "instant" });
    return;
  }
  desktopPanelSnapping = true;
  animateTrackScroll(targetLeft, 220, () => {
    desktopPanelSnapping = false;
  });
}

function stepHeaderPan() {
  headerPanFrame = 0;
  if (headerPanTarget == null) return;
  const current = panelTrack.scrollLeft;
  const remaining = headerPanTarget - current;
  if (Math.abs(remaining) <= 1) {
    panelTrack.scrollTo({ left: headerPanTarget, behavior: "instant" });
    headerPanTarget = null;
    scheduleDesktopPanelSnap(80);
    return;
  }
  const step = Math.sign(remaining) * Math.max(1, Math.abs(remaining) * 0.16);
  panelTrack.scrollTo({ left: current + step, behavior: "instant" });
  headerPanFrame = requestAnimationFrame(stepHeaderPan);
}

function isWheelPanRegion(target) {
  if (!(target instanceof Element)) return false;
  // An open combo dropdown scrolls its own option list.
  if (target.closest(".combo-menu")) return false;
  // An open translation picker dropdown scrolls its own option list too.
  if (target.closest(".translation-picker-menu")) return false;
  if (target.closest(".app-header") || target.closest(".panel-header")) return true;
  // The track and workspace are only hit directly in the gaps around panels.
  return target === panelTrack || target.classList.contains("workspace");
}

function handleTranslationListWheel(event) {
  const list = event.target instanceof Element
    ? event.target.closest(".translation-list")
    : null;
  if (!list || list.scrollWidth <= list.clientWidth + 1) return false;
  const unit = event.deltaMode === 1 ? 16 : 1;
  const delta = (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * unit;
  if (!delta) return false;
  event.preventDefault();
  list.scrollLeft += delta;
  return true;
}

// The search dialog's book list and the TSK/Englishman's Concordance word
// lists collapse into a single horizontally-scrolling row once the dialog
// narrows past its own book-list breakpoint (see the (max-width: 820px)/
// (max-width: 760px) rules in styles.css for each) -- which a plain desktop
// window can hit just by narrowing, with a mouse and no touchscreen. Checked
// ahead of the mobileLayout bail-out below (unlike handleTranslationListWheel
// above) since that's exactly the width range this is meant to cover;
// scrollWidth only exceeds clientWidth once the row has actually collapsed
// into that strip, so it's a no-op the rest of the time.
function handleNarrowNavListWheel(event) {
  const list = event.target instanceof Element
    ? event.target.closest(".search-book-list, .concordance-nav, .tsk-word-nav")
    : null;
  if (!list || list.scrollWidth <= list.clientWidth + 1) return false;
  const unit = event.deltaMode === 1 ? 16 : 1;
  const delta = (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * unit;
  if (!delta) return false;
  event.preventDefault();
  list.scrollLeft += delta;
  return true;
}

document.addEventListener(
  "wheel",
  (event) => {
    if (handleNarrowNavListWheel(event)) return;
    if (mobileLayout.matches || !state?.panels?.length) return;
    if (handleTranslationListWheel(event)) return;
    if (!isWheelPanRegion(event.target)) return;
    const unit = event.deltaMode === 1 ? 16 : 1;
    const delta = (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * unit;
    if (!delta) return;
    event.preventDefault();
    const maxScroll = Math.max(0, panelTrack.scrollWidth - panelTrack.clientWidth);
    const base = headerPanTarget ?? panelTrack.scrollLeft;
    headerPanTarget = Math.max(0, Math.min(base + delta, maxScroll));
    if (reducedMotion.matches) {
      panelTrack.scrollTo({ left: headerPanTarget, behavior: "instant" });
      headerPanTarget = null;
      scheduleDesktopPanelSnap(80);
      return;
    }
    if (!headerPanFrame) headerPanFrame = requestAnimationFrame(stepHeaderPan);
  },
  { passive: false },
);

// A selected desktop preset means "full screen" or "half screen", so the
// widths follow the window when it is resized -- deliberately NOT gated on
// desktopLikePanels() here (only on a preset actually being active): once
// the window narrows enough to leave desktop-like layout entirely,
// applyDesktopPanelWidths's own desktopLikePanels() check is what clears
// the stale preset instead, and it needs this handler to still call it to
// do that (see its own comment for why gating it out here again would
// bring back the exact bug this exists to fix).
let desktopModeResizeTimer = 0;
window.addEventListener("resize", () => {
  if (!state?.desktopPanelMode) return;
  window.clearTimeout(desktopModeResizeTimer);
  desktopModeResizeTimer = window.setTimeout(() => {
    const alignmentIndex = panelIndexAtViewportStart();
    applyDesktopPanelWidths();
    alignPanelsAfterLayoutChange(alignmentIndex);
    saveState();
  }, 150);
});

// The two-panel-mode button's disabled state (see updatePanelCountControls)
// depends on the viewport's current width even when no desktop preset is
// active -- e.g. a half-split panel that was manually resized wide enough
// to split in place, with desktopPanelMode still null -- so it needs its
// own resize listener rather than piggybacking on the one above.
let panelCountResizeTimer = 0;
window.addEventListener("resize", () => {
  window.clearTimeout(panelCountResizeTimer);
  panelCountResizeTimer = window.setTimeout(updatePanelCountControls, 150);
});

panelTrack.addEventListener(
  "scroll",
  () => {
    if (
      desktopPanelSnapping
      || headerPanTarget != null
      || panelTrack.classList.contains("panel-count-changing")
      || panelTrack.classList.contains("removing-panel")
    ) {
      return;
    }
    scheduleDesktopPanelSnap();
  },
  { passive: true },
);

function panelScrollLeft(index) {
  const panelState = state.panels[index];
  const panel = panelState ? panelElements.get(panelState.id)?.panel : null;
  if (!panel) return panelTrack.scrollLeft;
  const paddingLeft = Number.parseFloat(getComputedStyle(panelTrack).paddingLeft) || 0;
  return Math.max(0, panel.offsetLeft - paddingLeft);
}

// A linked group hiding its own partners (see applyLinkedPartnersVisibility)
// leaves them sitting in state.panels with a `hidden` DOM element -- one
// with no box at all, so its own offsetLeft collapses to 0 regardless of
// where it would have sat. Left uncounted here, a hidden partner ties
// against (or even wins over) whichever panel is actually first on screen
// the moment the real scroll position is also near 0, silently reporting
// the wrong index to every caller (swipe gestures, alignment, the
// add-panel reveal) below.
function visiblePanelIndices() {
  const indices = [];
  state.panels.forEach((panelState, index) => {
    const elements = panelElements.get(panelState.id);
    if (elements && !elements.panel.hidden) indices.push(index);
  });
  return indices;
}

function panelIndexAtViewportStart() {
  if (!state?.panels?.length) return 0;
  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;
  state.panels.forEach((panelState, index) => {
    const elements = panelElements.get(panelState.id);
    if (!elements || elements.panel.hidden) return;
    const distance = Math.abs(panelTrack.scrollLeft - panelScrollLeft(index));
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });
  return closestIndex;
}

function scrollToPanelIndex(index, behavior = "smooth", activate = true) {
  if (!state.panels.length) return;
  const targetIndex = Math.max(0, Math.min(index, state.panels.length - 1));
  panelTrack.scrollTo({ left: panelScrollLeft(targetIndex), behavior });
  const targetState = state.panels[targetIndex];
  if (activate && targetState) setActivePanel(targetState.id);
}

function setupCombobox({ input, menu, items, selectedValue, matches, onSelect, selectOnFocus = true }) {
  let allItems = items;
  let selected = selectedValue;
  let filtered = [];
  let highlighted = 0;
  const comboKind = menu.closest(".book-combo")
    ? "book"
    : menu.closest(".chapter-combo")
      ? "chapter"
      : menu.closest(".verse-combo")
        ? "verse"
        : "";

  function selectedItem() {
    return allItems.find((item) => item.value === selected);
  }

  function close() {
    menu.hidden = true;
    input.setAttribute("aria-expanded", "false");
  }

  function resetMenuPosition() {
    menu.style.removeProperty("left");
    menu.style.removeProperty("right");
    menu.style.removeProperty("width");
    menu.style.removeProperty("position");
    menu.style.removeProperty("top");
    menu.style.removeProperty("bottom");
    menu.style.removeProperty("max-height");
  }

  // A combo's menu can be taller/wider than a short host dialog (e.g. the
  // copy dialogs' range rows), which clips it against that dialog's own
  // edge under the default absolute-inside-.combo positioning. Anchoring
  // it with position: fixed instead escapes that ancestor entirely
  // (dialogs don't establish a fixed-position containing block here) and
  // lets it flip above the input -- and shrink to whatever room is
  // actually available -- when there isn't enough space below, mirroring
  // positionTranslationPickerMenuFor's own dialog-aware logic.
  function positionMenuWithinDialog() {
    const combo = input.closest(".combo");
    if (!combo) return false;
    const comboRect = combo.getBoundingClientRect();
    const bookKind = comboKind === "book";
    const preferredWidth = Math.min(bookKind ? 520 : 270, window.innerWidth - 24);
    const gap = 5;
    const below = window.innerHeight - comboRect.bottom - gap - 8;
    const above = comboRect.top - gap - 8;
    const openAbove = below < 160 && above > below;
    const maxHeight = Math.max(120, Math.min(bookKind ? 480 : 418, openAbove ? above : below));
    const naturalLeft = bookKind ? comboRect.left : comboRect.right - preferredWidth;
    const left = Math.max(8, Math.min(naturalLeft, window.innerWidth - preferredWidth - 8));
    menu.style.position = "fixed";
    menu.style.left = `${left}px`;
    menu.style.right = "auto";
    menu.style.width = `${preferredWidth}px`;
    menu.style.top = openAbove ? "auto" : `${comboRect.bottom + gap}px`;
    menu.style.bottom = openAbove ? `${window.innerHeight - comboRect.top + gap}px` : "auto";
    menu.style.maxHeight = `${maxHeight}px`;
    return true;
  }

  function positionMenu() {
    resetMenuPosition();

    // The reading-mode book selector sits centered mid-header rather than
    // at the row's own left edge like every other book combo, so the
    // default "520px rightward from the input's left edge" anchor can run
    // straight off the panel (or the viewport, in single-panel layouts).
    // Keep the same option-list width/look, just clamp its left edge to
    // stay fully on screen.
    const readingNav = input.closest(".panel-reading-nav");
    if (comboKind === "book" && readingNav) {
      const combo = input.closest(".combo");
      if (!combo) return;
      const menuWidth = Math.min(520, window.innerWidth - 24);
      const comboRect = combo.getBoundingClientRect();
      const left = Math.max(8, Math.min(comboRect.left, window.innerWidth - menuWidth - 8));
      menu.style.left = `${left - comboRect.left}px`;
      menu.style.right = "auto";
      menu.style.width = `${menuWidth}px`;
      return;
    }

    // On mobile the book combo itself is much narrower than the full
    // selector row (book/chapter/verse share that row with the history
    // arrows), so its dropdown -- which needs real width for the
    // two-column book list -- is widened and re-anchored to that whole
    // row's bounds instead of the narrow input's own, or it overflows
    // past whichever edge of the screen is closer to the input. Both the
    // main panel (.panel-selectors) and the TSK dialog (.tsk-selectors)
    // reuse this same combobox, so either can be the row boundary.
    if (comboKind === "book" && mobileLayout.matches) {
      const combo = input.closest(".combo");
      const boundary = input.closest(".panel-selectors") ?? input.closest(".tsk-selectors");
      if (combo && boundary) {
        const comboRect = combo.getBoundingClientRect();
        const boundaryRect = boundary.getBoundingClientRect();
        if (comboRect.width && boundaryRect.width) {
          menu.style.left = `${Math.round(boundaryRect.left - comboRect.left)}px`;
          menu.style.right = "auto";
          menu.style.width = `${Math.floor(boundaryRect.width)}px`;
          return;
        }
      }
    }

    // Everything else -- inside a <dialog>, a study tool's own embedded
    // shell (same fixed-height, overflow: hidden shape a dialog has), or
    // the main panel's own header combos -- gets the fixed-position
    // fallback above. Used unconditionally rather than only inside a
    // dialog/study-tool-pane: iOS Safari occasionally composites the
    // panel's own scrolling verse text above a plain absolute-inside-
    // .combo menu instead of below it (a compositing-layer quirk, not a
    // real z-index conflict -- nothing here actually outranks the menu's
    // own stacking order), and escaping to the viewport's own layer via
    // position: fixed sidesteps that regardless of cause.
    positionMenuWithinDialog();
  }

  function choose(item, notify = true) {
    if (!item) return;
    selected = item.value;
    input.value = item.label;
    close();
    if (notify) onSelect(item.value);
  }

  function menuHeading(text, extraClass = "") {
    const heading = document.createElement("div");
    heading.className = `combo-menu-heading${extraClass ? ` ${extraClass}` : ""}`;
    heading.textContent = text;
    return heading;
  }

  function render(query = "") {
    filtered = allItems.filter((item) => matches(item, query));
    // With no query, start the list from the current selection instead of
    // the top; while typing, keep the first match highlighted.
    const selectedIndex = query.trim() ? -1 : filtered.findIndex((item) => item.value === selected);
    highlighted = selectedIndex >= 0 ? selectedIndex : 0;
    menu.replaceChildren();
    const emptyQuery = !query.trim();
    if (emptyQuery && comboKind === "chapter") menu.append(menuHeading("CHAPTER"));
    if (emptyQuery && comboKind === "verse") menu.append(menuHeading("VERSE"));
    let addedNewTestamentHeading = false;
    if (emptyQuery && comboKind === "book") {
      menu.append(menuHeading("OLD TESTAMENT", "combo-menu-heading-old"));
    }
    for (const [index, item] of filtered.entries()) {
      if (
        emptyQuery &&
        comboKind === "book" &&
        !addedNewTestamentHeading &&
        item.testament === "new"
      ) {
        menu.append(menuHeading("NEW TESTAMENT", "combo-menu-heading-new"));
        addedNewTestamentHeading = true;
      }
      const option = document.createElement("button");
      option.type = "button";
      option.className = "combo-option";
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(item.value === selected));
      option.textContent = item.label;
      option.addEventListener("click", () => choose(item));
      if (index === highlighted) option.classList.add("highlighted");
      menu.append(option);
    }
    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "combo-empty";
      empty.textContent = "No matches";
      menu.append(empty);
    }
    if (query.trim()) menu.scrollTop = 0;
  }

  function updateHighlight(nextIndex) {
    if (!filtered.length) return;
    highlighted = (nextIndex + filtered.length) % filtered.length;
    menu.querySelectorAll(".combo-option").forEach((option, index) => {
      option.classList.toggle("highlighted", index === highlighted);
    });
    menu.querySelectorAll(".combo-option")[highlighted]?.scrollIntoView({ block: "nearest" });
  }

  function moveHighlight(nextIndex) {
    if (!filtered.length) return false;
    if (nextIndex < 0 || nextIndex >= filtered.length) return false;
    updateHighlight(nextIndex);
    return true;
  }

  function keyboardTarget(key) {
    const options = [...menu.querySelectorAll(".combo-option")];
    const current = options[highlighted];
    if (!current) return null;
    const currentRect = current.getBoundingClientRect();
    const currentX = currentRect.left + currentRect.width / 2;
    const currentY = currentRect.top + currentRect.height / 2;
    const sameRowTolerance = currentRect.height * 0.55;
    const sameColumnTolerance = currentRect.width * 0.55;
    let bestIndex = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const [index, option] of options.entries()) {
      if (index === highlighted) continue;
      const rect = option.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const dx = x - currentX;
      const dy = y - currentY;
      let valid = false;
      let score = Number.POSITIVE_INFINITY;
      if (key === "ArrowRight" && dx > 0 && Math.abs(dy) <= sameRowTolerance) {
        valid = true;
        score = dx + Math.abs(dy) * 8;
      } else if (key === "ArrowLeft" && dx < 0 && Math.abs(dy) <= sameRowTolerance) {
        valid = true;
        score = Math.abs(dx) + Math.abs(dy) * 8;
      } else if (key === "ArrowDown" && dy > 0 && Math.abs(dx) <= sameColumnTolerance) {
        valid = true;
        score = dy + Math.abs(dx) * 8;
      } else if (key === "ArrowUp" && dy < 0 && Math.abs(dx) <= sameColumnTolerance) {
        valid = true;
        score = Math.abs(dy) + Math.abs(dx) * 8;
      }
      if (valid && score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    return bestIndex;
  }

  function centerHighlighted() {
    const option = menu.querySelectorAll(".combo-option")[highlighted];
    if (!option) return;
    menu.scrollTop = option.offsetTop - (menu.clientHeight - option.offsetHeight) / 2;
  }

  // Opening fresh shows the full list scrolled so the current selection
  // sits centered; the selection itself is kept and snaps back if the menu
  // is left without choosing. clearText blanks the input outright (used by
  // the touch tap-to-open path below, which blurs again immediately so the
  // field is never left sitting empty); everywhere else opening instead
  // selects the existing text (see the focus listener), so an incidental
  // click landing anywhere in the input's box -- not just on its visible
  // text -- highlights the current value ready to be typed over instead of
  // blanking it and leaving a caret blinking in what looks like empty space.
  function open(clearText = false, focusInput = false) {
    if (clearText) input.value = "";
    render(clearText ? "" : input.value === selectedItem()?.label ? "" : input.value);
    menu.hidden = false;
    input.setAttribute("aria-expanded", "true");
    positionMenu();
    if (focusInput) input.focus({ preventScroll: true });
    centerHighlighted();
  }

  let menuPointerActive = false;

  input.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch" || !mobileLayout.matches) return;
    event.preventDefault();
    if (menu.hidden) open(true);
    input.blur();
  });
  input.addEventListener("focus", () => {
    if (menu.hidden) open();
    // Only worth select-all-on-focus where retyping over the current value
    // is a real path (book/chapter/verse); the panel-fit-count combobox
    // (see its own setupCombobox call) is picked from its dropdown only,
    // so a visible text selection there would just be a drag-highlight
    // with no keyboard-input behavior behind it.
    if (selectOnFocus) input.select();
  });
  input.addEventListener("click", () => {
    if (menu.hidden) open();
  });
  input.addEventListener("input", () => {
    render(input.value);
    menu.hidden = false;
    input.setAttribute("aria-expanded", "true");
    positionMenu();
  });
  input.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if (
      event.key === "ArrowDown" ||
      event.key === "ArrowUp" ||
      event.key === "ArrowLeft" ||
      event.key === "ArrowRight"
    ) {
      event.preventDefault();
      if (menu.hidden) open();
      const nextIndex = keyboardTarget(event.key);
      if (nextIndex != null) moveHighlight(nextIndex);
    } else if (event.key === "Enter") {
      if (!menu.hidden && filtered.length) {
        event.preventDefault();
        choose(filtered[highlighted]);
      }
    } else if (event.key === "Escape") {
      close();
      input.value = selectedItem()?.label ?? "";
    }
  });
  input.addEventListener("blur", () => {
    window.setTimeout(() => {
      if (menuPointerActive) return;
      close();
      input.value = selectedItem()?.label ?? "";
    }, 100);
  });
  const releaseMenuPointer = () => {
    window.setTimeout(() => {
      menuPointerActive = false;
    }, 150);
  };
  menu.addEventListener("pointerdown", (event) => {
    menuPointerActive = true;
    const pointerId = event.pointerId;
    const release = (releaseEvent) => {
      if (releaseEvent.pointerId !== pointerId) return;
      document.removeEventListener("pointerup", release, true);
      document.removeEventListener("pointercancel", release, true);
      releaseMenuPointer();
    };
    document.addEventListener("pointerup", release, true);
    document.addEventListener("pointercancel", release, true);
  });
  // The outside-press closer (see the document pointerdown listener) asks
  // the combo to put the selected label back after it hides the menu.
  input.closest(".combo").addEventListener("combo-restore", () => {
    input.value = selectedItem()?.label ?? "";
  });

  choose(selectedItem(), false);
  close();

  return {
    open,
    close,
    setItems(nextItems) {
      allItems = nextItems;
      render();
    },
    setValue(value) {
      selected = value;
      choose(selectedItem(), false);
    },
  };
}

// Momentum for continuous touch panning: the track keeps gliding with the
// finger's release velocity (px per ms) and decays.
let panelGlideFrame = 0;
const TOUCH_PANEL_FLICK_VELOCITY = 0.55;
const TOUCH_PANEL_FLICK_DISTANCE = 24;

function cancelPanelGlide() {
  cancelAnimationFrame(panelGlideFrame);
  panelGlideFrame = 0;
}

function startPanelGlide(velocity) {
  cancelPanelGlide();
  if (!Number.isFinite(velocity) || Math.abs(velocity) < 0.08 || reducedMotion.matches) return;
  let speed = Math.max(-4, Math.min(velocity, 4));
  let previous = performance.now();
  const step = (now) => {
    panelGlideFrame = 0;
    const elapsed = Math.min(now - previous, 40);
    previous = now;
    panelTrack.scrollLeft += speed * elapsed;
    speed *= 0.95 ** (elapsed / 16);
    const maxScroll = Math.max(0, panelTrack.scrollWidth - panelTrack.clientWidth);
    if (Math.abs(speed) < 0.04 || panelTrack.scrollLeft <= 0 || panelTrack.scrollLeft >= maxScroll) return;
    panelGlideFrame = requestAnimationFrame(step);
  };
  panelGlideFrame = requestAnimationFrame(step);
}

function snapTouchPanelsAfterSwipe({ velocityX = 0, startIndex = null, totalDeltaX = 0 } = {}) {
  if (!mobileLayout.matches) return false;
  if (!phonePortraitLayout.matches && (!touchPanelToggleLayout.matches || !state?.desktopPanelMode)) {
    return false;
  }
  cancelPanelGlide();
  let targetIndex = panelIndexAtViewportStart();
  const isFlick = Math.abs(velocityX) >= TOUCH_PANEL_FLICK_VELOCITY
    && Math.abs(totalDeltaX) >= TOUCH_PANEL_FLICK_DISTANCE;
  if (isFlick) {
    const baseIndex = Number.isInteger(startIndex) ? startIndex : targetIndex;
    const direction = velocityX < 0 ? 1 : -1;
    // Plain baseIndex + direction can land squarely on a hidden linked
    // partner's own index -- one that reserves no actual space on screen
    // (see visiblePanelIndices) -- silently snapping the flick back to
    // scrollLeft 0 instead of on to the next panel a reader can see.
    // Stepping within the visible list instead always lands on real,
    // on-screen content.
    const visible = visiblePanelIndices();
    const basePosition = visible.indexOf(baseIndex);
    targetIndex = basePosition === -1
      ? Math.max(0, Math.min(baseIndex + direction, state.panels.length - 1))
      : visible[Math.max(0, Math.min(basePosition + direction, visible.length - 1))];
  }
  animateTrackScroll(panelScrollLeft(targetIndex), 220);
  return true;
}


// Horizontal touch drags on a panel pan the track by hand, following the
// finger position directly with momentum on release.
function setupPanelSwipe(panel) {
  let gesture = null;
  let suppressClick = false;
  const findTouch = (touches, id) => {
    for (let index = 0; index < touches.length; index += 1) {
      if (touches[index].identifier === id) return touches[index];
    }
    return null;
  };
  // .panel-move-overlay is deliberately left out: while picking a move
  // target on mobile, a horizontal drag across it needs to browse between
  // panels exactly like a plain content touch would, while a short tap
  // still reaches its own click handler below (the same drag-vs-tap
  // disambiguation already used for verse taps, via suppressClick).
  // .translation-list is excluded too -- with several versions enabled its
  // own chip row overflows and needs the same horizontal drag to scroll
  // (or, starting on a chip's .drag-handle, to reorder it) instead of that
  // touch being stolen for a panel swipe before either can ever see it.
  const shouldIgnoreSwipeStart = (target) => (
    target.closest("button:not(.panel-move-overlay), input, textarea, select, .combo-menu, .panel-resize-handle, .translation-list")
  );

  panel.addEventListener("click", (event) => {
    if (suppressClick) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  panel.addEventListener("touchstart", (event) => {
    cancelPanelGlide();
    if (event.touches.length !== 1) {
      gesture = null;
      document.body.classList.remove("swiping-panels");
      return;
    }
    if (!mobileLayout.matches) return;
    if (shouldIgnoreSwipeStart(event.target)) return;
    const touch = event.touches[0];
    gesture = {
      touchId: touch.identifier,
      startX: touch.clientX,
      startY: touch.clientY,
      startScrollLeft: panelTrack.scrollLeft,
      startIndex: panelIndexAtViewportStart(),
      axis: null,
      samples: [{ time: performance.now(), x: touch.clientX }],
    };
  }, { passive: true });

  panel.addEventListener("touchmove", (event) => {
    if (!gesture) return;
    if (event.touches.length !== 1) {
      gesture = null;
      document.body.classList.remove("swiping-panels");
      return;
    }
    if (panelTrack.classList.contains("panel-reorder-active")) {
      gesture = null;
      return;
    }
    const touch = findTouch(event.touches, gesture.touchId);
    if (!touch) return;
    const deltaX = touch.clientX - gesture.startX;
    const deltaY = touch.clientY - gesture.startY;
    const distanceX = Math.abs(deltaX);
    const distanceY = Math.abs(deltaY);

    if (!gesture.axis && Math.max(distanceX, distanceY) >= 3) {
      gesture.axis = distanceX > distanceY ? "horizontal" : "vertical";
    }
    if (gesture.axis !== "horizontal") return;
    if (state.panels.length < 2) return;

    event.preventDefault();
    document.body.classList.add("swiping-panels");
    panelTrack.scrollLeft = gesture.startScrollLeft - deltaX;
    const now = performance.now();
    gesture.samples.push({ time: now, x: touch.clientX });
    while (gesture.samples.length > 8 || now - gesture.samples[0].time > 160) {
      gesture.samples.shift();
    }
  }, { passive: false });

  const finish = (event, cancelled = false) => {
    if (!gesture) return;
    const touch = findTouch(event.changedTouches, gesture.touchId);
    if (!touch) return;
    const hadDrag = Boolean(gesture.axis);
    if (gesture.axis === "horizontal") {
      const samples = gesture.samples;
      const first = samples[0];
      const last = samples[samples.length - 1];
      const velocityX = first && last && last.time > first.time
        ? (last.x - first.x) / (last.time - first.time)
        : 0;
      if (snapTouchPanelsAfterSwipe({
        velocityX: cancelled ? 0 : velocityX,
        startIndex: gesture.startIndex,
        totalDeltaX: touch.clientX - gesture.startX,
      })) {
        // The one/two-panel touch presets always land on a panel edge.
      } else if (!cancelled && first && last && last.time > first.time) {
        startPanelGlide(-velocityX);
      }

      suppressClick = true;
      window.setTimeout(() => {
        suppressClick = false;
      }, 400);
    } else if (hadDrag) {
      suppressClick = true;
      window.setTimeout(() => {
        suppressClick = false;
      }, 300);
    }
    document.body.classList.remove("swiping-panels");
    gesture = null;
  };

  panel.addEventListener("touchend", (event) => finish(event));
  panel.addEventListener("touchcancel", (event) => finish(event, true));
}

// Reading mode's own book selector shows only the book name in the current
// translation's language (unlike the normal panel's bilingual "Genesis
// 창세기" combo) -- ko/en stay on each item regardless so matchesBook can
// still search either language.
// The dropdown list itself reads exactly like the normal panel's own book
// combo -- "English 한국어" for every option, regardless of translation --
// only the closed input's own displayed value (set separately in
// updateReadingModeControls) follows the current translation's language.
function readingBookItems() {
  return manifest.books.map((book, index) => ({
    value: index,
    label: `${book.en} ${book.ko}`,
    ko: book.ko,
    en: book.en,
    testament: index < 39 ? "old" : "new",
  }));
}

function chapterItems(bookIndex) {
  return Array.from({ length: manifest.books[bookIndex].chapters }, (_, index) => ({
    value: index + 1,
    label: String(index + 1),
  }));
}

function verseItems(panelState) {
  // Before the chapter data for this panel has loaded, fall back to a
  // single-item list holding the panel's own verse instead of a hardcoded
  // 1 — otherwise the pre-fetch updatePanelControls call below would clamp
  // (and persist) an in-progress or restored verse down to 1.
  const verses = panelState.data?.v?.map(([verse]) => Number(verse)).filter(Number.isFinite)
    ?? [Math.max(1, Number(panelState.verse) || 1)];
  return verses.map((verse) => ({ value: verse, label: String(verse) }));
}

function normalizePassage(book, chapter, verse = 1) {
  const normalizedBook = Math.max(0, Math.min(Number(book) || 0, manifest.books.length - 1));
  const normalizedChapter = Math.max(
    1,
    Math.min(Number(chapter) || 1, manifest.books[normalizedBook].chapters),
  );
  return {
    book: normalizedBook,
    chapter: normalizedChapter,
    verse: Math.max(1, Number(verse) || 1),
  };
}

function samePassage(a, b) {
  return Boolean(a && b && a.book === b.book && a.chapter === b.chapter && a.verse === b.verse);
}

function currentPassage(panelState) {
  return normalizePassage(panelState.book, panelState.chapter, panelState.verse);
}

function ensurePanelHistory(panelState) {
  if (!Array.isArray(panelState.history) || !panelState.history.length) {
    panelState.history = [currentPassage(panelState)];
    panelState.historyIndex = 0;
  }
  panelState.historyIndex = Math.max(
    0,
    Math.min(Number(panelState.historyIndex) || 0, panelState.history.length - 1),
  );
}

function recordPanelHistory(panelState, passage = currentPassage(panelState)) {
  ensurePanelHistory(panelState);
  if (samePassage(panelState.history[panelState.historyIndex], passage)) return;
  // The passage a fresh/reset panel starts on isn't a real visited stop —
  // replace it in place instead of recording a back-target for it, but only
  // for this first navigation; after that history behaves normally.
  if (panelState.historyIsProvisional) {
    panelState.historyIsProvisional = false;
    panelState.history[panelState.historyIndex] = passage;
    return;
  }
  panelState.history = panelState.history.slice(0, panelState.historyIndex + 1);
  panelState.history.push(passage);
  if (panelState.history.length > 100) panelState.history.shift();
  panelState.historyIndex = panelState.history.length - 1;
}

function maximumPanelWidth() {
  return Math.max(MIN_PANEL_WIDTH, panelAvailableWidth());
}

function setupPanelResize(panel, handle, panelState) {
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = panel.getBoundingClientRect().width;
    document.body.classList.add("resizing-panel");
    handle.setPointerCapture(event.pointerId);

    const resize = (moveEvent) => {
      const width = Math.max(MIN_PANEL_WIDTH, Math.min(startWidth + moveEvent.clientX - startX, maximumPanelWidth()));
      panelState.width = Math.round(width);
      applyPanelWidth(panel, panelState.width);
      clearDesktopPanelMode();
    };
    const finish = () => {
      document.body.classList.remove("resizing-panel");
      handle.removeEventListener("pointermove", resize);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", finish);
      saveState();
    };

    handle.addEventListener("pointermove", resize);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  });

  handle.addEventListener("dblclick", () => {
    panelState.width = null;
    panel.style.removeProperty("flex-basis");
    panel.style.removeProperty("width");
    clearDesktopPanelMode();
    saveState();
  });
}

function setupPanelMoveReveal(panel, moveLeft, moveRight) {
  const clear = () => {
    moveLeft.classList.remove("revealed");
    moveRight.classList.remove("revealed");
  };

  panel.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") return;
    const rect = panel.getBoundingClientRect();
    const nearMiddle = Math.abs(event.clientY - (rect.top + rect.height / 2)) <= 82;
    moveLeft.classList.toggle("revealed", nearMiddle && event.clientX - rect.left <= 64);
    moveRight.classList.toggle("revealed", nearMiddle && rect.right - event.clientX <= 64);
  });
  panel.addEventListener("pointerleave", clear);
}

function createPanelElement(panelState, shouldScroll = false) {
  const id = `panel-${++panelIdCounter}`;
  panelState.id = id;
  const fragment = panelTemplate.content.cloneNode(true);
  const panel = fragment.querySelector(".bible-panel");
  const header = fragment.querySelector(".panel-header");
  const bookInput = fragment.querySelector(".book-input");
  const chapterInput = fragment.querySelector(".chapter-input");
  const verseInput = fragment.querySelector(".verse-input");
  const content = fragment.querySelector(".panel-content");
  const translationPickerEl = fragment.querySelector(".panel-translation-picker");
  const translationPickerToggleEl = fragment.querySelector(".panel-translation-picker-toggle");
  const translationPickerMenuEl = fragment.querySelector(".panel-translation-picker-menu");
  const translationListEl = fragment.querySelector(".panel-translation-list");
  const readingModeToggleEl = fragment.querySelector(".panel-reading-mode-toggle");
  const linkModeToggleEl = fragment.querySelector(".panel-link-mode-toggle");
  const translationNameToggleEl = fragment.querySelector(".panel-translation-name-toggle");
  const moreControlEl = fragment.querySelector(".panel-more-control");
  const moreToggleEl = fragment.querySelector(".panel-more-toggle");
  const moreMenuEl = fragment.querySelector(".panel-more-menu");
  const linkVisibilityControlEl = fragment.querySelector(".panel-link-visibility-control");
  const linkVisibilityToggleEl = fragment.querySelector(".panel-link-visibility-toggle");
  const linkOverlay = fragment.querySelector(".panel-link-overlay");
  const readingBookInput = fragment.querySelector(".panel-reading-book-input");
  const readingBookPrev = fragment.querySelector(".panel-reading-book-prev");
  const readingBookNext = fragment.querySelector(".panel-reading-book-next");
  const readingTranslationToggleEl = fragment.querySelector(".panel-reading-translation-toggle");
  const readingTranslationMenuEl = fragment.querySelector(".panel-reading-translation-menu");
  const readingTranslationName = fragment.querySelector(".panel-reading-translation-toggle .translation-name");
  const numberingToggle = fragment.querySelector(".panel-numbering-toggle");
  const verseActions = fragment.querySelector(".verse-actions");
  const verseActionsPopup = fragment.querySelector(".verse-actions-popup");
  const verseActionsOptions = fragment.querySelector(".verse-actions-options");
  const verseActionsHighlight = fragment.querySelector(".verse-actions-highlight");
  const verseActionsBookmark = fragment.querySelector(".verse-actions-bookmark");
  const verseActionsNote = fragment.querySelector(".verse-actions-note");
  const copy = fragment.querySelector(".copy-selection");
  const tskSelection = fragment.querySelector(".tsk-selection");
  const selectionModeControl = fragment.querySelector(".selection-mode-control");
  const selectionModeRange = fragment.querySelector(".selection-mode-range");
  const selectionModeIndividual = fragment.querySelector(".selection-mode-individual");
  const cancelSelection = fragment.querySelector(".cancel-selection");
  const wordActions = fragment.querySelector(".word-actions");
  const wordDictionary = fragment.querySelector(".word-dictionary");
  const wordCopy = fragment.querySelector(".word-copy");
  const wordCancel = fragment.querySelector(".word-cancel");
  const remove = fragment.querySelector(".remove-panel");
  const historyBack = fragment.querySelector(".panel-history-back");
  const historyForward = fragment.querySelector(".panel-history-forward");
  const moveLeft = fragment.querySelector(".panel-move-left");
  const moveRight = fragment.querySelector(".panel-move-right");
  const moveOverlay = fragment.querySelector(".panel-move-overlay");
  const previous = fragment.querySelector(".previous-chapter");
  const next = fragment.querySelector(".next-chapter");
  const resizeHandle = fragment.querySelector(".panel-resize-handle");
  const strongsNavHistoryBack = fragment.querySelector(".panel-strongs-history-back");
  const strongsNavHistoryForward = fragment.querySelector(".panel-strongs-history-forward");
  const strongsNavLangPicker = fragment.querySelector(".panel-strongs-lang-picker");
  const strongsNavLangToggle = strongsNavLangPicker.querySelector(".strongs-lang-toggle");
  const strongsNavLangToggleLabel = fragment.querySelector(".panel-strongs-lang-toggle-label");
  const strongsNavLangMenu = strongsNavLangPicker.querySelector(".strongs-lang-menu");
  const strongsNavNumberInput = fragment.querySelector(".panel-strongs-nav-number");
  const strongsNavEnglishInput = fragment.querySelector(".panel-strongs-nav-english");
  const strongsNavEnglishClear = fragment.querySelector(".panel-strongs-nav-english-clear");
  const strongsNavEnglishWrap = fragment.querySelector(".panel-strongs-nav-english-wrap");
  const strongsNavSuggestions = fragment.querySelector(".panel-strongs-nav-suggestions");
  const strongsNavSearchButton = fragment.querySelector(".panel-strongs-nav-search");
  const strongsNavRemove = fragment.querySelector(".panel-strongs-remove");

  panel.dataset.panelId = id;
  panelState.selectionAnchor = null;
  panelState.selectionEnd = null;
  panelState.selectedVerses = new Set();
  panelState.selectionMode = state.copySelectionMode;
  panelState.selectedWord = null;
  panelState.readingNumbering = false;
  panelState.verse = Number(panelState.verse) || 1;
  ensurePanelHistory(panelState);
  if (panelState.width) {
    const renderedWidth = desktopLikePanels()
      ? Math.min(panelState.width, maximumPanelWidth())
      : panelState.width;
    applyPanelWidth(panel, renderedWidth, mobileLayout.matches && !desktopLikePanels());
  }
  panel.addEventListener("pointerdown", () => setActivePanel(id));
  panel.addEventListener("focusin", () => setActivePanel(id));

  const bookItems = manifest.books.map((book, index) => ({
    value: index,
    label: `${book.en} ${book.ko}`,
    ko: book.ko,
    en: book.en,
    testament: index < 39 ? "old" : "new",
  }));
  const bookCombo = setupCombobox({
    input: bookInput,
    menu: fragment.querySelector(".book-combo .combo-menu"),
    items: bookItems,
    selectedValue: panelState.book,
    matches: matchesBook,
    onSelect: (book) => {
      goToPassage(panelState, { book, chapter: 1, verse: 1 }, { record: true });
    },
  });
  const chapterCombo = setupCombobox({
    input: chapterInput,
    menu: fragment.querySelector(".chapter-combo .combo-menu"),
    items: chapterItems(panelState.book),
    selectedValue: panelState.chapter,
    matches: (item, query) => !query.trim() || item.label.startsWith(query.trim()),
    onSelect: (chapter) => {
      goToPassage(panelState, { book: panelState.book, chapter, verse: 1 }, { record: true });
    },
  });
  const verseCombo = setupCombobox({
    input: verseInput,
    menu: fragment.querySelector(".verse-combo .combo-menu"),
    items: [{ value: panelState.verse, label: String(panelState.verse) }],
    selectedValue: panelState.verse,
    matches: (item, query) => !query.trim() || item.label.startsWith(query.trim()),
    onSelect: (verse) => {
      goToPassage(
        panelState,
        { book: panelState.book, chapter: panelState.chapter, verse },
        { record: true },
      );
    },
  });
  const readingBookCombo = setupCombobox({
    input: readingBookInput,
    menu: fragment.querySelector(".panel-reading-nav .combo-menu"),
    items: readingBookItems(),
    selectedValue: panelState.book,
    matches: matchesBook,
    onSelect: (book) => {
      goToPassage(panelState, { book, chapter: 1, verse: 1 }, { record: true });
    },
  });
  // Picking a version here updates panelState.enabledTranslations directly
  // (same as the normal translation picker), so the verse text is already
  // correct the moment reading mode turns off -- but the chip list itself
  // (hidden while reading) still needs telling to redraw, or it goes on
  // showing whatever version was selected before this change.
  const readingTranslationPicker = setupReadingTranslationPicker(
    readingTranslationToggleEl,
    readingTranslationMenuEl,
    () => panelState,
    { afterPick: () => translationControl.render() },
  );
  const translationControl = setupDialogTranslationControl({
    picker: translationPickerEl,
    toggle: translationPickerToggleEl,
    menu: translationPickerMenuEl,
    list: translationListEl,
    getOrder: () => panelState.enabledTranslations,
    setOrder: (order) => applyTranslationOrder(panelState, order),
    getOriginalLanguageTestament: () => testamentForBook(panelState.book),
    showStudyTools: true,
    // HEB/GRK's own show/hide toggle (see toggleTranslationChip) reads as
    // "dim" here too, same chip-dimmed fade already shown while a study
    // tool is active alongside it (dimmedTranslations) -- two independent
    // reasons for the same "this chip's content isn't showing" look, so
    // either one alone is enough to trigger it.
    getEmphasis: (id) => (
      panelState.highlightedTranslations.includes(id) ? "highlight"
        : panelState.dimmedTranslations.includes(id) || (ORIGINAL_LANGUAGE_IDS.includes(id) && panelState.originalLanguageHidden) ? "dim"
        : "normal"
    ),
    // Clicking a normal version chip cycles normal -> highlight -> dim ->
    // normal; clicking STR/TSK instead switches this panel into (or
    // out of) that tool's own embedded content -- see toggleTranslationChip.
    onToggleActive: (id, options) => toggleTranslationChip(panelState, id, options),
    onChange: () => {
      saveState();
      renderPanelBody(panelState);
      refreshTskCrossColumnTranslations(panelState);
    },
  });
  panelState.strNav = createPanelStrongsNav(panelState, {
    historyBack: strongsNavHistoryBack,
    historyForward: strongsNavHistoryForward,
    langToggle: strongsNavLangToggle,
    langToggleLabel: strongsNavLangToggleLabel,
    langMenu: strongsNavLangMenu,
    langPicker: strongsNavLangPicker,
    numberInput: strongsNavNumberInput,
    englishInput: strongsNavEnglishInput,
    englishClear: strongsNavEnglishClear,
    englishWrap: strongsNavEnglishWrap,
    suggestions: strongsNavSuggestions,
    searchButton: strongsNavSearchButton,
  });
  // Each of this popup's own items closes it first, same as the app-level
  // "..." menu's own items already do (see panelOptionsHighlightButton and
  // its siblings) -- a mode-entering click (reading mode, link-picking)
  // leaving a stray popup sitting open over the changed screen would read
  // as broken, and closing unconditionally for the name toggle too keeps
  // all three consistent rather than two closing and one not.
  readingModeToggleEl.addEventListener("click", () => {
    closePanelMoreMenu();
    toggleReadingMode(panelState);
  });
  linkModeToggleEl.addEventListener("click", () => {
    closePanelMoreMenu();
    toggleLinkMode(panelState);
  });
  translationNameToggleEl.addEventListener("click", () => {
    closePanelMoreMenu();
    toggleTranslationNamesShown(panelState);
  });
  moreToggleEl.addEventListener("click", () => togglePanelMoreMenu(panelState));
  linkVisibilityToggleEl.addEventListener("click", () => toggleLinkedPartnersVisibility(panelState));
  readingBookPrev.addEventListener("click", () => navigateReadingBook(panelState, -1));
  readingBookNext.addEventListener("click", () => navigateReadingBook(panelState, 1));
  numberingToggle.addEventListener("click", () => toggleReadingNumbering(panelState));
  copy.addEventListener("click", () => openCopyDialog(panelState));
  tskSelection.addEventListener("click", () => openTskDialog(panelState));
  verseActionsOptions.addEventListener("click", () => toggleVerseActionsPopup(panelState));
  verseActionsHighlight.addEventListener("click", () => openHighlightDialog(panelState));
  verseActionsBookmark.addEventListener("click", () => toggleBookmarkForSelection(panelState));
  verseActionsNote.addEventListener("click", () => openNoteDialog(panelState));
  selectionModeRange.addEventListener("click", () => setPanelSelectionMode(panelState, "range"));
  selectionModeIndividual.addEventListener("click", () => setPanelSelectionMode(panelState, "individual"));
  cancelSelection.addEventListener("click", () => clearPanelSelection(panelState));
  wordDictionary.addEventListener("click", () => openStrongsDialog(panelState));
  wordCopy.addEventListener("click", () => copySelectedWord(panelState));
  wordCancel.addEventListener("click", () => clearWordLookup(panelState));
  remove.addEventListener("click", () => removePanel(id));
  strongsNavRemove.addEventListener("click", () => removePanel(id));
  historyBack.addEventListener("click", () => navigatePanelHistory(panelState, -1));
  historyForward.addEventListener("click", () => navigatePanelHistory(panelState, 1));
  moveLeft.addEventListener("click", (event) => {
    event.stopPropagation();
    movePanelBy(panelState, -1);
  });
  moveRight.addEventListener("click", (event) => {
    event.stopPropagation();
    movePanelBy(panelState, 1);
  });
  moveOverlay.addEventListener("click", (event) => {
    event.stopPropagation();
    moveToPanel(panelState);
  });
  linkOverlay.addEventListener("click", (event) => {
    event.stopPropagation();
    linkToPanel(panelState);
  });
  content.addEventListener("scroll", () => {
    const expected = groupScrollSyncTarget.get(id);
    if (expected != null && Math.abs(content.scrollTop - expected) < 1) {
      groupScrollSyncTarget.delete(id);
      return;
    }
    // A study tool's own pane fills .panel-content exactly (see
    // renderPanelBody's own paneHeight calc), leaving nothing to actually
    // scroll -- .panel-content's scrollTop gets clamped to 0 the instant
    // this panel switches to one, a structural side effect of the content
    // swap, not a real scroll gesture. Broadcasting that 0 to the rest of
    // the group would yank every *other* linked panel's own plain-text
    // reading position back to the top of its chapter for no reason a
    // reader asked for.
    if (panelState.linkGroupId != null && !panelState.activeStudyTool && !isSuppressingGroupScrollSync(id)) {
      syncGroupScroll(panelState, content.scrollTop);
    }
  });
  previous.addEventListener("click", () => navigateChapter(panelState, -1));
  next.addEventListener("click", () => navigateChapter(panelState, 1));
  setupPanelResize(panel, resizeHandle, panelState);
  setupPanelMoveReveal(panel, moveLeft, moveRight);
  setupPanelSwipe(panel);

  panelElements.set(id, {
    panel,
    header,
    bookCombo,
    chapterCombo,
    verseCombo,
    content,
    verseActions,
    verseActionsPopup,
    verseActionsOptions,
    copy,
    tskSelection,
    selectionModeControl,
    selectionModeRange,
    selectionModeIndividual,
    cancelSelection,
    wordActions,
    wordDictionary,
    wordCopy,
    wordCancel,
    remove,
    historyBack,
    historyForward,
    moveLeft,
    moveRight,
    moveOverlay,
    previous,
    next,
    translationControl,
    readingModeToggle: readingModeToggleEl,
    linkModeToggle: linkModeToggleEl,
    translationNameToggle: translationNameToggleEl,
    moreControl: moreControlEl,
    moreToggle: moreToggleEl,
    moreMenu: moreMenuEl,
    linkVisibilityControl: linkVisibilityControlEl,
    linkVisibilityToggle: linkVisibilityToggleEl,
    linkOverlay,
    readingBookCombo,
    readingBookInput,
    readingBookPrev,
    readingBookNext,
    readingTranslationName,
    readingTranslationPicker,
    numberingToggle,
  });
  // Keeps updateActionBarScoping's column-width math correct through any
  // resize the panel's own box goes through -- window resize, the drag
  // handle, desktop preset width snapping, orientation change -- without
  // having to hook each of those triggers individually. Horizontal
  // position only ever needs recomputing on an actual size change, not on
  // .panel-content's own vertical scroll (that never moves the column
  // sideways), so this alone is enough.
  const actionBarResizeObserver = new ResizeObserver(() => {
    updateActionBarScoping(panelState);
    // A resize (drag handle, window resize, one/two/many-panel mode) can
    // change how each verse's own text wraps -- and so its natural row
    // height -- same as a font-size change already does above.
    if (panelState.linkGroupId != null) scheduleGroupRowHeightSync(panelState.linkGroupId);
  });
  actionBarResizeObserver.observe(panel);
  panelElements.get(id).actionBarResizeObserver = actionBarResizeObserver;
  panelTrack.append(fragment);
  translationControl.render();
  updateReadingModeControls(panelState);
  updatePanelNumbers();
  updatePanelMoveButtons();
  updateRemoveButtons();
  updatePanelCountControls();
  setActivePanel(id);
  loadPanel(panelState, panelState.verse);

  if (shouldScroll) {
    requestAnimationFrame(() => panel.scrollIntoView({ behavior: "smooth", inline: "end", block: "nearest" }));
  }
  return panel;
}

// Clicking any panel in a link group highlights the whole group's own
// border together, not just the one clicked -- and, since only one
// group's (or one lone panel's) border is ever highlighted at a time,
// picking a different group clears whichever one was highlighted before,
// same as picking a different lone panel already did.
function setActivePanel(id) {
  activePanelId = id;
  const clicked = state.panels.find((panel) => panel.id === id);
  const groupId = clicked?.linkGroupId ?? null;
  for (const [panelId, elements] of panelElements) {
    const isActive = groupId != null
      ? state.panels.find((panel) => panel.id === panelId)?.linkGroupId === groupId
      : panelId === id;
    elements.panel.classList.toggle("active", isActive);
  }
}

// Shared fallback for anything not tied to one specific panel (a
// page-header dialog, the shared STR history's own prev/next) that still
// needs *some* panel to act on -- whichever one is currently active, or
// just the first if nothing is.
function activeOrFirstPanel() {
  return state.panels.find((panel) => panel.id === activePanelId) ?? state.panels[0];
}

function addPanel({ suppressScroll = false } = {}) {
  if (panelMutationInProgress) return;
  const previousCount = state.panels.length;
  const viewportStart = panelIndexAtViewportStart();
  // Always the rightmost panel specifically (not whichever happens to be
  // active) -- per explicit request, a freshly added panel always starts
  // from the same book/chapter/verse as whatever was already at the far
  // right. "Rightmost" means rightmost *visible* one, though: a linked
  // group collapsed down to a single visible member via its own hide/show
  // toggle (see applyLinkedPartnersVisibility) still keeps its other
  // members sitting in this same array, just not on screen -- plain array
  // order alone could land on one of those hidden panels instead of
  // whatever the reader can actually see.
  let source = null;
  for (let i = state.panels.length - 1; i >= 0; i -= 1) {
    if (!panelElements.get(state.panels[i].id)?.panel.hidden) {
      source = state.panels[i];
      break;
    }
  }
  source ??= state.panels.at(-1);
  // Translations/study-tool deliberately do NOT carry over (per explicit
  // request) -- a freshly added panel always starts with no version
  // selected at all, prompting the reader to add one themselves (see the
  // translationControl.open() call below) rather than silently cloning
  // whatever the source panel happened to already be showing.
  const panelState = {
    book: source?.book ?? 0,
    chapter: source?.chapter ?? 1,
    verse: source?.verse ?? 1,
    width: source?.width ?? null,
    enabledTranslations: [],
    highlightedTranslations: [],
    dimmedTranslations: [],
    originalLanguageHidden: false,
    activeStudyTool: null,
    readingMode: false,
    translationNamesShown: source?.translationNamesShown ?? true,
  };
  state.panels.push(panelState);
  saveState();
  const twoPanelTouchMode = isTwoPanelTouchMode();
  const panel = createPanelElement(panelState, !twoPanelTouchMode && !suppressScroll);
  if (twoPanelTouchMode) {
    panel.animate(
      [
        { opacity: 0, transform: "translateX(24px)" },
        { opacity: 1, transform: "translateX(0)" },
      ],
      { duration: reducedMotion.matches ? 0 : 280, easing: "cubic-bezier(.2,.75,.25,1)" },
    );
    // A caller that's about to take over activation/scrolling itself (see
    // moveToNewPanel) needs this suppressed -- otherwise this fires a
    // *second*, later smooth-scroll one animation frame after that caller's
    // own, targeting whatever pair-reveal index made sense for the plain
    // add-panel button (not necessarily this new panel's actual index), and
    // being later it wins the race, silently redirecting the screen away
    // from the panel the caller meant to land on.
    if (!suppressScroll) {
      const targetIndex = previousCount < 2 ? 0 : Math.min(viewportStart + 1, state.panels.length - 1);
      requestAnimationFrame(() => scrollToPanelIndex(targetIndex, "smooth", false));
    }
  }
  // No version selected yet -- open the add-version picker immediately so
  // the reader isn't left staring at an empty panel with no obvious next
  // step (matches moveToNewPanel/linkToNewPanel, which both create their
  // new panel through here too).
  panelElements.get(panelState.id)?.translationControl.open();
  return panelState;
}

function removePanel(id) {
  if (state.panels.length === 1 || panelMutationInProgress) return;
  const index = state.panels.findIndex((panel) => panel.id === id);
  if (index < 0) return;
  panelMutationInProgress = true;
  const isLast = index === state.panels.length - 1;
  const wasViewingRemoved = panelIndexAtViewportStart() === index;
  const removedElements = panelElements.get(id);
  const removedPanel = removedElements?.panel;
  const removedPanelState = state.panels[index];
  removedElements?.actionBarResizeObserver.disconnect();
  removedElements?.translationControl.destroy();
  removedElements?.readingTranslationPicker.destroy();
  removedPanelState.strNav?.destroy();
  destroyStudyToolInstances(removedPanelState);
  if (pendingLinkSource === removedPanelState) exitLinkPicking();
  if (openPanelMoreMenuId === id) closePanelMoreMenu();
  groupScrollSyncTarget.delete(id);
  linkVisibilityAnimationTokens.delete(id);
  linkVisibilityTargetHidden.delete(id);

  state.panels.splice(index, 1);
  panelElements.delete(id);
  // Same reasoning as clearLinkedPartnersHiding -- a removed panel's own
  // "I'm hiding my partners" flag must not linger as a phantom entry no
  // toggle will ever clear again.
  hidingLinkedPartners.delete(id);
  // A group of one left behind by the removal isn't a group anymore (same
  // rule as unlinkPanel) -- otherwise its sole survivor would sit there
  // still showing a linked, pale-green icon with no partner left to sync
  // with at all.
  if (removedPanelState.linkGroupId != null) {
    const remaining = state.panels.filter((panel) => panel.linkGroupId === removedPanelState.linkGroupId);
    if (remaining.length === 1) {
      remaining[0].linkGroupId = null;
      updateLinkModeControls(remaining[0]);
      // The lone survivor's own min-heights were last sized to match the
      // just-removed panel -- with the group gone, nothing will ever
      // recompute (or clear) them for it again (see unlinkPanel's own
      // identical branch).
      clearPanelRowHeightOverrides(remaining[0]);
    } else if (remaining.length >= 2) {
      scheduleGroupRowHeightSync(removedPanelState.linkGroupId);
      // Mirrors unlinkPanel's own equivalent call -- if the removed panel
      // was the one hiding the rest of the group, the survivors are still
      // sitting there hidden with nothing left to reveal them otherwise.
      applyLinkedPartnersVisibility(removedPanelState.linkGroupId);
    }
  }
  if (activePanelId === id) setActivePanel(state.panels[Math.min(index, state.panels.length - 1)].id);
  saveState();
  updatePanelNumbers();
  updateRemoveButtons();
  updatePanelMoveButtons();
  updatePanelCountControls();

  if (!removedPanel || reducedMotion.matches) {
    removedPanel?.remove();
    panelMutationInProgress = false;
    return;
  }

  try {
    removedPanel.style.pointerEvents = "none";
    const collapse = () =>
      collapsePanel(removedPanel, () => {
        panelMutationInProgress = false;
      });

    if (isLast && mobileLayout.matches && wasViewingRemoved) {
      // The rightmost panel fills the phone screen, so collapsing it in
      // place would swap the view with no motion at all: glide to the
      // neighbor first, then collapse the leaving panel off-screen.
      // Mandatory snap would fight the glide, so disable it for the
      // duration (collapsePanel's finish restores it).
      panelTrack.classList.add("removing-panel");
      const target = isTwoPanelTouchMode() ? state.panels.length - 2 : state.panels.length - 1;
      animateTrackScroll(panelScrollLeft(Math.max(0, target)), 320, collapse);
    } else {
      collapse();
    }
  } catch {
    removedPanel.remove();
    panelMutationInProgress = false;
  }
}

// Native scrollTo({behavior: "smooth"}) is unreliable mid-removal — snap
// containers can cut it short and some browsers finish it instantly — so
// the glide is driven by hand, which also lets the collapse chain exactly
// when the scroll lands.
function animateTrackScroll(targetLeft, duration, done) {
  const startLeft = panelTrack.scrollLeft;
  const distance = targetLeft - startLeft;
  if (!distance || reducedMotion.matches) {
    panelTrack.scrollLeft = targetLeft;
    done?.();
    return;
  }
  const startTime = performance.now();
  const easeOutCubic = (t) => 1 - (1 - t) ** 3;
  const step = (now) => {
    const progress = Math.min((now - startTime) / duration, 1);
    panelTrack.scrollLeft = startLeft + distance * easeOutCubic(progress);
    if (progress < 1) requestAnimationFrame(step);
    else done?.();
  };
  requestAnimationFrame(step);
}

function collapsePanel(panel, done) {
  const width = panel.getBoundingClientRect().width;
  const gap = Number.parseFloat(getComputedStyle(panelTrack).columnGap) || 0;
  // Inline styles with the "important" priority beat the mobile stylesheet's
  // !important flex-basis, and pinning the start size in px keeps the
  // shrink-to-zero transition animatable.
  panel.style.setProperty("flex-basis", `${width}px`, "important");
  panel.style.setProperty("width", `${width}px`, "important");
  panel.style.setProperty("--removed-gap", `${gap}px`);
  panel.style.setProperty("--removed-width", `${width}px`);
  panelTrack.classList.add("removing-panel");
  panel.getBoundingClientRect();
  panel.classList.add("panel-removing");
  panel.style.setProperty("flex-basis", "0px", "important");
  panel.style.setProperty("width", "0px", "important");

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    panel.remove();
    if (!panelTrack.querySelector(".panel-removing")) panelTrack.classList.remove("removing-panel");
    done?.();
  };
  panel.addEventListener("transitionend", (event) => {
    if (event.target === panel && event.propertyName === "flex-basis") finish();
  });
  window.setTimeout(finish, 460);
}

function movePanel(from, to, { animate = true } = {}) {
  if (from === to || from < 0 || to < 0 || to >= state.panels.length) return;
  const previousLefts = new Map(
    state.panels.map((panelState) => [
      panelState.id,
      panelElements.get(panelState.id).panel.getBoundingClientRect().left,
    ]),
  );
  const [moved] = state.panels.splice(from, 1);
  state.panels.splice(to, 0, moved);
  const movedPanel = panelElements.get(moved.id).panel;
  const nextState = state.panels[to + 1];
  // Reordering must swap panels in place: browsers otherwise scroll to follow
  // the moved node (scroll anchoring / snap), dragging the whole view along.
  const savedScrollLeft = panelTrack.scrollLeft;
  panelTrack.classList.add("panel-count-changing");
  panelTrack.insertBefore(movedPanel, nextState ? panelElements.get(nextState.id).panel : null);
  panelTrack.scrollLeft = savedScrollLeft;
  requestAnimationFrame(() => {
    panelTrack.scrollLeft = savedScrollLeft;
    panelTrack.classList.remove("panel-count-changing");
    panelTrack.scrollLeft = savedScrollLeft;
  });
  saveState();
  updatePanelNumbers();
  updatePanelMoveButtons();
  if (!animate || reducedMotion.matches) return;
  for (const [panelId, oldLeft] of previousLefts) {
    const panel = panelElements.get(panelId)?.panel;
    if (!panel) continue;
    const delta = oldLeft - panel.getBoundingClientRect().left;
    if (Math.abs(delta) < 1) continue;
    panel.animate(
      [{ transform: `translateX(${delta}px)` }, { transform: "translateX(0)" }],
      { duration: 260, easing: "cubic-bezier(.2,.75,.25,1)" },
    );
  }
}

function movePanelBy(panelState, direction) {
  if (panelMutationInProgress) return;
  const from = state.panels.findIndex((item) => item.id === panelState.id);
  movePanel(from, from + direction);
}

function updatePanelNumbers() {
}

function updatePanelMoveButtons() {
  state.panels.forEach((panelState, index) => {
    const elements = panelElements.get(panelState.id);
    if (!elements) return;
    elements.moveLeft.disabled = index === 0;
    elements.moveRight.disabled = index === state.panels.length - 1;
  });
}

function updateRemoveButtons() {
  const disabled = state.panels.length === 1;
  for (const { remove } of panelElements.values()) {
    remove.disabled = disabled;
  }
}

function chapterPath(bookIndex, chapter) {
  return `./data/chapters/${manifest.books[bookIndex].slug}/${chapter}.json?v=${ASSET_VERSION}`;
}

async function getChapter(bookIndex, chapter) {
  const key = `${bookIndex}:${chapter}`;
  if (chapterCache.has(key)) return chapterCache.get(key);
  const response = await fetch(chapterPath(bookIndex, chapter), { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load this chapter (${response.status})`);
  const data = await response.json();
  chapterCache.set(key, data);
  if (chapterCache.size > 40) chapterCache.delete(chapterCache.keys().next().value);
  return data;
}

function interlinearPath(bookIndex, chapter) {
  return `./data/interlinear/${manifest.books[bookIndex].slug}/${chapter}.json?v=${ASSET_VERSION}`;
}

// Not every chapter has interlinear tokens exported yet, so a 404 is treated
// as "no tokens for this chapter" rather than an error (see scripts/export_interlinear.py).
async function getInterlinearChapter(bookIndex, chapter) {
  const key = `${bookIndex}:${chapter}`;
  if (interlinearCache.has(key)) return interlinearCache.get(key);
  const response = await fetch(interlinearPath(bookIndex, chapter), { cache: "no-store" });
  const data = response.ok ? await response.json() : { v: [] };
  interlinearCache.set(key, data);
  if (interlinearCache.size > 40) interlinearCache.delete(interlinearCache.keys().next().value);
  return data;
}

// Lazily fetches this panel's interlinear chapter data when Hebrew/Greek is
// active, keyed to the panel's current book/chapter so a navigation or
// language swap triggers a fresh fetch. Re-renders the panel once loaded.
function ensureInterlinearData(panelState) {
  const activeId = activeOriginalLanguageId(panelState.enabledTranslations);
  if (!activeId) {
    panelState.interlinearVerses = null;
    return;
  }
  const cache = panelState.interlinearVerses;
  if (cache && cache.book === panelState.book && cache.chapter === panelState.chapter) return;
  const requestBook = panelState.book;
  const requestChapter = panelState.chapter;
  panelState.interlinearVerses = { book: requestBook, chapter: requestChapter, loading: true, map: new Map() };
  getInterlinearChapter(requestBook, requestChapter)
    .then((data) => {
      if (panelState.book !== requestBook || panelState.chapter !== requestChapter) return;
      if (!activeOriginalLanguageId(panelState.enabledTranslations)) return;
      panelState.interlinearVerses = { book: requestBook, chapter: requestChapter, loading: false, map: new Map(data.v) };
      renderPanelBody(panelState);
    })
    .catch(() => {
      if (panelState.book !== requestBook || panelState.chapter !== requestChapter) return;
      panelState.interlinearVerses = { book: requestBook, chapter: requestChapter, loading: false, map: new Map() };
      renderPanelBody(panelState);
    });
}

function interlinearTokensForVerse(panelState, verseNumber) {
  const cache = panelState.interlinearVerses;
  if (!cache || cache.loading || cache.book !== panelState.book || cache.chapter !== panelState.chapter) return null;
  return cache.map.get(verseNumber) ?? null;
}

// Strong's dictionary is small enough to load as one file (see
// scripts/export_strongs.py), keyed by code (e.g. "H7225"). A failed fetch
// clears the memo (and rejects) instead of quietly caching {} forever --
// this used to swallow a transient network blip into a permanently-empty
// dictionary for the rest of the session (every lookup silently landing on
// the "no entry" fallback), recoverable only by reloading the page. Callers
// decide their own per-call fallback on rejection (see e.g. renderStrongsDialog).
function getStrongsData() {
  if (!strongsDataPromise) {
    strongsDataPromise = fetch(`./data/strongs.json?v=${ASSET_VERSION}`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load Strong's data (${response.status})`);
        return response.json();
      })
      .catch((error) => {
        strongsDataPromise = null;
        throw error;
      });
  }
  return strongsDataPromise;
}

// The Englishman's Concordance is exported one file per Strong's code (see
// scripts/export_englishmans.py), fetched lazily on first lookup.
async function getEnglishmansEntry(code) {
  if (englishmansCache.has(code)) return englishmansCache.get(code);
  const response = await fetch(`./data/englishmans/${code}.json?v=${ASSET_VERSION}`, { cache: "no-store" });
  const data = response.ok ? await response.json() : null;
  englishmansCache.set(code, data);
  return data;
}

function tskPath(bookIndex, chapter) {
  return `./data/tsk/${manifest.books[bookIndex].slug}/${chapter}.json?v=${ASSET_VERSION}`;
}

// Not every chapter has TSK entries, so a 404 is treated as "no entries"
// rather than an error (see scripts/export_tsk.py).
async function getTskChapter(bookIndex, chapter) {
  const key = `${bookIndex}:${chapter}`;
  if (tskCache.has(key)) return tskCache.get(key);
  const response = await fetch(tskPath(bookIndex, chapter), { cache: "no-store" });
  const data = response.ok ? await response.json() : { v: [] };
  tskCache.set(key, data);
  if (tskCache.size > 40) tskCache.delete(tskCache.keys().next().value);
  return data;
}

// Each token is a [original, transliteration, gloss, strongs] tuple (see
// scripts/export_interlinear.py). Rendered as a row of word blocks, right-to-
// left for Hebrew so words read in their natural order. Clicking a word
// stops the click from also reaching the verse-group (which would otherwise
// start a verse-copy selection instead) and reports the word back via
// onWordClick so the caller can enter word-lookup mode for it.
function buildInterlinearWordRow(tokens, lang, onWordClick, isSelected) {
  const row = document.createElement("div");
  row.className = "interlinear-word-row";
  row.dir = lang === "he" ? "rtl" : "ltr";
  for (const token of tokens) {
    const [original, transliteration, gloss, strongs, morphology] = token;
    const word = document.createElement("span");
    word.className = "interlinear-word";
    word.classList.toggle("selected", Boolean(isSelected?.(token)));
    word.lang = lang;

    const translitEl = document.createElement("span");
    translitEl.className = "interlinear-translit";
    translitEl.textContent = transliteration;

    const originalEl = document.createElement("span");
    originalEl.className = "interlinear-original";
    originalEl.textContent = original;

    const glossEl = document.createElement("span");
    glossEl.className = "interlinear-gloss";
    glossEl.textContent = gloss;

    word.append(translitEl, originalEl, glossEl);
    word.addEventListener("click", (event) => {
      event.stopPropagation();
      onWordClick?.(word, { original, transliteration, gloss, strongs, lang, morphology });
    });
    row.append(word);
  }
  return row;
}

function selectionBounds(panelState) {
  if (panelState.selectionAnchor == null || panelState.selectionEnd == null) return null;
  return [
    Math.min(panelState.selectionAnchor, panelState.selectionEnd),
    Math.max(panelState.selectionAnchor, panelState.selectionEnd),
  ];
}

function selectedVerseNumbers(panelState) {
  if (panelState.selectionMode === "individual") {
    return [...(panelState.selectedVerses ?? new Set())].sort((a, b) => a - b);
  }
  const bounds = selectionBounds(panelState);
  if (!bounds) return [];
  const [start, end] = bounds;
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function hasVerseSelection(panelState) {
  return selectedVerseNumbers(panelState).length > 0;
}

function syncSelectedVersesFromRange(panelState) {
  panelState.selectedVerses = new Set(selectedVerseNumbers(panelState));
}

function selectionModeButtonState(elements, mode) {
  elements.selectionModeRange.classList.toggle("selected", mode === "range");
  elements.selectionModeIndividual.classList.toggle("selected", mode === "individual");
  elements.selectionModeRange.setAttribute("aria-pressed", String(mode === "range"));
  elements.selectionModeIndividual.setAttribute("aria-pressed", String(mode === "individual"));
}

function updatePanelSelection(panelState) {
  const elements = panelElements.get(panelState.id);
  if (!elements) return;
  const selected = new Set(selectedVerseNumbers(panelState));
  const hasSelection = selected.size > 0;
  elements.content.querySelectorAll(".verse-group").forEach((group) => {
    const verse = Number(group.dataset.verse);
    group.classList.toggle("selected", selected.has(verse));
  });
  elements.panel.classList.toggle("selection-active", hasSelection);
  elements.verseActions.hidden = !hasSelection;
  // Any selection change (a different verse, a cleared selection) closes a
  // still-open options popup rather than leaving it floating over whatever
  // verse-actions bar shows up next -- reopening it is one click away.
  elements.verseActionsPopup.hidden = true;
  elements.verseActionsOptions.setAttribute("aria-expanded", "false");
  selectionModeButtonState(elements, panelState.selectionMode);
  updateActionBarScoping(panelState);
}

// The options icon (see .verse-actions-options in index.html -- it sits
// where .tsk-selection used to, now repurposed to reveal it plus three
// placeholder icons above the bar instead of jumping straight to TSK).
function toggleVerseActionsPopup(panelState) {
  const elements = panelElements.get(panelState.id);
  if (!elements) return;
  const opening = elements.verseActionsPopup.hidden;
  elements.verseActionsPopup.hidden = !opening;
  elements.verseActionsOptions.setAttribute("aria-expanded", String(opening));
}

// Clicking an interlinear word enters a separate "word lookup" mode
// (dictionary/index/copy/cancel), mutually exclusive with verse-copy mode
// above -- entering one clears the other (see selectVerse and
// selectInterlinearWord).
function updateWordLookup(panelState) {
  const elements = panelElements.get(panelState.id);
  if (!elements) return;
  const active = Boolean(panelState.selectedWord);
  elements.panel.classList.toggle("word-lookup-active", active);
  elements.wordActions.hidden = !active;
  updateActionBarScoping(panelState);
}

// A study tool fills the whole panel, leaving no plain-text column at all --
// chapter-jump, verse-actions, and word-actions all have nothing left to
// scope themselves to in that state (see the matching CSS), and
// .panel-content's own padding-bottom -- reserved so those same floating
// bars clear the last line of text -- has nothing left to reserve room for
// either (see renderPanelBody's own height-calc, which needs this computed
// *before* it runs so it sees the freed-up space that same render).
function hasNoPlainTextColumn(panelState) {
  return Boolean(panelState.activeStudyTool);
}

// Nothing enabled at all -- not even HEB/GRK or a study tool, just no chip
// of any kind -- so there's no per-verse content to carry a verse number or
// row separator.
function panelHasNoTranslations(panelState) {
  return panelState.enabledTranslations.length === 0;
}

function updateActionBarScoping(panelState) {
  const elements = panelElements.get(panelState.id);
  if (!elements) return;
  elements.panel.classList.toggle("no-plain-text-column", hasNoPlainTextColumn(panelState));
  elements.panel.classList.toggle("study-tool-active", Boolean(panelState.activeStudyTool));
  elements.panel.classList.toggle("panel-no-translations", panelHasNoTranslations(panelState));
}

function clearWordLookup(panelState) {
  if (!panelState.selectedWord) return;
  panelState.selectedWord = null;
  const elements = panelElements.get(panelState.id);
  elements?.content.querySelectorAll(".interlinear-word.selected").forEach((el) => el.classList.remove("selected"));
  updateWordLookup(panelState);
}

function selectInterlinearWord(panelState, verseNumber, wordEl, word) {
  if (wordEl.classList.contains("selected")) {
    clearWordLookup(panelState);
    return;
  }
  clearPanelSelection(panelState);
  const elements = panelElements.get(panelState.id);
  elements?.content.querySelectorAll(".interlinear-word.selected").forEach((el) => el.classList.remove("selected"));
  wordEl.classList.add("selected");
  panelState.selectedWord = { verse: verseNumber, ...word };
  updateWordLookup(panelState);
}

// The floating copy/cancel buttons overlap the bottom edge of the reading
// area, so a verse tapped near the bottom is nudged up just far enough to
// clear them (.verse-group's scroll-margin-bottom sets the clearance).
function revealVerseAboveActions(panelState, verse) {
  const elements = panelElements.get(panelState.id);
  const group = elements?.content.querySelector(`.verse-group[data-verse="${verse}"]`);
  if (!group) return;
  const contentRect = elements.content.getBoundingClientRect();
  const groupRect = group.getBoundingClientRect();
  const clearance = Number.parseFloat(getComputedStyle(group).scrollMarginBottom) || 0;
  const overlap = groupRect.bottom - (contentRect.bottom - clearance);
  if (overlap <= 0) return;
  // A verse taller than the panel keeps its start in view instead.
  const maxUpward = Math.max(0, groupRect.top - contentRect.top - 8);
  const content = elements.content;
  // This nudge is about keeping *this* panel's own just-selected verse
  // clear of *its own* floating toolbar -- a linked partner has no
  // floating toolbar of its own to clear (it may not even share this
  // selection at all), so its own scroll has no reason to follow this one
  // the way a genuine reader-driven scroll should (see the "scroll"
  // listener above). Suppressed for the whole nudge, not just its final
  // position, since a smooth scroll fires many intermediate "scroll"
  // events on its way there, each of which the listener would otherwise
  // broadcast in real time.
  beginSuppressingGroupScrollSync(panelState.id);
  const stopSuppressing = () => {
    content.removeEventListener("scrollend", stopSuppressing);
    endSuppressingGroupScrollSync(panelState.id);
  };
  content.addEventListener("scrollend", stopSuppressing, { once: true });
  // Backstop for browsers with no "scrollend" support -- comfortably
  // longer than this scroll's own transition duration (see the shared
  // --transition-ish timings elsewhere in styles.css) so it only ever
  // matters as a fallback, never as the actual trigger.
  setTimeout(stopSuppressing, 500);
  content.scrollBy({
    top: Math.min(overlap, maxUpward),
    behavior: reducedMotion.matches ? "auto" : "smooth",
  });
}

function clearPanelSelection(panelState) {
  panelState.selectionAnchor = null;
  panelState.selectionEnd = null;
  panelState.selectedVerses = new Set();
  updatePanelSelection(panelState);
}

function setPanelSelectionMode(panelState, mode) {
  if (mode !== "range" && mode !== "individual") return;
  const previous = panelState.selectionMode;
  panelState.selectionMode = mode;
  state.copySelectionMode = mode;
  if (mode === "individual" && previous !== "individual") {
    syncSelectedVersesFromRange(panelState);
  } else if (mode === "range" && previous !== "range") {
    const verses = selectedVerseNumbers(panelState);
    if (verses.length) {
      panelState.selectionAnchor = verses[0];
      panelState.selectionEnd = verses[verses.length - 1];
    }
    syncSelectedVersesFromRange(panelState);
  }
  saveState();
  updatePanelSelection(panelState);
}

function selectVerse(panelState, verse) {
  panelState.lastClickedVerse = verse;
  clearWordLookup(panelState);
  if (!hasVerseSelection(panelState)) {
    panelState.selectionMode = state.copySelectionMode;
  }
  if (panelState.selectionMode === "individual") {
    if (!panelState.selectedVerses) panelState.selectedVerses = new Set();
    if (panelState.selectedVerses.has(verse)) panelState.selectedVerses.delete(verse);
    else panelState.selectedVerses.add(verse);
    if (panelState.selectedVerses.size) {
      const verses = selectedVerseNumbers(panelState);
      panelState.selectionAnchor = verses[0];
      panelState.selectionEnd = verses[verses.length - 1];
    } else {
      panelState.selectionAnchor = null;
      panelState.selectionEnd = null;
    }
    updatePanelSelection(panelState);
    if (hasVerseSelection(panelState)) revealVerseAboveActions(panelState, verse);
    return;
  }
  const bounds = selectionBounds(panelState);
  if (!bounds) {
    panelState.selectionAnchor = verse;
    panelState.selectionEnd = verse;
  } else if (panelState.selectionAnchor === panelState.selectionEnd) {
    if (panelState.selectionAnchor === verse) {
      panelState.selectionAnchor = null;
      panelState.selectionEnd = null;
    } else {
      panelState.selectionEnd = verse;
    }
  } else {
    panelState.selectionAnchor = verse;
    panelState.selectionEnd = verse;
  }
  syncSelectedVersesFromRange(panelState);
  updatePanelSelection(panelState);
  if (hasVerseSelection(panelState)) revealVerseAboveActions(panelState, verse);
}

function scrollVerseToTop(panelState, verse) {
  const elements = panelElements.get(panelState.id);
  const group = elements?.content.querySelector(`.verse-group[data-verse="${verse}"]`);
  if (!group) return;
  const content = elements.content;
  // A linked partner gets its own correct scrollVerseToTop call for this
  // same verse already (see goToPassage's fan-out), tailored to its own row
  // heights -- the "scroll" listener's own raw-scrollTop-copy broadcast
  // (see syncGroupScroll) is meant for a genuine reader-driven scroll on
  // *this* panel following through to partners, not this one. Left
  // unsuppressed, it copies this panel's own scrollTop verbatim onto every
  // partner, which is simply wrong the instant row heights differ up to
  // this verse (an original-language partner's own taller rows, most
  // commonly) -- exactly the scenario equalizeGroupRowHeights's own row-
  // height sync (deferred to the next frame, after this) exists to
  // reconcile instead. Same suppression pattern as revealVerseAboveActions.
  beginSuppressingGroupScrollSync(panelState.id);
  const stopSuppressing = () => {
    content.removeEventListener("scrollend", stopSuppressing);
    endSuppressingGroupScrollSync(panelState.id);
  };
  content.addEventListener("scrollend", stopSuppressing, { once: true });
  setTimeout(stopSuppressing, 500);
  group.scrollIntoView({ behavior: "auto", block: "start" });
  // Remembered so a later captureVerseAnchor call (see its own comment) can
  // re-pin on this exact verse instead of falling back to "nearest visual
  // center" -- most load-bearing for a linked group's own row-height sync
  // (see scheduleGroupRowHeightSync), which can run *after* this scroll and
  // grow rows enough to otherwise read as visual drift. The offset is
  // recorded rather than assumed to be 0 -- .verse-group's own
  // scroll-margin-top (see styles.css) means "scrolled to top" settles a
  // few px below the content box's own top edge, not flush against it.
  const contentRect = content.getBoundingClientRect();
  panelState.lastTopAnchor = { verse, offset: group.getBoundingClientRect().top - contentRect.top };
}

async function loadPanel(panelState, targetVerse = null) {
  const elements = panelElements.get(panelState.id);
  if (!elements) return false;
  const requestKey = `${panelState.book}:${panelState.chapter}:${Date.now()}`;
  elements.panel.dataset.requestKey = requestKey;
  clearPanelSelection(panelState);
  clearWordLookup(panelState);
  elements.content.innerHTML = '<div class="panel-message">Loading…</div>';
  updatePanelControls(panelState);

  try {
    const data = await getChapter(panelState.book, panelState.chapter);
    if (elements.panel.dataset.requestKey !== requestKey) return false;
    panelState.data = data;
    panelState.verse = targetVerse || 1;
    panelState.scrollTargetVerse = panelState.verse;
    renderPanelBody(panelState);
    return true;
  } catch (error) {
    elements.content.innerHTML = `<div class="panel-message error">${escapeHtml(error.message)}<br />Use a local HTTP server when previewing.</div>`;
    return false;
  }
}

// Set while a group navigation's own fan-out (below) is already moving
// every member -- without this, each of those recursive goToPassage calls
// would try to fan out to the *same* group all over again.
let syncingGroupNavigation = false;

async function goToPassage(panelState, passage, { record = true, scrollToTop = true } = {}) {
  const target = normalizePassage(passage.book, passage.chapter, passage.verse);
  const chapterChanged = panelState.book !== target.book || panelState.chapter !== target.chapter || !panelState.data;
  panelState.book = target.book;
  panelState.chapter = target.chapter;
  panelState.verse = target.verse;
  saveState();
  let loaded = true;
  if (chapterChanged) {
    loaded = await loadPanel(panelState, target.verse);
  } else {
    updatePanelControls(panelState);
    if (scrollToTop) scrollVerseToTop(panelState, target.verse);
    // Same-chapter navigation deliberately skips renderPanelBody (a plain
    // verse-list panel just scrolls, its rows unchanged) -- but TSK always
    // mirrors this panel's own selector (see renderPanelBody), so it still
    // needs telling explicitly here, the one path that otherwise wouldn't.
    if (panelState.activeStudyTool === "TSK") {
      getStudyToolInstance(panelState, "TSK").goToVerse(target.book, target.chapter, target.verse);
    }
  }
  if (!loaded) return false;
  if (record) recordPanelHistory(panelState, target);
  updatePanelControls(panelState);
  saveState();
  // Linked panels always show the same passage (see linkGroupPartners) --
  // every navigation, however it got here (verse combo, chapter jump,
  // history, a verse click's own TSK routing), fans out to the rest of
  // this panel's own group the same way. Guarded so the fanned-out calls
  // below don't each try to fan out all over again.
  if (!syncingGroupNavigation) {
    // A partner already sitting on this exact passage (most commonly, the
    // panel just linked *to* -- see linkToPanel, whose target's own current
    // passage becomes this navigation's target) has nothing to actually
    // navigate to; fanning out to it anyway would still run the same-
    // chapter branch's scrollVerseToTop below, nudging its scroll to this
    // verse's top even though it was already showing it, however it had
    // scrolled there.
    const partners = linkGroupPartners(panelState).filter(
      (partner) => partner.book !== target.book || partner.chapter !== target.chapter || partner.verse !== target.verse,
    );
    if (partners.length) {
      syncingGroupNavigation = true;
      try {
        // scrollToTop propagates as-is (not left to default back to true)
        // so a verse click's own notify-only call (scrollToTop: false --
        // see its own comment: this panel is already showing what was
        // clicked, nothing to jump to) doesn't still yank every *other*
        // linked partner's own scroll to this verse's top. A plain-text
        // partner in a properly aligned group is already showing this
        // verse in the right row (that's what equalizeGroupRowHeights and
        // the live scrollTop mirror in createPanelElement are for) --
        // forcing its scrollTop to "this verse at the very top" would only
        // knock it out of alignment with a source panel that never moved.
        // TSK's own goToVerse call below stays unconditional either way,
        // so a linked TSK partner still catches up to the new verse.
        await Promise.all(partners.map((partner) => goToPassage(partner, target, { record, scrollToTop })));
      } finally {
        syncingGroupNavigation = false;
      }
    }
  }
  return true;
}

function navigatePanelHistory(panelState, direction) {
  ensurePanelHistory(panelState);
  const nextIndex = panelState.historyIndex + direction;
  if (nextIndex < 0 || nextIndex >= panelState.history.length) return;
  panelState.historyIndex = nextIndex;
  goToPassage(panelState, panelState.history[nextIndex], { record: false });
}

// Re-rendering replaces the verse nodes while scrollTop stays put, so when
// row heights change (enabling another translation, switching layouts) the
// reader loses their place. Anchor on a visible selected verse when there is
// one, else the verse nearest the panel's vertical center, and restore its
// on-screen position after the swap.
function captureVerseAnchor(content, panelState) {
  const contentRect = content.getBoundingClientRect();
  if (!contentRect.height) return null;
  const selected = new Set(selectedVerseNumbers(panelState));
  const middle = contentRect.top + contentRect.height / 2;
  let anchor = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  // A verse this panel was just explicitly scrolled to the top for (see
  // scrollVerseToTop) is a stronger, more specific signal than "nearest to
  // center" once a fresh chapter has just loaded -- preferring it (when
  // it's still actually sitting flush against the top) keeps that verse
  // pinned there even if a later same-tick pass (most notably
  // scheduleGroupRowHeightSync, triggered by a linked partner's own taller
  // rows -- e.g. an original-language panel's interlinear tokens) grows
  // rows above or at it. Still only a fallback below "selected", same as
  // before -- an explicitly selected verse in view is a stronger signal
  // still.
  const lastTopAnchor = panelState.lastTopAnchor;
  let topAnchor = null;
  for (const group of content.querySelectorAll(".verse-group")) {
    const rect = group.getBoundingClientRect();
    if (rect.bottom <= contentRect.top || rect.top >= contentRect.bottom) continue;
    const verse = Number(group.dataset.verse);
    if (selected.has(verse)) {
      return { verse, offset: rect.top - contentRect.top };
    }
    const offset = rect.top - contentRect.top;
    if (lastTopAnchor && verse === lastTopAnchor.verse && Math.abs(offset - lastTopAnchor.offset) <= 2) {
      topAnchor = { verse, offset };
    }
    const distance = Math.abs((rect.top + rect.bottom) / 2 - middle);
    if (distance < bestDistance) {
      bestDistance = distance;
      anchor = { verse, offset };
    }
  }
  return topAnchor ?? anchor;
}

function restoreVerseAnchor(content, anchor) {
  if (!anchor) return;
  // A panel hidden in the meantime (see applyLinkedPartnersVisibility) has
  // no layout box at all -- every rect below would come back zeroed,
  // turning "drift" into a bogus, unrelated number that would still get
  // written to this panel's own real scrollTop, silently corrupting it for
  // whenever it's revealed again. This can genuinely happen: an anchor is
  // captured while still visible (see scheduleGroupRowHeightSync), but the
  // matching restore is deferred to a later animation frame, and a hide
  // click can land in that exact window.
  if (content.offsetParent === null) return;
  const group = content.querySelector(`.verse-group[data-verse="${anchor.verse}"]`);
  if (!group) return;
  const drift = group.getBoundingClientRect().top - content.getBoundingClientRect().top - anchor.offset;
  if (Math.abs(drift) > 1) content.scrollTop += drift;
}

// Re-renders every panel currently showing book/chapter (a linked partner
// included), keeping verseNumber pinned in place through both the
// immediate re-render and any rAF-deferred row-height equalization a
// linked panel's own render can schedule (see scheduleGroupRowHeightSync)
// -- that equalization pass runs *after* this function returns and can
// itself change row heights enough to undo a single restoreVerseAnchor
// call, most visibly when one panel in the group is showing the original
// language (its own row heights don't move in lockstep with a modern-
// language partner's). Anchoring explicitly on verseNumber rather than
// relying on renderPanelBody's own generic scroll anchor (whichever verse
// is closest to the panel's vertical center) matters here too: a highlight
// or bookmark being added/removed/recolored changes that exact verse's
// own row height, not necessarily the one the generic heuristic would
// have picked, so the edited verse itself could still drift otherwise.
function rerenderPanelsPreservingVerseAnchor(book, chapter, verseNumber) {
  const restores = [];
  for (const panel of state.panels) {
    if (panel.book !== book || panel.chapter !== chapter) continue;
    const elements = panelElements.get(panel.id);
    if (!elements) continue;
    const group = elements.content.querySelector(`.verse-group[data-verse="${verseNumber}"]`);
    const anchor = group
      ? { verse: verseNumber, offset: group.getBoundingClientRect().top - elements.content.getBoundingClientRect().top }
      : null;
    renderPanelBody(panel);
    restoreVerseAnchor(elements.content, anchor);
    restores.push({ content: elements.content, anchor });
  }
  requestAnimationFrame(() => {
    for (const { content, anchor } of restores) restoreVerseAnchor(content, anchor);
  });
}

// Keeps one column's original-language slot in sync with the panel's
// current book: if the panel navigates from OT to NT (or back) while
// Hebrew/Greek is active, swap it for the other rather than leaving a
// mismatched language enabled. Shared by both columns (see
// syncOriginalLanguageForTestament below), each with its own three arrays.
function syncOriginalLanguageForTestamentSide(panelState, enabledKey, highlightedKey, dimmedKey) {
  const enabled = panelState[enabledKey];
  const active = activeOriginalLanguageId(enabled);
  if (!active) return;
  const desired = originalLanguageForTestament(testamentForBook(panelState.book));
  if (active === desired) return;
  enabled[enabled.indexOf(active)] = desired;
  panelState[highlightedKey] = panelState[highlightedKey].map((id) => (id === active ? desired : id));
  panelState[dimmedKey] = panelState[dimmedKey].map((id) => (id === active ? desired : id));
}

function syncOriginalLanguageForTestament(panelState) {
  syncOriginalLanguageForTestamentSide(panelState, "enabledTranslations", "highlightedTranslations", "dimmedTranslations");
  const elements = panelElements.get(panelState.id);
  elements?.translationControl.render();
}

// Some Korean translations store a literal "(없음)" placeholder for verses
// they omit entirely (e.g. Romans 16:24, a textual-variant omission that
// several English translations drop from their data altogether instead) --
// treated the same as genuinely missing text, not real content to show.
function hasVerseText(text) {
  return Boolean(text) && text.trim() !== "(없음)";
}

// Shared key format for state.bookmarks (see freshState) -- one entry per
// book+chapter+verse, no translation (a bookmark marks the verse itself,
// shown via its verse-number badge, not any one translation's text).
function bookmarkKey(book, chapter, verse) {
  return `${book}:${chapter}:${verse}`;
}

// The bookmark action's own click handler (see .verse-actions-bookmark):
// toggles every selected verse together -- if any of them isn't bookmarked
// yet, bookmark all of them; if they're already all bookmarked, remove the
// bookmark from all of them instead, so pressing it again on the same
// selection undoes it.
function toggleBookmarkForSelection(panelState) {
  const verses = selectedVerseNumbers(panelState);
  if (!verses.length) return;
  const { book, chapter } = panelState;
  const allBookmarked = verses.every((verse) => state.bookmarks[bookmarkKey(book, chapter, verse)]);
  for (const verse of verses) {
    const key = bookmarkKey(book, chapter, verse);
    if (allBookmarked) delete state.bookmarks[key];
    else state.bookmarks[key] = true;
  }
  saveState();
  for (const panel of state.panels) {
    if (panel.book === book && panel.chapter === chapter) renderPanelBody(panel);
  }
  clearPanelSelection(panelState);
}

// Shared key format for state.highlights (see freshState) -- one entry
// per translation+book+chapter+verse, independent of which panel(s)
// currently happen to display it.
function highlightKey(translation, book, chapter, verse) {
  return `${translation}:${book}:${chapter}:${verse}`;
}

// Shared key format for state.notes (see freshState) -- one entry per
// book+chapter+verse, independent of translation and panel, same shape as
// bookmarkKey above (a note is attached to the verse as a whole, not any
// one translation's own rendering of it).
function noteKey(book, chapter, verse) {
  return `${book}:${chapter}:${verse}`;
}

// Builds one verse's translation-line rows into `pane`, using the panel's
// own enabled/highlighted/dimmed lists. Hebrew/Greek is a full peer of any
// other translation here: it takes whatever slot it holds in `list` and
// renders a row of interlinear word blocks instead of plain text, but is
// otherwise laid out identically -- unless the original-language toggle
// (see toggleTranslationChip) is switched off, in which case its row is
// skipped entirely, same as STR/TSK below: the toggle's whole point is
// reading as if the chip weren't there, not just fading its text like a
// real translation's own dim state does.
function buildTranslationLinesInto(pane, panelState, verseNumber, texts, list, highlightedList, dimmedList, originalLanguageHidden) {
  // STR/TSK chips never carry per-verse text of their own -- they only
  // ever render via getStudyToolInstance (see renderPanelBody), so they're
  // excluded here even when enabled but not the active study tool.
  list = list.filter((translation) => (
    !STUDY_TOOL_IDS.includes(translation)
    && !(originalLanguageHidden && ORIGINAL_LANGUAGE_IDS.includes(translation))
  ));
  list.forEach((translation) => {
    if (translation === "NOTE") {
      buildNoteTranslationLinesInto(pane, panelState, verseNumber, highlightedList, dimmedList);
      return;
    }
    const isOriginalLanguage = ORIGINAL_LANGUAGE_IDS.includes(translation);
    const tokens = isOriginalLanguage ? interlinearTokensForVerse(panelState, verseNumber) : null;
    const translationText = isOriginalLanguage ? null : texts[translation];
    const hasContent = isOriginalLanguage ? Boolean(tokens?.length) : hasVerseText(translationText);
    const line = document.createElement("div");
    line.className = "translation-line";
    line.classList.toggle("translation-line--highlight", highlightedList.includes(translation));
    line.classList.toggle("translation-line--dim", dimmedList.includes(translation));
    // Driven purely by this panel's own translation-name toggle (see the
    // "..." popup menu) -- no longer tied to how many translations are
    // actually enabled, so the label stays visible even with just one
    // translation showing unless the reader explicitly turned it off.
    line.classList.toggle("translation-line--name-hidden", !panelState.translationNamesShown);
    line.lang = translationLanguage(translation);
    line.style.setProperty("--translation-color", TRANSLATION_COLORS[translation]);
    const label = document.createElement("span");
    label.className = "translation-label";
    label.textContent = translationMeta(translation).label;
    line.append(label);
    if (isOriginalLanguage) {
      if (tokens?.length) {
        line.append(buildInterlinearWordRow(tokens, translationLanguage(translation), (wordEl, word) => {
          selectInterlinearWord(panelState, verseNumber, wordEl, word);
          // Live: if STR is enabled here (even dimmed, showing plain text
          // instead) it switches to and shows this word immediately,
          // without waiting for the word-actions bar's own dictionary
          // button -- same as clicking the STR chip itself would, just
          // triggered by the word instead. Any linked panel with STR
          // enabled (see linkGroupPartners) gets the exact same treatment,
          // since it's always showing this same verse too (see goToPassage's
          // own group fan-out) -- reading a word in one shows it in every
          // linked STR pane at once.
          for (const target of [panelState, ...linkGroupPartners(panelState)]) {
            if (!target.enabledTranslations.includes("STR")) continue;
            if (target.activeStudyTool !== "STR") toggleTranslationChip(target, "STR");
            getStudyToolInstance(target, "STR").showWord({ verse: verseNumber, ...word });
            saveState();
            renderPanelBody(target);
            // A chip list long enough to overflow can have STR scrolled
            // out of sight, same as a freshly-added chip -- bring it back
            // into view now that it's the one actually showing.
            panelElements.get(target.id)?.translationControl.revealChip("STR");
          }
        }, ([original, , , strongs]) => (
          panelState.selectedWord?.verse === verseNumber
          && panelState.selectedWord?.original === original
          && panelState.selectedWord?.strongs === strongs
        )));
      }
    } else {
      const text = document.createElement("p");
      text.className = "translation-text";
      const highlightColorKey = state.highlights[highlightKey(translation, panelState.book, panelState.chapter, verseNumber)];
      if (highlightColorKey && hasContent) {
        // An inline span around just the text, not a background on
        // .translation-text itself -- that would color the whole block's
        // width (blank space past a short last line included) rather than
        // hugging the actual glyphs the way a real highlighter would.
        const mark = document.createElement("span");
        mark.className = "translation-text-highlight";
        mark.style.setProperty("--highlight-color", HIGHLIGHT_COLORS[highlightColorKey]);
        mark.textContent = translationText;
        // Own click, not the verse-group's -- opens the manage popup
        // instead of also toggling this verse into/out of copy-selection
        // (see selectInterlinearWord's own stopPropagation for the same
        // reasoning on interlinear words).
        mark.addEventListener("click", (event) => {
          event.stopPropagation();
          showHighlightManagePopup(mark, translation, panelState.book, panelState.chapter, verseNumber, highlightColorKey);
        });
        text.append(mark);
      } else {
        text.textContent = hasContent ? translationText : "";
      }
      line.append(text);
    }
    pane.append(line);
  });

  if (!list.length) {
    const empty = document.createElement("p");
    empty.className = "empty-translation";
    pane.append(empty);
  }
}

// NOTE has no Bible text of its own -- a note is attached to the verse as a
// whole (see noteKey), not any one translation's rendering of it, so this
// is always exactly one row, labeled "NOTE" itself rather than a real
// translation's name, showing that verse's one note in place of Bible text
// (blank, not skipped, when there isn't one yet -- see buildEditableNoteField).
function buildNoteTranslationLinesInto(pane, panelState, verseNumber, highlightedList, dimmedList) {
  const line = document.createElement("div");
  line.className = "translation-line translation-line--note";
  line.classList.toggle("translation-line--highlight", highlightedList.includes("NOTE"));
  line.classList.toggle("translation-line--dim", dimmedList.includes("NOTE"));
  line.classList.toggle("translation-line--name-hidden", !panelState.translationNamesShown);
  line.lang = translationLanguage("NOTE");
  line.style.setProperty("--translation-color", TRANSLATION_COLORS.NOTE);
  const label = document.createElement("span");
  label.className = "translation-label";
  label.textContent = translationMeta("NOTE").label;
  line.append(label);
  const key = noteKey(panelState.book, panelState.chapter, verseNumber);
  // Re-rendering rebuilds every verse-group from scratch, and this row's
  // own height almost always changes once real text replaces the empty
  // field -- rerenderPanelsPreservingVerseAnchor keeps the edited verse
  // itself pinned in place (rather than renderPanelBody's own generic
  // scroll anchor, which just picks whichever verse is closest to the
  // viewport's middle) across every panel actually showing this book/
  // chapter, a linked partner included.
  const onSaved = () => rerenderPanelsPreservingVerseAnchor(panelState.book, panelState.chapter, verseNumber);
  line.append(buildEditableNoteField(key, state.notes[key], onSaved));
  pane.append(line);
}

// Click-to-edit: a plain-looking .translation-text (blank when there's no
// note yet) that swaps itself for a borderless, auto-growing textarea on
// click -- pre-filled, focused, and with the caret already at the end --
// and swaps back on blur, saving (or, if left empty, deleting) noteKeyString
// as that verse's note. onSaved re-renders whatever's showing it (the panel
// itself here; the Note list dialog's own row elsewhere).
// Widest single line's own rendered width (not the wrapped box's) -- a
// <textarea> reports scrollWidth as just its own set width, so measuring
// the natural, unwrapped width of what's actually typed needs a hidden
// mirror element instead. Splits on "\n" (a note-view-popup's own real line
// breaks force separate lines the same way in the real field) rather than
// measuring the whole value as one run, so one long line among several
// short ones doesn't get averaged away.
function measureNaturalTextWidth(text, referenceEl) {
  const measurer = document.createElement("span");
  measurer.style.cssText = "position:fixed; visibility:hidden; top:-9999px; left:-9999px; white-space:pre;";
  measurer.style.font = getComputedStyle(referenceEl).font;
  document.body.append(measurer);
  let widest = 0;
  for (const line of text.split("\n")) {
    measurer.textContent = line || " ";
    widest = Math.max(widest, measurer.getBoundingClientRect().width);
  }
  measurer.remove();
  return widest;
}

// autoWidth is only meaningful for note-view-popup's own shrink-to-fit box
// (see showNoteViewPopup) -- the panel's own NOTE row and the note-list
// dialog already sit in a definite-width column, where the plain
// width: 100% below already tracks that correctly with no help needed.
function buildEditableNoteField(noteKeyString, noteText, onSaved, { autoWidth = false, maxWidth } = {}) {
  const field = document.createElement("p");
  field.className = "translation-text translation-note-field";
  field.textContent = noteText ?? "";
  field.addEventListener("click", (event) => {
    event.stopPropagation();
    const textarea = document.createElement("textarea");
    textarea.className = "translation-text translation-note-editor";
    textarea.rows = 1;
    // A bare <textarea> falls back to a UA-default preferred width (as if
    // cols="20") whenever its own ancestor chain can't resolve its
    // width: 100% against a definite size -- exactly the note-view-popup's
    // own case, a shrink-to-fit position: fixed box with no explicit width
    // of its own. That default preferred width was winning out over the
    // field's actual (often much narrower) text, popping the popup wider
    // the instant editing started even though nothing about the note's
    // length had changed yet. cols="1" drops that fallback contribution to
    // near nothing, leaving width: 100% to size purely off the real
    // content in every context this field is used in (this popup, the
    // panel's own already fixed-width NOTE row, and the note-list dialog).
    textarea.cols = 1;
    textarea.value = noteText ?? "";
    const resize = () => {
      // Width first, then height: scrollHeight reflects how the *current*
      // width wraps the text, so measuring height against a not-yet-updated
      // (narrower) width could see extra text wrap into a line it wouldn't
      // actually need once the width below catches up -- a false height
      // jump on top of the real one, one keystroke behind.
      if (autoWidth) {
        // Explicit px width overrides the class's own width: 100% -- sized
        // to the actual longest line, growing as longer lines are typed and
        // shrinking back down as they're deleted, up to the popup's own
        // max-width (matching what the plain field's shrink-to-fit box
        // already did before editing started). A function, not a plain
        // number: note-view-popup's own max-width is itself set dynamically
        // per anchor panel (see positionNoteViewPopup), not the fixed 280px
        // its CSS rule suggests, so the ceiling here has to be read fresh
        // each resize rather than captured once when this field was first
        // built.
        const natural = measureNaturalTextWidth(textarea.value, textarea);
        const limit = typeof maxWidth === "function" ? maxWidth() : maxWidth;
        textarea.style.width = `${Math.min(natural, limit)}px`;
      }
      textarea.style.height = "auto";
      // Snapped to a whole multiple of one line's own height rather than
      // scrollHeight's raw (sub-pixel-sensitive) value directly: at the
      // measured-width boundary that autoWidth sizes to, a single extra
      // character's worth of natural-width measurement can round the
      // rendered width a fraction of a pixel narrower or wider than the
      // line actually needs, nudging scrollHeight by a stray pixel or two
      // with no real added line -- exactly the "grows a bit while typing,
      // shrinks a bit while deleting" wobble this is meant to stop. Only a
      // genuinely full extra (wrapped or explicit "\n") line should ever
      // change this popup's height.
      // Rounds to the nearest line count rather than ceiling it: the
      // browser always reports scrollHeight as a whole number of CSS
      // pixels, but line-height itself (19.5px here) usually isn't one, so
      // even a single genuine line's scrollHeight lands a little above or
      // below 1 * lineHeight -- ceil would round that natural rounding
      // error UP into "2 lines" every time.
      const lineHeight = Number.parseFloat(getComputedStyle(textarea).lineHeight);
      const lines = Math.max(1, Math.round(textarea.scrollHeight / lineHeight));
      textarea.style.height = `${lines * lineHeight}px`;
    };
    textarea.addEventListener("input", resize);
    textarea.addEventListener("click", (innerEvent) => innerEvent.stopPropagation());
    textarea.addEventListener("blur", () => {
      const value = textarea.value.trim();
      if (value) state.notes[noteKeyString] = value;
      else delete state.notes[noteKeyString];
      saveState();
      onSaved();
    });
    field.replaceWith(textarea);
    resize();
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  });
  return field;
}

// ---- Embedded study-tool instances (STR/TSK -- see STUDY_TOOL_META) ----
// Each nests the *exact* shell markup/classes its equivalent modal dialog
// uses (.lookup-shell plus .word-dictionary-shell/.tsk-dialog-shell -- see
// index.html), so every rule that already styles the modal's fields/
// concordance/results applies unchanged; only the CSS that sizes/scrolls
// that shell to a floating dialog is overridden (see .study-tool-pane in
// styles.css) to size/scroll it to this panel instead. Each panel's
// instance is genuinely independent -- its own current word/passage, its
// own scroll position -- unlike the modal dialogs (one shared instance for
// the whole app). Kept alive across re-renders (see getStudyToolInstance)
// rather than rebuilt from scratch each time, so scroll position survives
// an unrelated re-render elsewhere in the panel.
function studyToolPaneBaseClass(toolId) {
  return `study-tool-pane study-tool-${toolId.toLowerCase()}`;
}

// TSK's cross-reference list mirrors whatever plain-language versions this
// same panel is currently showing -- it has no picker of its own (see
// createEmbeddedTskTool), so callers re-read this on every render rather
// than snapshotting it once.
function embeddedDefaultTranslations(panelState) {
  return panelState.enabledTranslations.filter(isIndexableTranslationId);
}

// renderPanelBody reuses the cached study-tool instance as-is (see
// getStudyToolInstance) rather than re-rendering its content on every pass,
// so a TSK pane mirroring this panel's own translations (see
// embeddedDefaultTranslations) has no other way to notice that list just
// changed -- this is called wherever it does (the picker, or a chip
// removed) so its cross-reference list re-reads embeddedDefaultTranslations
// and catches up immediately instead of drifting stale until something
// else happens to touch that TSK pane directly.
function refreshTskCrossColumnTranslations(panelState) {
  if (panelState.activeStudyTool !== "TSK") return;
  panelState.studyToolInstances?.TSK?.refreshTranslations();
}

// Cached per side, keyed by tool id, rather than one slot that gets torn
// down the moment that side deactivates -- switching away from STR (a
// normal chip clicked, or TSK picked instead) leaves STR's own instance
// alive but unmounted, so its current word/scroll position are still there
// exactly as left, the moment it's reactivated. Only
// pruneStudyToolInstances (below) actually destroys one, and only once its
// own chip is no longer enabled at all -- there's nothing meaningful left
// to resume at that point.
function getStudyToolInstance(panelState, toolId) {
  if (!panelState.studyToolInstances) panelState.studyToolInstances = {};
  const cache = panelState.studyToolInstances;
  if (!cache[toolId]) {
    const factory = toolId === "STR" ? createEmbeddedStrongsTool : createEmbeddedTskTool;
    cache[toolId] = factory(panelState);
    cache[toolId].toolId = toolId;
  }
  return cache[toolId];
}

// Called on every render (see renderPanelBody) so a study tool chip that's
// been removed entirely (its own remove button, or the picker) drops its
// cached instance along with it, instead of leaking a live one forever
// with nothing left that could ever reactivate it.
function pruneStudyToolInstances(panelState) {
  const cache = panelState.studyToolInstances;
  if (!cache) return;
  for (const toolId of Object.keys(cache)) {
    if (!panelState.enabledTranslations.includes(toolId)) {
      cache[toolId].destroy();
      delete cache[toolId];
    }
  }
}

function destroyStudyToolInstances(panelState) {
  const cache = panelState.studyToolInstances;
  if (!cache) return;
  for (const instance of Object.values(cache)) instance.destroy();
  panelState.studyToolInstances = {};
}

// Shared by every "cross references" link icon on a verse-list row inside
// an embedded STR/TSK pane (see buildConcordanceResultRow and
// createEmbeddedTskTool's own buildResultRow): switches this panel to
// TSK -- adding the chip first if it isn't enabled yet -- and moves this
// panel's own selector to the given reference, which TSK always mirrors
// (see goToVerse in createEmbeddedTskTool).
async function showTskInSameColumn(panelState, book, chapter, verse) {
  if (!panelState.enabledTranslations.includes("TSK")) {
    const order = [...panelState.enabledTranslations];
    insertTranslationInOrder(order, "TSK");
    applyTranslationOrder(panelState, order);
  }
  if (panelState.activeStudyTool !== "TSK") toggleTranslationChip(panelState, "TSK");
  await goToPassage(panelState, { book, chapter, verse }, { record: true });
  await getStudyToolInstance(panelState, "TSK").goToVerse(book, chapter, verse);
  saveState();
  renderPanelBody(panelState);
}

function buildEmbeddedTskLinkButton(panelState, bookId, chapter, verse) {
  const book = manifest.books[bookId];
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button button-secondary icon-only-button search-result-action";
  button.setAttribute("aria-label", `Cross references for ${book.en} ${chapter}:${verse}`);
  button.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
    </svg>
  `;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    showTskInSameColumn(panelState, bookId, chapter, verse);
  });
  return button;
}

// ---- TSK (mirrors #tsk-dialog exactly) ----
function createEmbeddedTskTool(panelState) {
  const element = document.createElement("div");
  element.className = studyToolPaneBaseClass("TSK");

  const shell = document.createElement("div");
  shell.className = "lookup-shell tsk-dialog-shell";
  element.append(shell);

  // Embedded, this pane has no history or book/chapter/verse navigation of
  // its own -- it always mirrors this panel's own selector instead (see
  // goToVerse's call site in renderPanelBody), so nothing here is recorded
  // to the shared TSK dialog history either. The results show/hide toggle
  // lives at the right edge of the anchor-word nav row (see
  // renderReferenceList) rather than a row of its own, right under the
  // panel's own top bar since the KJV text above it starts the pane.
  const verseText = document.createElement("div");
  verseText.className = "tsk-verse-text";
  const body = document.createElement("div");
  body.className = "lookup-body";

  shell.append(verseText, body);

  // No picker of its own (see embeddedDefaultTranslations) -- the cross-
  // reference list's own versions always mirror whatever plain-language
  // translations this same panel currently has enabled, read fresh on
  // every render rather than a value this pane could set itself.
  const currentTranslationOrder = () => embeddedDefaultTranslations(panelState);
  const viewState = { book: panelState.book, chapter: panelState.chapter, verse: panelState.verse, data: null, anchors: [] };
  // Whatever passage this panel already happened to be on when TSK first
  // turned on for it (its own starting viewState above) is a silent
  // default, same idea as the STR pane's own H0001 fallback -- it's not a
  // real lookup, so the first goToVerse call below (which is really just
  // syncing to that same starting passage) doesn't join the shared
  // tskHistory. Set true right after that starting load, before any real
  // navigation could reach goToVerse.
  let hasNavigated = false;

  const renderVerseText = () => {
    verseText.replaceChildren();
    const verseEntry = viewState.data?.v.find(([v]) => v === viewState.verse);
    const texts = verseEntry ? verseEntry[1] : {};
    const rawText = texts.KJV;
    const line = document.createElement("div");
    line.className = "translation-line tsk-verse-line";
    line.lang = translationLanguage("KJV");
    line.style.setProperty("--translation-color", TRANSLATION_COLORS.KJV);
    const label = document.createElement("span");
    label.className = "translation-label";
    label.textContent = translationMeta("KJV").label;
    const text = document.createElement("p");
    text.className = "translation-text";
    if (rawText && viewState.anchors.length) appendWithAnchors(text, rawText, viewState.anchors);
    else text.textContent = rawText || "";
    line.append(label, text);
    verseText.append(line);
  };

  function buildResultRow(bookId, chapter, verse, chaptersByKey, translationOrder) {
    const book = manifest.books[bookId];
    const item = document.createElement("article");
    item.className = "search-result";
    const content = document.createElement("div");
    content.className = "search-result-content";
    const reference = document.createElement("div");
    reference.className = "search-reference";
    const referenceTitle = document.createElement("div");
    referenceTitle.className = "search-reference-title";
    const referenceText = document.createElement("span");
    referenceText.textContent = `${book.en} ${chapter}:${verse}`;
    referenceTitle.append(referenceText);
    reference.append(referenceTitle);
    content.append(reference);

    const rowBody = document.createElement("div");
    rowBody.className = "search-result-body";
    content.append(rowBody);

    const chapterData = chaptersByKey.get(`${bookId}:${chapter}`);
    const verseEntry = chapterData?.v.find(([v]) => v === verse);
    const texts = verseEntry ? verseEntry[1] : {};
    for (const translation of translationOrder) {
      const text = texts[translation];
      const hasContent = hasVerseText(text);
      const row = document.createElement("div");
      row.className = "search-match-line";
      row.style.setProperty("--translation-color", TRANSLATION_COLORS[translation]);
      const label = document.createElement("span");
      label.className = "search-match-label";
      label.lang = translationLanguage(translation);
      label.textContent = translationMeta(translation).label;
      const textEl = document.createElement("span");
      textEl.lang = translationLanguage(translation);
      textEl.textContent = hasContent ? text : "";
      row.append(label, textEl);
      rowBody.append(row);
    }
    if (!translationOrder.length) {
      const empty = document.createElement("p");
      empty.className = "empty-translation";
      empty.textContent = "Select at least one translation.";
      rowBody.append(empty);
    }

    const actions = document.createElement("div");
    actions.className = "search-result-actions";
    const viewButton = document.createElement("button");
    viewButton.type = "button";
    viewButton.className = "button button-primary icon-only-button search-result-action";
    viewButton.setAttribute("aria-label", `View ${book.en} ${chapter}:${verse}`);
    viewButton.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"></path><path d="m13 6 6 6-6 6"></path></svg>`;
    // Matches the standalone TSK/concordance dialogs' own move icon exactly
    // (see openTskResult/openConcordanceResult) -- this used to jump this
    // panel (and, if linked, every partner sharing its verse) straight to
    // the reference instead, with no chance to send it somewhere else.
    // There's no dialog of this tool's own to close first: it's embedded
    // directly in the panel, which stays exactly as it is underneath the
    // move-picking overlay every panel already gets.
    viewButton.addEventListener("click", (event) => {
      event.stopPropagation();
      enterMovePicking(bookId, chapter, verse);
    });
    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "button button-secondary icon-only-button search-result-action";
    copyButton.setAttribute("aria-label", `Copy ${book.en} ${chapter}:${verse}`);
    copyButton.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg>`;
    copyButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      await openCopyDialogForVerse(bookId, chapter, verse, translationOrder);
    });
    const linkButton = document.createElement("button");
    linkButton.type = "button";
    linkButton.className = "button button-secondary icon-only-button search-result-action";
    linkButton.setAttribute("aria-label", `Cross references for ${book.en} ${chapter}:${verse}`);
    linkButton.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`;
    linkButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      // Drilling into a different reference's own cross references moves
      // this panel's own book/chapter/verse selector to match -- there's
      // no separate "TSK position" of its own to drift from it (see
      // goToVerse below), so the two always stay in sync.
      await goToPassage(panelState, { book: bookId, chapter, verse }, { record: true });
      await goToVerse(bookId, chapter, verse);
    });
    actions.append(viewButton, copyButton, linkButton);
    reference.append(actions);

    item.append(content);
    return item;
  }

  async function renderReferenceList() {
    const anchors = viewState.anchors;
    if (!anchors.length) {
      showLookupEmpty(body, "No cross references found.");
      return;
    }
    showLookupEmpty(body, "Loading…");
    const chapterKeys = new Set();
    for (const [, refs] of anchors) {
      for (const [bookId, chapter] of refs) chapterKeys.add(`${bookId}:${chapter}`);
    }
    const chapterSettled = await Promise.allSettled(
      [...chapterKeys].map(async (key) => {
        const [bookId, chapter] = key.split(":").map(Number);
        return [key, await getChapter(bookId, chapter)];
      }),
    );
    if (!element.isConnected) return;
    const chaptersByKey = new Map(
      chapterSettled.filter((result) => result.status === "fulfilled").map((result) => result.value),
    );
    // Read once per render pass so every row this pass shows the same
    // version set, rather than re-reading (and risking a mid-render
    // change) once per row.
    const translationOrder = currentTranslationOrder();
    const results = document.createElement("div");
    results.className = "tsk-results";
    const navRow = document.createElement("div");
    navRow.className = "tsk-word-nav-row";
    const nav = document.createElement("div");
    nav.className = "tsk-word-nav";
    navRow.append(nav);
    const list = document.createElement("div");
    list.className = "tsk-anchor-list";
    anchors.forEach(([anchor, refs], index) => {
      const anchorId = `embedded-tsk-anchor-${panelState.id}-${index}`;
      const navButton = document.createElement("button");
      navButton.type = "button";
      navButton.className = "tsk-word-nav-item";
      const word = document.createElement("span");
      word.className = "tsk-word-nav-word";
      word.textContent = anchor;
      const count = document.createElement("span");
      count.className = "tsk-word-nav-count";
      count.textContent = ` (${refs.length})`;
      navButton.append(word, count);
      navButton.addEventListener("click", () => {
        list.querySelector(`[data-anchor-id="${anchorId}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      nav.append(navButton);

      const section = document.createElement("section");
      section.className = "tsk-anchor-section";
      section.dataset.anchorId = anchorId;
      const heading = document.createElement("h3");
      heading.className = "tsk-anchor-heading";
      heading.textContent = anchor;
      section.append(heading);
      for (const [refBook, refChapter, refVerse] of refs) {
        section.append(buildResultRow(refBook, refChapter, refVerse, chaptersByKey, translationOrder));
      }
      list.append(section);
    });
    results.append(navRow, list);
    body.replaceChildren(results);
  }

  async function loadChapter() {
    try {
      viewState.data = await getChapter(viewState.book, viewState.chapter);
    } catch (error) {
      showLookupEmpty(body, error.message);
      return;
    }
    if (!element.isConnected) return;
    const verses = verseItems(viewState);
    const maxVerse = verses.at(-1)?.value ?? 1;
    viewState.verse = Math.max(1, Math.min(viewState.verse, maxVerse));
    const tskChapterData = await getTskChapter(viewState.book, viewState.chapter);
    if (!element.isConnected) return;
    const verseTsk = tskChapterData.v.find(([verse]) => verse === viewState.verse);
    viewState.anchors = verseTsk ? verseTsk[1] : [];
    renderVerseText();
    await renderReferenceList();
  }

  // Called every render (see renderPanelBody) with this panel's own current
  // book/chapter/verse -- a no-op once already showing it, so the common
  // case (nothing navigated, just some unrelated re-render) never re-fetches
  // or re-records. Every *genuine* move (see hasNavigated above) joins the
  // shared tskHistory the standalone popup's own history arrows page
  // through too, whichever panel or the popup itself it happened in.
  async function goToVerse(book, chapter, verse) {
    const normalized = normalizePassage(book, chapter, verse);
    if (viewState.data && viewState.book === normalized.book
      && viewState.chapter === normalized.chapter && viewState.verse === normalized.verse) {
      return;
    }
    if (hasNavigated) recordTskHistory(normalized);
    hasNavigated = true;
    viewState.book = normalized.book;
    viewState.chapter = normalized.chapter;
    viewState.verse = normalized.verse;
    await loadChapter();
  }

  loadChapter();
  hasNavigated = true;

  return {
    element,
    destroy: () => {},
    goToVerse,
    // Called whenever this panel's own enabled translations change (see
    // refreshTskCrossColumnTranslations) -- this pane's cross-reference
    // list has no other way to notice, since it isn't the one whose picker
    // just changed.
    refreshTranslations: () => renderReferenceList(),
  };
}

// Gives each panel's own STR nav row (see .panel-strongs-selectors in
// index.html, and its call site in createPanelElement) the same lang-
// picker/number-field/transliteration-search behavior as the standalone
// #strongs-dialog's own nav below -- but entirely independent of it (its
// own lang selection, its own typed-but-not-yet-searched field state),
// since more than one panel can show STR at once. History, though, is
// NOT independent: back/forward here page through the exact same shared
// strongsHistory the standalone dialog's own arrows do (see
// registerStrongsHistoryButtons), so a lookup in one shows up in every
// other panel's and the dialog's own history alike. The embedded STR pane
// itself (see createEmbeddedStrongsTool's showEntry) calls notifyWordShown
// on every word it renders, however it got there (a search here, this
// nav's own history buttons, or a Strong's-linked field inside the pane),
// which is what keeps these fields in sync with it and (unless silent)
// records it into that shared history.
function createPanelStrongsNav(panelState, {
  historyBack, historyForward, langToggle, langToggleLabel, langMenu, langPicker,
  numberInput, englishInput, englishClear, englishWrap, suggestions, searchButton,
}) {
  let langCurrent = "H";
  let englishCommitted = "";
  let suggestionItems = [];
  let suggestionHighlighted = -1;
  let suggestionPointerActive = false;

  const langValue = () => langCurrent;

  // Always the dialog's own shorter mobile-width text (see
  // .panel-strongs-selectors .strongs-nav-number-wrap in styles.css) --
  // a panel can be much narrower than a full dialog even on desktop, so
  // this never checks mobileLayout the way the dialog's own placeholder
  // does.
  function codePlaceholder(lang) {
    return `1 - ${STRONGS_MAX_NUMBER[lang]}`;
  }

  function setLangValue(lang) {
    langCurrent = lang;
    langToggleLabel.textContent = STRONGS_LANG_LABEL[lang];
    numberInput.placeholder = codePlaceholder(lang);
    for (const option of langMenu.querySelectorAll(".strongs-lang-option")) {
      const selected = option.dataset.lang === lang;
      option.classList.toggle("selected", selected);
      option.setAttribute("aria-selected", String(selected));
    }
  }

  function openLangMenu() {
    if (!langMenu.hidden) return;
    langMenu.hidden = false;
    langToggle.setAttribute("aria-expanded", "true");
  }
  function closeLangMenu() {
    if (langMenu.hidden) return;
    langMenu.hidden = true;
    langToggle.setAttribute("aria-expanded", "false");
  }
  langToggle.addEventListener("click", () => {
    if (langMenu.hidden) openLangMenu();
    else closeLangMenu();
  });
  langMenu.querySelectorAll(".strongs-lang-option").forEach((option) => {
    option.addEventListener("click", () => {
      setLangValue(option.dataset.lang);
      closeLangMenu();
    });
  });
  const onDocPointerDown = (event) => {
    if (langMenu.hidden || langPicker.contains(event.target)) return;
    closeLangMenu();
  };
  const onDocKeydown = (event) => {
    if (event.key === "Escape" && !langMenu.hidden) closeLangMenu();
  };
  document.addEventListener("pointerdown", onDocPointerDown, true);
  document.addEventListener("keydown", onDocKeydown);

  // Keeps all three nav fields in lockstep with whatever word is now shown
  // (a search, a history step, or a click on an interlinear word block) --
  // previously left the transliteration field showing the *previous*
  // word's spelling, since only the number field was ever touched here.
  async function updateNav(word) {
    const lang = word.strongs ? word.strongs[0] : (word.lang === "he" ? "H" : "G");
    const number = word.strongs ? Number(word.strongs.slice(1)) : null;
    setLangValue(lang);
    numberInput.value = number ?? "";
    if (!word.strongs) {
      setEnglishCommitted("");
      return;
    }
    const entries = await getStrongsData().catch(() => ({}));
    const entry = entries[word.strongs];
    setEnglishCommitted(entry?.translit ?? "");
  }

  function showCode(code) {
    getStudyToolInstance(panelState, "STR").showWord({
      strongs: code, original: code, lang: code.startsWith("H") ? "he" : "grc",
    });
  }

  function goToNumber(number) {
    const lang = langValue();
    const clamped = Math.min(Math.max(1, number), STRONGS_MAX_NUMBER[lang]);
    showCode(strongsCodeFromParts(lang, clamped));
  }

  let numberBeforeFocus = "";
  numberInput.addEventListener("focus", () => {
    numberBeforeFocus = numberInput.value;
    numberInput.value = "";
  });
  numberInput.addEventListener("blur", () => {
    if (!numberInput.value) {
      numberInput.value = numberBeforeFocus;
      return;
    }
    fillEnglishFromCode();
  });
  numberInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    searchButton.click();
  });

  async function fillEnglishFromCode() {
    const lang = langValue();
    const number = Number(numberInput.value);
    if (!number) return;
    const clamped = Math.min(Math.max(1, number), STRONGS_MAX_NUMBER[lang]);
    const entries = await getStrongsData().catch(() => ({}));
    const entry = entries[strongsCodeFromParts(lang, clamped)];
    if (entry?.translit) setEnglishCommitted(entry.translit);
  }

  function setEnglishCommitted(value) {
    englishCommitted = value;
    englishInput.value = value;
  }

  function resetSuggestionsPosition() {
    suggestions.style.removeProperty("left");
    suggestions.style.removeProperty("right");
    suggestions.style.removeProperty("width");
    suggestions.style.removeProperty("min-width");
  }

  // Same idea as the standalone dialog's own positionStrongsSuggestions:
  // on mobile, widen the dropdown out to the whole nav row's own bounds
  // instead of the (much narrower) transliteration field alone. On
  // desktop, there's no reason the dropdown's own left edge has to line
  // up with the field's -- each row needs real room for a Strong's code,
  // the original word, AND a transliteration together, so this uses the
  // full width available inside THIS panel (from its own left edge to
  // its own right edge, margin aside), shifting the dropdown's left edge
  // out past the field's own if that's what it takes, rather than only
  // ever growing rightward from the field. min-width is overridden
  // inline so the CSS floor (see .panel-strongs-nav-suggestions) can't
  // win back out over this clamp.
  function positionSuggestions() {
    if (mobileLayout.matches) {
      const navRow = englishWrap.closest(".panel-strongs-selectors");
      const wrapRect = englishWrap.getBoundingClientRect();
      const navRect = navRow?.getBoundingClientRect();
      if (!navRect || !wrapRect.width || !navRect.width) return;
      suggestions.style.left = `${Math.round(navRect.left - wrapRect.left)}px`;
      suggestions.style.right = "auto";
      suggestions.style.width = `${Math.floor(navRect.width)}px`;
      suggestions.style.removeProperty("min-width");
      return;
    }
    const panel = englishWrap.closest(".bible-panel");
    const wrapRect = englishWrap.getBoundingClientRect();
    const panelRect = panel?.getBoundingClientRect();
    if (!panelRect || !wrapRect.width) {
      resetSuggestionsPosition();
      return;
    }
    const margin = 8;
    const available = Math.max(120, Math.floor(panelRect.width - margin * 2));
    suggestions.style.left = `${Math.round(panelRect.left - wrapRect.left + margin)}px`;
    suggestions.style.right = "auto";
    suggestions.style.width = `${available}px`;
    suggestions.style.minWidth = "0px";
  }

  function closeSuggestions() {
    suggestions.hidden = true;
    suggestions.replaceChildren();
    suggestionItems = [];
    suggestionHighlighted = -1;
    resetSuggestionsPosition();
  }

  function updateSuggestionHighlight() {
    suggestions.querySelectorAll(".strongs-nav-suggestion-option").forEach((option, index) => {
      option.classList.toggle("highlighted", index === suggestionHighlighted);
    });
  }

  function chooseSuggestion(item) {
    setEnglishCommitted(item.translit);
    numberInput.value = String(Number(item.code.slice(1)));
    closeSuggestions();
  }

  async function renderSuggestions(query) {
    const trimmed = strongsSearchKey(query.trim());
    if (!trimmed) {
      closeSuggestions();
      return;
    }
    const index = await getStrongsTranslitIndex().catch(() => ({ H: [], G: [] }));
    if (strongsSearchKey(englishInput.value.trim()) !== trimmed) return;
    const matches = index[langValue()].filter((item) => item.key.startsWith(trimmed));
    suggestionItems = matches.slice(0, STRONGS_SUGGESTION_LIMIT);
    suggestions.replaceChildren();
    if (!suggestionItems.length) {
      closeSuggestions();
      return;
    }
    suggestionHighlighted = 0;
    for (const [optionIndex, item] of suggestionItems.entries()) {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "strongs-nav-suggestion-option";
      option.setAttribute("role", "option");
      if (optionIndex === 0) option.classList.add("highlighted");
      const code = document.createElement("span");
      code.className = "strongs-nav-suggestion-code";
      code.textContent = item.code;
      const lemma = document.createElement("span");
      lemma.className = "strongs-nav-suggestion-lemma";
      lemma.lang = item.code[0] === "H" ? "he" : "grc";
      lemma.textContent = item.lemma;
      const translitWord = document.createElement("span");
      translitWord.className = "strongs-nav-suggestion-word";
      translitWord.textContent = item.translit;
      option.append(code, lemma, translitWord);
      option.addEventListener("mousedown", (event) => event.preventDefault());
      option.addEventListener("click", () => chooseSuggestion(item));
      suggestions.append(option);
    }
    positionSuggestions();
    suggestions.hidden = false;
    const exact = suggestionItems.find((item) => item.key === trimmed);
    if (exact) {
      englishCommitted = exact.translit;
      numberInput.value = String(Number(exact.code.slice(1)));
    }
  }

  englishInput.addEventListener("focus", () => {
    englishInput.value = "";
  });
  englishInput.addEventListener("input", () => renderSuggestions(englishInput.value));
  // Same reasoning as the suggestion options' own mousedown guard below --
  // without it, the mousedown's default focus-shift blurs the input first,
  // which can restore englishCommitted out from under this click before it
  // ever runs.
  englishClear.addEventListener("mousedown", (event) => event.preventDefault());
  englishClear.addEventListener("click", () => {
    englishInput.value = "";
    englishInput.dispatchEvent(new Event("input", { bubbles: true }));
    englishInput.focus();
  });
  englishInput.addEventListener("blur", () => {
    window.setTimeout(() => {
      if (suggestionPointerActive) return;
      closeSuggestions();
      if (englishInput.value.trim().toLocaleLowerCase() !== englishCommitted.toLocaleLowerCase()) {
        englishInput.value = englishCommitted;
      }
    }, 100);
  });
  englishInput.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!suggestionItems.length) return;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      suggestionHighlighted = (suggestionHighlighted + direction + suggestionItems.length) % suggestionItems.length;
      updateSuggestionHighlight();
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (suggestionItems.length && suggestionHighlighted >= 0) {
        chooseSuggestion(suggestionItems[suggestionHighlighted]);
      }
      searchButton.click();
    } else if (event.key === "Escape") {
      closeSuggestions();
      englishInput.value = englishCommitted;
      englishInput.blur();
    }
  });
  suggestions.addEventListener("pointerdown", () => {
    suggestionPointerActive = true;
    const release = () => {
      suggestionPointerActive = false;
      document.removeEventListener("pointerup", release, true);
    };
    document.addEventListener("pointerup", release, true);
  });

  // Either field alone is enough to search: the code field wins if it's
  // filled in, otherwise an exact transliteration match (in the currently
  // selected language) is looked up.
  searchButton.addEventListener("click", async () => {
    const number = Number(numberInput.value);
    if (number) {
      goToNumber(number);
      return;
    }
    const query = strongsSearchKey(englishInput.value.trim());
    if (!query) return;
    const index = await getStrongsTranslitIndex().catch(() => ({ H: [], G: [] }));
    const match = index[langValue()].find((item) => item.key === query);
    if (match) showCode(match.code);
  });

  // Pages through the shared strongsHistory -- see registerStrongsHistoryButtons
  // -- and always renders the result into *this* panel's own STR pane,
  // whichever panel or dialog a given entry was originally looked up in.
  historyBack.addEventListener("click", () => {
    const word = moveStrongsHistory(-1);
    if (word) getStudyToolInstance(panelState, "STR").showWord(word);
  });
  historyForward.addEventListener("click", () => {
    const word = moveStrongsHistory(1);
    if (word) getStudyToolInstance(panelState, "STR").showWord(word);
  });
  const unregisterStrongsHistoryButtons = registerStrongsHistoryButtons(historyBack, historyForward);

  return {
    // silent: true for a pane's own initial "nothing clicked yet" default
    // (see createEmbeddedStrongsTool) -- the fields still sync to it, but
    // it's not a real lookup, so it doesn't join the shared history.
    notifyWordShown(word, { silent = false } = {}) {
      updateNav(word);
      if (!silent) recordStrongsHistory(word);
    },
    destroy() {
      document.removeEventListener("pointerdown", onDocPointerDown, true);
      document.removeEventListener("keydown", onDocKeydown);
      unregisterStrongsHistoryButtons();
    },
  };
}

// ---- Strong's (mirrors #strongs-dialog exactly) ----
function createEmbeddedStrongsTool(panelState) {
  const element = document.createElement("div");
  element.className = studyToolPaneBaseClass("STR");

  const shell = document.createElement("div");
  shell.className = "lookup-shell word-dictionary-shell";
  element.append(shell);

  // Embedded, this pane has no title of its own -- the panel's own top bar
  // (see .panel-strongs-selectors, wired up by createPanelStrongsNav in
  // createPanelElement) takes over that job while this is active, so
  // Bible Hub is the first thing in the shell, sitting in the Original
  // Word field's own row (see appendOriginalWordField, in showEntry below)
  // rather than beside a title that doesn't exist here.
  const biblehubLink = document.createElement("a");
  biblehubLink.className = "biblehub-link";
  biblehubLink.target = "_blank";
  biblehubLink.rel = "noopener noreferrer";
  biblehubLink.setAttribute("aria-label", "View on Bible Hub");
  biblehubLink.hidden = true;
  biblehubLink.innerHTML = `<span class="biblehub-link-label">Bible Hub</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><path d="M15 3h6v6"></path><path d="M10 14 21 3"></path></svg>`;

  // Split from the modal's own single scrolling .lookup-body (fields and
  // concordance together, see #strongs-dialog-body) into its own fixed row
  // plus a lookup-body that holds (and scrolls) only the concordance below
  // it -- embedded, the dictionary fields staying in place while only the
  // (often much longer) Englishman's Concordance list scrolls reads better
  // in a narrow column than the whole thing scrolling as one unit.
  const fieldsSlot = document.createElement("div");
  const body = document.createElement("div");
  body.className = "lookup-body";

  shell.append(fieldsSlot, body);

  let currentWord = null;

  const goToCode = (code) => {
    showEntry({ strongs: code, original: code, lang: code.startsWith("H") ? "he" : "grc" });
  };

  async function showEntry(word, { silent = false } = {}) {
    currentWord = word;
    // Keeps the panel's own nav row (lang picker, number/transliteration
    // fields) in sync with whatever word just rendered, however it got
    // here -- a nav search, its own history buttons, a word clicked in
    // this panel's own text, or one of the Strong's-linked fields below
    // (goToCode) -- and (unless silent) records it into the shared
    // strongsHistory those history buttons page through.
    panelState.strNav?.notifyWordShown(word, { silent });
    body.replaceChildren();
    if (!word.strongs) {
      biblehubLink.hidden = true;
      showLookupEmpty(fieldsSlot, "No Strong's number for this word.");
      return;
    }
    showLookupEmpty(fieldsSlot, "Loading…");
    const [entriesResult, concordanceResult] = await Promise.allSettled([
      getStrongsData(),
      getEnglishmansEntry(word.strongs),
    ]);
    if (!element.isConnected || currentWord !== word) return;
    const entries = entriesResult.status === "fulfilled" ? entriesResult.value : {};
    const concordance = concordanceResult.status === "fulfilled" ? concordanceResult.value : null;
    const entry = entries[word.strongs];
    biblehubLink.hidden = !entry;
    if (entry) biblehubLink.href = biblehubUrl(word.strongs);
    const fields = document.createElement("div");
    fields.className = "word-dictionary-fields";
    if (entry) {
      appendOriginalWordField(fields, entry.lemma, biblehubLink, { lang: word.lang });
      appendLookupField(fields, "Transliteration", entry.translit);
      appendLookupField(fields, "KJV", entry.kjv);
      appendStrongsLinkedField(fields, "Word Origin", entry.derivation, word.lang, goToCode);
      appendStrongsLinkedField(fields, "Definition", entry.def, word.lang, goToCode);
      appendLookupField(fields, "Morphology", wordMorphologyDisplay(word));
    } else if (word.gloss || word.transliteration) {
      appendOriginalWordField(fields, word.original, biblehubLink, { lang: word.lang });
      appendLookupField(fields, "Transliteration", word.transliteration);
      appendLookupField(fields, "In This Verse", word.gloss);
      const note = document.createElement("p");
      note.className = "lookup-empty";
      note.textContent = `No Strong's Concordance entry for ${word.strongs} -- it's outside the classical 1-${STRONGS_MAX_NUMBER[word.strongs[0]]} numbering this dictionary covers.`;
      fields.append(note);
    } else {
      const empty = document.createElement("p");
      empty.className = "lookup-empty";
      empty.textContent = "No dictionary entry found.";
      fields.append(empty);
    }
    fieldsSlot.replaceChildren(fields);
    await renderConcordanceSection(panelState, word, concordance, body, () => element.isConnected && currentWord === word, true);
  }

  // No word clicked yet defaults to Strong's Hebrew #1 rather than an empty
  // prompt, since this pane shows itself the instant STR is picked (see
  // setupDialogTranslationControl's own onToggle), before there's
  // necessarily been any click to show yet -- that fallback default is
  // silent (not a real lookup), but a word already selected before STR
  // was ever turned on is a real one, same as any later click.
  showEntry(panelState.selectedWord ?? { strongs: "H0001", original: "H0001", lang: "he" }, {
    silent: !panelState.selectedWord,
  });

  return {
    element,
    destroy: () => {},
    showWord: (word) => showEntry(word),
    // Lets a freshly added panel that inherits an already-active STR from
    // the source panel (see addPanel) pick up wherever that one currently
    // is, instead of always restarting cold at the H0001 fallback above.
    getWord: () => currentWord,
  };
}

function renderPanelBody(panelState) {
  const elements = panelElements.get(panelState.id);
  if (!elements || !panelState.data) return;
  // A study tool's own cached instance (see getStudyToolInstance) outlives
  // deactivation so its history/typed input/current word are all still
  // there if it's reactivated later -- pruneStudyToolInstances only drops
  // one once its own chip isn't even enabled anymore.
  pruneStudyToolInstances(panelState);
  syncOriginalLanguageForTestament(panelState);
  ensureInterlinearData(panelState);

  const enabled = enabledTranslationIds(panelState);

  const readingTranslation = singleReadableTranslation(panelState);
  // Reading mode itself only ever needs forcing back off here for the
  // linked case -- readingModeEligible's only real gate. No single
  // readable translation (none selected, or more than one) no longer turns
  // it off; the flow just renders empty with the picker open instead (see
  // the branch below and toggleReadingMode).
  if (panelState.readingMode && !readingModeEligible(panelState)) panelState.readingMode = false;
  updateReadingModeControls(panelState);
  // The link-mode toggle's own disabled state also depends on
  // panelState.readingMode (see updateLinkModeControls) -- re-synced here
  // alongside the reading-mode controls so every render (not just the
  // handful of call sites that toggle reading mode directly) keeps it
  // current, the same reasoning updateReadingModeControls itself already
  // follows.
  updateLinkModeControls(panelState);
  updateTranslationNameToggleControls(panelState);
  if (panelState.readingMode) {
    if (readingTranslation) renderReadingFlow(panelState, readingTranslation);
    else elements.content.innerHTML = "";
    updatePanelControls(panelState);
    return;
  }

  // STR replaces the panel's own history/book/chapter/verse selector row
  // with its own dialog-style nav (see .panel-strongs-selectors); TSK keeps
  // that row as-is and simply follows wherever it navigates to instead
  // (see the activeStudyTool === "TSK" branch below).
  elements.panel.classList.toggle("str-nav-active", panelState.activeStudyTool === "STR");

  const fragment = document.createDocumentFragment();

  // A study tool (STR/TSK) replaces this panel's own translation text
  // entirely with one embedded pane -- not a per-verse row, since neither
  // corresponds to individual verses the way translation text does.
  if (panelState.activeStudyTool) {
    const instance = getStudyToolInstance(panelState, panelState.activeStudyTool);
    instance.element.className = studyToolPaneBaseClass(panelState.activeStudyTool);
    // TSK has no nav of its own (see createEmbeddedTskTool) -- it always
    // shows cross references for whatever book/chapter/verse this panel's
    // own selector currently sits on.
    if (panelState.activeStudyTool === "TSK") {
      instance.goToVerse(panelState.book, panelState.chapter, panelState.verse);
    } else if (panelState.activeStudyTool === "STR" && panelState.pendingStrWord) {
      // See addPanel's own comment -- a freshly inherited STR entry that
      // clearWordLookup already erased from selectedWord before this
      // instance was ever created, caught up here the first (and only;
      // cleared right after) time it actually exists to receive it.
      instance.showWord(panelState.pendingStrWord);
      panelState.pendingStrWord = null;
    }
    fragment.append(instance.element);
  } else {
    for (const [verseNumber, texts] of panelState.data.v) {
      const group = document.createElement("section");
      group.className = "verse-group";
      group.dataset.verse = String(verseNumber);
      const number = document.createElement("span");
      number.className = "verse-number";
      number.classList.toggle(
        "verse-number--bookmarked",
        Boolean(state.bookmarks[bookmarkKey(panelState.book, panelState.chapter, verseNumber)]),
      );
      number.textContent = String(verseNumber);
      // Own click, not the verse-group's -- opens the remove popup instead
      // of also toggling this verse into/out of copy-selection (see
      // mark.addEventListener above for the same reasoning on highlighted
      // text). Checked at click time (not capped to whichever verses were
      // bookmarked when this listener was attached) since the class is
      // set fresh on every render, including the one right after a
      // toggle -- and a plain, unbookmarked number falls through to the
      // group's own click as normal.
      number.addEventListener("click", (event) => {
        if (!number.classList.contains("verse-number--bookmarked")) return;
        event.stopPropagation();
        showBookmarkManagePopup(number, panelState.book, panelState.chapter, verseNumber);
      });
      group.append(number);

      // Placed here only as a pending candidate -- .verse-note-icon--below
      // vs .verse-note-icon--inline (see finalizeVerseNoteIconPlacement)
      // depends on this verse's own rendered height, which isn't known
      // until the whole fragment is actually in the document.
      const noteText = state.notes[noteKey(panelState.book, panelState.chapter, verseNumber)];
      if (noteText) {
        const noteIcon = buildVerseNoteIcon(panelState.book, panelState.chapter, verseNumber, noteText);
        noteIcon.classList.add("verse-note-icon--pending");
        group.append(noteIcon);
      }

      group.addEventListener("click", () => {
        selectVerse(panelState, verseNumber);
        // Live: if TSK is enabled here (even dimmed, showing plain text
        // instead) it switches to and shows this verse's cross references
        // immediately, without waiting for the verse-actions bar's own
        // cross-references button -- same as clicking the TSK chip itself
        // would, just triggered by the verse instead. Any linked panel
        // with TSK enabled (see linkGroupPartners) gets the exact same
        // treatment: activated here, before the one goToPassage call
        // below, whose own group fan-out (and its own "TSK always
        // follows" branch) is what actually carries this verse -- and the
        // switch to showing it -- to each of them.
        const targets = [panelState, ...linkGroupPartners(panelState)];
        let anyTsk = false;
        for (const target of targets) {
          if (!target.enabledTranslations.includes("TSK")) continue;
          anyTsk = true;
          if (target.activeStudyTool !== "TSK") toggleTranslationChip(target, "TSK");
        }
        if (!anyTsk) return;
        // Clicking a verse just to notify a linked TSK partner isn't a real
        // navigation for THIS panel -- the reader is already looking at
        // this verse (that's how they clicked it, and selectVerse above has
        // already settled wherever it belongs, including its own
        // revealVerseAboveActions nudge if one was needed) -- so
        // goToPassage's own scrollVerseToTop (still needed so whichever
        // linked partner's own view actually has to jump to this reference
        // does) is skipped for this panel specifically via scrollToTop:
        // false. An earlier version instead snapshotted this panel's own
        // scrollTop and restored it right after -- but that raced against
        // revealVerseAboveActions's own smooth-scroll animation (already
        // in flight from selectVerse, above, whenever reduced-motion isn't
        // on): the synchronous restore "won" for an instant, only for the
        // still-running animation to carry scrollTop the rest of the way to
        // its own target moments later, undoing it. Skipping the scroll
        // outright avoids the race instead of trying to out-time it.
        goToPassage(
          panelState,
          { book: panelState.book, chapter: panelState.chapter, verse: verseNumber },
          { record: true, scrollToTop: false },
        );
        for (const target of targets) {
          if (target.activeStudyTool !== "TSK") continue;
          renderPanelBody(target);
          // A chip list long enough to overflow can have TSK scrolled out
          // of sight, same as a freshly-added chip -- bring it back into
          // view now that it's the one actually showing.
          panelElements.get(target.id)?.translationControl.revealChip("TSK");
        }
      });

      buildTranslationLinesInto(
        group, panelState, verseNumber, texts,
        enabled, panelState.highlightedTranslations, panelState.dimmedTranslations,
        panelState.originalLanguageHidden,
      );
      fragment.append(group);
    }
  }

  // A navigation to a specific verse can still have its Hebrew/Greek
  // interlinear data loading, which re-renders again once it arrives (see
  // ensureInterlinearData above). That second render must keep scrolling to
  // the same target verse rather than anchor-preserving -- otherwise the
  // interlinear row's height change (e.g. verse 1 growing once its Hebrew/
  // Greek tokens arrive) shifts whichever verse the anchor logic picked,
  // occasionally leaving some other verse at the top instead of verse 1.
  const pendingScrollVerse = panelState.scrollTargetVerse ?? null;
  const interlinearLoadPending = Boolean(panelState.interlinearVerses?.loading);
  const anchor = pendingScrollVerse == null ? captureVerseAnchor(elements.content, panelState) : null;
  elements.content.replaceChildren(fragment);
  for (const icon of elements.content.querySelectorAll(".verse-note-icon--pending")) {
    finalizeVerseNoteIconPlacement(icon, enabled.length);
  }
  // A study tool's own shell (see .study-tool-pane in styles.css) needs an
  // explicit height to fill -- its height: 100% only means something once
  // this wrapper has a real height of its own, and only this can reach
  // "this scroll container's own visible height," the same way
  // syncDialogHeightToPanel measures it for the modal dialogs.
  elements.panel.classList.toggle("no-plain-text-column", hasNoPlainTextColumn(panelState));
  elements.panel.classList.toggle("study-tool-active", Boolean(panelState.activeStudyTool));
  elements.panel.classList.toggle("panel-no-translations", panelHasNoTranslations(panelState));
  // clientHeight includes .panel-content's own vertical padding, but a pane
  // is a child living inside that padding box -- sizing it to the raw
  // clientHeight leaves it exactly that much taller than the room actually
  // available, forcing .panel-content itself to scroll despite each pane
  // already managing its own internal scrolling.
  const contentStyle = getComputedStyle(elements.content);
  const paneHeight = elements.content.clientHeight
    - Number.parseFloat(contentStyle.paddingTop)
    - Number.parseFloat(contentStyle.paddingBottom);
  for (const pane of elements.content.querySelectorAll(".study-tool-pane")) {
    pane.style.height = `${paneHeight}px`;
  }
  if (pendingScrollVerse != null) {
    scrollVerseToTop(panelState, pendingScrollVerse);
    if (!interlinearLoadPending) panelState.scrollTargetVerse = null;
  } else {
    restoreVerseAnchor(elements.content, anchor);
  }
  updatePanelSelection(panelState);
  updatePanelControls(panelState);
  // A plain-text render's rows are freshly created elements with no
  // inline min-height of their own yet (see equalizeGroupRowHeights, which
  // only ever sets that on rows it can see), so their heights here are
  // this panel's own natural, unequalized heights. Snapshotting them on
  // every plain-text render is what lets equalizeGroupRowHeights keep
  // contributing this panel's own row heights to a linked group's max even
  // after this panel switches away to STR/TSK and stops rendering any rows
  // of its own -- otherwise the other linked panels' rows would shrink
  // (and visibly rescroll) the moment this one stopped contributing.
  if (!panelState.activeStudyTool) {
    const heights = {};
    for (const row of elements.content.querySelectorAll(".verse-group[data-verse]")) {
      heights[row.dataset.verse] = row.getBoundingClientRect().height;
    }
    panelState.frozenRowHeights = { book: panelState.book, chapter: panelState.chapter, heights };
  }
  if (panelState.linkGroupId != null) scheduleGroupRowHeightSync(panelState.linkGroupId);
}

function refreshPanelBodies() {
  for (const panel of state.panels) renderPanelBody(panel);
}

function updatePanelControls(panelState) {
  const elements = panelElements.get(panelState.id);
  if (!elements) return;
  elements.bookCombo.setValue(panelState.book);
  elements.chapterCombo.setItems(chapterItems(panelState.book));
  elements.chapterCombo.setValue(panelState.chapter);
  const verses = verseItems(panelState);
  const maxVerse = verses.at(-1)?.value ?? 1;
  panelState.verse = Math.max(1, Math.min(Number(panelState.verse) || 1, maxVerse));
  elements.verseCombo.setItems(verses);
  elements.verseCombo.setValue(panelState.verse);
  ensurePanelHistory(panelState);
  elements.historyBack.disabled = panelState.historyIndex <= 0;
  elements.historyForward.disabled = panelState.historyIndex >= panelState.history.length - 1;
  elements.previous.disabled = panelState.book === 0 && panelState.chapter === 1;
  const finalBook = manifest.books.length - 1;
  elements.next.disabled =
    panelState.book === finalBook && panelState.chapter === manifest.books[finalBook].chapters;
}

function navigateChapter(panelState, direction) {
  let { book, chapter } = panelState;
  chapter += direction;
  if (chapter < 1 && book > 0) {
    book -= 1;
    chapter = manifest.books[book].chapters;
  } else if (chapter > manifest.books[book].chapters && book < manifest.books.length - 1) {
    book += 1;
    chapter = 1;
  }
  if (book === panelState.book && chapter === panelState.chapter) return;
  goToPassage(panelState, { book, chapter, verse: 1 }, { record: true });
}

// state.fontSize is the actual CSS pixel size (unchanged, so the rendered
// text stays exactly as tuned); the number shown next to the +/- buttons
// is offset down by this much so the same default reads as 11 instead of 14.
const FONT_SIZE_DISPLAY_OFFSET = 3;

function applyFontSize() {
  document.documentElement.style.setProperty("--verse-font-size", `${state.fontSize}px`);
  fontSizeValue.value = String(state.fontSize - FONT_SIZE_DISPLAY_OFFSET);
  fontSizeDownButton.disabled = state.fontSize <= 10;
  fontSizeUpButton.disabled = state.fontSize >= 23;
}

function changeFontSize(delta) {
  state.fontSize = Math.max(10, Math.min(state.fontSize + delta, 23));
  applyFontSize();
  saveState();
  // Font size is a bare CSS variable, not a re-render -- verse text
  // reflows on its own with no renderPanelBody call to piggyback the
  // usual row-height-sync hook on, so every currently-linked group needs
  // telling explicitly here instead.
  for (const groupId of new Set(state.panels.map((panel) => panel.linkGroupId).filter((id) => id != null))) {
    scheduleGroupRowHeightSync(groupId);
  }
}

function formatVerseReference(chapter, verses) {
  if (!verses.length) return `${chapter}:`;
  const parts = [];
  for (let index = 0; index < verses.length; index += 1) {
    const start = verses[index];
    let end = start;
    while (index + 1 < verses.length && verses[index + 1] === end + 1) {
      index += 1;
      end = verses[index];
    }
    parts.push(start === end ? String(start) : `${start}-${end}`);
  }
  return `${chapter}:${parts.join(", ")}`;
}

// Same range-collapse convention used by copyRangeVerseItems' callers
// below: only ever a single contiguous start-verse..end-verse span now
// (the dialog's own range row can't represent scattered individual picks),
// so this always returns exactly one part.
function copyRangeVerseItems() {
  const verses = copyChapterDataCache?.v.map(([verse]) => Number(verse)) ?? [1];
  return verses.map((verse) => ({ value: verse, label: String(verse) }));
}

// A single-verse copy (start === end) leaves the end box empty instead of
// echoing the same number the start box already shows -- setValue(null)
// matches no item, so the combo reads as nothing chosen; its own choose()
// guard (no item -> no-op) never clears the displayed text on its own, so
// that's done here too.
function syncCopyEndVerseDisplay() {
  if (copyStartVerse === copyEndVerse) {
    copyEndVerseCombo.setValue(null);
    copyEndVerseInput.value = "";
  } else {
    copyEndVerseCombo.setValue(copyEndVerse);
  }
}

function setupCopyRangeControls() {
  const bookItems = manifest.books.map((book, index) => ({
    value: index,
    label: `${book.en} ${book.ko}`,
    ko: book.ko,
    en: book.en,
    testament: index < 39 ? "old" : "new",
  }));
  copyBookCombo = setupCombobox({
    input: copyBookInput,
    menu: copyBookInput.closest(".book-combo").querySelector(".combo-menu"),
    items: bookItems,
    selectedValue: 0,
    matches: matchesBook,
    onSelect: async (book) => {
      copyBook = book;
      copyChapter = 1;
      copyChapterCombo.setItems(chapterItems(copyBook));
      copyChapterCombo.setValue(1);
      copyChapterDataCache = await getChapter(copyBook, 1);
      const verses = copyRangeVerseItems();
      copyStartVerse = 1;
      copyEndVerse = verses.at(-1)?.value ?? 1;
      copyStartVerseCombo.setItems(verses);
      copyStartVerseCombo.setValue(1);
      copyEndVerseCombo.setItems(verses);
      syncCopyEndVerseDisplay();
    },
  });
  copyChapterCombo = setupCombobox({
    input: copyChapterInput,
    menu: copyChapterInput.closest(".chapter-combo").querySelector(".combo-menu"),
    items: [{ value: 1, label: "1" }],
    selectedValue: 1,
    matches: (item, query) => !query.trim() || item.label.startsWith(query.trim()),
    onSelect: async (chapter) => {
      copyChapter = chapter;
      copyChapterDataCache = await getChapter(copyBook, chapter);
      const verses = copyRangeVerseItems();
      copyStartVerse = 1;
      copyEndVerse = verses.at(-1)?.value ?? 1;
      copyStartVerseCombo.setItems(verses);
      copyStartVerseCombo.setValue(1);
      copyEndVerseCombo.setItems(verses);
      syncCopyEndVerseDisplay();
    },
  });
  copyStartVerseCombo = setupCombobox({
    input: copyStartVerseInput,
    menu: copyStartVerseInput.closest(".verse-combo").querySelector(".combo-menu"),
    items: [{ value: 1, label: "1" }],
    selectedValue: 1,
    matches: (item, query) => !query.trim() || item.label.startsWith(query.trim()),
    onSelect: (verse) => {
      copyStartVerse = verse;
      if (copyEndVerse < copyStartVerse) copyEndVerse = copyStartVerse;
      syncCopyEndVerseDisplay();
    },
  });
  copyEndVerseCombo = setupCombobox({
    input: copyEndVerseInput,
    menu: copyEndVerseInput.closest(".verse-combo").querySelector(".combo-menu"),
    items: [{ value: 1, label: "1" }],
    selectedValue: 1,
    matches: (item, query) => !query.trim() || item.label.startsWith(query.trim()),
    onSelect: (verse) => {
      copyEndVerse = verse;
      if (copyStartVerse > copyEndVerse) {
        copyStartVerse = copyEndVerse;
        copyStartVerseCombo.setValue(copyStartVerse);
      }
      syncCopyEndVerseDisplay();
    },
  });
}

// Shared tail of openCopyDialog/openCopyDialogForVerse below -- both have
// already set copyBook/copyChapter/copyChapterDataCache/copyStartVerse/
// copyEndVerse/copyTranslationOrder by this point, just from different
// sources.
function populateCopyDialogAndShow() {
  copyBookCombo.setValue(copyBook);
  copyChapterCombo.setItems(chapterItems(copyBook));
  copyChapterCombo.setValue(copyChapter);
  const verses = copyRangeVerseItems();
  copyStartVerseCombo.setItems(verses);
  copyStartVerseCombo.setValue(copyStartVerse);
  copyEndVerseCombo.setItems(verses);
  syncCopyEndVerseDisplay();
  copyTranslationControl?.render();
  copyDialog.showModal();
  // See the matching comment in openStrongsDialog -- same default-focus
  // fix, so the close button doesn't end up wearing an unearned focus ring.
  copyDialog.focus();
}

function openCopyDialog(panelState) {
  const selectedVerses = selectedVerseNumbers(panelState);
  if (!selectedVerses.length || !panelState.data) return;
  copyPanelState = panelState;
  copyStatus.textContent = "";
  setCopyReadingModeOn(false);

  // Defaults to whatever verse range was selected in the panel, collapsed
  // to its own min..max span (the range row can't represent a scattered
  // individual-mode pick, only a single contiguous range).
  copyBook = panelState.book;
  copyChapter = panelState.chapter;
  copyChapterDataCache = panelState.data;
  copyStartVerse = Math.min(...selectedVerses);
  copyEndVerse = Math.max(...selectedVerses);
  copySelectedVerseNumbers = [...selectedVerses];
  copySelectedVerseNumbersBook = copyBook;
  copySelectedVerseNumbersChapter = copyChapter;

  // Offer the translations currently shown in this panel, in their reading
  // order. Hebrew/Greek copies the same way as any modern version now (see
  // buildCopyVerseText), but defaults to unselected here -- unless it's the
  // only thing enabled in the panel, in which case there's nothing else to
  // default to.
  const enabled = enabledTranslationIds(panelState);
  const modernEnabled = enabled.filter(isIndexableTranslationId);
  copyTranslationOrder = modernEnabled.length ? modernEnabled : enabled;
  populateCopyDialogAndShow();
}

// Used by copyTskResult/copySearchResult: copying a cross-reference or
// search-result verse must not disturb any panel's own displayed passage
// or selection, so unlike openCopyDialog above this fetches the
// reference's own chapter independently instead of reading panelState.book/
// chapter/data, and never touches any panel's selectedVerses. copyPanelState
// still points at the active panel (copySelectedVerses' own guard requires
// a truthy value, and clearing a panel with nothing selected is a no-op)
// but that panel's book/chapter/selection are left exactly as they were.
async function openCopyDialogForVerse(bookId, chapter, verse, translations) {
  const data = await getChapter(bookId, chapter);
  copyPanelState = activeOrFirstPanel();
  copyStatus.textContent = "";
  setCopyReadingModeOn(false);
  copyBook = bookId;
  copyChapter = chapter;
  copyChapterDataCache = data;
  copyStartVerse = verse;
  copyEndVerse = verse;
  copySelectedVerseNumbers = [verse];
  copySelectedVerseNumbersBook = copyBook;
  copySelectedVerseNumbersChapter = copyChapter;
  copyTranslationOrder = [...translations];
  populateCopyDialogAndShow();
}

function closeCopyDialog() {
  copyTranslationControl?.close();
  copyDialog.close();
  copyPanelState = null;
}

// ---- Highlight dialog -- same shape as the copy dialog above (range row,
// version picker, showModal/populate/close), minus reading mode (a
// highlight has no "reading style" to render) and with the copy dialog's
// own Order fieldset swapped for a six-color picker (see setHighlightColor
// and #highlight-color-group in index.html) instead of verse/version
// ordering, which has nothing to mean for a highlight. ----
function highlightRangeVerseItems() {
  const verses = highlightChapterDataCache?.v.map(([verse]) => Number(verse)) ?? [1];
  return verses.map((verse) => ({ value: verse, label: String(verse) }));
}

function syncHighlightEndVerseDisplay() {
  if (highlightStartVerse === highlightEndVerse) {
    highlightEndVerseCombo.setValue(null);
    highlightEndVerseInput.value = "";
  } else {
    highlightEndVerseCombo.setValue(highlightEndVerse);
  }
}

function setupHighlightRangeControls() {
  const bookItems = manifest.books.map((book, index) => ({
    value: index,
    label: `${book.en} ${book.ko}`,
    ko: book.ko,
    en: book.en,
    testament: index < 39 ? "old" : "new",
  }));
  highlightBookCombo = setupCombobox({
    input: highlightBookInput,
    menu: highlightBookInput.closest(".book-combo").querySelector(".combo-menu"),
    items: bookItems,
    selectedValue: 0,
    matches: matchesBook,
    onSelect: async (book) => {
      highlightBook = book;
      highlightChapter = 1;
      highlightChapterCombo.setItems(chapterItems(highlightBook));
      highlightChapterCombo.setValue(1);
      highlightChapterDataCache = await getChapter(highlightBook, 1);
      const verses = highlightRangeVerseItems();
      highlightStartVerse = 1;
      highlightEndVerse = verses.at(-1)?.value ?? 1;
      highlightStartVerseCombo.setItems(verses);
      highlightStartVerseCombo.setValue(1);
      highlightEndVerseCombo.setItems(verses);
      syncHighlightEndVerseDisplay();
    },
  });
  highlightChapterCombo = setupCombobox({
    input: highlightChapterInput,
    menu: highlightChapterInput.closest(".chapter-combo").querySelector(".combo-menu"),
    items: [{ value: 1, label: "1" }],
    selectedValue: 1,
    matches: (item, query) => !query.trim() || item.label.startsWith(query.trim()),
    onSelect: async (chapter) => {
      highlightChapter = chapter;
      highlightChapterDataCache = await getChapter(highlightBook, chapter);
      const verses = highlightRangeVerseItems();
      highlightStartVerse = 1;
      highlightEndVerse = verses.at(-1)?.value ?? 1;
      highlightStartVerseCombo.setItems(verses);
      highlightStartVerseCombo.setValue(1);
      highlightEndVerseCombo.setItems(verses);
      syncHighlightEndVerseDisplay();
    },
  });
  highlightStartVerseCombo = setupCombobox({
    input: highlightStartVerseInput,
    menu: highlightStartVerseInput.closest(".verse-combo").querySelector(".combo-menu"),
    items: [{ value: 1, label: "1" }],
    selectedValue: 1,
    matches: (item, query) => !query.trim() || item.label.startsWith(query.trim()),
    onSelect: (verse) => {
      highlightStartVerse = verse;
      if (highlightEndVerse < highlightStartVerse) highlightEndVerse = highlightStartVerse;
      syncHighlightEndVerseDisplay();
    },
  });
  highlightEndVerseCombo = setupCombobox({
    input: highlightEndVerseInput,
    menu: highlightEndVerseInput.closest(".verse-combo").querySelector(".combo-menu"),
    items: [{ value: 1, label: "1" }],
    selectedValue: 1,
    matches: (item, query) => !query.trim() || item.label.startsWith(query.trim()),
    onSelect: (verse) => {
      highlightEndVerse = verse;
      if (highlightStartVerse > highlightEndVerse) {
        highlightStartVerse = highlightEndVerse;
        highlightStartVerseCombo.setValue(highlightStartVerse);
      }
      syncHighlightEndVerseDisplay();
    },
  });
}

function populateHighlightDialogAndShow() {
  highlightBookCombo.setValue(highlightBook);
  highlightChapterCombo.setItems(chapterItems(highlightBook));
  highlightChapterCombo.setValue(highlightChapter);
  const verses = highlightRangeVerseItems();
  highlightStartVerseCombo.setItems(verses);
  highlightStartVerseCombo.setValue(highlightStartVerse);
  highlightEndVerseCombo.setItems(verses);
  syncHighlightEndVerseDisplay();
  highlightTranslationControl?.render();
  highlightDialog.showModal();
  highlightDialog.focus();
}

function openHighlightDialog(panelState) {
  const selectedVerses = selectedVerseNumbers(panelState);
  if (!selectedVerses.length || !panelState.data) return;
  highlightPanelState = panelState;
  highlightStatus.textContent = "";
  highlightBook = panelState.book;
  highlightChapter = panelState.chapter;
  highlightChapterDataCache = panelState.data;
  highlightStartVerse = Math.min(...selectedVerses);
  highlightEndVerse = Math.max(...selectedVerses);
  highlightSelectedVerseNumbers = [...selectedVerses];
  highlightSelectedVerseNumbersBook = highlightBook;
  highlightSelectedVerseNumbersChapter = highlightChapter;
  const enabled = enabledTranslationIds(panelState);
  const modernEnabled = enabled.filter(isIndexableTranslationId);
  highlightTranslationOrder = modernEnabled.length ? modernEnabled : enabled;
  populateHighlightDialogAndShow();
}

function closeHighlightDialog() {
  highlightTranslationControl?.close();
  highlightDialog.close();
  highlightPanelState = null;
}

function setHighlightColor(color) {
  highlightColor = color;
  for (const option of highlightColorOptions) {
    const selected = option.dataset.highlightColor === color;
    option.classList.toggle("selected", selected);
    option.setAttribute("aria-pressed", String(selected));
  }
}

// What actually gets highlighted -- mirrors copyEffectiveVerseNumbers in
// the copy dialog above. An individual-mode selection with gaps (e.g.
// verses 1, 3, 5) can only ever show as 1-5 in the range row (no field
// for "these specific verses, skipping some"), but should still only
// highlight the verses actually picked. highlightSelectedVerseNumbers
// (set alongside highlightStartVerse/highlightEndVerse in
// openHighlightDialog) is exactly that original pick; it's only used
// here while it still matches the *current* book/chapter/start/end --
// editing any of those combos means the reader now wants that literal
// range instead, and there's no way to express the old gaps through them
// once touched, so this quietly falls back to the plain start-end span.
function highlightEffectiveVerseNumbers() {
  if (
    highlightSelectedVerseNumbers
    && highlightSelectedVerseNumbersBook === highlightBook
    && highlightSelectedVerseNumbersChapter === highlightChapter
    && highlightSelectedVerseNumbers[0] === highlightStartVerse
    && highlightSelectedVerseNumbers.at(-1) === highlightEndVerse
  ) {
    return highlightSelectedVerseNumbers;
  }
  return Array.from(
    { length: highlightEndVerse - highlightStartVerse + 1 },
    (_, index) => highlightStartVerse + index,
  );
}

// The confirm button's own action: marks every selected verse, for every
// selected version, with the current color (see HIGHLIGHT_COLORS) and
// re-renders any panel currently showing this book/chapter so the result
// is visible immediately -- not just highlightPanelState's own panel,
// since a linked partner (or any other panel a reader has open on the
// same passage) should show the same highlight too.
function applyHighlight() {
  if (!highlightPanelState) return;
  const translations = [...highlightTranslationOrder];
  if (!translations.length) {
    highlightStatus.textContent = "Select a version.";
    return;
  }
  for (const translation of translations) {
    for (const verse of highlightEffectiveVerseNumbers()) {
      state.highlights[highlightKey(translation, highlightBook, highlightChapter, verse)] = highlightColor;
    }
  }
  saveState();
  for (const panel of state.panels) {
    if (panel.book === highlightBook && panel.chapter === highlightChapter) renderPanelBody(panel);
  }
  const highlightedPanelState = highlightPanelState;
  if (highlightedPanelState) clearPanelSelection(highlightedPanelState);
  closeHighlightDialog();
}

// ---- Note dialog -- same shape as the highlight dialog above, minus the
// color picker (see #note-dialog in index.html: a free-text textarea
// sits in that fieldset's spot instead). ----
function noteRangeVerseItems() {
  const verses = noteChapterDataCache?.v.map(([verse]) => Number(verse)) ?? [1];
  return verses.map((verse) => ({ value: verse, label: String(verse) }));
}

function syncNoteEndVerseDisplay() {
  if (noteStartVerse === noteEndVerse) {
    noteEndVerseCombo.setValue(null);
    noteEndVerseInput.value = "";
  } else {
    noteEndVerseCombo.setValue(noteEndVerse);
  }
}

function setupNoteRangeControls() {
  const bookItems = manifest.books.map((book, index) => ({
    value: index,
    label: `${book.en} ${book.ko}`,
    ko: book.ko,
    en: book.en,
    testament: index < 39 ? "old" : "new",
  }));
  noteBookCombo = setupCombobox({
    input: noteBookInput,
    menu: noteBookInput.closest(".book-combo").querySelector(".combo-menu"),
    items: bookItems,
    selectedValue: 0,
    matches: matchesBook,
    onSelect: async (book) => {
      noteBook = book;
      noteChapter = 1;
      noteChapterCombo.setItems(chapterItems(noteBook));
      noteChapterCombo.setValue(1);
      noteChapterDataCache = await getChapter(noteBook, 1);
      const verses = noteRangeVerseItems();
      noteStartVerse = 1;
      noteEndVerse = verses.at(-1)?.value ?? 1;
      noteStartVerseCombo.setItems(verses);
      noteStartVerseCombo.setValue(1);
      noteEndVerseCombo.setItems(verses);
      syncNoteEndVerseDisplay();
    },
  });
  noteChapterCombo = setupCombobox({
    input: noteChapterInput,
    menu: noteChapterInput.closest(".chapter-combo").querySelector(".combo-menu"),
    items: [{ value: 1, label: "1" }],
    selectedValue: 1,
    matches: (item, query) => !query.trim() || item.label.startsWith(query.trim()),
    onSelect: async (chapter) => {
      noteChapter = chapter;
      noteChapterDataCache = await getChapter(noteBook, chapter);
      const verses = noteRangeVerseItems();
      noteStartVerse = 1;
      noteEndVerse = verses.at(-1)?.value ?? 1;
      noteStartVerseCombo.setItems(verses);
      noteStartVerseCombo.setValue(1);
      noteEndVerseCombo.setItems(verses);
      syncNoteEndVerseDisplay();
    },
  });
  noteStartVerseCombo = setupCombobox({
    input: noteStartVerseInput,
    menu: noteStartVerseInput.closest(".verse-combo").querySelector(".combo-menu"),
    items: [{ value: 1, label: "1" }],
    selectedValue: 1,
    matches: (item, query) => !query.trim() || item.label.startsWith(query.trim()),
    onSelect: (verse) => {
      noteStartVerse = verse;
      if (noteEndVerse < noteStartVerse) noteEndVerse = noteStartVerse;
      syncNoteEndVerseDisplay();
    },
  });
  noteEndVerseCombo = setupCombobox({
    input: noteEndVerseInput,
    menu: noteEndVerseInput.closest(".verse-combo").querySelector(".combo-menu"),
    items: [{ value: 1, label: "1" }],
    selectedValue: 1,
    matches: (item, query) => !query.trim() || item.label.startsWith(query.trim()),
    onSelect: (verse) => {
      noteEndVerse = verse;
      if (noteStartVerse > noteEndVerse) {
        noteStartVerse = noteEndVerse;
        noteStartVerseCombo.setValue(noteStartVerse);
      }
      syncNoteEndVerseDisplay();
    },
  });
}

function populateNoteDialogAndShow() {
  noteBookCombo.setValue(noteBook);
  noteChapterCombo.setItems(chapterItems(noteBook));
  noteChapterCombo.setValue(noteChapter);
  const verses = noteRangeVerseItems();
  noteStartVerseCombo.setItems(verses);
  noteStartVerseCombo.setValue(noteStartVerse);
  noteEndVerseCombo.setItems(verses);
  syncNoteEndVerseDisplay();
  noteTextarea.value = "";
  noteDialog.showModal();
  noteDialog.focus();
}

function openNoteDialog(panelState) {
  const selectedVerses = selectedVerseNumbers(panelState);
  if (!selectedVerses.length || !panelState.data) return;
  notePanelState = panelState;
  noteStatus.textContent = "";
  noteBook = panelState.book;
  noteChapter = panelState.chapter;
  noteChapterDataCache = panelState.data;
  noteStartVerse = Math.min(...selectedVerses);
  noteEndVerse = Math.max(...selectedVerses);
  noteSelectedVerseNumbers = [...selectedVerses];
  noteSelectedVerseNumbersBook = noteBook;
  noteSelectedVerseNumbersChapter = noteChapter;
  populateNoteDialogAndShow();
}

function closeNoteDialog() {
  noteDialog.close();
  notePanelState = null;
}

// Mirrors copyEffectiveVerseNumbers/highlightEffectiveVerseNumbers above.
function noteEffectiveVerseNumbers() {
  if (
    noteSelectedVerseNumbers
    && noteSelectedVerseNumbersBook === noteBook
    && noteSelectedVerseNumbersChapter === noteChapter
    && noteSelectedVerseNumbers[0] === noteStartVerse
    && noteSelectedVerseNumbers.at(-1) === noteEndVerse
  ) {
    return noteSelectedVerseNumbers;
  }
  return Array.from({ length: noteEndVerse - noteStartVerse + 1 }, (_, index) => noteStartVerse + index);
}

// The confirm button's own action: attaches the typed note text to every
// selected verse as a whole (overwriting whatever note was already there --
// there's no separate "edit" flow here, just re-open and retype; the panel's
// own inline note field is the quick way to edit one verse's note in place),
// and re-renders any panel currently showing this book/chapter so the note
// icon appears immediately, same as applyHighlight/applyBookmark.
function applyNote() {
  if (!notePanelState) return;
  const text = noteTextarea.value.trim();
  if (!text) {
    noteStatus.textContent = "Type a note.";
    return;
  }
  for (const verse of noteEffectiveVerseNumbers()) {
    state.notes[noteKey(noteBook, noteChapter, verse)] = text;
  }
  saveState();
  for (const panel of state.panels) {
    if (panel.book === noteBook && panel.chapter === noteChapter) renderPanelBody(panel);
  }
  const notedPanelState = notePanelState;
  if (notedPanelState) clearPanelSelection(notedPanelState);
  closeNoteDialog();
}

// Positions a Range over just the last character of textEl's own text node
// (there's always exactly one -- see buildTranslationLinesInto) so the
// manage popup below can be placed immediately after it, rather than at
// the whole paragraph's own (possibly much wider, wrapped-to-many-lines)
// bounding box.
function lastHighlightCharacterRect(textEl) {
  const textNode = [...textEl.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
  if (!textNode || !textNode.textContent.length) return textEl.getBoundingClientRect();
  const length = textNode.textContent.length;
  const range = document.createRange();
  range.setStart(textNode, Math.max(0, length - 1));
  range.setEnd(textNode, length);
  return range.getBoundingClientRect();
}

// Keeps the popup inside whatever panel it was opened from -- its own
// anchor point (highlightManageAnchorRect, just past the highlighted
// text's last character) can sit close enough to that panel's own right/
// bottom edge that the popup's natural position would spill into the
// next panel, or past the window entirely. Re-run (not just called once
// from showHighlightManagePopup) whenever the popup's own size changes --
// swapping the swatch for the six-color picker widens it -- since that
// can turn an already-fine position into an overflowing one.
function positionHighlightManagePopup() {
  if (!highlightManageAnchorRect) return;
  const bounds = highlightManagePanelEl
    ? highlightManagePanelEl.getBoundingClientRect()
    : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  const popupRect = highlightManagePopup.getBoundingClientRect();
  let left = highlightManageAnchorRect.right + 4;
  let top = highlightManageAnchorRect.top;
  left = Math.min(left, bounds.right - popupRect.width - 4);
  left = Math.max(left, bounds.left + 4);
  top = Math.min(top, bounds.bottom - popupRect.height - 4);
  top = Math.max(top, bounds.top + 4);
  highlightManagePopup.style.left = `${left}px`;
  highlightManagePopup.style.top = `${top}px`;
}

function showHighlightManagePopup(textEl, translation, book, chapter, verse, colorKey) {
  highlightManageTarget = { translation, book, chapter, verse };
  highlightManageSwatch.style.background = HIGHLIGHT_COLORS[colorKey];
  highlightManageSwatch.hidden = false;
  highlightManageColors.hidden = true;
  highlightManagePanelEl = textEl.closest(".bible-panel");
  highlightManageAnchorRect = lastHighlightCharacterRect(textEl);
  highlightManagePopup.hidden = false;
  positionHighlightManagePopup();
}

function hideHighlightManagePopup() {
  highlightManagePopup.hidden = true;
  highlightManageSwatch.hidden = false;
  highlightManageColors.hidden = true;
  highlightManageTarget = null;
  highlightManageAnchorRect = null;
  highlightManagePanelEl = null;
}

function removeHighlight() {
  if (!highlightManageTarget) return;
  const { translation, book, chapter, verse } = highlightManageTarget;
  delete state.highlights[highlightKey(translation, book, chapter, verse)];
  saveState();
  hideHighlightManagePopup();
  rerenderPanelsPreservingVerseAnchor(book, chapter, verse);
}

// The manage popup's own swatch button swaps places with this instead of
// acting as a static color label -- picking one re-colors the highlight
// in place (the popup itself stays open, swapped back to just the swatch/
// remove, so the trash button is still one click away without reopening).
function setHighlightManageColor(colorKey) {
  if (!highlightManageTarget) return;
  const { translation, book, chapter, verse } = highlightManageTarget;
  state.highlights[highlightKey(translation, book, chapter, verse)] = colorKey;
  saveState();
  highlightManageSwatch.style.background = HIGHLIGHT_COLORS[colorKey];
  highlightManageSwatch.hidden = false;
  highlightManageColors.hidden = true;
  positionHighlightManagePopup();
  rerenderPanelsPreservingVerseAnchor(book, chapter, verse);
}

// Same clamped-to-panel-bounds positioning as positionHighlightManagePopup,
// just anchored beside the bookmarked .verse-number badge itself (vertically
// centered on it) rather than past a highlighted run's last character.
function positionBookmarkManagePopup() {
  if (!bookmarkManageAnchorRect) return;
  const bounds = bookmarkManagePanelEl
    ? bookmarkManagePanelEl.getBoundingClientRect()
    : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  const popupRect = bookmarkManagePopup.getBoundingClientRect();
  let left = bookmarkManageAnchorRect.right + 4;
  let top = bookmarkManageAnchorRect.top + (bookmarkManageAnchorRect.height - popupRect.height) / 2;
  left = Math.min(left, bounds.right - popupRect.width - 4);
  left = Math.max(left, bounds.left + 4);
  top = Math.min(top, bounds.bottom - popupRect.height - 4);
  top = Math.max(top, bounds.top + 4);
  bookmarkManagePopup.style.left = `${left}px`;
  bookmarkManagePopup.style.top = `${top}px`;
}

// Clicking a bookmarked verse-number badge (see renderPanelBody) opens
// this instead of toggling verse selection -- a single trash icon, no
// color picker, since a bookmark has nothing to recolor.
function showBookmarkManagePopup(badgeEl, book, chapter, verse) {
  bookmarkManageTarget = { book, chapter, verse };
  bookmarkManagePanelEl = badgeEl.closest(".bible-panel");
  bookmarkManageAnchorRect = badgeEl.getBoundingClientRect();
  bookmarkManagePopup.hidden = false;
  positionBookmarkManagePopup();
}

function hideBookmarkManagePopup() {
  bookmarkManagePopup.hidden = true;
  bookmarkManageTarget = null;
  bookmarkManageAnchorRect = null;
  bookmarkManagePanelEl = null;
}

function removeBookmark() {
  if (!bookmarkManageTarget) return;
  const { book, chapter, verse } = bookmarkManageTarget;
  delete state.bookmarks[bookmarkKey(book, chapter, verse)];
  saveState();
  hideBookmarkManagePopup();
  rerenderPanelsPreservingVerseAnchor(book, chapter, verse);
}

// One per noted verse (not per translation -- see noteKey), sized to match
// body text exactly (see .translation-note-marker, reused as-is) and
// initially just a "pending" candidate: finalizeVerseNoteIconPlacement
// (called once the whole panel is actually in the document and this
// verse's real rendered height is known) decides where it actually lands.
function buildVerseNoteIcon(book, chapter, verse, text) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "translation-note-marker verse-note-icon";
  button.setAttribute("aria-label", "View note");
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3,4 A1,1 0 0 1 4,3 H15 L21,9 V20 A1,1 0 0 1 20,21 H4 A1,1 0 0 1 3,20 Z"></path><path d="M15,3 V9 H21"></path><path d="M8 13h8M8 16.5h5"></path></svg>';
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    showNoteViewPopup(button, book, chapter, verse, text);
  });
  return button;
}

// Below the verse number, or inline at the number's own text-start position
// -- exactly one of the two. With 2+ translations shown (NOTE counts as one
// of them, see enabledCount), always below: with that many rows, "beside the
// number" has no consistent line to land on. Solo, it goes beside the
// number instead, but only when this verse's own divider (the boundary
// before the next verse) sits right at the number's own bottom already --
// if there's a real gap there (the text wrapped to two-plus lines, or a
// linked partner's own row-height equalization padded this row taller than
// its own single line needs -- see equalizeGroupRowHeights), it goes below
// instead, same as the 2+ translation case.
function finalizeVerseNoteIconPlacement(icon, enabledCount) {
  // Re-run (see refinalizeGroupNoteIcons) on an icon already placed by an
  // earlier pass -- strip whatever that pass decided so only this pass's
  // own choice of class/inline-style survives.
  icon.classList.remove("verse-note-icon--pending", "verse-note-icon--inline", "verse-note-icon--below");
  icon.style.left = "";
  icon.style.width = "";
  icon.style.top = "";
  const group = icon.closest(".verse-group");
  const number = group?.querySelector(".verse-number");
  if (!group || !number) return;
  // Still sitting in the group's own normal flow at this point (appended as
  // a placeholder during the render loop, and .translation-note-marker's
  // base style has no positioning of its own) -- measuring the group's real
  // height with it still there would count its own box height against
  // itself before its placement is even decided, so it comes back out until
  // then; either branch below puts it back (in the text, or in the group).
  icon.remove();

  // .verse-number--bookmarked's own box is taller than the ribbon shape
  // actually painted inside it (see its clip-path in styles.css, which
  // stops at 76% of the box's own height, notch and all) -- measuring
  // against the full box would leave a gap of visibly empty space between
  // the ribbon's real bottom point and whatever sits just below it.
  const numberBottom = number.classList.contains("verse-number--bookmarked")
    ? number.offsetTop + number.offsetHeight * 0.76
    : number.offsetTop + number.offsetHeight;

  const field = group.querySelector(".translation-text, .translation-note-field");
  let placeInline = false;
  if (enabledCount === 1 && field) {
    const lineHeight = Number.parseFloat(getComputedStyle(field).lineHeight) || 20;
    const gapBelowNumber = group.clientHeight - numberBottom;
    placeInline = gapBelowNumber < lineHeight * 0.9;
  }

  if (placeInline) {
    icon.classList.add("verse-note-icon--inline");
    // The 2nd argument here is a non-breaking space, not a plain one -- same
    // reasoning as the (now-removed) per-line note marker this replaces: a
    // plain space is itself a valid line-break point, which would leave the
    // icon free to wrap onto a line of its own the instant the text happened
    // to fill the line exactly.
    field.prepend(icon, " ");
    return;
  }

  icon.classList.add("verse-note-icon--below");
  group.append(icon);
  const gap = 4;
  icon.style.left = `${number.offsetLeft}px`;
  icon.style.width = `${number.offsetWidth}px`;
  icon.style.top = `${numberBottom + gap}px`;
}

// Clicking a verse's own note icon (see buildVerseNoteIcon) opens this,
// titled with the book's English name -- the same click-to-edit field
// buildEditableNoteField already gives the panel's own inline NOTE row and
// the note-list dialog, so editing here saves and reflects back into both
// of those immediately too.
function showNoteViewPopup(anchorEl, book, chapter, verse, text) {
  noteViewTarget = { book, chapter, verse };
  noteViewTitle.textContent = `${manifest.books[book].en} ${chapter}:${verse}`;
  noteViewBody.replaceChildren(
    buildEditableNoteField(
      noteKey(book, chapter, verse),
      text,
      () => {
        for (const panel of state.panels) {
          if (panel.book === book && panel.chapter === chapter) renderPanelBody(panel);
        }
      },
      // The popup's own inline max-width (set by positionNoteViewPopup, off
      // the anchor panel's width, not the fixed 280px its CSS rule
      // suggests) minus its 12px/side padding -- read fresh each resize
      // rather than the popup's own current rendered width, which shrinks
      // right along with a short note and would otherwise become a
      // shrinking ceiling instead of a stable one.
      { autoWidth: true, maxWidth: () => Number.parseFloat(noteViewPopup.style.maxWidth) - 24 },
    ),
  );
  noteViewPanelEl = anchorEl.closest(".bible-panel");
  noteViewAnchorRect = anchorEl.getBoundingClientRect();
  noteViewPopup.hidden = false;
  positionNoteViewPopup();
}

function hideNoteViewPopup() {
  noteViewPopup.hidden = true;
  noteViewTarget = null;
  noteViewAnchorRect = null;
  noteViewPanelEl = null;
}

function removeNote() {
  if (!noteViewTarget) return;
  const { book, chapter, verse } = noteViewTarget;
  delete state.notes[noteKey(book, chapter, verse)];
  saveState();
  hideNoteViewPopup();
  for (const panel of state.panels) {
    if (panel.book === book && panel.chapter === chapter) renderPanelBody(panel);
  }
}

// Clamps both the popup's position AND its own max-width/the body's own
// max-height to the anchor panel's own box -- unlike the manage popups
// above (fixed chrome, just repositioned), a note can be one line or
// several paragraphs, so the size ceiling itself has to shrink to
// whatever room this specific panel actually has, not just this popup's
// own CSS default (see its own comment in styles.css).
function positionNoteViewPopup() {
  if (!noteViewAnchorRect) return;
  const bounds = noteViewPanelEl
    ? noteViewPanelEl.getBoundingClientRect()
    : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight, width: window.innerWidth, height: window.innerHeight };
  const margin = 8;
  noteViewPopup.style.maxWidth = `${Math.max(140, bounds.width - margin * 2)}px`;
  noteViewBody.style.maxHeight = `${Math.max(60, bounds.height - 90)}px`;
  const popupRect = noteViewPopup.getBoundingClientRect();
  let left = noteViewAnchorRect.left;
  let top = noteViewAnchorRect.bottom + 4;
  left = Math.min(left, bounds.right - popupRect.width - margin);
  left = Math.max(left, bounds.left + margin);
  top = Math.min(top, bounds.bottom - popupRect.height - margin);
  top = Math.max(top, bounds.top + margin);
  noteViewPopup.style.left = `${left}px`;
  noteViewPopup.style.top = `${top}px`;
}

// Replaces the old modal move-dialog: a result-list navigate icon (TSK,
// word search, Englishman's concordance) closes its own dialog immediately
// and drops the whole page into "pick a panel" mode -- every visible
// panel's content row gets a blurred overlay (see .panel-move-overlay) with
// a big arrow, the global header collapses to just add-panel, and clicking
// any panel (or add-panel) moves the passage there and exits the mode.
function enterMovePicking(bookId, chapter, verse, closeSource) {
  pendingMoveReference = { bookId, chapter, verse };
  closeSource?.();
  document.documentElement.classList.add("move-picking-active");
  cancelMovePickingButton.hidden = false;
  for (const elements of panelElements.values()) elements.moveOverlay.hidden = false;
}

function exitMovePicking() {
  if (!pendingMoveReference) return;
  pendingMoveReference = null;
  document.documentElement.classList.remove("move-picking-active");
  cancelMovePickingButton.hidden = true;
  for (const elements of panelElements.values()) elements.moveOverlay.hidden = true;
}

function moveToPanel(targetPanelState) {
  if (!pendingMoveReference || !targetPanelState) return;
  const { bookId, chapter, verse } = pendingMoveReference;
  exitMovePicking();
  setActivePanel(targetPanelState.id);
  const elements = panelElements.get(targetPanelState.id);
  elements?.panel.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  goToPassage(targetPanelState, { book: bookId, chapter, verse }, { record: true });
}

function moveToNewPanel() {
  if (!pendingMoveReference) return;
  moveToPanel(addPanel({ suppressScroll: true }));
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && pendingMoveReference) exitMovePicking();
});

// Panels sharing a linkGroupId always show the same book/chapter/verse
// (see goToPassage's own fan-out), scroll together (see the .panel-content
// scroll listener in createPanelElement), and match verse-row heights
// across their own separate scrolling columns (see
// equalizeGroupRowHeights) -- but each keeps its own independent
// translation chips; linking never touches enabledTranslations.
function linkGroupPartners(panelState) {
  if (panelState.linkGroupId == null) return [];
  return state.panels.filter((other) => other !== panelState && other.linkGroupId === panelState.linkGroupId);
}

// Arrow directions for .panel-link-visibility-toggle's own two arrows
// (shaft + arrowhead, not bare chevrons) -- pointing in (toward the center
// square) while every linked panel is showing, pointing out (away from it)
// while this panel's own toggle is the one currently hiding the rest of
// its group. Swapped by setting the path data directly (see
// applyLinkedPartnersVisibility) rather than keeping two separate pairs of
// <path> elements around, since exactly one pair is ever shown at a time
// anyway.
const LINK_VISIBILITY_ARROWS = {
  shown: { left: "M1 12 L7 12 M3 8.5 L7 12 L3 15.5", right: "M23 12 L17 12 M21 8.5 L17 12 L21 15.5" },
  hidden: { left: "M7 12 L1 12 M5 8.5 L1 12 L5 15.5", right: "M17 12 L23 12 M19 8.5 L23 12 L19 15.5" },
};

// Panel IDs whose own .panel-link-visibility-toggle is currently the one
// suppressing the rest of its link group from view. Deliberately not part
// of panelState (see freshState/saveState) -- this is a transient reading
// convenience, not a document change, so it resets on reload the same way
// scroll position does rather than getting persisted.
const hidingLinkedPartners = new Set();

// How far a linked partner slides toward (while hiding) or away from
// (while showing) whichever panel's own toggle triggered this -- same
// rough scale as this codebase's other short slides (the 24px panel
// entrance, the reorder FLIP's own translateX), just a little larger
// since this one also has to read clearly alongside a width collapse
// happening at the same time.
const LINK_VISIBILITY_SLIDE_OFFSET = 36;

// One counter per panel id, bumped every time a new hide/show animation
// starts on it -- lets a still-pending transitionend/timeout from an
// *earlier* call (a reader toggling hide/show again before the first
// animation finished) recognize it's stale and bail instead of forcing
// panel.hidden to the wrong value out from under whichever animation
// actually started most recently.
const linkVisibilityAnimationTokens = new Map();

// The hidden state each panel's own hide/show animation is currently
// driving toward (or, once settled, actually sitting at) -- read instead
// of the native panel.hidden property when deciding whether a panel's
// state actually needs to change (see applyLinkedPartnersVisibility).
// panel.hidden itself only flips at the very *end* of a hide animation
// (see animateLinkedPanelHide's own finish), so mid-transition it still
// reads false even though this panel is unmistakably on its way to
// hidden -- a reader toggling hide then show again before that first
// animation finishes would otherwise read "still not hidden, nothing to
// do" and let the stale hide animation run to completion right out from
// under the show they just asked for.
const linkVisibilityTargetHidden = new Map();

function nextLinkVisibilityAnimationToken(panelId) {
  const token = (linkVisibilityAnimationTokens.get(panelId) ?? 0) + 1;
  linkVisibilityAnimationTokens.set(panelId, token);
  return token;
}

// Reinstates panelState's own persisted width (desktop preset/manual
// resize) exactly the way createPanelElement applies it on first render --
// a no-op when this panel has no persisted width of its own (pure
// CSS-driven sizing, left alone). Shared by animateLinkedPanelShow's own
// finish and clearLinkedPartnersHiding, both of which can leave a panel
// with no inline width override at all (plain CSS clamp()) unless this
// runs to put a persisted one back.
function reapplyPersistedPanelWidth(panel, panelState) {
  if (!panelState.width) return;
  const renderedWidth = desktopLikePanels()
    ? Math.min(panelState.width, maximumPanelWidth())
    : panelState.width;
  applyPanelWidth(panel, renderedWidth, mobileLayout.matches && !desktopLikePanels());
}

// Shared cleanup for both animateLinkedPanelHide/Show below: drops the
// transition class and every inline style it drove, and -- once no other
// panel in this same track is still mid-transition -- lets the track's
// own scroll-snap/scroll-behavior resume (mirrors collapsePanel's own
// identical "am I the last one" check for .removing-panel).
function finishLinkVisibilityTransition(panel) {
  panel.classList.remove("panel-link-visibility-transition");
  panel.style.removeProperty("flex-basis");
  panel.style.removeProperty("width");
  panel.style.removeProperty("margin-inline-end");
  panel.style.removeProperty("opacity");
  panel.style.removeProperty("transform");
  if (!panelTrack.querySelector(".panel-link-visibility-transition")) {
    panelTrack.classList.remove("link-visibility-changing");
  }
}

// Collapses panelState's own panel to zero width while sliding it
// offsetPx toward whichever panel's toggle triggered this and fading it
// out, then actually hides it (see .panel-link-visibility-transition in
// styles.css for the shared before/after property list, and
// collapsePanel's own near-identical shrink-to-zero technique this
// mirrors). Every neighbor sharing this same flex row reflows into the
// gap for free, continuously, as the width transition runs -- no separate
// FLIP pass needed for them.
function animateLinkedPanelHide(panelState, offsetPx) {
  const elements = panelElements.get(panelState.id);
  if (!elements) return false;
  const panel = elements.panel;
  const width = panel.getBoundingClientRect().width;
  if (!width) return false;
  const gap = Number.parseFloat(getComputedStyle(panelTrack).columnGap) || 0;
  const token = nextLinkVisibilityAnimationToken(panelState.id);
  panel.style.setProperty("flex-basis", `${width}px`, "important");
  panel.style.setProperty("width", `${width}px`, "important");
  panel.style.marginInlineEnd = "0px";
  panel.style.opacity = "1";
  panel.style.transform = "translateX(0px)";
  panelTrack.classList.add("link-visibility-changing");
  panel.getBoundingClientRect();
  panel.classList.add("panel-link-visibility-transition");
  panel.style.setProperty("flex-basis", "0px", "important");
  panel.style.setProperty("width", "0px", "important");
  panel.style.marginInlineEnd = `${-gap}px`;
  panel.style.opacity = "0";
  panel.style.transform = `translateX(${offsetPx}px)`;

  let finished = false;
  const onTransitionEnd = (event) => {
    if (event.target === panel && event.propertyName === "flex-basis") finish();
  };
  const finish = () => {
    if (finished || linkVisibilityAnimationTokens.get(panelState.id) !== token) return;
    finished = true;
    panel.removeEventListener("transitionend", onTransitionEnd);
    panel.hidden = true;
    finishLinkVisibilityTransition(panel);
    // scheduleGroupRowHeightSync already ran once, synchronously, back
    // when this whole toggle started (see applyLinkedPartnersVisibility)
    // -- its own rAF fires long before this 300ms+ collapse actually
    // finishes, so it measured this panel's own verse rows mid-shrink.
    // That's harmless for a panel on its way to fully hidden (nothing
    // downstream cares what its rows measured at partway through), but
    // running it again now, against the settled post-hide layout, keeps
    // the group's own row heights (and every member's scroll position --
    // see restoreVerseAnchor) correct rather than left keyed off a
    // transient in-between measurement.
    scheduleGroupRowHeightSync(panelState.linkGroupId);
  };
  // Explicitly removed once finish() actually runs (rather than relying on
  // { once: true }) -- opacity's own shorter 240ms duration would otherwise
  // fire transitionend first and consume a { once: true } listener before
  // flex-basis's own (300ms, the property finish() actually keys off) ever
  // gets a turn, on a panel a reader can hide/show many times over a
  // session rather than once like a removed panel's own identical listener
  // (see collapsePanel) never has to worry about.
  panel.addEventListener("transitionend", onTransitionEnd);
  window.setTimeout(finish, 460);
  return true;
}

// Reverse of animateLinkedPanelHide: reveals panelState's own panel already
// pinned at zero width/opacity, offset offsetPx toward the panel whose
// toggle triggered this (so it visually grows back out from that
// direction), then grows it to its own real width while fading and
// sliding back to rest. The target width comes from this panel's own
// persisted width (desktop preset/manual resize) when it has one, or
// (when it doesn't -- pure CSS-driven sizing) from its own computed
// flex-basis, which -- because .bible-panel is flex-shrink: 0 -- already
// equals its true rendered width and, unlike getBoundingClientRect,
// resolves correctly even while still display: none (see this function's
// own first steps below).
function animateLinkedPanelShow(panelState, offsetPx) {
  const elements = panelElements.get(panelState.id);
  if (!elements) return false;
  const panel = elements.panel;
  const gap = Number.parseFloat(getComputedStyle(panelTrack).columnGap) || 0;
  panel.hidden = false;
  const targetWidth = panelState.width
    ? (desktopLikePanels() ? Math.min(panelState.width, maximumPanelWidth()) : panelState.width)
    : Number.parseFloat(getComputedStyle(panel).flexBasis) || 320;
  const important = Boolean(panelState.width) && mobileLayout.matches && !desktopLikePanels();
  const token = nextLinkVisibilityAnimationToken(panelState.id);
  panel.style.setProperty("flex-basis", "0px", "important");
  panel.style.setProperty("width", "0px", "important");
  panel.style.marginInlineEnd = `${-gap}px`;
  panel.style.opacity = "0";
  panel.style.transform = `translateX(${offsetPx}px)`;
  panelTrack.classList.add("link-visibility-changing");
  panel.getBoundingClientRect();
  panel.classList.add("panel-link-visibility-transition");
  panel.style.setProperty("flex-basis", `${targetWidth}px`, "important");
  panel.style.setProperty("width", `${targetWidth}px`, important ? "important" : "");
  panel.style.marginInlineEnd = "0px";
  panel.style.opacity = "1";
  panel.style.transform = "translateX(0px)";

  let finished = false;
  const onTransitionEnd = (event) => {
    if (event.target === panel && event.propertyName === "flex-basis") finish();
  };
  const finish = () => {
    if (finished || linkVisibilityAnimationTokens.get(panelState.id) !== token) return;
    finished = true;
    panel.removeEventListener("transitionend", onTransitionEnd);
    finishLinkVisibilityTransition(panel);
    // The transition above always pins flex-basis/width with !important
    // (needed to keep the 0 -> target animation itself animatable), which
    // would otherwise permanently shadow this panel's own real sizing rule
    // once settled -- reapplies it exactly the way createPanelElement and
    // every desktop-width-changing path already do, or (a panel with no
    // persisted width of its own) drops back to plain CSS-driven sizing.
    reapplyPersistedPanelWidth(panel, panelState);
    // Same reasoning as animateLinkedPanelHide's own identical call --
    // the sync scheduled back when this toggle started measured this
    // panel's verse rows while it was still mid-grow (nowhere near its
    // real width yet); re-running it now against the fully-revealed
    // panel keeps the group's row heights and scroll anchors correct.
    scheduleGroupRowHeightSync(panelState.linkGroupId);
  };
  panel.addEventListener("transitionend", onTransitionEnd);
  window.setTimeout(finish, 460);
  return true;
}

// The single source of truth for every panel's own on-screen visibility
// and toggle glyph within a link group -- re-run after *any* membership
// change (a new panel joining via linkToPanel, one leaving via unlinkPanel
// or removePanel) as well as every actual click, so a group that gains or
// loses a member while one of its toggles is active stays consistent
// instead of leaving a stray panel permanently shown or hidden.
// centerPanelId (only ever passed by toggleLinkedPartnersVisibility, the
// actual click) is whichever panel's own toggle triggered this -- every
// other member's slide-toward/away-from direction (see
// animateLinkedPanelHide/Show above) is which side of it they sit on.
// Left null for every other call site (linkToPanel/unlinkPanel/
// removePanel folding a membership change into an already-hiding or
// now-revealed group) -- those are incidental consequences of a different
// action, not a reader's own hide/show click, so they still apply
// instantly, same as before this animation existed at all.
function applyLinkedPartnersVisibility(groupId, { centerPanelId = null } = {}) {
  if (groupId == null) return;
  // Captures every member's own verse anchor against the layout as it is
  // right now, before any panel.hidden flips below -- removePanel's own
  // group-shrinks-but-survives branch already does exactly this ahead of
  // its own call here, but a plain hide/show click went straight to
  // toggling hidden with no anchor of its own, leaning entirely on
  // whichever panel's own actionBarResizeObserver happens to fire in
  // response (a member with a study tool active, whose real height goes
  // to and from 0 the instant it's hidden/shown, always does) to notice
  // the layout changed at all and schedule this itself -- by the time
  // that fires, the "before" moment this needs to anchor against is
  // already gone, and every scroll position downstream of it is racing
  // against whatever it captures instead. Same effect, just guaranteed
  // regardless of whether anything else happens to trigger it.
  scheduleGroupRowHeightSync(groupId);
  const members = state.panels.filter((panel) => panel.linkGroupId === groupId);
  const hiding = members.some((panel) => hidingLinkedPartners.has(panel.id));
  const centerIndex = centerPanelId == null ? -1 : state.panels.findIndex((panel) => panel.id === centerPanelId);
  let activeInitiator = null;
  for (const panel of members) {
    const elements = panelElements.get(panel.id);
    if (!elements) continue;
    const isInitiator = hidingLinkedPartners.has(panel.id);
    if (isInitiator) activeInitiator = panel;
    const shouldHide = hiding && !isInitiator;
    const wasHidden = linkVisibilityTargetHidden.has(panel.id)
      ? linkVisibilityTargetHidden.get(panel.id)
      : elements.panel.hidden;
    linkVisibilityTargetHidden.set(panel.id, shouldHide);
    const stateChanged = shouldHide !== wasHidden;
    if (stateChanged && centerIndex >= 0 && !reducedMotion.matches) {
      const offsetPx = state.panels.indexOf(panel) < centerIndex ? LINK_VISIBILITY_SLIDE_OFFSET : -LINK_VISIBILITY_SLIDE_OFFSET;
      const animated = shouldHide
        ? animateLinkedPanelHide(panel, offsetPx)
        : animateLinkedPanelShow(panel, offsetPx);
      if (!animated) elements.panel.hidden = shouldHide;
    } else if (stateChanged) {
      elements.panel.hidden = shouldHide;
    }
    const arrows = isInitiator ? LINK_VISIBILITY_ARROWS.hidden : LINK_VISIBILITY_ARROWS.shown;
    elements.linkVisibilityToggle.querySelector(".panel-link-visibility-arrow-left").setAttribute("d", arrows.left);
    elements.linkVisibilityToggle.querySelector(".panel-link-visibility-arrow-right").setAttribute("d", arrows.right);
    elements.linkVisibilityToggle.setAttribute("aria-pressed", String(isInitiator));
    elements.linkVisibilityToggle.setAttribute("aria-label", isInitiator ? "Show linked panels" : "Hide linked panels");
  }
  // The reader's own "active" panel (see setActivePanel) can end up one of
  // the ones just hidden -- global keyboard shortcuts and the like still
  // route through activePanelId regardless, so it's moved to whichever
  // panel is actually still visible instead of silently pointing at
  // nothing on screen.
  if (hiding && activeInitiator) {
    const activeMember = members.find((panel) => panel.id === activePanelId);
    if (activeMember && !hidingLinkedPartners.has(activeMember.id)) setActivePanel(activeInitiator.id);
  }
}

function toggleLinkedPartnersVisibility(panelState) {
  if (panelState.linkGroupId == null) return;
  if (hidingLinkedPartners.has(panelState.id)) hidingLinkedPartners.delete(panelState.id);
  else hidingLinkedPartners.add(panelState.id);
  applyLinkedPartnersVisibility(panelState.linkGroupId, { centerPanelId: panelState.id });
}

// Guarantees panelState itself is never left behind mid-hidden and never
// keeps a stale "I'm hiding my partners" flag once it's no longer part of
// a group at all (see updateLinkModeControls, unlinkPanel, removePanel) --
// without this, leaving a group while its own toggle was active would
// strand every partner hidden with no toggle left anywhere to reveal them.
function clearLinkedPartnersHiding(panelState) {
  const elements = panelElements.get(panelState.id);
  if (elements) {
    // Invalidates any hide/show animation still in flight on this exact
    // panel (see animateLinkedPanelHide/Show's own token check) -- without
    // this, that animation's own deferred finish() could still land after
    // the synchronous reset below and silently re-hide (or leave
    // mid-transition inline styles on) a panel this call means to show
    // plainly and immediately.
    nextLinkVisibilityAnimationToken(panelState.id);
    finishLinkVisibilityTransition(elements.panel);
    elements.panel.hidden = false;
    reapplyPersistedPanelWidth(elements.panel, panelState);
  }
  linkVisibilityTargetHidden.set(panelState.id, false);
  hidingLinkedPartners.delete(panelState.id);
}

// Scroll events fire asynchronously (not within the same call stack as
// the scrollTop assignment below), so a simple before/after flag can't
// tell a partner's own *echo* of this sync apart from a genuine scroll a
// reader just made on that panel -- comparing against the exact value we
// last set it to (within rounding) can, regardless of when the event
// actually lands.
const groupScrollSyncTarget = new Map();

function syncGroupScroll(sourcePanelState, scrollTop) {
  for (const partner of linkGroupPartners(sourcePanelState)) {
    const elements = panelElements.get(partner.id);
    if (!elements) continue;
    groupScrollSyncTarget.set(partner.id, scrollTop);
    elements.content.scrollTop = scrollTop;
  }
}

// A panel's own local UI nudges (see revealVerseAboveActions) fire real
// "scroll" events on .panel-content exactly like a reader's own scroll
// gesture would, and groupScrollSyncTarget above only ever catches a
// sync's own single, exact final value -- not a whole smooth-scroll
// animation's worth of intermediate positions along the way. A count
// (not a plain flag) so two overlapping nudges on the same panel -- a
// second verse tapped before the first one's own smooth scroll has
// settled -- don't let the first one's cleanup re-enable syncing while
// the second is still mid-flight.
const suppressedGroupScrollSyncCounts = new Map();

function isSuppressingGroupScrollSync(id) {
  return (suppressedGroupScrollSyncCounts.get(id) ?? 0) > 0;
}

function beginSuppressingGroupScrollSync(id) {
  suppressedGroupScrollSyncCounts.set(id, (suppressedGroupScrollSyncCounts.get(id) ?? 0) + 1);
}

function endSuppressingGroupScrollSync(id) {
  const count = suppressedGroupScrollSyncCounts.get(id) ?? 0;
  if (count <= 1) suppressedGroupScrollSyncCounts.delete(id);
  else suppressedGroupScrollSyncCounts.set(id, count - 1);
}

// Linked panels can each show a different set of translations (see
// linkToPanel's own comment), so the *same* verse can naturally need a
// different amount of vertical space in each one -- left alone, that
// would leave the same verse sitting on a different line in each panel's
// own independent scroll, breaking both the "same row" guarantee and the
// scroll sync above (which is just "copy scrollTop," and only lines up
// this way if every row up to that point took up the exact same height in
// both). Pins every linked panel's own row for a given verse to whichever
// one of them actually needs the most room for it, so cumulative height
// up to any verse -- and so scroll position -- stays identical across the
// whole group.
function equalizeGroupRowHeights(groupId) {
  if (groupId == null) return;
  const members = state.panels.filter((panel) => panel.linkGroupId === groupId);
  if (members.length < 2) return;
  const rowSets = [];
  for (const panelState of members) {
    const elements = panelElements.get(panelState.id);
    if (!elements) continue;
    rowSets.push(elements.content.querySelectorAll(".verse-group[data-verse]"));
  }
  // Cleared before any height is read back -- otherwise a stale min-height
  // from a previous pass (now too tall or too short for the current
  // translations/font size) would get baked into this pass's own "natural"
  // measurement instead of a fresh one.
  for (const rows of rowSets) {
    for (const row of rows) row.style.removeProperty("min-height");
  }
  const maxHeightByVerse = new Map();
  for (const rows of rowSets) {
    for (const row of rows) {
      const verse = row.dataset.verse;
      const height = row.getBoundingClientRect().height;
      if (!maxHeightByVerse.has(verse) || height > maxHeightByVerse.get(verse)) {
        maxHeightByVerse.set(verse, height);
      }
    }
  }
  // A member currently showing STR/TSK has no rows of its own to measure
  // above (a study tool replaces its whole panel -- see renderPanelBody) --
  // its own frozenRowHeights snapshot, captured there the instant it
  // switched away from plain text, still counts toward each verse's max
  // here instead. Without this, the other linked panels' own rows would
  // shrink (and visibly jump/rescroll) the moment this one stopped
  // contributing, even though nothing about their own content changed.
  for (const panelState of members) {
    const frozen = panelState.frozenRowHeights;
    if (!panelState.activeStudyTool || !frozen || frozen.book !== panelState.book || frozen.chapter !== panelState.chapter) {
      continue;
    }
    for (const [verse, height] of Object.entries(frozen.heights)) {
      if (!maxHeightByVerse.has(verse) || height > maxHeightByVerse.get(verse)) {
        maxHeightByVerse.set(verse, height);
      }
    }
  }
  for (const rows of rowSets) {
    for (const row of rows) {
      const max = maxHeightByVerse.get(row.dataset.verse);
      if (max) row.style.minHeight = `${max}px`;
    }
  }
}

// A linked group's own translation-chip row (.panel-translation-controls,
// holding the "+" picker and .panel-translation-list) can end up taller in
// one panel than another -- most commonly, one panel's chips overflow into
// a horizontal scrollbar the others don't need yet. Since .panel-header
// sits above .panel-content in each panel's own grid (see .bible-panel's
// grid-template-rows: auto 1fr auto), a taller header pushes that one
// panel's .panel-content down on screen relative to its siblings, even
// though scrollTop and each verse row's own height (see
// equalizeGroupRowHeights) both stay perfectly in sync -- the same verse
// ends up visibly offset between panels by exactly that difference.
function equalizeGroupHeaderHeights(groupId) {
  if (groupId == null) return;
  const members = state.panels.filter((panel) => panel.linkGroupId === groupId);
  if (members.length < 2) return;
  const rows = [];
  for (const panelState of members) {
    const row = panelElements.get(panelState.id)?.panel.querySelector(".panel-translation-controls");
    if (row) rows.push(row);
  }
  // Cleared before any height is read back -- same reasoning as
  // equalizeGroupRowHeights's own clear-before-measure pass.
  for (const row of rows) row.style.removeProperty("min-height");
  let max = 0;
  for (const row of rows) {
    const height = row.getBoundingClientRect().height;
    if (height > max) max = height;
  }
  for (const row of rows) row.style.minHeight = `${max}px`;
}

// A panel that just left a link group (or whose group just dissolved down
// to a single leftover panel -- see the remaining.length === 1 branches in
// removePanel/unlinkPanel) needs its own last-applied row/header min-
// heights wiped: those were sized to match a partner that's no longer
// there to keep measuring against, and unlike a still-≥2-member group,
// nothing will ever call equalizeGroupRowHeights for it again to clear or
// replace them itself.
function clearPanelRowHeightOverrides(panelState) {
  const elements = panelElements.get(panelState.id);
  if (!elements) return;
  for (const row of elements.content.querySelectorAll(".verse-group[data-verse]")) {
    row.style.removeProperty("min-height");
  }
  elements.panel.querySelector(".panel-translation-controls")?.style.removeProperty("min-height");
}

// equalizeGroupRowHeights above can just have changed a solo-translation
// row's own height to match a taller partner (say, a verse that wraps to
// two lines in a linked plain-text panel, stretching this one's own NOTE-
// only row to match) -- finalizeVerseNoteIconPlacement's inline-vs-below
// choice for that row was already made against its own *un*-stretched
// height at render time, so it needs re-deciding now that the row's real,
// final height has actually landed.
function refinalizeGroupNoteIcons(groupId) {
  for (const panel of state.panels) {
    if (panel.linkGroupId !== groupId) continue;
    const elements = panelElements.get(panel.id);
    if (!elements) continue;
    const enabledCount = enabledTranslationIds(panel).length;
    for (const icon of elements.content.querySelectorAll(".verse-note-icon")) {
      finalizeVerseNoteIconPlacement(icon, enabledCount);
    }
  }
}

// Coalesces however many times a group's rows change in one tick (each
// linked panel's own render calls this once) into a single measure-and-
// apply pass, run once the browser has actually laid out this tick's
// changes rather than mid-way through them.
//
// equalizeGroupRowHeights's own min-height pass can shift *every* member's
// scroll position, not just whichever panel actually triggered it (see its
// own comment) -- including members that never re-rendered at all (their
// rows are the same elements, just given a new min-height). A plain re-
// render's own anchor restore (see captureVerseAnchor/restoreVerseAnchor in
// renderPanelBody) only ever covers the panel that actually re-rendered,
// and even then only up to the point *this* deferred pass runs, so both
// the panel that changed (e.g. gained or lost a translation) and every
// panel just along for the ride need their own on-screen position
// snapshotted now, before the min-heights below ever move anything, and
// restored once they've settled.
//
// That snapshot is taken here, inside the rAF callback -- not eagerly at
// the first scheduling call -- deliberately: a chapter change fans out to
// every linked partner (see goToPassage), each navigating (and re-
// rendering, and scrolling itself to its own target verse) independently
// across an await boundary. The very first of those renders is what
// reaches this function and schedules the rAF in the first place, at
// which point a partner still mid-navigation hasn't re-rendered yet --
// snapshotting it right then would freeze in its stale, pre-navigation
// layout instead of the fresh one this same navigation is about to give
// it. Every one of those cascaded renders finishes (this is still all
// plain async/await, no rAF involved) well before the browser's next
// paint, so waiting until here to snapshot sees each member's own
// final, settled state for this navigation.
const pendingGroupRowHeightSync = new Set();
function scheduleGroupRowHeightSync(groupId) {
  if (groupId == null || pendingGroupRowHeightSync.has(groupId)) return;
  pendingGroupRowHeightSync.add(groupId);
  requestAnimationFrame(() => {
    pendingGroupRowHeightSync.delete(groupId);
    const anchors = [];
    for (const panel of state.panels) {
      if (panel.linkGroupId !== groupId) continue;
      const elements = panelElements.get(panel.id);
      if (!elements) continue;
      anchors.push({ content: elements.content, anchor: captureVerseAnchor(elements.content, panel) });
    }
    equalizeGroupHeaderHeights(groupId);
    equalizeGroupRowHeights(groupId);
    refinalizeGroupNoteIcons(groupId);
    for (const { content, anchor } of anchors) restoreVerseAnchor(content, anchor);
  });
}

function updateLinkModeControls(panelState) {
  const elements = panelElements.get(panelState.id);
  if (!elements) return;
  const active = panelState.linkGroupId != null;
  elements.linkModeToggle.classList.toggle("selected", active);
  elements.linkModeToggle.setAttribute("aria-pressed", String(active));
  // Phone portrait only ever shows one panel at a time (see
  // forcePhonePortraitOnePanel) -- linking two side-by-side panels means
  // nothing there even with several open in state, same blanket rule the
  // old dedicated header slot's own CSS media-query gate used to enforce.
  // Otherwise: already linked always stays clickable (that's how unlinking
  // happens -- see toggleLinkMode); not yet linked just can't be reading
  // mode's own single-panel flow at the same time (see
  // singleReadableTranslation's own linkGroupId check for the reverse
  // direction, and enterLinkPicking's own reading-mode exclusion for why a
  // panel already reading can't be picked as a target either). A second
  // panel to actually link with doesn't need to exist yet -- entering
  // link-picking with only one panel open still works, since the add-panel
  // button itself becomes "add a new panel and link with it" the moment
  // picking starts (see linkToNewPanel).
  elements.linkModeToggle.disabled = phonePortraitLayout.matches
    || (!active && panelState.readingMode);
  elements.linkVisibilityControl.hidden = !active;
  // No longer linked -- there's no group left for this panel's own toggle
  // to be hiding, and if it still had that flag set (or partners still
  // hidden from an earlier click), both need clearing so nothing is left
  // permanently hidden with no toggle left to reveal it.
  if (!active) clearLinkedPartnersHiding(panelState);
}

// The link icon's own click is exactly the reading-mode toggle's own
// on/off click mechanism (see toggleReadingMode), just with a different
// meaning for "on": already linked, a click unlinks outright (nothing
// left to choose); not yet linked, a click starts picking mode instead
// (see enterLinkPicking) rather than turning "on" by itself, since a link
// always needs a second panel to name.
function toggleLinkMode(panelState) {
  if (panelState.linkGroupId != null) unlinkPanel(panelState);
  else enterLinkPicking(panelState);
}

function updateTranslationNameToggleControls(panelState) {
  const elements = panelElements.get(panelState.id);
  if (!elements) return;
  const shown = Boolean(panelState.translationNamesShown);
  elements.translationNameToggle.classList.toggle("selected", shown);
  elements.translationNameToggle.setAttribute("aria-pressed", String(shown));
}

// Purely a per-panel display preference -- toggling it never touches
// enabledTranslations or anything a linked partner shares (see
// linkGroupPartners), just this one panel's own translation-line labels
// (see buildTranslationLinesInto).
function toggleTranslationNamesShown(panelState) {
  panelState.translationNamesShown = !panelState.translationNamesShown;
  updateTranslationNameToggleControls(panelState);
  saveState();
  renderPanelBody(panelState);
}

// The "..." popup replacing the reading-mode/link-mode icons' old
// dedicated, count-gated header slots (see the panel template) -- one
// small menu holding both, plus the translation-name toggle, always the
// same size as the "..." button itself. Mirrors the translation-picker
// menu's own open/close mechanics (outside-pointerdown/Escape-closes,
// temporarily lifting .panel-translation-controls' own overflow: hidden --
// see .panel-more-menu-open in styles.css and setupDialogTranslationControl's
// own "open"/"close" for the pattern this follows) -- just scoped to one
// open panel at a time, the same way move/link-picking are scoped to one
// pending target (see openPanelMoreMenuId's own declaration up top).
function closePanelMoreMenu() {
  if (openPanelMoreMenuId == null) return;
  const elements = panelElements.get(openPanelMoreMenuId);
  openPanelMoreMenuId = null;
  if (!elements) return;
  elements.moreMenu.hidden = true;
  elements.moreToggle.setAttribute("aria-expanded", "false");
  elements.moreToggle.closest(".panel-translation-controls")?.classList.remove("panel-more-menu-open");
}

function togglePanelMoreMenu(panelState) {
  if (openPanelMoreMenuId === panelState.id) {
    closePanelMoreMenu();
    return;
  }
  closePanelMoreMenu();
  const elements = panelElements.get(panelState.id);
  if (!elements) return;
  openPanelMoreMenuId = panelState.id;
  elements.moreMenu.hidden = false;
  elements.moreToggle.setAttribute("aria-expanded", "true");
  elements.moreToggle.closest(".panel-translation-controls")?.classList.add("panel-more-menu-open");
}

document.addEventListener(
  "pointerdown",
  (event) => {
    if (openPanelMoreMenuId == null) return;
    const elements = panelElements.get(openPanelMoreMenuId);
    if (elements && elements.moreControl.contains(event.target)) return;
    closePanelMoreMenu();
    shieldOutsidePress(event);
  },
  true,
);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && openPanelMoreMenuId != null) closePanelMoreMenu();
});

// Mirrors enterMovePicking exactly (blurred overlay on every visible
// panel, global header collapsed to just add-panel + cancel) -- the one
// difference (see the loop below) is that the panel which started picking
// is excluded from the overlay: it isn't a valid target for itself.
function enterLinkPicking(sourcePanelState) {
  pendingLinkSource = sourcePanelState;
  document.documentElement.classList.add("link-picking-active");
  cancelLinkPickingButton.hidden = false;
  for (const panel of state.panels) {
    const elements = panelElements.get(panel.id);
    if (!elements) continue;
    elements.linkOverlay.hidden = panel.id === sourcePanelState.id;
    // A panel currently in reading mode isn't a valid link target (see
    // singleReadableTranslation's own linkGroupId check for why linking
    // and reading mode are mutually exclusive) -- still shown blurred like
    // every other non-source panel, but with no arrow icon and no click
    // reaction, rather than looking identically pickable and only failing
    // silently inside linkToPanel once tapped.
    elements.linkOverlay.disabled = panel.id !== sourcePanelState.id && panel.readingMode;
  }
}

function exitLinkPicking() {
  if (!pendingLinkSource) return;
  pendingLinkSource = null;
  document.documentElement.classList.remove("link-picking-active");
  cancelLinkPickingButton.hidden = true;
  for (const elements of panelElements.values()) {
    elements.linkOverlay.hidden = true;
    elements.linkOverlay.disabled = false;
  }
}

// Links pendingLinkSource with targetPanelState: joins the target's own
// group if it already has one (extending it -- this is how a group grows
// past two panels, see linkGroupPartners), or starts a brand new one
// otherwise. The target's own current passage wins for the whole
// resulting group -- linking is "go follow that panel (and whatever
// group it's already part of)," not the other way around.
function linkToPanel(targetPanelState) {
  if (!pendingLinkSource || !targetPanelState || targetPanelState === pendingLinkSource) return;
  const sourcePanelState = pendingLinkSource;
  exitLinkPicking();
  const groupId = targetPanelState.linkGroupId ?? ++linkGroupIdCounter;
  sourcePanelState.linkGroupId = groupId;
  targetPanelState.linkGroupId = groupId;
  updateLinkModeControls(sourcePanelState);
  updateLinkModeControls(targetPanelState);
  // Reading mode's own eligibility also depends on linkGroupId (see
  // singleReadableTranslation) -- renderPanelBody would re-sync this on
  // its own eventually, but only for whichever of these two panels (if
  // either) goToPassage below actually navigates; a target already
  // sitting on the source's passage never re-renders at all, leaving its
  // reading-mode toggle stuck showing enabled a moment after it stopped
  // being clickable.
  updateReadingModeControls(sourcePanelState);
  updateReadingModeControls(targetPanelState);
  setActivePanel(sourcePanelState.id);
  goToPassage(
    sourcePanelState,
    { book: targetPanelState.book, chapter: targetPanelState.chapter, verse: targetPanelState.verse },
    { record: true },
  );
  scheduleGroupRowHeightSync(groupId);
  // Extending an existing group whose toggle is already hiding everyone
  // but its own initiator (see toggleLinkedPartnersVisibility) should hide
  // this newly joined panel too, rather than leaving it as the one visible
  // exception to a rule the rest of the group is already following.
  applyLinkedPartnersVisibility(groupId);
}

function linkToNewPanel() {
  if (!pendingLinkSource) return;
  linkToPanel(addPanel());
}

// Leaves panelState's own group -- if that drops the group to a single
// remaining panel, that panel's own link stops meaning anything too (a
// "group" of one is just an unlinked panel), so it's cleared alongside.
function unlinkPanel(panelState) {
  const groupId = panelState.linkGroupId;
  if (groupId == null) return;
  panelState.linkGroupId = null;
  updateLinkModeControls(panelState);
  // Mirrors linkToPanel's own pair of calls -- this panel may now be
  // reading-mode eligible again (see singleReadableTranslation), and
  // nothing else here is guaranteed to trigger a re-render that would
  // otherwise notice.
  updateReadingModeControls(panelState);
  clearPanelRowHeightOverrides(panelState);
  const remaining = state.panels.filter((other) => other.linkGroupId === groupId);
  if (remaining.length === 1) {
    remaining[0].linkGroupId = null;
    updateLinkModeControls(remaining[0]);
    updateReadingModeControls(remaining[0]);
    // The lone survivor's own min-heights were last sized to match
    // whichever partner(s) it was just linked with -- with the group gone,
    // nothing will ever recompute (or clear) them for it again.
    clearPanelRowHeightOverrides(remaining[0]);
  } else if (remaining.length >= 2) {
    // Mirrors removePanel's own equivalent branch: the survivors' spacing
    // was last computed including this panel's rows, so it needs to shrink
    // back down to fit only the group members actually left behind.
    scheduleGroupRowHeightSync(groupId);
    // If the panel that just left was the one hiding the rest of the group
    // (see toggleLinkedPartnersVisibility), its own flag is already gone
    // (updateLinkModeControls above cleared it) but the survivors are still
    // sitting there hidden -- this is what actually reveals them again.
    applyLinkedPartnersVisibility(groupId);
  }
  setActivePanel(activePanelId);
  saveState();
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && pendingLinkSource) exitLinkPicking();
});

// Hebrew/Greek have no per-verse "text" field like the modern translations
// (see getChapter) -- this reconstructs an equivalent plain string per verse
// from the interlinear tokens (just the original-language word forms, space
// joined) so the copy builders below can treat it exactly like any other
// translation. Only called when the copy dialog's version list actually
// includes an original-language id.
async function getInterlinearVerseTextMap(bookIndex, chapter) {
  const data = await getInterlinearChapter(bookIndex, chapter);
  return new Map(data.v.map(([verse, tokens]) => [verse, tokens.map((token) => token[0]).join(" ")]));
}

// What actually gets copied: the dialog's own range row can only ever
// display copyStartVerse..copyEndVerse (its own comment on
// openCopyDialog explains why -- no field for "these specific verses,
// skipping some"), but a selection made in individual mode with gaps
// should still copy just the verses that were actually picked, not
// everything between the first and last of them. copySelectedVerseNumbers
// (set alongside copyStartVerse/copyEndVerse in openCopyDialog/
// openCopyDialogForVerse) is exactly that original pick; it's only used
// here while it still matches the *current* book/chapter/start/end --
// editing any of those combos means the reader now wants that literal
// range instead, and there's no way to express the old gaps through them
// once touched, so this quietly falls back to the plain start-end span.
function copyEffectiveVerseNumbers() {
  if (
    copySelectedVerseNumbers
    && copySelectedVerseNumbersBook === copyBook
    && copySelectedVerseNumbersChapter === copyChapter
    && copySelectedVerseNumbers[0] === copyStartVerse
    && copySelectedVerseNumbers.at(-1) === copyEndVerse
  ) {
    return copySelectedVerseNumbers;
  }
  return Array.from({ length: copyEndVerse - copyStartVerse + 1 }, (_, index) => copyStartVerse + index);
}

function buildCopyText(translations, order, originalTextByVerse) {
  const selectedVerses = copyEffectiveVerseNumbers();
  const selected = new Set(selectedVerses);
  const book = manifest.books[copyBook];
  const verses = copyChapterDataCache.v.filter(([verse]) => selected.has(verse));
  const lines = [];
  const bookNameFor = (translation) =>
    translationLanguage(translation) === "en" ? book.en : book.ko;
  const range = formatVerseReference(copyChapter, selectedVerses);
  const textFor = (texts, verse, translation) =>
    ORIGINAL_LANGUAGE_IDS.includes(translation) ? originalTextByVerse?.get(verse) : texts[translation];

  if (order === "translation") {
    for (const translation of translations) {
      lines.push(`${bookNameFor(translation)} ${range}, ${translationMeta(translation).label}`);
      for (const [verse, texts] of verses) {
        const text = textFor(texts, verse, translation);
        if (text) lines.push(`${verse} ${text}`);
      }
      lines.push("");
    }
  } else {
    const bookName = bookNameFor(translations[0]);
    const translationNames = translations.map((translation) => translationMeta(translation).label).join("-");
    lines.push(`${bookName} ${range}, ${translationNames}`);
    for (const [verse, texts] of verses) {
      for (const translation of translations) {
        const text = textFor(texts, verse, translation);
        if (text) lines.push(`${verse} ${text}`);
      }
      // With only one version there's nothing to visually separate within
      // a verse's own block, so skip the blank line and keep verses back
      // to back; multi-version blocks still get one to set them apart.
      if (translations.length > 1) lines.push("");
    }
  }
  return lines.join("\n").trim();
}

// Mirrors buildReadingCopyBody's own {verse, text} shape for a single
// chapter, so the reading-mode-on branch of copySelectedVerses can reuse
// that exact same prose-building function instead of a parallel one.
function buildReadingStyleVersesForTranslation(translation, originalTextByVerse) {
  const selectedVerses = copyEffectiveVerseNumbers();
  const selected = new Set(selectedVerses);
  const textFor = (texts, verse) =>
    ORIGINAL_LANGUAGE_IDS.includes(translation) ? originalTextByVerse?.get(verse) : texts[translation];
  return copyChapterDataCache.v
    .filter(([verse]) => selected.has(verse))
    .map(([verse, texts]) => ({ verse, text: textFor(texts, verse) || "" }));
}

// The reading-mode-on counterpart to buildCopyText: always one flowing-
// prose block per version (there's no verse-by-verse interleaving of
// continuous prose), reusing buildReadingCopyBody for the body itself --
// per explicit request, copying this way with two-plus versions selected
// always reads as "version by version", never interleaved.
function buildReadingStyleCopyText(translations, numbering, originalTextByVerse) {
  const selectedVerses = copyEffectiveVerseNumbers();
  const book = manifest.books[copyBook];
  const bookNameFor = (translation) =>
    translationLanguage(translation) === "en" ? book.en : book.ko;
  const range = formatVerseReference(copyChapter, selectedVerses);
  const start = { chapter: copyChapter, verse: copyStartVerse };
  const end = { chapter: copyChapter, verse: copyEndVerse };
  const lines = [];
  for (const translation of translations) {
    lines.push(`${bookNameFor(translation)} ${range}, ${translationMeta(translation).label}`);
    const chapters = [{ chapter: copyChapter, verses: buildReadingStyleVersesForTranslation(translation, originalTextByVerse) }];
    const body = buildReadingCopyBody(chapters, start, end, numbering);
    if (body) lines.push(body);
    lines.push("");
  }
  return lines.join("\n").trim();
}

async function writeClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard access was denied.");
}

async function copySelectedVerses() {
  if (!copyPanelState) return;
  const translations = [...copyTranslationOrder];
  if (!translations.length) {
    copyStatus.textContent = "Select a version.";
    return;
  }
  const originalId = translations.find((id) => ORIGINAL_LANGUAGE_IDS.includes(id));
  const originalTextByVerse = originalId
    ? await getInterlinearVerseTextMap(copyBook, copyChapter)
    : null;
  const text = copyReadingModeOn
    ? buildReadingStyleCopyText(translations, copyReadingNumbering === "on", originalTextByVerse)
    : buildCopyText(translations, copyOrder, originalTextByVerse);
  try {
    await writeClipboard(text);
    copyStatus.textContent = "Copied";
    const copiedPanelState = copyPanelState;
    if (copiedPanelState) clearPanelSelection(copiedPanelState);
    window.setTimeout(closeCopyDialog, 450);
  } catch (error) {
    copyStatus.textContent = error.message;
  }
}

function appendLookupField(container, label, value, { lang } = {}) {
  if (!value) return;
  const block = document.createElement("div");
  block.className = "lookup-entry";
  const labelEl = document.createElement("div");
  labelEl.className = "lookup-label";
  labelEl.textContent = label;
  const valueEl = document.createElement("p");
  valueEl.className = "lookup-value";
  if (lang) valueEl.lang = lang;
  valueEl.textContent = value;
  block.append(labelEl, valueEl);
  container.append(block);
}

// Like appendLookupField, but for the "Original Word" field specifically:
// Bible Hub sits at the trailing edge of its own value row rather than a
// separate row of its own -- its hidden/href state is already managed by
// the caller (showEntry's own entry-loaded branch), so re-appending the
// same link element here each time just moves it into the new field set.
function appendOriginalWordField(container, value, biblehubLink, { lang } = {}) {
  if (!value) return;
  const block = document.createElement("div");
  block.className = "lookup-entry lookup-original-word-entry";
  const labelEl = document.createElement("div");
  labelEl.className = "lookup-label";
  labelEl.textContent = "Original Word";
  const valueRow = document.createElement("div");
  valueRow.className = "lookup-original-word-row";
  const valueEl = document.createElement("p");
  valueEl.className = "lookup-value";
  if (lang) valueEl.lang = lang;
  valueEl.textContent = value;
  valueRow.append(valueEl, biblehubLink);
  block.append(labelEl, valueRow);
  container.append(block);
}

// Matches Strong's codes as they appear in derivation text (e.g. "G1615",
// "H08012" -- Hebrew codes here are sometimes padded to 5 digits, unlike
// this app's own 4-digit-padded data keys, hence the normalize step below).
const STRONGS_CODE_RE = /([GH])(\d{1,6})/g;

function normalizeStrongsCode(letter, digits) {
  return `${letter}${String(Number(digits)).padStart(4, "0")}`;
}

// Word Origin and Definition text often reference other Strong's codes
// ("from G1537 and G5055"); wrap each as a button that reopens this same
// dialog for that code, so following a reference doesn't require a fresh
// word click.
function appendStrongsLinkedField(container, label, value, lang, onCodeClick = openStrongsDialogForCode) {
  if (!value) return;
  const block = document.createElement("div");
  block.className = "lookup-entry";
  const labelEl = document.createElement("div");
  labelEl.className = "lookup-label";
  labelEl.textContent = label;
  const valueEl = document.createElement("p");
  valueEl.className = "lookup-value";
  if (lang) valueEl.lang = lang;
  STRONGS_CODE_RE.lastIndex = 0;
  let lastIndex = 0;
  let match;
  while ((match = STRONGS_CODE_RE.exec(value))) {
    if (match.index > lastIndex) valueEl.append(document.createTextNode(value.slice(lastIndex, match.index)));
    const code = normalizeStrongsCode(match[1], match[2]);
    const link = document.createElement("button");
    link.type = "button";
    link.className = "lookup-strongs-link";
    link.textContent = match[0];
    link.addEventListener("click", () => onCodeClick(code));
    valueEl.append(link);
    lastIndex = match.index + match[0].length;
  }
  valueEl.append(document.createTextNode(value.slice(lastIndex)));
  block.append(labelEl, valueEl);
  container.append(block);
}

function showLookupEmpty(container, message) {
  container.replaceChildren();
  const empty = document.createElement("p");
  empty.className = "lookup-empty";
  empty.textContent = message;
  container.append(empty);
}

// Keeps the TSK/search/word-dictionary dialogs the same height as the
// reading panel behind them. Re-run on window resize while one is open,
// since the panel's own height is viewport-dependent. Skipped on mobile/
// touch layouts, where these dialogs go edge-to-edge full screen instead
// (see the mobile @media rules) -- matching panel height there would leave
// a gap rather than true full screen.
function syncDialogHeightToPanel(dialogEl) {
  if (mobileLayout.matches) {
    dialogEl.style.removeProperty("height");
    dialogEl.style.removeProperty("max-height");
    const shell = dialogEl.querySelector(".lookup-shell, .search-shell");
    shell?.style.removeProperty("height");
    shell?.style.removeProperty("max-height");
    return;
  }
  const panel = panelElements.get(activePanelId)?.panel ?? document.querySelector(".bible-panel");
  const height = panel?.getBoundingClientRect().height;
  if (!height) return;
  dialogEl.style.height = `${height}px`;
  dialogEl.style.maxHeight = `${height}px`;
  const shell = dialogEl.querySelector(".lookup-shell, .search-shell");
  if (shell) {
    shell.style.height = `${height}px`;
    shell.style.maxHeight = `${height}px`;
  }
}

window.addEventListener("resize", () => {
  if (searchDialog.open) syncDialogHeightToPanel(searchDialog);
  if (tskDialog.open) syncDialogHeightToPanel(tskDialog);
  if (strongsDialog.open) syncDialogHeightToPanel(strongsDialog);
  if (highlightListDialog.open) syncDialogHeightToPanel(highlightListDialog);
  if (bookmarkListDialog.open) syncDialogHeightToPanel(bookmarkListDialog);
  if (noteListDialog.open) syncDialogHeightToPanel(noteListDialog);
  if (infoDialog.open) {
    syncDialogHeightToPanel(infoDialog);
    alignInfoIcons();
  }
});

// Shared by the two ways this dialog gets its content: clicking an
// interlinear word (word has book/chapter context via panelState, plus its
// own verse, for the Morphology toggle's default) and clicking a Strong's-code
// link inside a Word Origin field (just the code -- there's no clicked
// instance, so the Morphology toggle has nothing to default to and stays
// disabled).
// e.g. "H0430" -> https://biblehub.com/hebrew/430.htm -- Bible Hub keys its
// per-number pages by the plain number, no letter prefix or zero-padding.
function biblehubUrl(code) {
  const language = code[0] === "H" ? "hebrew" : "greek";
  return `https://biblehub.com/${language}/${Number(code.slice(1))}.htm`;
}

function strongsCodeFromParts(lang, number) {
  return `${lang}${String(number).padStart(4, "0")}`;
}

// A small single-select dropdown styled like the translation picker's own
// menu (see .translation-picker-menu) instead of a native <select>, so
// picking Hebrew/Greek reads consistently with the rest of the dialog.
const STRONGS_LANG_LABEL = { H: "Hebrew", G: "Greek" };
let strongsLangCurrent = "H";

function strongsLangValue() {
  return strongsLangCurrent;
}

// Un-padded ("1 - 5624") on mobile, where the code field is sized to fit
// exactly this shorter text (see the mobile .strongs-nav-number-wrap
// override) instead of the desktop field's own, more spelled-out
// "0001 - 5624".
function strongsCodePlaceholder(lang) {
  const max = STRONGS_MAX_NUMBER[lang];
  return mobileLayout.matches ? `1 - ${max}` : `0001 - ${max}`;
}

function setStrongsLangValue(lang) {
  strongsLangCurrent = lang;
  strongsLangToggleLabel.textContent = STRONGS_LANG_LABEL[lang];
  strongsNavNumber.placeholder = strongsCodePlaceholder(lang);
  for (const option of strongsLangMenu.querySelectorAll(".strongs-lang-option")) {
    const selected = option.dataset.lang === lang;
    option.classList.toggle("selected", selected);
    option.setAttribute("aria-selected", String(selected));
  }
}

// Keeps the placeholder text in the right format if the layout crosses
// the mobile breakpoint (e.g. rotating a tablet) while the dialog is open.
mobileLayout.addEventListener("change", () => {
  strongsNavNumber.placeholder = strongsCodePlaceholder(strongsLangValue());
});

function openStrongsLangMenu() {
  if (!strongsLangMenu.hidden) return;
  strongsLangMenu.hidden = false;
  strongsLangToggle.setAttribute("aria-expanded", "true");
}

function closeStrongsLangMenu() {
  if (strongsLangMenu.hidden) return;
  strongsLangMenu.hidden = true;
  strongsLangToggle.setAttribute("aria-expanded", "false");
}

strongsLangToggle.addEventListener("click", () => {
  if (strongsLangMenu.hidden) openStrongsLangMenu();
  else closeStrongsLangMenu();
});

strongsLangMenu.querySelectorAll(".strongs-lang-option").forEach((option) => {
  option.addEventListener("click", () => {
    setStrongsLangValue(option.dataset.lang);
    closeStrongsLangMenu();
  });
});

document.addEventListener("pointerdown", (event) => {
  if (strongsLangMenu.hidden || strongsLangPicker.contains(event.target)) return;
  closeStrongsLangMenu();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !strongsLangMenu.hidden) closeStrongsLangMenu();
});

// Keeps the language picker, number field, and transliteration field all in
// sync with whichever word is currently loaded, so an arbitrary jump via
// the search button always continues from where the dialog actually is
// rather than whatever was last typed -- and clicking a different
// interlinear word (or paging through history) doesn't leave the previous
// word's own spelling sitting in the transliteration field.
async function updateStrongsNav(word) {
  const lang = word.strongs ? word.strongs[0] : (word.lang === "he" ? "H" : "G");
  const number = word.strongs ? Number(word.strongs.slice(1)) : null;
  setStrongsLangValue(lang);
  strongsNavNumber.value = number ?? "";
  if (!word.strongs) {
    setStrongsEnglishCommitted("");
    return;
  }
  const entries = await getStrongsData().catch(() => ({}));
  const entry = entries[word.strongs];
  setStrongsEnglishCommitted(entry?.translit ?? "");
}

// The search button reads the language/number fields live (rather than the
// word that was last rendered), so switching the language picker or editing
// the number always wins over whatever was loaded before.
function goToStrongsNavNumber(number) {
  const lang = strongsLangValue();
  const clamped = Math.min(Math.max(1, number), STRONGS_MAX_NUMBER[lang]);
  openStrongsDialogForCode(strongsCodeFromParts(lang, clamped));
}

// Clears whatever code was last loaded so typing a new one never requires
// manually deleting the old value first; the placeholder (this language's
// own range, see setStrongsLangValue) shows through immediately after. If
// the field is left empty -- clicked into, then clicked away from without
// typing anything -- the cleared value quietly reappears on blur instead
// of staying blank.
let strongsNavNumberBeforeFocus = "";
strongsNavNumber.addEventListener("focus", () => {
  strongsNavNumberBeforeFocus = strongsNavNumber.value;
  strongsNavNumber.value = "";
});
strongsNavNumber.addEventListener("blur", () => {
  if (!strongsNavNumber.value) {
    strongsNavNumber.value = strongsNavNumberBeforeFocus;
    return;
  }
  // A fully-typed code, once you click away, fills the transliteration
  // field in with this language's own word for it -- the mirror image of
  // the transliteration field auto-filling this one (see
  // renderStrongsSuggestions below).
  fillStrongsEnglishFromCode();
});
strongsNavNumber.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  strongsNavSearch.click();
});

async function fillStrongsEnglishFromCode() {
  const lang = strongsLangValue();
  const number = Number(strongsNavNumber.value);
  if (!number) return;
  const clamped = Math.min(Math.max(1, number), STRONGS_MAX_NUMBER[lang]);
  const entries = await getStrongsData().catch(() => ({}));
  const entry = entries[strongsCodeFromParts(lang, clamped)];
  if (entry?.translit) setStrongsEnglishCommitted(entry.translit);
}

// The only diacritics this app's own Bible Hub-style transliteration ever
// uses (see bible_hub_translit in scripts/export_strongs.py): "é"/"ó" for
// Greek eta/omega, and an apostrophe/backtick marking a Hebrew aleph/ayin.
// None of those are things you'd know to type (or can type at all, for
// the accents) on a plain keyboard, so they're folded away for matching
// purposes only -- the suggestion list and the committed input value
// still show the real spelling.
const STRONGS_SEARCH_KEY_FOLD = { é: "e", ó: "o", "'": "", "’": "", "`": "" };
function strongsSearchKey(text) {
  return text.toLocaleLowerCase().replace(/[éó'’`]/g, (ch) => STRONGS_SEARCH_KEY_FOLD[ch]);
}

// Builds a per-language, alphabetically-sorted {code, lemma, translit}
// list from the same data the dictionary fields use (see getStrongsData),
// so typing a transliteration can be matched/autocompleted without a
// second fetch.
let strongsTranslitIndexPromise = null;
// Same clear-the-memo-and-rethrow-on-failure treatment as getStrongsData
// (which this itself now surfaces if that fetch failed) -- otherwise this
// index's own cache would stay locked onto an empty result forever too,
// independent of getStrongsData ever recovering.
function getStrongsTranslitIndex() {
  if (!strongsTranslitIndexPromise) {
    strongsTranslitIndexPromise = getStrongsData().then((entries) => {
      const index = { H: [], G: [] };
      for (const code in entries) {
        const { lemma, translit } = entries[code];
        if (!translit) continue;
        index[code[0]].push({ code, lemma, translit, key: strongsSearchKey(translit) });
      }
      index.H.sort((a, b) => a.key.localeCompare(b.key));
      index.G.sort((a, b) => a.key.localeCompare(b.key));
      return index;
    }).catch((error) => {
      strongsTranslitIndexPromise = null;
      throw error;
    });
  }
  return strongsTranslitIndexPromise;
}

// Transliteration field: typing searches by Roman-letter spelling instead
// of by number. strongsEnglishCommitted is the value that quietly
// reappears if the field is focused (which clears it, ready to type a
// fresh search) and then left again without finishing a new one -- same
// pattern as strongsNavNumberBeforeFocus above, just named for what it
// holds here, since a suggestion click or an exact-match keystroke (not
// only blur) can also move it forward.
const STRONGS_SUGGESTION_LIMIT = 30;
let strongsEnglishCommitted = "";
let strongsSuggestionItems = [];
let strongsSuggestionHighlighted = -1;
let strongsSuggestionPointerActive = false;

function setStrongsEnglishCommitted(value) {
  strongsEnglishCommitted = value;
  strongsNavEnglish.value = value;
}

function resetStrongsSuggestionsPosition() {
  strongsNavSuggestions.style.removeProperty("left");
  strongsNavSuggestions.style.removeProperty("right");
  strongsNavSuggestions.style.removeProperty("width");
}

// On mobile the transliteration field is packed in alongside four other
// controls (history arrows, language picker, code field, search), so it's
// much narrower than a suggestion like "H6513 Purah" needs -- widen the
// dropdown out to the whole nav row's own bounds instead (mirrors
// setupCombobox's positionMenu, which re-anchors the book combo's dropdown
// to .panel-selectors for the same reason). Desktop has plenty of room in
// the field itself, so this is a no-op there.
function positionStrongsSuggestions() {
  if (!mobileLayout.matches) {
    resetStrongsSuggestionsPosition();
    return;
  }
  const wrapRect = strongsNavEnglishWrap.getBoundingClientRect();
  const navRect = strongsNav.getBoundingClientRect();
  if (!wrapRect.width || !navRect.width) return;
  strongsNavSuggestions.style.left = `${Math.round(navRect.left - wrapRect.left)}px`;
  strongsNavSuggestions.style.right = "auto";
  strongsNavSuggestions.style.width = `${Math.floor(navRect.width)}px`;
}

function closeStrongsSuggestions() {
  strongsNavSuggestions.hidden = true;
  strongsNavSuggestions.replaceChildren();
  strongsSuggestionItems = [];
  strongsSuggestionHighlighted = -1;
  resetStrongsSuggestionsPosition();
}

function updateStrongsSuggestionHighlight() {
  strongsNavSuggestions.querySelectorAll(".strongs-nav-suggestion-option").forEach((option, index) => {
    option.classList.toggle("highlighted", index === strongsSuggestionHighlighted);
  });
}

function chooseStrongsSuggestion(item) {
  setStrongsEnglishCommitted(item.translit);
  strongsNavNumber.value = String(Number(item.code.slice(1)));
  closeStrongsSuggestions();
}

// Suggestions are filtered to the currently-selected language (see
// strongsLangValue) -- typing "pu" while Greek is selected only offers
// Greek words, e.g. an "H0000 pual"-style Hebrew match never shows up
// until Hebrew is picked.
async function renderStrongsSuggestions(query) {
  const trimmed = strongsSearchKey(query.trim());
  if (!trimmed) {
    closeStrongsSuggestions();
    return;
  }
  const index = await getStrongsTranslitIndex().catch(() => ({ H: [], G: [] }));
  if (strongsSearchKey(strongsNavEnglish.value.trim()) !== trimmed) return; // superseded by a later keystroke
  const matches = index[strongsLangValue()].filter((item) => item.key.startsWith(trimmed));
  strongsSuggestionItems = matches.slice(0, STRONGS_SUGGESTION_LIMIT);
  strongsNavSuggestions.replaceChildren();
  if (!strongsSuggestionItems.length) {
    closeStrongsSuggestions();
    return;
  }
  strongsSuggestionHighlighted = 0;
  for (const [index, item] of strongsSuggestionItems.entries()) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "strongs-nav-suggestion-option";
    option.setAttribute("role", "option");
    if (index === 0) option.classList.add("highlighted");
    const code = document.createElement("span");
    code.className = "strongs-nav-suggestion-code";
    code.textContent = item.code;
    const lemma = document.createElement("span");
    lemma.className = "strongs-nav-suggestion-lemma";
    lemma.lang = item.code[0] === "H" ? "he" : "grc";
    lemma.textContent = item.lemma;
    const translitWord = document.createElement("span");
    translitWord.className = "strongs-nav-suggestion-word";
    translitWord.textContent = item.translit;
    option.append(code, lemma, translitWord);
    // Keeps focus on the input through the click (no default mousedown
    // focus-shift to the button), so the blur handler below never fires
    // and restores the pre-edit value out from under this selection.
    option.addEventListener("mousedown", (event) => event.preventDefault());
    option.addEventListener("click", () => chooseStrongsSuggestion(item));
    strongsNavSuggestions.append(option);
  }
  positionStrongsSuggestions();
  strongsNavSuggestions.hidden = false;
  // Finishing an exact match commits it immediately -- no need to open
  // the list and click something already fully typed.
  const exact = strongsSuggestionItems.find((item) => item.key === trimmed);
  if (exact) {
    strongsEnglishCommitted = exact.translit;
    strongsNavNumber.value = String(Number(exact.code.slice(1)));
  }
}

strongsNavEnglish.addEventListener("focus", () => {
  strongsNavEnglish.value = "";
});
strongsNavEnglish.addEventListener("input", () => {
  renderStrongsSuggestions(strongsNavEnglish.value);
});
// Same reasoning as .strongs-nav-suggestion-option's own mousedown guard --
// without it, the mousedown's default focus-shift blurs the input first,
// which can restore strongsEnglishCommitted out from under this click
// before it ever runs.
strongsNavEnglishClear.addEventListener("mousedown", (event) => event.preventDefault());
strongsNavEnglishClear.addEventListener("click", () => {
  strongsNavEnglish.value = "";
  strongsNavEnglish.dispatchEvent(new Event("input", { bubbles: true }));
  strongsNavEnglish.focus();
});
strongsNavEnglish.addEventListener("blur", () => {
  window.setTimeout(() => {
    if (strongsSuggestionPointerActive) return;
    closeStrongsSuggestions();
    if (strongsNavEnglish.value.trim().toLocaleLowerCase() !== strongsEnglishCommitted.toLocaleLowerCase()) {
      strongsNavEnglish.value = strongsEnglishCommitted;
    }
  }, 100);
});
strongsNavEnglish.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (!strongsSuggestionItems.length) return;
    const direction = event.key === "ArrowDown" ? 1 : -1;
    strongsSuggestionHighlighted =
      (strongsSuggestionHighlighted + direction + strongsSuggestionItems.length) % strongsSuggestionItems.length;
    updateStrongsSuggestionHighlight();
  } else if (event.key === "Enter") {
    event.preventDefault();
    if (strongsSuggestionItems.length && strongsSuggestionHighlighted >= 0) {
      chooseStrongsSuggestion(strongsSuggestionItems[strongsSuggestionHighlighted]);
    }
    strongsNavSearch.click();
  } else if (event.key === "Escape") {
    closeStrongsSuggestions();
    strongsNavEnglish.value = strongsEnglishCommitted;
    strongsNavEnglish.blur();
  }
});
strongsNavSuggestions.addEventListener("pointerdown", () => {
  strongsSuggestionPointerActive = true;
  const release = () => {
    strongsSuggestionPointerActive = false;
    document.removeEventListener("pointerup", release, true);
  };
  document.addEventListener("pointerup", release, true);
});

// Either field alone is enough to search: the code field wins if it's
// filled in, otherwise an exact transliteration match (in the
// currently-selected language) is looked up -- matching the fields' own
// auto-fill of each other, so whichever one you actually finished typing
// already has (or resolves to) everything needed.
strongsNavSearch.addEventListener("click", async () => {
  const number = Number(strongsNavNumber.value);
  if (number) {
    goToStrongsNavNumber(number);
    return;
  }
  const query = strongsSearchKey(strongsNavEnglish.value.trim());
  if (!query) return;
  const index = await getStrongsTranslitIndex().catch(() => ({ H: [], G: [] }));
  const match = index[strongsLangValue()].find((item) => item.key === query);
  if (match) openStrongsDialogForCode(match.code);
});

// Mirrors the TSK/search dialogs' own back/forward history (see
// recordTskHistory/moveTskHistory) but for Strong's codes: the prev/next
// arrows page through every code this dialog has shown, not +/-1 on the
// loaded number -- jumping to an arbitrary code (via the language picker +
// number field + search button) is what those are for instead. One shared
// list of words (not word+panelState pairs -- there's no single "right"
// panel for an entry once it can be shown in any of several at once, so
// whichever pane or dialog is doing the paging always renders into
// itself, not wherever an entry originally came from): every embedded STR
// pane (see createEmbeddedStrongsTool) and this dialog all record into and
// page through the exact same history, whichever of them a given lookup
// happened in -- registerStrongsHistoryButtons is what keeps every one of
// their own prev/next arrows (not just this dialog's) in sync with it.
let strongsHistory = [];
let strongsHistoryIndex = -1;
const strongsHistoryButtonPairs = [];

function recordStrongsHistory(word) {
  const current = strongsHistoryIndex >= 0 ? strongsHistory[strongsHistoryIndex] : null;
  if (current && word.strongs && current.strongs === word.strongs) return;
  strongsHistory = strongsHistory.slice(0, strongsHistoryIndex + 1);
  strongsHistory.push(word);
  if (strongsHistory.length > 100) strongsHistory.shift();
  strongsHistoryIndex = strongsHistory.length - 1;
  updateStrongsHistoryButtons();
}

// Moves the shared position and returns the word landed on (or null if
// there's nowhere to move) -- rendering it is the caller's own job, since a
// dialog and an embedded pane each have their own render function.
function moveStrongsHistory(direction) {
  const nextIndex = strongsHistoryIndex + direction;
  if (nextIndex < 0 || nextIndex >= strongsHistory.length) return null;
  strongsHistoryIndex = nextIndex;
  updateStrongsHistoryButtons();
  return strongsHistory[nextIndex];
}

function updateStrongsHistoryButtons() {
  for (const { back, forward } of strongsHistoryButtonPairs) {
    back.disabled = strongsHistoryIndex <= 0;
    forward.disabled = strongsHistoryIndex < 0 || strongsHistoryIndex >= strongsHistory.length - 1;
  }
}

// Returns an unregister function -- a panel's own nav (unlike this
// dialog's, registered once below for the app's whole lifetime) needs one,
// since its buttons stop existing whenever that panel is removed.
function registerStrongsHistoryButtons(back, forward) {
  const pair = { back, forward };
  strongsHistoryButtonPairs.push(pair);
  back.disabled = strongsHistoryIndex <= 0;
  forward.disabled = strongsHistoryIndex < 0 || strongsHistoryIndex >= strongsHistory.length - 1;
  return () => {
    const index = strongsHistoryButtonPairs.indexOf(pair);
    if (index >= 0) strongsHistoryButtonPairs.splice(index, 1);
  };
}

registerStrongsHistoryButtons(strongsNavPrev, strongsNavNext);
strongsNavPrev.addEventListener("click", () => {
  const word = moveStrongsHistory(-1);
  if (word) renderStrongsDialog(word, activeOrFirstPanel(), { record: false });
});
strongsNavNext.addEventListener("click", () => {
  const word = moveStrongsHistory(1);
  if (word) renderStrongsDialog(word, activeOrFirstPanel(), { record: false });
});

async function renderStrongsDialog(word, panelState, { record = true } = {}) {
  if (record) recordStrongsHistory(word);
  strongsDialogTitle.textContent = "Strong's Concordance";
  updateStrongsNav(word);
  if (!word.strongs) {
    strongsBiblehubLink.hidden = true;
    setStrongsEnglishCommitted("");
    showLookupEmpty(strongsDialogBody, "No Strong's number for this word.");
    return;
  }
  showLookupEmpty(strongsDialogBody, "Loading…");
  // allSettled rather than all: either fetch failing used to leave this
  // stuck on "Loading…" forever (nothing else would ever retry it) --
  // one failing on its own now still lets the other's data show.
  const [entriesResult, concordanceResult] = await Promise.allSettled([
    getStrongsData(),
    getEnglishmansEntry(word.strongs),
  ]);
  if (!strongsDialog.open) return;
  const entries = entriesResult.status === "fulfilled" ? entriesResult.value : {};
  const concordance = concordanceResult.status === "fulfilled" ? concordanceResult.value : null;
  const entry = entries[word.strongs];
  setStrongsEnglishCommitted(entry?.translit ?? "");
  // Bible Hub only covers the classical (1890) Strong's numbers this
  // dictionary itself is keyed by -- STEPBible's own numbering goes well
  // beyond that (see the fallback below), and linking there for one of
  // those would 404, so it only shows once there's a real entry to match.
  strongsBiblehubLink.hidden = !entry;
  if (entry) strongsBiblehubLink.href = biblehubUrl(word.strongs);
  // A dedicated wrapper (rather than appending fields straight into
  // strongsDialogBody) keeps it down to exactly two children -- fields,
  // then the concordance section -- so #strongs-dialog-body can use the
  // same auto/1fr grid split as .lookup-shell to let the concordance
  // section grow to fill the rest of the dialog's height.
  const fields = document.createElement("div");
  fields.className = "word-dictionary-fields";
  if (entry) {
    appendOriginalWordField(fields, entry.lemma, strongsBiblehubLink, { lang: word.lang });
    appendLookupField(fields, "Transliteration", entry.translit);
    appendLookupField(fields, "KJV", entry.kjv);
    appendStrongsLinkedField(fields, "Word Origin", entry.derivation, word.lang);
    appendStrongsLinkedField(fields, "Definition", entry.def, word.lang);
    appendLookupField(fields, "Morphology", wordMorphologyDisplay(word));
  } else if (word.gloss || word.transliteration) {
    // STEPBible's interlinear tagging uses its own "Extended Strong's"
    // numbers for words the classical 1890 Strong's dictionary never
    // covered (proper nouns, rarer words, finer-grained verb forms, etc.),
    // so strongs-concordance.db has nothing under this code -- fall back
    // to what the interlinear tagging itself already gave us for this
    // word (see the token tuple in renderPanelBody/buildInterlinearWordRow)
    // instead of leaving the dialog looking empty.
    appendOriginalWordField(fields, word.original, strongsBiblehubLink, { lang: word.lang });
    appendLookupField(fields, "Transliteration", word.transliteration);
    appendLookupField(fields, "In This Verse", word.gloss);
    const note = document.createElement("p");
    note.className = "lookup-empty";
    note.textContent = `No Strong's Concordance entry for ${word.strongs} -- it's outside the classical 1-${STRONGS_MAX_NUMBER[word.strongs[0]]} numbering this dictionary covers.`;
    fields.append(note);
  } else {
    const empty = document.createElement("p");
    empty.className = "lookup-empty";
    empty.textContent = "No dictionary entry found.";
    fields.append(empty);
  }
  strongsDialogBody.replaceChildren(fields);
  strongsDialogBody.scrollTop = 0;
  await renderConcordanceSection(panelState, word, concordance);
}

// The merged dictionary popup: Strong's lexicon fields first, then the
// Englishman's concordance occurrences for the same Strong's code below.
async function openStrongsDialog(panelState) {
  const word = panelState.selectedWord;
  if (!word) return;
  strongsDialog.showModal();
  // showModal() auto-focuses the first focusable descendant when nothing
  // requests focus itself -- here that's the close button, which then
  // sits with a visible focus ring for no reason a user actually did.
  // Focusing the dialog itself (valid per spec while it's open) is a
  // neutral target with no such ring instead.
  strongsDialog.focus();
  syncDialogHeightToPanel(strongsDialog);
  await renderStrongsDialog(word, panelState);
}

// A Strong's code linked from inside a Word Origin field -- the dialog is
// already open, so this just swaps its content in place.
async function openStrongsDialogForCode(code) {
  await renderStrongsDialog(
    { strongs: code, original: code, lang: code.startsWith("H") ? "he" : "grc" },
    activeOrFirstPanel(),
  );
}

function closeStrongsDialog() {
  strongsDialog.close();
}

// Builds the Englishman's Concordance section: a title row (modal only --
// see renderConcordanceResults), and the results under it. side is only
// ever passed by an embedded caller (see createEmbeddedStrongsTool), so it
// doubles here as the signal for which of the two layouts to build. Every
// occurrence of this Strong's number always shows, regardless of the
// grammatical form of the word that was actually clicked -- there used to
// be a Morphology toggle here to narrow that down, but "does this verse use
// the same root word" is what this list is for, not "does it use the exact
// same inflected form."
async function renderConcordanceSection(panelState, word, concordance, container = strongsDialogBody, isStillWanted = () => strongsDialog.open, side) {
  const embedded = side !== undefined;
  const section = document.createElement("div");
  section.className = "word-concordance";
  container.append(section);

  if (!concordance || !concordance.occ.length) {
    showLookupEmpty(section, "No concordance entries found.");
    return;
  }

  let controls = null;
  if (!embedded) {
    controls = document.createElement("div");
    controls.className = "concordance-mode-control";
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", "Concordance grouping");
    const title = document.createElement("span");
    title.className = "concordance-mode-title";
    title.textContent = "Englishman's Concordance";
    controls.append(title);
  }

  const resultsContainer = document.createElement("div");
  resultsContainer.className = "concordance-results-slot";
  section.append(resultsContainer);

  await renderConcordanceResults(resultsContainer, concordance.occ, controls, word.lang, isStillWanted, panelState, side, word.strongs);
}

// Word-search-style master/detail, grouped by book instead of by anchor
// word: a left nav of "Book (count)" buttons, and a right column of
// search-result-style rows with the occurrence's own phrase highlighted in
// the KJV verse text.
// isStillWanted lets a caller bail out of a still-in-flight fetch once its
// own target container is no longer the live one to render into -- the
// modal dialog (the only caller until the embedded study-tool panes below)
// checks strongsDialog.open; an embedded pane checks container.isConnected
// instead, since it has no dialog to ask.
// header is the modal's own .concordance-mode-control row (see
// renderConcordanceSection) -- null when embedded, which has no controls
// row of its own to show early (see showHeaderOnly).
// code is the Strong's number being looked up (word.strongs) -- occurrences
// only carry the KJV/GAE rendering of each occurrence, not the original
// Greek/Hebrew text itself, so each result row's own original-language line
// (see buildConcordanceResultRow) is built separately here from each
// occurrence's chapter's own interlinear data instead, matched by this code.
async function renderConcordanceResults(container, occurrences, header, lang, isStillWanted = () => strongsDialog.open, panelState, side, code) {
  const embedded = side !== undefined;
  const showHeaderOnly = () => {
    if (header) container.prepend(header);
  };
  if (!isStillWanted()) return;
  if (!occurrences.length) {
    showLookupEmpty(container, "No occurrences for this form.");
    showHeaderOnly();
    return;
  }
  showLookupEmpty(container, "Loading…");
  showHeaderOnly();

  const chapterKeys = new Set();
  for (const [bookId, chapter] of occurrences) chapterKeys.add(`${bookId}:${chapter}`);
  // allSettled rather than all: a common word's concordance can span
  // hundreds of distinct chapters fetched at once, and any single one
  // hitting a transient network blip used to sink the whole batch,
  // leaving this stuck on "Loading…" forever. buildConcordanceResultRow
  // already handles a missing chaptersByKey/interlinearByKey entry
  // gracefully (its inline KJV/GAE/original-word preview just doesn't show
  // for that occurrence), so a failed chapter is simply left out rather
  // than blocking every other row.
  const [chapterSettled, interlinearSettled] = await Promise.all([
    Promise.allSettled(
      [...chapterKeys].map(async (key) => {
        const [bookId, chapter] = key.split(":").map(Number);
        return [key, await getChapter(bookId, chapter)];
      }),
    ),
    Promise.allSettled(
      [...chapterKeys].map(async (key) => {
        const [bookId, chapter] = key.split(":").map(Number);
        return [key, await getInterlinearChapter(bookId, chapter)];
      }),
    ),
  ]);
  if (!isStillWanted()) return;
  const chaptersByKey = new Map(
    chapterSettled.filter((result) => result.status === "fulfilled").map((result) => result.value),
  );
  const interlinearByKey = new Map(
    interlinearSettled.filter((result) => result.status === "fulfilled").map((result) => result.value),
  );

  // The source dataset's occurrence order isn't chapter/verse order within a
  // book (it's some cross-book concordance ordinal), so sort each group.
  const byBook = new Map();
  for (const occurrence of occurrences) {
    const bookId = occurrence[0];
    if (!byBook.has(bookId)) byBook.set(bookId, []);
    byBook.get(bookId).push(occurrence);
  }
  const bookIds = [...byBook.keys()].sort((a, b) => a - b);
  for (const bookOccurrences of byBook.values()) {
    bookOccurrences.sort((a, b) => a[1] - b[1] || a[2] - b[2]);
  }

  // The same Strong's-tagged word can occur more than once in one verse
  // (occurrences carries one entry per *word*, not per verse) -- grouped
  // here into one row per verse instead of one per word, so that verse
  // isn't listed twice; buildConcordanceResultRow shows every one of that
  // row's matches together instead (see its own comment).
  function groupByVerse(bookOccurrences) {
    const order = [];
    const byVerse = new Map();
    for (const [bookId, chapter, verse, english, morphology, korean] of bookOccurrences) {
      const key = `${chapter}:${verse}`;
      let group = byVerse.get(key);
      if (!group) {
        group = { bookId, chapter, verse, matches: [] };
        byVerse.set(key, group);
        order.push(group);
      }
      group.matches.push({ english, korean });
    }
    return order;
  }

  const results = document.createElement("div");
  results.className = "concordance-results";
  const nav = document.createElement("div");
  nav.className = "concordance-nav";
  const list = document.createElement("div");
  list.className = "concordance-list";

  const total = document.createElement("div");
  total.className = "concordance-nav-total";
  const totalName = document.createElement("span");
  totalName.className = "concordance-nav-name";
  totalName.textContent = "Total";
  const totalCount = document.createElement("span");
  totalCount.className = "concordance-nav-count";
  totalCount.textContent = ` (${occurrences.length})`;
  total.append(totalName, totalCount);
  nav.append(total);

  for (const bookId of bookIds) {
    const bookOccurrences = byBook.get(bookId);
    const groupId = `concordance-book-${bookId}`;

    const navButton = document.createElement("button");
    navButton.type = "button";
    navButton.className = "concordance-nav-item";
    const name = document.createElement("span");
    name.className = "concordance-nav-name";
    name.textContent = manifest.books[bookId].en;
    const count = document.createElement("span");
    count.className = "concordance-nav-count";
    count.textContent = ` (${bookOccurrences.length})`;
    navButton.append(name, count);
    navButton.addEventListener("click", () => {
      list.querySelector(`[data-group-id="${groupId}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    nav.append(navButton);

    const group = document.createElement("section");
    group.className = "concordance-group";
    group.dataset.groupId = groupId;
    for (const verseGroup of groupByVerse(bookOccurrences)) {
      group.append(buildConcordanceResultRow(
        verseGroup.bookId, verseGroup.chapter, verseGroup.verse, verseGroup.matches,
        chaptersByKey, interlinearByKey, lang, panelState, side, code,
      ));
    }
    list.append(group);
  }

  if (embedded) {
    const navRow = document.createElement("div");
    navRow.className = "concordance-nav-row";
    navRow.append(nav);
    results.append(navRow, list);
  } else {
    results.append(header, nav, list);
  }
  container.replaceChildren(results);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// TSK's own anchor text (e.g. "Is the Lord's") routinely uses a plain
// straight apostrophe where the real KJV verse text has a curly one (e.g.
// "Is the LORD’S") -- matching either literal character as the needle's
// own apostrophe lets the two line up regardless of which style either
// side happens to use.
const APOSTROPHE_RE = /['‘’]/g;
const APOSTROPHE_CLASS = "['‘’]";

// Finds `needle` as whole word(s) in `text` -- a plain substring search
// would also match "me" inside "come"/"came"/"comest", "he" inside "the",
// and so on, so this requires a non-word boundary (or start/end of
// string) on both sides instead. \b is an ASCII-word-character boundary,
// meaningless (and never matching) around non-Latin scripts like Korean --
// see findPhraseMatch for that case instead.
//
// \b itself only fires at a transition between a word character and a
// non-word one (start/end of string counts as the non-word side) -- a
// needle that already ends (or starts) on punctuation, like a whole verse
// quoted up to its own closing period, has no such transition to find at
// that edge when it also happens to sit at the very start/end of `text`,
// so requiring \b there unconditionally made those anchors silently fail
// to match at all. Only asking for a boundary on the sides that actually
// end on a word character avoids that false negative without losing the
// original word-boundary guard where it's still needed.
function findWordMatch(text, needle) {
  if (!needle) return null;
  const escaped = escapeRegExp(needle).replace(APOSTROPHE_RE, APOSTROPHE_CLASS);
  const leadBoundary = /^\w/.test(needle) ? "\\b" : "";
  const trailBoundary = /\w$/.test(needle) ? "\\b" : "";
  const pattern = new RegExp(`${leadBoundary}${escaped}${trailBoundary}`, "i");
  const match = pattern.exec(text);
  return match ? [match.index, match.index + match[0].length] : null;
}

// Same idea as findWordMatch but a plain substring search -- for scripts
// (Korean's GAE text, here) where \b's ASCII-only definition of "word
// character" never brackets a real word boundary at all.
function findPhraseMatch(text, needle) {
  if (!needle) return null;
  const index = text.indexOf(needle);
  return index === -1 ? null : [index, index + needle.length];
}

// Highlights every occurrence of every phrase in `phrases` (each may be
// more than one word, e.g. "of Paul") within the fetched verse text --
// the same Strong's word occurring more than once in one verse (see
// buildConcordanceResultRow) means more than one phrase can need marking,
// and a repeated phrase needs every one of its own occurrences marked too,
// not just the first. exact selects a plain substring search (Korean's
// GAE text -- \b's ASCII-only definition of "word character" never
// brackets a real boundary there) over the default word-boundary match.
function appendWithHighlightAll(element, text, phrases, exact = false) {
  const ranges = [];
  for (const phrase of phrases) {
    const pattern = exact
      ? new RegExp(escapeRegExp(phrase), "g")
      : new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "gi");
    for (const match of text.matchAll(pattern)) {
      ranges.push([match.index, match.index + match[0].length]);
    }
  }
  if (!ranges.length) {
    element.textContent = text;
    return;
  }
  // Sorted and merged so two matches that overlap (or are simple repeats
  // of each other) don't double up on the same stretch of text.
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [ranges[0]];
  for (const [start, end] of ranges.slice(1)) {
    const last = merged[merged.length - 1];
    if (start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  let cursor = 0;
  for (const [start, end] of merged) {
    element.append(document.createTextNode(text.slice(cursor, start)));
    const span = document.createElement("span");
    span.className = "concordance-highlight";
    span.textContent = text.slice(start, end);
    element.append(span);
    cursor = end;
  }
  element.append(document.createTextNode(text.slice(cursor)));
}

// Expands the abbreviated grammar code shown next to a concordance
// reference (e.g. "V-Qal-Perf", "Adj-NMP") into a full phrase for the
// morphology popup -- see toggleMorphologyPopup. Hebrew codes are this
// app's own Bible-Hub-style conversion of the KJV module's numeric
// Strong's morphology numbers (see hebrew_grammar_display in
// scripts/build_englishmans_concordance.py). Greek codes are converted
// from Robinson's own tagging to Bible Hub's display convention right
// here (see toBibleHubGreekCode) -- the two use the same letters for
// everything, but in a different order, and Bible Hub spells out
// multi-letter part-of-speech prefixes ("Adj", "PPro", ...) where
// Robinson's raw tagging uses a single letter.
const GREEK_POS_ABBREV = {
  N: "N", A: "Adj", T: "Art", D: "DPro", P: "PPro", S: "PPro", K: "IPro", I: "IPro", X: "IPro",
  R: "RelPro", C: "RecPro", F: "RefPro", Q: "IPro", V: "V", ADV: "Adv", PREP: "Prep", CONJ: "Conj",
  PRT: "Prtcl", INJ: "I", COND: "Prtcl", ARAM: "Aram", HEB: "Heb",
};
const GREEK_POS_NAMES = {
  N: "Noun", Adj: "Adjective", Art: "Article", DPro: "Demonstrative Pronoun", PPro: "Personal/Possessive Pronoun",
  IPro: "Interrogative/Indefinite Pronoun", RelPro: "Relative Pronoun", RecPro: "Reciprocal Pronoun",
  RefPro: "Reflexive Pronoun", V: "Verb", Adv: "Adverb", Prep: "Preposition", Conj: "Conjunction",
  Prtcl: "Particle", I: "Interjection", Aram: "Aramaic Word", Heb: "Hebrew Word",
};
// X (tense) and E/D/O/N/Q/X (voice) are Robinson's own less-common codes for
// deponent/impersonal/untagged forms -- verified letter-by-letter against
// live Robinson's-Morphological-Analysis-Codes pages (studybible.info/mac/...)
// for real occurrences of each: V-ADP-NSM ("middle Deponent"), V-AOI-3S
// ("passive depOnent"), V-PNI-3P ("middle or passive depoNent"), V-PEI-3S
// ("Either middle or passive"), V-PQI-3S ("Impersonal active"), V-PXI-1S
// ("no voice stated"), V-XXM-2S ("no tense stated (adverbial imperative)").
// Missing any one of these previously blanked the whole expansion down to
// just "Verb" (see the tenseName/moodName/voiceName guard below).
const GREEK_TENSE_NAMES = {
  P: "Present", I: "Imperfect", F: "Future", A: "Aorist", R: "Perfect", L: "Pluperfect",
  X: "No Tense Stated",
};
const GREEK_VOICE_NAMES = {
  A: "Active", M: "Middle", P: "Passive",
  E: "Either Middle or Passive", D: "Middle Deponent", O: "Passive Deponent",
  N: "Middle or Passive Deponent", Q: "Impersonal Active", X: "No Voice Stated",
};
const GREEK_MOOD_NAMES = { I: "Indicative", M: "Imperative", S: "Subjunctive", O: "Optative", N: "Infinitive", P: "Participle" };
const GREEK_CASE_NAMES = { N: "Nominative", G: "Genitive", D: "Dative", A: "Accusative", V: "Vocative" };
const GREEK_GENDER_NAMES = { M: "Masculine", F: "Feminine", N: "Neuter" };
const GREEK_PERSON_NAMES = { 1: "1st Person", 2: "2nd Person", 3: "3rd Person" };
const GREEK_NUMBER_NAMES = { S: "Singular", P: "Plural" };
const GREEK_DEGREE_NAMES = { C: "Comparative", S: "Superlative" };
// Robinson's tagging marks a handful of nominals that never decline at all
// (foreign proper names, numerals, transliterated letters, titles) with one
// of these suffixes instead of a case+gender+number block -- e.g. Δαυίδ is
// just "N-PRI", not "N-GMS", even where it functions as a genitive. These
// must never be run through the case+gender+number reorder/expansion below.
const GREEK_INDECLINABLE_NAMES = {
  PRI: "Proper Noun, Indeclinable",
  OI: "Numeral, Indeclinable",
  LI: "Letter, Indeclinable",
  TI: "Title, Indeclinable",
};

// Robinson's own raw tagging spells a verb's 2nd block [tense][voice][mood]
// and a nominal's (or a participle's own) case block [case][number][gender]
// -- Bible Hub always shows the last two of those swapped ([tense][mood]
// [voice], [case][gender][number]), confirmed directly against several
// live Bible Hub pages spanning verbs, participles, and adjectives. A
// personal/possessive pronoun's own case block also carries a person digit
// on Bible Hub (e.g. "PPro-GM3S") that Robinson's tagging doesn't capture
// at all (there's nothing to move -- it's just absent here).
function toBibleHubGreekCode(robinsonCode) {
  return robinsonCode
    .split(" ")
    .map((part) => {
      const [posRaw, ...rest] = part.split("-");
      const posMatch = /^(\d?)(.*)$/.exec(posRaw);
      const abbrev = GREEK_POS_ABBREV[posMatch[2]];
      if (!abbrev) return part;
      const newPart = [`${posMatch[1]}${abbrev}`];
      if (posMatch[2] === "V" && rest.length) {
        const tvm = /^(\d?)([A-Z])([A-Z])([A-Z])$/.exec(rest[0]);
        if (!tvm) return part;
        const [, irregular, tense, voice, mood] = tvm;
        newPart.push(`${irregular}${tense}${mood}${voice}`);
        if (rest[1] && GREEK_MOOD_NAMES[mood] === "Participle") {
          const cng = /^([A-Z])([A-Z])([A-Z])$/.exec(rest[1]);
          if (cng) newPart.push(`${cng[1]}${cng[3]}${cng[2]}`);
        } else if (rest[1]) {
          newPart.push(rest[1]);
        }
      } else if (rest.length) {
        if (GREEK_INDECLINABLE_NAMES[rest[0]]) {
          newPart.push(rest[0]);
        } else {
          const cng = /^([A-Z])([A-Z])([A-Z])$/.exec(rest[0]);
          newPart.push(cng ? `${cng[1]}${cng[3]}${cng[2]}` : rest[0]);
        }
        if (rest[1]) newPart.push(rest[1]);
      }
      return newPart.join("-");
    })
    .join(" ");
}

// A verb's 2nd block is [tense][mood][voice], its 3rd is case+gender+number
// for a participle, person+number for any other finite mood, or absent for
// an infinitive -- everything else (nominals, particles, etc.) is just a
// single case+gender+number block (or nothing, for an indeclinable word).
function expandGreekMorphologyPart(part) {
  const [posRaw, ...rest] = part.split("-");
  const posMatch = /^(\d?)(.*)$/.exec(posRaw);
  const posName = GREEK_POS_NAMES[posMatch[2]];
  if (!posName) return part;
  const segments = [posName];
  if (posMatch[2] === "V" && rest.length) {
    const tmv = /^(\d?)([A-Z])([A-Z])([A-Z])$/.exec(rest[0]);
    if (tmv) {
      const [, irregular, tense, mood, voice] = tmv;
      const tenseName = GREEK_TENSE_NAMES[tense];
      const moodName = GREEK_MOOD_NAMES[mood];
      const voiceName = GREEK_VOICE_NAMES[voice];
      if (tenseName && moodName && voiceName) {
        // Tense-Mood-Voice, matching Bible Hub's own phrasing exactly
        // (confirmed against several live pages, e.g. "Aorist Indicative
        // Active", "Present Participle Active") -- not Tense-Voice-Mood.
        segments.push(`${irregular ? `${irregular === "2" ? "2nd" : `${irregular}th`} ` : ""}${tenseName} ${moodName} ${voiceName}`);
        const trailing = rest[1];
        if (moodName === "Participle" && trailing) {
          const cgn = /^([A-Z])([A-Z])([A-Z])$/.exec(trailing);
          if (cgn) segments.push(expandGreekCaseGenderNumber(cgn[1], cgn[2], cgn[3]));
        } else if (moodName !== "Infinitive" && trailing) {
          const pn = /^(\d)([A-Z])$/.exec(trailing);
          if (pn) segments.push(`${GREEK_PERSON_NAMES[pn[1]]} ${GREEK_NUMBER_NAMES[pn[2]]}`);
        }
      }
    }
  } else if (rest.length) {
    if (GREEK_INDECLINABLE_NAMES[rest[0]]) {
      segments.push(GREEK_INDECLINABLE_NAMES[rest[0]]);
    } else {
      const cgn = /^([A-Z])([A-Z])([A-Z])$/.exec(rest[0]);
      if (cgn) segments.push(expandGreekCaseGenderNumber(cgn[1], cgn[2], cgn[3]));
    }
    if (rest[1] && GREEK_DEGREE_NAMES[rest[1]]) segments.push(GREEK_DEGREE_NAMES[rest[1]]);
  }
  return segments.join(" - ");
}

function expandGreekCaseGenderNumber(caseLetter, genderLetter, numberLetter) {
  return [GREEK_CASE_NAMES[caseLetter], GREEK_GENDER_NAMES[genderLetter], GREEK_NUMBER_NAMES[numberLetter]]
    .filter(Boolean)
    .join(" ");
}

const HEBREW_STEM_NAMES = { Qal: "Qal", Nifal: "Nifal", Piel: "Piel", Pual: "Pual", Hiphil: "Hiphil", Hophal: "Hophal", Hithpael: "Hithpael" };
const HEBREW_ASPECT_NAMES = {
  Perf: "Perfect", Imperf: "Imperfect", Imp: "Imperative", Inf: "Infinitive Construct",
  InfAbs: "Infinitive Absolute", Prtcpl: "Participle", "Prtcpl-Pass": "Participle (Passive)",
};

function expandHebrewMorphology(code) {
  const match = /^V-([A-Za-z]+)-([A-Za-z-]+)$/.exec(code);
  if (!match) return code;
  const stemName = HEBREW_STEM_NAMES[match[1]] ?? match[1];
  const aspectName = HEBREW_ASPECT_NAMES[match[2]] ?? match[2];
  return `Verb - ${stemName} - ${aspectName}`;
}

// STEPBible's own Hebrew/Aramaic morphology codes (its "TEHMC" scheme --
// see STEPBible-Data's "Morphology codes/TEHMC..." documentation and
// scripts/export_interlinear.py), decoded structurally the same way
// toBibleHubGreekCode/expandGreekMorphologyPart decode Robinson's Greek
// tagging, into the terms Bible Hub's own hebrewparse.htm uses. A code
// starts with its language letter (H=Hebrew, A=Aramaic); a word made of
// several morphemes (e.g. article+noun) strings them together with "/",
// dropping every morpheme's own language letter but the first (STEPBible's
// own documented convention) -- expandStepBibleHebrewMorphology re-fills it
// from the previous morpheme before decoding each one.
const HEBREW_STEM_LETTER_NAMES = {
  H: { q: "Qal", N: "Niphal", p: "Piel", P: "Pual", h: "Hiphil", H: "Hophal", t: "Hithpael", v: "Hishtaphel" },
  A: { a: "Aphel", e: "Shaphel", h: "Haphel", H: "Hophal", M: "Hitpaal", P: "Hitpeel", p: "Pael", Q: "Peil", q: "Peal", u: "Hitpael", v: "Ishtaphel" },
};
// Finite-form letters only -- Participle/Participle-passive ('r'/'s') and
// Infinitive ('a'=Absolute/'c'=Construct, disambiguated by there being no
// person-gender-number after it) are shaped too differently to share this
// table (see describeStepBibleHebrewVerb). Renamed to Bible Hub's own
// terms where they differ from STEPBible's ("Consecutive Perfect" is
// Bible Hub's "ConjPerf", confirmed against its own interlinear pages,
// e.g. Deu.6.5's וְאָהַבְתָּ).
const HEBREW_VERB_FORM_LETTER_NAMES = {
  p: "Perfect", q: "Conjunctive Perfect", n: "Imperfect", i: "Imperfect",
  j: "Jussive", c: "Cohortative", u: "Conjunctive Imperfect", w: "Consecutive Imperfect", v: "Imperative",
};
const HEBREW_PERSON_LETTER_NAMES = { 1: "First", 2: "Second", 3: "Third" };
// Verb person-gender-number spells "either gender" as "c"; every other use
// of a gender letter (nouns, pronouns, suffixes) spells it "b" instead --
// both are folded into this one table since neither position ever uses the
// other's letter for anything else.
const HEBREW_GENDER_LETTER_NAMES = { m: "Masculine", f: "Feminine", b: "Either gender", c: "Either gender" };
const HEBREW_NUMBER_LETTER_NAMES = { s: "Singular", p: "Plural", d: "Dual" };
const HEBREW_STATE_LETTER_NAMES = { a: "Absolute", c: "Construct", d: "Definite" };
const HEBREW_NOUN_SUBTYPE_LETTER_NAMES = { g: "Gentilic", t: "Title" };
const HEBREW_PROPER_NOUN_GENDER_LETTER_NAMES = { f: "Feminine", l: "Location", m: "Masculine", t: "Title" };
const HEBREW_ADJECTIVE_SUBTYPE_LETTER_NAMES = { c: "Numeral", o: "Ordinal" };
const HEBREW_PARTICLE_LETTER_NAMES = {
  a: "Article", d: "Article", c: "Conditional Particle", i: "Interrogative Particle",
  j: "Interjection", m: "Demonstrative", n: "Negative Particle", o: "Direct Object Marker", r: "Relative Particle",
};
const HEBREW_SUFFIX_FORM_LETTER_NAMES = { d: "Directional Suffix", h: "Paragogic He", n: "Paragogic Nun" };

function describeHebrewGenderNumberState(letters) {
  const [gender, number, state] = letters;
  return [HEBREW_GENDER_LETTER_NAMES[gender], HEBREW_NUMBER_LETTER_NAMES[number], HEBREW_STATE_LETTER_NAMES[state]]
    .filter(Boolean)
    .join(" ");
}

function describeHebrewPersonGenderNumber(letters) {
  const [person, gender, number] = letters;
  return [HEBREW_PERSON_LETTER_NAMES[person], HEBREW_GENDER_LETTER_NAMES[gender], HEBREW_NUMBER_LETTER_NAMES[number]]
    .filter(Boolean)
    .join(" ");
}

function describeStepBibleHebrewVerb(lang, rest) {
  const stemLetter = rest[0];
  const formLetter = rest[1];
  const tail = rest.slice(2);
  const stemName = HEBREW_STEM_LETTER_NAMES[lang]?.[stemLetter] ?? stemLetter;
  let formName;
  let pgn = "";
  if (formLetter === "r" || formLetter === "s") {
    formName = formLetter === "s" ? "Participle Passive" : "Participle";
    pgn = describeHebrewGenderNumberState(tail);
  } else if (tail.length === 1) {
    formName = formLetter === "a" ? "Infinitive Absolute" : "Infinitive Construct";
  } else {
    formName = HEBREW_VERB_FORM_LETTER_NAMES[formLetter] ?? formLetter;
    pgn = describeHebrewPersonGenderNumber(tail);
  }
  return ["Verb", stemName, formName, pgn].filter(Boolean).join(" - ");
}

function describeStepBibleHebrewNoun(rest) {
  const subtype = rest[0];
  if (subtype === "p") {
    return ["Proper Noun", HEBREW_PROPER_NOUN_GENDER_LETTER_NAMES[rest[1]]].filter(Boolean).join(" - ");
  }
  const qualifier = HEBREW_NOUN_SUBTYPE_LETTER_NAMES[subtype];
  const label = qualifier ? `Noun (${qualifier})` : "Noun";
  return [label, describeHebrewGenderNumberState(rest.slice(1))].filter(Boolean).join(" - ");
}

function describeStepBibleHebrewAdjective(rest) {
  const qualifier = HEBREW_ADJECTIVE_SUBTYPE_LETTER_NAMES[rest[0]];
  const label = qualifier ? `Adjective (${qualifier})` : "Adjective";
  return [label, describeHebrewGenderNumberState(rest.slice(1))].filter(Boolean).join(" - ");
}

function describeStepBibleHebrewPronoun(rest) {
  if (rest[0] !== "p") return "Interrogative Pronoun";
  return ["Pronoun", describeHebrewPersonGenderNumber(rest.slice(1))].filter(Boolean).join(" - ");
}

function describeStepBibleHebrewSuffix(rest) {
  if (rest[0] === "p") return ["Suffix", describeHebrewPersonGenderNumber(rest.slice(1))].filter(Boolean).join(" - ");
  return HEBREW_SUFFIX_FORM_LETTER_NAMES[rest] ?? "Suffix";
}

// One already-language-prefixed morpheme, e.g. "HVqp3ms" or "HTd".
function describeStepBibleHebrewMorpheme(code) {
  const lang = code[0];
  const func = code[1];
  const rest = code.slice(2);
  switch (func) {
    case "V": return describeStepBibleHebrewVerb(lang, rest);
    case "N": return describeStepBibleHebrewNoun(rest);
    case "A": return describeStepBibleHebrewAdjective(rest);
    case "T": return HEBREW_PARTICLE_LETTER_NAMES[rest] ?? code;
    case "P": return describeStepBibleHebrewPronoun(rest);
    case "S": return describeStepBibleHebrewSuffix(rest);
    case "C": return "Conjunction";
    case "c": return "Conjunction (Sequential)";
    case "D": return "Adverb";
    case "R": return rest === "d" ? "Preposition (Definite)" : "Preposition";
    default: return code;
  }
}

function expandStepBibleHebrewMorphology(code) {
  // Only the compound's very first morpheme ever carries the language
  // letter -- STEPBible's own documented convention drops it from every
  // later one, regardless of that morpheme's own function letter (which
  // can itself be "A", e.g. an Adjective segment following a Noun's). A
  // doubled "//" (a token merging two whole Hebrew words, not just one
  // word's own prefix/root/suffix) leaves an empty segment between them --
  // dropped rather than parsed, so it reads as one flat, same-language list.
  const parts = code.split("/").filter(Boolean);
  const lang = parts[0][0];
  return parts.map((part, i) => describeStepBibleHebrewMorpheme(i === 0 ? part : lang + part)).join(" / ");
}

function expandMorphologyCode(code, lang) {
  if (lang === "he") {
    return code[0] === "H" || code[0] === "A" ? expandStepBibleHebrewMorphology(code) : expandHebrewMorphology(code);
  }
  return code.split(" ").map(expandGreekMorphologyPart).join(" / ");
}

// The Strong's dialog's own Morphology field: this specific occurrence's
// in-context grammar (see the token tuple in buildInterlinearWordRow),
// expanded through the exact same toBibleHubGreekCode + expandMorphologyCode
// pipeline the Englishman's Concordance popup already uses (see
// toggleMorphologyPopup below), so both read a given code identically.
// toBibleHubGreekCode is a no-op on a Hebrew code (none of its patterns
// match STEPBible's or the old TH-derived scheme's letters), so routing
// every language through it here is safe.
// Reads "-" whenever there's no in-context grammar to show at all: the
// dialog was opened by number/search/Word-Origin-link rather than by
// clicking an interlinear word.
function wordMorphologyDisplay(word) {
  if (!word.morphology) return "-";
  return expandMorphologyCode(toBibleHubGreekCode(word.morphology), word.lang);
}


// One .search-match-line for either translation (see buildConcordanceResultRow
// below) -- KJV's own highlight stays word-boundary matching (English word
// breaks are meaningful, "he" inside "the" isn't a match); GAE's uses a
// plain substring instead, since \b's ASCII-only definition of "word
// character" never brackets a real boundary around Korean text at all.
// phrases is every distinct rendering this verse's own matches carry for
// this translation (see buildConcordanceResultRow's grouping) -- usually
// one, but the same Strong's word occurring more than once in one verse
// can translate differently each time, and every one of them should mark
// as matched, not just the first.
function buildConcordanceMatchLine(translation, langCode, text, phrases, exact) {
  const row = document.createElement("div");
  row.className = "search-match-line";
  row.style.setProperty("--translation-color", TRANSLATION_COLORS[translation]);
  const label = document.createElement("span");
  label.className = "search-match-label";
  label.lang = langCode;
  label.textContent = translationMeta(translation).label;
  const textEl = document.createElement("span");
  textEl.lang = langCode;
  appendWithHighlightAll(textEl, text, phrases, exact);
  row.append(label, textEl);
  return row;
}

// The original-language line (see buildConcordanceResultRow): always the
// row's first line, since every result in this list shares this Strong's
// number by definition -- unlike KJV/GAE, which only show up when that
// occurrence happens to have a tagged phrase in a verse whose text is
// actually available. forms is every distinct (original, transliteration)
// pair among this verse's interlinear tokens that carry this Strong's
// number (there can be more than one -- see buildConcordanceResultRow),
// each shown as "word (translit)" in order, the word in bold black rather
// than the orange italic .concordance-highlight KJV/GAE get -- this line
// *is* the word, not a highlighted match inside a longer quote -- and the
// transliteration styled to match it exactly (same size and color, same
// -2px lift -- see .concordance-original-translit), even though it's that
// same interlinear data shown in blue and smaller there.
function buildConcordanceOriginalLine(lang, forms) {
  if (!forms.length) return null;
  const row = document.createElement("div");
  row.className = "search-match-line search-match-line-original";
  row.style.setProperty("--translation-color", TRANSLATION_COLORS[lang === "he" ? "HEB" : "GRK"]);
  const label = document.createElement("span");
  label.className = "search-match-label";
  label.lang = lang;
  label.textContent = lang === "he" ? "HEB" : "GRK";
  const textEl = document.createElement("span");
  textEl.lang = lang;
  forms.forEach(({ word, translit }, index) => {
    if (index > 0) textEl.append(document.createTextNode(" / "));
    const strong = document.createElement("strong");
    strong.className = "concordance-original-word";
    strong.textContent = word;
    textEl.append(strong);
    if (translit) {
      textEl.append(document.createTextNode(" "));
      const translitEl = document.createElement("span");
      translitEl.className = "concordance-original-translit";
      // Parens live inside the same lifted span as the transliteration
      // itself -- as separate text nodes they'd sit at the untouched
      // baseline, out of line with the word and its own pronunciation.
      translitEl.textContent = `(${translit})`;
      textEl.append(translitEl);
    }
  });
  row.append(label, textEl);
  return row;
}

// bookId/chapter/verse/matches: matches is one { english, korean } per
// actual word occurrence the concordance data tagged in this verse (see
// groupByVerse in renderConcordanceResults) -- the same Strong's word can
// occur more than once in one verse, and this is the one row for all of
// them, not one row each. code is the Strong's number itself, used to
// find this verse's own matching interlinear token(s) for the original-
// language line -- the concordance data has no Greek/Hebrew text of its
// own, only the KJV/GAE rendering (see export_englishmans.py).
function buildConcordanceResultRow(bookId, chapter, verse, matches, chaptersByKey, interlinearByKey, lang, panelState, side, code) {
  const book = manifest.books[bookId];
  const item = document.createElement("article");
  item.className = "search-result";
  const content = document.createElement("div");
  content.className = "search-result-content";
  const reference = document.createElement("div");
  reference.className = "search-reference";
  const referenceTitle = document.createElement("div");
  referenceTitle.className = "search-reference-title";
  const referenceText = document.createElement("span");
  referenceText.className = "search-reference-text";
  referenceText.textContent = `${book.en} ${chapter}:${verse}`;
  referenceTitle.append(referenceText);
  reference.append(referenceTitle);
  content.append(reference);

  const body = document.createElement("div");
  body.className = "search-result-body";
  content.append(body);

  // Grammatical form can vary occurrence to occurrence (a verb's tense, a
  // noun's case, ...) even though every one of them shares this same
  // Strong's root -- so this matches by code alone, not by exact original
  // text, and shows each match's own actual form rather than assuming
  // they're all identical.
  const interlinearData = interlinearByKey.get(`${bookId}:${chapter}`);
  const verseTokens = interlinearData?.v.find(([v]) => v === verse)?.[1] ?? [];
  // Deduped by (word, translit) pair rather than by word alone -- the same
  // original text can in principle carry more than one pronunciation
  // reading, and this is meant to mirror the interlinear line's own
  // per-token pronunciation, not collapse them into one.
  const seenForms = new Set();
  const originalForms = [];
  for (const token of verseTokens) {
    if (token[3] !== code) continue;
    const key = `${token[0]}|${token[1]}`;
    if (seenForms.has(key)) continue;
    seenForms.add(key);
    originalForms.push({ word: token[0], translit: token[1] });
  }
  const originalLine = buildConcordanceOriginalLine(lang, originalForms);
  if (originalLine) body.append(originalLine);

  const chapterData = chaptersByKey.get(`${bookId}:${chapter}`);
  const verseEntry = chapterData?.v.find(([v]) => v === verse);
  const texts = verseEntry?.[1];
  // Each translation's own line only shows up when at least one of this
  // verse's matches actually has a tagged phrase for it and that verse's
  // own fetched text is available -- the two data sources (KJV/Strong's-
  // morphology tagging, GAE's own Godpeople-sourced tagging) don't always
  // agree on every occurrence, and showing an untagged translation here
  // would just repeat the verse with nothing highlighted in it.
  const englishPhrases = [...new Set(matches.map((match) => match.english).filter(Boolean))];
  const koreanPhrases = [...new Set(matches.map((match) => match.korean).filter(Boolean))];
  let shown = false;
  if (englishPhrases.length && texts?.KJV) {
    body.append(buildConcordanceMatchLine("KJV", "en", texts.KJV, englishPhrases, false));
    shown = true;
  }
  if (koreanPhrases.length && texts?.GAE) {
    body.append(buildConcordanceMatchLine("GAE", "ko", texts.GAE, koreanPhrases, true));
    shown = true;
  }
  if (!shown && !originalLine) {
    const empty = document.createElement("p");
    empty.className = "empty-translation";
    empty.textContent = "Verse text unavailable.";
    body.append(empty);
  }

  const actions = document.createElement("div");
  actions.className = "search-result-actions";
  const viewButton = document.createElement("button");
  viewButton.type = "button";
  viewButton.className = "button button-primary icon-only-button search-result-action";
  viewButton.setAttribute("aria-label", `View ${book.en} ${chapter}:${verse}`);
  viewButton.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14"></path>
      <path d="m13 6 6 6-6 6"></path>
    </svg>
  `;
  viewButton.addEventListener("click", (event) => {
    event.stopPropagation();
    // Same move-picking flow either way now -- embedded (side given) used
    // to jump straight to this panel's own column instead, with no way to
    // send it anywhere else. No dialog of its own to close first for the
    // embedded case: it stays open underneath the move-picking overlay
    // every panel already gets.
    if (side) enterMovePicking(bookId, chapter, verse);
    else openConcordanceResult(bookId, chapter, verse);
  });
  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "button button-secondary icon-only-button search-result-action";
  copyButton.setAttribute("aria-label", `Copy ${book.en} ${chapter}:${verse}`);
  copyButton.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2"></rect>
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path>
    </svg>
  `;
  copyButton.addEventListener("click", (event) => {
    event.stopPropagation();
    copyConcordanceResult(bookId, chapter, verse);
  });
  actions.append(viewButton, copyButton, side
    ? buildEmbeddedTskLinkButton(panelState, bookId, chapter, verse)
    : buildTskLinkButton(bookId, chapter, verse));
  reference.append(actions);

  item.append(content);
  return item;
}

// Matches openSearchResult exactly: enter move-picking mode for this
// reference and close this dialog.
function openConcordanceResult(bookId, chapter, verse) {
  enterMovePicking(bookId, chapter, verse, closeStrongsDialog);
}

// Matches copySearchResult exactly: select the verse in the active panel and
// open the copy dialog, without closing this one.
async function copyConcordanceResult(bookId, chapter, verse) {
  const panelState = activeOrFirstPanel();
  const elements = panelElements.get(panelState.id);
  elements.panel.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  const loaded = await goToPassage(panelState, { book: bookId, chapter, verse }, { record: true });
  if (!loaded) return;
  panelState.selectionMode = state.copySelectionMode;
  panelState.selectionAnchor = verse;
  panelState.selectionEnd = verse;
  panelState.selectedVerses = new Set([verse]);
  updatePanelSelection(panelState);
  openCopyDialog(panelState);
  // The concordance is itself KJV-based, so default the copy dialog to
  // just KJV rather than whatever versions the active panel happens to
  // have enabled.
  copyTranslationOrder = ["KJV"];
  copyTranslationControl?.render();
}

async function copySelectedWord(panelState) {
  const word = panelState.selectedWord;
  if (!word) return;
  try {
    await writeClipboard(`${word.original} (${word.transliteration})`);
    clearWordLookup(panelState);
  } catch {
    // No status area in this compact toolbar to report a clipboard failure.
  }
}

// Picking a book or chapter only updates the selectors themselves (and the
// verse combo's available options) -- it does not navigate. The dialog only
// jumps to a new passage once a verse is actually chosen from the verse
// combo, via goToTskPassage.
async function updateTskBookOrChapter(book, chapter) {
  const normalizedBook = Math.max(0, Math.min(Number(book) || 0, manifest.books.length - 1));
  const normalizedChapter = Math.max(1, Math.min(Number(chapter) || 1, manifest.books[normalizedBook].chapters));
  tskViewState.book = normalizedBook;
  tskViewState.chapter = normalizedChapter;
  tskBookCombo.setValue(normalizedBook);
  tskChapterCombo.setItems(chapterItems(normalizedBook));
  tskChapterCombo.setValue(normalizedChapter);
  const data = await getChapter(normalizedBook, normalizedChapter);
  if (tskViewState.book !== normalizedBook || tskViewState.chapter !== normalizedChapter) return;
  const verses = data.v.map(([verse]) => ({ value: Number(verse), label: String(verse) }));
  tskVerseCombo.setItems(verses);
  tskVerseCombo.setValue(verses[0]?.value ?? 1);
}

function setupTskControls() {
  const bookItems = manifest.books.map((book, index) => ({
    value: index,
    label: `${book.en} ${book.ko}`,
    ko: book.ko,
    en: book.en,
    testament: index < 39 ? "old" : "new",
  }));
  tskBookCombo = setupCombobox({
    input: tskBookInput,
    menu: tskBookInput.closest(".book-combo").querySelector(".combo-menu"),
    items: bookItems,
    selectedValue: tskViewState.book,
    matches: matchesBook,
    onSelect: (book) => updateTskBookOrChapter(book, 1),
  });
  tskChapterCombo = setupCombobox({
    input: tskChapterInput,
    menu: tskChapterInput.closest(".chapter-combo").querySelector(".combo-menu"),
    items: chapterItems(tskViewState.book),
    selectedValue: tskViewState.chapter,
    matches: (item, query) => !query.trim() || item.label.startsWith(query.trim()),
    onSelect: (chapter) => updateTskBookOrChapter(tskViewState.book, chapter),
  });
  tskVerseCombo = setupCombobox({
    input: tskVerseInput,
    menu: tskVerseInput.closest(".verse-combo").querySelector(".combo-menu"),
    items: [{ value: 1, label: "1" }],
    selectedValue: tskViewState.verse,
    matches: (item, query) => !query.trim() || item.label.startsWith(query.trim()),
    onSelect: (verse) => goToTskPassage({ book: tskViewState.book, chapter: tskViewState.chapter, verse }),
  });
  tskTranslationControl = setupDialogTranslationControl({
    picker: tskTranslationPicker,
    toggle: tskTranslationPickerToggle,
    menu: tskTranslationPickerMenu,
    list: tskTranslationList,
    getOrder: () => tskTranslationOrder,
    setOrder: (order) => {
      tskTranslationOrder = order;
    },
    onChange: () => {
      renderTskReferenceList();
    },
  });
  tskTranslationControl.render();
}

function updateTskControls() {
  tskBookCombo.setValue(tskViewState.book);
  tskChapterCombo.setItems(chapterItems(tskViewState.book));
  tskChapterCombo.setValue(tskViewState.chapter);
  const verses = verseItems(tskViewState);
  tskVerseCombo.setItems(verses);
  tskVerseCombo.setValue(tskViewState.verse);
}

async function loadTskChapter() {
  try {
    tskViewState.data = await getChapter(tskViewState.book, tskViewState.chapter);
  } catch (error) {
    showLookupEmpty(tskDialogBody, error.message);
    return;
  }
  const verses = verseItems(tskViewState);
  const maxVerse = verses.at(-1)?.value ?? 1;
  tskViewState.verse = Math.max(1, Math.min(tskViewState.verse, maxVerse));
  updateTskControls();
  const tskChapterData = await getTskChapter(tskViewState.book, tskViewState.chapter);
  const verseTsk = tskChapterData.v.find(([verse]) => verse === tskViewState.verse);
  tskViewState.anchors = verseTsk ? verseTsk[1] : [];
  renderTskVerseText();
  await renderTskReferenceList();
}

async function goToTskPassage(passage, { record = true } = {}) {
  const normalized = normalizePassage(passage.book, passage.chapter, passage.verse);
  tskViewState.book = normalized.book;
  tskViewState.chapter = normalized.chapter;
  tskViewState.verse = normalized.verse;
  if (record) recordTskHistory(normalized);
  await loadTskChapter();
}

// Mirrors the panel's own back/forward history (see recordPanelHistory/
// navigatePanelHistory) but for TSK's own lookups: one running list of
// every passage shown, shared by this dialog and every embedded TSK pane
// (see createEmbeddedTskTool) alike -- a lookup in either shows up in the
// other's own back/forward history too. registerTskHistoryButtons is what
// keeps every one of their own prev/next arrows in sync with it.
let tskHistory = [];
let tskHistoryIndex = -1;
const tskHistoryButtonPairs = [];

function recordTskHistory(passage) {
  if (tskHistoryIndex >= 0 && samePassage(tskHistory[tskHistoryIndex], passage)) return;
  tskHistory = tskHistory.slice(0, tskHistoryIndex + 1);
  tskHistory.push(passage);
  if (tskHistory.length > 100) tskHistory.shift();
  tskHistoryIndex = tskHistory.length - 1;
  updateTskHistoryButtons();
}

// Moves the shared position and returns the entry landed on (or null) --
// rendering it is the caller's own job (the dialog's goToTskPassage vs. an
// embedded pane's own goTo).
function moveTskHistory(direction) {
  const nextIndex = tskHistoryIndex + direction;
  if (nextIndex < 0 || nextIndex >= tskHistory.length) return null;
  tskHistoryIndex = nextIndex;
  updateTskHistoryButtons();
  return tskHistory[nextIndex];
}

function updateTskHistoryButtons() {
  for (const { back, forward } of tskHistoryButtonPairs) {
    back.disabled = tskHistoryIndex <= 0;
    forward.disabled = tskHistoryIndex < 0 || tskHistoryIndex >= tskHistory.length - 1;
  }
}

function registerTskHistoryButtons(back, forward) {
  tskHistoryButtonPairs.push({ back, forward });
  back.disabled = tskHistoryIndex <= 0;
  forward.disabled = tskHistoryIndex < 0 || tskHistoryIndex >= tskHistory.length - 1;
}

registerTskHistoryButtons(tskHistoryBackButton, tskHistoryForwardButton);
tskHistoryBackButton.addEventListener("click", () => {
  const passage = moveTskHistory(-1);
  if (passage) goToTskPassage(passage, { record: false });
});
tskHistoryForwardButton.addEventListener("click", () => {
  const passage = moveTskHistory(1);
  if (passage) goToTskPassage(passage, { record: false });
});

// Shared by the link icon on every verse-list row (TSK, word search,
// Englishman's concordance): jumps the TSK dialog to that reference's own
// cross references, opening it first (matching openTskDialog's own setup)
// if it isn't already open.
async function openTskFromResult(bookId, chapter, verse) {
  if (!tskDialog.open) {
    tskTranslationOrder = enabledTranslationIds(activeOrFirstPanel()).filter(isIndexableTranslationId);
    tskTranslationControl?.render();
    tskDialog.showModal();
    syncDialogHeightToPanel(tskDialog);
  }
  await goToTskPassage({ book: bookId, chapter, verse });
}

function buildTskLinkButton(bookId, chapter, verse) {
  const book = manifest.books[bookId];
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button button-secondary icon-only-button search-result-action";
  button.setAttribute("aria-label", `Cross references for ${book.en} ${chapter}:${verse}`);
  button.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
    </svg>
  `;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    openTskFromResult(bookId, chapter, verse);
  });
  return button;
}

// Wraps each word matching a TSK anchor (case-insensitively, ignoring
// leading/trailing punctuation) in a highlight span; only meaningful for the
// KJV line, since TSK's anchors are themselves KJV words.
// TSK anchors are often whole phrases ("Let there", or even a full clause),
// not single words, so they're matched as substrings of the verse text
// rather than token-by-token -- but still on word boundaries (see
// findWordMatch), so a short anchor like "he" doesn't also light up inside
// "the" or "she". Overlapping/adjacent matches are merged into one
// highlighted run.
function findAnchorRanges(text, anchors) {
  const ranges = [];
  for (const [anchor] of anchors) {
    const range = findWordMatch(text, anchor.trim());
    if (range) ranges.push(range);
  }
  if (!ranges.length) return ranges;
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [ranges[0]];
  for (const range of ranges.slice(1)) {
    const last = merged[merged.length - 1];
    if (range[0] <= last[1]) {
      last[1] = Math.max(last[1], range[1]);
    } else {
      merged.push(range);
    }
  }
  return merged;
}

function appendWithAnchors(element, text, anchors) {
  const ranges = findAnchorRanges(text, anchors);
  if (!ranges.length) {
    element.textContent = text;
    return;
  }
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) element.append(document.createTextNode(text.slice(cursor, start)));
    const span = document.createElement("span");
    span.className = "tsk-anchor";
    span.textContent = text.slice(start, end);
    element.append(span);
    cursor = end;
  }
  if (cursor < text.length) element.append(document.createTextNode(text.slice(cursor)));
}

// The verse text is always plain KJV -- TSK's anchors are themselves KJV
// words, and this line is independent of the translation icons above, which
// only control the cross-reference results further down.
function renderTskVerseText() {
  tskVerseText.replaceChildren();
  const verseEntry = tskViewState.data?.v.find(([verse]) => verse === tskViewState.verse);
  const texts = verseEntry ? verseEntry[1] : {};
  const rawText = texts.KJV;
  const line = document.createElement("div");
  line.className = "translation-line tsk-verse-line";
  line.lang = translationLanguage("KJV");
  line.style.setProperty("--translation-color", TRANSLATION_COLORS.KJV);
  const label = document.createElement("span");
  label.className = "translation-label";
  label.textContent = translationMeta("KJV").label;
  const text = document.createElement("p");
  text.className = "translation-text";
  if (rawText && tskViewState.anchors.length) {
    appendWithAnchors(text, rawText, tskViewState.anchors);
  } else {
    text.textContent = rawText || "";
  }
  line.append(label, text);
  tskVerseText.append(line);
}

function buildTskResultRow(bookId, chapter, verse, chaptersByKey) {
  const book = manifest.books[bookId];
  const item = document.createElement("article");
  item.className = "search-result";
  const content = document.createElement("div");
  content.className = "search-result-content";
  const reference = document.createElement("div");
  reference.className = "search-reference";
  const referenceTitle = document.createElement("div");
  referenceTitle.className = "search-reference-title";
  const referenceText = document.createElement("span");
  referenceText.textContent = `${book.en} ${chapter}:${verse}`;
  referenceTitle.append(referenceText);
  reference.append(referenceTitle);
  content.append(reference);

  const body = document.createElement("div");
  body.className = "search-result-body";
  content.append(body);

  const chapterData = chaptersByKey.get(`${bookId}:${chapter}`);
  const verseEntry = chapterData?.v.find(([v]) => v === verse);
  const texts = verseEntry ? verseEntry[1] : {};
  for (const translation of tskTranslationOrder) {
    const text = texts[translation];
    const hasContent = hasVerseText(text);
    const row = document.createElement("div");
    row.className = "search-match-line";
    row.style.setProperty("--translation-color", TRANSLATION_COLORS[translation]);
    const label = document.createElement("span");
    label.className = "search-match-label";
    label.lang = translationLanguage(translation);
    label.textContent = translationMeta(translation).label;
    const textEl = document.createElement("span");
    textEl.lang = translationLanguage(translation);
    textEl.textContent = hasContent ? text : "";
    row.append(label, textEl);
    body.append(row);
  }
  if (!tskTranslationOrder.length) {
    const empty = document.createElement("p");
    empty.className = "empty-translation";
    empty.textContent = "Select at least one translation.";
    body.append(empty);
  }

  const actions = document.createElement("div");
  actions.className = "search-result-actions";
  const viewButton = document.createElement("button");
  viewButton.type = "button";
  viewButton.className = "button button-primary icon-only-button search-result-action";
  viewButton.setAttribute("aria-label", `View ${book.en} ${chapter}:${verse}`);
  viewButton.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14"></path>
      <path d="m13 6 6 6-6 6"></path>
    </svg>
  `;
  viewButton.addEventListener("click", (event) => {
    event.stopPropagation();
    openTskResult(bookId, chapter, verse);
  });
  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "button button-secondary icon-only-button search-result-action";
  copyButton.setAttribute("aria-label", `Copy ${book.en} ${chapter}:${verse}`);
  copyButton.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2"></rect>
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path>
    </svg>
  `;
  copyButton.addEventListener("click", (event) => {
    event.stopPropagation();
    copyTskResult(bookId, chapter, verse);
  });
  actions.append(viewButton, copyButton, buildTskLinkButton(bookId, chapter, verse));
  reference.append(actions);

  item.append(content);
  return item;
}

async function renderTskReferenceList() {
  const anchors = tskViewState.anchors;
  if (!anchors.length) {
    showLookupEmpty(tskDialogBody, "No cross references found.");
    return;
  }
  showLookupEmpty(tskDialogBody, "Loading…");

  // Pre-fetch every distinct chapter these cross-references touch, in
  // parallel, into a request-scoped map rather than relying on the shared
  // chapterCache -- a single verse's cross-references can easily span more
  // chapters than that cache's LRU cap, which would evict early fetches
  // before this function gets a chance to read them back out. allSettled
  // rather than all: any single one of those fetches hitting a transient
  // network blip used to sink the whole batch, leaving this stuck on
  // "Loading…" forever. buildTskResultRow already handles a missing
  // chaptersByKey entry gracefully (its verse text just doesn't show for
  // that reference), so a failed chapter is simply left out.
  const chapterKeys = new Set();
  for (const [, refs] of anchors) {
    for (const [bookId, chapter] of refs) chapterKeys.add(`${bookId}:${chapter}`);
  }
  const chapterSettled = await Promise.allSettled(
    [...chapterKeys].map(async (key) => {
      const [bookId, chapter] = key.split(":").map(Number);
      return [key, await getChapter(bookId, chapter)];
    }),
  );
  if (!tskDialog.open) return;
  const chaptersByKey = new Map(
    chapterSettled.filter((result) => result.status === "fulfilled").map((result) => result.value),
  );

  // Word-search-style master/detail: the left nav lists each anchored KJV
  // word with its reference count, and clicking one scrolls the matching
  // section (its first reference verse) into view on the right.
  const results = document.createElement("div");
  results.className = "tsk-results";
  const nav = document.createElement("div");
  nav.className = "tsk-word-nav";
  const list = document.createElement("div");
  list.className = "tsk-anchor-list";

  anchors.forEach(([anchor, refs], index) => {
    const anchorId = `tsk-anchor-${index}`;

    const navButton = document.createElement("button");
    navButton.type = "button";
    navButton.className = "tsk-word-nav-item";
    const word = document.createElement("span");
    word.className = "tsk-word-nav-word";
    word.textContent = anchor;
    const count = document.createElement("span");
    count.className = "tsk-word-nav-count";
    count.textContent = ` (${refs.length})`;
    navButton.append(word, count);
    navButton.addEventListener("click", () => {
      list.querySelector(`[data-anchor-id="${anchorId}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    nav.append(navButton);

    const section = document.createElement("section");
    section.className = "tsk-anchor-section";
    section.dataset.anchorId = anchorId;
    const heading = document.createElement("h3");
    heading.className = "tsk-anchor-heading";
    heading.textContent = anchor;
    section.append(heading);
    for (const [bookId, chapter, verse] of refs) {
      section.append(buildTskResultRow(bookId, chapter, verse, chaptersByKey));
    }
    list.append(section);
  });

  results.append(nav, list);
  tskDialogBody.replaceChildren(results);
}

// Matches openSearchResult exactly: enter move-picking mode for this
// reference and close this dialog.
function openTskResult(bookId, chapter, verse) {
  enterMovePicking(bookId, chapter, verse, closeTskDialog);
}

// Matches copySearchResult exactly: open the copy dialog for this
// reference verse, without moving any panel or closing this one.
async function copyTskResult(bookId, chapter, verse) {
  await openCopyDialogForVerse(bookId, chapter, verse, tskTranslationOrder);
}

// Called two ways: from a panel's own link icon (panelState given -- jump
// straight to that panel's verse) or from the page-header TSK icon (no
// argument -- resume wherever this dialog was last left, since both entry
// points share the same tskViewState/history, or default to Genesis 1:1 if
// it's never been opened this session). That first default is deliberately
// not recorded -- it's never something the user actually looked up, so
// history should start from whatever real navigation comes after it.
async function openTskDialog(panelState) {
  if (panelState) {
    const verse = panelState.lastClickedVerse ?? panelState.verse;
    tskViewState.book = panelState.book;
    tskViewState.chapter = panelState.chapter;
    tskViewState.verse = verse;
    recordTskHistory(currentPassage(tskViewState));
    // The translation icons only govern which versions' text appears in the
    // cross-reference results below, so default them to whatever this panel is
    // currently showing (Hebrew/Greek/STR/TSK excluded -- none have TSK-indexed text).
    tskTranslationOrder = enabledTranslationIds(panelState).filter(isIndexableTranslationId);
  } else if (tskHistoryIndex < 0) {
    tskViewState.book = 0;
    tskViewState.chapter = 1;
    tskViewState.verse = 1;
    tskTranslationOrder = enabledTranslationIds(activeOrFirstPanel()).filter(isIndexableTranslationId);
  }
  tskTranslationControl?.render();
  tskDialog.showModal();
  // See the matching comment in openStrongsDialog -- same default-focus
  // fix, so the close button doesn't end up wearing an unearned focus ring.
  tskDialog.focus();
  syncDialogHeightToPanel(tskDialog);
  await loadTskChapter();
}

function closeTskDialog() {
  tskDialog.close();
}

// ---- Panel options menu (header ⋮ button) ---------------------------------
// A small fixed menu, not tied to any one panel: highlight/bookmark/note open
// their own "every verse with one of these" list dialogs below; dictionary/
// cross-references just reopen the existing Strong's/TSK dialogs.

// Anchored directly under the ⋮ button (clamped to stay fully on screen
// either way) rather than centered like a real dialog -- same clamping
// approach as positionTranslationPickerMenuFor, just simpler (this menu
// never needs that one's dialog-aware escape hatch, since the ⋮ button
// only ever lives in the page's own top-level header, never inside another
// dialog or a study tool's own embedded shell).
function positionPanelOptionsDialog() {
  const anchor = panelOptionsToggle.getBoundingClientRect();
  const rect = panelOptionsDialog.getBoundingClientRect();
  const gap = 6;
  const left = Math.max(8, Math.min(anchor.right - rect.width, window.innerWidth - rect.width - 8));
  const below = window.innerHeight - anchor.bottom - gap - 8;
  const above = anchor.top - gap - 8;
  const openAbove = below < rect.height && above > below;
  panelOptionsDialog.style.left = `${left}px`;
  panelOptionsDialog.style.top = openAbove ? "auto" : `${anchor.bottom + gap}px`;
  panelOptionsDialog.style.bottom = openAbove ? `${window.innerHeight - anchor.top + gap}px` : "auto";
}

// .show(), not .showModal() -- this menu is a small anchored dropdown, not
// a real dialog: the rest of the page must stay fully interactive while
// it's open (a reader can still tap a verse, scroll a panel, etc. -- doing
// so just also closes the menu, see the outside-press listener below),
// which .showModal()'s own inert-background behavior would otherwise block.
function openPanelOptionsDialog() {
  panelOptionsDialog.show();
  positionPanelOptionsDialog();
  panelOptionsToggle.setAttribute("aria-expanded", "true");
}

function closePanelOptionsDialog() {
  if (!panelOptionsDialog.open) return;
  panelOptionsDialog.close();
  panelOptionsToggle.setAttribute("aria-expanded", "false");
}

// The word-actions toolbar's own dictionary button (see openStrongsDialog)
// only ever appears once a panel's interlinear word is actually selected, so
// it never needs a fallback. This menu has no such selection to fall back
// on, so it opens on the same default entry (Strong's H0001) the embedded
// STR pane itself opens cold on (see showEntry's own fallback).
async function openDictionaryDialogDefault() {
  strongsDialog.showModal();
  strongsDialog.focus();
  syncDialogHeightToPanel(strongsDialog);
  await renderStrongsDialog({ strongs: "H0001", original: "H0001", lang: "he" }, activeOrFirstPanel());
}

panelOptionsToggle.addEventListener("click", () => {
  if (panelOptionsDialog.open) closePanelOptionsDialog();
  else openPanelOptionsDialog();
});
// A non-modal dialog has no ::backdrop click to catch an outside press the
// way the shared .lookup-dialog pattern does elsewhere -- same
// shield-the-press-that-closed-it approach as the translation-picker menus
// (see shieldOutsidePress's own comment) so tapping, say, a verse to
// dismiss this menu doesn't also select that verse.
document.addEventListener(
  "pointerdown",
  (event) => {
    if (!panelOptionsDialog.open) return;
    if (panelOptionsDialog.contains(event.target) || panelOptionsToggle.contains(event.target)) return;
    closePanelOptionsDialog();
    shieldOutsidePress(event);
  },
  true,
);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && panelOptionsDialog.open) closePanelOptionsDialog();
});
panelOptionsHighlightButton.addEventListener("click", () => {
  closePanelOptionsDialog();
  openHighlightListDialog();
});
panelOptionsBookmarkButton.addEventListener("click", () => {
  closePanelOptionsDialog();
  openBookmarkListDialog();
});
panelOptionsNoteButton.addEventListener("click", () => {
  closePanelOptionsDialog();
  openNoteListDialog();
});
panelOptionsDictionaryButton.addEventListener("click", () => {
  closePanelOptionsDialog();
  openDictionaryDialogDefault();
});
panelOptionsTskButton.addEventListener("click", () => {
  closePanelOptionsDialog();
  openTskDialog();
});
panelOptionsInfoButton.addEventListener("click", () => {
  closePanelOptionsDialog();
  openInfoDialog();
});

// Fetches every distinct chapter a set of "book:chapter" keys touches, in
// parallel, into a request-scoped map -- same allSettled-based approach as
// renderTskReferenceList's own prefetch (see its comment), so one bad
// chapter fetch doesn't sink the whole batch. Shared by the Highlight and
// Bookmark list dialogs below, both of which need real verse text for an
// arbitrary scatter of book/chapter combos across the whole Bible.
async function fetchChaptersByKey(chapterKeys) {
  const settled = await Promise.allSettled(
    [...chapterKeys].map(async (key) => {
      const [bookId, chapter] = key.split(":").map(Number);
      return [key, await getChapter(bookId, chapter)];
    }),
  );
  return new Map(settled.filter((result) => result.status === "fulfilled").map((result) => result.value));
}

// Builds the shared reference-title/actions row every result below starts
// from (see buildTskResultRow/renderSearchResults) -- the per-translation
// lines in the body are each caller's own job, since Highlight shows
// highlighted text, Bookmark shows plain text, and Note shows note text.
function buildStateListReferenceRow(bookId, chapter, verse, closeDialog) {
  const book = manifest.books[bookId];
  const item = document.createElement("article");
  item.className = "search-result";
  const content = document.createElement("div");
  content.className = "search-result-content";
  const reference = document.createElement("div");
  reference.className = "search-reference";
  const referenceTitle = document.createElement("div");
  referenceTitle.className = "search-reference-title";
  const referenceText = document.createElement("span");
  referenceText.textContent = `${book.en} ${chapter}:${verse}`;
  referenceTitle.append(referenceText);
  reference.append(referenceTitle);
  content.append(reference);

  const body = document.createElement("div");
  body.className = "search-result-body";
  content.append(body);

  const actions = document.createElement("div");
  actions.className = "search-result-actions";
  const viewButton = document.createElement("button");
  viewButton.type = "button";
  viewButton.className = "button button-primary icon-only-button search-result-action";
  viewButton.setAttribute("aria-label", `View ${book.en} ${chapter}:${verse}`);
  viewButton.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14"></path>
      <path d="m13 6 6 6-6 6"></path>
    </svg>
  `;
  viewButton.addEventListener("click", (event) => {
    event.stopPropagation();
    enterMovePicking(bookId, chapter, verse, closeDialog);
  });
  actions.append(viewButton);

  item.append(content);
  return { item, body, actions, reference };
}

// Same trash icon as highlight-manage-remove/bookmark-manage-remove/
// note-view-remove, sized like every other search-result-action -- goes
// last in each row's actions, right of the cross-reference link button.
function buildDeleteResultActionButton(label, onDelete) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button button-secondary icon-only-button search-result-action";
  button.setAttribute("aria-label", label);
  button.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16"></path>
      <path d="M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"></path>
      <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"></path>
      <path d="M10 11v6M14 11v6"></path>
    </svg>
  `;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onDelete();
  });
  return button;
}

// ---- Highlight list dialog -------------------------------------------------

async function openHighlightListDialog() {
  highlightListDialog.showModal();
  highlightListDialog.focus();
  syncDialogHeightToPanel(highlightListDialog);
  await renderHighlightList();
}

function closeHighlightListDialog() {
  highlightListDialog.close();
}

function groupedStateEntries(stateMap) {
  const groups = new Map();
  for (const key of Object.keys(stateMap)) {
    const [translation, book, chapter, verse] = key.split(":");
    const groupKey = `${book}:${chapter}:${verse}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, { book: Number(book), chapter: Number(chapter), verse: Number(verse), entries: [] });
    }
    groups.get(groupKey).entries.push({ translation, value: stateMap[key] });
  }
  return [...groups.values()].sort(
    (a, b) => a.book - b.book || a.chapter - b.chapter || a.verse - b.verse,
  );
}

async function renderHighlightList() {
  const groups = groupedStateEntries(state.highlights);
  if (!groups.length) {
    showLookupEmpty(highlightListBody, "No highlights yet.");
    return;
  }
  showLookupEmpty(highlightListBody, "Loading…");
  const chapterKeys = new Set(groups.map((group) => `${group.book}:${group.chapter}`));
  const chaptersByKey = await fetchChaptersByKey(chapterKeys);
  if (!highlightListDialog.open) return;
  const list = document.createElement("div");
  list.className = "tsk-anchor-list";
  for (const group of groups) list.append(buildHighlightResultRow(group, chaptersByKey));
  highlightListBody.replaceChildren(list);
}

function buildHighlightResultRow(group, chaptersByKey) {
  const { book: bookId, chapter, verse, entries } = group;
  const { item, body, actions, reference } = buildStateListReferenceRow(bookId, chapter, verse, closeHighlightListDialog);

  const chapterData = chaptersByKey.get(`${bookId}:${chapter}`);
  const verseEntry = chapterData?.v.find(([v]) => v === verse);
  const texts = verseEntry ? verseEntry[1] : {};
  for (const entry of entries) {
    const text = texts[entry.translation];
    const hasContent = hasVerseText(text);
    const row = document.createElement("div");
    row.className = "search-match-line";
    row.style.setProperty("--translation-color", TRANSLATION_COLORS[entry.translation]);
    const label = document.createElement("span");
    label.className = "search-match-label";
    label.lang = translationLanguage(entry.translation);
    label.textContent = translationMeta(entry.translation).label;
    row.append(label);
    const textWrap = document.createElement("p");
    textWrap.className = "search-match-text";
    if (hasContent) {
      const mark = document.createElement("span");
      mark.className = "translation-text-highlight";
      mark.style.setProperty("--highlight-color", HIGHLIGHT_COLORS[entry.value]);
      mark.textContent = text;
      textWrap.append(mark);
    }
    row.append(textWrap);
    body.append(row);
  }

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "button button-secondary icon-only-button search-result-action";
  copyButton.setAttribute("aria-label", `Copy ${manifest.books[bookId].en} ${chapter}:${verse}`);
  copyButton.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2"></rect>
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path>
    </svg>
  `;
  copyButton.addEventListener("click", (event) => {
    event.stopPropagation();
    openCopyDialogForVerse(bookId, chapter, verse, entries.map((entry) => entry.translation));
  });
  actions.append(
    copyButton,
    buildTskLinkButton(bookId, chapter, verse),
    buildDeleteResultActionButton(`Remove highlight for ${manifest.books[bookId].en} ${chapter}:${verse}`, () => {
      for (const entry of entries) delete state.highlights[highlightKey(entry.translation, bookId, chapter, verse)];
      saveState();
      for (const panel of state.panels) {
        if (panel.book === bookId && panel.chapter === chapter) renderPanelBody(panel);
      }
      renderHighlightList();
    }),
  );
  reference.append(actions);
  return item;
}

// ---- Bookmark list dialog ---------------------------------------------------
// Unlike Highlight/Note, a bookmark marks a verse regardless of translation
// (see bookmarkKey), so there's no fixed set of "which versions" to show --
// the reader picks, same version-picker control TSK's own dialog uses for
// the same reason.

let bookmarkListTranslationOrder = [];
let bookmarkListTranslationControl;

function setupBookmarkListControls() {
  bookmarkListTranslationControl = setupDialogTranslationControl({
    picker: bookmarkListTranslationPicker,
    toggle: bookmarkListTranslationPickerToggle,
    menu: bookmarkListTranslationPickerMenu,
    list: bookmarkListTranslationList,
    getOrder: () => bookmarkListTranslationOrder,
    setOrder: (order) => {
      bookmarkListTranslationOrder = order;
    },
    onChange: () => {
      renderBookmarkList();
    },
  });
  bookmarkListTranslationControl.render();
}

async function openBookmarkListDialog() {
  if (!bookmarkListTranslationOrder.length) {
    bookmarkListTranslationOrder = enabledTranslationIds(activeOrFirstPanel()).filter(isIndexableTranslationId);
    bookmarkListTranslationControl.render();
  }
  bookmarkListDialog.showModal();
  bookmarkListDialog.focus();
  syncDialogHeightToPanel(bookmarkListDialog);
  await renderBookmarkList();
}

function closeBookmarkListDialog() {
  bookmarkListDialog.close();
}

async function renderBookmarkList() {
  const verses = Object.keys(state.bookmarks)
    .filter((key) => state.bookmarks[key])
    .map((key) => {
      const [book, chapter, verse] = key.split(":").map(Number);
      return { book, chapter, verse };
    })
    .sort((a, b) => a.book - b.book || a.chapter - b.chapter || a.verse - b.verse);

  if (!verses.length) {
    showLookupEmpty(bookmarkListBody, "No bookmarks yet.");
    return;
  }
  showLookupEmpty(bookmarkListBody, "Loading…");
  const chapterKeys = new Set(verses.map((entry) => `${entry.book}:${entry.chapter}`));
  const chaptersByKey = await fetchChaptersByKey(chapterKeys);
  if (!bookmarkListDialog.open) return;
  const list = document.createElement("div");
  list.className = "tsk-anchor-list";
  for (const { book, chapter, verse } of verses) {
    list.append(buildBookmarkResultRow(book, chapter, verse, chaptersByKey));
  }
  bookmarkListBody.replaceChildren(list);
}

function buildBookmarkResultRow(bookId, chapter, verse, chaptersByKey) {
  const { item, body, actions, reference } = buildStateListReferenceRow(bookId, chapter, verse, closeBookmarkListDialog);

  const chapterData = chaptersByKey.get(`${bookId}:${chapter}`);
  const verseEntry = chapterData?.v.find(([v]) => v === verse);
  const texts = verseEntry ? verseEntry[1] : {};
  for (const translation of bookmarkListTranslationOrder) {
    const text = texts[translation];
    const hasContent = hasVerseText(text);
    const row = document.createElement("div");
    row.className = "search-match-line";
    row.style.setProperty("--translation-color", TRANSLATION_COLORS[translation]);
    const label = document.createElement("span");
    label.className = "search-match-label";
    label.lang = translationLanguage(translation);
    label.textContent = translationMeta(translation).label;
    const textEl = document.createElement("span");
    textEl.lang = translationLanguage(translation);
    textEl.textContent = hasContent ? text : "";
    row.append(label, textEl);
    body.append(row);
  }
  if (!bookmarkListTranslationOrder.length) {
    const empty = document.createElement("p");
    empty.className = "empty-translation";
    empty.textContent = "Select at least one translation.";
    body.append(empty);
  }

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "button button-secondary icon-only-button search-result-action";
  copyButton.setAttribute("aria-label", `Copy ${manifest.books[bookId].en} ${chapter}:${verse}`);
  copyButton.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2"></rect>
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path>
    </svg>
  `;
  copyButton.addEventListener("click", (event) => {
    event.stopPropagation();
    openCopyDialogForVerse(bookId, chapter, verse, bookmarkListTranslationOrder);
  });
  actions.append(
    copyButton,
    buildTskLinkButton(bookId, chapter, verse),
    buildDeleteResultActionButton(`Remove bookmark for ${manifest.books[bookId].en} ${chapter}:${verse}`, () => {
      delete state.bookmarks[bookmarkKey(bookId, chapter, verse)];
      saveState();
      for (const panel of state.panels) {
        if (panel.book === bookId && panel.chapter === chapter) renderPanelBody(panel);
      }
      renderBookmarkList();
    }),
  );
  reference.append(actions);
  return item;
}

// ---- Note list dialog -------------------------------------------------------

async function openNoteListDialog() {
  noteListDialog.showModal();
  noteListDialog.focus();
  syncDialogHeightToPanel(noteListDialog);
  renderNoteList();
}

function closeNoteListDialog() {
  noteListDialog.close();
}

function renderNoteList() {
  const verses = Object.entries(state.notes)
    .map(([key, text]) => {
      const [book, chapter, verse] = key.split(":").map(Number);
      return { book, chapter, verse, text };
    })
    .sort((a, b) => a.book - b.book || a.chapter - b.chapter || a.verse - b.verse);

  if (!verses.length) {
    showLookupEmpty(noteListBody, "No notes yet.");
    return;
  }
  const list = document.createElement("div");
  list.className = "tsk-anchor-list";
  for (const entry of verses) list.append(buildNoteResultRow(entry));
  noteListBody.replaceChildren(list);
}

// Same reference-title/actions row as Highlight/Bookmark, but the body is
// just this verse's own note text -- no per-translation breakdown, since a
// note isn't attached to any one translation (see noteKey) -- and directly
// editable in place via buildEditableNoteField, same as the panel's own
// NOTE row.
function buildNoteResultRow({ book: bookId, chapter, verse, text }) {
  const { item, body, actions, reference } = buildStateListReferenceRow(bookId, chapter, verse, closeNoteListDialog);
  const key = noteKey(bookId, chapter, verse);
  body.append(buildEditableNoteField(key, text, () => renderNoteList()));

  actions.append(
    buildTskLinkButton(bookId, chapter, verse),
    buildDeleteResultActionButton(`Remove note for ${manifest.books[bookId].en} ${chapter}:${verse}`, () => {
      delete state.notes[key];
      saveState();
      for (const panel of state.panels) {
        if (panel.book === bookId && panel.chapter === chapter) renderPanelBody(panel);
      }
      renderNoteList();
    }),
  );
  reference.append(actions);
  return item;
}

// ---- Info dialog -------------------------------------------------------

// Content is fully static (see #info-dialog in index.html), so unlike every
// other panel-options-menu dialog above, opening this one needs no render
// step -- just show it and wire the nav once. Same word-search-style
// master/detail click-to-scroll as the TSK cross-reference list's own
// .tsk-word-nav (see renderTskReferenceList): clicking a nav item scrolls
// its matching section into view rather than swapping content in/out.
// Every icon paragraph's own float+negative-margin-top (see .info-icon/
// .info-chip-icon/.info-screenshot--icon-row) centers the icon against a
// single line of text -- correct only when the description actually IS
// one line. Whether it wraps to two or more depends on the dialog's own
// responsive width (a phone-width dialog wraps far more of these than a
// desktop one), so it can't be baked into a single static CSS value --
// this re-checks live, per paragraph, every time the dialog's width could
// have changed. Once wrapped, that same centering offset just leaves the
// icon floating oddly high above a taller block of text; top-aligning it
// with the paragraph's own first line instead reads far better.
function alignInfoIcons() {
  const paragraphs = infoDialog.querySelectorAll(".info-body-text");
  for (const paragraph of paragraphs) {
    const img = paragraph.querySelector(".info-icon, .info-chip-icon, .info-screenshot--icon-row");
    if (!img) continue;
    // Captured once, from whatever CSS/inline value was already centering
    // it -- so this works regardless of each icon's own tuned offset
    // (-4px, -6px, -8px, ...) without hardcoding any of them here.
    if (img.dataset.centeredMarginTop === undefined) {
      img.dataset.centeredMarginTop = getComputedStyle(img).marginTop;
    }
    // Counts the description text's own wrapped line fragments directly,
    // rather than inferring line count from the paragraph's overall
    // height -- flow-root containment stretches that height to fit
    // whichever is taller, the text or the (variously sized) float
    // itself, which makes height alone an unreliable one-vs-many-lines
    // signal.
    const range = document.createRange();
    range.setStartAfter(img);
    range.setEndAfter(paragraph.lastChild);
    const wraps = range.getClientRects().length > 1;
    img.style.marginTop = wraps ? "0px" : img.dataset.centeredMarginTop;
  }
}

function openInfoDialog() {
  infoDialog.showModal();
  infoDialog.focus();
  syncDialogHeightToPanel(infoDialog);
  alignInfoIcons();
}

function closeInfoDialog() {
  infoDialog.close();
}

infoNav.addEventListener("click", (event) => {
  const navButton = event.target.closest(".info-nav-item");
  if (!navButton) return;
  const target = document.getElementById(navButton.dataset.infoTarget);
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
});

function openSearch() {
  // Search isn't tied to a single panel, so default it to whatever the
  // currently active panel is showing. Hebrew/Greek/STR/TSK have no search
  // index, so none of them are ever offered here even if the active panel
  // has one enabled.
  const activePanel = state.panels.find((panel) => panel.id === activePanelId);
  searchTranslationOrder = enabledTranslationIds(activePanel).filter(isIndexableTranslationId);
  searchTranslationControl?.render();
  searchDialog.showModal();
  syncDialogHeightToPanel(searchDialog);
  requestAnimationFrame(() => searchInput.focus());
}

function closeSearch() {
  searchTranslationControl?.close();
  searchDialog.close();
}

function runSearch(query) {
  const translations = [...searchTranslationOrder];
  searchBookList.replaceChildren();
  searchResults.replaceChildren();
  if (!translations.length) {
    searchMeta.textContent = "Select at least one translation.";
    return;
  }
  searchRequestId += 1;
  searchMeta.textContent = "";
  searchWorker.postMessage({ type: "search", requestId: searchRequestId, query, translations });
}

// One running list of every query submitted this session. registerSearchHistoryButtons
// keeps this dialog's own prev/next arrows in sync with it.
let searchHistory = [];
let searchHistoryIndex = -1;
const searchHistoryButtonPairs = [];

function recordSearchHistory(query) {
  if (searchHistoryIndex >= 0 && searchHistory[searchHistoryIndex] === query) return;
  searchHistory = searchHistory.slice(0, searchHistoryIndex + 1);
  searchHistory.push(query);
  if (searchHistory.length > 100) searchHistory.shift();
  searchHistoryIndex = searchHistory.length - 1;
  updateSearchHistoryButtons();
}

// Moves the shared position and returns the query landed on (or null) --
// running it is the caller's own job.
function moveSearchHistory(direction) {
  const nextIndex = searchHistoryIndex + direction;
  if (nextIndex < 0 || nextIndex >= searchHistory.length) return null;
  searchHistoryIndex = nextIndex;
  updateSearchHistoryButtons();
  return searchHistory[nextIndex];
}

function updateSearchHistoryButtons() {
  for (const { back, forward } of searchHistoryButtonPairs) {
    back.disabled = searchHistoryIndex <= 0;
    forward.disabled = searchHistoryIndex < 0 || searchHistoryIndex >= searchHistory.length - 1;
  }
}

function registerSearchHistoryButtons(back, forward) {
  searchHistoryButtonPairs.push({ back, forward });
  back.disabled = searchHistoryIndex <= 0;
  forward.disabled = searchHistoryIndex < 0 || searchHistoryIndex >= searchHistory.length - 1;
}

registerSearchHistoryButtons(searchHistoryBackButton, searchHistoryForwardButton);
searchHistoryBackButton.addEventListener("click", () => {
  const query = moveSearchHistory(-1);
  if (query == null) return;
  searchInput.value = query;
  runSearch(query);
});
searchHistoryForwardButton.addEventListener("click", () => {
  const query = moveSearchHistory(1);
  if (query == null) return;
  searchInput.value = query;
  runSearch(query);
});

searchWorker.addEventListener("message", (event) => {
  const message = event.data;
  if (message.requestId !== searchRequestId) return;
  if (message.type === "progress") {
    searchMeta.textContent = "";
  } else if (message.type === "result") {
    renderSearchResults(
      message.query,
      message.matches,
      message.bookCounts,
      message.totalTranslationMatches,
      message.truncated,
      message.elapsedMs,
    );
  } else if (message.type === "error") {
    searchMeta.textContent = `Search failed: ${message.error}`;
  }
});

function renderSearchResults(query, matches, bookCounts, totalTranslationMatches, truncated, elapsedMs) {
  searchBookList.replaceChildren();
  searchResults.replaceChildren();
  const grouped = new Map();
  for (const [translation, book, chapter, verse, text] of matches) {
    const key = `${book}:${chapter}:${verse}`;
    if (!grouped.has(key)) grouped.set(key, { book, chapter, verse, lines: [] });
    grouped.get(key).lines.push({ translation, text });
  }
  const groups = [...grouped.values()].sort(
    (a, b) => a.book - b.book || a.chapter - b.chapter || a.verse - b.verse,
  );

  searchMeta.textContent = "";

  if (!groups.length) {
    const empty = document.createElement("div");
    empty.className = "panel-message";
    empty.textContent = "No results. Try another word or a shorter form.";
    searchResults.append(empty);
    return;
  }

  const total = document.createElement("div");
  total.className = "search-book-total";
  const totalName = document.createElement("span");
  totalName.className = "search-book-total-name";
  totalName.textContent = "Total";
  const totalCount = document.createElement("span");
  totalCount.className = "search-book-total-count";
  const totalMatches = bookCounts.reduce((sum, [, count]) => sum + count, 0);
  totalCount.textContent = ` (${totalMatches.toLocaleString()})`;
  total.append(totalName, totalCount);
  searchBookList.append(total);

  for (const [bookIndex, count] of bookCounts) {
    const book = manifest.books[bookIndex];
    const link = document.createElement("button");
    link.className = "search-book-link";
    link.type = "button";
    link.textContent = `${book.en} ${book.ko} (${count.toLocaleString()})`;
    link.addEventListener("click", () => {
      searchBookList.querySelectorAll(".search-book-link").forEach((item) => {
        item.toggleAttribute("aria-current", item === link);
      });
      const target = searchResults.querySelector(`.search-result[data-book="${bookIndex}"]`);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    searchBookList.append(link);
  }

  for (const result of groups) {
    const item = document.createElement("article");
    item.className = "search-result";
    item.dataset.book = String(result.book);
    const content = document.createElement("div");
    content.className = "search-result-content";
    const reference = document.createElement("div");
    reference.className = "search-reference";
    const referenceTitle = document.createElement("div");
    referenceTitle.className = "search-reference-title";
    const referenceText = document.createElement("span");
    const resultLanguages = new Set(result.lines.map((line) => translationLanguage(line.translation)));
    const book = manifest.books[result.book];
    if (resultLanguages.size === 1 && resultLanguages.has("ko")) {
      referenceText.lang = "ko";
      referenceText.textContent = `${book.ko} ${result.chapter}:${result.verse}`;
    } else if (resultLanguages.size === 1 && resultLanguages.has("en")) {
      referenceText.lang = "en";
      referenceText.textContent = `${book.en} ${result.chapter}:${result.verse}`;
    } else {
      referenceText.textContent = `${book.en} ${book.ko} ${result.chapter}:${result.verse}`;
    }
    referenceTitle.append(referenceText);
    reference.append(referenceTitle);
    content.append(reference);

    const body = document.createElement("div");
    body.className = "search-result-body";
    content.append(body);

    const translationOrder = searchTranslationOrder;
    result.lines.sort(
      (a, b) => translationOrder.indexOf(a.translation) - translationOrder.indexOf(b.translation),
    );
    for (const line of result.lines) {
      const row = document.createElement("div");
      row.className = "search-match-line";
      row.style.setProperty("--translation-color", TRANSLATION_COLORS[line.translation]);
      const label = document.createElement("span");
      label.className = "search-match-label";
      label.lang = translationLanguage(line.translation);
      label.textContent = translationMeta(line.translation).label;
      const text = document.createElement("span");
      appendHighlighted(text, line.text, query);
      row.append(label, text);
      body.append(row);
    }
    const actions = document.createElement("div");
    actions.className = "search-result-actions";
    const viewButton = document.createElement("button");
    viewButton.type = "button";
    viewButton.className = "button button-primary icon-only-button search-result-action";
    viewButton.setAttribute("aria-label", `View ${searchResultReferenceText(result)}`);
    viewButton.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12h14"></path>
        <path d="m13 6 6 6-6 6"></path>
      </svg>
    `;
    viewButton.addEventListener("click", (event) => {
      event.stopPropagation();
      openSearchResult(result);
    });
    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "button button-secondary icon-only-button search-result-action";
    copyButton.setAttribute("aria-label", `Copy ${searchResultReferenceText(result)}`);
    copyButton.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="8" y="8" width="11" height="11" rx="2"></rect>
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path>
      </svg>
    `;
    copyButton.addEventListener("click", (event) => {
      event.stopPropagation();
      copySearchResult(result);
    });
    actions.append(viewButton, copyButton, buildTskLinkButton(result.book, result.chapter, result.verse));
    reference.append(actions);
    item.append(content);
    searchResults.append(item);
  }
}

// Each space-separated term in `query` (see search-worker.js's matching)
// gets its own highlight pass; overlapping/adjacent hits are merged so a
// run of matched text isn't split into multiple <mark> elements.
function appendHighlighted(element, text, query) {
  const normalizedText = text.toLocaleLowerCase();
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const ranges = [];
  for (const term of terms) {
    let cursor = 0;
    while (cursor < normalizedText.length) {
      const index = normalizedText.indexOf(term, cursor);
      if (index < 0) break;
      ranges.push([index, index + term.length]);
      cursor = index + term.length;
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) {
      last[1] = Math.max(last[1], range[1]);
    } else {
      merged.push(range);
    }
  }
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) element.append(document.createTextNode(text.slice(cursor, start)));
    const mark = document.createElement("mark");
    mark.textContent = text.slice(start, end);
    element.append(mark);
    cursor = end;
  }
  if (cursor < text.length) element.append(document.createTextNode(text.slice(cursor)));
}

function searchResultReferenceText(result) {
  const book = manifest.books[result.book];
  const resultLanguages = new Set((result.lines ?? []).map((line) => translationLanguage(line.translation)));
  if (resultLanguages.size === 1 && resultLanguages.has("ko")) {
    return `${book.ko} ${result.chapter}:${result.verse}`;
  }
  if (resultLanguages.size === 1 && resultLanguages.has("en")) {
    return `${book.en} ${result.chapter}:${result.verse}`;
  }
  return `${book.en} ${book.ko} ${result.chapter}:${result.verse}`;
}

function openSearchResult(result) {
  enterMovePicking(result.book, result.chapter, result.verse, closeSearch);
}

async function copySearchResult(result) {
  await openCopyDialogForVerse(result.book, result.chapter, result.verse, searchTranslationOrder);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function init() {
  try {
    const response = await fetch(`./data/manifest.json?v=${ASSET_VERSION}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load site data (${response.status})`);
    manifest = await response.json();
    state = loadState();
    sanitizeState();
    // Restored panels may already carry linkGroupId values from before
    // reload; catch linkGroupIdCounter up to whatever was restored so the
    // next brand-new group created this session can never collide with
    // (and silently merge into) a still-active restored group's id.
    for (const panel of state.panels) {
      if (panel.linkGroupId != null && panel.linkGroupId >= linkGroupIdCounter) linkGroupIdCounter = panel.linkGroupId;
    }
    applyTouchPanelCount();
    applyFontSize();
    copyTranslationControl = setupDialogTranslationControl({
      picker: copyTranslationPicker,
      toggle: copyTranslationPickerToggle,
      menu: copyTranslationPickerMenu,
      list: copyTranslations,
      getOrder: () => copyTranslationOrder,
      setOrder: (order) => {
        copyTranslationOrder = order;
      },
      // No getOriginalLanguageTestament here -- unlike each reading panel's
      // own picker, the copy dialog's "add version" popup never offers the
      // Hebrew/Greek interlinear "translations" at all (copying plain text
      // is the point; there's no sensible verse-by-verse plain-text form of
      // an interlinear to copy).
      onChange: () => {
        copyStatus.textContent = "";
      },
    });
    searchTranslationOrder = [...DEFAULT_ENABLED_TRANSLATIONS];
    searchTranslationControl = setupDialogTranslationControl({
      picker: searchTranslationPicker,
      toggle: searchTranslationPickerToggle,
      menu: searchTranslationPickerMenu,
      list: searchTranslationList,
      getOrder: () => searchTranslationOrder,
      setOrder: (order) => {
        searchTranslationOrder = order;
      },
      onChange: () => {
        const query = searchInput.value.trim();
        if (searchDialog.open && query) runSearch(query);
      },
    });
    highlightTranslationControl = setupDialogTranslationControl({
      picker: highlightTranslationPicker,
      toggle: highlightTranslationPickerToggle,
      menu: highlightTranslationPickerMenu,
      list: highlightTranslations,
      getOrder: () => highlightTranslationOrder,
      setOrder: (order) => {
        highlightTranslationOrder = order;
      },
      // No getOriginalLanguageTestament here either, same reasoning as the
      // copy dialog's own picker above -- Hebrew/Greek has no
      // .translation-text of its own for buildTranslationLinesInto to hang
      // a highlight background on (see its isOriginalLanguage branch).
      onChange: () => {
        highlightStatus.textContent = "";
      },
    });
    setupTskControls();
    setupBookmarkListControls();
    setupCopyRangeControls();
    setupHighlightRangeControls();
    setupNoteRangeControls();
    // Same combobox as every book/chapter/verse selector (see
    // setupCombobox) -- picking a number here is immediate, exactly like
    // picking a verse navigates immediately: it both updates panelFitCount
    // and (on desktop) activates the fit-count preset with it right away,
    // which is also what turns the adjacent "two panels" button green (see
    // updatePanelCountControls's own twoSelected check).
    setupCombobox({
      input: panelFitCountInput,
      menu: panelFitCountMenu,
      items: [2, 3, 4].map((n) => ({ value: n, label: String(n) })),
      selectedValue: state.panelFitCount,
      matches: (item, query) => !query.trim() || item.label.startsWith(query.trim()),
      onSelect: (n) => {
        state.panelFitCount = n;
        if (desktopLikePanels()) setDesktopPanelMode(n);
        else saveState();
      },
      selectOnFocus: false,
    });
    for (const panel of state.panels) createPanelElement(panel);
    if (desktopLikePanels()) applyDesktopPanelWidths();
    saveState();
  } catch (error) {
    panelTrack.innerHTML = `<div class="panel-message error">Could not start the site: ${escapeHtml(error.message)}<br />Use a local HTTP server when previewing.</div>`;
  }
}

siteBrand.addEventListener("click", resetSite);
siteBrand.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  resetSite();
});
addPanelButton.addEventListener("click", () => {
  if (pendingMoveReference) moveToNewPanel();
  else if (pendingLinkSource) linkToNewPanel();
  else addPanel();
});
cancelMovePickingButton.addEventListener("click", exitMovePicking);
cancelLinkPickingButton.addEventListener("click", exitLinkPicking);
panelCountOneButton.addEventListener("click", () => {
  if (desktopLikePanels()) setDesktopPanelMode(1);
  else setTouchPanelCount(1);
});
panelCountTwoButton.addEventListener("click", () => {
  if (desktopLikePanels()) setDesktopPanelMode(state.panelFitCount);
  else setTouchPanelCount(2);
});
fontSizeDownButton.addEventListener("click", () => changeFontSize(-1));
fontSizeUpButton.addEventListener("click", () => changeFontSize(1));
openSearchButton.addEventListener("click", openSearch);
closeSearchButton.addEventListener("click", closeSearch);
searchDialog.addEventListener("click", (event) => {
  if (event.target === searchDialog) closeSearch();
});
closeCopyButton.addEventListener("click", closeCopyDialog);
cancelCopyButton?.addEventListener("click", closeCopyDialog);
confirmCopyButton.addEventListener("click", copySelectedVerses);
function setCopyOrder(order) {
  copyOrder = order;
  for (const option of copyOrderOptions) {
    const selected = option.dataset.copyOrder === order;
    option.classList.toggle("selected", selected);
    option.setAttribute("aria-pressed", String(selected));
  }
}

for (const option of copyOrderOptions) {
  option.addEventListener("click", () => setCopyOrder(option.dataset.copyOrder));
}
function setCopyReadingNumbering(value) {
  copyReadingNumbering = value;
  for (const option of copyNumberingOptions) {
    const selected = option.dataset.copyNumbering === value;
    option.classList.toggle("selected", selected);
    option.setAttribute("aria-pressed", String(selected));
  }
}

for (const option of copyNumberingOptions) {
  option.addEventListener("click", () => setCopyReadingNumbering(option.dataset.copyNumbering));
}

// Turning this on swaps the "Order" fieldset's own verse/version buttons
// for text-only/text-with-numbers ones (see copySelectedVerses' matching
// branch) -- continuous prose has no verse-by-verse interleaving to
// choose, so there's nothing left for that fieldset to offer but
// numbering.
function setCopyReadingModeOn(on) {
  copyReadingModeOn = on;
  copyReadingModeToggle.classList.toggle("selected", on);
  copyReadingModeToggle.setAttribute("aria-pressed", String(on));
  copyOrderGroupEl.hidden = on;
  copyNumberingGroupEl.hidden = !on;
  copyOrderLegendEl.textContent = on ? "Numbering" : "Order";
}

copyReadingModeToggle.addEventListener("click", () => setCopyReadingModeOn(!copyReadingModeOn));
copyDialog.addEventListener("click", (event) => {
  if (event.target === copyDialog) closeCopyDialog();
});
closeHighlightButton.addEventListener("click", closeHighlightDialog);
confirmHighlightButton.addEventListener("click", applyHighlight);
for (const option of highlightColorOptions) {
  option.addEventListener("click", () => setHighlightColor(option.dataset.highlightColor));
}
highlightDialog.addEventListener("click", (event) => {
  if (event.target === highlightDialog) closeHighlightDialog();
});
// Pressing the popup's own dead space (its padding, or the gap between
// the swatch/colors and the remove button) is a mousedown on the popup
// element itself, not on any button inside it -- left alone, that still
// runs the browser's default mousedown behavior of blurring whatever's
// currently focused and leaving nothing focused (or moving focus to the
// popup's own nearest focusable ancestor), which visibly shows as a
// blinking caret landing back on the swatch/color button that was
// focused a moment ago. Blocking the default there (while still leaving
// clicks on the swatch/remove/color buttons themselves untouched, since
// their own target isn't the popup) keeps focus exactly where it was.
highlightManagePopup.addEventListener("mousedown", (event) => {
  if (event.target === highlightManagePopup) event.preventDefault();
});
highlightManageRemoveButton.addEventListener("click", removeHighlight);
highlightManageSwatch.addEventListener("click", () => {
  highlightManageSwatch.hidden = true;
  highlightManageColors.hidden = false;
  positionHighlightManagePopup();
});
for (const option of highlightManageColorOptions) {
  option.addEventListener("click", () => setHighlightManageColor(option.dataset.highlightColor));
}
document.addEventListener("pointerdown", (event) => {
  if (highlightManagePopup.hidden) return;
  if (highlightManagePopup.contains(event.target)) return;
  hideHighlightManagePopup();
  // Same reasoning as shieldOutsidePress's own comment -- the press that
  // dismissed this popup shouldn't also land on whatever verse or button
  // happened to be underneath it.
  shieldOutsidePress(event);
});
// Capture phase: .panel-content's own scroll (like any nested scrollable
// element) never bubbles to document, but a capturing listener still sees
// it on the way down -- the simplest way to notice "the highlighted text
// this popup was placed next to just moved" without tracking every
// scrollable ancestor individually.
document.addEventListener("scroll", () => {
  if (!highlightManagePopup.hidden) hideHighlightManagePopup();
}, true);
// Same reasoning as highlightManagePopup's own mousedown guard above.
bookmarkManagePopup.addEventListener("mousedown", (event) => {
  if (event.target === bookmarkManagePopup) event.preventDefault();
});
bookmarkManageRemoveButton.addEventListener("click", removeBookmark);
document.addEventListener("pointerdown", (event) => {
  if (bookmarkManagePopup.hidden) return;
  if (bookmarkManagePopup.contains(event.target)) return;
  hideBookmarkManagePopup();
  shieldOutsidePress(event);
});
document.addEventListener("scroll", () => {
  if (!bookmarkManagePopup.hidden) hideBookmarkManagePopup();
}, true);
closeNoteButton.addEventListener("click", closeNoteDialog);
confirmNoteButton.addEventListener("click", applyNote);
noteDialog.addEventListener("click", (event) => {
  if (event.target === noteDialog) closeNoteDialog();
});
// Same reasoning as highlightManagePopup's own mousedown guard above.
noteViewPopup.addEventListener("mousedown", (event) => {
  if (event.target === noteViewPopup) event.preventDefault();
});
noteViewRemoveButton.addEventListener("click", removeNote);
document.addEventListener("pointerdown", (event) => {
  if (noteViewPopup.hidden) return;
  if (noteViewPopup.contains(event.target)) return;
  hideNoteViewPopup();
  shieldOutsidePress(event);
});
document.addEventListener("scroll", () => {
  if (!noteViewPopup.hidden) hideNoteViewPopup();
}, true);
closeStrongsButton.addEventListener("click", closeStrongsDialog);
strongsDialog.addEventListener("click", (event) => {
  if (event.target === strongsDialog) closeStrongsDialog();
});
closeTskButton.addEventListener("click", closeTskDialog);
tskDialog.addEventListener("click", (event) => {
  if (event.target === tskDialog) closeTskDialog();
});
closeHighlightListButton.addEventListener("click", closeHighlightListDialog);
highlightListDialog.addEventListener("click", (event) => {
  if (event.target === highlightListDialog) closeHighlightListDialog();
});
closeBookmarkListButton.addEventListener("click", closeBookmarkListDialog);
bookmarkListDialog.addEventListener("click", (event) => {
  if (event.target === bookmarkListDialog) closeBookmarkListDialog();
});
closeNoteListButton.addEventListener("click", closeNoteListDialog);
noteListDialog.addEventListener("click", (event) => {
  if (event.target === noteListDialog) closeNoteListDialog();
});
closeInfoButton.addEventListener("click", closeInfoDialog);
infoDialog.addEventListener("click", (event) => {
  if (event.target === infoDialog) closeInfoDialog();
});
searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const query = searchInput.value.trim();
  if (query.length < 1) return;
  runSearch(query);
  recordSearchHistory(query);
});
searchInputClear.addEventListener("click", () => {
  searchInput.value = "";
  searchInput.focus();
});
portraitLayout.addEventListener("change", schedulePanelLayoutAlignment);
phonePortraitLayout.addEventListener("change", schedulePanelLayoutAlignment);
touchPanelToggleLayout.addEventListener("change", schedulePanelLayoutAlignment);
touchPanelToggleLayout.addEventListener("change", syncTrackFreeScroll);

init();
