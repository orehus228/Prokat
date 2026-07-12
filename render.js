import {
    editorData,
    editorCurrentCategory,
    getStock,
    setStock,
    getSpec,
    setSpec,
    getItemProps,
    setItemProps,
    getCommonCases,
    saveEditorData,
    setCurrentCategory,
    cleanupInventory,
    convertOldItemProps
} from './data.js';
import { esc, showToast, showModalEditor, openPropsModalEditor, openCasesManagerModal } from './ui.js';
import { CAT_NAMES } from './config.js';

function getStockKey(catKey, subKey, itemName) {
    if (subKey) return catKey + '|' + subKey + '|' + itemName;
    return catKey + '|' + itemName;
}

export function renderEditorTabs() {
    const container = document.getElementById('editorTabs');
    container.innerHTML = '';
    const order = editorData._categoryOrder || Object.keys(editorData.inventory);
    order.forEach(key => {
        if (!editorData.inventory[key]) return;
        const tab = document.createElement('div');
        tab.className = 'category-tab' + (key === editorCurrentCategory ? ' active' : '');
        const label = editorData.catNames[key] || key;
        const nameSpan = document.createElement('span');
        nameSpan.textContent = label;
        tab.appendChild(nameSpan);
        const actions = document.createElement('div');
        actions.className = 'tab-actions';
        const upBtn = document.createElement('button');
        upBtn.textContent = '▲';
        upBtn.title = 'Вверх';
        upBtn.addEventListener('click', (e) => { e.stopPropagation(); moveCategoryEditor(key, -1); });
        actions.appendChild(upBtn);
        const downBtn = document.createElement('button');
        downBtn.textContent = '▼';
        downBtn.title = 'Вниз';
        downBtn.addEventListener('click', (e) => { e.stopPropagation(); moveCategoryEditor(key, 1); });
        actions.appendChild(downBtn);
        const renameBtn = document.createElement('button');
        renameBtn.textContent = '✏️';
        renameBtn.title = 'Переименовать';
        renameBtn.addEventListener('click', (e) => { e.stopPropagation(); renameCategoryEditor(key); });
        actions.appendChild(renameBtn);
        const delBtn = document.createElement('button');
        delBtn.textContent = '✕';
        delBtn.className = 'danger';
        delBtn.title = 'Удалить';
        delBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteCategoryEditor(key); });
        actions.appendChild(delBtn);
        tab.appendChild(actions);
        tab.dataset.cat = key;
        tab.addEventListener('click', (e) => {
            if (!e.target.closest('button')) {
                setCurrentCategory(key);
                renderEditorTabs();
                renderEditorCategory(key);
            }
        });
        container.appendChild(tab);
    });
}

