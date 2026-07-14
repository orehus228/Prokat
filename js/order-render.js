// order-render.js — Отрисовка страницы создания заказа (рендеринг)
import {
    editorData,
    getStock,
    getItemProps,
    getCommonCases,
    saveEditorData
} from './data.js';

import {
    CAT_NAMES
} from './config.js';

import {
    esc,
    showToast,
    showPrompt,
    showConfirm,
    debounce
} from './ui.js';

import {
    order,
    orderSplits,
    links,
    notes,
    caseModes,
    saveOrderData,
    getTotalQty,
    getSegmentsSum,
    calcItemWeightWithMode,
    calcItemVolumeWithMode,
    calcItemCases,
    loadOrderData,
    getOrderPacking,
    setOrderPacking,
    getOrderExtra,
    setOrderExtra,
    getCommonRoutes,
    setCommonRoutes,
    getIndividualCaseValues,
    setIndividualCaseValues,
    getCaseMode,
    getCaseOptions,
    getSelectedOption,
    updateOrderPaths,
    orderExclude,
    orderExtra
} from './order.js';

import {
    getValue,
    getStockValue,
    setValueOrder,
    buildFlatItemsList,
    invalidateFlatItemsCache,
    getActiveItemsOrder,
    updateLinkCountOrder,
    renderCommonCaseIndicatorsOrder as renderIndicators,
    updateChildRowsForPath,
    buildInfoHtml,
    initOrderHelpers
} from './order-helpers.js';

// ============================================================
// СОСТОЯНИЕ СТРАНИЦЫ ЗАКАЗА
// ============================================================

export let currentOrderCategory = 'sound';
export let showPropsOrder = false;
export let searchModeOrder = false;
export let searchQueryOrder = '';
export let detailsOpenOrder = false;
export const infoBlocksOpen = {};

// ============================================================
// ФУНКЦИИ ДЛЯ ИЗМЕНЕНИЯ СОСТОЯНИЯ
// ============================================================

export function setCurrentCategory(cat) {
    currentOrderCategory = cat;
}

export function setSearchMode(mode) {
    searchModeOrder = mode;
}

export function setSearchQuery(query) {
    searchQueryOrder = query;
}

export function toggleDetailsOpen() {
    detailsOpenOrder = !detailsOpenOrder;
    localStorage.setItem('detailsOpenOrder', JSON.stringify(detailsOpenOrder));
}

export function toggleInfoBlock(path) {
    infoBlocksOpen[path] = !infoBlocksOpen[path];
}

// ============================================================
// ЗАГЛУШКА ДЛЯ ИНДИКАТОРОВ
// ============================================================
export function renderCommonCaseIndicatorsOrder() {
    renderIndicators();
}

// ============================================================
// ОТРИСОВКА ВКЛАДОК КАТЕГОРИЙ
// ============================================================

