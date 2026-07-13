// cases.js — Модалки: свойства позиции, общие кофры, матрица привязок, настройка кофров для позиции
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
    moveItem,
    getTruckPresets
} from './data.js';

import {
    esc,
    showToast,
    showPrompt,
    showConfirm
} from './ui.js';

import { CAT_NAMES, STORAGE_KEYS } from './config.js';
import {
    links,
    saveOrderData,
    getCaseMode,
    getCaseOptions,
    getSelectedOption,
    setIndividualCaseValues,
    getIndividualCaseValues,
    getOrderPacking,
    setOrderPacking,
    caseModes,
    orderExclude
} from './order.js';

// ============================================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ============================================================
let currentPropsPath = null;
let variantCounter = 0;
let casesManagerCallback = null;
let currentCaseSettingsPath = null;
let caseSettingsCallback = null;
let matrixZoomLevel = 1;
let openCategories = [];
let scrollToPath = null;
let matrixFullNames = true;

const MATRIX_PRESETS_KEY = STORAGE_KEYS.MATRIX_PRESETS || 'matrix_presets';
const MATRIX_FULLNAMES_KEY = 'matrix_full_names';

// Загрузка состояния полных названий
function loadMatrixFullNames() {
    try {
        const val = localStorage.getItem(MATRIX_FULLNAMES_KEY);
        if (val !== null) {
            matrixFullNames = val === 'true';
        }
    } catch (e) {
        matrixFullNames = true;
    }
}
loadMatrixFullNames();

function saveMatrixFullNames() {
    localStorage.setItem(MATRIX_FULLNAMES_KEY, String(matrixFullNames));
}

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

// ============================================================
// ИНДИВИДУАЛЬНЫЕ КОФРЫ
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
        <button class="btn btn-green" style="width:auto;padding:2px 8px;font-size:12px;margin-top:4px;" onclick="addNewCaseFromProps(this)">+ Новый кофр</button>
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

// ============================================================
// СОХРАНЕНИЕ СВОЙСТВ
// ============================================================
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

