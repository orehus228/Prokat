// ui/components/TruckManager.js
// Исправлена ошибка в методе close — добавлены проверки на существование элементов

import { getState, saveState } from '../../core/store.js';
import { emit, EVENTS } from '../../core/events.js';
import { esc, deepClone } from '../../core/utils.js';
import { showToast } from '../toast.js';
import { showConfirm } from '../modal.js';
import { getTruckPresets, getTruckPresetById, createTruckPreset, updateTruckPreset, deleteTruckPreset, getSelectedTruckIds, setSelectedTruckIds } from '../../services/trucks.js';

let truckManagerInstance = null;

export class TruckManager {
  constructor(onClose) {
    this.onClose = onClose || null;
    this._modalEl = null;
    this._container = null;
    this._editId = null;
    this._handlers = [];
  }

  init() {
    let modal = document.getElementById('truckManagerModal');
    if (!modal) {
      modal = this._createModalDOM();
      document.body.appendChild(modal);
    }
    this._modalEl = modal;
    this._container = modal.querySelector('#truckList');
    this._bindEvents();
    this._render();
    this._modalEl.classList.add('open');
    truckManagerInstance = this;
  }

  _createModalDOM() {
    const div = document.createElement('div');
    div.className = 'modal-overlay';
    div.id = 'truckManagerModal';
    div.innerHTML = `
      <div class="modal" style="max-width:600px;max-height:90vh;overflow-y:auto;">
        <h3 style="color:var(--text-primary);">🚛 Управление грузовиками</h3>
        <div id="truckList" style="margin-bottom:15px;max-height:250px;overflow-y:auto;"></div>
        <div style="border-top:1px solid var(--border-color);padding-top:15px;">
          <h4 style="color:var(--text-secondary);">Добавить / редактировать грузовик</h4>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <div style="grid-column:1/3;">
              <label style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:2px;">Название</label>
              <input type="text" id="truckName" placeholder="Грузовик 10т" style="width:100%;padding:6px 10px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:4px;color:var(--text-primary);">
            </div>
            <div>
              <label style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:2px;">Длина (см)</label>
              <input type="number" id="truckLength" placeholder="600" style="width:100%;padding:6px 10px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:4px;color:var(--text-primary);">
            </div>
            <div>
              <label style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:2px;">Ширина (см)</label>
              <input type="number" id="truckWidth" placeholder="240" style="width:100%;padding:6px 10px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:4px;color:var(--text-primary);">
            </div>
            <div>
              <label style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:2px;">Высота (см)</label>
              <input type="number" id="truckHeight" placeholder="240" style="width:100%;padding:6px 10px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:4px;color:var(--text-primary);">
            </div>
            <div>
              <label style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:2px;">Макс. вес (кг)</label>
              <input type="number" id="truckMaxWeight" placeholder="10000" style="width:100%;padding:6px 10px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:4px;color:var(--text-primary);">
            </div>
          </div>
          <div class="buttons" style="margin-top:12px;display:flex;justify-content:flex-end;gap:8px;">
            <button class="cancel" id="truckManagerClose">Закрыть</button>
            <button class="confirm" id="truckAddBtn">+ Добавить</button>
          </div>
        </div>
      </div>
    `;
    return div;
  }

