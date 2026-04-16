/* ===========================
   iTab - script.js
   =========================== */

'use strict';

// ===========================
// 기본 설정값
// ===========================
const DEFAULT_SETTINGS = {
  theme: 'system',
  bgSource: 'none',
  pixabayApiKey: '',
  pixabayApiKeyLocked: false,
  pixabayKeyword: '',
  bgImageUrl: '',
  bgHistory: [],          // [{url, thumb, type, isPinned, updatedAt}] 최근 배경 최대 10개
  bgOverlayOpacity: 0,
  /** 배경 backdrop 블러 강도 (px, 0~32) */
  bgBlur: 0,
  searchEngine: 'naver',
  customSearchName: '',
  customSearchUrl: '',
  customSearchHome: '',
  searchWidth: 600,
  searchMarginTop: 35,
  gridGapTop: 24,
  iconCols: 8,
  iconRows: 3,
  iconGapX: 16,
  iconGapY: 16,
  iconSize: 56,
  /** 0=정사각(직각), 100=원형에 가깝게 (중간값은 모서리만 둥글게) */
  iconCornerRadius: 40,
  labelFontSize: 11,
  labelColor: '#ffffff',
  labelShadow: true,
  icons: [
    { id: 1, name: '네이버', url: 'https://naver.com',   customImageUrl: null },
    { id: 2, name: '구글',   url: 'https://google.com',  customImageUrl: null },
    { id: 3, name: '유튜브', url: 'https://youtube.com', customImageUrl: null }
  ]
};

/** 신규 아이콘·북마크 추가 시 타일 기본값 */
const DEFAULT_ICON_TILE = {
  iconZoom: 100,
  iconBackdrop: 'default',
  iconBackdropColor: '#ffffff',
  iconTileBorder: true
};

function getIconTileProps(icon) {
  const z = Number(icon.iconZoom);
  const iconZoom = Number.isFinite(z) ? Math.min(150, Math.max(50, Math.round(z))) : 100;
  let iconBackdrop = icon.iconBackdrop;
  if (!['default', 'transparent', 'solid'].includes(iconBackdrop)) iconBackdrop = 'default';
  let iconBackdropColor = typeof icon.iconBackdropColor === 'string' ? icon.iconBackdropColor.trim() : '#ffffff';
  if (!/^#[0-9a-fA-F]{6}$/.test(iconBackdropColor)) iconBackdropColor = '#ffffff';
  const iconTileBorder = icon.iconTileBorder !== false;
  return { iconZoom, iconBackdrop, iconBackdropColor, iconTileBorder };
}

function applyIconTileToWrap(el, props) {
  if (!el) return;
  const { iconBackdrop, iconBackdropColor } = props;
  el.classList.remove('icon-backdrop-transparent', 'icon-backdrop-solid');
  el.style.background = '';
  if (iconBackdrop === 'transparent') {
    el.classList.add('icon-backdrop-transparent');
  } else if (iconBackdrop === 'solid') {
    el.classList.add('icon-backdrop-solid');
    el.style.background = iconBackdropColor;
  }
  el.classList.toggle('icon-tile-no-border', props.iconTileBorder === false);
}

function applyIconContentScaleRaw(imgWrap, iconZoom) {
  const z = Math.min(150, Math.max(50, Number(iconZoom) || 100)) / 100;
  const img = imgWrap.querySelector('img');
  const letter = imgWrap.querySelector('.letter-icon');
  if (letter) {
    letter.style.transformOrigin = 'center center';
    letter.style.transform = `scale(${z})`;
    if (img) img.style.transform = '';
  } else if (img) {
    img.style.transformOrigin = 'center center';
    img.style.transform = `scale(${z})`;
  }
}

function applyIconContentScale(imgWrap, icon) {
  applyIconContentScaleRaw(imgWrap, getIconTileProps(icon).iconZoom);
}

function refreshIconTileVisuals(imgWrap, icon) {
  applyIconTileToWrap(imgWrap, getIconTileProps(icon));
  applyIconContentScale(imgWrap, icon);
}

const SEARCH_ENGINES = {
  naver:  { name: '네이버', searchUrl: 'https://search.naver.com/search.naver?query={query}', homeUrl: 'https://naver.com',  faviconUrl: 'https://www.google.com/s2/favicons?domain=naver.com&sz=64' },
  google: { name: '구글',   searchUrl: 'https://www.google.com/search?q={query}',            homeUrl: 'https://google.com', faviconUrl: 'https://www.google.com/s2/favicons?domain=google.com&sz=64' }
};

// 커맨드 검색 접두어 (예: "yt 고양이" → YouTube 검색)
const SEARCH_COMMANDS = {
  g:  { label: 'Google',    searchUrl: 'https://www.google.com/search?q={query}',                      homeUrl: 'https://google.com'         },
  n:  { label: 'Naver',     searchUrl: 'https://search.naver.com/search.naver?query={query}',          homeUrl: 'https://naver.com'          },
  yt: { label: 'YouTube',   searchUrl: 'https://www.youtube.com/results?search_query={query}',         homeUrl: 'https://youtube.com'        },
  gh: { label: 'GitHub',    searchUrl: 'https://github.com/search?q={query}',                         homeUrl: 'https://github.com'         },
  w:  { label: 'Wikipedia', searchUrl: 'https://ko.wikipedia.org/wiki/Special:Search?search={query}', homeUrl: 'https://ko.wikipedia.org'   },
  d:  { label: 'DuckDuckGo',searchUrl: 'https://duckduckgo.com/?q={query}',                           homeUrl: 'https://duckduckgo.com'     },
};

// ===========================
// 상태
// ===========================
let state = {};
let currentPage = 0;
let isEditMode = false;
let editTargetId = null;
/** @type {'add'|'edit'} */
let iconModalMode = 'edit';
/** 추가: null|dataUrl / 수정: undefined(미변경)|null(삭제)|dataUrl */
let iconModalCustomImage;
let iconModalPreviewSession = 0;

// 닉네임
let currentNickname = '';
let nicknameIsLocked = false;

// 드래그 앤 드롭 상태
let dragSourceId = null;
let dragPageSwitchTimer = null;
let dragTargetDot = null;
let dragRafId = null;
let lastDragTargetKey = null;
let dragStartTimer = null;

// ===========================
// IndexedDB 배경 이미지 캐시
// ===========================
let _bgObjectUrl    = null; // 현재 IDB blob 의 ObjectURL
let _bgObjectUrlKey = null; // _bgObjectUrl 이 생성된 idb: URL

// 배경 드롭다운 상태
let _bgDropdownOpen = false;

// 핀 아이콘 SVG 상수
const PIN_ICON_SVG = `<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2z"/></svg>`;

// ===========================
// IndexedDB 유틸
// ===========================
const IDB_NAME       = 'iTab_images';
const IDB_STORE      = 'backgrounds';
const IDB_VERSION    = 1;
const BG_HISTORY_MAX = 10;
let _idb = null;

function openIDB() {
  if (_idb) return Promise.resolve(_idb);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = e => {
      _idb = e.target.result;
      // 연결이 외부적으로 닫히면(버전 변경, 브라우저 GC 등) 캐시를 초기화
      _idb.onclose = () => { _idb = null; };
      _idb.onerror = () => { _idb = null; };
      resolve(_idb);
    };
    req.onerror = e => reject(e.target.error);
  });
}

async function idbSave(key, blob, thumb, isPinned = false, updatedAt = Date.now()) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put({
      id: key, blob, thumb: thumb || null,
      isPinned: !!isPinned, updatedAt: updatedAt || Date.now()
    });
    tx.oncomplete = resolve;
    tx.onerror    = e => reject(e.target.error);
  });
}

async function idbGet(key) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = e => resolve(e.target.result || null);
    req.onerror   = e => reject(e.target.error);
  });
}

async function idbDelete(key) {
  try {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = resolve;
      tx.onerror    = e => reject(e.target.error);
    });
  } catch { /* 무시 */ }
}

// idb: 접두어 판별 유틸
function isIdbUrl(url) {
  return typeof url === 'string' && url.startsWith('idb:');
}
function getIdbKey(idbUrl) {
  return idbUrl.slice(4); // 'idb:' 제거
}

// ObjectURL 해제
function revokeBgObjectUrl() {
  if (_bgObjectUrl) {
    URL.revokeObjectURL(_bgObjectUrl);
    _bgObjectUrl    = null;
    _bgObjectUrlKey = null;
  }
}

// Blob ↔ base64 변환
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = e => reject(e);
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') throw new Error('유효하지 않은 데이터 URL');
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) throw new Error('data: 헤더가 없는 잘못된 형식');
  const header    = dataUrl.slice(0, commaIdx);
  const b64str    = dataUrl.slice(commaIdx + 1);
  const mimeMatch = header.match(/:(.*?);/);
  const mime      = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  let binary;
  try {
    binary = atob(b64str);
  } catch (e) {
    throw new Error('base64 디코딩 실패: ' + e.message);
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });
  if (blob.size === 0) throw new Error('변환 결과 Blob 크기가 0');
  return blob;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 이미지를 최대 maxWidth px로 리사이징하고 WebP(quality)로 변환.
 * ImageSmoothing 활성화로 화질 유지.
 */
async function resizeAndConvertToWebP(source, maxWidth = 1920, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const objUrl = URL.createObjectURL(source instanceof Blob ? source : new Blob([source]));
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      try {
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
        const canvas = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(blob => {
          if (blob && blob.size > 0) { resolve(blob); return; }
          // WebP 인코딩 실패 시(일부 환경) JPEG로 폴백
          canvas.toBlob(fb => {
            if (fb && fb.size > 0) resolve(fb);
            else reject(new Error('이미지 변환 실패 (WebP·JPEG 모두 실패)'));
          }, 'image/jpeg', 0.85);
        }, 'image/webp', quality);
      } catch (e) { reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(objUrl); reject(new Error('이미지 로드 실패')); };
    img.src = objUrl;
  });
}

// ===========================
// 레거시 base64 → IndexedDB 마이그레이션
// ===========================
async function migrateOldBase64ToIdb() {
  const urlMap = {}; // 구 DataURL → 신 idb: URL 매핑
  let changed  = false;

  // 히스토리 항목 마이그레이션
  const newHistory = [];
  for (const item of (state.bgHistory || [])) {
    if (item.url && item.url.startsWith('data:') && item.type === 'local') {
      if (!urlMap[item.url]) {
        const key  = `bg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const blob = base64ToBlob(item.url);
        await idbSave(key, blob, item.thumb || null);
        urlMap[item.url] = `idb:${key}`;
      }
      newHistory.push({ ...item, url: urlMap[item.url] });
      changed = true;
    } else {
      newHistory.push(item);
    }
  }

  // bgImageUrl 마이그레이션
  let bgChanged = false;
  if (state.bgImageUrl && state.bgImageUrl.startsWith('data:')) {
    if (!urlMap[state.bgImageUrl]) {
      const key  = `bg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const blob = base64ToBlob(state.bgImageUrl);
      await idbSave(key, blob, null);
      urlMap[state.bgImageUrl] = `idb:${key}`;
    }
    state.bgImageUrl = urlMap[state.bgImageUrl];
    bgChanged = true;
  }

  if (changed) state.bgHistory = newHistory;

  const patch = {};
  if (changed)   patch.bgHistory  = newHistory;
  if (bgChanged) patch.bgImageUrl = state.bgImageUrl;
  if (Object.keys(patch).length > 0) await storageSet(patch);
}

// ===========================
// DOM 요소 캐싱
// ===========================
const dom = {
  bgImage:            () => document.getElementById('bg-image'),
  bgBlurLayer:        () => document.getElementById('bg-blur'),
  bgOverlay:          () => document.getElementById('bg-overlay'),
  searchSection:      () => document.getElementById('search-section'),
  engineBtn:          () => document.getElementById('engine-btn'),
  engineIcon:         () => document.getElementById('engine-icon'),
  searchInput:        () => document.getElementById('search-input'),
  searchSubmit:       () => document.getElementById('search-submit'),
  searchDropdown:     () => document.getElementById('search-dropdown'),
  iconGrid:           () => document.getElementById('icon-grid'),
  iconGridSection:    () => document.getElementById('icon-grid-section'),
  pageDots:           () => document.getElementById('page-dots'),
  bgHistoryBar:       () => document.getElementById('bg-history-bar'),
  settingsBtn:        () => document.getElementById('settings-btn'),
  settingsPanel:      () => document.getElementById('settings-panel'),
  settingsOverlay:    () => document.getElementById('settings-overlay'),
  settingsClose:      () => document.getElementById('settings-close'),
  editModeBar:        () => document.getElementById('edit-mode-bar'),
  themeRadios:        () => document.querySelectorAll('input[name="theme"]'),
  bgSourceRadios:     () => document.querySelectorAll('input[name="bgSource"]'),
  pixabaySettings:    () => document.getElementById('pixabay-settings'),
  localBgSettings:    () => document.getElementById('local-bg-settings'),
  pixabayApiKey:      () => document.getElementById('pixabay-api-key'),
  pixabayKeyLockBtn:  () => document.getElementById('pixabay-key-lock-btn'),
  pixabayKeyword:     () => document.getElementById('pixabay-keyword'),
  pixabaySearchBtn:   () => document.getElementById('pixabay-search-btn'),
  pixabayResults:     () => document.getElementById('pixabay-results'),
  localBgInput:       () => document.getElementById('local-bg-input'),
  localBgPreview:     () => document.getElementById('local-bg-preview'),
  overlayOpacity:     () => document.getElementById('overlay-opacity'),
  overlayOpacityVal:  () => document.getElementById('overlay-opacity-val'),
  bgBlurRange:        () => document.getElementById('bg-blur-slider'),
  bgBlurValBadge:     () => document.getElementById('bg-blur-val'),
  searchEngineRadios: () => document.querySelectorAll('input[name="searchEngine"]'),
  customSearchSettings: () => document.getElementById('custom-search-settings'),
  customSearchName:   () => document.getElementById('custom-search-name'),
  customSearchUrl:    () => document.getElementById('custom-search-url'),
  customSearchHome:   () => document.getElementById('custom-search-home'),
  searchWidth:        () => document.getElementById('search-width'),
  searchWidthVal:     () => document.getElementById('search-width-val'),
  searchMarginTop:    () => document.getElementById('search-margin-top'),
  searchMarginTopVal: () => document.getElementById('search-margin-top-val'),
  gridGapTop:         () => document.getElementById('grid-gap-top'),
  gridGapTopVal:      () => document.getElementById('grid-gap-top-val'),
  iconCols:           () => document.getElementById('icon-cols'),
  iconColsVal:        () => document.getElementById('icon-cols-val'),
  iconRows:           () => document.getElementById('icon-rows'),
  iconRowsVal:        () => document.getElementById('icon-rows-val'),
  iconGapX:           () => document.getElementById('icon-gap-x'),
  iconGapXVal:        () => document.getElementById('icon-gap-x-val'),
  iconGapY:           () => document.getElementById('icon-gap-y'),
  iconGapYVal:        () => document.getElementById('icon-gap-y-val'),
  iconSize:           () => document.getElementById('icon-size'),
  iconSizeVal:        () => document.getElementById('icon-size-val'),
  labelFontSize:      () => document.getElementById('label-font-size'),
  labelFontSizeVal:   () => document.getElementById('label-font-size-val'),
  labelColor:         () => document.getElementById('label-color'),
  labelColorHex:      () => document.getElementById('label-color-hex'),
  labelShadow:        () => document.getElementById('label-shadow'),
  sendToBookmarks:    () => document.getElementById('send-to-bookmarks-btn'),
  addFromBookmarks:   () => document.getElementById('add-from-bookmarks-btn'),
  exportBtn:          () => document.getElementById('export-btn'),
  importInput:        () => document.getElementById('import-input'),
  nicknameDisplay:    () => document.getElementById('nickname-display'),
  nicknameInput:      () => document.getElementById('nickname-input'),
  nicknameLockBtn:    () => document.getElementById('nickname-lock-btn'),
  nicknameError:      () => document.getElementById('nickname-error'),
  welcomeModal:       () => document.getElementById('welcome-modal'),
  welcomeNickInput:   () => document.getElementById('welcome-nickname-input'),
  welcomeStartBtn:    () => document.getElementById('welcome-start-btn'),
  editIconModal:      () => document.getElementById('edit-icon-modal'),
  editIconName:       () => document.getElementById('edit-icon-name'),
  editIconUrl:        () => document.getElementById('edit-icon-url'),
  editIconConfirm:    () => document.getElementById('edit-icon-confirm'),
  editIconDelete:     () => document.getElementById('edit-icon-delete'),
  bookmarkModal:      () => document.getElementById('bookmark-modal'),
  bookmarkList:       () => document.getElementById('bookmark-list'),
  bookmarkConfirm:    () => document.getElementById('bookmark-confirm')
};

// ===========================
// 스토리지 유틸
// ===========================
function storageGet(keys) {
  return new Promise(resolve => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(keys, resolve);
    } else {
      const result = {};
      (Array.isArray(keys) ? keys : Object.keys(keys)).forEach(k => {
        const val = localStorage.getItem('iTab_' + k);
        result[k] = val !== null ? JSON.parse(val) : (Array.isArray(keys) ? undefined : keys[k]);
      });
      resolve(result);
    }
  });
}

