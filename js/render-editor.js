// render-editor.js — Отрисовка редактора склада
import {
    editorData,
    getStock,
    setStock,
    getSpec,
    setSpec,
    getItemProps,
    setItemProps,
    getCommonCases,
    saveEditorData,
    cleanupInventory,
    convertOldItemProps
} from './data.js';

import {
    esc,
    showToast,
    showModalEditor
} from './ui.js';

import { openPropsModalEditor } from './cases.js';
import { CAT_NAMES } from './config.js';

// ============================================================
// СОСТОЯНИЕ РЕДАКТОРА
// ============================================================
let currentCategory = 'sound';

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================
function getStockKey(catKey, subKey, itemName) {
    if (subKey) return catKey + '|' + subKey + '|' + itemName;
    return catKey + '|' + itemName;
}

function moveItemWithinGroup(catKey, subKey, itemName, direction) {
    let targetArray = subKey ? editorData.inventory[catKey][subKey] : editorData.inventory[catKey];
    if (!Array.isArray(targetArray)) { showToast('Ошибка: не массив'); return; }
    const idx = targetArray.indexOf(itemName);
    if (idx === -1) { showToast('Позиция не найдена'); return; }
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= targetArray.length) { showToast('Край списка'); return; }
    [targetArray[idx], targetArray[newIdx]] = [targetArray[newIdx], targetArray[idx]];
    saveEditorData();
    renderEditorCategory(catKey);
    showToast('Позиция перемещена');
}

// ============================================================
// ОТРИСОВКА ВКЛАДОК
// ============================================================
function renderEditorTabs() {
    const container = document.getElementById('editorTabs');
    container.innerHTML = '';
    const order = editorData._categoryOrder || Object.keys(editorData.inventory);
    order.forEach(key => {
        if (!editorData.inventory[key]) return;
        const tab = document.createElement('div');
        tab.className = 'category-tab' + (key === currentCategory ? ' active' : '');
        const label = editorData.catNames[key] || key;
        const nameSpan = document.createElement('span');
        nameSpan.textContent = label;
        tab.appendChild(nameSpan);
        const actions = document.createElement('div');
        actions.className = 'tab-actions';
        const upBtn = document.createElement('button');
        upBtn.textContent = '▲';
        upBtn.addEventListener('click', (e) => { e.stopPropagation(); moveCategory(key, -1); });
        actions.appendChild(upBtn);
        const downBtn = document.createElement('button');
        downBtn.textContent = '▼';
        downBtn.addEventListener('click', (e) => { e.stopPropagation(); moveCategory(key, 1); });
        actions.appendChild(downBtn);
        const renameBtn = document.createElement('button');
        renameBtn.textContent = '✏️';
        renameBtn.addEventListener('click', (e) => { e.stopPropagation(); renameCategory(key); });
        actions.appendChild(renameBtn);
        const delBtn = document.createElement('button');
        delBtn.textContent = '✕';
        delBtn.className = 'danger';
        delBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteCategory(key); });
        actions.appendChild(delBtn);
        tab.appendChild(actions);
        tab.dataset.cat = key;
        tab.addEventListener('click', (e) => {
            if (!e.target.closest('button')) {
                currentCategory = key;
                renderEditorTabs();
                renderEditorCategory(key);
            }
        });
        container.appendChild(tab);
    });
}

// ============================================================
// ФУНКЦИИ УПРАВЛЕНИЯ КАТЕГОРИЯМИ
// ============================================================
function moveCategory(key, dir) {
    const order = editorData._categoryOrder;
    const idx = order.indexOf(key);
    if (idx === -1) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= order.length) return;
    [order[idx], order[newIdx]] = [order[newIdx], order[idx]];
    saveEditorData();
    renderEditorAll();
}

