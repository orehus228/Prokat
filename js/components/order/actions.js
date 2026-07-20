// components/order/actions.js
import { getState, saveState } from '../../core/state.js';
import { getStockValue, getItemProps, getCommonCases } from '../../data/editor-data.js';
import {
  getOrderPacking,
  getIndividualCaseValues,
  getOrderExtra,
  getTotalQty,
  setOrderValue,
  setOrderPacking,
  setIndividualCaseValues,
  setOrderExtra,
  getOrderProject,
} from '../../services/order-data.js';
import { getAvailableQuantity } from '../../services/project-data.js';
import * as calc from '../../services/calculations.js';
import { showToast } from '../../ui/toast.js';
import {
  updateRowOrder,
  updateTotalsOrder,
  updateCategoryTotalsOrder,
  toggleInfoOrder,
  toggleDescOrder,
  openNoteEditorOrder,
  refreshRow,
  currentOrderCategory,
} from './render.js';
import {
  updateAllCommonCaseIndicators,
  updateChildRowsForPath,
} from './helpers.js';

// ============================================================
// ПРОВЕРКА ДОСТУПНОСТИ В ПРОЕКТАХ
// ============================================================

function checkAndWarnAvailability(path, requestedQty) {
  const project = getOrderProject();
  if (!project.start_date || !project.end_date) return true;

  const result = getAvailableQuantity(path, project.start_date, project.end_date, requestedQty, project.id);
  if (result.isConflict) {
    const conflictNames = result.conflicts.map(c => `${c.project} (${c.quantity} шт)`).join(', ');
    showToast(`⚠️ Доступно: ${result.available} шт (из ${result.totalStock} на складе). Занято в проектах: ${conflictNames}`, 'warning', 4000);
    return false;
  }
  return true;
}

// ============================================================
// ОБРАБОТЧИКИ ИЗМЕНЕНИЯ КОЛИЧЕСТВА
// ============================================================

function handleQtyChange(path, delta) {
  const row = document.querySelector(`#categoryContents .row[data-path="${path}"]`);
  if (!row) return;
  const inp = row.querySelector('.qty-input');
  if (!inp) return;
  let val = parseInt(inp.value) || 0;
  val = Math.max(0, val + delta);
  const sq = getStockValue(path);
  if (val > sq) {
    const name = path.split('|').pop();
    showToast(`Превышено количество для "${name}" (доступно ${sq})`, 'warning');
    val = sq;
  }
  const availableCheck = checkAndWarnAvailability(path, val);
  if (!availableCheck) {
    const oldVal = parseInt(inp.dataset.oldValue) || 0;
    inp.value = oldVal;
    return;
  }
  inp.dataset.oldValue = val;
  inp.value = val;
  setOrderValue(path, val);
  updateRowOrder(path, false);
  updateTotalsOrder();
  updateCategoryTotalsOrder(currentOrderCategory);
}

function handleSinglePieceChange(path, delta) {
  const row = document.querySelector(`#categoryContents .row[data-path="${path}"]`);
  if (!row) return;
  const input = row.querySelector('.single-pieces-input');
  if (!input) return;
  let val = parseInt(input.value) || 0;
  val = Math.max(0, val + delta);
  const sq = getStockValue(path);
  if (val > sq) {
    const name = path.split('|').pop();
    showToast(`Превышено количество для "${name}" (доступно ${sq})`, 'warning');
    val = sq;
  }
  const availableCheck = checkAndWarnAvailability(path, val);
  if (!availableCheck) {
    const oldVal = parseInt(input.dataset.oldValue) || 0;
    input.value = oldVal;
    return;
  }
  input.dataset.oldValue = val;
  input.value = val;
  setIndividualCaseValues(path, [val]);
  setOrderValue(path, val);
  const opt = calc.getSelectedOption(path);
  if (opt && opt.qty > 0) {
    let casesCount = Math.ceil(val / opt.qty);
    const maxCases = opt.maxCases || 0;
    if (maxCases > 0 && casesCount > maxCases) {
      casesCount = maxCases;
      const newPieces = casesCount * opt.qty;
      input.value = newPieces;
      setIndividualCaseValues(path, [newPieces]);
      setOrderValue(path, newPieces);
      showToast(`Достигнут лимит кофров (макс. ${maxCases})`, 'warning');
    }
    const casesInput = row.querySelector('.single-cases-input');
    if (casesInput) casesInput.value = casesCount;
  }
  updateRowOrder(path, false);
  updateTotalsOrder();
  updateCategoryTotalsOrder(currentOrderCategory);
}