function storageSet(data) {
  return new Promise(resolve => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set(data, resolve);
    } else {
      Object.entries(data).forEach(([k, v]) => localStorage.setItem('iTab_' + k, JSON.stringify(v)));
      resolve();
    }
  });
}

/** 기본값 보간 없이 저장소에 실제로 있는 키만 (레거시 iconShape 마이그레이션용) */
function storageGetAllRaw() {
  return new Promise(resolve => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(null, resolve);
    } else {
      const result = {};
      for (let i = 0; i < localStorage.length; i++) {
        const full = localStorage.key(i);
        if (full && full.startsWith('iTab_')) {
          const short = full.slice(5);
          try {
            result[short] = JSON.parse(localStorage.getItem(full));
          } catch { /* 무시 */ }
        }
      }
      resolve(result);
    }
  });
}

/** data: 커스텀 아이콘은 chrome.storage 키 `iconImages`에만 두고 icons 배열에는 넣지 않음 */
function slimIconsAndImageMap(icons) {
  const iconImages = {};
  const slim = icons.map(icon => {
    const u = icon.customImageUrl;
    if (typeof u === 'string' && u.startsWith('data:')) {
      iconImages[String(icon.id)] = u;
      return { ...icon, customImageUrl: null };
    }
    return icon;
  });
  return { icons: slim, iconImages };
}

function mergeIconsFromMap(icons, imageMap) {
  const map = imageMap && typeof imageMap === 'object' ? imageMap : {};
  return icons.map(icon => {
    const fromMap = map[String(icon.id)];
    if (fromMap) return { ...icon, customImageUrl: fromMap };
    return { ...icon };
  });
}

/** 저장 시 icons가 포함되면 슬림 icons + iconImages를 함께 기록 */
function prepareStoragePatch(patch) {
  const out = { ...patch };
  if (Object.prototype.hasOwnProperty.call(patch, 'icons')) {
    const { icons: slim, iconImages } = slimIconsAndImageMap(state.icons);
    out.icons = slim;
    out.iconImages = iconImages;
  }
  return out;
}

// ===========================
// 설정 저장 & 로드
// ===========================
async function loadSettings() {
  const rawStored = await storageGetAllRaw();
  const stored = await storageGet({ ...DEFAULT_SETTINGS, iconImages: {} });
  const { iconImages: iconImagesFromStore, ...storedRest } = stored;
  const iconImagesStore =
    iconImagesFromStore && typeof iconImagesFromStore === 'object' ? iconImagesFromStore : {};
  state = { ...DEFAULT_SETTINGS, ...storedRest };
  delete state.iconImageFit;

  if (rawStored.iconImageFit !== undefined) {
    if (typeof chrome !== 'undefined' && chrome.storage?.local?.remove) {
      chrome.storage.local.remove('iconImageFit');
    } else {
      try { localStorage.removeItem('iTab_iconImageFit'); } catch { /* 무시 */ }
    }
  }
  if (!Object.prototype.hasOwnProperty.call(rawStored, 'iconCornerRadius')) {
    if (rawStored.iconShape === 'circle') state.iconCornerRadius = 100;
    else if (rawStored.iconShape === 'rounded') state.iconCornerRadius = 40;
  }
  {
    const cr = Number(state.iconCornerRadius);
    state.iconCornerRadius = Number.isFinite(cr) ? Math.min(100, Math.max(0, Math.round(cr))) : 40;
  }
  delete state.iconShape;
  if (!Object.prototype.hasOwnProperty.call(rawStored, 'iconCornerRadius') && rawStored.iconShape) {
    await storageSet({ iconCornerRadius: state.iconCornerRadius });
    if (typeof chrome !== 'undefined' && chrome.storage?.local?.remove) {
      chrome.storage.local.remove('iconShape');
    } else {
      try { localStorage.removeItem('iTab_iconShape'); } catch { /* 무시 */ }
    }
  }

  const rawIcons = stored.icons;
  const hadInline =
    Array.isArray(rawIcons) &&
    rawIcons.some(i => typeof i.customImageUrl === 'string' && i.customImageUrl.startsWith('data:'));

  let icons = mergeIconsFromMap(state.icons, iconImagesStore);

  if (hadInline) {
    const { icons: slim, iconImages } = slimIconsAndImageMap(icons);
    await storageSet({ icons: slim, iconImages });
    icons = mergeIconsFromMap(slim, iconImages);
  }
  state.icons = icons;

  // 최우선: IDB 배경 로드 (회색 화면 차단)
  await migrateOldBase64ToIdb();
  await validateBgHistory();
  await applyAllSettings();
  revealApp();
}

/**
 * bgHistory의 idb: URL 중 실제 IDB에 blob이 없는 항목(유령 항목)을 제거.
 * 브라우저의 IDB 자동 정리, 사이트 데이터 삭제 등으로
 * 스토리지↔IDB 간 불일치가 발생했을 때 자동 복구.
 */
async function validateBgHistory() {
  const history = Array.isArray(state.bgHistory) ? [...state.bgHistory] : [];
  if (!history.length) return;

  const valid = [];
  for (const item of history) {
    if (isIdbUrl(item.url)) {
      try {
        const rec = await idbGet(getIdbKey(item.url));
        if (rec?.blob) valid.push(item);
        // blob 없음 → 유령 항목이므로 제거
      } catch {
        // IDB 접근 오류 → 안전하게 제거
      }
    } else {
      valid.push(item); // 외부 URL(Pixabay 폴백 등)은 그대로 유지
    }
  }

  if (valid.length === history.length) return; // 변경 없음

  saveSettings({ bgHistory: valid });

  // 현재 배경 URL이 유실된 경우, 남은 항목 중 첫 번째로 대체하거나 초기화
  if (isIdbUrl(state.bgImageUrl) && !valid.find(h => h.url === state.bgImageUrl)) {
    const fallback = valid.find(h => isIdbUrl(h.url)) || null;
    saveSettings({
      bgImageUrl: fallback ? fallback.url : '',
      bgSource:   fallback ? (fallback.type || 'local') : 'none',
    });
  }
}

function revealApp() {
  function showBody() {
    document.body.style.opacity = '1';
    setTimeout(() => renderBgHistory(), 80);
  }

  const url = state.bgImageUrl;
  if (!url || state.bgSource === 'none') {
    setTimeout(showBody, 200);
    return;
  }

  // IDB 배경: applyBackground()가 이미 완료되어 ObjectURL이 적용된 상태 → 즉시 표시
  if (isIdbUrl(url)) {
    showBody();
    return;
  }

  // 외부 URL(Pixabay 폴백): 로드 대기 또는 0.2초 타임아웃
  let shown = false;
  function tryShow() {
    if (shown) return;
    shown = true;
    showBody();
  }
  setTimeout(tryShow, 200);
  const img   = new Image();
  img.onload  = tryShow;
  img.onerror = tryShow;
  img.src = url;
}

function saveSettings(patch) {
  Object.assign(state, patch);
  storageSet(prepareStoragePatch(patch));
}

// ===========================
// 전체 설정 적용
// ===========================
async function applyAllSettings() {
  applyTheme();
  await applyBackground(); // IDB 로드를 포함하므로 await 필수
  applyCSSVars();
  applySearchEngine();
  syncSettingsUI();
  currentPage = 0;
  renderIconGrid();
  // 초기 레이아웃 배치 완료 후 is-loading 제거 → 이후 슬라이더 조작 시 전환 복원
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.documentElement.classList.remove('is-loading');
  }));
}

// ===========================
// 테마 적용
// ===========================
function applyTheme() {
  const { theme } = state;
  const html = document.documentElement;
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    html.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    html.setAttribute('data-theme', theme);
  }
}

const BG_BLUR_MAX = 32;

function clampBgBlur(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(BG_BLUR_MAX, Math.max(0, Math.round(n))) : 0;
}

function applyBgBlurVisual() {
  const el = dom.bgBlurLayer();
  if (!el) return;
  const px = clampBgBlur(state.bgBlur);
  if (px <= 0) {
    el.style.backdropFilter = 'none';
    el.style.webkitBackdropFilter = 'none';
  } else {
    const b = `blur(${px}px)`;
    el.style.backdropFilter = b;
    el.style.webkitBackdropFilter = b;
  }
}

// ===========================
// 배경 적용 (async — IDB ObjectURL 캐시 포함)
// ===========================
async function applyBackground() {
  const bg      = dom.bgImage();
  const overlay = dom.bgOverlay();

  bg.classList.remove('bg-loading', 'bg-loaded');
  overlay.style.background = `rgba(0,0,0,${state.bgOverlayOpacity / 100})`;
  applyBgBlurVisual();

  if (state.bgSource !== 'none' && state.bgImageUrl) {
    const url = state.bgImageUrl;
    if (isIdbUrl(url)) {
      // 같은 키라면 ObjectURL 재사용 (불필요한 revoke 방지)
      if (url !== _bgObjectUrlKey) {
        try {
          const record = await idbGet(getIdbKey(url));
          if (record?.blob) {
            revokeBgObjectUrl();
            _bgObjectUrl    = URL.createObjectURL(record.blob);
            _bgObjectUrlKey = url;
          } else {
            // IDB에 레코드 없음 → 이전 ObjectURL도 함께 해제해야 올드 배경이 잔류하지 않음
            revokeBgObjectUrl();
          }
        } catch {
          // IDB 오류 → 이전 ObjectURL 잔류 방지
          revokeBgObjectUrl();
        }
      }
      bg.style.backgroundImage = _bgObjectUrl ? `url("${_bgObjectUrl}")` : 'none';
    } else {
      // 외부 URL (Pixabay 폴백 등)
      _bgObjectUrlKey = null;
      bg.style.backgroundImage = `url("${url}")`;
    }
  } else {
    bg.style.backgroundImage = 'none';
  }
}

// ===========================
// CSS 변수 적용
// ===========================
function applyCSSVars() {
  const root = document.documentElement;
  root.style.setProperty('--icon-cols',         state.iconCols);
  root.style.setProperty('--icon-rows',         state.iconRows);
  root.style.setProperty('--icon-gap-x',        state.iconGapX + 'px');
  root.style.setProperty('--icon-gap-y',        state.iconGapY + 'px');
  root.style.setProperty('--icon-size',         state.iconSize + 'px');
  root.style.setProperty('--grid-gap-top',      state.gridGapTop + 'px');
  root.style.setProperty('--search-width',      state.searchWidth + 'px');
  root.style.setProperty('--search-margin-top', state.searchMarginTop + '%');
  root.style.setProperty('--label-font-size',   state.labelFontSize + 'px');
  root.style.setProperty('--label-color',       state.labelColor);
  root.style.setProperty('--label-shadow',
    state.labelShadow ? '0 1px 3px rgba(0,0,0,0.8)' : 'none'
  );
  root.style.setProperty('--icon-img-object-fit', 'cover');
  const cr = Number(state.iconCornerRadius);
  root.style.setProperty('--icon-corner-radius', String(
    Number.isFinite(cr) ? Math.min(100, Math.max(0, Math.round(cr))) : 40
  ));
}

// ===========================
// 검색 엔진 적용
// ===========================
function applySearchEngine() {
  const icon = dom.engineIcon();
  let faviconUrl;
  if (state.searchEngine === 'custom') {
    const url = state.customSearchHome || state.customSearchUrl || '';
    try {
      const domain = url ? new URL(url).hostname : '';
      faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : '';
    } catch {
      faviconUrl = '';
    }
  } else {
    faviconUrl = SEARCH_ENGINES[state.searchEngine]?.faviconUrl || '';
  }
  icon.src = faviconUrl;
  icon.alt = state.searchEngine === 'custom' ? state.customSearchName : SEARCH_ENGINES[state.searchEngine]?.name;
}

// ===========================
// 설정 UI 동기화
// ===========================
function syncSettingsUI() {
  // 테마
  dom.themeRadios().forEach(r => { r.checked = r.value === state.theme; });

  // 배경
  dom.bgSourceRadios().forEach(r => { r.checked = r.value === state.bgSource; });
  toggleBgSourceUI(state.bgSource);
  dom.pixabayApiKey().value = state.pixabayApiKey || '';
  applyApiKeyLockUI(state.pixabayApiKeyLocked);
  dom.pixabayKeyword().value = state.pixabayKeyword || '';
  dom.overlayOpacity().value = state.bgOverlayOpacity;
  dom.overlayOpacityVal().textContent = state.bgOverlayOpacity + '%';
  const bgBlur = clampBgBlur(state.bgBlur);
  state.bgBlur = bgBlur;
  dom.bgBlurRange().value = String(bgBlur);
  dom.bgBlurValBadge().textContent = bgBlur + 'px';

  // 로컬 배경 미리보기: IDB ObjectURL 또는 히스토리 썸네일 사용
  if (state.bgSource === 'local' && state.bgImageUrl) {
    const preview = dom.localBgPreview();
    let previewUrl = '';
    if (isIdbUrl(state.bgImageUrl)) {
      previewUrl = _bgObjectUrl ||
        (state.bgHistory?.find(h => h.url === state.bgImageUrl)?.thumb) || '';
    } else {
      previewUrl = state.bgImageUrl;
    }
    if (previewUrl) {
      preview.style.backgroundImage = `url("${previewUrl}")`;
      preview.classList.remove('hidden');
    }
  }

  // 검색엔진
  dom.searchEngineRadios().forEach(r => { r.checked = r.value === state.searchEngine; });
  toggleCustomSearchUI(state.searchEngine === 'custom');
  dom.customSearchName().value = state.customSearchName || '';
  dom.customSearchUrl().value  = state.customSearchUrl  || '';
  dom.customSearchHome().value = state.customSearchHome || '';

  // 슬라이더
  setSlider('search-width',    state.searchWidth,     v => v + 'px');
  setSlider('search-margin-top', state.searchMarginTop, v => v + '%');
  setSlider('grid-gap-top',    state.gridGapTop,      v => v + 'px');
  setSlider('icon-cols',       state.iconCols,        v => v + '');
  setSlider('icon-rows',       state.iconRows,        v => v + '');
  setSlider('icon-gap-x',      state.iconGapX,        v => v + 'px');
  setSlider('icon-gap-y',      state.iconGapY,        v => v + 'px');
  setSlider('icon-size',       state.iconSize,        v => v + 'px');
  setSlider('label-font-size', state.labelFontSize,   v => v + 'px');

  setSlider('icon-corner-radius', state.iconCornerRadius, v => `${v}%`);

  // 색상
  dom.labelColor().value = state.labelColor;
  dom.labelColorHex().textContent = state.labelColor;

  // 체크박스
  dom.labelShadow().checked = state.labelShadow;
}

function setSlider(id, value, formatter) {
  const slider = document.getElementById(id);
  const badge  = document.getElementById(id + '-val');
  if (slider) slider.value = value;
  if (badge)  badge.textContent = formatter(value);
}

function toggleBgSourceUI(source) {
  dom.pixabaySettings().classList.toggle('hidden', source !== 'pixabay');
  dom.localBgSettings().classList.toggle('hidden', source !== 'local');
}

function toggleCustomSearchUI(show) {
  dom.customSearchSettings().classList.toggle('hidden', !show);
}

// ===========================
// 아이콘 그리드 렌더링
// ===========================
function renderIconGrid() {
  const grid    = dom.iconGrid();
  const perPage = state.iconCols * state.iconRows;
  const icons   = state.icons;
  const totalPages = Math.ceil((icons.length + 1) / perPage);

  if (currentPage >= totalPages) currentPage = Math.max(0, totalPages - 1);

  const startIdx   = currentPage * perPage;
  const endIdx     = startIdx + perPage;
  const pageIcons  = icons.slice(startIdx, endIdx);

  const addBtnGlobalSlot = icons.length;
  const addBtnPage       = Math.floor(addBtnGlobalSlot / perPage);
  const showAddBtn       = addBtnPage === currentPage;

  grid.innerHTML = '';

  pageIcons.forEach(icon => grid.appendChild(createIconElement(icon)));

  if (showAddBtn) grid.appendChild(createAddButton());

  const filledSlots = pageIcons.length + (showAddBtn ? 1 : 0);
  for (let i = filledSlots; i < perPage; i++) {
    const placeholder = document.createElement('div');
    placeholder.className = 'icon-placeholder';
    placeholder.style.cssText = `width:calc(var(--icon-size)+24px); height:1px; visibility:hidden;`;
    grid.appendChild(placeholder);
  }

  renderPageNav(totalPages);
}

