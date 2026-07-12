// render-order.js — Отрисовка страницы создания заказа
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
    showToast
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
    getSelectedOption
} from './order.js';

// ============================================================
// СОСТОЯНИЕ СТРАНИЦЫ ЗАКАЗА
// ============================================================
let currentCategory = 'sound';
let showProps = false;
let searchMode = false;
let searchQuery = '';
let detailsOpen = false;

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
            updateTotals();
            updateLinkCount();
            renderCommonCaseIndicators();
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
        document.getElementById('detailToggle').textContent = '📊 Скрыть';
    } else {
        document.getElementById('globalDetails').classList.remove('open');
        document.getElementById('detailToggle').textContent = '📊 Подробно';
    }
    renderCommonCaseIndicators();
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
            const linkIcon = hasLink ? '🔗' : '⛓️';
            const props = getItemProps(fullPath);
            const options = getCaseOptions(fullPath);
            const hasCase = options.length > 0;
            const mode = getCaseMode(fullPath);
            const caseModeOn = mode.enabled;
            const overstock = getTotalQty(fullPath) > sq;
            const dynHtml = `<div class="dynamic-info"></div>`;
            const staticHtml = `<div class="props-compact ${showProps ? 'visible' : ''}"></div>`;
            const escapedName = esc(item);
            const searchText = item + ' ' + (hasDesc ? editorData.specs[fullPath] : '') + ' ' + (CAT_NAMES[path[0]] || '');

            let caseControls = '';
            let variantControls = '';
            let multiToggle = '';
            if (hasCase) {
                const isMulti = localStorage.getItem('multi_' + fullPath) === 'true';
                const showMultiToggle = options.length > 1;
                multiToggle = showMultiToggle ? `<button class="multi-toggle ${isMulti ? 'active' : ''}" onclick="toggleMultiMode('${esc(fullPath)}')">${isMulti ? '🔀 Мульти' : '🔀 1'}</button>` : '';

                caseControls = `<div class="controls">
                    <span class="stock-info">в наличии: ${sq}</span>
                    <button class="btn-c" onclick="chgPath('${esc(fullPath)}',-1,this)">−</button>
                    <input type="number" class="qty-input" value="${val}" min="0" step="1" data-path="${esc(fullPath)}">
                    <button class="btn-c" onclick="chgPath('${esc(fullPath)}',1,this)">+</button>
                    <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
                        <div class="case-toggle-wrap">
                            <label class="case-toggle"><input type="checkbox" class="case-switch" data-path="${esc(fullPath)}" ${caseModeOn ? 'checked' : ''}> Кофры</label>
                            <button class="case-dropdown-btn" onclick="toggleCaseDropdown('${esc(fullPath)}',this)">▼</button>
                            <div class="case-dropdown" data-path="${esc(fullPath)}">
                                ${options.map((opt, i) => `<div class="case-dropdown-item ${mode.selectedOption === i && !mode.alt ? 'active' : ''}" data-path="${esc(fullPath)}" data-idx="${i}">Вариант ${i+1} (${opt.qty} шт)</div>`).join('')}
                                <div class="case-dropdown-item case-dropdown-alt ${mode.alt ? 'active' : ''}" data-path="${esc(fullPath)}" data-alt="true">${mode.alt ? '✅' : '☐'} Альтернативный кофр</div>
                                <div class="case-dropdown-item case-dropdown-accumulate ${mode.accumulate ? 'active' : ''}" data-path="${esc(fullPath)}" data-accumulate="true">${mode.accumulate ? '✅' : '☐'} Копиться в кофре</div>
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
                            <button class="btn-c case-btn" onclick="chgCase('${esc(fullPath)}',-1,this)" style="border-color:#6a8a6a;color:#6a8a6a;width:32px;height:32px;font-size:16px;">−</button>
                            <input type="number" class="case-input" value="${caseVal}" min="0" step="1" data-path="${esc(fullPath)}" style="width:50px;padding:4px;border:1px solid #6a8a6a;background:#1a2a1a;border-radius:8px;color:#d0d0d0;text-align:center;font-size:14px;">
                            <button class="btn-c case-btn" onclick="chgCase('${esc(fullPath)}',1,this)" style="border-color:#6a8a6a;color:#6a8a6a;width:32px;height:32px;font-size:16px;">+</button>
                        </div>
                    `;
                }
            } else {
                caseControls = `<div class="controls">
                    <span class="stock-info">в наличии: ${sq}</span>
                    <button class="btn-c" onclick="chgPath('${esc(fullPath)}',-1,this)">−</button>
                    <input type="number" class="qty-input" value="${val}" min="0" step="1" data-path="${esc(fullPath)}">
                    <button class="btn-c" onclick="chgPath('${esc(fullPath)}',1,this)">+</button>
                </div>`;
            }

            let commonControlsHtml = '';
            if (props.allowCommon) {
                const route = getCommonRoutes(fullPath);
                if (route.length > 0) {
                    commonControlsHtml = `<div class="common-controls-wrapper" style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-left:8px;"></div>`;
                } else {
                    commonControlsHtml = `<div class="common-controls-wrapper" style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-left:8px;"><button class="route-btn" onclick="openRouteModal('${esc(fullPath)}')">🗺️ Маршрут</button></div>`;
                }
            }

            html += `<div class="row ${overstock ? 'overstock' : ''}" data-path="${esc(fullPath)}" data-search="${searchText.toLowerCase()}">
                <div class="main-line">
                    <div class="name-area">
                        <span class="name">${escapedName}</span>
                        ${hasDesc ? `<button class="desc-toggle" data-path="${esc(fullPath)}">📄</button>` : ''}
                        <button class="link-btn ${hasLink ? 'active' : ''}" onclick="openLinkModal('${esc(fullPath)}')" title="Настроить привязки">${linkIcon}</button>
                        ${props.allowCommon ? '<span style="font-size:12px;color:#6a8a6a;">✅ Общие кофры</span>' : ''}
                    </div>
                    ${caseControls}
                </div>
                ${variantControls}
                ${commonControlsHtml}
                ${dynHtml}
                ${staticHtml}
            </div>`;
            if (hasDesc) html += `<div class="desc-block" data-path="${esc(fullPath)}">📋 ${esc(editorData.specs[fullPath])}</div>`;
            if (hasLink) {
                links[fullPath].forEach(link => {
                    html += `<div style="font-size:13px;color:#888;padding-left:${level*20+20}px;">🔗 → ${link.target} (×${link.multiplier})</div>`;
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
// УПРАВЛЕНИЕ КОЛИЧЕСТВОМ
// ============================================================
function chgPath(path, delta, btn) {
    const row = btn.closest('.row');
    const inp = row.querySelector('.qty-input');
    let val = parseInt(inp.value) || 0;
    val = Math.max(0, val + delta);
    inp.value = val;
    setValue(path, val);
    updateRow(path);
    updateItemPropsDisplay(row, path);
    renderCommonCaseIndicators();
}

function chgCase(path, delta, btn) {
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
    renderCommonCaseIndicators();
}

function updateRow(path) {
    const row = document.querySelector(`#categoryContents .row[data-path="${path}"]`);
    if (!row) return;
    const qtyInput = row.querySelector('.qty-input');
    if (qtyInput) qtyInput.value = getValue(path);
    const sq = getStockValue(path);
    const totalQty = getTotalQty(path);
    row.classList.toggle('selected-item', totalQty > 0);
    row.classList.toggle('overstock', totalQty > sq);
    const oldWarn = row.querySelector('.overstock-warning');
    if (oldWarn) oldWarn.remove();
    if (totalQty > sq) {
        const warn = document.createElement('span');
        warn.className = 'overstock-warning';
        warn.textContent = `⚠️ Больше нет (в наличии ${sq})`;
        row.querySelector('.controls').appendChild(warn);
    }
    updateItemPropsDisplay(row, path);
    updateNoteDisplay(row, path);
    renderCommonCaseIndicators();
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
        if (totalCases > 0) casesDisplay = `<span class="hl">📦 ${totalCases} кофр${totalCases>1?'а':''}</span>`;
    }
    dynDiv.innerHTML = `<span>⚖️ ${weightDisplay}</span><span>📦 ${volumeDisplay}</span>${casesDisplay}`;
    const propsDiv = row.querySelector('.props-compact');
    if (propsDiv) {
        const weightStatic = props.weight ? props.weight + ' кг' : '<span class="na">n/a</span>';
        const dimsStatic = props.dimensions || '<span class="na">n/a</span>';
        let caseStatic = '';
        const options = getCaseOptions(path);
        if (options.length > 0) {
            caseStatic = '📦 Кофр: ' + options.map(o => `${o.qty} шт`).join(', ');
        }
        propsDiv.innerHTML = `<span>⚖️ 1 шт: ${weightStatic}</span><span>📐 ${dimsStatic}</span>${caseStatic ? `<span>${caseStatic}</span>` : ''}`;
        propsDiv.classList.toggle('visible', showProps);
    }
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

function editNote(path) {
    const current = notes[path] || '';
    const newNote = prompt('Введите заметку для позиции:', current);
    if (newNote === null) return;
    if (newNote.trim() === '') {
        delete notes[path];
    } else {
        notes[path] = newNote.trim();
    }
    saveOrderData();
    const row = document.querySelector(`#categoryContents .row[data-path="${esc(path)}"]`);
    if (row) updateNoteDisplay(row, path);
    showToast('Заметка сохранена');
}

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
    totalsDiv.innerHTML = `<span><strong>Итого в категории:</strong> ${qty} шт</span><span><strong>Вес:</strong> ${weight.toFixed(1)} кг</span><span><strong>Объём:</strong> ${volume.toFixed(3)} м³</span>${cases > 0 ? `<span><strong>Кофров:</strong> ${cases} шт</span>` : ''}`;
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
    renderCommonCaseIndicators();
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
// ПОИСК
// ============================================================
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
    renderCommonCaseIndicators();
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
    renderCommonCaseIndicators();
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
        showToast(mode.accumulate ? 'Режим "Копиться в кофре" включён' : 'Режим "Копиться в кофре" выключен');
        renderCommonCaseIndicators();
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
        showToast('Вариант кофра выбран');
        const dropdown = item.closest('.case-dropdown');
        if (dropdown) dropdown.classList.remove('open');
        renderCommonCaseIndicators();
    }
}

function toggleCaseDropdown(path, btn) {
    const row = btn.closest('.row');
    const dropdown = row.querySelector('.case-dropdown');
    if (dropdown) {
        dropdown.classList.toggle('open');
        document.querySelectorAll('.case-dropdown.open').forEach(d => {
            if (d !== dropdown) d.classList.remove('open');
        });
    }
}

function openAltCaseModal(path) {
    showToast('Альтернативный кофр (будет реализован позже)');
}

function toggleMultiMode(path) {
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
            const newVals = [total];
            setIndividualCaseValues(path, newVals);
        } else {
            setIndividualCaseValues(path, []);
        }
    }
    renderOrderCategory(currentCategory);
}

