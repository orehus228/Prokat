// core/store.js

/**
 * Простое хранилище состояния приложения.
 * Без сложных кэшей и нормализаций — только геттеры, сеттеры и подписки.
 * @module core/store
 */

import { STORAGE_KEYS } from './config.js';

// ============================================================
// СОСТОЯНИЕ
// ============================================================

const defaultState = {
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
  theme: 'dark',
};

let state = { ...defaultState };
const subscribers = [];

// ============================================================
// ПУБЛИЧНЫЙ API
// ============================================================

/**
 * Возвращает копию состояния.
 * @returns {Object}
 */
export function getState() {
  return JSON.parse(JSON.stringify(state));
}

/**
 * Возвращает значение по ключу.
 * @param {string} key
 * @returns {*}
 */
export function getStateKey(key) {
  return state[key];
}

/**
 * Устанавливает значение и уведомляет подписчиков.
 * @param {string} key
 * @param {*} value
 */
export function setStateKey(key, value) {
  state[key] = value;
  notify(key);
}

/**
 * Подписывается на изменения.
 * @param {Function} callback
 * @returns {Function} функция для отписки
 */
export function subscribe(callback) {
  subscribers.push(callback);
  return () => {
    const idx = subscribers.indexOf(callback);
    if (idx !== -1) subscribers.splice(idx, 1);
  };
}

function notify(changedKey) {
  const snapshot = getState();
  for (const cb of subscribers) {
    try {
      cb(changedKey, snapshot);
    } catch (e) {
      console.warn('[Store] Ошибка в подписчике:', e);
    }
  }
}

// ============================================================
// ЗАГРУЗКА / СОХРАНЕНИЕ
// ============================================================

/**
 * Загружает состояние из localStorage.
 */
export function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.APP_DATA);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Нормализуем пути (замена \ на |)
      const normalizeKeys = (obj) => {
        if (!obj || typeof obj !== 'object') return {};
        const result = {};
        for (const key of Object.keys(obj)) {
          const newKey = key.replace(/\\/g, '|');
          result[newKey] = obj[key];
        }
        return result;
      };
      // Применяем только нужные поля
      state.inventory = parsed.inventory || {};
      state.stock = normalizeKeys(parsed.stock || {});
      state.specs = normalizeKeys(parsed.specs || {});
      state.itemProps = normalizeKeys(parsed.itemProps || {});
      state.catNames = parsed.catNames || {};
      state._categoryOrder = parsed._categoryOrder || [];
      state.commonCases = parsed.commonCases || [];
      state.truckPresets = parsed.truckPresets || [];
      state.projects = parsed.projects || [];
      state.projectItems = parsed.projectItems || [];
    }
  } catch (e) {
    console.warn('[Store] Ошибка загрузки APP_DATA:', e);
  }

  // Загружаем ORDER_DATA
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.ORDER_DATA);
    if (saved) {
      const parsed = JSON.parse(saved);
      const normalizeKeys = (obj) => {
        if (!obj || typeof obj !== 'object') return {};
        const result = {};
        for (const key of Object.keys(obj)) {
          const newKey = key.replace(/\\/g, '|');
          result[newKey] = obj[key];
        }
        return result;
      };
      state.order = normalizeKeys(parsed.order || {});
      state.orderSplits = normalizeKeys(parsed.orderSplits || {});
      state.links = normalizeKeys(parsed.links || {});
      state.notes = normalizeKeys(parsed.notes || {});
      state.orderPacking = normalizeKeys(parsed.orderPacking || {});
      state.individualCaseValues = normalizeKeys(parsed.individualCaseValues || {});
      state.commonRoutes = normalizeKeys(parsed.commonRoutes || {});
      state.caseModes = normalizeKeys(parsed.caseModes || {});
      state.orderExclude = normalizeKeys(parsed.orderExclude || {});
      state.orderExtra = normalizeKeys(parsed.orderExtra || {});
      state.orderProject = parsed.orderProject || defaultState.orderProject;
    }
  } catch (e) {
    console.warn('[Store] Ошибка загрузки ORDER_DATA:', e);
  }

  // UI_STATE
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.UI_STATE);
    if (saved) {
      const parsed = JSON.parse(saved);
      state.openChecked = parsed.openChecked || {};
      state.openCategoryState = parsed.openCategoryState || {};
      state.openDescState = parsed.openDescState || {};
      state.detailsOpenOrder = parsed.detailsOpenOrder || false;
      state.matrixFullNames = parsed.matrixFullNames !== undefined ? parsed.matrixFullNames : true;
    }
  } catch (e) {}

  // Выбранные грузовики
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.SELECTED_TRUCKS);
    if (saved) state.selectedTruckIds = JSON.parse(saved);
  } catch (e) {}

  // Тема
  try {
    const theme = localStorage.getItem(STORAGE_KEYS.THEME);
    if (theme) state.theme = theme;
  } catch (e) {}

  // Приводим _subOrder к нормальному виду (для инвентаря)
  for (const cat of Object.keys(state.inventory)) {
    const catData = state.inventory[cat];
    if (catData && typeof catData === 'object' && !Array.isArray(catData)) {
      if (!catData._subOrder) {
        catData._subOrder = Object.keys(catData).filter(k => k !== '_subOrder');
      }
    }
  }

  // Если нет категорий, создаём пустой порядок
  if (!state._categoryOrder || state._categoryOrder.length === 0) {
    state._categoryOrder = Object.keys(state.inventory);
  }

  notify('*');
}

/**
 * Сохраняет состояние в localStorage.
 */
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
  localStorage.setItem(STORAGE_KEYS.APP_DATA, JSON.stringify(appData));

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
  localStorage.setItem(STORAGE_KEYS.ORDER_DATA, JSON.stringify(orderData));

  const uiData = {
    openChecked: state.openChecked,
    openCategoryState: state.openCategoryState,
    openDescState: state.openDescState,
    detailsOpenOrder: state.detailsOpenOrder,
    matrixFullNames: state.matrixFullNames,
  };
  localStorage.setItem(STORAGE_KEYS.UI_STATE, JSON.stringify(uiData));

  localStorage.setItem(STORAGE_KEYS.SELECTED_TRUCKS, JSON.stringify(state.selectedTruckIds));
  localStorage.setItem(STORAGE_KEYS.THEME, state.theme);
}

/**
 * Сбрасывает состояние (очищает все данные).
 */
export function resetState() {
  state = { ...defaultState };
  saveState();
  notify('*');
}

export default {
  getState,
  getStateKey,
  setStateKey,
  subscribe,
  loadState,
  saveState,
  resetState,
};