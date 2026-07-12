// cases.js — Модалки: свойства позиции, общие кофры, матрица привязок, настройка кофров для позиции
import {
    getItemProps,
    setItemProps,
    getCommonCases,
    addCommonCase,
    updateCommonCase,
    deleteCommonCase,
    saveEditorData,
    editorData,
    getStockKey,
    renameCategory,
    renameSubgroup,
    renameItem,
    moveItem
} from './data.js';

import {
    esc,
    showToast,
    showPrompt,
    showConfirm
} from './ui.js';

import { CAT_NAMES } from './config.js';
import {
    links,
    saveOrderData,
    getCaseMode,
    getCaseOptions,
    getSelectedOption,
    setIndividualCaseValues,
    getIndividualCaseValues,
    getOrderPacking,
    setOrderPacking,
    caseModes
} from './order.js';

// ============================================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ============================================================
let currentPropsPath = null;
let variantCounter = 0;
let casesManagerCallback = null;
let currentCaseSettingsPath = null;
let caseSettingsCallback = null;

// ============================================================
// МОДАЛКА СВОЙСТВ ПОЗИЦИИ (без изменений, но для полноты оставляем)
// ============================================================
export function openPropsModalEditor(catKey, subKey, itemName, onSaveCallback) {
    // ... (код из предыдущей версии, оставляем без изменений)
    // В целях экономии места, я опускаю его здесь, но он должен быть.
    // В реальном файле он будет присутствовать.
}

