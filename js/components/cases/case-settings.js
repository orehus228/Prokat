// components/cases/case-settings.js
import { getState, saveState } from '../../core/state.js';
import {
  getItemProps,
  getCommonCases,
  setItemProps,
} from '../../data/editor-data.js';
import {
  setIndividualCaseValues,
  getIndividualCaseValues,
  getOrderPacking,
  setOrderPacking,
  getOrderExtra,
  setOrderExtra,
  setOrderValue,
  getTotalQty,
} from '../../services/order-data.js';
import * as calc from '../../services/calculations.js';
import { showToast } from '../../ui/toast.js';
import { showPrompt, showConfirm, showChoice } from '../../ui/modal.js';
import { esc, getElement } from '../../ui/dom.js';

let currentCaseSettingsPath = null;
let caseSettingsCallback = null;

// ============================================================
// ОТКРЫТИЕ МОДАЛКИ
// ============================================================

export function openCaseSettingsModal(path, callback) {
  currentCaseSettingsPath = path;
  caseSettingsCallback = callback || null;

  const props = calc.getItemPropsByPath(path);
  const options = calc.getCaseOptions(path);
  const commonCases = getCommonCases();
  const mode = calc.getCaseMode(path);
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

  document.querySelectorAll('.case-mode-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const selectedMode = this.dataset.mode;
      document.querySelectorAll('.case-mode-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      renderCaseModeContent(selectedMode, innerDiv, path, options, individualVals, packing, extra, commonCases, mode, props);
    });
  });

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

