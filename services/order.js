// services/order.js

import { getState, setStateKey, saveState } from '../core/store.js';

// ============================================================
// ГЕТТЕРЫ
// ============================================================

export function getOrder() {
  return getState().order;
}

export function getOrderValue(path) {
  const state = getState();
  return state.order[path] || 0;
}

export function getTotalQty(path) {
  const state = getState();
  // Сначала проверяем упаковку
  const packing = state.orderPacking[path] || [];
  if (packing.length > 0) {
    const extra = state.orderExtra[path] || 0;
    return packing.reduce((sum, p) => sum + (p.pieces || 0), 0) + extra;
  }
  // Проверяем индивидуальные кофры
  const mode = state.caseModes[path] || { enabled: false };
  const vals = state.individualCaseValues[path] || [];
  if (mode.enabled && vals.length > 0) {
    return vals.reduce((a, b) => a + b, 0);
  }
  // Иначе берём из order
  return state.order[path] || 0;
}

export function getOrderPacking(path) {
  return getState().orderPacking[path] || [];
}

export function getIndividualCaseValues(path) {
  return getState().individualCaseValues[path] || [];
}

export function getOrderExtra(path) {
  return getState().orderExtra[path] || 0;
}

export function getLinks(path) {
  const state = getState();
  if (path) return state.links[path] || [];
  return state.links || {};
}

export function getNote(path) {
  return getState().notes[path] || '';
}

export function getCaseMode(path) {
  const state = getState();
  if (!state.caseModes[path]) {
    state.caseModes[path] = { enabled: false, alt: null, selectedOption: 0, useAlt: false, multiSelected: [], commonSelected: [] };
  }
  return state.caseModes[path];
}

// ============================================================
// СЕТТЕРЫ
// ============================================================

export function setOrderValue(path, value) {
  const state = getState();
  const num = Math.max(0, parseInt(value, 10) || 0);
  if (num > 0) {
    state.order[path] = num;
  } else {
    delete state.order[path];
  }
  // Сохраняем
  saveState();
}

export function setOrderPacking(path, packing) {
  const state = getState();
  if (packing && packing.length > 0) {
    state.orderPacking[path] = packing;
  } else {
    delete state.orderPacking[path];
  }
  saveState();
}

export function setIndividualCaseValues(path, vals) {
  const state = getState();
  if (vals && vals.length > 0) {
    state.individualCaseValues[path] = vals;
  } else {
    delete state.individualCaseValues[path];
  }
  saveState();
}

export function setOrderExtra(path, value) {
  const state = getState();
  const num = Math.max(0, parseInt(value, 10) || 0);
  if (num > 0) {
    state.orderExtra[path] = num;
  } else {
    delete state.orderExtra[path];
  }
  saveState();
}

export function setNote(path, note) {
  const state = getState();
  if (note && note.trim()) {
    state.notes[path] = note.trim();
  } else {
    delete state.notes[path];
  }
  saveState();
}

export function setCaseMode(path, mode) {
  const state = getState();
  const current = getCaseMode(path);
  state.caseModes[path] = { ...current, ...mode };
  saveState();
}

// ============================================================
// УТИЛИТЫ
// ============================================================

export function clearOrder() {
  const state = getState();
  state.order = {};
  state.orderPacking = {};
  state.individualCaseValues = {};
  state.orderExtra = {};
  state.orderSplits = {};
  state.links = {};
  state.notes = {};
  state.caseModes = {};
  saveState();
}

export default {
  getOrder,
  getOrderValue,
  getTotalQty,
  getOrderPacking,
  getIndividualCaseValues,
  getOrderExtra,
  getLinks,
  getNote,
  getCaseMode,
  setOrderValue,
  setOrderPacking,
  setIndividualCaseValues,
  setOrderExtra,
  setNote,
  setCaseMode,
  clearOrder,
};