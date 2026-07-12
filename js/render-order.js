// render-order.js — Отрисовка страницы создания заказа (минималистичная версия)
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
    updateOrderPaths
} from './order.js';

// ============================================================
// СОСТОЯНИЕ СТРАНИЦЫ ЗАКАЗА
// ============================================================
let currentCategory = 'sound';
let searchMode = false;
let searchQuery = '';
let detailsOpen = false;
// Состояние открытых деталей для каждой строки
const rowDetailsOpen = {};

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
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

function setValue(path, val) {
    val = Math.max(0, parseInt(val) || 0);
    if (order[path] === val) return;
    order[path] = val;
    if (val === 0) delete order[path];
    saveOrderData();
    updateTotals();
    updateCategoryTotals(currentCategory);
    updateRow(path);
}

// ============================================================
// ОТРИСОВКА ВКЛАДОК КАТЕГОРИЙ
// ============================================================
function renderOrderTabs() {
    const container = document.getElementById('categoryTabs');
    container.innerHTML = '';
    const orderKeys = editorData._categoryOrder || Object.keys(editorData.inventory);
    orderKeys.forEach(key => {
        if (!editorData.inventory[key]) return;
        const tab = document.createElement('div');
        tab.className = 'category-tab' + (key === currentCategory ? ' active' : '');
        tab.textContent = CAT_NAMES[key] || key;
        tab.dataset.cat = key;
        tab.addEventListener('click', () => {
            if (searchMode) { document.getElementById('searchInput').value = ''; searchMode = false; searchQuery = ''; }
            currentCategory = key;
            renderOrderTabs();
            renderOrderCategory(key);
            setupDescToggles();
            setupInputListeners();
            setupCaseToggles();
            setupDetailToggles();
            updateTotals();
            updateLinkCount();
        });
        container.appendChild(tab);
    });
}

// ============================================================
// РЕНДЕРИНГ КАТЕГОРИИ
// ============================================================
function renderOrderCategory(catKey) {
    const container = document.getElementById('categoryContents');
    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'category-content active';
    if (catKey === 'all' || searchMode) {
        wrapper.innerHTML = buildAllCategoriesHTML();
    } else {
        const catData = editorData.inventory[catKey];
        if (!catData) { wrapper.innerHTML = '<div class="empty-message">Категория пуста</div>'; container.appendChild(wrapper); return; }
        wrapper.innerHTML = buildCategoryHTML(catData, [catKey], 0);
    }
    container.appendChild(wrapper);
    setupDescToggles();
    setupInputListeners();
    setupCaseToggles();
    setupDetailToggles();
    // Обновляем строки после рендера
    document.querySelectorAll('#categoryContents .row').forEach(row => {
        const path = row.dataset.path;
        if (path) { updateRow(path); updateItemPropsDisplay(row, path); updateNoteDisplay(row, path); }
    });
    if (!searchMode) updateCategoryTotals(catKey);
    updateTotals();
    updateLinkCount();
    applySearch();
    if (detailsOpen) {
        document.getElementById('globalDetails').classList.add('open');
        document.getElementById('detailToggle').textContent = 'Скрыть';
    } else {
        document.getElementById('globalDetails').classList.remove('open');
        document.getElementById('detailToggle').textContent = 'Подробно';
    }
}

function buildAllCategoriesHTML() {
    let html = '';
    const orderKeys = editorData._categoryOrder || Object.keys(editorData.inventory);
    orderKeys.forEach(cat => {
        const catData = editorData.inventory[cat];
        if (!catData) return;
        html += `<div class="sub-cat-t">${CAT_NAMES[cat]||cat}</div>`;
        html += buildCategoryHTML(catData, [cat], 0);
    });
    return html;
}