export function renderOrderTabs() {
    const container = document.getElementById('categoryTabs');
    container.innerHTML = '';
    let orderKeys = editorData._categoryOrder || Object.keys(editorData.inventory);
    orderKeys = orderKeys.filter(key => editorData.inventory && editorData.inventory[key] !== undefined);
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
            if (searchModeOrder) { document.getElementById('searchInput').value = ''; searchModeOrder = false; searchQueryOrder = ''; }
            currentOrderCategory = key;
            renderOrderTabs();
            renderOrderCategory(key);
            setupInputListenersOrder();
            setupCaseTogglesOrder();
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
// РЕНДЕРИНГ КАТЕГОРИИ
// ============================================================

export function renderOrderCategory(catKey, filterQuery = '') {
    const container = document.getElementById('categoryContents');
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
            const spec = (editorData.specs && editorData.specs[path] || '').toLowerCase();
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
        const orderKeys = editorData._categoryOrder || Object.keys(editorData.inventory);
        orderKeys.forEach(cat => {
            if (!grouped[cat]) return;
            html += `<div class="sub-cat-t">${CAT_NAMES[cat]||cat}</div>`;
            grouped[cat].forEach(path => {
                html += buildItemRow(path, 1);
            });
        });
        wrapper.innerHTML = html;
        searchModeOrder = true;
        currentOrderCategory = 'all';
    } else {
        searchModeOrder = false;
        if (catKey === 'all') {
            const first = editorData._categoryOrder?.[0] || Object.keys(editorData.inventory)[0];
            if (first) {
                currentOrderCategory = first;
                renderOrderCategory(first);
            } else {
                wrapper.innerHTML = '<div class="empty-message">Нет категорий</div>';
            }
            return;
        }
        const catData = editorData.inventory[catKey];
        if (!catData) {
            wrapper.innerHTML = '<div class="empty-message">Категория пуста</div>';
            return;
        }
        wrapper.innerHTML = buildCategoryHTML(catData, [catKey], 0);
        currentOrderCategory = catKey;
    }

    setupInputListenersOrder();
    setupCaseTogglesOrder();

    document.querySelectorAll('#categoryContents .row').forEach(row => {
        const path = row.dataset.path;
        if (path) { updateRowOrder(path); }
    });

    if (!searchModeOrder) updateCategoryTotalsOrder(catKey);
    updateTotalsOrder();
    updateLinkCountOrder();
    if (detailsOpenOrder) {
        document.getElementById('globalDetails').classList.add('open');
        document.getElementById('detailToggle').textContent = 'Скрыть';
    } else {
        document.getElementById('globalDetails').classList.remove('open');
        document.getElementById('detailToggle').textContent = 'Подробно';
    }
    renderCommonCaseIndicatorsOrder();
}

// ============================================================
// РЕКУРСИВНЫЙ ОБХОД КАТЕГОРИИ
// ============================================================

function buildCategoryHTML(data, path, level) {
    if (level > 15) {
        console.warn('Превышена глубина обхода', path);
        return '';
    }
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
            if (isSubSub) html += `<div class="sub-sub-cat-t">${key}</div>`;
            else html += `<div class="sub-cat-t">${key}</div>`;
            html += buildCategoryHTML(data[key], childPath, level + 1);
        });
        return html;
    }
    return '';
}

// ============================================================
// ПОСТРОЕНИЕ СТРОКИ (с поддержкой single режима с двумя полями)
// ============================================================

