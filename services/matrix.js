// services/matrix.js

/**
 * Сервис для управления привязками (линками) между позициями.
 * Используется в матрице привязок.
 * @module services/matrix
 */

import { getState, saveState } from '../core/store.js';
import { emit, EVENTS } from '../core/events.js';
import { deepClone, generateId } from '../core/utils.js';
import { getLinks, setOrderSplits, addLink, removeLink } from './order.js';

// ============================================================
// ТИПЫ ДАННЫХ (JSDoc)
// ============================================================

/**
 * @typedef {Object} Link
 * @property {string} target - путь целевой позиции
 * @property {number} multiplier - множитель (коэффициент)
 */

/**
 * @typedef {Object} MatrixPreset
 * @property {string} name - название пресета
 * @property {Object<string, Link[]>} links - все привязки
 */

// ============================================================
// КЛЮЧИ ДЛЯ ХРАНЕНИЯ ПРЕСЕТОВ
// ============================================================

const MATRIX_PRESETS_KEY = 'matrix_presets';

// ============================================================
// РАБОТА С ПРИВЯЗКАМИ (ЧЕРЕЗ ОБЁРТКИ)
// ============================================================

/**
 * Получает все привязки (линки) из состояния.
 * @returns {Object<string, Link[]>} объект { src: [ { target, multiplier } ] }
 */
export function getMatrixLinks() {
  return getLinks();
}

/**
 * Получает привязки для конкретного источника.
 * @param {string} src - путь источника
 * @returns {Link[]} массив привязок
 */
export function getMatrixLinksForSource(src) {
  return getLinks(src);
}

/**
 * Устанавливает все привязки (полная замена).
 * @param {Object<string, Link[]>} links - новые привязки
 * @returns {boolean} успех операции
 */
export function setMatrixLinks(links) {
  const state = getState();
  state.links = deepClone(links || {});
  saveState();
  emit(EVENTS.ORDER_DATA_CHANGED, { action: 'setMatrixLinks' });
  return true;
}

/**
 * Добавляет или обновляет привязку.
 * @param {string} src - путь источника
 * @param {string} target - путь цели
 * @param {number} multiplier - множитель
 * @returns {boolean} успех операции
 */
export function addMatrixLink(src, target, multiplier) {
  return addLink(src, target, multiplier);
}

/**
 * Удаляет привязку.
 * @param {string} src - путь источника
 * @param {string} target - путь цели
 * @returns {boolean} успех операции
 */
export function removeMatrixLink(src, target) {
  return removeLink(src, target);
}

/**
 * Удаляет все привязки.
 * @returns {boolean} успех операции
 */
export function clearMatrixLinks() {
  const state = getState();
  state.links = {};
  saveState();
  emit(EVENTS.ORDER_DATA_CHANGED, { action: 'clearMatrixLinks' });
  return true;
}

// ============================================================
// РАБОТА С ПРЕСЕТАМИ МАТРИЦЫ
// ============================================================

/**
 * Возвращает все пресеты матрицы.
 * @returns {MatrixPreset[]} массив пресетов
 */
