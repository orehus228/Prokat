// ui/components/order/OrderTotals.js

import { getState } from '../../../core/store.js';
import { getCategory } from '../../../core/utils.js';
import { getTotalQty } from '../../../services/order.js';
import { getPackaging } from '../../../services/packaging.js';
import { formatWeight, formatVolume } from '../../render-utils.js';
import { CAT_NAMES } from '../../../core/config.js';

/**
 * Обновляет глобальные итоги (количество, вес, объём) и детали по категориям.
 */
export function updateTotals() {
  const state = getState();
  const allPaths = new Set();

  for (const p in state.order) if (state.order[p] > 0) allPaths.add(p);
  for (const p in state.orderExtra) if (state.orderExtra[p] > 0) allPaths.add(p);
  for (const p in state.orderPacking) {
    const packing = state.orderPacking[p] || [];
    if (packing.some(item => item.pieces > 0)) allPaths.add(p);
  }
  for (const p in state.individualCaseValues) {
    const vals = state.individualCaseValues[p] || [];
    if (vals.some(v => v > 0)) allPaths.add(p);
  }

  let totalQty = 0, totalWeight = 0, totalVolume = 0;
  const catMap = {};

  for (const path of allPaths) {
    const qty = getTotalQty(path);
    if (qty <= 0) continue;
    totalQty += qty;
    const packResult = getPackaging(path, qty);
    totalWeight += packResult.totalWeight;
    totalVolume += packResult.totalVolume;

    const cat = getCategory(path);
    if (!catMap[cat]) catMap[cat] = { qty: 0, weight: 0, volume: 0 };
    catMap[cat].qty += qty;
    catMap[cat].weight += packResult.totalWeight;
    catMap[cat].volume += packResult.totalVolume;
  }

  const qtyEl = document.getElementById('totalQty');
  const weightEl = document.getElementById('totalWeight');
  const volumeEl = document.getElementById('totalVolume');
  if (qtyEl) qtyEl.textContent = totalQty;
  if (weightEl) weightEl.textContent = totalWeight.toFixed(1);
  if (volumeEl) volumeEl.textContent = totalVolume.toFixed(3);

  const detailsDiv = document.getElementById('globalDetails');
  if (detailsDiv) {
    let html = '';
    const orderKeys = state._categoryOrder || Object.keys(state.inventory);
    orderKeys.forEach(cat => {
      if (!catMap[cat]) return;
      const d = catMap[cat];
      html += `<div class="cat-detail"><strong>${CAT_NAMES[cat] || cat}</strong><br>${d.qty} шт<br>${formatWeight(d.weight)}<br>${formatVolume(d.volume)}</div>`;
    });
    detailsDiv.innerHTML = html || '';
  }
}

/**
 * Обновляет итоги по конкретной категории.
 * @param {string} catKey - ключ категории
 */
export function updateCategoryTotals(catKey) {
  const container = document.querySelector('#categoryContents');
  if (!container) return;
  const totalsDiv = container.querySelector('#categoryTotals');
  if (!totalsDiv) return;

  const state = getState();
  const allPaths = new Set();
  const prefix = catKey + '|';

  for (const p in state.order) if (state.order[p] > 0 && p.startsWith(prefix)) allPaths.add(p);
  for (const p in state.orderExtra) if (state.orderExtra[p] > 0 && p.startsWith(prefix)) allPaths.add(p);
  for (const p in state.orderPacking) if (p.startsWith(prefix)) {
    const packing = state.orderPacking[p] || [];
    if (packing.some(item => item.pieces > 0)) allPaths.add(p);
  }
  for (const p in state.individualCaseValues) if (p.startsWith(prefix)) {
    const vals = state.individualCaseValues[p] || [];
    if (vals.some(v => v > 0)) allPaths.add(p);
  }

  let qty = 0, weight = 0, volume = 0;
  for (const path of allPaths) {
    const q = getTotalQty(path);
    if (q <= 0) continue;
    qty += q;
    const packResult = getPackaging(path, q);
    weight += packResult.totalWeight;
    volume += packResult.totalVolume;
  }

  let html = `<span>Итого в категории: ${qty} шт</span>`;
  if (weight > 0) html += `<span>Вес: ${formatWeight(weight)}</span>`;
  if (volume > 0) html += `<span>Объём: ${formatVolume(volume)}</span>`;
  totalsDiv.innerHTML = html;
}

/**
 * Обновляет счётчик активных привязок (линков).
 */
export function updateLinkCount() {
  const state = getState();
  const links = state.links || {};
  let count = 0;
  for (const src in links) count += links[src].length;
  const el = document.getElementById('linkCount');
  if (el) el.textContent = `(${count} активных)`;
}