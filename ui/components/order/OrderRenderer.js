// ui/components/order/OrderRenderer.js

import { getState } from '../../../core/store.js';
import { esc, getItemName } from '../../../core/utils.js';
import { CAT_NAMES } from '../../../core/config.js';
import { getStockByPath } from '../../../services/stock.js';
import { getItemPropsByPath } from '../../../services/itemProps.js';
import { getCommonCases, getCommonCaseById } from '../../../services/commonCases.js';
import { getCaseMode, getTotalQty, getOrderPacking, getIndividualCaseValues, getOrderExtra, getLinks, getNote } from '../../../services/order.js';
import { getPackaging } from '../../../services/packaging.js';
import { formatWeight, formatVolume, buildInfoHtml, getBgColorCSS } from '../../render-utils.js';
import { getAllPaths, filterPathsByQuery, groupPathsByCategory } from './OrderUtils.js';
import { updateCategoryTotals, updateLinkCount } from './OrderTotals.js';
import { handleQuantityChange, handleQuantityInput } from './OrderActions.js';

let currentCategory = null;
let searchMode = false;
let searchQuery = '';

export function setCurrentCategory(cat) { currentCategory = cat; }
export function getCurrentCategory() { return currentCategory; }
export function setSearchMode(mode) { searchMode = mode; }
export function getSearchMode() { return searchMode; }
export function setSearchQuery(query) { searchQuery = query; }
export function getSearchQuery() { return searchQuery; }

export function renderTabs(onTabClick) {
  const container = document.getElementById('categoryTabs');
  if (!container) return;
  const state = getState();
  const orderKeys = state._categoryOrder || Object.keys(state.inventory);
  if (orderKeys.length === 0) {
    container.innerHTML = '<div class="empty-message">Нет категорий</div>';
    return;
  }
  container.innerHTML = '';
  orderKeys.forEach(key => {
    if (!state.inventory[key]) return;
    const tab = document.createElement('div');
    tab.className = 'category-tab' + (key === currentCategory ? ' active' : '');
    tab.textContent = CAT_NAMES[key] || key;
    tab.dataset.cat = key;
    tab.addEventListener('click', () => {
      if (searchMode) {
        searchMode = false;
        searchQuery = '';
        const input = document.getElementById('searchInput');
        if (input) input.value = '';
      }
      currentCategory = key;
      if (onTabClick) onTabClick(key);
    });
    container.appendChild(tab);
  });
  if (!orderKeys.includes(currentCategory) && orderKeys.length > 0) {
    currentCategory = orderKeys[0];
    renderTabs(onTabClick);
  }
}

