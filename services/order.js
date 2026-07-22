// services/order.js

/**
 * Сервис для управления заказами.
 * Отвечает за позиции заказа, упаковку, привязки, заметки и режимы кофров.
 * @module services/order
 */

import { getState, saveState } from '../core/store.js';
import { emit, EVENTS } from '../core/events.js';
import { deepClone, splitPath, joinPath, getCategory } from '../core/utils.js';
import { CASE_MODES_DEFAULTS } from '../core/config.js';
import { getItemPropsByPath } from './itemProps.js';

// ============================================================
// ОПРЕДЕЛЕНИЕ ТИПОВ (JSDoc)
// ============================================================

/**
 * @typedef {Object} CaseMode
 * @property {boolean} enabled - включён ли режим кофров
 * @property {Object|null} alt - альтернативный кофр { qty, weight, dims }
 * @property {number} selectedOption - индекс выбранного варианта (для одиночного режима)
 * @property {boolean} accumulate - накапливать ли остатки в кофрах
 * @property {boolean[]} multiSelected - массив флагов для мультирежима
 * @property {string[]} commonSelected - ID выбранных общих кофров
 * @property {boolean} useAlt - использовать ли альтернативный кофр
 * @property {string} criteria - критерий расчёта ('weight' | 'volume')
 */

/**
 * @typedef {Object} PackingItem
 * @property {string} caseId - ID общего кофра
 * @property {number} pieces - количество единиц позиции в кофре
 */

/**
 * @typedef {Object} LinkItem
 * @property {string} target - путь целевой позиции
 * @property {number} multiplier - множитель
 */

// ============================================================
// ГЕТТЕРЫ ОСНОВНЫХ ДАННЫХ
// ============================================================

/**
 * Возвращает основные позиции заказа.
 * @returns {Object<string, number>} объект { path: quantity }
 */
export function getOrder() {
  return deepClone(getState().order || {});
}

/**
 * Возвращает разбивки по маршрутам.
 * @param {string} [path] - опциональный путь позиции
 * @returns {Object|Array} если path указан — массив разбивок для позиции, иначе весь объект
 */
export function getOrderSplits(path) {
  const state = getState();
  if (path) {
    return deepClone(state.orderSplits[path] || []);
  }
  return deepClone(state.orderSplits || {});
}

/**
 * Возвращает все привязки (линки).
 * @param {string} [src] - опциональный путь источника
 * @returns {Object|Array} если src указан — массив привязок для источника, иначе весь объект
 */
export function getLinks(src) {
  const state = getState();
  if (src) {
    return deepClone(state.links[src] || []);
  }
  return deepClone(state.links || {});
}

/**
 * Возвращает заметки.
 * @param {string} [path] - опциональный путь позиции
 * @returns {Object|string} если path указан — заметка для позиции, иначе весь объект
 */
export function getNotes(path) {
  const state = getState();
  if (path) {
    return state.notes[path] || '';
  }
  return deepClone(state.notes || {});
}

/**
 * Возвращает упаковку общими кофрами.
 * @param {string} [path] - опциональный путь позиции
 * @returns {Object|PackingItem[]} если path указан — массив упаковки для позиции, иначе весь объект
 */
export function getOrderPacking(path) {
  const state = getState();
  if (path) {
    return deepClone(state.orderPacking[path] || []);
  }
  return deepClone(state.orderPacking || {});
}

/**
 * Возвращает значения для индивидуальных кофров.
 * @param {string} [path] - опциональный путь позиции
 * @returns {Object|number[]} если path указан — массив значений, иначе весь объект
 */
export function getIndividualCaseValues(path) {
  const state = getState();
  if (path) {
    return deepClone(state.individualCaseValues[path] || []);
  }
  return deepClone(state.individualCaseValues || {});
}

/**
 * Возвращает маршруты общих кофров.
 * @param {string} [path] - опциональный путь позиции
 * @returns {Object|Array} если path указан — массив маршрутов для позиции, иначе весь объект
 */
export function getCommonRoutes(path) {
  const state = getState();
  if (path) {
    return deepClone(state.commonRoutes[path] || []);
  }
  return deepClone(state.commonRoutes || {});
}

/**
 * Возвращает режимы кофров.
 * @param {string} [path] - опциональный путь позиции
 * @returns {Object|CaseMode} если path указан — режим для позиции, иначе весь объект
 */