function renameCategory(key) {
    const newName = prompt('Новое название:', key);
    if (!newName || newName === key) return;
    if (editorData.inventory[newName]) { showToast('Уже существует'); return; }
    editorData.inventory[newName] = editorData.inventory[key];
    delete editorData.inventory[key];
    const idx = editorData._categoryOrder.indexOf(key);
    if (idx !== -1) editorData._categoryOrder[idx] = newName;
    const oldPrefix = key + '|';
    const newPrefix = newName + '|';
    for (let k in editorData.stock) {
        if (k.startsWith(oldPrefix)) {
            editorData.stock[k.replace(oldPrefix, newPrefix)] = editorData.stock[k];
            delete editorData.stock[k];
        }
    }
    for (let k in editorData.specs) {
        if (k.startsWith(oldPrefix)) {
            editorData.specs[k.replace(oldPrefix, newPrefix)] = editorData.specs[k];
            delete editorData.specs[k];
        }
    }
    for (let k in editorData.itemProps) {
        if (k.startsWith(oldPrefix)) {
            editorData.itemProps[k.replace(oldPrefix, newPrefix)] = editorData.itemProps[k];
            delete editorData.itemProps[k];
        }
    }
    if (currentCategory === key) currentCategory = newName;
    saveEditorData();
    renderEditorAll();
}

function deleteCategory(key) {
    if (!confirm(`Удалить категорию "${key}"?`)) return;
    delete editorData.inventory[key];
    const idx = editorData._categoryOrder.indexOf(key);
    if (idx !== -1) editorData._categoryOrder.splice(idx, 1);
    const prefix = key + '|';
    for (let k in editorData.stock) if (k.startsWith(prefix)) delete editorData.stock[k];
    for (let k in editorData.specs) if (k.startsWith(prefix)) delete editorData.specs[k];
    for (let k in editorData.itemProps) if (k.startsWith(prefix)) delete editorData.itemProps[k];
    if (currentCategory === key) {
        currentCategory = editorData._categoryOrder.length > 0 ? editorData._categoryOrder[0] : null;
    }
    saveEditorData();
    renderEditorAll();
}