function createIconElement(icon) {
  const wrap = document.createElement('div');
  wrap.className = 'icon-item';
  wrap.dataset.id = icon.id;
  wrap.draggable = true;

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'icon-delete-btn';
  deleteBtn.type = 'button';
  deleteBtn.setAttribute('aria-label', '아이콘 삭제');
  deleteBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  deleteBtn.addEventListener('click', e => {
    e.stopPropagation();
    deleteIcon(icon.id, true);
  });

  const imgWrap = document.createElement('div');
  imgWrap.className = 'icon-img-wrap';
  applyIconTileToWrap(imgWrap, getIconTileProps(icon));

  const img = document.createElement('img');
  img.alt = icon.name;
  img.draggable = false;
  imgWrap.appendChild(img);

  loadFaviconWithFallback(img, imgWrap, icon);

  const label = document.createElement('span');
  label.className = 'icon-label';
  label.textContent = icon.name;

  wrap.appendChild(deleteBtn);
  wrap.appendChild(imgWrap);
  wrap.appendChild(label);

  wrap.addEventListener('click', () => {
    if (isEditMode) {
      openEditModal(icon.id);
    } else {
      window.location.href = icon.url;
    }
  });

  return wrap;
}

// ===========================
// 아이콘 이미지 3단계 폴백
// ===========================
async function loadFaviconWithFallback(imgEl, imgWrap, icon) {
  const finishImg = () => refreshIconTileVisuals(imgWrap, icon);

  if (icon.customImageUrl) {
    imgEl.style.display = '';
    imgWrap.querySelector('.letter-icon')?.remove();
    imgEl.onload  = finishImg;
    imgEl.onerror = finishImg;
    imgEl.src = icon.customImageUrl;
    if (imgEl.complete && imgEl.naturalWidth) finishImg();
    return;
  }

  let domain;
  try {
    domain = new URL(icon.url).hostname;
  } catch {
    showLetterIcon(imgEl, imgWrap, icon.name, icon.url, icon);
    return;
  }

  const googleUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  const googleImg = await tryLoadImage(googleUrl);
  if (googleImg && googleImg.naturalWidth > 16) {
    imgEl.style.display = '';
    imgWrap.querySelector('.letter-icon')?.remove();
    imgEl.onload  = finishImg;
    imgEl.onerror = finishImg;
    imgEl.src = googleUrl;
    if (imgEl.complete && imgEl.naturalWidth) finishImg();
    return;
  }

  const horseUrl = `https://icon.horse/icon/${domain}`;
  const horseImg = await tryLoadImage(horseUrl);
  if (horseImg) {
    imgEl.style.display = '';
    imgWrap.querySelector('.letter-icon')?.remove();
    imgEl.onload  = finishImg;
    imgEl.onerror = finishImg;
    imgEl.src = horseUrl;
    if (imgEl.complete && imgEl.naturalWidth) finishImg();
    return;
  }

  showLetterIcon(imgEl, imgWrap, icon.name, icon.url, icon);
}

function tryLoadImage(url) {
  return new Promise(resolve => {
    const img   = new Image();
    const timer = setTimeout(() => resolve(null), 5000);
    img.onload  = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = url;
  });
}

function showLetterIcon(imgEl, imgWrap, name, url, icon) {
  imgEl.style.display = 'none';
  const existing = imgWrap.querySelector('.letter-icon');
  if (existing) existing.remove();

  const div = document.createElement('div');
  div.className   = 'letter-icon';
  div.textContent = (name || '?')[0].toUpperCase();
  div.style.background = getPastelGradient(url || name || '');
  imgWrap.appendChild(div);
  if (icon) refreshIconTileVisuals(imgWrap, icon);
}

function getPastelGradient(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0;
  }
  const h1 = Math.abs(hash) % 360;
  const h2 = (h1 + 45) % 360;
  return `linear-gradient(135deg, hsla(${h1},60%,62%,0.55), hsla(${h2},55%,55%,0.45))`;
}

function createAddButton() {
  const wrap = document.createElement('button');
  wrap.className = 'icon-add-btn';
  wrap.type = 'button';
  wrap.setAttribute('aria-label', '아이콘 추가');

  const imgWrap = document.createElement('div');
  imgWrap.className = 'icon-img-wrap';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>';
  imgWrap.appendChild(svg);

  const label = document.createElement('span');
  label.className = 'icon-label';
  label.textContent = '추가';

  wrap.appendChild(imgWrap);
  wrap.appendChild(label);
  wrap.addEventListener('click', () => openAddModal());

  return wrap;
}

function getFaviconUrl(url) {
  try {
    const { hostname } = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=128`;
  } catch {
    return '';
  }
}

// ===========================
// 페이지 점 인디케이터 렌더링
// ===========================
function renderPageNav(totalPages) {
  const container = dom.pageDots();
  if (!container) return;

  container.innerHTML = '';
  const pages = Math.max(1, totalPages);

  for (let p = 0; p < pages; p++) {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'page-dot' + (p === currentPage ? ' active' : '');
    dot.dataset.page = String(p);
    dot.setAttribute('role', 'tab');
    dot.setAttribute('aria-label', `페이지 ${p + 1}`);
    dot.setAttribute('aria-selected', p === currentPage ? 'true' : 'false');
    container.appendChild(dot);
  }
}

function goToPage(n) {
  const perPage    = state.iconCols * state.iconRows;
  const totalPages = Math.ceil((state.icons.length + 1) / perPage);
  const target     = Math.max(0, Math.min(n, totalPages - 1));
  if (target === currentPage) return;

  const direction = target > currentPage ? 'next' : 'prev';
  currentPage = target;
  renderIconGrid();

  const grid = dom.iconGrid();
  grid.classList.remove('anim-next', 'anim-prev');
  void grid.offsetWidth;
  grid.classList.add('anim-' + direction);
}

// ===========================
// 마우스 휠 페이지 전환
// ===========================
let wheelLock = false;
document.addEventListener('wheel', e => {
  if (e.target.closest('#settings-panel') || e.target.closest('.modal-content')) return;
  if (wheelLock) return;
  wheelLock = true;
  setTimeout(() => { wheelLock = false; }, 260);
  if (e.deltaY > 0) goToPage(currentPage + 1);
  else              goToPage(currentPage - 1);
}, { passive: true });

// ===========================
// 우클릭 수정 모드
// ===========================
document.addEventListener('contextmenu', e => {
  const iconItem = e.target.closest('.icon-item');
  if (!iconItem) return;
  e.preventDefault();
  if (!isEditMode) enterEditMode();
});

function enterEditMode() {
  isEditMode = true;
  const grid = dom.iconGrid();
  grid.classList.add('edit-mode');
  grid.querySelectorAll('.icon-item').forEach(el => { el.draggable = false; });
  dom.editModeBar().classList.remove('hidden');
}

function exitEditMode() {
  isEditMode = false;
  const grid = dom.iconGrid();
  grid.classList.remove('edit-mode');
  grid.querySelectorAll('.icon-item').forEach(el => { el.draggable = true; });
  dom.editModeBar().classList.add('hidden');
  editTargetId = null;
}

/** 메인 작업 영역의 빈 바탕(아이콘·검색창·그리드 네비 제외) 클릭 */
function isWorkspaceBackdropClick(target) {
  if (!target?.closest) return false;
  if (target.closest('.modal:not(.hidden), #settings-panel.open, #settings-overlay.visible')) return false;
  const main = document.getElementById('main-container');
  if (!main?.contains(target)) return false;
  if (target.closest('#search-section')) return false;
  if (target.closest('.icon-item, .icon-add-btn, .page-dot, #page-dots')) return false;
  return true;
}

// ===========================
// 아이콘 추가·수정 공통 모달
// ===========================
const EDIT_PREVIEW_PLACEHOLDER_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';

function resetIconModalUploadPreview() {
  const previewImg  = document.getElementById('edit-icon-img-preview');
  const previewPh   = document.getElementById('edit-icon-preview-ph');
  const previewWrap = document.getElementById('edit-icon-preview-wrap');
  const resetBtn    = document.getElementById('edit-icon-file-reset');
  if (previewImg)  { previewImg.src = ''; previewImg.classList.add('hidden'); }
  if (previewPh) {
    previewPh.innerHTML = EDIT_PREVIEW_PLACEHOLDER_SVG;
    previewPh.classList.remove('hidden');
  }
  if (previewWrap) previewWrap.classList.remove('has-image');
  if (resetBtn)    resetBtn.classList.add('hidden');
}

function setIconModalUploadPreview(dataUrl) {
  const previewImg  = document.getElementById('edit-icon-img-preview');
  const previewPh   = document.getElementById('edit-icon-preview-ph');
  const previewWrap = document.getElementById('edit-icon-preview-wrap');
  const resetBtn    = document.getElementById('edit-icon-file-reset');
  if (previewImg)  { previewImg.src = dataUrl; previewImg.classList.remove('hidden'); }
  if (previewPh)   previewPh.classList.add('hidden');
  if (previewWrap) previewWrap.classList.add('has-image');
  if (resetBtn)    resetBtn.classList.remove('hidden');
}

function bumpIconModalPreviewSession() {
  iconModalPreviewSession++;
  return iconModalPreviewSession;
}

function applyIconModalChrome() {
  const del = document.getElementById('edit-icon-delete');
  const title = document.getElementById('edit-modal-title');
  const confirm = document.getElementById('edit-icon-confirm');
  const resetLabel = document.getElementById('edit-icon-file-reset');
  if (iconModalMode === 'add') {
    del?.classList.add('hidden');
    if (title) title.textContent = '아이콘 추가';
    if (confirm) confirm.textContent = '추가';
    if (resetLabel) resetLabel.textContent = '초기화';
  } else {
    del?.classList.remove('hidden');
    if (title) title.textContent = '아이콘 수정';
    if (confirm) confirm.textContent = '저장';
    if (resetLabel) resetLabel.textContent = '이미지 삭제';
  }
}

let iconModalUrlPreviewTimer = null;
function scheduleIconModalUrlPreview() {
  if (iconModalMode !== 'add') return;
  if (iconModalCustomImage) return;
  clearTimeout(iconModalUrlPreviewTimer);
  iconModalUrlPreviewTimer = setTimeout(() => {
    iconModalUrlPreviewTimer = null;
    const urlRaw = dom.editIconUrl().value.trim();
    const name = dom.editIconName().value.trim() || '?';
    if (!urlRaw) {
      resetIconModalUploadPreview();
      syncEditIconTilePreview();
      return;
    }
    let normalized;
    try {
      normalized = normalizeUrl(urlRaw);
      new URL(normalized);
    } catch {
      bumpIconModalPreviewSession();
      showEditPreviewLetter({ name, url: urlRaw });
      syncEditIconTilePreview();
      return;
    }
    bumpIconModalPreviewSession();
    const sid = iconModalPreviewSession;
    void loadIconModalAutomaticPreview({ id: 0, name, url: normalized }, sid);
  }, 350);
}

function openAddModal() {
  iconModalMode = 'add';
  editTargetId = null;
  iconModalCustomImage = null;
  bumpIconModalPreviewSession();
  dom.editIconName().value = '';
  dom.editIconUrl().value = '';
  const zoomEl = document.getElementById('edit-icon-zoom');
  const zoomVal = document.getElementById('edit-icon-zoom-val');
  if (zoomEl) zoomEl.value = '100';
  if (zoomVal) zoomVal.textContent = '100%';
  document.querySelectorAll('input[name="edit-icon-backdrop"]').forEach(r => {
    r.checked = r.value === 'default';
  });
  const bc = document.getElementById('edit-icon-backdrop-color');
  const bx = document.getElementById('edit-icon-backdrop-color-hex');
  if (bc) bc.value = '#ffffff';
  if (bx) bx.value = '#ffffff';
  const borderCb = document.getElementById('edit-icon-tile-border');
  if (borderCb) borderCb.checked = true;
  toggleEditBackdropColorRow();
  resetIconModalUploadPreview();
  applyIconModalChrome();
  syncEditIconTilePreview();
  dom.editIconModal().classList.remove('hidden');
  setTimeout(() => dom.editIconName().focus(), 50);
}

function closeModal(modalEl) {
  if (modalEl?.id === 'edit-icon-modal') {
    clearTimeout(iconModalUrlPreviewTimer);
    iconModalUrlPreviewTimer = null;
    bumpIconModalPreviewSession();
  }
  modalEl.classList.add('hidden');
}

function bindIconModalFileInput() {
  const fileInput = document.getElementById('edit-icon-file');
  const resetBtn  = document.getElementById('edit-icon-file-reset');
  if (!fileInput) return;

  fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target.result;
      bumpIconModalPreviewSession();
      setIconModalUploadPreview(dataUrl);
      iconModalCustomImage = dataUrl;
      syncEditIconTilePreview();
    };
    reader.readAsDataURL(file);
    fileInput.value = '';
  });

  resetBtn?.addEventListener('click', () => {
    resetIconModalUploadPreview();
    iconModalCustomImage = null;
    if (iconModalMode === 'edit') {
      const icon = state.icons.find(i => i.id === editTargetId);
      if (icon) {
        const sid = bumpIconModalPreviewSession();
        void loadIconModalAutomaticPreview(icon, sid);
      }
    } else {
      scheduleIconModalUrlPreview();
    }
    syncEditIconTilePreview();
  });
}

// ===========================
// 아이콘 수정 모달
// ===========================
function toggleEditBackdropColorRow() {
  const solid = document.querySelector('input[name="edit-icon-backdrop"][value="solid"]')?.checked;
  document.getElementById('edit-icon-backdrop-color-row')?.classList.toggle('hidden', !solid);
}

function normalizeIconHexColor(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  if (s[0] !== '#') s = `#${s}`;
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const r = s[1], g = s[2], b = s[3];
    return (`#${r}${r}${g}${g}${b}${b}`).toLowerCase();
  }
  return null;
}

/** HEX 입력과 type=color 값을 맞춤. 잘못된 HEX면 스와치 값으로 되돌림. */
function reconcileEditIconBackdropColor() {
  const bc = document.getElementById('edit-icon-backdrop-color');
  const bx = document.getElementById('edit-icon-backdrop-color-hex');
  if (!bc || !bx) return;
  const n = normalizeIconHexColor(bx.value);
  if (n) {
    bc.value = n;
    bx.value = n;
  } else {
    bx.value = bc.value;
  }
}