function buildCategoryHTML(data, path, level) {
    let html = '';
    if (Array.isArray(data)) {
        data.forEach((item, idx) => {
            const fullPath = path.length ? path.join('|') + '|' + item : item;
            const val = getValue(fullPath);
            const sq = getStockValue(fullPath);
            const hasDesc = !!editorData.specs[fullPath];
            const hasLink = links[fullPath] && links[fullPath].length > 0;
            const props = getItemProps(fullPath);
            const options = getCaseOptions(fullPath);
            const hasCase = options.length > 0;
            const mode = getCaseMode(fullPath);
            const caseModeOn = mode.enabled;
            const overstock = getTotalQty(fullPath) > sq;
            const hasDetails = !!(props.weight || props.dimensions || options.length > 0 || props.allowCommon);
            const isDetailOpen = rowDetailsOpen[fullPath] || false;

            const dynHtml = `<div class="dynamic-info" style="display:${isDetailOpen ? 'flex' : 'none'};"></div>`;
            const escapedName = esc(item);
            const searchText = item + ' ' + (hasDesc ? editorData.specs[fullPath] : '') + ' ' + (CAT_NAMES[path[0]] || '');

            // Индикатор добавления (зелёный) – если позиция добавлена
            const isAdded = getTotalQty(fullPath) > 0;
            // Индикатор оверстока (красный)
            const isOverstock = overstock;

            let caseControls = '';
            let variantControls = '';
            let multiToggle = '';
            if (hasCase) {
                const isMulti = localStorage.getItem('multi_' + fullPath) === 'true';
                const showMultiToggle = options.length > 1;
                multiToggle = showMultiToggle ? `<button class="multi-toggle ${isMulti ? 'active' : ''}" data-path="${esc(fullPath)}" onclick="window.toggleMultiMode('${esc(fullPath)}')">${isMulti ? 'Мульти' : '1'}</button>` : '';

                caseControls = `<div class="controls">
                    <span class="stock-info">в наличии: ${sq}</span>
                    <button class="btn-c qty-btn" data-path="${esc(fullPath)}" data-delta="-1">−</button>
                    <input type="number" class="qty-input" value="${val}" min="0" step="1" data-path="${esc(fullPath)}">
                    <button class="btn-c qty-btn" data-path="${esc(fullPath)}" data-delta="1">+</button>
                    <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
                        <div class="case-toggle-wrap">
                            <label class="case-toggle"><input type="checkbox" class="case-switch" data-path="${esc(fullPath)}" ${caseModeOn ? 'checked' : ''}> Кофры</label>
                            <button class="case-dropdown-btn" onclick="window.toggleCaseDropdown('${esc(fullPath)}',this)">▼</button>
                            <div class="case-dropdown" data-path="${esc(fullPath)}">
                                ${options.map((opt, i) => `<div class="case-dropdown-item ${mode.selectedOption === i && !mode.alt ? 'active' : ''}" data-path="${esc(fullPath)}" data-idx="${i}">Вариант ${i+1} (${opt.qty} шт)</div>`).join('')}
                                <div class="case-dropdown-item case-dropdown-alt ${mode.alt ? 'active' : ''}" data-path="${esc(fullPath)}" data-alt="true">${mode.alt ? '✓' : '☐'} Альтернативный кофр</div>
                                <div class="case-dropdown-item case-dropdown-accumulate ${mode.accumulate ? 'active' : ''}" data-path="${esc(fullPath)}" data-accumulate="true">${mode.accumulate ? '✓' : '☐'} Копиться в кофре</div>
                            </div>
                        </div>
                        <span class="case-status" style="${caseModeOn ? 'display:inline-block' : 'display:none;'}font-size:13px;color:#888;margin-left:6px;">${caseModeOn ? (mode.alt ? 'Альт. кофр' : (options.length > 1 ? 'Выбран вариант' : 'Кофры')) : ''}</span>
                        ${multiToggle}
                    </div>
                </div>`;
                if (caseModeOn && options.length > 1) {
                    variantControls = `<div class="case-variant-controls" style="display:flex;flex-wrap:wrap;gap:4px;margin-left:8px;align-items:center;"></div>`;
                } else if (caseModeOn && options.length === 1) {
                    const selected = getSelectedOption(fullPath);
                    const caseVal = (selected && selected.qty > 0) ? Math.ceil(val / selected.qty) : 0;
                    variantControls = `
                        <div style="display:flex;align-items:center;gap:4px;margin-left:8px;">
                            <button class="btn-c case-btn" onclick="window.chgCase('${esc(fullPath)}',-1,this)" style="border-color:#6a8a6a;color:#6a8a6a;width:32px;height:32px;font-size:16px;">−</button>
                            <input type="number" class="case-input" value="${caseVal}" min="0" step="1" data-path="${esc(fullPath)}" style="width:50px;padding:4px;border:1px solid #6a8a6a;background:#1a2a1a;border-radius:8px;color:#d0d0d0;text-align:center;font-size:14px;">
                            <button class="btn-c case-btn" onclick="window.chgCase('${esc(fullPath)}',1,this)" style="border-color:#6a8a6a;color:#6a8a6a;width:32px;height:32px;font-size:16px;">+</button>
                        </div>
                    `;
                }
            } else {
                caseControls = `<div class="controls">
                    <span class="stock-info">в наличии: ${sq}</span>
                    <button class="btn-c qty-btn" data-path="${esc(fullPath)}" data-delta="-1">−</button>
                    <input type="number" class="qty-input" value="${val}" min="0" step="1" data-path="${esc(fullPath)}">
                    <button class="btn-c qty-btn" data-path="${esc(fullPath)}" data-delta="1">+</button>
                </div>`;
            }

            let commonControlsHtml = '';
            if (props.allowCommon) {
                const route = getCommonRoutes(fullPath);
                if (route.length > 0) {
                    commonControlsHtml = `<div class="common-controls-wrapper" style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-left:8px;"></div>`;
                } else {
                    commonControlsHtml = `<div class="common-controls-wrapper" style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-left:8px;"><button class="route-btn" onclick="window.openRouteModal('${esc(fullPath)}')">Маршрут</button></div>`;
                }
            }

            const rowClass = (isAdded ? 'added' : '') + (isOverstock ? ' overstock' : '');
            html += `<div class="row ${rowClass}" data-path="${esc(fullPath)}" data-search="${searchText.toLowerCase()}">
                <div class="main-line">
                    <div class="name-area">
                        <span class="name">${escapedName}</span>
                        ${hasDesc ? `<button class="desc-toggle" data-path="${esc(fullPath)}">📄</button>` : ''}
                        <button class="link-btn ${hasLink ? 'active' : ''}" onclick="window.openLinkModal('${esc(fullPath)}')" title="Настроить привязки">${hasLink ? '🔗' : '⛓️'}</button>
                        ${props.allowCommon ? '<span style="font-size:12px;color:#6a8a6a;">Общие кофры</span>' : ''}
                        ${hasDetails ? `<button class="detail-toggle" data-path="${esc(fullPath)}">${isDetailOpen ? 'Скрыть' : 'Подробнее'}</button>` : ''}
                    </div>
                    ${caseControls}
                </div>
                ${variantControls}
                ${commonControlsHtml}
                ${dynHtml}
            </div>`;
            if (hasDesc) html += `<div class="desc-block" data-path="${esc(fullPath)}">${esc(editorData.specs[fullPath])}</div>`;
            if (hasLink) {
                links[fullPath].forEach(link => {
                    html += `<div style="font-size:13px;color:#888;padding-left:${level*20+20}px;">→ ${link.target} (×${link.multiplier})</div>`;
                });
            }
        });
        return html;
    } else if (typeof data === 'object' && data !== null) {
        const keys = Object.keys(data).filter(k => !k.startsWith('_'));
        keys.forEach(key => {
            const isSubSub = level >= 2;
            if (isSubSub) html += `<div class="sub-sub-cat-t">${key}</div>`;
            else html += `<div class="sub-cat-t">${key}</div>`;
            html += buildCategoryHTML(data[key], [...path, key], level + 1);
        });
        return html;
    }
    return '';
}

