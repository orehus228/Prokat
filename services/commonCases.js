// services/commonCases.js

/**
 * Сервис для работы с общими кофрами.
 * @module services/commonCases
 */

import { getState, saveState } from '../core/store.js';
import { emit, EVENTS } from '../core/events.js';
import { generateId, deepClone } from '../core/utils.js';

// ============================================================
// ОПРЕДЕЛЕНИЕ ТИПОВ (JSDoc)
// ============================================================

/**
 * @typedef {Object} CommonCase
 * @property {string} id - уникальный ID
 * @property {string} name - название кофра
 * @property {number} qty - вместимость (шт)
 * @property {string} dimensions - габариты (Д×Ш×В, см)
 * @property {number} emptyWeight - вес пустого кофра (кг)
 * @property {number} maxWeight - максимальный вес груза (кг)
 * @property {number} maxVolume - максимальный объём (м³)
 */

// ============================================================
// ПОЛУЧЕНИЕ ДАННЫХ
// ============================================================

/**
 * Возвращает массив всех общих кофров.
 * @returns {CommonCase[]} массив кофров (копия)
 */
export function getCommonCases() {
  const state = getState();
  return deepClone(state.commonCases || []);
}

/**
 * Возвращает общий кофр по ID.
 * @param {string} id - ID кофра
 * @returns {CommonCase|null} кофр или null
 */
export function getCommonCaseById(id) {
  const state = getState();
  const found = state.commonCases.find(c => c.id === id);
  return found ? deepClone(found) : null;
}

/**
 * Проверяет, существует ли кофр с таким ID.
 * @param {string} id - ID кофра
 * @returns {boolean}
 */
export function commonCaseExists(id) {
  const state = getState();
  return state.commonCases.some(c => c.id === id);
}

// ============================================================
// CRUD ОПЕРАЦИИ
// ============================================================

/**
 * Создаёт новый общий кофр.
 * @param {Omit<CommonCase, 'id'>} caseData - данные кофра (без id)
 * @returns {CommonCase} созданный кофр
 * @throws {Error} если обязательные поля отсутствуют или некорректны
 */
export function createCommonCase(caseData) {
  const state = getState();

  // Валидация
  if (!caseData.name || caseData.name.trim() === '') {
    throw new Error('Название кофра обязательно');
  }
  const qty = parseInt(caseData.qty, 10);
  if (isNaN(qty) || qty <= 0) {
    throw new Error('Вместимость должна быть положительным числом');
  }

  const newCase = {
    id: generateId('case'),
    name: caseData.name.trim(),
    qty,
    dimensions: caseData.dimensions || '',
    emptyWeight: parseFloat(caseData.emptyWeight) || 0,
    maxWeight: parseFloat(caseData.maxWeight) || 0,
    maxVolume: parseFloat(caseData.maxVolume) || 0,
  };

  if (!state.commonCases) state.commonCases = [];
  state.commonCases.push(newCase);

  saveState();
  emit(EVENTS.EDITOR_DATA_CHANGED, { action: 'createCommonCase', case: newCase });
  return deepClone(newCase);
}

/**
 * Обновляет существующий общий кофр.
 * @param {string} id - ID кофра
 * @param {Partial<CommonCase>} newData - новые данные (частичные)
 * @returns {CommonCase} обновлённый кофр
 * @throws {Error} если кофр не найден или данные некорректны
 */
