// services/specs.js

/**
 * Сервис для работы с описаниями (спецификациями) позиций.
 * @module services/specs
 */

import { getState, saveState } from '../core/store.js';
import { emit, EVENTS } from '../core/events.js';

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================

/**
 * Формирует путь для позиции.
 * @param {string} catKey - имя категории
 * @param {string|null} subKey - имя подгруппы (null для корневого массива)
 * @param {string} itemName - имя позиции
 * @returns {string} путь
 */
function buildPath(catKey, subKey, itemName) {
  return subKey ? `${catKey}|${subKey}|${itemName}` : `${catKey}|${itemName}`;
}

// ============================================================
// ОПЕРАЦИИ С ОПИСАНИЯМИ
// ============================================================

/**
 * Получает описание позиции.
 * @param {string} catKey - имя категории
 * @param {string|null} subKey - имя подгруппы
 * @param {string} itemName - имя позиции
 * @returns {string} описание (пустая строка, если не задано)
 */
export function getSpec(catKey, subKey, itemName) {
  const path = buildPath(catKey, subKey, itemName);
  return getSpecByPath(path);
}

/**
 * Получает описание по полному пути.
 * @param {string} path - путь вида "cat|sub|item" или "cat|item"
 * @returns {string} описание (пустая строка, если не задано)
 */
export function getSpecByPath(path) {
  const state = getState();
  return state.specs[path] || '';
}

/**
 * Устанавливает описание позиции.
 * @param {string} catKey - имя категории
 * @param {string|null} subKey - имя подгруппы
 * @param {string} itemName - имя позиции
 * @param {string} value - новое описание
 * @returns {boolean} успех операции
 */
export function setSpec(catKey, subKey, itemName, value) {
  const path = buildPath(catKey, subKey, itemName);
  return setSpecByPath(path, value);
}

/**
 * Устанавливает описание по полному пути.
 * @param {string} path - путь
 * @param {string} value - новое описание
 * @returns {boolean} успех операции
 */
export function setSpecByPath(path, value) {
  const state = getState();
  const trimmed = value?.trim?.() || '';
  if (trimmed) {
    state.specs[path] = trimmed;
  } else {
    delete state.specs[path];
  }
  saveState();
  emit(EVENTS.EDITOR_DATA_CHANGED, { action: 'setSpec', path, value: trimmed });
  return true;
}

/**
 * Проверяет, есть ли у позиции описание.
 * @param {string} catKey - имя категории
 * @param {string|null} subKey - имя подгруппы
 * @param {string} itemName - имя позиции
 * @returns {boolean}
 */
export function hasSpec(catKey, subKey, itemName) {
  return !!getSpec(catKey, subKey, itemName);
}

/**
 * Возвращает все описания.
 * @returns {Object} копия объекта specs
 */
export function getAllSpecs() {
  return { ...getState().specs };
}

// ============================================================
// МАССОВЫЕ ОПЕРАЦИИ
// ============================================================

/**
 * Устанавливает несколько описаний за один раз.
 * @param {Object} specMap - объект { path: string, ... }
 * @returns {boolean} успех операции
 */
export function setMultipleSpecs(specMap) {
  const state = getState();
  for (const [path, value] of Object.entries(specMap)) {
    const trimmed = value?.trim?.() || '';
    if (trimmed) {
      state.specs[path] = trimmed;
    } else {
      delete state.specs[path];
    }
  }
  saveState();
  emit(EVENTS.EDITOR_DATA_CHANGED, { action: 'setMultipleSpecs', count: Object.keys(specMap).length });
  return true;
}

/**
 * Очищает все описания.
 * @returns {boolean} успех операции
 */
export function clearAllSpecs() {
  const state = getState();
  state.specs = {};
  saveState();
  emit(EVENTS.EDITOR_DATA_CHANGED, { action: 'clearAllSpecs' });
  return true;
}

// ============================================================
// ЭКСПОРТ ПО УМОЛЧАНИЮ
// ============================================================

export default {
  getSpec,
  getSpecByPath,
  setSpec,
  setSpecByPath,
  hasSpec,
  getAllSpecs,
  setMultipleSpecs,
  clearAllSpecs,
};