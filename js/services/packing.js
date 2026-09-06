// services/packing.js
import { getItemPropsByPath, getCommonCases } from '../data/editor-data.js';
import {
  getOrderPacking,
  getIndividualCaseValues,
  getOrderExtra,
} from './order-data.js';
import * as calc from './calculations.js';

// ============================================================
// ПОЛУЧЕНИЕ ГАБАРИТОВ С МЕТАДАННЫМИ
// ============================================================

export function getItemDimensions(path, qty) {
  const props = getItemPropsByPath(path);
  const mode = calc.getCaseMode(path);
  const packing = getOrderPacking(path);
  const result = [];

  // Определяем, можно ли поворачивать предмет (по умолчанию да)
  // Для ферм, длинных профилей – запрещаем поворот, только вдоль длины
  const itemName = path.split('|').pop().toLowerCase();
  const isLongItem = /ферма|балка|профиль|труба|швеллер|уголок|рейка|доска|брус|стропило|ригель|сцена/i.test(itemName);
  const canRotate = !isLongItem; // длинные предметы нельзя поворачивать

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
      result.push({ 
        width: w, height: h, depth: d, 
        weight: totalWeight, 
        name, 
        path,
        canRotate: false, // кофры не поворачиваем
        priority: 10 // высокий приоритет (упаковываем первыми)
      });
      remaining -= unitsInThisCase;
    }
    if (remaining > 0) {
      const dims = props.dimensions ? props.dimensions.split('x').map(s => parseFloat(s.trim())) : [0, 0, 0];
      const w = dims[0] || 0;
      const h = dims[1] || 0;
      const d = dims[2] || 0;
      const unitWeight = props.weight || 0;
      result.push({ 
        width: w, height: h, depth: d, 
        weight: remaining * unitWeight, 
        name: 'Без кофра (остаток)', 
        path,
        canRotate,
        priority: 5
      });
    }
    return result;
  }

  const individualVals = getIndividualCaseValues(path);
  const options = calc.getCaseOptions(path);
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
          name: `Кофр вар.${i+1}`,
          path,
          canRotate: false,
          priority: 8
        });
      }
      if (rem > 0) {
        result.push({
          width: w,
          height: h,
          depth: d,
          weight: rem * unitWeight + emptyWeight,
          name: `Кофр вар.${i+1} (неполн.)`,
          path,
          canRotate: false,
          priority: 8
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
      result.push({ 
        width: w, height: h, depth: d, 
        weight: remaining * unitWeight, 
        name: 'Без кофра (остаток)', 
        path,
        canRotate,
        priority: 5
      });
    }
    return result;
  }

  if (mode.enabled && individualVals.length === 1 && !packing.length && !isMulti) {
    let opt = calc.getSelectedOption(path);
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
      result.push({ 
        width: w, height: h, depth: d, 
        weight: qty * unitWeight, 
        name: 'Без кофра', 
        path,
        canRotate,
        priority: 5
      });
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
        path,
        canRotate: false,
        priority: 8
      });
    }
    if (rem > 0) {
      result.push({
        width: w,
        height: h,
        depth: d,
        weight: rem * unitWeight + emptyWeight,
        name: 'Неполный кофр',
        path,
        canRotate: false,
        priority: 8
      });
    }
    return result;
  }

  const dims = props.dimensions ? props.dimensions.split('x').map(s => parseFloat(s.trim())) : [0, 0, 0];
  const w = dims[0] || 0;
  const h = dims[1] || 0;
  const d = dims[2] || 0;
  const unitWeight = props.weight || 0;
  result.push({ 
    width: w, height: h, depth: d, 
    weight: qty * unitWeight, 
    name: 'Без кофра', 
    path,
    canRotate,
    priority: 5
  });
  return result;
}

// ============================================================
// АЛГОРИТМ УПАКОВКИ (улучшенный, с поворотами и приоритетами)
// ============================================================

