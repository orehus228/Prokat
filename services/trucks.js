// services/trucks.js

/**
 * Сервис для работы с грузовиками (пресеты транспортных средств).
 * @module services/trucks
 */

import { getState, saveState } from '../core/store.js';
import { emit, EVENTS } from '../core/events.js';
import { generateId, deepClone } from '../core/utils.js';
import { DEFAULT_TRUCK_PRESETS } from '../core/config.js';

// ============================================================
// ОПРЕДЕЛЕНИЕ ТИПОВ (JSDoc)
// ============================================================

/**
 * @typedef {Object} TruckPreset
 * @property {string} id - уникальный ID
 * @property {string} name - название грузовика
 * @property {number} length - длина в см
 * @property {number} width - ширина в см
 * @property {number} height - высота в см
 * @property {number} maxWeight - максимальный вес в кг
 */

// ============================================================
// ПОЛУЧЕНИЕ ДАННЫХ
// ============================================================

/**
 * Возвращает массив всех пресетов грузовиков.
 * @returns {TruckPreset[]} массив грузовиков (копия)
 */
export function getTruckPresets() {
  const state = getState();
  return deepClone(state.truckPresets || []);
}

/**
 * Возвращает грузовик по ID.
 * @param {string} id - ID грузовика
 * @returns {TruckPreset|null} грузовик или null
 */
export function getTruckPresetById(id) {
  const state = getState();
  const found = state.truckPresets.find(t => t.id === id);
  return found ? deepClone(found) : null;
}

/**
 * Проверяет, существует ли грузовик с таким ID.
 * @param {string} id - ID грузовика
 * @returns {boolean}
 */
export function truckExists(id) {
  const state = getState();
  return state.truckPresets.some(t => t.id === id);
}

// ============================================================
// CRUD ОПЕРАЦИИ
// ============================================================

/**
 * Создаёт новый пресет грузовика.
 * @param {Omit<TruckPreset, 'id'>} truckData - данные грузовика (без id)
 * @returns {TruckPreset} созданный грузовик
 * @throws {Error} если обязательные поля отсутствуют или некорректны
 */
export function createTruckPreset(truckData) {
  const state = getState();

  // Валидация
  if (!truckData.name || truckData.name.trim() === '') {
    throw new Error('Название грузовика обязательно');
  }
  const length = parseFloat(truckData.length);
  const width = parseFloat(truckData.width);
  const height = parseFloat(truckData.height);
  if (isNaN(length) || length <= 0) {
    throw new Error('Длина должна быть положительным числом');
  }
  if (isNaN(width) || width <= 0) {
    throw new Error('Ширина должна быть положительным числом');
  }
  if (isNaN(height) || height <= 0) {
    throw new Error('Высота должна быть положительным числом');
  }

  const newTruck = {
    id: generateId('truck'),
    name: truckData.name.trim(),
    length,
    width,
    height,
    maxWeight: parseFloat(truckData.maxWeight) || 0,
  };

  if (!state.truckPresets) {
    state.truckPresets = [...DEFAULT_TRUCK_PRESETS];
  }
  state.truckPresets.push(newTruck);

  saveState();
  emit(EVENTS.EDITOR_DATA_CHANGED, { action: 'createTruck', truck: newTruck });
  return deepClone(newTruck);
}

/**
 * Обновляет существующий пресет грузовика.
 * @param {string} id - ID грузовика
 * @param {Partial<TruckPreset>} newData - новые данные (частичные)
 * @returns {TruckPreset} обновлённый грузовик
 * @throws {Error} если грузовик не найден или данные некорректны
 */
export function updateTruckPreset(id, newData) {
  const state = getState();
  const idx = state.truckPresets.findIndex(t => t.id === id);
  if (idx === -1) {
    throw new Error(`Грузовик с ID "${id}" не найден`);
  }

  const current = state.truckPresets[idx];
  const updated = { ...current };

  if (newData.name !== undefined) {
    if (!newData.name || newData.name.trim() === '') {
      throw new Error('Название грузовика обязательно');
    }
    updated.name = newData.name.trim();
  }
  if (newData.length !== undefined) {
    const val = parseFloat(newData.length);
    if (isNaN(val) || val <= 0) {
      throw new Error('Длина должна быть положительным числом');
    }
    updated.length = val;
  }
  if (newData.width !== undefined) {
    const val = parseFloat(newData.width);
    if (isNaN(val) || val <= 0) {
      throw new Error('Ширина должна быть положительным числом');
    }
    updated.width = val;
  }
  if (newData.height !== undefined) {
    const val = parseFloat(newData.height);
    if (isNaN(val) || val <= 0) {
      throw new Error('Высота должна быть положительным числом');
    }
    updated.height = val;
  }
  if (newData.maxWeight !== undefined) {
    updated.maxWeight = parseFloat(newData.maxWeight) || 0;
  }

  state.truckPresets[idx] = updated;
  saveState();
  emit(EVENTS.EDITOR_DATA_CHANGED, { action: 'updateTruck', id, truck: updated });
  return deepClone(updated);
}