export function renderCategoryContent(catKey) {
  const container = document.getElementById('categoryContents');
  if (!container) return;
  const state = getState();
  const inventory = state.inventory;
  const catData = inventory[catKey];
  if (!catData) {
    container.innerHTML = '<div class="empty-message">Категория пуста</div>';
    return;
  }

  if (searchMode && searchQuery) {
    renderSearchResults(container);
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'category-content active';

  if (Array.isArray(catData)) {
    if (catData.length === 0) {
      wrapper.innerHTML = '<div class="empty-message">Нет позиций</div>';
    } else {
      catData.forEach(item => {
        const path = catKey + '|' + item;
        wrapper.appendChild(buildItemRow(path, 0));
      });
    }
  } else if (typeof catData === 'object') {
    const subOrder = catData._subOrder || Object.keys(catData).filter(k => k !== '_subOrder');
    subOrder.forEach(subKey => {
      const subItems = catData[subKey];
      if (!Array.isArray(subItems)) return;
      const subgroupDiv = document.createElement('div');
      subgroupDiv.className = 'subgroup';
      const header = document.createElement('div');
      header.className = 'subgroup-header';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'name';
      nameSpan.textContent = subKey;
      header.appendChild(nameSpan);
      subgroupDiv.appendChild(header);
      const itemsDiv = document.createElement('div');
      itemsDiv.className = 'items-list';
      if (subItems.length === 0) {
        itemsDiv.innerHTML = '<div class="empty-message">Нет позиций</div>';
      } else {
        subItems.forEach(item => {
          const path = catKey + '|' + subKey + '|' + item;
          itemsDiv.appendChild(buildItemRow(path, 1));
        });
      }
      subgroupDiv.appendChild(itemsDiv);
      wrapper.appendChild(subgroupDiv);
    });
  } else {
    wrapper.innerHTML = '<div class="empty-message">Неизвестный формат данных</div>';
  }

  const totalsDiv = document.createElement('div');
  totalsDiv.className = 'category-totals';
  totalsDiv.id = 'categoryTotals';
  wrapper.appendChild(totalsDiv);

  container.innerHTML = '';
  container.appendChild(wrapper);
  updateCategoryTotals(catKey);
  updateLinkCount();
}

export function renderSearchResults(container) {
  const state = getState();
  const allPaths = getAllPaths();
  const filtered = filterPathsByQuery(allPaths, searchQuery, state.specs || {});
  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-message">Ничего не найдено</div>';
    return;
  }
  const grouped = groupPathsByCategory(filtered);
  const wrapper = document.createElement('div');
  wrapper.className = 'category-content active';
  const orderKeys = state._categoryOrder || Object.keys(state.inventory);
  orderKeys.forEach(cat => {
    if (!grouped[cat]) return;
    const catTitle = document.createElement('div');
    catTitle.className = 'sub-cat-t';
    catTitle.textContent = CAT_NAMES[cat] || cat;
    wrapper.appendChild(catTitle);
    grouped[cat].forEach(path => {
      wrapper.appendChild(buildItemRow(path, 1));
    });
  });
  container.innerHTML = '';
  container.appendChild(wrapper);
}