function readEditModalTileOptions() {
  reconcileEditIconBackdropColor();
  const zoomEl = document.getElementById('edit-icon-zoom');
  let iconZoom = parseInt(zoomEl?.value, 10);
  if (!Number.isFinite(iconZoom)) iconZoom = 100;
  iconZoom = Math.min(150, Math.max(50, iconZoom));
  const backdropEl = document.querySelector('input[name="edit-icon-backdrop"]:checked');
  let iconBackdrop = backdropEl?.value || 'default';
  if (!['default', 'transparent', 'solid'].includes(iconBackdrop)) iconBackdrop = 'default';
  let iconBackdropColor = document.getElementById('edit-icon-backdrop-color')?.value || '#ffffff';
  if (!/^#[0-9a-fA-F]{6}$/.test(iconBackdropColor)) iconBackdropColor = '#ffffff';
  return { iconZoom, iconBackdrop, iconBackdropColor };
}

function readIconModalTileOptions() {
  const base = readEditModalTileOptions();
  const borderCb = document.getElementById('edit-icon-tile-border');
  const iconTileBorder = borderCb ? borderCb.checked : true;
  return { ...base, iconTileBorder };
}

function syncEditIconTilePreview() {
  const wrap = document.getElementById('edit-icon-preview-wrap');
  if (!wrap) return;
  const props = readIconModalTileOptions();
  applyIconTileToWrap(wrap, props);
  const img = document.getElementById('edit-icon-img-preview');
  const letter = wrap.querySelector('.edit-preview-letter');
  const z = props.iconZoom / 100;
  if (img && !img.classList.contains('hidden') && img.src) {
    img.style.transformOrigin = 'center center';
    img.style.transform = `scale(${z})`;
    if (letter) letter.style.transform = '';
  } else if (letter) {
    letter.style.transformOrigin = 'center center';
    letter.style.transform = `scale(${z})`;
    if (img) img.style.transform = '';
  } else if (img) {
    img.style.transform = '';
  }
}

/** 커스텀 이미지 없을 때 그리드와 동일한 순서로 파비콘·글자 미리보기 */
async function loadIconModalAutomaticPreview(icon, sessionId) {
  const previewImg  = document.getElementById('edit-icon-img-preview');
  const previewPh   = document.getElementById('edit-icon-preview-ph');
  const previewWrap = document.getElementById('edit-icon-preview-wrap');
  if (!previewImg || !previewPh || !previewWrap) return;

  const stillValid = () => sessionId === iconModalPreviewSession;

  let domain;
  try {
    domain = new URL(icon.url).hostname;
  } catch {
    if (!stillValid()) return;
    showEditPreviewLetter(icon);
    return;
  }

  const googleUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  const googleImg = await tryLoadImage(googleUrl);
  if (!stillValid()) return;
  if (googleImg && googleImg.naturalWidth > 16) {
    previewImg.src = googleUrl;
    previewImg.classList.remove('hidden');
    previewPh.classList.add('hidden');
    previewWrap.classList.add('has-image');
    syncEditIconTilePreview();
    return;
  }

  const horseUrl = `https://icon.horse/icon/${domain}`;
  const horseImg = await tryLoadImage(horseUrl);
  if (!stillValid()) return;
  if (horseImg) {
    previewImg.src = horseUrl;
    previewImg.classList.remove('hidden');
    previewPh.classList.add('hidden');
    previewWrap.classList.add('has-image');
    syncEditIconTilePreview();
    return;
  }

  if (!stillValid()) return;
  showEditPreviewLetter(icon);
}

function showEditPreviewLetter(icon) {
  const previewPh   = document.getElementById('edit-icon-preview-ph');
  const previewImg  = document.getElementById('edit-icon-img-preview');
  const previewWrap = document.getElementById('edit-icon-preview-wrap');
  if (!previewPh || !previewImg || !previewWrap) return;
  previewPh.innerHTML = '';
  const span = document.createElement('span');
  span.className = 'edit-preview-letter';
  span.textContent = (icon.name || '?')[0].toUpperCase();
  span.style.background = getPastelGradient(icon.url || icon.name || '');
  previewPh.appendChild(span);
  previewPh.classList.remove('hidden');
  previewImg.classList.add('hidden');
  previewWrap.classList.add('has-image');
  syncEditIconTilePreview();
}

function openEditModal(id) {
  const icon = state.icons.find(i => i.id === id);
  if (!icon) return;
  iconModalMode = 'edit';
  editTargetId = id;
  iconModalCustomImage = undefined;
  bumpIconModalPreviewSession();
  const session = iconModalPreviewSession;
  dom.editIconName().value = icon.name;
  dom.editIconUrl().value  = icon.url;

  const previewImg  = document.getElementById('edit-icon-img-preview');
  const previewPh   = document.getElementById('edit-icon-preview-ph');
  const previewWrap = document.getElementById('edit-icon-preview-wrap');
  const resetBtn    = document.getElementById('edit-icon-file-reset');

  const t = getIconTileProps(icon);
  const zoomEl = document.getElementById('edit-icon-zoom');
  const zoomVal = document.getElementById('edit-icon-zoom-val');
  if (zoomEl) zoomEl.value = String(t.iconZoom);
  if (zoomVal) zoomVal.textContent = `${t.iconZoom}%`;
  document.querySelectorAll('input[name="edit-icon-backdrop"]').forEach(r => {
    r.checked = r.value === t.iconBackdrop;
  });
  const bc = document.getElementById('edit-icon-backdrop-color');
  const bx = document.getElementById('edit-icon-backdrop-color-hex');
  if (bc) bc.value = t.iconBackdropColor;
  if (bx) bx.value = t.iconBackdropColor;
  const borderCb = document.getElementById('edit-icon-tile-border');
  if (borderCb) borderCb.checked = t.iconTileBorder !== false;
  toggleEditBackdropColorRow();
  applyIconModalChrome();

  if (icon.customImageUrl) {
    previewImg.src = icon.customImageUrl;
    previewImg.classList.remove('hidden');
    previewPh.classList.add('hidden');
    previewWrap.classList.add('has-image');
    resetBtn.classList.remove('hidden');
  } else {
    resetIconModalUploadPreview();
    void loadIconModalAutomaticPreview(icon, session);
  }

  syncEditIconTilePreview();

  dom.editIconModal().classList.remove('hidden');
  setTimeout(() => dom.editIconName().focus(), 50);
}

// ===========================
// 아이콘 CRUD
// ===========================
function addIcon(name, url, customImageUrl = null, tileOptions = null) {
  if (!name.trim() || !url.trim()) {
    showToast('이름과 URL을 모두 입력해주세요.', 'error');
    return false;
  }
  const normalizedUrl = normalizeUrl(url.trim());
  const newIcon = {
    id: Date.now(),
    name: name.trim(),
    url: normalizedUrl,
    customImageUrl: customImageUrl || null,
    ...DEFAULT_ICON_TILE,
    ...(tileOptions || {})
  };
  const icons   = [...state.icons, newIcon];
  saveSettings({ icons });
  const perPage  = state.iconCols * state.iconRows;
  const iconPage = Math.floor((icons.length - 1) / perPage);
  currentPage = iconPage;
  renderIconGrid();
  showToast(`'${name.trim()}' 아이콘이 추가되었습니다.`, 'success');
  return true;
}

function updateIcon(id, name, url, customImageUrl = undefined, tileOptions = null) {
  if (!name.trim() || !url.trim()) {
    showToast('이름과 URL을 모두 입력해주세요.', 'error');
    return false;
  }
  const normalizedUrl = normalizeUrl(url.trim());
  const icons = state.icons.map(icon => {
    if (icon.id !== id) return icon;
    const updated = { ...icon, name: name.trim(), url: normalizedUrl };
    if (customImageUrl !== undefined) updated.customImageUrl = customImageUrl;
    if (tileOptions) {
      updated.iconZoom = tileOptions.iconZoom;
      updated.iconBackdrop = tileOptions.iconBackdrop;
      updated.iconBackdropColor = tileOptions.iconBackdropColor;
      updated.iconTileBorder = tileOptions.iconTileBorder;
    }
    return updated;
  });
  saveSettings({ icons });
  renderIconGrid();
  showToast('아이콘이 수정되었습니다.', 'success');
  return true;
}

function deleteIcon(id, skipConfirm = false) {
  if (!skipConfirm && !confirm('이 아이콘을 삭제할까요?')) return;
  const icons      = state.icons.filter(icon => icon.id !== id);
  saveSettings({ icons });
  const perPage    = state.iconCols * state.iconRows;
  const totalPages = Math.ceil((icons.length + 1) / perPage);
  if (currentPage >= totalPages) currentPage = Math.max(0, totalPages - 1);
  renderIconGrid();
  showToast('아이콘이 삭제되었습니다.', 'success');
}

// ===========================
// 아이콘 순서 재정렬
// ===========================
function reorderIcon(sourceId, targetId, insertBefore) {
  const icons     = [...state.icons];
  const sourceIdx = icons.findIndex(i => i.id === sourceId);
  if (sourceIdx === -1) return;

  const [source] = icons.splice(sourceIdx, 1);

  if (targetId === null) {
    icons.push(source);
  } else {
    let targetIdx = icons.findIndex(i => i.id === targetId);
    if (targetIdx === -1) {
      icons.push(source);
    } else {
      icons.splice(insertBefore ? targetIdx : targetIdx + 1, 0, source);
    }
  }

  const unchanged = icons.length === state.icons.length
    && icons.every((icon, i) => icon.id === state.icons[i].id);
  if (unchanged) return;

  saveSettings({ icons });
  renderIconGrid();
}

/** 드롭 등: 해당 페이지의 첫 슬롯(전역 인덱스 page×perPage)에 삽입, 뒤 아이콘은 한 칸씩 밀림 */
function moveIconToPage(sourceId, pageIndex) {
  const perPage = state.iconCols * state.iconRows;
  const n = state.icons.length;
  const totalPages = Math.max(1, Math.ceil((n + 1) / perPage));
  const p = Math.max(0, Math.min(pageIndex, totalPages - 1));
  const source = state.icons.find(i => i.id === sourceId);
  if (!source) return;
  const icons = state.icons.filter(i => i.id !== sourceId);
  let targetPos = p * perPage;
  targetPos = Math.min(targetPos, icons.length);
  icons.splice(targetPos, 0, source);
  saveSettings({ icons });
  currentPage = p;
  renderIconGrid();
}

function normalizeUrl(url) {
  if (!url.startsWith('http://') && !url.startsWith('https://')) return 'https://' + url;
  return url;
}

// ===========================
// 북마크 모달
// ===========================
const ITAB_BOOKMARK_FOLDER_TITLE = 'iTab 북마크';

function findBookmarkFolderIdByTitle(nodes, title) {
  for (const node of nodes || []) {
    if (!node.url && node.title === title && node.id) return node.id;
    if (node.children?.length) {
      const found = findBookmarkFolderIdByTitle(node.children, title);
      if (found) return found;
    }
  }
  return null;
}

function bmGetTree() {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.getTree(tree => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(tree);
    });
  });
}

function bmGetChildren(id) {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.getChildren(id, children => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(children);
    });
  });
}

function bmRemoveTree(id) {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.removeTree(id, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });
}

function bmCreate(props) {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.create(props, node => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(node);
    });
  });
}

function isHttpUrlForBookmark(raw) {
  try {
    const u = new URL(normalizeUrl(String(raw).trim()));
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

async function sendIconsToBookmarks() {
  if (typeof chrome === 'undefined' || !chrome.bookmarks) {
    showToast('북마크 권한이 없거나 지원하지 않는 환경입니다.', 'error');
    return;
  }
  const items = state.icons.filter(i => i.url && String(i.url).trim() && isHttpUrlForBookmark(i.url));
  if (items.length === 0) {
    showToast('저장할 바로가기가 없습니다. (http/https 주소만 북마크에 넣을 수 있습니다.)', 'error');
    return;
  }
  try {
    const tree = await bmGetTree();
    let folderId = findBookmarkFolderIdByTitle(tree, ITAB_BOOKMARK_FOLDER_TITLE);
    if (!folderId) {
      const created = await bmCreate({ parentId: '1', title: ITAB_BOOKMARK_FOLDER_TITLE });
      folderId = created.id;
    } else {
      const children = await bmGetChildren(folderId);
      for (const c of children) await bmRemoveTree(c.id);
    }
    for (const icon of items) {
      await bmCreate({
        parentId: folderId,
        title: (icon.name && String(icon.name).trim()) || icon.url,
        url: normalizeUrl(String(icon.url).trim())
      });
    }
    showToast(`「${ITAB_BOOKMARK_FOLDER_TITLE}」에 ${items.length}개를 저장했습니다.`, 'success');
  } catch (e) {
    showToast(e.message || '북마크 저장에 실패했습니다.', 'error');
  }
}

async function openBookmarkModal() {
  if (typeof chrome === 'undefined' || !chrome.bookmarks) {
    showToast('북마크 권한이 없거나 지원하지 않는 환경입니다.', 'error');
    return;
  }
  const list = dom.bookmarkList();
  list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px">북마크 불러오는 중...</div>';
  dom.bookmarkModal().classList.remove('hidden');

  try {
    const tree = await new Promise(resolve => chrome.bookmarks.getTree(resolve));
    renderBookmarkList(tree);
  } catch {
    list.innerHTML = '<div style="text-align:center;padding:20px;color:#f87171;font-size:13px">북마크를 불러올 수 없습니다.</div>';
  }
}

function renderBookmarkList(tree) {
  const list     = dom.bookmarkList();
  list.innerHTML = '';
  const selected = new Set();

  function createBookmarkItem(bm) {
    const item = document.createElement('div');
    item.className   = 'bookmark-item';
    item.dataset.id  = bm.id;
    item.dataset.url  = bm.url;
    item.dataset.name = bm.title || bm.url;

    const check   = document.createElement('div');
    check.className = 'bookmark-check';

    const favicon  = document.createElement('img');
    const domain   = (() => { try { return new URL(bm.url).hostname; } catch { return ''; } })();
    favicon.src    = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : '';
    favicon.alt    = '';
    favicon.onerror = () => { favicon.style.display = 'none'; };

    const nameSpan = document.createElement('span');
    nameSpan.className   = 'bookmark-item-name';
    nameSpan.textContent = bm.title || bm.url;

    const urlSpan = document.createElement('span');
    urlSpan.className   = 'bookmark-item-url';
    urlSpan.textContent = bm.url;

    item.appendChild(check);
    item.appendChild(favicon);
    item.appendChild(nameSpan);
    item.appendChild(urlSpan);

    item.addEventListener('click', () => {
      if (selected.has(bm.id)) { selected.delete(bm.id); item.classList.remove('selected'); }
      else                     { selected.add(bm.id);    item.classList.add('selected');    }
    });
    return item;
  }

  function createFolderHeader(folderName, folderItems) {
    const header  = document.createElement('div');
    header.className = 'bookmark-folder-header';

    const nameEl = document.createElement('span');
    nameEl.className = 'bookmark-folder-name';
    nameEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
    nameEl.appendChild(document.createTextNode(folderName));

    const selectBtn = document.createElement('button');
    selectBtn.className = 'bookmark-select-all-btn';
    selectBtn.type = 'button';

    function updateSelectBtn() {
      const allSelected = folderItems.every(it => selected.has(it.dataset.id));
      selectBtn.textContent = allSelected ? '전체 해제' : '전체 선택';
      selectBtn.classList.toggle('all-selected', allSelected);
    }
    updateSelectBtn();

    selectBtn.addEventListener('click', e => {
      e.stopPropagation();
      const allSelected = folderItems.every(it => selected.has(it.dataset.id));
      folderItems.forEach(it => {
        if (allSelected) { selected.delete(it.dataset.id); it.classList.remove('selected'); }
        else             { selected.add(it.dataset.id);    it.classList.add('selected');    }
      });
      updateSelectBtn();
    });

    folderItems.forEach(it => it.addEventListener('click', () => updateSelectBtn()));

    header.appendChild(nameEl);
    header.appendChild(selectBtn);
    return header;
  }

  function traverseFolder(nodes, folderName) {
    const bookmarks = nodes.filter(n => n.url);
    const subfolders = nodes.filter(n => !n.url && n.children);

    if (bookmarks.length > 0) {
      const folderItems = bookmarks.map(bm => createBookmarkItem(bm));
      if (folderName) list.appendChild(createFolderHeader(folderName, folderItems));
      folderItems.forEach(item => list.appendChild(item));
    }
    subfolders.forEach(sf => traverseFolder(sf.children || [], sf.title));
  }

  tree.forEach(root => { if (root.children) traverseFolder(root.children, ''); });

  if (!list.children.length) {
    list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px">북마크가 없습니다.</div>';
  }

  dom.bookmarkConfirm().onclick = () => {
    const selectedItems = list.querySelectorAll('.bookmark-item.selected');
    if (selectedItems.length === 0) {
      showToast('추가할 북마크를 선택해주세요.', 'error');
      return;
    }
    const newIcons = [...state.icons];
    selectedItems.forEach(item => {
      newIcons.push({
        id: Date.now() + Math.random(),
        name: item.dataset.name,
        url: item.dataset.url,
        customImageUrl: null,
        ...DEFAULT_ICON_TILE
      });
    });
    saveSettings({ icons: newIcons });
    renderIconGrid();
    closeModal(dom.bookmarkModal());
    showToast(`${selectedItems.length}개의 북마크가 추가되었습니다.`, 'success');
  };
}

// ===========================
// Pixabay API Key 잠금 UI
// ===========================
function applyApiKeyLockUI(locked) {
  const input      = dom.pixabayApiKey();
  const btn        = dom.pixabayKeyLockBtn();
  const iconUnlock = document.getElementById('key-lock-icon-unlock');
  const iconLock   = document.getElementById('key-lock-icon-lock');
  if (!input || !btn) return;

  input.readOnly = locked;
  btn.classList.toggle('locked', locked);
  if (iconUnlock) iconUnlock.classList.toggle('hidden', locked);
  if (iconLock)   iconLock.classList.toggle('hidden', !locked);
  btn.title = locked ? '잠금 해제' : '입력 잠금';
}

// ===========================
// 배경 히스토리 (최근 10개 / 핀 고정 지원)
// ===========================
let _bgHistoryCacheKey = null;

function generateThumb(srcUrl, size = 88, quality = 0.72) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas  = document.createElement('canvas');
        canvas.width  = size;
        canvas.height = size;
        const ctx   = canvas.getContext('2d');
        const scale = Math.max(size / img.width, size / img.height);
        const sw    = img.width  * scale;
        const sh    = img.height * scale;
        ctx.drawImage(img, (size - sw) / 2, (size - sh) / 2, sw, sh);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch {
        resolve(srcUrl);
      }
    };
    img.onerror = () => resolve(srcUrl);
    img.src = srcUrl;
  });
}

