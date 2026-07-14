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
    setOrderExtra,
    getOrderExtra,
    getCommonRoutes
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
// МОДАЛКА СВОЙСТВ ПОЗИЦИИ (без изменений)
// ============================================================
export function openPropsModalEditor(catKey, subKey, itemName, onSaveCallback) {
    // ... (код из предыдущей версии, без изменений)
    // Для краткости я не копирую весь этот код, но он должен быть.
    // В реальном проекте он уже есть.
}

// ... (все остальные функции: addIndividualCaseVariant, addCommonCaseVariant, initPropsSaveHandler и т.д.)
// Они остаются без изменений, поэтому я их пропускаю для экономии места.

// ============================================================
// МОДАЛКА НАСТРОЙКИ КОФРОВ (НОВАЯ ВЕРСИЯ — БЕЗ ПОЛЕЙ ВВОДА)
// ============================================================
export function openCaseSettingsModal(path, callback) {
    currentCaseSettingsPath = path;
    caseSettingsCallback = callback || null;

    const props = getItemProps(path);
    const options = getCaseOptions(path);
    const commonCases = getCommonCases();
    const mode = getCaseMode(path);
    const individualVals = getIndividualCaseValues(path);
    const packing = getOrderPacking(path);
    const extra = getOrderExtra(path);

    // Определяем текущий режим
    let currentMode = 'off';
    if (packing.length > 0 || extra > 0) {
        currentMode = 'common';
    } else if (individualVals.length > 1 && mode.enabled) {
        currentMode = 'multi';
    } else if (individualVals.length === 1 && mode.enabled) {
        currentMode = 'single';
    } else if (mode.enabled && mode.selectedOption !== undefined) {
        currentMode = 'single';
    } else {
        currentMode = 'off';
    }

    // Если есть alt и он активен, считаем режим single с alt
    if (mode.alt && mode.useAlt) {
        currentMode = 'single';
    }

    const modal = document.getElementById('caseSettingsModal');
    if (!modal) {
        showToast('Модалка настройки кофров не найдена', 'error');
        return;
    }

    const titleEl = document.getElementById('caseSettingsTitle');
    if (titleEl) {
        titleEl.textContent = 'Настройка кофров: ' + path.split('|').pop();
    }

    const contentDiv = document.getElementById('caseSettingsContent');
    if (!contentDiv) {
        showToast('Ошибка: контейнер содержимого не найден', 'error');
        return;
    }

    // Генерируем HTML для содержимого
    let html = `
        <div class="case-mode-selector" style="display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
            <button class="btn btn-sm case-mode-btn ${currentMode === 'off' ? 'active' : ''}" data-mode="off">Без кофров</button>
            ${options.length > 0 ? `<button class="btn btn-sm case-mode-btn ${currentMode === 'single' ? 'active' : ''}" data-mode="single">Один кофр</button>` : ''}
            ${options.length > 1 ? `<button class="btn btn-sm case-mode-btn ${currentMode === 'multi' ? 'active' : ''}" data-mode="multi">Мультикофры</button>` : ''}
            ${props.allowCommon && commonCases.length > 0 ? `<button class="btn btn-sm case-mode-btn ${currentMode === 'common' ? 'active' : ''}" data-mode="common">Общие кофры</button>` : ''}
        </div>
        <div id="caseSettingsContentInner"></div>
    `;

    contentDiv.innerHTML = html;

    const innerDiv = document.getElementById('caseSettingsContentInner');
    if (!innerDiv) return;

    renderCaseModeContent(currentMode, innerDiv, path, options, individualVals, packing, extra, commonCases, mode, props);

    // Обработчики переключения режимов
    document.querySelectorAll('.case-mode-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            const mode = this.dataset.mode;
            document.querySelectorAll('.case-mode-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            renderCaseModeContent(mode, innerDiv, path, options, individualVals, packing, extra, commonCases, mode, props);
        });
    });

    // Обработчики кнопок
    const cancelBtn = document.getElementById('caseSettingsCancel');
    if (cancelBtn) {
        cancelBtn.onclick = () => {
            modal.classList.remove('open');
        };
    }

    const saveBtn = document.getElementById('caseSettingsSave');
    if (saveBtn) {
        saveBtn.onclick = () => {
            saveCaseSettings(path);
            modal.classList.remove('open');
            if (caseSettingsCallback) caseSettingsCallback();
            showToast('Настройки кофров сохранены', 'success');
        };
    }

    modal.classList.add('open');
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.classList.remove('open');
        }
    };
}