export function getCaseModes(path) {
  const state = getState();
  if (path) {
    return deepClone(state.caseModes[path] || { ...CASE_MODES_DEFAULTS });
  }
  return deepClone(state.caseModes || {});
}

/**
 * Возвращает исключения из загрузки.
 * @param {string} [path] - опциональный путь позиции
 * @returns {Object|boolean} если path указан — true/false, иначе весь объект
 */
export function getOrderExclude(path) {
  const state = getState();
  if (path) {
    return !!state.orderExclude[path];
  }
  return deepClone(state.orderExclude || {});
}

/**
 * Возвращает количество вне кофров.
 * @param {string} [path] - опциональный путь позиции
 * @returns {Object|number} если path указан — количество, иначе весь объект
 */
export function getOrderExtra(path) {
  const state = getState();
  if (path) {
    return state.orderExtra[path] || 0;
  }
  return deepClone(state.orderExtra || {});
}

/**
 * Возвращает привязку заказа к проекту.
 * @returns {Object} { id, name, start_date, end_date, status }
 */
export function getOrderProject() {
  return deepClone(getState().orderProject || {});
}

// ============================================================
// СЕТТЕРЫ
// ============================================================

/**
 * Устанавливает количество позиции в основном заказе.
 * @param {string} path - путь позиции
 * @param {number} value - количество (неотрицательное целое)
 * @returns {boolean} успех операции
 */
export function setOrderValue(path, value) {
  const state = getState();
  const num = Math.max(0, parseInt(value, 10) || 0);
  if (num > 0) {
    state.order[path] = num;
  } else {
    delete state.order[path];
  }
  saveState();
  emit(EVENTS.ORDER_DATA_CHANGED, { action: 'setOrderValue', path, value: num });
  return true;
}

/**
 * Устанавливает разбивку по маршрутам для позиции.
 * @param {string} path - путь позиции
 * @param {Array<{target: string, qty: number}>} splits - массив разбивок
 * @returns {boolean} успех операции
 */
export function setOrderSplits(path, splits) {
  const state = getState();
  if (splits && splits.length > 0) {
    state.orderSplits[path] = splits.filter(s => s.qty > 0);
  } else {
    delete state.orderSplits[path];
  }
  saveState();
  emit(EVENTS.ORDER_DATA_CHANGED, { action: 'setOrderSplits', path });
  return true;
}

/**
 * Устанавливает упаковку общими кофрами для позиции.
 * @param {string} path - путь позиции
 * @param {PackingItem[]} packing - массив упаковки
 * @returns {boolean} успех операции
 */
export function setOrderPacking(path, packing) {
  const state = getState();
  const filtered = (packing || []).filter(p => p.pieces > 0);
  if (filtered.length > 0) {
    state.orderPacking[path] = filtered;
  } else {
    delete state.orderPacking[path];
  }
  saveState();
  emit(EVENTS.ORDER_DATA_CHANGED, { action: 'setOrderPacking', path });
  return true;
}

/**
 * Устанавливает значения индивидуальных кофров для позиции.
 * @param {string} path - путь позиции
 * @param {number[]} vals - массив значений
 * @returns {boolean} успех операции
 */
export function setIndividualCaseValues(path, vals) {
  const state = getState();
  const filtered = (vals || []).filter(v => v > 0);
  if (filtered.length > 0) {
    state.individualCaseValues[path] = filtered;
  } else {
    delete state.individualCaseValues[path];
  }
  saveState();
  emit(EVENTS.ORDER_DATA_CHANGED, { action: 'setIndividualCaseValues', path });
  return true;
}

/**
 * Устанавливает маршруты общих кофров для позиции.
 * @param {string} path - путь позиции
 * @param {Array} routes - массив маршрутов
 * @returns {boolean} успех операции
 */
export function setCommonRoutes(path, routes) {
  const state = getState();
  if (routes && routes.length > 0) {
    state.commonRoutes[path] = routes;
  } else {
    delete state.commonRoutes[path];
  }
  saveState();
  emit(EVENTS.ORDER_DATA_CHANGED, { action: 'setCommonRoutes', path });
  return true;
}

/**
 * Устанавливает режим кофров для позиции.
 * @param {string} path - путь позиции
 * @param {Partial<CaseMode>} mode - новые настройки режима
 * @returns {boolean} успех операции
 */
export function setCaseMode(path, mode) {
  const state = getState();
  const current = state.caseModes[path] || { ...CASE_MODES_DEFAULTS };
  state.caseModes[path] = { ...current, ...mode };
  saveState();
  emit(EVENTS.ORDER_DATA_CHANGED, { action: 'setCaseMode', path });
  return true;
}