// ============================================================
// УПРАВЛЕНИЕ КОЛИЧЕСТВОМ (через делегирование)
// ============================================================
function setupQuantityDelegation() {
    document.removeEventListener('click', handleQuantityClick);
    document.addEventListener('click', handleQuantityClick);
}

function handleQuantityClick(e) {
    const target = e.target.closest('.qty-btn');
    if (!target) return;
    const path = target.dataset.path;
    const delta = parseInt(target.dataset.delta);
    if (!path || isNaN(delta)) return;
    const row = target.closest('.row');
    const inp = row.querySelector('.qty-input');
    if (!inp) return;
    let val = parseInt(inp.value) || 0;
    val = Math.max(0, val + delta);
    inp.value = val;
    setValue(path, val);
    updateRow(path);
    updateItemPropsDisplay(row, path);
}

// Глобальные функции для вызова из HTML
window.chgPath = function(path, delta, btn) {
    const row = btn.closest('.row');
    const inp = row.querySelector('.qty-input');
    let val = parseInt(inp.value) || 0;
    val = Math.max(0, val + delta);
    inp.value = val;
    setValue(path, val);
    updateRow(path);
    updateItemPropsDisplay(row, path);
};

window.chgCase = function(path, delta, btn) {
    const row = btn.closest('.row');
    const mode = getCaseMode(path);
    if (!mode.enabled) return;
    const inp = row.querySelector('.case-input');
    if (!inp) return;
    let caseVal = parseInt(inp.value) || 0;
    caseVal = Math.max(0, caseVal + delta);
    inp.value = caseVal;
    const opt = getSelectedOption(path);
    if (opt && opt.qty > 0) {
        const newQty = caseVal * opt.qty;
        setValue(path, newQty);
    }
};