export function buildItemRow(fullPath, level) {
    const sq = getStockValue(fullPath);
    const hasDesc = !!(editorData.specs && editorData.specs[fullPath]);
    const hasLink = links[fullPath] && links[fullPath].length > 0;
    const props = getItemProps(fullPath);
    const hasCase = (props.individualCases && props.individualCases.length > 0) || props.allowCommon;
    const mode = getCaseMode(fullPath);
    const packing = getOrderPacking(fullPath);
    const individualVals = getIndividualCaseValues(fullPath);
    const extra = getOrderExtra(fullPath);
    const options = getCaseOptions(fullPath);
    const isSingleMode = mode.enabled && individualVals.length === 1 && !mode.multiSelected && !packing.length;
    const totalQty = getTotalQty(fullPath);
    const isAdded = totalQty > 0;
    const overstock = totalQty > sq;
    const isInfoOpen = infoBlocksOpen[fullPath] || false;
    const hasNote = !!(notes[fullPath] && notes[fullPath].trim());

    // Определяем статус кофров для кнопки
    let caseStatusText = 'Кофры';
    let caseStatusClass = '';
    let caseInfo = '';

    if (packing.length > 0) {
        caseStatusText = 'Общие';
        caseStatusClass = 'common';
        caseInfo = `📦 ${packing.length} кофр${packing.length > 1 ? 'а' : ''}`;
    } else if (mode.enabled && individualVals.length > 1 && mode.multiSelected) {
        caseStatusText = 'Мульти';
        caseStatusClass = 'multi';
        const totalCases = individualVals.reduce((sum, v, idx) => {
            if (v <= 0) return sum;
            const opt = options[idx] || options[0];
            return sum + Math.ceil(v / opt.qty);
        }, 0);
        caseInfo = `🔄 ${totalCases} кофр${totalCases > 1 ? 'а' : ''}`;
    } else if (isSingleMode) {
        const opt = getSelectedOption(fullPath);
        const val = individualVals[0] || 0;
        if (opt && val > 0) {
            const casesCount = Math.ceil(val / opt.qty);
            caseStatusText = 'Вкл';
            caseStatusClass = 'on';
            caseInfo = `📦 ${casesCount} кофр${casesCount > 1 ? 'а' : ''} (${val} шт)`;
        } else {
            caseStatusText = 'Выкл';
            caseStatusClass = 'off';
        }
    } else if (hasCase) {
        caseStatusText = 'Выкл';
        caseStatusClass = 'off';
    }

    let weightDisplay = '0 кг', volumeDisplay = '0 м³';
    if (props.weight !== undefined && props.weight !== null && props.weight > 0) {
        const w = calcItemWeightWithMode(fullPath, totalQty);
        weightDisplay = w.toFixed(1) + ' кг';
    }
    if (props.dimensions && props.dimensions.trim() !== '') {
        const v = calcItemVolumeWithMode(fullPath, totalQty);
        volumeDisplay = v.toFixed(3) + ' м³';
    }

    const infoHtml = buildInfoHtml(fullPath, props, mode);
    const escapedName = esc(fullPath.split('|').pop());
    const rowClass = (isAdded ? 'added' : '') + (overstock ? ' overstock' : '');

    const linkClass = hasLink ? 'active' : '';
    const noteClass = hasNote ? 'has-note' : '';
    const caseClass = mode.enabled ? 'active' : '';

    let extraInfo = '';
    if (totalQty > 0 || sq > 0) {
        extraInfo = `<div class="extra-info">
            <span><strong>${totalQty}</strong> шт добавлено</span>
            <span>в наличии: <strong>${sq}</strong></span>
            ${weightDisplay !== '0 кг' ? `<span>${weightDisplay}</span>` : ''}
            ${volumeDisplay !== '0 м³' ? `<span>${volumeDisplay}</span>` : ''}
            ${caseInfo ? `<span>${caseInfo}</span>` : ''}
        </div>`;
    }

    // Основная строка
    let html = `<div class="row ${rowClass}" data-path="${esc(fullPath)}" data-search="${fullPath}">
        <div class="name-area">
            <span class="name">${escapedName}</span>
            ${extraInfo}
        </div>
        <div class="action-buttons">
            <button class="action-btn info-btn" data-path="${esc(fullPath)}" title="Информация">Инфо</button>
            ${hasDesc ? `<button class="action-btn desc-btn" data-path="${esc(fullPath)}">Описание</button>` : ''}
            <button class="action-btn link-btn ${linkClass}" data-path="${esc(fullPath)}" title="Линк">Линк${hasLink ? ' ✓' : ''}</button>
            ${hasCase ? `<button class="action-btn case-btn ${caseClass} ${caseStatusClass}" data-path="${esc(fullPath)}" title="Настройка кофров">${caseStatusText}</button>` : ''}
            <button class="action-btn note-btn ${noteClass}" data-path="${esc(fullPath)}" title="Заметка">Заметка${hasNote ? ' ✓' : ''}</button>
        </div>
        <div class="qty-controls">
            <span class="weight-vol-display" style="display:none !important;">${weightDisplay} / ${volumeDisplay}</span>
            <span class="stock-info" style="display:none !important;">в наличии: ${sq}</span>
            ${renderQtyControls(fullPath)}
        </div>
    </div>`;

    if (isInfoOpen) {
        html += `<div class="row-info">${infoHtml}</div>`;
    }
    if (hasDesc) {
        html += `<div class="desc-block" data-path="${esc(fullPath)}">${esc(editorData.specs[fullPath])}</div>`;
    }
    if (hasLink) {
        links[fullPath].forEach(link => {
            html += `<div style="font-size:13px;color:var(--text-secondary);padding-left:${level*20+20}px;width:100%;flex-basis:100%;">→ ${link.target} (×${link.multiplier})</div>`;
        });
    }

    return html;
}

