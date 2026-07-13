// render-order.js — Отрисовка страницы создания заказа (исправленная версия)
import {
    editorData,
    getStock,
    getItemProps,
    getCommonCases,
    saveEditorData
} from './data.js';

import {
    CAT_NAMES,
    STORAGE_KEYS
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

// ============================================================
// СОСТОЯНИЕ СТРАНИЦЫ ЗАКАЗА
// ============================================================
let currentOrderCategory = 'sound';
let showPropsOrder = false;
let searchModeOrder = false;
let searchQueryOrder = '';
let detailsOpenOrder = false;
const infoBlocksOpen = {};

let flatItemsCache = null;
let eventDelegationInitialized = false;

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================
function getValue(path) {
    const mode = getCaseMode(path);
    const isMulti = localStorage.getItem('multi_' + path) === 'true';
    if (mode.enabled && isMulti) {
        const vals = getIndividualCaseValues(path);
        return vals.reduce((a,b) => a + b, 0);
    }
    const packing = getOrderPacking(path);
    if (packing.length > 0) {
        const extra = getOrderExtra(path);
        const packed = packing.reduce((s, p) => s + (p.qty || 0), 0);
        return extra + packed;
    }
    return order[path] || 0;
}

function getStockValue(path) {
    const parts = path.split('|');
    const catKey = parts[0];
    const subKey = parts.length > 2 ? parts[1] : null;
    const itemName = subKey ? parts.slice(2).join('|') : parts.slice(1).join('|');
    return getStock(catKey, subKey, itemName) || 9999;
}

function setValueOrder(path, val) {
    val = Math.max(0, parseInt(val) || 0);
    const mode = getCaseMode(path);
    const isMulti = localStorage.getItem('multi_' + path) === 'true';
    if (mode.enabled && isMulti) {
        showToast('В мульти-режиме меняйте количество в дочерних полях', 'warning');
        return;
    }
    const packing = getOrderPacking(path);
    if (packing.length > 0) {
        showToast('В режиме общих кофров меняйте количество в дочерних полях', 'warning');
        return;
    }
    if (order[path] === val) return;
    order[path] = val;
    if (val === 0) delete order[path];
    saveOrderData();
    // Мгновенное обновление UI
    updateRowOrder(path);
    updateTotalsOrder();
    updateCategoryTotalsOrder(currentOrderCategory);
}

// ============================================================
// ПОСТРОЕНИЕ ПЛОСКОГО СПИСКА
// ============================================================
function buildFlatItemsList() {
    if (flatItemsCache) return flatItemsCache;
    const result = [];
    const inventory = editorData.inventory;
    if (!inventory) return result;

    const stack = [];
    const orderKeys = editorData._categoryOrder || Object.keys(inventory);
    orderKeys.forEach(cat => {
        if (inventory[cat] !== undefined) {
            stack.push({ data: inventory[cat], path: [cat] });
        }
    });

    while (stack.length > 0) {
        const { data, path } = stack.pop();
        if (Array.isArray(data)) {
            data.forEach(item => {
                if (typeof item === 'string') {
                    const fullPath = path.length ? path.join('|') + '|' + item : item;
                    result.push(fullPath);
                }
            });
        } else if (data && typeof data === 'object') {
            const keys = Object.keys(data).filter(k => !k.startsWith('_'));
            for (let i = keys.length - 1; i >= 0; i--) {
                const key = keys[i];
                const child = data[key];
                if (child !== undefined) {
                    stack.push({ data: child, path: [...path, key] });
                }
            }
        }
    }

    flatItemsCache = result;
    return result;
}

// ============================================================
// ОТРИСОВКА ВКЛАДОК КАТЕГОРИЙ
// ============================================================
function renderOrderTabs() {
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
function renderOrderCategory(catKey, filterQuery = '') {
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

    if (!eventDelegationInitialized) {
        setupEventDelegation();
        eventDelegationInitialized = true;
    }

    setupInputListenersOrder();
    setupCaseTogglesOrder();

    // Обновляем строки (уже существующие)
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
// ПОСТРОЕНИЕ СТРОКИ
// ============================================================
function buildItemRow(fullPath, level) {
    const sq = getStockValue(fullPath);
    const hasDesc = !!(editorData.specs && editorData.specs[fullPath]);
    const hasLink = links[fullPath] && links[fullPath].length > 0;
    const props = getItemProps(fullPath);
    const hasCase = (props.individualCases && props.individualCases.length > 0) || props.allowCommon;
    const mode = getCaseMode(fullPath);
    const isMulti = localStorage.getItem('multi_' + fullPath) === 'true';
    const hasAlt = !!mode.alt;
    const packing = getOrderPacking(fullPath);
    const hasCommonPacking = packing.length > 0;
    const individualVals = getIndividualCaseValues(fullPath);
    const options = getCaseOptions(fullPath);

    let totalQty = 0;
    if (isMulti && mode.enabled) {
        totalQty = individualVals.reduce((a,b) => a + b, 0);
    } else if (hasCommonPacking) {
        const extra = getOrderExtra(fullPath);
        const packed = packing.reduce((s, p) => s + (p.qty || 0), 0);
        totalQty = extra + packed;
    } else {
        totalQty = order[fullPath] || 0;
    }

    const overstock = totalQty > sq;
    const isInfoOpen = infoBlocksOpen[fullPath] || false;
    const hasNote = !!(notes[fullPath] && notes[fullPath].trim());
    const isCaseModeOn = mode.enabled || false;

    let caseStatusText = 'Кофры';
    let caseStatusClass = '';
    if (hasCommonPacking) {
        caseStatusText = 'Общие';
        caseStatusClass = 'common';
    } else if (isMulti && options.length > 1) {
        caseStatusText = 'Мульти';
        caseStatusClass = 'multi';
    } else if (hasAlt) {
        caseStatusText = 'Альт.';
        caseStatusClass = 'alt';
    } else if (isCaseModeOn) {
        caseStatusText = 'Вкл';
        caseStatusClass = 'on';
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
            <button class="btn-c qty-btn" data-path="${esc(fullPath)}" data-delta="-1">−</button>
            <input type="number" class="qty-input" value="${totalQty}" min="0" step="1" data-path="${esc(fullPath)}">
            <button class="btn-c qty-btn" data-path="${esc(fullPath)}" data-delta="1">+</button>
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

    // Дочерние строки для мульти-режима
    if (isMulti && mode.enabled && options.length > 1) {
        html += `<div class="child-row" data-parent="${esc(fullPath)}" style="width:100%;flex-basis:100%;">`;
        html += `<div style="padding:4px 8px;font-size:13px;color:var(--text-secondary);border-bottom:1px solid var(--border-light);">Распределение по вариантам кофров (сумма: ${individualVals.reduce((a,b)=>a+b,0)} шт)</div>`;
        options.forEach((opt, idx) => {
            const val = individualVals[idx] || 0;
            const maxPossible = getStockValue(fullPath);
            html += `<div class="child-controls">
                <label>Вариант ${idx+1} (вм. ${opt.qty} шт):</label>
                <button class="btn-c child-qty-btn" data-path="${esc(fullPath)}" data-idx="${idx}" data-delta="-1">−</button>
                <input type="number" class="child-qty" data-path="${esc(fullPath)}" data-idx="${idx}" value="${val}" min="0" step="1" max="${maxPossible}">
                <button class="btn-c child-qty-btn" data-path="${esc(fullPath)}" data-idx="${idx}" data-delta="1">+</button>
                <span class="child-info">габ: ${opt.dims || 'н/д'}, вес: ${opt.weight || 0} кг</span>
            </div>`;
        });
        html += `</div>`;
    }

    // Дочерние строки для общих кофров
    if (hasCommonPacking) {
        const commonCases = getCommonCases();
        const extra = getOrderExtra(fullPath);
        html += `<div class="child-row" data-parent="${esc(fullPath)}" style="width:100%;flex-basis:100%;">`;
        html += `<div style="padding:4px 8px;font-size:13px;color:var(--text-secondary);border-bottom:1px solid var(--border-light);">Упаковка в общие кофры (вне кофра: ${extra} шт)</div>`;
        const maxExtra = getStockValue(fullPath);
        html += `<div class="child-controls">
            <label>Вне кофра:</label>
            <button class="btn-c child-extra-btn" data-path="${esc(fullPath)}" data-delta="-1">−</button>
            <input type="number" class="child-extra-qty" data-path="${esc(fullPath)}" value="${extra}" min="0" step="1" max="${maxExtra}">
            <button class="btn-c child-extra-btn" data-path="${esc(fullPath)}" data-delta="1">+</button>
        </div>`;
        packing.forEach((p, idx) => {
            const c = commonCases.find(c => c.id === p.caseId);
            const name = c ? c.name : 'удалённый кофр';
            const qty = p.qty || 0;
            const maxPack = c ? c.qty : 0;
            html += `<div class="child-controls">
                <label>${name} (вм. ${maxPack} шт):</label>
                <button class="btn-c child-common-btn" data-path="${esc(fullPath)}" data-caseid="${p.caseId}" data-delta="-1">−</button>
                <input type="number" class="child-common-qty" data-path="${esc(fullPath)}" data-caseid="${p.caseId}" value="${qty}" min="0" step="1" max="${maxPack}">
                <button class="btn-c child-common-btn" data-path="${esc(fullPath)}" data-caseid="${p.caseId}" data-delta="1">+</button>
                <span class="child-info">габ: ${c ? c.dimensions || 'н/д' : 'н/д'}, вес: ${c ? c.emptyWeight || 0 : 0} кг</span>
                <button class="btn btn-sm remove-common-pack" style="background:var(--danger);color:white;padding:0 8px;font-size:12px;" data-path="${esc(fullPath)}" data-caseid="${p.caseId}">✕</button>
            </div>`;
        });
        html += `</div>`;
    }

    return html;
}

// ============================================================
// БЛОК ИНФО
// ============================================================
function buildInfoHtml(path, props, mode) {
    let html = `<div style="display:flex;flex-wrap:wrap;gap:12px;">`;
    const weightPerUnit = (props.weight !== undefined && props.weight !== null) ? props.weight + ' кг' : 'н/д';
    html += `<span><strong>Вес 1 шт:</strong> ${weightPerUnit}</span>`;
    const dims = props.dimensions || 'н/д';
    html += `<span><strong>Габариты:</strong> ${dims}</span>`;
    if (props.volume) {
        html += `<span><strong>Объём 1 шт:</strong> ${props.volume} м³</span>`;
    }

    const options = getCaseOptions(path);
    if (options.length > 0) {
        html += `<div style="width:100%;"><strong>Индивидуальные кофры (варианты):</strong></div>`;
        options.forEach((opt, idx) => {
            const volume = opt.dims ? (() => {
                const d = opt.dims.split('x').map(s => parseFloat(s.trim()));
                if (d.length === 3 && d.every(v => !isNaN(v) && v > 0)) {
                    return (d[0]*d[1]*d[2]/1000000).toFixed(3) + ' м³';
                }
                return 'н/д';
            })() : 'н/д';
            html += `<div style="width:100%;padding-left:12px;font-size:13px;color:var(--text-secondary);">
                Вариант ${idx+1}: вместимость ${opt.qty} шт, габ: ${opt.dims || 'н/д'}, вес пустого: ${opt.weight || 0} кг, объём: ${volume}
            </div>`;
        });
    }

    const isMulti = localStorage.getItem('multi_' + path) === 'true';
    const hasAlt = !!mode.alt;
    const packing = getOrderPacking(path);
    const hasCommonPacking = packing.length > 0;

    html += `<div style="width:100%;"><strong>Статус режимов кофров:</strong></div>`;
    html += `<div style="width:100%;padding-left:12px;font-size:13px;color:var(--text-secondary);">
        <span>Режим кофров: ${mode.enabled ? '✅ Включён' : 'не активирован'}</span>
        ${isMulti ? `<span style="margin-left:12px;">🔄 Мульти-режим (включён)</span>` : ''}
        ${hasAlt ? `<span style="margin-left:12px;">🔀 Альтернативный кофр (активен)</span>` : ''}
        ${hasCommonPacking ? `<span style="margin-left:12px;">📦 Общие кофры (${packing.length} шт)</span>` : ''}
    </div>`;

    if (hasCommonPacking) {
        const commonCases = getCommonCases();
        html += `<div style="width:100%;padding-left:12px;font-size:13px;color:var(--text-secondary);">
            <strong>Общие кофры:</strong>
        </div>`;
        packing.forEach(p => {
            const c = commonCases.find(c => c.id === p.caseId);
            const name = c ? c.name : 'удалённый кофр';
            html += `<div style="padding-left:24px;font-size:12px;">• ${name} — ${p.qty} шт в кофре</div>`;
        });
    }

    html += `</div>`;
    return html;
}

// ============================================================
// ДЕЛЕГИРОВАНИЕ СОБЫТИЙ
// ============================================================
function setupEventDelegation() {
    const container = document.getElementById('categoryContents');
    container.removeEventListener('click', handleContainerClick);
    container.addEventListener('click', handleContainerClick);
    container.removeEventListener('input', handleContainerInput);
    container.addEventListener('input', handleContainerInput);
    container.removeEventListener('change', handleContainerChange);
    container.addEventListener('change', handleContainerChange);
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
        showToast('Привязка удалена', 'neutral');
        return;
    }

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
            }
        }
        renderCommonCaseIndicatorsOrder();
        return;
    }
}

