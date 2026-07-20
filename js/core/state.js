// core/state.js
import {
  STORAGE_KEYS,
  DEFAULT_INVENTORY,
  DEFAULT_STOCK,
  DEFAULT_SPECS,
  DEFAULT_PROPS,
  DEFAULT_COMMON_CASES,
  DEFAULT_CATEGORY_ORDER,
  DEFAULT_TRUCK_PRESETS,
  CASE_MODES_DEFAULTS,
} from './config.js';
import {
  cleanupInventory,
  normalizeSubgroups,
  normalizeCaseModes,
  normalizeCategoryOrder,
} from './cleanup.js';

const state = {
  inventory: {},
  stock: {},
  specs: {},
  itemProps: {},
  catNames: {},
  _categoryOrder: [],
  commonCases: [],
  truckPresets: [],
  projects: [],
  projectItems: [],
  order: {},
  orderSplits: {},
  links: {},
  notes: {},
  orderPacking: {},
  individualCaseValues: {},
  commonRoutes: {},
  caseModes: {},
  orderExclude: {},
  orderExtra: {},
  orderProject: {
    id: null,
    name: '',
    start_date: '',
    end_date: '',
    status: 'planned',
  },
  openChecked: {},
  openCategoryState: {},
  openDescState: {},
  detailsOpenOrder: false,
  selectedTruckIds: [],
  matrixFullNames: true,
  _calcCache: new Map(),
};

if (typeof window !== 'undefined') {
  window.__STATE = state;
}

let subscribers = [];

export function getState() { return state; }
export function getStateKey(key) { return state[key]; }
export function setStateKey(key, value) {
  state[key] = value;
  notifySubscribers(key);
}
export function subscribe(callback) {
  subscribers.push(callback);
  return () => { subscribers = subscribers.filter(cb => cb !== callback); };
}
function notifySubscribers(changedKey) {
  subscribers.forEach(cb => {
    try { cb(changedKey, state); } catch (e) { console.warn('Ошибка в подписчике state:', e); }
  });
}

/**
 * Нормализует пути в объекте: заменяет обратные слеши \ на прямые |
 */
function normalizePaths(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const result = {};
  for (let key in obj) {
    const newKey = key.replace(/\\/g, '|');
    result[newKey] = obj[key];
  }
  return result;
}

