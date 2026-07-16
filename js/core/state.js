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

// ============================================================
// ОБЪЕКТ СОСТОЯНИЯ
// ============================================================
const state = {
  // Данные редактора (инвентарь)
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

  // Данные заказа
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

  // UI состояние (сохраняемое)
  openChecked: {},
  openCategoryState: {},
  openDescState: {},
  detailsOpenOrder: false,
  selectedTruckIds: [],
  matrixFullNames: true,

  // Кэш расчётов
  _calcCache: new Map(),
};

// ============================================================
// ПОДПИСЧИКИ НА ИЗМЕНЕНИЯ
// ============================================================
let subscribers = [];

// ============================================================
// ФУНКЦИИ ДОСТУПА
// ============================================================
export function getState() {
  return state;
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
  subscribers.forEach(cb => {
    try {
      cb(changedKey, state);
    } catch (e) {
      console.warn('Ошибка в подписчике state:', e);
    }
  });
}

// ============================================================
// ЗАГРУЗКА / СОХРАНЕНИЕ
// ============================================================
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

  // Загружаем состояние заказа отдельно
  try {
    const orderRaw = localStorage.getItem(STORAGE_KEYS.ORDER_DATA);
    if (orderRaw) {
      const orderData = JSON.parse(orderRaw);
      // Обновляем только поля заказа, не трогая инвентарь
      Object.keys(orderData).forEach(key => {
        if (key in state && key !== 'inventory' && key !== 'stock' && key !== 'specs' &&
            key !== 'itemProps' && key !== 'catNames' && key !== '_categoryOrder' &&
            key !== 'commonCases' && key !== 'truckPresets' && key !== 'projects' &&
            key !== 'projectItems') {
          state[key] = orderData[key];
        }
      });
    }
  } catch (e) {
    console.warn('Ошибка загрузки данных заказа:', e);
  }

  // Загружаем UI-состояние
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
  } catch (e) {
    console.warn('Ошибка загрузки UI состояния:', e);
  }

  // Загружаем выбранные грузовики
  try {
    const truckRaw = localStorage.getItem(STORAGE_KEYS.SELECTED_TRUCKS);
    if (truckRaw) {
      state.selectedTruckIds = JSON.parse(truckRaw);
    }
  } catch (e) {
    state.selectedTruckIds = [];
  }

  // Загружаем тему
  try {
    const theme = localStorage.getItem(STORAGE_KEYS.THEME);
    if (theme) state.theme = theme;
    else state.theme = 'dark';
  } catch (e) {
    state.theme = 'dark';
  }

  notifySubscribers('*');
}

export function saveState() {
  // Сохраняем всё состояние (кроме кэша)
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

  // Сохраняем состояние заказа отдельно
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

  // Сохраняем UI состояние
  const uiToSave = {
    openChecked: state.openChecked,
    openCategoryState: state.openCategoryState,
    openDescState: state.openDescState,
    detailsOpenOrder: state.detailsOpenOrder,
    matrixFullNames: state.matrixFullNames,
  };
  localStorage.setItem(STORAGE_KEYS.UI_STATE, JSON.stringify(uiToSave));

  // Сохраняем выбранные грузовики
  localStorage.setItem(STORAGE_KEYS.SELECTED_TRUCKS, JSON.stringify(state.selectedTruckIds));

  // Сохраняем тему
  if (state.theme) {
    localStorage.setItem(STORAGE_KEYS.THEME, state.theme);
  }

  // Очищаем кэш расчётов при сохранении
  state._calcCache.clear();
}

// ============================================================
// НОРМАЛИЗАЦИЯ И СБРОС
// ============================================================
function normalizeState() {
  // 1. Очистка дублирующихся групп в video
  cleanupInventory(state.inventory, state.stock, state.specs, state.itemProps);

  // 2. Нормализация подгрупп
  normalizeSubgroups(state.inventory);

  // 3. Нормализация itemProps (добавление полей по умолчанию)
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

  // 4. Нормализация caseModes
  normalizeCaseModes(state.caseModes);

  // 5. Нормализация truckPresets
  if (!state.truckPresets || !Array.isArray(state.truckPresets)) {
    state.truckPresets = [...DEFAULT_TRUCK_PRESETS];
  }

  // 6. Нормализация порядка категорий
  state._categoryOrder = normalizeCategoryOrder(state._categoryOrder, state.inventory);

  // 7. Инициализация проектов, если отсутствуют
  if (!state.projects) state.projects = [];
  if (!state.projectItems) state.projectItems = [];
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

// ============================================================
// КЭШ РАСЧЁТОВ
// ============================================================
export function getCachedCalculation(key) {
  return state._calcCache.get(key);
}

export function setCachedCalculation(key, value) {
  state._calcCache.set(key, value);
}

export function clearCalculationCache() {
  state._calcCache.clear();
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================
export function initState() {
  loadState();
}

// Автоматический экспорт для совместимости
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