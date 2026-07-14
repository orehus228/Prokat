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
// ПОСТРОЕНИЕ СТРОКИ (обновлено для новых режимов)
// ============================================================

export function buildItemRow(fullPath, level) {
    const sq = getStockValue(fullPath);
    const hasDesc = !!(editorData.specs && editorData.specs[fullPath]);
    const hasLink = links[fullPath] && links[fullPath].length > 0;
    const props = getItemProps(fullPath);
    const hasCase = (props.individualCases && props.individualCases.length > 0) || props.allowCommon;
    const mode = getCaseMode(fullPath);
    const packing = getOrderPacking(fullPath);
    const individualVals = getIndividualCaseValues(fullPath);
    const extra = getOrderExtra(fullPath);
    const options = getCaseOptions(fullPath);
    
    // Определяем режим и информацию для отображения
    let totalQty = getTotalQty(fullPath);
    const isAdded = totalQty > 0;
    const overstock = totalQty > sq;
    const isInfoOpen = infoBlocksOpen[fullPath] || false;
    const hasNote = !!(notes[fullPath] && notes[fullPath].trim());
    
    // Определяем статус кофров для кнопки
    let caseStatusText = 'Кофры';
    let caseStatusClass = '';
    let caseInfo = ''; // дополнительная информация в строке
    
    if (packing.length > 0) {
        caseStatusText = 'Общие';
        caseStatusClass = 'common';
        // Показываем краткую информацию о заполненности
        const commonCases = getCommonCases();
        let totalWeight = 0;
        packing.forEach(p => {
            const c = commonCases.find(c => c.id === p.caseId);
            if (c && c.maxWeight) {
                totalWeight += p.pieces * (props.weight || 0);
            }
        });
        if (totalWeight > 0) {
            caseInfo = `📦 ${packing.length} кофр${packing.length > 1 ? 'а' : ''}`;
        }
    } else if (mode.enabled && individualVals.length > 1) {
        caseStatusText = 'Мульти';
        caseStatusClass = 'multi';
        const totalCases = individualVals.reduce((sum, v, idx) => {
            if (v <= 0) return sum;
            const opt = options[idx] || options[0];
            return sum + Math.ceil(v / opt.qty);
        }, 0);
        caseInfo = `🔄 ${totalCases} кофр${totalCases > 1 ? 'а' : ''}`;
    } else if (mode.enabled && individualVals.length === 1) {
        const opt = getSelectedOption(fullPath);
        const val = individualVals[0] || 0;
        if (opt && val > 0) {
            const casesCount = Math.ceil(val / opt.qty);
            caseStatusText = 'Вкл';
            caseStatusClass = 'on';
            caseInfo = `📦 ${casesCount} кофр${casesCount > 1 ? 'а' : ''} (${val} шт)`;
        } else {
            caseStatusText = 'Выкл';
            caseStatusClass = 'off';
        }
    } else if (hasCase) {
        caseStatusText = 'Выкл';
        caseStatusClass = 'off';
    }

    let weightDisplay = '0 кг', volumeDisplay = '0 м³';
    if (props.weight !== undefined && props.weight !== null && props.weight > 0) {
        const w = calcItemWeightWithMode(fullPath, totalQty);
        weightDisplay = w.toFixed(1) + ' кг';
    }
    if (props.dimensions && props.dimensions.trim() !== '') {
        const v = calcItemVolumeWithMode(fullPath, totalQty);
        volumeDisplay = v.toFixed(3) + ' м³';
    }
    
    const infoHtml = buildInfoHtml(fullPath, props, mode);
    const escapedName = esc(fullPath.split('|').pop());
    const rowClass = (isAdded ? 'added' : '') + (overstock ? ' overstock' : '');

    const linkClass = hasLink ? 'active' : '';
    const noteClass = hasNote ? 'has-note' : '';
    const caseClass = mode.enabled ? 'active' : '';

    let extraInfo = '';
    if (totalQty > 0 || sq > 0) {
        extraInfo = `<div class="extra-info">
            <span><strong>${totalQty}</strong> шт добавлено</span>
            <span>в наличии: <strong>${sq}</strong></span>
            ${weightDisplay !== '0 кг' ? `<span>${weightDisplay}</span>` : ''}
            ${volumeDisplay !== '0 м³' ? `<span>${volumeDisplay}</span>` : ''}
            ${caseInfo ? `<span>${caseInfo}</span>` : ''}
        </div>`;
    }

    let html = `<div class="row ${rowClass}" data-path="${esc(fullPath)}" data-search="${fullPath}">
        <div class="name-area">
            <span class="name">${escapedName}</span>
            ${extraInfo}
        </div>
        <div class="action-buttons">
            <button class="action-btn info-btn" data-path="${esc(fullPath)}" title="Информация">Инфо</button>
            ${hasDesc ? `<button class="action-btn desc-btn" data-path="${esc(fullPath)}">Описание</button>` : ''}
            <button class="action-btn link-btn ${linkClass}" data-path="${esc(fullPath)}" title="Линк">Линк${hasLink ? ' ✓' : ''}</button>
            ${hasCase ? `<button class="action-btn case-btn ${caseClass} ${caseStatusClass}" data-path="${esc(fullPath)}" title="Настройка кофров">${caseStatusText}</button>` : ''}
            <button class="action-btn note-btn ${noteClass}" data-path="${esc(fullPath)}" title="Заметка">Заметка${hasNote ? ' ✓' : ''}</button>
        </div>
        <div class="qty-controls">
            <span class="weight-vol-display" style="display:none !important;">${weightDisplay} / ${volumeDisplay}</span>
            <span class="stock-info" style="display:none !important;">в наличии: ${sq}</span>
            ${(!mode.enabled || individualVals.length === 0 || individualVals.length === 1) && packing.length === 0 ? `
                <button class="btn-c qty-btn" data-path="${esc(fullPath)}" data-delta="-1">−</button>
                <input type="number" class="qty-input" value="${totalQty}" min="0" step="1" data-path="${esc(fullPath)}">
                <button class="btn-c qty-btn" data-path="${esc(fullPath)}" data-delta="1">+</button>
            ` : `
                <span style="font-size:13px;color:var(--text-secondary);">${totalQty} шт</span>
            `}
        </div>
    </div>`;
    if (isInfoOpen) {
        html += `<div class="row-info">${infoHtml}</div>`;
    }
    if (hasDesc) {
        html += `<div class="desc-block" data-path="${esc(fullPath)}">${esc(editorData.specs[fullPath])}</div>`;
    }
    if (hasLink) {
        links[fullPath].forEach(link => {
            html += `<div style="font-size:13px;color:var(--text-secondary);padding-left:${level*20+20}px;width:100%;flex-basis:100%;">→ ${link.target} (×${link.multiplier})</div>`;
        });
    }

    // Дочерние строки (рендерятся через updateChildRowsForPath, но мы вызываем его отдельно)
    // Здесь не добавляем дочерние строки, чтобы избежать дублирования

    return html;
}