/** isPinned 우선, 같은 그룹 내에서는 updatedAt 내림차순 */
function sortBgHistory(history) {
  return [...history].sort((a, b) => {
    if (!!a.isPinned !== !!b.isPinned) return a.isPinned ? -1 : 1;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
}

/**
 * 새 배경을 히스토리에 추가.
 * - 최대 BG_HISTORY_MAX 개 유지
 * - 초과 시 isPinned:false인 가장 오래된 항목부터 삭제
 * - 비고정 항목이 없으면 고정 항목 중 가장 오래된 것을 삭제 후 토스트 안내
 */
function addToBgHistory(url, thumb, type) {
  let history = Array.isArray(state.bgHistory) ? [...state.bgHistory] : [];
  const now   = Date.now();

  const existIdx = history.findIndex(item => item.url === url);
  if (existIdx !== -1) {
    // 이미 존재 → updatedAt 갱신 (isPinned 보존)
    history[existIdx] = { ...history[existIdx], thumb, updatedAt: now };
  } else {
    history.push({ url, thumb, type, isPinned: false, updatedAt: now });

    // 최대 개수 초과 시 비고정 항목 먼저 삭제, 없으면 고정 항목 중 가장 오래된 것 삭제
    let removedPinned = false;
    while (history.length > BG_HISTORY_MAX) {
      const unpinned = history
        .map((item, i) => ({ item, i }))
        .filter(({ item }) => !item.isPinned)
        .sort((a, b) => (a.item.updatedAt || 0) - (b.item.updatedAt || 0));

      let toDelete, delIdx;
      if (unpinned.length > 0) {
        ({ item: toDelete, i: delIdx } = unpinned[0]);
      } else {
        // 모두 고정 → 가장 오래된 고정 항목 삭제
        const oldest = history
          .map((item, i) => ({ item, i }))
          .sort((a, b) => (a.item.updatedAt || 0) - (b.item.updatedAt || 0));
        ({ item: toDelete, i: delIdx } = oldest[0]);
        removedPinned = true;
      }

      if (isIdbUrl(toDelete.url)) idbDelete(getIdbKey(toDelete.url));
      history.splice(delIdx, 1);
    }

    if (removedPinned) {
      showToast(`고정 항목이 모두 가득 차 가장 오래된 고정 배경이 제거되었습니다.`, 'default');
    }
  }

  saveSettings({ bgHistory: history });
  _bgHistoryCacheKey = null;
  renderBgHistory();
}

/** 배경 히스토리 항목의 핀 고정 상태 토글 */
function toggleBgPin(url) {
  let history = Array.isArray(state.bgHistory) ? [...state.bgHistory] : [];
  const idx   = history.findIndex(item => item.url === url);
  if (idx === -1) return;
  const newPinned = !history[idx].isPinned;
  history[idx] = { ...history[idx], isPinned: newPinned };
  saveSettings({ bgHistory: history });
  _bgHistoryCacheKey = null;
  renderBgHistory();
  showToast(newPinned ? '배경이 고정되었습니다.' : '배경 고정이 해제되었습니다.', 'default');
}

function renderBgHistory() {
  const bar = dom.bgHistoryBar();
  if (!bar) return;

  const history = Array.isArray(state.bgHistory) ? state.bgHistory : [];
  const cacheKey = history.map(h =>
    h.url + (h.isPinned ? 'P' : '') + (h.updatedAt || 0)
  ).join('|') + '::' + (state.bgImageUrl || '');

  if (_bgHistoryCacheKey === cacheKey) {
    // active 상태 + 현재 썸네일만 갱신
    bar.querySelectorAll('.bg-dropdown-item').forEach(el => {
      el.classList.toggle('active', el.dataset.url === state.bgImageUrl);
    });
    const currentItem = history.find(h => h.url === state.bgImageUrl);
    const thumbDiv    = bar.querySelector('.bg-current-thumb');
    if (thumbDiv && currentItem?.thumb) {
      thumbDiv.style.backgroundImage = `url("${currentItem.thumb}")`;
    }
    return;
  }
  _bgHistoryCacheKey = cacheKey;
  const preserveBgDropdownOpen = _bgDropdownOpen;
  bar.innerHTML = '';

  // ── 위젯 (현재 썸네일 + 드롭다운 버튼) ──
  const currentItem  = history.find(h => h.url === state.bgImageUrl);
  const currentThumb = currentItem?.thumb || '';

  const widget = document.createElement('div');
  widget.id = 'bg-thumb-widget';
  widget.setAttribute('aria-label', '배경 이미지 목록');

  const thumbDiv = document.createElement('div');
  thumbDiv.className = 'bg-current-thumb';
  if (currentThumb) thumbDiv.style.backgroundImage = `url("${currentThumb}")`;

  const dropToggle = document.createElement('button');
  dropToggle.className = 'bg-dropdown-toggle';
  dropToggle.setAttribute('aria-label', '배경 목록 열기/닫기');
  dropToggle.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

  widget.appendChild(thumbDiv);
  widget.appendChild(dropToggle);
  bar.appendChild(widget);

  // ── 드롭다운 패널 ──
  const panel = document.createElement('div');
  panel.id        = 'bg-dropdown-panel';
  panel.className = 'bg-dropdown-panel hidden';

  if (history.length === 0) {
    const empty = document.createElement('p');
    empty.className   = 'bg-dropdown-empty';
    empty.textContent = '최근 배경이 없습니다';
    panel.appendChild(empty);
  } else {
    const sorted = sortBgHistory(history);
    const grid   = document.createElement('div');
    grid.className = 'bg-dropdown-grid';

    sorted.forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.className = 'bg-dropdown-item'
        + (item.url === state.bgImageUrl ? ' active' : '')
        + (item.isPinned ? ' is-pinned' : '');
      itemEl.dataset.url = item.url;
      itemEl.title = item.type === 'local' ? '로컬 이미지' : 'Pixabay 이미지';

      const thumbEl = document.createElement('div');
      thumbEl.className = 'bg-dropdown-thumb';
      if (item.thumb) thumbEl.style.backgroundImage = `url("${item.thumb}")`;

      // 핀 버튼 (좌측 상단, event.stopPropagation)
      const pinBtn = document.createElement('button');
      pinBtn.className = 'bg-pin-btn' + (item.isPinned ? ' active' : '');
      pinBtn.setAttribute('aria-label', item.isPinned ? '고정 해제' : '고정');
      pinBtn.title   = item.isPinned ? '고정 해제' : '고정';
      pinBtn.innerHTML = PIN_ICON_SVG;
      pinBtn.addEventListener('click', e => {
        e.stopPropagation();
        toggleBgPin(item.url);
      });

      itemEl.appendChild(thumbEl);
      itemEl.appendChild(pinBtn);

      // 클릭 → 배경 적용 완료 후 토스트
      itemEl.addEventListener('click', async () => {
        // idb: URL인 경우 실제 blob이 존재하는지 먼저 확인
        if (isIdbUrl(item.url)) {
          let rec = null;
          try { rec = await idbGet(getIdbKey(item.url)); } catch { /* 무시 */ }
          if (!rec?.blob) {
            // IDB에 데이터가 없는 유령 항목 → 히스토리에서 제거 후 안내
            const cleaned = (state.bgHistory || []).filter(h => h.url !== item.url);
            saveSettings({ bgHistory: cleaned });
            _bgHistoryCacheKey = null;
            renderBgHistory();
            showToast('이미지 데이터가 유실되어 목록에서 제거되었습니다.', 'error');
            return;
          }
        }
        saveSettings({ bgImageUrl: item.url, bgSource: item.type || 'local' });
        await applyBackground();
        _bgHistoryCacheKey = null;
        renderBgHistory();
        showToast('배경이 적용되었습니다.', 'success');
      });

      attachHoverZoom(itemEl);
      grid.appendChild(itemEl);
    });

    panel.appendChild(grid);
  }

  bar.appendChild(panel);

  if (preserveBgDropdownOpen) {
    panel.classList.remove('hidden');
    dropToggle.classList.add('open');
    _bgDropdownOpen = true;
  }

  // 위젯 클릭 → 드롭다운 토글
  widget.addEventListener('click', toggleBgDropdown);
}

function toggleBgDropdown() {
  const panel  = document.getElementById('bg-dropdown-panel');
  const toggle = document.querySelector('.bg-dropdown-toggle');
  if (!panel) return;
  const willOpen = panel.classList.contains('hidden');
  if (willOpen) {
    panel.classList.remove('hidden');
    if (toggle) toggle.classList.add('open');
    _bgDropdownOpen = true;
  } else {
    closeBgDropdown();
  }
}

function closeBgDropdown() {
  const panel  = document.getElementById('bg-dropdown-panel');
  const toggle = document.querySelector('.bg-dropdown-toggle');
  if (panel)  panel.classList.add('hidden');
  if (toggle) toggle.classList.remove('open');
  _bgDropdownOpen = false;
}

// ===========================
// 호버 줌 (Hover Zoom)
// ===========================

/**
 * 마우스 오버 시 0.3s 동안 2배로 확대.
 * 화면 가장자리 감지하여 transform-origin 동적 조절.
 */
function attachHoverZoom(el) {
  el.addEventListener('mouseenter', () => {
    const rect = el.getBoundingClientRect();
    const vw   = window.innerWidth;
    const vh   = window.innerHeight;
    const mx   = rect.left + rect.width  / 2;
    const my   = rect.top  + rect.height / 2;
    const xOrig = mx < 80       ? 'left'   : mx > vw - 80 ? 'right'  : 'center';
    const yOrig = my < 80       ? 'top'    : my > vh - 80 ? 'bottom' : 'center';
    el.style.transformOrigin = `${yOrig} ${xOrig}`;
    el.classList.add('hover-zoom');
  });
  el.addEventListener('mouseleave', () => {
    el.classList.remove('hover-zoom');
    el.style.transformOrigin = '';
  });
}

// ===========================
// Pixabay 키워드 확장 맵
// ===========================
const PIXABAY_KEYWORD_MAP = {
  '바다':  ['sea',        'ocean',             'beach',          'tropical island', 'coastline'],
  '산':    ['mountain',   'alpine landscape',  'forest',         'nature mountain', 'highland'],
  '도시':  ['city',       'cityscape',         'urban night',    'skyscraper',      'metropolis'],
  '하늘':  ['sky',        'blue sky clouds',   'cloudscape',     'dramatic sky',    'atmosphere'],
  '꽃':    ['flower',     'blossom',           'floral garden',  'spring flowers',  'bloom'],
  '숲':    ['forest',     'woods',             'jungle',         'trees nature',    'misty forest'],
  '우주':  ['space',      'galaxy',            'nebula',         'cosmos stars',    'milky way'],
  '야경':  ['night city', 'city lights night', 'neon lights',    'night skyline',   'urban night'],
  '노을':  ['sunset',     'sunrise',           'golden hour',    'dusk sky',        'orange sky'],
  '눈':    ['snow',       'winter landscape',  'snowflake',      'snowy forest',    'blizzard'],
  '비':    ['rain',       'rainy day',         'storm',          'water drops',     'wet street'],
  '사막':  ['desert',     'sand dunes',        'sahara',         'arid landscape',  'canyon'],
  '폭포':  ['waterfall',  'cascade',           'river nature',   'stream forest',   'falls'],
  '건물':  ['architecture','modern building',  'structure',      'facade',          'interior design'],
  '동물':  ['wildlife',   'animal nature',     'wild animal',    'safari',          'bird nature'],
  '자연':  ['nature',     'landscape',         'wilderness',     'scenic',          'outdoors'],
  '도로':  ['road',       'highway',           'path nature',    'trail',           'journey road'],
  '카페':  ['cafe',       'coffee',            'coffee shop',    'interior cozy',   'espresso'],
  '밤':    ['night',      'dark sky',          'starry night',   'moonlight',       'midnight'],
  '물':    ['water',      'lake reflection',   'river',          'waterscape',      'pond nature'],
};

// ===========================
// Pixabay 검색
// ===========================
async function searchPixabay(keyword) {
  const apiKey = state.pixabayApiKey.trim();
  if (!apiKey)       { showToast('Pixabay API 키를 먼저 입력해주세요.', 'error'); return; }
  if (!keyword.trim()) { showToast('검색 키워드를 입력해주세요.', 'error'); return; }

  const resultsEl = dom.pixabayResults();
  resultsEl.innerHTML = '<div style="text-align:center;padding:10px;color:var(--text-muted);font-size:11px">검색 중...</div>';

  const trimmed  = keyword.trim();
  const variants = PIXABAY_KEYWORD_MAP[trimmed];
  const searchTerm = variants ? variants[Math.floor(Math.random() * variants.length)] : trimmed;

  const buildUrl = page =>
    `https://pixabay.com/api/?key=${encodeURIComponent(apiKey)}` +
    `&q=${encodeURIComponent(searchTerm)}` +
    `&image_type=photo&per_page=50&safesearch=true` +
    `&order=popular&orientation=horizontal&page=${page}`;

  try {
    const probeRes  = await fetch(buildUrl(1));
    if (!probeRes.ok) throw new Error('API 오류: ' + probeRes.status);
    const probeData = await probeRes.json();

    let hits     = probeData.hits || [];
    let usedPage = 1;

    if ((probeData.totalHits || 0) > 50) {
      const maxPage  = Math.min(Math.floor(probeData.totalHits / 50), 15);
      const randPage = Math.floor(Math.random() * maxPage) + 1;
      if (randPage > 1) {
        const pageRes = await fetch(buildUrl(randPage));
        if (pageRes.ok) {
          const pageData = await pageRes.json();
          if (pageData.hits?.length > 0) { hits = pageData.hits; usedPage = randPage; }
        }
      }
    }

    if (hits.length === 0) {
      resultsEl.innerHTML = '<div style="text-align:center;padding:10px;color:var(--text-muted);font-size:11px">검색 결과가 없습니다.</div>';
      return;
    }

    hits.sort((a, b) => {
      const score = h => (h.fullHDURL ? 3 : h.largeImageURL ? 2 : 1);
      return score(b) - score(a);
    });

    resultsEl.innerHTML = '';

    const info = document.createElement('div');
    info.style.cssText = 'grid-column:1/-1;text-align:center;padding:5px 8px;' +
      'color:var(--text-muted);font-size:10px;opacity:0.75;line-height:1.5';
    const total = (probeData.totalHits || 0).toLocaleString();
    info.textContent = `"${searchTerm}" — 전체 ${total}개 중 ${usedPage}페이지 (${hits.length}장)`;
    resultsEl.appendChild(info);

    hits.forEach(hit => {
      const img     = document.createElement('img');
      img.src       = hit.previewURL;
      img.className = 'pixabay-thumb';
      img.alt       = hit.tags;
      img.title     = hit.tags;
      attachHoverZoom(img);

      img.addEventListener('click', async () => {
        resultsEl.querySelectorAll('.pixabay-thumb').forEach(t => t.classList.remove('selected'));
        img.classList.add('selected');

        const bgUrl = hit.fullHDURL || hit.largeImageURL || hit.webformatURL;
        const bgEl  = dom.bgImage();
        bgEl.classList.add('bg-loading');
        bgEl.classList.remove('bg-loaded');
        showToast('배경 불러오는 중…', 'default');

        try {
          // 이미지 Blob 다운로드 → 1920px WebP 변환 → IDB 저장
          const resp    = await fetch(bgUrl);
          if (!resp.ok) throw new Error('fetch ' + resp.status);
          const rawBlob = await resp.blob();
          const blob    = await resizeAndConvertToWebP(rawBlob);
          const now     = Date.now();
          const key     = `bg_${now}`;
          const idbUrl  = `idb:${key}`;
          await idbSave(key, blob, hit.previewURL, false, now);

          saveSettings({ bgSource: 'pixabay', bgImageUrl: idbUrl, pixabayKeyword: keyword });
          await applyBackground();
          bgEl.classList.remove('bg-loading');
          bgEl.classList.add('bg-loaded');
          addToBgHistory(idbUrl, hit.previewURL, 'pixabay');
          showToast('배경이 적용되었습니다.', 'success');

        } catch {
          // 네트워크 문제 시 URL 직접 사용 (폴백)
          const fallbackUrl = hit.largeImageURL || hit.webformatURL;
          saveSettings({ bgSource: 'pixabay', bgImageUrl: fallbackUrl, pixabayKeyword: keyword });
          applyBackground();
          bgEl.classList.remove('bg-loading');
          bgEl.classList.add('bg-loaded');
          addToBgHistory(fallbackUrl, hit.previewURL, 'pixabay');
          showToast('배경이 적용되었습니다.', 'success');
        }
      });

      resultsEl.appendChild(img);
    });

  } catch (err) {
    resultsEl.innerHTML = `<div style="text-align:center;padding:10px;color:#f87171;font-size:11px">오류: ${err.message}</div>`;
  }
}

