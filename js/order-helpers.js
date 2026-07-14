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
    orderPacking,
    individualCaseValues,
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
    // Новая логика: используем getTotalQty из order.js, которая учитывает все режимы
    return getTotalQty(path);
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
    const vals = getIndividualCaseValues(path);
    const packing = getOrderPacking(path);
    
    // Если есть упаковка в общие кофры или мультирежим, запрещаем прямое изменение
    if (packing.length > 0) {
        showToast('В режиме общих кофров меняйте количество в дочерних полях', 'warning');
        return;
    }
    if (mode.enabled && vals.length > 1) {
        showToast('В мульти-режиме меняйте количество в дочерних полях', 'warning');
        return;
    }
    if (mode.enabled && vals.length === 1) {
        // Режим одного кофра — обновляем individualCaseValues
        const opt = getSelectedOption(path);
        if (opt && opt.qty > 0) {
            // Проверяем, не превышает ли количество доступных кофров
            // Для индивидуальных кофров ограничений нет
            setIndividualCaseValues(path, [val]);
            order[path] = val;
            if (val === 0) {
                delete order[path];
                setIndividualCaseValues(path, []);
            }
            saveOrderData();
        } else {
            showToast('Ошибка: не выбран вариант кофра', 'error');
        }
        return;
    }
    
    // Без кофров
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
// ПОЛУЧЕНИЕ АКТИВНЫХ ПОЗИЦИЙ (обновлено с учётом новых режимов)
// ============================================================

export function getActiveItemsOrder() {
    const items = [];
    const allPaths = new Set();
    
    // Собираем все пути из всех источников
    for (let p in order) allPaths.add(p);
    for (let p in orderExtra) allPaths.add(p);
    for (let p in orderPacking) allPaths.add(p);
    for (let p in individualCaseValues) {
        const vals = individualCaseValues[p];
        if (vals.some(v => v > 0)) allPaths.add(p);
    }
    for (let p in orderSplits) {
        if (orderSplits[p].some(seg => seg.qty > 0)) allPaths.add(p);
    }
    
    allPaths.forEach(path => {
        const qty = getTotalQty(path);
        if (qty > 0) items.push({ path, qty });
    });
    return items;
}

// ============================================================
// ИТОГИ И ИНДИКАТОРЫ
// ============================================================

export function updateLinkCountOrder() {
    let count = 0;
    for (let src in links) count += links[src].length;
    const el = document.getElementById('linkCount');
    if (el) el.textContent = `(${count} активных)`;
}

// Заглушка для индикаторов общих кофров
export function renderCommonCaseIndicatorsOrder() {
    // Пустая заглушка — можно добавить логику позже
}

// ============================================================
// РАБОТА С ДОЧЕРНИМИ ЭЛЕМЕНТАМИ (обновлено для новых режимов)
// ============================================================

