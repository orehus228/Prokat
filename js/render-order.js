// render-order.js — С кэшированием HTML для каждой категории
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

// Кэш HTML-разметки для каждой категории
const categoryCache = {};

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
    // После изменения количества обновляем кэш для всех категорий? Нет, только пересчитываем строки
    // Но проще обновить только текущую видимую категорию
    updateTotals();
    updateCategoryTotals(currentCategory);
    updateRow(path);
}

// ============================================================
// ПОЛУЧЕНИЕ ВСЕХ ПУТЕЙ ПОЗИЦИЙ (плоский список)
// ============================================================
function getAllItemPaths() {
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

    const visited = new Set();
    while (stack.length > 0) {
        const { data, path } = stack.pop();
        if (typeof data === 'object' && data !== null) {
            if (visited.has(data)) continue;
            visited.add(data);
        }

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
// РЕНДЕРИНГ КАТЕГОРИИ (с кэшированием HTML)
// ============================================================
function renderOrderCategory(catKey) {
    const container = document.getElementById('categoryContents');

    // Если кэш для этой категории есть и мы не в режиме поиска, показываем из кэша
    if (!searchMode && categoryCache[catKey]) {
        container.innerHTML = categoryCache[catKey];
        // Навешиваем обработчики после вставки
        setupInputListeners();
        setupActionButtons();
        document.querySelectorAll('#categoryContents .row').forEach(row => {
            const path = row.dataset.path;
            if (path) { updateRow(path); }
        });
        updateCategoryTotals(catKey);
        updateTotals();
        updateLinkCount();
        return;
    }

    // Если нет кэша или режим поиска — строим заново
    const allPaths = getAllItemPaths();

    let filteredPaths = [];
    if (catKey === 'all' || searchMode) {
        const query = searchQuery.toLowerCase();
        filteredPaths = allPaths;
        if (query) {
            filteredPaths = allPaths.filter(path => {
                const name = path.split('|').pop();
                const spec = editorData.specs && editorData.specs[path] || '';
                return name.toLowerCase().includes(query) || spec.toLowerCase().includes(query);
            });
        }
    } else {
        filteredPaths = allPaths.filter(path => path.startsWith(catKey + '|'));
    }

    if (filteredPaths.length === 0) {
        container.innerHTML = '<div class="empty-message">Ничего не найдено</div>';
        return;
    }

    // Строим HTML
    let html = '';
    filteredPaths.forEach(path => {
        html += buildItemRow(path, 1);
    });

    // Сохраняем в кэш (если не поиск)
    if (!searchMode) {
        categoryCache[catKey] = html;
    }

    container.innerHTML = html;

    // Постобработка
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
// ПОСТРОЕНИЕ СТРОКИ ДЛЯ ОДНОЙ ПОЗИЦИИ (с кэшированием вычислений)
// ============================================================
// Кэш для расчётов веса/объёма
const calculationCache = {};

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

    // Кэшируем вычисления веса и объёма
    const cacheKey = fullPath + '|' + totalQty + '|' + mode.enabled + '|' + (mode.alt ? 'alt' : '');
    let weightDisplay, volumeDisplay;
    if (calculationCache[cacheKey]) {
        weightDisplay = calculationCache[cacheKey].weight;
        volumeDisplay = calculationCache[cacheKey].volume;
    } else {
        let w = 0, v = 0;
        if (props.weight) {
            w = calcItemWeightWithMode(fullPath, totalQty);
        }
        if (props.dimensions) {
            v = calcItemVolumeWithMode(fullPath, totalQty);
        }
        weightDisplay = w.toFixed(1) + ' кг';
        volumeDisplay = v.toFixed(3) + ' м³';
        calculationCache[cacheKey] = { weight: weightDisplay, volume: volumeDisplay };
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

// ... остальные функции (buildInfoHtml, setupQuantityDelegation, setupActionButtons, ...) без изменений
// Они не должны влиять на производительность, так как вызываются после рендера