export function loadState() {
  console.log('[state] loadState() вызван');
  
  // 1. Загружаем основную библиотеку
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.APP_DATA);
    if (saved) {
      const parsed = JSON.parse(saved);
      console.log('[state] Данные APP_DATA загружены, ключи:', Object.keys(parsed));
      
      // ⭐ НОРМАЛИЗУЕМ ВСЕ ПУТИ
      if (parsed.itemProps) {
        parsed.itemProps = normalizePaths(parsed.itemProps);
        console.log('[state] itemProps нормализованы, ключей:', Object.keys(parsed.itemProps).length);
      }
      if (parsed.stock) parsed.stock = normalizePaths(parsed.stock);
      if (parsed.specs) parsed.specs = normalizePaths(parsed.specs);
      if (parsed.inventory) {
        // Для inventory нам нужно нормализовать ключи вложенных объектов? 
        // Но inventory обычно не содержит путей с разделителями, кроме ключей подгрупп.
        // Пропускаем, чтобы не сломать.
      }
      
      Object.assign(state, parsed);
      console.log('[state] state.itemProps после загрузки:', Object.keys(state.itemProps || {}).length, 'ключей');
    } else {
      console.warn('[state] APP_DATA отсутствует в localStorage');
      resetState();
    }
  } catch (e) {
    console.error('[state] Ошибка загрузки APP_DATA:', e);
    resetState();
  }

  // 2. Загружаем данные заказа (тоже с нормализацией)
  try {
    const orderRaw = localStorage.getItem(STORAGE_KEYS.ORDER_DATA);
    if (orderRaw) {
      const orderData = JSON.parse(orderRaw);
      // Нормализуем пути в объектах заказа
      const orderKeys = ['order', 'orderSplits', 'links', 'notes', 'orderPacking', 
                         'individualCaseValues', 'commonRoutes', 'caseModes', 
                         'orderExclude', 'orderExtra'];
      orderKeys.forEach(key => {
        if (orderData[key] && typeof orderData[key] === 'object') {
          orderData[key] = normalizePaths(orderData[key]);
        }
      });
      Object.keys(orderData).forEach(key => {
        if (key in state && key !== 'inventory' && key !== 'stock' && key !== 'specs' &&
            key !== 'itemProps' && key !== 'catNames' && key !== '_categoryOrder' &&
            key !== 'commonCases' && key !== 'truckPresets' && key !== 'projects' &&
            key !== 'projectItems') {
          state[key] = orderData[key];
        }
      });
      console.log('[state] ORDER_DATA загружен (пути нормализованы)');
    }
  } catch (e) { console.warn('[state] Ошибка загрузки ORDER_DATA:', e); }

  // 3. Загружаем UI состояние
  try {
    const uiRaw = localStorage.getItem(STORAGE_KEYS.UI_STATE);
    if (uiRaw) {
      const uiData = JSON.parse(uiRaw);
      if (uiData.openChecked) state.openChecked = uiData.openChecked;
      if (uiData.openCategoryState) state.openCategoryState = uiData.openCategoryState;
      if (uiData.openDescState) state.openDescState = uiData.openDescState;
      if (uiData.detailsOpenOrder !== undefined) state.detailsOpenOrder = uiData.detailsOpenOrder;
      if (uiData.matrixFullNames !== undefined) state.matrixFullNames = uiData.matrixFullNames;
      console.log('[state] UI_STATE загружен');
    }
  } catch (e) { console.warn('[state] Ошибка загрузки UI_STATE:', e); }

  // 4. Загружаем выбранные грузовики
  try {
    const truckRaw = localStorage.getItem(STORAGE_KEYS.SELECTED_TRUCKS);
    if (truckRaw) {
      state.selectedTruckIds = JSON.parse(truckRaw);
    }
  } catch (e) { state.selectedTruckIds = []; }

  // 5. Загружаем тему
  try {
    const theme = localStorage.getItem(STORAGE_KEYS.THEME);
    if (theme) state.theme = theme;
    else state.theme = 'dark';
  } catch (e) { state.theme = 'dark'; }

  // 6. Нормализация (приводим данные к единому виду)
  normalizeState();
  console.log('[state] Нормализация завершена');
  
  // 7. Проверка: наличие itemProps после нормализации
  console.log('[state] После нормализации state.itemProps содержит', Object.keys(state.itemProps || {}).length, 'ключей');
  const testPath = 'video|Экран|Экран 0.5x0.5 LED P2.6 (192x192)';
  if (state.itemProps[testPath]) {
    console.log('[state] ✅ Данные для', testPath, 'загружены:', state.itemProps[testPath]);
  } else {
    console.warn('[state] ❌ Данные для', testPath, 'НЕ загружены');
    const keys = Object.keys(state.itemProps);
    const similar = keys.filter(k => k.includes('0.5x0.5') || k.includes('Экран'));
    if (similar.length > 0) {
      console.warn('[state] Похожие ключи в itemProps:', similar);
    }
  }

  notifySubscribers('*');
}

export function saveState() {
  const toSave = {
    inventory: state.inventory,
    stock: state.stock,
    specs: state.specs,
    itemProps: state.itemProps,
    catNames: state.catNames,
    _categoryOrder: state._categoryOrder,
    commonCases: state.commonCases,
    truckPresets: state.truckPresets,
    projects: state.projects,
    projectItems: state.projectItems,
  };
  localStorage.setItem(STORAGE_KEYS.APP_DATA, JSON.stringify(toSave));

  const orderToSave = {
    order: state.order,
    orderSplits: state.orderSplits,
    links: state.links,
    notes: state.notes,
    orderPacking: state.orderPacking,
    individualCaseValues: state.individualCaseValues,
    commonRoutes: state.commonRoutes,
    caseModes: state.caseModes,
    orderExclude: state.orderExclude,
    orderExtra: state.orderExtra,
    orderProject: state.orderProject,
  };
  localStorage.setItem(STORAGE_KEYS.ORDER_DATA, JSON.stringify(orderToSave));

  const uiToSave = {
    openChecked: state.openChecked,
    openCategoryState: state.openCategoryState,
    openDescState: state.openDescState,
    detailsOpenOrder: state.detailsOpenOrder,
    matrixFullNames: state.matrixFullNames,
  };
  localStorage.setItem(STORAGE_KEYS.UI_STATE, JSON.stringify(uiToSave));

  localStorage.setItem(STORAGE_KEYS.SELECTED_TRUCKS, JSON.stringify(state.selectedTruckIds));

  if (state.theme) {
    localStorage.setItem(STORAGE_KEYS.THEME, state.theme);
  }

  state._calcCache.clear();
}