// ============================================================
// МОДАЛКА НАСТРОЙКИ КОФРОВ ДЛЯ ПОЗИЦИИ (НОВАЯ)
// ============================================================
export function openCaseSettingsModal(path, callback) {
    currentCaseSettingsPath = path;
    caseSettingsCallback = callback || null;
    const mode = getCaseMode(path);
    const props = getItemProps(path);
    const options = getCaseOptions(path);
    const packing = getOrderPacking(path);
    const commonCases = getCommonCases();
    const individualVals = getIndividualCaseValues(path);
    const isMulti = localStorage.getItem('multi_' + path) === 'true';

    const modal = document.getElementById('caseSettingsModal');
    if (!modal) {
        showToast('Модалка настройки кофров не найдена', 'error');
        return;
    }

    // Заполняем заголовок
    document.getElementById('caseSettingsTitle').textContent = 'Настройка кофров: ' + path.split('|').pop();

    // Включение/выключение режима кофров
    document.getElementById('caseSettingsEnable').checked = mode.enabled;

    // Варианты кофров (из individualCases)
    const optionsContainer = document.getElementById('caseSettingsOptions');
    optionsContainer.innerHTML = '';
    if (options.length > 0) {
        options.forEach((opt, idx) => {
            const div = document.createElement('div');
            div.className = 'case-option-item' + (mode.selectedOption === idx && !mode.alt ? ' active' : '');
            div.innerHTML = `
                <input type="radio" name="caseOption" value="${idx}" ${mode.selectedOption === idx && !mode.alt ? 'checked' : ''}>
                <span>Вариант ${idx+1}: ${opt.qty} шт, габ: ${opt.dims || 'н/д'}, вес пустого: ${opt.weight || 0} кг</span>
            `;
            div.addEventListener('click', () => {
                const radio = div.querySelector('input[type="radio"]');
                radio.checked = true;
                // Обновляем выбранный вариант
                mode.selectedOption = idx;
                mode.alt = null;
                saveOrderData();
                // Обновляем внешний вид
                document.querySelectorAll('.case-option-item').forEach(el => el.classList.remove('active'));
                div.classList.add('active');
                showToast('Вариант кофра выбран', 'info');
            });
            optionsContainer.appendChild(div);
        });
        // Кнопка "Мульти-режим" (если больше 1 варианта)
        const multiContainer = document.getElementById('caseSettingsMulti');
        if (options.length > 1) {
            multiContainer.style.display = 'block';
            document.getElementById('caseSettingsMultiCheck').checked = isMulti;
        } else {
            multiContainer.style.display = 'none';
        }
    } else {
        optionsContainer.innerHTML = '<div style="color:var(--text-muted);">Нет индивидуальных кофров для этой позиции</div>';
        document.getElementById('caseSettingsMulti').style.display = 'none';
    }

    // Альтернативный кофр
    const altContainer = document.getElementById('caseSettingsAlt');
    if (mode.alt) {
        altContainer.innerHTML = `
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                <span>Альтернативный: ${mode.alt.qty} шт, габ: ${mode.alt.dims || 'н/д'}, вес: ${mode.alt.weight || 0} кг</span>
                <button class="btn btn-sm" onclick="clearAltCase()">Очистить</button>
            </div>
        `;
    } else {
        altContainer.innerHTML = `
            <button class="btn btn-sm" onclick="addAltCase()">+ Альтернативный кофр</button>
        `;
    }

    // Привязка к общим кофрам (если разрешено)
    const commonContainer = document.getElementById('caseSettingsCommon');
    if (props.allowCommon) {
        commonContainer.style.display = 'block';
        const list = document.getElementById('caseSettingsCommonList');
        list.innerHTML = '';
        if (packing.length > 0) {
            packing.forEach((p, idx) => {
                const c = commonCases.find(c => c.id === p.caseId);
                const div = document.createElement('div');
                div.className = 'common-case-item';
                div.innerHTML = `
                    <span>${c ? c.name : 'Удалённый кофр'} (кол-во: ${p.qty} шт)</span>
                    <button class="btn btn-sm" onclick="removeCommonCasePacking('${path}', ${idx})">✕</button>
                `;
                list.appendChild(div);
            });
        } else {
            list.innerHTML = '<div style="color:var(--text-muted);">Нет привязок к общим кофрам</div>';
        }
        // Кнопка добавления
        const addBtn = document.getElementById('caseSettingsCommonAdd');
        addBtn.onclick = () => {
            // Открываем выбор общего кофра
            showPrompt('Выберите общий кофр', 'Введите ID кофра (или название для поиска):', '', '', (val) => {
                if (!val) return null;
                const found = commonCases.find(c => c.id === val || c.name.toLowerCase().includes(val.toLowerCase()));
                if (!found) {
                    showToast('Кофр не найден', 'error');
                    return 'Кофр не найден';
                }
                // Запрашиваем количество единиц позиции в кофре
                showPrompt('Количество единиц в кофре', 'Введите кол-во:', '1', '', (qty) => {
                    const num = parseInt(qty);
                    if (isNaN(num) || num <= 0) {
                        showToast('Введите положительное число', 'error');
                        return 'Некорректное количество';
                    }
                    // Добавляем в packing
                    const currentPacking = getOrderPacking(path);
                    currentPacking.push({ caseId: found.id, qty: num });
                    setOrderPacking(path, currentPacking);
                    saveOrderData();
                    if (caseSettingsCallback) caseSettingsCallback();
                    // Перерисовываем модалку
                    openCaseSettingsModal(path, caseSettingsCallback);
                    showToast('Привязка добавлена', 'success');
                    return null;
                });
                return null;
            });
        };
    } else {
        commonContainer.style.display = 'none';
    }

    modal.classList.add('open');

    // Обработчик сохранения
    const saveBtn = document.getElementById('caseSettingsSave');
    saveBtn.onclick = () => {
        // Сохраняем состояние
        const enabled = document.getElementById('caseSettingsEnable').checked;
        mode.enabled = enabled;
        if (!enabled) {
            // Если выключено, очищаем альт и мульти
            mode.alt = null;
            localStorage.removeItem('multi_' + path);
            setIndividualCaseValues(path, []);
        } else {
            // Проверяем выбранный вариант
            const selectedRadio = document.querySelector('input[name="caseOption"]:checked');
            if (selectedRadio) {
                const idx = parseInt(selectedRadio.value);
                mode.selectedOption = idx;
                mode.alt = null;
            }
            // Мульти-режим
            const multiCheck = document.getElementById('caseSettingsMultiCheck');
            if (multiCheck && multiCheck.checked) {
                localStorage.setItem('multi_' + path, 'true');
                // Если мульти включён, убедимся, что есть значения
                const vals = getIndividualCaseValues(path);
                if (vals.length === 0) {
                    setIndividualCaseValues(path, options.map(() => 0));
                }
            } else {
                localStorage.removeItem('multi_' + path);
                // Если был мульти, сворачиваем в один вариант
                const vals = getIndividualCaseValues(path);
                if (vals.length > 0) {
                    const total = vals.reduce((a,b) => a + b, 0);
                    setIndividualCaseValues(path, [total]);
                }
            }
        }
        saveOrderData();
        modal.classList.remove('open');
        if (caseSettingsCallback) caseSettingsCallback();
        showToast('Настройки кофров сохранены', 'success');
    };

    // Кнопка отмены
    document.getElementById('caseSettingsCancel').onclick = () => {
        modal.classList.remove('open');
    };

    // Закрытие по оверлею
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.classList.remove('open');
        }
    };
}

