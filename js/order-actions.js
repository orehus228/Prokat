// order-actions.js — Обработчики событий страницы заказа
import { editorData, getItemProps, getCommonCases } from './data.js';
import { showToast, showPrompt, showConfirm } from './ui.js';
import {
    order, orderSplits, links, notes, orderPacking, individualCaseValues, commonRoutes, caseModes,
    orderExclude, orderExtra, saveOrderData, getOrderPacking, setOrderPacking, getOrderExtra,
    setOrderExtra, getIndividualCaseValues, setIndividualCaseValues, getCaseMode, getCaseOptions,
    getSelectedOption
} from './order.js';
import {
    getStockValue, setValueOrder, getActiveItemsOrder, updateChildRowsForPath, buildInfoHtml,
    updateAllCommonCaseIndicators
} from './order-helpers.js';
import {
    updateRowOrder, updateTotalsOrder, updateCategoryTotalsOrder, toggleInfoOrder, toggleDescOrder,
    openNoteEditorOrder, renderCommonCaseIndicatorsOrder, currentOrderCategory, renderOrderAll,
    setSearchMode, setSearchQuery, refreshRow, resetInfoBlocks
} from './order-render.js';

let eventDelegationInitialized = false;

export function setupEventDelegation() {
    if (eventDelegationInitialized) return;
    const container = document.getElementById('categoryContents');
    if (!container) return;
    container.removeEventListener('click', handleContainerClick);
    container.addEventListener('click', handleContainerClick);
    container.removeEventListener('input', handleContainerInput);
    container.addEventListener('input', handleContainerInput);
    container.removeEventListener('change', handleContainerChange);
    container.addEventListener('change', handleContainerChange);
    container.removeEventListener('mousedown', handleContainerMouseDown);
    container.addEventListener('mousedown', handleContainerMouseDown);
    container.removeEventListener('mouseup', handleContainerMouseUp);
    container.addEventListener('mouseup', handleContainerMouseUp);
    container.removeEventListener('mouseleave', handleContainerMouseUp);
    container.addEventListener('mouseleave', handleContainerMouseUp);
    eventDelegationInitialized = true;
}