export function buildItemRow(path, level) {
  // Нормализуем путь сразу
  path = path.replace(/\\/g, '|');

  const state = getState();
  const sq = getStockByPath(path);
  const totalQty = getTotalQty(path);
  const props = getItemPropsByPath(path);
  const mode = getCaseMode(path);
  const packing = getOrderPacking(path);
  const individualVals = getIndividualCaseValues(path);
  const extra = getOrderExtra(path);
  const links = getLinks(path);
  const hasLink = links.length > 0;
  const note = getNote(path);
  const hasNote = !!note;

  const isOverstock = totalQty > sq;
  const isAdded = totalQty > 0;
  const rowClass = (isAdded ? 'added' : '') + (isOverstock ? ' overstock' : '');

  const options = props.individualCases || [];
  const isMulti = mode.enabled && options.length > 1 && mode.multiSelected && mode.multiSelected.some(v => v === true);
  const hasCommonPacking = packing.length > 0;

  let caseStatusText = 'Кофры';
  let caseStatusClass = '';
  if (hasCommonPacking) {
    caseStatusText = 'Общие';
    caseStatusClass = 'common';
  } else if (isMulti) {
    caseStatusText = 'Мульти';
    caseStatusClass = 'multi';
  } else if (mode.enabled && individualVals.length === 1 && !hasCommonPacking && !isMulti) {
    caseStatusText = 'Вкл';
    caseStatusClass = 'on';
  } else if (options.length > 0 || props.allowCommon) {
    caseStatusText = 'Выкл';
    caseStatusClass = 'off';
  } else {
    caseStatusText = '';
    caseStatusClass = '';
  }

  const hasCase = options.length > 0 || props.allowCommon;
  const packagingResult = getPackaging(path, totalQty);
  const weight = packagingResult.totalWeight;
  const volume = packagingResult.totalVolume;

  const linkClass = hasLink ? 'active' : '';
  const noteClass = hasNote ? 'has-note' : '';
  const caseClass = mode.enabled ? 'active' : '';

  const row = document.createElement('div');
  row.className = `row ${rowClass}`;
  row.dataset.path = path; // уже нормализован

  // name-area
  const nameArea = document.createElement('div');
  nameArea.className = 'name-area';
  const nameSpan = document.createElement('span');
  nameSpan.className = 'name';
  nameSpan.textContent = getItemName(path);
  nameArea.appendChild(nameSpan);

  if (totalQty > 0 || sq > 0) {
    const extraDiv = document.createElement('div');
    extraDiv.className = 'extra-info';
    let info = `<span><strong>${totalQty}</strong> шт добавлено</span>`;
    info += `<span>в наличии: <strong>${sq}</strong></span>`;
    if (weight > 0) info += `<span>${formatWeight(weight)}</span>`;
    if (volume > 0) info += `<span>${formatVolume(volume)}</span>`;
    if (hasCommonPacking) {
      const totalPieces = packing.reduce((s, p) => s + (p.pieces || 0), 0);
      info += `<span>[Кофр] ${packing.length} шт (${totalPieces} шт)</span>`;
    } else if (isMulti) {
      const totalCases = individualVals.reduce((sum, v, idx) => {
        if (v <= 0) return sum;
        const opt = options[idx] || options[0];
        return sum + Math.ceil(v / (opt.qty || 1));
      }, 0);
      info += `<span>[Мульти] ${totalCases} кофр${totalCases > 1 ? 'а' : ''}</span>`;
    } else if (mode.enabled && individualVals.length === 1 && !hasCommonPacking && !isMulti) {
      const opt = options[mode.selectedOption] || options[0];
      const val = individualVals[0] || 0;
      if (opt && val > 0) {
        const casesCount = Math.ceil(val / (opt.qty || 1));
        info += `<span>[Кофр] ${casesCount} шт</span>`;
      }
    }
    extraDiv.innerHTML = info;
    nameArea.appendChild(extraDiv);
  }
  row.appendChild(nameArea);

  // action-buttons
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'action-buttons';

  const infoBtn = document.createElement('button');
  infoBtn.className = 'action-btn info-btn';
  infoBtn.dataset.path = path;
  infoBtn.textContent = 'Инфо';
  infoBtn.title = 'Информация';
  actionsDiv.appendChild(infoBtn);

  const desc = state.specs && state.specs[path] ? true : false;
  if (desc) {
    const descBtn = document.createElement('button');
    descBtn.className = 'action-btn desc-btn';
    descBtn.dataset.path = path;
    descBtn.textContent = 'Описание';
    actionsDiv.appendChild(descBtn);
  }

  const linkBtn = document.createElement('button');
  linkBtn.className = `action-btn link-btn ${linkClass}`;
  linkBtn.dataset.path = path;
  linkBtn.textContent = 'Линк' + (hasLink ? ' ✓' : '');
  linkBtn.title = 'Привязки';
  actionsDiv.appendChild(linkBtn);

  if (hasCase) {
    const caseBtn = document.createElement('button');
    caseBtn.className = `action-btn case-btn ${caseClass} ${caseStatusClass}`;
    caseBtn.dataset.path = path;
    caseBtn.textContent = caseStatusText || 'Кофры';
    caseBtn.title = 'Настройка кофров';
    actionsDiv.appendChild(caseBtn);
  }

  const noteBtn = document.createElement('button');
  noteBtn.className = `action-btn note-btn ${noteClass}`;
  noteBtn.dataset.path = path;
  noteBtn.textContent = 'Заметка' + (hasNote ? ' ✓' : '');
  noteBtn.title = 'Заметка';
  actionsDiv.appendChild(noteBtn);

  row.appendChild(actionsDiv);

  // qty-controls
  const qtyControls = buildQtyControls(path);
  row.appendChild(qtyControls);

  return row;
}

