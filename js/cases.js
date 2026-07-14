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
    moveItem,
    getTruckPresets
} from './data.js';

import {
    esc,
    showToast,
    showPrompt,
    showConfirm
} from './ui.js';

import { CAT_NAMES, STORAGE_KEYS } from './config.js';
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
    caseModes,
    orderExclude,
    order,
    orderExtra,
    setOrderExtra
} from './order.js';

// ============================================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ============================================================
let currentPropsPath = null;
let variantCounter = 0;
let casesManagerCallback = null;
let currentCaseSettingsPath = null;
let caseSettingsCallback = null;
let matrixZoomLevel = 1;
let openCategories = [];
let scrollToPath = null;
let matrixFullNames = true;

const MATRIX_PRESETS_KEY = STORAGE_KEYS.MATRIX_PRESETS || 'matrix_presets';
const MATRIX_FULLNAMES_KEY = 'matrix_full_names';

// Загрузка состояния полных названий
function loadMatrixFullNames() {
    try {
        const val = localStorage.getItem(MATRIX_FULLNAMES_KEY);
        if (val !== null) {
            matrixFullNames = val === 'true';
        }
    } catch (e) {
        matrixFullNames = true;
    }
}
loadMatrixFullNames();

function saveMatrixFullNames() {
    localStorage.setItem(MATRIX_FULLNAMES_KEY, String(matrixFullNames));
}

// ============================================================
// МОДАЛКА НАСТРОЙКИ КОФРОВ (НОВАЯ ВЕРСИЯ)
// ============================================================
export function openCaseSettingsModal(path, callback) {
    currentCaseSettingsPath = path;
    caseSettingsCallback = callback || null;

    const props = getItemProps(path);
    const options = getCaseOptions(path); // индивидуальные кофры
    const commonCases = getCommonCases(); // все общие кофры
    const mode = getCaseMode(path);
    const individualVals = getIndividualCaseValues(path);
    const packing = getOrderPacking(path);
    const extra = getOrderExtra(path);

    // Определяем текущий режим
    let currentMode = 'off'; // 'off', 'single', 'multi', 'common'
    if (packing.length > 0 || extra > 0) {
        currentMode = 'common';
    } else if (individualVals.length > 1 && mode.enabled) {
        currentMode = 'multi';
    } else if (individualVals.length === 1 && mode.enabled && mode.selectedOption !== undefined) {
        currentMode = 'single';
    } else if (mode.enabled && mode.selectedOption !== undefined) {
        currentMode = 'single';
    } else {
        currentMode = 'off';
    }

    // Если есть старый режим alt, преобразуем в single или multi?
    // Пока оставим как есть.

    const modal = document.getElementById('caseSettingsModal');
    if (!modal) {
        showToast('Модалка настройки кофров не найдена', 'error');
        return;
    }

    document.getElementById('caseSettingsTitle').textContent = 'Настройка кофров: ' + path.split('|').pop();

    // Строим содержимое модалки
    let html = `
        <div class="case-mode-selector" style="display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
            <button class="btn btn-sm case-mode-btn ${currentMode === 'off' ? 'active' : ''}" data-mode="off">Без кофров</button>
            ${options.length > 0 ? `<button class="btn btn-sm case-mode-btn ${currentMode === 'single' ? 'active' : ''}" data-mode="single">Один кофр</button>` : ''}
            ${options.length > 1 ? `<button class="btn btn-sm case-mode-btn ${currentMode === 'multi' ? 'active' : ''}" data-mode="multi">Мультикофры</button>` : ''}
            ${commonCases.length > 0 ? `<button class="btn btn-sm case-mode-btn ${currentMode === 'common' ? 'active' : ''}" data-mode="common">Общие кофры</button>` : ''}
        </div>
        <div id="caseSettingsContent"></div>
    `;

    const modalBody = modal.querySelector('.modal');
    // Сохраняем кнопки отдельно, чтобы не пересоздавать
    const buttonsDiv = modalBody.querySelector('.buttons');
    // Вставляем новый контент перед кнопками
    const existingContent = modalBody.querySelector('.case-mode-selector');
    if (existingContent) {
        // заменяем только содержимое внутри
        const contentWrap = modalBody.querySelector('#caseSettingsContent')?.parentNode;
        if (contentWrap) {
            contentWrap.innerHTML = html;
        } else {
            // если структура изменилась, создадим заново
            modalBody.innerHTML = html + `<div class="buttons" style="margin-top:16px;">
                <button class="cancel" id="caseSettingsCancel">Отмена</button>
                <button class="confirm" id="caseSettingsSave">Сохранить</button>
            </div>`;
        }
    } else {
        // Если модалка пуста, вставляем полностью
        modalBody.innerHTML = html + `<div class="buttons" style="margin-top:16px;">
            <button class="cancel" id="caseSettingsCancel">Отмена</button>
            <button class="confirm" id="caseSettingsSave">Сохранить</button>
        </div>`;
    }

    // Теперь заполняем контент в зависимости от режима
    const contentDiv = document.getElementById('caseSettingsContent');
    if (!contentDiv) return;

    renderCaseModeContent(currentMode, contentDiv, path, options, individualVals, packing, extra, commonCases, mode);

    // Обработчики переключения режимов
    document.querySelectorAll('.case-mode-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            const mode = this.dataset.mode;
            document.querySelectorAll('.case-mode-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            renderCaseModeContent(mode, contentDiv, path, options, individualVals, packing, extra, commonCases, mode);
        });
    });

    // Обработчики кнопок Отмена/Сохранить
    document.getElementById('caseSettingsCancel').onclick = () => {
        modal.classList.remove('open');
    };

    document.getElementById('caseSettingsSave').onclick = () => {
        saveCaseSettings(path);
        modal.classList.remove('open');
        if (caseSettingsCallback) caseSettingsCallback();
        showToast('Настройки кофров сохранены', 'success');
    };

    modal.classList.add('open');
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.classList.remove('open');
        }
    };
}

