// services/packing.js
import { getItemPropsByPath, parseUnitVolume } from './calculations.js';
import { getCommonCases, getItemProps } from '../data/editor-data.js';
import {
  getOrderPacking,
  getIndividualCaseValues,
  getOrderExtra,
} from './order-data.js';
// Импорты из calculations.js
import {
  getCaseMode,
  getCaseOptions,
  getSelectedOption,
} from './calculations.js';

// ============================================================
// ПОЛУЧЕНИЕ ГАБАРИТОВ ДЛЯ КАЖДОЙ ЕДИНИЦЫ ГРУЗА
// ============================================================

/**
 * Преобразует позицию заказа в массив "предметов" с размерами и весом
 * с учётом режима кофров (общие, индивидуальные, без кофров).
 * @param {string} path - полный путь позиции
 * @param {number} qty - общее количество единиц позиции
 * @returns {Array} массив предметов { width, height, depth, weight, name, path }
 */
export function getItemDimensions(path, qty) {
  const props = getItemPropsByPath(path);
  const mode = getCaseMode(path);
  const packing = getOrderPacking(path);
  const result = [];

  // Если есть привязка к общим кофрам
  if (packing.length > 0) {
    let remaining = qty;
    for (let p of packing) {
      const caseObj = getCommonCases().find(c => c.id === p.caseId);
      if (!caseObj) continue;
      const capacity = caseObj.qty || 1;
      const unitsInThisCase = Math.min(remaining, p.pieces || 0);
      if (unitsInThisCase <= 0) continue;
      const dims = caseObj.dimensions ? caseObj.dimensions.split('x').map(s => parseFloat(s.trim())) : [0, 0, 0];
      const w = dims[0] || 0;
      const h = dims[1] || 0;
      const d = dims[2] || 0;
      const unitWeight = props.weight || 0;
      const totalWeight = unitsInThisCase * unitWeight + (caseObj.emptyWeight || 0);
      const name = caseObj.name || 'Общий кофр';
      result.push({ width: w, height: h, depth: d, weight: totalWeight, name, path });
      remaining -= unitsInThisCase;
    }
    if (remaining > 0) {
      const dims = props.dimensions ? props.dimensions.split('x').map(s => parseFloat(s.trim())) : [0, 0, 0];
      const w = dims[0] || 0;
      const h = dims[1] || 0;
      const d = dims[2] || 0;
      const unitWeight = props.weight || 0;
      result.push({ width: w, height: h, depth: d, weight: remaining * unitWeight, name: 'Без кофра (остаток)', path });
    }
    return result;
  }

  // Индивидуальные кофры (мульти или одиночные)
  const individualVals = getIndividualCaseValues(path);
  const options = getCaseOptions(path);
  const isMulti = mode.multiSelected && mode.multiSelected.some(v => v === true);

  if (individualVals.length > 0 && options.length > 0) {
    let remaining = qty;
    for (let i = 0; i < individualVals.length; i++) {
      const val = individualVals[i];
      if (val <= 0) continue;
      const opt = options[i] || options[0];
      const alt = mode.alt;
      let dimsStr, emptyWeight, qtyPerCase;
      if (alt && mode.useAlt) {
        dimsStr = alt.dims || '';
        emptyWeight = alt.weight || 0;
        qtyPerCase = alt.qty || 1;
      } else {
        dimsStr = opt.dimensions || '';
        emptyWeight = opt.weight || 0;
        qtyPerCase = opt.qty || 1;
      }
      const dims = dimsStr.split('x').map(s => parseFloat(s.trim()));
      const w = dims[0] || 0;
      const h = dims[1] || 0;
      const d = dims[2] || 0;
      const unitWeight = props.weight || 0;
      const unitsInThisCase = Math.min(remaining, val);
      if (unitsInThisCase <= 0) continue;
      const fullCases = Math.floor(unitsInThisCase / qtyPerCase);
      const rem = unitsInThisCase % qtyPerCase;
      for (let c = 0; c < fullCases; c++) {
        result.push({
          width: w,
          height: h,
          depth: d,
          weight: qtyPerCase * unitWeight + emptyWeight,
          name: `Кофр вар.${i + 1}`,
          path
        });
      }
      if (rem > 0) {
        result.push({
          width: w,
          height: h,
          depth: d,
          weight: rem * unitWeight + emptyWeight,
          name: `Кофр вар.${i + 1} (неполный)`,
          path
        });
      }
      remaining -= unitsInThisCase;
    }
    if (remaining > 0) {
      const dims = props.dimensions ? props.dimensions.split('x').map(s => parseFloat(s.trim())) : [0, 0, 0];
      const w = dims[0] || 0;
      const h = dims[1] || 0;
      const d = dims[2] || 0;
      const unitWeight = props.weight || 0;
      result.push({ width: w, height: h, depth: d, weight: remaining * unitWeight, name: 'Без кофра (остаток)', path });
    }
    return result;
  }

  // Режим одного кофра (без мульти)
  if (mode.enabled && individualVals.length === 1 && !packing.length && !isMulti) {
    let opt = getSelectedOption(path);
    let alt = mode.alt;
    let dimsStr, emptyWeight, qtyPerCase;
    if (alt && mode.useAlt) {
      dimsStr = alt.dims || '';
      emptyWeight = alt.weight || 0;
      qtyPerCase = alt.qty || 1;
    } else if (opt) {
      dimsStr = opt.dimensions || '';
      emptyWeight = opt.weight || 0;
      qtyPerCase = opt.qty || 1;
    } else {
      const dims = props.dimensions ? props.dimensions.split('x').map(s => parseFloat(s.trim())) : [0, 0, 0];
      const w = dims[0] || 0;
      const h = dims[1] || 0;
      const d = dims[2] || 0;
      const unitWeight = props.weight || 0;
      result.push({ width: w, height: h, depth: d, weight: qty * unitWeight, name: 'Без кофра', path });
      return result;
    }
    const dims = dimsStr.split('x').map(s => parseFloat(s.trim()));
    const w = dims[0] || 0;
    const h = dims[1] || 0;
    const d = dims[2] || 0;
    const unitWeight = props.weight || 0;
    const fullCases = Math.floor(qty / qtyPerCase);
    const rem = qty % qtyPerCase;
    for (let c = 0; c < fullCases; c++) {
      result.push({
        width: w,
        height: h,
        depth: d,
        weight: qtyPerCase * unitWeight + emptyWeight,
        name: 'Кофр',
        path
      });
    }
    if (rem > 0) {
      result.push({
        width: w,
        height: h,
        depth: d,
        weight: rem * unitWeight + emptyWeight,
        name: 'Неполный кофр',
        path
      });
    }
    return result;
  }

  // Без кофров
  const dims = props.dimensions ? props.dimensions.split('x').map(s => parseFloat(s.trim())) : [0, 0, 0];
  const w = dims[0] || 0;
  const h = dims[1] || 0;
  const d = dims[2] || 0;
  const unitWeight = props.weight || 0;
  result.push({ width: w, height: h, depth: d, weight: qty * unitWeight, name: 'Без кофра', path });
  return result;
}

