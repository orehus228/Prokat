// services/inventory.js

/**
 * Сервис для работы с инвентарём (категории, подгруппы, позиции).
 * Все функции — чистые мутации состояния через store.
 * @module services/inventory
 */

import { getState, saveState } from '../core/store.js';
import { generateId, splitPath, joinPath, getCategory } from '../core/utils.js';
import { MAX_TRAVERSAL_DEPTH } from '../core/config.js';
import { emit, EVENTS } from '../core/events.js';

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================

/**
 * Получает массив позиций по пути (категория и подгруппа).
 * @param {Object} inventory - объект инвентаря
 * @param {string} catKey - имя категории
 * @param {string|null} [subKey] - имя подгруппы (null для корневого массива)
 * @returns {Array|null} массив позиций или null, если не найден
 */
function getTargetArray(inventory, catKey, subKey = null) {
  const cat = inventory[catKey];
  if (!cat) return null;
  if (subKey === null || subKey === undefined) {
    return Array.isArray(cat) ? cat : null;
  }
  const sub = cat[subKey];
  return Array.isArray(sub) ? sub : null;
}

/**
 * Обновляет порядок подгрупп в категории.
 * @param {Object} catData - данные категории
 * @param {string} subKey - имя подгруппы
 * @param {number} newIndex - новый индекс
 */
function reorderSubgroups(catData, subKey, newIndex) {
  if (!catData._subOrder) {
    catData._subOrder = Object.keys(catData).filter(k => k !== '_subOrder');
  }
  const currentIndex = catData._subOrder.indexOf(subKey);
  if (currentIndex === -1 || currentIndex === newIndex) return;
  catData._subOrder.splice(currentIndex, 1);
  catData._subOrder.splice(newIndex, 0, subKey);
}

// ============================================================
// КАТЕГОРИИ
// ============================================================

/**
 * Создаёт новую категорию.
 * @param {string} name - имя категории
 * @param {string} [displayName] - отображаемое имя (опционально)
 * @returns {boolean} успех операции
 * @throws {Error} если категория уже существует
 */
export function createCategory(name, displayName) {
  const state = getState();
  if (state.inventory[name]) {
    throw new Error(`Категория "${name}" уже существует`);
  }

  state.inventory[name] = { _subOrder: [] };
  if (displayName) {
    state.catNames[name] = displayName;
  }

  // Добавляем в порядок категорий
  if (!state._categoryOrder) {
    state._categoryOrder = [];
  }
  state._categoryOrder.push(name);

  saveState();
  emit(EVENTS.EDITOR_DATA_CHANGED, { action: 'createCategory', name });
  return true;
}

/**
 * Удаляет категорию и все её данные.
 * @param {string} name - имя категории
 * @returns {boolean} успех операции
 * @throws {Error} если категория не существует
 */
export function deleteCategory(name) {
  const state = getState();
  if (!state.inventory[name]) {
    throw new Error(`Категория "${name}" не существует`);
  }

  // Удаляем категорию
  delete state.inventory[name];
  delete state.catNames[name];

  // Удаляем из порядка категорий
  const idx = state._categoryOrder.indexOf(name);
  if (idx !== -1) {
    state._categoryOrder.splice(idx, 1);
  }

  // Удаляем связанные данные (stock, specs, itemProps)
  const prefix = name + '|';
  for (const key of Object.keys(state.stock)) {
    if (key.startsWith(prefix)) delete state.stock[key];
  }
  for (const key of Object.keys(state.specs)) {
    if (key.startsWith(prefix)) delete state.specs[key];
  }
  for (const key of Object.keys(state.itemProps)) {
    if (key.startsWith(prefix)) delete state.itemProps[key];
  }

  saveState();
  emit(EVENTS.EDITOR_DATA_CHANGED, { action: 'deleteCategory', name });
  return true;
}

/**
 * Переименовывает категорию.
 * @param {string} oldName - старое имя
 * @param {string} newName - новое имя
 * @returns {boolean} успех операции
 * @throws {Error} если категория не существует или новое имя занято
 */
