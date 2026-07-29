// data/editor-data.js
import {
  getState,
  setStateKey,
  saveState,
  clearCalculationCache,
  rebuildInstancesIndex,
} from '../core/state.js';
import {
  CAT_NAMES,
  DUPLICATE_VIDEO_GROUPS,
  DEFAULT_TRUCK_PRESETS,
  INSTANCE_STATUSES,
} from '../core/config.js';
import {
  updateAllPathsOnCategoryRename,
  updateOrderPaths,
} from '../services/order-data.js';
import {
  createInstance,
  getInstancesByPath,
  deleteInstance,
  updateInstanceStatus,
  ensureInstancesForPath,
  getInstanceStats,
  getInstance,
} from '../services/instance-service.js';

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ РАБОТЫ С ПУТЯМИ
// ============================================================

export function getStockKey(catKey, subKey, itemName) {
  if (subKey) return catKey + '|' + subKey + '|' + itemName;
  return catKey + '|' + itemName;
}

export function getFullPath(catKey, subKey, itemName) {
  return getStockKey(catKey, subKey, itemName);
}

// ============================================================
// ДОСТУП К СКЛАДСКИМ ОСТАТКАМ
// ============================================================

export function getStock(catKey, subKey, itemName) {
  const key = getStockKey(catKey, subKey, itemName);
  return getState().stock[key] !== undefined ? getState().stock[key] : 0;
}

export function getStockValue(path) {
  const parts = path.split('|');
  const catKey = parts[0];
  const subKey = parts.length > 2 ? parts[1] : null;
  const itemName = subKey ? parts.slice(2).join('|') : parts.slice(1).join('|');
  return getStock(catKey, subKey, itemName);
}

export function setStock(catKey, subKey, itemName, val) {
  const key = getStockKey(catKey, subKey, itemName);
  const state = getState();
  state.stock[key] = Number(val);
  saveState();
}

// ============================================================
// ДОСТУП К СПЕЦИФИКАЦИЯМ (ОПИСАНИЯМ)
// ============================================================

export function getSpec(catKey, subKey, itemName) {
  const key = getStockKey(catKey, subKey, itemName);
  return getState().specs[key] || '';
}

export function setSpec(catKey, subKey, itemName, val) {
  const key = getStockKey(catKey, subKey, itemName);
  const state = getState();
  if (val && val.trim()) state.specs[key] = val;
  else delete state.specs[key];
  saveState();
}

// ============================================================
// ДОСТУП К СВОЙСТВАМ ПОЗИЦИЙ (itemProps)
// ============================================================

export function getItemProps(catKey, subKey, itemName) {
  let key;
  if (arguments.length === 1) {
    key = catKey;
  } else {
    key = getStockKey(catKey, subKey, itemName);
  }
  const state = getState();
  const props = state.itemProps[key];
  if (props) {
    if (props.weight === undefined) props.weight = 0;
    if (props.dimensions === undefined) props.dimensions = '';
    if (props.volume === undefined) props.volume = 0;
    if (props.individualCases === undefined) props.individualCases = [];
    if (props.allowCommon === undefined) props.allowCommon = false;
    if (props.commonCases === undefined) props.commonCases = [];
    return props;
  }
  return { weight: 0, dimensions: '', volume: 0, individualCases: [], allowCommon: false, commonCases: [] };
}

export function getItemPropsByPath(path) {
  return getItemProps(path);
}

export function setItemProps(catKey, subKey, itemName, props) {
  const key = getStockKey(catKey, subKey, itemName);
  const state = getState();
  if (props && Object.keys(props).length > 0) {
    if (props.weight === undefined) props.weight = 0;
    if (props.dimensions === undefined) props.dimensions = '';
    if (props.volume === undefined) props.volume = 0;
    state.itemProps[key] = props;
  } else {
    delete state.itemProps[key];
  }
  saveState();
  clearCalculationCache();
}

// ============================================================
// РАБОТА С ОБЩИМИ КОФРАМИ
// ============================================================

export function getCommonCases() {
  return getState().commonCases || [];
}

export function addCommonCase(caseObj) {
  const state = getState();
  state.commonCases.push(caseObj);
  saveState();
}

export function updateCommonCase(id, newData) {
  const state = getState();
  const idx = state.commonCases.findIndex(c => c.id === id);
  if (idx !== -1) {
    state.commonCases[idx] = { ...state.commonCases[idx], ...newData };
    saveState();
  }
}

