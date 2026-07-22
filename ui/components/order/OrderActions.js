// ui/components/order/OrderActions.js

import { showToast } from '../../toast.js';
import { showPrompt } from '../../modal.js';
import { getStockByPath } from '../../../services/stock.js';
import { getItemPropsByPath } from '../../../services/itemProps.js';
import { getCommonCaseById } from '../../../services/commonCases.js';
import {
  getCaseMode,
  getTotalQty,
  setOrderValue,
  setOrderPacking,
  setIndividualCaseValues,
  setOrderExtra,
  getOrderPacking,
  getIndividualCaseValues,
  getOrderExtra,
  getLinks,
  setNote,
  getNote
} from '../../../services/order.js';
import { getPackaging } from '../../../services/packaging.js';
import { updateTotals, updateCategoryTotals } from './OrderTotals.js';
import { updateRow, updateCommonCaseIndicators, getCurrentCategory } from './OrderRenderer.js';

let currentCategoryForActions = null;

export function setCurrentCategoryForActions(cat) {
  console.log('[OrderActions] setCurrentCategoryForActions:', cat);
  currentCategoryForActions = cat;
}

/**
 * Переключает отображение информации о позиции.
 */
export function toggleInfo(path) {
  const container = document.getElementById('categoryContents');
  if (!container) return;
  const row = container.querySelector(`.row[data-path="${path}"]`);
  if (!row) return;
  const existing = row.querySelector('.row-info');
  if (existing) {
    existing.remove();
    const btn = row.querySelector('.info-btn');
    if (btn) btn.textContent = 'Инфо';
    return;
  }
  const infoDiv = document.createElement('div');
  infoDiv.className = 'row-info';
  const props = getItemPropsByPath(path);
  const mode = getCaseMode(path);
  import('../../render-utils.js').then(({ buildInfoHtml }) => {
    infoDiv.innerHTML = buildInfoHtml(path, props, mode);
    row.appendChild(infoDiv);
    const btn = row.querySelector('.info-btn');
    if (btn) btn.textContent = 'Скрыть';
  });
}

/**
 * Переключает отображение описания позиции.
 */
export function toggleDesc(path) {
  const container = document.getElementById('categoryContents');
  if (!container) return;
  const row = container.querySelector(`.row[data-path="${path}"]`);
  if (!row) return;
  const block = row.nextElementSibling;
  if (block && block.classList.contains('desc-block')) {
    const isOpen = block.classList.toggle('open');
    const btn = row.querySelector('.desc-btn');
    if (btn) btn.textContent = isOpen ? 'Скрыть описание' : 'Описание';
  }
}

/**
 * Редактирует заметку позиции.
 */
export async function editNote(path) {
  const current = getNote(path);
  const newNote = await showPrompt('Редактировать заметку', 'Заметка:', current);
  if (newNote === null) return;
  setNote(path, newNote);
  updateRow(path);
  showToast('Заметка сохранена', 'neutral');
}

/**
 * Изменяет количество в простом режиме (qty-input).
 */
export function changeQty(path, delta) {
  console.log('[OrderActions] changeQty called:', path, delta);
  const current = getTotalQty(path);
  const sq = getStockByPath(path);
  let newVal = Math.max(0, current + delta);
  if (newVal > sq) {
    showToast(`Доступно только ${sq} шт`, 'warning');
    newVal = sq;
  }
  setOrderValue(path, newVal);
  updateRow(path);
  updateTotals();
  if (currentCategoryForActions) {
    updateCategoryTotals(currentCategoryForActions);
  } else {
    // fallback: получить категорию из пути
    const cat = path.split('|')[0];
    if (cat) updateCategoryTotals(cat);
  }
}

/**
 * Изменяет количество в режиме "один кофр" (штуки).
 */
export function changeSinglePiece(path, delta) {
  console.log('[OrderActions] changeSinglePiece called:', path, delta);
  const mode = getCaseMode(path);
  const options = getItemPropsByPath(path).individualCases || [];
  const opt = options[mode.selectedOption] || options[0];
  const current = getIndividualCaseValues(path)[0] || 0;
  let newVal = Math.max(0, current + delta);
  const sq = getStockByPath(path);
  if (newVal > sq) {
    showToast(`Доступно только ${sq} шт`, 'warning');
    newVal = sq;
  }
  if (opt && opt.maxCases > 0) {
    const maxPieces = opt.maxCases * opt.qty;
    if (newVal > maxPieces) {
      newVal = maxPieces;
      showToast(`Лимит кофров: макс. ${opt.maxCases} шт`, 'warning');
    }
  }
  setIndividualCaseValues(path, [newVal]);
  setOrderValue(path, newVal);
  updateRow(path);
  updateTotals();
  if (currentCategoryForActions) {
    updateCategoryTotals(currentCategoryForActions);
  } else {
    const cat = path.split('|')[0];
    if (cat) updateCategoryTotals(cat);
  }
}