function renderCaseModeContent(mode, container, path, options, individualVals, packing, extra, commonCases, modeData, props) {
  let html = '';
  switch (mode) {
    case 'off':
      html = `<div style="color:var(--text-secondary);padding:10px 0;">Режим кофров отключён. Позиция будет учитываться без упаковки.</div>`;
      break;

    case 'single': {
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
          <span>Вариант ${idx + 1}: вместимость ${opt.qty} шт, габ: ${opt.dimensions || 'н/д'}, вес пустого: ${opt.weight || 0} кг${maxCases > 0 ? `, макс. кофров: ${maxCases}` : ''}</span>
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
          <button class="btn btn-sm" onclick="window.clearAltCase()" style="margin-top:4px;font-size:12px;background:var(--danger);color:white;">Удалить альт.</button>
        </div>`;
      } else {
        html += `<div style="margin-top:12px;">
          <button class="btn btn-sm" onclick="window.addAltCase()" style="font-size:12px;">+ Добавить альтернативный кофр</button>
        </div>`;
      }
      break;
    }

    case 'multi': {
      if (!options || options.length < 2) {
        html = `<div style="color:var(--text-muted);">Для мультирежима нужно минимум 2 варианта кофров. Добавьте их в редакторе склада.</div>`;
        break;
      }
      html = `<div style="margin-bottom:10px;"><strong>Все варианты будут доступны для распределения:</strong></div>`;
      options.forEach((opt, idx) => {
        const maxCases = opt.maxCases || 0;
        html += `<div style="padding:4px 8px;margin:2px 0;border-left:2px solid var(--accent);background:var(--bg-secondary);border-radius:4px;">
          <span>Вариант ${idx + 1}: вместимость ${opt.qty} шт, габ: ${opt.dimensions || 'н/д'}, вес пустого: ${opt.weight || 0} кг${maxCases > 0 ? `, макс. кофров: ${maxCases}` : ''}</span>
        </div>`;
      });
      break;
    }

    case 'common': {
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
  }

  container.innerHTML = html;
}

async function saveCaseSettings(path) {
  const modeBtns = document.querySelectorAll('.case-mode-btn');
  let activeMode = 'off';
  modeBtns.forEach(btn => {
    if (btn.classList.contains('active')) activeMode = btn.dataset.mode;
  });

  const mode = calc.getCaseMode(path);
  const options = calc.getCaseOptions(path);
  const existingQty = getTotalQty(path);
  const commonCases = getCommonCases();

  // Сбрасываем все настройки кофров для этой позиции
  mode.enabled = false;
  mode.selectedOption = 0;
  mode.useAlt = false;
  mode.multiSelected = [];
  mode.commonSelected = [];
  setIndividualCaseValues(path, []);
  setOrderPacking(path, []);
  setOrderExtra(path, 0);
  setOrderValue(path, 0);

  switch (activeMode) {
    case 'off':
      if (existingQty > 0) {
        setOrderValue(path, existingQty);
      }
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

      if (existingQty > 0) {
        const opt = options[idx];
        if (opt) {
          const maxCases = opt.maxCases || 0;
          const maxPieces = maxCases * opt.qty;
          let finalQty = existingQty;
          if (maxCases > 0 && finalQty > maxPieces) {
            finalQty = maxPieces;
            showToast(`Количество ограничено макс. кофрами (${maxCases})`, 'warning');
          }
          setIndividualCaseValues(path, [finalQty]);
        }
      } else {
        setIndividualCaseValues(path, [0]);
      }
      break;
    }

    case 'multi': {
      let action = 'equal';
      if (existingQty > 0) {
        const choiceOptions = [
          { value: 'reset', label: 'Сбросить', description: 'обнулить количество' },
          { value: 'equal', label: 'Распределить поровну', description: 'разделить количество между всеми вариантами' },
          { value: 'sequential', label: 'Собрать по очереди', description: 'заполнять кофры последовательно' }
        ];
        action = await showChoice(
          'Режим мультикофров',
          'У позиции уже есть количество (' + existingQty + ' шт). Что сделать с этим количеством?',
          choiceOptions
        );
      }

      mode.enabled = true;
      const count = options.length;
      mode.multiSelected = options.map(() => true);

      let vals = [];
      if (action === 'reset' || existingQty === 0) {
        vals = options.map(() => 0);
      } else if (action === 'equal') {
        const base = Math.floor(existingQty / count);
        let remainder = existingQty % count;
        vals = options.map((opt, idx) => {
          let val = base + (idx < remainder ? 1 : 0);
          const maxCases = opt.maxCases || 0;
          if (maxCases > 0) {
            const maxPieces = maxCases * opt.qty;
            if (val > maxPieces) {
              val = maxPieces;
              showToast(`Вариант ${idx+1} ограничен макс. кофрами (${maxCases})`, 'warning');
            }
          }
          return val;
        });
      } else if (action === 'sequential') {
        let remaining = existingQty;
        vals = options.map((opt, idx) => {
          if (remaining <= 0) return 0;
          const qtyPerCase = opt.qty;
          const maxCases = opt.maxCases || Infinity;
          const maxPieces = maxCases * qtyPerCase;
          let canPlace = Math.min(remaining, maxPieces);
          let pieces = Math.floor(canPlace / qtyPerCase) * qtyPerCase;
          if (pieces === 0 && remaining >= qtyPerCase) {
            pieces = qtyPerCase;
          }
          if (remaining < qtyPerCase && remaining > 0 && idx === options.length - 1) {
            pieces = remaining;
          }
          pieces = Math.min(pieces, maxPieces);
          remaining -= pieces;
          return pieces;
        });
        if (remaining > 0) {
          const firstOpt = options[0];
          const maxCases = firstOpt.maxCases || 0;
          const maxPieces = maxCases > 0 ? maxCases * firstOpt.qty : Infinity;
          const extra = Math.min(remaining, maxPieces - vals[0]);
          vals[0] += extra;
          remaining -= extra;
          if (remaining > 0) {
            showToast(`Не удалось распределить все ${remaining} шт (превышен лимит кофров)`, 'warning');
          }
        }
      }

      setIndividualCaseValues(path, vals);
      const total = vals.reduce((a, b) => a + b, 0);
      setOrderValue(path, total);
      break;
    }

    case 'common': {
      // Проверяем, есть ли выбранные кофры
      const checkboxes = document.querySelectorAll('.common-case-check');
      const selected = [];
      checkboxes.forEach(cb => {
        if (cb.checked) selected.push(cb.dataset.caseid);
      });
      if (selected.length === 0) {
        showToast('Выберите хотя бы один общий кофр', 'warning');
        return;
      }

      // Если есть количество, спрашиваем, что делать
      let action = 'reset';
      if (existingQty > 0) {
        const choiceOptions = [
          { value: 'reset', label: 'Оставить вне кофров', description: 'количество останется без упаковки' },
          { value: 'common', label: 'Разместить в общие кофры', description: 'распределить количество по выбранным кофрам (по очереди)' }
        ];
        action = await showChoice(
          'Режим общих кофров',
          'У позиции уже есть количество (' + existingQty + ' шт). Что сделать с этим количеством?',
          choiceOptions
        );
      }

      // Включаем режим
      mode.enabled = true;
      mode.commonSelected = selected;

      if (action === 'common' && existingQty > 0) {
        // Распределяем по кофрам последовательно
        let remaining = existingQty;
        const packingArr = selected.map(caseId => {
          const c = commonCases.find(cc => cc.id === caseId);
          const capacity = c ? c.qty : 1;
          const canPlace = Math.min(remaining, capacity);
          remaining -= canPlace;
          return { caseId, pieces: canPlace };
        });
        // Устанавливаем упаковку и остаток
        setOrderPacking(path, packingArr);
        setOrderExtra(path, remaining);
        // Общее количество сохраняем
        setOrderValue(path, existingQty);
      } else {
        // Сброс или перенос вне кофров
        // Все штуки помещаем вне кофров
        setOrderPacking(path, selected.map(caseId => ({ caseId, pieces: 0 })));
        setOrderExtra(path, existingQty);
        setOrderValue(path, existingQty);
      }
      break;
    }
  }

  // Принудительное сохранение
  saveState();

  // Принудительно обновляем интерфейс (если callback передан)
  if (caseSettingsCallback) {
    // Вызываем callback дважды с небольшой задержкой, чтобы гарантировать обновление
    caseSettingsCallback();
    setTimeout(caseSettingsCallback, 50);
  }
}

window.addAltCase = async function() {
  const path = currentCaseSettingsPath;
  if (!path) return;

  const qtyStr = await showPrompt('Альтернативный кофр', 'Вместимость (шт):', '', '');
  if (qtyStr === null) return;
  const numQty = parseInt(qtyStr);
  if (isNaN(numQty) || numQty <= 0) {
    showToast('Введите корректную вместимость', 'error');
    return;
  }

  const weightStr = await showPrompt('Альтернативный кофр', 'Вес пустого (кг):', '0', '');
  if (weightStr === null) return;
  const w = parseFloat(weightStr) || 0;

  const dims = await showPrompt('Альтернативный кофр', 'Габариты (Д×Ш×В, см):', '', '');
  if (dims === null) return;

  const mode = calc.getCaseMode(path);
  mode.alt = { qty: numQty, weight: w, dims: dims || '' };
  mode.enabled = true;
  saveState();
  openCaseSettingsModal(path, caseSettingsCallback);
  showToast('Альтернативный кофр добавлен', 'success');
};

window.clearAltCase = function() {
  const path = currentCaseSettingsPath;
  if (!path) return;
  const mode = calc.getCaseMode(path);
  mode.alt = null;
  saveState();
  openCaseSettingsModal(path, caseSettingsCallback);
  showToast('Альтернативный кофр удалён', 'neutral');
};

export default {
  openCaseSettingsModal,
  saveCaseSettings,
};