// ============================================================
// ОТРИСОВКА СОДЕРЖИМОГО КАТЕГОРИИ
// ============================================================
function renderEditorCategory(catKey) {
    const container = document.getElementById('editorContents');
    container.innerHTML = '';
    const catData = editorData.inventory[catKey];
    if (!catData) return;

    if (Array.isArray(catData)) {
        // Плоский список
        const wrapper = document.createElement('div');
        wrapper.className = 'category-content active';
        const listDiv = document.createElement('div');
        listDiv.className = 'subgroup';
        listDiv.style.border = 'none';
        const header = document.createElement('div');
        header.className = 'subgroup-header';
        header.innerHTML = `<span class="name">${editorData.catNames[catKey] || catKey}</span>`;
        const addBtn = document.createElement('button');
        addBtn.className = 'add-item';
        addBtn.textContent = '+ Добавить позицию';
        addBtn.addEventListener('click', () => {
            showModalEditor('Введите название новой позиции', (val) => {
                if (val && val.trim()) {
                    catData.push(val.trim());
                    saveEditorData();
                    renderEditorCategory(catKey);
                    showToast('Позиция добавлена');
                }
            });
        });
        listDiv.appendChild(header);
        const itemsDiv = document.createElement('div');
        itemsDiv.className = 'items-list';
        if (catData.length === 0) itemsDiv.innerHTML = '<div class="empty-message">Нет позиций</div>';
        else {
            catData.forEach((item, idx) => {
                const row = createItemRowEditor(catKey, null, item);
                itemsDiv.appendChild(row);
            });
        }
        listDiv.appendChild(itemsDiv);
        listDiv.appendChild(addBtn);
        wrapper.appendChild(listDiv);
        container.appendChild(wrapper);
        return;
    }

    // Категория с подгруппами
    const wrapper = document.createElement('div');
    wrapper.className = 'category-content active';
    const keys = Object.keys(catData).filter(k => !k.startsWith('_'));
    let orderKeys = catData._subOrder || [];
    if (orderKeys.length === 0) {
        orderKeys = keys.sort();
        catData._subOrder = orderKeys;
        saveEditorData();
    } else {
        keys.forEach(k => {
            if (!orderKeys.includes(k)) orderKeys.push(k);
        });
        catData._subOrder = orderKeys;
        saveEditorData();
    }

    orderKeys.forEach(subKey => {
        const subItems = catData[subKey];
        if (!Array.isArray(subItems)) return;
        const subgroup = document.createElement('div');
        subgroup.className = 'subgroup';
        const header = document.createElement('div');
        header.className = 'subgroup-header';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'name';
        nameSpan.textContent = subKey;
        nameSpan.title = 'Двойной клик для переименования';
        nameSpan.addEventListener('dblclick', (e) => { e.stopPropagation(); renameSubgroup(catKey, subKey); });
        header.appendChild(nameSpan);
        const controls = document.createElement('div');
        controls.className = 'controls';
        const renameBtn = document.createElement('button');
        renameBtn.textContent = '✏️';
        renameBtn.addEventListener('click', (e) => { e.stopPropagation(); renameSubgroup(catKey, subKey); });
        controls.appendChild(renameBtn);
        const upBtn = document.createElement('button');
        upBtn.textContent = '▲';
        upBtn.addEventListener('click', (e) => { e.stopPropagation(); moveSubgroup(catKey, subKey, -1); });
        controls.appendChild(upBtn);
        const downBtn = document.createElement('button');
        downBtn.textContent = '▼';
        downBtn.addEventListener('click', (e) => { e.stopPropagation(); moveSubgroup(catKey, subKey, 1); });
        controls.appendChild(downBtn);
        const delBtn = document.createElement('button');
        delBtn.textContent = '✕';
        delBtn.className = 'danger';
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`Удалить подгруппу "${subKey}"?`)) {
                delete catData[subKey];
                const idx = catData._subOrder.indexOf(subKey);
                if (idx !== -1) catData._subOrder.splice(idx, 1);
                const prefix = catKey + '|' + subKey + '|';
                for (let k in editorData.stock) if (k.startsWith(prefix)) delete editorData.stock[k];
                for (let k in editorData.specs) if (k.startsWith(prefix)) delete editorData.specs[k];
                for (let k in editorData.itemProps) if (k.startsWith(prefix)) delete editorData.itemProps[k];
                saveEditorData();
                renderEditorCategory(catKey);
                showToast('Подгруппа удалена');
            }
        });
        controls.appendChild(delBtn);
        header.appendChild(controls);
        subgroup.appendChild(header);
        const itemsDiv = document.createElement('div');
        itemsDiv.className = 'items-list';
        if (subItems.length === 0) itemsDiv.innerHTML = '<div class="empty-message">Нет позиций</div>';
        else {
            subItems.forEach((item) => {
                const row = createItemRowEditor(catKey, subKey, item);
                itemsDiv.appendChild(row);
            });
        }
        subgroup.appendChild(itemsDiv);
        const addBtn = document.createElement('button');
        addBtn.className = 'add-item';
        addBtn.textContent = '+ Добавить позицию';
        addBtn.addEventListener('click', () => {
            showModalEditor('Введите название новой позиции', (val) => {
                if (val && val.trim()) {
                    subItems.push(val.trim());
                    saveEditorData();
                    renderEditorCategory(catKey);
                    showToast('Позиция добавлена');
                }
            });
        });
        subgroup.appendChild(addBtn);
        wrapper.appendChild(subgroup);
    });

    const addSubBtn = document.createElement('button');
    addSubBtn.className = 'add-subgroup';
    addSubBtn.textContent = '+ Добавить подгруппу';
    addSubBtn.addEventListener('click', () => {
        showModalEditor('Введите название новой подгруппы', (val) => {
            if (val && val.trim()) {
                const newKey = val.trim();
                if (catData[newKey]) { showToast('Уже существует'); return; }
                catData[newKey] = [];
                if (!catData._subOrder) catData._subOrder = [];
                catData._subOrder.push(newKey);
                saveEditorData();
                renderEditorCategory(catKey);
                showToast('Подгруппа добавлена');
            }
        });
    });
    wrapper.appendChild(addSubBtn);
    container.appendChild(wrapper);
}