/**
 * Изменяет количество в режиме "один кофр" (кофры).
 */
export function changeSingleCase(path, delta) {
  console.log('[OrderActions] changeSingleCase called:', path, delta);
  const mode = getCaseMode(path);
  const options = getItemPropsByPath(path).individualCases || [];
  const opt = options[mode.selectedOption] || options[0];
  if (!opt) return;
  const currentCases = Math.ceil((getIndividualCaseValues(path)[0] || 0) / opt.qty);
  let newCases = Math.max(0, currentCases + delta);
  if (opt.maxCases > 0 && newCases > opt.maxCases) {
    newCases = opt.maxCases;
    showToast(`Лимит кофров: макс. ${opt.maxCases}`, 'warning');
  }
  const newPieces = newCases * opt.qty;
  const sq = getStockByPath(path);
  if (newPieces > sq) {
    const maxCases = Math.floor(sq / opt.qty);
    if (maxCases < newCases) {
      newCases = maxCases;
      showToast(`Доступно только ${sq} шт`, 'warning');
    }
  }
  const finalPieces = newCases * opt.qty;
  setIndividualCaseValues(path, [finalPieces]);
  setOrderValue(path, finalPieces);
  updateRow(path);
  updateTotals();
  if (currentCategoryForActions) {
    updateCategoryTotals(currentCategoryForActions);
  } else {
    const cat = path.split('|')[0];
    if (cat) updateCategoryTotals(cat);
  }
}

/**
 * Изменяет количество в мультирежиме (штуки для конкретного варианта).
 */
export function changeMultiPiece(path, idx, delta) {
  console.log('[OrderActions] changeMultiPiece called:', path, idx, delta);
  const vals = getIndividualCaseValues(path);
  const current = vals[idx] || 0;
  let newVal = Math.max(0, current + delta);
  const sq = getStockByPath(path);
  if (newVal > sq) {
    showToast(`Доступно только ${sq} шт`, 'warning');
    newVal = sq;
  }
  const options = getItemPropsByPath(path).individualCases || [];
  const opt = options[idx] || options[0];
  if (opt && opt.maxCases > 0) {
    const maxPieces = opt.maxCases * opt.qty;
    if (newVal > maxPieces) {
      newVal = maxPieces;
      showToast(`Лимит кофров вар.${idx+1}: макс. ${opt.maxCases}`, 'warning');
    }
  }
  vals[idx] = newVal;
  const total = vals.reduce((a, b) => a + b, 0);
  setIndividualCaseValues(path, vals);
  setOrderValue(path, total);
  updateRow(path);
  updateTotals();
  if (currentCategoryForActions) {
    updateCategoryTotals(currentCategoryForActions);
  } else {
    const cat = path.split('|')[0];
    if (cat) updateCategoryTotals(cat);
  }
  updateCommonCaseIndicators();
}

/**
 * Изменяет количество в мультирежиме (кофры для конкретного варианта).
 */
export function changeMultiCase(path, idx, delta) {
  console.log('[OrderActions] changeMultiCase called:', path, idx, delta);
  const vals = getIndividualCaseValues(path);
  const options = getItemPropsByPath(path).individualCases || [];
  const opt = options[idx] || options[0];
  if (!opt) return;
  const currentPieces = vals[idx] || 0;
  const currentCases = Math.ceil(currentPieces / opt.qty);
  let newCases = Math.max(0, currentCases + delta);
  if (opt.maxCases > 0 && newCases > opt.maxCases) {
    newCases = opt.maxCases;
    showToast(`Лимит кофров вар.${idx+1}: макс. ${opt.maxCases}`, 'warning');
  }
  const newPieces = newCases * opt.qty;
  const sq = getStockByPath(path);
  if (newPieces > sq) {
    const maxCases = Math.floor(sq / opt.qty);
    if (maxCases < newCases) {
      newCases = maxCases;
      showToast(`Доступно только ${sq} шт`, 'warning');
    }
  }
  const finalPieces = newCases * opt.qty;
  vals[idx] = finalPieces;
  const total = vals.reduce((a, b) => a + b, 0);
  setIndividualCaseValues(path, vals);
  setOrderValue(path, total);
  updateRow(path);
  updateTotals();
  if (currentCategoryForActions) {
    updateCategoryTotals(currentCategoryForActions);
  } else {
    const cat = path.split('|')[0];
    if (cat) updateCategoryTotals(cat);
  }
  updateCommonCaseIndicators();
}

/**
 * Изменяет количество в общем кофре.
 */
