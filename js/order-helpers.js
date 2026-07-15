// order-helpers.js — окрашивание теперь применяется к .child-controls
import { editorData, getStock, getItemProps, getCommonCases, saveEditorData } from './data.js';
import { CAT_NAMES } from './config.js';
import { esc, showToast, showPrompt, showConfirm, debounce } from './ui.js';
import {
    order, orderSplits, links, notes, caseModes, orderPacking, individualCaseValues,
    saveOrderData, getTotalQty, getSegmentsSum, calcItemWeightWithMode, calcItemVolumeWithMode,
    calcItemCases, loadOrderData, getOrderPacking, setOrderPacking, getOrderExtra,
    setOrderExtra, getCommonRoutes, setCommonRoutes, getIndividualCaseValues,
    setIndividualCaseValues, getCaseMode, getCaseOptions, getSelectedOption,
    updateOrderPaths, orderExclude, orderExtra
} from './order.js';

export function getValue(path) {
    const mode = getCaseMode(path);
    const isMulti = isMultiMode(path);
    if (mode.enabled && isMulti) { const vals = getIndividualCaseValues(path); return vals.reduce((a,b) => a + b, 0); }
    const packing = getOrderPacking(path);
    if (packing.length > 0) { const extra = getOrderExtra(path); const packed = packing.reduce((s, p) => s + (p.pieces || 0), 0); return extra + packed; }
    return order[path] || 0;
}
function isMultiMode(path) {
    const mode = getCaseMode(path);
    const vals = getIndividualCaseValues(path);
    if (mode.multiSelected && mode.multiSelected.some(v => v === true)) return true;
    if (mode.enabled && vals.length > 1) return true;
    return false;
}
export function getStockValue(path) {
    const parts = path.split('|');
    const catKey = parts[0];
    const subKey = parts.length > 2 ? parts[1] : null;
    const itemName = subKey ? parts.slice(2).join('|') : parts.slice(1).join('|');
    const key = subKey ? catKey + '|' + subKey + '|' + itemName : catKey + '|' + itemName;
    if (editorData.stock[key] === undefined) return 9999;
    return editorData.stock[key];
}
export function setValueOrder(path, val) {
    val = Math.max(0, parseInt(val) || 0);
    const mode = getCaseMode(path);
    const isMulti = isMultiMode(path);
    if (mode.enabled && isMulti) { showToast('В мульти-режиме меняйте количество в дочерних полях', 'warning'); return; }
    const packing = getOrderPacking(path);
    if (packing.length > 0) { showToast('В режиме общих кофров меняйте количество в дочерних полях', 'warning'); return; }
    if (order[path] === val) return;
    order[path] = val;
    if (val === 0) delete order[path];
    saveOrderData();
}

let flatItemsCache = null;
export function buildFlatItemsList() {
    if (flatItemsCache) return flatItemsCache;
    const result = [];
    const inventory = editorData.inventory;
    if (!inventory) return result;
    const stack = [];
    const orderKeys = editorData._categoryOrder || Object.keys(inventory);
    orderKeys.forEach(cat => { if (inventory[cat] !== undefined) stack.push({ data: inventory[cat], path: [cat] }); });
    while (stack.length > 0) {
        const { data, path } = stack.pop();
        if (Array.isArray(data)) {
            data.forEach(item => { if (typeof item === 'string') { const fullPath = path.length ? path.join('|') + '|' + item : item; result.push(fullPath); } });
        } else if (data && typeof data === 'object') {
            const keys = Object.keys(data).filter(k => !k.startsWith('_'));
            for (let i = keys.length - 1; i >= 0; i--) { const key = keys[i]; const child = data[key]; if (child !== undefined) stack.push({ data: child, path: [...path, key] }); }
        }
    }
    flatItemsCache = result;
    return result;
}
export function invalidateFlatItemsCache() { flatItemsCache = null; }