/**
 * Устанавливает исключение из загрузки.
 * @param {string} path - путь позиции
 * @param {boolean} exclude - исключить ли из загрузки
 * @returns {boolean} успех операции
 */
export function setOrderExclude(path, exclude) {
  const state = getState();
  if (exclude) {
    state.orderExclude[path] = true;
  } else {
    delete state.orderExclude[path];
  }
  saveState();
  emit(EVENTS.ORDER_DATA_CHANGED, { action: 'setOrderExclude', path, exclude });
  return true;
}

/**
 * Устанавливает количество вне кофров.
 * @param {string} path - путь позиции
 * @param {number} value - количество (неотрицательное целое)
 * @returns {boolean} успех операции
 */
export function setOrderExtra(path, value) {
  const state = getState();
  const num = Math.max(0, parseInt(value, 10) || 0);
  if (num > 0) {
    state.orderExtra[path] = num;
  } else {
    delete state.orderExtra[path];
  }
  saveState();
  emit(EVENTS.ORDER_DATA_CHANGED, { action: 'setOrderExtra', path, value: num });
  return true;
}

/**
 * Устанавливает привязку заказа к проекту.
 * @param {Object} projectData - данные проекта { id, name, start_date, end_date, status }
 * @returns {boolean} успех операции
 */
export function setOrderProject(projectData) {
  const state = getState();
  state.orderProject = {
    id: projectData.id || null,
    name: projectData.name || '',
    start_date: projectData.start_date || '',
    end_date: projectData.end_date || '',
    status: projectData.status || 'planned',
  };
  saveState();
  emit(EVENTS.ORDER_DATA_CHANGED, { action: 'setOrderProject' });
  return true;
}

// ============================================================
// РАБОТА С ПРИВЯЗКАМИ (ЛИНКАМИ)
// ============================================================

/**
 * Добавляет или обновляет привязку.
 * @param {string} src - путь источника
 * @param {string} target - путь цели
 * @param {number} multiplier - множитель
 * @returns {boolean} успех операции
 */
export function addLink(src, target, multiplier) {
  const state = getState();
  if (!state.links[src]) state.links[src] = [];
  const existing = state.links[src].find(l => l.target === target);
  const num = parseFloat(multiplier) || 0;
  if (num <= 0) {
    // Удаляем, если множитель <= 0
    return removeLink(src, target);
  }
  if (existing) {
    existing.multiplier = num;
  } else {
    state.links[src].push({ target, multiplier: num });
  }
  saveState();
  emit(EVENTS.ORDER_DATA_CHANGED, { action: 'addLink', src, target, multiplier: num });
  return true;
}

/**
 * Удаляет привязку.
 * @param {string} src - путь источника
 * @param {string} target - путь цели
 * @returns {boolean} успех операции
 */
export function removeLink(src, target) {
  const state = getState();
  if (!state.links[src]) return false;
  state.links[src] = state.links[src].filter(l => l.target !== target);
  if (state.links[src].length === 0) {
    delete state.links[src];
  }
  saveState();
  emit(EVENTS.ORDER_DATA_CHANGED, { action: 'removeLink', src, target });
  return true;
}

/**
 * Получает все привязки для источника.
 * @param {string} src - путь источника
 * @returns {LinkItem[]} массив привязок
 */
export function getLinksForSource(src) {
  return getLinks(src);
}

/**
 * Получает все привязки для цели (обратные).
 * @param {string} target - путь цели
 * @returns {Array<{source: string, links: LinkItem[]}>}
 */
export function getLinksForTarget(target) {
  const state = getState();
  const result = [];
  for (const src of Object.keys(state.links || {})) {
    const links = state.links[src].filter(l => l.target === target);
    if (links.length > 0) {
      result.push({ source: src, links: deepClone(links) });
    }
  }
  return result;
}

// ============================================================
// РАБОТА С ЗАМЕТКАМИ
// ============================================================

/**
 * Устанавливает заметку для позиции.
 * @param {string} path - путь позиции
 * @param {string} note - текст заметки
 * @returns {boolean} успех операции
 */
export function setNote(path, note) {
  const state = getState();
  const trimmed = (note || '').trim();
  if (trimmed) {
    state.notes[path] = trimmed;
  } else {
    delete state.notes[path];
  }
  saveState();
  emit(EVENTS.ORDER_DATA_CHANGED, { action: 'setNote', path });
  return true;
}

