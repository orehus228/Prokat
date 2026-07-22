// services/presets.js

/**
 * Сервис для управления пресетами заказов.
 * Позволяет сохранять и загружать полные состояния заказа.
 * @module services/presets
 */

import { getState, saveState } from '../core/store.js';
import { emit, EVENTS } from '../core/events.js';
import { deepClone, generateId } from '../core/utils.js';

// ============================================================
// ТИПЫ ДАННЫХ (JSDoc)
// ============================================================

/**
 * @typedef {Object} OrderPreset
 * @property {string} name - название пресета
 * @property {Object} data - снапшот данных заказа
 * @property {Object} data.order - позиции заказа { path: quantity }
 * @property {Object} data.splits - разбивки по маршрутам
 * @property {Object} data.links - привязки (линки)
 * @property {Object} data.notes - заметки
 * @property {Object} data.packing - упаковка общими кофрами
 * @property {Object} data.individualCases - значения индивидуальных кофров
 * @property {Object} data.routes - маршруты общих кофров
 * @property {Object} data.caseModes - режимы кофров
 * @property {Object} data.exclude - исключения из загрузки
 * @property {Object} data.extra - количество вне кофров
 */

// ============================================================
// КЛЮЧ ДЛЯ ХРАНЕНИЯ ПРЕСЕТОВ
// ============================================================

const ORDER_PRESETS_KEY = 'order_presets';

// ============================================================
// ПОЛУЧЕНИЕ ПРЕСЕТОВ
// ============================================================

/**
 * Возвращает все пресеты заказов.
 * @returns {OrderPreset[]} массив пресетов
 */