function handleSingleCaseChange(path, delta) {
  const row = document.querySelector(`#categoryContents .row[data-path="${path}"]`);
  if (!row) return;
  const input = row.querySelector('.single-cases-input');
  if (!input) return;
  let val = parseInt(input.value) || 0;
  val = Math.max(0, val + delta);
  const opt = calc.getSelectedOption(path);
  if (opt && opt.qty > 0) {
    const maxCases = opt.maxCases || 0;
    if (maxCases > 0 && val > maxCases) {
      val = maxCases;
      input.value = val;
      showToast(`Превышен лимит кофров (макс. ${maxCases})`, 'warning');
    }
    const pieces = val * opt.qty;
    const sq = getStockValue(path);
    if (pieces > sq) {
      showToast(`Превышено доступное количество (${sq})`, 'warning');
      const maxPieces = sq;
      const maxVal = Math.floor(maxPieces / opt.qty);
      if (maxVal < val) {
        val = maxVal;
        input.value = val;
        const newPieces = val * opt.qty;
        const piecesInput = row.querySelector('.single-pieces-input');
        if (piecesInput) piecesInput.value = newPieces;
        setIndividualCaseValues(path, [newPieces]);
        setOrderValue(path, newPieces);
        updateRowOrder(path, false);
        updateTotalsOrder();
        updateCategoryTotalsOrder(currentOrderCategory);
        return;
      }
    }
    const availableCheck = checkAndWarnAvailability(path, pieces);
    if (!availableCheck) {
      const oldVal = parseInt(input.dataset.oldValue) || 0;
      input.value = oldVal;
      return;
    }
    input.dataset.oldValue = val;
    const piecesInput = row.querySelector('.single-pieces-input');
    if (piecesInput) piecesInput.value = pieces;
    setIndividualCaseValues(path, [pieces]);
    setOrderValue(path, pieces);
    updateRowOrder(path, false);
    updateTotalsOrder();
    updateCategoryTotalsOrder(currentOrderCategory);
  }
}

function handleMultiPieceChange(path, idx, delta) {
  const row = document.querySelector(`#categoryContents .row[data-path="${path}"]`);
  if (!row) return;
  const childRow = row.nextElementSibling?.matches('.child-row') ? row.nextElementSibling : null;
  if (!childRow) return;
  const inputPieces = childRow.querySelector(`.child-multi-pieces[data-idx="${idx}"]`);
  if (!inputPieces) return;
  let val = parseInt(inputPieces.value) || 0;
  val = Math.max(0, val + delta);
  const sq = getStockValue(path);
  if (val > sq) {
    const name = path.split('|').pop();
    showToast(`Превышено количество для "${name}" (доступно ${sq})`, 'warning');
    val = sq;
  }
  const opt = calc.getCaseOptions(path)[idx];
  if (opt) {
    const maxCases = opt.maxCases || 0;
    const maxPieces = maxCases * opt.qty;
    if (maxCases > 0 && val > maxPieces) {
      val = maxPieces;
      inputPieces.value = val;
      showToast(`Достигнут лимит кофров для вар.${idx + 1} (макс. ${maxCases})`, 'warning');
    }
  }
  const vals = getIndividualCaseValues(path);
  vals[idx] = val;
  const totalVal = vals.reduce((a, b) => a + b, 0);
  const availableCheck = checkAndWarnAvailability(path, totalVal);
  if (!availableCheck) {
    const oldVal = parseInt(inputPieces.dataset.oldValue) || 0;
    inputPieces.value = oldVal;
    return;
  }
  inputPieces.dataset.oldValue = val;
  inputPieces.value = val;
  setIndividualCaseValues(path, vals);
  setOrderValue(path, totalVal);
  const casesCount = Math.ceil(val / opt.qty);
  const inputCases = childRow.querySelector(`.child-multi-cases[data-idx="${idx}"]`);
  if (inputCases) inputCases.value = casesCount;
  updateRowOrder(path, false);
  updateTotalsOrder();
  updateCategoryTotalsOrder(currentOrderCategory);
  updateAllCommonCaseIndicators();
}