export function buildQtyControls(path) {
  // путь уже нормализован
  const mode = getCaseMode(path);
  const options = getItemPropsByPath(path).individualCases || [];
  const packing = getOrderPacking(path);
  const individualVals = getIndividualCaseValues(path);
  const totalQty = getTotalQty(path);

  const isMulti = mode.enabled && options.length > 1 && mode.multiSelected && mode.multiSelected.some(v => v === true);
  const hasCommonPacking = packing.length > 0;

  const div = document.createElement('div');
  div.className = 'qty-controls';

  // Вспомогательная функция для привязки обработчиков
  const attachHandler = (btn, delta) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const p = btn.dataset.path;
      const d = parseInt(btn.dataset.delta, 10);
      if (!p || isNaN(d)) return;
      console.log('[OrderRenderer] Прямой клик по кнопке количества:', p, d);
      handleQuantityChange(btn, p, d);
    });
  };

  if (!mode.enabled || (!hasCommonPacking && individualVals.length === 0 && !isMulti)) {
    const minusBtn = document.createElement('button');
    minusBtn.className = 'btn-c qty-btn';
    minusBtn.dataset.path = path;
    minusBtn.dataset.delta = '-1';
    minusBtn.textContent = '−';
    attachHandler(minusBtn, -1);

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'qty-input';
    input.value = totalQty;
    input.min = 0;
    input.step = 1;
    input.dataset.path = path;
    input.addEventListener('input', (e) => {
      handleQuantityInput(e.target);
    });

    const plusBtn = document.createElement('button');
    plusBtn.className = 'btn-c qty-btn';
    plusBtn.dataset.path = path;
    plusBtn.dataset.delta = '1';
    plusBtn.textContent = '+';
    attachHandler(plusBtn, 1);

    div.appendChild(minusBtn);
    div.appendChild(input);
    div.appendChild(plusBtn);
    return div;
  }

  if (mode.enabled && individualVals.length === 1 && !hasCommonPacking && !isMulti) {
    const opt = options[mode.selectedOption] || options[0];
    const pieces = individualVals[0] || 0;
    const casesCount = opt && opt.qty ? Math.ceil(pieces / opt.qty) : 0;
    const maxCases = opt?.maxCases || 0;

    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.gap = '4px';

    const labelPcs = document.createElement('span');
    labelPcs.style.fontSize = '12px';
    labelPcs.style.color = 'var(--text-secondary)';
    labelPcs.textContent = 'шт:';
    container.appendChild(labelPcs);

    const minusPcs = document.createElement('button');
    minusPcs.className = 'btn-c single-piece-btn';
    minusPcs.dataset.path = path;
    minusPcs.dataset.delta = '-1';
    minusPcs.textContent = '−';
    minusPcs.style.width = '28px';
    minusPcs.style.height = '28px';
    minusPcs.style.fontSize = '14px';
    attachHandler(minusPcs, -1);
    container.appendChild(minusPcs);

    const inputPcs = document.createElement('input');
    inputPcs.type = 'number';
    inputPcs.className = 'single-pieces-input';
    inputPcs.value = pieces;
    inputPcs.min = 0;
    inputPcs.step = 1;
    inputPcs.dataset.path = path;
    inputPcs.style.width = '50px';
    inputPcs.style.padding = '2px';
    inputPcs.style.textAlign = 'center';
    inputPcs.style.fontSize = '13px';
    inputPcs.addEventListener('input', (e) => handleQuantityInput(e.target));
    container.appendChild(inputPcs);

    const plusPcs = document.createElement('button');
    plusPcs.className = 'btn-c single-piece-btn';
    plusPcs.dataset.path = path;
    plusPcs.dataset.delta = '1';
    plusPcs.textContent = '+';
    plusPcs.style.width = '28px';
    plusPcs.style.height = '28px';
    plusPcs.style.fontSize = '14px';
    attachHandler(plusPcs, 1);
    container.appendChild(plusPcs);

    const labelCases = document.createElement('span');
    labelCases.style.fontSize = '12px';
    labelCases.style.color = 'var(--text-secondary)';
    labelCases.textContent = 'кофры:';
    container.appendChild(labelCases);

    const minusCases = document.createElement('button');
    minusCases.className = 'btn-c single-case-btn';
    minusCases.dataset.path = path;
    minusCases.dataset.delta = '-1';
    minusCases.textContent = '−';
    minusCases.style.width = '28px';
    minusCases.style.height = '28px';
    minusCases.style.fontSize = '14px';
    attachHandler(minusCases, -1);
    container.appendChild(minusCases);

    const inputCases = document.createElement('input');
    inputCases.type = 'number';
    inputCases.className = 'single-cases-input';
    inputCases.value = casesCount;
    inputCases.min = 0;
    inputCases.step = 1;
    inputCases.dataset.path = path;
    inputCases.style.width = '50px';
    inputCases.style.padding = '2px';
    inputCases.style.textAlign = 'center';
    inputCases.style.fontSize = '13px';
    inputCases.addEventListener('input', (e) => handleQuantityInput(e.target));
    container.appendChild(inputCases);

    const plusCases = document.createElement('button');
    plusCases.className = 'btn-c single-case-btn';
    plusCases.dataset.path = path;
    plusCases.dataset.delta = '1';
    plusCases.textContent = '+';
    plusCases.style.width = '28px';
    plusCases.style.height = '28px';
    plusCases.style.fontSize = '14px';
    attachHandler(plusCases, 1);
    container.appendChild(plusCases);

    if (maxCases > 0) {
      const maxSpan = document.createElement('span');
      maxSpan.style.fontSize = '11px';
      maxSpan.style.color = 'var(--text-muted)';
      maxSpan.textContent = `(макс. ${maxCases})`;
      container.appendChild(maxSpan);
    }

    div.appendChild(container);
    return div;
  }

  const span = document.createElement('span');
  span.style.fontSize = '13px';
  span.style.color = 'var(--text-secondary)';
  span.textContent = `${totalQty} шт`;
  div.appendChild(span);
  return div;
}