export function updateCommonCase(id, newData) {
  const state = getState();
  const idx = state.commonCases.findIndex(c => c.id === id);
  if (idx === -1) {
    throw new Error(`Общий кофр с ID "${id}" не найден`);
  }

  const current = state.commonCases[idx];
  const updated = { ...current };

  if (newData.name !== undefined) {
    if (!newData.name || newData.name.trim() === '') {
      throw new Error('Название кофра обязательно');
    }
    updated.name = newData.name.trim();
  }
  if (newData.qty !== undefined) {
    const qty = parseInt(newData.qty, 10);
    if (isNaN(qty) || qty <= 0) {
      throw new Error('Вместимость должна быть положительным числом');
    }
    updated.qty = qty;
  }
  if (newData.dimensions !== undefined) {
    updated.dimensions = newData.dimensions || '';
  }
  if (newData.emptyWeight !== undefined) {
    updated.emptyWeight = parseFloat(newData.emptyWeight) || 0;
  }
  if (newData.maxWeight !== undefined) {
    updated.maxWeight = parseFloat(newData.maxWeight) || 0;
  }
  if (newData.maxVolume !== undefined) {
    updated.maxVolume = parseFloat(newData.maxVolume) || 0;
  }

  state.commonCases[idx] = updated;
  saveState();
  emit(EVENTS.EDITOR_DATA_CHANGED, { action: 'updateCommonCase', id, case: updated });
  return deepClone(updated);
}

/**
 * Удаляет общий кофр.
 * Также удаляет все ссылки на этот кофр в itemProps и orderPacking.
 * @param {string} id - ID кофра
 * @returns {boolean} успех операции
 * @throws {Error} если кофр не найден
 */
export function deleteCommonCase(id) {
  const state = getState();
  const idx = state.commonCases.findIndex(c => c.id === id);
  if (idx === -1) {
    throw new Error(`Общий кофр с ID "${id}" не найден`);
  }

  // Удаляем из массива
  state.commonCases.splice(idx, 1);

  // Удаляем ссылки из itemProps
  for (const path of Object.keys(state.itemProps)) {
    const props = state.itemProps[path];
    if (props.commonCases) {
      props.commonCases = props.commonCases.filter(link => link.caseId !== id);
      if (props.commonCases.length === 0) {
        delete props.commonCases;
      }
    }
  }

  // Удаляем ссылки из orderPacking
  for (const path of Object.keys(state.orderPacking)) {
    const packing = state.orderPacking[path];
    state.orderPacking[path] = packing.filter(p => p.caseId !== id);
    if (state.orderPacking[path].length === 0) {
      delete state.orderPacking[path];
    }
  }

  saveState();
  emit(EVENTS.EDITOR_DATA_CHANGED, { action: 'deleteCommonCase', id });
  return true;
}

// ============================================================
// МАССОВЫЕ ОПЕРАЦИИ
// ============================================================

/**
 * Заменяет весь список общих кофров (для импорта).
 * @param {CommonCase[]} cases - массив кофров
 * @returns {boolean} успех операции
 */
export function setCommonCases(cases) {
  const state = getState();
  state.commonCases = deepClone(cases).map(c => ({
    id: c.id || generateId('case'),
    name: c.name || 'Без названия',
    qty: Math.max(1, parseInt(c.qty, 10) || 1),
    dimensions: c.dimensions || '',
    emptyWeight: parseFloat(c.emptyWeight) || 0,
    maxWeight: parseFloat(c.maxWeight) || 0,
    maxVolume: parseFloat(c.maxVolume) || 0,
  }));
  saveState();
  emit(EVENTS.EDITOR_DATA_CHANGED, { action: 'setCommonCases', count: state.commonCases.length });
  return true;
}

/**
 * Очищает все общие кофры.
 * @returns {boolean} успех операции
 */
export function clearCommonCases() {
  const state = getState();
  state.commonCases = [];
  // Удаляем все ссылки в itemProps и orderPacking
  for (const path of Object.keys(state.itemProps)) {
    delete state.itemProps[path].commonCases;
  }
  for (const path of Object.keys(state.orderPacking)) {
    delete state.orderPacking[path];
  }
  saveState();
  emit(EVENTS.EDITOR_DATA_CHANGED, { action: 'clearCommonCases' });
  return true;
}

// ============================================================
// ЭКСПОРТ ПО УМОЛЧАНИЮ
// ============================================================

export default {
  getCommonCases,
  getCommonCaseById,
  commonCaseExists,
  createCommonCase,
  updateCommonCase,
  deleteCommonCase,
  setCommonCases,
  clearCommonCases,
};