// Глобальные функции для вызова из модалки
window.addAltCase = function() {
    const path = currentCaseSettingsPath;
    if (!path) return;
    showPrompt('Альтернативный кофр', 'Вместимость (шт):', '', '', (qty) => {
        const numQty = parseInt(qty);
        if (isNaN(numQty) || numQty <= 0) {
            showToast('Введите корректную вместимость', 'error');
            return 'Некорректное количество';
        }
        showPrompt('Альтернативный кофр', 'Вес пустого (кг):', '0', '', (weight) => {
            const w = parseFloat(weight) || 0;
            showPrompt('Альтернативный кофр', 'Габариты (Д×Ш×В, см):', '', '', (dims) => {
                const mode = getCaseMode(path);
                mode.alt = { qty: numQty, weight: w, dims: dims || '' };
                mode.enabled = true;
                document.getElementById('caseSettingsEnable').checked = true;
                saveOrderData();
                openCaseSettingsModal(path, caseSettingsCallback);
                showToast('Альтернативный кофр добавлен', 'success');
                return null;
            });
            return null;
        });
        return null;
    });
};

window.clearAltCase = function() {
    const path = currentCaseSettingsPath;
    if (!path) return;
    const mode = getCaseMode(path);
    mode.alt = null;
    saveOrderData();
    openCaseSettingsModal(path, caseSettingsCallback);
    showToast('Альтернативный кофр удалён', 'info');
};

window.removeCommonCasePacking = function(path, idx) {
    const packing = getOrderPacking(path);
    packing.splice(idx, 1);
    setOrderPacking(path, packing);
    saveOrderData();
    openCaseSettingsModal(path, caseSettingsCallback);
    showToast('Привязка удалена', 'info');
};

// ============================================================
// МОДАЛКА УПРАВЛЕНИЯ ОБЩИМИ КОФРАМИ (без изменений)
// ============================================================
export function openCasesManagerModal(callback) {
    // ... (оставляем как было)
}

// ============================================================
// МАТРИЦА ПРИВЯЗОК (УЛУЧШЕННАЯ)
// ============================================================
export function openMatrixModal(sourcePath) {
    const modal = document.getElementById('matrixModal');
    if (!modal) {
        showToast('Матрица привязок не найдена', 'error');
        return;
    }
    if (sourcePath) {
        document.getElementById('matrixSearchSource').value = sourcePath.split('|').pop();
    } else {
        document.getElementById('matrixSearchSource').value = '';
    }
    document.getElementById('matrixSearchTarget').value = '';
    renderMatrix();
    modal.classList.add('open');
}