export function getActiveItemsOrder() {
    const items = [];
    const allPaths = new Set();
    for (let p in order) allPaths.add(p);
    for (let p in orderExtra) allPaths.add(p);
    for (let p in orderPacking) allPaths.add(p);
    for (let p in individualCaseValues) { const vals = individualCaseValues[p]; if (vals.reduce((a,b) => a + b, 0) > 0) allPaths.add(p); }
    allPaths.forEach(path => { const qty = getTotalQty(path); if (qty > 0) items.push({ path, qty }); });
    return items;
}

export function updateLinkCountOrder() {
    let count = 0;
    for (let src in links) count += links[src].length;
    const el = document.getElementById('linkCount');
    if (el) el.textContent = `(${count} активных)`;
}

export function renderCommonCaseIndicatorsOrder() {
    let indicator = document.getElementById('commonCaseIndicators');
    if (!indicator) {
        const linkCount = document.getElementById('linkCount');
        if (!linkCount?.parentElement) return;
        indicator = document.createElement('span');
        indicator.id = 'commonCaseIndicators';
        indicator.style.cssText = 'font-size:13px;color:var(--text-secondary);margin-left:8px;';
        linkCount.parentElement.appendChild(indicator);
    }
    const usedCases = new Map();
    for (let path in orderPacking) {
        getOrderPacking(path).forEach(p => {
            if (p.pieces > 0) usedCases.set(p.caseId, (usedCases.get(p.caseId) || 0) + p.pieces);
        });
    }
    if (usedCases.size === 0) { indicator.textContent = ''; return; }
    const parts = [];
    usedCases.forEach((pieces, caseId) => {
        const c = getCommonCases().find(x => x.id === caseId);
        parts.push(`[Кофр] ${c?.name || 'Кофр'}: ${pieces} шт`);
    });
    indicator.textContent = parts.join(' · ');
}

// ===== ФУНКЦИЯ ДЛЯ ВЫЧИСЛЕНИЯ ЦВЕТА ПО ПРОЦЕНТУ (ПЛАВНЫЙ ГРАДИЕНТ) =====
export function getColorByPercent(percent) {
    let r, g, b;
    if (percent < 80) {
        const t = percent / 80;
        r = Math.round(76 + (255 - 76) * t * 0.5);
        g = Math.round(175 + (235 - 175) * t);
        b = Math.round(76 + (0 - 76) * t * 0.3);
    } else if (percent < 90) {
        const t = (percent - 80) / 10;
        r = Math.round(76 + (255 - 76) * t);
        g = Math.round(175 + (235 - 175) * t);
        b = Math.round(76 + (0 - 76) * t);
    } else if (percent < 100) {
        const t = (percent - 90) / 10;
        r = 255;
        g = Math.round(235 + (165 - 235) * t);
        b = 0;
    } else {
        r = 244; g = 67; b = 54;
    }
    return `rgb(${Math.min(255, Math.round(r))}, ${Math.min(255, Math.round(g))}, ${Math.min(255, Math.round(b))})`;
}

// ===== ОБНОВЛЕНИЕ КНОПКИ "ОБЩИЕ КОФРЫ" В РЕДАКТОРЕ =====
export function updateCommonCasesButton() {
    const btn = document.getElementById('manageCasesBtn');
    if (!btn) return;
    const allCommonCases = getCommonCases();
    if (allCommonCases.length === 0) {
        btn.textContent = 'Общие кофры (0)';
        btn.style.backgroundColor = '';
        btn.style.color = '';
        btn.style.borderColor = '';
        return;
    }
    const stats = new Map();
    allCommonCases.forEach(c => stats.set(c.id, { totalWeight: 0, maxWeight: c.maxWeight || 0 }));
    for (let path in orderPacking) {
        const packing = getOrderPacking(path);
        const props = getItemProps(path);
        const unitWeight = props.weight || 0;
        packing.forEach(p => {
            const stat = stats.get(p.caseId);
            if (stat) stat.totalWeight += p.pieces * unitWeight;
        });
    }
    let totalFill = 0, count = 0;
    stats.forEach(stat => {
        if (stat.maxWeight > 0) {
            totalFill += Math.min(100, (stat.totalWeight / stat.maxWeight) * 100);
            count++;
        }
    });
    const avgFill = count > 0 ? totalFill / count : 0;
    const color = getColorByPercent(avgFill);
    btn.textContent = `Общие кофры (${Math.round(avgFill)}%)`;
    btn.style.backgroundColor = color;
    btn.style.color = '#fff';
    btn.style.borderColor = color;
}

