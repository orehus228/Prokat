// components/order/render.js
import { getState, setStateKey, saveState } from '../../core/state.js';
import { getStockValue, getItemProps, getCommonCases } from '../../data/editor-data.js';
import {
  getOrderPacking,
  getIndividualCaseValues,
  getOrderExtra,
  getTotalQty,
  getLinks,
  getNotes,
  setOrderValue,
  setNote,
} from '../../services/order-data.js';
import * as calc from '../../services/calculations.js';
import { CAT_NAMES } from '../../core/config.js';
import { esc, getElement, debounce } from '../../ui/dom.js';
import { showToast, queueToast } from '../../ui/toast.js';
import { showPrompt, showConfirm } from '../../ui/modal.js';
import {
  buildInfoHtml,
  getColorCSS,
  formatWeight,
  formatVolume,
} from '../../ui/render-utils.js';
import {
  buildFlatItemsList,
  invalidateFlatItemsCache,
  getActiveItemsOrder,
  updateLinkCountOrder,
  renderCommonCaseIndicatorsOrder,
  updateAllCommonCaseIndicators,
  updateChildRowsForPath,
} from './helpers.js';

export let currentOrderCategory = 'sound';
let searchModeOrder = false;
let searchQueryOrder = '';
let detailsOpenOrder = false;
const infoBlocksOpen = {};

export function setCurrentCategory(cat) { currentOrderCategory = cat; }
export function setSearchMode(mode) { searchModeOrder = mode; }
export function setSearchQuery(query) { searchQueryOrder = query; }
export function toggleDetailsOpen() {
  detailsOpenOrder = !detailsOpenOrder;
  localStorage.setItem('detailsOpenOrder', JSON.stringify(detailsOpenOrder));
}
export function toggleInfoBlock(path) { infoBlocksOpen[path] = !infoBlocksOpen[path]; }
export function resetInfoBlocks() {
  for (let key in infoBlocksOpen) delete infoBlocksOpen[key];
  document.querySelectorAll('.row-info').forEach(el => el.remove());
  document.querySelectorAll('.info-btn').forEach(btn => { btn.textContent = 'Инфо'; });
}

export function renderOrderTabs() {
  const container = document.getElementById('categoryTabs');
  if (!container) return;
  container.innerHTML = '';
  const state = getState();
  let orderKeys = state._categoryOrder || Object.keys(state.inventory);
  orderKeys = orderKeys.filter(key => state.inventory && state.inventory[key] !== undefined);
  if (orderKeys.length === 0) {
    container.innerHTML = '<div class="empty-message">Нет категорий</div>';
    return;
  }
  orderKeys.forEach(key => {
    const tab = document.createElement('div');
    tab.className = 'category-tab' + (key === currentOrderCategory ? ' active' : '');
    tab.textContent = CAT_NAMES[key] || key;
    tab.dataset.cat = key;
    tab.addEventListener('click', () => {
      if (searchModeOrder) {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.value = '';
        searchModeOrder = false;
        searchQueryOrder = '';
      }
      currentOrderCategory = key;
      renderOrderTabs();
      renderOrderCategory(key);
      setupInputListenersOrder();
      updateTotalsOrder();
      updateLinkCountOrder();
      renderCommonCaseIndicatorsOrder();
    });
    container.appendChild(tab);
  });
  if (!orderKeys.includes(currentOrderCategory)) {
    currentOrderCategory = orderKeys[0];
  }
}

