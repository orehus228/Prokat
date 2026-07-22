// services/packaging.js

/**
 * Единый сервис расчёта упаковки.
 * Предоставляет структурированное представление упаковки для позиции,
 * а также вычисляет вес, объём и количество кофров.
 * @module services/packaging
 */

import { getState, getCachedCalculation, setCachedCalculation } from '../core/store.js';
import { CM3_TO_M3 } from '../core/config.js';
import { getItemPropsByPath } from './itemProps.js';
import { getCommonCaseById, getCommonCases } from './commonCases.js';
import {
  getOrderPacking,
  getIndividualCaseValues,
  getOrderExtra,
  getCaseMode,
  getTotalQty,
} from './order.js';

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================

/**
 * Парсит габариты из строки "Д×Ш×В" в числа.
 * @param {string} dimensions - строка габаритов
 * @returns {{ w: number, h: number, d: number }} объект с размерами в см
 */
function parseDimensions(dimensions) {
  if (!dimensions || typeof dimensions !== 'string') {
    return { w: 0, h: 0, d: 0 };
  }
  const parts = dimensions.split('x').map(s => parseFloat(s.trim()));
  if (parts.length === 3 && parts.every(v => !isNaN(v) && v > 0)) {
    return { w: parts[0], h: parts[1], d: parts[2] };
  }
  return { w: 0, h: 0, d: 0 };
}

/**
 * Вычисляет объём в м³ по габаритам (см).
 * @param {string} dimensions - строка габаритов
 * @returns {number} объём в м³
 */
export function parseUnitVolume(dimensions) {
  const { w, h, d } = parseDimensions(dimensions);
  if (w > 0 && h > 0 && d > 0) {
    return (w * h * d) / CM3_TO_M3;
  }
  return 0;
}

// ============================================================
// ТИПЫ ДАННЫХ (JSDoc)
// ============================================================

/**
 * @typedef {Object} Package
 * @property {number} width - ширина в см
 * @property {number} height - высота в см
 * @property {number} depth - глубина в см
 * @property {number} weight - вес в кг
 * @property {string} type - тип упаковки: 'item' | 'individual' | 'common' | 'alt' | 'bulk'
 * @property {string} label - описание (например, "Кофр вариант 1")
 * @property {number} pieces - количество единиц позиции в этом пакете
 */

/**
 * @typedef {Object} PackagingResult
 * @property {Package[]} packages - список пакетов
 * @property {number} totalWeight - общий вес в кг
 * @property {number} totalVolume - общий объём в м³
 * @property {number} totalCases - общее количество кофров (для индивидуальных/общих)
 * @property {number} piecesInCases - количество единиц позиции, упакованных в кофры
 * @property {number} piecesBulk - количество единиц позиции вне кофров
 */

// ============================================================
// ОСНОВНАЯ ФУНКЦИЯ РАСЧЁТА УПАКОВКИ
// ============================================================

/**
 * Рассчитывает упаковку для позиции.
 * @param {string} path - путь позиции
 * @param {number} [qty] - опциональное количество (если не указано, берётся из заказа)
 * @returns {PackagingResult} результат расчёта
 */
