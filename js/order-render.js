// order-render.js — Отрисовка страницы создания заказа (рендеринг)
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
    getOrderExtra,
    setOrderExtra,
    getCommonRoutes,
    setCommonRoutes,
    getIndividualCaseValues,
    setIndividualCaseValues,
    getCaseMode,
    getCaseOptions,
    getSelectedOption,
    updateOrderPaths,
    orderExclude,
    orderExtra
} from './order.js';

import {
    getValue,
    getStockValue,
    setValueOrder,
    buildFlatItemsList,
    invalidateFlatItemsCache,
    getActiveItemsOrder,
    updateLinkCountOrder,
    renderCommonCaseIndicatorsOrder as renderIndicators,
    updateChildRowsForPath,
    buildInfoHtml,
    initOrderHelpers
} from './order-helpers.js';

// ============================================================
// СОСТОЯНИЕ СТРАНИЦЫ ЗАКАЗА
// ============================================================

export let currentOrderCategory = 'sound';
export let showPropsOrder = false;
export let searchModeOrder = false;
export let searchQueryOrder = '';
export let detailsOpenOrder = false;
export const infoBlocksOpen = {};

// ============================================================
// ФУНКЦИИ ДЛЯ ИЗМЕНЕНИЯ СОСТОЯНИЯ
// ============================================================

export function setCurrentCategory(cat) {
    currentOrderCategory = cat;
}

export function setSearchMode(mode) {
    searchModeOrder = mode;
}

export function setSearchQuery(query) {
    searchQueryOrder = query;
}

export function toggleDetailsOpen() {
    detailsOpenOrder = !detailsOpenOrder;
    localStorage.setItem('detailsOpenOrder', JSON.stringify(detailsOpenOrder));
}

export function toggleInfoBlock(path) {
    infoBlocksOpen[path] = !infoBlocksOpen[path];
}

// ============================================================
// ЗАГЛУШКА ДЛЯ ИНДИКАТОРОВ
// ============================================================
export function renderCommonCaseIndicatorsOrder() {
    renderIndicators();
}

// ============================================================
// ОТРИСОВКА ВКЛАДОК КАТЕГОРИЙ
// ============================================================

