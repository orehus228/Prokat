// core/store.js

/**
 * Единое хранилище состояния приложения.
 * Управляет всеми данными, подписками, автосохранением и кэшированием.
 * @module core/store
 */

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
  splitPath,
  joinPath,
  getCategory,
} from './utils.js';
import { emit } from './events.js';

// ============================================================
// СОСТОЯНИЕ (приватное)
// ============================================================

/**
 * @typedef {Object} AppState
 * @property {Object} inventory - дерево инвентаря { category: { subgroup: [items] } }
 * @property {Object} stock - остатки на складе { path: number }
 * @property {Object} specs - описания позиций { path: string }
 * @property {Object} itemProps - свойства позиций { path: { weight, dimensions, volume, individualCases, allowCommon, commonCases } }
 * @property {Object} catNames - отображаемые имена категорий { category: displayName }
 * @property {string[]} _categoryOrder - порядок категорий
 * @property {Object[]} commonCases - массив общих кофров
 * @property {Object[]} truckPresets - массив грузовиков
 * @property {Object[]} projects - массив проектов
 * @property {Object[]} projectItems - массив позиций проектов
 * @property {Object} order - основные позиции заказа { path: quantity }
 * @property {Object} orderSplits - разбивки по маршрутам { path: [{ target, qty }] }
 * @property {Object} links - привязки (линки) { src: [{ target, multiplier }] }
 * @property {Object} notes - заметки { path: string }
 * @property {Object} orderPacking - упаковка общими кофрами { path: [{ caseId, pieces }] }
 * @property {Object} individualCaseValues - значения для индивидуальных кофров { path: [number] }
 * @property {Object} commonRoutes - привязки к общим маршрутам { path: [{ target, multiplier }] }
 * @property {Object} caseModes - режимы кофров { path: { enabled, alt, selectedOption, accumulate, multiSelected, commonSelected, useAlt, criteria } }
 * @property {Object} orderExclude - исключения из загрузки { path: true }
 * @property {Object} orderExtra - количество вне кофров { path: number }
 * @property {Object} orderProject - привязка к проекту { id, name, start_date, end_date, status }
 * @property {Object} openChecked - состояние чекбоксов в открытом заказе { path: boolean }
 * @property {Object} openCategoryState - состояние открытых категорий в открытом заказе { path: boolean }
 * @property {Object} openDescState - состояние описаний в открытом заказе { path: boolean }
 * @property {boolean} detailsOpenOrder - открыта ли детальная статистика в заказе
 * @property {string[]} selectedTruckIds - ID выбранных грузовиков для загрузки
 * @property {boolean} matrixFullNames - показывать полные названия в матрице
 * @property {string} theme - тема ('dark' | 'light')
 * @property {Map} _calcCache - кэш расчётов
 */

/** @type {AppState} */
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

// ============================================================
// ПОДПИСКИ
// ============================================================

/** @type {Array<Function>} */
let subscribers = [];

// ============================================================
// ПУБЛИЧНЫЕ МЕТОДЫ ДОСТУПА К СОСТОЯНИЮ
// ============================================================

/**
 * Возвращает копию всего состояния (только для чтения).
 * @returns {AppState} клон состояния
 */
export function getState() {
  return deepClone(state);
}

/**
 * Возвращает значение по ключу (без клонирования).
 * @param {string} key - ключ состояния
 * @returns {*} значение
 */
export function getStateKey(key) {
  return state[key];
}

/**
 * Устанавливает значение в состоянии и уведомляет подписчиков.
 * @param {string} key - ключ состояния
 * @param {*} value - новое значение
 */
export function setStateKey(key, value) {
  state[key] = value;
  notifySubscribers(key);
}

/**
 * Подписывается на изменения состояния.
 * @param {Function} callback - функция (changedKey, newState)
 * @returns {Function} функция для отписки
 */
export function subscribe(callback) {
  subscribers.push(callback);
  return () => {
    subscribers = subscribers.filter(cb => cb !== callback);
  };
}

/**
 * Уведомляет всех подписчиков об изменении.
 * @param {string} changedKey - изменённый ключ
 */
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

// ============================================================
// ЗАГРУЗКА СОСТОЯНИЯ ИЗ localStorage
// ============================================================

/**
 * Загружает все данные из localStorage, нормализует и применяет.
 */