/**
 * Получает заметку для позиции.
 * @param {string} path - путь позиции
 * @returns {string} текст заметки или пустая строка
 */
export function getNote(path) {
  return getState().notes[path] || '';
}

// ============================================================
// РАСЧЁТ ОБЩЕГО КОЛИЧЕСТВА ПОЗИЦИИ
// ============================================================

/**
 * Вычисляет общее количество позиции с учётом всех типов упаковки.
 * @param {string} path - путь позиции
 * @returns {number} общее количество
 */
export function getTotalQty(path) {
  const state = getState();

  // 1. Проверяем упаковку общими кофрами
  const packing = state.orderPacking[path] || [];
  if (packing.length > 0) {
    const extra = state.orderExtra[path] || 0;
    const packed = packing.reduce((sum, p) => sum + (p.pieces || 0), 0);
    return packed + extra;
  }

  // 2. Проверяем индивидуальные кофры
  const mode = state.caseModes[path] || { enabled: false };
  const individualVals = state.individualCaseValues[path] || [];
  if (mode.enabled && individualVals.length > 0) {
    return individualVals.reduce((sum, v) => sum + v, 0);
  }

  // 3. Проверяем основные позиции и разбивки
  let total = state.order[path] || 0;
  const splits = state.orderSplits[path] || [];
  if (splits.length > 0) {
    total += splits.reduce((sum, seg) => sum + (seg.qty || 0), 0);
  }

  return total;
}

/**
 * Получает сумму разбивок для позиции.
 * @param {string} path - путь позиции
 * @returns {number} сумма количеств в разбивках
 */
export function getSegmentsSum(path) {
  const state = getState();
  const splits = state.orderSplits[path] || [];
  return splits.reduce((sum, seg) => sum + (seg.qty || 0), 0);
}

// ============================================================
// ПОЛУЧЕНИЕ РЕЖИМА КОФРОВ С ГАРАНТИЕЙ ДЕФОЛТА
// ============================================================

/**
 * Возвращает режим кофров для позиции с гарантией дефолтных значений.
 * @param {string} path - путь позиции
 * @returns {CaseMode} режим кофров
 */
export function getCaseMode(path) {
  const state = getState();
  const mode = state.caseModes[path];
  if (!mode) {
    // Создаём запись с дефолтами
    state.caseModes[path] = { ...CASE_MODES_DEFAULTS };
    return deepClone(state.caseModes[path]);
  }
  // Заполняем недостающие поля
  const result = { ...CASE_MODES_DEFAULTS, ...mode };
  return result;
}

// ============================================================
// НОВАЯ ФУНКЦИЯ: ПОЛУЧЕНИЕ ВСЕХ АКТИВНЫХ ПОЗИЦИЙ
// ============================================================

/**
 * Возвращает список всех активных позиций заказа (с количеством > 0).
 * @returns {Array<{path: string, qty: number}>} массив активных позиций
 */
export function getActiveItems() {
  const state = getState();
  const items = [];
  const allPaths = new Set();

  // Собираем все пути, где есть положительное количество
  for (const p in state.order) {
    if (state.order[p] > 0) allPaths.add(p);
  }
  for (const p in state.orderExtra) {
    if (state.orderExtra[p] > 0) allPaths.add(p);
  }
  for (const p in state.orderPacking) {
    const packing = state.orderPacking[p] || [];
    if (packing.some(item => item.pieces > 0)) allPaths.add(p);
  }
  for (const p in state.individualCaseValues) {
    const vals = state.individualCaseValues[p] || [];
    if (vals.some(v => v > 0)) allPaths.add(p);
  }

  // Для каждого пути вычисляем общее количество
  for (const p of allPaths) {
    const qty = getTotalQty(p);
    if (qty > 0) {
      items.push({ path: p, qty });
    }
  }

  return items;
}

// ============================================================
// ОБНОВЛЕНИЕ ПУТЕЙ ПРИ ПЕРЕИМЕНОВАНИИ
// ============================================================

/**
 * Обновляет пути в заказе при переименовании позиции.
 * @param {string} oldPath - старый путь
 * @param {string} newPath - новый путь
 */
