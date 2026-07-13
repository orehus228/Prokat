// order-actions.js — Обработчики событий страницы заказа
import {
    editorData,
    getItemProps,
    getCommonCases
} from './data.js';

import {
    showToast,
    showPrompt
} from './ui.js';

import {
    order,
    links,
    notes,
    saveOrderData,
    getOrderPacking,
    setOrderPacking,
    getOrderExtra,
    setOrderExtra,
    getIndividualCaseValues,
    setIndividualCaseValues,
    getCaseMode,
    getCaseOptions,
    getSelectedOption,
    orderExclude
} from './order.js';

import {
    getStockValue,
    setValueOrder,
    getActiveItemsOrder,
    updateChildRowsForPath,
    buildInfoHtml
} from './order-helpers.js';

import {
    updateRowOrder,
    updateTotalsOrder,
    updateCategoryTotalsOrder,
    toggleInfoOrder,
    toggleDescOrder,
    openNoteEditorOrder,
    renderCommonCaseIndicatorsOrder,
    currentOrderCategory
} from './order-render.js';

// ============================================================
// ДЕЛЕГИРОВАНИЕ СОБЫТИЙ
// ============================================================

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
    
    eventDelegationInitialized = true;
}

function handleContainerClick(e) {
    const target = e.target.closest('.qty-btn');
    if (target && !target.closest('.child-controls')) {
        const path = target.dataset.path;
        const delta = parseInt(target.dataset.delta);
        if (path && !isNaN(delta)) {
            const row = target.closest('.row');
            const inp = row.querySelector('.qty-input');
            if (inp) {
                let val = parseInt(inp.value) || 0;
                val = Math.max(0, val + delta);
                const sq = getStockValue(path);
                if (val > sq) {
                    const name = path.split('|').pop();
                    showToast(`Превышено количество для "${name}" (доступно ${sq})`, 'warning');
                }
                inp.value = val;
                setValueOrder(path, val);
                updateRowOrder(path);
                updateTotalsOrder();
                updateCategoryTotalsOrder(currentOrderCategory);
            }
        }
        return;
    }

    const childBtn = e.target.closest('.child-qty-btn');
    if (childBtn) {
        const path = childBtn.dataset.path;
        const idx = parseInt(childBtn.dataset.idx);
        const delta = parseInt(childBtn.dataset.delta);
        const input = childBtn.parentElement.querySelector('.child-qty');
        if (input) {
            let val = parseInt(input.value) || 0;
            val = Math.max(0, val + delta);
            const sq = getStockValue(path);
            if (val > sq) {
                const name = path.split('|').pop();
                showToast(`Превышено количество для "${name}" (доступно ${sq})`, 'warning');
            }
            input.value = val;
            const vals = getIndividualCaseValues(path);
            vals[idx] = val;
            setIndividualCaseValues(path, vals);
            const total = vals.reduce((a,b) => a + b, 0);
            order[path] = total;
            if (total === 0) delete order[path];
            saveOrderData();
            updateRowOrder(path);
            updateTotalsOrder();
            updateCategoryTotalsOrder(currentOrderCategory);
        }
        return;
    }

    const commonBtn = e.target.closest('.child-common-btn');
    if (commonBtn) {
        const path = commonBtn.dataset.path;
        const caseId = commonBtn.dataset.caseid;
        const delta = parseInt(commonBtn.dataset.delta);
        const input = commonBtn.parentElement.querySelector('.child-common-qty');
        if (input) {
            let val = parseInt(input.value) || 0;
            val = Math.max(0, val + delta);
            const packing = getOrderPacking(path);
            const p = packing.find(p => p.caseId === caseId);
            if (p) {
                const c = getCommonCases().find(c => c.id === caseId);
                const maxPack = c ? c.qty : 0;
                if (val > maxPack) {
                    showToast(`Превышена вместимость кофра "${c ? c.name : 'удалённый'}"`, 'warning');
                    val = Math.min(val, maxPack);
                }
                input.value = val;
                p.qty = val;
                setOrderPacking(path, packing);
                saveOrderData();
                updateRowOrder(path);
                updateTotalsOrder();
                updateCategoryTotalsOrder(currentOrderCategory);
            }
        }
        return;
    }

    const extraBtn = e.target.closest('.child-extra-btn');
    if (extraBtn) {
        const path = extraBtn.dataset.path;
        const delta = parseInt(extraBtn.dataset.delta);
        const input = extraBtn.parentElement.querySelector('.child-extra-qty');
        if (input) {
            let val = parseInt(input.value) || 0;
            val = Math.max(0, val + delta);
            const sq = getStockValue(path);
            if (val > sq) {
                const name = path.split('|').pop();
                showToast(`Превышено количество для "${name}" (доступно ${sq})`, 'warning');
            }
            input.value = val;
            setOrderExtra(path, val);
            saveOrderData();
            updateRowOrder(path);
            updateTotalsOrder();
            updateCategoryTotalsOrder(currentOrderCategory);
        }
        return;
    }

    const infoBtn = e.target.closest('.info-btn');
    if (infoBtn) {
        toggleInfoOrder(infoBtn);
        return;
    }

    const descBtn = e.target.closest('.desc-btn');
    if (descBtn) {
        toggleDescOrder(descBtn);
        return;
    }

    const linkBtn = e.target.closest('.link-btn');
    if (linkBtn) {
        import('./cases.js').then(module => {
            module.openMatrixModal(linkBtn.dataset.path, false, currentOrderCategory);
        });
        return;
    }

    const caseBtn = e.target.closest('.case-btn');
    if (caseBtn) {
        import('./cases.js').then(module => {
            module.openCaseSettingsModal(caseBtn.dataset.path, () => {
                updateRowOrder(caseBtn.dataset.path);
                updateTotalsOrder();
                updateCategoryTotalsOrder(currentOrderCategory);
            });
        });
        return;
    }

    const noteBtn = e.target.closest('.note-btn');
    if (noteBtn) {
        openNoteEditorOrder(noteBtn);
        return;
    }

    const removeBtn = e.target.closest('.remove-common-pack');
    if (removeBtn) {
        const path = removeBtn.dataset.path;
        const caseId = removeBtn.dataset.caseid;
        const packing = getOrderPacking(path);
        const newPacking = packing.filter(p => p.caseId !== caseId);
        setOrderPacking(path, newPacking);
        saveOrderData();
        updateRowOrder(path);
        updateTotalsOrder();
        updateCategoryTotalsOrder(currentOrderCategory);
        showToast('Привязка удалена', 'neutral');
        return;
    }

    // Обработка дропдауна кофров (если используется)
    const dropdownBtn = e.target.closest('.case-dropdown-btn');
    if (dropdownBtn) {
        const path = dropdownBtn.dataset.path;
        const row = dropdownBtn.closest('.row');
        const dropdown = row.querySelector('.case-dropdown');
        if (dropdown) {
            dropdown.classList.toggle('open');
            document.querySelectorAll('.case-dropdown.open').forEach(d => {
                if (d !== dropdown) d.classList.remove('open');
            });
        }
        return;
    }

    const dropdownItem = e.target.closest('.case-dropdown-item');
    if (dropdownItem) {
        handleDropdownItemOrder(dropdownItem);
        return;
    }
}