export function deleteCommonCase(id) {
  const state = getState();
  state.commonCases = state.commonCases.filter(c => c.id !== id);
  for (let key in state.itemProps) {
    const props = state.itemProps[key];
    if (props.commonCases) {
      props.commonCases = props.commonCases.filter(opt => opt.caseId !== id);
      if (props.commonCases.length === 0) delete props.commonCases;
    }
  }
  saveState();
}

// ============================================================
// РАБОТА С ГРУЗОВИКАМИ
// ============================================================

export function getTruckPresets() {
  return getState().truckPresets || [];
}

export function addTruckPreset(preset) {
  const state = getState();
  if (!state.truckPresets) state.truckPresets = [];
  if (!preset.id) preset.id = 'truck_' + Date.now();
  state.truckPresets.push(preset);
  saveState();
}

export function updateTruckPreset(id, newData) {
  const state = getState();
  const presets = state.truckPresets;
  const idx = presets.findIndex(p => p.id === id);
  if (idx !== -1) {
    presets[idx] = { ...presets[idx], ...newData };
    saveState();
  }
}

export function deleteTruckPreset(id) {
  const state = getState();
  state.truckPresets = state.truckPresets.filter(p => p.id !== id);
  saveState();
}

export function getTruckPreset(id) {
  return getTruckPresets().find(p => p.id === id);
}

// ============================================================
// РАБОТА С ЭКЗЕМПЛЯРАМИ (НОВЫЕ ФУНКЦИИ)
// ============================================================

/**
 * Возвращает все экземпляры для позиции.
 * @param {string} path - полный путь позиции
 * @returns {object[]}
 */
export function getPathInstances(path) {
  return getInstancesByPath(path);
}

/**
 * Возвращает статистику по экземплярам для позиции.
 * @param {string} path
 * @returns {object}
 */
export function getPathInstanceStats(path) {
  return getInstanceStats(path);
}

/**
 * Создаёт новый экземпляр для позиции.
 * @param {string} path
 * @param {string} serialNumber
 * @param {string} status
 * @param {object} subrentInfo
 * @returns {object}
 */
export function addInstanceToPath(path, serialNumber = '', status = INSTANCE_STATUSES.STOCK, subrentInfo = null) {
  return createInstance(path, serialNumber, status, subrentInfo || { isSubrent: false, counterparty: '' });
}

/**
 * Удаляет экземпляр (только если он в статусе 'stock' или 'written_off').
 * @param {string} instanceId
 * @returns {boolean}
 */
export function removeInstance(instanceId) {
  return deleteInstance(instanceId);
}

/**
 * Обновляет статус экземпляра.
 * @param {string} instanceId
 * @param {string} newStatus
 * @param {string} comment
 * @returns {boolean}
 */
export function updateInstance(instanceId, newStatus, comment = '') {
  return updateInstanceStatus(instanceId, newStatus, null, comment);
}

/**
 * Синхронизирует количество экземпляров с остатком на складе.
 * Создаёт недостающие экземпляры или удаляет лишние (только в статусе 'stock').
 * @param {string} path
 * @param {number} targetCount - целевое количество (если не указано, берётся из stock)
 * @param {string} serialPrefix - префикс для серийных номеров
 * @returns {object} { created: number, deleted: number, errors: string[] }
 */
export function syncInstancesWithStock(path, targetCount = null, serialPrefix = 'SN') {
  const state = getState();
  const stock = getStockValue(path);
  const target = targetCount !== null ? targetCount : stock;
  const instances = getInstancesByPath(path);
  const currentCount = instances.length;
  const errors = [];
  let created = 0;
  let deleted = 0;

  if (currentCount < target) {
    // Создаём недостающие
    const newInstances = ensureInstancesForPath(path, target, serialPrefix);
    created = newInstances.length;
  } else if (currentCount > target) {
    // Удаляем лишние (только со статусом 'stock')
    const toDelete = instances
      .filter(inst => inst.status === INSTANCE_STATUSES.STOCK)
      .slice(0, currentCount - target);
    for (let inst of toDelete) {
      const success = deleteInstance(inst.id);
      if (success) deleted++;
      else errors.push(`Не удалось удалить экземпляр ${inst.id}`);
    }
  }

  // Перестраиваем индекс
  rebuildInstancesIndex();
  saveState();
  return { created, deleted, errors };
}

