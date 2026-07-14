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
// ЗАГЛУШКА ДЛЯ ИНДИКАТОРОВ (используется в order-actions)
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
            if (isSubSub) html += `<div class="sub-sub-cat-t">${esc(key)}</div>`;
            else html += `<div class="sub-cat-t">${esc(key)}</div>`;
            html += buildCategoryHTML(data[key], childPath, level + 1);
        });
        return html;
    }
    return '';
}

// ============================================================
// ПОСТРОЕНИЕ СТРОКИ
// ============================================================

export function buildItemRow(fullPath, level) {
    const sq = getStockValue(fullPath);
    const hasDesc = !!(editorData.specs && editorData.specs[fullPath]);
    const hasLink = links[fullPath] && links[fullPath].length > 0;
    const props = getItemProps(fullPath);
    const hasCase = (props.individualCases && props.individualCases.length > 0) || props.allowCommon;
    const mode = getCaseMode(fullPath);
    const isMulti = mode.multiSelected && mode.multiSelected.some(v => v === true);
    const packing = getOrderPacking(fullPath);
    const hasCommonPacking = packing.length > 0;
    const individualVals = getIndividualCaseValues(fullPath);
    const options = getCaseOptions(fullPath);

    let totalQty = getTotalQty(fullPath);

    const overstock = totalQty > sq;
    const isInfoOpen = infoBlocksOpen[fullPath] || false;
    const hasNote = !!(notes[fullPath] && notes[fullPath].trim());
    const isCaseModeOn = mode.enabled || false;

    let caseStatusText = 'Кофры';
    let caseStatusClass = '';
    let extraCaseInfo = '';

    if (hasCommonPacking) {
        caseStatusText = 'Общие';
        caseStatusClass = 'common';
        const totalPieces = packing.reduce((s, p) => s + (p.pieces || 0), 0);
        extraCaseInfo = `📦 ${packing.length} кофр${packing.length>1?'а':''} (${totalPieces} шт)`;
    } else if (isMulti && options.length > 1) {
        caseStatusText = 'Мульти';
        caseStatusClass = 'multi';
        const totalCases = individualVals.reduce((sum, v, idx) => {
            if (v <= 0) return sum;
            const opt = options[idx] || options[0];
            return sum + Math.ceil(v / opt.qty);
        }, 0);
        extraCaseInfo = `🔄 ${totalCases} кофр${totalCases>1?'а':''}`;
    } else if (mode.enabled && individualVals.length === 1 && !packing.length && !isMulti) {
        const opt = getSelectedOption(fullPath);
        const val = individualVals[0] || 0;
        if (opt && val > 0) {
            const casesCount = Math.ceil(val / opt.qty);
            caseStatusText = 'Вкл';
            caseStatusClass = 'on';
            extraCaseInfo = `📦 ${casesCount} кофр${casesCount>1?'а':''}`;
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
            html += `<div style="font-size:13px;color:var(--text-secondary);padding-left:${level*20+20}px;width:100%;flex-basis:100%;">→ ${esc(link.target)} (×${esc(String(link.multiplier))})</div>`;
        });
    }

    return html;
}

