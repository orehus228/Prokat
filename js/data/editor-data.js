// data/editor-data.js
import { getState, saveState, clearCalculationCache, rebuildInstancesIndex } from '../core/state.js';
import { CAT_NAMES, DUPLICATE_VIDEO_GROUPS, DEFAULT_TRUCK_PRESETS, INSTANCE_STATUSES } from '../core/config.js';
import { updateAllPathsOnCategoryRename, updateOrderPaths } from '../services/order-data.js';
import { joinPath } from '../utils/pathUtils.js';
import { inventoryRepo } from '../repositories/InventoryRepository.js';

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ РАБОТЫ С ПУТЯМИ (оставлены для совместимости)
// ============================================================

export function getStockKey(catKey, subKey, itemName) {
  return joinPath(catKey, subKey, itemName);
}

export function getFullPath(catKey, subKey, itemName) {
  return getStockKey(catKey, subKey, itemName);
}

// ============================================================
// ДОСТУП К СКЛАДСКИМ ОСТАТКАМ (перенаправление на репозиторий)
// ============================================================

export function getStock(catKey, subKey, itemName) {
  const path = getStockKey(catKey, subKey, itemName);
  return inventoryRepo.getStock(path);
}

export function getStockValue(path) {
  return inventoryRepo.getStock(path);
}

export function setStock(catKey, subKey, itemName, val) {
  const path = getStockKey(catKey, subKey, itemName);
  inventoryRepo.setStock(path, val);
}

// ============================================================
// ДОСТУП К СПЕЦИФИКАЦИЯМ (ОПИСАНИЯМ)
// ============================================================

export function getSpec(catKey, subKey, itemName) {
  const path = getStockKey(catKey, subKey, itemName);
  return inventoryRepo.getSpec(path);
}

export function setSpec(catKey, subKey, itemName, val) {
  const path = getStockKey(catKey, subKey, itemName);
  inventoryRepo.setSpec(path, val);
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
  return inventoryRepo.getProps(key);
}

export function getItemPropsByPath(path) {
  return inventoryRepo.getProps(path);
}

export function setItemProps(catKey, subKey, itemName, props) {
  const key = getStockKey(catKey, subKey, itemName);
  inventoryRepo.setProps(key, props);
}

// ============================================================
// РАБОТА С ОБЩИМИ КОФРАМИ
// ============================================================

export function getCommonCases() {
  return inventoryRepo.getCommonCases();
}

export function addCommonCase(caseObj) {
  inventoryRepo.addCommonCase(caseObj);
}

export function updateCommonCase(id, newData) {
  inventoryRepo.updateCommonCase(id, newData);
}

export function deleteCommonCase(id) {
  inventoryRepo.deleteCommonCase(id);
}

// ============================================================
// РАБОТА С ГРУЗОВИКАМИ
// ============================================================

export function getTruckPresets() {
  return inventoryRepo.getTruckPresets();
}

export function addTruckPreset(preset) {
  inventoryRepo.addTruckPreset(preset);
}

export function updateTruckPreset(id, newData) {
  inventoryRepo.updateTruckPreset(id, newData);
}

export function deleteTruckPreset(id) {
  inventoryRepo.deleteTruckPreset(id);
}

export function getTruckPreset(id) {
  return inventoryRepo.getTruckPreset(id);
}

// ============================================================
// РАБОТА С ЭКЗЕМПЛЯРАМИ (НОВЫЕ ФУНКЦИИ)
// ============================================================

export function getPathInstances(path) {
  return inventoryRepo.getInstances(path);
}

export function getPathInstanceStats(path) {
  return inventoryRepo.getInstanceStats(path);
}

export function addInstanceToPath(path, serialNumber = '', status = INSTANCE_STATUSES.STOCK, subrentInfo = null) {
  return inventoryRepo.addInstance(path, serialNumber, status, subrentInfo);
}

export function removeInstance(instanceId) {
  return inventoryRepo.deleteInstance(instanceId);
}

export function updateInstance(instanceId, newStatus, comment = '') {
  return inventoryRepo.updateInstance(instanceId, newStatus, comment);
}

export function syncInstancesWithStock(path, targetCount = null, serialPrefix = 'SN') {
  return inventoryRepo.syncInstancesWithStock(path, targetCount, serialPrefix);
}

export function getInstanceById(instanceId) {
  return inventoryRepo.getInstanceById(instanceId);
}

// ============================================================
// ПЕРЕИМЕНОВАНИЕ КАТЕГОРИЙ, ПОДГРУПП, ПОЗИЦИЙ И ПЕРЕМЕЩЕНИЕ
// (эти функции пока остаются здесь, но используют репозиторий для обновления данных)
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
  
  // Обновляем пути в stock, specs, itemProps через репозиторий (он работает с state напрямую)
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