export function updateChildRowsForPath(path) {
    const parentRow = document.querySelector(`#categoryContents .row[data-path="${path}"]`);
    if (!parentRow) return;
    
    // Удаляем старые дочерние строки
    let next = parentRow.nextElementSibling;
    while (next && next.classList.contains('child-row')) {
        const toRemove = next;
        next = next.nextElementSibling;
        toRemove.remove();
    }
    
    const mode = getCaseMode(path);
    const options = getCaseOptions(path);
    const isMulti = mode.enabled && options.length > 1;
    const packing = getOrderPacking(path);
    const hasCommonPacking = packing.length > 0;
    const individualVals = getIndividualCaseValues(path);
    const extra = getOrderExtra(path);
    
    // Режим мультикофров
    if (isMulti && mode.enabled && options.length > 1) {
        const childDiv = document.createElement('div');
        childDiv.className = 'child-row';
        childDiv.dataset.parent = path;
        childDiv.style.width = '100%';
        childDiv.style.flexBasis = '100%';
        childDiv.style.padding = '8px 12px';
        childDiv.style.background = 'var(--bg-secondary)';
        childDiv.style.borderRadius = '6px';
        childDiv.style.margin = '4px 0';
        
        let html = `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:6px;font-size:13px;color:var(--text-secondary);">
            <strong>Распределение по вариантам кофров</strong>
            <span style="margin-left:auto;">Итого: ${individualVals.reduce((a,b) => a + b, 0)} шт</span>
        </div>`;
        
        options.forEach((opt, idx) => {
            const val = individualVals[idx] || 0;
            const maxPossible = getStockValue(path);
            const casesCount = Math.ceil(val / opt.qty);
            html += `<div class="child-controls" style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:4px 8px;background:var(--bg-input);border-radius:4px;margin:2px 0;">
                <span style="font-weight:500;min-width:80px;font-size:13px;">Вар.${idx+1}</span>
                <span style="font-size:12px;color:var(--text-secondary);margin-right:4px;">(вм.${opt.qty} шт)</span>
                <button class="btn-c child-qty-btn" style="width:28px;height:28px;font-size:14px;" data-path="${path}" data-idx="${idx}" data-delta="-1">−</button>
                <input type="number" class="child-qty" data-path="${path}" data-idx="${idx}" value="${val}" min="0" step="1" max="${maxPossible}" style="width:50px;padding:2px 4px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:4px;color:var(--text-primary);text-align:center;font-size:13px;">
                <button class="btn-c child-qty-btn" style="width:28px;height:28px;font-size:14px;" data-path="${path}" data-idx="${idx}" data-delta="1">+</button>
                <span style="font-size:12px;color:var(--text-secondary);margin-left:4px;">(${casesCount} кофр${casesCount > 1 ? 'а' : ''})</span>
                <span style="font-size:11px;color:var(--text-muted);">габ:${opt.dims || 'н/д'}</span>
            </div>`;
        });
        
        // Чекбокс "разрешить вне кофра" пока не реализован
        childDiv.innerHTML = html;
        parentRow.after(childDiv);
    }
    
    // Режим общих кофров
    if (hasCommonPacking) {
        const commonCases = getCommonCases();
        const childDiv = document.createElement('div');
        childDiv.className = 'child-row';
        childDiv.dataset.parent = path;
        childDiv.style.width = '100%';
        childDiv.style.flexBasis = '100%';
        childDiv.style.padding = '8px 12px';
        childDiv.style.background = 'var(--bg-secondary)';
        childDiv.style.borderRadius = '6px';
        childDiv.style.margin = '4px 0';
        
        let html = `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:6px;font-size:13px;color:var(--text-secondary);">
            <strong>Упаковка в общие кофры</strong>
            <span style="margin-left:auto;">Вне кофра: ${extra} шт</span>
        </div>`;
        
        // Строка "вне кофра"
        const maxExtra = getStockValue(path);
        html += `<div class="child-controls" style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:4px 8px;background:var(--bg-input);border-radius:4px;margin:2px 0;">
            <span style="font-weight:500;min-width:80px;font-size:13px;">Вне кофра</span>
            <button class="btn-c child-extra-btn" style="width:28px;height:28px;font-size:14px;" data-path="${path}" data-delta="-1">−</button>
            <input type="number" class="child-extra-qty" data-path="${path}" value="${extra}" min="0" step="1" max="${maxExtra}" style="width:50px;padding:2px 4px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:4px;color:var(--text-primary);text-align:center;font-size:13px;">
            <button class="btn-c child-extra-btn" style="width:28px;height:28px;font-size:14px;" data-path="${path}" data-delta="1">+</button>
        </div>`;
        
        // Строки для каждого общего кофра
        packing.forEach((p, idx) => {
            const c = commonCases.find(c => c.id === p.caseId);
            const name = c ? c.name : 'удалённый кофр';
            const qty = p.pieces || 0;
            const maxPack = c ? c.qty : Infinity;
            const filledWeight = qty * (getItemProps(path).weight || 0);
            const maxWeight = c?.maxWeight || Infinity;
            const fillPercent = maxWeight > 0 ? Math.round((filledWeight / maxWeight) * 100) : 0;
            let statusColor = 'var(--text-secondary)';
            let statusText = '';
            if (fillPercent >= 100) {
                statusColor = 'var(--danger)';
                statusText = '🔴 Заполнен';
            } else if (fillPercent >= 90) {
                statusColor = 'var(--warning)';
                statusText = '🟡 Почти заполнен';
            }
            
            html += `<div class="child-controls" style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:4px 8px;background:var(--bg-input);border-radius:4px;margin:2px 0;border-left:3px solid ${statusColor};">
                <span style="font-weight:500;min-width:80px;font-size:13px;">${esc(name)}</span>
                <span style="font-size:12px;color:var(--text-secondary);">(вм.${c?.qty || 0} шт)</span>
                <button class="btn-c child-common-btn" style="width:28px;height:28px;font-size:14px;" data-path="${path}" data-caseid="${p.caseId}" data-delta="-1">−</button>
                <input type="number" class="child-common-qty" data-path="${path}" data-caseid="${p.caseId}" value="${qty}" min="0" step="1" max="${maxPack}" style="width:50px;padding:2px 4px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:4px;color:var(--text-primary);text-align:center;font-size:13px;">
                <button class="btn-c child-common-btn" style="width:28px;height:28px;font-size:14px;" data-path="${path}" data-caseid="${p.caseId}" data-delta="1">+</button>
                ${statusText ? `<span style="font-size:12px;color:${statusColor};">${statusText} (${fillPercent}%)</span>` : ''}
                <button class="btn btn-sm remove-common-pack" style="background:var(--danger);color:white;padding:0 6px;font-size:11px;border-radius:4px;border:none;cursor:pointer;" data-path="${path}" data-caseid="${p.caseId}">✕</button>
            </div>`;
        });
        
        childDiv.innerHTML = html;
        parentRow.after(childDiv);
    }
}