function handleContainerInput(e) {
    const target = e.target.closest('.qty-input');
    if (target) {
        const path = target.dataset.path;
        let val = parseInt(target.value);
        if (isNaN(val) || val < 0) val = 0;
        target.value = val;
        setValueOrder(path, val);
        updateRowOrder(path);
        updateTotalsOrder();
        updateCategoryTotalsOrder(currentOrderCategory);
        return;
    }

    const childQty = e.target.closest('.child-qty');
    if (childQty) {
        const path = childQty.dataset.path;
        const idx = parseInt(childQty.dataset.idx);
        let val = parseInt(childQty.value);
        if (isNaN(val) || val < 0) val = 0;
        childQty.value = val;
        const vals = getIndividualCaseValues(path);
        vals[idx] = val;
        setIndividualCaseValues(path, vals);
        const total = vals.reduce((a,b) => a + b, 0);
        order[path] = total;
        if (total === 0) delete order[path];
        saveOrderData();
        updateRowOrder(path);
        updateTotalsOrder();
        updateCategoryTotalsOrder(currentOrderCategory);
        return;
    }

    const childCommon = e.target.closest('.child-common-qty');
    if (childCommon) {
        const path = childCommon.dataset.path;
        const caseId = childCommon.dataset.caseid;
        let val = parseInt(childCommon.value);
        if (isNaN(val) || val < 0) val = 0;
        const packing = getOrderPacking(path);
        const p = packing.find(p => p.caseId === caseId);
        if (p) {
            const c = getCommonCases().find(c => c.id === caseId);
            const maxPack = c ? c.qty : 0;
            if (val > maxPack) {
                showToast(`Превышена вместимость кофра "${c ? c.name : 'удалённый'}"`, 'warning');
                val = Math.min(val, maxPack);
                childCommon.value = val;
            }
            p.qty = val;
            setOrderPacking(path, packing);
            saveOrderData();
            updateRowOrder(path);
            updateTotalsOrder();
            updateCategoryTotalsOrder(currentOrderCategory);
        }
        return;
    }

    const childExtra = e.target.closest('.child-extra-qty');
    if (childExtra) {
        const path = childExtra.dataset.path;
        let val = parseInt(childExtra.value);
        if (isNaN(val) || val < 0) val = 0;
        childExtra.value = val;
        setOrderExtra(path, val);
        saveOrderData();
        updateRowOrder(path);
        updateTotalsOrder();
        updateCategoryTotalsOrder(currentOrderCategory);
        return;
    }

    const caseInput = e.target.closest('.case-input');
    if (caseInput) {
        const path = caseInput.dataset.path;
        let val = parseInt(caseInput.value);
        if (isNaN(val) || val < 0) val = 0;
        caseInput.value = val;
        const mode = getCaseMode(path);
        if (mode.enabled) {
            const opt = getSelectedOption(path);
            if (opt && opt.qty > 0) {
                const newQty = val * opt.qty;
                order[path] = newQty;
                if (newQty === 0) delete order[path];
                saveOrderData();
                updateRowOrder(path);
                updateTotalsOrder();
                updateCategoryTotalsOrder(currentOrderCategory);
            }
        }
        renderCommonCaseIndicatorsOrder();
        return;
    }
}

