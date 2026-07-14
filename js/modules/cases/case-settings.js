// modules/cases/case-settings.js — Модалка настройки кофров для позиции
import {
    getItemProps,
    getCommonCases
} from '../../data.js';

import {
    getCaseMode,
    getCaseOptions,
    getSelectedOption,
    setIndividualCaseValues,
    getIndividualCaseValues,
    getOrderPacking,
    setOrderPacking,
    getOrderExtra,
    setOrderExtra,
    saveOrderData
} from '../../order.js';

import {
    esc,
    showToast,
    showPrompt,
    showConfirm
} from '../../ui.js';

let currentCaseSettingsPath = null;
let caseSettingsCallback = null;

// ============================================================
// ОТКРЫТИЕ МОДАЛКИ НАСТРОЙКИ КОФРОВ
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

    // Генерируем HTML с переключателем режимов
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
// РЕНДЕРИНГ СОДЕРЖИМОГО В ЗАВИСИМОСТИ ОТ РЕЖИМА
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
                const maxCases = opt.maxCases || 0;
                html += `<div style="display:flex;align-items:center;gap:8px;margin:4px 0;">
                    <input type="radio" name="singleOption" value="${idx}" ${checked}>
                    <span>Вариант ${idx+1}: вместимость ${opt.qty} шт, габ: ${opt.dims || 'н/д'}, вес пустого: ${opt.weight || 0} кг${maxCases > 0 ? `, макс. кофров: ${maxCases}` : ''}</span>
                </div>`;
            });
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
            // Мультирежим: показываем все варианты как выбранные, без чекбоксов
            html = `<div style="margin-bottom:10px;"><strong>Все варианты будут доступны для распределения:</strong></div>`;
            options.forEach((opt, idx) => {
                const maxCases = opt.maxCases || 0;
                html += `<div style="padding:4px 8px;margin:2px 0;border-left:2px solid var(--accent);background:var(--bg-secondary);border-radius:4px;">
                    <span>Вариант ${idx+1}: вместимость ${opt.qty} шт, габ: ${opt.dims || 'н/д'}, вес пустого: ${opt.weight || 0} кг${maxCases > 0 ? `, макс. кофров: ${maxCases}` : ''}</span>
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
    mode.useAlt = false;
    mode.multiSelected = [];
    mode.commonSelected = [];
    setIndividualCaseValues(path, []);
    setOrderPacking(path, []);
    setOrderExtra(path, 0);

    switch (activeMode) {
        case 'off':
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
            if (useAlt && !mode.alt) {
                showToast('Альтернативный кофр не настроен', 'warning');
                return;
            }
            // Устанавливаем нулевое значение, чтобы поля появились в строке
            setIndividualCaseValues(path, [0]);
            break;
        }

        case 'multi': {
            // Все варианты считаются выбранными
            const selected = options.map(() => true);
            mode.enabled = true;
            mode.multiSelected = selected;
            // Инициализируем нулями для всех вариантов
            const vals = options.map(() => 0);
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
            setOrderPacking(path, []);
            setOrderExtra(path, 0);
            break;
        }
    }

    saveOrderData();
}

// ============================================================
// ФУНКЦИИ ДЛЯ АЛЬТЕРНАТИВНОГО КОФРА (через window)
// ============================================================
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
    showToast('Альтернативный кофр удалён', 'neutral');
};

window.removeCommonCasePacking = function(path, idx) {
    const packing = getOrderPacking(path);
    packing.splice(idx, 1);
    setOrderPacking(path, packing);
    saveOrderData();
    openCaseSettingsModal(path, caseSettingsCallback);
    showToast('Привязка удалена', 'neutral');
};