// ============================================================
// РЕНДЕРИНГ КОНТРОЛОВ КОЛИЧЕСТВА
// ============================================================
function renderQtyControls(path) {
    const mode = getCaseMode(path);
    const individualVals = getIndividualCaseValues(path);
    const packing = getOrderPacking(path);
    const options = getCaseOptions(path);
    const totalQty = getTotalQty(path);
    const isMulti = mode.multiSelected && mode.multiSelected.some(v => v === true);

    if (!mode.enabled || (!packing.length && individualVals.length === 0 && !isMulti)) {
        return `
            <button class="btn-c qty-btn" data-path="${path}" data-delta="-1">−</button>
            <input type="number" class="qty-input" value="${totalQty}" min="0" step="1" data-path="${path}">
            <button class="btn-c qty-btn" data-path="${path}" data-delta="1">+</button>
        `;
    }

    if (mode.enabled && individualVals.length === 1 && !packing.length && !isMulti) {
        const opt = getSelectedOption(path);
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
                ${maxCases > 0 ? `<span style="font-size:11px;color:var(--text-muted);">(макс. ${maxCases} кофр${maxCases > 1 ? 'ов' : ''})</span>` : ''}
            </div>
        `;
    }

    return `
        <span style="font-size:13px;color:var(--text-secondary);">${totalQty} шт</span>
    `;
}

// ============================================================
// ОБНОВЛЕНИЕ СТРОКИ (исправлено: добавлены individualVals)
// ============================================================

export function updateRowOrder(path) {
    const row = document.querySelector(`#categoryContents .row[data-path="${path}"]`);
    if (!row) return;
    const sq = getStockValue(path);
    const mode = getCaseMode(path);
    const isMulti = mode.multiSelected && mode.multiSelected.some(v => v === true);
    const packing = getOrderPacking(path);
    const hasCommonPacking = packing.length > 0;
    // Добавлено: получение individualVals
    const individualVals = getIndividualCaseValues(path);
    const totalQty = getTotalQty(path);

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
            const opt = getSelectedOption(path);
            const pieces = getIndividualCaseValues(path)[0] || 0;
            singlePieces.value = pieces;
            const casesCount = opt && opt.qty > 0 ? Math.ceil(pieces / opt.qty) : 0;
            singleCases.value = casesCount;
        }
        const staticSpan = qtyControls.querySelector('.static-qty');
        if (staticSpan) {
            staticSpan.textContent = `${totalQty} шт`;
        }
        const weightVolDisplay = qtyControls.querySelector('.weight-vol-display');
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
    }

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
            if (packing.length > 0) {
                const totalPieces = packing.reduce((s, p) => s + (p.pieces || 0), 0);
                info += `<span>📦 ${packing.length} кофр${packing.length>1?'а':''} (${totalPieces} шт)</span>`;
            } else if (isMulti) {
                const totalCases = individualVals.reduce((sum, v, idx) => {
                    if (v <= 0) return sum;
                    const opt = getCaseOptions(path)[idx] || getCaseOptions(path)[0];
                    return sum + Math.ceil(v / opt.qty);
                }, 0);
                info += `<span>🔄 ${totalCases} кофр${totalCases>1?'а':''}</span>`;
            } else if (mode.enabled && individualVals.length === 1 && !packing.length && !isMulti) {
                const opt = getSelectedOption(path);
                const val = individualVals[0] || 0;
                if (opt && val > 0) {
                    const casesCount = Math.ceil(val / opt.qty);
                    info += `<span>📦 ${casesCount} кофр${casesCount>1?'а':''}</span>`;
                }
            }
        }
        extraInfo.innerHTML = info;
    }

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
        const isMulti = mode.multiSelected && mode.multiSelected.some(v => v === true);
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

    updateChildRowsForPath(path);
}

// ============================================================
// ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: расчёт объёма единицы по строке габаритов "AxBxC"
// ============================================================
function parseUnitVolume(dimensions) {
    if (!dimensions) return 0;
    const d = dimensions.split('x').map(s => parseFloat(s.trim()));
    if (d.length === 3 && d.every(v => !isNaN(v) && v > 0)) {
        return (d[0] * d[1] * d[2]) / 1000000;
    }
    return 0;
}

