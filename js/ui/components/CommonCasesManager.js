// ui/components/CommonCasesManager.js

/**
 * Менеджер общих кофров.
 * Позволяет создавать, редактировать, удалять общие кофры,
 * а также отслеживать их заполненность на основе текущего заказа.
 * @module ui/components/CommonCasesManager
 */

import { getState, saveState } from '../../core/store.js';
import { emit, EVENTS } from '../../core/events.js';
import { esc, deepClone } from '../../core/utils.js';
import { showToast } from '../toast.js';
import { showPrompt, showConfirm } from '../modal.js';
import { getCommonCases, createCommonCase, updateCommonCase, deleteCommonCase, getCommonCaseById } from '../../services/commonCases.js';
import { getItemPropsByPath } from '../../services/itemProps.js';
import { getOrderPacking, getTotalQty } from '../../services/order.js';
import { getColorCSS, getBgColorCSS } from '../render-utils.js';

// ============================================================
// СОСТОЯНИЕ МОДАЛКИ
// ============================================================

let commonManagerInstance = null;

// ============================================================
// КОМПОНЕНТ
// ============================================================

export class CommonCasesManager {
  /**
   * @param {Function} onClose - колбэк при закрытии
   */
  constructor(onClose) {
    this.onClose = onClose || null;
    this._modalEl = null;
    this._container = null;
    this._editId = null;
    this._handlers = [];
  }

  /**
   * Инициализирует модалку.
   */
  init() {
    // Проверяем, существует ли модалка в DOM
    let modal = document.getElementById('casesManagerModal');
    if (!modal) {
      modal = this._createModalDOM();
      document.body.appendChild(modal);
    }
    this._modalEl = modal;
    this._container = modal.querySelector('#casesList');
    this._bindEvents();
    this._render();
    this._modalEl.classList.add('open');
    commonManagerInstance = this;
  }