// ===== ОБНОВЛЕННАЯ ФУНКЦИЯ ОКРАШИВАНИЯ (ОКРАШИВАЕТ .child-controls) =====
export function updateAllCommonCaseIndicators() {
    setTimeout(() => {
        const allCommonCases = getCommonCases();
        const stats = new Map();
        allCommonCases.forEach(c => {
            stats.set(c.id, { totalWeight: 0, totalVolume: 0, maxWeight: c.maxWeight || 0, maxVolume: c.maxVolume || 0, name: c.name || 'Кофр', dimensions: c.dimensions || '' });
        });
        for (let path in orderPacking) {
            const packing = getOrderPacking(path);
            const props = getItemProps(path);
            const unitWeight = props.weight || 0;
            const unitVolume = parseUnitVolume(props.dimensions);
            packing.forEach(p => {
                if (p.pieces <= 0) return;
                const stat = stats.get(p.caseId);
                if (!stat) return;
                stat.totalWeight += p.pieces * unitWeight;
                stat.totalVolume += p.pieces * unitVolume;
            });
        }
        const container = document.getElementById('categoryContents');
        if (!container) return;
        // Ищем все .child-controls с data-caseid
        container.querySelectorAll('.child-controls[data-caseid]').forEach(controls => {
            const caseId = controls.dataset.caseid;
            const stat = stats.get(caseId);
            if (!stat) return;
            const fillPercent = stat.maxWeight > 0 ? Math.min(100, Math.round((stat.totalWeight / stat.maxWeight) * 100)) : 0;
            const color = getColorByPercent(fillPercent);
            // Устанавливаем фон и левую границу напрямую через style (плавный градиент)
            controls.style.backgroundColor = color;
            controls.style.borderLeftColor = color;
            // Обновляем текст процента
            let percentSpan = controls.querySelector('.case-fill-percent');
            if (!percentSpan) {
                percentSpan = document.createElement('span');
                percentSpan.className = 'case-fill-percent';
                percentSpan.style.cssText = 'font-size:11px;margin-left:4px;';
                controls.appendChild(percentSpan);
            }
            percentSpan.textContent = `${fillPercent}%`;
            // Цвет текста белый, если фон тёмный
            const brightness = (parseInt(color.slice(1,2), 16) * 299 + parseInt(color.slice(3,4), 16) * 587 + parseInt(color.slice(5,6), 16) * 114) / 1000;
            percentSpan.style.color = brightness > 128 ? '#000' : '#fff';
            // Также меняем цвет текста внутри controls для контраста
            const allSpans = controls.querySelectorAll('span:not(.case-fill-percent), input, button:not(.remove-common-pack)');
            allSpans.forEach(el => {
                el.style.color = brightness > 128 ? '#000' : '#fff';
            });
            // Кнопка удаления остаётся красной
            const removeBtn = controls.querySelector('.remove-common-pack');
            if (removeBtn) removeBtn.style.color = 'white';
        });
        updateCommonCasesButton();
    }, 50);
}

function parseUnitVolume(dimensions) {
    if (!dimensions) return 0;
    const d = dimensions.split('x').map(s => parseFloat(s.trim()));
    if (d.length === 3 && d.every(v => !isNaN(v) && v > 0)) return (d[0] * d[1] * d[2]) / 1000000;
    return 0;
}