export function renderOrderCategory(catKey, filterQuery = '') {
  const container = document.getElementById('categoryContents');
  if (!container) return;
  const wrapper = document.createElement('div');
  wrapper.className = 'category-content active';
  container.innerHTML = '';
  container.appendChild(wrapper);

  const query = (filterQuery || searchQueryOrder || '').toLowerCase().trim();
  const isSearchMode = !!query;

  if (isSearchMode) {
    const allPaths = buildFlatItemsList();
    const filteredPaths = allPaths.filter(path => {
      const name = path.split('|').pop().toLowerCase();
      const state = getState();
      const spec = (state.specs && state.specs[path] || '').toLowerCase();
      return name.includes(query) || spec.includes(query);
    });
    if (filteredPaths.length === 0) {
      wrapper.innerHTML = '<div class="empty-message">Ничего не найдено</div>';
      return;
    }
    const grouped = {};
    filteredPaths.forEach(path => {
      const cat = path.split('|')[0];
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(path);
    });
    let html = '';
    const state = getState();
    const orderKeys = state._categoryOrder || Object.keys(state.inventory);
    orderKeys.forEach(cat => {
      if (!grouped[cat]) return;
      html += `<div class="sub-cat-t">${CAT_NAMES[cat] || cat}</div>`;
      grouped[cat].forEach(path => {
        html += buildItemRow(path, 1);
      });
    });
    wrapper.innerHTML = html;
    searchModeOrder = true;
    currentOrderCategory = 'all';
  } else {
    searchModeOrder = false;
    const state = getState();
    if (catKey === 'all') {
      const first = state._categoryOrder?.[0] || Object.keys(state.inventory)[0];
      if (first) {
        currentOrderCategory = first;
        renderOrderCategory(first);
      } else {
        wrapper.innerHTML = '<div class="empty-message">Нет категорий</div>';
      }
      return;
    }
    const catData = state.inventory[catKey];
    if (!catData) {
      wrapper.innerHTML = '<div class="empty-message">Категория пуста</div>';
      return;
    }
    wrapper.innerHTML = buildCategoryHTML(catData, [catKey], 0);
    currentOrderCategory = catKey;
  }

  setupInputListenersOrder();

  document.querySelectorAll('#categoryContents .row').forEach(row => {
    const path = row.dataset.path;
    if (path) updateRowOrder(path);
  });

  if (!searchModeOrder) updateCategoryTotalsOrder(catKey);
  updateTotalsOrder();
  updateLinkCountOrder();
  const details = document.getElementById('globalDetails');
  const toggle = document.getElementById('detailToggle');
  if (detailsOpenOrder) {
    if (details) details.classList.add('open');
    if (toggle) toggle.textContent = 'Скрыть';
  } else {
    if (details) details.classList.remove('open');
    if (toggle) toggle.textContent = 'Подробно';
  }
  renderCommonCaseIndicatorsOrder();
  updateAllCommonCaseIndicators();
}

function buildCategoryHTML(data, path, level) {
  if (level > 15) { console.warn('Превышена глубина обхода', path); return ''; }
  let html = '';
  if (Array.isArray(data)) {
    data.forEach(item => {
      if (typeof item === 'string') {
        const fullPath = path.length ? path.join('|') + '|' + item : item;
        html += buildItemRow(fullPath, level);
      }
    });
    return html;
  } else if (data && typeof data === 'object') {
    const keys = Object.keys(data).filter(k => !k.startsWith('_'));
    keys.forEach(key => {
      const childPath = [...path, key];
      const isSubSub = level >= 2;
      if (isSubSub) html += `<div class="sub-sub-cat-t">${esc(key)}</div>`;
      else html += `<div class="sub-cat-t">${esc(key)}</div>`;
      html += buildCategoryHTML(data[key], childPath, level + 1);
    });
    return html;
  }
  return '';
}

