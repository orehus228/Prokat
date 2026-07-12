// cases.js — Модалки: свойства позиции, общие кофры, матрица привязок
import {
    getItemProps,
    setItemProps,
    getCommonCases,
    addCommonCase,
    updateCommonCase,
    deleteCommonCase,
    saveEditorData,
    editorData,
    getStockKey,
    renameCategory,
    renameSubgroup,
    renameItem,
    moveItem
} from './data.js';

import {
    esc,
    showToast,
    showPrompt,
    showConfirm
} from './ui.js';

import { CAT_NAMES } from './config.js';
import { links, saveOrderData, updateOrderPaths } from './order.js';

// ============================================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ============================================================
let currentPropsPath = null;
let variantCounter = 0;
let casesManagerCallback = null;

// ============================================================
// МОДАЛКА СВОЙСТВ ПОЗИЦИИ (с кофрами)
// ============================================================
export function openPropsModalEditor(catKey, subKey, itemName, onSaveCallback) {
    currentPropsPath = { catKey, subKey, itemName, onSaveCallback };
    const props = getItemProps(catKey, subKey, itemName);
    
    document.getElementById('propsTitle').textContent = 'Свойства: ' + itemName;
    document.getElementById('propWeight').value = props.weight || '';
    document.getElementById('propDimensions').value = props.dimensions || '';
    document.getElementById('propVolume').value = props.volume || '';
    document.getElementById('propAllowCommon').checked = !!props.allowCommon;
    
    // Индивидуальные кофры
    const containerInd = document.getElementById('individualCasesContainer');
    containerInd.innerHTML = '';
    const individualCases = props.individualCases || [];
    if (individualCases.length === 0) {
        addIndividualCaseVariant();
    } else {
        individualCases.forEach(c => {
            addIndividualCaseVariant(c.qty, c.dimensions, c.weight, c.maxCases || 0);
        });
    }
    
    // Общие кофры (привязка)
    const containerCom = document.getElementById('commonCasesContainer');
    containerCom.innerHTML = '';
    const commonCases = props.commonCases || [];
    if (commonCases.length === 0) {
        addCommonCaseVariant();
    } else {
        commonCases.forEach(opt => {
            addCommonCaseVariant(opt.caseId, opt.qty);
        });
    }
    
    document.getElementById('propsModal').classList.add('open');
}

// ============================================================
// ИНДИВИДУАЛЬНЫЕ КОФРЫ (добавление варианта)
// ============================================================
function addIndividualCaseVariant(qty, dim, weight, maxCases) {
    const container = document.getElementById('individualCasesContainer');
    const group = document.createElement('div');
    group.className = 'case-variant-group';
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-variant';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => { 
        if (container.children.length <= 1) {
            showToast('Нельзя удалить последний вариант', 'warning');
            return;
        }
        group.remove(); 
    });
    group.appendChild(removeBtn);
    
    const id = 'ind_' + Date.now() + '_' + (variantCounter++);
    group.innerHTML += `
        <label>Кол-во в кофре (шт):</label>
        <input type="number" class="ind-qty" data-id="${id}" value="${qty !== undefined ? qty : ''}" placeholder="0" min="1">
        <label>Габариты кофра (Д×Ш×В, см):</label>
        <input type="text" class="ind-dim" data-id="${id}" value="${dim !== undefined ? dim : ''}" placeholder="120x80x60">
        <label>Вес пустого кофра (кг):</label>
        <input type="number" class="ind-weight" data-id="${id}" step="0.1" value="${weight !== undefined ? weight : ''}" placeholder="0.0" min="0">
        <label>Максимум кофров (0 = без ограничений):</label>
        <input type="number" class="ind-max-cases" data-id="${id}" step="1" min="0" value="${maxCases !== undefined ? maxCases : 0}" placeholder="0">
    `;
    container.appendChild(group);
}

export function addIndividualCaseVariantBtn() {
    addIndividualCaseVariant();
}