export function renameCategory(oldName, newName) {
  if (oldName === newName) return true;
  const state = getState();
  if (!state.inventory[oldName]) {
    throw new Error(`Категория "${oldName}" не существует`);
  }
  if (state.inventory[newName]) {
    throw new Error(`Категория "${newName}" уже существует`);
  }

  // Переименовываем
  state.inventory[newName] = state.inventory[oldName];
  delete state.inventory[oldName];

  if (state.catNames[oldName]) {
    state.catNames[newName] = state.catNames[oldName];
    delete state.catNames[oldName];
  }

  // Обновляем порядок категорий
  const idx = state._categoryOrder.indexOf(oldName);
  if (idx !== -1) {
    state._categoryOrder[idx] = newName;
  }

  // Обновляем пути в stock, specs, itemProps
  const oldPrefix = oldName + '|';
  const newPrefix = newName + '|';
  const updateKey = (obj) => {
    const keys = Object.keys(obj).filter(k => k.startsWith(oldPrefix));
    for (const key of keys) {
      const newKey = key.replace(oldPrefix, newPrefix);
      obj[newKey] = obj[key];
      delete obj[key];
    }
  };
  updateKey(state.stock);
  updateKey(state.specs);
  updateKey(state.itemProps);

  // Обновляем пути в order-данных (используем функцию из order.js позже)
  // Для этого импортируем updateAllPathsOnCategoryRename динамически, чтобы избежать циклической зависимости
  import('./order.js').then(({ updateAllPathsOnCategoryRename }) => {
    updateAllPathsOnCategoryRename(oldPrefix, newPrefix);
  });

  saveState();
  emit(EVENTS.EDITOR_DATA_CHANGED, { action: 'renameCategory', oldName, newName });
  return true;
}

/**
 * Перемещает категорию в порядке отображения.
 * @param {string} name - имя категории
 * @param {number} delta - смещение (+1 вниз, -1 вверх)
 * @returns {boolean} успех операции
 */
export function moveCategory(name, delta) {
  const state = getState();
  const order = state._categoryOrder;
  const idx = order.indexOf(name);
  if (idx === -1) return false;
  const newIdx = idx + delta;
  if (newIdx < 0 || newIdx >= order.length) return false;
  [order[idx], order[newIdx]] = [order[newIdx], order[idx]];
  saveState();
  emit(EVENTS.EDITOR_DATA_CHANGED, { action: 'moveCategory', name, delta });
  return true;
}

// ============================================================
// ПОДГРУППЫ
// ============================================================

/**
 * Создаёт новую подгруппу в категории.
 * @param {string} catKey - имя категории
 * @param {string} subKey - имя подгруппы
 * @returns {boolean} успех операции
 * @throws {Error} если категория не существует или подгруппа уже есть
 */
export function createSubgroup(catKey, subKey) {
  const state = getState();
  const catData = state.inventory[catKey];
  if (!catData) {
    throw new Error(`Категория "${catKey}" не существует`);
  }
  if (typeof catData !== 'object' || Array.isArray(catData)) {
    throw new Error(`Категория "${catKey}" не поддерживает подгруппы (это массив)`);
  }
  if (catData[subKey]) {
    throw new Error(`Подгруппа "${subKey}" уже существует`);
  }

  catData[subKey] = [];
  if (!catData._subOrder) {
    catData._subOrder = [];
  }
  catData._subOrder.push(subKey);

  saveState();
  emit(EVENTS.EDITOR_DATA_CHANGED, { action: 'createSubgroup', catKey, subKey });
  return true;
}

/**
 * Удаляет подгруппу.
 * @param {string} catKey - имя категории
 * @param {string} subKey - имя подгруппы
 * @returns {boolean} успех операции
 * @throws {Error} если категория или подгруппа не существует
 */