// ===========================
// 닉네임 시스템
// ===========================
async function initNickname() {
  const data = await storageGet({ nickname: '', nicknameLocked: false });
  currentNickname  = data.nickname || '';
  nicknameIsLocked = !!data.nicknameLocked;
  updateNicknameDisplay();
  syncNicknameUI();
  if (!currentNickname) showWelcomeModal();
}

function updateNicknameDisplay() {
  const el = dom.nicknameDisplay();
  if (!el) return;
  if (currentNickname) {
    el.textContent = `Welcome ${currentNickname}.`;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

function syncNicknameUI() {
  const input = dom.nicknameInput();
  if (input) input.value = currentNickname;
  applyNicknameLockUI(nicknameIsLocked);
}

function applyNicknameLockUI(locked) {
  const input      = dom.nicknameInput();
  const btn        = dom.nicknameLockBtn();
  const iconUnlock = document.getElementById('nickname-lock-icon-unlock');
  const iconLock   = document.getElementById('nickname-lock-icon-lock');
  if (!input || !btn) return;
  input.readOnly = locked;
  btn.classList.toggle('locked', locked);
  if (iconUnlock) iconUnlock.classList.toggle('hidden', locked);
  if (iconLock)   iconLock.classList.toggle('hidden', !locked);
  btn.title = locked ? '잠금 해제' : '입력 잠금';
}

function showWelcomeModal() {
  const modal = dom.welcomeModal();
  if (!modal) return;
  modal.classList.remove('hidden');
  requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.add('visible')));
  setTimeout(() => dom.welcomeNickInput()?.focus(), 300);
}

function closeWelcomeModal() {
  const modal = dom.welcomeModal();
  if (!modal) return;
  modal.classList.remove('visible');
  setTimeout(() => modal.classList.add('hidden'), 450);
}

function confirmWelcomeNickname() {
  const input = dom.welcomeNickInput();
  const value = input ? input.value.trim() : '';
  if (!value) {
    if (input) {
      input.style.borderColor = 'rgba(239,68,68,0.6)';
      input.focus();
      setTimeout(() => { input.style.borderColor = ''; }, 1500);
    }
    return;
  }
  currentNickname  = value;
  nicknameIsLocked = true;
  storageSet({ nickname: currentNickname, nicknameLocked: nicknameIsLocked });
  updateNicknameDisplay();
  syncNicknameUI();
  closeWelcomeModal();
  showToast(`환영합니다, ${currentNickname}!`, 'success');
}

function showNicknameError() {
  const errEl = dom.nicknameError();
  if (!errEl) return;
  errEl.classList.remove('hidden');
  setTimeout(() => errEl.classList.add('hidden'), 5000);
}

function hideNicknameError() {
  dom.nicknameError()?.classList.add('hidden');
}

// ===========================
// 내보내기 / 가져오기
// ===========================

/**
 * 내보내기: IDB에 저장된 이미지 Blob을 base64로 변환해 JSON에 내장.
 * 파일명: iTab_(닉네임)_(YYMMDD).json
 */
async function exportSettings() {
  if (!currentNickname.trim()) {
    showNicknameError();
    openSettingsPanel();
    setTimeout(() => {
      const input = dom.nicknameInput();
      if (input) { input.scrollIntoView({ behavior: 'smooth', block: 'center' }); input.focus(); }
    }, 350);
    return;
  }

  showToast('내보내기 준비 중…', 'default');

  // 현재 배경 + 핀 고정된 배경만 blob으로 내보내기 (용량 최적화)
  const exportData = { ...state };
  const bgImages   = {};

  const idbUrls = new Set();
  if (isIdbUrl(state.bgImageUrl)) idbUrls.add(state.bgImageUrl);
  (state.bgHistory || []).forEach(h => {
    if (h.isPinned && isIdbUrl(h.url)) idbUrls.add(h.url);
  });

  // bgHistory도 현재+핀+외부URL 항목만 포함 (dangling idb: URL 방지)
  exportData.bgHistory = (state.bgHistory || []).filter(h =>
    !isIdbUrl(h.url) || idbUrls.has(h.url)
  );

  for (const idbUrl of idbUrls) {
    try {
      const record = await idbGet(getIdbKey(idbUrl));
      if (record?.blob && record.blob.size > 0) {
        bgImages[idbUrl] = await blobToBase64(record.blob);
      } else {
        console.warn('[내보내기] IDB 이미지 없음 또는 빈 Blob:', idbUrl);
      }
    } catch (err) {
      console.warn('[내보내기] 이미지 변환 오류:', idbUrl, err);
    }
  }

  exportData._bgImages = bgImages;

  const json = JSON.stringify(exportData);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `iTab_${currentNickname}_${formatDate()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  showToast('설정이 내보내기 되었습니다.', 'success');
}

/**
 * 가져오기: JSON 내 base64 이미지를 Blob으로 복원 후 IDB에 저장.
 * 레거시 DataURL(bgImageUrl이 data:로 시작) 도 처리.
 */
function importSettings(file) {
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const data = JSON.parse(e.target.result);
      if (typeof data !== 'object' || !data.icons) throw new Error('올바르지 않은 설정 파일입니다.');
      if (!confirm('설정을 가져옵니다. 아이콘·설정은 덮어씌워지고, 배경 이미지는 기존 데이터와 병합됩니다. 계속할까요?')) return;

      showToast('가져오는 중…', 'default');

      // _bgImages: base64 → Blob → IDB 복원 (isPinned·updatedAt 유지)
      const bgImages    = data._bgImages || {};
      const restoredIdbUrls = new Set(); // 성공적으로 복원된 idb: URL 집합
      delete data._bgImages;

      let savedCount = 0, failCount = 0;
      const idbSaveJobs = Object.entries(bgImages).map(async ([idbUrl, base64]) => {
        try {
          if (!base64 || typeof base64 !== 'string' || base64.length < 10) {
            console.warn('[가져오기] 유효하지 않은 base64 건너뜀:', idbUrl);
            failCount++;
            return;
          }
          const dataUrl  = base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
          const key      = getIdbKey(idbUrl);
          const blob     = base64ToBlob(dataUrl);
          const histItem = (data.bgHistory || []).find(h => h.url === idbUrl);
          await idbSave(key, blob, histItem?.thumb || null,
            histItem?.isPinned || false, histItem?.updatedAt || Date.now());
          restoredIdbUrls.add(idbUrl);
          savedCount++;
        } catch (err) {
          console.warn('[가져오기] 이미지 복원 실패:', idbUrl, err);
          failCount++;
        }
      });

      // 모든 이미지 저장 완료 대기
      await Promise.allSettled(idbSaveJobs);
      if (failCount > 0) console.warn(`[가져오기] ${failCount}개 실패, ${savedCount}개 성공`);

      // 레거시: bgImageUrl이 DataURL인 경우 IDB로 이전
      if (data.bgImageUrl && data.bgImageUrl.startsWith('data:')) {
        try {
          const key = `bg_imported_${Date.now()}`;
          const blob = base64ToBlob(data.bgImageUrl);
          await idbSave(key, blob, null, false, Date.now());
          const newUrl = `idb:${key}`;
          if (Array.isArray(data.bgHistory)) {
            data.bgHistory = data.bgHistory.map(h =>
              h.url === data.bgImageUrl ? { ...h, url: newUrl } : h
            );
          }
          data.bgImageUrl = newUrl;
          restoredIdbUrls.add(newUrl);
        } catch (err) { console.warn('[가져오기] 레거시 bgImageUrl 변환 실패:', err); }
      }

      // 레거시: 히스토리 항목 중 DataURL이 있는 경우 IDB로 이전
      if (Array.isArray(data.bgHistory)) {
        for (let i = 0; i < data.bgHistory.length; i++) {
          const item = data.bgHistory[i];
          if (item.url?.startsWith('data:') && item.type === 'local') {
            try {
              const key = `bg_imported_${Date.now()}_${i}`;
              const blob = base64ToBlob(item.url);
              await idbSave(key, blob, item.thumb || null,
                item.isPinned || false, item.updatedAt || Date.now());
              data.bgHistory[i] = { ...item, url: `idb:${key}` };
              restoredIdbUrls.add(`idb:${key}`);
            } catch (err) { console.warn(`[가져오기] 레거시 히스토리[${i}] 변환 실패:`, err); }
          }
        }
      }

      // ── bgHistory 병합 ──
      // blob이 없는 idb: URL 항목은 제외 (외부 URL + 복원된 idb: URL만 포함)
      const importedHistory = (data.bgHistory || []).filter(h =>
        !isIdbUrl(h.url) || restoredIdbUrls.has(h.url)
      );

      const mergedHistory = Array.isArray(state.bgHistory) ? [...state.bgHistory] : [];
      for (const newItem of importedHistory) {
        const existIdx = mergedHistory.findIndex(h => h.url === newItem.url);
        if (existIdx !== -1) {
          // 어느 쪽이든 핀이면 핀 유지, updatedAt은 최신 값
          mergedHistory[existIdx] = {
            ...mergedHistory[existIdx],
            isPinned:  mergedHistory[existIdx].isPinned || !!newItem.isPinned,
            updatedAt: Math.max(mergedHistory[existIdx].updatedAt || 0, newItem.updatedAt || 0)
          };
        } else {
          mergedHistory.push(newItem);
        }
      }

      // 10개 초과 시 핀 없는 가장 오래된 항목부터 삭제
      while (mergedHistory.length > BG_HISTORY_MAX) {
        const candidates = mergedHistory
          .map((item, i) => ({ item, i }))
          .filter(({ item }) => !item.isPinned)
          .sort((a, b) => (a.item.updatedAt || 0) - (b.item.updatedAt || 0));
        if (candidates.length === 0) break;
        mergedHistory.splice(candidates[0].i, 1);
      }
      data.bgHistory = mergedHistory;

      // 닉네임은 현재 값 보존
      delete data.nickname;
      delete data.nicknameLocked;
      delete data.iconImageFit;

      await storageSet(data);
      showToast('설정을 가져왔습니다. 잠시 후 새로고침됩니다…', 'success');
      setTimeout(() => location.reload(), 1200);
    } catch (err) {
      showToast('가져오기 실패: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

/** YYYY-MM-DD 형식 날짜 문자열 */
function formatDate() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0')
  ].join('-');
}

// ===========================
// 토스트 알림
// ===========================
let toastContainer = null;

function showToast(message, type = 'default') {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  const toast = document.createElement('div');
  toast.className   = `toast toast-${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, 2500);
}

// ===========================
// 설정 패널 열기/닫기
// ===========================
function openSettingsPanel() {
  dom.settingsPanel().classList.add('open');
  dom.settingsOverlay().classList.add('visible');
  dom.settingsBtn().classList.add('panel-open');
}

function closeSettingsPanel() {
  dom.settingsPanel().classList.remove('open');
  dom.settingsOverlay().classList.remove('visible');
  dom.settingsBtn().classList.remove('panel-open');
}

// ===========================
// 갤럭시 앱스 스타일 드래그 비주얼
// ===========================
function getHoveredDragSlot(mouseX, mouseY) {
  const grid = dom.iconGrid();
  if (!grid) return null;

  const gridRect  = grid.getBoundingClientRect();
  const perPage   = state.iconCols * state.iconRows;
  const pageIcons = state.icons.slice(currentPage * perPage, (currentPage + 1) * perPage);
  const cols      = state.iconCols;
  const cellW     = state.iconSize + 24 + state.iconGapX;
  const cellH     = state.iconSize + 26 + Math.ceil(state.labelFontSize * 1.3) + state.iconGapY;

  const localX = mouseX - gridRect.left;
  const localY = mouseY - gridRect.top;
  if (localX < 0 || localY < 0) return null;

  const col     = Math.max(0, Math.min(cols - 1, Math.floor(localX / cellW)));
  const row     = Math.max(0, Math.floor(localY / cellH));
  const slotIdx = row * cols + col;
  if (slotIdx >= pageIcons.length) return null;

  const slotCenterX = gridRect.left + col * cellW + cellW / 2;
  const DEADZONE    = cellW * 0.10;
  let insertBefore;
  const icon    = pageIcons[slotIdx];
  const prevKey = lastDragTargetKey;
  if (prevKey && prevKey.startsWith(`${icon.id}-`)) {
    const prevInsert = prevKey.endsWith('true');
    if (prevInsert  && mouseX > slotCenterX + DEADZONE) insertBefore = false;
    else if (!prevInsert && mouseX < slotCenterX - DEADZONE) insertBefore = true;
    else insertBefore = prevInsert;
  } else {
    insertBefore = mouseX < slotCenterX;
  }

  return { icon, insertBefore };
}

function applyDragVisuals(sourceId, targetId, insertBefore) {
  if (targetId === null) { clearAllDragTransforms(); return; }

  const perPage   = state.iconCols * state.iconRows;
  const startIdx  = currentPage * perPage;
  const pageIcons = state.icons.slice(startIdx, startIdx + perPage);
  const cols      = state.iconCols;
  const cellW     = state.iconSize + 24 + state.iconGapX;
  const cellH     = state.iconSize + 26 + Math.ceil(state.labelFontSize * 1.3) + state.iconGapY;

  const sourcePageIdx = pageIcons.findIndex(i => i.id === sourceId);
  const targetPageIdx = pageIcons.findIndex(i => i.id === targetId);
  if (sourcePageIdx === -1 || targetPageIdx === -1) return;

  const insertAtIdx = insertBefore ? targetPageIdx : targetPageIdx + 1;
  const indices = pageIcons.map((_, i) => i);
  indices.splice(sourcePageIdx, 1);
  let adj = sourcePageIdx < insertAtIdx ? insertAtIdx - 1 : insertAtIdx;
  adj = Math.max(0, Math.min(adj, indices.length));
  indices.splice(adj, 0, sourcePageIdx);

  const origToNew = new Array(pageIcons.length);
  indices.forEach((origIdx, newIdx) => { origToNew[origIdx] = newIdx; });

  const grid = dom.iconGrid();
  grid.querySelectorAll('.icon-item').forEach(el => {
    const id      = Number(el.dataset.id);
    const origIdx = pageIcons.findIndex(i => i.id === id);
    if (origIdx === -1 || id === sourceId) return;

    const newIdx  = origToNew[origIdx];
    const origRow = Math.floor(origIdx / cols), origCol = origIdx % cols;
    const newRow  = Math.floor(newIdx  / cols), newCol  = newIdx  % cols;
    const dx = (newCol - origCol) * cellW;
    const dy = (newRow - origRow) * cellH;
    el.style.transform = (dx !== 0 || dy !== 0) ? `translate(${dx}px, ${dy}px)` : '';
  });
}

function clearAllDragTransforms() {
  dom.iconGrid()?.querySelectorAll('.icon-item').forEach(el => { el.style.transform = ''; });
}