export function getOrderPresets() {
  try {
    const raw = localStorage.getItem(ORDER_PRESETS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Сохраняет массив пресетов заказов.
 * @param {OrderPreset[]} presets - массив пресетов
 */
function saveOrderPresets(presets) {
  localStorage.setItem(ORDER_PRESETS_KEY, JSON.stringify(presets));
}

/**
 * Возвращает пресет по имени.
 * @param {string} name - имя пресета
 * @returns {OrderPreset|null} пресет или null
 */
export function getOrderPreset(name) {
  const presets = getOrderPresets();
  return presets.find(p => p.name === name) || null;
}

/**
 * Проверяет, существует ли пресет с таким именем.
 * @param {string} name - имя пресета
 * @returns {boolean}
 */
export function orderPresetExists(name) {
  return getOrderPresets().some(p => p.name === name);
}

// ============================================================
// CRUD ОПЕРАЦИИ
// ============================================================

/**
 * Создаёт новый пресет заказа на основе текущего состояния заказа.
 * @param {string} name - имя пресета
 * @returns {OrderPreset} созданный пресет
 * @throws {Error} если имя пустое или пресет уже существует
 */
export function createOrderPreset(name) {
  if (!name || name.trim() === '') {
    throw new Error('Имя пресета обязательно');
  }
  const presets = getOrderPresets();
  if (presets.some(p => p.name === name.trim())) {
    throw new Error(`Пресет "${name.trim()}" уже существует`);
  }

  const state = getState();
  const snapshot = {
    order: deepClone(state.order || {}),
    splits: deepClone(state.orderSplits || {}),
    links: deepClone(state.links || {}),
    notes: deepClone(state.notes || {}),
    packing: deepClone(state.orderPacking || {}),
    individualCases: deepClone(state.individualCaseValues || {}),
    routes: deepClone(state.commonRoutes || {}),
    caseModes: deepClone(state.caseModes || {}),
    exclude: deepClone(state.orderExclude || {}),
    extra: deepClone(state.orderExtra || {}),
  };

  const newPreset = {
    name: name.trim(),
    data: snapshot,
  };

  presets.push(newPreset);
  saveOrderPresets(presets);
  emit(EVENTS.PRESETS_CHANGED, { action: 'createOrderPreset', name: name.trim() });
  return deepClone(newPreset);
}

/**
 * Загружает пресет заказа (наложение или замена).
 * @param {string} name - имя пресета
 * @param {boolean} overlay - true — наложение (суммирование), false — замена
 * @returns {Object} загруженные данные пресета
 * @throws {Error} если пресет не найден
 */
export function loadOrderPreset(name, overlay = true) {
  const presets = getOrderPresets();
  const preset = presets.find(p => p.name === name);
  if (!preset) {
    throw new Error(`Пресет "${name}" не найден`);
  }

  const state = getState();
  const data = deepClone(preset.data);

  if (!overlay) {
    // Замена — полностью заменяем все поля
    state.order = data.order || {};
    state.orderSplits = data.splits || {};
    state.links = data.links || {};
    state.notes = data.notes || {};
    state.orderPacking = data.packing || {};
    state.individualCaseValues = data.individualCases || {};
    state.commonRoutes = data.routes || {};
    state.caseModes = data.caseModes || {};
    state.orderExclude = data.exclude || {};
    state.orderExtra = data.extra || {};
  } else {
    // Наложение — суммируем количества
    // order
    for (const path of Object.keys(data.order)) {
      state.order[path] = (state.order[path] || 0) + data.order[path];
    }
    // extra
    for (const path of Object.keys(data.extra)) {
      state.orderExtra[path] = (state.orderExtra[path] || 0) + data.extra[path];
    }
    // packing (суммируем pieces по caseId)
    for (const path of Object.keys(data.packing)) {
      if (!state.orderPacking[path]) state.orderPacking[path] = [];
      for (const pack of data.packing[path]) {
        const existing = state.orderPacking[path].find(p => p.caseId === pack.caseId);
        if (existing) {
          existing.pieces = (existing.pieces || 0) + (pack.pieces || 0);
        } else {
          state.orderPacking[path].push({ caseId: pack.caseId, pieces: pack.pieces || 0 });
        }
      }
    }
    // individualCases
    for (const path of Object.keys(data.individualCases)) {
      if (!state.individualCaseValues[path]) state.individualCaseValues[path] = [];
      for (let i = 0; i < data.individualCases[path].length; i++) {
        const val = data.individualCases[path][i] || 0;
        if (state.individualCaseValues[path][i] !== undefined) {
          state.individualCaseValues[path][i] += val;
        } else {
          state.individualCaseValues[path][i] = val;
        }
      }
    }
    // splits
    for (const path of Object.keys(data.splits)) {
      if (!state.orderSplits[path]) state.orderSplits[path] = [];
      for (const seg of data.splits[path]) {
        const existing = state.orderSplits[path].find(s => s.target === seg.target);
        if (existing) {
          existing.qty = (existing.qty || 0) + (seg.qty || 0);
        } else {
          state.orderSplits[path].push({ target: seg.target, qty: seg.qty || 0 });
        }
      }
    }
    // links
    for (const src of Object.keys(data.links)) {
      if (!state.links[src]) state.links[src] = [];
      for (const link of data.links[src]) {
        const existing = state.links[src].find(l => l.target === link.target);
        if (existing) {
          existing.multiplier = (existing.multiplier || 0) + (link.multiplier || 0);
        } else {
          state.links[src].push({ target: link.target, multiplier: link.multiplier || 0 });
        }
      }
    }
    // routes
    for (const path of Object.keys(data.routes)) {
      if (!state.commonRoutes[path]) state.commonRoutes[path] = [];
      for (const route of data.routes[path]) {
        const existing = state.commonRoutes[path].find(r => r.target === route.target);
        if (existing) {
          existing.multiplier = (existing.multiplier || 0) + (route.multiplier || 0);
        } else {
          state.commonRoutes[path].push({ target: route.target, multiplier: route.multiplier || 0 });
        }
      }
    }
    // notes — заменяем (не суммируем)
    for (const path of Object.keys(data.notes)) {
      state.notes[path] = data.notes[path];
    }
    // exclude — объединяем (true)
    for (const path of Object.keys(data.exclude)) {
      state.orderExclude[path] = true;
    }
    // caseModes — мерджим (заменяем, если есть)
    for (const path of Object.keys(data.caseModes)) {
      state.caseModes[path] = { ...state.caseModes[path], ...data.caseModes[path] };
    }
  }

  saveState();
  emit(EVENTS.ORDER_DATA_CHANGED, { action: 'loadOrderPreset', name, overlay });
  emit(EVENTS.PRESETS_CHANGED, { action: 'loadOrderPreset', name });
  return deepClone(data);
}

/**
 * Удаляет пресет заказа.
 * @param {string} name - имя пресета
 * @returns {boolean} успех операции
 * @throws {Error} если пресет не найден
 */
export function deleteOrderPreset(name) {
  const presets = getOrderPresets();
  const idx = presets.findIndex(p => p.name === name);
  if (idx === -1) {
    throw new Error(`Пресет "${name}" не найден`);
  }
  presets.splice(idx, 1);
  saveOrderPresets(presets);
  emit(EVENTS.PRESETS_CHANGED, { action: 'deleteOrderPreset', name });
  return true;
}

/**
 * Переименовывает пресет заказа.
 * @param {string} oldName - старое имя
 * @param {string} newName - новое имя
 * @returns {boolean} успех операции
 * @throws {Error} если пресет не найден или новое имя занято
 */
export function renameOrderPreset(oldName, newName) {
  if (oldName === newName) return true;
  const presets = getOrderPresets();
  const idx = presets.findIndex(p => p.name === oldName);
  if (idx === -1) {
    throw new Error(`Пресет "${oldName}" не найден`);
  }
  if (presets.some(p => p.name === newName)) {
    throw new Error(`Пресет "${newName}" уже существует`);
  }
  presets[idx].name = newName;
  saveOrderPresets(presets);
  emit(EVENTS.PRESETS_CHANGED, { action: 'renameOrderPreset', oldName, newName });
  return true;
}

// ============================================================
// ЭКСПОРТ / ИМПОРТ
// ============================================================

/**
 * Экспортирует все пресеты заказов в JSON.
 * @returns {string} JSON-строка
 */
export function exportOrderPresets() {
  const presets = getOrderPresets();
  return JSON.stringify(presets, null, 2);
}

/**
 * Импортирует пресеты из JSON (мердж с существующими).
 * @param {string} json - JSON-строка
 * @returns {number} количество импортированных пресетов
 * @throws {Error} если формат неверный
 */
export function importOrderPresets(json) {
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('Неверный формат JSON');
  }
  if (!Array.isArray(data)) {
    throw new Error('Ожидается массив пресетов');
  }

  const existing = getOrderPresets();
  let count = 0;
  for (const preset of data) {
    if (!preset.name || typeof preset.name !== 'string') {
      throw new Error('У пресета отсутствует имя');
    }
    if (!preset.data || typeof preset.data !== 'object') {
      throw new Error(`У пресета "${preset.name}" отсутствуют данные`);
    }
    const idx = existing.findIndex(p => p.name === preset.name);
    if (idx !== -1) {
      existing[idx] = preset;
    } else {
      existing.push(preset);
    }
    count++;
  }
  saveOrderPresets(existing);
  emit(EVENTS.PRESETS_CHANGED, { action: 'importOrderPresets', count });
  return count;
}

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================

/**
 * Возвращает список имён всех пресетов.
 * @returns {string[]} массив имён
 */
export function getOrderPresetNames() {
  return getOrderPresets().map(p => p.name);
}

/**
 * Проверяет, пуст ли текущий заказ (нет позиций).
 * @returns {boolean} true, если заказ пуст
 */
export function isOrderEmpty() {
  const state = getState();
  const hasOrder = Object.keys(state.order || {}).some(k => state.order[k] > 0);
  const hasSplits = Object.keys(state.orderSplits || {}).some(
    k => (state.orderSplits[k] || []).some(s => s.qty > 0)
  );
  const hasExtra = Object.keys(state.orderExtra || {}).some(k => state.orderExtra[k] > 0);
  const hasPacking = Object.keys(state.orderPacking || {}).some(
    k => (state.orderPacking[k] || []).some(p => p.pieces > 0)
  );
  const hasIndividual = Object.keys(state.individualCaseValues || {}).some(
    k => (state.individualCaseValues[k] || []).some(v => v > 0)
  );
  return !(hasOrder || hasSplits || hasExtra || hasPacking || hasIndividual);
}

// ============================================================
// ЭКСПОРТ ПО УМОЛЧАНИЮ
// ============================================================

export default {
  getOrderPresets,
  getOrderPreset,
  orderPresetExists,
  createOrderPreset,
  loadOrderPreset,
  deleteOrderPreset,
  renameOrderPreset,
  exportOrderPresets,
  importOrderPresets,
  getOrderPresetNames,
  isOrderEmpty,
};