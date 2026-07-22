// ui/components/CaseSettingsModal.js

/**
 * Модалка настройки кофров для конкретной позиции.
 * Позволяет выбрать режим кофров: выключен, один кофр (с альтернативой),
 * мультикофры, общие кофры. Также управляет распределением количества.
 * @module ui/components/CaseSettingsModal
 */

import { getState, saveState } from '../../core/store.js';
import { emit, EVENTS } from '../../core/events.js';
import { esc, deepClone } from '../../core/utils.js';
import { showToast } from '../toast.js';
import { showPrompt, showConfirm, showChoice } from '../modal.js';
import { getItemPropsByPath, setItemProps } from '../../services/itemProps.js';
import { getCommonCases, getCommonCaseById } from '../../services/commonCases.js';
import {
  getCaseMode,
  setCaseMode,
  getOrderPacking,
  setOrderPacking,
  getIndividualCaseValues,
  setIndividualCaseValues,
  getOrderExtra,
  setOrderExtra,
  setOrderValue,
  getTotalQty,
} from '../../services/order.js';
import { getPackaging, invalidatePackagingCache } from '../../services/packaging.js';

// ============================================================
// СОСТОЯНИЕ МОДАЛКИ
// ============================================================

let caseSettingsInstance = null;

// ============================================================
// КОМПОНЕНТ
// ============================================================

export class CaseSettingsModal {
  /**
   * @param {string} path - путь позиции
   * @param {Function} onSave - колбэк при сохранении
   */
  constructor(path, onSave) {
    this.path = path;
    this.onSave = onSave || null;
    this._modalEl = null;
    this._container = null;
    this._activeMode = 'off';
    this._handlers = [];
  }

  /**
   * Инициализирует модалку.
   */
  init() {
    // Проверяем, существует ли модалка в DOM
    let modal = document.getElementById('caseSettingsModal');
    if (!modal) {
      modal = this._createModalDOM();
      document.body.appendChild(modal);
    }
    this._modalEl = modal;
    this._container = modal.querySelector('#caseSettingsContent');
    this._bindEvents();
    this._render();
    this._modalEl.classList.add('open');
    caseSettingsInstance = this;
  }

  /**
   * Создаёт DOM-структуру модалки.
   */
  _createModalDOM() {
    const div = document.createElement('div');
    div.className = 'modal-overlay';
    div.id = 'caseSettingsModal';
    div.innerHTML = `
      <div class="modal" style="max-width:700px;">
        <h3 id="caseSettingsTitle" style="color:var(--text-primary);">Настройка кофров</h3>
        <div id="caseSettingsContent" style="margin-top:12px;"></div>
        <div class="buttons" style="margin-top:16px;">
          <button class="cancel" id="caseSettingsCancel">Отмена</button>
          <button class="confirm" id="caseSettingsSave">Сохранить</button>
        </div>
      </div>
    `;
    return div;
  }

  // ============================================================
  // ПРИВЯЗКА СОБЫТИЙ
  // ============================================================