// ============================================================
// РЕНДЕРИНГ СОДЕРЖИМОГО ДЛЯ КАЖДОГО РЕЖИМА
// ============================================================
function renderCaseModeContent(mode, container, path, options, individualVals, packing, extra, commonCases, modeData) {
    let html = '';
    switch (mode) {
        case 'off':
            html = `<div style="color:var(--text-secondary);padding:10px 0;">Режим кофров отключён. Позиция будет учитываться без упаковки.</div>`;
            break;

        case 'single':
            if (!options || options.length === 0) {
                html = `<div style="color:var(--text-muted);">Нет индивидуальных кофров для этой позиции. Добавьте их в редакторе склада.</div>`;
                break;
            }
            const selectedIdx = modeData.selectedOption !== undefined ? modeData.selectedOption : 0;
            const singleVals = individualVals.length > 0 ? individualVals[0] : 0;
            html = `<div style="margin-bottom:10px;"><strong>Выберите вариант кофра:</strong></div>`;
            options.forEach((opt, idx) => {
                const checked = idx === selectedIdx ? 'checked' : '';
                const val = (idx === 0 && individualVals.length > 0) ? individualVals[0] : 0;
                html += `<div style="display:flex;align-items:center;gap:8px;margin:4px 0;">
                    <input type="radio" name="singleOption" value="${idx}" ${checked}>
                    <span>Вариант ${idx+1}: вместимость ${opt.qty} шт, габ: ${opt.dims || 'н/д'}, вес пустого: ${opt.weight || 0} кг</span>
                </div>`;
            });
            // Поля для ввода
            html += `<div style="margin-top:12px;display:flex;gap:16px;flex-wrap:wrap;align-items:center;">
                <div><label>Штук: </label>
                    <input type="number" class="single-pieces" value="${singleVals || 0}" min="0" step="1" style="width:70px;">
                </div>
                <div><label>Кофров: </label>
                    <input type="number" class="single-cases" value="${singleVals ? Math.ceil(singleVals / (options[selectedIdx]?.qty || 1)) : 0}" min="0" step="1" style="width:70px;">
                </div>
                <label style="display:flex;align-items:center;gap:6px;">
                    <input type="checkbox" class="single-allow-extra"> Разрешить вне кофра
                </label>
            </div>
            <div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">Введите либо штуки, либо кофры — второе поле пересчитается автоматически.</div>`;
            break;

        case 'multi':
            if (!options || options.length < 2) {
                html = `<div style="color:var(--text-muted);">Для мультирежима нужно минимум 2 варианта кофров. Добавьте их в редакторе склада.</div>`;
                break;
            }
            html = `<div style="margin-bottom:10px;"><strong>Распределение по вариантам:</strong></div>`;
            options.forEach((opt, idx) => {
                const val = individualVals[idx] || 0;
                html += `<div style="border:1px solid var(--border-light);border-radius:6px;padding:8px;margin:6px 0;background:var(--bg-secondary);">
                    <div style="font-weight:500;margin-bottom:4px;">Вариант ${idx+1} (вм. ${opt.qty} шт, габ: ${opt.dims || 'н/д'})</div>
                    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;">
                        <label>Штук: <input type="number" class="multi-pieces" data-idx="${idx}" value="${val || 0}" min="0" step="1" style="width:70px;"></label>
                        <label>Кофров: <input type="number" class="multi-cases" data-idx="${idx}" value="${val ? Math.ceil(val / opt.qty) : 0}" min="0" step="1" style="width:70px;"></label>
                    </div>
                </div>`;
            });
            html += `<div style="margin-top:8px;">
                <label style="display:flex;align-items:center;gap:6px;">
                    <input type="checkbox" class="multi-allow-extra"> Разрешить вне кофра
                </label>
            </div>`;
            break;

        case 'common':
            if (!commonCases || commonCases.length === 0) {
                html = `<div style="color:var(--text-muted);">Нет общих кофров. Создайте их в редакторе склада или через кнопку "Общие кофры" на главной странице.</div>`;
                break;
            }
            // Определяем выбранные общие кофры из packing
            const packingMap = {};
            packing.forEach(p => { packingMap[p.caseId] = p.pieces || 0; });
            html = `<div style="margin-bottom:10px;"><strong>Распределение по общим кофрам:</strong></div>`;
            commonCases.forEach(c => {
                const val = packingMap[c.id] || 0;
                html += `<div style="border:1px solid var(--border-light);border-radius:6px;padding:8px;margin:4px 0;background:var(--bg-secondary);">
                    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;">
                        <span><strong>${esc(c.name)}</strong> (вм. ${c.qty} шт, макс. вес: ${c.maxWeight || 0} кг)</span>
                        <label>Штук: <input type="number" class="common-pieces" data-caseid="${c.id}" value="${val}" min="0" step="1" style="width:70px;"></label>
                    </div>
                </div>`;
            });
            html += `<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;">
                <label>Вне кофра (шт): <input type="number" class="common-extra" value="${extra || 0}" min="0" step="1" style="width:70px;"></label>
                <label style="display:flex;align-items:center;gap:6px;">
                    <span>Критерий заполненности:</span>
                    <select class="common-criteria" style="padding:4px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:4px;color:var(--text-primary);">
                        <option value="weight" ${modeData.criteria === 'weight' || !modeData.criteria ? 'selected' : ''}>Вес</option>
                        <option value="pieces" ${modeData.criteria === 'pieces' ? 'selected' : ''}>Штуки</option>
                        <option value="volume" ${modeData.criteria === 'volume' ? 'selected' : ''}>Объём</option>
                    </select>
                </label>
            </div>`;
            break;
    }

    container.innerHTML = html;

    // Навешиваем обработчики синхронизации для single и multi
    if (mode === 'single') {
        const piecesInput = container.querySelector('.single-pieces');
        const casesInput = container.querySelector('.single-cases');
        const radioBtns = container.querySelectorAll('input[name="singleOption"]');
        let selectedOption = parseInt(container.querySelector('input[name="singleOption"]:checked')?.value || 0);

        const syncSingle = (source) => {
            const qtyPerCase = options[selectedOption]?.qty || 1;
            if (source === 'pieces') {
                const p = parseInt(piecesInput.value) || 0;
                casesInput.value = Math.ceil(p / qtyPerCase);
            } else if (source === 'cases') {
                const c = parseInt(casesInput.value) || 0;
                piecesInput.value = c * qtyPerCase;
            }
        };

        piecesInput.addEventListener('input', () => syncSingle('pieces'));
        casesInput.addEventListener('input', () => syncSingle('cases'));
        radioBtns.forEach(btn => {
            btn.addEventListener('change', function() {
                if (this.checked) {
                    selectedOption = parseInt(this.value);
                    // пересчитываем кофры исходя из текущих штук
                    const p = parseInt(piecesInput.value) || 0;
                    const qtyPerCase = options[selectedOption]?.qty || 1;
                    casesInput.value = Math.ceil(p / qtyPerCase);
                }
            });
        });
    }

    if (mode === 'multi') {
        const piecesInputs = container.querySelectorAll('.multi-pieces');
        const casesInputs = container.querySelectorAll('.multi-cases');
        piecesInputs.forEach((inp, idx) => {
            const qtyPerCase = options[idx]?.qty || 1;
            const casesInp = casesInputs[idx];
            inp.addEventListener('input', function() {
                const p = parseInt(this.value) || 0;
                casesInp.value = Math.ceil(p / qtyPerCase);
            });
            casesInp.addEventListener('input', function() {
                const c = parseInt(this.value) || 0;
                inp.value = c * qtyPerCase;
            });
        });
    }
}