function handleContainerChange(e) {
    // Для select и других элементов, если понадобится
}

// ============================================================
// ОБРАБОТКА ДРОПДАУНА КОФРОВ
// ============================================================

function handleDropdownItemOrder(item) {
    const path = item.dataset.path;
    const idx = parseInt(item.dataset.idx);
    const isAlt = item.dataset.alt === 'true';
    const isAccumulate = item.dataset.accumulate === 'true';
    const mode = getCaseMode(path);
    if (isAccumulate) {
        mode.accumulate = !mode.accumulate;
        saveOrderData();
        updateRowOrder(path);
        updateTotalsOrder();
        updateCategoryTotalsOrder(currentOrderCategory);
        showToast(mode.accumulate ? 'Режим "Копиться в кофре" включён' : 'Режим "Копиться в кофре" выключен');
        renderCommonCaseIndicatorsOrder();
        return;
    }
    if (isAlt) {
        showToast('Альтернативный кофр (будет реализован позже)');
        const dropdown = item.closest('.case-dropdown');
        if (dropdown) dropdown.classList.remove('open');
        return;
    }
    if (idx !== undefined) {
        mode.enabled = true;
        mode.selectedOption = idx;
        mode.alt = null;
        saveOrderData();
        updateRowOrder(path);
        updateTotalsOrder();
        updateCategoryTotalsOrder(currentOrderCategory);
        showToast('Выбран вариант кофра, режим включён');
        const dropdown = item.closest('.case-dropdown');
        if (dropdown) dropdown.classList.remove('open');
        renderCommonCaseIndicatorsOrder();
        showToast('Теперь выберите количество в кофре', 'neutral');
    }
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================

export function initOrderActions() {
    setupEventDelegation();
    // Дополнительные обработчики, если нужны
}