let repeatInterval = null, repeatTimeout = null;
function startRepeat(btn, delta) {
    if (repeatInterval) return;
    repeatTimeout = setTimeout(() => {
        repeatInterval = setInterval(() => {
            const path = btn.dataset.path;
            const deltaVal = parseInt(btn.dataset.delta);
            if (!path || isNaN(deltaVal)) return;
            if (btn.classList.contains('qty-btn')) handleQtyChange(path, deltaVal);
            else if (btn.classList.contains('single-piece-btn')) handleSinglePieceChange(path, deltaVal);
            else if (btn.classList.contains('single-case-btn')) handleSingleCaseChange(path, deltaVal);
            else if (btn.classList.contains('child-multi-piece-btn')) {
                const idx = parseInt(btn.dataset.idx);
                handleMultiPieceChange(path, idx, deltaVal);
            } else if (btn.classList.contains('child-multi-case-btn')) {
                const idx = parseInt(btn.dataset.idx);
                handleMultiCaseChange(path, idx, deltaVal);
            } else if (btn.classList.contains('child-common-btn')) {
                const caseId = btn.dataset.caseid;
                handleCommonQtyChange(path, caseId, deltaVal);
            } else if (btn.classList.contains('child-extra-btn')) {
                handleExtraQtyChange(path, deltaVal);
            }
        }, 100);
    }, 400);
}
function stopRepeat() { clearTimeout(repeatTimeout); clearInterval(repeatInterval); repeatInterval = null; repeatTimeout = null; }
function handleContainerMouseDown(e) {
    const btn = e.target.closest('.btn-c');
    if (!btn || !btn.dataset.delta) return;
    if (btn.classList.contains('qty-btn') || btn.classList.contains('single-piece-btn') || btn.classList.contains('single-case-btn') ||
        btn.classList.contains('child-multi-piece-btn') || btn.classList.contains('child-multi-case-btn') ||
        btn.classList.contains('child-common-btn') || btn.classList.contains('child-extra-btn')) {
        startRepeat(btn, parseInt(btn.dataset.delta));
    }
}
function handleContainerMouseUp(e) { stopRepeat(); }

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===
function handleQtyChange(path, delta) {
    const row = document.querySelector(`#categoryContents .row[data-path="${path}"]`);
    if (!row) return;
    const inp = row.querySelector('.qty-input');
    if (!inp) return;
    let val = parseInt(inp.value) || 0;
    val = Math.max(0, val + delta);
    const sq = getStockValue(path);
    if (val > sq) { const name = path.split('|').pop(); showToast(`Превышено количество для "${name}" (доступно ${sq})`, 'warning'); val = sq; }
    inp.value = val;
    setValueOrder(path, val);
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
    if (val > sq) { const name = path.split('|').pop(); showToast(`Превышено количество для "${name}" (доступно ${sq})`, 'warning'); val = sq; }
    input.value = val;
    setIndividualCaseValues(path, [val]);
    order[path] = val;
    if (val === 0) delete order[path];
    saveOrderData();
    const opt = getSelectedOption(path);
    if (opt && opt.qty > 0) {
        let casesCount = Math.ceil(val / opt.qty);
        const maxCases = opt.maxCases || 0;
        if (maxCases > 0 && casesCount > maxCases) { casesCount = maxCases; const newPieces = casesCount * opt.qty; input.value = newPieces; setIndividualCaseValues(path, [newPieces]); order[path] = newPieces; if (newPieces === 0) delete order[path]; saveOrderData(); showToast(`Достигнут лимит кофров (макс. ${maxCases})`, 'warning'); }
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
    const opt = getSelectedOption(path);
    if (opt && opt.qty > 0) {
        const maxCases = opt.maxCases || 0;
        if (maxCases > 0 && val > maxCases) { val = maxCases; input.value = val; showToast(`Превышен лимит кофров (макс. ${maxCases})`, 'warning'); }
        const pieces = val * opt.qty;
        const sq = getStockValue(path);
        if (pieces > sq) {
            showToast(`Превышено доступное количество (${sq})`, 'warning');
            const maxPieces = sq;
            const maxVal = Math.floor(maxPieces / opt.qty);
            if (maxVal < val) { val = maxVal; input.value = val; const newPieces = val * opt.qty; const piecesInput = row.querySelector('.single-pieces-input'); if (piecesInput) piecesInput.value = newPieces; setIndividualCaseValues(path, [newPieces]); order[path] = newPieces; if (newPieces === 0) delete order[path]; saveOrderData(); updateRowOrder(path, false); updateTotalsOrder(); updateCategoryTotalsOrder(currentOrderCategory); return; }
        }
        const piecesInput = row.querySelector('.single-pieces-input');
        if (piecesInput) piecesInput.value = pieces;
        setIndividualCaseValues(path, [pieces]);
        order[path] = pieces;
        if (pieces === 0) delete order[path];
        saveOrderData();
        updateRowOrder(path, false);
        updateTotalsOrder();
        updateCategoryTotalsOrder(currentOrderCategory);
    }
}

// ===== МУЛЬТИРЕЖИМ =====
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
    if (val > sq) { const name = path.split('|').pop(); showToast(`Превышено количество для "${name}" (доступно ${sq})`, 'warning'); val = sq; }
    inputPieces.value = val;
    const opt = getCaseOptions(path)[idx];
    if (opt && opt.qty > 0) {
        let casesCount = Math.ceil(val / opt.qty);
        const maxCases = opt.maxCases || 0;
        if (maxCases > 0 && casesCount > maxCases) { casesCount = maxCases; const newPieces = casesCount * opt.qty; inputPieces.value = newPieces; val = newPieces; showToast(`Достигнут лимит кофров для вар.${idx+1} (макс. ${maxCases})`, 'warning'); }
        const inputCases = childRow.querySelector(`.child-multi-cases[data-idx="${idx}"]`);
        if (inputCases) inputCases.value = casesCount;
    }
    const vals = getIndividualCaseValues(path);
    vals[idx] = val;
    setIndividualCaseValues(path, vals);
    const total = vals.reduce((a,b) => a + b, 0);
    order[path] = total;
    if (total === 0) delete order[path];
    saveOrderData();
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
    const inputCases = childRow.querySelector(`.child-multi-cases[data-idx="${idx}"]`);
    if (!inputCases) return;
    let val = parseInt(inputCases.value) || 0;
    val = Math.max(0, val + delta);
    const opt = getCaseOptions(path)[idx];
    if (opt && opt.qty > 0) {
        const maxCases = opt.maxCases || 0;
        if (maxCases > 0 && val > maxCases) { val = maxCases; inputCases.value = val; showToast(`Превышен лимит кофров для вар.${idx+1} (макс. ${maxCases})`, 'warning'); }
        const pieces = val * opt.qty;
        const sq = getStockValue(path);
        if (pieces > sq) {
            showToast(`Превышено доступное количество (${sq})`, 'warning');
            const maxPieces = sq;
            const maxVal = Math.floor(maxPieces / opt.qty);
            if (maxVal < val) {
                val = maxVal;
                inputCases.value = val;
                const newPieces = val * opt.qty;
                const inputPieces = childRow.querySelector(`.child-multi-pieces[data-idx="${idx}"]`);
                if (inputPieces) inputPieces.value = newPieces;
                const vals = getIndividualCaseValues(path);
                vals[idx] = newPieces;
                setIndividualCaseValues(path, vals);
                const total = vals.reduce((a,b) => a + b, 0);
                order[path] = total;
                if (total === 0) delete order[path];
                saveOrderData();
                updateRowOrder(path, false);
                updateTotalsOrder();
                updateCategoryTotalsOrder(currentOrderCategory);
                updateAllCommonCaseIndicators();
                return;
            }
        }
        const inputPieces = childRow.querySelector(`.child-multi-pieces[data-idx="${idx}"]`);
        if (inputPieces) inputPieces.value = pieces;
        inputCases.value = val;
        const vals = getIndividualCaseValues(path);
        vals[idx] = pieces;
        setIndividualCaseValues(path, vals);
        const total = vals.reduce((a,b) => a + b, 0);
        order[path] = total;
        if (total === 0) delete order[path];
        saveOrderData();
        updateRowOrder(path, false);
        updateTotalsOrder();
        updateCategoryTotalsOrder(currentOrderCategory);
        updateAllCommonCaseIndicators();
    }
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
        const props = getItemProps(path);
        const unitWeight = props.weight || 0;
        const newWeight = val * unitWeight;
        if (c && c.maxWeight && newWeight > c.maxWeight) { showToast(`Превышен максимальный вес кофра "${c.name}" (${c.maxWeight} кг)`, 'warning'); val = Math.min(val, Math.floor(c.maxWeight / unitWeight)); if (val < 0) val = 0; }
        if (val > maxPack) { showToast(`Превышена вместимость кофра "${c ? c.name : 'удалённый'}" (${maxPack} шт)`, 'warning'); val = Math.min(val, maxPack); }
        input.value = val;
        p.pieces = val;
        setOrderPacking(path, packing);
        saveOrderData();
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
    if (val > sq) { const name = path.split('|').pop(); showToast(`Превышено количество для "${name}" (доступно ${sq})`, 'warning'); val = sq; }
    input.value = val;
    setOrderExtra(path, val);
    saveOrderData();
    updateRowOrder(path, false);
    updateTotalsOrder();
    updateCategoryTotalsOrder(currentOrderCategory);
    updateAllCommonCaseIndicators();
}

