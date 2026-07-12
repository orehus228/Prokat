// render-order.js — Отрисовка страницы создания заказа (плоский список для поиска, защита от циклов)
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
    isExcludedFromLoading,
    setExcludeFromLoading,
    orderExclude
} from './order.js';

// ============================================================
// СОСТОЯНИЕ СТРАНИЦЫ ЗАКАЗА
// ============================================================
let currentCategory = 'sound';
let searchMode = false;
let searchQuery = '';
let detailsOpen = false;
const infoBlocksOpen = {};

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
// ПОЛУЧЕНИЕ ВСЕХ ПУТЕЙ ПОЗИЦИЙ (плоский список)
// ============================================================
function getAllItemPaths() {
    const result = [];
    function traverse(obj, path) {
        if (Array.isArray(obj)) {
            obj.forEach(item => {
                const fullPath = path.length ? path.join('|') + '|' + item : item;
                result.push(fullPath);
            });
        } else if (typeof obj === 'object' && obj !== null) {
            const keys = Object.keys(obj).filter(k => !k.startsWith('_'));
            keys.forEach(key => {
                traverse(obj[key], [...path, key]);
            });
        }
    }
    traverse(editorData.inventory, []);
    return result;
}

// ============================================================
// ОТРИСОВКА ВКЛАДОК КАТЕГОРИЙ
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
        tab.className = 'category-tab' + (key === currentCategory ? ' active' : '');
        tab.textContent = CAT_NAMES[key] || key;
        tab.dataset.cat = key;
        tab.addEventListener('click', () => {
            if (searchMode) { document.getElementById('searchInput').value = ''; searchMode = false; searchQuery = ''; }
            currentCategory = key;
            renderOrderTabs();
            renderOrderCategory(key);
            setupInputListeners();
            setupActionButtons();
            updateTotals();
            updateLinkCount();
        });
        container.appendChild(tab);
    });
    if (!orderKeys.includes(currentCategory)) {
        currentCategory = orderKeys[0];
    }
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
        // Режим поиска — плоский список
        const allPaths = getAllItemPaths();
        const query = searchQuery.toLowerCase();
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
        } else {
            // Группируем по категориям для отображения
            const grouped = {};
            filteredPaths.forEach(path => {
                const cat = path.split('|')[0];
                if (!grouped[cat]) grouped[cat] = [];
                grouped[cat].push(path);
            });
            let html = '';
            const orderKeys = (editorData._categoryOrder || Object.keys(editorData.inventory))
                .filter(key => editorData.inventory && editorData.inventory[key] !== undefined);
            orderKeys.forEach(cat => {
                if (!grouped[cat]) return;
                html += `<div class="sub-cat-t">${CAT_NAMES[cat]||cat}</div>`;
                // Для каждой позиции в этой категории рисуем строку
                grouped[cat].forEach(path => {
                    html += buildItemRow(path, 0);
                });
            });
            wrapper.innerHTML = html;
        }
    } else {
        // Обычный режим — только текущая категория
        const catData = editorData.inventory && editorData.inventory[catKey];
        if (!catData) {
            wrapper.innerHTML = '<div class="empty-message">Категория пуста</div>';
            container.appendChild(wrapper);
            return;
        }
        // Используем упрощённый обход без глубокой рекурсии
        wrapper.innerHTML = buildCategoryHTMLFlat(catData, [catKey], 0);
    }

    container.appendChild(wrapper);
    setupInputListeners();
    setupActionButtons();
    document.querySelectorAll('#categoryContents .row').forEach(row => {
        const path = row.dataset.path;
        if (path) { updateRow(path); }
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

// ============================================================
// ПОСТРОЕНИЕ HTML ДЛЯ КАТЕГОРИИ (плоское, без глубокой рекурсии)
// ============================================================
function buildCategoryHTMLFlat(data, path, level) {
    if (level > 5) return ''; // ограничим глубину
    let html = '';
    if (Array.isArray(data)) {
        data.forEach(item => {
            const fullPath = path.length ? path.join('|') + '|' + item : item;
            html += buildItemRow(fullPath, level);
        });
        return html;
    } else if (typeof data === 'object' && data !== null) {
        const keys = Object.keys(data).filter(k => !k.startsWith('_'));
        keys.forEach(key => {
            const childPath = [...path, key];
            const isSubSub = level >= 2;
            if (isSubSub) html += `<div class="sub-sub-cat-t">${key}</div>`;
            else html += `<div class="sub-cat-t">${key}</div>`;
            html += buildCategoryHTMLFlat(data[key], childPath, level + 1);
        });
        return html;
    }
    return '';
}

// ============================================================
// ПОСТРОЕНИЕ СТРОКИ ДЛЯ ОДНОЙ ПОЗИЦИИ
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
}

// ============================================================
// НАСТРОЙКА КНОПОК В СТРОКЕ
// ============================================================
function setupActionButtons() {
    document.querySelectorAll('#categoryContents .info-btn').forEach(btn => {
        btn.removeEventListener('click', toggleInfo);
        btn.addEventListener('click', toggleInfo);
    });
    document.querySelectorAll('#categoryContents .desc-btn').forEach(btn => {
        btn.removeEventListener('click', toggleDesc);
        btn.addEventListener('click', toggleDesc);
    });
    document.querySelectorAll('#categoryContents .link-btn').forEach(btn => {
        btn.removeEventListener('click', openLink);
        btn.addEventListener('click', openLink);
    });
    document.querySelectorAll('#categoryContents .case-btn').forEach(btn => {
        btn.removeEventListener('click', openCaseSettings);
        btn.addEventListener('click', openCaseSettings);
    });
    document.querySelectorAll('#categoryContents .note-btn').forEach(btn => {
        btn.removeEventListener('click', openNoteEditor);
        btn.addEventListener('click', openNoteEditor);
    });
}

function toggleInfo(e) {
    const btn = e.currentTarget;
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

function toggleDesc(e) {
    const btn = e.currentTarget;
    const path = btn.dataset.path;
    const block = document.querySelector(`.desc-block[data-path="${path}"]`);
    if (block) {
        block.classList.toggle('open');
        btn.textContent = block.classList.contains('open') ? 'Скрыть описание' : 'Описание';
    }
}

function openLink(e) {
    const btn = e.currentTarget;
    const path = btn.dataset.path;
    import('./cases.js').then(module => {
        module.openMatrixModal(path);
    });
}

function openCaseSettings(e) {
    const btn = e.currentTarget;
    const path = btn.dataset.path;
    import('./cases.js').then(module => {
        module.openCaseSettingsModal(path, () => {
            updateRow(path);
            updateTotals();
            updateCategoryTotals(currentCategory);
        });
    });
}

async function openNoteEditor(e) {
    const btn = e.currentTarget;
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
    const orderKeys = (editorData._categoryOrder || Object.keys(editorData.inventory))
        .filter(key => editorData.inventory && editorData.inventory[key] !== undefined);
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
        if (!searchMode) { searchMode = true; currentCategory = 'all'; }
        renderOrderCategory('all');
    } else {
        if (searchMode) { searchMode = false; 
            const orderKeys = (editorData._categoryOrder || Object.keys(editorData.inventory))
                .filter(key => editorData.inventory && editorData.inventory[key] !== undefined);
            currentCategory = orderKeys[0] || 'sound'; 
        }
        renderOrderCategory(currentCategory);
    }
}

function clearSearch() {
    document.getElementById('searchInput').value = '';
    searchQuery = '';
    if (searchMode) { searchMode = false; 
        const orderKeys = (editorData._categoryOrder || Object.keys(editorData.inventory))
            .filter(key => editorData.inventory && editorData.inventory[key] !== undefined);
        currentCategory = orderKeys[0] || 'sound';
    }
    renderOrderCategory(currentCategory);
}

// ============================================================
// ОБРАБОТЧИКИ ВВОДА
// ============================================================
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
    updateRow(path);
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

// ============================================================
// ЭКСПОРТ ЗАКАЗА В PDF
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
    const orderKeys = (editorData._categoryOrder || Object.keys(editorData.inventory))
        .filter(key => editorData.inventory && editorData.inventory[key] !== undefined);
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
    for (let key in orderExclude) delete orderExclude[key];
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
    setupInputListeners();
    setupActionButtons();
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
    detailsOpen = localStorage.getItem('detailsOpen') === 'true';

    document.getElementById('detailToggle')?.addEventListener('click', function() {
        const details = document.getElementById('globalDetails');
        details.classList.toggle('open');
        detailsOpen = details.classList.contains('open');
        localStorage.setItem('detailsOpen', JSON.stringify(detailsOpen));
        this.textContent = detailsOpen ? 'Скрыть' : 'Подробно';
    });

    document.getElementById('searchInput')?.addEventListener('input', debouncedSearch);
    document.getElementById('clearSearchBtn')?.addEventListener('click', clearSearch);

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