  _bindEvents() {
    const modal = this._modalEl;
    if (!modal) return;

    modal.querySelector('#truckManagerClose')?.addEventListener('click', () => this.close());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.close();
    });
    modal.querySelector('#truckAddBtn')?.addEventListener('click', () => this._saveTruck());

    modal.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;
      const id = target.dataset.id;
      if (action === 'edit') this._editTruck(id);
      else if (action === 'delete') this._deleteTruck(id);
    });
  }

  _render() {
    const container = this._container;
    if (!container) return;
    const presets = getTruckPresets();
    const selectedIds = getSelectedTruckIds();
    if (presets.length === 0) {
      container.innerHTML = '<div class="empty-message">Нет грузовиков</div>';
      return;
    }
    let html = '';
    for (const t of presets) {
      const isSelected = selectedIds.includes(t.id) ? '✅' : '';
      html += `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-bottom:1px solid var(--border-color);gap:10px;">
          <div>
            <strong>${esc(t.name)}</strong> ${isSelected}
            <br>
            <span style="font-size:13px;color:var(--text-secondary);">
              ${t.length||0}x${t.width||0}x${t.height||0} см, макс. вес: ${t.maxWeight||0} кг
            </span>
          </div>
          <div style="display:flex;gap:4px;flex-shrink:0;">
            <button class="btn btn-sm" data-action="edit" data-id="${t.id}" style="padding:2px 8px;font-size:12px;">✏️</button>
            <button class="btn btn-sm" data-action="delete" data-id="${t.id}" style="padding:2px 8px;font-size:12px;background:var(--danger);color:white;">✕</button>
          </div>
        </div>
      `;
    }
    container.innerHTML = html;
  }

  _editTruck(id) {
    const t = getTruckPresetById(id);
    if (!t) { showToast('Грузовик не найден', 'error'); return; }
    const modal = this._modalEl;
    if (!modal) return;
    modal.querySelector('#truckName').value = t.name || '';
    modal.querySelector('#truckLength').value = t.length || '';
    modal.querySelector('#truckWidth').value = t.width || '';
    modal.querySelector('#truckHeight').value = t.height || '';
    modal.querySelector('#truckMaxWeight').value = t.maxWeight || '';
    const addBtn = modal.querySelector('#truckAddBtn');
    addBtn.textContent = 'Обновить';
    addBtn.dataset.editId = id;
    this._editId = id;
  }

  async _deleteTruck(id) {
    const t = getTruckPresetById(id);
    if (!t) { showToast('Грузовик не найден', 'error'); return; }
    const confirmed = await showConfirm(`Удалить грузовик "${t.name}"?`);
    if (!confirmed) return;
    try {
      deleteTruckPreset(id);
      const selected = getSelectedTruckIds();
      setSelectedTruckIds(selected.filter(sid => sid !== id));
      this._render();
      showToast('Грузовик удалён', 'neutral');
      emit(EVENTS.EDITOR_DATA_CHANGED, { action: 'deleteTruck', id });
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  _saveTruck() {
    const modal = this._modalEl;
    if (!modal) return;
    const name = modal.querySelector('#truckName').value.trim();
    const length = parseFloat(modal.querySelector('#truckLength').value);
    const width = parseFloat(modal.querySelector('#truckWidth').value);
    const height = parseFloat(modal.querySelector('#truckHeight').value);
    const maxWeight = parseFloat(modal.querySelector('#truckMaxWeight').value) || 0;
    if (!name) { showToast('Введите название грузовика', 'warning'); return; }
    if (isNaN(length) || length <= 0) { showToast('Длина должна быть положительным числом', 'warning'); return; }
    if (isNaN(width) || width <= 0) { showToast('Ширина должна быть положительным числом', 'warning'); return; }
    if (isNaN(height) || height <= 0) { showToast('Высота должна быть положительным числом', 'warning'); return; }

    const editId = this._editId || modal.querySelector('#truckAddBtn').dataset.editId;
    try {
      if (editId) {
        updateTruckPreset(editId, { name, length, width, height, maxWeight });
        showToast('Грузовик обновлён', 'success');
      } else {
        createTruckPreset({ name, length, width, height, maxWeight });
        showToast('Грузовик добавлен', 'success');
      }
      modal.querySelector('#truckName').value = '';
      modal.querySelector('#truckLength').value = '';
      modal.querySelector('#truckWidth').value = '';
      modal.querySelector('#truckHeight').value = '';
      modal.querySelector('#truckMaxWeight').value = '';
      const addBtn = modal.querySelector('#truckAddBtn');
      addBtn.textContent = '+ Добавить';
      delete addBtn.dataset.editId;
      this._editId = null;
      this._render();
      emit(EVENTS.EDITOR_DATA_CHANGED, { action: 'saveTruck' });
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  close() {
    if (this._modalEl) {
      this._modalEl.classList.remove('open');
      const modal = this._modalEl;
      // Безопасно очищаем поля
      const fields = ['truckName', 'truckLength', 'truckWidth', 'truckHeight', 'truckMaxWeight'];
      for (const id of fields) {
        const el = modal.querySelector('#' + id);
        if (el) el.value = '';
      }
      const addBtn = modal.querySelector('#truckAddBtn');
      if (addBtn) {
        addBtn.textContent = '+ Добавить';
        delete addBtn.dataset.editId;
      }
      this._editId = null;
    }
    if (this.onClose) this.onClose();
    truckManagerInstance = null;
  }

  destroy() {
    this.close();
  }
}

export function openTruckManager(onClose) {
  if (truckManagerInstance) truckManagerInstance.close();
  const modal = new TruckManager(onClose);
  modal.init();
  return modal;
}

export default {
  TruckManager,
  openTruckManager,
};