export function deleteSubgroup(catKey, subKey) {
  const state = getState();
  const catData = state.inventory[catKey];
  if (!catData) throw new Error(`Категория "${catKey}" не существует`);
  if (!catData[subKey]) throw new Error(`Подгруппа "${subKey}" не существует`);

  delete catData[subKey];

  // Удаляем из _subOrder
  const idx = catData._subOrder.indexOf(subKey);
  if (idx !== -1) {
    catData._subOrder.splice(idx, 1);
  }

  // Удаляем связанные данные
  const prefix = catKey + '|' + subKey + '|';
  for (const key of Object.keys(state.stock)) {
    if (key.startsWith(prefix)) delete state.stock[key];
  }
  for (const key of Object.keys(state.specs)) {
    if (key.startsWith(prefix)) delete state.specs[key];
  }
  for (const key of Object.keys(state.itemProps)) {
    if (key.startsWith(prefix)) delete state.itemProps[key];
  }

  saveState();
  emit(EVENTS.EDITOR_DATA_CHANGED, { action: 'deleteSubgroup', catKey, subKey });
  return true;
}

/**
 * Переименовывает подгруппу.
 * @param {string} catKey - имя категории
 * @param {string} oldSub - старое имя подгруппы
 * @param {string} newSub - новое имя подгруппы
 * @returns {boolean} успех операции
 * @throws {Error} если категория/подгруппа не существует или новое имя занято
 */
export function renameSubgroup(catKey, oldSub, newSub) {
  if (oldSub === newSub) return true;
  const state = getState();
  const catData = state.inventory[catKey];
  if (!catData) throw new Error(`Категория "${catKey}" не существует`);
  if (!catData[oldSub]) throw new Error(`Подгруппа "${oldSub}" не существует`);
  if (catData[newSub]) throw new Error(`Подгруппа "${newSub}" уже существует`);

  catData[newSub] = catData[oldSub];
  delete catData[oldSub];

  // Обновляем _subOrder
  const idx = catData._subOrder.indexOf(oldSub);
  if (idx !== -1) {
    catData._subOrder[idx] = newSub;
  }

  // Обновляем пути в stock, specs, itemProps
  const oldPrefix = catKey + '|' + oldSub + '|';
  const newPrefix = catKey + '|' + newSub + '|';
  const updateKey = (obj) => {
    const keys = Object.keys(obj).filter(k => k.startsWith(oldPrefix));
    for (const key of keys) {
      const newKey = key.replace(oldPrefix, newPrefix);
      obj[newKey] = obj[key];
      delete obj[key];
    }
  };
  updateKey(state.stock);
  updateKey(state.specs);
  updateKey(state.itemProps);

  // Обновляем пути в order-данных
  import('./order.js').then(({ updateAllPathsOnCategoryRename }) => {
    updateAllPathsOnCategoryRename(oldPrefix, newPrefix);
  });

  saveState();
  emit(EVENTS.EDITOR_DATA_CHANGED, { action: 'renameSubgroup', catKey, oldSub, newSub });
  return true;
}

/**
 * Перемещает подгруппу в порядке отображения.
 * @param {string} catKey - имя категории
 * @param {string} subKey - имя подгруппы
 * @param {number} delta - смещение (+1 вниз, -1 вверх)
 * @returns {boolean} успех операции
 */
export function moveSubgroup(catKey, subKey, delta) {
  const state = getState();
  const catData = state.inventory[catKey];
  if (!catData || typeof catData !== 'object' || Array.isArray(catData)) return false;
  const order = catData._subOrder;
  if (!order) return false;
  const idx = order.indexOf(subKey);
  if (idx === -1) return false;
  const newIdx = idx + delta;
  if (newIdx < 0 || newIdx >= order.length) return false;
  [order[idx], order[newIdx]] = [order[newIdx], order[idx]];
  saveState();
  emit(EVENTS.EDITOR_DATA_CHANGED, { action: 'moveSubgroup', catKey, subKey, delta });
  return true;
}

// ============================================================
// ПОЗИЦИИ
// ============================================================

/**
 * Добавляет позицию в категорию или подгруппу.
 * @param {string} catKey - имя категории
 * @param {string|null} subKey - имя подгруппы (null для корневого массива)
 * @param {string} itemName - имя позиции
 * @returns {boolean} успех операции
 * @throws {Error} если категория/подгруппа не существует или позиция уже есть
 */