export function buildItemRow(fullPath, level) {
  const state = getState();
  const sq = parseInt(getStockValue(fullPath)) || 0;
  const hasDesc = !!(state.specs && state.specs[fullPath]);
  const hasLink = state.links[fullPath] && state.links[fullPath].length > 0;
  const props = calc.getItemPropsByPath(fullPath);
  
  const hasIndividualCases = props.individualCases && props.individualCases.length > 0;
  const hasCommonCases = props.allowCommon;
  const hasCase = hasIndividualCases || hasCommonCases;
  
  const mode = calc.getCaseMode(fullPath);
  const isMulti = mode.enabled && hasIndividualCases && props.individualCases.length > 1 && 
                  mode.multiSelected && mode.multiSelected.some(v => v === true);
  
  const packing = getOrderPacking(fullPath);
  const hasCommonPacking = packing.length > 0;
  const individualVals = getIndividualCaseValues(fullPath);
  const options = calc.getCaseOptions(fullPath);

  const totalQty = parseInt(getTotalQty(fullPath)) || 0;

  const overstock = totalQty > sq;
  const isInfoOpen = infoBlocksOpen[fullPath] || false;
  const hasNote = !!(state.notes[fullPath] && state.notes[fullPath].trim());
  const isCaseModeOn = mode.enabled || false;

  let caseStatusText = 'Кофры';
  let caseStatusClass = '';
  let extraCaseInfo = '';

  if (hasCommonPacking) {
    caseStatusText = 'Общие';
    caseStatusClass = 'common';
    const totalPieces = packing.reduce((s, p) => s + (p.pieces || 0), 0);
    extraCaseInfo = `[Кофр] ${packing.length} шт (${totalPieces} шт)`;
  } else if (isMulti) {
    caseStatusText = 'Мульти';
    caseStatusClass = 'multi';
    const totalCases = individualVals.reduce((sum, v, idx) => {
      if (v <= 0) return sum;
      const opt = options[idx] || options[0];
      return sum + Math.ceil(v / opt.qty);
    }, 0);
    extraCaseInfo = `[Мульти] ${totalCases} кофр${totalCases > 1 ? 'а' : ''}`;
  } else if (mode.enabled && individualVals.length === 1 && !packing.length && !isMulti && hasIndividualCases) {
    const opt = calc.getSelectedOption(fullPath);
    const val = individualVals[0] || 0;
    if (opt && val > 0) {
      const casesCount = Math.ceil(val / opt.qty);
      caseStatusText = 'Вкл';
      caseStatusClass = 'on';
      extraCaseInfo = `[Кофр] ${casesCount} шт`;
    } else {
      caseStatusText = 'Выкл';
      caseStatusClass = 'off';
    }
  } else if (hasCase) {
    caseStatusText = hasIndividualCases ? 'Выкл' : 'Кофры';
    caseStatusClass = 'off';
  } else {
    caseStatusText = '';
    caseStatusClass = '';
  }

  let weightDisplay = '0 кг';
  let volumeDisplay = '0 м³';
  if (totalQty > 0) {
    const data = calc.getCalculationData(fullPath);
    const weight = calc.calcItemWeight(fullPath, totalQty, data.mode, data.packing, data.individualVals, data.extra);
    const volume = calc.calcItemVolume(fullPath, totalQty, data.mode, data.packing, data.individualVals, data.extra);
    weightDisplay = formatWeight(weight);
    volumeDisplay = formatVolume(volume);
  }

  const infoHtml = buildInfoHtml(fullPath, props, mode);
  const escapedName = esc(fullPath.split('|').pop());
  const isAdded = totalQty > 0;
  const rowClass = (isAdded ? 'added' : '') + (overstock ? ' overstock' : '');

  const linkClass = hasLink ? 'active' : '';
  const noteClass = hasNote ? 'has-note' : '';
  const caseClass = isCaseModeOn ? 'active' : '';

  let extraInfo = '';
  if (totalQty > 0 || sq > 0) {
    extraInfo = `<div class="extra-info">
      <span><strong>${totalQty}</strong> шт добавлено</span>
      <span>в наличии: <strong>${sq}</strong></span>
      ${weightDisplay !== '0 кг' ? `<span>${weightDisplay}</span>` : ''}
      ${volumeDisplay !== '0 м³' ? `<span>${volumeDisplay}</span>` : ''}
      ${extraCaseInfo ? `<span>${extraCaseInfo}</span>` : ''}
    </div>`;
  }

  let html = `<div class="row ${rowClass}" data-path="${esc(fullPath)}" data-search="${fullPath}">
    <div class="name-area">
      <span class="name">${escapedName}</span>
      ${extraInfo}
    </div>
    <div class="action-buttons">
      <button class="action-btn info-btn" data-path="${esc(fullPath)}" title="Информация">Инфо</button>
      ${hasDesc ? `<button class="action-btn desc-btn" data-path="${esc(fullPath)}">Описание</button>` : ''}
      <button class="action-btn link-btn ${linkClass}" data-path="${esc(fullPath)}" title="Линк">Линк${hasLink ? ' ✓' : ''}</button>
      ${hasCase ? `<button class="action-btn case-btn ${caseClass} ${caseStatusClass}" data-path="${esc(fullPath)}" title="Настройка кофров">${caseStatusText || 'Кофры'}</button>` : ''}
      <button class="action-btn note-btn ${noteClass}" data-path="${esc(fullPath)}" title="Заметка">Заметка${hasNote ? ' ✓' : ''}</button>
    </div>
    <div class="qty-controls">
      ${renderQtyControls(fullPath)}
    </div>
  </div>`;
  if (isInfoOpen) {
    html += `<div class="row-info">${infoHtml}</div>`;
  }
  if (hasDesc) {
    html += `<div class="desc-block" data-path="${esc(fullPath)}">${esc(state.specs[fullPath])}</div>`;
  }
  if (hasLink) {
    state.links[fullPath].forEach(link => {
      html += `<div style="font-size:13px;color:var(--text-secondary);padding-left:${level * 20 + 20}px;width:100%;flex-basis:100%;">→ ${esc(link.target)} (×${esc(String(link.multiplier))})</div>`;
    });
  }

  return html;
}

