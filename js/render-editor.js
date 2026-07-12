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
    convertOldItemProps,
    renameCategory,
    renameSubgroup,
    renameItem,
    moveItem,
    getStockKey,
    resetAllData
} from './data.js';

import {
    esc,
    showToast,
    showPrompt,
    showConfirm
} from './ui.js';

import { openPropsModalEditor } from './cases.js';
import { CAT_NAMES } from './config.js';

// ============================================================
// СОСТОЯНИЕ РЕДАКТОРА
// ============================================================
let currentCategory = null;

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================
function moveItemWithinGroup(catKey, subKey, itemName, direction) {
    let targetArray = subKey ? editorData.inventory[catKey][subKey] : editorData.inventory[catKey];
    if (!Array.isArray(targetArray)) { showToast('Ошибка: не массив', 'error'); return; }
    const idx = targetArray.indexOf(itemName);
    if (idx === -1) { showToast('Позиция не найдена', 'error'); return; }
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= targetArray.length) { showToast('Край списка', 'warning'); return; }
    [targetArray[idx], targetArray[newIdx]] = [targetArray[newIdx], targetArray[idx]];
    saveEditorData();
    renderEditorCategory(catKey);
    showToast('Позиция перемещена', 'success');
}

// ============================================================
// ОТРИСОВКА ВКЛАДОК
// ============================================================
function renderEditorTabs() {
    const container = document.getElementById('editorTabs');
    container.innerHTML = '';
    const order = editorData._categoryOrder || Object.keys(editorData.inventory);
    if (order.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted);padding:12px;">Нет категорий. Создайте первую.</div>';
        return;
    }
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
        renameBtn.addEventListener('click', (e) => { e.stopPropagation(); renameCategoryHandler(key); });
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
    // Если текущая категория невалидна, выбираем первую
    if (!order.includes(currentCategory) && order.length > 0) {
        currentCategory = order[0];
        renderEditorTabs();
        renderEditorCategory(currentCategory);
    }
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

async function renameCategoryHandler(key) {
    const newName = await showPrompt('Переименовать категорию', 'Новое название:', key);
    if (!newName || newName === key) return;
    try {
        renameCategory(key, newName);
        if (currentCategory === key) currentCategory = newName;
        renderEditorAll();
        showToast('Категория переименована', 'success');
    } catch(e) {
        showToast(e.message, 'error');
    }
}

async function deleteCategory(key) {
    const confirmed = await showConfirm(`Удалить категорию "${key}"? Все позиции будут удалены.`);
    if (!confirmed) return;
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
    showToast('Категория удалена', 'success');
}