export function createItem(catKey, subKey, itemName) {
  const state = getState();
  const targetArray = getTargetArray(state.inventory, catKey, subKey);
  if (!targetArray) {
    throw new Error(`Целевой массив не найден (кат: ${catKey}, под: ${subKey})`);
  }
  if (targetArray.includes(itemName)) {
    throw new Error(`Позиция "${itemName}" уже существует`);
  }

  targetArray.push(itemName);
  saveState();
  emit(EVENTS.EDITOR_DATA_CHANGED, { action: 'createItem', catKey, subKey, itemName });
  return true;
}

/**
 * Удаляет позицию.
 * @param {string} catKey - имя категории
 * @param {string|null} subKey - имя подгруппы (null для корневого массива)
 * @param {string} itemName - имя позиции
 * @returns {boolean} успех операции
 * @throws {Error} если позиция не найдена
 */
export function deleteItem(catKey, subKey, itemName) {
  const state = getState();
  const targetArray = getTargetArray(state.inventory, catKey, subKey);
  if (!targetArray) {
    throw new Error(`Целевой массив не найден (кат: ${catKey}, под: ${subKey})`);
  }
  const idx = targetArray.indexOf(itemName);
  if (idx === -1) {
    throw new Error(`Позиция "${itemName}" не найдена`);
  }

  targetArray.splice(idx, 1);

  // Удаляем связанные данные
  const path = subKey ? `${catKey}|${subKey}|${itemName}` : `${catKey}|${itemName}`;
  delete state.stock[path];
  delete state.specs[path];
  delete state.itemProps[path];

  saveState();
  emit(EVENTS.EDITOR_DATA_CHANGED, { action: 'deleteItem', catKey, subKey, itemName });
  return true;
}

/**
 * Переименовывает позицию.
 * @param {string} catKey - имя категории
 * @param {string|null} subKey - имя подгруппы (null для корневого массива)
 * @param {string} oldName - старое имя
 * @param {string} newName - новое имя
 * @returns {boolean} успех операции
 * @throws {Error} если позиция не найдена или новое имя занято
 */
export function renameItem(catKey, subKey, oldName, newName) {
  if (oldName === newName) return true;
  const state = getState();
  const targetArray = getTargetArray(state.inventory, catKey, subKey);
  if (!targetArray) {
    throw new Error(`Целевой массив не найден (кат: ${catKey}, под: ${subKey})`);
  }
  const idx = targetArray.indexOf(oldName);
  if (idx === -1) {
    throw new Error(`Позиция "${oldName}" не найдена`);
  }
  if (targetArray.includes(newName)) {
    throw new Error(`Позиция "${newName}" уже существует`);
  }

  targetArray[idx] = newName;

  // Обновляем пути в stock, specs, itemProps
  const oldPath = subKey ? `${catKey}|${subKey}|${oldName}` : `${catKey}|${oldName}`;
  const newPath = subKey ? `${catKey}|${subKey}|${newName}` : `${catKey}|${newName}`;
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

  // Обновляем пути в order-данных
  import('./order.js').then(({ updateOrderPaths }) => {
    updateOrderPaths(oldPath, newPath);
  });

  saveState();
  emit(EVENTS.EDITOR_DATA_CHANGED, { action: 'renameItem', catKey, subKey, oldName, newName });
  return true;
}

/**
 * Перемещает позицию в другую категорию/подгруппу.
 * @param {string} srcCat - исходная категория
 * @param {string|null} srcSub - исходная подгруппа (null для корневого массива)
 * @param {string} itemName - имя позиции
 * @param {string} dstCat - целевая категория
 * @param {string|null} dstSub - целевая подгруппа (null для корневого массива)
 * @returns {boolean} успех операции
 * @throws {Error} если исходная/целевая позиция не существует
 */