function handleMultiCaseChange(path, idx, delta) {
  const row = document.querySelector(`#categoryContents .row[data-path="${path}"]`);
  if (!row) return;
  const childRow = row.nextElementSibling?.matches('.child-row') ? row.nextElementSibling : null;
  if (!childRow) return;
  const inputPieces = childRow.querySelector(`.child-multi-pieces[data-idx="${idx}"]`);
  if (!inputPieces) return;
  let val = parseInt(inputPieces.value) || 0;
  val = Math.max(0, val + delta);
  const sq = getStockValue(path);
  if (val > sq) {
    const name = path.split('|').pop();
    showToast(`Превышено количество для "${name}" (доступно ${sq})`, 'warning');
    val = sq;
  }
  const opt = calc.getCaseOptions(path)[idx];
  if (opt) {
    const maxCases = opt.maxCases || 0;
    const maxPieces = maxCases * opt.qty;
    if (maxCases > 0 && val > maxPieces) {
      val = maxPieces;
      inputPieces.value = val;
      showToast(`Достигнут лимит кофров для вар.${idx + 1} (макс. ${maxCases})`, 'warning');
    }
  }
  const vals = getIndividualCaseValues(path);
  vals[idx] = val;
  const totalVal = vals.reduce((a, b) => a + b, 0);
  const availableCheck = checkAndWarnAvailability(path, totalVal);
  if (!availableCheck) {
    const oldVal = parseInt(inputPieces.dataset.oldValue) || 0;
    inputPieces.value = oldVal;
    return;
  }
  inputPieces.dataset.oldValue = val;
  inputPieces.value = val;
  setIndividualCaseValues(path, vals);
  setOrderValue(path, totalVal);
  const casesCount = Math.ceil(val / opt.qty);
  const inputCases = childRow.querySelector(`.child-multi-cases[data-idx="${idx}"]`);
  if (inputCases) inputCases.value = casesCount;
  updateRowOrder(path, false);
  updateTotalsOrder();
  updateCategoryTotalsOrder(currentOrderCategory);
  updateAllCommonCaseIndicators();
}

function handleCommonQtyChange(path, caseId, delta) {
  const row = document.querySelector(`#categoryContents .row[data-path="${path}"]`);
  if (!row) return;
  const childRow = row.nextElementSibling?.matches('.child-row') ? row.nextElementSibling : null;
  if (!childRow) return;
  const input = childRow.querySelector(`.child-common-qty[data-caseid="${caseId}"]`);
  if (!input) return;
  let val = parseInt(input.value) || 0;
  val = Math.max(0, val + delta);
  const packing = getOrderPacking(path);
  const p = packing.find(p => p.caseId === caseId);
  if (p) {
    const c = getCommonCases().find(c => c.id === caseId);
    const maxPack = c ? c.qty : Infinity;
    const props = calc.getItemPropsByPath(path);
    const unitWeight = props.weight || 0;
    const newWeight = val * unitWeight;
    if (c && c.maxWeight && newWeight > c.maxWeight) {
      showToast(`Превышен максимальный вес кофра "${c.name}" (${c.maxWeight} кг)`, 'warning');
      val = Math.min(val, Math.floor(c.maxWeight / unitWeight));
      if (val < 0) val = 0;
    }
    if (val > maxPack) {
      showToast(`Превышена вместимость кофра "${c ? c.name : 'удалённый'}" (${maxPack} шт)`, 'warning');
      val = Math.min(val, maxPack);
    }
    const extra = getOrderExtra(path);
    const totalPacked = packing.reduce((s, p) => s + (p.pieces || 0), 0);
    const totalQty = totalPacked + extra;
    const availableCheck = checkAndWarnAvailability(path, totalQty);
    if (!availableCheck) {
      const oldVal = parseInt(input.dataset.oldValue) || 0;
      input.value = oldVal;
      return;
    }
    input.dataset.oldValue = val;
    input.value = val;
    p.pieces = val;
    setOrderPacking(path, packing);
    updateRowOrder(path, false);
    updateTotalsOrder();
    updateCategoryTotalsOrder(currentOrderCategory);
    updateAllCommonCaseIndicators();
  }
}