export function renderEditorCategory(catKey) {
    const container = document.getElementById('editorContents');
    container.innerHTML = '';
    const catData = editorData.inventory[catKey];
    if (!catData) return;
    if (Array.isArray(catData)) {
        const wrapper = document.createElement('div');
        wrapper.className = 'category-content active';
        const listDiv = document.createElement('div');
        listDiv.className = 'subgroup';
        listDiv.style.border = 'none';
        listDiv.style.boxShadow = 'none';
        const header = document.createElement('div');
        header.className = 'subgroup-header';
        header.innerHTML = `<span class="name">${editorData.catNames[catKey] || catKey}</span>`;
        const addBtn = document.createElement('button');
        addBtn.className = 'add-item';
        addBtn.textContent = '+ Добавить позицию';
        addBtn.style.margin = '10px 0 0 12px';
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
                const row = createItemRowEditor(catKey, null, item, idx);
                itemsDiv.appendChild(row);
            });
        }
        listDiv.appendChild(itemsDiv);
        listDiv.appendChild(addBtn);
        wrapper.appendChild(listDiv);
        container.appendChild(wrapper);
        return;
    }
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
        nameSpan.addEventListener('dblclick', (e) => { e.stopPropagation(); renameSubgroupEditor(catKey, subKey); });
        header.appendChild(nameSpan);
        const controls = document.createElement('div');
        controls.className = 'controls';
        const renameSubBtn = document.createElement('button');
        renameSubBtn.textContent = '✏️';
        renameSubBtn.title = 'Переименовать подгруппу';
        renameSubBtn.addEventListener('click', (e) => { e.stopPropagation(); renameSubgroupEditor(catKey, subKey); });
        controls.appendChild(renameSubBtn);
        const upBtn = document.createElement('button');
        upBtn.textContent = '▲';
        upBtn.title = 'Вверх';
        upBtn.addEventListener('click', (e) => { e.stopPropagation(); moveSubgroupEditor(catKey, subKey, -1); });
        controls.appendChild(upBtn);
        const downBtn = document.createElement('button');
        downBtn.textContent = '▼';
        downBtn.title = 'Вниз';
        downBtn.addEventListener('click', (e) => { e.stopPropagation(); moveSubgroupEditor(catKey, subKey, 1); });
        controls.appendChild(downBtn);
        const delBtn = document.createElement('button');
        delBtn.textContent = '✕';
        delBtn.className = 'danger';
        delBtn.title = 'Удалить подгруппу';
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
            subItems.forEach((item, idx) => {
                const row = createItemRowEditor(catKey, subKey, item, idx);
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
                if (catData[newKey]) { showToast('Подгруппа с таким именем уже существует'); return; }
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

function createItemRowEditor(catKey, subKey, itemName, index) {
    const row = document.createElement('div');
    row.className = 'item-row';
    const mainLine = document.createElement('div');
    mainLine.className = 'main-line';
    const nameDiv = document.createElement('span');
    nameDiv.className = 'name';
    nameDiv.textContent = itemName;
    nameDiv.title = 'Двойной клик для переименования';
    nameDiv.addEventListener('dblclick', () => { renameElementEditor(catKey, subKey, itemName); });
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
    specInput.addEventListener('change', () => { setSpec(catKey, subKey, itemName, specInput.value); });
    mainLine.appendChild(specInput);
    const actions = document.createElement('div');
    actions.className = 'actions';
    const upMoveBtn = document.createElement('button');
    upMoveBtn.textContent = '⬆';
    upMoveBtn.title = 'Переместить вверх';
    upMoveBtn.className = 'move';
    upMoveBtn.addEventListener('click', () => { moveItemWithinGroup(catKey, subKey, itemName, -1); });
    actions.appendChild(upMoveBtn);
    const downMoveBtn = document.createElement('button');
    downMoveBtn.textContent = '⬇';
    downMoveBtn.title = 'Переместить вниз';
    downMoveBtn.className = 'move';
    downMoveBtn.addEventListener('click', () => { moveItemWithinGroup(catKey, subKey, itemName, 1); });
    actions.appendChild(downMoveBtn);
    const propsBtn = document.createElement('button');
    propsBtn.className = 'props';
    propsBtn.textContent = '📦';
    propsBtn.title = 'Свойства (вес, габариты, кофры)';
    propsBtn.addEventListener('click', () => {
        openPropsModalEditor(catKey, subKey, itemName, () => {
            renderEditorCategory(catKey);
        });
    });
    actions.appendChild(propsBtn);
    const moveBtn = document.createElement('button');
    moveBtn.className = 'move';
    moveBtn.textContent = '↗';
    moveBtn.title = 'Переместить в другую категорию/подгруппу';
    moveBtn.addEventListener('click', () => { moveItemEditor(catKey, subKey, itemName); });
    actions.appendChild(moveBtn);
    const renameBtn = document.createElement('button');
    renameBtn.textContent = '✏️';
    renameBtn.title = 'Переименовать';
    renameBtn.addEventListener('click', () => { renameElementEditor(catKey, subKey, itemName); });
    actions.appendChild(renameBtn);
    const delBtn = document.createElement('button');
    delBtn.textContent = '✕';
    delBtn.title = 'Удалить';
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
    const props = getItemProps(catKey, subKey, itemName);
    const infoDiv = document.createElement('div');
    infoDiv.className = 'props-info';
    const weight = props.weight !== undefined && props.weight !== '' ? props.weight : null;
    const weightSpan = document.createElement('span');
    weightSpan.innerHTML = `⚖️ Вес 1 шт: ${weight !== null ? weight + ' кг' : '<span class="na">n/a</span>'}`;
    infoDiv.appendChild(weightSpan);
    const dims = props.dimensions || '';
    const dimsSpan = document.createElement('span');
    dimsSpan.innerHTML = `📐 Габариты 1 шт: ${dims ? dims + ' см' : '<span class="na">n/a</span>'}`;
    infoDiv.appendChild(dimsSpan);
    const volume = props.volume !== undefined && props.volume !== '' ? props.volume : null;
    if (volume !== null) {
        const volumeSpan = document.createElement('span');
        volumeSpan.innerHTML = `📦 Объём 1 шт: ${volume} м³`;
        infoDiv.appendChild(volumeSpan);
    }
    const individualCases = props.individualCases || [];
    if (individualCases.length > 0) {
        const caseLabel = document.createElement('span');
        caseLabel.innerHTML = `🧩 Индивидуальные кофры:`;
        infoDiv.appendChild(caseLabel);
        individualCases.forEach((c, idx) => {
            const maxCases = c.maxCases || 0;
            const variantSpan = document.createElement('span');
            variantSpan.className = 'case-variant';
            variantSpan.innerHTML = `Вариант ${idx+1}: ${c.qty || 0} шт, габ: ${c.dimensions || 'n/a'}, вес: ${c.weight || 0} кг, макс. кофров: ${maxCases === 0 ? '∞' : maxCases}`;
            infoDiv.appendChild(variantSpan);
        });
    } else {
        const noCaseSpan = document.createElement('span');
        noCaseSpan.innerHTML = `🧩 Индивидуальные кофры: <span class="na">не выбраны</span>`;
        infoDiv.appendChild(noCaseSpan);
    }
    const commonCases = props.commonCases || [];
    if (commonCases.length > 0) {
        const commonLabel = document.createElement('span');
        commonLabel.innerHTML = `📦 Привязка к общим кофрам:`;
        infoDiv.appendChild(commonLabel);
        commonCases.forEach(opt => {
            const found = getCommonCases().find(c => c.id === opt.caseId);
            const caseName = found ? found.name : `[удалён]`;
            const variantSpan = document.createElement('span');
            variantSpan.className = 'case-variant';
            variantSpan.innerHTML = `${caseName} (${opt.qty} шт)`;
            infoDiv.appendChild(variantSpan);
        });
    } else {
        const noCommonSpan = document.createElement('span');
        noCommonSpan.innerHTML = `📦 Общие кофры: <span class="na">не привязаны</span>`;
        infoDiv.appendChild(noCommonSpan);
    }
    const allowCommon = props.allowCommon || false;
    const allowSpan = document.createElement('span');
    allowSpan.innerHTML = `📦 Разрешено использование общих кофров: ${allowCommon ? '✅ да' : '❌ нет'}`;
    infoDiv.appendChild(allowSpan);
    row.appendChild(infoDiv);
    return row;
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

function moveItemEditor(sourceCat, sourceSub, itemName) {
    let options = [];
    const order = editorData._categoryOrder || Object.keys(editorData.inventory);
    order.forEach(cat => {
        const catData = editorData.inventory[cat];
        if (Array.isArray(catData)) options.push(cat + ' (корневой список)');
        else if (typeof catData === 'object') {
            const subOrder = catData._subOrder || [];
            subOrder.forEach(sub => options.push(cat + '|' + sub));
        }
    });
    const currentPath = sourceSub ? sourceCat + '|' + sourceSub : sourceCat + ' (корневой список)';
    options = options.filter(opt => opt !== currentPath);
    if (options.length === 0) { showToast('Нет доступных мест'); return; }
    const targetPath = prompt('Введите полный путь (через |):\nДоступно:\n' + options.join('\n'), options[0]);
    if (!targetPath) return;
    let targetCat, targetSub;
    if (targetPath.includes('|')) { const parts = targetPath.split('|'); targetCat = parts[0]; targetSub = parts[1]; }
    else { targetCat = targetPath.replace(' (корневой список)', ''); targetSub = null; }
    if (!editorData.inventory[targetCat]) { showToast('Категория не существует'); return; }
    if (targetSub && !editorData.inventory[targetCat][targetSub]) { showToast('Подгруппа не существует'); return; }
    if (!targetSub && typeof editorData.inventory[targetCat] === 'object' && !Array.isArray(editorData.inventory[targetCat])) { showToast('Нужно указать подгруппу'); return; }
    if (targetSub && Array.isArray(editorData.inventory[targetCat])) { showToast('Эта категория без подгрупп, используйте формат "категория (корневой список)"'); return; }
    let sourceArray = sourceSub ? editorData.inventory[sourceCat][sourceSub] : editorData.inventory[sourceCat];
    if (!Array.isArray(sourceArray)) { showToast('Ошибка'); return; }
    const idx = sourceArray.indexOf(itemName);
    if (idx === -1) { showToast('Позиция не найдена'); return; }
    sourceArray.splice(idx, 1);
    let targetArray = targetSub ? editorData.inventory[targetCat][targetSub] : editorData.inventory[targetCat];
    if (!Array.isArray(targetArray)) { sourceArray.splice(idx, 0, itemName); showToast('Ошибка'); return; }
    if (targetArray.includes(itemName)) { sourceArray.splice(idx, 0, itemName); showToast('Цель уже содержит этот элемент'); return; }
    targetArray.push(itemName);
    const oldKey = getStockKey(sourceCat, sourceSub, itemName);
    const newKey = getStockKey(targetCat, targetSub, itemName);
    if (editorData.stock[oldKey] !== undefined) { editorData.stock[newKey] = editorData.stock[oldKey]; delete editorData.stock[oldKey]; }
    if (editorData.specs[oldKey] !== undefined) { editorData.specs[newKey] = editorData.specs[oldKey]; delete editorData.specs[oldKey]; }
    if (editorData.itemProps[oldKey] !== undefined) { editorData.itemProps[newKey] = editorData.itemProps[oldKey]; delete editorData.itemProps[oldKey]; }
    saveEditorData();
    renderEditorAll();
    showToast(`"${itemName}" перемещён`);
}

function renameElementEditor(catKey, subKey, oldName) {
    const newName = prompt('Новое название:', oldName);
    if (!newName || newName === oldName) return;
    let targetArray = subKey ? editorData.inventory[catKey][subKey] : editorData.inventory[catKey];
    const idx = targetArray.indexOf(oldName);
    if (idx === -1) return;
    if (targetArray.includes(newName)) { showToast('Такое имя уже существует'); return; }
    targetArray[idx] = newName;
    const oldKey = getStockKey(catKey, subKey, oldName);
    const newKey = getStockKey(catKey, subKey, newName);
    if (editorData.stock[oldKey] !== undefined) { editorData.stock[newKey] = editorData.stock[oldKey]; delete editorData.stock[oldKey]; }
    if (editorData.specs[oldKey] !== undefined) { editorData.specs[newKey] = editorData.specs[oldKey]; delete editorData.specs[oldKey]; }
    if (editorData.itemProps[oldKey] !== undefined) { editorData.itemProps[newKey] = editorData.itemProps[oldKey]; delete editorData.itemProps[oldKey]; }
    saveEditorData();
    renderEditorCategory(catKey);
    showToast('Переименовано');
}

function moveSubgroupEditor(catKey, subKey, dir) {
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

function renameSubgroupEditor(catKey, oldKey) {
    const newKey = prompt('Новое название подгруппы:', oldKey);
    if (!newKey || newKey === oldKey) return;
    const catData = editorData.inventory[catKey];
    if (!catData || typeof catData !== 'object') return;
    if (catData[newKey]) { showToast('Подгруппа с таким именем уже существует'); return; }
    catData[newKey] = catData[oldKey];
    delete catData[oldKey];
    const order = catData._subOrder;
    if (order) {
        const idx = order.indexOf(oldKey);
        if (idx !== -1) order[idx] = newKey;
    }
    const oldPrefix = catKey + '|' + oldKey + '|';
    const newPrefix = catKey + '|' + newKey + '|';
    const newStock = {};
    for (let k in editorData.stock) {
        if (k.startsWith(oldPrefix)) newStock[k.replace(oldPrefix, newPrefix)] = editorData.stock[k];
        else newStock[k] = editorData.stock[k];
    }
    editorData.stock = newStock;
    const newSpecs = {};
    for (let k in editorData.specs) {
        if (k.startsWith(oldPrefix)) newSpecs[k.replace(oldPrefix, newPrefix)] = editorData.specs[k];
        else newSpecs[k] = editorData.specs[k];
    }
    editorData.specs = newSpecs;
    const newProps = {};
    for (let k in editorData.itemProps) {
        if (k.startsWith(oldPrefix)) newProps[k.replace(oldPrefix, newPrefix)] = editorData.itemProps[k];
        else newProps[k] = editorData.itemProps[k];
    }
    editorData.itemProps = newProps;
    saveEditorData();
    renderEditorCategory(catKey);
    showToast('Подгруппа переименована');
}

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

function deleteCategoryEditor(catKey) {
    if (!confirm(`Удалить категорию "${catKey}"?`)) return;
    delete editorData.inventory[catKey];
    const idx = editorData._categoryOrder.indexOf(catKey);
    if (idx !== -1) editorData._categoryOrder.splice(idx, 1);
    for (let k in editorData.stock) if (k.startsWith(catKey + '|')) delete editorData.stock[k];
    for (let k in editorData.specs) if (k.startsWith(catKey + '|')) delete editorData.specs[k];
    for (let k in editorData.itemProps) if (k.startsWith(catKey + '|')) delete editorData.itemProps[k];
    if (editorCurrentCategory === catKey) {
        editorCurrentCategory = editorData._categoryOrder.length > 0 ? editorData._categoryOrder[0] : null;
    }
    saveEditorData();
    renderEditorAll();
    showToast('Категория удалена');
}

function renameCategoryEditor(catKey) {
    const newName = prompt('Новое название:', catKey);
    if (!newName || newName === catKey) return;
    if (editorData.inventory[newName]) { showToast('Уже существует'); return; }
    editorData.inventory[newName] = editorData.inventory[catKey];
    delete editorData.inventory[catKey];
    const idx = editorData._categoryOrder.indexOf(catKey);
    if (idx !== -1) editorData._categoryOrder[idx] = newName;
    const oldPrefix = catKey + '|';
    const newPrefix = newName + '|';
    const newStock = {};
    for (let k in editorData.stock) {
        if (k.startsWith(oldPrefix)) newStock[k.replace(oldPrefix, newPrefix)] = editorData.stock[k];
        else newStock[k] = editorData.stock[k];
    }
    editorData.stock = newStock;
    const newSpecs = {};
    for (let k in editorData.specs) {
        if (k.startsWith(oldPrefix)) newSpecs[k.replace(oldPrefix, newPrefix)] = editorData.specs[k];
        else newSpecs[k] = editorData.specs[k];
    }
    editorData.specs = newSpecs;
    const newProps = {};
    for (let k in editorData.itemProps) {
        if (k.startsWith(oldPrefix)) newProps[k.replace(oldPrefix, newPrefix)] = editorData.itemProps[k];
        else newProps[k] = editorData.itemProps[k];
    }
    editorData.itemProps = newProps;
    if (editorCurrentCategory === catKey) editorCurrentCategory = newName;
    saveEditorData();
    renderEditorAll();
    showToast('Категория переименована');
}

function moveCategoryEditor(catKey, dir) {
    const idx = editorData._categoryOrder.indexOf(catKey);
    if (idx === -1) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= editorData._categoryOrder.length) return;
    [editorData._categoryOrder[idx], editorData._categoryOrder[newIdx]] = [editorData._categoryOrder[newIdx], editorData._categoryOrder[idx]];
    saveEditorData();
    renderEditorAll();
    showToast('Категория перемещена');
}

export function renderEditorAll() {
    renderEditorTabs();
    renderEditorCategory(editorCurrentCategory);
}

export function initRenderHandlers() {
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
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('JSON экспортирован (дубли удалены)');
    });
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
                if (typeof imported !== 'object' || imported === null) { showToast('Неверный формат JSON'); return; }
                if (imported.itemProps) {
                    imported.itemProps = convertOldItemProps(imported.itemProps);
                }
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
                showToast('✅ База импортирована и очищена от дублей');
            } catch(err) {
                showToast('Ошибка чтения файла: ' + err.message);
            }
        };
        reader.readAsText(file);
        this.value = '';
    });
    document.getElementById('resetBtn').addEventListener('click', () => {
        if (confirm('Сбросить все изменения?')) {
            loadEditorData();
            renderEditorAll();
            showToast('Сброшено');
        }
    });
    document.getElementById('saveHtmlBtn').addEventListener('click', function() {
        const dataStr = JSON.stringify(editorData, null, 2);
        const blob = new Blob([`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Редактор склада</title><style>/* стили нужно скопировать из редактора */</style></head>
<body><div id="app"></div><script>
const INIT_DATA = ${dataStr};
alert('Сохранение HTML с данными — для демонстрации, требуется полноценная реализация.');
<\/script></body></html>`], {type:'text/html'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'editor_with_data.html';
        a.click();
        URL.revokeObjectURL(url);
        showToast('HTML сохранён (упрощённо)');
    });
    document.getElementById('manageCasesBtn').addEventListener('click', () => {
        openCasesManagerModal(() => {
            renderEditorAll();
        });
    });
}