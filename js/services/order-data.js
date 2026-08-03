// services/order-data.js
import {
  getState,
  setStateKey,
  saveState,
  clearCalculationCache,
} from '../core/state.js';
import * as calc from './calculations.js';
import { INSTANCE_STATUSES } from '../core/config.js';
import { getInstancesByPath, updateInstanceStatus, getInstancesForProject } from './instance-service.js';

// ============================================================
// БАЗОВЫЕ ГЕТТЕРЫ И СЕТТЕРЫ
// ============================================================

export function getOrder() {
  return getState().order;
}

export function getOrderSplits() {
  return getState().orderSplits;
}

export function getLinks() {
  return getState().links;
}

export function getNotes() {
  return getState().notes;
}

export function getOrderPacking(path) {
  const state = getState();
  return state.orderPacking[path] || [];
}

export function getIndividualCaseValues(path) {
  const state = getState();
  return state.individualCaseValues[path] || [];
}

export function getCommonRoutes(path) {
  const state = getState();
  return state.commonRoutes[path] || [];
}

export function getCaseModes() {
  return getState().caseModes;
}

export function getOrderExclude() {
  return getState().orderExclude;
}

export function getOrderExtra() {
  return getState().orderExtra;
}

// ============================================================
// РАБОТА С СУБАРЕНДОЙ
// ============================================================

/**
 * Возвращает массив субарендных позиций.
 * @returns {Array} массив объектов субаренды
 */
export function getOrderSubrent() {
  return getState().orderSubrent || [];
}

/**
 * Устанавливает весь массив субаренды.
 * @param {Array} subrent - массив объектов субаренды
 */
export function setOrderSubrent(subrent) {
  const state = getState();
  state.orderSubrent = Array.isArray(subrent) ? subrent : [];
  saveState();
  clearCalculationCache();
}

/**
 * Добавляет новую субарендную позицию.
 * @param {object} item - данные субаренды
 * @param {string} item.name - название
 * @param {number} item.qty - количество
 * @param {number} item.weight - вес 1 шт (кг)
 * @param {string} item.dimensions - габариты (ДхШхВ, см)
 * @param {string} item.counterparty - контрагент
 * @param {string} item.start_date - дата начала (YYYY-MM-DD)
 * @param {string} item.end_date - дата окончания (YYYY-MM-DD)
 * @param {string} item.comment - комментарий
 * @param {string} [item.id] - уникальный ID (генерируется автоматически)
 * @returns {object} добавленный объект
 */
export function addSubrentItem(item) {
  const state = getState();
  const newItem = {
    id: 'subrent_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    name: item.name || 'Без названия',
    qty: Math.max(1, parseInt(item.qty) || 1),
    weight: parseFloat(item.weight) || 0,
    dimensions: item.dimensions || '',
    counterparty: item.counterparty || '',
    start_date: item.start_date || '',
    end_date: item.end_date || '',
    comment: item.comment || '',
  };
  state.orderSubrent.push(newItem);
  saveState();
  clearCalculationCache();
  return newItem;
}

/**
 * Удаляет субарендную позицию по ID.
 * @param {string} id
 * @returns {boolean} успешно ли удалено
 */
export function removeSubrentItem(id) {
  const state = getState();
  const index = state.orderSubrent.findIndex(item => item.id === id);
  if (index === -1) return false;
  state.orderSubrent.splice(index, 1);
  saveState();
  clearCalculationCache();
  return true;
}

/**
 * Обновляет субарендную позицию.
 * @param {string} id
 * @param {object} data - обновляемые поля
 * @returns {boolean} успешно ли обновлено
 */
export function updateSubrentItem(id, data) {
  const state = getState();
  const item = state.orderSubrent.find(item => item.id === id);
  if (!item) return false;
  Object.assign(item, data);
  if (item.qty !== undefined) item.qty = Math.max(1, parseInt(item.qty) || 1);
  if (item.weight !== undefined) item.weight = parseFloat(item.weight) || 0;
  saveState();
  clearCalculationCache();
  return true;
}

// ============================================================
// РАБОТА С ЭКЗЕМПЛЯРАМИ В ЗАКАЗЕ
// ============================================================

export function getOrderInstances(path) {
  const state = getState();
  return state.orderInstances?.[path] || [];
}

export function setOrderInstances(path, instanceIds) {
  const state = getState();
  if (!state.orderInstances) state.orderInstances = {};
  if (instanceIds && instanceIds.length > 0) {
    state.orderInstances[path] = instanceIds;
  } else {
    delete state.orderInstances[path];
  }
  saveState();
  clearCalculationCache();
}

export function addOrderInstances(path, instanceIds) {
  const current = getOrderInstances(path);
  const newSet = new Set([...current, ...instanceIds]);
  setOrderInstances(path, Array.from(newSet));
}

