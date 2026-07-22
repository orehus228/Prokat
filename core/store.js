// core/store.js

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
  DEFAULT_PROJECT_STATUS,
} from './config.js';
import {
  deepClone,
  safeGetStorage,
  safeSetStorage,
  normalizePathSlashes,
} from './utils.js';
import { emit } from './events.js';

const state = {
  inventory: { ...DEFAULT_INVENTORY },
  stock: { ...DEFAULT_STOCK },
  specs: { ...DEFAULT_SPECS },
  itemProps: { ...DEFAULT_PROPS },
  catNames: {},
  _categoryOrder: [...DEFAULT_CATEGORY_ORDER],
  commonCases: [...DEFAULT_COMMON_CASES],
  truckPresets: [...DEFAULT_TRUCK_PRESETS],
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
    status: DEFAULT_PROJECT_STATUS,
  },
  openChecked: {},
  openCategoryState: {},
  openDescState: {},
  detailsOpenOrder: false,
  selectedTruckIds: [],
  matrixFullNames: true,
  theme: 'dark',
  _calcCache: new Map(),
};

let subscribers = [];

export function getState() {
  return deepClone(state);
}

export function getStateKey(key) {
  return state[key];
}

export function setStateKey(key, value) {
  state[key] = value;
  notifySubscribers(key);
}

export function subscribe(callback) {
  subscribers.push(callback);
  return () => {
    subscribers = subscribers.filter(cb => cb !== callback);
  };
}

function notifySubscribers(changedKey) {
  const snapshot = getState();
  for (const cb of subscribers) {
    try {
      cb(changedKey, snapshot);
    } catch (e) {
      console.warn('[Store] Ошибка в подписчике:', e);
    }
  }
}

/**
 * Обновляет состояние из переданных данных (мердж + нормализация + сохранение).
 */
export function updateState(newData) {
  console.log('[Store] updateState вызван, ключи:', Object.keys(newData));
  for (const key of Object.keys(newData)) {
    if (key in state) {
      state[key] = deepClone(newData[key]);
      console.log(`[Store] Обновлён ключ: ${key}, размер: ${Object.keys(state[key]).length}`);
    }
  }
  normalizeInventoryStructure();
  normalizeCaseModes();
  if (!state._categoryOrder || state._categoryOrder.length === 0) {
    state._categoryOrder = Object.keys(state.inventory);
  }
  if (!(state._calcCache instanceof Map)) {
    state._calcCache = new Map();
  } else {
    state._calcCache.clear();
  }
  saveState();
  notifySubscribers('*');
  console.log('[Store] updateState завершён');
}

export function loadState() {
  console.log('[Store] Загрузка состояния...');
  const appData = safeGetStorage(STORAGE_KEYS.APP_DATA, null);
  if (appData) {
    const { itemProps, stock, specs, ...rest } = appData;
    const normalizeKeys = (obj) => {
      if (!obj || typeof obj !== 'object') return {};
      const result = {};
      for (const key of Object.keys(obj)) {
        const newKey = normalizePathSlashes(key);
        result[newKey] = obj[key];
      }
      return result;
    };
    Object.assign(state, rest);
    state.itemProps = normalizeKeys(itemProps || {});
    state.stock = normalizeKeys(stock || {});
    state.specs = normalizeKeys(specs || {});
    for (const path of Object.keys(state.itemProps)) {
      const props = state.itemProps[path];
      if (props) {
        if (props.weight === undefined) props.weight = 0;
        if (props.dimensions === undefined) props.dimensions = '';
        if (props.volume === undefined) props.volume = 0;
        if (props.individualCases === undefined) props.individualCases = [];
        if (props.allowCommon === undefined) props.allowCommon = false;
        if (props.commonCases === undefined) props.commonCases = [];
      }
    }
    console.log('[Store] APP_DATA загружен, позиций:', Object.keys(state.itemProps).length);
  } else {
    console.warn('[Store] APP_DATA отсутствует');
  }

  const orderData = safeGetStorage(STORAGE_KEYS.ORDER_DATA, null);
  if (orderData) {
    const normalizeOrderKeys = (obj) => {
      if (!obj || typeof obj !== 'object') return {};
      const result = {};
      for (const key of Object.keys(obj)) {
        const newKey = normalizePathSlashes(key);
        result[newKey] = obj[key];
      }
      return result;
    };
    const orderKeys = [
      'order', 'orderSplits', 'links', 'notes', 'orderPacking',
      'individualCaseValues', 'commonRoutes', 'caseModes', 'orderExclude', 'orderExtra'
    ];
    for (const key of orderKeys) {
      if (orderData[key]) {
        state[key] = normalizeOrderKeys(orderData[key]);
      }
    }
    if (orderData.orderProject) {
      state.orderProject = { ...orderData.orderProject };
    }
    console.log('[Store] ORDER_DATA загружен');
  }

  const uiData = safeGetStorage(STORAGE_KEYS.UI_STATE, null);
  if (uiData) {
    if (uiData.openChecked) state.openChecked = uiData.openChecked;
    if (uiData.openCategoryState) state.openCategoryState = uiData.openCategoryState;
    if (uiData.openDescState) state.openDescState = uiData.openDescState;
    if (uiData.detailsOpenOrder !== undefined) state.detailsOpenOrder = uiData.detailsOpenOrder;
    if (uiData.matrixFullNames !== undefined) state.matrixFullNames = uiData.matrixFullNames;
    console.log('[Store] UI_STATE загружен');
  }

  const selectedTrucks = safeGetStorage(STORAGE_KEYS.SELECTED_TRUCKS, []);
  if (Array.isArray(selectedTrucks)) {
    state.selectedTruckIds = selectedTrucks;
  }

  const theme = safeGetStorage(STORAGE_KEYS.THEME, 'dark');
  state.theme = theme;

  normalizeInventoryStructure();
  normalizeCaseModes();

  if (!state._categoryOrder || state._categoryOrder.length === 0) {
    state._categoryOrder = Object.keys(state.inventory);
  } else {
    state._categoryOrder = state._categoryOrder.filter(cat => state.inventory[cat] !== undefined);
    for (const cat of Object.keys(state.inventory)) {
      if (!state._categoryOrder.includes(cat)) {
        state._categoryOrder.push(cat);
      }
    }
  }

  if (!(state._calcCache instanceof Map)) {
    state._calcCache = new Map();
  } else {
    state._calcCache.clear();
  }

  console.log('[Store] Состояние загружено');
  notifySubscribers('*');
}