/**
 * Получает экземпляр по ID.
 * @param {string} instanceId
 * @returns {object|null}
 */
export function getInstanceById(instanceId) {
  return getInstance(instanceId);
}

// ============================================================
// ПЕРЕИМЕНОВАНИЕ КАТЕГОРИЙ, ПОДГРУПП, ПОЗИЦИЙ И ПЕРЕМЕЩЕНИЕ
// ============================================================

export function renameCategory(oldName, newName) {
  if (oldName === newName) return;
  const state = getState();
  if (state.inventory[newName]) throw new Error('Категория уже существует');
  state.inventory[newName] = state.inventory[oldName];
  delete state.inventory[oldName];
  const idx = state._categoryOrder.indexOf(oldName);
  if (idx !== -1) state._categoryOrder[idx] = newName;
  if (state.catNames[oldName]) {
    state.catNames[newName] = state.catNames[oldName];
    delete state.catNames[oldName];
  }
  const oldPrefix = oldName + '|';
  const newPrefix = newName + '|';
  
  // Обновляем пути в stock, specs, itemProps
  const keysToUpdate = Object.keys(state.stock).filter(k => k.startsWith(oldPrefix));
  keysToUpdate.forEach(k => {
    const newK = k.replace(oldPrefix, newPrefix);
    state.stock[newK] = state.stock[k];
    delete state.stock[k];
  });
  const specKeys = Object.keys(state.specs).filter(k => k.startsWith(oldPrefix));
  specKeys.forEach(k => {
    const newK = k.replace(oldPrefix, newPrefix);
    state.specs[newK] = state.specs[k];
    delete state.specs[k];
  });
  const propsKeys = Object.keys(state.itemProps).filter(k => k.startsWith(oldPrefix));
  propsKeys.forEach(k => {
    const newK = k.replace(oldPrefix, newPrefix);
    state.itemProps[newK] = state.itemProps[k];
    delete state.itemProps[k];
  });
  
  // Обновляем пути в экземплярах
  const instances = state.instances || {};
  for (let id in instances) {
    if (instances[id].path && instances[id].path.startsWith(oldPrefix)) {
      instances[id].path = instances[id].path.replace(oldPrefix, newPrefix);
    }
  }
  rebuildInstancesIndex();
  
  updateAllPathsOnCategoryRename(oldPrefix, newPrefix);
  saveState();
}

export function renameSubgroup(catKey, oldSub, newSub) {
  if (oldSub === newSub) return;
  const state = getState();
  const catData = state.inventory[catKey];
  if (!catData || typeof catData !== 'object' || Array.isArray(catData)) return;
  if (catData[newSub]) throw new Error('Подгруппа уже существует');
  catData[newSub] = catData[oldSub];
  delete catData[oldSub];
  const order = catData._subOrder;
  if (order) {
    const idx = order.indexOf(oldSub);
    if (idx !== -1) order[idx] = newSub;
  }
  const oldPrefix = catKey + '|' + oldSub + '|';
  const newPrefix = catKey + '|' + newSub + '|';
  const keysToUpdate = Object.keys(state.stock).filter(k => k.startsWith(oldPrefix));
  keysToUpdate.forEach(k => {
    const newK = k.replace(oldPrefix, newPrefix);
    state.stock[newK] = state.stock[k];
    delete state.stock[k];
  });
  const specKeys = Object.keys(state.specs).filter(k => k.startsWith(oldPrefix));
  specKeys.forEach(k => {
    const newK = k.replace(oldPrefix, newPrefix);
    state.specs[newK] = state.specs[k];
    delete state.specs[k];
  });
  const propsKeys = Object.keys(state.itemProps).filter(k => k.startsWith(oldPrefix));
  propsKeys.forEach(k => {
    const newK = k.replace(oldPrefix, newPrefix);
    state.itemProps[newK] = state.itemProps[k];
    delete state.itemProps[k];
  });
  
  // Обновляем пути в экземплярах
  const instances = state.instances || {};
  for (let id in instances) {
    if (instances[id].path && instances[id].path.startsWith(oldPrefix)) {
      instances[id].path = instances[id].path.replace(oldPrefix, newPrefix);
    }
  }
  rebuildInstancesIndex();
  
  updateAllPathsOnCategoryRename(oldPrefix, newPrefix);
  saveState();
}