// ============================================================
// СОХРАНЕНИЕ НАСТРОЕК
// ============================================================
function saveCaseSettings(path) {
    const modeBtns = document.querySelectorAll('.case-mode-btn');
    let activeMode = 'off';
    modeBtns.forEach(btn => {
        if (btn.classList.contains('active')) activeMode = btn.dataset.mode;
    });

    const mode = getCaseMode(path);
    const options = getCaseOptions(path);

    // Сбрасываем старые данные
    mode.enabled = false;
    mode.selectedOption = 0;
    mode.alt = null;
    // Очищаем индивидуальные значения и упаковку, если они не нужны
    setIndividualCaseValues(path, []);
    setOrderPacking(path, []);
    setOrderExtra(path, 0);

    switch (activeMode) {
        case 'off':
            // Ничего не делаем
            break;

        case 'single': {
            const radio = document.querySelector('input[name="singleOption"]:checked');
            if (!radio) { showToast('Выберите вариант кофра', 'warning'); return; }
            const idx = parseInt(radio.value);
            const piecesInput = document.querySelector('.single-pieces');
            const casesInput = document.querySelector('.single-cases');
            const allowExtra = document.querySelector('.single-allow-extra')?.checked || false;
            let pieces = parseInt(piecesInput.value) || 0;
            // Если pieces = 0, но cases > 0, пересчитываем
            if (pieces === 0) {
                const cases = parseInt(casesInput.value) || 0;
                if (cases > 0) {
                    pieces = cases * (options[idx]?.qty || 1);
                }
            }
            if (pieces === 0) {
                showToast('Введите количество (штук или кофров)', 'warning');
                return;
            }
            mode.enabled = true;
            mode.selectedOption = idx;
            setIndividualCaseValues(path, [pieces]);
            // Если разрешено вне кофра, это не используется в single режиме? Пока оставим как есть.
            break;
        }

        case 'multi': {
            const piecesInputs = document.querySelectorAll('.multi-pieces');
            const allowExtra = document.querySelector('.multi-allow-extra')?.checked || false;
            const vals = [];
            let hasValue = false;
            piecesInputs.forEach((inp, idx) => {
                let val = parseInt(inp.value) || 0;
                // Если val = 0, но есть cases, пересчитываем
                if (val === 0) {
                    const casesInp = document.querySelector(`.multi-cases[data-idx="${idx}"]`);
                    if (casesInp) {
                        const c = parseInt(casesInp.value) || 0;
                        if (c > 0) {
                            val = c * (options[idx]?.qty || 1);
                        }
                    }
                }
                vals.push(val);
                if (val > 0) hasValue = true;
            });
            if (!hasValue) {
                showToast('Введите хотя бы одно значение', 'warning');
                return;
            }
            mode.enabled = true;
            mode.selectedOption = 0; // не используется
            setIndividualCaseValues(path, vals);
            break;
        }

        case 'common': {
            const commonPieces = document.querySelectorAll('.common-pieces');
            const extraInput = document.querySelector('.common-extra');
            const criteriaSelect = document.querySelector('.common-criteria');
            const packing = [];
            let hasValue = false;
            commonPieces.forEach(inp => {
                const caseId = inp.dataset.caseid;
                const val = parseInt(inp.value) || 0;
                if (val > 0) {
                    packing.push({ caseId, pieces: val });
                    hasValue = true;
                }
            });
            const extra = parseInt(extraInput?.value) || 0;
            if (extra > 0) hasValue = true;
            if (!hasValue) {
                showToast('Введите хотя бы одно значение', 'warning');
                return;
            }
            mode.enabled = true;
            mode.criteria = criteriaSelect?.value || 'weight';
            setOrderPacking(path, packing);
            setOrderExtra(path, extra);
            break;
        }
    }

    saveOrderData();
}

// ============================================================
// ОСТАЛЬНЫЕ ФУНКЦИИ (свойства, матрица, общие кофры) остаются без изменений
// ... (код из предыдущей версии, который не был изменён)
// Я пока пропущу их для краткости, но они есть в полной версии.
// ============================================================

// Для краткости я не копирую весь остальной код (свойства, матрица, менеджер кофров),
// так как они не меняются. При необходимости я пришлю полный файл.