// ============================================================
// МОДАЛКА НАСТРОЙКИ КОФРОВ ДЛЯ ПОЗИЦИИ
// ============================================================
export function openCaseSettingsModal(path, callback) {
    currentCaseSettingsPath = path;
    caseSettingsCallback = callback || null;
    const mode = getCaseMode(path);
    const props = getItemProps(path);
    const options = getCaseOptions(path);
    const packing = getOrderPacking(path);
    const commonCases = getCommonCases();
    const individualVals = getIndividualCaseValues(path);
    const isMulti = localStorage.getItem('multi_' + path) === 'true';

    const modal = document.getElementById('caseSettingsModal');
    if (!modal) {
        showToast('Модалка настройки кофров не найдена', 'error');
        return;
    }

    document.getElementById('caseSettingsTitle').textContent = 'Настройка кофров: ' + path.split('|').pop();
    document.getElementById('caseSettingsEnable').checked = mode.enabled;

    const optionsContainer = document.getElementById('caseSettingsOptions');
    optionsContainer.innerHTML = '';
    if (options.length > 0) {
        options.forEach((opt, idx) => {
            const div = document.createElement('div');
            div.className = 'case-option-item' + (mode.selectedOption === idx && !mode.alt ? ' active' : '');
            div.innerHTML = `
                <input type="radio" name="caseOption" value="${idx}" ${mode.selectedOption === idx && !mode.alt ? 'checked' : ''}>
                <span>Вариант ${idx+1}: ${opt.qty} шт, габ: ${opt.dims || 'н/д'}, вес пустого: ${opt.weight || 0} кг</span>
            `;
            div.addEventListener('click', () => {
                const radio = div.querySelector('input[type="radio"]');
                radio.checked = true;
                mode.selectedOption = idx;
                mode.alt = null;
                mode.enabled = true;
                saveOrderData();
                document.querySelectorAll('.case-option-item').forEach(el => el.classList.remove('active'));
                div.classList.add('active');
                showToast('Вариант кофра выбран, режим включён', 'neutral');
                if (caseSettingsCallback) caseSettingsCallback();
            });
            optionsContainer.appendChild(div);
        });
        const multiContainer = document.getElementById('caseSettingsMulti');
        if (options.length > 1) {
            multiContainer.style.display = 'block';
            document.getElementById('caseSettingsMultiCheck').checked = isMulti;
        } else {
            multiContainer.style.display = 'none';
        }
    } else {
        optionsContainer.innerHTML = '<div style="color:var(--text-muted);">Нет индивидуальных кофров для этой позиции</div>';
        document.getElementById('caseSettingsMulti').style.display = 'none';
    }

    const altContainer = document.getElementById('caseSettingsAlt');
    if (mode.alt) {
        altContainer.innerHTML = `
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                <span>Альтернативный: ${mode.alt.qty} шт, габ: ${mode.alt.dims || 'н/д'}, вес: ${mode.alt.weight || 0} кг</span>
                <button class="btn btn-sm" onclick="window.clearAltCase()">Очистить</button>
            </div>
        `;
    } else {
        altContainer.innerHTML = `
            <button class="btn btn-sm" onclick="window.addAltCase()">+ Альтернативный кофр</button>
        `;
    }

    const commonContainer = document.getElementById('caseSettingsCommon');
    if (props.allowCommon) {
        commonContainer.style.display = 'block';
        const list = document.getElementById('caseSettingsCommonList');
        list.innerHTML = '';
        if (packing.length > 0) {
            packing.forEach((p, idx) => {
                const c = commonCases.find(c => c.id === p.caseId);
                const div = document.createElement('div');
                div.className = 'common-case-item';
                div.innerHTML = `
                    <span>${c ? c.name : 'Удалённый кофр'} (кол-во: ${p.qty} шт)</span>
                    <button class="btn btn-sm" onclick="window.removeCommonCasePacking('${path}', ${idx})">✕</button>
                `;
                list.appendChild(div);
            });
        } else {
            list.innerHTML = '<div style="color:var(--text-muted);">Нет привязок к общим кофрам</div>';
        }
        const addBtn = document.getElementById('caseSettingsCommonAdd');
        addBtn.onclick = () => {
            showPrompt('Выберите общий кофр', 'Введите ID кофра (или название для поиска):', '', '', (val) => {
                if (!val) return null;
                const found = commonCases.find(c => c.id === val || c.name.toLowerCase().includes(val.toLowerCase()));
                if (!found) {
                    showToast('Кофр не найден', 'error');
                    return 'Кофр не найден';
                }
                showPrompt('Количество единиц в кофре', 'Введите кол-во:', '1', '', (qty) => {
                    const num = parseInt(qty);
                    if (isNaN(num) || num <= 0) {
                        showToast('Введите положительное число', 'error');
                        return 'Некорректное количество';
                    }
                    const currentPacking = getOrderPacking(path);
                    currentPacking.push({ caseId: found.id, qty: num });
                    setOrderPacking(path, currentPacking);
                    saveOrderData();
                    if (caseSettingsCallback) caseSettingsCallback();
                    openCaseSettingsModal(path, caseSettingsCallback);
                    showToast('Привязка добавлена', 'success');
                    return null;
                });
                return null;
            });
        };
    } else {
        commonContainer.style.display = 'none';
    }

    modal.classList.add('open');

    const saveBtn = document.getElementById('caseSettingsSave');
    saveBtn.onclick = () => {
        const enabled = document.getElementById('caseSettingsEnable').checked;
        mode.enabled = enabled;
        if (!enabled) {
            mode.alt = null;
            localStorage.removeItem('multi_' + path);
            setIndividualCaseValues(path, []);
        } else {
            const selectedRadio = document.querySelector('input[name="caseOption"]:checked');
            if (selectedRadio) {
                const idx = parseInt(selectedRadio.value);
                mode.selectedOption = idx;
                mode.alt = null;
            }
            const multiCheck = document.getElementById('caseSettingsMultiCheck');
            if (multiCheck && multiCheck.checked) {
                localStorage.setItem('multi_' + path, 'true');
                const vals = getIndividualCaseValues(path);
                if (vals.length === 0) {
                    setIndividualCaseValues(path, options.map(() => 0));
                }
            } else {
                localStorage.removeItem('multi_' + path);
                const vals = getIndividualCaseValues(path);
                if (vals.length > 0) {
                    const total = vals.reduce((a,b) => a + b, 0);
                    setIndividualCaseValues(path, [total]);
                }
            }
        }
        saveOrderData();
        modal.classList.remove('open');
        if (caseSettingsCallback) caseSettingsCallback();
        showToast('Настройки кофров сохранены', 'success');
    };

    document.getElementById('caseSettingsCancel').onclick = () => {
        modal.classList.remove('open');
    };

    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.classList.remove('open');
        }
    };
}