export function changeCommonQty(path, caseId, delta) {
  console.log('[OrderActions] changeCommonQty called:', path, caseId, delta);
  const packing = getOrderPacking(path);
  const p = packing.find(p => p.caseId === caseId);
  if (!p) return;
  let newVal = Math.max(0, (p.pieces || 0) + delta);
  const caseObj = getCommonCaseById(caseId);
  if (caseObj) {
    const maxPack = caseObj.qty || 0;
    if (newVal > maxPack) {
      newVal = maxPack;
      showToast(`Превышена вместимость кофра "${caseObj.name}" (${maxPack} шт)`, 'warning');
    }
    const props = getItemPropsByPath(path);
    const unitWeight = props.weight || 0;
    const filledWeight = newVal * unitWeight;
    if (caseObj.maxWeight && filledWeight > caseObj.maxWeight) {
      const maxByWeight = Math.floor(caseObj.maxWeight / unitWeight);
      if (maxByWeight < newVal) {
        newVal = maxByWeight;
        showToast(`Превышен макс. вес кофра "${caseObj.name}" (${caseObj.maxWeight} кг)`, 'warning');
      }
    }
  }
  p.pieces = newVal;
  const totalPacked = packing.reduce((s, p) => s + (p.pieces || 0), 0);
  const extra = getOrderExtra(path);
  const totalQty = totalPacked + extra;
  const sq = getStockByPath(path);
  if (totalQty > sq) {
    const diff = totalQty - sq;
    if (extra >= diff) {
      setOrderExtra(path, extra - diff);
    } else {
      p.pieces = Math.max(0, p.pieces - (diff - extra));
      setOrderExtra(path, 0);
      showToast(`Доступно только ${sq} шт`, 'warning');
    }
  }
  setOrderPacking(path, packing);
  updateRow(path);
  updateTotals();
  if (currentCategoryForActions) {
    updateCategoryTotals(currentCategoryForActions);
  } else {
    const cat = path.split('|')[0];
    if (cat) updateCategoryTotals(cat);
  }
  updateCommonCaseIndicators();
}

/**
 * Изменяет количество вне кофров.
 */
export function changeExtraQty(path, delta) {
  console.log('[OrderActions] changeExtraQty called:', path, delta);
  const current = getOrderExtra(path);
  let newVal = Math.max(0, current + delta);
  const packing = getOrderPacking(path);
  const totalPacked = packing.reduce((s, p) => s + (p.pieces || 0), 0);
  const totalQty = totalPacked + newVal;
  const sq = getStockByPath(path);
  if (totalQty > sq) {
    newVal = Math.max(0, sq - totalPacked);
    showToast(`Доступно только ${sq} шт`, 'warning');
  }
  setOrderExtra(path, newVal);
  updateRow(path);
  updateTotals();
  if (currentCategoryForActions) {
    updateCategoryTotals(currentCategoryForActions);
  } else {
    const cat = path.split('|')[0];
    if (cat) updateCategoryTotals(cat);
  }
  updateCommonCaseIndicators();
}

/**
 * Обрабатывает изменение количества по кнопке +/- (вызывает нужную функцию по типу кнопки).
 */
export function handleQuantityChange(btn, path, delta) {
  console.log('[OrderActions] handleQuantityChange called:', path, delta, btn.className);
  if (btn.classList.contains('qty-btn')) {
    changeQty(path, delta);
  } else if (btn.classList.contains('single-piece-btn')) {
    changeSinglePiece(path, delta);
  } else if (btn.classList.contains('single-case-btn')) {
    changeSingleCase(path, delta);
  } else if (btn.classList.contains('child-multi-piece-btn')) {
    const idx = parseInt(btn.dataset.idx, 10);
    if (!isNaN(idx)) changeMultiPiece(path, idx, delta);
  } else if (btn.classList.contains('child-multi-case-btn')) {
    const idx = parseInt(btn.dataset.idx, 10);
    if (!isNaN(idx)) changeMultiCase(path, idx, delta);
  } else if (btn.classList.contains('child-common-btn')) {
    const caseId = btn.dataset.caseid;
    if (caseId) changeCommonQty(path, caseId, delta);
  } else if (btn.classList.contains('child-extra-btn')) {
    changeExtraQty(path, delta);
  }
}

/**
 * Обрабатывает ввод в полях количества (input).
 */
export function handleQuantityInput(target) {
  const path = target.dataset.path;
  console.log('[OrderActions] handleQuantityInput called:', path);

  if (target.classList.contains('qty-input')) {
    let val = parseInt(target.value, 10) || 0;
    if (val < 0) val = 0;
    target.value = val;
    setOrderValue(path, val);
    updateRow(path);
    updateTotals();
    if (currentCategoryForActions) {
      updateCategoryTotals(currentCategoryForActions);
    } else {
      const cat = path.split('|')[0];
      if (cat) updateCategoryTotals(cat);
    }
    return;
  }

  // ... (остальные обработчики аналогично)
}