// ============================================================
// РЕНДЕРИНГ СОДЕРЖИМОГО ДЛЯ КАЖДОГО РЕЖИМА (БЕЗ ПОЛЕЙ ВВОДА)
// ============================================================
function renderCaseModeContent(mode, container, path, options, individualVals, packing, extra, commonCases, modeData, props) {
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
            html = `<div style="margin-bottom:10px;"><strong>Выберите вариант кофра:</strong></div>`;
            options.forEach((opt, idx) => {
                const checked = idx === selectedIdx ? 'checked' : '';
                html += `<div style="display:flex;align-items:center;gap:8px;margin:4px 0;">
                    <input type="radio" name="singleOption" value="${idx}" ${checked}>
                    <span>Вариант ${idx+1}: вместимость ${opt.qty} шт, габ: ${opt.dims || 'н/д'}, вес пустого: ${opt.weight || 0} кг</span>
                </div>`;
            });
            // Альтернативный кофр (если есть)
            if (modeData.alt) {
                const useAlt = modeData.useAlt || false;
                html += `<div style="margin-top:12px;">
                    <label style="display:flex;align-items:center;gap:6px;">
                        <input type="checkbox" id="useAltCheck" ${useAlt ? 'checked' : ''}> Использовать альтернативный кофр
                    </label>
                    <div style="font-size:13px;color:var(--text-secondary);padding-left:20px;">
                        Вместимость: ${modeData.alt.qty || 0} шт, габ: ${modeData.alt.dims || 'н/д'}, вес пустого: ${modeData.alt.weight || 0} кг
                    </div>
                </div>`;
            }
            break;

        case 'multi':
            if (!options || options.length < 2) {
                html = `<div style="color:var(--text-muted);">Для мультирежима нужно минимум 2 варианта кофров. Добавьте их в редакторе склада.</div>`;
                break;
            }
            // Определяем, какие варианты выбраны (храним в modeData.multiOptions или в individualVals)
            // Для простоты: если individualVals имеет длину options.length, и некоторые значения > 0, считаем их выбранными.
            // Но лучше хранить массив булевых в modeData.multiSelected.
            // Если нет, используем individualVals как индикатор (если > 0, то выбран).
            let multiSelected = modeData.multiSelected || [];
            if (multiSelected.length === 0 && individualVals.length > 0) {
                multiSelected = individualVals.map(v => v > 0);
            }
            if (multiSelected.length === 0) {
                multiSelected = options.map(() => false);
            }
            html = `<div style="margin-bottom:10px;"><strong>Выберите варианты для использования:</strong></div>`;
            options.forEach((opt, idx) => {
                const checked = multiSelected[idx] ? 'checked' : '';
                html += `<div style="display:flex;align-items:center;gap:8px;margin:4px 0;">
                    <input type="checkbox" class="multi-option-check" data-idx="${idx}" ${checked}>
                    <span>Вариант ${idx+1}: вместимость ${opt.qty} шт, габ: ${opt.dims || 'н/д'}, вес пустого: ${opt.weight || 0} кг</span>
                </div>`;
            });
            break;

        case 'common':
            if (!props.allowCommon) {
                html = `<div style="color:var(--text-muted);">Эта позиция не имеет привилегии на использование общих кофров. Разрешите в свойствах позиции.</div>`;
                break;
            }
            if (!commonCases || commonCases.length === 0) {
                html = `<div style="color:var(--text-muted);">Нет общих кофров. Создайте их в редакторе склада или через кнопку "Общие кофры" на главной странице.</div>`;
                break;
            }
            // Определяем, какие общие кофры выбраны (из packing или из modeData.commonSelected)
            let commonSelected = modeData.commonSelected || [];
            if (commonSelected.length === 0 && packing.length > 0) {
                commonSelected = packing.map(p => p.caseId);
            }
            html = `<div style="margin-bottom:10px;"><strong>Выберите общие кофры для использования:</strong></div>`;
            commonCases.forEach(c => {
                const checked = commonSelected.includes(c.id) ? 'checked' : '';
                html += `<div style="display:flex;align-items:center;gap:8px;margin:4px 0;">
                    <input type="checkbox" class="common-case-check" data-caseid="${c.id}" ${checked}>
                    <span><strong>${esc(c.name)}</strong> (вм. ${c.qty} шт, макс. вес: ${c.maxWeight || 0} кг)</span>
                </div>`;
            });
            break;
    }

    container.innerHTML = html;
}