function handleExtraQtyChange(path, delta) {
  const row = document.querySelector(`#categoryContents .row[data-path="${path}"]`);
  if (!row) return;
  const childRow = row.nextElementSibling?.matches('.child-row') ? row.nextElementSibling : null;
  if (!childRow) return;
  const input = childRow.querySelector('.child-extra-qty');
  if (!input) return;
  let val = parseInt(input.value) || 0;
  val = Math.max(0, val + delta);
  const sq = getStockValue(path);
  if (val > sq) {
    const name = path.split('|').pop();
    showToast(`Превышено количество для "${name}" (доступно ${sq})`, 'warning');
    val = sq;
  }
  const packing = getOrderPacking(path);
  const totalPacked = packing.reduce((s, p) => s + (p.pieces || 0), 0);
  const totalQty = totalPacked + val;
  const availableCheck = checkAndWarnAvailability(path, totalQty);
  if (!availableCheck) {
    const oldVal = parseInt(input.dataset.oldValue) || 0;
    input.value = oldVal;
    return;
  }
  input.dataset.oldValue = val;
  input.value = val;
  setOrderExtra(path, val);
  updateRowOrder(path, false);
  updateTotalsOrder();
  updateCategoryTotalsOrder(currentOrderCategory);
  updateAllCommonCaseIndicators();
}

// ============================================================
// ПОВТОР ПРИ УДЕРЖАНИИ КНОПКИ (поддержка touch для мобильных)
// ============================================================

let repeatInterval = null;
let repeatTimeout = null;
let currentRepeatBtn = null;

function startRepeat(btn, delta) {
  if (repeatInterval) return;
  currentRepeatBtn = btn;
  const path = btn.dataset.path;
  const deltaVal = parseInt(btn.dataset.delta);
  if (!path || isNaN(deltaVal)) return;

  const doAction = () => {
    if (btn.classList.contains('qty-btn')) handleQtyChange(path, deltaVal);
    else if (btn.classList.contains('single-piece-btn')) handleSinglePieceChange(path, deltaVal);
    else if (btn.classList.contains('single-case-btn')) handleSingleCaseChange(path, deltaVal);
    else if (btn.classList.contains('child-multi-piece-btn')) {
      const idx = parseInt(btn.dataset.idx);
      if (!isNaN(idx)) handleMultiPieceChange(path, idx, deltaVal);
    } else if (btn.classList.contains('child-multi-case-btn')) {
      const idx = parseInt(btn.dataset.idx);
      if (!isNaN(idx)) handleMultiCaseChange(path, idx, deltaVal);
    } else if (btn.classList.contains('child-common-btn')) {
      const caseId = btn.dataset.caseid;
      if (caseId) handleCommonQtyChange(path, caseId, deltaVal);
    } else if (btn.classList.contains('child-extra-btn')) {
      handleExtraQtyChange(path, deltaVal);
    }
  };

  // Первое действие происходит сразу после задержки
  repeatTimeout = setTimeout(() => {
    // Запускаем интервал с периодичностью 100 мс
    repeatInterval = setInterval(() => {
      // Проверяем, что кнопка всё ещё нажата
      if (!currentRepeatBtn || currentRepeatBtn !== btn) {
        stopRepeat();
        return;
      }
      doAction();
    }, 100);
    // Выполняем сразу одно действие, чтобы не ждать
    doAction();
  }, 400);
}

