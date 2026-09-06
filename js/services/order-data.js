// services/order-data.js
import { getState, saveState, clearCalculationCache, rebuildInstancesIndex } from '../core/state.js';
import { orderRepo } from '../repositories/OrderRepository.js';

// ============================================================
// БАЗОВЫЕ ГЕТТЕРЫ И СЕТТЕРЫ (перенаправление на репозиторий)
// ============================================================

export function getOrder() {
  return orderRepo.getOrder();
}

export function getOrderSplits() {
  return orderRepo.getOrderSplits();
}

export function getLinks() {
  return orderRepo.getLinks();
}

export function getNotes() {
  return orderRepo.getNotes();
}

export function getOrderPacking(path) {
  return orderRepo.getOrderPacking(path);
}

export function getIndividualCaseValues(path) {
  return orderRepo.getIndividualCaseValues(path);
}

export function getCommonRoutes(path) {
  return orderRepo.getCommonRoutes(path);
}

export function getCaseModes() {
  return orderRepo.getCaseModes();
}

export function getOrderExclude() {
  return orderRepo.getOrderExclude();
}

export function getOrderExtra(path) {
  return orderRepo.getOrderExtra(path);
}

// ============================================================
// РАБОТА С СУБАРЕНДОЙ
// ============================================================

export function getOrderSubrent() {
  return orderRepo.getOrderSubrent();
}

export function setOrderSubrent(subrent) {
  orderRepo.setOrderSubrent(subrent);
}

export function addSubrentItem(item) {
  return orderRepo.addSubrentItem(item);
}

export function removeSubrentItem(id) {
  return orderRepo.removeSubrentItem(id);
}

export function updateSubrentItem(id, data) {
  return orderRepo.updateSubrentItem(id, data);
}

// ============================================================
// РАБОТА С ЭКЗЕМПЛЯРАМИ В ЗАКАЗЕ
// ============================================================

export function getOrderInstances(path) {
  return orderRepo.getOrderInstances(path);
}

export function setOrderInstances(path, instanceIds) {
  orderRepo.setOrderInstances(path, instanceIds);
}

export function addOrderInstances(path, instanceIds) {
  orderRepo.addOrderInstances(path, instanceIds);
}

export function removeOrderInstances(path, instanceIds) {
  orderRepo.removeOrderInstances(path, instanceIds);
}

export function clearAllOrderInstances() {
  orderRepo.clearAllOrderInstances();
}

export function getOrderProject() {
  return orderRepo.getOrderProject();
}

export function setOrderProject(projectData) {
  orderRepo.setOrderProject(projectData);
}

export function resetOrderProject() {
  orderRepo.resetOrderProject();
}

// ============================================================
// ФУНКЦИИ ИЗМЕНЕНИЯ ДАННЫХ
// ============================================================

export function setOrderPacking(path, packing) {
  orderRepo.setOrderPacking(path, packing);
}

export function setIndividualCaseValues(path, vals) {
  orderRepo.setIndividualCaseValues(path, vals);
}

export function setCommonRoutes(path, routes) {
  orderRepo.setCommonRoutes(path, routes);
}

export function setOrderExtra(path, val) {
  orderRepo.setOrderExtra(path, val);
}

export function setExcludeFromLoading(path, exclude) {
  orderRepo.setExcludeFromLoading(path, exclude);
}

export function isExcludedFromLoading(path) {
  return orderRepo.isExcludedFromLoading(path);
}

// ============================================================
// ПОЛУЧЕНИЕ ОБЩЕГО КОЛИЧЕСТВА ПОЗИЦИИ
// ============================================================

export function getTotalQty(path) {
  return orderRepo.getTotalQty(path);
}

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
  const subrent = getOrderSubrent();
  for (let item of subrent) {
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
  orderRepo.setOrderValue(path, val);
}

// ============================================================
// РАБОТА С ПРИВЯЗКАМИ (LINKS)
// ============================================================

export function addLink(src, target, multiplier) {
  orderRepo.addLink(src, target, multiplier);
}

export function removeLink(src, target) {
  orderRepo.removeLink(src, target);
}

export function getLinksForSource(src) {
  return orderRepo.getLinksForSource(src);
}

export function getLinksForTarget(target) {
  return orderRepo.getLinksForTarget(target);
}

// ============================================================
// РАБОТА С ЗАМЕТКАМИ
// ============================================================

export function setNote(path, note) {
  orderRepo.setNote(path, note);
}

export function getNote(path) {
  return orderRepo.getNote(path);
}

// ============================================================
// РАБОТА С РЕЖИМАМИ КОФРОВ (caseModes)
// ============================================================

export function getCaseMode(path) {
  return orderRepo.getCaseMode(path);
}

export function setCaseMode(path, mode) {
  orderRepo.setCaseMode(path, mode);
}

// ============================================================
// ОБНОВЛЕНИЕ ПУТЕЙ (перенаправление на репозиторий)
// ============================================================

export function updateOrderPaths(oldPath, newPath) {
  orderRepo.updateSinglePath(oldPath, newPath);
}

export function updateAllPathsOnCategoryRename(oldPrefix, newPrefix) {
  orderRepo.updatePathsOnRename(oldPrefix, newPrefix);
}

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
  getCaseMode,
  setCaseMode,
};