export function loadState() {
  console.log('[Store] Загрузка состояния...');

  // 1. Основные данные (APP_DATA)
  const appData = safeGetStorage(STORAGE_KEYS.APP_DATA, null);
  if (appData) {
    const { itemProps, stock, specs, ...rest } = appData;

    // Нормализация путей (замена \ на |)
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

    // Нормализация itemProps: добавление дефолтных полей
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
  }

  // 2. Данные заказа (ORDER_DATA)
  const orderData = safeGetStorage(STORAGE_KEYS.ORDER_DATA, null);
  if (orderData) {
    // Нормализуем пути во всех вложенных объектах
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
      'order',
      'orderSplits',
      'links',
      'notes',
      'orderPacking',
      'individualCaseValues',
      'commonRoutes',
      'caseModes',
      'orderExclude',
      'orderExtra',
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

  // 3. UI-состояние (UI_STATE)
  const uiData = safeGetStorage(STORAGE_KEYS.UI_STATE, null);
  if (uiData) {
    if (uiData.openChecked) state.openChecked = uiData.openChecked;
    if (uiData.openCategoryState) state.openCategoryState = uiData.openCategoryState;
    if (uiData.openDescState) state.openDescState = uiData.openDescState;
    if (uiData.detailsOpenOrder !== undefined) state.detailsOpenOrder = uiData.detailsOpenOrder;
    if (uiData.matrixFullNames !== undefined) state.matrixFullNames = uiData.matrixFullNames;
    console.log('[Store] UI_STATE загружен');
  }

  // 4. Выбранные грузовики
  const selectedTrucks = safeGetStorage(STORAGE_KEYS.SELECTED_TRUCKS, []);
  if (Array.isArray(selectedTrucks)) {
    state.selectedTruckIds = selectedTrucks;
  }

  // 5. Тема
  const theme = safeGetStorage(STORAGE_KEYS.THEME, 'dark');
  state.theme = theme;

  // 6. Нормализация структуры инвентаря (_subOrder)
  normalizeInventoryStructure();

  // 7. Нормализация режимов кофров
  normalizeCaseModes();

  // 8. Категории
  if (!state._categoryOrder || state._categoryOrder.length === 0) {
    state._categoryOrder = Object.keys(state.inventory);
  } else {
    state._categoryOrder = state._categoryOrder.filter(cat => state.inventory[cat] !== undefined);
    // Добавляем недостающие категории
    for (const cat of Object.keys(state.inventory)) {
      if (!state._categoryOrder.includes(cat)) {
        state._categoryOrder.push(cat);
      }
    }
  }

  // 9. Очистка кэша
  state._calcCache.clear();

  console.log('[Store] Состояние загружено');
  notifySubscribers('*');
}

// ============================================================
// НОРМАЛИЗАЦИЯ ДАННЫХ
// ============================================================

/**
 * Нормализует структуру инвентаря: добавляет _subOrder, если отсутствует.
 */
function normalizeInventoryStructure() {
  for (const cat of Object.keys(state.inventory)) {
    const catData = state.inventory[cat];
    if (catData && typeof catData === 'object' && !Array.isArray(catData)) {
      if (!catData._subOrder) {
        catData._subOrder = Object.keys(catData).filter(k => k !== '_subOrder');
      } else {
        // Удаляем несуществующие ключи из _subOrder
        catData._subOrder = catData._subOrder.filter(k => catData[k] !== undefined);
        // Добавляем новые ключи
        for (const key of Object.keys(catData)) {
          if (key !== '_subOrder' && !catData._subOrder.includes(key)) {
            catData._subOrder.push(key);
          }
        }
      }
    }
  }
}

/**
 * Нормализует режимы кофров: добавляет дефолтные поля.
 */
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

// ============================================================
// СОХРАНЕНИЕ СОСТОЯНИЯ
// ============================================================

/**
 * Сохраняет всё состояние в localStorage.
 */
export function saveState() {
  // APP_DATA
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

  // ORDER_DATA
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

  // UI_STATE
  const uiData = {
    openChecked: state.openChecked,
    openCategoryState: state.openCategoryState,
    openDescState: state.openDescState,
    detailsOpenOrder: state.detailsOpenOrder,
    matrixFullNames: state.matrixFullNames,
  };
  safeSetStorage(STORAGE_KEYS.UI_STATE, uiData);

  // Выбранные грузовики
  safeSetStorage(STORAGE_KEYS.SELECTED_TRUCKS, state.selectedTruckIds);

  // Тема
  safeSetStorage(STORAGE_KEYS.THEME, state.theme);

  // Очистка кэша (при любом сохранении)
  state._calcCache.clear();

  console.log('[Store] Состояние сохранено');
}

// ============================================================
// КЭШИРОВАНИЕ РАСЧЁТОВ
// ============================================================

/**
 * Получает закэшированное значение расчёта.
 * @param {string} key - ключ кэша
 * @returns {*} значение или undefined
 */
export function getCachedCalculation(key) {
  return state._calcCache.get(key);
}

/**
 * Устанавливает значение в кэш расчётов.
 * @param {string} key - ключ кэша
 * @param {*} value - значение
 */
export function setCachedCalculation(key, value) {
  state._calcCache.set(key, value);
}

/**
 * Очищает кэш расчётов.
 */
export function clearCalculationCache() {
  state._calcCache.clear();
}

// ============================================================
// РЕСЕТ СОСТОЯНИЯ
// ============================================================

/**
 * Сбрасывает состояние до дефолтных значений.
 */
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
  state._calcCache.clear();
  saveState();
  notifySubscribers('*');
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================

/**
 * Инициализирует хранилище (загружает данные).
 */
export function initStore() {
  loadState();
}

// ============================================================
// ЭКСПОРТ ПО УМОЛЧАНИЮ
// ============================================================

export default {
  getState,
  getStateKey,
  setStateKey,
  subscribe,
  loadState,
  saveState,
  resetState,
  getCachedCalculation,
  setCachedCalculation,
  clearCalculationCache,
  initStore,
};