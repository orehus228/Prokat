// repositories/OrderRepository.js
import { getState, saveState, clearCalculationCache } from '../core/state.js';
import { INSTANCE_STATUSES } from '../core/config.js';
import { parsePath, joinPath, replacePathPrefix } from '../utils/pathUtils.js';
import { getInstancesByPath, updateInstanceStatus } from '../services/instance-service.js';

/**
 * Репозиторий для работы с данными заказа:
 * - order (прямые количества)
 * - orderSplits (разбивка по сегментам)
 * - links (матрица привязок)
 * - notes (заметки)
 * - orderPacking (упаковка в общие кофры)
 * - individualCaseValues (распределение по индивидуальным кофрам)
 * - commonRoutes (маршруты общих кофров)
 * - caseModes (режимы кофров)
 * - orderExclude (исключение из загрузки)
 * - orderExtra (внекофровые остатки)
 * - orderSubrent (субаренда)
 * - orderInstances (привязка экземпляров к заказу)
 * - orderProject (привязка к проекту)
 */
class OrderRepository {
  // ---- Базовые геттеры/сеттеры ----
  getOrder() {
    return getState().order;
  }

  getOrderSplits() {
    return getState().orderSplits;
  }

  getLinks() {
    return getState().links;
  }

  getNotes() {
    return getState().notes;
  }

  getCaseModes() {
    return getState().caseModes;
  }

  getOrderExclude() {
    return getState().orderExclude;
  }

  // ---- Упаковка в общие кофры ----
  getOrderPacking(path) {
    return getState().orderPacking[path] || [];
  }

  setOrderPacking(path, packing) {
    const state = getState();
    if (packing && packing.length > 0) {
      state.orderPacking[path] = packing;
    } else {
      delete state.orderPacking[path];
    }
    saveState();
    clearCalculationCache();
  }

  // ---- Индивидуальные кофры ----
  getIndividualCaseValues(path) {
    return getState().individualCaseValues[path] || [];
  }

  setIndividualCaseValues(path, vals) {
    const state = getState();
    if (vals && vals.length > 0) {
      state.individualCaseValues[path] = vals;
    } else {
      delete state.individualCaseValues[path];
    }
    saveState();
    clearCalculationCache();
  }

  // ---- Общие маршруты ----
  getCommonRoutes(path) {
    return getState().commonRoutes[path] || [];
  }

  setCommonRoutes(path, routes) {
    const state = getState();
    if (routes && routes.length > 0) {
      state.commonRoutes[path] = routes;
    } else {
      delete state.commonRoutes[path];
    }
    saveState();
  }

  // ---- Внекофровые остатки ----
  getOrderExtra(path) {
    return getState().orderExtra[path] || 0;
  }