function stopRepeat() {
  clearTimeout(repeatTimeout);
  clearInterval(repeatInterval);
  repeatInterval = null;
  repeatTimeout = null;
  currentRepeatBtn = null;
}

// ============================================================
// ОБРАБОТЧИКИ СОБЫТИЙ (мышь и touch)
// ============================================================

function handlePointerDown(e) {
  // Определяем, какая кнопка нажата
  const btn = e.target.closest('.btn-c');
  if (!btn || !btn.dataset.delta) return;
  if (btn.classList.contains('qty-btn') || btn.classList.contains('single-piece-btn') ||
      btn.classList.contains('single-case-btn') || btn.classList.contains('child-multi-piece-btn') ||
      btn.classList.contains('child-multi-case-btn') || btn.classList.contains('child-common-btn') ||
      btn.classList.contains('child-extra-btn')) {
    // Предотвращаем контекстное меню и стандартное поведение на мобильных
    e.preventDefault();
    startRepeat(btn, parseInt(btn.dataset.delta));
  }
}

function handlePointerUp(e) {
  stopRepeat();
}

// ============================================================
// КЛИК (для одиночных нажатий)
// ============================================================

function handleContainerClick(e) {
  const target = e.target.closest('.qty-btn');
  if (target && !target.closest('.child-controls')) {
    const path = target.dataset.path;
    const delta = parseInt(target.dataset.delta);
    if (path && !isNaN(delta)) handleQtyChange(path, delta);
    return;
  }
  const singlePieceBtn = e.target.closest('.single-piece-btn');
  if (singlePieceBtn) {
    const path = singlePieceBtn.dataset.path;
    const delta = parseInt(singlePieceBtn.dataset.delta);
    if (path && !isNaN(delta)) handleSinglePieceChange(path, delta);
    return;
  }
  const singleCaseBtn = e.target.closest('.single-case-btn');
  if (singleCaseBtn) {
    const path = singleCaseBtn.dataset.path;
    const delta = parseInt(singleCaseBtn.dataset.delta);
    if (path && !isNaN(delta)) handleSingleCaseChange(path, delta);
    return;
  }
  const multiPieceBtn = e.target.closest('.child-multi-piece-btn');
  if (multiPieceBtn) {
    const path = multiPieceBtn.dataset.path;
    const idx = parseInt(multiPieceBtn.dataset.idx);
    const delta = parseInt(multiPieceBtn.dataset.delta);
    if (path && !isNaN(idx) && !isNaN(delta)) handleMultiPieceChange(path, idx, delta);
    return;
  }
  const multiCaseBtn = e.target.closest('.child-multi-case-btn');
  if (multiCaseBtn) {
    const path = multiCaseBtn.dataset.path;
    const idx = parseInt(multiCaseBtn.dataset.idx);
    const delta = parseInt(multiCaseBtn.dataset.delta);
    if (path && !isNaN(idx) && !isNaN(delta)) handleMultiCaseChange(path, idx, delta);
    return;
  }
  const commonBtn = e.target.closest('.child-common-btn');
  if (commonBtn) {
    const path = commonBtn.dataset.path;
    const caseId = commonBtn.dataset.caseid;
    const delta = parseInt(commonBtn.dataset.delta);
    if (path && caseId && !isNaN(delta)) handleCommonQtyChange(path, caseId, delta);
    return;
  }
  const extraBtn = e.target.closest('.child-extra-btn');
  if (extraBtn) {
    const path = extraBtn.dataset.path;
    const delta = parseInt(extraBtn.dataset.delta);
    if (path && !isNaN(delta)) handleExtraQtyChange(path, delta);
    return;
  }

  // Кнопки действий
  const infoBtn = e.target.closest('.info-btn');
  if (infoBtn) { toggleInfoOrder(infoBtn); return; }
  const descBtn = e.target.closest('.desc-btn');
  if (descBtn) { toggleDescOrder(descBtn); return; }
  const linkBtn = e.target.closest('.link-btn');
  if (linkBtn) {
    import('../cases/matrix.js').then(module => {
      module.openMatrixModal(linkBtn.dataset.path, false, currentOrderCategory);
    });
    return;
  }
  const caseBtn = e.target.closest('.case-btn');
  if (caseBtn) {
    import('../cases/case-settings.js').then(module => {
      module.openCaseSettingsModal(caseBtn.dataset.path, () => {
        refreshRow(caseBtn.dataset.path);
        updateAllCommonCaseIndicators();
      });
    });
    return;
  }
  const noteBtn = e.target.closest('.note-btn');
  if (noteBtn) { openNoteEditorOrder(noteBtn); return; }
}