export function packItems(truck, items) {
  // Сортируем по приоритету (убывание), затем по весу (убывание), затем по длине (убывание)
  const sortedItems = [...items].sort((a, b) => {
    if (a.priority !== b.priority) return (b.priority || 0) - (a.priority || 0);
    if (a.weight !== b.weight) return b.weight - a.weight;
    return (b.width * b.depth) - (a.width * a.depth);
  });

  const packed = [];
  const points = [{ x: 0, y: 0, z: 0 }];
  let currentWeight = 0;
  const maxWeight = truck.maxWeight || Infinity;
  const maxHeight = truck.height; // высота кузова в см

  for (let item of sortedItems) {
    if (currentWeight + item.weight > maxWeight) {
      return { success: false, packed, failedItem: item, reason: 'weight' };
    }

    // Определяем возможные ориентации
    let orientations = [];
    const w = item.width;
    const h = item.height;
    const d = item.depth;

    if (item.canRotate !== false) {
      // Все 6 ориентаций (перестановки w,h,d)
      const dims = [
        [w, h, d],
        [w, d, h],
        [h, w, d],
        [h, d, w],
        [d, w, h],
        [d, h, w]
      ];
      // Убираем дубликаты (если размеры совпадают)
      const unique = [];
      const seen = new Set();
      for (let arr of dims) {
        const key = arr.join('|');
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(arr);
        }
      }
      orientations = unique.map(arr => ({ w: arr[0], h: arr[1], d: arr[2] }));
    } else {
      // Только одна ориентация (без поворота)
      orientations = [{ w, h, d }];
    }

    let placed = false;
    // Перебираем все точки
    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      // Перебираем ориентации
      for (let orient of orientations) {
        const itemW = orient.w;
        const itemH = orient.h;
        const itemD = orient.d;

        // Проверяем, помещается ли по габаритам
        if (pt.x + itemW <= truck.width &&
            pt.y + itemH <= truck.height &&
            pt.z + itemD <= truck.depth) {
          // Проверяем коллизию с уже упакованными
          let collision = false;
          for (let p of packed) {
            if (pt.x < p.x + p.w && pt.x + itemW > p.x &&
                pt.y < p.y + p.h && pt.y + itemH > p.y &&
                pt.z < p.z + p.d && pt.z + itemD > p.z) {
              collision = true;
              break;
            }
          }
          if (!collision) {
            packed.push({
              x: pt.x,
              y: pt.y,
              z: pt.z,
              w: itemW,
              h: itemH,
              d: itemD,
              weight: item.weight,
              name: item.name,
              path: item.path
            });
            currentWeight += item.weight;
            points.splice(i, 1);
            // Добавляем новые точки (по трём осям)
            points.push({ x: pt.x + itemW, y: pt.y, z: pt.z });
            points.push({ x: pt.x, y: pt.y + itemH, z: pt.z });
            points.push({ x: pt.x, y: pt.y, z: pt.z + itemD });
            // Сортируем точки: сначала по высоте (чтобы заполнять снизу), затем по оси Z, затем X
            points.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
            placed = true;
            break;
          }
        }
      }
      if (placed) break;
    }

    if (!placed) {
      return { success: false, packed, failedItem: item, reason: 'space' };
    }
  }
  return { success: true, packed };
}

// ============================================================
// РАСЧЁТ ЗАГРУЗКИ (без изменений)
// ============================================================

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
      remainingCargo = remainingCargo.filter((item) => {
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
        remainingCargo = remainingCargo.filter((item) => {
          return !truckResult.packed.some(p => p.path === item.path && p.name === item.name);
        });
        if (truckResult.failedItem) {
          result.failedItems.push(truckResult.failedItem);
        }
      } else {
        result.failedItems = remainingCargo.slice();
        break;
      }
    }
    if (remainingCargo.length === 0) break;
  }

  if (remainingCargo.length > 0) {
    result.failedItems = result.failedItems.concat(remainingCargo);
  }

  return result;
}

export default {
  getItemDimensions,
  packItems,
  calculateLoading,
};