export function updateChildRowsForPath(path) {
    const parentRow = document.querySelector(`#categoryContents .row[data-path="${path}"]`);
    if (!parentRow) return;
    let next = parentRow.nextElementSibling;
    while (next && next.classList.contains('child-row')) { const toRemove = next; next = next.nextElementSibling; toRemove.remove(); }
    const mode = getCaseMode(path);
    const options = getCaseOptions(path);
    const isMulti = isMultiMode(path);
    const packing = getOrderPacking(path);
    const hasCommonPacking = packing.length > 0;
    const individualVals = getIndividualCaseValues(path);
    const props = getItemProps(path);

    if (isMulti && mode.enabled && options.length > 1) {
        const childDiv = document.createElement('div');
        childDiv.className = 'child-row';
        childDiv.dataset.parent = path;
        childDiv.style.width = '100%';
        childDiv.style.flexBasis = '100%';
        childDiv.style.padding = '6px 12px';
        childDiv.style.borderRadius = '6px';
        childDiv.style.margin = '4px 0';
        childDiv.style.border = '1px solid var(--border-light)';
        let html = `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:4px;font-size:13px;color:var(--text-secondary);">
            <strong>Распределение по вариантам кофров</strong>
            <span style="margin-left:auto;">Итого: ${individualVals.reduce((a,b) => a + b, 0)} шт</span>
        </div>`;
        options.forEach((opt, idx) => {
            const val = individualVals[idx] || 0;
            const casesCount = Math.ceil(val / opt.qty);
            const maxPossible = getStockValue(path);
            const maxCases = opt.maxCases || 0;
            html += `<div class="child-controls" style="display:flex;flex-wrap:nowrap;align-items:center;gap:4px;padding:4px 8px;background:var(--bg-input);border-radius:4px;margin:2px 0;border-left:3px solid var(--accent);">
                <span style="font-weight:500;min-width:70px;font-size:13px;">Вар.${idx+1}</span>
                <span style="font-size:11px;color:var(--text-secondary);min-width:30px;">шт:</span>
                <button class="btn-c child-multi-piece-btn" style="width:26px;height:26px;font-size:13px;flex-shrink:0;" data-path="${path}" data-idx="${idx}" data-delta="-1">−</button>
                <input type="number" class="child-multi-pieces" data-path="${path}" data-idx="${idx}" value="${val}" min="0" step="1" max="${maxPossible}" style="width:44px;padding:2px 4px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:4px;color:var(--text-primary);text-align:center;font-size:13px;flex-shrink:0;">
                <button class="btn-c child-multi-piece-btn" style="width:26px;height:26px;font-size:13px;flex-shrink:0;" data-path="${path}" data-idx="${idx}" data-delta="1">+</button>
                <span style="font-size:11px;color:var(--text-secondary);min-width:35px;">кофры:</span>
                <button class="btn-c child-multi-case-btn" style="width:26px;height:26px;font-size:13px;flex-shrink:0;" data-path="${path}" data-idx="${idx}" data-delta="-1">−</button>
                <input type="number" class="child-multi-cases" data-path="${path}" data-idx="${idx}" value="${casesCount}" min="0" step="1" style="width:44px;padding:2px 4px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:4px;color:var(--text-primary);text-align:center;font-size:13px;flex-shrink:0;">
                <button class="btn-c child-multi-case-btn" style="width:26px;height:26px;font-size:13px;flex-shrink:0;" data-path="${path}" data-idx="${idx}" data-delta="1">+</button>
                <span style="font-size:11px;color:var(--text-muted);min-width:60px;">${maxCases > 0 ? `макс.${maxCases}` : ''}</span>
                <span style="font-size:11px;color:var(--text-muted);min-width:70px;">${opt.dims || 'н/д'}</span>
                <span style="font-size:11px;color:var(--text-muted);min-width:50px;">вес:${opt.weight || 0}</span>
            </div>`;
        });
        childDiv.innerHTML = html;
        parentRow.after(childDiv);
        return;
    }

    if (hasCommonPacking) {
        const commonCases = getCommonCases();
        const extra = getOrderExtra(path);
        const childDiv = document.createElement('div');
        childDiv.className = 'child-row';
        childDiv.dataset.parent = path;
        childDiv.style.width = '100%';
        childDiv.style.flexBasis = '100%';
        childDiv.style.padding = '6px 12px';
        childDiv.style.borderRadius = '6px';
        childDiv.style.margin = '4px 0';
        childDiv.style.border = '1px solid var(--border-light)';
        let html = `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:4px;font-size:13px;color:var(--text-secondary);">
            <strong>Упаковка в общие кофры</strong>
            <span style="margin-left:auto;">Вне кофра: ${extra} шт</span>
        </div>`;
        const maxExtra = getStockValue(path);
        html += `<div class="child-controls" style="display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:4px 8px;background:var(--bg-input);border-radius:4px;margin:2px 0;border-left:3px solid var(--text-muted);">
            <span style="font-weight:500;min-width:70px;font-size:13px;">Вне кофра</span>
            <button class="btn-c child-extra-btn" style="width:26px;height:26px;font-size:13px;" data-path="${path}" data-delta="-1">−</button>
            <input type="number" class="child-extra-qty" data-path="${path}" value="${extra}" min="0" step="1" max="${maxExtra}" style="width:44px;padding:2px 4px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:4px;color:var(--text-primary);text-align:center;font-size:13px;">
            <button class="btn-c child-extra-btn" style="width:26px;height:26px;font-size:13px;" data-path="${path}" data-delta="1">+</button>
        </div>`;
        packing.forEach((p, idx) => {
            const c = commonCases.find(c => c.id === p.caseId);
            const name = c ? c.name : 'удалённый кофр';
            const qty = p.pieces || 0;
            const maxPack = c ? c.qty : 0;
            const unitWeight = props.weight || 0;
            const filledWeight = qty * unitWeight;
            const maxWeight = c?.maxWeight || Infinity;
            let fillPercent = 0;
            if (maxWeight > 0) fillPercent = Math.min(100, Math.round((filledWeight / maxWeight) * 100));
            html += `<div class="child-controls" data-caseid="${p.caseId}" style="display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:4px 8px;background:var(--bg-input);border-radius:4px;margin:2px 0;border-left:3px solid var(--text-muted);">
                <span style="font-weight:500;min-width:70px;font-size:13px;">${esc(name)}</span>
                <span style="font-size:11px;color:var(--text-secondary);min-width:30px;">шт:</span>
                <button class="btn-c child-common-btn" style="width:26px;height:26px;font-size:13px;" data-path="${path}" data-caseid="${p.caseId}" data-delta="-1">−</button>
                <input type="number" class="child-common-qty" data-path="${path}" data-caseid="${p.caseId}" value="${qty}" min="0" step="1" max="${maxPack}" style="width:44px;padding:2px 4px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:4px;color:var(--text-primary);text-align:center;font-size:13px;">
                <button class="btn-c child-common-btn" style="width:26px;height:26px;font-size:13px;" data-path="${path}" data-caseid="${p.caseId}" data-delta="1">+</button>
                <span class="case-fill-percent" style="font-size:11px;color:var(--text-secondary);">${fillPercent}%</span>
                <span style="font-size:11px;color:var(--text-muted);min-width:70px;">${c?.dimensions || 'н/д'}</span>
                <span style="font-size:11px;color:var(--text-muted);min-width:50px;">вес:${c?.emptyWeight || 0}</span>
                <button class="btn btn-sm remove-common-pack" style="background:var(--danger);color:white;padding:0 6px;font-size:11px;border-radius:4px;border:none;cursor:pointer;" data-path="${path}" data-caseid="${p.caseId}">✕</button>
            </div>`;
        });
        childDiv.innerHTML = html;
        parentRow.after(childDiv);
        // Явно вызываем обновление индикаторов после создания
        updateAllCommonCaseIndicators();
    }
}

