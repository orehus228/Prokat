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
  DEFAULT_INSTANCES,
  DEFAULT_INSTANCES_BY_PATH,
  INSTANCE_STATUSES,
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
  orderSubrent: [], // <-- НОВОЕ ПОЛЕ: массив объектов субаренды
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
  instances: {},
  instancesByPath: {},
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

export function loadState() {
  console.log('[state] loadState()');

  // ---- 1. Загружаем APP_DATA ----
  let parsed = null;
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.APP_DATA);
    if (saved) {
      parsed = JSON.parse(saved);
      console.log('[state] APP_DATA загружен, ключи:', Object.keys(parsed));
    }
  } catch (e) {
    console.error('[state] Ошибка APP_DATA:', e);
  }

  if (parsed) {
    const { itemProps, stock, specs, ...rest } = parsed;
    Object.assign(state, rest);

    if (itemProps) {
      const normalizedItemProps = {};
      for (let key in itemProps) {
        const newKey = key.replace(/\\/g, '|');
        normalizedItemProps[newKey] = itemProps[key];
      }
      state.itemProps = normalizedItemProps;
      console.log('[state] itemProps нормализованы, ключей:', Object.keys(state.itemProps).length);
    }

    if (stock) {
      const normalizedStock = {};
      for (let key in stock) {
        normalizedStock[key.replace(/\\/g, '|')] = stock[key];
      }
      state.stock = normalizedStock;
    }

    if (specs) {
      const normalizedSpecs = {};
      for (let key in specs) {
        normalizedSpecs[key.replace(/\\/g, '|')] = specs[key];
      }
      state.specs = normalizedSpecs;
    }
  }

  // ---- 2. Загружаем ORDER_DATA ----
  try {
    const orderRaw = localStorage.getItem(STORAGE_KEYS.ORDER_DATA);
    if (orderRaw) {
      const orderData = JSON.parse(orderRaw);
      const orderKeys = [
        'order', 'orderSplits', 'links', 'notes',
        'orderPacking', 'individualCaseValues', 'commonRoutes',
        'caseModes', 'orderExclude', 'orderExtra', 'orderSubrent' // <-- ДОБАВЛЕН orderSubrent
      ];
      orderKeys.forEach(key => {
        if (orderData[key] && typeof orderData[key] === 'object') {
          const normalized = {};
          for (let k in orderData[key]) {
            normalized[k.replace(/\\/g, '|')] = orderData[key][k];
          }
          orderData[key] = normalized;
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
      // Дополнительно загружаем orderSubrent как массив (не объект)
      if (orderData.orderSubrent && Array.isArray(orderData.orderSubrent)) {
        state.orderSubrent = orderData.orderSubrent;
      }
      console.log('[state] ORDER_DATA загружен и нормализован');
    }
  } catch (e) {
    console.warn('[state] ORDER_DATA ошибка:', e);
  }

  // ---- 3. Загружаем UI_STATE ----
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
  } catch (e) {
    console.warn('[state] UI_STATE ошибка:', e);
  }

  // ---- 4. Загружаем выбранные грузовики ----
  try {
    const truckRaw = localStorage.getItem(STORAGE_KEYS.SELECTED_TRUCKS);
    if (truckRaw) {
      state.selectedTruckIds = JSON.parse(truckRaw);
    }
  } catch (e) {
    state.selectedTruckIds = [];
  }

  // ---- 5. Загружаем тему ----
  try {
    const theme = localStorage.getItem(STORAGE_KEYS.THEME);
    if (theme) state.theme = theme;
    else state.theme = 'dark';
  } catch (e) {
    state.theme = 'dark';
  }

  // ---- 6. Загружаем экземпляры ----
  try {
    const instancesRaw = localStorage.getItem(STORAGE_KEYS.INSTANCES);
    if (instancesRaw) {
      const instancesData = JSON.parse(instancesRaw);
      state.instances = instancesData.instances || {};
      state.instancesByPath = instancesData.instancesByPath || {};
      console.log('[state] INSTANCES загружены, количество:', Object.keys(state.instances).length);
    } else {
      state.instances = { ...DEFAULT_INSTANCES };
      state.instancesByPath = { ...DEFAULT_INSTANCES_BY_PATH };
    }
  } catch (e) {
    console.warn('[state] INSTANCES ошибка:', e);
    state.instances = { ...DEFAULT_INSTANCES };
    state.instancesByPath = { ...DEFAULT_INSTANCES_BY_PATH };
  }

  // ---- 7. Нормализация общих структур ----
  normalizeSubgroups(state.inventory);

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

  normalizeCaseModes(state.caseModes);

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

  rebuildInstancesIndex();

  console.log('[state] Нормализация завершена');
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
    orderSubrent: state.orderSubrent, // <-- ДОБАВЛЕНО
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

  const instancesToSave = {
    instances: state.instances,
    instancesByPath: state.instancesByPath,
  };
  localStorage.setItem(STORAGE_KEYS.INSTANCES, JSON.stringify(instancesToSave));

  state._calcCache.clear();
}

export function rebuildInstancesIndex() {
  const newIndex = {};
  for (let id in state.instances) {
    const instance = state.instances[id];
    if (!instance) continue;
    const path = instance.path;
    if (!newIndex[path]) newIndex[path] = [];
    newIndex[path].push(id);
  }
  state.instancesByPath = newIndex;
}

export function resetInstances() {
  state.instances = { ...DEFAULT_INSTANCES };
  state.instancesByPath = { ...DEFAULT_INSTANCES_BY_PATH };
  saveState();
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
  state.orderSubrent = []; // <-- ДОБАВЛЕНО
  state.orderProject = { id: null, name: '', start_date: '', end_date: '', status: 'planned' };
  state.instances = { ...DEFAULT_INSTANCES };
  state.instancesByPath = { ...DEFAULT_INSTANCES_BY_PATH };
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
  resetInstances,
  rebuildInstancesIndex,
};