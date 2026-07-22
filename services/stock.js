// services/stock.js

/**
 * Сервис для работы с остатками на складе.
 * @module services/stock
 */

import { getState, saveState } from '../core/store.js';
import { emit, EVENTS } from '../core/events.js';

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================

/**
 * Формирует ключ для хранения остатка по пути позиции.
 * @param {string} catKey - имя категории
 * @param {string|null} subKey - имя подгруппы (null для корневого массива)
 * @param {string} itemName - имя позиции
 * @returns {string} путь вида "cat|sub|item" или "cat|item"
 */
function buildPath(catKey, subKey, itemName) {
  return subKey ? `${catKey}|${subKey}|${itemName}` : `${catKey}|${itemName}`;
}

// ============================================================
// ОПЕРАЦИИ С ОСТАТКАМИ
// ============================================================

/**
 * Получает остаток позиции.
 * @param {string} catKey - имя категории
 * @param {string|null} subKey - имя подгруппы
 * @param {string} itemName - имя позиции
 * @returns {number} остаток (0, если не задан)
 */
export function getStock(catKey, subKey, itemName) {
  const path = buildPath(catKey, subKey, itemName);
  return getStockByPath(path);
}

/**
 * Получает остаток по полному пути.
 * @param {string} path - путь вида "cat|sub|item" или "cat|item"
 * @returns {number} остаток (0, если не задан)
 */
export function getStockByPath(path) {
  const state = getState();
  return state.stock[path] ?? 0;
}

/**
 * Устанавливает остаток позиции.
 * @param {string} catKey - имя категории
 * @param {string|null} subKey - имя подгруппы
 * @param {string} itemName - имя позиции
 * @param {number} value - новое значение (неотрицательное целое)
 * @returns {boolean} успех операции
 */
export function setStock(catKey, subKey, itemName, value) {
  const path = buildPath(catKey, subKey, itemName);
  return setStockByPath(path, value);
}

/**
 * Устанавливает остаток по полному пути.
 * @param {string} path - путь вида "cat|sub|item" или "cat|item"
 * @param {number} value - новое значение (неотрицательное целое)
 * @returns {boolean} успех операции
 */
export function setStockByPath(path, value) {
  const num = Math.max(0, parseInt(value, 10) || 0);
  const state = getState();
  if (num > 0) {
    state.stock[path] = num;
  } else {
    delete state.stock[path];
  }
  saveState();
  emit(EVENTS.EDITOR_DATA_CHANGED, { action: 'setStock', path, value: num });
  return true;
}

/**
 * Увеличивает остаток на указанное значение.
 * @param {string} catKey - имя категории
 * @param {string|null} subKey - имя подгруппы
 * @param {string} itemName - имя позиции
 * @param {number} delta - приращение (может быть отрицательным)
 * @returns {number} новое значение остатка
 */
export function changeStock(catKey, subKey, itemName, delta) {
  const current = getStock(catKey, subKey, itemName);
  const newVal = Math.max(0, current + delta);
  setStock(catKey, subKey, itemName, newVal);
  return newVal;
}

/**
 * Изменяет остаток по полному пути.
 * @param {string} path - путь
 * @param {number} delta - приращение
 * @returns {number} новое значение
 */
export function changeStockByPath(path, delta) {
  const current = getStockByPath(path);
  const newVal = Math.max(0, current + delta);
  setStockByPath(path, newVal);
  return newVal;
}

/**
 * Проверяет, достаточно ли остатка для запрошенного количества.
 * @param {string} path - путь позиции
 * @param {number} requested - запрошенное количество
 * @returns {boolean} true, если остаток >= запрошенного
 */
export function hasSufficientStock(path, requested) {
  const available = getStockByPath(path);
  return available >= requested;
}

/**
 * Возвращает объект со всеми остатками.
 * @returns {Object} копия объекта stock
 */
export function getAllStock() {
  return { ...getState().stock };
}

// ============================================================
// МАССОВЫЕ ОПЕРАЦИИ
// ============================================================

/**
 * Устанавливает остатки для нескольких позиций за один раз.
 * @param {Object} stockMap - объект { path: number, ... }
 * @returns {boolean} успех операции
 */
export function setMultipleStock(stockMap) {
  const state = getState();
  for (const [path, value] of Object.entries(stockMap)) {
    const num = Math.max(0, parseInt(value, 10) || 0);
    if (num > 0) {
      state.stock[path] = num;
    } else {
      delete state.stock[path];
    }
  }
  saveState();
  emit(EVENTS.EDITOR_DATA_CHANGED, { action: 'setMultipleStock', count: Object.keys(stockMap).length });
  return true;
}

/**
 * Очищает все остатки (устанавливает 0 для всех позиций).
 * @returns {boolean} успех операции
 */
export function clearAllStock() {
  const state = getState();
  state.stock = {};
  saveState();
  emit(EVENTS.EDITOR_DATA_CHANGED, { action: 'clearAllStock' });
  return true;
}

// ============================================================
// ЭКСПОРТ ПО УМОЛЧАНИЮ
// ============================================================

export default {
  getStock,
  getStockByPath,
  setStock,
  setStockByPath,
  changeStock,
  changeStockByPath,
  hasSufficientStock,
  getAllStock,
  setMultipleStock,
  clearAllStock,
};