export function buildInfoHtml(path, props, mode) {
    let html = `<div style="display:flex;flex-wrap:wrap;gap:12px;">`;
    const weightPerUnit = (props.weight !== undefined && props.weight !== null) ? props.weight + ' кг' : 'н/д';
    html += `<span><strong>Вес 1 шт:</strong> ${weightPerUnit}</span>`;
    const dims = props.dimensions || 'н/д';
    html += `<span><strong>Габариты:</strong> ${dims}</span>`;
    if (props.volume) html += `<span><strong>Объём 1 шт:</strong> ${props.volume} м³</span>`;
    const options = getCaseOptions(path);
    const individualVals = getIndividualCaseValues(path);
    const packing = getOrderPacking(path);
    const extra = getOrderExtra(path);
    const isMulti = isMultiMode(path);
    if (packing.length > 0) {
        html += `<div style="width:100%;"><strong>Общие кофры:</strong></div>`;
        const commonCases = getCommonCases();
        packing.forEach(p => {
            const c = commonCases.find(c => c.id === p.caseId);
            const name = c ? c.name : 'удалённый кофр';
            html += `<div style="padding-left:12px;font-size:13px;color:var(--text-secondary);">• ${name}: ${p.pieces || 0} шт</div>`;
        });
        if (extra > 0) html += `<div style="padding-left:12px;font-size:13px;color:var(--text-secondary);">• Вне кофра: ${extra} шт</div>`;
    } else if (mode.enabled && isMulti && individualVals.length > 1) {
        html += `<div style="width:100%;"><strong>Мультикофры:</strong></div>`;
        options.forEach((opt, idx) => {
            const val = individualVals[idx] || 0;
            if (val > 0) {
                const casesCount = Math.ceil(val / opt.qty);
                html += `<div style="padding-left:12px;font-size:13px;color:var(--text-secondary);">• Вариант ${idx+1}: ${val} шт (${casesCount} кофр${casesCount > 1 ? 'а' : ''}) — габ: ${opt.dims || 'н/д'}, вес кофра: ${opt.weight || 0} кг</div>`;
            }
        });
    } else if (mode.enabled && individualVals.length === 1 && !packing.length && !isMulti) {
        html += `<div style="width:100%;"><strong>Один кофр:</strong></div>`;
        const opt = getSelectedOption(path);
        const val = individualVals[0] || 0;
        if (val > 0 && opt) {
            const casesCount = Math.ceil(val / opt.qty);
            html += `<div style="padding-left:12px;font-size:13px;color:var(--text-secondary);">• Вариант ${(mode.selectedOption || 0) + 1}: ${val} шт (${casesCount} кофр${casesCount > 1 ? 'а' : ''}) — габ: ${opt.dims || 'н/д'}, вес кофра: ${opt.weight || 0} кг</div>`;
        }
        if (mode.alt && mode.useAlt) html += `<div style="padding-left:12px;font-size:13px;color:var(--text-secondary);">• Альтернативный: вместимость ${mode.alt.qty || 0} шт</div>`;
    }
    html += `<div style="width:100%;"><strong>Статус режимов кофров:</strong></div>`;
    html += `<div style="width:100%;padding-left:12px;font-size:13px;color:var(--text-secondary);">
        <span>Режим: ${mode.enabled ? '[Вкл]' : '[Выкл]'}</span>
        ${packing.length > 0 ? `<span style="margin-left:12px;">[Общие кофры] ${packing.length} шт</span>` : ''}
        ${isMulti ? `<span style="margin-left:12px;">[Мульти]</span>` : ''}
        ${individualVals.length === 1 && mode.enabled && !packing.length && !isMulti ? `<span style="margin-left:12px;">[Один кофр]</span>` : ''}
        ${mode.alt && mode.useAlt ? `<span style="margin-left:12px;">[Альт.]</span>` : ''}
    </div>`;
    html += `</div>`;
    return html;
}

export function initOrderHelpers() {}