  /**
   * Создаёт DOM-структуру модалки.
   */
  _createModalDOM() {
    const div = document.createElement('div');
    div.className = 'modal-overlay';
    div.id = 'casesManagerModal';
    div.innerHTML = `
      <div class="modal" style="max-width:700px;max-height:90vh;overflow-y:auto;">
        <h3 style="color:var(--text-primary);">📦 Общие кофры</h3>
        <div id="casesList" style="margin-bottom:15px;max-height:300px;overflow-y:auto;"></div>

        <div style="border-top:1px solid var(--border-color);padding-top:15px;">
          <h4 style="color:var(--text-secondary);">Добавить / редактировать кофр</h4>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <div>
              <label style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:2px;">Название</label>
              <input type="text" id="newCaseName" placeholder="Например: Ящик 120x80x60" style="width:100%;padding:6px 10px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:4px;color:var(--text-primary);">
            </div>
            <div>
              <label style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:2px;">Вместимость (шт)</label>
              <input type="number" id="newCaseQty" placeholder="0" style="width:100%;padding:6px 10px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:4px;color:var(--text-primary);">
            </div>
            <div>
              <label style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:2px;">Габариты (Д×Ш×В, см)</label>
              <input type="text" id="newCaseDim" placeholder="120x80x60" style="width:100%;padding:6px 10px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:4px;color:var(--text-primary);">
            </div>
            <div>
              <label style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:2px;">Вес пустого (кг)</label>
              <input type="number" id="newCaseWeight" step="0.1" placeholder="0.0" style="width:100%;padding:6px 10px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:4px;color:var(--text-primary);">
            </div>
            <div>
              <label style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:2px;">Макс. вес груза (кг)</label>
              <input type="number" id="newCaseMaxWeight" step="0.1" placeholder="0.0" style="width:100%;padding:6px 10px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:4px;color:var(--text-primary);">
            </div>
            <div>
              <label style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:2px;">Макс. объём (м³)</label>
              <input type="number" id="newCaseMaxVolume" step="0.001" placeholder="0.000" style="width:100%;padding:6px 10px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:4px;color:var(--text-primary);">
            </div>
          </div>
          <div class="buttons" style="margin-top:12px;display:flex;justify-content:flex-end;gap:8px;">
            <button class="cancel" id="casesManagerClose">Закрыть</button>
            <button class="confirm" id="casesManagerAdd">+ Добавить</button>
          </div>
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
    modal.querySelector('#casesManagerClose')?.addEventListener('click', () => this.close());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.close();
    });

    // Добавление / обновление
    modal.querySelector('#casesManagerAdd')?.addEventListener('click', () => this._saveCase());

    // Делегирование для кнопок редактирования и удаления
    modal.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;
      const id = target.dataset.id;

      if (action === 'edit') {
        this._editCase(id);
      } else if (action === 'delete') {
        this._deleteCase(id);
      }
    });
  }

  // ============================================================
  // РЕНДЕРИНГ СПИСКА
  // ============================================================

  _render() {
    const container = this._container;
    if (!container) return;

    const cases = getCommonCases();
    if (cases.length === 0) {
      container.innerHTML = '<div class="empty-message">Нет общих кофров</div>';
      return;
    }

    // Собираем статистику заполнения для каждого кофра
    const stats = new Map();
    for (const c of cases) {
      stats.set(c.id, {
        totalWeight: 0,
        maxWeight: c.maxWeight || 0,
        name: c.name,
        totalVolume: 0,
        maxVolume: c.maxVolume || 0,
      });
    }

    const state = getState();
    for (const path in state.orderPacking) {
      const packing = state.orderPacking[path] || [];
      const props = getItemPropsByPath(path);
      const unitWeight = props.weight || 0;
      const unitVolume = props.volume || 0;
      for (const p of packing) {
        if (p.pieces <= 0) continue;
        const stat = stats.get(p.caseId);
        if (stat) {
          stat.totalWeight += p.pieces * unitWeight;
          stat.totalVolume += p.pieces * unitVolume;
        }
      }
    }

    let html = '';
    for (const c of cases) {
      const stat = stats.get(c.id);
      const fillPercent = stat && stat.maxWeight > 0
        ? Math.min(100, Math.round((stat.totalWeight / stat.maxWeight) * 100))
        : 0;
      const color = getColorCSS(fillPercent);
      const bgColor = getBgColorCSS(fillPercent, 0.15);

      html += `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-bottom:1px solid var(--border-color);gap:10px;background:${bgColor};border-radius:4px;margin:2px 0;">
          <div style="flex:1;min-width:0;">
            <strong style="font-size:14px;">${esc(c.name)}</strong>
            <div style="font-size:12px;color:var(--text-secondary);">
              Вместимость: ${c.qty} шт, Габ: ${c.dimensions || 'н/д'}, Вес пустого: ${c.emptyWeight || 0} кг, Макс. вес: ${c.maxWeight || 0} кг
            </div>
            <div style="margin-top:4px;display:flex;align-items:center;gap:8px;">
              <div style="flex:1;height:6px;background:var(--bg-input);border-radius:3px;overflow:hidden;">
                <div style="width:${fillPercent}%;height:100%;background:${color};border-radius:3px;transition:width 0.3s;"></div>
              </div>
              <span style="font-size:12px;color:${color};font-weight:bold;min-width:40px;">${fillPercent}%</span>
              <span style="font-size:11px;color:var(--text-muted);">(${stat ? Math.round(stat.totalWeight) : 0}/${stat?.maxWeight || 0} кг)</span>
            </div>
          </div>
          <div style="display:flex;gap:4px;flex-shrink:0;">
            <button class="btn btn-sm" data-action="edit" data-id="${c.id}" style="padding:2px 8px;font-size:12px;">✏️</button>
            <button class="btn btn-sm" data-action="delete" data-id="${c.id}" style="padding:2px 8px;font-size:12px;background:var(--danger);color:white;">✕</button>
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
  }

  // ============================================================
  // CRUD ОПЕРАЦИИ
  // ============================================================