window.addAltCase = function() {
    const path = currentCaseSettingsPath;
    if (!path) return;
    showPrompt('Альтернативный кофр', 'Вместимость (шт):', '', '', (qty) => {
        const numQty = parseInt(qty);
        if (isNaN(numQty) || numQty <= 0) {
            showToast('Введите корректную вместимость', 'error');
            return 'Некорректное количество';
        }
        showPrompt('Альтернативный кофр', 'Вес пустого (кг):', '0', '', (weight) => {
            const w = parseFloat(weight) || 0;
            showPrompt('Альтернативный кофр', 'Габариты (Д×Ш×В, см):', '', '', (dims) => {
                const mode = getCaseMode(path);
                mode.alt = { qty: numQty, weight: w, dims: dims || '' };
                mode.enabled = true;
                document.getElementById('caseSettingsEnable').checked = true;
                saveOrderData();
                openCaseSettingsModal(path, caseSettingsCallback);
                showToast('Альтернативный кофр добавлен', 'success');
                return null;
            });
            return null;
        });
        return null;
    });
};

window.clearAltCase = function() {
    const path = currentCaseSettingsPath;
    if (!path) return;
    const mode = getCaseMode(path);
    mode.alt = null;
    saveOrderData();
    openCaseSettingsModal(path, caseSettingsCallback);
    showToast('Альтернативный кофр удалён', 'neutral');
};

window.removeCommonCasePacking = function(path, idx) {
    const packing = getOrderPacking(path);
    packing.splice(idx, 1);
    setOrderPacking(path, packing);
    saveOrderData();
    openCaseSettingsModal(path, caseSettingsCallback);
    showToast('Привязка удалена', 'neutral');
};

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
        html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-bottom:1px solid var(--border-color);gap:10px;">
            <div><strong>${esc(c.name)}</strong><br>
            <span style="font-size:13px;color:var(--text-secondary);">Вместимость: ${c.qty} шт, Габ: ${c.dimensions || 'н/д'}, Вес пустого: ${c.emptyWeight || 0} кг, Макс. вес: ${c.maxWeight || 0} кг, Макс. объём: ${c.maxVolume || 0} м³</span></div>
            <div>
                <button class="btn btn-sm" style="width:auto;padding:2px 8px;font-size:12px;" onclick="window.editCase('${c.id}')">✏️</button>
                <button class="btn btn-sm" style="width:auto;padding:2px 8px;font-size:12px;background:var(--danger);color:white;" onclick="window.deleteCase('${c.id}')">✕</button>
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
    addBtn.textContent = 'Обновить';
    addBtn.dataset.editId = id;
}

async function deleteCase(id) {
    const confirmed = await showConfirm('Удалить этот кофр?');
    if (!confirmed) return;
    deleteCommonCase(id);
    renderCasesList();
    showToast('Кофр удалён', 'neutral');
}

export function initCasesManagerHandlers() {
    const addBtn = document.getElementById('casesManagerAdd');
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
            updateCommonCase(editId, { name, qty, dimensions, emptyWeight: isNaN(emptyWeight)?0:emptyWeight, maxWeight: isNaN(maxWeight)?0:maxWeight, maxVolume: isNaN(maxVolume)?0:maxVolume });
            showToast('Кофр обновлён', 'success');
        } else {
            const newCase = {
                id: 'case_' + Date.now(),
                name, qty, dimensions, emptyWeight: isNaN(emptyWeight)?0:emptyWeight, maxWeight: isNaN(maxWeight)?0:maxWeight, maxVolume: isNaN(maxVolume)?0:maxVolume
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
        this.textContent = '+ Добавить';
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
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            document.getElementById('casesManagerModal').classList.remove('open');
            if (casesManagerCallback) casesManagerCallback();
        }
    });
}