// ============================================================
// ОБНОВЛЕНИЕ СТРОКИ
// ============================================================

export function updateRowOrder(path) {
    const row = document.querySelector(`#categoryContents .row[data-path="${path}"]`);
    if (!row) return;
    const sq = getStockValue(path);
    const mode = getCaseMode(path);
    const individualVals = getIndividualCaseValues(path);
    const packing = getOrderPacking(path);
    const totalQty = getTotalQty(path);
    
    const isAdded = totalQty > 0;
    const isOverstock = totalQty > sq;
    row.classList.toggle('added', isAdded);
    row.classList.toggle('overstock', isOverstock);

    // Обновляем контролы количества
    const qtyInput = row.querySelector('.qty-input');
    const controls = row.querySelector('.qty-controls');
    if (qtyInput) {
        // Если включён режим кофров (кроме off) или есть упаковка, скрываем поле ввода
        const isCaseMode = (mode.enabled && (individualVals.length > 0 || packing.length > 0));
        if (isCaseMode || packing.length > 0) {
            qtyInput.style.display = 'none';
            // Показываем статическое количество
            let staticSpan = controls.querySelector('.static-qty');
            if (!staticSpan) {
                staticSpan = document.createElement('span');
                staticSpan.className = 'static-qty';
                staticSpan.style.cssText = 'font-size:13px;color:var(--text-secondary);';
                controls.prepend(staticSpan);
            }
            staticSpan.textContent = `${totalQty} шт`;
            // Скрываем кнопки +/-
            const btns = controls.querySelectorAll('.qty-btn');
            btns.forEach(btn => btn.style.display = 'none');
        } else {
            qtyInput.style.display = 'inline-block';
            qtyInput.value = totalQty;
            const staticSpan = controls.querySelector('.static-qty');
            if (staticSpan) staticSpan.remove();
            const btns = controls.querySelectorAll('.qty-btn');
            btns.forEach(btn => btn.style.display = 'inline-flex');
        }
    }

    // Обновляем extra-info
    const extraInfo = row.querySelector('.extra-info');
    if (extraInfo) {
        let info = '';
        if (totalQty > 0 || sq > 0) {
            info = `<span><strong>${totalQty}</strong> шт добавлено</span>
                    <span>в наличии: <strong>${sq}</strong></span>`;
            const props = getItemProps(path);
            if (props.weight !== undefined && props.weight !== null && props.weight > 0) {
                const w = calcItemWeightWithMode(path, totalQty);
                info += `<span>${w.toFixed(1)} кг</span>`;
            }
            if (props.dimensions && props.dimensions.trim() !== '') {
                const v = calcItemVolumeWithMode(path, totalQty);
                info += `<span>${v.toFixed(3)} м³</span>`;
            }
            // Добавляем информацию о кофрах
            if (packing.length > 0) {
                info += `<span>📦 ${packing.length} кофр${packing.length > 1 ? 'а' : ''}</span>`;
            } else if (mode.enabled && individualVals.length > 1) {
                const options = getCaseOptions(path);
                let totalCases = 0;
                individualVals.forEach((v, idx) => {
                    if (v <= 0) return;
                    const opt = options[idx] || options[0];
                    totalCases += Math.ceil(v / opt.qty);
                });
                info += `<span>🔄 ${totalCases} кофр${totalCases > 1 ? 'а' : ''}</span>`;
            } else if (mode.enabled && individualVals.length === 1) {
                const opt = getSelectedOption(path);
                const val = individualVals[0] || 0;
                if (opt && val > 0) {
                    const casesCount = Math.ceil(val / opt.qty);
                    info += `<span>📦 ${casesCount} кофр${casesCount > 1 ? 'а' : ''}</span>`;
                }
            }
        }
        extraInfo.innerHTML = info;
    }

    // Обновляем вес/объём
    const weightVolDisplay = row.querySelector('.weight-vol-display');
    if (weightVolDisplay) {
        const props = getItemProps(path);
        let weightDisplay = '0 кг', volumeDisplay = '0 м³';
        if (props.weight !== undefined && props.weight !== null && props.weight > 0) {
            const w = calcItemWeightWithMode(path, totalQty);
            weightDisplay = w.toFixed(1) + ' кг';
        }
        if (props.dimensions && props.dimensions.trim() !== '') {
            const v = calcItemVolumeWithMode(path, totalQty);
            volumeDisplay = v.toFixed(3) + ' м³';
        }
        weightVolDisplay.textContent = weightDisplay + ' / ' + volumeDisplay;
    }

    // Обновляем состояние кнопок
    const linkBtn = row.querySelector('.link-btn');
    if (linkBtn) {
        const hasLink = links[path] && links[path].length > 0;
        linkBtn.textContent = 'Линк' + (hasLink ? ' ✓' : '');
        linkBtn.classList.toggle('active', hasLink);
    }
    const noteBtn = row.querySelector('.note-btn');
    if (noteBtn) {
        const hasNote = !!(notes[path] && notes[path].trim());
        noteBtn.textContent = 'Заметка' + (hasNote ? ' ✓' : '');
        noteBtn.classList.toggle('has-note', hasNote);
    }
    const caseBtn = row.querySelector('.case-btn');
    if (caseBtn) {
        const mode = getCaseMode(path);
        const isOn = mode.enabled || false;
        const packing = getOrderPacking(path);
        const individualVals = getIndividualCaseValues(path);
        const options = getCaseOptions(path);
        
        let statusText = 'Кофры';
        let statusClass = '';
        if (packing.length > 0) {
            statusText = 'Общие';
            statusClass = 'common';
        } else if (mode.enabled && individualVals.length > 1) {
            statusText = 'Мульти';
            statusClass = 'multi';
        } else if (mode.enabled && individualVals.length === 1) {
            statusText = 'Вкл';
            statusClass = 'on';
        } else {
            statusText = 'Выкл';
            statusClass = 'off';
        }
        caseBtn.textContent = statusText;
        caseBtn.className = 'action-btn case-btn ' + (isOn ? 'active ' : '') + statusClass;
    }

    // Обновляем дочерние строки
    updateChildRowsForPath(path);
}

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
    // Уже настроено через делегирование в initOrderUI
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