// ============================================================
// СОЗДАНИЕ СТРОКИ ПОЗИЦИИ
// ============================================================
function createItemRowEditor(catKey, subKey, itemName) {
    const row = document.createElement('div');
    row.className = 'item-row';
    const mainLine = document.createElement('div');
    mainLine.className = 'main-line';
    const nameDiv = document.createElement('span');
    nameDiv.className = 'name';
    nameDiv.textContent = itemName;
    nameDiv.title = 'Двойной клик для переименования';
    nameDiv.addEventListener('dblclick', () => { renameItem(catKey, subKey, itemName); });
    mainLine.appendChild(nameDiv);

    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.className = 'qty';
    qtyInput.value = getStock(catKey, subKey, itemName);
    qtyInput.addEventListener('change', () => {
        let val = parseInt(qtyInput.value, 10);
        if (isNaN(val) || val < 0) val = 0;
        qtyInput.value = val;
        setStock(catKey, subKey, itemName, val);
    });
    mainLine.appendChild(qtyInput);

    const specInput = document.createElement('input');
    specInput.type = 'text';
    specInput.className = 'spec';
    specInput.placeholder = 'Комментарий...';
    specInput.value = getSpec(catKey, subKey, itemName);
    specInput.addEventListener('change', () => {
        setSpec(catKey, subKey, itemName, specInput.value);
    });
    mainLine.appendChild(specInput);

    const actions = document.createElement('div');
    actions.className = 'actions';
    const upBtn = document.createElement('button');
    upBtn.textContent = '⬆';
    upBtn.className = 'move';
    upBtn.addEventListener('click', () => { moveItemWithinGroup(catKey, subKey, itemName, -1); });
    actions.appendChild(upBtn);
    const downBtn = document.createElement('button');
    downBtn.textContent = '⬇';
    downBtn.className = 'move';
    downBtn.addEventListener('click', () => { moveItemWithinGroup(catKey, subKey, itemName, 1); });
    actions.appendChild(downBtn);
    const propsBtn = document.createElement('button');
    propsBtn.className = 'props';
    propsBtn.textContent = '📦';
    propsBtn.title = 'Свойства';
    propsBtn.addEventListener('click', () => {
        openPropsModalEditor(catKey, subKey, itemName, () => {
            renderEditorCategory(catKey);
        });
    });
    actions.appendChild(propsBtn);
    const moveBtn = document.createElement('button');
    moveBtn.className = 'move';
    moveBtn.textContent = '↗';
    moveBtn.title = 'Переместить';
    moveBtn.addEventListener('click', () => { moveItem(catKey, subKey, itemName); });
    actions.appendChild(moveBtn);
    const renameBtn = document.createElement('button');
    renameBtn.textContent = '✏️';
    renameBtn.addEventListener('click', () => { renameItem(catKey, subKey, itemName); });
    actions.appendChild(renameBtn);
    const delBtn = document.createElement('button');
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => {
        if (confirm(`Удалить позицию "${itemName}"?`)) {
            let targetArray = subKey ? editorData.inventory[catKey][subKey] : editorData.inventory[catKey];
            const idx = targetArray.indexOf(itemName);
            if (idx !== -1) {
                targetArray.splice(idx, 1);
                const key = getStockKey(catKey, subKey, itemName);
                delete editorData.stock[key];
                delete editorData.specs[key];
                delete editorData.itemProps[key];
                saveEditorData();
                renderEditorCategory(catKey);
                showToast('Позиция удалена');
            }
        }
    });
    actions.appendChild(delBtn);
    mainLine.appendChild(actions);
    row.appendChild(mainLine);

    // Информация о свойствах
    const props = getItemProps(catKey, subKey, itemName);
    const infoDiv = document.createElement('div');
    infoDiv.className = 'props-info';
    const weight = props.weight ? props.weight + ' кг' : '<span class="na">n/a</span>';
    const dims = props.dimensions || '<span class="na">n/a</span>';
    const cases = (props.individualCases || []).length;
    const common = (props.commonCases || []).length;
    infoDiv.innerHTML = `
        <span>⚖️ ${weight}</span>
        <span>📐 ${dims}</span>
        <span>🧩 Инд. кофры: ${cases}</span>
        <span>📦 Общ. кофры: ${common}</span>
        <span>Разрешены общие кофры: ${props.allowCommon ? '✅' : '❌'}</span>
    `;
    row.appendChild(infoDiv);
    return row;
}

// ============================================================
// ФУНКЦИИ РЕДАКТИРОВАНИЯ (перемещение, переименование)
// ============================================================
function renameItem(catKey, subKey, oldName) {
    const newName = prompt('Новое название:', oldName);
    if (!newName || newName === oldName) return;
    let targetArray = subKey ? editorData.inventory[catKey][subKey] : editorData.inventory[catKey];
    const idx = targetArray.indexOf(oldName);
    if (idx === -1) return;
    if (targetArray.includes(newName)) { showToast('Такое имя уже существует'); return; }
    targetArray[idx] = newName;
    const oldKey = getStockKey(catKey, subKey, oldName);
    const newKey = getStockKey(catKey, subKey, newName);
    if (editorData.stock[oldKey] !== undefined) {
        editorData.stock[newKey] = editorData.stock[oldKey];
        delete editorData.stock[oldKey];
    }
    if (editorData.specs[oldKey] !== undefined) {
        editorData.specs[newKey] = editorData.specs[oldKey];
        delete editorData.specs[oldKey];
    }
    if (editorData.itemProps[oldKey] !== undefined) {
        editorData.itemProps[newKey] = editorData.itemProps[oldKey];
        delete editorData.itemProps[oldKey];
    }
    saveEditorData();
    renderEditorCategory(catKey);
    showToast('Переименовано');
}