  _bindEvents() {
    const modal = this._modalEl;
    if (!modal) return;

    // Закрытие
    modal.querySelector('#caseSettingsCancel')?.addEventListener('click', () => this.close());
    modal.querySelector('#caseSettingsSave')?.addEventListener('click', () => this._save());

    // Закрытие по клику на оверлей
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.close();
    });

    // Делегирование для кнопок режимов и действий
    modal.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;
      if (action === 'setMode') {
        const mode = target.dataset.mode;
        if (mode) {
          this._activeMode = mode;
          this._render();
        }
      } else if (action === 'addAlt') {
        this._addAltCase();
      } else if (action === 'clearAlt') {
        this._clearAltCase();
      } else if (action === 'addCommon') {
        this._addCommonLink();
      } else if (action === 'removeCommon') {
        const caseId = target.dataset.caseid;
        if (caseId) this._removeCommonLink(caseId);
      }
    });
  }

  // ============================================================
  // РЕНДЕРИНГ
  // ============================================================

  _render() {
    const modal = this._modalEl;
    const container = this._container;
    if (!container) return;

    const path = this.path;
    const props = getItemPropsByPath(path);
    const mode = getCaseMode(path);
    const options = props.individualCases || [];
    const commonCases = getCommonCases();
    const packing = getOrderPacking(path);
    const individualVals = getIndividualCaseValues(path);
    const extra = getOrderExtra(path);
    const totalQty = getTotalQty(path);

    // Определяем текущий активный режим
    if (packing.length > 0 || extra > 0) {
      this._activeMode = 'common';
    } else if (mode.enabled && individualVals.length > 1 && mode.multiSelected && mode.multiSelected.some(v => v === true)) {
      this._activeMode = 'multi';
    } else if (mode.enabled && individualVals.length === 1) {
      this._activeMode = 'single';
    } else if (mode.enabled && options.length > 0) {
      this._activeMode = 'single';
    } else {
      this._activeMode = 'off';
    }

    // Заголовок
    const title = modal.querySelector('#caseSettingsTitle');
    if (title) {
      title.textContent = 'Настройка кофров: ' + getItemName(path);
    }

    let html = `
      <div class="case-mode-selector" style="display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
        <button class="btn btn-sm ${this._activeMode === 'off' ? 'active' : ''}" data-action="setMode" data-mode="off" style="${this._activeMode === 'off' ? 'border-color:var(--accent);' : ''}">❌ Без кофров</button>
        ${options.length > 0 ? `<button class="btn btn-sm ${this._activeMode === 'single' ? 'active' : ''}" data-action="setMode" data-mode="single" style="${this._activeMode === 'single' ? 'border-color:var(--accent);' : ''}">📦 Один кофр</button>` : ''}
        ${options.length > 1 ? `<button class="btn btn-sm ${this._activeMode === 'multi' ? 'active' : ''}" data-action="setMode" data-mode="multi" style="${this._activeMode === 'multi' ? 'border-color:var(--accent);' : ''}">🔀 Мультикофры</button>` : ''}
        ${props.allowCommon && commonCases.length > 0 ? `<button class="btn btn-sm ${this._activeMode === 'common' ? 'active' : ''}" data-action="setMode" data-mode="common" style="${this._activeMode === 'common' ? 'border-color:var(--accent);' : ''}">📦 Общие кофры</button>` : ''}
      </div>
      <div id="caseSettingsContentInner"></div>
    `;

    container.innerHTML = html;

    const inner = container.querySelector('#caseSettingsContentInner');
    if (!inner) return;

    // Рендерим содержимое в зависимости от режима
    this._renderModeContent(inner, options, commonCases, packing, individualVals, extra, mode, props, totalQty);

    // Обновляем классы кнопок
    container.querySelectorAll('.case-mode-selector .btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === this._activeMode);
    });
  }

  _renderModeContent(container, options, commonCases, packing, individualVals, extra, mode, props, totalQty) {
    let html = '';

    switch (this._activeMode) {
      case 'off':
        html = `<div style="color:var(--text-secondary);padding:10px 0;">Режим кофров отключён. Позиция будет учитываться без упаковки.</div>`;
        break;

      case 'single': {
        if (!options || options.length === 0) {
          html = `<div style="color:var(--text-muted);padding:10px 0;">Нет индивидуальных кофров для этой позиции. Добавьте их в редакторе склада.</div>`;
          break;
        }
        const selectedIdx = mode.selectedOption !== undefined ? mode.selectedOption : 0;
        html = `<div style="margin-bottom:10px;"><strong>Выберите вариант кофра:</strong></div>`;
        for (let i = 0; i < options.length; i++) {
          const opt = options[i];
          const checked = i === selectedIdx ? 'checked' : '';
          const maxCases = opt.maxCases || 0;
          html += `<div style="display:flex;align-items:center;gap:8px;margin:4px 0;">
            <input type="radio" name="singleOption" value="${i}" ${checked}>
            <span>Вариант ${i + 1}: вместимость ${opt.qty} шт, габ: ${opt.dimensions || 'н/д'}, вес пустого: ${opt.weight || 0} кг${maxCases > 0 ? `, макс. кофров: ${maxCases}` : ''}</span>
          </div>`;
        }

        // Альтернативный кофр
        if (mode.alt) {
          const useAlt = mode.useAlt || false;
          html += `<div style="margin-top:12px;border-top:1px solid var(--border-color);padding-top:12px;">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
              <input type="checkbox" id="useAltCheck" ${useAlt ? 'checked' : ''}> Использовать альтернативный кофр
            </label>
            <div style="font-size:13px;color:var(--text-secondary);padding-left:20px;">
              Вместимость: ${mode.alt.qty || 0} шт, габ: ${mode.alt.dims || 'н/д'}, вес пустого: ${mode.alt.weight || 0} кг
            </div>
            <button class="btn btn-sm" data-action="clearAlt" style="margin-top:4px;font-size:12px;background:var(--danger);color:white;">✕ Удалить альт.</button>
          </div>`;
        } else {
          html += `<div style="margin-top:12px;border-top:1px solid var(--border-color);padding-top:12px;">
            <button class="btn btn-sm" data-action="addAlt" style="font-size:12px;">➕ Добавить альтернативный кофр</button>
          </div>`;
        }

        // Текущее распределение
        if (totalQty > 0) {
          const opt = options[selectedIdx] || options[0];
          const val = individualVals[0] || 0;
          const casesCount = opt && opt.qty ? Math.ceil(val / opt.qty) : 0;
          html += `<div style="margin-top:12px;padding:8px;background:var(--bg-secondary);border-radius:4px;font-size:13px;color:var(--text-secondary);">
            <strong>Текущее распределение:</strong> ${val} шт (${casesCount} кофр${casesCount > 1 ? 'а' : ''})
          </div>`;
        }
        break;
      }

      case 'multi': {
        if (!options || options.length < 2) {
          html = `<div style="color:var(--text-muted);padding:10px 0;">Для мультирежима нужно минимум 2 варианта кофров. Добавьте их в редакторе склада.</div>`;
          break;
        }
        html = `<div style="margin-bottom:10px;"><strong>Все варианты будут доступны для распределения:</strong></div>`;
        for (let i = 0; i < options.length; i++) {
          const opt = options[i];
          const maxCases = opt.maxCases || 0;
          const val = individualVals[i] || 0;
          const casesCount = opt.qty ? Math.ceil(val / opt.qty) : 0;
          html += `<div style="padding:4px 8px;margin:2px 0;border-left:2px solid var(--accent);background:var(--bg-secondary);border-radius:4px;">
            <span><strong>Вариант ${i + 1}:</strong> вместимость ${opt.qty} шт, габ: ${opt.dimensions || 'н/д'}, вес пустого: ${opt.weight || 0} кг${maxCases > 0 ? `, макс. кофров: ${maxCases}` : ''}</span>
            ${totalQty > 0 && val > 0 ? `<span style="margin-left:12px;font-size:12px;color:var(--text-secondary);">→ ${val} шт (${casesCount} кофр)</span>` : ''}
          </div>`;
        }
        if (totalQty > 0) {
          html += `<div style="margin-top:8px;padding:8px;background:var(--bg-secondary);border-radius:4px;font-size:13px;color:var(--text-secondary);">
            <strong>Итого:</strong> ${individualVals.reduce((a, b) => a + b, 0)} шт
          </div>`;
        }
        break;
      }

      case 'common': {
        if (!props.allowCommon) {
          html = `<div style="color:var(--text-muted);padding:10px 0;">Эта позиция не имеет привилегии на использование общих кофров. Разрешите в свойствах позиции.</div>`;
          break;
        }
        if (!commonCases || commonCases.length === 0) {
          html = `<div style="color:var(--text-muted);padding:10px 0;">Нет общих кофров. Создайте их в редакторе склада или через кнопку "Общие кофры".</div>`;
          break;
        }

        let commonSelected = mode.commonSelected || [];
        if (commonSelected.length === 0 && packing.length > 0) {
          commonSelected = packing.map(p => p.caseId);
        }

        html = `<div style="margin-bottom:10px;"><strong>Выберите общие кофры для использования:</strong></div>`;
        for (const c of commonCases) {
          const checked = commonSelected.includes(c.id) ? 'checked' : '';
          const pieces = packing.find(p => p.caseId === c.id)?.pieces || 0;
          html += `<div style="display:flex;align-items:center;gap:8px;margin:4px 0;">
            <input type="checkbox" class="common-case-check" data-caseid="${c.id}" ${checked}>
            <span><strong>${esc(c.name)}</strong> (вм. ${c.qty} шт, макс. вес: ${c.maxWeight || 0} кг)</span>
            ${pieces > 0 ? `<span style="font-size:12px;color:var(--text-secondary);">→ ${pieces} шт</span>` : ''}
          </div>`;
        }

        // Вне кофров
        if (totalQty > 0) {
          const totalPacked = packing.reduce((s, p) => s + (p.pieces || 0), 0);
          const extraRemaining = getOrderExtra(path);
          html += `<div style="margin-top:8px;padding:8px;background:var(--bg-secondary);border-radius:4px;font-size:13px;color:var(--text-secondary);">
            <strong>Упаковано в кофры:</strong> ${totalPacked} шт | <strong>Вне кофров:</strong> ${extraRemaining} шт
          </div>`;
        }

        // Кнопка добавления связи с новым кофром
        html += `<div style="margin-top:12px;border-top:1px solid var(--border-color);padding-top:12px;">
          <button class="btn btn-sm" data-action="addCommon" style="font-size:12px;">➕ Добавить связь с кофром</button>
        </div>`;
        break;
      }
    }

    container.innerHTML = html;
  }

  // ============================================================
  // ДОБАВЛЕНИЕ / УДАЛЕНИЕ АЛЬТЕРНАТИВНОГО КОФРА
  // ============================================================

  async _addAltCase() {
    const path = this.path;
    const qtyStr = await showPrompt('Альтернативный кофр', 'Вместимость (шт):', '', '');
    if (qtyStr === null) return;
    const numQty = parseInt(qtyStr, 10);
    if (isNaN(numQty) || numQty <= 0) {
      showToast('Введите корректную вместимость', 'error');
      return;
    }
    const weightStr = await showPrompt('Альтернативный кофр', 'Вес пустого (кг):', '0', '');
    if (weightStr === null) return;
    const w = parseFloat(weightStr) || 0;
    const dims = await showPrompt('Альтернативный кофр', 'Габариты (Д×Ш×В, см):', '', '');
    if (dims === null) return;

    const mode = getCaseMode(path);
    mode.alt = { qty: numQty, weight: w, dims: dims || '' };
    mode.enabled = true;
    saveState();
    this._render();
    showToast('Альтернативный кофр добавлен', 'success');
  }

  _clearAltCase() {
    const path = this.path;
    const mode = getCaseMode(path);
    mode.alt = null;
    mode.useAlt = false;
    saveState();
    this._render();
    showToast('Альтернативный кофр удалён', 'neutral');
  }

  // ============================================================
  // ДОБАВЛЕНИЕ / УДАЛЕНИЕ СВЯЗИ С ОБЩИМ КОФРОМ
  // ============================================================

  async _addCommonLink() {
    const path = this.path;
    const commonCases = getCommonCases();
    if (commonCases.length === 0) {
      showToast('Нет общих кофров', 'warning');
      return;
    }

    // Создаём выбор из списка
    const options = commonCases.map(c => ({
      value: c.id,
      label: c.name + ` (вм. ${c.qty} шт)`,
    }));
    const choice = await showChoice('Выберите общий кофр', 'К какому кофру добавить связь?', options);
    if (!choice) return;

    const qtyStr = await showPrompt('Количество единиц в кофре', 'Сколько единиц позиции помещается в кофр?', '1', '');
    if (qtyStr === null) return;
    const qty = parseInt(qtyStr, 10);
    if (isNaN(qty) || qty <= 0) {
      showToast('Введите корректное количество', 'error');
      return;
    }

    const mode = getCaseMode(path);
    if (!mode.commonSelected) mode.commonSelected = [];
    if (!mode.commonSelected.includes(choice)) {
      mode.commonSelected.push(choice);
    }
    saveState();

    // Добавляем в упаковку
    const packing = getOrderPacking(path);
    if (!packing.find(p => p.caseId === choice)) {
      packing.push({ caseId: choice, pieces: 0 });
      setOrderPacking(path, packing);
    }

    this._render();
    showToast('Связь с кофром добавлена', 'success');
  }

  _removeCommonLink(caseId) {
    const path = this.path;
    const mode = getCaseMode(path);
    if (mode.commonSelected) {
      mode.commonSelected = mode.commonSelected.filter(id => id !== caseId);
    }
    const packing = getOrderPacking(path);
    const filtered = packing.filter(p => p.caseId !== caseId);
    setOrderPacking(path, filtered);
    saveState();
    this._render();
    showToast('Связь удалена', 'neutral');
  }

  // ============================================================
  // СОХРАНЕНИЕ
  // ============================================================

  async _save() {
    const path = this.path;
    const mode = getCaseMode(path);
    const options = getItemPropsByPath(path).individualCases || [];
    const commonCases = getCommonCases();
    const existingQty = getTotalQty(path);

    // Сбрасываем предыдущие настройки
    mode.enabled = false;
    mode.selectedOption = 0;
    mode.useAlt = false;
    mode.multiSelected = [];
    mode.commonSelected = [];
    setIndividualCaseValues(path, []);
    setOrderPacking(path, []);
    setOrderExtra(path, 0);
    setOrderValue(path, 0);

    switch (this._activeMode) {
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
        const idx = parseInt(radio.value, 10);
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
            setOrderValue(path, finalQty);
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
          vals = options.map((opt, i) => {
            let val = base + (i < remainder ? 1 : 0);
            const maxCases = opt.maxCases || 0;
            if (maxCases > 0) {
              const maxPieces = maxCases * opt.qty;
              if (val > maxPieces) {
                val = maxPieces;
                showToast(`Вариант ${i+1} ограничен макс. кофрами (${maxCases})`, 'warning');
              }
            }
            return val;
          });
        } else if (action === 'sequential') {
          let remaining = existingQty;
          vals = options.map((opt, i) => {
            if (remaining <= 0) return 0;
            const qtyPerCase = opt.qty;
            const maxCases = opt.maxCases || Infinity;
            const maxPieces = maxCases * qtyPerCase;
            let canPlace = Math.min(remaining, maxPieces);
            let pieces = Math.floor(canPlace / qtyPerCase) * qtyPerCase;
            if (pieces === 0 && remaining >= qtyPerCase) {
              pieces = qtyPerCase;
            }
            if (remaining < qtyPerCase && remaining > 0 && i === options.length - 1) {
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
            const extraAdd = Math.min(remaining, maxPieces - vals[0]);
            vals[0] += extraAdd;
            remaining -= extraAdd;
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
        const checkboxes = document.querySelectorAll('.common-case-check');
        const selected = [];
        for (const cb of checkboxes) {
          if (cb.checked) selected.push(cb.dataset.caseid);
        }
        if (selected.length === 0) {
          showToast('Выберите хотя бы один общий кофр', 'warning');
          return;
        }

        const selectedCases = commonCases.filter(c => selected.includes(c.id));
        const capacities = selectedCases.map(c => c.qty);

        let action = 'reset';
        if (existingQty > 0) {
          const choiceOptions = [
            { value: 'reset', label: 'Оставить вне кофров', description: 'количество останется без упаковки' },
            { value: 'equal', label: 'Распределить поровну', description: 'разделить количество между всеми выбранными кофрами' },
            { value: 'sequential', label: 'Собрать по очереди', description: 'заполнять кофры последовательно' }
          ];
          action = await showChoice(
            'Режим общих кофров',
            'У позиции уже есть количество (' + existingQty + ' шт). Что сделать с этим количеством?',
            choiceOptions
          );
        }

        mode.enabled = true;
        mode.commonSelected = selected;

        if (action === 'reset' || existingQty === 0) {
          const packingArr = selected.map(caseId => ({ caseId, pieces: 0 }));
          setOrderPacking(path, packingArr);
          setOrderExtra(path, existingQty);
          setOrderValue(path, existingQty);
        } else if (action === 'equal') {
          let remaining = existingQty;
          const count = selected.length;
          const base = Math.floor(remaining / count);
          let remainder = remaining % count;
          const packingArr = selected.map((caseId, idx) => {
            const capacity = capacities[idx] || 1;
            let pieces = base + (idx < remainder ? 1 : 0);
            if (pieces > capacity) {
              pieces = capacity;
            }
            return { caseId, pieces };
          });
          let totalPacked = packingArr.reduce((sum, p) => sum + p.pieces, 0);
          let extraRemaining = existingQty - totalPacked;
          if (extraRemaining > 0) {
            const firstCase = packingArr[0];
            const capacity = capacities[0] || 1;
            const canAdd = Math.min(extraRemaining, capacity - firstCase.pieces);
            if (canAdd > 0) {
              firstCase.pieces += canAdd;
              extraRemaining -= canAdd;
            }
          }
          setOrderPacking(path, packingArr);
          setOrderExtra(path, extraRemaining);
          setOrderValue(path, existingQty);
        } else if (action === 'sequential') {
          let remaining = existingQty;
          const packingArr = selected.map((caseId, idx) => {
            const capacity = capacities[idx] || 1;
            const canPlace = Math.min(remaining, capacity);
            remaining -= canPlace;
            return { caseId, pieces: canPlace };
          });
          setOrderPacking(path, packingArr);
          setOrderExtra(path, remaining);
          setOrderValue(path, existingQty);
        }
        break;
      }
    }

    saveState();
    invalidatePackagingCache(path);

    if (this.onSave) {
      this.onSave();
    }

    this.close();
    showToast('Настройки кофров сохранены', 'success');
  }

  // ============================================================
  // ЗАКРЫТИЕ
  // ============================================================

  close() {
    if (this._modalEl) {
      this._modalEl.classList.remove('open');
    }
    caseSettingsInstance = null;
  }

  // ============================================================
  // УНИЧТОЖЕНИЕ
  // ============================================================

  destroy() {
    this.close();
  }
}

// ============================================================
// ФАБРИЧНАЯ ФУНКЦИЯ
// ============================================================

export function openCaseSettingsModal(path, onSave) {
  if (caseSettingsInstance) {
    caseSettingsInstance.close();
  }
  const modal = new CaseSettingsModal(path, onSave);
  modal.init();
  return modal;
}

export default {
  CaseSettingsModal,
  openCaseSettingsModal,
};