// ============================================================
// ЭВРИСТИЧЕСКИЙ АЛГОРИТМ УПАКОВКИ (Corner-Based)
// ============================================================

/**
 * Пытается упаковать предметы в грузовик.
 * @param {object} truck - { width, height, depth (length), maxWeight }
 * @param {Array} items - массив предметов { width, height, depth, weight, name, path }
 * @returns {object} { success, packed, failedItem, reason }
 */
export function packItems(truck, items) {
  // Сортируем по убыванию объёма (упрощённо)
  const sortedItems = [...items].sort((a, b) => {
    const volA = a.width * a.height * a.depth;
    const volB = b.width * b.height * b.depth;
    return volB - volA;
  });

  const packed = [];
  const points = [{ x: 0, y: 0, z: 0 }];
  let currentWeight = 0;
  const maxWeight = truck.maxWeight || Infinity;

  for (let item of sortedItems) {
    if (currentWeight + item.weight > maxWeight) {
      return { success: false, packed, failedItem: item, reason: 'weight' };
    }

    let placed = false;
    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      if (pt.x + item.width <= truck.width &&
          pt.y + item.height <= truck.height &&
          pt.z + item.depth <= truck.depth) {
        let collision = false;
        for (let p of packed) {
          if (pt.x < p.x + p.w && pt.x + item.width > p.x &&
              pt.y < p.y + p.h && pt.y + item.height > p.y &&
              pt.z < p.z + p.d && pt.z + item.depth > p.z) {
            collision = true;
            break;
          }
        }
        if (!collision) {
          packed.push({
            x: pt.x,
            y: pt.y,
            z: pt.z,
            w: item.width,
            h: item.height,
            d: item.depth,
            weight: item.weight,
            name: item.name,
            path: item.path
          });
          currentWeight += item.weight;
          points.splice(i, 1);
          points.push({ x: pt.x + item.width, y: pt.y, z: pt.z });
          points.push({ x: pt.x, y: pt.y + item.height, z: pt.z });
          points.push({ x: pt.x, y: pt.y, z: pt.z + item.depth });
          points.sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
          placed = true;
          break;
        }
      }
    }
    if (!placed) {
      return { success: false, packed, failedItem: item, reason: 'space' };
    }
  }
  return { success: true, packed };
}