// ============================================================
// ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ДЛЯ РАСЧЁТА ИТОГОВ С УЧЁТОМ КОФРОВ
// ============================================================
function calculateTotals(items) {
    let totalQty = 0;
    let totalWeight = 0;
    let totalVolume = 0;
    let totalCases = 0;
    const catTotals = {};
    const commonStats = {}; // key: caseId

    const allCommonCases = getCommonCases();

    items.forEach(({ path, qty }) => {
        const cat = path.split('|')[0];
        if (!catTotals[cat]) {
            catTotals[cat] = { qty: 0, weight: 0, volume: 0, cases: 0 };
        }

        const packing = getOrderPacking(path);
        const extra = getOrderExtra(path);
        const mode = getCaseMode(path);
        const isMulti = mode.multiSelected && mode.multiSelected.some(v => v === true);
        const individualVals = getIndividualCaseValues(path);
        const props = getItemProps(path);

        let qtyToAdd = qty;
        let weightToAdd = 0;
        let volumeToAdd = 0;
        let casesToAdd = 0;

        // Обработка общих кофров
        if (packing.length > 0) {
            // Собираем статистику по кофрам
            packing.forEach(p => {
                if (p.pieces <= 0) return;
                const caseObj = allCommonCases.find(c => c.id === p.caseId);
                if (!caseObj) return;
                if (!commonStats[p.caseId]) {
                    commonStats[p.caseId] = {
                        pieces: 0,
                        weight: 0, // вес груза в кофре
                        volume: 0,
                        caseObj: caseObj,
                        unitWeight: props.weight || 0,
                        unitVolume: parseUnitVolume(props.dimensions)
                    };
                }
                const stat = commonStats[p.caseId];
                stat.pieces += p.pieces;
                const unitWeight = stat.unitWeight;
                const unitVolume = stat.unitVolume;
                stat.weight += p.pieces * unitWeight;
                stat.volume += p.pieces * unitVolume;
            });

            // Обработка extra (часть груза вне кофра)
            if (extra > 0) {
                const unitWeight = props.weight || 0;
                const unitVolume = parseUnitVolume(props.dimensions);
                weightToAdd += extra * unitWeight;
                volumeToAdd += extra * unitVolume;
            }
            // Количество считаем полностью (упаковано в кофры + вне кофра),
            // иначе итоговое "Итого шт" будет ошибочно занижено для упакованных позиций
            qtyToAdd = qty;
        } else if (isMulti && mode.enabled && individualVals.length > 1) {
            // Мульти-режим: вес/объём уже считаются через calcItemWeightWithMode
            weightToAdd = calcItemWeightWithMode(path, qty);
            volumeToAdd = calcItemVolumeWithMode(path, qty);
            casesToAdd = calcItemCases(path, qty);
            qtyToAdd = qty;
        } else if (mode.enabled && individualVals.length === 1 && !packing.length && !isMulti) {
            // single-режим
            weightToAdd = calcItemWeightWithMode(path, qty);
            volumeToAdd = calcItemVolumeWithMode(path, qty);
            casesToAdd = calcItemCases(path, qty);
            qtyToAdd = qty;
        } else {
            // Без кофров
            const unitWeight = props.weight || 0;
            const unitVolume = parseUnitVolume(props.dimensions);
            weightToAdd = qty * unitWeight;
            volumeToAdd = qty * unitVolume;
            qtyToAdd = qty;
        }

        catTotals[cat].qty += qtyToAdd;
        catTotals[cat].weight += weightToAdd;
        catTotals[cat].volume += volumeToAdd;
        catTotals[cat].cases += casesToAdd;

        totalQty += qtyToAdd;
        totalWeight += weightToAdd;
        totalVolume += volumeToAdd;
        totalCases += casesToAdd;
    });

    // Добавляем вес и объём кофров (один раз для каждого уникального кофра)
    let commonWeight = 0;
    let commonVolume = 0;
    const commonDetails = [];
    for (let caseId in commonStats) {
        const stat = commonStats[caseId];
        const caseObj = stat.caseObj;
        const emptyWeight = caseObj.emptyWeight || 0;
        const dims = caseObj.dimensions || '';
        const emptyVolume = parseUnitVolume(dims);
        const maxWeight = caseObj.maxWeight || 0;
        const fillPercent = maxWeight > 0 ? Math.min(100, Math.round((stat.weight / maxWeight) * 100)) : 0;
        commonWeight += emptyWeight;
        commonVolume += emptyVolume;
        commonDetails.push({
            name: caseObj.name || 'Кофр',
            pieces: stat.pieces,
            weight: stat.weight,
            volume: stat.volume,
            emptyWeight: emptyWeight,
            emptyVolume: emptyVolume,
            maxWeight: maxWeight,
            fillPercent: fillPercent,
            dimensions: dims
        });
    }

    // Добавляем weight/volume из commonStats в общие итоги (вес груза в кофрах)
    for (let caseId in commonStats) {
        const stat = commonStats[caseId];
        totalWeight += stat.weight;
        totalVolume += stat.volume;
    }

    // Добавляем вес кофров к общим итогам
    totalWeight += commonWeight;
    totalVolume += commonVolume;

    return {
        totalQty,
        totalWeight,
        totalVolume,
        totalCases,
        catTotals,
        commonDetails,
        commonWeight,
        commonVolume
    };
}