// ============================================================
// ОТРИСОВКА СОДЕРЖИМОГО КАТЕГОРИИ
// ============================================================
function renderEditorCategory(catKey) {
    const container = document.getElementById('editorContents');
    container.innerHTML = '';
    if (!catKey || !editorData.inventory[catKey]) {
        container.innerHTML = '<div style="color:var(--text-muted);padding:20px;text-align:center;">Выберите категорию или создайте новую</div>';
        return;
    }
    const catData = editorData.inventory[catKey];

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
        addBtn.addEventListener('click', async () => {
            const val = await showPrompt('Введите название новой позиции', 'Название:', '', 'Введите название...');
            if (val && val.trim()) {
                catData.push(val.trim());
                saveEditorData();
                renderEditorCategory(catKey);
                showToast('Позиция добавлена', 'success');
            }
        });
        listDiv.appendChild(header);
        const itemsDiv = document.createElement('div');
        itemsDiv.className = 'items-list';
        if (catData.length === 0) itemsDiv.innerHTML = '<div class="empty-message">Нет позиций</div>';
        else {
            catData.forEach((item) => {
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
        nameSpan.addEventListener('dblclick', (e) => { e.stopPropagation(); renameSubgroupHandler(catKey, subKey); });
        header.appendChild(nameSpan);
        const controls = document.createElement('div');
        controls.className = 'controls';
        const renameBtn = document.createElement('button');
        renameBtn.textContent = '✏️';
        renameBtn.addEventListener('click', (e) => { e.stopPropagation(); renameSubgroupHandler(catKey, subKey); });
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
        delBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const confirmed = await showConfirm(`Удалить подгруппу "${subKey}"?`);
            if (!confirmed) return;
            delete catData[subKey];
            const idx = catData._subOrder.indexOf(subKey);
            if (idx !== -1) catData._subOrder.splice(idx, 1);
            const prefix = catKey + '|' + subKey + '|';
            for (let k in editorData.stock) if (k.startsWith(prefix)) delete editorData.stock[k];
            for (let k in editorData.specs) if (k.startsWith(prefix)) delete editorData.specs[k];
            for (let k in editorData.itemProps) if (k.startsWith(prefix)) delete editorData.itemProps[k];
            saveEditorData();
            renderEditorCategory(catKey);
            showToast('Подгруппа удалена', 'success');
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
        addBtn.addEventListener('click', async () => {
            const val = await showPrompt('Введите название новой позиции', 'Название:', '', 'Введите название...');
            if (val && val.trim()) {
                subItems.push(val.trim());
                saveEditorData();
                renderEditorCategory(catKey);
                showToast('Позиция добавлена', 'success');
            }
        });
        subgroup.appendChild(addBtn);
        wrapper.appendChild(subgroup);
    });

    const addSubBtn = document.createElement('button');
    addSubBtn.className = 'add-subgroup';
    addSubBtn.textContent = '+ Добавить подгруппу';
    addSubBtn.addEventListener('click', async () => {
        const val = await showPrompt('Введите название новой подгруппы', 'Название:', '', 'Введите название...');
        if (val && val.trim()) {
            const newKey = val.trim();
            if (catData[newKey]) { showToast('Уже существует', 'warning'); return; }
            catData[newKey] = [];
            if (!catData._subOrder) catData._subOrder = [];
            catData._subOrder.push(newKey);
            saveEditorData();
            renderEditorCategory(catKey);
            showToast('Подгруппа добавлена', 'success');
        }
    });
    wrapper.appendChild(addSubBtn);
    container.appendChild(wrapper);
}

// ============================================================
// СОЗДАНИЕ СТРОКИ ПОЗИЦИИ В РЕДАКТОРЕ
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
    nameDiv.addEventListener('dblclick', () => { renameItemHandler(catKey, subKey, itemName); });
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
    moveBtn.addEventListener('click', () => { moveItemHandler(catKey, subKey, itemName); });
    actions.appendChild(moveBtn);
    const renameBtn = document.createElement('button');
    renameBtn.textContent = '✏️';
    renameBtn.addEventListener('click', () => { renameItemHandler(catKey, subKey, itemName); });
    actions.appendChild(renameBtn);
    const delBtn = document.createElement('button');
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', async () => {
        const confirmed = await showConfirm(`Удалить позицию "${itemName}"?`);
        if (!confirmed) return;
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
            showToast('Позиция удалена', 'success');
        }
    });
    actions.appendChild(delBtn);
    mainLine.appendChild(actions);
    row.appendChild(mainLine);

    // Информация о свойствах (видна всегда в редакторе)
    const props = getItemProps(catKey, subKey, itemName);
    const infoDiv = document.createElement('div');
    infoDiv.className = 'props-info';
    const weight = props.weight ? props.weight + ' кг' : 'н/д';
    const dims = props.dimensions || 'н/д';
    const cases = (props.individualCases || []).length;
    const common = (props.commonCases || []).length;
    infoDiv.innerHTML = `
        <span>Вес: ${weight}</span>
        <span>Габариты: ${dims}</span>
        <span>Индивидуальные кофры: ${cases}</span>
        <span>Общие кофры: ${common}</span>
        <span>Общие кофры разрешены: ${props.allowCommon ? 'Да' : 'Нет'}</span>
    `;
    row.appendChild(infoDiv);
    return row;
}

// ============================================================
// ФУНКЦИИ РЕДАКТИРОВАНИЯ
// ============================================================
async function renameItemHandler(catKey, subKey, oldName) {
    const newName = await showPrompt('Переименовать позицию', 'Новое название:', oldName);
    if (!newName || newName === oldName) return;
    try {
        renameItem(catKey, subKey, oldName, newName);
        renderEditorCategory(catKey);
        showToast('Позиция переименована', 'success');
    } catch(e) {
        showToast(e.message, 'error');
    }
}