// ============================================================
// РАСЧЁТ ЗАГРУЗКИ ПО ВСЕМ ГРУЗОВИКАМ
// ============================================================

/**
 * Распределяет все предметы по выбранным грузовикам последовательно.
 * @param {Array} trucks - массив грузовиков { id, name, width, height, length (depth), maxWeight }
 * @param {Array} allCargo - массив предметов { width, height, depth, weight, name, path }
 * @returns {object} { trucks: [...], totalWeight, totalVolume, failedItems }
 */
export function calculateLoading(trucks, allCargo) {
  if (!trucks || trucks.length === 0) {
    return { trucks: [], totalWeight: 0, totalVolume: 0, failedItems: allCargo.slice() };
  }

  const result = {
    trucks: [],
    totalWeight: 0,
    totalVolume: 0,
    failedItems: []
  };

  let remainingCargo = allCargo.slice();

  for (let truck of trucks) {
    const truckResult = packItems(truck, remainingCargo);
    if (truckResult.success) {
      const truckPack = {
        truckName: truck.name,
        items: truckResult.packed,
        totalWeight: truckResult.packed.reduce((s, i) => s + i.weight, 0),
        totalVolume: truckResult.packed.reduce((s, i) => s + (i.w * i.h * i.d) / 1000000, 0)
      };
      result.trucks.push(truckPack);
      result.totalWeight += truckPack.totalWeight;
      result.totalVolume += truckPack.totalVolume;
      // Удаляем упакованные предметы из оставшихся (по ссылке)
      const packedPaths = truckResult.packed.map(p => p.path + p.name);
      remainingCargo = remainingCargo.filter((item, idx) => {
        return !truckResult.packed.some(p => p.path === item.path && p.name === item.name);
      });
    } else {
      if (truckResult.packed.length > 0) {
        const truckPack = {
          truckName: truck.name + ' (частично)',
          items: truckResult.packed,
          totalWeight: truckResult.packed.reduce((s, i) => s + i.weight, 0),
          totalVolume: truckResult.packed.reduce((s, i) => s + (i.w * i.h * i.d) / 1000000, 0)
        };
        result.trucks.push(truckPack);
        result.totalWeight += truckPack.totalWeight;
        result.totalVolume += truckPack.totalVolume;
        // Удаляем упакованные
        remainingCargo = remainingCargo.filter((item, idx) => {
          return !truckResult.packed.some(p => p.path === item.path && p.name === item.name);
        });
        if (truckResult.failedItem) {
          result.failedItems.push(truckResult.failedItem);
        }
      } else {
        // Ничего не упаковано – все оставшиеся считаем неупакованными
        result.failedItems = remainingCargo.slice();
        break;
      }
    }
    if (remainingCargo.length === 0) break;
  }

  if (remainingCargo.length > 0) {
    // Добавляем оставшиеся, которых не коснулись ни один грузовик
    result.failedItems = result.failedItems.concat(remainingCargo);
  }

  return result;
}

export default {
  getItemDimensions,
  packItems,
  calculateLoading,
};