window.toggleCaseDropdown = function(path, btn) {
    const row = btn.closest('.row');
    const dropdown = row.querySelector('.case-dropdown');
    if (dropdown) {
        dropdown.classList.toggle('open');
        document.querySelectorAll('.case-dropdown.open').forEach(d => {
            if (d !== dropdown) d.classList.remove('open');
        });
    }
};

window.openLinkModal = function(sourcePath) {
    import('./cases.js').then(module => {
        module.openMatrixModal(sourcePath);
    });
};

window.openRouteModal = function(path) {
    showToast('Маршрут (будет реализован позже) для ' + path, 'info');
};

window.toggleMultiMode = function(path) {
    const mode = getCaseMode(path);
    if (!mode.enabled) { showToast('Сначала включите режим кофров', 'warning'); return; }
    const options = getCaseOptions(path);
    if (options.length < 2) { showToast('Нужно минимум 2 варианта кофров', 'warning'); return; }
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
    renderOrderCategory(currentCategory);
};

// ============================================================
// ОБРАБОТЧИК КНОПКИ "ПОДРОБНЕЕ"
// ============================================================
function setupDetailToggles() {
    document.querySelectorAll('#categoryContents .detail-toggle').forEach(btn => {
        btn.removeEventListener('click', toggleDetails);
        btn.addEventListener('click', toggleDetails);
    });
}

function toggleDetails(e) {
    const btn = e.currentTarget;
    const path = btn.dataset.path;
    const row = btn.closest('.row');
    const dynDiv = row.querySelector('.dynamic-info');
    if (!dynDiv) return;
    const isOpen = rowDetailsOpen[path] || false;
    rowDetailsOpen[path] = !isOpen;
    dynDiv.style.display = rowDetailsOpen[path] ? 'flex' : 'none';
    btn.textContent = rowDetailsOpen[path] ? 'Скрыть' : 'Подробнее';
    if (rowDetailsOpen[path]) {
        updateItemPropsDisplay(row, path);
    }
}

// ============================================================
// ИНКРЕМЕНТАЛЬНОЕ ОБНОВЛЕНИЕ СТРОКИ
// ============================================================
function updateRow(path) {
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
        warn.textContent = 'Больше нет (в наличии ' + sq + ')';
        row.querySelector('.controls').appendChild(warn);
    }
    updateItemPropsDisplay(row, path);
    updateNoteDisplay(row, path);
}

function updateItemPropsDisplay(row, path) {
    const dynDiv = row.querySelector('.dynamic-info');
    if (!dynDiv) return;
    const props = getItemProps(path);
    const qty = getTotalQty(path);
    const mode = getCaseMode(path);
    let weightDisplay = 'n/a', weightVal = 0;
    if (props.weight) {
        weightVal = calcItemWeightWithMode(path, qty);
        weightDisplay = weightVal.toFixed(1) + ' кг';
        if (mode.enabled) weightDisplay += ' (с кофрами)';
    }
    let volumeDisplay = 'n/a', volumeVal = 0;
    if (props.dimensions) {
        volumeVal = calcItemVolumeWithMode(path, qty);
        volumeDisplay = volumeVal.toFixed(3) + ' м³';
    }
    let casesDisplay = '';
    if (mode.enabled) {
        const totalCases = calcItemCases(path, qty);
        if (totalCases > 0) casesDisplay = `<span class="hl">${totalCases} кофр${totalCases>1?'а':''}</span>`;
    }
    let dimsDisplay = props.dimensions || 'n/a';
    let weightPerUnit = props.weight ? props.weight + ' кг' : 'n/a';
    let caseOptionsDisplay = '';
    const options = getCaseOptions(path);
    if (options.length > 0) {
        caseOptionsDisplay = 'Варианты кофров: ' + options.map(o => `${o.qty} шт`).join(', ');
    }
    dynDiv.innerHTML = `
        <span>Вес 1 шт: ${weightPerUnit}</span>
        <span>Габариты: ${dimsDisplay}</span>
        ${weightDisplay !== 'n/a' ? `<span>Общий вес: ${weightDisplay}</span>` : ''}
        ${volumeDisplay !== 'n/a' ? `<span>Общий объём: ${volumeDisplay}</span>` : ''}
        ${casesDisplay ? `<span>${casesDisplay}</span>` : ''}
        ${caseOptionsDisplay ? `<span>${caseOptionsDisplay}</span>` : ''}
        ${props.allowCommon ? `<span>Разрешены общие кофры</span>` : ''}
    `;
}

