// services/loading.js

/**
 * Сервис для расчёта загрузки грузовиков.
 * Использует эвристический алгоритм упаковки (Corner-Based Placement).
 * @module services/loading
 */

import { getState, getCachedCalculation, setCachedCalculation } from '../core/store.js';
import { PACKING_GAP, CM3_TO_M3 } from '../core/config.js';
import { getTruckPresetById, getSelectedTruckIds } from './trucks.js';
import { getPackagesForLoading } from './packaging.js';
import { getActiveItems, getTotalQty } from './order.js';
import { deepClone } from '../core/utils.js';

// ============================================================
// ТИПЫ ДАННЫХ (JSDoc)
// ============================================================

/**
 * @typedef {Object} Truck
 * @property {string} id - ID грузовика
 * @property {string} name - название
 * @property {number} width - ширина в см
 * @property {number} height - высота в см
 * @property {number} depth - глубина/длина в см
 * @property {number} maxWeight - максимальный вес в кг
 */

/**
 * @typedef {Object} LoadedItem
 * @property {number} x - координата X (ширина)
 * @property {number} y - координата Y (высота)
 * @property {number} z - координата Z (глубина)
 * @property {number} w - ширина в см
 * @property {number} h - высота в см
 * @property {number} d - глубина в см
 * @property {number} weight - вес в кг
 * @property {string} label - описание предмета
 * @property {string} path - путь позиции (для обратной связи)
 */

/**
 * @typedef {Object} LoadingResult
 * @property {Array<{truckName: string, items: LoadedItem[], totalWeight: number, totalVolume: number}>} trucks
 * @property {number} totalWeight - общий вес загруженного
 * @property {number} totalVolume - общий объём загруженного
 * @property {Array<{label: string, width: number, height: number, depth: number, weight: number}>} failedItems
 */

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================

/**
 * Проверяет, пересекаются ли два предмета в пространстве.
 * @param {LoadedItem} a - первый предмет
 * @param {LoadedItem} b - второй предмет
 * @param {number} gap - минимальный зазор между предметами
 * @returns {boolean} true, если пересекаются
 */
function itemsOverlap(a, b, gap = PACKING_GAP) {
  const g = gap;
  return (
    a.x < b.x + b.w + g &&
    a.x + a.w + g > b.x &&
    a.y < b.y + b.h + g &&
    a.y + a.h + g > b.y &&
    a.z < b.z + b.d + g &&
    a.z + a.d + g > b.z
  );
}

/**
 * Проверяет, помещается ли предмет в заданную точку грузовика.
 * @param {LoadedItem} item - предмет
 * @param {Truck} truck - грузовик
 * @param {LoadedItem[]} packed - уже упакованные предметы
 * @param {number} gap - зазор
 * @returns {boolean} true, если помещается
 */
function canPlace(item, truck, packed, gap = PACKING_GAP) {
  if (item.x + item.w > truck.width + gap) return false;
  if (item.y + item.h > truck.height + gap) return false;
  if (item.z + item.d > truck.depth + gap) return false;

  for (const p of packed) {
    if (itemsOverlap(item, p, gap)) return false;
  }
  return true;
}

/**
 * Сортирует предметы для упаковки (по убыванию объёма и веса).
 * @param {Array} items - массив предметов с полями width, height, depth, weight
 * @returns {Array} отсортированный массив
 */
function sortItemsForPacking(items) {
  return [...items].sort((a, b) => {
    const volA = a.width * a.height * a.depth;
    const volB = b.width * b.height * b.depth;
    if (volB !== volA) return volB - volA;
    return (b.weight || 0) - (a.weight || 0);
  });
}

// ============================================================
// УПАКОВКА В ОДИН ГРУЗОВИК
// ============================================================