export function moveItem(srcCat, srcSub, itemName, dstCat, dstSub) {
  const state = getState();
  const srcArray = getTargetArray(state.inventory, srcCat, srcSub);
  if (!srcArray) {
    throw new Error(`Исходный массив не найден (кат: ${srcCat}, под: ${srcSub})`);
  }
  const srcIdx = srcArray.indexOf(itemName);
  if (srcIdx === -1) {
    throw new Error(`Позиция "${itemName}" не найдена в источнике`);
  }

  const dstArray = getTargetArray(state.inventory, dstCat, dstSub);
  if (!dstArray) {
    throw new Error(`Целевой массив не найден (кат: ${dstCat}, под: ${dstSub})`);
  }
  if (dstArray.includes(itemName)) {
    throw new Error(`Позиция "${itemName}" уже существует в целевом массиве`);
  }

  // Удаляем из источника
  srcArray.splice(srcIdx, 1);
  // Добавляем в цель
  dstArray.push(itemName);

  // Переносим связанные данные
  const oldPath = srcSub ? `${srcCat}|${srcSub}|${itemName}` : `${srcCat}|${itemName}`;
  const newPath = dstSub ? `${dstCat}|${dstSub}|${itemName}` : `${dstCat}|${itemName}`;
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

  // Обновляем пути в order-данных
  import('./order.js').then(({ updateOrderPaths }) => {
    updateOrderPaths(oldPath, newPath);
  });

  saveState();
  emit(EVENTS.EDITOR_DATA_CHANGED, { action: 'moveItem', srcCat, srcSub, dstCat, dstSub, itemName });
  return true;
}

/**
 * Перемещает позицию внутри одного массива.
 * @param {string} catKey - имя категории
 * @param {string|null} subKey - имя подгруппы (null для корневого массива)
 * @param {string} itemName - имя позиции
 * @param {number} delta - смещение (+1 вниз, -1 вверх)
 * @returns {boolean} успех операции
 */
export function moveItemWithinGroup(catKey, subKey, itemName, delta) {
  const state = getState();
  const targetArray = getTargetArray(state.inventory, catKey, subKey);
  if (!targetArray) return false;
  const idx = targetArray.indexOf(itemName);
  if (idx === -1) return false;
  const newIdx = idx + delta;
  if (newIdx < 0 || newIdx >= targetArray.length) return false;
  [targetArray[idx], targetArray[newIdx]] = [targetArray[newIdx], targetArray[idx]];
  saveState();
  emit(EVENTS.EDITOR_DATA_CHANGED, { action: 'moveItemWithinGroup', catKey, subKey, itemName, delta });
  return true;
}

// ============================================================
// ПОЛУЧЕНИЕ ДАННЫХ (геттеры)
// ============================================================

/**
 * Возвращает копию всего инвентаря.
 * @returns {Object} дерево инвентаря
 */
export function getInventory() {
  return getState().inventory;
}

/**
 * Возвращает список всех категорий в порядке отображения.
 * @returns {string[]} массив имён категорий
 */
export function getCategoryOrder() {
  return getState()._categoryOrder || [];
}

/**
 * Возвращает отображаемое имя категории.
 * @param {string} catKey - ключ категории
 * @returns {string} отображаемое имя
 */
export function getCategoryDisplayName(catKey) {
  const state = getState();
  return state.catNames[catKey] || catKey;
}

/**
 * Возвращает массив позиций в категории/подгруппе.
 * @param {string} catKey - имя категории
 * @param {string|null} [subKey] - имя подгруппы (null для корневого массива)
 * @returns {Array|null} массив позиций или null
 */
export function getItems(catKey, subKey = null) {
  const state = getState();
  const targetArray = getTargetArray(state.inventory, catKey, subKey);
  return targetArray ? [...targetArray] : null;
}

/**
 * Проверяет, существует ли позиция.
 * @param {string} catKey - имя категории
 * @param {string|null} subKey - имя подгруппы
 * @param {string} itemName - имя позиции
 * @returns {boolean}
 */
export function itemExists(catKey, subKey, itemName) {
  const arr = getItems(catKey, subKey);
  return arr ? arr.includes(itemName) : false;
}

// ============================================================
// ЭКСПОРТ ПО УМОЛЧАНИЮ
// ============================================================

export default {
  createCategory,
  deleteCategory,
  renameCategory,
  moveCategory,
  createSubgroup,
  deleteSubgroup,
  renameSubgroup,
  moveSubgroup,
  createItem,
  deleteItem,
  renameItem,
  moveItem,
  moveItemWithinGroup,
  getInventory,
  getCategoryOrder,
  getCategoryDisplayName,
  getItems,
  itemExists,
};