function renderQtyControls(path) {
  const mode = calc.getCaseMode(path);
  const individualVals = getIndividualCaseValues(path);
  const packing = getOrderPacking(path);
  const options = calc.getCaseOptions(path);
  const totalQty = parseInt(getTotalQty(path)) || 0;
  const isMulti = mode.enabled && options.length > 1 && mode.multiSelected && mode.multiSelected.some(v => v === true);

  if (!mode.enabled || (!packing.length && individualVals.length === 0 && !isMulti)) {
    return `
      <button class="btn-c qty-btn" data-path="${path}" data-delta="-1">−</button>
      <input type="number" class="qty-input" value="${totalQty}" min="0" step="1" data-path="${path}">
      <button class="btn-c qty-btn" data-path="${path}" data-delta="1">+</button>
    `;
  }

  if (mode.enabled && individualVals.length === 1 && !packing.length && !isMulti) {
    const opt = calc.getSelectedOption(path);
    const pieces = individualVals[0] || 0;
    const casesCount = opt && opt.qty > 0 ? Math.ceil(pieces / opt.qty) : 0;
    const maxCases = opt?.maxCases || 0;
    return `
      <div style="display:flex;align-items:center;gap:4px;">
        <span style="font-size:12px;color:var(--text-secondary);">шт:</span>
        <button class="btn-c single-piece-btn" data-path="${path}" data-delta="-1" style="width:28px;height:28px;font-size:14px;">−</button>
        <input type="number" class="single-pieces-input" value="${pieces}" min="0" step="1" data-path="${path}" style="width:50px;padding:2px;text-align:center;font-size:13px;">
        <button class="btn-c single-piece-btn" data-path="${path}" data-delta="1" style="width:28px;height:28px;font-size:14px;">+</button>
        <span style="font-size:12px;color:var(--text-secondary);">кофры:</span>
        <button class="btn-c single-case-btn" data-path="${path}" data-delta="-1" style="width:28px;height:28px;font-size:14px;">−</button>
        <input type="number" class="single-cases-input" value="${casesCount}" min="0" step="1" data-path="${path}" style="width:50px;padding:2px;text-align:center;font-size:13px;">
        <button class="btn-c single-case-btn" data-path="${path}" data-delta="1" style="width:28px;height:28px;font-size:14px;">+</button>
        ${maxCases > 0 ? `<span style="font-size:11px;color:var(--text-muted);">(макс. ${maxCases})</span>` : ''}
      </div>
    `;
  }

  return `
    <span style="font-size:13px;color:var(--text-secondary);">${totalQty} шт</span>
  `;
}