/**
 * Упаковывает предметы в один грузовик (Corner-Based Placement).
 * @param {Truck} truck - грузовик
 * @param {Array} items - массив предметов { width, height, depth, weight, label, path }
 * @param {number} gap - зазор между предметами
 * @returns {{ success: boolean, packed: LoadedItem[], failedItem: any, reason: string }}
 */
export function packItems(truck, items, gap = PACKING_GAP) {
  const sortedItems = sortItemsForPacking(items);
  const packed = [];
  // Начальная точка — угол (0,0,0)
  const points = [{ x: 0, y: 0, z: 0 }];
  let currentWeight = 0;
  const maxWeight = truck.maxWeight || Infinity;

  for (const item of sortedItems) {
    // Проверка веса
    if (currentWeight + (item.weight || 0) > maxWeight) {
      return {
        success: false,
        packed,
        failedItem: item,
        reason: `Превышение веса: ${currentWeight + item.weight} > ${maxWeight}`,
      };
    }

    let placed = false;
    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      const candidate = {
        x: pt.x,
        y: pt.y,
        z: pt.z,
        w: item.width || 0,
        h: item.height || 0,
        d: item.depth || 0,
        weight: item.weight || 0,
        label: item.label || 'Предмет',
        path: item.path || '',
      };

      if (canPlace(candidate, truck, packed, gap)) {
        packed.push(candidate);
        currentWeight += candidate.weight;
        // Удаляем использованную точку
        points.splice(i, 1);
        // Добавляем новые точки (углы)
        points.push({
          x: pt.x + candidate.w + gap,
          y: pt.y,
          z: pt.z,
        });
        points.push({
          x: pt.x,
          y: pt.y + candidate.h + gap,
          z: pt.z,
        });
        points.push({
          x: pt.x,
          y: pt.y,
          z: pt.z + candidate.d + gap,
        });
        // Сортируем точки: сначала по Z, затем по Y, затем по X (приоритет глубины)
        points.sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
        placed = true;
        break;
      }
    }

    if (!placed) {
      return {
        success: false,
        packed,
        failedItem: item,
        reason: 'Недостаточно места',
      };
    }
  }

  return { success: true, packed, failedItem: null, reason: '' };
}

// ============================================================
// РАСЧЁТ ЗАГРУЗКИ ПО ВСЕМ ГРУЗОВИКАМ
// ============================================================

/**
 * Рассчитывает загрузку всех грузовиков.
 * @param {Truck[]} trucks - массив грузовиков
 * @param {Array} allCargo - массив всех предметов { width, height, depth, weight, label, path }
 * @returns {LoadingResult} результат расчёта
 */