// ===========================
// 이벤트 리스너 등록
// ===========================
function bindEvents() {

  // --- 페이지 점 (클릭은 위임) ---
  dom.pageDots()?.addEventListener('click', e => {
    const dot = e.target.closest('.page-dot');
    if (!dot) return;
    const p = Number(dot.dataset.page);
    if (Number.isFinite(p)) goToPage(p);
  });

  // --- 설정 패널 ---
  dom.settingsBtn().addEventListener('click', openSettingsPanel);
  dom.settingsClose().addEventListener('click', closeSettingsPanel);
  dom.settingsOverlay().addEventListener('click', closeSettingsPanel);

  // --- 테마 ---
  dom.themeRadios().forEach(r => {
    r.addEventListener('change', () => { saveSettings({ theme: r.value }); applyTheme(); });
  });

  // --- 배경 소스 ---
  dom.bgSourceRadios().forEach(r => {
    r.addEventListener('change', () => {
      saveSettings({ bgSource: r.value });
      toggleBgSourceUI(r.value);
      if (r.value === 'none') { saveSettings({ bgImageUrl: '' }); applyBackground(); }
    });
  });

  // Pixabay API Key
  dom.pixabayApiKey().addEventListener('change', () => {
    if (!state.pixabayApiKeyLocked) saveSettings({ pixabayApiKey: dom.pixabayApiKey().value });
  });
  dom.pixabayKeyLockBtn().addEventListener('click', () => {
    const newLocked = !state.pixabayApiKeyLocked;
    saveSettings({ pixabayApiKeyLocked: newLocked });
    applyApiKeyLockUI(newLocked);
    showToast(newLocked ? 'API 키가 잠겼습니다.' : 'API 키 잠금이 해제되었습니다.', 'default');
  });

  // Pixabay 검색
  dom.pixabaySearchBtn().addEventListener('click', () => {
    const keyword = dom.pixabayKeyword().value;
    saveSettings({ pixabayKeyword: keyword });
    searchPixabay(keyword);
  });
  dom.pixabayKeyword().addEventListener('keydown', e => {
    if (e.key === 'Enter') dom.pixabaySearchBtn().click();
  });

  // 로컬 이미지 → Blob → IndexedDB 저장
  dom.localBgInput().addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    dom.localBgInput().value = '';

    const bgEl = dom.bgImage();
    bgEl.classList.add('bg-loading');
    bgEl.classList.remove('bg-loaded');

    try {
      // 1920px WebP로 리사이징·변환 후 초소형 썸네일 생성
      const resizedBlob = await resizeAndConvertToWebP(file);
      const tmpObjUrl   = URL.createObjectURL(resizedBlob);
      const thumb       = await generateThumb(tmpObjUrl);
      URL.revokeObjectURL(tmpObjUrl);

      const now    = Date.now();
      const key    = `bg_${now}`;
      const idbUrl = `idb:${key}`;

      // WebP Blob을 IDB에 저장
      await idbSave(key, resizedBlob, thumb, false, now);

      saveSettings({ bgSource: 'local', bgImageUrl: idbUrl });
      await applyBackground();

      bgEl.classList.remove('bg-loading');
      bgEl.classList.add('bg-loaded');

      // 설정 패널 내 미리보기 업데이트
      const preview = dom.localBgPreview();
      preview.style.backgroundImage = _bgObjectUrl ? `url("${_bgObjectUrl}")` : `url("${thumb}")`;
      preview.classList.remove('hidden');

      showToast('배경 이미지가 적용되었습니다.', 'success');
      addToBgHistory(idbUrl, thumb, 'local');

    } catch {
      bgEl.classList.remove('bg-loading');
      showToast('이미지 처리 중 오류가 발생했습니다.', 'error');
    }
  });

  // 오버레이 불투명도 (배경 재로드 없이 직접 업데이트)
  dom.overlayOpacity().addEventListener('input', e => {
    const val = parseInt(e.target.value);
    dom.overlayOpacityVal().textContent = val + '%';
    saveSettings({ bgOverlayOpacity: val });
    dom.bgOverlay().style.background = `rgba(0,0,0,${val / 100})`;
  });

  dom.bgBlurRange().addEventListener('input', e => {
    const val = clampBgBlur(e.target.value);
    dom.bgBlurValBadge().textContent = val + 'px';
    saveSettings({ bgBlur: val });
    applyBgBlurVisual();
  });

  // --- 검색 엔진 ---
  dom.searchEngineRadios().forEach(r => {
    r.addEventListener('change', () => {
      saveSettings({ searchEngine: r.value });
      toggleCustomSearchUI(r.value === 'custom');
      applySearchEngine();
    });
  });

  dom.customSearchName().addEventListener('change', () => {
    saveSettings({ customSearchName: dom.customSearchName().value });
    if (state.searchEngine === 'custom') applySearchEngine();
  });
  dom.customSearchUrl().addEventListener('change', () => {
    saveSettings({ customSearchUrl: dom.customSearchUrl().value });
    if (state.searchEngine === 'custom') applySearchEngine();
  });
  dom.customSearchHome().addEventListener('change', () => {
    saveSettings({ customSearchHome: dom.customSearchHome().value });
    if (state.searchEngine === 'custom') applySearchEngine();
  });

  // --- 슬라이더 ---
  const sliders = [
    { id: 'search-width',    key: 'searchWidth',    unit: 'px' },
    { id: 'search-margin-top', key: 'searchMarginTop', unit: '%' },
    { id: 'grid-gap-top',    key: 'gridGapTop',     unit: 'px', rerenderGrid: false },
    { id: 'icon-cols',       key: 'iconCols',       unit: '',   rerenderGrid: true },
    { id: 'icon-rows',       key: 'iconRows',       unit: '',   rerenderGrid: true },
    { id: 'icon-gap-x',      key: 'iconGapX',       unit: 'px', rerenderGrid: false },
    { id: 'icon-gap-y',      key: 'iconGapY',       unit: 'px', rerenderGrid: false },
    { id: 'icon-size',       key: 'iconSize',       unit: 'px', rerenderGrid: false },
    { id: 'label-font-size', key: 'labelFontSize',  unit: 'px', rerenderGrid: false }
  ];

  sliders.forEach(({ id, key, unit, rerenderGrid }) => {
    const el    = document.getElementById(id);
    const badge = document.getElementById(id + '-val');
    if (!el) return;
    el.addEventListener('input', e => {
      const val = parseFloat(e.target.value);
      if (badge) badge.textContent = val + unit;
      saveSettings({ [key]: val });
      applyCSSVars();
      if (rerenderGrid) { currentPage = 0; renderIconGrid(); }
    });
  });

  {
    const el = document.getElementById('icon-corner-radius');
    const badge = document.getElementById('icon-corner-radius-val');
    if (el) {
      el.addEventListener('input', e => {
        const val = Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0));
        if (badge) badge.textContent = `${val}%`;
        saveSettings({ iconCornerRadius: val });
        applyCSSVars();
      });
    }
  }
  // 라벨 색상
  dom.labelColor().addEventListener('input', e => {
    const color = e.target.value;
    dom.labelColorHex().textContent = color;
    saveSettings({ labelColor: color });
    applyCSSVars();
  });

  // 라벨 그림자
  dom.labelShadow().addEventListener('change', e => {
    saveSettings({ labelShadow: e.target.checked });
    applyCSSVars();
  });

  // --- 북마크 ---
  dom.sendToBookmarks()?.addEventListener('click', sendIconsToBookmarks);
  dom.addFromBookmarks().addEventListener('click', openBookmarkModal);

  // --- 닉네임 ---
  dom.nicknameInput()?.addEventListener('input', () => {
    if (nicknameIsLocked) return;
    hideNicknameError();
  });
  dom.nicknameInput()?.addEventListener('change', () => {
    if (nicknameIsLocked) return;
    const val = dom.nicknameInput().value.trim();
    currentNickname = val;
    storageSet({ nickname: currentNickname });
    updateNicknameDisplay();
    hideNicknameError();
  });
  dom.nicknameInput()?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !nicknameIsLocked) {
      const val = dom.nicknameInput().value.trim();
      currentNickname = val;
      storageSet({ nickname: currentNickname });
      updateNicknameDisplay();
      dom.nicknameInput().blur();
    }
  });

  dom.nicknameLockBtn()?.addEventListener('click', () => {
    if (!nicknameIsLocked) {
      const val = dom.nicknameInput().value.trim();
      currentNickname = val;
      storageSet({ nickname: currentNickname });
      updateNicknameDisplay();
    }
    nicknameIsLocked = !nicknameIsLocked;
    storageSet({ nicknameLocked: nicknameIsLocked });
    applyNicknameLockUI(nicknameIsLocked);
    showToast(nicknameIsLocked ? '닉네임이 잠겼습니다.' : '닉네임 잠금이 해제되었습니다.', 'default');
  });

  // 웰컴 모달
  dom.welcomeStartBtn()?.addEventListener('click', confirmWelcomeNickname);
  dom.welcomeNickInput()?.addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmWelcomeNickname();
  });

  // --- 가져오기 / 내보내기 ---
  dom.exportBtn().addEventListener('click', exportSettings);
  dom.importInput().addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) importSettings(file);
    e.target.value = '';
  });

  // --- 검색창 고도화 (히스토리·자동완성·커맨드·키보드) ---
  bindSearchBox();

  dom.engineBtn().addEventListener('click', () => {
    let homeUrl;
    if (state.searchEngine === 'custom') {
      homeUrl = state.customSearchHome || state.customSearchUrl || '';
    } else {
      homeUrl = SEARCH_ENGINES[state.searchEngine]?.homeUrl || '';
    }
    if (homeUrl) window.location.href = homeUrl;
  });

  // --- 아이콘 추가·수정 모달 (공통) ---
  bindIconModalFileInput();

  document.getElementById('edit-icon-zoom')?.addEventListener('input', e => {
    const badge = document.getElementById('edit-icon-zoom-val');
    if (badge) badge.textContent = `${e.target.value}%`;
    syncEditIconTilePreview();
  });
  document.querySelectorAll('input[name="edit-icon-backdrop"]').forEach(r => {
    r.addEventListener('change', () => {
      toggleEditBackdropColorRow();
      syncEditIconTilePreview();
    });
  });
  const backdropColorEl = document.getElementById('edit-icon-backdrop-color');
  const backdropHexEl = document.getElementById('edit-icon-backdrop-color-hex');
  backdropColorEl?.addEventListener('input', e => {
    if (backdropHexEl) backdropHexEl.value = e.target.value;
    syncEditIconTilePreview();
  });
  backdropHexEl?.addEventListener('input', () => {
    const n = normalizeIconHexColor(backdropHexEl.value);
    if (n && backdropColorEl) {
      backdropColorEl.value = n;
      backdropHexEl.value = n;
      syncEditIconTilePreview();
    }
  });
  backdropHexEl?.addEventListener('blur', () => {
    reconcileEditIconBackdropColor();
    syncEditIconTilePreview();
  });
  backdropHexEl?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      backdropHexEl.blur();
    }
  });
  document.getElementById('edit-icon-tile-border')?.addEventListener('change', () => {
    syncEditIconTilePreview();
  });
  const urlPreviewInputs = [dom.editIconUrl(), dom.editIconName()];
  urlPreviewInputs.forEach(el => {
    el?.addEventListener('input', () => scheduleIconModalUrlPreview());
  });

  dom.editIconConfirm().addEventListener('click', () => {
    const name = dom.editIconName().value;
    const url  = dom.editIconUrl().value;
    const tileOpts = readIconModalTileOptions();
    if (iconModalMode === 'add') {
      if (addIcon(name, url, iconModalCustomImage, tileOpts)) closeModal(dom.editIconModal());
    } else if (updateIcon(editTargetId, name, url,
      iconModalCustomImage === undefined ? undefined : iconModalCustomImage,
      tileOpts)) {
      closeModal(dom.editIconModal());
    }
  });
  dom.editIconDelete().addEventListener('click', () => {
    closeModal(dom.editIconModal());
    deleteIcon(editTargetId);
    exitEditMode();
  });
  dom.editIconUrl().addEventListener('keydown', e => {
    if (e.key === 'Enter') dom.editIconConfirm().click();
  });

  // --- 빈 바탕 클릭: 수정 모드 종료 + 검색창 포커스(드롭다운은 열지 않음) ---
  document.addEventListener('click', e => {
    if (!isWorkspaceBackdropClick(e.target)) return;
    if (isEditMode) exitEditMode();
    if (document.querySelector('.modal:not(.hidden)')) return;
    const input = dom.searchInput();
    if (!input) return;
    _suppressFocusOpen = true;
    input.focus();
  });

  // --- 모달 닫기 ---
  document.querySelectorAll('.modal-close, [data-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.dataset.modal || btn.closest('.modal')?.id;
      if (modalId) closeModal(document.getElementById(modalId));
    });
  });
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', () => {
      const modal = backdrop.closest('.modal');
      if (modal) closeModal(modal);
    });
  });

  // --- ESC 키 ---
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const openModals = document.querySelectorAll('.modal:not(.hidden)');
    if (openModals.length > 0) {
      openModals.forEach(m => closeModal(m));
      return;
    }
    closeSettingsPanel();
    if (isEditMode) exitEditMode();
  });

  // 배경 드롭다운: 외부 클릭 시 닫기
  document.addEventListener('click', e => {
    if (_bgDropdownOpen
      && !e.target.closest('#bg-thumb-widget')
      && !e.target.closest('#bg-dropdown-panel')) {
      closeBgDropdown();
    }
  });

  // 시스템 테마 변경 감지
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.theme === 'system') applyTheme();
  });

  // 페이지 포커스 시 검색창 자동 포커스 (드롭다운은 열지 않음)
  // 캡처 단계에서 먼저 억제 플래그를 켜야, 브라우저가 bubble보다 먼저 검색창에 포커스를 줄 때 race로 드롭다운이 뜨지 않음
  window.addEventListener('focus', () => {
    _suppressFocusOpen = true;
  }, true);

  window.addEventListener('blur', () => {
    const dd = dom.searchDropdown();
    if (dd && !dd.classList.contains('hidden')) {
      _searchState = 'closed';
      closeSearchDropdown();
    }
    const input = dom.searchInput();
    if (!input) return;
    _searchClosedBeforeWindowBlur = _searchState === 'closed' && document.activeElement !== input;
  });

  window.addEventListener('focus', () => {
    const input = dom.searchInput();
    if (input) input.focus();
    const fixSpuriousOpen = _searchClosedBeforeWindowBlur;
    _searchClosedBeforeWindowBlur = false;
    if (fixSpuriousOpen) {
      queueMicrotask(() => {
        const inp = dom.searchInput();
        const dd = dom.searchDropdown();
        if (!inp || document.activeElement !== inp || !dd || dd.classList.contains('hidden')) return;
        _searchState = 'closed';
        closeSearchDropdown();
      });
    }
  });

  // ===========================
  // 드래그 앤 드롭
  // ===========================
  const gridEl   = dom.iconGrid();
  const dotsWrap = dom.pageDots();

  function clearDragPageTimer() {
    if (dragPageSwitchTimer) { clearTimeout(dragPageSwitchTimer); dragPageSwitchTimer = null; }
    if (dragTargetDot) { dragTargetDot.classList.remove('drag-hover'); dragTargetDot = null; }
  }

  function setPageDotsDragCursor(on) {
    document.documentElement.style.cursor = on ? 'pointer' : '';
  }

  function setupPageDotsDragHandlers(container) {
    if (!container) return;

    container.addEventListener('dragover', e => {
      if (dragSourceId !== null) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setPageDotsDragCursor(true);
      }
      const dot = e.target.closest('.page-dot');
      if (dragSourceId === null || !dot) return;
      const page = Number(dot.dataset.page);
      if (!Number.isFinite(page)) return;

      if (dot !== dragTargetDot) {
        clearDragPageTimer();
        dragTargetDot = dot;
        dot.classList.add('drag-hover');
        dragPageSwitchTimer = setTimeout(() => {
          goToPage(page);
          dragPageSwitchTimer = null;
          if (dragTargetDot === dot) {
            dragTargetDot.classList.remove('drag-hover');
            dragTargetDot = null;
          }
        }, 420);
      }
    });

    container.addEventListener('dragleave', e => {
      if (!container.contains(e.relatedTarget)) {
        setPageDotsDragCursor(false);
        clearDragPageTimer();
      }
    });

    container.addEventListener('drop', e => {
      const dot = e.target.closest('.page-dot');
      e.preventDefault();
      e.stopPropagation();
      setPageDotsDragCursor(false);
      clearDragPageTimer();
      if (dragSourceId === null || !dot) return;
      const page = Number(dot.dataset.page);
      if (!Number.isFinite(page)) return;
      moveIconToPage(dragSourceId, page);
    });
  }

  setupPageDotsDragHandlers(dotsWrap);

  function clearDragIndicators() {
    gridEl.querySelectorAll('.drag-over-left, .drag-over-right').forEach(el => {
      el.classList.remove('drag-over-left', 'drag-over-right');
    });
    gridEl.querySelector('.drag-over-add')?.classList.remove('drag-over-add');
  }

  gridEl.addEventListener('dragstart', e => {
    const item = e.target.closest('.icon-item');
    if (!item || isEditMode) { e.preventDefault(); return; }
    dragSourceId = Number(item.dataset.id);
    lastDragTargetKey = null;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(dragSourceId));
    dragStartTimer = setTimeout(() => {
      dragStartTimer = null;
      item.classList.add('dragging');
      gridEl.classList.add('is-dragging');
    }, 0);
  });

  document.addEventListener('dragend', () => {
    if (dragStartTimer) { clearTimeout(dragStartTimer); dragStartTimer = null; }
    if (dragRafId)      { cancelAnimationFrame(dragRafId); dragRafId = null; }
    lastDragTargetKey   = null;
    dragSourceId = null;
    document.documentElement.style.cursor = '';
    clearDragPageTimer();
    clearDragIndicators();
    clearAllDragTransforms();
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
    dom.iconGrid()?.classList.remove('is-dragging');
  });

  gridEl.addEventListener('dragover', e => {
    e.preventDefault();
    if (dragSourceId === null) return;
    e.dataTransfer.dropEffect = 'move';

    const addBtn = e.target.closest('.icon-add-btn');
    if (addBtn) { addBtn.classList.add('drag-over-add'); return; }

    const slot = getHoveredDragSlot(e.clientX, e.clientY);
    if (!slot || slot.icon.id === dragSourceId) return;

    const { icon, insertBefore } = slot;
    const targetId = icon.id;
    const key = `${targetId}-${insertBefore}`;
    if (key === lastDragTargetKey) return;
    lastDragTargetKey = key;

    if (dragRafId) cancelAnimationFrame(dragRafId);
    dragRafId = requestAnimationFrame(() => {
      applyDragVisuals(dragSourceId, targetId, insertBefore);
      dragRafId = null;
    });
  });

  gridEl.addEventListener('dragleave', e => {
    if (!gridEl.contains(e.relatedTarget)) {
      clearDragIndicators();
      clearAllDragTransforms();
      lastDragTargetKey = null;
    }
  });

  gridEl.addEventListener('drop', e => {
    e.preventDefault();
    if (dragSourceId === null) return;
    if (dragRafId) { cancelAnimationFrame(dragRafId); dragRafId = null; }
    clearDragIndicators();
    clearAllDragTransforms();
    lastDragTargetKey = null;

    const slot = getHoveredDragSlot(e.clientX, e.clientY);
    // 드롭 시점에 격자 기준으로 다른 아이콘 칸이 확정될 때만 재정렬. 자기 칸/빈 칸/격자 밖이면 취소(원위치).
    if (slot && slot.icon.id !== dragSourceId) {
      reorderIcon(dragSourceId, slot.icon.id, slot.insertBefore);
    }
  });
}