function updateNoteDisplay(row, path) {
    let noteBlock = row.querySelector('.note-block');
    if (!noteBlock) {
        noteBlock = document.createElement('div');
        noteBlock.className = 'note-block';
        const noteText = document.createElement('span');
        noteText.className = 'note-text';
        noteText.textContent = notes[path] || '';
        const editBtn = document.createElement('button');
        editBtn.className = 'note-edit';
        editBtn.textContent = '✏️';
        editBtn.onclick = () => editNote(path);
        noteBlock.appendChild(noteText);
        noteBlock.appendChild(editBtn);
        row.appendChild(noteBlock);
    } else {
        const noteText = noteBlock.querySelector('.note-text');
        if (noteText) noteText.textContent = notes[path] || '';
    }
}

async function editNote(path) {
    const current = notes[path] || '';
    const newNote = await showPrompt('Редактировать заметку', 'Заметка:', current);
    if (newNote === null) return;
    if (newNote.trim() === '') {
        delete notes[path];
    } else {
        notes[path] = newNote.trim();
    }
    saveOrderData();
    const row = document.querySelector(`#categoryContents .row[data-path="${esc(path)}"]`);
    if (row) updateNoteDisplay(row, path);
    showToast('Заметка сохранена', 'success');
}

// ============================================================
// ОБНОВЛЕНИЕ ИТОГОВ
// ============================================================
function updateCategoryTotals(catKey) {
    const container = document.querySelector('#categoryContents .category-content.active');
    if (!container || searchMode) return;
    let totalsDiv = container.querySelector('.category-totals');
    if (!totalsDiv) {
        totalsDiv = document.createElement('div');
        totalsDiv.className = 'category-totals';
        container.appendChild(totalsDiv);
    }
    const items = getActiveItems().filter(({ path }) => path.startsWith(catKey + '|'));
    let qty = 0, weight = 0, volume = 0, cases = 0;
    items.forEach(({ path, qty: q }) => {
        qty += q;
        weight += calcItemWeightWithMode(path, q);
        volume += calcItemVolumeWithMode(path, q);
        cases += calcItemCases(path, q);
    });
    totalsDiv.innerHTML = `<span>Итого в категории: ${qty} шт</span><span>Вес: ${weight.toFixed(1)} кг</span><span>Объём: ${volume.toFixed(3)} м³</span>${cases > 0 ? `<span>Кофров: ${cases} шт</span>` : ''}`;
}

function updateTotals() {
    const items = getActiveItems();
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
}