  _editCase(id) {
    const c = getCommonCaseById(id);
    if (!c) {
      showToast('Кофр не найден', 'error');
      return;
    }

    const modal = this._modalEl;
    modal.querySelector('#newCaseName').value = c.name || '';
    modal.querySelector('#newCaseQty').value = c.qty || '';
    modal.querySelector('#newCaseDim').value = c.dimensions || '';
    modal.querySelector('#newCaseWeight').value = c.emptyWeight || '';
    modal.querySelector('#newCaseMaxWeight').value = c.maxWeight || '';
    modal.querySelector('#newCaseMaxVolume').value = c.maxVolume || '';

    const addBtn = modal.querySelector('#casesManagerAdd');
    addBtn.textContent = 'Обновить';
    addBtn.dataset.editId = id;
    this._editId = id;

    // Прокручиваем к форме
    modal.querySelector('form')?.scrollIntoView({ behavior: 'smooth' });
  }

  async _deleteCase(id) {
    const c = getCommonCaseById(id);
    if (!c) {
      showToast('Кофр не найден', 'error');
      return;
    }
    const confirmed = await showConfirm(`Удалить кофр "${c.name}"? Все связи с ним будут удалены.`);
    if (!confirmed) return;
    try {
      deleteCommonCase(id);
      this._render();
      showToast('Кофр удалён', 'neutral');
      emit(EVENTS.EDITOR_DATA_CHANGED, { action: 'deleteCommonCase', id });
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  _saveCase() {
    const modal = this._modalEl;
    const name = modal.querySelector('#newCaseName').value.trim();
    const qty = parseInt(modal.querySelector('#newCaseQty').value, 10);
    const dimensions = modal.querySelector('#newCaseDim').value.trim();
    const emptyWeight = parseFloat(modal.querySelector('#newCaseWeight').value) || 0;
    const maxWeight = parseFloat(modal.querySelector('#newCaseMaxWeight').value) || 0;
    const maxVolume = parseFloat(modal.querySelector('#newCaseMaxVolume').value) || 0;

    if (!name) {
      showToast('Введите название кофра', 'warning');
      return;
    }
    if (isNaN(qty) || qty <= 0) {
      showToast('Вместимость должна быть положительным числом', 'warning');
      return;
    }

    const editId = this._editId || modal.querySelector('#casesManagerAdd').dataset.editId;

    try {
      if (editId) {
        updateCommonCase(editId, { name, qty, dimensions, emptyWeight, maxWeight, maxVolume });
        showToast('Кофр обновлён', 'success');
      } else {
        createCommonCase({ name, qty, dimensions, emptyWeight, maxWeight, maxVolume });
        showToast('Кофр добавлен', 'success');
      }

      // Очищаем поля
      modal.querySelector('#newCaseName').value = '';
      modal.querySelector('#newCaseQty').value = '';
      modal.querySelector('#newCaseDim').value = '';
      modal.querySelector('#newCaseWeight').value = '';
      modal.querySelector('#newCaseMaxWeight').value = '';
      modal.querySelector('#newCaseMaxVolume').value = '';

      const addBtn = modal.querySelector('#casesManagerAdd');
      addBtn.textContent = '+ Добавить';
      delete addBtn.dataset.editId;
      this._editId = null;

      this._render();
      emit(EVENTS.EDITOR_DATA_CHANGED, { action: 'saveCommonCase' });
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // ============================================================
  // ЗАКРЫТИЕ
  // ============================================================

  close() {
    if (this._modalEl) {
      this._modalEl.classList.remove('open');
      // Очищаем форму
      const modal = this._modalEl;
      modal.querySelector('#newCaseName').value = '';
      modal.querySelector('#newCaseQty').value = '';
      modal.querySelector('#newCaseDim').value = '';
      modal.querySelector('#newCaseWeight').value = '';
      modal.querySelector('#newCaseMaxWeight').value = '';
      modal.querySelector('#newCaseMaxVolume').value = '';
      const addBtn = modal.querySelector('#casesManagerAdd');
      addBtn.textContent = '+ Добавить';
      delete addBtn.dataset.editId;
      this._editId = null;
    }
    if (this.onClose) this.onClose();
    commonManagerInstance = null;
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

export function openCasesManagerModal(onClose) {
  if (commonManagerInstance) {
    commonManagerInstance.close();
  }
  const modal = new CommonCasesManager(onClose);
  modal.init();
  return modal;
}

export default {
  CommonCasesManager,
  openCasesManagerModal,
};