export function removeOrderInstances(path, instanceIds) {
  const current = getOrderInstances(path);
  const newList = current.filter(id => !instanceIds.includes(id));
  setOrderInstances(path, newList);
}

export function clearAllOrderInstances() {
  const state = getState();
  state.orderInstances = {};
  saveState();
}

export function getOrderProject() {
  return { ...getState().orderProject };
}

export function setOrderProject(projectData) {
  const state = getState();
  Object.assign(state.orderProject, projectData);
  saveState();
}

export function resetOrderProject() {
  const state = getState();
  state.orderProject = {
    id: null,
    name: '',
    start_date: '',
    end_date: '',
    status: 'planned',
  };
  saveState();
}

// ============================================================
// ФУНКЦИИ ИЗМЕНЕНИЯ ДАННЫХ
// ============================================================

export function setOrderPacking(path, packing) {
  const state = getState();
  if (packing && packing.length > 0) {
    state.orderPacking[path] = packing;
  } else {
    delete state.orderPacking[path];
  }
  saveState();
  clearCalculationCache();
}

export function setIndividualCaseValues(path, vals) {
  const state = getState();
  if (vals && vals.length > 0) {
    state.individualCaseValues[path] = vals;
  } else {
    delete state.individualCaseValues[path];
  }
  saveState();
  clearCalculationCache();
}

export function setCommonRoutes(path, routes) {
  const state = getState();
  if (routes && routes.length > 0) {
    state.commonRoutes[path] = routes;
  } else {
    delete state.commonRoutes[path];
  }
  saveState();
}

export function setOrderExtra(path, val) {
  const state = getState();
  val = Math.max(0, parseInt(val) || 0);
  if (val > 0) {
    state.orderExtra[path] = val;
  } else {
    delete state.orderExtra[path];
  }
  saveState();
  clearCalculationCache();
}

export function setExcludeFromLoading(path, exclude) {
  const state = getState();
  if (exclude) {
    state.orderExclude[path] = true;
  } else {
    delete state.orderExclude[path];
  }
  saveState();
}

export function isExcludedFromLoading(path) {
  return !!getState().orderExclude[path];
}

// ============================================================
// РАБОТА С ПУТЯМИ И ОБНОВЛЕНИЕМ
// ============================================================

function updateAllPaths(oldPrefix, newPrefix, objectsToUpdate) {
  const state = getState();
  objectsToUpdate.forEach(objName => {
    const obj = state[objName];
    if (!obj) return;
    const keys = Object.keys(obj);
    keys.forEach(oldKey => {
      if (oldKey.startsWith(oldPrefix)) {
        const newKey = oldKey.replace(oldPrefix, newPrefix);
        obj[newKey] = obj[oldKey];
        delete obj[oldKey];
        if (objName === 'orderSplits' && Array.isArray(obj[newKey])) {
          obj[newKey].forEach(seg => {
            if (seg.path && seg.path.startsWith(oldPrefix)) {
              seg.path = seg.path.replace(oldPrefix, newPrefix);
            }
          });
        }
        if (objName === 'links' && Array.isArray(obj[newKey])) {
          obj[newKey].forEach(link => {
            if (link.target && link.target.startsWith(oldPrefix)) {
              link.target = link.target.replace(oldPrefix, newPrefix);
            }
          });
        }
        if (objName === 'commonRoutes' && Array.isArray(obj[newKey])) {
          obj[newKey].forEach(route => {
            if (route.target && route.target.startsWith(oldPrefix)) {
              route.target = route.target.replace(oldPrefix, newPrefix);
            }
          });
        }
        if (objName === 'orderInstances' && Array.isArray(obj[newKey])) {
          // ID экземпляров не меняются, но ключ пути обновляется
        }
      }
    });
  });
  saveState();
}

export function updateOrderPaths(oldPath, newPath) {
  if (oldPath === newPath) return;
  const state = getState();
  const objectsToUpdate = [
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
    state.orderInstances,
  ];
  objectsToUpdate.forEach(obj => {
    if (obj && obj[oldPath] !== undefined) {
      obj[newPath] = obj[oldPath];
      delete obj[oldPath];
    }
  });
  const instances = getState().instances || {};
  for (let id in instances) {
    if (instances[id].path === oldPath) {
      instances[id].path = newPath;
    }
  }
  import('../core/state.js').then(module => module.rebuildInstancesIndex());
  saveState();
}