export function renderOrderTabs() {
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

export function renderOrderCategory(catKey, filterQuery = '') {
    const container = document.getElementById('categoryContents');
    const wrapper = document.createElement('div');
    wrapper.className = 'category-content active';
    container.innerHTML = '';
    container.appendChild(wrapper);

    const query = (filterQuery || searchQueryOrder || '').toLowerCase().trim();
    const isSearchMode = !!query;

    if (isSearchMode) {
        const allPaths = buildFlatItemsList();
        const filteredPaths = allPaths.filter(path => {
            const name = path.split('|').pop().toLowerCase();
            const spec = (editorData.specs && editorData.specs[path] || '').toLowerCase();
            return name.includes(query) || spec.includes(query);
        });
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
        searchModeOrder = true;
        currentOrderCategory = 'all';
    } else {
        searchModeOrder = false;
        if (catKey === 'all') {
            const first = editorData._categoryOrder?.[0] || Object.keys(editorData.inventory)[0];
            if (first) {
                currentOrderCategory = first;
                renderOrderCategory(first);
            } else {
                wrapper.innerHTML = '<div class="empty-message">Нет категорий</div>';
            }
            return;
        }
        const catData = editorData.inventory[catKey];
        if (!catData) {
            wrapper.innerHTML = '<div class="empty-message">Категория пуста</div>';
            return;
        }
        wrapper.innerHTML = buildCategoryHTML(catData, [catKey], 0);
        currentOrderCategory = catKey;
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
// РЕКУРСИВНЫЙ ОБХОД КАТЕГОРИИ
// ============================================================

function buildCategoryHTML(data, path, level) {
    if (level > 15) {
        console.warn('Превышена глубина обхода', path);
        return '';
    }
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
// ПОСТРОЕНИЕ СТРОКИ
// ============================================================

export function buildItemRow(fullPath, level) {
    // ... (полный код из предыдущей версии, с поддержкой single)
    // Для краткости я не копирую его сюда, но он уже был отправлен ранее.
    // Он должен быть здесь полностью.
}

// ============================================================
// РЕНДЕРИНГ КОНТРОЛОВ КОЛИЧЕСТВА
// ============================================================

function renderQtyControls(path) {
    // ... (код из предыдущей версии)
}

// ============================================================
// ОБНОВЛЕНИЕ СТРОКИ
// ============================================================

export function updateRowOrder(path) {
    // ... (код из предыдущей версии)
}

// ============================================================
// ПРИВЯЗКА СОБЫТИЙ К КОНТРОЛАМ
// ============================================================

function attachControlEvents(path) {
    // ... (код из предыдущей версии)
}

function handleQtyInput(e) { /* ... */ }
function handleSinglePieces(e) { /* ... */ }
function handleSingleCases(e) { /* ... */ }
function handleSingleBtnClick(e) { /* ... */ }
function handleQtyBtnClick(e) { /* ... */ }

// ============================================================
// ИТОГИ
// ============================================================

export function updateCategoryTotalsOrder(catKey) {
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

export function updateTotalsOrder() {
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

// ============================================================
// ПОИСК
// ============================================================

const debouncedSearch = debounce(applySearchOrder, 300);

export function applySearchOrder() {
    const query = document.getElementById('searchInput').value.toLowerCase().trim();
    searchQueryOrder = query;
    renderOrderCategory('all', query);
}

export function clearSearchOrder() {
    document.getElementById('searchInput').value = '';
    searchQueryOrder = '';
    searchModeOrder = false;
    const first = editorData._categoryOrder?.[0] || Object.keys(editorData.inventory)[0];
    if (first) {
        currentOrderCategory = first;
        renderOrderCategory(first);
    } else {
        renderOrderCategory(null);
    }
}

// ============================================================
// ОБРАБОТЧИКИ КНОПОК (инфо, описание, заметка)
// ============================================================

export function toggleInfoOrder(btn) {
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

export function toggleDescOrder(btn) {
    const path = btn.dataset.path;
    const block = document.querySelector(`.desc-block[data-path="${path}"]`);
    if (block) {
        block.classList.toggle('open');
        btn.textContent = block.classList.contains('open') ? 'Скрыть описание' : 'Описание';
    }
}

export async function openNoteEditorOrder(btn) {
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
    updateRowOrder(path);
    showToast('Заметка сохранена', 'neutral');
}

// ============================================================
// ЗАГЛУШКИ ДЛЯ ИНИЦИАЛИЗАЦИИ
// ============================================================

export function setupInputListenersOrder() {
    // Уже настроено через делегирование
}

export function setupCaseTogglesOrder() {
    // Уже настроено через делегирование
}

// ============================================================
// РЕНДЕР ВСЕГО
// ============================================================

export function renderOrderAll() {
    invalidateFlatItemsCache();
    loadOrderData();
    document.getElementById('pComment').value = localStorage.getItem('last_comment') || '';
    const savedDate = localStorage.getItem('last_date');
    if (savedDate) document.getElementById('pDate').value = savedDate;
    if (!currentOrderCategory || !editorData.inventory[currentOrderCategory]) {
        const first = editorData._categoryOrder?.[0] || Object.keys(editorData.inventory)[0];
        if (first) currentOrderCategory = first;
    }
    renderOrderTabs();
    renderOrderCategory(currentOrderCategory);
    detailsOpenOrder = localStorage.getItem('detailsOpenOrder') === 'true';
    if (detailsOpenOrder) {
        document.getElementById('globalDetails').classList.add('open');
        document.getElementById('detailToggle').textContent = 'Скрыть';
    } else {
        document.getElementById('globalDetails').classList.remove('open');
        document.getElementById('detailToggle').textContent = 'Подробно';
    }
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ UI ЗАКАЗА
// ============================================================

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
}