export function updateRowOrder(path, rebuildChildren = true) {
  const row = document.querySelector(`#categoryContents .row[data-path="${path}"]`);
  if (!row) return;
  const sq = parseInt(getStockValue(path)) || 0;
  const mode = calc.getCaseMode(path);
  const isMulti = mode.enabled && mode.multiSelected && mode.multiSelected.some(v => v === true);
  const packing = getOrderPacking(path);
  const hasCommonPacking = packing.length > 0;
  const individualVals = getIndividualCaseValues(path);
  const totalQty = parseInt(getTotalQty(path)) || 0;

  const isAdded = totalQty > 0;
  const isOverstock = totalQty > sq;
  row.classList.toggle('added', isAdded);
  row.classList.toggle('overstock', isOverstock);

  const qtyControls = row.querySelector('.qty-controls');
  if (qtyControls) {
    const mainInput = qtyControls.querySelector('.qty-input');
    if (mainInput) {
      mainInput.value = totalQty;
    }
    const singlePieces = qtyControls.querySelector('.single-pieces-input');
    const singleCases = qtyControls.querySelector('.single-cases-input');
    if (singlePieces && singleCases) {
      const opt = calc.getSelectedOption(path);
      const pieces = getIndividualCaseValues(path)[0] || 0;
      singlePieces.value = pieces;
      const casesCount = opt && opt.qty > 0 ? Math.ceil(pieces / opt.qty) : 0;
      singleCases.value = casesCount;
    }
    const staticSpan = qtyControls.querySelector('.static-qty');
    if (staticSpan) {
      staticSpan.textContent = `${totalQty} шт`;
    }
  }

  const extraInfo = row.querySelector('.extra-info');
  if (extraInfo) {
    let info = '';
    if (totalQty > 0 || sq > 0) {
      info = `<span><strong>${totalQty}</strong> шт добавлено</span>
              <span>в наличии: <strong>${sq}</strong></span>`;
      const props = calc.getItemPropsByPath(path);
      if (props.weight) {
        const data = calc.getCalculationData(path);
        const weight = calc.calcItemWeight(path, totalQty, data.mode, data.packing, data.individualVals, data.extra);
        info += `<span>${formatWeight(weight)}</span>`;
      }
      const data = calc.getCalculationData(path);
      const volume = calc.calcItemVolume(path, totalQty, data.mode, data.packing, data.individualVals, data.extra);
      if (volume > 0) info += `<span>${formatVolume(volume)}</span>`;
      if (packing.length > 0) {
        const totalPieces = packing.reduce((s, p) => s + (p.pieces || 0), 0);
        info += `<span>[Кофр] ${packing.length} шт (${totalPieces} шт)</span>`;
      }
    }
    extraInfo.innerHTML = info;
  }

  const linkBtn = row.querySelector('.link-btn');
  if (linkBtn) {
    const state = getState();
    const hasLink = state.links[path] && state.links[path].length > 0;
    linkBtn.textContent = 'Линк' + (hasLink ? ' ✓' : '');
    linkBtn.classList.toggle('active', hasLink);
  }
  const noteBtn = row.querySelector('.note-btn');
  if (noteBtn) {
    const state = getState();
    const hasNote = !!(state.notes[path] && state.notes[path].trim());
    noteBtn.textContent = 'Заметка' + (hasNote ? ' ✓' : '');
    noteBtn.classList.toggle('has-note', hasNote);
  }
  const caseBtn = row.querySelector('.case-btn');
  if (caseBtn) {
    const mode = calc.getCaseMode(path);
    const isOn = mode.enabled || false;
    const isMulti = mode.enabled && mode.multiSelected && mode.multiSelected.some(v => v === true);
    const hasAlt = !!mode.alt;
    const packing = getOrderPacking(path);
    const hasCommonPacking = packing.length > 0;
    let statusText = 'Кофры';
    let statusClass = '';
    if (hasCommonPacking) {
      statusText = 'Общие';
      statusClass = 'common';
    } else if (isMulti) {
      statusText = 'Мульти';
      statusClass = 'multi';
    } else if (hasAlt) {
      statusText = 'Альт.';
      statusClass = 'alt';
    } else if (isOn) {
      statusText = 'Вкл';
      statusClass = 'on';
    } else {
      statusText = 'Выкл';
      statusClass = 'off';
    }
    caseBtn.textContent = statusText;
    caseBtn.className = 'action-btn case-btn ' + (isOn ? 'active ' : '') + statusClass;
  }

  if (rebuildChildren) {
    updateChildRowsForPath(path);
  }
}