/**
 * Обновляет строку позиции. Использует надёжный поиск по всем строкам с нормализацией.
 */
export function updateRow(path) {
  path = path.replace(/\\/g, '|');
  const container = document.getElementById('categoryContents');
  if (!container) {
    console.warn('[updateRow] Контейнер не найден');
    return;
  }

  // Находим строку перебором с нормализацией
  const rows = container.querySelectorAll('.row');
  let row = null;
  for (const r of rows) {
    const p = r.dataset.path ? r.dataset.path.replace(/\\/g, '|') : '';
    if (p === path) {
      row = r;
      break;
    }
  }
  if (!row) {
    console.warn('[updateRow] Строка не найдена для пути:', path);
    console.log('[updateRow] Доступные пути:', Array.from(rows).map(r => r.dataset.path));
    return;
  }

  const sq = getStockByPath(path);
  const totalQty = getTotalQty(path);
  row.classList.toggle('added', totalQty > 0);
  row.classList.toggle('overstock', totalQty > sq);

  // Обновляем все поля ввода в строке
  const inputs = row.querySelectorAll('input');
  inputs.forEach(input => {
    if (input.classList.contains('qty-input')) {
      input.value = totalQty;
    } else if (input.classList.contains('single-pieces-input')) {
      const mode = getCaseMode(path);
      const options = getItemPropsByPath(path).individualCases || [];
      const vals = getIndividualCaseValues(path);
      const pieces = vals[0] || 0;
      input.value = pieces;
    } else if (input.classList.contains('single-cases-input')) {
      const mode = getCaseMode(path);
      const options = getItemPropsByPath(path).individualCases || [];
      const vals = getIndividualCaseValues(path);
      const pieces = vals[0] || 0;
      const opt = options[mode.selectedOption] || options[0];
      const casesCount = opt && opt.qty ? Math.ceil(pieces / opt.qty) : 0;
      input.value = casesCount;
    } else if (input.classList.contains('child-multi-pieces')) {
      const idx = parseInt(input.dataset.idx, 10);
      const vals = getIndividualCaseValues(path);
      if (!isNaN(idx) && vals[idx] !== undefined) {
        input.value = vals[idx];
      }
    } else if (input.classList.contains('child-common-qty')) {
      const caseId = input.dataset.caseid;
      const packing = getOrderPacking(path);
      const p = packing.find(p => p.caseId === caseId);
      if (p) {
        input.value = p.pieces || 0;
      }
    } else if (input.classList.contains('child-extra-qty')) {
      const extra = getOrderExtra(path);
      input.value = extra;
    }
  });

  // Обновляем кнопки (линк, заметка, кофры)
  const links = getLinks(path);
  const hasLink = links.length > 0;
  const linkBtn = row.querySelector('.link-btn');
  if (linkBtn) {
    linkBtn.textContent = 'Линк' + (hasLink ? ' ✓' : '');
    linkBtn.classList.toggle('active', hasLink);
  }

  const note = getNote(path);
  const hasNote = !!note;
  const noteBtn = row.querySelector('.note-btn');
  if (noteBtn) {
    noteBtn.textContent = 'Заметка' + (hasNote ? ' ✓' : '');
    noteBtn.classList.toggle('has-note', hasNote);
  }

  const caseBtn = row.querySelector('.case-btn');
  if (caseBtn) {
    const mode = getCaseMode(path);
    const packing = getOrderPacking(path);
    const options = getItemPropsByPath(path).individualCases || [];
    const isMulti = mode.enabled && options.length > 1 && mode.multiSelected && mode.multiSelected.some(v => v === true);
    const hasCommonPacking = packing.length > 0;
    let statusText = 'Кофры';
    let statusClass = '';
    if (hasCommonPacking) {
      statusText = 'Общие';
      statusClass = 'common';
    } else if (isMulti) {
      statusText = 'Мульти';
      statusClass = 'multi';
    } else if (mode.enabled) {
      statusText = 'Вкл';
      statusClass = 'on';
    } else {
      statusText = 'Выкл';
      statusClass = 'off';
    }
    caseBtn.textContent = statusText;
    caseBtn.className = `action-btn case-btn ${mode.enabled ? 'active ' : ''}${statusClass}`;
  }

  updateChildRows(path);
}