// ============================================================
// МАТРИЦА ПРИВЯЗОК (с пресетами, фиксированной шириной, сохранением категорий, прокруткой)
// ============================================================
function getMatrixPresets() {
    try {
        const raw = localStorage.getItem(MATRIX_PRESETS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function saveMatrixPresets(presets) {
    localStorage.setItem(MATRIX_PRESETS_KEY, JSON.stringify(presets));
}

export function openMatrixModal(sourcePath, showPresets = true, category = null) {
    const modal = document.getElementById('matrixModal');
    if (!modal) {
        showToast('Матрица привязок не найдена', 'error');
        return;
    }
    if (sourcePath) {
        document.getElementById('matrixSearchSource').value = sourcePath.split('|').pop();
        scrollToPath = sourcePath;
        const catName = category || (sourcePath.split('|')[0]);
        if (catName && !openCategories.includes(catName)) {
            openCategories.push(catName);
        }
    } else {
        document.getElementById('matrixSearchSource').value = '';
        scrollToPath = null;
        if (category && !openCategories.includes(category)) {
            openCategories.push(category);
        }
    }
    document.getElementById('matrixSearchTarget').value = '';
    matrixZoomLevel = 1;
    applyMatrixZoom();
    renderMatrix();
    populateMatrixPresetSelect();
    const panel = document.getElementById('matrixPresetPanel');
    if (panel) panel.style.display = showPresets ? 'flex' : 'none';
    modal.classList.add('open');
}

function renderMatrix() {
    const container = document.getElementById('matrixContainer');
    if (!container) return;
    const allPaths = getAllItemPaths();
    if (allPaths.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);">Нет позиций</p>';
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

    // Базовые размеры
    const baseColWidth = 90;
    const baseFontSize = 13;
    const basePadding = 4;
    const baseHeight = 32;

    const colWidth = Math.round(baseColWidth * matrixZoomLevel);
    const fontSize = baseFontSize * matrixZoomLevel;
    const padding = Math.round(basePadding * matrixZoomLevel);
    const height = Math.round(baseHeight * matrixZoomLevel);
    // Ширина первой колонки: при полных названиях — 250px, иначе 120px
    const sourceWidth = matrixFullNames ? 250 : 120;

    let html = `<div class="matrix-table-wrapper"><table class="matrix-table" style="font-size:${fontSize}px; table-layout:fixed; width:100%;">`;
    // Заголовки
    html += `<thead><tr><th class="matrix-header" style="width:${sourceWidth}px; min-width:${sourceWidth}px; max-width:${sourceWidth}px; padding:${padding}px; height:${height}px; font-size:${fontSize}px; position:sticky; left:0; z-index:25;">Источник \\ Цель</th>`;
    allTargets.forEach(target => {
        const displayName = matrixFullNames ? target.name : truncateName(target.name);
        html += `<th class="matrix-header" style="width:${colWidth}px; min-width:${colWidth}px; max-width:${colWidth}px; padding:${padding}px; height:${height}px; font-size:${fontSize}px;" title="${esc(target.name)}">${displayName}</th>`;
    });
    html += '</tr></thead><tbody>';

    const orderKeys = editorData._categoryOrder || Object.keys(editorData.inventory);
    orderKeys.forEach(cat => {
        const items = catMap[cat] || [];
        let filtered = items;
        if (srcFilter) filtered = items.filter(item => item.name.toLowerCase().includes(srcFilter));
        if (filtered.length === 0) return;

        const catId = 'cat_' + cat + '_' + Date.now();
        const isOpen = openCategories.includes(cat);
        const toggleIcon = isOpen ? '▼' : '▶';
        // Строка категории — первая ячейка фиксирована
        html += `<tr class="matrix-category" onclick="window.toggleMatrixCategory('${catId}', '${cat}')">`;
        html += `<td class="matrix-cell matrix-category-toggle" style="width:${sourceWidth}px; min-width:${sourceWidth}px; max-width:${sourceWidth}px; padding:${padding}px; height:${height}px; font-size:${fontSize}px; position:sticky; left:0; z-index:20; background:var(--bg-secondary); border:1px solid var(--matrix-border); text-align:center; cursor:pointer;">`;
        html += `<span class="toggle" id="toggle_${catId}">${toggleIcon}</span>`;
        html += `</td>`;
        // Вторая ячейка — название категории и количество (colspan)
        html += `<td colspan="${allTargets.length}" style="text-align:left;padding:${padding}px 10px;background:var(--bg-secondary);border:1px solid var(--border-color);font-size:${fontSize}px;cursor:pointer;">`;
        html += `${CAT_NAMES[cat]||cat} (${filtered.length})`;
        html += `</td>`;
        html += `</tr>`;

        html += `<tbody id="${catId}" class="matrix-category-items" style="display:${isOpen ? 'table-row-group' : 'none'};">`;
        filtered.forEach((source, idx) => {
            const rowClass = idx % 2 === 0 ? 'row-even' : 'row-odd';
            const rowId = (scrollToPath && source.full === scrollToPath) ? 'id="matrix-scroll-target"' : '';
            html += `<tr class="${rowClass}" ${rowId}>`;
            // Источник — первая ячейка фиксирована, ширина sourceWidth, отображаем полное название всегда (если matrixFullNames включено, то без обрезания)
            const sourceDisplay = matrixFullNames ? source.name : truncateName(source.name);
            html += `<td class="matrix-cell matrix-source" style="width:${sourceWidth}px; min-width:${sourceWidth}px; max-width:${sourceWidth}px; padding:${padding}px; height:${height}px; overflow:hidden; text-overflow:ellipsis; font-size:${fontSize}px; position:sticky; left:0; z-index:15; background:${idx % 2 === 0 ? 'var(--matrix-row-even)' : 'var(--matrix-row-odd)'};" title="${esc(source.name)}">${sourceDisplay}</td>`;
            allTargets.forEach(target => {
                if (source.full === target.full) {
                    html += `<td class="matrix-cell matrix-diagonal" style="width:${colWidth}px; min-width:${colWidth}px; max-width:${colWidth}px; padding:${padding}px; height:${height}px; font-size:${fontSize}px;">—</td>`;
                } else {
                    const allLinks = [];
                    for (let src in links) {
                        const lnk = links[src].find(l => l.target === target.full);
                        if (lnk) {
                            allLinks.push({ source: src, multiplier: lnk.multiplier });
                        }
                    }
                    const currentLinks = allLinks.filter(l => l.source === source.full);
                    const totalMultiplier = currentLinks.reduce((sum, l) => sum + l.multiplier, 0);

                    if (totalMultiplier > 0) {
                        let cellContent = `<span class="matrix-value" style="font-size:${fontSize}px;">${totalMultiplier.toFixed(2)}</span>`;
                        html += `<td class="matrix-cell matrix-value-cell" style="width:${colWidth}px; min-width:${colWidth}px; max-width:${colWidth}px; padding:${padding}px; height:${height}px; overflow:hidden; text-overflow:ellipsis; font-size:${fontSize}px;" data-src="${source.full}" data-target="${target.full}" onclick="window.editMatrixCell(this,'${source.full}','${target.full}')">${cellContent}</td>`;
                    } else {
                        html += `<td class="matrix-cell matrix-empty" style="width:${colWidth}px; min-width:${colWidth}px; max-width:${colWidth}px; padding:${padding}px; height:${height}px; font-size:${fontSize}px;" data-src="${source.full}" data-target="${target.full}" onclick="window.editMatrixCell(this,'${source.full}','${target.full}')">+</td>`;
                    }
                }
            });
            html += '</tr>';
        });
        html += '</tbody>';
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;

    // Переключатель полных названий
    const zoomControls = document.querySelector('.matrix-zoom-controls');
    if (zoomControls && !document.getElementById('matrixNameToggle')) {
        const toggleDiv = document.createElement('div');
        toggleDiv.className = 'matrix-name-toggle';
        toggleDiv.id = 'matrixNameToggle';
        toggleDiv.innerHTML = `
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                <input type="checkbox" ${matrixFullNames ? 'checked' : ''}> Полные названия
            </label>
        `;
        toggleDiv.querySelector('input').addEventListener('change', function() {
            matrixFullNames = this.checked;
            saveMatrixFullNames();
            renderMatrix();
        });
        zoomControls.after(toggleDiv);
    } else {
        const toggleInput = document.querySelector('#matrixNameToggle input');
        if (toggleInput) toggleInput.checked = matrixFullNames;
    }

    // Прокрутка к целевой строке
    if (scrollToPath) {
        setTimeout(() => {
            const targetRow = document.getElementById('matrix-scroll-target');
            if (targetRow) {
                targetRow.scrollIntoView({ block: 'center', behavior: 'smooth' });
                targetRow.style.background = 'var(--bg-active)';
                setTimeout(() => {
                    targetRow.style.background = '';
                }, 2000);
                scrollToPath = null;
            }
        }, 100);
    }
}

function applyMatrixZoom() {
    document.querySelectorAll('.zoom-btn').forEach(btn => {
        btn.classList.toggle('active', parseFloat(btn.dataset.zoom) === matrixZoomLevel);
    });
    const label = document.getElementById('matrixZoomLevelLabel');
    if (label) label.textContent = Math.round(matrixZoomLevel * 100) + '%';
    renderMatrix();
}

function setupZoomButtons() {
    document.querySelectorAll('.zoom-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const zoom = parseFloat(this.dataset.zoom);
            if (!isNaN(zoom) && zoom !== matrixZoomLevel) {
                matrixZoomLevel = zoom;
                applyMatrixZoom();
            }
        });
    });
}

function truncateName(name, maxLen = 10) {
    if (name.length <= maxLen) return name;
    const parts = name.split(' ');
    if (parts.length <= 2) {
        return name.substring(0, maxLen-3) + '...';
    }
    const first = parts[0];
    const last = parts[parts.length-1];
    return first + ' ... ' + last;
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

window.toggleMatrixCategory = function(catId, catName) {
    const tbody = document.getElementById(catId);
    const toggle = document.getElementById('toggle_' + catId);
    if (!tbody || !toggle) return;
    const isOpen = tbody.style.display !== 'none';
    if (isOpen) {
        tbody.style.display = 'none';
        toggle.textContent = '▶';
        const idx = openCategories.indexOf(catName);
        if (idx !== -1) openCategories.splice(idx, 1);
    } else {
        tbody.style.display = 'table-row-group';
        toggle.textContent = '▼';
        if (!openCategories.includes(catName)) {
            openCategories.push(catName);
        }
    }
};

window.editMatrixCell = async function(td, src, target) {
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
};

function updateLinkCount() {
    let count = 0;
    for (let src in links) count += links[src].length;
    const el = document.getElementById('linkCount');
    if (el) el.textContent = `(${count} активных)`;
}

// ============================================================
// ПРЕСЕТЫ МАТРИЦЫ
// ============================================================
function populateMatrixPresetSelect() {
    const select = document.getElementById('matrixPresetSelect');
    if (!select) return;
    const presets = getMatrixPresets();
    select.innerHTML = '<option value="">— Выберите пресет —</option>';
    presets.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        select.appendChild(opt);
    });
}

async function saveMatrixPreset() {
    const name = await showPrompt('Сохранить пресет матрицы', 'Введите имя пресета:', '', '');
    if (!name || !name.trim()) return;
    const presets = getMatrixPresets();
    const existing = presets.find(p => p.name === name.trim());
    if (existing) {
        const overwrite = await showConfirm(`Пресет "${name.trim()}" уже существует. Перезаписать?`);
        if (!overwrite) return;
        const idx = presets.indexOf(existing);
        presets.splice(idx, 1);
    }
    const snapshot = {};
    for (let src in links) {
        snapshot[src] = links[src].map(l => ({ ...l }));
    }
    presets.push({ name: name.trim(), links: snapshot });
    saveMatrixPresets(presets);
    populateMatrixPresetSelect();
    showToast('Пресет сохранён', 'success');
}

async function loadMatrixPreset(overlay = true) {
    const select = document.getElementById('matrixPresetSelect');
    const name = select.value;
    if (!name) {
        showToast('Выберите пресет', 'warning');
        return;
    }
    const presets = getMatrixPresets();
    const preset = presets.find(p => p.name === name);
    if (!preset) {
        showToast('Пресет не найден', 'error');
        return;
    }
    if (!overlay) {
        for (let key in links) delete links[key];
    }
    for (let src in preset.links) {
        preset.links[src].forEach(pl => {
            if (!links[src]) links[src] = [];
            const existing = links[src].find(l => l.target === pl.target);
            if (existing) {
                existing.multiplier += pl.multiplier;
            } else {
                links[src].push({ target: pl.target, multiplier: pl.multiplier });
            }
        });
    }
    saveOrderData();
    renderMatrix();
    updateLinkCount();
    showToast(`Пресет "${name}" загружен ${overlay ? '(наложение)' : '(замена)'}`, 'success');
}

async function deleteMatrixPreset() {
    const select = document.getElementById('matrixPresetSelect');
    const name = select.value;
    if (!name) {
        showToast('Выберите пресет', 'warning');
        return;
    }
    const confirmed = await showConfirm(`Удалить пресет "${name}"?`);
    if (!confirmed) return;
    let presets = getMatrixPresets();
    presets = presets.filter(p => p.name !== name);
    saveMatrixPresets(presets);
    populateMatrixPresetSelect();
    showToast('Пресет удалён', 'neutral');
}

function exportMatrixPresets() {
    const presets = getMatrixPresets();
    if (presets.length === 0) {
        showToast('Нет пресетов для экспорта', 'warning');
        return;
    }
    const blob = new Blob([JSON.stringify(presets, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'matrix_presets.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Пресеты экспортированы', 'success');
}

function importMatrixPresets(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (!Array.isArray(data)) throw new Error('Неверный формат: ожидается массив');
            data.forEach(p => {
                if (!p.name || typeof p.name !== 'string') throw new Error('У пресета отсутствует имя');
                if (!p.links || typeof p.links !== 'object') throw new Error('У пресета отсутствуют привязки');
            });
            let presets = getMatrixPresets();
            data.forEach(newP => {
                const idx = presets.findIndex(p => p.name === newP.name);
                if (idx !== -1) presets[idx] = newP;
                else presets.push(newP);
            });
            saveMatrixPresets(presets);
            populateMatrixPresetSelect();
            showToast('Пресеты импортированы', 'success');
        } catch(err) {
            showToast('Ошибка импорта: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ ОБРАБОТЧИКОВ МАТРИЦЫ
// ============================================================
export function initMatrixHandlers() {
    const closeBtn = document.getElementById('matrixClose');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.getElementById('matrixModal').classList.remove('open');
            openCategories = [];
            scrollToPath = null;
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
            showToast('Все привязки удалены', 'neutral');
        });
    }
    const srcInput = document.getElementById('matrixSearchSource');
    if (srcInput) srcInput.addEventListener('input', renderMatrix);
    const tgtInput = document.getElementById('matrixSearchTarget');
    if (tgtInput) tgtInput.addEventListener('input', renderMatrix);

    setupZoomButtons();

    const savePresetBtn = document.getElementById('matrixSavePreset');
    if (savePresetBtn) savePresetBtn.addEventListener('click', saveMatrixPreset);

    const loadPresetBtn = document.getElementById('matrixLoadPreset');
    if (loadPresetBtn) {
        loadPresetBtn.addEventListener('click', async () => {
            const overlay = document.getElementById('matrixOverlayToggle')?.checked || false;
            await loadMatrixPreset(overlay);
        });
    }

    const deletePresetBtn = document.getElementById('matrixDeletePreset');
    if (deletePresetBtn) deletePresetBtn.addEventListener('click', deleteMatrixPreset);

    const exportPresetsBtn = document.getElementById('matrixExportPresets');
    if (exportPresetsBtn) exportPresetsBtn.addEventListener('click', exportMatrixPresets);

    const importPresetsBtn = document.getElementById('matrixImportPresets');
    const fileInput = document.getElementById('matrixPresetFileInput');
    if (importPresetsBtn && fileInput) {
        importPresetsBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', function(e) {
            if (this.files[0]) {
                importMatrixPresets(this.files[0]);
                this.value = '';
            }
        });
    }

    const modal = document.getElementById('matrixModal');
    if (modal) {
        const observer = new MutationObserver(() => {
            if (modal.classList.contains('open')) {
                populateMatrixPresetSelect();
            }
        });
        observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
    }
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ
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