// ============================================================
// ИТОГИ (ОБНОВЛЕНЫ С УЧЁТОМ ОБЩИХ КОФРОВ)
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
    const allItems = getActiveItemsOrder();
    const items = allItems.filter(({ path }) => path.startsWith(catKey + '|'));
    const result = calculateTotals(items);
    let html = `<span>Итого в категории: ${result.totalQty} шт</span>`;
    if (result.totalWeight > 0) html += `<span>Вес: ${result.totalWeight.toFixed(1)} кг</span>`;
    if (result.totalVolume > 0) html += `<span>Объём: ${result.totalVolume.toFixed(3)} м³</span>`;
    if (result.totalCases > 0) html += `<span>Кофров: ${result.totalCases} шт</span>`;
    if (result.commonDetails && result.commonDetails.length > 0) {
        html += `<div style="width:100%;font-size:13px;color:var(--text-secondary);padding-top:4px;">`;
        result.commonDetails.forEach(c => {
            html += `<span style="margin-right:12px;">📦 ${c.name}: ${c.pieces} шт, загрузка: ${c.fillPercent}%</span>`;
        });
        html += `</div>`;
    }
    totalsDiv.innerHTML = html;
}

export function updateTotalsOrder() {
    const items = getActiveItemsOrder();
    const result = calculateTotals(items);

    document.getElementById('totalQty').textContent = result.totalQty;
    document.getElementById('totalWeight').textContent = result.totalWeight.toFixed(1);
    document.getElementById('totalVolume').textContent = result.totalVolume.toFixed(3);

    const detailsDiv = document.getElementById('globalDetails');
    let detailsHtml = '';
    const orderKeys = editorData._categoryOrder || Object.keys(editorData.inventory);
    orderKeys.forEach(cat => {
        if (!result.catTotals[cat]) return;
        const d = result.catTotals[cat];
        detailsHtml += `<div class="cat-detail"><strong>${CAT_NAMES[cat]||cat}</strong><br>${d.qty} шт<br>${d.weight.toFixed(1)} кг<br>${d.volume.toFixed(3)} м³${d.cases > 0 ? `<br>${d.cases} кофров` : ''}</div>`;
    });

    if (result.commonDetails && result.commonDetails.length > 0) {
        detailsHtml += `<div style="width:100%;border-top:1px solid var(--border-color);padding-top:8px;margin-top:8px;">`;
        detailsHtml += `<strong style="display:block;margin-bottom:4px;">Общие кофры:</strong>`;
        result.commonDetails.forEach(c => {
            const statusColor = c.fillPercent >= 100 ? 'var(--danger)' : (c.fillPercent >= 90 ? 'var(--warning)' : 'var(--text-secondary)');
            detailsHtml += `<div style="font-size:13px;padding:2px 0;border-bottom:1px solid var(--border-light);">
                <span>📦 ${c.name}</span>
                <span style="margin-left:8px;">${c.pieces} шт</span>
                <span style="margin-left:8px;color:${statusColor};">${c.fillPercent}%</span>
                <span style="margin-left:8px;font-size:12px;color:var(--text-muted);">${c.dimensions || 'н/д'} | вес кофра: ${c.emptyWeight.toFixed(1)} кг</span>
            </div>`;
        });
        detailsHtml += `</div>`;
    }

    detailsDiv.innerHTML = detailsHtml || '';
    renderCommonCaseIndicatorsOrder();
}

// ============================================================
// ПОИСК
// ============================================================

const debouncedSearch = debounce(applySearchOrder, 300);

export function applySearchOrder() {
    const query = document.getElementById('searchInput').value.toLowerCase().trim();
    searchQueryOrder = query;
    renderOrderCategory('all', query);
}