export function renameItem(catKey, subKey, oldName, newName) {
  if (oldName === newName) return;
  const state = getState();
  const targetArray = subKey ? state.inventory[catKey][subKey] : state.inventory[catKey];
  if (!Array.isArray(targetArray)) return;
  const idx = targetArray.indexOf(oldName);
  if (idx === -1) throw new Error('Позиция не найдена');
  if (targetArray.includes(newName)) throw new Error('Позиция уже существует');
  targetArray[idx] = newName;
  const oldPath = getStockKey(catKey, subKey, oldName);
  const newPath = getStockKey(catKey, subKey, newName);
  if (state.stock[oldPath] !== undefined) {
    state.stock[newPath] = state.stock[oldPath];
    delete state.stock[oldPath];
  }
  if (state.specs[oldPath] !== undefined) {
    state.specs[newPath] = state.specs[oldPath];
    delete state.specs[oldPath];
  }
  if (state.itemProps[oldPath] !== undefined) {
    state.itemProps[newPath] = state.itemProps[oldPath];
    delete state.itemProps[oldPath];
  }
  
  // Обновляем пути в экземплярах
  const instances = state.instances || {};
  for (let id in instances) {
    if (instances[id].path === oldPath) {
      instances[id].path = newPath;
    }
  }
  rebuildInstancesIndex();
  
  updateOrderPaths(oldPath, newPath);
  saveState();
}

export function moveItem(catKey, subKey, itemName, targetCat, targetSub) {
  const state = getState();
  const sourceArray = subKey ? state.inventory[catKey][subKey] : state.inventory[catKey];
  if (!Array.isArray(sourceArray)) throw new Error('Источник не массив');
  const idx = sourceArray.indexOf(itemName);
  if (idx === -1) throw new Error('Позиция не найдена');
  sourceArray.splice(idx, 1);
  const targetArray = targetSub ? state.inventory[targetCat][targetSub] : state.inventory[targetCat];
  if (!Array.isArray(targetArray)) throw new Error('Цель не массив');
  if (targetArray.includes(itemName)) {
    sourceArray.splice(idx, 0, itemName);
    throw new Error('Цель уже содержит этот элемент');
  }
  targetArray.push(itemName);
  const oldPath = getStockKey(catKey, subKey, itemName);
  const newPath = getStockKey(targetCat, targetSub, itemName);
  if (state.stock[oldPath] !== undefined) {
    state.stock[newPath] = state.stock[oldPath];
    delete state.stock[oldPath];
  }
  if (state.specs[oldPath] !== undefined) {
    state.specs[newPath] = state.specs[oldPath];
    delete state.specs[oldPath];
  }
  if (state.itemProps[oldPath] !== undefined) {
    state.itemProps[newPath] = state.itemProps[oldPath];
    delete state.itemProps[oldPath];
  }
  
  // Обновляем пути в экземплярах
  const instances = state.instances || {};
  for (let id in instances) {
    if (instances[id].path === oldPath) {
      instances[id].path = newPath;
    }
  }
  rebuildInstancesIndex();
  
  updateOrderPaths(oldPath, newPath);
  saveState();
}

// ============================================================
// СБРОС ВСЕХ ДАННЫХ
// ============================================================

export function resetAllData() {
  const state = getState();
  state.inventory = {};
  state.stock = {};
  state.specs = {};
  state.itemProps = {};
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
  state.instances = {};
  state.instancesByPath = {};
  state._calcCache.clear();
  saveState();
}

export default {
  getStockKey,
  getFullPath,
  getStock,
  getStockValue,
  setStock,
  getSpec,
  setSpec,
  getItemProps,
  getItemPropsByPath,
  setItemProps,
  getCommonCases,
  addCommonCase,
  updateCommonCase,
  deleteCommonCase,
  getTruckPresets,
  addTruckPreset,
  updateTruckPreset,
  deleteTruckPreset,
  getTruckPreset,
  // Новые функции для экземпляров
  getPathInstances,
  getPathInstanceStats,
  addInstanceToPath,
  removeInstance,
  updateInstance,
  syncInstancesWithStock,
  getInstanceById,
  renameCategory,
  renameSubgroup,
  renameItem,
  moveItem,
  resetAllData,
};