// order-actions.js — Обработчики событий страницы заказа
import {
    editorData,
    getItemProps,
    getCommonCases
} from './data.js';

import {
    showToast,
    showPrompt,
    showConfirm
} from './ui.js';

import {
    order,
    orderSplits,
    links,
    notes,
    orderPacking,
    individualCaseValues,
    commonRoutes,
    caseModes,
    orderExclude,
    orderExtra,
    saveOrderData,
    getOrderPacking,
    setOrderPacking,
    getOrderExtra,
    setOrderExtra,
    getIndividualCaseValues,
    setIndividualCaseValues,
    getCaseMode,
    getCaseOptions,
    getSelectedOption
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
    currentOrderCategory,
    renderOrderAll,
    setSearchMode,
    setSearchQuery
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

    // === SINGLE-РЕЖИМ: кнопки +/− для штук ===
    const singlePieceBtn = e.target.closest('.single-piece-btn');
    if (singlePieceBtn) {
        const path = singlePieceBtn.dataset.path;
        const delta = parseInt(singlePieceBtn.dataset.delta);
        const input = singlePieceBtn.parentElement.querySelector('.single-pieces-input');
        if (input) {
            let val = parseInt(input.value) || 0;
            val = Math.max(0, val + delta);
            const sq = getStockValue(path);
            if (val > sq) {
                const name = path.split('|').pop();
                showToast(`Превышено количество для "${name}" (доступно ${sq})`, 'warning');
            }
            input.value = val;
            // Обновляем данные
            setIndividualCaseValues(path, [val]);
            order[path] = val;
            if (val === 0) delete order[path];
            saveOrderData();
            // Пересчитываем поле кофров с учётом ограничений
            const opt = getSelectedOption(path);
            if (opt && opt.qty > 0) {
                let casesCount = Math.ceil(val / opt.qty);
                const maxCases = opt.maxCases || 0;
                if (maxCases > 0 && casesCount > maxCases) {
                    casesCount = maxCases;
                    const newPieces = casesCount * opt.qty;
                    input.value = newPieces;
                    setIndividualCaseValues(path, [newPieces]);
                    order[path] = newPieces;
                    if (newPieces === 0) delete order[path];
                    saveOrderData();
                    showToast(`Достигнут лимит кофров (макс. ${maxCases})`, 'warning');
                }
                const casesInput = singlePieceBtn.parentElement.querySelector('.single-cases-input');
                if (casesInput) casesInput.value = casesCount;
            }
            updateRowOrder(path);
            updateTotalsOrder();
            updateCategoryTotalsOrder(currentOrderCategory);
        }
        return;
    }

    // === SINGLE-РЕЖИМ: кнопки +/− для кофров ===
    const singleCaseBtn = e.target.closest('.single-case-btn');
    if (singleCaseBtn) {
        const path = singleCaseBtn.dataset.path;
        const delta = parseInt(singleCaseBtn.dataset.delta);
        const input = singleCaseBtn.parentElement.querySelector('.single-cases-input');
        if (input) {
            let val = parseInt(input.value) || 0;
            val = Math.max(0, val + delta);
            const opt = getSelectedOption(path);
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
                    // Подбираем максимальное количество кофров
                    const maxPieces = sq;
                    const maxVal = Math.floor(maxPieces / opt.qty);
                    if (maxVal < val) {
                        val = maxVal;
                        input.value = val;
                        const newPieces = val * opt.qty;
                        const piecesInput = singleCaseBtn.parentElement.querySelector('.single-pieces-input');
                        if (piecesInput) piecesInput.value = newPieces;
                        setIndividualCaseValues(path, [newPieces]);
                        order[path] = newPieces;
                        if (newPieces === 0) delete order[path];
                        saveOrderData();
                        updateRowOrder(path);
                        updateTotalsOrder();
                        updateCategoryTotalsOrder(currentOrderCategory);
                        return;
                    }
                }
                const piecesInput = singleCaseBtn.parentElement.querySelector('.single-pieces-input');
                if (piecesInput) piecesInput.value = pieces;
                setIndividualCaseValues(path, [pieces]);
                order[path] = pieces;
                if (pieces === 0) delete order[path];
                saveOrderData();
                updateRowOrder(path);
                updateTotalsOrder();
                updateCategoryTotalsOrder(currentOrderCategory);
            }
        }
        return;
    }

    // === ОБРАБОТЧИКИ ДЛЯ МУЛЬТИ-РЕЖИМА (дочерние строки) ===
    // Кнопки +/− для штук в мультирежиме
    const multiPieceBtn = e.target.closest('.child-multi-piece-btn');
    if (multiPieceBtn) {
        const path = multiPieceBtn.dataset.path;
        const idx = parseInt(multiPieceBtn.dataset.idx);
        const delta = parseInt(multiPieceBtn.dataset.delta);
        const input = multiPieceBtn.parentElement.querySelector('.child-multi-pieces');
        if (input) {
            let val = parseInt(input.value) || 0;
            val = Math.max(0, val + delta);
            const sq = getStockValue(path);
            if (val > sq) {
                const name = path.split('|').pop();
                showToast(`Превышено количество для "${name}" (доступно ${sq})`, 'warning');
            }
            input.value = val;
            // Обновляем данные
            const vals = getIndividualCaseValues(path);
            vals[idx] = val;
            setIndividualCaseValues(path, vals);
            // Пересчитываем поле кофров с учётом ограничений
            const opt = getCaseOptions(path)[idx];
            if (opt && opt.qty > 0) {
                let casesCount = Math.ceil(val / opt.qty);
                const maxCases = opt.maxCases || 0;
                if (maxCases > 0 && casesCount > maxCases) {
                    casesCount = maxCases;
                    const newPieces = casesCount * opt.qty;
                    input.value = newPieces;
                    vals[idx] = newPieces;
                    setIndividualCaseValues(path, vals);
                    showToast(`Достигнут лимит кофров для варианта ${idx+1} (макс. ${maxCases})`, 'warning');
                }
                const casesInput = multiPieceBtn.parentElement.querySelector('.child-multi-cases');
                if (casesInput) casesInput.value = casesCount;
            }
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

    // Кнопки +/− для кофров в мультирежиме
    const multiCaseBtn = e.target.closest('.child-multi-case-btn');
    if (multiCaseBtn) {
        const path = multiCaseBtn.dataset.path;
        const idx = parseInt(multiCaseBtn.dataset.idx);
        const delta = parseInt(multiCaseBtn.dataset.delta);
        const input = multiCaseBtn.parentElement.querySelector('.child-multi-cases');
        if (input) {
            let val = parseInt(input.value) || 0;
            val = Math.max(0, val + delta);
            const opt = getCaseOptions(path)[idx];
            if (opt && opt.qty > 0) {
                const maxCases = opt.maxCases || 0;
                if (maxCases > 0 && val > maxCases) {
                    val = maxCases;
                    input.value = val;
                    showToast(`Превышен лимит кофров для варианта ${idx+1} (макс. ${maxCases})`, 'warning');
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
                        const piecesInput = multiCaseBtn.parentElement.querySelector('.child-multi-pieces');
                        if (piecesInput) piecesInput.value = newPieces;
                        const vals = getIndividualCaseValues(path);
                        vals[idx] = newPieces;
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
                }
                const piecesInput = multiCaseBtn.parentElement.querySelector('.child-multi-pieces');
                if (piecesInput) piecesInput.value = pieces;
                const vals = getIndividualCaseValues(path);
                vals[idx] = pieces;
                setIndividualCaseValues(path, vals);
                const total = vals.reduce((a,b) => a + b, 0);
                order[path] = total;
                if (total === 0) delete order[path];
                saveOrderData();
                updateRowOrder(path);
                updateTotalsOrder();
                updateCategoryTotalsOrder(currentOrderCategory);
            }
        }
        return;
    }

    // === ОБРАБОТЧИКИ ДЛЯ ОБЩИХ КОФРОВ ===
    // Кнопки +/− для количества в общем кофре
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
                const maxPack = c ? c.qty : Infinity;
                const props = getItemProps(path);
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
                input.value = val;
                p.pieces = val;
                setOrderPacking(path, packing);
                saveOrderData();
                updateRowOrder(path);
                updateTotalsOrder();
                updateCategoryTotalsOrder(currentOrderCategory);
            }
        }
        return;
    }

    // Кнопки +/− для "вне кофра"
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

    // Удаление привязки к общему кофру
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

    // === ОБЫЧНЫЕ КНОПКИ (инфо, описание, линк, кофры, заметка) ===
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

    // Обработка дропдауна кофров (устаревший механизм, но оставлен для совместимости)
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
    // === ОСНОВНОЕ ПОЛЕ ВВОДА (без кофров) ===
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

    // === SINGLE-РЕЖИМ: ввод штук ===
    const singlePieces = e.target.closest('.single-pieces-input');
    if (singlePieces) {
        const path = singlePieces.dataset.path;
        let val = parseInt(singlePieces.value);
        if (isNaN(val) || val < 0) val = 0;
        singlePieces.value = val;
        setIndividualCaseValues(path, [val]);
        order[path] = val;
        if (val === 0) delete order[path];
        saveOrderData();
        const opt = getSelectedOption(path);
        if (opt && opt.qty > 0) {
            let casesCount = Math.ceil(val / opt.qty);
            const maxCases = opt.maxCases || 0;
            if (maxCases > 0 && casesCount > maxCases) {
                casesCount = maxCases;
                const newPieces = casesCount * opt.qty;
                singlePieces.value = newPieces;
                setIndividualCaseValues(path, [newPieces]);
                order[path] = newPieces;
                if (newPieces === 0) delete order[path];
                saveOrderData();
                showToast(`Достигнут лимит кофров (макс. ${maxCases})`, 'warning');
            }
            const casesInput = singlePieces.parentElement.querySelector('.single-cases-input');
            if (casesInput) casesInput.value = casesCount;
        }
        updateRowOrder(path);
        updateTotalsOrder();
        updateCategoryTotalsOrder(currentOrderCategory);
        return;
    }

    // === SINGLE-РЕЖИМ: ввод кофров ===
    const singleCases = e.target.closest('.single-cases-input');
    if (singleCases) {
        const path = singleCases.dataset.path;
        let val = parseInt(singleCases.value);
        if (isNaN(val) || val < 0) val = 0;
        singleCases.value = val;
        const opt = getSelectedOption(path);
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
                    order[path] = newPieces;
                    if (newPieces === 0) delete order[path];
                    saveOrderData();
                    updateRowOrder(path);
                    updateTotalsOrder();
                    updateCategoryTotalsOrder(currentOrderCategory);
                    return;
                }
            }
            const piecesInput = singleCases.parentElement.querySelector('.single-pieces-input');
            if (piecesInput) piecesInput.value = pieces;
            setIndividualCaseValues(path, [pieces]);
            order[path] = pieces;
            if (pieces === 0) delete order[path];
            saveOrderData();
            updateRowOrder(path);
            updateTotalsOrder();
            updateCategoryTotalsOrder(currentOrderCategory);
        }
        return;
    }

    // === МУЛЬТИ-РЕЖИМ: ввод штук ===
    const multiPieces = e.target.closest('.child-multi-pieces');
    if (multiPieces) {
        const path = multiPieces.dataset.path;
        const idx = parseInt(multiPieces.dataset.idx);
        let val = parseInt(multiPieces.value);
        if (isNaN(val) || val < 0) val = 0;
        multiPieces.value = val;
        const vals = getIndividualCaseValues(path);
        vals[idx] = val;
        setIndividualCaseValues(path, vals);
        const opt = getCaseOptions(path)[idx];
        if (opt && opt.qty > 0) {
            let casesCount = Math.ceil(val / opt.qty);
            const maxCases = opt.maxCases || 0;
            if (maxCases > 0 && casesCount > maxCases) {
                casesCount = maxCases;
                const newPieces = casesCount * opt.qty;
                multiPieces.value = newPieces;
                vals[idx] = newPieces;
                setIndividualCaseValues(path, vals);
                showToast(`Достигнут лимит кофров для варианта ${idx+1} (макс. ${maxCases})`, 'warning');
            }
            const casesInput = multiPieces.parentElement.querySelector('.child-multi-cases');
            if (casesInput) casesInput.value = casesCount;
        }
        const total = vals.reduce((a,b) => a + b, 0);
        order[path] = total;
        if (total === 0) delete order[path];
        saveOrderData();
        updateRowOrder(path);
        updateTotalsOrder();
        updateCategoryTotalsOrder(currentOrderCategory);
        return;
    }

    // === МУЛЬТИ-РЕЖИМ: ввод кофров ===
    const multiCases = e.target.closest('.child-multi-cases');
    if (multiCases) {
        const path = multiCases.dataset.path;
        const idx = parseInt(multiCases.dataset.idx);
        let val = parseInt(multiCases.value);
        if (isNaN(val) || val < 0) val = 0;
        multiCases.value = val;
        const opt = getCaseOptions(path)[idx];
        if (opt && opt.qty > 0) {
            const maxCases = opt.maxCases || 0;
            if (maxCases > 0 && val > maxCases) {
                val = maxCases;
                multiCases.value = val;
                showToast(`Превышен лимит кофров для варианта ${idx+1} (макс. ${maxCases})`, 'warning');
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
                    const piecesInput = multiCases.parentElement.querySelector('.child-multi-pieces');
                    if (piecesInput) piecesInput.value = newPieces;
                    const vals = getIndividualCaseValues(path);
                    vals[idx] = newPieces;
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
            }
            const piecesInput = multiCases.parentElement.querySelector('.child-multi-pieces');
            if (piecesInput) piecesInput.value = pieces;
            const vals = getIndividualCaseValues(path);
            vals[idx] = pieces;
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

    // === ОБЩИЕ КОФРЫ: ввод количества в кофре ===
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
            const props = getItemProps(path);
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
            saveOrderData();
            updateRowOrder(path);
            updateTotalsOrder();
            updateCategoryTotalsOrder(currentOrderCategory);
        }
        return;
    }

    // === ОБЩИЕ КОФРЫ: ввод "вне кофра" ===
    const extraQty = e.target.closest('.child-extra-qty');
    if (extraQty) {
        const path = extraQty.dataset.path;
        let val = parseInt(extraQty.value);
        if (isNaN(val) || val < 0) val = 0;
        extraQty.value = val;
        setOrderExtra(path, val);
        saveOrderData();
        updateRowOrder(path);
        updateTotalsOrder();
        updateCategoryTotalsOrder(currentOrderCategory);
        return;
    }
}

function handleContainerChange(e) {
    // Для select и других элементов
}

// ============================================================
// ОБРАБОТКА ДРОПДАУНА КОФРОВ (устаревший механизм)
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
        showToast('Альтернативный кофр настраивается в модалке', 'neutral');
        const dropdown = item.closest('.case-dropdown');
        if (dropdown) dropdown.classList.remove('open');
        return;
    }
    if (idx !== undefined) {
        import('./cases.js').then(module => {
            module.openCaseSettingsModal(path, () => {
                updateRowOrder(path);
                updateTotalsOrder();
                updateCategoryTotalsOrder(currentOrderCategory);
            });
        });
        const dropdown = item.closest('.case-dropdown');
        if (dropdown) dropdown.classList.remove('open');
    }
}

// ============================================================
// ОЧИСТКА СПИСКА
// ============================================================
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

    saveOrderData();
    renderOrderAll();
    showToast('Список очищен', 'success');
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================
export function initOrderActions() {
    setupEventDelegation();
}