// ============================================================
// РЕНДЕРИНГ КОНТРОЛОВ КОЛИЧЕСТВА (с поддержкой single режима)
// ============================================================
function renderQtyControls(path) {
    const mode = getCaseMode(path);
    const individualVals = getIndividualCaseValues(path);
    const packing = getOrderPacking(path);
    const options = getCaseOptions(path);
    const totalQty = getTotalQty(path);

    // Режим без кофров или выключен
    if (!mode.enabled || (!packing.length && individualVals.length === 0)) {
        return `
            <button class="btn-c qty-btn" data-path="${path}" data-delta="-1">−</button>
            <input type="number" class="qty-input" value="${totalQty}" min="0" step="1" data-path="${path}">
            <button class="btn-c qty-btn" data-path="${path}" data-delta="1">+</button>
        `;
    }

    // Режим "Один кофр" — два поля (штуки и кофры) синхронизированы
    if (mode.enabled && individualVals.length === 1 && !packing.length && !mode.multiSelected) {
        const opt = getSelectedOption(path);
        const pieces = individualVals[0] || 0;
        const casesCount = opt && opt.qty > 0 ? Math.ceil(pieces / opt.qty) : 0;
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
            </div>
        `;
    }

    // Режимы multi и common — в строке показываем только статическое количество, дочерние строки управляются отдельно
    return `
        <span style="font-size:13px;color:var(--text-secondary);">${totalQty} шт</span>
    `;
}

// ============================================================
// ОБНОВЛЕНИЕ СТРОКИ (с поддержкой single режима)
// ============================================================

export function updateRowOrder(path) {
    const row = document.querySelector(`#categoryContents .row[data-path="${path}"]`);
    if (!row) return;
    const sq = getStockValue(path);
    const mode = getCaseMode(path);
    const individualVals = getIndividualCaseValues(path);
    const packing = getOrderPacking(path);
    const totalQty = getTotalQty(path);
    const options = getCaseOptions(path);
    const isSingleMode = mode.enabled && individualVals.length === 1 && !packing.length && !mode.multiSelected;

    const isAdded = totalQty > 0;
    const isOverstock = totalQty > sq;
    row.classList.toggle('added', isAdded);
    row.classList.toggle('overstock', isOverstock);

    // Обновляем контролы
    const qtyControls = row.querySelector('.qty-controls');
    if (qtyControls) {
        // Перерисовываем контролы внутри
        // Проще заменить содержимое
        const path = row.dataset.path;
        qtyControls.innerHTML = `
            <span class="weight-vol-display" style="display:none !important;"></span>
            <span class="stock-info" style="display:none !important;"></span>
            ${renderQtyControls(path)}
        `;
        // Навешиваем обработчики на новые элементы
        attachControlEvents(path);
    }

    // Обновляем extra-info
    const extraInfo = row.querySelector('.extra-info');
    if (extraInfo) {
        let info = '';
        if (totalQty > 0 || sq > 0) {
            info = `<span><strong>${totalQty}</strong> шт добавлено</span>
                    <span>в наличии: <strong>${sq}</strong></span>`;
            const props = getItemProps(path);
            if (props.weight !== undefined && props.weight !== null && props.weight > 0) {
                const w = calcItemWeightWithMode(path, totalQty);
                info += `<span>${w.toFixed(1)} кг</span>`;
            }
            if (props.dimensions && props.dimensions.trim() !== '') {
                const v = calcItemVolumeWithMode(path, totalQty);
                info += `<span>${v.toFixed(3)} м³</span>`;
            }
            // Добавляем информацию о кофрах
            if (packing.length > 0) {
                info += `<span>📦 ${packing.length} кофр${packing.length > 1 ? 'а' : ''}</span>`;
            } else if (isSingleMode) {
                const opt = getSelectedOption(path);
                const pieces = individualVals[0] || 0;
                if (opt && opt.qty > 0 && pieces > 0) {
                    const casesCount = Math.ceil(pieces / opt.qty);
                    info += `<span>📦 ${casesCount} кофр${casesCount > 1 ? 'а' : ''}</span>`;
                }
            } else if (mode.enabled && individualVals.length > 1 && mode.multiSelected) {
                let totalCases = 0;
                individualVals.forEach((v, idx) => {
                    if (v <= 0) return;
                    const opt = options[idx] || options[0];
                    totalCases += Math.ceil(v / opt.qty);
                });
                info += `<span>🔄 ${totalCases} кофр${totalCases > 1 ? 'а' : ''}</span>`;
            }
        }
        extraInfo.innerHTML = info;
    }

    // Обновляем вес/объём
    const weightVolDisplay = row.querySelector('.weight-vol-display');
    if (weightVolDisplay) {
        const props = getItemProps(path);
        let weightDisplay = '0 кг', volumeDisplay = '0 м³';
        if (props.weight !== undefined && props.weight !== null && props.weight > 0) {
            const w = calcItemWeightWithMode(path, totalQty);
            weightDisplay = w.toFixed(1) + ' кг';
        }
        if (props.dimensions && props.dimensions.trim() !== '') {
            const v = calcItemVolumeWithMode(path, totalQty);
            volumeDisplay = v.toFixed(3) + ' м³';
        }
        weightVolDisplay.textContent = weightDisplay + ' / ' + volumeDisplay;
    }

    // Обновляем состояние кнопок
    const linkBtn = row.querySelector('.link-btn');
    if (linkBtn) {
        const hasLink = links[path] && links[path].length > 0;
        linkBtn.textContent = 'Линк' + (hasLink ? ' ✓' : '');
        linkBtn.classList.toggle('active', hasLink);
    }
    const noteBtn = row.querySelector('.note-btn');
    if (noteBtn) {
        const hasNote = !!(notes[path] && notes[path].trim());
        noteBtn.textContent = 'Заметка' + (hasNote ? ' ✓' : '');
        noteBtn.classList.toggle('has-note', hasNote);
    }
    const caseBtn = row.querySelector('.case-btn');
    if (caseBtn) {
        const mode = getCaseMode(path);
        const isOn = mode.enabled || false;
        const packing = getOrderPacking(path);
        const individualVals = getIndividualCaseValues(path);
        const options = getCaseOptions(path);

        let statusText = 'Кофры';
        let statusClass = '';
        if (packing.length > 0) {
            statusText = 'Общие';
            statusClass = 'common';
        } else if (mode.enabled && individualVals.length > 1 && mode.multiSelected) {
            statusText = 'Мульти';
            statusClass = 'multi';
        } else if (mode.enabled && individualVals.length === 1 && !packing.length && !mode.multiSelected) {
            statusText = 'Вкл';
            statusClass = 'on';
        } else {
            statusText = 'Выкл';
            statusClass = 'off';
        }
        caseBtn.textContent = statusText;
        caseBtn.className = 'action-btn case-btn ' + (isOn ? 'active ' : '') + statusClass;
    }

    // Обновляем дочерние строки
    updateChildRowsForPath(path);
}

// ============================================================
// ПРИВЯЗКА СОБЫТИЙ К КОНТРОЛАМ (для single режима)
// ============================================================
function attachControlEvents(path) {
    // Основные qty-input (без кофров)
    const qtyInput = document.querySelector(`.row[data-path="${path}"] .qty-input`);
    if (qtyInput) {
        qtyInput.removeEventListener('input', handleQtyInput);
        qtyInput.addEventListener('input', handleQtyInput);
    }

    // Single режим: поля pieces и cases
    const piecesInput = document.querySelector(`.row[data-path="${path}"] .single-pieces-input`);
    const casesInput = document.querySelector(`.row[data-path="${path}"] .single-cases-input`);
    if (piecesInput && casesInput) {
        piecesInput.removeEventListener('input', handleSinglePieces);
        piecesInput.addEventListener('input', handleSinglePieces);
        casesInput.removeEventListener('input', handleSingleCases);
        casesInput.addEventListener('input', handleSingleCases);
    }

    // Кнопки +/− для single
    document.querySelectorAll(`.row[data-path="${path}"] .single-piece-btn, .row[data-path="${path}"] .single-case-btn`).forEach(btn => {
        btn.removeEventListener('click', handleSingleBtnClick);
        btn.addEventListener('click', handleSingleBtnClick);
    });

    // Кнопки +/− для обычного режима
    document.querySelectorAll(`.row[data-path="${path}"] .qty-btn`).forEach(btn => {
        btn.removeEventListener('click', handleQtyBtnClick);
        btn.addEventListener('click', handleQtyBtnClick);
    });
}

function handleQtyInput(e) {
    const input = e.target;
    const path = input.dataset.path;
    let val = parseInt(input.value);
    if (isNaN(val) || val < 0) val = 0;
    input.value = val;
    setValueOrder(path, val);
    updateRowOrder(path);
    updateTotalsOrder();
    updateCategoryTotalsOrder(currentOrderCategory);
}

function handleSinglePieces(e) {
    const input = e.target;
    const path = input.dataset.path;
    let val = parseInt(input.value);
    if (isNaN(val) || val < 0) val = 0;
    input.value = val;
    // Обновляем количество в individualCaseValues
    setIndividualCaseValues(path, [val]);
    order[path] = val;
    if (val === 0) delete order[path];
    saveOrderData();
    // Пересчитываем поле кофров
    const casesInput = document.querySelector(`.row[data-path="${path}"] .single-cases-input`);
    if (casesInput) {
        const opt = getSelectedOption(path);
        if (opt && opt.qty > 0) {
            casesInput.value = Math.ceil(val / opt.qty);
        } else {
            casesInput.value = 0;
        }
    }
    updateTotalsOrder();
    updateCategoryTotalsOrder(currentOrderCategory);
}

function handleSingleCases(e) {
    const input = e.target;
    const path = input.dataset.path;
    let val = parseInt(input.value);
    if (isNaN(val) || val < 0) val = 0;
    input.value = val;
    // Пересчитываем штуки
    const opt = getSelectedOption(path);
    if (opt && opt.qty > 0) {
        const pieces = val * opt.qty;
        const piecesInput = document.querySelector(`.row[data-path="${path}"] .single-pieces-input`);
        if (piecesInput) piecesInput.value = pieces;
        setIndividualCaseValues(path, [pieces]);
        order[path] = pieces;
        if (pieces === 0) delete order[path];
        saveOrderData();
        updateTotalsOrder();
        updateCategoryTotalsOrder(currentOrderCategory);
    }
}

function handleSingleBtnClick(e) {
    const btn = e.target;
    const path = btn.dataset.path;
    const delta = parseInt(btn.dataset.delta);
    const isPieces = btn.classList.contains('single-piece-btn');
    const input = isPieces ? document.querySelector(`.row[data-path="${path}"] .single-pieces-input`) : document.querySelector(`.row[data-path="${path}"] .single-cases-input`);
    if (!input) return;
    let val = parseInt(input.value) || 0;
    val = Math.max(0, val + delta);
    input.value = val;
    // Триггерим событие input, чтобы сработала синхронизация
    input.dispatchEvent(new Event('input'));
}

function handleQtyBtnClick(e) {
    const btn = e.target;
    const path = btn.dataset.path;
    const delta = parseInt(btn.dataset.delta);
    const input = document.querySelector(`.row[data-path="${path}"] .qty-input`);
    if (!input) return;
    let val = parseInt(input.value) || 0;
    val = Math.max(0, val + delta);
    const sq = getStockValue(path);
    if (val > sq) {
        const name = path.split('|').pop();
        showToast(`Превышено количество для "${name}" (доступно ${sq})`, 'warning');
    }
    input.value = val;
    setValueOrder(path, val);
    updateRowOrder(path);
    updateTotalsOrder();
    updateCategoryTotalsOrder(currentOrderCategory);
}

// ============================================================
// ОСТАЛЬНЫЕ ФУНКЦИИ (поиск, итоги, инициализация)
// ============================================================

// ... (остальные функции из предыдущей версии, без изменений)
// applySearchOrder, clearSearchOrder, toggleInfoOrder, toggleDescOrder, openNoteEditorOrder,
// setupInputListenersOrder, setupCaseTogglesOrder, renderOrderAll, initOrderUI

// Они должны быть скопированы из предыдущей версии. Для краткости я их не повторяю.
// В полной версии файла они присутствуют.