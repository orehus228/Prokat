// components/order/helpers.js
import { getState } from '../../core/state.js';
import { getStockValue, getItemProps, getCommonCases } from '../../data/editor-data.js';
import {
  getOrderPacking,
  getIndividualCaseValues,
  getOrderExtra,
  getTotalQty,
  getLinks,
  setOrderValue,
} from '../../services/order-data.js';
import {
  getCaseMode,
  getCaseOptions,
  getSelectedOption,
  getItemPropsByPath,
  parseUnitVolume,
} from '../../services/calculations.js';
import { esc, getElement } from '../../ui/dom.js';
import { getColorByPercent, getBgColorCSS, buildInfoHtml } from '../../ui/render-utils.js';
import { showToast } from '../../ui/toast.js';

// ============================================================
// КЭШ ПЛОСКОГО СПИСКА ПОЗИЦИЙ
// ============================================================

let flatItemsCache = null;

export function buildFlatItemsList() {
  if (flatItemsCache) return flatItemsCache;
  const state = getState();
  const inventory = state.inventory;
  if (!inventory) return [];
  const result = [];
  const stack = [];
  const orderKeys = state._categoryOrder || Object.keys(inventory);
  orderKeys.forEach(cat => {
    if (inventory[cat] !== undefined) {
      stack.push({ data: inventory[cat], path: [cat] });
    }
  });
  while (stack.length > 0) {
    const { data, path } = stack.pop();
    if (Array.isArray(data)) {
      data.forEach(item => {
        if (typeof item === 'string') {
          const fullPath = path.length ? path.join('|') + '|' + item : item;
          result.push(fullPath);
        }
      });
    } else if (data && typeof data === 'object') {
      const keys = Object.keys(data).filter(k => !k.startsWith('_'));
      for (let i = keys.length - 1; i >= 0; i--) {
        const key = keys[i];
        const child = data[key];
        if (child !== undefined) {
          stack.push({ data: child, path: [...path, key] });
        }
      }
    }
  }
  flatItemsCache = result;
  return result;
}

export function invalidateFlatItemsCache() {
  flatItemsCache = null;
}

// ============================================================
// ПОЛУЧЕНИЕ АКТИВНЫХ ПОЗИЦИЙ ЗАКАЗА
// ============================================================

export function getActiveItemsOrder() {
  const state = getState();
  const items = [];
  const allPaths = new Set();
  for (let p in state.order) allPaths.add(p);
  for (let p in state.orderExtra) allPaths.add(p);
  for (let p in state.orderPacking) allPaths.add(p);
  for (let p in state.individualCaseValues) {
    const vals = state.individualCaseValues[p];
    if (vals.reduce((a, b) => a + b, 0) > 0) allPaths.add(p);
  }
  allPaths.forEach(path => {
    const qty = getTotalQty(path);
    if (qty > 0) items.push({ path, qty });
  });
  return items;
}

// ============================================================
// ОБНОВЛЕНИЕ СЧЁТЧИКА ПРИВЯЗОК
// ============================================================

export function updateLinkCountOrder() {
  const links = getLinks();
  let count = 0;
  for (let src in links) count += links[src].length;
  const el = document.getElementById('linkCount');
  if (el) el.textContent = `(${count} активных)`;
}

// ============================================================
// ИНДИКАТОРЫ ОБЩИХ КОФРОВ (ВЕРХНЯЯ ПАНЕЛЬ)
// ============================================================

export function renderCommonCaseIndicatorsOrder() {
  let indicator = document.getElementById('commonCaseIndicators');
  if (!indicator) {
    const linkCount = document.getElementById('linkCount');
    if (!linkCount?.parentElement) return;
    indicator = document.createElement('span');
    indicator.id = 'commonCaseIndicators';
    indicator.style.cssText = 'font-size:13px;color:var(--text-secondary);margin-left:8px;';
    linkCount.parentElement.appendChild(indicator);
  }
  const usedCases = new Map();
  const state = getState();
  for (let path in state.orderPacking) {
    getOrderPacking(path).forEach(p => {
      if (p.pieces > 0) {
        usedCases.set(p.caseId, (usedCases.get(p.caseId) || 0) + p.pieces);
      }
    });
  }
  if (usedCases.size === 0) {
    indicator.textContent = '';
    return;
  }
  const parts = [];
  usedCases.forEach((pieces, caseId) => {
    const c = getCommonCases().find(x => x.id === caseId);
    parts.push(`[Кофр] ${c?.name || 'Кофр'}: ${pieces} шт`);
  });
  indicator.textContent = parts.join(' · ');
}