function moveItem(catKey, subKey, itemName) {
    // Простой диалог для выбора новой категории/подгруппы
    const targetPath = prompt('Введите путь (категория|подгруппа) или "категория" для корневого списка:');
    if (!targetPath) return;
    const parts = targetPath.split('|');
    let targetCat = parts[0];
    let targetSub = parts[1] || null;
    if (!editorData.inventory[targetCat]) { showToast('Категория не существует'); return; }
    if (targetSub && !editorData.inventory[targetCat][targetSub]) { showToast('Подгруппа не существует'); return; }
    if (!targetSub && typeof editorData.inventory[targetCat] === 'object' && !Array.isArray(editorData.inventory[targetCat])) {
        showToast('Укажите подгруппу для этой категории');
        return;
    }
    let sourceArray = subKey ? editorData.inventory[catKey][subKey] : editorData.inventory[catKey];
    if (!Array.isArray(sourceArray)) { showToast('Ошибка источника'); return; }
    const idx = sourceArray.indexOf(itemName);
    if (idx === -1) { showToast('Позиция не найдена'); return; }
    sourceArray.splice(idx, 1);
    let targetArray = targetSub ? editorData.inventory[targetCat][targetSub] : editorData.inventory[targetCat];
    if (!Array.isArray(targetArray)) { showToast('Ошибка цели'); return; }
    if (targetArray.includes(itemName)) { sourceArray.splice(idx, 0, itemName); showToast('Цель уже содержит этот элемент'); return; }
    targetArray.push(itemName);
    const oldKey = getStockKey(catKey, subKey, itemName);
    const newKey = getStockKey(targetCat, targetSub, itemName);
    if (editorData.stock[oldKey] !== undefined) {
        editorData.stock[newKey] = editorData.stock[oldKey];
        delete editorData.stock[oldKey];
    }
    if (editorData.specs[oldKey] !== undefined) {
        editorData.specs[newKey] = editorData.specs[oldKey];
        delete editorData.specs[oldKey];
    }
    if (editorData.itemProps[oldKey] !== undefined) {
        editorData.itemProps[newKey] = editorData.itemProps[oldKey];
        delete editorData.itemProps[oldKey];
    }
    saveEditorData();
    renderEditorAll();
    showToast(`"${itemName}" перемещён`);
}

function renameSubgroup(catKey, oldKey) {
    const newKey = prompt('Новое название подгруппы:', oldKey);
    if (!newKey || newKey === oldKey) return;
    const catData = editorData.inventory[catKey];
    if (!catData) return;
    if (catData[newKey]) { showToast('Уже существует'); return; }
    catData[newKey] = catData[oldKey];
    delete catData[oldKey];
    const order = catData._subOrder;
    if (order) {
        const idx = order.indexOf(oldKey);
        if (idx !== -1) order[idx] = newKey;
    }
    const oldPrefix = catKey + '|' + oldKey + '|';
    const newPrefix = catKey + '|' + newKey + '|';
    for (let k in editorData.stock) {
        if (k.startsWith(oldPrefix)) {
            editorData.stock[k.replace(oldPrefix, newPrefix)] = editorData.stock[k];
            delete editorData.stock[k];
        }
    }
    for (let k in editorData.specs) {
        if (k.startsWith(oldPrefix)) {
            editorData.specs[k.replace(oldPrefix, newPrefix)] = editorData.specs[k];
            delete editorData.specs[k];
        }
    }
    for (let k in editorData.itemProps) {
        if (k.startsWith(oldPrefix)) {
            editorData.itemProps[k.replace(oldPrefix, newPrefix)] = editorData.itemProps[k];
            delete editorData.itemProps[k];
        }
    }
    saveEditorData();
    renderEditorCategory(catKey);
    showToast('Подгруппа переименована');
}

