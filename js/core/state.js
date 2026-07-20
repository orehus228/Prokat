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

export function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.APP_DATA);
    if (saved) {
      const parsed = JSON.parse(saved);
      Object.assign(state, parsed);
      normalizeState();
    } else {
      resetState();
    }
  } catch (e) {
    console.warn('Ошибка загрузки состояния:', e);
    resetState();
  }

  try {
    const orderRaw = localStorage.getItem(STORAGE_KEYS.ORDER_DATA);
    if (orderRaw) {
      const orderData = JSON.parse(orderRaw);
      Object.keys(orderData).forEach(key => {
        if (key in state && key !== 'inventory' && key !== 'stock' && key !== 'specs' &&
            key !== 'itemProps' && key !== 'catNames' && key !== '_categoryOrder' &&
            key !== 'commonCases' && key !== 'truckPresets' && key !== 'projects' &&
            key !== 'projectItems') {
          state[key] = orderData[key];
        }
      });
    }
  } catch (e) { console.warn('Ошибка загрузки данных заказа:', e); }

  try {
    const uiRaw = localStorage.getItem(STORAGE_KEYS.UI_STATE);
    if (uiRaw) {
      const uiData = JSON.parse(uiRaw);
      if (uiData.openChecked) state.openChecked = uiData.openChecked;
      if (uiData.openCategoryState) state.openCategoryState = uiData.openCategoryState;
      if (uiData.openDescState) state.openDescState = uiData.openDescState;
      if (uiData.detailsOpenOrder !== undefined) state.detailsOpenOrder = uiData.detailsOpenOrder;
      if (uiData.matrixFullNames !== undefined) state.matrixFullNames = uiData.matrixFullNames;
    }
  } catch (e) { console.warn('Ошибка загрузки UI состояния:', e); }

  try {
    const truckRaw = localStorage.getItem(STORAGE_KEYS.SELECTED_TRUCKS);
    if (truckRaw) {
      state.selectedTruckIds = JSON.parse(truckRaw);
    }
  } catch (e) { state.selectedTruckIds = []; }

  try {
    const theme = localStorage.getItem(STORAGE_KEYS.THEME);
    if (theme) state.theme = theme;
    else state.theme = 'dark';
  } catch (e) { state.theme = 'dark'; }

  // Повторная нормализация после загрузки всех данных
  normalizeState();
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

  // Нормализация caseModes
  normalizeCaseModes(state.caseModes);

  // ===== НОРМАЛИЗАЦИЯ ДЛЯ МУЛЬТИКОФРОВ =====
  for (let path in state.itemProps) {
    const props = state.itemProps[path];
    if (props.individualCases && props.individualCases.length > 1) {
      // Убедимся, что для этого пути есть запись в caseModes
      if (!state.caseModes[path]) {
        state.caseModes[path] = { ...CASE_MODES_DEFAULTS };
      }
      const mode = state.caseModes[path];
      // Если multiSelected отсутствует или имеет неверную длину — исправляем
      if (!Array.isArray(mode.multiSelected) || mode.multiSelected.length !== props.individualCases.length) {
        mode.multiSelected = props.individualCases.map(() => true);
      }
      // Если режим включён, но multiSelected не содержит true — исправляем
      if (mode.enabled && !mode.multiSelected.some(v => v === true)) {
        mode.multiSelected = props.individualCases.map(() => true);
      }
      // Если режим выключен, но multiSelected заполнен — оставляем как есть (пользователь может включить позже)
    }
  }

  // Нормализация truckPresets
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