// ============================================================
// ОБНОВЛЕНИЕ КНОПКИ "ОБЩИЕ КОФРЫ" В РЕДАКТОРЕ
// ============================================================

export function updateCommonCasesButton() {
  const btn = document.getElementById('manageCasesBtn');
  if (!btn) return;
  const allCommonCases = getCommonCases();
  if (allCommonCases.length === 0) {
    btn.textContent = 'Общие кофры (0)';
    btn.style.backgroundColor = '';
    btn.style.color = '';
    btn.style.borderColor = '';
    return;
  }
  const stats = new Map();
  allCommonCases.forEach(c => stats.set(c.id, { totalWeight: 0, maxWeight: c.maxWeight || 0 }));
  const state = getState();
  for (let path in state.orderPacking) {
    const packing = getOrderPacking(path);
    const props = getItemPropsByPath(path);
    const unitWeight = props.weight || 0;
    packing.forEach(p => {
      const stat = stats.get(p.caseId);
      if (stat) stat.totalWeight += p.pieces * unitWeight;
    });
  }
  let totalFill = 0, count = 0;
  stats.forEach(stat => {
    if (stat.maxWeight > 0) {
      totalFill += Math.min(100, (stat.totalWeight / stat.maxWeight) * 100);
      count++;
    }
  });
  const avgFill = count > 0 ? totalFill / count : 0;
  const { r, g, b } = getColorByPercent(avgFill);
  const color = `rgb(${r}, ${g}, ${b})`;
  btn.textContent = `Общие кофры (${Math.round(avgFill)}%)`;
  btn.style.backgroundColor = color;
  btn.style.color = '#fff';
  btn.style.borderColor = color;
}

// ============================================================
// ОБНОВЛЕНИЕ ВСЕХ ИНДИКАТОРОВ ЗАПОЛНЕНИЯ КОФРОВ
// ============================================================

export function updateAllCommonCaseIndicators() {
  setTimeout(() => {
    const allCommonCases = getCommonCases();
    const stats = new Map();
    allCommonCases.forEach(c => {
      stats.set(c.id, {
        totalWeight: 0,
        totalVolume: 0,
        maxWeight: c.maxWeight || 0,
        maxVolume: c.maxVolume || 0,
        name: c.name || 'Кофр',
        dimensions: c.dimensions || '',
      });
    });

    const state = getState();
    for (let path in state.orderPacking) {
      const packing = getOrderPacking(path);
      const props = getItemPropsByPath(path);
      const unitWeight = props.weight || 0;
      const unitVolume = parseUnitVolume(props.dimensions);
      packing.forEach(p => {
        if (p.pieces <= 0) return;
        const stat = stats.get(p.caseId);
        if (!stat) return;
        stat.totalWeight += p.pieces * unitWeight;
        stat.totalVolume += p.pieces * unitVolume;
      });
    }

    const container = document.getElementById('categoryContents');
    if (!container) return;
    container.querySelectorAll('.child-controls[data-caseid]').forEach(controls => {
      const caseId = controls.dataset.caseid;
      const stat = stats.get(caseId);
      if (!stat) return;
      const fillPercent = stat.maxWeight > 0 ? Math.min(100, Math.round((stat.totalWeight / stat.maxWeight) * 100)) : 0;
      const bgColor = getBgColorCSS(fillPercent, 0.25);
      controls.style.backgroundColor = bgColor;

      let percentSpan = controls.querySelector('.case-fill-percent');
      if (!percentSpan) {
        percentSpan = document.createElement('span');
        percentSpan.className = 'case-fill-percent';
        percentSpan.style.cssText = 'font-size:11px;margin-left:4px;font-weight:bold;';
        controls.appendChild(percentSpan);
      }
      percentSpan.textContent = `${fillPercent}%`;
      percentSpan.style.color = '#fff';
      percentSpan.style.textShadow = '0 0 6px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.8)';

      const allSpans = controls.querySelectorAll('span:not(.case-fill-percent), input, button');
      allSpans.forEach(el => {
        el.style.color = '#fff';
        el.style.textShadow = '0 0 6px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.8)';
      });
    });
    updateCommonCasesButton();
  }, 50);
}