/**
 * Удаляет пресет грузовика.
 * @param {string} id - ID грузовика
 * @returns {boolean} успех операции
 * @throws {Error} если грузовик не найден
 */
export function deleteTruckPreset(id) {
  const state = getState();
  const idx = state.truckPresets.findIndex(t => t.id === id);
  if (idx === -1) {
    throw new Error(`Грузовик с ID "${id}" не найден`);
  }

  state.truckPresets.splice(idx, 1);
  saveState();
  emit(EVENTS.EDITOR_DATA_CHANGED, { action: 'deleteTruck', id });
  return true;
}

// ============================================================
// ВЫБРАННЫЕ ГРУЗОВИКИ ДЛЯ ЗАГРУЗКИ
// ============================================================

/**
 * Получает ID выбранных грузовиков для расчёта загрузки.
 * @returns {string[]} массив ID
 */
export function getSelectedTruckIds() {
  const state = getState();
  return deepClone(state.selectedTruckIds || []);
}

/**
 * Сохраняет выбранные ID грузовиков.
 * @param {string[]} ids - массив ID
 * @returns {boolean} успех операции
 */
export function setSelectedTruckIds(ids) {
  const state = getState();
  state.selectedTruckIds = Array.isArray(ids) ? [...ids] : [];
  saveState();
  emit(EVENTS.TRUCKS_SELECTED, { ids: state.selectedTruckIds });
  return true;
}

/**
 * Добавляет грузовик в выбранные.
 * @param {string} id - ID грузовика
 * @returns {boolean} успех операции
 */
export function addSelectedTruck(id) {
  const state = getState();
  if (!state.selectedTruckIds) state.selectedTruckIds = [];
  if (!state.selectedTruckIds.includes(id)) {
    state.selectedTruckIds.push(id);
    saveState();
    emit(EVENTS.TRUCKS_SELECTED, { ids: state.selectedTruckIds });
  }
  return true;
}

/**
 * Удаляет грузовик из выбранных.
 * @param {string} id - ID грузовика
 * @returns {boolean} успех операции
 */
export function removeSelectedTruck(id) {
  const state = getState();
  if (!state.selectedTruckIds) return false;
  const idx = state.selectedTruckIds.indexOf(id);
  if (idx === -1) return false;
  state.selectedTruckIds.splice(idx, 1);
  saveState();
  emit(EVENTS.TRUCKS_SELECTED, { ids: state.selectedTruckIds });
  return true;
}

/**
 * Очищает список выбранных грузовиков.
 * @returns {boolean} успех операции
 */
export function clearSelectedTrucks() {
  const state = getState();
  state.selectedTruckIds = [];
  saveState();
  emit(EVENTS.TRUCKS_SELECTED, { ids: [] });
  return true;
}

// ============================================================
// МАССОВЫЕ ОПЕРАЦИИ
// ============================================================

/**
 * Заменяет все пресеты грузовиков (для импорта).
 * @param {TruckPreset[]} trucks - массив грузовиков
 * @returns {boolean} успех операции
 */
export function setTruckPresets(trucks) {
  const state = getState();
  state.truckPresets = deepClone(trucks).map(t => ({
    id: t.id || generateId('truck'),
    name: t.name || 'Без названия',
    length: parseFloat(t.length) || 0,
    width: parseFloat(t.width) || 0,
    height: parseFloat(t.height) || 0,
    maxWeight: parseFloat(t.maxWeight) || 0,
  }));
  saveState();
  emit(EVENTS.EDITOR_DATA_CHANGED, { action: 'setTruckPresets', count: state.truckPresets.length });
  return true;
}

/**
 * Восстанавливает дефолтные пресеты грузовиков.
 * @returns {boolean} успех операции
 */
export function resetTruckPresets() {
  const state = getState();
  state.truckPresets = deepClone(DEFAULT_TRUCK_PRESETS);
  saveState();
  emit(EVENTS.EDITOR_DATA_CHANGED, { action: 'resetTruckPresets' });
  return true;
}

// ============================================================
// ЭКСПОРТ ПО УМОЛЧАНИЮ
// ============================================================

export default {
  getTruckPresets,
  getTruckPresetById,
  truckExists,
  createTruckPreset,
  updateTruckPreset,
  deleteTruckPreset,
  getSelectedTruckIds,
  setSelectedTruckIds,
  addSelectedTruck,
  removeSelectedTruck,
  clearSelectedTrucks,
  setTruckPresets,
  resetTruckPresets,
};