export function updateOrderPaths(oldPath, newPath) {
  if (oldPath === newPath) return;
  const state = getState();

  const objects = [
    state.order,
    state.orderSplits,
    state.links,
    state.notes,
    state.orderPacking,
    state.individualCaseValues,
    state.commonRoutes,
    state.caseModes,
    state.orderExclude,
    state.orderExtra,
  ];

  for (const obj of objects) {
    if (obj && obj[oldPath] !== undefined) {
      obj[newPath] = obj[oldPath];
      delete obj[oldPath];
    }
  }

  // Обновляем target в links
  for (const src of Object.keys(state.links || {})) {
    state.links[src] = state.links[src].map(l => {
      if (l.target === oldPath) {
        return { ...l, target: newPath };
      }
      return l;
    });
  }

  // Обновляем target в orderSplits
  for (const path of Object.keys(state.orderSplits || {})) {
    state.orderSplits[path] = state.orderSplits[path].map(seg => {
      if (seg.target === oldPath) {
        return { ...seg, target: newPath };
      }
      return seg;
    });
  }

  // Обновляем target в commonRoutes
  for (const path of Object.keys(state.commonRoutes || {})) {
    state.commonRoutes[path] = state.commonRoutes[path].map(r => {
      if (r.target === oldPath) {
        return { ...r, target: newPath };
      }
      return r;
    });
  }

  saveState();
}

/**
 * Обновляет все пути при переименовании категории.
 * @param {string} oldPrefix - старый префикс
 * @param {string} newPrefix - новый префикс
 */
export function updateAllPathsOnCategoryRename(oldPrefix, newPrefix) {
  const state = getState();

  const objects = [
    state.order,
    state.orderSplits,
    state.links,
    state.notes,
    state.orderPacking,
    state.individualCaseValues,
    state.commonRoutes,
    state.caseModes,
    state.orderExclude,
    state.orderExtra,
  ];

  for (const obj of objects) {
    if (!obj) continue;
    const keys = Object.keys(obj);
    for (const key of keys) {
      if (key.startsWith(oldPrefix)) {
        const newKey = key.replace(oldPrefix, newPrefix);
        obj[newKey] = obj[key];
        delete obj[key];
      }
    }
  }

  // Обновляем target в links
  for (const src of Object.keys(state.links || {})) {
    state.links[src] = state.links[src].map(l => {
      if (l.target && l.target.startsWith(oldPrefix)) {
        return { ...l, target: l.target.replace(oldPrefix, newPrefix) };
      }
      return l;
    });
  }

  // Обновляем target в orderSplits
  for (const path of Object.keys(state.orderSplits || {})) {
    state.orderSplits[path] = state.orderSplits[path].map(seg => {
      if (seg.target && seg.target.startsWith(oldPrefix)) {
        return { ...seg, target: seg.target.replace(oldPrefix, newPrefix) };
      }
      return seg;
    });
  }

  // Обновляем target в commonRoutes
  for (const path of Object.keys(state.commonRoutes || {})) {
    state.commonRoutes[path] = state.commonRoutes[path].map(r => {
      if (r.target && r.target.startsWith(oldPrefix)) {
        return { ...r, target: r.target.replace(oldPrefix, newPrefix) };
      }
      return r;
    });
  }

  saveState();
}

// ============================================================
// ОЧИСТКА ЗАКАЗА
// ============================================================

/**
 * Полностью очищает все данные заказа.
 * @returns {boolean} успех операции
 */
export function clearOrder() {
  const state = getState();
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
  state.orderProject = {
    id: null,
    name: '',
    start_date: '',
    end_date: '',
    status: 'planned',
  };
  saveState();
  emit(EVENTS.ORDER_DATA_CHANGED, { action: 'clearOrder' });
  return true;
}

// ============================================================
// ЭКСПОРТ ПО УМОЛЧАНИЮ
// ============================================================

export default {
  getOrder,
  getOrderSplits,
  getLinks,
  getNotes,
  getOrderPacking,
  getIndividualCaseValues,
  getCommonRoutes,
  getCaseModes,
  getOrderExclude,
  getOrderExtra,
  getOrderProject,
  setOrderValue,
  setOrderSplits,
  setOrderPacking,
  setIndividualCaseValues,
  setCommonRoutes,
  setCaseMode,
  setOrderExclude,
  setOrderExtra,
  setOrderProject,
  addLink,
  removeLink,
  getLinksForSource,
  getLinksForTarget,
  setNote,
  getNote,
  getTotalQty,
  getSegmentsSum,
  getCaseMode,
  getActiveItems, // <-- добавлено
  updateOrderPaths,
  updateAllPathsOnCategoryRename,
  clearOrder,
};