// ============================================================
// ОБЩИЕ КОФРЫ (привязка к позиции)
// ============================================================
function addCommonCaseVariant(caseId, qty) {
    const container = document.getElementById('commonCasesContainer');
    const group = document.createElement('div');
    group.className = 'case-variant-group';
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-variant';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => { group.remove(); });
    group.appendChild(removeBtn);
    
    const id = 'com_' + Date.now() + '_' + (variantCounter++);
    const commonCases = getCommonCases();
    let selectHtml = `<select class="com-case-select" data-id="${id}" style="width:100%;padding:6px;background:#1a1a1a;border:1px solid #3a3a3a;border-radius:6px;color:#d0d0d0;margin-bottom:6px;">`;
    selectHtml += `<option value="">— Выберите общий кофр —</option>`;
    commonCases.forEach(c => {
        const selected = (c.id === caseId) ? 'selected' : '';
        selectHtml += `<option value="${c.id}" ${selected}>${c.name} (вместимость: ${c.qty} шт, макс. вес: ${c.maxWeight || 0} кг)</option>`;
    });
    selectHtml += `</select>`;
    group.innerHTML += `
        <label>Выберите общий кофр:</label>
        ${selectHtml}
        <label>Количество единиц позиции в кофре (шт):</label>
        <input type="number" class="com-qty" data-id="${id}" value="${qty !== undefined ? qty : ''}" placeholder="0" min="1">
        <button class="btn btn-green" style="width:auto;padding:2px 8px;font-size:12px;margin-top:4px;" onclick="addNewCaseFromProps(this)">➕ Новый кофр</button>
    `;
    container.appendChild(group);
}

export function addCommonCaseVariantBtn() {
    addCommonCaseVariant();
}

export function addNewCaseFromProps(btn) {
    const group = btn.closest('.case-variant-group');
    const select = group.querySelector('.com-case-select');
    openCasesManagerModal(() => {
        // Обновляем все select'ы
        document.querySelectorAll('.com-case-select').forEach(sel => {
            const currentVal = sel.value;
            const commonCases = getCommonCases();
            sel.innerHTML = '<option value="">— Выберите общий кофр —</option>';
            commonCases.forEach(c => {
                const selected = (c.id === currentVal) ? 'selected' : '';
                sel.innerHTML += `<option value="${c.id}" ${selected}>${c.name} (вместимость: ${c.qty} шт, макс. вес: ${c.maxWeight || 0} кг)</option>`;
            });
        });
        showToast('Список общих кофров обновлён');
    });
}

// ============================================================
// СОХРАНЕНИЕ СВОЙСТВ
// ============================================================
export function initPropsSaveHandler() {
    const confirmBtn = document.getElementById('propsConfirm');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            if (!currentPropsPath) return;
            const { catKey, subKey, itemName, onSaveCallback } = currentPropsPath;
            const weight = parseFloat(document.getElementById('propWeight').value);
            const dimensions = document.getElementById('propDimensions').value.trim();
            const volume = parseFloat(document.getElementById('propVolume').value);
            const allowCommon = document.getElementById('propAllowCommon').checked;
            const props = {};
            if (!isNaN(weight) && weight > 0) props.weight = weight;
            if (dimensions) props.dimensions = dimensions;
            if (!isNaN(volume) && volume > 0) props.volume = volume;
            props.allowCommon = allowCommon;
            
            // Собираем индивидуальные кофры
            const individualCases = [];
            document.querySelectorAll('#individualCasesContainer .case-variant-group').forEach(group => {
                const qtyInput = group.querySelector('.ind-qty');
                const dimInput = group.querySelector('.ind-dim');
                const weightInput = group.querySelector('.ind-weight');
                const maxCasesInput = group.querySelector('.ind-max-cases');
                const qty = parseInt(qtyInput ? qtyInput.value : 0);
                const dim = dimInput ? dimInput.value.trim() : '';
                const w = parseFloat(weightInput ? weightInput.value : 0);
                const maxCases = parseInt(maxCasesInput ? maxCasesInput.value : 0);
                if (qty > 0 || dim || w > 0) {
                    individualCases.push({ 
                        qty, 
                        dimensions: dim, 
                        weight: isNaN(w) ? 0 : w, 
                        maxCases: isNaN(maxCases) ? 0 : maxCases 
                    });
                }
            });
            if (individualCases.length > 0) props.individualCases = individualCases;
            else delete props.individualCases;
            
            // Собираем привязки к общим кофрам
            const commonCases = [];
            document.querySelectorAll('#commonCasesContainer .case-variant-group').forEach(group => {
                const select = group.querySelector('.com-case-select');
                const qtyInput = group.querySelector('.com-qty');
                const caseId = select ? select.value : '';
                const qty = parseInt(qtyInput ? qtyInput.value : 0);
                if (caseId && !isNaN(qty) && qty > 0) {
                    commonCases.push({ caseId, qty });
                }
            });
            if (commonCases.length > 0) props.commonCases = commonCases;
            else delete props.commonCases;
            
            setItemProps(catKey, subKey, itemName, props);
            document.getElementById('propsModal').classList.remove('open');
            currentPropsPath = null;
            if (onSaveCallback) onSaveCallback();
            showToast('Свойства сохранены', 'success');
        });
    }
}