// === ОСНОВНОЙ ОБРАБОТЧИК КЛИКОВ ===
function handleContainerClick(e) {
    const target = e.target.closest('.qty-btn');
    if (target && !target.closest('.child-controls')) { const path = target.dataset.path; const delta = parseInt(target.dataset.delta); if (path && !isNaN(delta)) handleQtyChange(path, delta); return; }
    const singlePieceBtn = e.target.closest('.single-piece-btn'); if (singlePieceBtn) { const path = singlePieceBtn.dataset.path; const delta = parseInt(singlePieceBtn.dataset.delta); if (path && !isNaN(delta)) handleSinglePieceChange(path, delta); return; }
    const singleCaseBtn = e.target.closest('.single-case-btn'); if (singleCaseBtn) { const path = singleCaseBtn.dataset.path; const delta = parseInt(singleCaseBtn.dataset.delta); if (path && !isNaN(delta)) handleSingleCaseChange(path, delta); return; }
    const multiPieceBtn = e.target.closest('.child-multi-piece-btn'); if (multiPieceBtn) { const path = multiPieceBtn.dataset.path; const idx = parseInt(multiPieceBtn.dataset.idx); const delta = parseInt(multiPieceBtn.dataset.delta); if (path && !isNaN(idx) && !isNaN(delta)) handleMultiPieceChange(path, idx, delta); return; }
    const multiCaseBtn = e.target.closest('.child-multi-case-btn'); if (multiCaseBtn) { const path = multiCaseBtn.dataset.path; const idx = parseInt(multiCaseBtn.dataset.idx); const delta = parseInt(multiCaseBtn.dataset.delta); if (path && !isNaN(idx) && !isNaN(delta)) handleMultiCaseChange(path, idx, delta); return; }
    const commonBtn = e.target.closest('.child-common-btn'); if (commonBtn) { const path = commonBtn.dataset.path; const caseId = commonBtn.dataset.caseid; const delta = parseInt(commonBtn.dataset.delta); if (path && caseId && !isNaN(delta)) handleCommonQtyChange(path, caseId, delta); return; }
    const extraBtn = e.target.closest('.child-extra-btn'); if (extraBtn) { const path = extraBtn.dataset.path; const delta = parseInt(extraBtn.dataset.delta); if (path && !isNaN(delta)) handleExtraQtyChange(path, delta); return; }
    // Удалён обработчик для .remove-common-pack, так как кнопка больше не рендерится
    const infoBtn = e.target.closest('.info-btn'); if (infoBtn) { toggleInfoOrder(infoBtn); return; }
    const descBtn = e.target.closest('.desc-btn'); if (descBtn) { toggleDescOrder(descBtn); return; }
    const linkBtn = e.target.closest('.link-btn'); if (linkBtn) { import('./cases.js').then(module => { module.openMatrixModal(linkBtn.dataset.path, false, currentOrderCategory); }); return; }
    const caseBtn = e.target.closest('.case-btn'); if (caseBtn) { import('./cases.js').then(module => { module.openCaseSettingsModal(caseBtn.dataset.path, () => { refreshRow(caseBtn.dataset.path); updateAllCommonCaseIndicators(); }); }); return; }
    const noteBtn = e.target.closest('.note-btn'); if (noteBtn) { openNoteEditorOrder(noteBtn); return; }
    const dropdownBtn = e.target.closest('.case-dropdown-btn'); if (dropdownBtn) { const path = dropdownBtn.dataset.path; const row = dropdownBtn.closest('.row'); const dropdown = row.querySelector('.case-dropdown'); if (dropdown) { dropdown.classList.toggle('open'); document.querySelectorAll('.case-dropdown.open').forEach(d => { if (d !== dropdown) d.classList.remove('open'); }); } return; }
    const dropdownItem = e.target.closest('.case-dropdown-item'); if (dropdownItem) { handleDropdownItemOrder(dropdownItem); return; }
}