function getActiveItems() {
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
// ПОИСК (с debounce)
// ============================================================
const debouncedSearch = debounce(applySearch, 300);

function applySearch() {
    const query = document.getElementById('searchInput').value.toLowerCase().trim();
    searchQuery = query;
    if (query) {
        if (!searchMode) { searchMode = true; currentCategory = 'all'; renderOrderCategory('all'); return; }
        const rows = document.querySelectorAll('#categoryContents .row');
        rows.forEach(row => {
            const searchText = row.dataset.search || '';
            if (searchText.includes(query)) row.classList.remove('hidden');
            else row.classList.add('hidden');
        });
    } else {
        if (searchMode) { searchMode = false; currentCategory = editorData._categoryOrder[0] || 'sound'; renderOrderCategory(currentCategory); }
        else { document.querySelectorAll('#categoryContents .row').forEach(row => row.classList.remove('hidden')); }
    }
}

function clearSearch() {
    document.getElementById('searchInput').value = '';
    if (searchMode) { searchMode = false; currentCategory = editorData._categoryOrder[0] || 'sound'; renderOrderCategory(currentCategory); }
    else { document.querySelectorAll('#categoryContents .row').forEach(row => row.classList.remove('hidden')); }
}

// ============================================================
// ОБРАБОТЧИКИ UI
// ============================================================
function setupDescToggles() {
    document.querySelectorAll('#categoryContents .desc-toggle').forEach(btn => {
        btn.removeEventListener('click', toggleDescOrder);
        btn.addEventListener('click', toggleDescOrder);
    });
}

function toggleDescOrder(e) {
    const btn = e.currentTarget;
    const path = btn.dataset.path;
    const block = document.querySelector(`.desc-block[data-path="${path}"]`);
    if (block) {
        block.classList.toggle('open');
        btn.textContent = block.classList.contains('open') ? '📕' : '📄';
    }
}

function setupInputListeners() {
    document.querySelectorAll('#categoryContents .qty-input').forEach(inp => {
        inp.removeEventListener('input', handleQtyInput);
        inp.addEventListener('input', handleQtyInput);
    });
}

function handleQtyInput(e) {
    const inp = e.target;
    const path = inp.dataset.path;
    let val = parseInt(inp.value);
    if (isNaN(val) || val < 0) val = 0;
    inp.value = val;
    setValue(path, val);
    const row = inp.closest('.row');
    if (row) updateItemPropsDisplay(row, path);
}

function setupCaseToggles() {
    document.querySelectorAll('#categoryContents .case-switch').forEach(cb => {
        cb.removeEventListener('change', handleCaseSwitch);
        cb.addEventListener('change', handleCaseSwitch);
    });
    document.querySelectorAll('#categoryContents .case-dropdown-item').forEach(item => {
        item.removeEventListener('click', handleDropdownItem);
        item.addEventListener('click', handleDropdownItem);
    });
}

function handleCaseSwitch(e) {
    const cb = e.target;
    const path = cb.dataset.path;
    const mode = getCaseMode(path);
    mode.enabled = cb.checked;
    if (!mode.enabled) {
        mode.alt = null;
        mode.accumulate = false;
        setIndividualCaseValues(path, []);
        localStorage.removeItem('multi_' + path);
        const row = cb.closest('.row');
        const dropdown = row.querySelector('.case-dropdown');
        if (dropdown) dropdown.classList.remove('open');
    } else {
        const options = getCaseOptions(path);
        if (options.length > 0) {
            const vals = getIndividualCaseValues(path);
            if (vals.length === 0) {
                setIndividualCaseValues(path, options.map(() => 0));
            }
        }
    }
    saveOrderData();
    updateRow(path);
    updateTotals();
    updateCategoryTotals(currentCategory);
    const row = cb.closest('.row');
    if (row) {
        updateItemPropsDisplay(row, path);
    }
}

function handleDropdownItem(e) {
    const item = e.currentTarget;
    const path = item.dataset.path;
    const idx = parseInt(item.dataset.idx);
    const isAlt = item.dataset.alt === 'true';
    const isAccumulate = item.dataset.accumulate === 'true';
    const mode = getCaseMode(path);
    if (isAccumulate) {
        mode.accumulate = !mode.accumulate;
        saveOrderData();
        updateRow(path);
        updateTotals();
        updateCategoryTotals(currentCategory);
        const row = document.querySelector(`#categoryContents .row[data-path="${esc(path)}"]`);
        if (row) updateItemPropsDisplay(row, path);
        showToast(mode.accumulate ? 'Режим "Копиться в кофре" включён' : 'Режим "Копиться в кофре" выключен', 'info');
        return;
    }
    if (isAlt) {
        openAltCaseModal(path);
        const dropdown = item.closest('.case-dropdown');
        if (dropdown) dropdown.classList.remove('open');
        return;
    }
    if (idx !== undefined) {
        mode.selectedOption = idx;
        mode.alt = null;
        saveOrderData();
        updateRow(path);
        updateTotals();
        updateCategoryTotals(currentCategory);
        const row = document.querySelector(`#categoryContents .row[data-path="${esc(path)}"]`);
        if (row) updateItemPropsDisplay(row, path);
        showToast('Вариант кофра выбран', 'success');
        const dropdown = item.closest('.case-dropdown');
        if (dropdown) dropdown.classList.remove('open');
    }
}

async function openAltCaseModal(path) {
    const mode = getCaseMode(path);
    const alt = mode.alt || { qty: '', weight: '', dims: '' };
    const qty = await showPrompt('Альтернативный кофр', 'Вместимость (шт):', String(alt.qty || ''));
    if (qty === null) return;
    const weight = await showPrompt('Альтернативный кофр', 'Вес пустого (кг):', String(alt.weight || '0'));
    if (weight === null) return;
    const dims = await showPrompt('Альтернативный кофр', 'Габариты (Д×Ш×В, см):', alt.dims || '');
    if (dims === null) return;
    const numQty = parseInt(qty);
    if (isNaN(numQty) || numQty <= 0) { showToast('Введите корректную вместимость', 'error'); return; }
    mode.alt = { qty: numQty, weight: parseFloat(weight) || 0, dims: dims || '' };
    mode.enabled = true;
    const cb = document.querySelector(`#categoryContents .case-switch[data-path="${esc(path)}"]`);
    if (cb) cb.checked = true;
    saveOrderData();
    updateRow(path);
    updateTotals();
    updateCategoryTotals(currentCategory);
    showToast('Альтернативный кофр применён', 'success');
}

function updateLinkCount() {
    let count = 0;
    for (let src in links) count += links[src].length;
    document.getElementById('linkCount').textContent = `(${count} активных)`;
}

// ============================================================
// ЭКСПОРТ ЗАКАЗА В JSON
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
        notes: notes
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

// ============================================================
// ЭКСПОРТ ЗАКАЗА В PDF (с предпросмотром и кнопками)
// ============================================================
export function exportOrderPDF() {
    const data = {
        project_name: document.getElementById('pName').value.trim() || "Мероприятие",
        date: document.getElementById('pDate').value || new Date().toLocaleDateString('ru-RU'),
        comment: document.getElementById('pComment').value.trim() || ""
    };
    const items = getActiveItems();
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
        const dims = getItemProps(path).dimensions || 'n/a';
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

// ============================================================
// ОЧИСТКА ЗАКАЗА
// ============================================================
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
    saveOrderData();
    renderOrderAll();
    showToast('Список очищен', 'success');
}

// ============================================================
// ГЛАВНАЯ ФУНКЦИЯ ОТРИСОВКИ
// ============================================================
export function renderOrderAll() {
    loadOrderData();
    document.getElementById('pComment').value = localStorage.getItem('last_comment') || '';
    const savedDate = localStorage.getItem('last_date');
    if (savedDate) document.getElementById('pDate').value = savedDate;
    renderOrderTabs();
    renderOrderCategory(currentCategory);
    setupDescToggles();
    setupInputListeners();
    setupCaseToggles();
    setupDetailToggles();
    setupQuantityDelegation();
    updateTotals();
    updateLinkCount();
    applySearch();
    if (detailsOpen) {
        document.getElementById('globalDetails').classList.add('open');
        document.getElementById('detailToggle').textContent = 'Скрыть';
    } else {
        document.getElementById('globalDetails').classList.remove('open');
        document.getElementById('detailToggle').textContent = 'Подробно';
    }
}

// ============================================================
// ЭКСПОРТ ДЛЯ ВНЕШНЕГО ИСПОЛЬЗОВАНИЯ
// ============================================================
export { applySearch, clearSearch, renderOrderCategory };

// ============================================================
// ОБРАБОТЧИКИ ДЛЯ КНОПОК СТРАНИЦЫ ЗАКАЗА (инициализация)
// ============================================================
export function initOrderUI() {
    // Восстанавливаем состояние
    detailsOpen = localStorage.getItem('detailsOpen') === 'true';

    document.getElementById('detailToggle')?.addEventListener('click', function() {
        const details = document.getElementById('globalDetails');
        details.classList.toggle('open');
        detailsOpen = details.classList.contains('open');
        localStorage.setItem('detailsOpen', JSON.stringify(detailsOpen));
        this.textContent = detailsOpen ? 'Скрыть' : 'Подробно';
    });

    // Поиск с debounce
    document.getElementById('searchInput')?.addEventListener('input', debouncedSearch);
    document.getElementById('clearSearchBtn')?.addEventListener('click', clearSearch);

    // Сохранение даты и комментария
    document.getElementById('pDate')?.addEventListener('change', function() {
        localStorage.setItem('last_date', this.value);
    });
    document.getElementById('pComment')?.addEventListener('input', function() {
        localStorage.setItem('last_comment', this.value);
    });

    // Кнопки экспорта и очистки
    document.getElementById('btnSaveJSON')?.addEventListener('click', exportOrderJSON);
    document.getElementById('btnSavePDF')?.addEventListener('click', exportOrderPDF);
    document.getElementById('btnClearOrder')?.addEventListener('click', clearOrderData);
}