export function refreshRow(path) {
  const oldRow = document.querySelector(`#categoryContents .row[data-path="${path}"]`);
  if (!oldRow) return;
  const level = path.split('|').length - 1;
  const newRowHtml = buildItemRow(path, level);
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = newRowHtml;
  const newRow = tempDiv.firstElementChild;
  oldRow.replaceWith(newRow);
  updateChildRowsForPath(path);
  updateTotalsOrder();
  updateCategoryTotalsOrder(currentOrderCategory);
  updateAllCommonCaseIndicators();
}

export function updateCategoryTotalsOrder(catKey) {
  const container = document.querySelector('#categoryContents .category-content.active');
  if (!container || searchModeOrder) return;
  let totalsDiv = container.querySelector('.category-totals');
  if (!totalsDiv) {
    totalsDiv = document.createElement('div');
    totalsDiv.className = 'category-totals';
    container.appendChild(totalsDiv);
  }
  const items = getActiveItemsOrder();
  const filtered = items.filter(({ path }) => path.startsWith(catKey + '|'));
  const result = calculateTotals(filtered);
  let html = `<span>Итого в категории: ${result.totalQty} шт</span>`;
  if (result.totalWeight > 0) html += `<span>Вес: ${formatWeight(result.totalWeight)}</span>`;
  if (result.totalVolume > 0) html += `<span>Объём: ${formatVolume(result.totalVolume)}</span>`;
  if (result.totalCases > 0) html += `<span>Кофров: ${result.totalCases} шт</span>`;
  totalsDiv.innerHTML = html;
}

