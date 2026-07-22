// ui/components/PropsModal.js

/**
 * Модалка редактирования свойств позиции.
 * Позволяет настроить вес, габариты, объём,
 * индивидуальные кофры и связи с общими кофрами.
 * @module ui/components/PropsModal
 */

import { getState, saveState } from '../../core/store.js';
import { emit, EVENTS } from '../../core/events.js';
import { esc, deepClone } from '../../core/utils.js';
import { showToast } from '../toast.js';
import { showPrompt, showConfirm } from '../modal.js';
import { getItemProps, setItemProps } from '../../services/itemProps.js';
import { getCommonCases, getCommonCaseById } from '../../services/commonCases.js';
import { openCasesManagerModal } from './CommonCasesManager.js';

// ============================================================
// СОСТОЯНИЕ МОДАЛКИ
// ============================================================

let propsModalInstance = null;

// ============================================================
// КОМПОНЕНТ
// ============================================================

export class PropsModal {
  /**
   * @param {string} catKey - имя категории
   * @param {string|null} subKey - имя подгруппы
   * @param {string} itemName - имя позиции
   * @param {Function} onSave - колбэк при сохранении
   */
  constructor(catKey, subKey, itemName, onSave) {
    this.catKey = catKey;
    this.subKey = subKey;
    this.itemName = itemName;
    this.onSave = onSave || null;
    this._modalEl = null;
    this._container = null;
    this._variantCounter = 0;
    this._handlers = [];
  }

  /**
   * Инициализирует модалку.
   */
  init() {
    // Проверяем, существует ли модалка в DOM
    let modal = document.getElementById('propsModal');
    if (!modal) {
      modal = this._createModalDOM();
      document.body.appendChild(modal);
    }
    this._modalEl = modal;
    this._container = modal.querySelector('#propsContent');
    this._bindEvents();
    this._render();
    this._modalEl.classList.add('open');
    propsModalInstance = this;
  }