function normalizeState() {
  cleanupInventory(state.inventory, state.stock, state.specs, state.itemProps);
  normalizeSubgroups(state.inventory);

  // Нормализация itemProps
  for (let key in state.itemProps) {
    const props = state.itemProps[key];
    if (!props) continue;
    if (props.individualCases === undefined) props.individualCases = [];
    if (!Array.isArray(props.individualCases)) props.individualCases = [];
    if (props.allowCommon === undefined) props.allowCommon = false;
    if (props.commonCases === undefined) props.commonCases = [];
    if (!Array.isArray(props.commonCases)) props.commonCases = [];
    props.individualCases = props.individualCases.map(c => {
      if (c.maxCases === undefined) c.maxCases = 0;
      return c;
    });
    if (props.weight === undefined) props.weight = 0;
    if (props.dimensions === undefined) props.dimensions = '';
    if (props.volume === undefined) props.volume = 0;
  }

  // Нормализация caseModes (тоже нормализуем пути)
  state.caseModes = normalizePaths(state.caseModes);
  normalizeCaseModes(state.caseModes);

  // ===== ГАРАНТИРОВАННАЯ НОРМАЛИЗАЦИЯ ДЛЯ МУЛЬТИКОФРОВ =====
  for (let path in state.itemProps) {
    const props = state.itemProps[path];
    if (props.individualCases && props.individualCases.length > 1) {
      if (!state.caseModes[path]) {
        state.caseModes[path] = { ...CASE_MODES_DEFAULTS };
      }
      const mode = state.caseModes[path];
      if (!Array.isArray(mode.multiSelected) || mode.multiSelected.length !== props.individualCases.length) {
        mode.multiSelected = props.individualCases.map(() => true);
      }
      if (mode.enabled && !mode.multiSelected.some(v => v === true)) {
        mode.multiSelected = props.individualCases.map(() => true);
      }
      if (!mode.enabled && (!mode.multiSelected || mode.multiSelected.length === 0)) {
        mode.multiSelected = props.individualCases.map(() => true);
      }
    }
  }

  // Для всех позиций с individualCases > 0, но без caseModes, создаём запись
  for (let path in state.itemProps) {
    const props = state.itemProps[path];
    if (props.individualCases && props.individualCases.length > 0) {
      if (!state.caseModes[path]) {
        state.caseModes[path] = { ...CASE_MODES_DEFAULTS };
      }
    }
  }

  if (!state.truckPresets || !Array.isArray(state.truckPresets)) {
    state.truckPresets = [...DEFAULT_TRUCK_PRESETS];
  }

  state._categoryOrder = normalizeCategoryOrder(state._categoryOrder, state.inventory);

  if (!state.projects) state.projects = [];
  if (!state.projectItems) state.projectItems = [];
  if (!state.orderProject) {
    state.orderProject = { id: null, name: '', start_date: '', end_date: '', status: 'planned' };
  }
  state._calcCache.clear();
}

function resetState() {
  state.inventory = { ...DEFAULT_INVENTORY };
  state.stock = { ...DEFAULT_STOCK };
  state.specs = { ...DEFAULT_SPECS };
  state.itemProps = { ...DEFAULT_PROPS };
  state.catNames = {};
  state._categoryOrder = [];
  state.commonCases = [];
  state.truckPresets = [...DEFAULT_TRUCK_PRESETS];
  state.projects = [];
  state.projectItems = [];
  state.order = {};
  state.orderSplits = {};
  state.links = {};
  state.notes = {};
  state.orderPacking = {};
  state.individualCaseValues = {};
  state.commonRoutes = {};
  state.caseModes = {};
  state.orderExclude = {};
  state.orderExtra = {};
  state.orderProject = { id: null, name: '', start_date: '', end_date: '', status: 'planned' };
  state._calcCache.clear();
}

export function getCachedCalculation(key) {
  return state._calcCache.get(key);
}

export function setCachedCalculation(key, value) {
  state._calcCache.set(key, value);
}

export function clearCalculationCache() {
  state._calcCache.clear();
}

export function initState() {
  loadState();
}

export default {
  getState,
  getStateKey,
  setStateKey,
  subscribe,
  loadState,
  saveState,
  getCachedCalculation,
  setCachedCalculation,
  clearCalculationCache,
  initState,
};