function normalizeInventoryStructure() {
  for (const cat of Object.keys(state.inventory)) {
    const catData = state.inventory[cat];
    if (catData && typeof catData === 'object' && !Array.isArray(catData)) {
      if (!catData._subOrder) {
        catData._subOrder = Object.keys(catData).filter(k => k !== '_subOrder');
      } else {
        catData._subOrder = catData._subOrder.filter(k => catData[k] !== undefined);
        for (const key of Object.keys(catData)) {
          if (key !== '_subOrder' && !catData._subOrder.includes(key)) {
            catData._subOrder.push(key);
          }
        }
      }
    }
  }
}

function normalizeCaseModes() {
  for (const path of Object.keys(state.caseModes)) {
    const mode = state.caseModes[path];
    if (typeof mode !== 'object' || mode === null) {
      state.caseModes[path] = { ...CASE_MODES_DEFAULTS };
      continue;
    }
    for (const key of Object.keys(CASE_MODES_DEFAULTS)) {
      if (!(key in mode)) {
        mode[key] = CASE_MODES_DEFAULTS[key];
      }
    }
  }
}

export function saveState() {
  const appData = {
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
  safeSetStorage(STORAGE_KEYS.APP_DATA, appData);
  console.log('[Store] APP_DATA сохранён, позиций:', Object.keys(state.itemProps).length);

  const orderData = {
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
  safeSetStorage(STORAGE_KEYS.ORDER_DATA, orderData);

  const uiData = {
    openChecked: state.openChecked,
    openCategoryState: state.openCategoryState,
    openDescState: state.openDescState,
    detailsOpenOrder: state.detailsOpenOrder,
    matrixFullNames: state.matrixFullNames,
  };
  safeSetStorage(STORAGE_KEYS.UI_STATE, uiData);

  safeSetStorage(STORAGE_KEYS.SELECTED_TRUCKS, state.selectedTruckIds);
  safeSetStorage(STORAGE_KEYS.THEME, state.theme);

  if (state._calcCache instanceof Map) {
    state._calcCache.clear();
  } else {
    state._calcCache = new Map();
  }

  console.log('[Store] Состояние сохранено');
}

export function getCachedCalculation(key) {
  if (state._calcCache instanceof Map) {
    return state._calcCache.get(key);
  }
  return undefined;
}

export function setCachedCalculation(key, value) {
  if (!(state._calcCache instanceof Map)) {
    state._calcCache = new Map();
  }
  state._calcCache.set(key, value);
}

export function clearCalculationCache() {
  if (state._calcCache instanceof Map) {
    state._calcCache.clear();
  } else {
    state._calcCache = new Map();
  }
}

export function resetState() {
  state.inventory = { ...DEFAULT_INVENTORY };
  state.stock = { ...DEFAULT_STOCK };
  state.specs = { ...DEFAULT_SPECS };
  state.itemProps = { ...DEFAULT_PROPS };
  state.catNames = {};
  state._categoryOrder = [...DEFAULT_CATEGORY_ORDER];
  state.commonCases = [...DEFAULT_COMMON_CASES];
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
  state.orderProject = {
    id: null,
    name: '',
    start_date: '',
    end_date: '',
    status: DEFAULT_PROJECT_STATUS,
  };
  state.openChecked = {};
  state.openCategoryState = {};
  state.openDescState = {};
  state.detailsOpenOrder = false;
  state.selectedTruckIds = [];
  state.matrixFullNames = true;
  state.theme = 'dark';
  state._calcCache = new Map();
  saveState();
  notifySubscribers('*');
}

export function initStore() {
  loadState();
}

export default {
  getState,
  getStateKey,
  setStateKey,
  subscribe,
  loadState,
  saveState,
  resetState,
  updateState,
  getCachedCalculation,
  setCachedCalculation,
  clearCalculationCache,
  initStore,
};