function handleContainerInput(e) {
    const target = e.target.closest('.qty-input');
    if (target) { const path = target.dataset.path; let val = parseInt(target.value); if (isNaN(val) || val < 0) val = 0; target.value = val; setValueOrder(path, val); updateRowOrder(path, false); updateTotalsOrder(); updateCategoryTotalsOrder(currentOrderCategory); return; }
    const singlePieces = e.target.closest('.single-pieces-input');
    if (singlePieces) { const path = singlePieces.dataset.path; let val = parseInt(singlePieces.value); if (isNaN(val) || val < 0) val = 0; singlePieces.value = val; setIndividualCaseValues(path, [val]); order[path] = val; if (val === 0) delete order[path]; saveOrderData(); const opt = getSelectedOption(path); if (opt && opt.qty > 0) { let casesCount = Math.ceil(val / opt.qty); const maxCases = opt.maxCases || 0; if (maxCases > 0 && casesCount > maxCases) { casesCount = maxCases; const newPieces = casesCount * opt.qty; singlePieces.value = newPieces; setIndividualCaseValues(path, [newPieces]); order[path] = newPieces; if (newPieces === 0) delete order[path]; saveOrderData(); showToast(`Достигнут лимит кофров (макс. ${maxCases})`, 'warning'); } const casesInput = singlePieces.parentElement.querySelector('.single-cases-input'); if (casesInput) casesInput.value = casesCount; } updateRowOrder(path, false); updateTotalsOrder(); updateCategoryTotalsOrder(currentOrderCategory); return; }
    const singleCases = e.target.closest('.single-cases-input');
    if (singleCases) { const path = singleCases.dataset.path; let val = parseInt(singleCases.value); if (isNaN(val) || val < 0) val = 0; singleCases.value = val; const opt = getSelectedOption(path); if (opt && opt.qty > 0) { const maxCases = opt.maxCases || 0; if (maxCases > 0 && val > maxCases) { val = maxCases; singleCases.value = val; showToast(`Превышен лимит кофров (макс. ${maxCases})`, 'warning'); } const pieces = val * opt.qty; const sq = getStockValue(path); if (pieces > sq) { showToast(`Превышено доступное количество (${sq})`, 'warning'); const maxPieces = sq; const maxVal = Math.floor(maxPieces / opt.qty); if (maxVal < val) { val = maxVal; singleCases.value = val; const newPieces = val * opt.qty; const piecesInput = singleCases.parentElement.querySelector('.single-pieces-input'); if (piecesInput) piecesInput.value = newPieces; setIndividualCaseValues(path, [newPieces]); order[path] = newPieces; if (newPieces === 0) delete order[path]; saveOrderData(); updateRowOrder(path, false); updateTotalsOrder(); updateCategoryTotalsOrder(currentOrderCategory); return; } } const piecesInput = singleCases.parentElement.querySelector('.single-pieces-input'); if (piecesInput) piecesInput.value = pieces; setIndividualCaseValues(path, [pieces]); order[path] = pieces; if (pieces === 0) delete order[path]; saveOrderData(); updateRowOrder(path, false); updateTotalsOrder(); updateCategoryTotalsOrder(currentOrderCategory); } return; }
    const multiPieces = e.target.closest('.child-multi-pieces');
    if (multiPieces) { const path = multiPieces.dataset.path; const idx = parseInt(multiPieces.dataset.idx); let val = parseInt(multiPieces.value); if (isNaN(val) || val < 0) val = 0; multiPieces.value = val; const opt = getCaseOptions(path)[idx]; if (opt && opt.qty > 0) { let casesCount = Math.ceil(val / opt.qty); const maxCases = opt.maxCases || 0; if (maxCases > 0 && casesCount > maxCases) { casesCount = maxCases; const newPieces = casesCount * opt.qty; multiPieces.value = newPieces; val = newPieces; showToast(`Достигнут лимит кофров для вар.${idx+1} (макс. ${maxCases})`, 'warning'); } const casesInput = multiPieces.parentElement.querySelector(`.child-multi-cases[data-idx="${idx}"]`); if (casesInput) casesInput.value = casesCount; } const vals = getIndividualCaseValues(path); vals[idx] = val; setIndividualCaseValues(path, vals); const total = vals.reduce((a,b) => a + b, 0); order[path] = total; if (total === 0) delete order[path]; saveOrderData(); updateRowOrder(path, false); updateTotalsOrder(); updateCategoryTotalsOrder(currentOrderCategory); updateAllCommonCaseIndicators(); return; }
    const multiCases = e.target.closest('.child-multi-cases');
    if (multiCases) { const path = multiCases.dataset.path; const idx = parseInt(multiCases.dataset.idx); let val = parseInt(multiCases.value); if (isNaN(val) || val < 0) val = 0; multiCases.value = val; const opt = getCaseOptions(path)[idx]; if (opt && opt.qty > 0) { const maxCases = opt.maxCases || 0; if (maxCases > 0 && val > maxCases) { val = maxCases; multiCases.value = val; showToast(`Превышен лимит кофров для вар.${idx+1} (макс. ${maxCases})`, 'warning'); } const pieces = val * opt.qty; const sq = getStockValue(path); if (pieces > sq) { showToast(`Превышено доступное количество (${sq})`, 'warning'); const maxPieces = sq; const maxVal = Math.floor(maxPieces / opt.qty); if (maxVal < val) { val = maxVal; multiCases.value = val; const newPieces = val * opt.qty; const piecesInput = multiCases.parentElement.querySelector(`.child-multi-pieces[data-idx="${idx}"]`); if (piecesInput) piecesInput.value = newPieces; const vals = getIndividualCaseValues(path); vals[idx] = newPieces; setIndividualCaseValues(path, vals); const total = vals.reduce((a,b) => a + b, 0); order[path] = total; if (total === 0) delete order[path]; saveOrderData(); updateRowOrder(path, false); updateTotalsOrder(); updateCategoryTotalsOrder(currentOrderCategory); updateAllCommonCaseIndicators(); return; } } const piecesInput = multiCases.parentElement.querySelector(`.child-multi-pieces[data-idx="${idx}"]`); if (piecesInput) piecesInput.value = pieces; multiCases.value = val; const vals = getIndividualCaseValues(path); vals[idx] = pieces; setIndividualCaseValues(path, vals); const total = vals.reduce((a,b) => a + b, 0); order[path] = total; if (total === 0) delete order[path]; saveOrderData(); updateRowOrder(path, false); updateTotalsOrder(); updateCategoryTotalsOrder(currentOrderCategory); updateAllCommonCaseIndicators(); } return; }
    const commonQty = e.target.closest('.child-common-qty');
    if (commonQty) { const path = commonQty.dataset.path; const caseId = commonQty.dataset.caseid; let val = parseInt(commonQty.value); if (isNaN(val) || val < 0) val = 0; const packing = getOrderPacking(path); const p = packing.find(p => p.caseId === caseId); if (p) { const c = getCommonCases().find(c => c.id === caseId); const maxPack = c ? c.qty : Infinity; const props = getItemProps(path); const unitWeight = props.weight || 0; const newWeight = val * unitWeight; if (c && c.maxWeight && newWeight > c.maxWeight) { showToast(`Превышен максимальный вес кофра "${c.name}" (${c.maxWeight} кг)`, 'warning'); val = Math.min(val, Math.floor(c.maxWeight / unitWeight)); if (val < 0) val = 0; commonQty.value = val; } if (val > maxPack) { showToast(`Превышена вместимость кофра "${c ? c.name : 'удалённый'}" (${maxPack} шт)`, 'warning'); val = Math.min(val, maxPack); commonQty.value = val; } p.pieces = val; setOrderPacking(path, packing); saveOrderData(); updateRowOrder(path, false); updateTotalsOrder(); updateCategoryTotalsOrder(currentOrderCategory); updateAllCommonCaseIndicators(); } return; }
    const extraQty = e.target.closest('.child-extra-qty');
    if (extraQty) { const path = extraQty.dataset.path; let val = parseInt(extraQty.value); if (isNaN(val) || val < 0) val = 0; extraQty.value = val; setOrderExtra(path, val); saveOrderData(); updateRowOrder(path, false); updateTotalsOrder(); updateCategoryTotalsOrder(currentOrderCategory); updateAllCommonCaseIndicators(); return; }
}
function handleContainerChange(e) {}