  /**
   * Создаёт DOM-структуру модалки.
   */
  _createModalDOM() {
    const div = document.createElement('div');
    div.className = 'modal-overlay';
    div.id = 'propsModal';
    div.innerHTML = `
      <div class="modal" style="max-width:700px;max-height:90vh;overflow-y:auto;">
        <h3 id="propsTitle" style="color:var(--text-primary);">Свойства позиции</h3>
        <div id="propsContent" style="margin-top:12px;"></div>
        <div class="buttons" style="margin-top:16px;position:sticky;bottom:0;background:var(--bg-card);padding-top:12px;border-top:1px solid var(--border-color);">
          <button class="cancel" id="propsCancel">Отмена</button>
          <button class="confirm" id="propsConfirm">Сохранить</button>
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
    modal.querySelector('#propsCancel')?.addEventListener('click', () => this.close());
    modal.querySelector('#propsConfirm')?.addEventListener('click', () => this._save());

    // Закрытие по клику на оверлей
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.close();
    });

    // Делегирование для кнопок добавления/удаления
    modal.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;

      if (action === 'addIndividual') {
        this._addIndividualVariant();
      } else if (action === 'removeIndividual') {
        const idx = parseInt(target.dataset.idx, 10);
        if (!isNaN(idx)) this._removeIndividualVariant(idx);
      } else if (action === 'addCommon') {
        this._addCommonLink();
      } else if (action === 'removeCommon') {
        const idx = parseInt(target.dataset.idx, 10);
        if (!isNaN(idx)) this._removeCommonLink(idx);
      } else if (action === 'openCommonManager') {
        openCasesManagerModal(() => {
          // Обновляем список общих кофров в модалке
          this._render();
          showToast('Список общих кофров обновлён', 'neutral');
        });
      } else if (action === 'updateCommonList') {
        this._render();
        showToast('Список обновлён', 'neutral');
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

    const props = getItemProps(this.catKey, this.subKey, this.itemName);
    const commonCases = getCommonCases();

    // Заголовок
    const title = modal.querySelector('#propsTitle');
    if (title) {
      title.textContent = 'Свойства: ' + this.itemName;
    }

    let html = `
      <div style="margin-bottom:12px;">
        <label style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:2px;">Вес 1 шт (кг)</label>
        <input type="number" id="propWeight" step="0.1" min="0" value="${props.weight || ''}" placeholder="0.0" style="width:100%;padding:6px 10px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:4px;color:var(--text-primary);">
      </div>
      <div style="margin-bottom:12px;">
        <label style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:2px;">Габариты 1 шт (Д×Ш×В, см)</label>
        <input type="text" id="propDimensions" value="${props.dimensions || ''}" placeholder="50x40x30" style="width:100%;padding:6px 10px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:4px;color:var(--text-primary);">
      </div>
      <div style="margin-bottom:12px;">
        <label style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:2px;">Объём 1 шт (м³) – опционально</label>
        <input type="number" id="propVolume" step="0.001" min="0" value="${props.volume || ''}" placeholder="0.000" style="width:100%;padding:6px 10px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:4px;color:var(--text-primary);">
      </div>
      <hr style="border-color:var(--border-color);margin:12px 0;">

      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <strong style="color:var(--text-primary);">📦 Индивидуальные кофры</strong>
        <button class="btn btn-sm btn-green" data-action="addIndividual" style="padding:4px 12px;font-size:13px;">+ Добавить вариант</button>
      </div>
      <div id="individualCasesContainer" style="margin-bottom:12px;"></div>

      <hr style="border-color:var(--border-color);margin:12px 0;">

      <div style="margin-bottom:8px;">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
          <input type="checkbox" id="propAllowCommon" ${props.allowCommon ? 'checked' : ''}> Разрешено использование общих кофров
        </label>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <strong style="color:var(--text-primary);">🔗 Привязка к общим кофрам</strong>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-sm" data-action="openCommonManager" style="padding:2px 8px;font-size:12px;">📂 Управление</button>
          <button class="btn btn-sm btn-green" data-action="addCommon" style="padding:4px 12px;font-size:13px;">+ Добавить связь</button>
        </div>
      </div>
      <div id="commonCasesContainer" style="margin-bottom:12px;"></div>
    `;

    container.innerHTML = html;

    // Рендерим индивидуальные кофры
    const indContainer = container.querySelector('#individualCasesContainer');
    if (indContainer) {
      const individualCases = props.individualCases || [];
      if (individualCases.length === 0) {
        indContainer.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:4px 0;">Нет индивидуальных кофров</div>';
      } else {
        let indHtml = '';
        for (let i = 0; i < individualCases.length; i++) {
          const c = individualCases[i];
          indHtml += `
            <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:6px 8px;background:var(--bg-secondary);border-radius:4px;margin:4px 0;border:1px solid var(--border-color);">
              <div style="flex:1;display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
                <input type="number" class="ind-qty" data-idx="${i}" value="${c.qty || ''}" placeholder="Кол-во" style="width:60px;padding:4px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:4px;color:var(--text-primary);text-align:center;">
                <input type="text" class="ind-dim" data-idx="${i}" value="${c.dimensions || ''}" placeholder="Габариты" style="flex:1;min-width:120px;padding:4px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:4px;color:var(--text-primary);">
                <input type="number" class="ind-weight" data-idx="${i}" step="0.1" value="${c.weight || ''}" placeholder="Вес" style="width:70px;padding:4px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:4px;color:var(--text-primary);text-align:center;">
                <input type="number" class="ind-max" data-idx="${i}" min="0" value="${c.maxCases || ''}" placeholder="Макс. кофров" style="width:90px;padding:4px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:4px;color:var(--text-primary);text-align:center;">
              </div>
              <button class="btn btn-sm" data-action="removeIndividual" data-idx="${i}" style="padding:2px 8px;font-size:12px;background:var(--danger);color:white;">✕</button>
            </div>
          `;
        }
        indContainer.innerHTML = indHtml;
      }
    }

    // Рендерим общие кофры
    const comContainer = container.querySelector('#commonCasesContainer');
    if (comContainer) {
      const commonLinks = props.commonCases || [];
      if (commonLinks.length === 0) {
        comContainer.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:4px 0;">Нет связей с общими кофрами</div>';
      } else {
        let comHtml = '';
        for (let i = 0; i < commonLinks.length; i++) {
          const link = commonLinks[i];
          const caseObj = getCommonCaseById(link.caseId);
          const name = caseObj ? caseObj.name : 'удалённый кофр';
          comHtml += `
            <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:6px 8px;background:var(--bg-secondary);border-radius:4px;margin:4px 0;border:1px solid var(--border-color);">
              <div style="flex:1;display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
                <span style="font-weight:500;font-size:14px;">${esc(name)}</span>
                <input type="number" class="com-qty" data-idx="${i}" value="${link.qty || ''}" placeholder="Кол-во в кофре" style="width:80px;padding:4px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:4px;color:var(--text-primary);text-align:center;">
                <input type="hidden" class="com-caseid" data-idx="${i}" value="${link.caseId}">
              </div>
              <button class="btn btn-sm" data-action="removeCommon" data-idx="${i}" style="padding:2px 8px;font-size:12px;background:var(--danger);color:white;">✕</button>
            </div>
          `;
        }
        comContainer.innerHTML = comHtml;
      }
    }
  }

  // ============================================================
  // ОПЕРАЦИИ С ИНДИВИДУАЛЬНЫМИ КОФРАМИ
  // ============================================================

  async _addIndividualVariant() {
    const qtyStr = await showPrompt('Новый вариант кофра', 'Кол-во в кофре (шт):', '1', '');
    if (qtyStr === null) return;
    const qty = parseInt(qtyStr, 10);
    if (isNaN(qty) || qty <= 0) {
      showToast('Введите корректное количество', 'error');
      return;
    }
    const dims = await showPrompt('Габариты (Д×Ш×В, см):', '', '', '');
    if (dims === null) return;
    const weightStr = await showPrompt('Вес пустого кофра (кг):', '', '0', '');
    if (weightStr === null) return;
    const weight = parseFloat(weightStr) || 0;
    const maxStr = await showPrompt('Максимум кофров (0 = без ограничений):', '', '0', '');
    if (maxStr === null) return;
    const maxCases = parseInt(maxStr, 10) || 0;

    const props = getItemProps(this.catKey, this.subKey, this.itemName);
    const variants = props.individualCases || [];
    variants.push({ qty, dimensions: dims, weight, maxCases });
    setItemProps(this.catKey, this.subKey, this.itemName, { individualCases: variants });
    this._render();
    showToast('Вариант добавлен', 'success');
  }

  async _removeIndividualVariant(idx) {
    const confirmed = await showConfirm('Удалить этот вариант кофра?');
    if (!confirmed) return;
    const props = getItemProps(this.catKey, this.subKey, this.itemName);
    const variants = props.individualCases || [];
    if (idx < 0 || idx >= variants.length) return;
    variants.splice(idx, 1);
    setItemProps(this.catKey, this.subKey, this.itemName, { individualCases: variants });
    this._render();
    showToast('Вариант удалён', 'neutral');
  }

  // ============================================================
  // ОПЕРАЦИИ С ОБЩИМИ КОФРАМИ
  // ============================================================

  async _addCommonLink() {
    const commonCases = getCommonCases();
    if (commonCases.length === 0) {
      showToast('Нет общих кофров. Создайте их через "Управление"', 'warning');
      return;
    }

    // Выбор кофра
    const options = commonCases.map(c => ({
      value: c.id,
      label: c.name + ` (вм. ${c.qty} шт)`,
    }));
    const choice = await showPrompt('Выберите общий кофр', 'Введите ID кофра (или нажмите Отмена):', '', '');
    if (choice === null) return;

    // Упрощённо: ищем по имени (для удобства)
    let selectedId = null;
    for (const c of commonCases) {
      if (c.name.toLowerCase().includes(choice.toLowerCase()) || c.id === choice) {
        selectedId = c.id;
        break;
      }
    }
    if (!selectedId) {
      showToast('Кофр не найден', 'error');
      return;
    }

    const qtyStr = await showPrompt('Количество единиц позиции в кофре (шт):', '', '1', '');
    if (qtyStr === null) return;
    const qty = parseInt(qtyStr, 10);
    if (isNaN(qty) || qty <= 0) {
      showToast('Введите корректное количество', 'error');
      return;
    }

    const props = getItemProps(this.catKey, this.subKey, this.itemName);
    const links = props.commonCases || [];
    if (links.find(l => l.caseId === selectedId)) {
      showToast('Связь с этим кофром уже существует', 'warning');
      return;
    }
    links.push({ caseId: selectedId, qty });
    setItemProps(this.catKey, this.subKey, this.itemName, { commonCases: links });
    this._render();
    showToast('Связь добавлена', 'success');
  }

  async _removeCommonLink(idx) {
    const confirmed = await showConfirm('Удалить эту связь с общим кофром?');
    if (!confirmed) return;
    const props = getItemProps(this.catKey, this.subKey, this.itemName);
    const links = props.commonCases || [];
    if (idx < 0 || idx >= links.length) return;
    links.splice(idx, 1);
    setItemProps(this.catKey, this.subKey, this.itemName, { commonCases: links });
    this._render();
    showToast('Связь удалена', 'neutral');
  }

  // ============================================================
  // СОХРАНЕНИЕ
  // ============================================================

  _save() {
    const modal = this._modalEl;
    if (!modal) return;

    // Основные поля
    const weight = parseFloat(modal.querySelector('#propWeight')?.value) || 0;
    const dimensions = modal.querySelector('#propDimensions')?.value?.trim() || '';
    const volume = parseFloat(modal.querySelector('#propVolume')?.value) || 0;
    const allowCommon = modal.querySelector('#propAllowCommon')?.checked || false;

    // Индивидуальные кофры
    const individualCases = [];
    const indQtyInputs = modal.querySelectorAll('.ind-qty');
    for (const input of indQtyInputs) {
      const idx = parseInt(input.dataset.idx, 10);
      const qty = parseInt(input.value, 10) || 0;
      if (qty <= 0) continue;
      const dim = modal.querySelector(`.ind-dim[data-idx="${idx}"]`)?.value?.trim() || '';
      const w = parseFloat(modal.querySelector(`.ind-weight[data-idx="${idx}"]`)?.value) || 0;
      const max = parseInt(modal.querySelector(`.ind-max[data-idx="${idx}"]`)?.value, 10) || 0;
      individualCases.push({ qty, dimensions: dim, weight: w, maxCases: max });
    }

    // Общие кофры
    const commonCases = [];
    const comQtyInputs = modal.querySelectorAll('.com-qty');
    for (const input of comQtyInputs) {
      const idx = parseInt(input.dataset.idx, 10);
      const qty = parseInt(input.value, 10) || 0;
      if (qty <= 0) continue;
      const caseId = modal.querySelector(`.com-caseid[data-idx="${idx}"]`)?.value || '';
      if (!caseId) continue;
      commonCases.push({ caseId, qty });
    }

    const props = { weight, dimensions, volume, allowCommon };
    if (individualCases.length > 0) props.individualCases = individualCases;
    if (commonCases.length > 0) props.commonCases = commonCases;

    setItemProps(this.catKey, this.subKey, this.itemName, props);

    if (this.onSave) {
      this.onSave();
    }

    this.close();
    showToast('Свойства сохранены', 'success');
  }

  // ============================================================
  // ЗАКРЫТИЕ
  // ============================================================

  close() {
    if (this._modalEl) {
      this._modalEl.classList.remove('open');
    }
    propsModalInstance = null;
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

export function openPropsModalEditor(catKey, subKey, itemName, onSave) {
  if (propsModalInstance) {
    propsModalInstance.close();
  }
  const modal = new PropsModal(catKey, subKey, itemName, onSave);
  modal.init();
  return modal;
}

export default {
  PropsModal,
  openPropsModalEditor,
};