// ============================================================
// ПОСТРОЕНИЕ БЛОКА ИНФО (обновлено для новых режимов)
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
    const individualVals = getIndividualCaseValues(path);
    const packing = getOrderPacking(path);
    const extra = getOrderExtra(path);
    
    if (packing.length > 0) {
        // Режим общих кофров
        html += `<div style="width:100%;"><strong>Общие кофры:</strong></div>`;
        const commonCases = getCommonCases();
        packing.forEach(p => {
            const c = commonCases.find(c => c.id === p.caseId);
            const name = c ? c.name : 'удалённый кофр';
            html += `<div style="padding-left:12px;font-size:13px;color:var(--text-secondary);">
                • ${name}: ${p.pieces || 0} шт
            </div>`;
        });
        if (extra > 0) {
            html += `<div style="padding-left:12px;font-size:13px;color:var(--text-secondary);">
                • Вне кофра: ${extra} шт
            </div>`;
        }
    } else if (options.length > 0 && individualVals.length > 0) {
        // Индивидуальные кофры
        html += `<div style="width:100%;"><strong>Индивидуальные кофры:</strong></div>`;
        if (individualVals.length === 1 && mode.enabled) {
            // Один кофр
            const opt = getSelectedOption(path);
            const val = individualVals[0] || 0;
            const casesCount = Math.ceil(val / (opt?.qty || 1));
            html += `<div style="padding-left:12px;font-size:13px;color:var(--text-secondary);">
                • Вариант ${(mode.selectedOption || 0) + 1}: ${val} шт (${casesCount} кофр${casesCount > 1 ? 'а' : ''})
            </div>`;
        } else {
            // Мульти
            options.forEach((opt, idx) => {
                const val = individualVals[idx] || 0;
                if (val > 0) {
                    const casesCount = Math.ceil(val / opt.qty);
                    html += `<div style="padding-left:12px;font-size:13px;color:var(--text-secondary);">
                        • Вариант ${idx+1}: ${val} шт (${casesCount} кофр${casesCount > 1 ? 'а' : ''}, вместимость ${opt.qty} шт)
                    </div>`;
                }
            });
        }
    }

    html += `<div style="width:100%;"><strong>Статус режимов кофров:</strong></div>`;
    html += `<div style="width:100%;padding-left:12px;font-size:13px;color:var(--text-secondary);">
        <span>Режим: ${mode.enabled ? '✅ Включён' : 'не активирован'}</span>
        ${packing.length > 0 ? `<span style="margin-left:12px;">📦 Общие кофры (${packing.length} шт)</span>` : ''}
        ${individualVals.length > 1 ? `<span style="margin-left:12px;">🔄 Мульти-режим</span>` : ''}
        ${individualVals.length === 1 && mode.enabled ? `<span style="margin-left:12px;">📦 Один кофр</span>` : ''}
    </div>`;

    html += `</div>`;
    return html;
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ (заглушка)
// ============================================================

export function initOrderHelpers() {
    // Пустая функция для совместимости
}