export function getPackaging(path, qty) {
  const cacheKey = `packaging_${path}|${qty !== undefined ? qty : 'auto'}`;
  const cached = getCachedCalculation(cacheKey);
  if (cached) return cached;

  const actualQty = qty !== undefined ? qty : getTotalQty(path);
  if (actualQty <= 0) {
    const empty = { packages: [], totalWeight: 0, totalVolume: 0, totalCases: 0, piecesInCases: 0, piecesBulk: 0 };
    setCachedCalculation(cacheKey, empty);
    return empty;
  }

  const props = getItemPropsByPath(path);
  const mode = getCaseMode(path);
  const packing = getOrderPacking(path);
  const individualVals = getIndividualCaseValues(path);
  const extra = getOrderExtra(path);

  // Определяем, какой режим активен
  const isCommonMode = packing.length > 0;
  const isMultiMode = mode.enabled && individualVals.length > 1 && mode.multiSelected && mode.multiSelected.some(v => v === true);
  const isSingleMode = mode.enabled && individualVals.length === 1 && !isCommonMode && !isMultiMode;

  let packages = [];
  let totalCases = 0;
  let piecesInCases = 0;
  let piecesBulk = 0;

  if (isCommonMode) {
    // РЕЖИМ: ОБЩИЕ КОФРЫ
    const commonCases = getCommonCases();
    let remaining = actualQty;
    let extraRemaining = extra || 0;

    for (const pack of packing) {
      const caseObj = getCommonCaseById(pack.caseId);
      if (!caseObj) continue;
      const pieces = Math.min(pack.pieces || 0, remaining);
      if (pieces <= 0) continue;
      const unitWeight = props.weight || 0;
      const dims = parseDimensions(caseObj.dimensions);
      const weight = pieces * unitWeight + (caseObj.emptyWeight || 0);
      packages.push({
        width: dims.w,
        height: dims.h,
        depth: dims.d,
        weight,
        type: 'common',
        label: `Общий кофр: ${caseObj.name}`,
        pieces,
      });
      remaining -= pieces;
      piecesInCases += pieces;
      totalCases += 1; // каждый пакет — это один кофр
    }

    // Вне кофров (extra)
    if (extraRemaining > 0 && remaining > 0) {
      const bulkPieces = Math.min(extraRemaining, remaining);
      const unitWeight = props.weight || 0;
      const dims = parseDimensions(props.dimensions);
      packages.push({
        width: dims.w,
        height: dims.h,
        depth: dims.d,
        weight: bulkPieces * unitWeight,
        type: 'bulk',
        label: 'Вне кофров',
        pieces: bulkPieces,
      });
      remaining -= bulkPieces;
      piecesBulk += bulkPieces;
    }

    // Если остались ещё предметы (не влезли в кофры и extra) — добавляем как bulk
    if (remaining > 0) {
      const unitWeight = props.weight || 0;
      const dims = parseDimensions(props.dimensions);
      packages.push({
        width: dims.w,
        height: dims.h,
        depth: dims.d,
        weight: remaining * unitWeight,
        type: 'bulk',
        label: 'Остаток без упаковки',
        pieces: remaining,
      });
      piecesBulk += remaining;
    }

  } else if (isMultiMode) {
    // РЕЖИМ: МУЛЬТИКОФРЫ
    const options = props.individualCases || [];
    let remaining = actualQty;

    for (let i = 0; i < individualVals.length; i++) {
      const val = individualVals[i] || 0;
      if (val <= 0) continue;
      const opt = options[i] || options[0] || { qty: 1, dimensions: '', weight: 0 };
      const pieces = Math.min(val, remaining);
      if (pieces <= 0) continue;
      const qtyPerCase = opt.qty || 1;
      const casesCount = Math.ceil(pieces / qtyPerCase);
      const unitWeight = props.weight || 0;
      const dims = parseDimensions(opt.dimensions);
      const weightPerCase = (opt.weight || 0) + (qtyPerCase * unitWeight);
      // Добавляем каждый кофр как отдельный пакет
      const fullCases = Math.floor(pieces / qtyPerCase);
      const remainder = pieces % qtyPerCase;
      for (let c = 0; c < fullCases; c++) {
        packages.push({
          width: dims.w,
          height: dims.h,
          depth: dims.d,
          weight: weightPerCase,
          type: 'individual',
          label: `Кофр вар.${i + 1}`,
          pieces: qtyPerCase,
        });
        totalCases++;
        piecesInCases += qtyPerCase;
      }
      if (remainder > 0) {
        const weight = remainder * unitWeight + (opt.weight || 0);
        packages.push({
          width: dims.w,
          height: dims.h,
          depth: dims.d,
          weight,
          type: 'individual',
          label: `Кофр вар.${i + 1} (неполный)`,
          pieces: remainder,
        });
        totalCases++;
        piecesInCases += remainder;
      }
      remaining -= pieces;
    }

    // Остаток, не поместившийся в кофры (если есть)
    if (remaining > 0) {
      const unitWeight = props.weight || 0;
      const dims = parseDimensions(props.dimensions);
      packages.push({
        width: dims.w,
        height: dims.h,
        depth: dims.d,
        weight: remaining * unitWeight,
        type: 'bulk',
        label: 'Остаток без упаковки',
        pieces: remaining,
      });
      piecesBulk += remaining;
    }

  } else if (isSingleMode) {
    // РЕЖИМ: ОДИН КОФР (с возможностью альтернативы)
    const options = props.individualCases || [];
    let opt = options[mode.selectedOption] || options[0];
    let useAlt = mode.useAlt && mode.alt;
    let qtyPerCase, dims, emptyWeight, label;

    if (useAlt) {
      qtyPerCase = mode.alt.qty || 1;
      dims = parseDimensions(mode.alt.dims || '');
      emptyWeight = mode.alt.weight || 0;
      label = 'Альтернативный кофр';
    } else if (opt) {
      qtyPerCase = opt.qty || 1;
      dims = parseDimensions(opt.dimensions);
      emptyWeight = opt.weight || 0;
      label = `Кофр (вар.${(mode.selectedOption || 0) + 1})`;
    } else {
      // Нет ни одного кофра — просто товар без упаковки
      const unitWeight = props.weight || 0;
      const dims = parseDimensions(props.dimensions);
      packages.push({
        width: dims.w,
        height: dims.h,
        depth: dims.d,
        weight: actualQty * unitWeight,
        type: 'item',
        label: 'Без упаковки',
        pieces: actualQty,
      });
      const result = {
        packages,
        totalWeight: actualQty * unitWeight,
        totalVolume: parseUnitVolume(props.dimensions) * actualQty,
        totalCases: 0,
        piecesInCases: 0,
        piecesBulk: actualQty,
      };
      setCachedCalculation(cacheKey, result);
      return result;
    }

    const unitWeight = props.weight || 0;
    let remaining = actualQty;

    // Количество кофров
    const fullCases = Math.floor(remaining / qtyPerCase);
    const remainder = remaining % qtyPerCase;
    for (let c = 0; c < fullCases; c++) {
      packages.push({
        width: dims.w,
        height: dims.h,
        depth: dims.d,
        weight: qtyPerCase * unitWeight + emptyWeight,
        type: 'individual',
        label,
        pieces: qtyPerCase,
      });
      totalCases++;
      piecesInCases += qtyPerCase;
    }
    if (remainder > 0) {
      packages.push({
        width: dims.w,
        height: dims.h,
        depth: dims.d,
        weight: remainder * unitWeight + emptyWeight,
        type: 'individual',
        label: `${label} (неполный)`,
        pieces: remainder,
      });
      totalCases++;
      piecesInCases += remainder;
    }

    // Если почему-то осталось (не должно быть)
    if (remaining > 0) {
      const unitWeight = props.weight || 0;
      const dims = parseDimensions(props.dimensions);
      packages.push({
        width: dims.w,
        height: dims.h,
        depth: dims.d,
        weight: remaining * unitWeight,
        type: 'bulk',
        label: 'Остаток без упаковки',
        pieces: remaining,
      });
      piecesBulk += remaining;
    }

  } else {
    // РЕЖИМ: БЕЗ КОФРОВ (обычный товар)
    const unitWeight = props.weight || 0;
    const dims = parseDimensions(props.dimensions);
    packages.push({
      width: dims.w,
      height: dims.h,
      depth: dims.d,
      weight: actualQty * unitWeight,
      type: 'item',
      label: 'Без упаковки',
      pieces: actualQty,
    });
    piecesBulk = actualQty;
  }

  // Вычисляем итоговые значения
  const totalWeight = packages.reduce((sum, p) => sum + p.weight, 0);
  const totalVolume = packages.reduce((sum, p) => sum + (p.width * p.height * p.depth) / CM3_TO_M3, 0);

  const result = {
    packages,
    totalWeight,
    totalVolume,
    totalCases,
    piecesInCases,
    piecesBulk,
  };

  setCachedCalculation(cacheKey, result);
  return result;
}