// ============================================================
// ГЛАВНАЯ ФУНКЦИЯ СТАТИСТИКИ — ПРЯМОЙ ДОСТУП К STATE
// ============================================================
export function updateTotalsOrder() {
  const state = getState();

  // 1. Собираем все уникальные пути
  const allPaths = new Set();

  // Из order
  for (let p in state.order) {
    if (state.order[p] > 0) allPaths.add(p);
  }
  // Из orderExtra
  for (let p in state.orderExtra) {
    if (state.orderExtra[p] > 0) allPaths.add(p);
  }
  // Из orderPacking
  for (let p in state.orderPacking) {
    const packing = state.orderPacking[p];
    const total = packing.reduce((s, item) => s + (item.pieces || 0), 0);
    if (total > 0) allPaths.add(p);
  }
  // Из individualCaseValues
  for (let p in state.individualCaseValues) {
    const vals = state.individualCaseValues[p];
    if (vals.reduce((a, b) => a + b, 0) > 0) allPaths.add(p);
  }

  // 2. Формируем массив items
  const items = [];
  allPaths.forEach(path => {
    const qty = getTotalQty(path);
    if (qty > 0) {
      items.push({ path, qty });
    }
  });

  // 3. Считаем общие итоги
  const result = calculateTotals(items);

  // 4. Обновляем глобальные цифры
  document.getElementById('totalQty').textContent = result.totalQty;
  document.getElementById('totalWeight').textContent = result.totalWeight.toFixed(1);
  document.getElementById('totalVolume').textContent = result.totalVolume.toFixed(3);

  // 5. Строим детальную статистику
  const detailsDiv = document.getElementById('globalDetails');
  if (!detailsDiv) return;

  const orderKeys = state._categoryOrder || Object.keys(state.inventory);
  const catMap = {};
  let commonWeight = 0, commonVolume = 0, commonQty = 0;

  items.forEach(({ path, qty }) => {
    // Получаем данные напрямую
    const packing = state.orderPacking[path] || [];
    const extra = state.orderExtra[path] || 0;
    const individualVals = state.individualCaseValues[path] || [];
    const mode = state.caseModes[path] || { enabled: false, selectedOption: 0, useAlt: false, accumulate: false, multiSelected: [], commonSelected: [] };
    const props = calc.getItemPropsByPath(path);

    // Считаем вес и объём с учётом упаковки
    const weight = calc.calcItemWeight(path, qty, mode, packing, individualVals, extra);
    const volume = calc.calcItemVolume(path, qty, mode, packing, individualVals, extra);
    const cases = calc.calcItemCases(path, qty, mode, individualVals);

    const parts = path.split('|');
    const cat = parts[0];
    if (!catMap[cat]) catMap[cat] = { qty: 0, weight: 0, volume: 0, cases: 0 };
    catMap[cat].qty += qty;
    catMap[cat].weight += weight;
    catMap[cat].volume += volume;
    catMap[cat].cases += cases;

    if (packing.length > 0 || extra > 0) {
      commonWeight += weight;
      commonVolume += volume;
      commonQty += qty;
    }
  });

  let detailsHtml = '';
  orderKeys.forEach(cat => {
    if (!catMap[cat]) return;
    const catResult = catMap[cat];
    detailsHtml += `<div class="cat-detail"><strong>${CAT_NAMES[cat] || cat}</strong><br>${catResult.qty} шт<br>${formatWeight(catResult.weight)}<br>${formatVolume(catResult.volume)}</div>`;
  });

  if (commonQty > 0) {
    detailsHtml += `<div class="cat-detail common-case-detail"><strong>📦 Общие кофры</strong><br>${commonQty} шт<br>${formatWeight(commonWeight)}<br>${formatVolume(commonVolume)}</div>`;
  }

  detailsDiv.innerHTML = detailsHtml || '';
  renderCommonCaseIndicatorsOrder();

  // Логирование для отладки
  console.log('[STATS] Общих кофров: шт=' + commonQty + ', вес=' + commonWeight + ', объём=' + commonVolume);
}

function calculateTotals(items) {
  let totalQty = 0, totalWeight = 0, totalVolume = 0, totalCases = 0;
  items.forEach(({ path, qty }) => {
    totalQty += qty;
    const packing = getOrderPacking(path);
    const individualVals = getIndividualCaseValues(path);
    const extra = getOrderExtra(path);
    const mode = calc.getCaseMode(path);
    totalWeight += calc.calcItemWeight(path, qty, mode, packing, individualVals, extra);
    totalVolume += calc.calcItemVolume(path, qty, mode, packing, individualVals, extra);
    totalCases += calc.calcItemCases(path, qty, mode, individualVals);
  });
  return { totalQty, totalWeight, totalVolume, totalCases };
}

const debouncedSearch = debounce(applySearchOrder, 300);

export function applySearchOrder() {
  const input = document.getElementById('searchInput');
  if (!input) return;
  const query = input.value.toLowerCase().trim();
  searchQueryOrder = query;
  renderOrderCategory('all', query);
}

export function clearSearchOrder() {
  const input = document.getElementById('searchInput');
  if (input) input.value = '';
  searchQueryOrder = '';
  searchModeOrder = false;
  const state = getState();
  const first = state._categoryOrder?.[0] || Object.keys(state.inventory)[0];
  if (first) {
    currentOrderCategory = first;
    renderOrderCategory(first);
  } else {
    renderOrderCategory(null);
  }
}

