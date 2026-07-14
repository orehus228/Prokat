// modules/cases/props-modal.js — Модалка свойств позиции
import {
    getItemProps,
    setItemProps,
    getCommonCases,
    saveEditorData
} from '../../data.js';

import {
    showToast,
    showPrompt,
    showConfirm
} from '../../ui.js';

import { openCasesManagerModal } from './common-cases-manager.js';

let currentPropsPath = null;
let variantCounter = 0;

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
    let selectHtml = `<select class="com-case-select" data-id="${id}" style="width:100%;padding:6px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:6px;color:var(--text-primary);margin-bottom:6px;">`;
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
        <button class="btn btn-green" style="width:auto;padding:2px 8px;font-size:12px;margin-top:4px;" onclick="window.addNewCaseFromProps(this)">+ Новый кофр</button>
    `;
    container.appendChild(group);
}

export function addCommonCaseVariantBtn() {
    addCommonCaseVariant();
}

export function addNewCaseFromProps(btn) {
    const group = btn.closest('.case-variant-group');
    openCasesManagerModal(() => {
        document.querySelectorAll('.com-case-select').forEach(sel => {
            const currentVal = sel.value;
            const commonCases = getCommonCases();
            sel.innerHTML = '<option value="">— Выберите общий кофр —</option>';
            commonCases.forEach(c => {
                const selected = (c.id === currentVal) ? 'selected' : '';
                sel.innerHTML += `<option value="${c.id}" ${selected}>${c.name} (вместимость: ${c.qty} шт, макс. вес: ${c.maxWeight || 0} кг)</option>`;
            });
        });
        showToast('Список общих кофров обновлён', 'neutral');
    });
}

export function initPropsSaveHandler() {
    const confirmBtn = document.getElementById('propsConfirm');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
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