export function getMatrixPresets() {
  try {
    const raw = localStorage.getItem(MATRIX_PRESETS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Сохраняет массив пресетов матрицы.
 * @param {MatrixPreset[]} presets - массив пресетов
 */
function saveMatrixPresets(presets) {
  localStorage.setItem(MATRIX_PRESETS_KEY, JSON.stringify(presets));
}

/**
 * Создаёт новый пресет матрицы на основе текущих привязок.
 * @param {string} name - имя пресета
 * @returns {MatrixPreset} созданный пресет
 * @throws {Error} если имя пустое или пресет уже существует
 */
export function createMatrixPreset(name) {
  if (!name || name.trim() === '') {
    throw new Error('Имя пресета обязательно');
  }
  const presets = getMatrixPresets();
  if (presets.some(p => p.name === name.trim())) {
    throw new Error(`Пресет "${name.trim()}" уже существует`);
  }

  const links = getMatrixLinks();
  const newPreset = {
    name: name.trim(),
    links: deepClone(links),
  };
  presets.push(newPreset);
  saveMatrixPresets(presets);
  emit(EVENTS.PRESETS_CHANGED, { action: 'createMatrixPreset', name: name.trim() });
  return deepClone(newPreset);
}

/**
 * Загружает пресет матрицы (наложение или замена).
 * @param {string} name - имя пресета
 * @param {boolean} overlay - true — наложение (суммирование), false — замена
 * @returns {Object<string, Link[]>} загруженные привязки
 * @throws {Error} если пресет не найден
 */
export function loadMatrixPreset(name, overlay = true) {
  const presets = getMatrixPresets();
  const preset = presets.find(p => p.name === name);
  if (!preset) {
    throw new Error(`Пресет "${name}" не найден`);
  }

  const currentLinks = getMatrixLinks();
  const loadedLinks = deepClone(preset.links);

  if (!overlay) {
    // Замена — полностью заменяем
    setMatrixLinks(loadedLinks);
    return loadedLinks;
  }

  // Наложение — суммируем множители
  const result = deepClone(currentLinks);
  for (const src of Object.keys(loadedLinks)) {
    if (!result[src]) result[src] = [];
    for (const link of loadedLinks[src]) {
      const existing = result[src].find(l => l.target === link.target);
      if (existing) {
        existing.multiplier += link.multiplier;
      } else {
        result[src].push({ target: link.target, multiplier: link.multiplier });
      }
    }
  }
  setMatrixLinks(result);
  return result;
}

/**
 * Удаляет пресет матрицы.
 * @param {string} name - имя пресета
 * @returns {boolean} успех операции
 * @throws {Error} если пресет не найден
 */
export function deleteMatrixPreset(name) {
  const presets = getMatrixPresets();
  const idx = presets.findIndex(p => p.name === name);
  if (idx === -1) {
    throw new Error(`Пресет "${name}" не найден`);
  }
  presets.splice(idx, 1);
  saveMatrixPresets(presets);
  emit(EVENTS.PRESETS_CHANGED, { action: 'deleteMatrixPreset', name });
  return true;
}

/**
 * Переименовывает пресет матрицы.
 * @param {string} oldName - старое имя
 * @param {string} newName - новое имя
 * @returns {boolean} успех операции
 * @throws {Error} если пресет не найден или новое имя занято
 */
export function renameMatrixPreset(oldName, newName) {
  if (oldName === newName) return true;
  const presets = getMatrixPresets();
  const idx = presets.findIndex(p => p.name === oldName);
  if (idx === -1) {
    throw new Error(`Пресет "${oldName}" не найден`);
  }
  if (presets.some(p => p.name === newName)) {
    throw new Error(`Пресет "${newName}" уже существует`);
  }
  presets[idx].name = newName;
  saveMatrixPresets(presets);
  emit(EVENTS.PRESETS_CHANGED, { action: 'renameMatrixPreset', oldName, newName });
  return true;
}

/**
 * Экспортирует все пресеты в JSON.
 * @returns {string} JSON-строка
 */
export function exportMatrixPresets() {
  const presets = getMatrixPresets();
  return JSON.stringify(presets, null, 2);
}

/**
 * Импортирует пресеты из JSON (мердж с существующими).
 * @param {string} json - JSON-строка
 * @returns {number} количество импортированных пресетов
 * @throws {Error} если формат неверный
 */
export function importMatrixPresets(json) {
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('Неверный формат JSON');
  }
  if (!Array.isArray(data)) {
    throw new Error('Ожидается массив пресетов');
  }

  const existing = getMatrixPresets();
  let count = 0;
  for (const preset of data) {
    if (!preset.name || typeof preset.name !== 'string') {
      throw new Error('У пресета отсутствует имя');
    }
    if (!preset.links || typeof preset.links !== 'object') {
      throw new Error(`У пресета "${preset.name}" отсутствуют привязки`);
    }
    const idx = existing.findIndex(p => p.name === preset.name);
    if (idx !== -1) {
      existing[idx] = preset;
    } else {
      existing.push(preset);
    }
    count++;
  }
  saveMatrixPresets(existing);
  emit(EVENTS.PRESETS_CHANGED, { action: 'importMatrixPresets', count });
  return count;
}

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ MATRIX UI
// ============================================================

/**
 * Получает все позиции, которые имеют привязки (источники).
 * @returns {string[]} массив путей-источников
 */
export function getLinkedSources() {
  const links = getMatrixLinks();
  return Object.keys(links);
}

/**
 * Получает все позиции, которые являются целями хотя бы одной привязки.
 * @returns {string[]} массив путей-целей
 */
export function getLinkedTargets() {
  const links = getMatrixLinks();
  const targets = new Set();
  for (const src of Object.keys(links)) {
    for (const link of links[src]) {
      targets.add(link.target);
    }
  }
  return Array.from(targets);
}

/**
 * Проверяет, есть ли привязка между источниками и целями.
 * @param {string} src - путь источника
 * @param {string} target - путь цели
 * @returns {number} множитель (0, если нет привязки)
 */
export function getMatrixCellValue(src, target) {
  const links = getMatrixLinks();
  const srcLinks = links[src] || [];
  const found = srcLinks.find(l => l.target === target);
  return found ? found.multiplier : 0;
}

// ============================================================
// ЭКСПОРТ ПО УМОЛЧАНИЮ
// ============================================================

export default {
  getMatrixLinks,
  getMatrixLinksForSource,
  setMatrixLinks,
  addMatrixLink,
  removeMatrixLink,
  clearMatrixLinks,
  getMatrixPresets,
  createMatrixPreset,
  loadMatrixPreset,
  deleteMatrixPreset,
  renameMatrixPreset,
  exportMatrixPresets,
  importMatrixPresets,
  getLinkedSources,
  getLinkedTargets,
  getMatrixCellValue,
};