export function calculateLoading(trucks, allCargo) {
  if (!trucks || trucks.length === 0) {
    return {
      trucks: [],
      totalWeight: 0,
      totalVolume: 0,
      failedItems: allCargo.map(item => ({
        label: item.label || 'Предмет',
        width: item.width || 0,
        height: item.height || 0,
        depth: item.depth || 0,
        weight: item.weight || 0,
      })),
    };
  }

  const result = {
    trucks: [],
    totalWeight: 0,
    totalVolume: 0,
    failedItems: [],
  };

  let remainingCargo = deepClone(allCargo);

  for (const truck of trucks) {
    if (remainingCargo.length === 0) break;

    const packResult = packItems(truck, remainingCargo);

    if (packResult.success) {
      const truckPack = {
        truckName: truck.name,
        items: packResult.packed,
        totalWeight: packResult.packed.reduce((s, i) => s + i.weight, 0),
        totalVolume: packResult.packed.reduce((s, i) => s + (i.w * i.h * i.d) / CM3_TO_M3, 0),
      };
      result.trucks.push(truckPack);
      result.totalWeight += truckPack.totalWeight;
      result.totalVolume += truckPack.totalVolume;

      // Удаляем упакованные предметы из оставшихся
      const packedPaths = new Set(packResult.packed.map(p => p.path + '|' + p.label));
      remainingCargo = remainingCargo.filter(
        item => !packedPaths.has(item.path + '|' + item.label)
      );
    } else {
      // Частичная загрузка
      if (packResult.packed.length > 0) {
        const truckPack = {
          truckName: `${truck.name} (частично)`,
          items: packResult.packed,
          totalWeight: packResult.packed.reduce((s, i) => s + i.weight, 0),
          totalVolume: packResult.packed.reduce((s, i) => s + (i.w * i.h * i.d) / CM3_TO_M3, 0),
        };
        result.trucks.push(truckPack);
        result.totalWeight += truckPack.totalWeight;
        result.totalVolume += truckPack.totalVolume;

        const packedPaths = new Set(packResult.packed.map(p => p.path + '|' + p.label));
        remainingCargo = remainingCargo.filter(
          item => !packedPaths.has(item.path + '|' + item.label)
        );
      }

      if (packResult.failedItem) {
        result.failedItems.push({
          label: packResult.failedItem.label || 'Предмет',
          width: packResult.failedItem.width || 0,
          height: packResult.failedItem.height || 0,
          depth: packResult.failedItem.depth || 0,
          weight: packResult.failedItem.weight || 0,
        });
        // Удаляем этот предмет из остатка, чтобы не зациклиться
        remainingCargo = remainingCargo.filter(
          item => !(item.path === packResult.failedItem.path && item.label === packResult.failedItem.label)
        );
      }

      // Если не удалось упаковать ни одного предмета — выходим
      if (packResult.packed.length === 0) {
        break;
      }
    }
  }

  // Все оставшиеся предметы — не поместились
  for (const item of remainingCargo) {
    result.failedItems.push({
      label: item.label || 'Предмет',
      width: item.width || 0,
      height: item.height || 0,
      depth: item.depth || 0,
      weight: item.weight || 0,
    });
  }

  return result;
}

// ============================================================
// СИНХРОННАЯ ВЕРСИЯ РАСЧЁТА ЗАГРУЗКИ ЗАКАЗА
// ============================================================

/**
 * Синхронная версия расчёта загрузки заказа.
 * @param {string[]} [truckIds] - ID грузовиков (если не указаны, берутся выбранные)
 * @returns {LoadingResult} результат расчёта
 */
export function calculateOrderLoadingSync(truckIds) {
  const cacheKey = `loading_sync_${(truckIds || []).join('_')}`;
  const cached = getCachedCalculation(cacheKey);
  if (cached) return cached;

  // Получаем активные позиции (используем новую функцию getActiveItems)
  const activeItems = getActiveItems();

  let allCargo = [];
  for (const item of activeItems) {
    const qty = item.qty;
    if (qty > 0) {
      const packages = getPackagesForLoading(item.path, qty);
      for (const pkg of packages) {
        allCargo.push({
          width: pkg.width || 0,
          height: pkg.height || 0,
          depth: pkg.depth || 0,
          weight: pkg.weight || 0,
          label: pkg.label || 'Груз',
          path: item.path,
        });
      }
    }
  }

  const ids = truckIds || getSelectedTruckIds();
  const trucks = ids.map(id => getTruckPresetById(id)).filter(Boolean);
  if (trucks.length === 0) {
    const empty = {
      trucks: [],
      totalWeight: 0,
      totalVolume: 0,
      failedItems: allCargo.map(item => ({
        label: item.label || 'Предмет',
        width: item.width || 0,
        height: item.height || 0,
        depth: item.depth || 0,
        weight: item.weight || 0,
      })),
    };
    setCachedCalculation(cacheKey, empty);
    return empty;
  }

  const result = calculateLoading(trucks, allCargo);
  setCachedCalculation(cacheKey, result);
  return result;
}

// ============================================================
// ЭКСПОРТ ПО УМОЛЧАНИЮ
// ============================================================

export default {
  packItems,
  calculateLoading,
  calculateOrderLoadingSync,
};