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
  getOrderInstances,
  getOrderSubrent,
  removeSubrentItem,
  updateSubrentItem,
} from '../../services/order-data.js';
import { getInstancesByPath, getInstanceStats } from '../../services/instance-service.js';
import * as calc from '../../services/calculations.js';
import { CAT_NAMES, INSTANCE_STATUS_LABELS, INSTANCE_STATUS_COLORS } from '../../core/config.js';
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

// ============================================================
// ОТРИСОВКА ВКЛАДОК
// ============================================================

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

// ============================================================
// ОТРИСОВКА КАТЕГОРИИ (включая субаренду)
// ============================================================

export function renderOrderCategory(catKey, filterQuery = '') {
  const container = document.getElementById('categoryContents');
  if (!container) return;
  const wrapper = document.createElement('div');
  wrapper.className = 'category-content active';
  container.innerHTML = '';
  container.appendChild(wrapper);

  const query = (filterQuery || searchQueryOrder || '').toLowerCase().trim();
  const isSearchMode = !!query;

  // --- Блок субаренды (всегда показываем, если есть позиции, но только не в поиске) ---
  if (!isSearchMode) {
    renderSubrentBlock(wrapper);
  }

  if (isSearchMode) {
    const allPaths = buildFlatItemsList();
    const filteredPaths = allPaths.filter(path => {
      const name = path.split('|').pop().toLowerCase();
      const state = getState();
      const spec = (state.specs && state.specs[path] || '').toLowerCase();
      return name.includes(query) || spec.includes(query);
    });
    if (filteredPaths.length === 0) {
      // Если в поиске ничего не найдено, и субаренды нет, показываем сообщение
      const subrentItems = getOrderSubrent();
      if (subrentItems.length === 0) {
        wrapper.innerHTML = '<div class="empty-message">Ничего не найдено</div>';
      }
      // Если субаренда есть, она уже отрендерена, но позиций нет — оставляем как есть
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
    // Добавляем HTML субаренды, если она есть (уже отрендерена ранее)
    // Но в поиске мы не показываем субаренду отдельно, она уже выведена выше.
    // Поэтому просто добавляем HTML субаренды, если она есть, но не дублируем.
    // Однако renderSubrentBlock уже вызван и добавил свой блок до этого.
    // В поиске мы не хотим показывать субаренду, потому что она не фильтруется по запросу.
    // Поэтому убираем блок субаренды при поиске.
    // Для этого нам нужно удалить блок субаренды, если он есть.
    const subrentBlock = wrapper.querySelector('.subrent-block');
    if (subrentBlock) subrentBlock.remove();
    // И вставляем только найденные позиции
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
    wrapper.innerHTML += buildCategoryHTML(catData, [catKey], 0);
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

// ============================================================
// БЛОК СУБАРЕНДЫ
// ============================================================

/**
 * Отрисовывает блок субаренды в контейнере.
 * @param {HTMLElement} container - контейнер для вставки
 */
function renderSubrentBlock(container) {
  const subrentItems = getOrderSubrent();
  if (subrentItems.length === 0) return;

  // Удаляем старый блок, если есть
  const oldBlock = container.querySelector('.subrent-block');
  if (oldBlock) oldBlock.remove();

  const block = document.createElement('div');
  block.className = 'subrent-block';
  block.style.cssText = 'margin-bottom:16px;padding:10px 12px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border-color);';

  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <h4 style="color:var(--text-secondary);font-weight:600;font-size:15px;">🔄 Субаренда (${subrentItems.length})</h4>
      <button class="btn btn-sm add-subrent-btn" style="padding:4px 12px;font-size:13px;background:var(--accent);color:white;">+ Добавить</button>
    </div>
  `;

  subrentItems.forEach((item, index) => {
    const caseInfo = subrentToCaseInfo(item);
    html += `
      <div class="row subrent-row" data-id="${esc(item.id)}" style="border-left:3px solid var(--color-link);background:var(--bg-input);margin-bottom:4px;padding:4px 8px;border-radius:4px;display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;">
        <div class="name-area" style="flex:1 1 180px;">
          <span class="name" style="font-weight:500;">${esc(item.name)}</span>
          <div class="extra-info" style="font-size:12px;color:var(--text-secondary);">
            <span>${item.qty} шт</span>
            <span>${item.weight ? item.weight + ' кг' : ''}</span>
            <span>${item.dimensions || ''}</span>
            <span>${item.counterparty ? 'Контрагент: ' + esc(item.counterparty) : ''}</span>
            ${item.start_date ? `с ${esc(item.start_date)}` : ''}
            ${item.end_date ? `по ${esc(item.end_date)}` : ''}
            ${item.comment ? `(${esc(item.comment)})` : ''}
          </div>
        </div>
        <div class="action-buttons" style="display:flex;gap:4px;flex-shrink:0;">
          <button class="action-btn edit-subrent-btn" data-id="${esc(item.id)}" style="border-color:var(--color-link);color:var(--color-link);">✏️</button>
          <button class="action-btn delete-subrent-btn" data-id="${esc(item.id)}" style="border-color:var(--danger);color:var(--danger);">✕</button>
        </div>
        <div class="qty-controls" style="margin-left:auto;display:flex;gap:4px;align-items:center;">
          <button class="btn-c subrent-qty-btn" data-id="${esc(item.id)}" data-delta="-1" style="width:26px;height:26px;font-size:14px;">−</button>
          <input type="number" class="subrent-qty-input" data-id="${esc(item.id)}" value="${item.qty}" min="0" step="1" style="width:48px;padding:2px 4px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:4px;color:var(--text-primary);text-align:center;font-size:14px;">
          <button class="btn-c subrent-qty-btn" data-id="${esc(item.id)}" data-delta="1" style="width:26px;height:26px;font-size:14px;">+</button>
        </div>
      </div>
    `;
  });

  block.innerHTML = html;
  container.prepend(block); // вставляем в начало контейнера
}

/**
 * Форматирует информацию о субаренде для отображения.
 * @param {object} item - объект субаренды
 * @returns {string} HTML-строка с информацией
 */
function subrentToCaseInfo(item) {
  const parts = [];
  if (item.qty) parts.push(`${item.qty} шт`);
  if (item.weight) parts.push(`${item.weight} кг`);
  if (item.dimensions) parts.push(item.dimensions);
  if (item.counterparty) parts.push(`Контрагент: ${esc(item.counterparty)}`);
  if (item.start_date) parts.push(`с ${esc(item.start_date)}`);
  if (item.end_date) parts.push(`по ${esc(item.end_date)}`);
  if (item.comment) parts.push(`(${esc(item.comment)})`);
  return parts.join(' · ');
}

// ============================================================
// ПОСТРОЕНИЕ HTML КАТЕГОРИИ (рекурсивно)
// ============================================================

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

// ============================================================
// ПОСТРОЕНИЕ СТРОКИ ПОЗИЦИИ (без изменений, оставлено как есть)
// ============================================================

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

  let caseNameDisplay = '';
  if (hasCommonPacking) {
    const commonCases = getCommonCases();
    const caseDetails = packing.map(p => {
      const c = commonCases.find(c => c.id === p.caseId);
      const name = c ? c.name : 'удалённый';
      return `${name} (${p.pieces} шт)`;
    }).join(', ');
    caseNameDisplay = ` (в кофре: ${caseDetails})`;
    extraCaseInfo = `Кофры: ${caseDetails}`;
  }

  if (hasCommonPacking) {
    caseStatusText = 'Общие';
    caseStatusClass = 'common';
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

  const showWeightVolume = !hasCommonPacking;

  let weightDisplay = '0 кг';
  let volumeDisplay = '0 м³';
  if (showWeightVolume && totalQty > 0) {
    const data = calc.getCalculationData(fullPath);
    const weight = calc.calcItemWeight(fullPath, totalQty, data.mode, data.packing, data.individualVals, data.extra);
    const volume = calc.calcItemVolume(fullPath, totalQty, data.mode, data.packing, data.individualVals, data.extra);
    weightDisplay = formatWeight(weight);
    volumeDisplay = formatVolume(volume);
  }

  const instances = getInstancesByPath(fullPath);
  let instanceInfoHtml = '';
  if (instances.length > 0) {
    const stats = getInstanceStats(fullPath);
    const orderInstanceIds = getOrderInstances(fullPath) || [];
    const reservedInOrder = orderInstanceIds.length;
    const parts = [];
    if (stats.stock > 0) parts.push(`<span style="color:${INSTANCE_STATUS_COLORS.stock}">${stats.stock} на складе</span>`);
    if (stats.reserved > 0) parts.push(`<span style="color:${INSTANCE_STATUS_COLORS.reserved}">${stats.reserved} зарезервировано</span>`);
    if (stats.issued > 0) parts.push(`<span style="color:${INSTANCE_STATUS_COLORS.issued}">${stats.issued} выдано</span>`);
    if (stats.repair > 0) parts.push(`<span style="color:${INSTANCE_STATUS_COLORS.repair}">${stats.repair} в ремонте</span>`);
    if (stats.writtenOff > 0) parts.push(`<span style="color:${INSTANCE_STATUS_COLORS.written_off}">${stats.writtenOff} списано</span>`);
    if (instances.length > 0) {
      instanceInfoHtml = `<div class="instance-stats" style="font-size:12px;color:var(--text-secondary);margin-top:2px;">Экз.: всего ${instances.length} (${parts.join(', ')})</div>`;
      const hasSerial = instances.some(i => i.serialNumber && i.serialNumber.trim() !== '');
      if (hasSerial) {
        instanceInfoHtml += `<button class="action-btn instance-detail-btn" data-path="${esc(fullPath)}" style="font-size:11px;padding:1px 6px;border-color:var(--color-link);color:var(--color-link);">Серийные номера</button>`;
      }
    }
  } else {
    if (sq > 0) {
      instanceInfoHtml = `<div style="font-size:12px;color:var(--text-muted);">Нет экземпляров (остаток: ${sq})</div>`;
    }
  }

  const infoHtml = buildInfoHtml(fullPath, props, mode);
  const escapedName = esc(fullPath.split('|').pop()) + caseNameDisplay;
  const isAdded = totalQty > 0;
  const rowClass = (isAdded ? 'added' : '') + (overstock ? ' overstock' : '');

  const linkClass = hasLink ? 'active' : '';
  const noteClass = hasNote ? 'has-note' : '';
  const caseClass = isCaseModeOn ? 'active' : '';

  let extraInfo = '';
  if (totalQty > 0 || sq > 0) {
    let info = `<span><strong>${totalQty}</strong> шт добавлено</span>
                <span>в наличии: <strong>${sq}</strong></span>`;
    if (showWeightVolume && weightDisplay !== '0 кг') {
      info += `<span>${weightDisplay}</span>`;
    }
    if (showWeightVolume && volumeDisplay !== '0 м³') {
      info += `<span>${volumeDisplay}</span>`;
    }
    if (extraCaseInfo) {
      info += `<span>${extraCaseInfo}</span>`;
    }
    extraInfo = `<div class="extra-info">${info}</div>`;
  }

  let html = `<div class="row ${rowClass}" data-path="${esc(fullPath)}" data-search="${fullPath}">
    <div class="name-area">
      <span class="name">${escapedName}</span>
      ${extraInfo}
      ${instanceInfoHtml}
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

// ============================================================
// РЕНДЕРИНГ КОНТРОЛЛЕЙ КОЛИЧЕСТВА (без изменений)
// ============================================================

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

// ============================================================
// ОБНОВЛЕНИЕ СТРОКИ (без изменений)
// ============================================================

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
      if (props.weight && !hasCommonPacking) {
        const data = calc.getCalculationData(path);
        const weight = calc.calcItemWeight(path, totalQty, data.mode, data.packing, data.individualVals, data.extra);
        info += `<span>${formatWeight(weight)}</span>`;
      }
      if (!hasCommonPacking) {
        const data = calc.getCalculationData(path);
        const volume = calc.calcItemVolume(path, totalQty, data.mode, data.packing, data.individualVals, data.extra);
        if (volume > 0) info += `<span>${formatVolume(volume)}</span>`;
      }
      if (packing.length > 0) {
        const commonCases = getCommonCases();
        const caseDetails = packing.map(p => {
          const c = commonCases.find(c => c.id === p.caseId);
          const name = c ? c.name : 'удалённый';
          return `${name} (${p.pieces} шт)`;
        }).join(', ');
        info += `<span>Кофры: ${caseDetails}</span>`;
      }
    }
    extraInfo.innerHTML = info;
  }

  const instanceStatsContainer = row.querySelector('.instance-stats');
  if (instanceStatsContainer) {
    const stats = getInstanceStats(path);
    const parts = [];
    if (stats.stock > 0) parts.push(`<span style="color:${INSTANCE_STATUS_COLORS.stock}">${stats.stock} на складе</span>`);
    if (stats.reserved > 0) parts.push(`<span style="color:${INSTANCE_STATUS_COLORS.reserved}">${stats.reserved} зарезервировано</span>`);
    if (stats.issued > 0) parts.push(`<span style="color:${INSTANCE_STATUS_COLORS.issued}">${stats.issued} выдано</span>`);
    if (stats.repair > 0) parts.push(`<span style="color:${INSTANCE_STATUS_COLORS.repair}">${stats.repair} в ремонте</span>`);
    if (stats.writtenOff > 0) parts.push(`<span style="color:${INSTANCE_STATUS_COLORS.written_off}">${stats.writtenOff} списано</span>`);
    instanceStatsContainer.innerHTML = `Экз.: всего ${stats.total} (${parts.join(', ')})`;
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

// ============================================================
// ОБНОВЛЕНИЕ ИТОГОВ (без изменений)
// ============================================================

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

export function updateTotalsOrder() {
  const state = getState();

  const itemsMap = new Map();
  const seenPaths = new Set();

  for (let p in state.orderPacking) {
    const packing = state.orderPacking[p];
    const total = packing.reduce((s, item) => s + (item.pieces || 0), 0);
    const extra = state.orderExtra[p] || 0;
    const qty = total + extra;
    if (qty > 0) {
      itemsMap.set(p, { qty, packing, extra, individualVals: state.individualCaseValues[p] || [], mode: state.caseModes[p] || {} });
      seenPaths.add(p);
    }
  }

  for (let p in state.order) {
    if (state.order[p] > 0 && !seenPaths.has(p)) {
      itemsMap.set(p, { qty: state.order[p], packing: [], extra: 0, individualVals: state.individualCaseValues[p] || [], mode: state.caseModes[p] || {} });
      seenPaths.add(p);
    }
  }

  for (let p in state.individualCaseValues) {
    const vals = state.individualCaseValues[p];
    const total = vals.reduce((a, b) => a + b, 0);
    if (total > 0 && !seenPaths.has(p)) {
      itemsMap.set(p, { qty: total, packing: [], extra: 0, individualVals: vals, mode: state.caseModes[p] || {} });
      seenPaths.add(p);
    }
  }

  const catMap = {};
  const commonByCategory = {};
  let totalQty = 0, totalWeight = 0, totalVolume = 0;
  let commonTotalQty = 0, commonTotalWeight = 0, commonTotalVolume = 0;
  const usedCaseIds = new Set();

  itemsMap.forEach((itemData, path) => {
    const { qty, packing, extra, individualVals, mode } = itemData;
    const props = calc.getItemPropsByPath(path);
    const unitWeight = props.weight || 0;

    const weightFull = calc.calcItemWeight(path, qty, mode, packing, individualVals, extra);
    let weightPure = 0;
    if (packing.length > 0) {
      packing.forEach(p => {
        if (p.pieces > 0) weightPure += p.pieces * unitWeight;
      });
      if (extra > 0) weightPure += extra * unitWeight;
    } else {
      weightPure = weightFull;
    }

    const volume = calc.calcItemVolume(path, qty, mode, packing, individualVals, extra);
    const cases = calc.calcItemCases(path, qty, mode, individualVals);

    const parts = path.split('|');
    const cat = parts[0];
    const hasCommonPacking = packing.length > 0;

    if (!catMap[cat]) catMap[cat] = { qty: 0, weight: 0, volume: 0, cases: 0 };
    catMap[cat].qty += qty;
    catMap[cat].weight += weightPure;
    catMap[cat].volume += volume;
    catMap[cat].cases += cases;

    totalQty += qty;
    totalWeight += weightFull;
    totalVolume += volume;

    if (hasCommonPacking) {
      commonTotalQty += qty;
      commonTotalWeight += weightFull;
      commonTotalVolume += volume;
      if (!commonByCategory[cat]) {
        commonByCategory[cat] = { qty: 0, weight: 0, volume: 0 };
      }
      commonByCategory[cat].qty += qty;
      commonByCategory[cat].weight += weightFull;
      commonByCategory[cat].volume += volume;
      packing.forEach(p => usedCaseIds.add(p.caseId));
    }
  });

  // Добавляем субаренду в общие итоги
  const subrentItems = getOrderSubrent();
  let subrentQty = 0, subrentWeight = 0, subrentVolume = 0;
  subrentItems.forEach(item => {
    subrentQty += item.qty || 0;
    subrentWeight += (item.weight || 0) * (item.qty || 0);
    if (item.dimensions) {
      const dims = item.dimensions.split('x').map(parseFloat);
      if (dims.length === 3 && dims.every(v => !isNaN(v) && v > 0)) {
        subrentVolume += (dims[0] * dims[1] * dims[2]) / 1000000 * (item.qty || 0);
      }
    }
  });

  document.getElementById('totalQty').textContent = totalQty + subrentQty;
  document.getElementById('totalWeight').textContent = (totalWeight + subrentWeight).toFixed(1);
  document.getElementById('totalVolume').textContent = (totalVolume + subrentVolume).toFixed(3);

  const detailsDiv = document.getElementById('globalDetails');
  if (!detailsDiv) return;

  const orderKeys = state._categoryOrder || Object.keys(state.inventory);
  let detailsHtml = '';

  orderKeys.forEach(cat => {
    if (!catMap[cat]) return;
    const catResult = catMap[cat];
    const catId = 'cat_detail_' + cat.replace(/[^a-zA-Z0-9]/g, '_');
    detailsHtml += `<div class="cat-detail-wrap">
      <div class="cat-detail-header" data-target="${catId}" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:var(--bg-secondary);border-radius:6px;margin:4px 0;border-left:3px solid var(--accent);">
        <strong>${CAT_NAMES[cat] || cat}</strong>
        <span style="font-size:13px;color:var(--text-secondary);">${catResult.qty} шт, ${formatWeight(catResult.weight)}, ${formatVolume(catResult.volume)}</span>
        <span class="toggle-icon" style="font-size:14px;color:var(--text-muted);">▶</span>
      </div>
      <div class="cat-detail-items" id="${catId}" style="display:none;padding-left:16px;margin-top:4px;">
        ${buildCategoryItemList(cat, itemsMap, orderKeys)}
      </div>
    </div>`;
  });

  // Добавляем субаренду в детали
  if (subrentQty > 0) {
    detailsHtml += `<div class="cat-detail-wrap">
      <div class="cat-detail-header" style="background:var(--bg-secondary);border-radius:6px;margin:4px 0;border-left:3px solid var(--color-link);padding:4px 8px;">
        <strong>🔄 Субаренда</strong>
        <span style="font-size:13px;color:var(--text-secondary);">${subrentQty} шт, ${formatWeight(subrentWeight)}, ${formatVolume(subrentVolume)}</span>
      </div>
      <div style="padding-left:16px;margin-top:4px;">
        ${subrentItems.map(item => `
          <div style="font-size:13px;color:var(--text-secondary);padding:2px 0;border-bottom:1px solid var(--border-color);display:flex;gap:12px;">
            <span style="flex:1;">${esc(item.name)}</span>
            <span>${item.qty} шт</span>
            <span>${formatWeight((item.weight||0) * (item.qty||0))}</span>
            <span>${item.dimensions ? formatVolume((item.dimensions.split('x').map(parseFloat).reduce((a,b)=>a*b,1))/1000000 * (item.qty||0)) : ''}</span>
            <span style="color:var(--text-muted);">${item.counterparty ? 'Контрагент: ' + esc(item.counterparty) : ''}</span>
          </div>
        `).join('')}
      </div>
    </div>`;
  }

  if (commonTotalQty > 0) {
    let commonPercentages = '';
    const catNames = Object.keys(commonByCategory);
    catNames.forEach((cat, idx) => {
      const data = commonByCategory[cat];
      const percent = commonTotalWeight > 0 ? (data.weight / commonTotalWeight) * 100 : 0;
      commonPercentages += `${CAT_NAMES[cat] || cat}: ${percent.toFixed(1)}%`;
      if (idx < catNames.length - 1) commonPercentages += ', ';
    });

    let caseListHtml = '';
    const commonCases = getCommonCases();
    usedCaseIds.forEach(id => {
      const c = commonCases.find(c => c.id === id);
      if (c) {
        caseListHtml += `<div style="font-size:13px;color:var(--text-secondary);padding-left:12px;">• ${esc(c.name)} (габ: ${c.dimensions || 'н/д'}, вес пустого: ${c.emptyWeight || 0} кг, макс. вес: ${c.maxWeight || 0} кг)</div>`;
      }
    });

    detailsHtml += `<div class="cat-detail common-case-detail"><strong>Общие кофры</strong><br>${commonTotalQty} шт<br>${formatWeight(commonTotalWeight)}<br>${formatVolume(commonTotalVolume)}<br><span style="font-size:13px;color:var(--text-secondary);">${commonPercentages}</span>`;
    if (caseListHtml) {
      detailsHtml += `<div style="margin-top:4px;">${caseListHtml}</div>`;
    }
    detailsHtml += `</div>`;
  }

  detailsDiv.innerHTML = detailsHtml || '';
  renderCommonCaseIndicatorsOrder();

  detailsDiv.querySelectorAll('.cat-detail-header').forEach(header => {
    header.addEventListener('click', function() {
      const targetId = this.dataset.target;
      const items = document.getElementById(targetId);
      if (items) {
        const isOpen = items.style.display !== 'none';
        items.style.display = isOpen ? 'none' : 'block';
        const icon = this.querySelector('.toggle-icon');
        if (icon) icon.textContent = isOpen ? '▶' : '▼';
      }
    });
  });

  console.log('[STATS] Всего: шт=' + (totalQty + subrentQty) + ', вес=' + (totalWeight + subrentWeight) + ', объём=' + (totalVolume + subrentVolume));
  console.log('[STATS] Общих кофров: шт=' + commonTotalQty + ', вес=' + commonTotalWeight);
}

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (без изменений)
// ============================================================

function buildCategoryItemList(cat, itemsMap, orderKeys) {
  let html = '';
  const paths = Array.from(itemsMap.keys()).filter(p => p.startsWith(cat + '|'));
  paths.sort((a, b) => {
    const nameA = a.split('|').pop();
    const nameB = b.split('|').pop();
    return nameA.localeCompare(nameB);
  });
  paths.forEach(path => {
    const itemData = itemsMap.get(path);
    const { qty, packing, extra, individualVals, mode } = itemData;
    const weightFull = calc.calcItemWeight(path, qty, mode, packing, individualVals, extra);
    const volume = calc.calcItemVolume(path, qty, mode, packing, individualVals, extra);
    const name = path.split('|').pop();
    const inCommon = packing.length > 0 ? ' (общий кофр)' : '';
    let caseName = '';
    if (packing.length > 0) {
      const commonCases = getCommonCases();
      const names = packing.map(p => {
        const c = commonCases.find(c => c.id === p.caseId);
        return c ? c.name : 'удалённый';
      }).join(', ');
      caseName = ` (в кофре: ${names})`;
    }
    html += `<div style="font-size:13px;color:var(--text-secondary);padding:2px 0;display:flex;gap:12px;border-bottom:1px solid var(--border-color);">
      <span style="flex:1;">${esc(name)}${inCommon}${caseName}</span>
      <span>${qty} шт</span>
      <span>${formatWeight(weightFull)}</span>
      <span>${formatVolume(volume)}</span>
    </div>`;
  });
  return html;
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
    if (detailToggle._handler) {
      detailToggle.removeEventListener('click', detailToggle._handler);
    }
    const handler = function() {
      const details = document.getElementById('globalDetails');
      if (!details) return;
      details.classList.toggle('open');
      const isOpen = details.classList.contains('open');
      localStorage.setItem('detailsOpenOrder', JSON.stringify(isOpen));
      this.textContent = isOpen ? 'Скрыть' : 'Подробно';
      detailsOpenOrder = isOpen;
    };
    detailToggle._handler = handler;
    detailToggle.addEventListener('click', handler);
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

  document.addEventListener('click', function(e) {
    const btn = e.target.closest('.instance-detail-btn');
    if (btn) {
      const path = btn.dataset.path;
      import('../instance/instance-modal.js').then(module => {
        module.openInstanceListModal(path);
      });
    }
  });
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