// order-helpers.js — Базовые утилиты для страницы заказа
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

// ============================================================
// БАЗОВЫЕ ФУНКЦИИ ДОСТУПА К ДАННЫМ
// ============================================================

export function getValue(path) {
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

export function getStockValue(path) {
    const parts = path.split('|');
    const catKey = parts[0];
    const subKey = parts.length > 2 ? parts[1] : null;
    const itemName = subKey ? parts.slice(2).join('|') : parts.slice(1).join('|');
    return getStock(catKey, subKey, itemName) || 9999;
}

export function setValueOrder(path, val) {
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
}

// ============================================================
// ПОСТРОЕНИЕ ПЛОСКОГО СПИСКА
// ============================================================

let flatItemsCache = null;

export function buildFlatItemsList() {
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

export function invalidateFlatItemsCache() {
    flatItemsCache = null;
}

// ============================================================
// ПОЛУЧЕНИЕ АКТИВНЫХ ПОЗИЦИЙ
// ============================================================

export function getActiveItemsOrder() {
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
// ИТОГИ
// ============================================================

export function updateLinkCountOrder() {
    let count = 0;
    for (let src in links) count += links[src].length;
    const el = document.getElementById('linkCount');
    if (el) el.textContent = `(${count} активных)`;
}

export function renderCommonCaseIndicatorsOrder() {
    // Заглушка — в будущем можно добавить индикаторы
}

// ============================================================
// РАБОТА С ДОЧЕРНИМИ ЭЛЕМЕНТАМИ
// ============================================================

export function updateChildRowsForPath(path) {
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
// ПОСТРОЕНИЕ БЛОКА ИНФО
// ============================================================

export function buildInfoHtml(path, props, mode) {
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
// ИНИЦИАЛИЗАЦИЯ КЕША
// ============================================================

export function initOrderHelpers() {
    // Загрузка состояния из localStorage
    // Можно добавить восстановление состояния
}