// ============================================================
// СОХРАНЕНИЕ НАСТРОЕК (без сохранения количества)
// ============================================================
function saveCaseSettings(path) {
    const modeBtns = document.querySelectorAll('.case-mode-btn');
    let activeMode = 'off';
    modeBtns.forEach(btn => {
        if (btn.classList.contains('active')) activeMode = btn.dataset.mode;
    });

    const mode = getCaseMode(path);
    const options = getCaseOptions(path);

    // Сбрасываем старые данные, но сохраняем alt если он был
    const oldAlt = mode.alt || null;
    mode.enabled = false;
    mode.selectedOption = 0;
    mode.useAlt = false;
    // Очищаем multiSelected
    mode.multiSelected = [];
    mode.commonSelected = [];
    // Очищаем данные количества (они будут задаваться на странице заказа)
    setIndividualCaseValues(path, []);
    setOrderPacking(path, []);
    setOrderExtra(path, 0);

    switch (activeMode) {
        case 'off':
            // Ничего не делаем
            break;

        case 'single': {
            const radio = document.querySelector('input[name="singleOption"]:checked');
            if (!radio) {
                showToast('Выберите вариант кофра', 'warning');
                return;
            }
            const idx = parseInt(radio.value);
            const useAltCheck = document.getElementById('useAltCheck');
            const useAlt = useAltCheck ? useAltCheck.checked : false;

            mode.enabled = true;
            mode.selectedOption = idx;
            mode.useAlt = useAlt;
            // Если useAlt, то alt должен существовать
            if (useAlt && !mode.alt) {
                showToast('Альтернативный кофр не настроен', 'warning');
                return;
            }
            // Сохраняем alt обратно (он уже был)
            // Если alt не был, но useAlt включён — ошибка
            break;
        }

        case 'multi': {
            const checkboxes = document.querySelectorAll('.multi-option-check');
            const selected = [];
            let hasSelected = false;
            checkboxes.forEach(cb => {
                const idx = parseInt(cb.dataset.idx);
                const checked = cb.checked;
                selected[idx] = checked;
                if (checked) hasSelected = true;
            });
            if (!hasSelected) {
                showToast('Выберите хотя бы один вариант', 'warning');
                return;
            }
            mode.enabled = true;
            mode.multiSelected = selected;
            // Сохраняем пустые значения для выбранных вариантов (количество будет задано позже)
            const vals = selected.map(s => s ? 0 : -1); // -1 означает неиспользуемый вариант
            setIndividualCaseValues(path, vals);
            break;
        }

        case 'common': {
            const checkboxes = document.querySelectorAll('.common-case-check');
            const selected = [];
            let hasSelected = false;
            checkboxes.forEach(cb => {
                const caseId = cb.dataset.caseid;
                if (cb.checked) {
                    selected.push(caseId);
                    hasSelected = true;
                }
            });
            if (!hasSelected) {
                showToast('Выберите хотя бы один общий кофр', 'warning');
                return;
            }
            mode.enabled = true;
            mode.commonSelected = selected;
            // Сохраняем пустые упаковки (количество будет задано позже)
            setOrderPacking(path, []);
            setOrderExtra(path, 0);
            break;
        }
    }

    saveOrderData();
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================
export function initCases() {
    // ... (инициализация свойств, менеджера кофров и т.д.)
    // Без изменений
}