function handleContainerChange(e) {}

// ============================================================
// ОБРАБОТЧИКИ КНОПОК
// ============================================================
function toggleInfoOrder(btn) {
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

function toggleDescOrder(btn) {
    const path = btn.dataset.path;
    const block = document.querySelector(`.desc-block[data-path="${path}"]`);
    if (block) {
        block.classList.toggle('open');
        btn.textContent = block.classList.contains('open') ? 'Скрыть описание' : 'Описание';
    }
}

async function openNoteEditorOrder(btn) {
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
// ОБНОВЛЕНИЕ СТРОКИ
// ============================================================
function updateRowOrder(path) {
    const row = document.querySelector(`#categoryContents .row[data-path="${path}"]`);
    if (!row) return;
    const sq = getStockValue(path);
    const mode = getCaseMode(path);
    const isMulti = localStorage.getItem('multi_' + path) === 'true';
    const packing = getOrderPacking(path);
    const hasCommonPacking = packing.length > 0;
    let totalQty = 0;
    if (isMulti && mode.enabled) {
        const vals = getIndividualCaseValues(path);
        totalQty = vals.reduce((a,b) => a + b, 0);
    } else if (hasCommonPacking) {
        const extra = getOrderExtra(path);
        const packed = packing.reduce((s, p) => s + (p.qty || 0), 0);
        totalQty = extra + packed;
    } else {
        totalQty = order[path] || 0;
    }

    const isAdded = totalQty > 0;
    const isOverstock = totalQty > sq;
    row.classList.toggle('added', isAdded);
    row.classList.toggle('overstock', isOverstock);

    const qtyInput = row.querySelector('.qty-input');
    if (qtyInput) {
        if ((isMulti && mode.enabled) || hasCommonPacking) {
            qtyInput.style.display = 'none';
        } else {
            qtyInput.style.display = 'inline-block';
            qtyInput.value = totalQty;
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
        }
        extraInfo.innerHTML = info;
    }

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

    const oldWarn = row.querySelector('.overstock-warning');
    if (oldWarn) oldWarn.remove();
    if (isOverstock) {
        const warn = document.createElement('span');
        warn.className = 'overstock-warning';
        warn.textContent = '!';
        warn.title = 'Больше нет (в наличии ' + sq + ')';
        const controls = row.querySelector('.qty-controls');
        if (controls) controls.appendChild(warn);
    }

    if (infoBlocksOpen[path]) {
        const infoBlock = row.querySelector('.row-info');
        if (infoBlock) {
            const props = getItemProps(path);
            const mode = getCaseMode(path);
            infoBlock.innerHTML = buildInfoHtml(path, props, mode);
            infoBlock.style.display = 'block';
        }
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
        const isMulti = localStorage.getItem('multi_' + path) === 'true';
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

function updateChildRowsForPath(path) {
    const parentRow = document.querySelector(`#categoryContents .row[data-path="${path}"]`);
    if (!parentRow) return;
    let next = parentRow.nextElementSibling;
    while (next && next.classList.contains('child-row')) {
        const toRemove = next;
        next = next.nextElementSibling;
        toRemove.remove();
    }
    const mode = getCaseMode(path);
    const options = getCaseOptions(path);
    const isMulti = localStorage.getItem('multi_' + path) === 'true';
    const packing = getOrderPacking(path);
    const hasCommonPacking = packing.length > 0;
    const individualVals = getIndividualCaseValues(path);

    if (isMulti && mode.enabled && options.length > 1) {
        const childDiv = document.createElement('div');
        childDiv.className = 'child-row';
        childDiv.dataset.parent = path;
        childDiv.style.width = '100%';
        childDiv.style.flexBasis = '100%';
        let html = `<div style="padding:4px 8px;font-size:13px;color:var(--text-secondary);border-bottom:1px solid var(--border-light);">Распределение по вариантам кофров (сумма: ${individualVals.reduce((a,b)=>a+b,0)} шт)</div>`;
        options.forEach((opt, idx) => {
            const val = individualVals[idx] || 0;
            const maxStock = getStockValue(path);
            html += `<div class="child-controls">
                <label>Вариант ${idx+1} (вм. ${opt.qty} шт):</label>
                <button class="btn-c child-qty-btn" data-path="${path}" data-idx="${idx}" data-delta="-1">−</button>
                <input type="number" class="child-qty" data-path="${path}" data-idx="${idx}" value="${val}" min="0" step="1" max="${maxStock}">
                <button class="btn-c child-qty-btn" data-path="${path}" data-idx="${idx}" data-delta="1">+</button>
                <span class="child-info">габ: ${opt.dims || 'н/д'}, вес: ${opt.weight || 0} кг</span>
            </div>`;
        });
        childDiv.innerHTML = html;
        parentRow.after(childDiv);
    }

    if (hasCommonPacking) {
        const commonCases = getCommonCases();
        const extra = getOrderExtra(path);
        const childDiv = document.createElement('div');
        childDiv.className = 'child-row';
        childDiv.dataset.parent = path;
        childDiv.style.width = '100%';
        childDiv.style.flexBasis = '100%';
        let html = `<div style="padding:4px 8px;font-size:13px;color:var(--text-secondary);border-bottom:1px solid var(--border-light);">Упаковка в общие кофры (вне кофра: ${extra} шт)</div>`;
        const maxExtra = getStockValue(path);
        html += `<div class="child-controls">
            <label>Вне кофра:</label>
            <button class="btn-c child-extra-btn" data-path="${path}" data-delta="-1">−</button>
            <input type="number" class="child-extra-qty" data-path="${path}" value="${extra}" min="0" step="1" max="${maxExtra}">
            <button class="btn-c child-extra-btn" data-path="${path}" data-delta="1">+</button>
        </div>`;
        packing.forEach((p, idx) => {
            const c = commonCases.find(c => c.id === p.caseId);
            const name = c ? c.name : 'удалённый кофр';
            const qty = p.qty || 0;
            const maxPack = c ? c.qty : 0;
            html += `<div class="child-controls">
                <label>${name} (вм. ${maxPack} шт):</label>
                <button class="btn-c child-common-btn" data-path="${path}" data-caseid="${p.caseId}" data-delta="-1">−</button>
                <input type="number" class="child-common-qty" data-path="${path}" data-caseid="${p.caseId}" value="${qty}" min="0" step="1" max="${maxPack}">
                <button class="btn-c child-common-btn" data-path="${path}" data-caseid="${p.caseId}" data-delta="1">+</button>
                <span class="child-info">габ: ${c ? c.dimensions || 'н/д' : 'н/д'}, вес: ${c ? c.emptyWeight || 0 : 0} кг</span>
                <button class="btn btn-sm remove-common-pack" style="background:var(--danger);color:white;padding:0 8px;font-size:12px;" data-path="${path}" data-caseid="${p.caseId}">✕</button>
            </div>`;
        });
        childDiv.innerHTML = html;
        parentRow.after(childDiv);
    }
}

// ============================================================
// ИТОГИ
// ============================================================
function updateCategoryTotalsOrder(catKey) {
    const container = document.querySelector('#categoryContents .category-content.active');
    if (!container || searchModeOrder) return;
    let totalsDiv = container.querySelector('.category-totals');
    if (!totalsDiv) {
        totalsDiv = document.createElement('div');
        totalsDiv.className = 'category-totals';
        container.appendChild(totalsDiv);
    }
    const items = getActiveItemsOrder().filter(({ path }) => path.startsWith(catKey + '|'));
    let qty = 0, weight = 0, volume = 0, cases = 0;
    items.forEach(({ path, qty: q }) => {
        qty += q;
        weight += calcItemWeightWithMode(path, q);
        volume += calcItemVolumeWithMode(path, q);
        cases += calcItemCases(path, q);
    });
    totalsDiv.innerHTML = `<span>Итого в категории: ${qty} шт</span><span>Вес: ${weight.toFixed(1)} кг</span><span>Объём: ${volume.toFixed(3)} м³</span>${cases > 0 ? `<span>Кофров: ${cases} шт</span>` : ''}`;
}

function updateTotalsOrder() {
    const items = getActiveItemsOrder();
    let totalQty = 0, totalWeight = 0, totalVolume = 0, totalCases = 0;
    const catTotals = {};
    items.forEach(({ path, qty }) => {
        totalQty += qty;
        totalWeight += calcItemWeightWithMode(path, qty);
        totalVolume += calcItemVolumeWithMode(path, qty);
        totalCases += calcItemCases(path, qty);
        const cat = path.split('|')[0];
        if (!catTotals[cat]) catTotals[cat] = { qty: 0, weight: 0, volume: 0, cases: 0 };
        catTotals[cat].qty += qty;
        catTotals[cat].weight += calcItemWeightWithMode(path, qty);
        catTotals[cat].volume += calcItemVolumeWithMode(path, qty);
        catTotals[cat].cases += calcItemCases(path, qty);
    });
    document.getElementById('totalQty').textContent = totalQty;
    document.getElementById('totalWeight').textContent = totalWeight.toFixed(1);
    document.getElementById('totalVolume').textContent = totalVolume.toFixed(3);
    const detailsDiv = document.getElementById('globalDetails');
    let detailsHtml = '';
    const orderKeys = editorData._categoryOrder || Object.keys(editorData.inventory);
    orderKeys.forEach(cat => {
        if (!catTotals[cat]) return;
        const d = catTotals[cat];
        detailsHtml += `<div class="cat-detail"><strong>${CAT_NAMES[cat]||cat}</strong><br>${d.qty} шт<br>${d.weight.toFixed(1)} кг<br>${d.volume.toFixed(3)} м³${d.cases > 0 ? `<br>${d.cases} кофров` : ''}</div>`;
    });
    detailsDiv.innerHTML = detailsHtml || '';
    renderCommonCaseIndicatorsOrder();
}

function getActiveItemsOrder() {
    const items = [];
    const allPaths = new Set();
    for (let p in order) allPaths.add(p);
    for (let p in orderExtra) allPaths.add(p);
    for (let p in orderPacking) allPaths.add(p);
    for (let p in individualCaseValues) {
        const vals = individualCaseValues[p];
        if (vals.reduce((a,b) => a + b, 0) > 0) allPaths.add(p);
    }
    allPaths.forEach(path => {
        const qty = getTotalQty(path);
        if (qty > 0) items.push({ path, qty });
    });
    return items;
}

// ============================================================
// ПОИСК
// ============================================================
const debouncedSearch = debounce(applySearchOrder, 300);

function applySearchOrder() {
    const query = document.getElementById('searchInput').value.toLowerCase().trim();
    searchQueryOrder = query;
    renderOrderCategory('all', query);
}

function clearSearchOrder() {
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

function setupInputListenersOrder() {}
function setupCaseTogglesOrder() {}

function updateLinkCountOrder() {
    let count = 0;
    for (let src in links) count += links[src].length;
    document.getElementById('linkCount').textContent = `(${count} активных)`;
}

function renderCommonCaseIndicatorsOrder() {}

// ============================================================
// ГЛОБАЛЬНЫЕ ПРЕСЕТЫ ЗАКАЗА
// ============================================================
const ORDER_PRESETS_KEY = STORAGE_KEYS.ORDER_PRESETS || 'order_presets';

function getOrderPresets() {
    try {
        const raw = localStorage.getItem(ORDER_PRESETS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function saveOrderPresets(presets) {
    localStorage.setItem(ORDER_PRESETS_KEY, JSON.stringify(presets));
}

function populateOrderPresetSelect() {
    const select = document.getElementById('orderPresetSelect');
    if (!select) return;
    const presets = getOrderPresets();
    select.innerHTML = '<option value="">— Выберите пресет —</option>';
    presets.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        select.appendChild(opt);
    });
}

async function saveOrderPreset() {
    const name = await showPrompt('Сохранить пресет заказа', 'Введите имя пресета:', '', '');
    if (!name || !name.trim()) return;
    const presets = getOrderPresets();
    const existing = presets.find(p => p.name === name.trim());
    if (existing) {
        const overwrite = await showConfirm(`Пресет "${name.trim()}" уже существует. Перезаписать?`);
        if (!overwrite) return;
        const idx = presets.indexOf(existing);
        presets.splice(idx, 1);
    }
    const snapshot = {
        order: { ...order },
        splits: JSON.parse(JSON.stringify(orderSplits)),
        links: JSON.parse(JSON.stringify(links)),
        notes: { ...notes },
        packing: JSON.parse(JSON.stringify(orderPacking)),
        individualCases: JSON.parse(JSON.stringify(individualCaseValues)),
        routes: JSON.parse(JSON.stringify(commonRoutes)),
        caseModes: JSON.parse(JSON.stringify(caseModes)),
        exclude: { ...orderExclude },
        extra: { ...orderExtra }
    };
    presets.push({ name: name.trim(), data: snapshot });
    saveOrderPresets(presets);
    populateOrderPresetSelect();
    showToast('Пресет сохранён', 'success');
}

async function loadOrderPreset(overlay = true) {
    const select = document.getElementById('orderPresetSelect');
    const name = select.value;
    if (!name) {
        showToast('Выберите пресет', 'warning');
        return;
    }
    const presets = getOrderPresets();
    const preset = presets.find(p => p.name === name);
    if (!preset) {
        showToast('Пресет не найден', 'error');
        return;
    }
    const data = preset.data;
    if (!overlay) {
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
    }
    if (overlay) {
        for (let path in data.order) {
            order[path] = (order[path] || 0) + data.order[path];
        }
        for (let path in data.splits) {
            if (!orderSplits[path]) orderSplits[path] = [];
            data.splits[path].forEach(seg => {
                orderSplits[path].push({ ...seg });
            });
        }
        for (let path in data.links) {
            if (!links[path]) links[path] = [];
            data.links[path].forEach(pl => {
                const existing = links[path].find(l => l.target === pl.target);
                if (existing) existing.multiplier += pl.multiplier;
                else links[path].push({ ...pl });
            });
        }
        for (let path in data.notes) {
            if (!notes[path]) notes[path] = data.notes[path];
        }
        for (let path in data.packing) {
            if (!orderPacking[path]) orderPacking[path] = [];
            data.packing[path].forEach(p => {
                const existing = orderPacking[path].find(ep => ep.caseId === p.caseId);
                if (existing) existing.qty += p.qty;
                else orderPacking[path].push({ ...p });
            });
        }
        for (let path in data.individualCases) {
            if (!individualCaseValues[path]) individualCaseValues[path] = [];
            data.individualCases[path].forEach((v, idx) => {
                if (individualCaseValues[path][idx] !== undefined) {
                    individualCaseValues[path][idx] += v;
                } else {
                    individualCaseValues[path][idx] = v;
                }
            });
        }
        for (let path in data.routes) {
            if (!commonRoutes[path]) commonRoutes[path] = [];
            data.routes[path].forEach(r => {
                const existing = commonRoutes[path].find(er => er.target === r.target);
                if (existing) existing.multiplier += r.multiplier;
                else commonRoutes[path].push({ ...r });
            });
        }
        for (let path in data.caseModes) {
            if (!caseModes[path]) caseModes[path] = { ...data.caseModes[path] };
        }
        for (let path in data.exclude) {
            orderExclude[path] = true;
        }
        for (let path in data.extra) {
            orderExtra[path] = (orderExtra[path] || 0) + data.extra[path];
        }
    } else {
        Object.assign(order, data.order);
        Object.assign(orderSplits, JSON.parse(JSON.stringify(data.splits)));
        Object.assign(links, JSON.parse(JSON.stringify(data.links)));
        Object.assign(notes, data.notes);
        Object.assign(orderPacking, JSON.parse(JSON.stringify(data.packing)));
        Object.assign(individualCaseValues, JSON.parse(JSON.stringify(data.individualCases)));
        Object.assign(commonRoutes, JSON.parse(JSON.stringify(data.routes)));
        Object.assign(caseModes, JSON.parse(JSON.stringify(data.caseModes)));
        Object.assign(orderExclude, data.exclude);
        Object.assign(orderExtra, data.extra || {});
    }
    saveOrderData();
    renderOrderAll();
    showToast(`Пресет "${name}" загружен ${overlay ? '(наложение)' : '(замена)'}`, 'success');
}

async function deleteOrderPreset() {
    const select = document.getElementById('orderPresetSelect');
    const name = select.value;
    if (!name) {
        showToast('Выберите пресет', 'warning');
        return;
    }
    const confirmed = await showConfirm(`Удалить пресет "${name}"?`);
    if (!confirmed) return;
    let presets = getOrderPresets();
    presets = presets.filter(p => p.name !== name);
    saveOrderPresets(presets);
    populateOrderPresetSelect();
    showToast('Пресет удалён', 'neutral');
}

function exportOrderPresets() {
    const presets = getOrderPresets();
    if (presets.length === 0) {
        showToast('Нет пресетов для экспорта', 'warning');
        return;
    }
    const blob = new Blob([JSON.stringify(presets, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'order_presets.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Пресеты экспортированы', 'success');
}

function importOrderPresets(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (!Array.isArray(data)) throw new Error('Неверный формат: ожидается массив');
            data.forEach(p => {
                if (!p.name || typeof p.name !== 'string') throw new Error('У пресета отсутствует имя');
                if (!p.data || typeof p.data !== 'object') throw new Error('У пресета отсутствуют данные');
            });
            let presets = getOrderPresets();
            data.forEach(newP => {
                const idx = presets.findIndex(p => p.name === newP.name);
                if (idx !== -1) presets[idx] = newP;
                else presets.push(newP);
            });
            saveOrderPresets(presets);
            populateOrderPresetSelect();
            showToast('Пресеты импортированы', 'success');
        } catch(err) {
            showToast('Ошибка импорта: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
}

// ============================================================
// ЭКСПОРТ
// ============================================================
export function exportOrderJSON() {
    const data = {
        project_name: document.getElementById('pName').value.trim() || "Мероприятие",
        date: document.getElementById('pDate').value || new Date().toLocaleDateString('ru-RU'),
        comment: document.getElementById('pComment').value.trim() || "",
        items: order,
        splits: orderSplits,
        specs: editorData.specs || {},
        packing: getOrderPacking(),
        individual_cases: getIndividualCaseValues(),
        routes: getCommonRoutes(),
        links: links,
        notes: notes,
        exclude: orderExclude,
        extra: orderExtra
    };
    if (Object.keys(order).length === 0 && Object.keys(orderSplits).length === 0 && Object.keys(orderExtra).length === 0 && Object.keys(orderPacking).length === 0) {
        showToast('Список пуст', 'warning'); return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = data.project_name + ".json";
    a.click();
    URL.revokeObjectURL(url);
    showToast('JSON сохранён', 'success');
}

export function exportOrderPDF() {
    const data = {
        project_name: document.getElementById('pName').value.trim() || "Мероприятие",
        date: document.getElementById('pDate').value || new Date().toLocaleDateString('ru-RU'),
        comment: document.getElementById('pComment').value.trim() || ""
    };
    const items = getActiveItemsOrder();
    if (items.length === 0) { showToast('Нет позиций для экспорта', 'warning'); return; }
    const catItems = {};
    items.forEach(({ path, qty }) => {
        const parts = path.split('|');
        const cat = parts[0];
        const name = parts.slice(1).join(' → ');
        if (!catItems[cat]) catItems[cat] = [];
        const weight = calcItemWeightWithMode(path, qty);
        const volume = calcItemVolumeWithMode(path, qty);
        const dims = getItemProps(path).dimensions || 'н/д';
        const packing = getOrderPacking(path);
        const mode = getCaseMode(path);
        let detail = 'без кофра';
        if (packing.length > 0) {
            const commonCases = getCommonCases();
            const names = packing.map(p => {
                const c = commonCases.find(c => c.id === p.caseId);
                return c ? c.name : 'удалённый кофр';
            }).join(', ');
            detail = 'общие кофры: ' + names;
        } else if (mode.enabled) {
            const opt = getSelectedOption(path);
            const alt = mode.alt;
            if (alt) {
                detail = 'альт. кофр, ' + alt.qty + ' шт/кофр';
            } else if (opt) {
                const cases = calcItemCases(path, qty);
                detail = 'кофр ' + opt.qty + ' шт/кофр, всего ' + cases + ' кофр' + (cases > 1 ? 'ов' : '');
            }
        }
        catItems[cat].push({ name, qty, weight, volume, dims, detail });
    });

    let html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Чек-лист</title>
<style>
body{font-family:'Segoe UI',Arial,sans-serif;margin:40px;color:#222;background:#fff}
h1{color:#2c3e50;border-bottom:2px solid #3498db;padding-bottom:10px}
.meta{margin:20px 0;color:#555}
table{width:100%;border-collapse:collapse;margin-top:20px;font-size:14px}
th{background:#2c3e50;color:#fff;padding:8px;text-align:left}
td{padding:6px 8px;border-bottom:1px solid #ddd}
tr:nth-child(even){background:#f9f9f9}
.total-row{font-weight:bold;background:#e6f2ff!important;border-top:2px solid #3498db}
.grand-total{font-weight:bold;background:#d4e6ff!important;border-top:3px solid #1a3a5a;font-size:16px}
.actions{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);display:flex;gap:12px;background:white;padding:12px 24px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.2);z-index:1000;}
.actions button{padding:10px 24px;border:none;border-radius:6px;font-size:16px;cursor:pointer;font-weight:600;}
.actions .print{background:#2c3e50;color:white;}
.actions .close{background:#ddd;color:#333;}
.actions .print:hover{background:#1a2a3a;}
.actions .close:hover{background:#ccc;}
</style>
</head><body>
<h1>Чек-лист: ${esc(data.project_name)}</h1>
<div class="meta"><strong>Дата:</strong> ${esc(data.date)}<br><strong>Комментарий:</strong> ${esc(data.comment||'—')}</div>
<table><thead><tr><th>Категория</th><th>Позиция</th><th>Кол-во (шт)</th><th>Вес (кг)</th><th>Объём (м³)</th><th>Габариты (см)</th><th>Детали</th></tr></thead><tbody>`;
    let grandQty=0,grandWeight=0,grandVolume=0;
    const orderKeys = editorData._categoryOrder || Object.keys(editorData.inventory);
    orderKeys.forEach(cat => {
        if (!catItems[cat]) return;
        let first=true, catQty=0,catWeight=0,catVolume=0;
        for (let item of catItems[cat]) {
            catQty += item.qty;
            catWeight += item.weight;
            catVolume += item.volume;
            html += `<tr><td>${first ? CAT_NAMES[cat]||cat : ''}</td><td>${esc(item.name)}</td><td>${item.qty}</td><td>${item.weight.toFixed(1)}</td><td>${item.volume.toFixed(3)}</td><td>${esc(item.dims)}</td><td>${esc(item.detail)}</td></tr>`;
            first = false;
        }
        grandQty += catQty; grandWeight += catWeight; grandVolume += catVolume;
        html += `<tr class="total-row"><td colspan="2"><strong>Итого в категории</strong></td><td><strong>${catQty} шт</strong></td><td><strong>${catWeight.toFixed(1)} кг</strong></td><td><strong>${catVolume.toFixed(3)} м³</strong></td><td></td><td></td></tr>`;
    });
    html += `<tr class="grand-total"><td colspan="2"><strong>Общий итог</strong></td><td><strong>${grandQty} шт</strong></td><td><strong>${grandWeight.toFixed(1)} кг</strong></td><td><strong>${grandVolume.toFixed(3)} м³</strong></td><td></td><td></td></tr>`;
    html += `</tbody></table>
<div class="actions">
    <button class="print" onclick="window.print()">Сохранить PDF</button>
    <button class="close" onclick="window.close()">Назад</button>
</div>
</body></html>`;

    const win = window.open('', '_blank');
    if (win) {
        win.document.write(html);
        win.document.close();
        win.focus();
    } else {
        showToast('Не удалось открыть новую вкладку', 'error');
    }
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
    saveOrderData();
    renderOrderAll();
    showToast('Список очищен', 'success');
}

export function renderOrderAll() {
    flatItemsCache = null;
    eventDelegationInitialized = false;
    loadOrderData();
    document.getElementById('pComment').value = localStorage.getItem('last_comment') || '';
    const savedDate = localStorage.getItem('last_date');
    if (savedDate) document.getElementById('pDate').value = savedDate;
    populateOrderPresetSelect();
    if (!currentOrderCategory || !editorData.inventory[currentOrderCategory]) {
        const first = editorData._categoryOrder?.[0] || Object.keys(editorData.inventory)[0];
        if (first) currentOrderCategory = first;
    }
    renderOrderTabs();
    renderOrderCategory(currentOrderCategory);
}

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

    document.getElementById('saveJ')?.addEventListener('click', exportOrderJSON);
    document.getElementById('savePdf')?.addEventListener('click', exportOrderPDF);
    document.getElementById('clearOrder')?.addEventListener('click', clearOrderData);

    document.getElementById('saveOrderPreset')?.addEventListener('click', saveOrderPreset);
    document.getElementById('loadOrderPreset')?.addEventListener('click', async () => {
        const overlay = document.getElementById('orderOverlayToggle')?.checked || false;
        await loadOrderPreset(overlay);
    });
    document.getElementById('deleteOrderPreset')?.addEventListener('click', deleteOrderPreset);
    document.getElementById('exportOrderPresets')?.addEventListener('click', exportOrderPresets);
    document.getElementById('importOrderPresetsBtn')?.addEventListener('click', () => {
        document.getElementById('orderPresetFileInput')?.click();
    });
    document.getElementById('orderPresetFileInput')?.addEventListener('change', function(e) {
        if (this.files[0]) {
            importOrderPresets(this.files[0]);
            this.value = '';
        }
    });

    const btnMatrix = document.getElementById('openMatrixModal');
    if (btnMatrix) {
        btnMatrix.addEventListener('click', () => {
            import('./cases.js').then(module => {
                module.openMatrixModal(null, true, currentOrderCategory);
            });
        });
    }

    populateOrderPresetSelect();
}