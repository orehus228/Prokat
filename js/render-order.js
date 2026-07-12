// render-order.js — Отрисовка страницы создания заказа (оптимизированная, с отображением характеристик)
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
    getCommonRoutes,
    setCommonRoutes,
    getIndividualCaseValues,
    setIndividualCaseValues,
    getCaseMode,
    getCaseOptions,
    getSelectedOption,
    updateOrderPaths,
    orderExclude
} from './order.js';

// ============================================================
// СОСТОЯНИЕ
// ============================================================
let currentOrderCategory = 'sound';
let showPropsOrder = false;
let searchModeOrder = false;
let searchQueryOrder = '';
let detailsOpenOrder = false;
const infoBlocksOpen = {};

let flatItemsCache = null;
let eventDelegationInitialized = false;

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ
// ============================================================
function getValue(path) {
    return order[path] || 0;
}

function getStockValue(path) {
    const parts = path.split('|');
    const catKey = parts[0];
    const subKey = parts.length > 2 ? parts[1] : null;
    const itemName = subKey ? parts.slice(2).join('|') : parts.slice(1).join('|');
    return getStock(catKey, subKey, itemName) || 9999;
}

function setValueOrder(path, val) {
    val = Math.max(0, parseInt(val) || 0);
    if (order[path] === val) return;
    order[path] = val;
    if (val === 0) delete order[path];
    saveOrderData();
    updateTotalsOrder();
    updateCategoryTotalsOrder(currentOrderCategory);
    updateRowOrder(path);
}