function moveSubgroup(catKey, subKey, dir) {
    const catData = editorData.inventory[catKey];
    if (!catData || typeof catData !== 'object' || Array.isArray(catData)) return;
    const order = catData._subOrder;
    if (!order) return;
    const idx = order.indexOf(subKey);
    if (idx === -1) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= order.length) return;
    [order[idx], order[newIdx]] = [order[newIdx], order[idx]];
    saveEditorData();
    renderEditorCategory(catKey);
}

// ============================================================
// ДОБАВЛЕНИЕ НОВОЙ КАТЕГОРИИ
// ============================================================
export function addCategory() {
    const input = document.getElementById('newCategoryName');
    const name = input.value.trim();
    if (!name) { showToast('Введите название'); return; }
    if (editorData.inventory[name]) { showToast('Уже существует'); return; }
    editorData.inventory[name] = {};
    if (!editorData._categoryOrder) editorData._categoryOrder = [];
    editorData._categoryOrder.push(name);
    editorData.inventory[name]._subOrder = [];
    if (!editorData.catNames[name]) editorData.catNames[name] = name;
    saveEditorData();
    renderEditorAll();
    input.value = '';
    showToast('Категория добавлена');
}

// ============================================================
// ОБНОВЛЕНИЕ ВСЕГО ИНТЕРФЕЙСА
// ============================================================
export function renderEditorAll() {
    renderEditorTabs();
    renderEditorCategory(currentCategory);
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ ОБРАБОТЧИКОВ КНОПОК ПАНЕЛИ ИНСТРУМЕНТОВ
// ============================================================
export function initRenderHandlers() {
    // Экспорт
    document.getElementById('exportBtn').addEventListener('click', () => {
        const exportData = {
            ...editorData,
            inventory: JSON.parse(JSON.stringify(editorData.inventory)),
            stock: JSON.parse(JSON.stringify(editorData.stock)),
            specs: JSON.parse(JSON.stringify(editorData.specs)),
            itemProps: JSON.parse(JSON.stringify(editorData.itemProps))
        };
        cleanupInventory(exportData.inventory, exportData.stock, exportData.specs, exportData.itemProps);
        const blob = new Blob([JSON.stringify(exportData, null, 2)], {type:'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'inventory_editor_data.json';
        a.click();
        URL.revokeObjectURL(url);
        showToast('JSON экспортирован');
    });

    // Импорт
    document.getElementById('importBtn').addEventListener('click', () => {
        document.getElementById('importFile').click();
    });
    document.getElementById('importFile').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(ev) {
            try {
                let imported = JSON.parse(ev.target.result);
                if (imported.itemProps) imported.itemProps = convertOldItemProps(imported.itemProps);
                if (!imported.inventory) imported.inventory = JSON.parse(JSON.stringify(DEFAULT_INVENTORY));
                if (!imported.stock) imported.stock = JSON.parse(JSON.stringify(DEFAULT_STOCK));
                if (!imported.specs) imported.specs = JSON.parse(JSON.stringify(DEFAULT_SPECS));
                if (!imported.catNames) imported.catNames = JSON.parse(JSON.stringify(CAT_NAMES));
                if (!imported._categoryOrder) imported._categoryOrder = Object.keys(imported.inventory);
                if (!imported.commonCases) imported.commonCases = [];
                for (let cat in imported.inventory) {
                    const catData = imported.inventory[cat];
                    if (typeof catData === 'object' && !Array.isArray(catData)) {
                        if (catData._subOrder) {
                            catData._subOrder = catData._subOrder.filter(k => k !== '_subOrder' && catData[k] !== undefined);
                        } else {
                            catData._subOrder = Object.keys(catData).filter(k => k !== '_subOrder');
                        }
                    }
                }
                cleanupInventory(imported.inventory, imported.stock, imported.specs, imported.itemProps);
                editorData = imported;
                saveEditorData();
                renderEditorAll();
                showToast('✅ Импорт выполнен');
            } catch(err) {
                showToast('Ошибка: ' + err.message);
            }
        };
        reader.readAsText(file);
        this.value = '';
    });

    // Сброс
    document.getElementById('resetBtn').addEventListener('click', () => {
        if (confirm('Сбросить все изменения?')) {
            loadEditorData();
            renderEditorAll();
            showToast('Сброшено');
        }
    });

    // Общие кофры
    document.getElementById('manageCasesBtn').addEventListener('click', () => {
        // Открываем менеджер общих кофров (из cases.js)
        import('./cases.js').then(module => {
            module.openCasesManagerModal(() => {
                renderEditorAll();
            });
        });
    });
}