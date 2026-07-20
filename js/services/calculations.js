// services/calculations.js
import { getState, getCachedCalculation, setCachedCalculation } from '../core/state.js';

export function parseUnitVolume(dimensions) {
  if (!dimensions || typeof dimensions !== 'string') return 0;
  const parts = dimensions.split('x').map(s => parseFloat(s.trim()));
  if (parts.length === 3 && parts.every(v => !isNaN(v) && v > 0)) {
    return (parts[0] * parts[1] * parts[2]) / 1000000;
  }
  return 0;
}

export function getItemPropsByPath(path) {
  const state = getState();
  const props = state.itemProps[path];
  if (props) {
    return {
      weight: props.weight ?? 0,
      dimensions: props.dimensions ?? '',
      volume: props.volume ?? 0,
      individualCases: props.individualCases ?? [],
      allowCommon: props.allowCommon ?? false,
      commonCases: props.commonCases ?? [],
    };
  }
  return { weight: 0, dimensions: '', volume: 0, individualCases: [], allowCommon: false, commonCases: [] };
}

export function getCommonCases() {
  return getState().commonCases || [];
}

export function getCaseMode(path) {
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
      criteria: 'weight'
    };
  }
  return state.caseModes[path];
}

export function getCaseOptions(path) {
  const props = getItemPropsByPath(path);
  return (props.individualCases || []).map(c => ({
    qty: Number(c.qty) || 0,
    dimensions: c.dimensions || '',
    weight: Number(c.weight) || 0,
    maxCases: Number(c.maxCases) || 0,
  }));
}

export function getSelectedOption(path) {
  const mode = getCaseMode(path);
  const options = getCaseOptions(path);
  if (options.length === 0) return null;
  const idx = mode.selectedOption ?? 0;
  if (idx >= options.length) return options[0];
  return options[idx];
}

export function calcItemWeight(path, qty, mode, packing, individualVals, extra) {
  if (qty <= 0) return 0;
  const props = getItemPropsByPath(path);
  if (!props.weight) return 0;

  const cacheKey = `weight_${path}|${qty}|${mode.enabled}|${mode.selectedOption}|${mode.useAlt ? 'alt' : 'none'}|${mode.accumulate}`;
  const cached = getCachedCalculation(cacheKey);
  if (cached !== undefined) return cached;

  let result = 0;

  if (packing && packing.length > 0) {
    const commonCases = getCommonCases();
    let totalPacked = 0;
    packing.forEach(p => {
      const caseObj = commonCases.find(c => c.id === p.caseId);
      if (caseObj && p.pieces > 0) {
        const emptyWeight = caseObj.emptyWeight || 0;
        const unitWeight = props.weight;
        result += p.pieces * unitWeight + (p.pieces > 0 ? emptyWeight : 0);
        totalPacked += p.pieces;
      }
    });
    const remainder = qty - totalPacked - (extra || 0);
    if (remainder > 0) result += remainder * props.weight;
    if (extra > 0) result += extra * props.weight;
  } else if (individualVals && individualVals.length > 0) {
    const options = getCaseOptions(path);
    if (options.length === 0) {
      result = qty * props.weight;
    } else {
      let totalProcessed = 0;
      individualVals.forEach((v, idx) => {
        if (v <= 0) return;
        const opt = options[idx] || options[0];
        if (mode.accumulate) {
          const casesCount = Math.ceil(v / opt.qty);
          const weightPerCase = (opt.weight || 0) + (opt.qty * props.weight);
          result += casesCount * weightPerCase;
        } else {
          const fullCases = Math.floor(v / opt.qty);
          const rem = v % opt.qty;
          const fullCaseWeight = (opt.weight || 0) + (opt.qty * props.weight);
          result += fullCases * fullCaseWeight;
          if (rem > 0) result += (opt.weight || 0) + (rem * props.weight);
        }
        totalProcessed += v;
      });
      const remainder = qty - totalProcessed;
      if (remainder > 0) result += remainder * props.weight;
    }
  } else {
    result = qty * props.weight;
  }

  setCachedCalculation(cacheKey, result);
  return result;
}