// ============================================================
// ПЛОСКИЙ СПИСОК (кешируется)
// ============================================================
function buildFlatItemsList() {
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

// ============================================================
// ВКЛАДКИ
// ============================================================
function renderOrderTabs() {
    const container = document.getElementById('categoryTabs');
    container.innerHTML = '';
    let orderKeys = editorData._categoryOrder || Object.keys(editorData.inventory);
    orderKeys = orderKeys.filter(key => editorData.inventory && editorData.inventory[key] !== undefined);
    if (orderKeys.length === 0) {
        container.innerHTML = '<div class="empty-message">Нет категорий</div>';
        return;
    }
    orderKeys.forEach(key => {
        const tab = document.createElement('div');
        tab.className = 'category-tab' + (key === currentOrderCategory ? ' active' : '');
        tab.textContent = CAT_NAMES[key] || key;
        tab.dataset.cat = key;
        tab.addEventListener('click', () => {
            if (searchModeOrder) { document.getElementById('searchInput').value = ''; searchModeOrder = false; searchQueryOrder = ''; }
            currentOrderCategory = key;
            renderOrderTabs();
            renderOrderCategory(key);
            setupInputListenersOrder();
            setupCaseTogglesOrder();
            updateTotalsOrder();
            updateLinkCountOrder();
            renderCommonCaseIndicatorsOrder();
        });
        container.appendChild(tab);
    });
    if (!orderKeys.includes(currentOrderCategory)) {
        currentOrderCategory = orderKeys[0];
    }
}

// ============================================================
// РЕНДЕРИНГ КАТЕГОРИИ
// ============================================================
function renderOrderCategory(catKey) {
    const container = document.getElementById('categoryContents');
    const wrapper = document.createElement('div');
    wrapper.className = 'category-content active';
    container.innerHTML = '';
    container.appendChild(wrapper);

    if (catKey === 'all' || searchModeOrder) {
        const allPaths = buildFlatItemsList();
        const query = searchQueryOrder.toLowerCase();
        let filteredPaths = allPaths;
        if (query) {
            filteredPaths = allPaths.filter(path => {
                const name = path.split('|').pop();
                const spec = editorData.specs && editorData.specs[path] || '';
                return name.toLowerCase().includes(query) || spec.toLowerCase().includes(query);
            });
        }
        if (filteredPaths.length === 0) {
            wrapper.innerHTML = '<div class="empty-message">Ничего не найдено</div>';
            return;
        }
        const grouped = {};
        filteredPaths.forEach(path => {
            const cat = path.split('|')[0];
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(path);
        });
        let html = '';
        const orderKeys = editorData._categoryOrder || Object.keys(editorData.inventory);
        orderKeys.forEach(cat => {
            if (!grouped[cat]) return;
            html += `<div class="sub-cat-t">${CAT_NAMES[cat]||cat}</div>`;
            grouped[cat].forEach(path => {
                html += buildItemRow(path, 1);
            });
        });
        wrapper.innerHTML = html;
    } else {
        const catData = editorData.inventory[catKey];
        if (!catData) {
            wrapper.innerHTML = '<div class="empty-message">Категория пуста</div>';
            return;
        }
        wrapper.innerHTML = buildCategoryHTML(catData, [catKey], 0);
    }

    if (!eventDelegationInitialized) {
        setupEventDelegation();
        eventDelegationInitialized = true;
    }

    setupInputListenersOrder();
    setupCaseTogglesOrder();

    document.querySelectorAll('#categoryContents .row').forEach(row => {
        const path = row.dataset.path;
        if (path) { updateRowOrder(path); }
    });

    if (!searchModeOrder) updateCategoryTotalsOrder(catKey);
    updateTotalsOrder();
    updateLinkCountOrder();
    applySearchOrder();
    if (detailsOpenOrder) {
        document.getElementById('globalDetails').classList.add('open');
        document.getElementById('detailToggle').textContent = 'Скрыть';
    } else {
        document.getElementById('globalDetails').classList.remove('open');
        document.getElementById('detailToggle').textContent = 'Подробно';
    }
    renderCommonCaseIndicatorsOrder();
}

// ============================================================
// РЕКУРСИВНЫЙ ОБХОД
// ============================================================
function buildCategoryHTML(data, path, level) {
    if (level > 15) return '';
    let html = '';
    if (Array.isArray(data)) {
        data.forEach(item => {
            if (typeof item === 'string') {
                const fullPath = path.length ? path.join('|') + '|' + item : item;
                html += buildItemRow(fullPath, level);
            }
        });
        return html;
    } else if (data && typeof data === 'object') {
        const keys = Object.keys(data).filter(k => !k.startsWith('_'));
        keys.forEach(key => {
            const childPath = [...path, key];
            const isSubSub = level >= 2;
            if (isSubSub) html += `<div class="sub-sub-cat-t">${key}</div>`;
            else html += `<div class="sub-cat-t">${key}</div>`;
            html += buildCategoryHTML(data[key], childPath, level + 1);
        });
        return html;
    }
    return '';
}

// ============================================================
// ПОСТРОЕНИЕ СТРОКИ (с вычислением веса/объёма)
// ============================================================
function buildItemRow(fullPath, level) {
    const val = getValue(fullPath);
    const sq = getStockValue(fullPath);
    const hasDesc = !!(editorData.specs && editorData.specs[fullPath]);
    const hasLink = links[fullPath] && links[fullPath].length > 0;
    const props = getItemProps(fullPath);
    const hasCase = (props.individualCases && props.individualCases.length > 0) || props.allowCommon;
    const mode = getCaseMode(fullPath);
    const overstock = getTotalQty(fullPath) > sq;
    const isInfoOpen = infoBlocksOpen[fullPath] || false;
    const totalQty = getTotalQty(fullPath);
    
    // Вычисляем вес и объём для отображения в строке
    let weightDisplay = '0 кг', volumeDisplay = '0 м³';
    if (props.weight) {
        const w = calcItemWeightWithMode(fullPath, totalQty);
        weightDisplay = w.toFixed(1) + ' кг';
    }
    if (props.dimensions) {
        const v = calcItemVolumeWithMode(fullPath, totalQty);
        volumeDisplay = v.toFixed(3) + ' м³';
    }
    
    const infoHtml = buildInfoHtml(fullPath, props, mode);
    const escapedName = esc(fullPath.split('|').pop());
    const isAdded = totalQty > 0;
    const isOverstock = overstock;
    const rowClass = (isAdded ? 'added' : '') + (isOverstock ? ' overstock' : '');

    let html = `<div class="row ${rowClass}" data-path="${esc(fullPath)}" data-search="${fullPath}">
        <div class="main-line">
            <div class="name-area">
                <span class="name">${escapedName}</span>
                <button class="action-btn info-btn" data-path="${esc(fullPath)}" title="Информация">Инфо</button>
                ${hasDesc ? `<button class="action-btn desc-btn" data-path="${esc(fullPath)}">Описание</button>` : ''}
                <button class="action-btn link-btn ${hasLink ? 'active' : ''}" data-path="${esc(fullPath)}" title="Линк">Линк</button>
                ${hasCase ? `<button class="action-btn case-btn" data-path="${esc(fullPath)}" title="Настройка кофров">Кофры</button>` : ''}
                <button class="action-btn note-btn" data-path="${esc(fullPath)}" title="Заметка">Заметка</button>
            </div>
            <div class="qty-controls">
                <span class="weight-vol-display">${weightDisplay} / ${volumeDisplay}</span>
                <span class="stock-info">в наличии: ${sq}</span>
                <button class="btn-c qty-btn" data-path="${esc(fullPath)}" data-delta="-1">−</button>
                <input type="number" class="qty-input" value="${val}" min="0" step="1" data-path="${esc(fullPath)}">
                <button class="btn-c qty-btn" data-path="${esc(fullPath)}" data-delta="1">+</button>
            </div>
        </div>
        ${isInfoOpen ? `<div class="row-info">${infoHtml}</div>` : ''}
    </div>`;
    if (hasDesc) {
        html += `<div class="desc-block" data-path="${esc(fullPath)}">${esc(editorData.specs[fullPath])}</div>`;
    }
    if (hasLink) {
        links[fullPath].forEach(link => {
            html += `<div style="font-size:13px;color:var(--text-secondary);padding-left:${level*20+20}px;">→ ${link.target} (×${link.multiplier})</div>`;
        });
    }
    return html;
}

function buildInfoHtml(path, props, mode) {
    let html = `<div style="display:flex;flex-wrap:wrap;gap:12px;">`;
    html += `<span><strong>Вес 1 шт:</strong> ${props.weight ? props.weight + ' кг' : 'н/д'}</span>`;
    html += `<span><strong>Габариты:</strong> ${props.dimensions || 'н/д'}</span>`;
    if (props.volume) html += `<span><strong>Объём 1 шт:</strong> ${props.volume} м³</span>`;
    if (props.individualCases && props.individualCases.length > 0) {
        html += `<span><strong>Варианты кофров:</strong> ${props.individualCases.map(c => c.qty+' шт').join(', ')}</span>`;
    }
    if (props.allowCommon) html += `<span><strong>Разрешены общие кофры</strong></span>`;
    if (mode.enabled) {
        html += `<span><strong>Режим кофров включён</strong> ${mode.alt ? '(альтернативный)' : ''}</span>`;
    }
    const packing = getOrderPacking(path);
    if (packing.length > 0) {
        html += `<span><strong>Привязка к общим кофрам:</strong> ${packing.length} кофров</span>`;
    }
    html += `</div>`;
    return html;
}

// ============================================================
// ДЕЛЕГИРОВАНИЕ СОБЫТИЙ
// ============================================================
function setupEventDelegation() {
    const container = document.getElementById('categoryContents');
    container.removeEventListener('click', handleContainerClick);
    container.addEventListener('click', handleContainerClick);
    container.removeEventListener('input', handleContainerInput);
    container.addEventListener('input', handleContainerInput);
}

function handleContainerClick(e) {
    const target = e.target.closest('.qty-btn');
    if (target) {
        const path = target.dataset.path;
        const delta = parseInt(target.dataset.delta);
        if (path && !isNaN(delta)) {
            const row = target.closest('.row');
            const inp = row.querySelector('.qty-input');
            if (inp) {
                let val = parseInt(inp.value) || 0;
                val = Math.max(0, val + delta);
                inp.value = val;
                setValueOrder(path, val);
                updateRowOrder(path);
            }
        }
        return;
    }

    const infoBtn = e.target.closest('.info-btn');
    if (infoBtn) {
        toggleInfoOrder(infoBtn);
        return;
    }

    const descBtn = e.target.closest('.desc-btn');
    if (descBtn) {
        toggleDescOrder(descBtn);
        return;
    }

    const linkBtn = e.target.closest('.link-btn');
    if (linkBtn) {
        openLinkOrder(linkBtn);
        return;
    }

    const caseBtn = e.target.closest('.case-btn');
    if (caseBtn) {
        openCaseSettingsOrder(caseBtn);
        return;
    }

    const noteBtn = e.target.closest('.note-btn');
    if (noteBtn) {
        openNoteEditorOrder(noteBtn);
        return;
    }

    const dropdownBtn = e.target.closest('.case-dropdown-btn');
    if (dropdownBtn) {
        const path = dropdownBtn.dataset.path;
        const row = dropdownBtn.closest('.row');
        const dropdown = row.querySelector('.case-dropdown');
        if (dropdown) {
            dropdown.classList.toggle('open');
            document.querySelectorAll('.case-dropdown.open').forEach(d => {
                if (d !== dropdown) d.classList.remove('open');
            });
        }
        return;
    }

    const dropdownItem = e.target.closest('.case-dropdown-item');
    if (dropdownItem) {
        handleDropdownItemOrder(dropdownItem);
        return;
    }
}

function handleContainerInput(e) {
    const target = e.target.closest('.qty-input');
    if (target) {
        const path = target.dataset.path;
        let val = parseInt(target.value);
        if (isNaN(val) || val < 0) val = 0;
        target.value = val;
        setValueOrder(path, val);
        updateRowOrder(path);
        return;
    }

    const caseInput = e.target.closest('.case-input');
    if (caseInput) {
        const path = caseInput.dataset.path;
        let val = parseInt(caseInput.value);
        if (isNaN(val) || val < 0) val = 0;
        caseInput.value = val;
        const mode = getCaseMode(path);
        if (mode.enabled) {
            const opt = getSelectedOption(path);
            if (opt && opt.qty > 0) {
                const newQty = val * opt.qty;
                setValueOrder(path, newQty);
            }
        }
        renderCommonCaseIndicatorsOrder();
        return;
    }
}

// ============================================================
// ОБРАБОТЧИКИ КНОПОК
// ============================================================
function toggleInfoOrder(btn) {
    const path = btn.dataset.path;
    const row = btn.closest('.row');
    let infoBlock = row.querySelector('.row-info');
    if (!infoBlock) {
        infoBlock = document.createElement('div');
        infoBlock.className = 'row-info';
        row.appendChild(infoBlock);
    }
    const isOpen = infoBlocksOpen[path] || false;
    infoBlocksOpen[path] = !isOpen;
    if (infoBlocksOpen[path]) {
        const props = getItemProps(path);
        const mode = getCaseMode(path);
        infoBlock.innerHTML = buildInfoHtml(path, props, mode);
        infoBlock.style.display = 'block';
        btn.textContent = 'Скрыть';
    } else {
        infoBlock.style.display = 'none';
        btn.textContent = 'Инфо';
    }
}

function toggleDescOrder(btn) {
    const path = btn.dataset.path;
    const block = document.querySelector(`.desc-block[data-path="${path}"]`);
    if (block) {
        block.classList.toggle('open');
        btn.textContent = block.classList.contains('open') ? 'Скрыть описание' : 'Описание';
    }
}

function openLinkOrder(btn) {
    const path = btn.dataset.path;
    import('./cases.js').then(module => {
        module.openMatrixModal(path);
    });
}

function openCaseSettingsOrder(btn) {
    const path = btn.dataset.path;
    import('./cases.js').then(module => {
        module.openCaseSettingsModal(path, () => {
            updateRowOrder(path);
            updateTotalsOrder();
            updateCategoryTotalsOrder(currentOrderCategory);
        });
    });
}

async function openNoteEditorOrder(btn) {
    const path = btn.dataset.path;
    const current = notes[path] || '';
    const newNote = await showPrompt('Редактировать заметку', 'Заметка:', current);
    if (newNote === null) return;
    if (newNote.trim() === '') {
        delete notes[path];
    } else {
        notes[path] = newNote.trim();
    }
    saveOrderData();
    showToast('Заметка сохранена', 'neutral');
}

function handleDropdownItemOrder(item) {
    const path = item.dataset.path;
    const idx = parseInt(item.dataset.idx);
    const isAlt = item.dataset.alt === 'true';
    const isAccumulate = item.dataset.accumulate === 'true';
    const mode = getCaseMode(path);
    if (isAccumulate) {
        mode.accumulate = !mode.accumulate;
        saveOrderData();
        updateRowOrder(path);
        updateTotalsOrder();
        updateCategoryTotalsOrder(currentOrderCategory);
        showToast(mode.accumulate ? 'Режим "Копиться в кофре" включён' : 'Режим "Копиться в кофре" выключен');
        renderCommonCaseIndicatorsOrder();
        return;
    }
    if (isAlt) {
        openAltCaseModalOrder(path);
        const dropdown = item.closest('.case-dropdown');
        if (dropdown) dropdown.classList.remove('open');
        return;
    }
    if (idx !== undefined) {
        mode.selectedOption = idx;
        mode.alt = null;
        saveOrderData();
        updateRowOrder(path);
        updateTotalsOrder();
        updateCategoryTotalsOrder(currentOrderCategory);
        showToast('Вариант кофра выбран');
        const dropdown = item.closest('.case-dropdown');
        if (dropdown) dropdown.classList.remove('open');
        renderCommonCaseIndicatorsOrder();
    }
}

function openAltCaseModalOrder(path) {
    showToast('Альтернативный кофр (будет реализован позже)');
}

function toggleMultiModeOrder(path) {
    const mode = getCaseMode(path);
    if (!mode.enabled) { showToast('Сначала включите режим кофров'); return; }
    const options = getCaseOptions(path);
    if (options.length < 2) { showToast('Нужно минимум 2 варианта кофров'); return; }
    const key = 'multi_' + path;
    const current = localStorage.getItem(key) === 'true';
    localStorage.setItem(key, current ? 'false' : 'true');
    if (!current) {
        const vals = getIndividualCaseValues(path);
        if (vals.length === 0) {
            setIndividualCaseValues(path, options.map(() => 0));
        }
    } else {
        const vals = getIndividualCaseValues(path);
        const total = vals.reduce((a,b) => a + b, 0);
        if (total > 0) {
            setIndividualCaseValues(path, [total]);
        } else {
            setIndividualCaseValues(path, []);
        }
    }
    renderOrderCategory(currentOrderCategory);
}

// ============================================================
// ОБНОВЛЕНИЕ СТРОКИ (с пересчётом веса/объёма)
// ============================================================
function updateRowOrder(path) {
    const row = document.querySelector(`#categoryContents .row[data-path="${path}"]`);
    if (!row) return;
    const qtyInput = row.querySelector('.qty-input');
    if (qtyInput) qtyInput.value = getValue(path);
    const sq = getStockValue(path);
    const totalQty = getTotalQty(path);
    const isAdded = totalQty > 0;
    const isOverstock = totalQty > sq;
    row.classList.toggle('added', isAdded);
    row.classList.toggle('overstock', isOverstock);
    const oldWarn = row.querySelector('.overstock-warning');
    if (oldWarn) oldWarn.remove();
    if (isOverstock) {
        const warn = document.createElement('span');
        warn.className = 'overstock-warning';
        warn.textContent = '!';
        warn.title = 'Больше нет (в наличии ' + sq + ')';
        row.querySelector('.qty-controls').appendChild(warn);
    }
    const weightVolDisplay = row.querySelector('.weight-vol-display');
    if (weightVolDisplay) {
        const props = getItemProps(path);
        let weightDisplay = '0 кг', volumeDisplay = '0 м³';
        if (props.weight) {
            const w = calcItemWeightWithMode(path, totalQty);
            weightDisplay = w.toFixed(1) + ' кг';
        }
        if (props.dimensions) {
            const v = calcItemVolumeWithMode(path, totalQty);
            volumeDisplay = v.toFixed(3) + ' м³';
        }
        weightVolDisplay.textContent = weightDisplay + ' / ' + volumeDisplay;
    }
    if (infoBlocksOpen[path]) {
        const infoBlock = row.querySelector('.row-info');
        if (infoBlock) {
            const props = getItemProps(path);
            const mode = getCaseMode(path);
            infoBlock.innerHTML = buildInfoHtml(path, props, mode);
            infoBlock.style.display = 'block';
        }
    }
    renderCommonCaseIndicatorsOrder();
}

// ============================================================
// ИТОГИ
// ============================================================
function updateCategoryTotalsOrder(catKey) {
    const container = document.querySelector('#categoryContents .category-content.active');
    if (!container || searchModeOrder) return;
    let totalsDiv = container.querySelector('.category-totals');
    if (!totalsDiv) {
        totalsDiv = document.createElement('div');
        totalsDiv.className = 'category-totals';
        container.appendChild(totalsDiv);
    }
    const items = getActiveItemsOrder().filter(({ path }) => path.startsWith(catKey + '|'));
    let qty = 0, weight = 0, volume = 0, cases = 0;
    items.forEach(({ path, qty: q }) => {
        qty += q;
        weight += calcItemWeightWithMode(path, q);
        volume += calcItemVolumeWithMode(path, q);
        cases += calcItemCases(path, q);
    });
    totalsDiv.innerHTML = `<span>Итого в категории: ${qty} шт</span><span>Вес: ${weight.toFixed(1)} кг</span><span>Объём: ${volume.toFixed(3)} м³</span>${cases > 0 ? `<span>Кофров: ${cases} шт</span>` : ''}`;
}

function updateTotalsOrder() {
    const items = getActiveItemsOrder();
    let totalQty = 0, totalWeight = 0, totalVolume = 0, totalCases = 0;
    const catTotals = {};
    items.forEach(({ path, qty }) => {
        totalQty += qty;
        totalWeight += calcItemWeightWithMode(path, qty);
        totalVolume += calcItemVolumeWithMode(path, qty);
        totalCases += calcItemCases(path, qty);
        const cat = path.split('|')[0];
        if (!catTotals[cat]) catTotals[cat] = { qty: 0, weight: 0, volume: 0, cases: 0 };
        catTotals[cat].qty += qty;
        catTotals[cat].weight += calcItemWeightWithMode(path, qty);
        catTotals[cat].volume += calcItemVolumeWithMode(path, qty);
        catTotals[cat].cases += calcItemCases(path, qty);
    });
    document.getElementById('totalQty').textContent = totalQty;
    document.getElementById('totalWeight').textContent = totalWeight.toFixed(1);
    document.getElementById('totalVolume').textContent = totalVolume.toFixed(3);
    const detailsDiv = document.getElementById('globalDetails');
    let detailsHtml = '';
    const orderKeys = editorData._categoryOrder || Object.keys(editorData.inventory);
    orderKeys.forEach(cat => {
        if (!catTotals[cat]) return;
        const d = catTotals[cat];
        detailsHtml += `<div class="cat-detail"><strong>${CAT_NAMES[cat]||cat}</strong><br>${d.qty} шт<br>${d.weight.toFixed(1)} кг<br>${d.volume.toFixed(3)} м³${d.cases > 0 ? `<br>${d.cases} кофров` : ''}</div>`;
    });
    detailsDiv.innerHTML = detailsHtml || '';
    renderCommonCaseIndicatorsOrder();
}

function getActiveItemsOrder() {
    const items = [];
    for (let p in order) {
        if (order[p] > 0) items.push({ path: p, qty: order[p] });
    }
    for (let p in orderSplits) {
        const segs = orderSplits[p];
        segs.forEach(seg => {
            if (seg.qty > 0) {
                items.push({ path: p, qty: seg.qty });
            }
        });
    }
    return items;
}

// ============================================================
// ПОИСК
// ============================================================
const debouncedSearch = debounce(applySearchOrder, 300);

function applySearchOrder() {
    const query = document.getElementById('searchInput').value.toLowerCase().trim();
    searchQueryOrder = query;
    if (query) {
        if (!searchModeOrder) { searchModeOrder = true; currentOrderCategory = 'all'; renderOrderCategory('all'); return; }
        const rows = document.querySelectorAll('#categoryContents .row');
        rows.forEach(row => {
            const searchText = row.dataset.search || '';
            if (searchText.includes(query)) row.classList.remove('hidden');
            else row.classList.add('hidden');
        });
    } else {
        if (searchModeOrder) { searchModeOrder = false; currentOrderCategory = editorData._categoryOrder[0] || 'sound'; renderOrderCategory(currentOrderCategory); }
        else { document.querySelectorAll('#categoryContents .row').forEach(row => row.classList.remove('hidden')); }
    }
}

function clearSearchOrder() {
    document.getElementById('searchInput').value = '';
    if (searchModeOrder) { searchModeOrder = false; currentOrderCategory = editorData._categoryOrder[0] || 'sound'; renderOrderCategory(currentOrderCategory); }
    else { document.querySelectorAll('#categoryContents .row').forEach(row => row.classList.remove('hidden')); }
}

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ НАСТРОЙКИ
// ============================================================
function setupInputListenersOrder() {}
function setupCaseTogglesOrder() {}

function updateLinkCountOrder() {
    let count = 0;
    for (let src in links) count += links[src].length;
    document.getElementById('linkCount').textContent = `(${count} активных)`;
}

function renderCommonCaseIndicatorsOrder() {}

// ============================================================
// ЭКСПОРТ
// ============================================================
export function exportOrderJSON() {
    const data = {
        project_name: document.getElementById('pName').value.trim() || "Мероприятие",
        date: document.getElementById('pDate').value || new Date().toLocaleDateString('ru-RU'),
        comment: document.getElementById('pComment').value.trim() || "",
        items: order,
        splits: orderSplits,
        packing: orderPacking,
        individual_cases: individualCaseValues,
        routes: commonRoutes,
        links: links,
        notes: notes,
        exclude: orderExclude
    };
    if (Object.keys(order).length === 0 && Object.keys(orderSplits).length === 0) {
        showToast('Список пуст', 'warning'); return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = data.project_name + ".json";
    a.click();
    URL.revokeObjectURL(url);
    showToast('JSON сохранён', 'success');
}

export function exportOrderPDF() {
    // Аналогично предыдущему, но с полным отчётом
    const data = {
        project_name: document.getElementById('pName').value.trim() || "Мероприятие",
        date: document.getElementById('pDate').value || new Date().toLocaleDateString('ru-RU'),
        comment: document.getElementById('pComment').value.trim() || ""
    };
    const items = getActiveItemsOrder();
    if (items.length === 0) { showToast('Нет позиций для экспорта', 'warning'); return; }
    const catItems = {};
    items.forEach(({ path, qty, isSplit, segData }) => {
        const parts = path.split('|');
        const cat = parts[0];
        const name = parts.slice(1).join(' → ');
        if (!catItems[cat]) catItems[cat] = [];
        let detail = '';
        if (isSplit && segData) {
            if (segData.type === 'common') {
                const c = getCommonCases().find(c => c.id === segData.caseId);
                detail = c ? 'кофр: ' + c.name : 'кофр: удалён';
            } else if (segData.type === 'multi') {
                const opts = getCaseOptions(path);
                const opt = opts[segData.variantIdx];
                detail = 'вар.' + (segData.variantIdx+1) + (opt ? ' ('+opt.qty+' шт/кофр), кофров: '+(segData.cases||0) : '');
            }
        } else {
            detail = 'без кофра';
        }
        const weight = calcItemWeightWithMode(path, qty);
        const volume = calcItemVolumeWithMode(path, qty);
        const dims = getItemProps(path).dimensions || 'н/д';
        catItems[cat].push({ name, qty, weight, volume, dims, detail });
    });

    let html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Чек-лист</title>
<style>
body{font-family:'Segoe UI',Arial,sans-serif;margin:40px;color:#222;background:#fff}
h1{color:#2c3e50;border-bottom:2px solid #3498db;padding-bottom:10px}
.meta{margin:20px 0;color:#555}
table{width:100%;border-collapse:collapse;margin-top:20px;font-size:14px}
th{background:#2c3e50;color:#fff;padding:8px;text-align:left}
td{padding:6px 8px;border-bottom:1px solid #ddd}
tr:nth-child(even){background:#f9f9f9}
.total-row{font-weight:bold;background:#e6f2ff!important;border-top:2px solid #3498db}
.grand-total{font-weight:bold;background:#d4e6ff!important;border-top:3px solid #1a3a5a;font-size:16px}
.actions{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);display:flex;gap:12px;background:white;padding:12px 24px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.2);z-index:1000;}
.actions button{padding:10px 24px;border:none;border-radius:6px;font-size:16px;cursor:pointer;font-weight:600;}
.actions .print{background:#2c3e50;color:white;}
.actions .close{background:#ddd;color:#333;}
.actions .print:hover{background:#1a2a3a;}
.actions .close:hover{background:#ccc;}
</style>
</head><body>
<h1>Чек-лист: ${esc(data.project_name)}</h1>
<div class="meta"><strong>Дата:</strong> ${esc(data.date)}<br><strong>Комментарий:</strong> ${esc(data.comment||'—')}</div>
<table><thead><tr><th>Категория</th><th>Позиция</th><th>Кол-во (шт)</th><th>Вес (кг)</th><th>Объём (м³)</th><th>Габариты (см)</th><th>Детали</th></tr></thead><tbody>`;
    let grandQty=0,grandWeight=0,grandVolume=0;
    const orderKeys = editorData._categoryOrder || Object.keys(editorData.inventory);
    orderKeys.forEach(cat => {
        if (!catItems[cat]) return;
        let first=true, catQty=0,catWeight=0,catVolume=0;
        for (let item of catItems[cat]) {
            catQty += item.qty;
            catWeight += item.weight;
            catVolume += item.volume;
            html += `<tr><td>${first ? CAT_NAMES[cat]||cat : ''}</td><td>${esc(item.name)}</td><td>${item.qty}</td><td>${item.weight.toFixed(1)}</td><td>${item.volume.toFixed(3)}</td><td>${esc(item.dims)}</td><td>${esc(item.detail)}</td></tr>`;
            first = false;
        }
        grandQty += catQty; grandWeight += catWeight; grandVolume += catVolume;
        html += `<tr class="total-row"><td colspan="2"><strong>Итого в категории</strong></td><td><strong>${catQty} шт</strong></td><td><strong>${catWeight.toFixed(1)} кг</strong></td><td><strong>${catVolume.toFixed(3)} м³</strong></td><td></td><td></td></tr>`;
    });
    html += `<tr class="grand-total"><td colspan="2"><strong>Общий итог</strong></td><td><strong>${grandQty} шт</strong></td><td><strong>${grandWeight.toFixed(1)} кг</strong></td><td><strong>${grandVolume.toFixed(3)} м³</strong></td><td></td><td></td></tr>`;
    html += `</tbody></table>
<div class="actions">
    <button class="print" onclick="window.print()">Сохранить PDF</button>
    <button class="close" onclick="window.close()">Назад</button>
</div>
</body></html>`;

    const win = window.open('', '_blank');
    if (win) {
        win.document.write(html);
        win.document.close();
        win.focus();
    } else {
        showToast('Не удалось открыть новую вкладку', 'error');
    }
}

export async function clearOrderData() {
    const confirmed = await showConfirm('Очистить список?');
    if (!confirmed) return;
    for (let key in order) delete order[key];
    for (let key in orderSplits) delete orderSplits[key];
    for (let key in links) delete links[key];
    for (let key in notes) delete notes[key];
    for (let key in orderPacking) delete orderPacking[key];
    for (let key in individualCaseValues) delete individualCaseValues[key];
    for (let key in commonRoutes) delete commonRoutes[key];
    for (let key in caseModes) delete caseModes[key];
    for (let key in orderExclude) delete orderExclude[key];
    saveOrderData();
    renderOrderAll();
    showToast('Список очищен', 'success');
}

export function renderOrderAll() {
    flatItemsCache = null;
    eventDelegationInitialized = false;
    loadOrderData();
    document.getElementById('pComment').value = localStorage.getItem('last_comment') || '';
    const savedDate = localStorage.getItem('last_date');
    if (savedDate) document.getElementById('pDate').value = savedDate;
    renderOrderTabs();
    renderOrderCategory(currentOrderCategory);
}

export function initOrderUI() {
    detailsOpenOrder = localStorage.getItem('detailsOpenOrder') === 'true';

    document.getElementById('detailToggle')?.addEventListener('click', function() {
        const details = document.getElementById('globalDetails');
        details.classList.toggle('open');
        detailsOpenOrder = details.classList.contains('open');
        localStorage.setItem('detailsOpenOrder', JSON.stringify(detailsOpenOrder));
        this.textContent = detailsOpenOrder ? 'Скрыть' : 'Подробно';
    });

    document.getElementById('searchInput')?.addEventListener('input', debouncedSearch);
    document.getElementById('clearSearchBtn')?.addEventListener('click', clearSearchOrder);

    document.getElementById('pDate')?.addEventListener('change', function() {
        localStorage.setItem('last_date', this.value);
    });
    document.getElementById('pComment')?.addEventListener('input', function() {
        localStorage.setItem('last_comment', this.value);
    });

    document.getElementById('btnSaveJSON')?.addEventListener('click', exportOrderJSON);
    document.getElementById('btnSavePDF')?.addEventListener('click', exportOrderPDF);
    document.getElementById('btnClearOrder')?.addEventListener('click', clearOrderData);
}