// ===========================
// 검색 히스토리 & 자동완성 & 커맨드
// ===========================

const SEARCH_HISTORY_MAX = 20;
const SEARCH_HISTORY_KEY = 'searchHistory';

let _searchHistory      = [];
let _searchState        = 'closed';  // 'idle' | 'typing' | 'closed'
let _activeIdx          = -1;
let _dropdownItems      = [];        // 현재 렌더된 항목 (키보드 탐색용)
let _suggestions        = [];        // Google Suggest 결과
let _suggestTimer       = null;
let _suppressFocusOpen  = false;     // 프로그래밍 방식 포커스 시 드롭다운 억제
/** 창 포커스 복귀 시 브라우저가 window.focus보다 먼저 검색창에 포커스를 주면 드롭다운이 열림 → 한 틱 뒤 닫기 */
let _searchClosedBeforeWindowBlur = false;

/* chrome.storage.sync 기반 히스토리 저장 */
function searchHistoryGet() {
  return new Promise(resolve => {
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      chrome.storage.sync.get({ [SEARCH_HISTORY_KEY]: [] }, d => resolve(d[SEARCH_HISTORY_KEY] || []));
    } else {
      try { resolve(JSON.parse(localStorage.getItem('iTab_' + SEARCH_HISTORY_KEY) || '[]')); }
      catch { resolve([]); }
    }
  });
}

function searchHistorySet(history) {
  if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
    chrome.storage.sync.set({ [SEARCH_HISTORY_KEY]: history });
  } else {
    localStorage.setItem('iTab_' + SEARCH_HISTORY_KEY, JSON.stringify(history));
  }
}

async function initSearchHistory() {
  _searchHistory = await searchHistoryGet();
}

function addToSearchHistory(query) {
  const q = query.trim();
  if (!q) return;
  _searchHistory = _searchHistory.filter(h => h.toLowerCase() !== q.toLowerCase());
  _searchHistory.unshift(q);
  if (_searchHistory.length > SEARCH_HISTORY_MAX) _searchHistory.length = SEARCH_HISTORY_MAX;
  searchHistorySet(_searchHistory);
}

function removeFromSearchHistory(query) {
  _searchHistory = _searchHistory.filter(h => h !== query);
  searchHistorySet(_searchHistory);
  renderSearchDropdown();
}

function clearSearchHistory() {
  _searchHistory = [];
  searchHistorySet(_searchHistory);
  renderSearchDropdown();
}

/* 커맨드 파싱: "yt 고양이" → { cmd:'yt', query:'고양이', ... } */
function parseSearchCommand(input) {
  const trimmed = input.trim();
  for (const [cmd, info] of Object.entries(SEARCH_COMMANDS)) {
    if (trimmed.toLowerCase() === cmd) {
      return { cmd, query: '', homeUrl: info.homeUrl, searchUrl: null, label: info.label };
    }
    if (trimmed.toLowerCase().startsWith(cmd + ' ')) {
      const q = trimmed.slice(cmd.length + 1).trim();
      return { cmd, query: q, searchUrl: info.searchUrl.replace('{query}', encodeURIComponent(q)), homeUrl: info.homeUrl, label: info.label };
    }
  }
  return null;
}

/* Google Suggest — 확장 환경에서는 Background SW, 웹(PWA)에서는 직접 fetch */
function fetchSuggestions(query) {
  const q = (query || '').trim();
  if (!q) return Promise.resolve([]);

  // 1) 확장(Manifest v3) 환경: Background Service Worker를 통해 CORS 없이 fetch
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    return new Promise(resolve => {
      const timer = setTimeout(() => resolve([]), 2000); // 2초 타임아웃
      chrome.runtime.sendMessage({ type: 'fetchSuggest', query: q }, response => {
        clearTimeout(timer);
        if (chrome.runtime.lastError || !response?.ok) { resolve([]); return; }
        resolve(response.list || []);
      });
    });
  }

  // 2) 웹(PWA) 환경: 직접 fetch (CORS 정책에 따라 실패할 수 있으므로 안전 폴백)
  return (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    try {
      const url =
        `https://suggestqueries.google.com/complete/search` +
        `?client=firefox&hl=ko&gl=kr&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { signal: controller.signal, mode: 'cors' });
      if (!res.ok) return [];
      const data = await res.json();
      const list = Array.isArray(data?.[1]) ? data[1].slice(0, 7) : [];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
  })();
}

/* 히스토리 필터링 */
function getFilteredHistory(query) {
  if (!query) return _searchHistory.slice(0, 8);
  const q = query.toLowerCase();
  return _searchHistory.filter(h => h.toLowerCase().includes(q)).slice(0, 5);
}

/* HTML 이스케이프 */
function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* 활성 항목 변경 */
function setDropdownActive(idx) {
  _dropdownItems.forEach(item => item.el.classList.remove('active'));
  _activeIdx = (idx >= 0 && idx < _dropdownItems.length) ? idx : -1;
  if (_activeIdx >= 0) _dropdownItems[_activeIdx].el.classList.add('active');
}

/* 드롭다운 열기/닫기 */
function openSearchDropdown() {
  dom.searchDropdown()?.classList.remove('hidden');
}
function closeSearchDropdown() {
  dom.searchDropdown()?.classList.add('hidden');
  _activeIdx     = -1;
  _dropdownItems = [];
}

/* 아이콘 SVG 생성 */
function makeSearchIcon(type) {
  const ns  = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'search-item-icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  if (type === 'history') {
    svg.innerHTML = '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>';
  } else {
    svg.innerHTML = '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>';
  }
  return svg;
}

/* 히스토리 항목 요소 생성 */
function createHistoryItemEl(text, query) {
  const el = document.createElement('div');
  el.className = 'search-dropdown-item';
  el.setAttribute('role', 'option');

  el.appendChild(makeSearchIcon('history'));

  const textEl = document.createElement('span');
  textEl.className = 'search-item-text';
  if (query) {
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx !== -1) {
      textEl.innerHTML = escHtml(text.slice(0, idx))
        + `<mark class="search-match">${escHtml(text.slice(idx, idx + query.length))}</mark>`
        + escHtml(text.slice(idx + query.length));
    } else {
      textEl.textContent = text;
    }
  } else {
    textEl.textContent = text;
  }
  el.appendChild(textEl);

  const delBtn = document.createElement('button');
  delBtn.className = 'search-item-delete';
  delBtn.setAttribute('aria-label', '삭제');
  delBtn.textContent = '✕';
  delBtn.addEventListener('mousedown', e => {
    e.preventDefault();
    e.stopPropagation();
    removeFromSearchHistory(text);
  });
  el.appendChild(delBtn);

  el.addEventListener('mousedown', e => {
    if (e.target === delBtn || delBtn.contains(e.target)) return;
    e.preventDefault();
    dom.searchInput().value = text;
    executeSearch(text);
  });

  return el;
}

/* 추천 항목 요소 생성 */
function createSuggestItemEl(text) {
  const el = document.createElement('div');
  el.className = 'search-dropdown-item';
  el.setAttribute('role', 'option');

  el.appendChild(makeSearchIcon('suggest'));

  const textEl = document.createElement('span');
  textEl.className = 'search-item-text';
  textEl.textContent = text;
  el.appendChild(textEl);

  el.addEventListener('mousedown', e => {
    e.preventDefault();
    dom.searchInput().value = text;
    executeSearch(text);
  });
  return el;
}

/* 드롭다운 전체 렌더링 */
function renderSearchDropdown() {
  const dropdown = dom.searchDropdown();
  if (!dropdown) return;

  const query        = (dom.searchInput()?.value || '').trim();
  const historyItems = getFilteredHistory(query);
  const suggestItems = _suggestions
    .filter(s => !historyItems.some(h => h.toLowerCase() === s.toLowerCase()))
    .slice(0, 7);

  if (!query && historyItems.length === 0) { closeSearchDropdown(); return; }
  if ( query && historyItems.length === 0 && suggestItems.length === 0) { closeSearchDropdown(); return; }

  dropdown.innerHTML = '';
  _dropdownItems = [];

  // 커맨드 안내 바
  const cmdMatch = query ? parseSearchCommand(query) : null;
  if (cmdMatch) {
    const bar = document.createElement('div');
    bar.className = 'search-command-bar';
    bar.innerHTML = `<span class="search-item-cmd-badge">${cmdMatch.cmd}</span>`
      + `<span>${cmdMatch.label}${cmdMatch.query ? `로 "<strong>${escHtml(cmdMatch.query)}</strong>" 검색` : ' 홈으로 이동'}</span>`;
    dropdown.appendChild(bar);
  }

  // 히스토리 섹션
  if (historyItems.length > 0) {
    const header = document.createElement('div');
    header.className = 'search-section-header';
    const title = document.createElement('span');
    title.textContent = '최근 검색';
    header.appendChild(title);

    if (!query) {
      const clearBtn = document.createElement('button');
      clearBtn.className = 'search-clear-all-btn';
      clearBtn.textContent = '전체 삭제';
      clearBtn.addEventListener('mousedown', e => { e.preventDefault(); clearSearchHistory(); });
      header.appendChild(clearBtn);
    }
    dropdown.appendChild(header);

    historyItems.forEach(text => {
      const el = createHistoryItemEl(text, query);
      _dropdownItems.push({ el, text });
      dropdown.appendChild(el);
    });
  }

  // 추천 섹션
  if (suggestItems.length > 0) {
    if (historyItems.length > 0) {
      const divider = document.createElement('div');
      divider.className = 'search-section-divider';
      dropdown.appendChild(divider);
    }
    const sugHeader = document.createElement('div');
    sugHeader.className = 'search-section-header';
    const sugTitle = document.createElement('span');
    sugTitle.textContent = '추천 검색어';
    sugHeader.appendChild(sugTitle);
    dropdown.appendChild(sugHeader);

    suggestItems.forEach(text => {
      const el = createSuggestItemEl(text);
      _dropdownItems.push({ el, text });
      dropdown.appendChild(el);
    });
  }

  // 첫 항목 자동 하이라이트
  setDropdownActive(0);
  openSearchDropdown();
}

/* 검색 실행 (커맨드 처리 포함) */
function executeSearch(rawQuery) {
  const q = (rawQuery ?? dom.searchInput()?.value ?? '').trim();
  if (!q) return;

  // 커맨드 분기
  const cmd = parseSearchCommand(q);
  if (cmd) {
    closeSearchDropdown();
    if (cmd.searchUrl) {
      addToSearchHistory(q);
      window.location.href = cmd.searchUrl;
    } else {
      window.location.href = cmd.homeUrl;
    }
    return;
  }

  addToSearchHistory(q);
  closeSearchDropdown();

  let searchUrl;
  if (state.searchEngine === 'custom') {
    searchUrl = (state.customSearchUrl || '').replace('{query}', encodeURIComponent(q));
  } else {
    searchUrl = SEARCH_ENGINES[state.searchEngine]?.searchUrl.replace('{query}', encodeURIComponent(q));
  }
  if (searchUrl) window.location.href = searchUrl;
}

/* 검색창 이벤트 바인딩 */
function bindSearchBox() {
  const input = dom.searchInput();
  if (!input) return;

  // 포커스 → idle (닫혀있던 경우 히스토리 표시)
  // 단, 프로그래밍 방식 포커스(페이지 로드·뒤로가기·window.focus)는 드롭다운 열지 않음
  // mousedown 여부로 클릭 vs 키보드(Tab) 포커스 구분
  let _clickFocus = false;
  input.addEventListener('mousedown', () => { _clickFocus = true; });

  // 포커스만으로는 드롭다운을 열지 않음(바탕 클릭·Tab·window 포커스 등).
  // 목록은 검색창을 직접 클릭할 때만 열고 닫음(click 핸들러).
  input.addEventListener('focus', () => {
    if (_suppressFocusOpen) { _suppressFocusOpen = false; _clickFocus = false; return; }
    if (_clickFocus) { _clickFocus = false; return; }
  });

  // 클릭 → 열려있으면 닫기, 닫혀있으면 열기 (토글)
  input.addEventListener('click', () => {
    const isOpen = !dom.searchDropdown()?.classList.contains('hidden');
    if (isOpen) {
      _searchState = 'closed';
      closeSearchDropdown();
    } else {
      _searchState = input.value.trim() ? 'typing' : 'idle';
      renderSearchDropdown();
    }
  });

  // 입력 변경
  input.addEventListener('input', () => {
    const val = input.value.trim();
    _searchState = val ? 'typing' : 'idle';
    _activeIdx   = -1;
    _suggestions = [];
    renderSearchDropdown();

    if (val) {
      clearTimeout(_suggestTimer);
      _suggestTimer = setTimeout(async () => {
        const sug = await fetchSuggestions(val);
        // 입력값이 바뀌지 않은 경우에만 반영
        if (input.value.trim() === val) {
          _suggestions = sug;
          renderSearchDropdown();
        }
      }, 300);
    }
  });

  // 키보드 UX
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      _searchState = 'closed';
      closeSearchDropdown();
      return;
    }

    const ddEl = dom.searchDropdown();
    const isOpen = ddEl && !ddEl.classList.contains('hidden');

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) return;
      setDropdownActive(_activeIdx < _dropdownItems.length - 1 ? _activeIdx + 1 : 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) return;
      setDropdownActive(_activeIdx > 0 ? _activeIdx - 1 : _dropdownItems.length - 1);
    } else if (e.key === 'Tab') {
      if (isOpen && _activeIdx >= 0) {
        e.preventDefault();
        input.value = _dropdownItems[_activeIdx].text;
        _searchState = 'typing';
        _suggestions = [];
        renderSearchDropdown();
      }
    } else if (e.key === 'Enter') {
      if (isOpen && _activeIdx >= 0) {
        e.preventDefault();
        executeSearch(_dropdownItems[_activeIdx].text);
      } else {
        executeSearch(input.value);
      }
    }
  });

  // 외부 클릭 시 드롭다운 닫기
  document.addEventListener('mousedown', e => {
    const section = dom.searchSection();
    if (section && !section.contains(e.target)) {
      _searchState = 'closed';
      closeSearchDropdown();
    }
  });

  // 검색 버튼 클릭
  dom.searchSubmit()?.addEventListener('click', () => executeSearch(input.value));
}

// ===========================
// 초기화
// ===========================
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await initNickname();
  await initSearchHistory();
  bindEvents();
  setTimeout(() => {
    if (!currentNickname) return;
    _suppressFocusOpen = true;   // 초기 자동 포커스 시 드롭다운 열지 않음
    dom.searchInput().focus();
  }, 100);
});