function renderCommonCaseIndicators() {
    // Заглушка – будет реализована позже
}

function updateLinkCount() {
    let count = 0;
    for (let src in links) count += links[src].length;
    document.getElementById('linkCount').textContent = `(${count} активных)`;
}

function openLinkModal(sourcePath) {
    showToast('Матрица привязок (будет реализована позже)');
}

function openRouteModal(path) {
    showToast('Маршрут (будет реализован позже) для ' + path);
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
    updateTotals();
    document.querySelectorAll('.props-compact').forEach(el => el.classList.toggle('visible', showProps));
    updateLinkCount();
    applySearch();
    if (detailsOpen) {
        document.getElementById('globalDetails').classList.add('open');
        document.getElementById('detailToggle').textContent = '📊 Скрыть';
    } else {
        document.getElementById('globalDetails').classList.remove('open');
        document.getElementById('detailToggle').textContent = '📊 Подробно';
    }
    renderCommonCaseIndicators();
}

// ============================================================
// ЭКСПОРТ ДЛЯ ВНЕШНЕГО ИСПОЛЬЗОВАНИЯ
// ============================================================
export { applySearch, clearSearch, renderOrderCategory };

// ============================================================
// ОБРАБОТЧИКИ ДЛЯ КНОПОК СТРАНИЦЫ ЗАКАЗА (инициализация)
// ============================================================
export function initOrderUI() {
    document.getElementById('togglePropsBtn')?.addEventListener('click', function() {
        showProps = !showProps;
        document.getElementById('propsStatus').textContent = showProps ? '(свойства видны)' : '(свойства скрыты)';
        localStorage.setItem('showProps', JSON.stringify(showProps));
        document.querySelectorAll('.props-compact').forEach(el => el.classList.toggle('visible', showProps));
    });

    document.getElementById('detailToggle')?.addEventListener('click', function() {
        const details = document.getElementById('globalDetails');
        details.classList.toggle('open');
        detailsOpen = details.classList.contains('open');
        localStorage.setItem('detailsOpen', JSON.stringify(detailsOpen));
        this.textContent = detailsOpen ? '📊 Скрыть' : '📊 Подробно';
    });
}