function handleDropdownItemOrder(item) {
    const path = item.dataset.path;
    const idx = parseInt(item.dataset.idx);
    const isAlt = item.dataset.alt === 'true';
    const isAccumulate = item.dataset.accumulate === 'true';
    const mode = getCaseMode(path);
    if (isAccumulate) { mode.accumulate = !mode.accumulate; saveOrderData(); updateRowOrder(path, false); updateTotalsOrder(); updateCategoryTotalsOrder(currentOrderCategory); showToast(mode.accumulate ? 'Режим "Копиться в кофре" включён' : 'Режим "Копиться в кофре" выключен'); renderCommonCaseIndicatorsOrder(); return; }
    if (isAlt) { showToast('Альтернативный кофр настраивается в модалке', 'neutral'); const dropdown = item.closest('.case-dropdown'); if (dropdown) dropdown.classList.remove('open'); return; }
    if (idx !== undefined) { import('./cases.js').then(module => { module.openCaseSettingsModal(path, () => { refreshRow(path); updateAllCommonCaseIndicators(); }); }); const dropdown = item.closest('.case-dropdown'); if (dropdown) dropdown.classList.remove('open'); }
}

export async function clearOrderData() {
    const confirmed = await showConfirm('Очистить список?');
    if (!confirmed) return;
    for (let key in order) delete order[key];
    for (let key in orderSplits) delete orderSplits[key];
    for (let key in links) delete links[key];
    for (let key in notes) delete notes[key];
    for (let key in orderPacking) delete orderPacking[key];
    for (let key in individualCaseValues) delete individualCaseValues[key];
    for (let key in commonRoutes) delete commonRoutes[key];
    for (let key in caseModes) delete caseModes[key];
    for (let key in orderExclude) delete orderExclude[key];
    for (let key in orderExtra) delete orderExtra[key];
    setSearchMode(false);
    setSearchQuery('');
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    resetInfoBlocks();
    saveOrderData();
    renderOrderAll();
    updateAllCommonCaseIndicators();
    showToast('Список очищен', 'success');
}

export function initOrderActions() {
    setupEventDelegation();
}