export function initPropsCancelHandler() {
    const cancelBtn = document.getElementById('propsCancel');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            document.getElementById('propsModal').classList.remove('open');
            currentPropsPath = null;
        });
    }
}

// ============================================================
// МОДАЛКА УПРАВЛЕНИЯ ОБЩИМИ КОФРАМИ
// ============================================================
export function openCasesManagerModal(callback) {
    casesManagerCallback = callback || null;
    renderCasesList();
    document.getElementById('casesManagerModal').classList.add('open');
}

function renderCasesList() {
    const container = document.getElementById('casesList');
    const cases = getCommonCases();
    if (cases.length === 0) {
        container.innerHTML = '<div class="empty-message">Нет общих кофров</div>';
        return;
    }
    let html = '';
    cases.forEach(c => {
        html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-bottom:1px solid #333;gap:10px;">
            <div><strong>${esc(c.name)}</strong><br>
            <span style="font-size:13px;color:#888;">Вместимость: ${c.qty} шт, Габ: ${c.dimensions || 'n/a'}, Вес пустого: ${c.emptyWeight || 0} кг, Макс. вес: ${c.maxWeight || 0} кг, Макс. объём: ${c.maxVolume || 0} м³</span></div>
            <div>
                <button class="btn btn-sm" style="width:auto;padding:2px 8px;font-size:12px;" onclick="editCase('${c.id}')">✏️</button>
                <button class="btn btn-sm" style="width:auto;padding:2px 8px;font-size:12px;background:#6a2a2a;color:#f0e0e0;" onclick="deleteCase('${c.id}')">✕</button>
            </div>
        </div>`;
    });
    container.innerHTML = html;
}

function editCase(id) {
    const cases = getCommonCases();
    const c = cases.find(c => c.id === id);
    if (!c) return;
    document.getElementById('newCaseName').value = c.name || '';
    document.getElementById('newCaseQty').value = c.qty || '';
    document.getElementById('newCaseDim').value = c.dimensions || '';
    document.getElementById('newCaseWeight').value = c.emptyWeight || '';
    document.getElementById('newCaseMaxWeight').value = c.maxWeight || '';
    document.getElementById('newCaseMaxVolume').value = c.maxVolume || '';
    const addBtn = document.getElementById('casesManagerAdd');
    addBtn.textContent = '💾 Обновить';
    addBtn.dataset.editId = id;
}

async function deleteCase(id) {
    const confirmed = await showConfirm('Удалить этот кофр?');
    if (!confirmed) return;
    deleteCommonCase(id);
    renderCasesList();
    showToast('Кофр удалён');
}

export function initCasesManagerHandlers() {
    const addBtn = document.getElementById('casesManagerAdd');
    if (addBtn) {
        addBtn.addEventListener('click', function() {
            const name = document.getElementById('newCaseName').value.trim();
            const qty = parseInt(document.getElementById('newCaseQty').value);
            const dimensions = document.getElementById('newCaseDim').value.trim();
            const emptyWeight = parseFloat(document.getElementById('newCaseWeight').value);
            const maxWeight = parseFloat(document.getElementById('newCaseMaxWeight').value);
            const maxVolume = parseFloat(document.getElementById('newCaseMaxVolume').value);
            if (!name) { showToast('Введите название кофра', 'warning'); return; }
            if (isNaN(qty) || qty <= 0) { showToast('Вместимость должна быть положительным числом', 'warning'); return; }
            const editId = this.dataset.editId;
            if (editId) {
                updateCommonCase(editId, { 
                    name, 
                    qty, 
                    dimensions, 
                    emptyWeight: isNaN(emptyWeight)?0:emptyWeight, 
                    maxWeight: isNaN(maxWeight)?0:maxWeight, 
                    maxVolume: isNaN(maxVolume)?0:maxVolume 
                });
                showToast('Кофр обновлён', 'success');
            } else {
                const newCase = {
                    id: 'case_' + Date.now(),
                    name, 
                    qty, 
                    dimensions, 
                    emptyWeight: isNaN(emptyWeight)?0:emptyWeight, 
                    maxWeight: isNaN(maxWeight)?0:maxWeight, 
                    maxVolume: isNaN(maxVolume)?0:maxVolume
                };
                addCommonCase(newCase);
                showToast('Кофр добавлен', 'success');
            }
            document.getElementById('newCaseName').value = '';
            document.getElementById('newCaseQty').value = '';
            document.getElementById('newCaseDim').value = '';
            document.getElementById('newCaseWeight').value = '';
            document.getElementById('newCaseMaxWeight').value = '';
            document.getElementById('newCaseMaxVolume').value = '';
            this.textContent = '➕ Добавить';
            delete this.dataset.editId;
            renderCasesList();
            if (casesManagerCallback) casesManagerCallback();
        });
    }
}

export function initCasesManagerCloseHandler() {
    const closeBtn = document.getElementById('casesManagerClose');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.getElementById('casesManagerModal').classList.remove('open');
            if (casesManagerCallback) casesManagerCallback();
        });
    }
}

export function initCasesManagerOverlayClose() {
    const overlay = document.getElementById('casesManagerModal');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                document.getElementById('casesManagerModal').classList.remove('open');
                if (casesManagerCallback) casesManagerCallback();
            }
        });
    }
}

// ============================================================
// МАТРИЦА ПРИВЯЗОК
// ============================================================
export function openMatrixModal(sourcePath) {
    const modal = document.getElementById('matrixModal');
    if (!modal) {
        showToast('Матрица привязок (модалка не найдена)', 'error');
        return;
    }
    if (sourcePath) {
        document.getElementById('matrixSearchSource').value = sourcePath.split('|').pop();
    } else {
        document.getElementById('matrixSearchSource').value = '';
    }
    document.getElementById('matrixSearchTarget').value = '';
    renderMatrix();
    modal.classList.add('open');
}

function renderMatrix() {
    const container = document.getElementById('matrixContainer');
    if (!container) return;
    const allPaths = getAllItemPaths();
    if (allPaths.length === 0) {
        container.innerHTML = '<p style="color:#666;">Нет позиций</p>';
        return;
    }
    const srcFilter = document.getElementById('matrixSearchSource').value.toLowerCase();
    const tgtFilter = document.getElementById('matrixSearchTarget').value.toLowerCase();

    const catMap = {};
    allPaths.forEach(p => {
        const parts = p.split('|');
        const cat = parts[0];
        if (!catMap[cat]) catMap[cat] = [];
        catMap[cat].push({ full: p, name: parts[parts.length-1] });
    });

    let allTargets = [];
    allPaths.forEach(p => {
        const parts = p.split('|');
        allTargets.push({ full: p, name: parts[parts.length-1], cat: parts[0] });
    });
    const unique = [];
    const seen = new Set();
    allTargets.forEach(t => { if (!seen.has(t.full)) { seen.add(t.full); unique.push(t); } });
    allTargets = unique;
    if (tgtFilter) allTargets = allTargets.filter(t => t.name.toLowerCase().includes(tgtFilter));

    let html = `<table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr><th style="border:1px solid #333;padding:6px;background:#222;color:#aaa;text-align:center;min-width:120px;">Источник \\ Цель</th>`;
    allTargets.forEach(target => {
        html += `<th style="border:1px solid #333;padding:6px;background:#222;color:#aaa;text-align:center;min-width:80px;">${target.name}<br><span style="font-weight:normal;font-size:10px;color:#888;">${CAT_NAMES[target.cat]||target.cat}</span></th>`;
    });
    html += '</tr></thead><tbody>';

    const orderKeys = editorData._categoryOrder || Object.keys(editorData.inventory);
    orderKeys.forEach(cat => {
        const items = catMap[cat] || [];
        let filtered = items;
        if (srcFilter) filtered = items.filter(item => item.name.toLowerCase().includes(srcFilter));
        if (filtered.length === 0) return;

        const catId = 'cat_' + cat + '_' + Date.now();
        html += `<tr class="matrix-category" onclick="toggleMatrixCategory('${catId}')"><td colspan="${allTargets.length+1}" style="text-align:left;padding:6px 10px;background:#222;border:1px solid #333;"><span class="toggle" id="toggle_${catId}">▶</span> ${CAT_NAMES[cat]||cat} (${filtered.length})</td></tr>`;
        html += `<tbody id="${catId}" class="matrix-category-items" style="display:none;">`;
        filtered.forEach((source, idx) => {
            const rowClass = idx % 2 === 0 ? 'row-even' : 'row-odd';
            html += `<tr class="${rowClass}"><td style="border:1px solid #333;padding:4px 6px;text-align:left;font-weight:500;color:#ccc;white-space:nowrap;">${source.name}</td>`;
            allTargets.forEach(target => {
                if (source.full === target.full) {
                    html += `<td style="border:1px solid #333;padding:4px 6px;text-align:center;color:#555;font-size:18px;cursor:default;">—</td>`;
                } else {
                    const link = links[source.full] ? links[source.full].find(l => l.target === target.full) : null;
                    const value = link ? link.multiplier : '';
                    if (value !== '') {
                        html += `<td style="border:1px solid #333;padding:4px 6px;text-align:center;cursor:pointer;" data-src="${source.full}" data-target="${target.full}" onclick="editMatrixCell(this,'${source.full}','${target.full}')"><span style="font-weight:600;color:#d4a040;">${value}</span></td>`;
                    } else {
                        html += `<td style="border:1px solid #333;padding:4px 6px;text-align:center;color:#555;font-size:18px;cursor:pointer;" data-src="${source.full}" data-target="${target.full}" onclick="editMatrixCell(this,'${source.full}','${target.full}')">+</td>`;
                    }
                }
            });
            html += '</tr>';
        });
        html += '</tbody>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;
}

function getAllItemPaths() {
    const res = [];
    function traverse(obj, path) {
        if (Array.isArray(obj)) {
            obj.forEach(item => res.push(path.length ? path.join('|') + '|' + item : item));
        } else if (typeof obj === 'object' && obj !== null) {
            for (let key in obj) {
                if (key.startsWith('_')) continue;
                traverse(obj[key], [...path, key]);
            }
        }
    }
    traverse(editorData.inventory, []);
    return res;
}

function toggleMatrixCategory(catId) {
    const tbody = document.getElementById(catId);
    const toggle = document.getElementById('toggle_' + catId);
    if (!tbody || !toggle) return;
    if (tbody.style.display === 'none') {
        tbody.style.display = 'table-row-group';
        toggle.textContent = '▼';
    } else {
        tbody.style.display = 'none';
        toggle.textContent = '▶';
    }
}

async function editMatrixCell(td, src, target) {
    const existing = links[src] ? links[src].find(l => l.target === target) : null;
    const currentVal = existing ? existing.multiplier : '';
    const val = await showPrompt(
        currentVal !== '' ? 'Изменить множитель' : 'Введите множитель',
        'Множитель (0 для удаления):',
        currentVal !== '' ? currentVal : '1'
    );
    if (val === null) return;
    const num = parseFloat(val);
    if (isNaN(num) || num === 0) {
        if (links[src]) {
            links[src] = links[src].filter(l => l.target !== target);
            if (links[src].length === 0) delete links[src];
        }
    } else {
        if (!links[src]) links[src] = [];
        const existingLink = links[src].find(l => l.target === target);
        if (existingLink) existingLink.multiplier = num;
        else links[src].push({ target, multiplier: num });
    }
    saveOrderData();
    renderMatrix();
    updateLinkCount();
    showToast('Привязка обновлена', 'success');
}

function updateLinkCount() {
    let count = 0;
    for (let src in links) count += links[src].length;
    const el = document.getElementById('linkCount');
    if (el) el.textContent = `(${count} активных)`;
}

export function initMatrixHandlers() {
    const closeBtn = document.getElementById('matrixClose');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.getElementById('matrixModal').classList.remove('open');
        });
    }
    const clearBtn = document.getElementById('matrixClearAll');
    if (clearBtn) {
        clearBtn.addEventListener('click', async () => {
            const confirmed = await showConfirm('Удалить все привязки?');
            if (!confirmed) return;
            for (let key in links) delete links[key];
            saveOrderData();
            renderMatrix();
            updateLinkCount();
            showToast('Все привязки удалены', 'success');
        });
    }
    const srcInput = document.getElementById('matrixSearchSource');
    if (srcInput) srcInput.addEventListener('input', renderMatrix);
    const tgtInput = document.getElementById('matrixSearchTarget');
    if (tgtInput) tgtInput.addEventListener('input', renderMatrix);
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ ВСЕХ ОБРАБОТЧИКОВ
// ============================================================
export function initCases() {
    initPropsSaveHandler();
    initPropsCancelHandler();
    initCasesManagerHandlers();
    initCasesManagerCloseHandler();
    initCasesManagerOverlayClose();
    initMatrixHandlers();
    
    window.addIndividualCaseVariant = addIndividualCaseVariantBtn;
    window.addCommonCaseVariant = addCommonCaseVariantBtn;
    window.addNewCaseFromProps = addNewCaseFromProps;
    window.editCase = editCase;
    window.deleteCase = deleteCase;
    window.toggleMatrixCategory = toggleMatrixCategory;
    window.editMatrixCell = editMatrixCell;
}