export function updateAllPathsOnCategoryRename(oldPrefix, newPrefix) {
  const objectsToUpdate = [
    'order',
    'orderSplits',
    'links',
    'notes',
    'orderPacking',
    'individualCaseValues',
    'commonRoutes',
    'caseModes',
    'orderExclude',
    'orderExtra',
    'orderInstances',
  ];
  updateAllPaths(oldPrefix, newPrefix, objectsToUpdate);
  const state = getState();
  const instances = state.instances || {};
  for (let id in instances) {
    if (instances[id].path && instances[id].path.startsWith(oldPrefix)) {
      instances[id].path = instances[id].path.replace(oldPrefix, newPrefix);
    }
  }
  import('../core/state.js').then(module => module.rebuildInstancesIndex());
  saveState();
}

// ============================================================
// ПОЛУЧЕНИЕ ОБЩЕГО КОЛИЧЕСТВА ПОЗИЦИИ
// ============================================================

export function getTotalQty(path) {
  const state = getState();
  const packing = getOrderPacking(path);
  if (packing.length > 0) {
    const extra = getOrderExtra(path);
    return extra + packing.reduce((s, p) => s + (p.pieces || 0), 0);
  }

  const mode = calc.getCaseMode(path);
  const vals = getIndividualCaseValues(path);
  if (mode.enabled && vals.length > 0) {
    return vals.reduce((a, b) => a + b, 0);
  }

  let total = state.order[path] || 0;
  if (state.orderSplits[path]) {
    total += state.orderSplits[path].reduce((s, seg) => s + (seg.qty || 0), 0);
  }
  return total;
}

/**
 * Возвращает общее количество всех позиций в заказе, включая субаренду.
 * @returns {number} общее количество
 */
export function getTotalOrderQty() {
  const state = getState();
  let total = 0;
  for (let p in state.order) total += state.order[p] || 0;
  for (let p in state.orderExtra) total += state.orderExtra[p] || 0;
  for (let p in state.individualCaseValues) {
    total += state.individualCaseValues[p].reduce((a, b) => a + b, 0);
  }
  for (let p in state.orderPacking) {
    total += state.orderPacking[p].reduce((s, item) => s + (item.pieces || 0), 0);
  }
  // Субаренда
  for (let item of state.orderSubrent) {
    total += item.qty || 0;
  }
  return total;
}

export function getSegmentsSum(path) {
  const state = getState();
  if (!state.orderSplits[path]) return 0;
  return state.orderSplits[path].reduce((s, seg) => s + (seg.qty || 0), 0);
}

// ============================================================
// ОБНОВЛЕНИЕ КОЛИЧЕСТВА В ОСНОВНОМ ПОЛЕ order
// ============================================================

export function setOrderValue(path, val) {
  const state = getState();
  val = Math.max(0, parseInt(val) || 0);
  if (val > 0) {
    state.order[path] = val;
  } else {
    delete state.order[path];
  }
  saveState();
  clearCalculationCache();
}

// ============================================================
// РАБОТА С ПРИВЯЗКАМИ (LINKS)
// ============================================================

export function addLink(src, target, multiplier) {
  const state = getState();
  if (!state.links[src]) state.links[src] = [];
  const existing = state.links[src].find(l => l.target === target);
  if (existing) {
    existing.multiplier = multiplier;
  } else {
    state.links[src].push({ target, multiplier });
  }
  saveState();
}

export function removeLink(src, target) {
  const state = getState();
  if (state.links[src]) {
    state.links[src] = state.links[src].filter(l => l.target !== target);
    if (state.links[src].length === 0) delete state.links[src];
  }
  saveState();
}

export function getLinksForSource(src) {
  return getState().links[src] || [];
}

export function getLinksForTarget(target) {
  const state = getState();
  const result = [];
  for (let src in state.links) {
    const links = state.links[src].filter(l => l.target === target);
    if (links.length > 0) {
      result.push({ source: src, links });
    }
  }
  return result;
}

// ============================================================
// РАБОТА С ЗАМЕТКАМИ
// ============================================================

export function setNote(path, note) {
  const state = getState();
  if (note && note.trim()) {
    state.notes[path] = note.trim();
  } else {
    delete state.notes[path];
  }
  saveState();
}

export function getNote(path) {
  return getState().notes[path] || '';
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
  getOrderSubrent,
  setOrderSubrent,
  addSubrentItem,
  removeSubrentItem,
  updateSubrentItem,
  getOrderInstances,
  setOrderInstances,
  addOrderInstances,
  removeOrderInstances,
  clearAllOrderInstances,
  getOrderProject,
  setOrderProject,
  resetOrderProject,
  setOrderPacking,
  setIndividualCaseValues,
  setCommonRoutes,
  setOrderExtra,
  setExcludeFromLoading,
  isExcludedFromLoading,
  updateOrderPaths,
  updateAllPathsOnCategoryRename,
  getTotalQty,
  getTotalOrderQty,
  getSegmentsSum,
  setOrderValue,
  addLink,
  removeLink,
  getLinksForSource,
  getLinksForTarget,
  setNote,
  getNote,
};