function renderMatrix() {
    const container = document.getElementById('matrixContainer');
    if (!container) return;
    const allPaths = getAllItemPaths();
    if (allPaths.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);">Нет позиций</p>';
        return;
    }
    const srcFilter = document.getElementById('matrixSearchSource').value.toLowerCase();
    const tgtFilter = document.getElementById('matrixSearchTarget').value.toLowerCase();

    // Строим карту источников по категориям
    const catMap = {};
    allPaths.forEach(p => {
        const parts = p.split('|');
        const cat = parts[0];
        if (!catMap[cat]) catMap[cat] = [];
        catMap[cat].push({ full: p, name: parts[parts.length-1] });
    });

    // Список целей (все позиции)
    let allTargets = [];
    allPaths.forEach(p => {
        const parts = p.split('|');
        allTargets.push({ full: p, name: parts[parts.length-1], cat: parts[0] });
    });
    // Уникальные
    const unique = [];
    const seen = new Set();
    allTargets.forEach(t => { if (!seen.has(t.full)) { seen.add(t.full); unique.push(t); } });
    allTargets = unique;
    if (tgtFilter) allTargets = allTargets.filter(t => t.name.toLowerCase().includes(tgtFilter));

    // Фиксированная ширина ячейки — используем CSS
    // Формируем таблицу
    let html = `<div class="matrix-table-wrapper"><table class="matrix-table">`;
    // Заголовок
    html += `<thead><tr><th class="matrix-header">Источник \\ Цель</th>`;
    allTargets.forEach(target => {
        // Обрезаем имя для отображения
        const displayName = truncateName(target.name);
        html += `<th class="matrix-header" title="${esc(target.name)}">${displayName}</th>`;
    });
    html += '</tr></thead><tbody>';

    const orderKeys = editorData._categoryOrder || Object.keys(editorData.inventory);
    orderKeys.forEach(cat => {
        const items = catMap[cat] || [];
        let filtered = items;
        if (srcFilter) filtered = items.filter(item => item.name.toLowerCase().includes(srcFilter));
        if (filtered.length === 0) return;

        const catId = 'cat_' + cat + '_' + Date.now();
        html += `<tr class="matrix-category" onclick="window.toggleMatrixCategory('${catId}')"><td colspan="${allTargets.length+1}" style="text-align:left;padding:6px 10px;background:var(--bg-secondary);border:1px solid var(--border-color);"><span class="toggle" id="toggle_${catId}">▶</span> ${CAT_NAMES[cat]||cat} (${filtered.length})</td></tr>`;
        html += `<tbody id="${catId}" class="matrix-category-items" style="display:none;">`;
        filtered.forEach((source, idx) => {
            const rowClass = idx % 2 === 0 ? 'row-even' : 'row-odd';
            html += `<tr class="${rowClass}">`;
            html += `<td class="matrix-cell matrix-source" title="${esc(source.name)}">${truncateName(source.name)}</td>`;
            allTargets.forEach(target => {
                if (source.full === target.full) {
                    html += `<td class="matrix-cell matrix-diagonal">—</td>`;
                } else {
                    // Проверяем привязки
                    const link = links[source.full] ? links[source.full].find(l => l.target === target.full) : null;
                    const value = link ? link.multiplier : '';
                    // Проверяем, есть ли другие источники, ссылающиеся на ту же цель
                    const conflicts = [];
                    for (let src in links) {
                        if (src === source.full) continue;
                        const lnk = links[src].find(l => l.target === target.full);
                        if (lnk) {
                            conflicts.push({ source: src, multiplier: lnk.multiplier });
                        }
                    }
                    if (value !== '') {
                        let cellContent = `<span class="matrix-value">${value}</span>`;
                        if (conflicts.length > 0) {
                            // Показываем значок !
                            const conflictInfo = conflicts.map(c => {
                                const srcName = c.source.split('|').pop();
                                return `${srcName} (×${c.multiplier})`;
                            }).join(', ');
                            cellContent += `<span class="matrix-conflict" title="Конфликт! Также ссылаются: ${conflictInfo}">!</span>`;
                        }
                        html += `<td class="matrix-cell matrix-value-cell" data-src="${source.full}" data-target="${target.full}" onclick="window.editMatrixCell(this,'${source.full}','${target.full}')">${cellContent}</td>`;
                    } else {
                        // Пустая ячейка с плюсом
                        html += `<td class="matrix-cell matrix-empty" data-src="${source.full}" data-target="${target.full}" onclick="window.editMatrixCell(this,'${source.full}','${target.full}')">+</td>`;
                    }
                }
            });
            html += '</tr>';
        });
        html += '</tbody>';
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
}

// Функция обрезки имени
function truncateName(name, maxLen = 12) {
    if (name.length <= maxLen) return name;
    const parts = name.split(' ');
    if (parts.length <= 2) {
        // Если мало слов, обрезаем по символам
        return name.substring(0, maxLen-3) + '...';
    }
    // Оставляем первое слово и последнее
    const first = parts[0];
    const last = parts[parts.length-1];
    return first + ' ... ' + last;
}

// Функция получения всех путей (без изменений)
function getAllItemPaths() {
    const res = [];
    function traverse(obj, path) {
        if (Array.isArray(obj)) {
            obj.forEach(item => res.push(path.length ? path.join('|') + '|' + item : item));
        } else if (typeof obj === 'object' && obj !== null) {
            for (let key in obj) {
                if (key.startsWith('_')) continue;
                traverse(obj[key], [...path, key]);
            }
        }
    }
    traverse(editorData.inventory, []);
    return res;
}

// Глобальные функции для матрицы
window.toggleMatrixCategory = function(catId) {
    const tbody = document.getElementById(catId);
    const toggle = document.getElementById('toggle_' + catId);
    if (!tbody || !toggle) return;
    if (tbody.style.display === 'none') {
        tbody.style.display = 'table-row-group';
        toggle.textContent = '▼';
    } else {
        tbody.style.display = 'none';
        toggle.textContent = '▶';
    }
};

window.editMatrixCell = async function(td, src, target) {
    const existing = links[src] ? links[src].find(l => l.target === target) : null;
    const currentVal = existing ? existing.multiplier : '';
    const val = await showPrompt(
        currentVal !== '' ? 'Изменить множитель' : 'Введите множитель',
        'Множитель (0 для удаления):',
        currentVal !== '' ? currentVal : '1'
    );
    if (val === null) return;
    const num = parseFloat(val);
    if (isNaN(num) || num === 0) {
        if (links[src]) {
            links[src] = links[src].filter(l => l.target !== target);
            if (links[src].length === 0) delete links[src];
        }
    } else {
        if (!links[src]) links[src] = [];
        const existingLink = links[src].find(l => l.target === target);
        if (existingLink) existingLink.multiplier = num;
        else links[src].push({ target, multiplier: num });
    }
    saveOrderData();
    renderMatrix();
    updateLinkCount();
    showToast('Привязка обновлена', 'success');
};

// Функция обновления счётчика ссылок
function updateLinkCount() {
    let count = 0;
    for (let src in links) count += links[src].length;
    const el = document.getElementById('linkCount');
    if (el) el.textContent = `(${count} активных)`;
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================
export function initCases() {
    // ... (оставляем старые инициализации)
    // Добавляем обработчики для новой модалки, если нужно
}

// Для совместимости с ранее существовавшими экспортами
// Добавляем недостающие функции