// ============================================================
// ОБНОВЛЕНИЕ ДОЧЕРНИХ СТРОК (КОФРЫ, МУЛЬТИ)
// ============================================================

export function updateChildRowsForPath(path) {
  const parentRow = document.querySelector(`#categoryContents .row[data-path="${path}"]`);
  if (!parentRow) return;
  let next = parentRow.nextElementSibling;
  while (next && next.classList.contains('child-row')) {
    const toRemove = next;
    next = next.nextElementSibling;
    toRemove.remove();
  }

  const mode = getCaseMode(path);
  const options = getCaseOptions(path);
  const isMulti = mode.multiSelected && mode.multiSelected.some(v => v === true);
  const packing = getOrderPacking(path);
  const hasCommonPacking = packing.length > 0;
  const individualVals = getIndividualCaseValues(path);
  const props = getItemPropsByPath(path);
  const commonCases = getCommonCases();

  if (isMulti && mode.enabled && options.length > 1) {
    const childDiv = document.createElement('div');
    childDiv.className = 'child-row';
    childDiv.dataset.parent = path;
    childDiv.style.width = '100%';
    childDiv.style.flexBasis = '100%';
    childDiv.style.padding = '6px 12px';
    childDiv.style.borderRadius = '6px';
    childDiv.style.margin = '4px 0';
    childDiv.style.border = '1px solid var(--border-light)';
    let html = `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:4px;font-size:13px;color:var(--text-secondary);">
      <strong>Распределение по вариантам кофров</strong>
      <span style="margin-left:auto;">Итого: ${individualVals.reduce((a, b) => a + b, 0)} шт</span>
    </div>`;
    options.forEach((opt, idx) => {
      const val = individualVals[idx] || 0;
      const casesCount = Math.ceil(val / opt.qty);
      const maxPossible = getStockValue(path);
      const maxCases = opt.maxCases || 0;
      html += `<div class="child-controls" style="display:flex;flex-wrap:nowrap;align-items:center;gap:4px;padding:4px 8px;background:var(--bg-input);border-radius:4px;margin:2px 0;border-left:3px solid var(--text-muted);">
        <span style="font-weight:500;min-width:70px;font-size:13px;">Вар.${idx + 1}</span>
        <span style="font-size:11px;color:var(--text-secondary);min-width:30px;">шт:</span>
        <button class="btn-c child-multi-piece-btn" style="width:26px;height:26px;font-size:13px;flex-shrink:0;" data-path="${path}" data-idx="${idx}" data-delta="-1">−</button>
        <input type="number" class="child-multi-pieces" data-path="${path}" data-idx="${idx}" value="${val}" min="0" step="1" max="${maxPossible}" style="width:44px;padding:2px 4px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:4px;color:var(--text-primary);text-align:center;font-size:13px;flex-shrink:0;">
        <button class="btn-c child-multi-piece-btn" style="width:26px;height:26px;font-size:13px;flex-shrink:0;" data-path="${path}" data-idx="${idx}" data-delta="1">+</button>
        <span style="font-size:11px;color:var(--text-secondary);min-width:35px;">кофры:</span>
        <button class="btn-c child-multi-case-btn" style="width:26px;height:26px;font-size:13px;flex-shrink:0;" data-path="${path}" data-idx="${idx}" data-delta="-1">−</button>
        <input type="number" class="child-multi-cases" data-path="${path}" data-idx="${idx}" value="${casesCount}" min="0" step="1" style="width:44px;padding:2px 4px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:4px;color:var(--text-primary);text-align:center;font-size:13px;flex-shrink:0;">
        <button class="btn-c child-multi-case-btn" style="width:26px;height:26px;font-size:13px;flex-shrink:0;" data-path="${path}" data-idx="${idx}" data-delta="1">+</button>
        <span style="font-size:11px;color:var(--text-muted);min-width:60px;">${maxCases > 0 ? `макс.${maxCases}` : ''}</span>
        <span style="font-size:11px;color:var(--text-muted);min-width:70px;">${opt.dimensions || 'н/д'}</span>
        <span style="font-size:11px;color:var(--text-muted);min-width:50px;">вес:${opt.weight || 0}</span>
      </div>`;
    });
    childDiv.innerHTML = html;
    parentRow.after(childDiv);
    return;
  }

  if (hasCommonPacking) {
    const extra = getOrderExtra(path);
    const childDiv = document.createElement('div');
    childDiv.className = 'child-row';
    childDiv.dataset.parent = path;
    childDiv.style.width = '100%';
    childDiv.style.flexBasis = '100%';
    childDiv.style.padding = '6px 12px';
    childDiv.style.borderRadius = '6px';
    childDiv.style.margin = '4px 0';
    childDiv.style.border = '1px solid var(--border-light)';
    let html = `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:4px;font-size:13px;color:var(--text-secondary);">
      <strong>Упаковка в общие кофры</strong>
      <span style="margin-left:auto;">Вне кофра: ${extra} шт</span>
    </div>`;
    const maxExtra = getStockValue(path);
    html += `<div class="child-controls" style="display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:4px 8px;background:var(--bg-input);border-radius:4px;margin:2px 0;border-left:3px solid var(--text-muted);">
      <span style="font-weight:500;min-width:70px;font-size:13px;">Вне кофра</span>
      <button class="btn-c child-extra-btn" style="width:26px;height:26px;font-size:13px;" data-path="${path}" data-delta="-1">−</button>
      <input type="number" class="child-extra-qty" data-path="${path}" value="${extra}" min="0" step="1" max="${maxExtra}" style="width:44px;padding:2px 4px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:4px;color:var(--text-primary);text-align:center;font-size:13px;">
      <button class="btn-c child-extra-btn" style="width:26px;height:26px;font-size:13px;" data-path="${path}" data-delta="1">+</button>
    </div>`;
    packing.forEach((p) => {
      const c = commonCases.find(c => c.id === p.caseId);
      const name = c ? c.name : 'удалённый кофр';
      const qty = p.pieces || 0;
      const maxPack = c ? c.qty : 0;
      const unitWeight = props.weight || 0;
      const filledWeight = qty * unitWeight;
      const maxWeight = c?.maxWeight || Infinity;
      let fillPercent = 0;
      if (maxWeight > 0) fillPercent = Math.min(100, Math.round((filledWeight / maxWeight) * 100));
      // Убрали кнопку remove-common-pack
      html += `<div class="child-controls" data-caseid="${p.caseId}" style="display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:4px 8px;background:var(--bg-input);border-radius:4px;margin:2px 0;border-left:3px solid var(--text-muted);">
        <span style="font-weight:500;min-width:70px;font-size:13px;">${esc(name)}</span>
        <span style="font-size:11px;color:var(--text-secondary);min-width:30px;">шт:</span>
        <button class="btn-c child-common-btn" style="width:26px;height:26px;font-size:13px;" data-path="${path}" data-caseid="${p.caseId}" data-delta="-1">−</button>
        <input type="number" class="child-common-qty" data-path="${path}" data-caseid="${p.caseId}" value="${qty}" min="0" step="1" max="${maxPack}" style="width:44px;padding:2px 4px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:4px;color:var(--text-primary);text-align:center;font-size:13px;">
        <button class="btn-c child-common-btn" style="width:26px;height:26px;font-size:13px;" data-path="${path}" data-caseid="${p.caseId}" data-delta="1">+</button>
        <span class="case-fill-percent" style="font-size:11px;color:var(--text-secondary);font-weight:bold;">${fillPercent}%</span>
        <span style="font-size:11px;color:var(--text-muted);min-width:70px;">${c?.dimensions || 'н/д'}</span>
        <span style="font-size:11px;color:var(--text-muted);min-width:50px;">вес:${c?.emptyWeight || 0}</span>
      </div>`;
    });
    childDiv.innerHTML = html;
    parentRow.after(childDiv);
    updateAllCommonCaseIndicators();
  }
}

// ============================================================
// ЭКСПОРТ ПО УМОЛЧАНИЮ
// ============================================================
export default {
  buildFlatItemsList,
  invalidateFlatItemsCache,
  getActiveItemsOrder,
  updateLinkCountOrder,
  renderCommonCaseIndicatorsOrder,
  updateCommonCasesButton,
  updateAllCommonCaseIndicators,
  updateChildRowsForPath,
};