export function toggleInfoOrder(btn) {
  const path = btn.dataset.path;
  const row = btn.closest('.row');
  let infoBlock = row.querySelector('.row-info');
  if (infoBlock) {
    infoBlock.remove();
    infoBlocksOpen[path] = false;
    btn.textContent = 'Инфо';
    return;
  }
  infoBlock = document.createElement('div');
  infoBlock.className = 'row-info';
  const props = calc.getItemPropsByPath(path);
  const mode = calc.getCaseMode(path);
  infoBlock.innerHTML = buildInfoHtml(path, props, mode);
  row.appendChild(infoBlock);
  infoBlocksOpen[path] = true;
  btn.textContent = 'Скрыть';
}

export function toggleDescOrder(btn) {
  const path = btn.dataset.path;
  const block = document.querySelector(`.desc-block[data-path="${path}"]`);
  if (block) {
    block.classList.toggle('open');
    btn.textContent = block.classList.contains('open') ? 'Скрыть описание' : 'Описание';
  }
}

export async function openNoteEditorOrder(btn) {
  const path = btn.dataset.path;
  const state = getState();
  const current = state.notes[path] || '';
  const newNote = await showPrompt('Редактировать заметку', 'Заметка:', current);
  if (newNote === null) return;
  setNote(path, newNote);
  updateRowOrder(path);
  showToast('Заметка сохранена', 'neutral');
}

export function setupInputListenersOrder() { }

export function initOrderUI() {
  detailsOpenOrder = localStorage.getItem('detailsOpenOrder') === 'true';

  const detailToggle = document.getElementById('detailToggle');
  if (detailToggle) {
    detailToggle.addEventListener('click', function() {
      const details = document.getElementById('globalDetails');
      if (!details) return;
      details.classList.toggle('open');
      detailsOpenOrder = details.classList.contains('open');
      localStorage.setItem('detailsOpenOrder', JSON.stringify(detailsOpenOrder));
      this.textContent = detailsOpenOrder ? 'Скрыть' : 'Подробно';
    });
  }

  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', debouncedSearch);
  }
  const clearBtn = document.getElementById('clearSearchBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', clearSearchOrder);
  }

  const dateInput = document.getElementById('pDate');
  if (dateInput) {
    dateInput.addEventListener('change', function() {
      localStorage.setItem('last_date', this.value);
    });
  }
  const commentInput = document.getElementById('pComment');
  if (commentInput) {
    commentInput.addEventListener('input', function() {
      localStorage.setItem('last_comment', this.value);
    });
  }
}

export function renderOrderAll() {
  invalidateFlatItemsCache();
  const state = getState();

  const comment = document.getElementById('pComment');
  if (comment) comment.value = localStorage.getItem('last_comment') || '';
  const date = document.getElementById('pDate');
  if (date) {
    const savedDate = localStorage.getItem('last_date');
    if (savedDate) date.value = savedDate;
  }
  if (!currentOrderCategory || !state.inventory[currentOrderCategory]) {
    const first = state._categoryOrder?.[0] || Object.keys(state.inventory)[0];
    if (first) currentOrderCategory = first;
  }
  renderOrderTabs();
  renderOrderCategory(currentOrderCategory);
  detailsOpenOrder = localStorage.getItem('detailsOpenOrder') === 'true';
  const details = document.getElementById('globalDetails');
  const toggle = document.getElementById('detailToggle');
  if (detailsOpenOrder) {
    if (details) details.classList.add('open');
    if (toggle) toggle.textContent = 'Скрыть';
  } else {
    if (details) details.classList.remove('open');
    if (toggle) toggle.textContent = 'Подробно';
  }
  updateAllCommonCaseIndicators();
}

export default {
  currentOrderCategory,
  setCurrentCategory,
  setSearchMode,
  setSearchQuery,
  toggleDetailsOpen,
  toggleInfoBlock,
  resetInfoBlocks,
  renderOrderTabs,
  renderOrderCategory,
  buildItemRow,
  updateRowOrder,
  refreshRow,
  updateCategoryTotalsOrder,
  updateTotalsOrder,
  applySearchOrder,
  clearSearchOrder,
  toggleInfoOrder,
  toggleDescOrder,
  openNoteEditorOrder,
  setupInputListenersOrder,
  initOrderUI,
  renderOrderAll,
};