export function clearSearchOrder() {
    document.getElementById('searchInput').value = '';
    searchQueryOrder = '';
    searchModeOrder = false;
    const first = editorData._categoryOrder?.[0] || Object.keys(editorData.inventory)[0];
    if (first) {
        currentOrderCategory = first;
        renderOrderCategory(first);
    } else {
        renderOrderCategory(null);
    }
}

// ============================================================
// ОБРАБОТЧИКИ КНОПОК (инфо, описание, заметка)
// ============================================================

export function toggleInfoOrder(btn) {
    const path = btn.dataset.path;
    const row = btn.closest('.row');
    let infoBlock = row.querySelector('.row-info');
    if (!infoBlock) {
        infoBlock = document.createElement('div');
        infoBlock.className = 'row-info';
        row.appendChild(infoBlock);
    }
    const isOpen = infoBlocksOpen[path] || false;
    infoBlocksOpen[path] = !isOpen;
    if (infoBlocksOpen[path]) {
        const props = getItemProps(path);
        const mode = getCaseMode(path);
        infoBlock.innerHTML = buildInfoHtml(path, props, mode);
        infoBlock.style.display = 'block';
        btn.textContent = 'Скрыть';
    } else {
        infoBlock.style.display = 'none';
        btn.textContent = 'Инфо';
    }
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
    const current = notes[path] || '';
    const newNote = await showPrompt('Редактировать заметку', 'Заметка:', current);
    if (newNote === null) return;
    if (newNote.trim() === '') {
        delete notes[path];
    } else {
        notes[path] = newNote.trim();
    }
    saveOrderData();
    updateRowOrder(path);
    showToast('Заметка сохранена', 'neutral');
}

// ============================================================
// ЗАГЛУШКИ ДЛЯ ИНИЦИАЛИЗАЦИИ (вызываются из initOrderUI)
// ============================================================

export function setupInputListenersOrder() {
    // Уже настроено через делегирование в initOrderUI
}

export function setupCaseTogglesOrder() {
    // Уже настроено через делегирование
}

// ============================================================
// РЕНДЕР ВСЕГО
// ============================================================

export function renderOrderAll() {
    invalidateFlatItemsCache();
    loadOrderData();
    document.getElementById('pComment').value = localStorage.getItem('last_comment') || '';
    const savedDate = localStorage.getItem('last_date');
    if (savedDate) document.getElementById('pDate').value = savedDate;
    if (!currentOrderCategory || !editorData.inventory[currentOrderCategory]) {
        const first = editorData._categoryOrder?.[0] || Object.keys(editorData.inventory)[0];
        if (first) currentOrderCategory = first;
    }
    renderOrderTabs();
    renderOrderCategory(currentOrderCategory);
    detailsOpenOrder = localStorage.getItem('detailsOpenOrder') === 'true';
    if (detailsOpenOrder) {
        document.getElementById('globalDetails').classList.add('open');
        document.getElementById('detailToggle').textContent = 'Скрыть';
    } else {
        document.getElementById('globalDetails').classList.remove('open');
        document.getElementById('detailToggle').textContent = 'Подробно';
    }
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ UI ЗАКАЗА
// ============================================================

export function initOrderUI() {
    detailsOpenOrder = localStorage.getItem('detailsOpenOrder') === 'true';

    document.getElementById('detailToggle')?.addEventListener('click', function() {
        const details = document.getElementById('globalDetails');
        details.classList.toggle('open');
        detailsOpenOrder = details.classList.contains('open');
        localStorage.setItem('detailsOpenOrder', JSON.stringify(detailsOpenOrder));
        this.textContent = detailsOpenOrder ? 'Скрыть' : 'Подробно';
    });

    document.getElementById('searchInput')?.addEventListener('input', debouncedSearch);
    document.getElementById('clearSearchBtn')?.addEventListener('click', clearSearchOrder);

    document.getElementById('pDate')?.addEventListener('change', function() {
        localStorage.setItem('last_date', this.value);
    });
    document.getElementById('pComment')?.addEventListener('input', function() {
        localStorage.setItem('last_comment', this.value);
    });
}