  setOrderExtra(path, val) {
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

  // ---- Исключение из загрузки ----
  isExcludedFromLoading(path) {
    return !!getState().orderExclude[path];
  }

  setExcludeFromLoading(path, exclude) {
    const state = getState();
    if (exclude) {
      state.orderExclude[path] = true;
    } else {
      delete state.orderExclude[path];
    }
    saveState();
  }

  // ---- Основное количество (прямое поле order) ----
  getOrderValue(path) {
    return getState().order[path] || 0;
  }

  setOrderValue(path, val) {
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

  // ---- Сплиты ----
  getOrderSplitsForPath(path) {
    return getState().orderSplits[path] || [];
  }

  setOrderSplitsForPath(path, splits) {
    const state = getState();
    if (splits && splits.length > 0) {
      state.orderSplits[path] = splits;
    } else {
      delete state.orderSplits[path];
    }
    saveState();
  }

  // ---- Ссылки (links) ----
  getLinksForSource(src) {
    return getState().links[src] || [];
  }

  getLinksForTarget(target) {
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

  addLink(src, target, multiplier) {
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

  removeLink(src, target) {
    const state = getState();
    if (state.links[src]) {
      state.links[src] = state.links[src].filter(l => l.target !== target);
      if (state.links[src].length === 0) delete state.links[src];
    }
    saveState();
  }

  // ---- Заметки ----
  getNote(path) {
    return getState().notes[path] || '';
  }

  setNote(path, note) {
    const state = getState();
    if (note && note.trim()) {
      state.notes[path] = note.trim();
    } else {
      delete state.notes[path];
    }
    saveState();
  }

  // ---- Субаренда ----
  getOrderSubrent() {
    const state = getState();
    if (!Array.isArray(state.orderSubrent)) {
      state.orderSubrent = [];
    }
    return state.orderSubrent;
  }

  setOrderSubrent(subrent) {
    const state = getState();
    state.orderSubrent = Array.isArray(subrent) ? subrent : [];
    saveState();
    clearCalculationCache();
  }

  addSubrentItem(item) {
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
    if (!Array.isArray(state.orderSubrent)) {
      state.orderSubrent = [];
    }
    state.orderSubrent.push(newItem);
    saveState();
    clearCalculationCache();
    return newItem;
  }

  removeSubrentItem(id) {
    const state = getState();
    if (!Array.isArray(state.orderSubrent)) return false;
    const index = state.orderSubrent.findIndex(item => item.id === id);
    if (index === -1) return false;
    state.orderSubrent.splice(index, 1);
    saveState();
    clearCalculationCache();
    return true;
  }

  updateSubrentItem(id, data) {
    const state = getState();
    if (!Array.isArray(state.orderSubrent)) return false;
    const item = state.orderSubrent.find(item => item.id === id);
    if (!item) return false;
    Object.assign(item, data);
    if (item.qty !== undefined) item.qty = Math.max(1, parseInt(item.qty) || 1);
    if (item.weight !== undefined) item.weight = parseFloat(item.weight) || 0;
    saveState();
    clearCalculationCache();
    return true;
  }

  // ---- Экземпляры в заказе ----
  getOrderInstances(path) {
    const state = getState();
    return state.orderInstances?.[path] || [];
  }

  setOrderInstances(path, instanceIds) {
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

  addOrderInstances(path, instanceIds) {
    const current = this.getOrderInstances(path);
    const newSet = new Set([...current, ...instanceIds]);
    this.setOrderInstances(path, Array.from(newSet));
  }

  removeOrderInstances(path, instanceIds) {
    const current = this.getOrderInstances(path);
    const newList = current.filter(id => !instanceIds.includes(id));
    this.setOrderInstances(path, newList);
  }

  clearAllOrderInstances() {
    const state = getState();
    state.orderInstances = {};
    saveState();
  }

  // ---- Проект заказа ----
  getOrderProject() {
    return { ...getState().orderProject };
  }

  setOrderProject(projectData) {
    const state = getState();
    Object.assign(state.orderProject, projectData);
    saveState();
  }

  resetOrderProject() {
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

  // ---- Получение общего количества позиции ----
  getTotalQty(path) {
    const state = getState();
    const packing = this.getOrderPacking(path);
    if (packing.length > 0) {
      const extra = this.getOrderExtra(path);
      return extra + packing.reduce((s, p) => s + (p.pieces || 0), 0);
    }

    const mode = this.getCaseMode(path);
    const vals = this.getIndividualCaseValues(path);
    if (mode.enabled && vals.length > 0) {
      return vals.reduce((a, b) => a + b, 0);
    }

    let total = state.order[path] || 0;
    if (state.orderSplits[path]) {
      total += state.orderSplits[path].reduce((s, seg) => s + (seg.qty || 0), 0);
    }
    return total;
  }

  // ---- Работа с caseModes ----
  getCaseMode(path) {
    const state = getState();
    if (!state.caseModes[path]) {
      state.caseModes[path] = {
        enabled: false,
        alt: null,
        selectedOption: 0,
        accumulate: false,
        multiSelected: [],
        commonSelected: [],
        useAlt: false,
        criteria: 'weight',
      };
    }
    return state.caseModes[path];
  }

  setCaseMode(path, mode) {
    const state = getState();
    state.caseModes[path] = { ...mode };
    saveState();
  }

  // ---- Обновление путей при переименовании ----
  updatePathsOnRename(oldPrefix, newPrefix) {
    const state = getState();
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
    objectsToUpdate.forEach(objName => {
      const obj = state[objName];
      if (!obj) return;
      const keys = Object.keys(obj);
      keys.forEach(oldKey => {
        if (oldKey.startsWith(oldPrefix)) {
          const newKey = replacePathPrefix(oldKey, oldPrefix, newPrefix);
          obj[newKey] = obj[oldKey];
          delete obj[oldKey];
          // Для splist и links, где внутри есть ссылки на пути
          if (objName === 'orderSplits' && Array.isArray(obj[newKey])) {
            obj[newKey].forEach(seg => {
              if (seg.path && seg.path.startsWith(oldPrefix)) {
                seg.path = replacePathPrefix(seg.path, oldPrefix, newPrefix);
              }
            });
          }
          if (objName === 'links' && Array.isArray(obj[newKey])) {
            obj[newKey].forEach(link => {
              if (link.target && link.target.startsWith(oldPrefix)) {
                link.target = replacePathPrefix(link.target, oldPrefix, newPrefix);
              }
            });
          }
          if (objName === 'commonRoutes' && Array.isArray(obj[newKey])) {
            obj[newKey].forEach(route => {
              if (route.target && route.target.startsWith(oldPrefix)) {
                route.target = replacePathPrefix(route.target, oldPrefix, newPrefix);
              }
            });
          }
        }
      });
    });
    saveState();
  }

  updateSinglePath(oldPath, newPath) {
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
      state.orderInstances,
    ];
    objects.forEach(obj => {
      if (obj && obj[oldPath] !== undefined) {
        obj[newPath] = obj[oldPath];
        delete obj[oldPath];
      }
    });
    // Обновляем экземпляры (они в inventoryRepo, но здесь мы можем обновить их пути)
    const instances = state.instances || {};
    for (let id in instances) {
      if (instances[id].path === oldPath) {
        instances[id].path = newPath;
      }
    }
    // Перестраиваем индекс экземпляров (вызовем через import, но для избежания цикла импорта)
    // Лучше вызвать через import, но для простоты используем функцию из state
    import('../core/state.js').then(module => module.rebuildInstancesIndex());
    saveState();
  }
}

export const orderRepo = new OrderRepository();
export default orderRepo;