async function moveItemHandler(catKey, subKey, itemName) {
    const targetPath = await showPrompt(
        'Переместить позицию',
        'Введите путь (категория|подгруппа) или "категория" для корневого списка:',
        '',
        'Например: light|Приборы'
    );
    if (!targetPath) return;
    const parts = targetPath.split('|');
    let targetCat = parts[0];
    let targetSub = parts[1] || null;
    if (!editorData.inventory[targetCat]) { showToast('Категория не существует', 'error'); return; }
    if (targetSub && !editorData.inventory[targetCat][targetSub]) { showToast('Подгруппа не существует', 'error'); return; }
    if (!targetSub && typeof editorData.inventory[targetCat] === 'object' && !Array.isArray(editorData.inventory[targetCat])) {
        showToast('Укажите подгруппу для этой категории', 'warning');
        return;
    }
    try {
        moveItem(catKey, subKey, itemName, targetCat, targetSub);
        renderEditorAll();
        showToast(`"${itemName}" перемещён`, 'success');
    } catch(e) {
        showToast(e.message, 'error');
    }
}

async function renameSubgroupHandler(catKey, oldKey) {
    const newKey = await showPrompt('Переименовать подгруппу', 'Новое название:', oldKey);
    if (!newKey || newKey === oldKey) return;
    try {
        renameSubgroup(catKey, oldKey, newKey);
        renderEditorCategory(catKey);
        showToast('Подгруппа переименована', 'success');
    } catch(e) {
        showToast(e.message, 'error');
    }
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
export async function addCategory() {
    const input = document.getElementById('newCategoryName');
    const name = input.value.trim();
    if (!name) { showToast('Введите название', 'warning'); return; }
    if (editorData.inventory[name]) { showToast('Уже существует', 'warning'); return; }
    editorData.inventory[name] = {};
    if (!editorData._categoryOrder) editorData._categoryOrder = [];
    editorData._categoryOrder.push(name);
    editorData.inventory[name]._subOrder = [];
    if (!editorData.catNames[name]) editorData.catNames[name] = name;
    saveEditorData();
    renderEditorAll();
    input.value = '';
    showToast('Категория добавлена', 'success');
}

// ============================================================
// ОБНОВЛЕНИЕ ВСЕГО ИНТЕРФЕЙСА
// ============================================================
export function renderEditorAll() {
    renderEditorTabs();
    if (currentCategory && editorData.inventory[currentCategory]) {
        renderEditorCategory(currentCategory);
    } else if (editorData._categoryOrder && editorData._categoryOrder.length > 0) {
        currentCategory = editorData._categoryOrder[0];
        renderEditorCategory(currentCategory);
    } else {
        renderEditorCategory(null);
    }
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ ОБРАБОТЧИКОВ КНОПОК
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
        a.download = 'library.json';
        a.click();
        URL.revokeObjectURL(url);
        showToast('JSON экспортирован', 'success');
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
                if (!imported.inventory) imported.inventory = {};
                if (!imported.stock) imported.stock = {};
                if (!imported.specs) imported.specs = {};
                if (!imported.catNames) imported.catNames = { ...CAT_NAMES };
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
                // Применяем импорт
                for (let key in imported) {
                    editorData[key] = imported[key];
                }
                saveEditorData();
                renderEditorAll();
                showToast('Импорт выполнен', 'success');
            } catch(err) {
                showToast('Ошибка: ' + err.message, 'error');
            }
        };
        reader.readAsText(file);
        this.value = '';
    });

    // Сброс (удаляет все данные редактора)
    document.getElementById('resetBtn').addEventListener('click', async () => {
        const confirmed = await showConfirm('Сбросить все данные редактора? Это удалит все категории и позиции.');
        if (!confirmed) return;
        resetAllData();
        renderEditorAll();
        showToast('Все данные сброшены', 'neutral');
    });

    // Общие кофры
    document.getElementById('manageCasesBtn').addEventListener('click', () => {
        import('./cases.js').then(module => {
            module.openCasesManagerModal(() => {
                renderEditorAll();
            });
        });
    });
}