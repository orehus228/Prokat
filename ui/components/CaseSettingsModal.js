// ui/components/CaseSettingsModal.js

import { getState, saveState } from '../../core/store.js';
import { emit, EVENTS } from '../../core/events.js';
import { esc, getItemName } from '../../core/utils.js';
import { showToast } from '../toast.js';
import { showPrompt, showConfirm, showChoice } from '../modal.js';
import { getItemPropsByPath } from '../../services/itemProps.js';
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
import { invalidatePackagingCache } from '../../services/packaging.js';

let caseSettingsInstance = null;

export class CaseSettingsModal {
  constructor(path, onSave) {
    this.path = path;
    this.onSave = onSave || null;
    this._modalEl = null;
    this._container = null;
    this._activeMode = 'off';
  }

  init() {
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

  _bindEvents() {
    const modal = this._modalEl;
    if (!modal) return;

    modal.querySelector('#caseSettingsCancel')?.addEventListener('click', () => this.close());
    modal.querySelector('#caseSettingsSave')?.addEventListener('click', () => this._save());

    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.close();
    });

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

    // Определяем активный режим
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

    this._renderModeContent(inner, options, commonCases, packing, individualVals, extra, mode, props, totalQty);

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

        if (totalQty > 0) {
          const totalPacked = packing.reduce((s, p) => s + (p.pieces || 0), 0);
          const extraRemaining = getOrderExtra(path);
          html += `<div style="margin-top:8px;padding:8px;background:var(--bg-secondary);border-radius:4px;font-size:13px;color:var(--text-secondary);">
            <strong>Упаковано в кофры:</strong> ${totalPacked} шт | <strong>Вне кофров:</strong> ${extraRemaining} шт
          </div>`;
        }

        html += `<div style="margin-top:12px;border-top:1px solid var(--border-color);padding-top:12px;">
          <button class="btn btn-sm" data-action="addCommon" style="font-size:12px;">➕ Добавить связь с кофром</button>
        </div>`;
        break;
      }
    }

    container.innerHTML = html;
  }

  // ===== Вспомогательные методы (добавление альт, общих кофров и т.д.) =====
  // Они уже были в предыдущей версии, я не буду их менять, чтобы не раздувать ответ.
  // Главное — файл не зависит от OrderPage.

  close() { ... }
  _save() { ... }
  // ... остальные методы
}

export function openCaseSettingsModal(path, onSave) { ... }
export default { ... }