/**
 * Обновляет дочерние строки (кофры, мульти). Использует надёжный поиск.
 */
export function updateChildRows(path) {
  path = path.replace(/\\/g, '|');
  const container = document.getElementById('categoryContents');
  if (!container) return;

  // Находим строку перебором
  const rows = container.querySelectorAll('.row');
  let row = null;
  for (const r of rows) {
    const p = r.dataset.path ? r.dataset.path.replace(/\\/g, '|') : '';
    if (p === path) {
      row = r;
      break;
    }
  }
  if (!row) return;

  let next = row.nextElementSibling;
  while (next && next.classList.contains('child-row')) {
    const toRemove = next;
    next = next.nextElementSibling;
    toRemove.remove();
  }

  const mode = getCaseMode(path);
  const options = getItemPropsByPath(path).individualCases || [];
  const packing = getOrderPacking(path);
  const individualVals = getIndividualCaseValues(path);
  const extra = getOrderExtra(path);
  const props = getItemPropsByPath(path);
  const commonCases = getCommonCases();

  const isMulti = mode.enabled && options.length > 1 && mode.multiSelected && mode.multiSelected.some(v => v === true);
  const hasCommonPacking = packing.length > 0;

  if (isMulti && mode.enabled && options.length > 1) {
    const childDiv = document.createElement('div');
    childDiv.className = 'child-row';
    childDiv.dataset.parent = path;
    childDiv.style.width = '100%';
    childDiv.style.flexBasis = '100%';
    childDiv.style.padding = '6px 8px';
    childDiv.style.borderRadius = '6px';
    childDiv.style.margin = '4px 0';
    childDiv.style.border = '1px solid var(--border-light)';

    let html = `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:6px;font-size:13px;color:var(--text-secondary);">
      <strong>Распределение по вариантам кофров</strong>
      <span style="margin-left:auto;">Итого: ${individualVals.reduce((a, b) => a + b, 0)} шт</span>
    </div>`;

    options.forEach((opt, idx) => {
      const val = individualVals[idx] || 0;
      const casesCount = Math.ceil(val / (opt.qty || 1));
      const maxPossible = getStockByPath(path);
      const maxCases = opt.maxCases || 0;

      html += `
        <div class="child-controls" data-caseid="${idx}" style="
          display: grid;
          grid-template-columns: 44px 22px 22px 36px 22px 22px 36px 22px 30px 60px 30px;
          align-items: center;
          gap: 2px 4px;
          padding: 4px 6px;
          background: var(--bg-input);
          border-radius: 4px;
          margin: 2px 0;
          border-left: 3px solid var(--text-muted);
          font-size: 11px;
          color: var(--text-secondary);
          overflow: hidden;
        ">
          <span style="font-weight:600;font-size:12px;color:var(--text-primary);">Вар${idx + 1}</span>
          <span>шт</span>
          <button class="btn-c child-multi-piece-btn" style="width:22px;height:22px;font-size:12px;padding:0;display:flex;align-items:center;justify-content:center;color:var(--text-primary);" data-path="${path}" data-idx="${idx}" data-delta="-1">−</button>
          <input type="number" class="child-multi-pieces" data-path="${path}" data-idx="${idx}" value="${val}" min="0" step="1" max="${maxPossible}" style="width:36px;padding:1px 2px;font-size:12px;text-align:center;background:var(--bg-input);border:1px solid var(--border-light);border-radius:3px;color:var(--text-primary);">
          <button class="btn-c child-multi-piece-btn" style="width:22px;height:22px;font-size:12px;padding:0;display:flex;align-items:center;justify-content:center;color:var(--text-primary);" data-path="${path}" data-idx="${idx}" data-delta="1">+</button>
          <span>коф</span>
          <button class="btn-c child-multi-case-btn" style="width:22px;height:22px;font-size:12px;padding:0;display:flex;align-items:center;justify-content:center;color:var(--text-primary);" data-path="${path}" data-idx="${idx}" data-delta="-${opt.qty || 1}">−</button>
          <input type="number" class="child-multi-cases" data-path="${path}" data-idx="${idx}" value="${casesCount}" min="0" step="1" readonly style="width:36px;padding:1px 2px;font-size:12px;text-align:center;background:var(--bg-input);border:1px solid var(--border-light);border-radius:3px;cursor:default;opacity:0.8;color:var(--text-primary);">
          <button class="btn-c child-multi-case-btn" style="width:22px;height:22px;font-size:12px;padding:0;display:flex;align-items:center;justify-content:center;color:var(--text-primary);" data-path="${path}" data-idx="${idx}" data-delta="${opt.qty || 1}">+</button>
          ${maxCases > 0 ? `<span style="font-size:10px;color:var(--text-muted);">м${maxCases}</span>` : `<span></span>`}
          <span style="font-size:10px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${opt.dimensions || ''}</span>
          <span style="font-size:10px;color:var(--text-muted);">в${opt.weight || 0}</span>
        </div>
      `;
    });

    childDiv.innerHTML = html;
    row.after(childDiv);
    return;
  }

  if (hasCommonPacking) {
    const childDiv = document.createElement('div');
    childDiv.className = 'child-row';
    childDiv.dataset.parent = path;
    childDiv.style.width = '100%';
    childDiv.style.flexBasis = '100%';
    childDiv.style.padding = '6px 8px';
    childDiv.style.borderRadius = '6px';
    childDiv.style.margin = '4px 0';
    childDiv.style.border = '1px solid var(--border-light)';

    let html = `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:6px;font-size:13px;color:var(--text-secondary);">
      <strong>Упаковка в общие кофры</strong>
      <span style="margin-left:auto;">Вне кофра: ${extra} шт</span>
    </div>`;

    const maxExtra = getStockByPath(path);
    html += `
      <div class="child-controls" style="
        display: grid;
        grid-template-columns: 44px 22px 22px 36px 22px 1fr;
        align-items: center;
        gap: 2px 4px;
        padding: 4px 6px;
        background: var(--bg-input);
        border-radius: 4px;
        margin: 2px 0;
        border-left: 3px solid var(--text-muted);
        font-size: 11px;
        color: var(--text-secondary);
        overflow: hidden;
      ">
        <span style="font-weight:600;font-size:12px;color:var(--text-primary);">Вне</span>
        <span></span>
        <button class="btn-c child-extra-btn" style="width:22px;height:22px;font-size:12px;padding:0;display:flex;align-items:center;justify-content:center;color:var(--text-primary);" data-path="${path}" data-delta="-1">−</button>
        <input type="number" class="child-extra-qty" data-path="${path}" value="${extra}" min="0" step="1" max="${maxExtra}" style="width:36px;padding:1px 2px;font-size:12px;text-align:center;background:var(--bg-input);border:1px solid var(--border-light);border-radius:3px;color:var(--text-primary);">
        <button class="btn-c child-extra-btn" style="width:22px;height:22px;font-size:12px;padding:0;display:flex;align-items:center;justify-content:center;color:var(--text-primary);" data-path="${path}" data-delta="1">+</button>
        <span></span>
      </div>
    `;

    packing.forEach((p) => {
      const caseObj = getCommonCaseById(p.caseId);
      const name = caseObj ? caseObj.name : 'удалённый кофр';
      const qty = p.pieces || 0;
      const maxPack = caseObj ? caseObj.qty : 0;
      const unitWeight = props.weight || 0;
      const filledWeight = qty * unitWeight;
      const maxWeight = caseObj?.maxWeight || Infinity;
      let fillPercent = 0;
      if (maxWeight > 0) fillPercent = Math.min(100, Math.round((filledWeight / maxWeight) * 100));

      html += `
        <div class="child-controls" data-caseid="${p.caseId}" style="
          display: grid;
          grid-template-columns: 80px 22px 22px 36px 22px 30px 60px 30px;
          align-items: center;
          gap: 2px 4px;
          padding: 4px 6px;
          background: var(--bg-input);
          border-radius: 4px;
          margin: 2px 0;
          border-left: 3px solid var(--text-muted);
          font-size: 11px;
          color: var(--text-secondary);
          overflow: hidden;
        ">
          <span style="font-weight:600;font-size:12px;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(name)}</span>
          <span>шт</span>
          <button class="btn-c child-common-btn" style="width:22px;height:22px;font-size:12px;padding:0;display:flex;align-items:center;justify-content:center;color:var(--text-primary);" data-path="${path}" data-caseid="${p.caseId}" data-delta="-1">−</button>
          <input type="number" class="child-common-qty" data-path="${path}" data-caseid="${p.caseId}" value="${qty}" min="0" step="1" max="${maxPack}" style="width:36px;padding:1px 2px;font-size:12px;text-align:center;background:var(--bg-input);border:1px solid var(--border-light);border-radius:3px;color:var(--text-primary);">
          <button class="btn-c child-common-btn" style="width:22px;height:22px;font-size:12px;padding:0;display:flex;align-items:center;justify-content:center;color:var(--text-primary);" data-path="${path}" data-caseid="${p.caseId}" data-delta="1">+</button>
          <span class="case-fill-percent" style="font-size:11px;font-weight:bold;color:var(--text-secondary);">${fillPercent}%</span>
          <span style="font-size:10px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${caseObj?.dimensions || ''}</span>
          <span style="font-size:10px;color:var(--text-muted);">в${caseObj?.emptyWeight || 0}</span>
        </div>
      `;
    });

    childDiv.innerHTML = html;
    row.after(childDiv);
    updateCommonCaseIndicators();
  }
}

export function updateCommonCaseIndicators() {
  const container = document.getElementById('categoryContents');
  if (!container) return;
  const state = getState();
  const allCommonCases = getCommonCases();
  const stats = new Map();
  allCommonCases.forEach(c => stats.set(c.id, { totalWeight: 0, maxWeight: c.maxWeight || 0, name: c.name }));

  for (const path in state.orderPacking) {
    const packing = state.orderPacking[path] || [];
    const props = getItemPropsByPath(path);
    const unitWeight = props.weight || 0;
    for (const p of packing) {
      const stat = stats.get(p.caseId);
      if (stat) stat.totalWeight += (p.pieces || 0) * unitWeight;
    }
  }

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
  });
}