function handleContainerInput(e) {
  const target = e.target.closest('.qty-input');
  if (target) {
    const path = target.dataset.path;
    let val = parseInt(target.value);
    if (isNaN(val) || val < 0) val = 0;
    target.value = val;
    setOrderValue(path, val);
    updateRowOrder(path, false);
    updateTotalsOrder();
    updateCategoryTotalsOrder(currentOrderCategory);
    return;
  }
  const singlePieces = e.target.closest('.single-pieces-input');
  if (singlePieces) {
    const path = singlePieces.dataset.path;
    let val = parseInt(singlePieces.value);
    if (isNaN(val) || val < 0) val = 0;
    singlePieces.value = val;
    setIndividualCaseValues(path, [val]);
    setOrderValue(path, val);
    const opt = calc.getSelectedOption(path);
    if (opt && opt.qty > 0) {
      let casesCount = Math.ceil(val / opt.qty);
      const maxCases = opt.maxCases || 0;
      if (maxCases > 0 && casesCount > maxCases) {
        casesCount = maxCases;
        const newPieces = casesCount * opt.qty;
        singlePieces.value = newPieces;
        setIndividualCaseValues(path, [newPieces]);
        setOrderValue(path, newPieces);
        showToast(`Достигнут лимит кофров (макс. ${maxCases})`, 'warning');
      }
      const casesInput = singlePieces.parentElement.querySelector('.single-cases-input');
      if (casesInput) casesInput.value = casesCount;
    }
    updateRowOrder(path, false);
    updateTotalsOrder();
    updateCategoryTotalsOrder(currentOrderCategory);
    return;
  }
  const singleCases = e.target.closest('.single-cases-input');
  if (singleCases) {
    const path = singleCases.dataset.path;
    let val = parseInt(singleCases.value);
    if (isNaN(val) || val < 0) val = 0;
    singleCases.value = val;
    const opt = calc.getSelectedOption(path);
    if (opt && opt.qty > 0) {
      const maxCases = opt.maxCases || 0;
      if (maxCases > 0 && val > maxCases) {
        val = maxCases;
        singleCases.value = val;
        showToast(`Превышен лимит кофров (макс. ${maxCases})`, 'warning');
      }
      const pieces = val * opt.qty;
      const sq = getStockValue(path);
      if (pieces > sq) {
        showToast(`Превышено доступное количество (${sq})`, 'warning');
        const maxPieces = sq;
        const maxVal = Math.floor(maxPieces / opt.qty);
        if (maxVal < val) {
          val = maxVal;
          singleCases.value = val;
          const newPieces = val * opt.qty;
          const piecesInput = singleCases.parentElement.querySelector('.single-pieces-input');
          if (piecesInput) piecesInput.value = newPieces;
          setIndividualCaseValues(path, [newPieces]);
          setOrderValue(path, newPieces);
          updateRowOrder(path, false);
          updateTotalsOrder();
          updateCategoryTotalsOrder(currentOrderCategory);
          return;
        }
      }
      const piecesInput = singleCases.parentElement.querySelector('.single-pieces-input');
      if (piecesInput) piecesInput.value = pieces;
      setIndividualCaseValues(path, [pieces]);
      setOrderValue(path, pieces);
      updateRowOrder(path, false);
      updateTotalsOrder();
      updateCategoryTotalsOrder(currentOrderCategory);
    }
    return;
  }
  const multiPieces = e.target.closest('.child-multi-pieces');
  if (multiPieces) {
    const path = multiPieces.dataset.path;
    const idx = parseInt(multiPieces.dataset.idx);
    let val = parseInt(multiPieces.value);
    if (isNaN(val) || val < 0) val = 0;
    multiPieces.value = val;
    const opt = calc.getCaseOptions(path)[idx];
    if (opt) {
      const maxCases = opt.maxCases || 0;
      const maxPieces = maxCases * opt.qty;
      if (maxCases > 0 && val > maxPieces) {
        val = maxPieces;
        multiPieces.value = val;
        showToast(`Достигнут лимит кофров для вар.${idx + 1} (макс. ${maxCases})`, 'warning');
      }
      const vals = getIndividualCaseValues(path);
      vals[idx] = val;
      setIndividualCaseValues(path, vals);
      const total = vals.reduce((a, b) => a + b, 0);
      setOrderValue(path, total);
      const casesCount = Math.ceil(val / opt.qty);
      const inputCases = multiPieces.parentElement.querySelector(`.child-multi-cases[data-idx="${idx}"]`);
      if (inputCases) inputCases.value = casesCount;
      updateRowOrder(path, false);
      updateTotalsOrder();
      updateCategoryTotalsOrder(currentOrderCategory);
      updateAllCommonCaseIndicators();
    }
    return;
  }
  const multiCases = e.target.closest('.child-multi-cases');
  if (multiCases) {
    // Поле readonly, но на случай, если кто-то его изменит через инспектор
    const path = multiCases.dataset.path;
    const idx = parseInt(multiCases.dataset.idx);
    let val = parseInt(multiCases.value);
    if (isNaN(val) || val < 0) val = 0;
    multiCases.value = val;
    const opt = calc.getCaseOptions(path)[idx];
    if (opt) {
      const maxCases = opt.maxCases || 0;
      if (maxCases > 0 && val > maxCases) {
        val = maxCases;
        multiCases.value = val;
        showToast(`Превышен лимит кофров для вар.${idx + 1} (макс. ${maxCases})`, 'warning');
      }
      const pieces = val * opt.qty;
      const sq = getStockValue(path);
      if (pieces > sq) {
        showToast(`Превышено доступное количество (${sq})`, 'warning');
        const maxPieces = sq;
        const maxVal = Math.floor(maxPieces / opt.qty);
        if (maxVal < val) {
          val = maxVal;
          multiCases.value = val;
          const newPieces = val * opt.qty;
          const piecesInput = multiCases.parentElement.querySelector(`.child-multi-pieces[data-idx="${idx}"]`);
          if (piecesInput) piecesInput.value = newPieces;
          const vals = getIndividualCaseValues(path);
          vals[idx] = newPieces;
          setIndividualCaseValues(path, vals);
          const total = vals.reduce((a, b) => a + b, 0);
          setOrderValue(path, total);
          updateRowOrder(path, false);
          updateTotalsOrder();
          updateCategoryTotalsOrder(currentOrderCategory);
          updateAllCommonCaseIndicators();
          return;
        }
      }
      const piecesInput = multiCases.parentElement.querySelector(`.child-multi-pieces[data-idx="${idx}"]`);
      if (piecesInput) piecesInput.value = pieces;
      multiCases.value = val;
      const vals = getIndividualCaseValues(path);
      vals[idx] = pieces;
      setIndividualCaseValues(path, vals);
      const total = vals.reduce((a, b) => a + b, 0);
      setOrderValue(path, total);
      updateRowOrder(path, false);
      updateTotalsOrder();
      updateCategoryTotalsOrder(currentOrderCategory);
      updateAllCommonCaseIndicators();
    }
    return;
  }
  const commonQty = e.target.closest('.child-common-qty');
  if (commonQty) {
    const path = commonQty.dataset.path;
    const caseId = commonQty.dataset.caseid;
    let val = parseInt(commonQty.value);
    if (isNaN(val) || val < 0) val = 0;
    const packing = getOrderPacking(path);
    const p = packing.find(p => p.caseId === caseId);
    if (p) {
      const c = getCommonCases().find(c => c.id === caseId);
      const maxPack = c ? c.qty : Infinity;
      const props = calc.getItemPropsByPath(path);
      const unitWeight = props.weight || 0;
      const newWeight = val * unitWeight;
      if (c && c.maxWeight && newWeight > c.maxWeight) {
        showToast(`Превышен максимальный вес кофра "${c.name}" (${c.maxWeight} кг)`, 'warning');
        val = Math.min(val, Math.floor(c.maxWeight / unitWeight));
        if (val < 0) val = 0;
        commonQty.value = val;
      }
      if (val > maxPack) {
        showToast(`Превышена вместимость кофра "${c ? c.name : 'удалённый'}" (${maxPack} шт)`, 'warning');
        val = Math.min(val, maxPack);
        commonQty.value = val;
      }
      p.pieces = val;
      setOrderPacking(path, packing);
      updateRowOrder(path, false);
      updateTotalsOrder();
      updateCategoryTotalsOrder(currentOrderCategory);
      updateAllCommonCaseIndicators();
    }
    return;
  }
  const extraQty = e.target.closest('.child-extra-qty');
  if (extraQty) {
    const path = extraQty.dataset.path;
    let val = parseInt(extraQty.value);
    if (isNaN(val) || val < 0) val = 0;
    extraQty.value = val;
    setOrderExtra(path, val);
    updateRowOrder(path, false);
    updateTotalsOrder();
    updateCategoryTotalsOrder(currentOrderCategory);
    updateAllCommonCaseIndicators();
    return;
  }
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ ДЕЛЕГАЦИИ СОБЫТИЙ
// ============================================================

let eventDelegationInitialized = false;

export function setupEventDelegation() {
  if (eventDelegationInitialized) return;
  const container = document.getElementById('categoryContents');
  if (!container) return;

  // Удаляем старые обработчики, чтобы не было дублирования
  container.removeEventListener('click', handleContainerClick);
  container.removeEventListener('input', handleContainerInput);
  container.removeEventListener('mousedown', handlePointerDown);
  container.removeEventListener('mouseup', handlePointerUp);
  container.removeEventListener('mouseleave', handlePointerUp);
  container.removeEventListener('touchstart', handlePointerDown);
  container.removeEventListener('touchend', handlePointerUp);
  container.removeEventListener('touchcancel', handlePointerUp);

  // Добавляем новые
  container.addEventListener('click', handleContainerClick);
  container.addEventListener('input', handleContainerInput);
  container.addEventListener('mousedown', handlePointerDown);
  container.addEventListener('mouseup', handlePointerUp);
  container.addEventListener('mouseleave', handlePointerUp);
  container.addEventListener('touchstart', handlePointerDown, { passive: false });
  container.addEventListener('touchend', handlePointerUp);
  container.addEventListener('touchcancel', handlePointerUp);

  eventDelegationInitialized = true;
}

// ============================================================
// ОЧИСТКА ЗАКАЗА
// ============================================================

export async function clearOrderData() {
  const { showConfirm } = await import('../../ui/modal.js');
  const confirmed = await showConfirm('Очистить список?');
  if (!confirmed) return;
  const state = getState();
  for (let key in state.order) delete state.order[key];
  for (let key in state.orderSplits) delete state.orderSplits[key];
  for (let key in state.links) delete state.links[key];
  for (let key in state.notes) delete state.notes[key];
  for (let key in state.orderPacking) delete state.orderPacking[key];
  for (let key in state.individualCaseValues) delete state.individualCaseValues[key];
  for (let key in state.commonRoutes) delete state.commonRoutes[key];
  for (let key in state.caseModes) delete state.caseModes[key];
  for (let key in state.orderExclude) delete state.orderExclude[key];
  for (let key in state.orderExtra) delete state.orderExtra[key];
  saveState();
  const { renderOrderAll } = await import('./render.js');
  renderOrderAll();
  updateAllCommonCaseIndicators();
  showToast('Список очищен', 'success');
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ (вызов из main)
// ============================================================

export function initOrderActions() {
  setupEventDelegation();
}

export default {
  setupEventDelegation,
  initOrderActions,
  clearOrderData,
};