// ============================================================
// УПРОЩЁННЫЕ ФУНКЦИИ ДЛЯ СОВМЕСТИМОСТИ
// ============================================================

/**
 * Вычисляет общий вес позиции.
 * @param {string} path - путь позиции
 * @param {number} [qty] - количество (опционально)
 * @returns {number} вес в кг
 */
export function calcItemWeight(path, qty) {
  const result = getPackaging(path, qty);
  return result.totalWeight;
}

/**
 * Вычисляет общий объём позиции.
 * @param {string} path - путь позиции
 * @param {number} [qty] - количество (опционально)
 * @returns {number} объём в м³
 */
export function calcItemVolume(path, qty) {
  const result = getPackaging(path, qty);
  return result.totalVolume;
}

/**
 * Вычисляет количество кофров для позиции.
 * @param {string} path - путь позиции
 * @param {number} [qty] - количество (опционально)
 * @returns {number} количество кофров
 */
export function calcItemCases(path, qty) {
  const result = getPackaging(path, qty);
  return result.totalCases;
}

/**
 * Возвращает список пакетов для загрузки в грузовик.
 * @param {string} path - путь позиции
 * @param {number} [qty] - количество (опционально)
 * @returns {Package[]} массив пакетов
 */
export function getPackagesForLoading(path, qty) {
  const result = getPackaging(path, qty);
  return result.packages;
}

// ============================================================
// ИНВАЛИДАЦИЯ КЭША (вызывается при изменении данных)
// ============================================================

/**
 * Инвалидирует кэш упаковки для конкретного пути.
 * @param {string} path - путь позиции
 */
export function invalidatePackagingCache(path) {
  // Удаляем все ключи, начинающиеся с packaging_{path}|
  // (в кэше могут быть с разными qty)
  const state = getState();
  const cache = state._calcCache;
  const prefix = `packaging_${path}|`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

// ============================================================
// ЭКСПОРТ ПО УМОЛЧАНИЮ
// ============================================================

export default {
  getPackaging,
  parseUnitVolume,
  calcItemWeight,
  calcItemVolume,
  calcItemCases,
  getPackagesForLoading,
  invalidatePackagingCache,
};