export function calcItemVolume(path, qty, mode, packing, individualVals, extra) {
  if (qty <= 0) return 0;
  const props = getItemPropsByPath(path);
  if (!props.dimensions) return 0;

  const cacheKey = `volume_${path}|${qty}|${mode.enabled}|${mode.selectedOption}|${mode.useAlt ? 'alt' : 'none'}|${mode.accumulate}`;
  const cached = getCachedCalculation(cacheKey);
  if (cached !== undefined) return cached;

  let result = 0;

  if (packing && packing.length > 0) {
    const commonCases = getCommonCases();
    let totalPacked = 0;
    packing.forEach(p => {
      const caseObj = commonCases.find(c => c.id === p.caseId);
      if (caseObj && p.pieces > 0) {
        const caseVolume = parseUnitVolume(caseObj.dimensions);
        result += caseVolume;
        totalPacked += p.pieces;
      }
    });
    const remainder = qty - totalPacked - (extra || 0);
    if (remainder > 0) result += parseUnitVolume(props.dimensions) * remainder;
    if (extra > 0) result += parseUnitVolume(props.dimensions) * extra;
  } else if (individualVals && individualVals.length > 0) {
    const options = getCaseOptions(path);
    if (options.length === 0) {
      result = parseUnitVolume(props.dimensions) * qty;
    } else {
      let totalProcessed = 0;
      individualVals.forEach((v, idx) => {
        if (v <= 0) return;
        const opt = options[idx] || options[0];
        const caseVolume = parseUnitVolume(opt.dimensions);
        if (mode.accumulate) {
          const casesCount = Math.ceil(v / opt.qty);
          result += casesCount * caseVolume;
        } else {
          const fullCases = Math.floor(v / opt.qty);
          const rem = v % opt.qty;
          result += fullCases * caseVolume;
          if (rem > 0) result += caseVolume;
        }
        totalProcessed += v;
      });
      const remainder = qty - totalProcessed;
      if (remainder > 0) result += parseUnitVolume(props.dimensions) * remainder;
    }
  } else {
    result = parseUnitVolume(props.dimensions) * qty;
  }

  setCachedCalculation(cacheKey, result);
  return result;
}

export function calcItemCases(path, qty, mode, individualVals) {
  if (!mode.enabled) return 0;
  const options = getCaseOptions(path);
  if (options.length === 0) return 0;
  if (!individualVals || individualVals.length === 0) return 0;

  let totalCases = 0;
  individualVals.forEach((v, idx) => {
    if (v <= 0) return;
    const opt = options[idx] || options[0];
    if (mode.accumulate) {
      totalCases += Math.ceil(v / opt.qty);
    } else {
      const fullCases = Math.floor(v / opt.qty);
      const rem = v % opt.qty;
      totalCases += fullCases + (rem > 0 ? 1 : 0);
    }
  });
  return totalCases;
}

export function getCalculationData(path) {
  const state = getState();
  const props = getItemPropsByPath(path);
  const mode = getCaseMode(path);
  const packing = state.orderPacking[path] || [];
  const individualVals = state.individualCaseValues[path] || [];
  const extra = state.orderExtra[path] || 0;
  const options = getCaseOptions(path);
  const selectedOption = getSelectedOption(path);
  return { props, mode, packing, individualVals, extra, options, selectedOption };
}

export function calculateTotals(items) {
  let totalWeight = 0;
  let totalVolume = 0;
  let totalQty = 0;

  items.forEach(({ path, qty }) => {
    if (qty <= 0) return;
    const data = getCalculationData(path);
    const weight = calcItemWeight(path, qty, data.mode, data.packing, data.individualVals, data.extra);
    const volume = calcItemVolume(path, qty, data.mode, data.packing, data.individualVals, data.extra);
    totalWeight += weight;
    totalVolume += volume;
    totalQty += qty;
  });

  return { totalWeight, totalVolume, totalQty };
}

// ========== ГРУППОВОЙ ЭКСПОРТ (гарантирует доступность всех имён) ==========
export {
  parseUnitVolume,
  getItemPropsByPath,
  getCommonCases,
  getCaseMode,
  getCaseOptions,
  getSelectedOption,
  calcItemWeight,
  calcItemVolume,
  calcItemCases,
  getCalculationData,
  calculateTotals,
};

// ========== DEFAULT ЭКСПОРТ (для обратной совместимости) ==========
export default {
  parseUnitVolume,
  getItemPropsByPath,
  getCommonCases,
  getCaseMode,
  getCaseOptions,
  getSelectedOption,
  calcItemWeight,
  calcItemVolume,
  calcItemCases,
  getCalculationData,
  calculateTotals,
};