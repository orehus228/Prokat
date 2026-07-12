// cases.js — Модалки для работы с кофрами (индивидуальные и общие)
import {
    getItemProps,
    setItemProps,
    getCommonCases,
    addCommonCase,
    updateCommonCase,
    deleteCommonCase,
    saveEditorData,
    editorData
} from './data.js';
import { esc, showToast } from './ui.js';
import { CAT_NAMES } from './config.js';

// ============================================================
// СОСТОЯНИЕ МОДУЛЯ
// ============================================================
let currentPropsPath = null;        // { catKey, subKey, itemName, onSaveCallback }
let variantCounter = 0;
let casesManagerCallback = null;

// ============================================================
// МОДАЛКА СВОЙСТВ ПОЗИЦИИ
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
    removeBtn.addEventListener('click', () => group.remove());
    group.appendChild(removeBtn);
    const id = 'ind_' + Date.now() + '_' + (variantCounter++);
    group.innerHTML = `
        <label>Кол-во в кофре (шт):</label>
        <input type="number" class="ind-qty" data-id="${id}" value="${qty !== undefined ? qty : ''}" placeholder="0">
        <label>Габариты кофра (Д×Ш×В, см):</label>
        <input type="text" class="ind-dim" data-id="${id}" value="${dim !== undefined ? dim : ''}" placeholder="120x80x60">
        <label>Вес пустого кофра (кг):</label>
        <input type="number" class="ind-weight" data-id="${id}" step="0.1" value="${weight !== undefined ? weight : ''}" placeholder="0.0">
        <label>Максимум кофров (0 = без ограничений):</label>
        <input type="number" class="ind-max-cases" data-id="${id}" step="1" min="0" value="${maxCases !== undefined ? maxCases : 0}" placeholder="0">
    `;
    container.appendChild(group);
}

// Добавление варианта по кнопке "+ Добавить вариант"
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
    removeBtn.addEventListener('click', () => group.remove());
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
    group.innerHTML = `
        <label>Выберите общий кофр:</label>
        ${selectHtml}
        <label>Количество единиц позиции в кофре (шт):</label>
        <input type="number" class="com-qty" data-id="${id}" value="${qty !== undefined ? qty : ''}" placeholder="0">
        <button class="btn btn-green" style="width:auto;padding:2px 8px;font-size:12px;margin-top:4px;" onclick="addNewCaseFromProps(this)">➕ Новый кофр</button>
    `;
    container.appendChild(group);
}

// Добавление связи с общим кофром по кнопке
export function addCommonCaseVariantBtn() {
    addCommonCaseVariant();
}

// Кнопка "Новый кофр" внутри группы
export function addNewCaseFromProps(btn) {
    const group = btn.closest('.case-variant-group');
    const select = group.querySelector('.com-case-select');
    openCasesManagerModal(() => {
        // Обновляем селекты во всех группах
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
    document.getElementById('propsConfirm').addEventListener('click', () => {
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
        
        // Индивидуальные кофры
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
                individualCases.push({ qty, dimensions: dim, weight: isNaN(w) ? 0 : w, maxCases: isNaN(maxCases) ? 0 : maxCases });
            }
        });
        if (individualCases.length > 0) props.individualCases = individualCases;
        else delete props.individualCases;
        
        // Общие кофры (привязка)
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
        showToast('Свойства сохранены');
    });
}

export function initPropsCancelHandler() {
    document.getElementById('propsCancel').addEventListener('click', () => {
        document.getElementById('propsModal').classList.remove('open');
        currentPropsPath = null;
    });
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

// Редактирование кофра (заполнение формы)
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

// Удаление кофра
function deleteCase(id) {
    if (!confirm('Удалить этот кофр?')) return;
    deleteCommonCase(id);
    renderCasesList();
    showToast('Кофр удалён');
}

// Сохранение нового/обновлённого кофра
export function initCasesManagerHandlers() {
    const addBtn = document.getElementById('casesManagerAdd');
    addBtn.addEventListener('click', function() {
        const name = document.getElementById('newCaseName').value.trim();
        const qty = parseInt(document.getElementById('newCaseQty').value);
        const dimensions = document.getElementById('newCaseDim').value.trim();
        const emptyWeight = parseFloat(document.getElementById('newCaseWeight').value);
        const maxWeight = parseFloat(document.getElementById('newCaseMaxWeight').value);
        const maxVolume = parseFloat(document.getElementById('newCaseMaxVolume').value);
        if (!name) { showToast('Введите название кофра'); return; }
        if (isNaN(qty) || qty <= 0) { showToast('Вместимость должна быть положительным числом'); return; }
        const editId = this.dataset.editId;
        if (editId) {
            updateCommonCase(editId, { name, qty, dimensions, emptyWeight: isNaN(emptyWeight)?0:emptyWeight, maxWeight: isNaN(maxWeight)?0:maxWeight, maxVolume: isNaN(maxVolume)?0:maxVolume });
            showToast('Кофр обновлён');
        } else {
            const newCase = {
                id: 'case_' + Date.now(),
                name, qty, dimensions, emptyWeight: isNaN(emptyWeight)?0:emptyWeight, maxWeight: isNaN(maxWeight)?0:maxWeight, maxVolume: isNaN(maxVolume)?0:maxVolume
            };
            addCommonCase(newCase);
            showToast('Кофр добавлен');
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

export function initCasesManagerCloseHandler() {
    document.getElementById('casesManagerClose').addEventListener('click', () => {
        document.getElementById('casesManagerModal').classList.remove('open');
        if (casesManagerCallback) casesManagerCallback();
    });
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
// ИНИЦИАЛИЗАЦИЯ (вызывается из main.js)
// ============================================================
export function initCases() {
    initPropsSaveHandler();
    initPropsCancelHandler();
    initCasesManagerHandlers();
    initCasesManagerCloseHandler();
    initCasesManagerOverlayClose();
    
    // Делаем функции глобально доступными для onclick в HTML (для кнопок "➕ Новый кофр" и т.п.)
    window.addIndividualCaseVariant = addIndividualCaseVariantBtn;
    window.addCommonCaseVariant = addCommonCaseVariantBtn;
    window.addNewCaseFromProps = addNewCaseFromProps;
    window.editCase = editCase;
    window.deleteCase = deleteCase;
}