// components/cases/common-manager.js
import { getState, saveState } from '../../core/state.js';
import {
  getCommonCases,
  addCommonCase,
  updateCommonCase,
  deleteCommonCase,
} from '../../data/editor-data.js';
import { getOrderPacking } from '../../services/order-data.js';
import { getItemPropsByPath } from '../../services/calculations.js';
import { showToast } from '../../ui/toast.js';
import { showConfirm } from '../../ui/modal.js';
import { esc, getElement } from '../../ui/dom.js';
import { getColorCSS, getBgColorCSS } from '../../ui/render-utils.js';

let casesManagerCallback = null;

// ============================================================
// ОТКРЫТИЕ / ЗАКРЫТИЕ МОДАЛКИ
// ============================================================

export function openCasesManagerModal(callback) {
  casesManagerCallback = callback || null;
  renderCasesList();
  document.getElementById('casesManagerModal').classList.add('open');
}

function closeCasesManagerModal() {
  document.getElementById('casesManagerModal').classList.remove('open');
  if (casesManagerCallback) casesManagerCallback();
}

// ============================================================
// ОТРИСОВКА СПИСКА КОФРОВ
// ============================================================

function renderCasesList() {
  const container = document.getElementById('casesList');
  if (!container) return;
  const cases = getCommonCases();
  if (cases.length === 0) {
    container.innerHTML = '<div class="empty-message">Нет общих кофров</div>';
    return;
  }

  // Собираем статистику заполнения для каждого кофра
  const stats = new Map();
  cases.forEach(c => {
    stats.set(c.id, { totalWeight: 0, maxWeight: c.maxWeight || 0, name: c.name });
  });

  const state = getState();
  for (let path in state.orderPacking) {
    const packing = getOrderPacking(path);
    const props = getItemPropsByPath(path);
    const unitWeight = props.weight || 0;
    packing.forEach(p => {
      if (p.pieces <= 0) return;
      const stat = stats.get(p.caseId);
      if (stat) stat.totalWeight += p.pieces * unitWeight;
    });
  }

  let html = '';
  cases.forEach(c => {
    const stat = stats.get(c.id);
    const fillPercent = stat && stat.maxWeight > 0 ? Math.min(100, Math.round((stat.totalWeight / stat.maxWeight) * 100)) : 0;
    const color = getColorCSS(fillPercent);
    const bgColor = getBgColorCSS(fillPercent, 0.15);

    html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-bottom:1px solid var(--border-color);gap:10px;background:${bgColor};border-radius:4px;margin:2px 0;">
      <div style="flex:1;">
        <strong>${esc(c.name)}</strong>
        <br>
        <span style="font-size:13px;color:var(--text-secondary);">Вместимость: ${c.qty} шт, Габ: ${c.dimensions || 'н/д'}, Вес пустого: ${c.emptyWeight || 0} кг, Макс. вес: ${c.maxWeight || 0} кг, Макс. объём: ${c.maxVolume || 0} м³</span>
        <div style="margin-top:4px;display:flex;align-items:center;gap:8px;">
          <div style="flex:1;height:6px;background:var(--bg-input);border-radius:3px;overflow:hidden;">
            <div style="width:${fillPercent}%;height:100%;background:${color};border-radius:3px;transition:width 0.3s;"></div>
          </div>
          <span style="font-size:12px;color:${color};font-weight:bold;min-width:40px;">${fillPercent}%</span>
        </div>
      </div>
      <div>
        <button class="btn btn-sm" style="width:auto;padding:2px 8px;font-size:12px;" onclick="window.editCase('${c.id}')">✏️</button>
        <button class="btn btn-sm" style="width:auto;padding:2px 8px;font-size:12px;background:var(--danger);color:white;" onclick="window.deleteCase('${c.id}')">✕</button>
      </div>
    </div>`;
  });
  container.innerHTML = html;
}

// ============================================================
// РЕДАКТИРОВАНИЕ / УДАЛЕНИЕ (через window для onclick)
// ============================================================

window.editCase = function(id) {
  const cases = getCommonCases();
  const c = cases.find(c => c.id === id);
  if (!c) return;
  document.getElementById('newCaseName').value = c.name || '';
  document.getElementById('newCaseQty').value = c.qty || '';
  document.getElementById('newCaseDim').value = c.dimensions || '';
  document.getElementById('newCaseWeight').value = c.emptyWeight || '';
  document.getElementById('newCaseMaxWeight').value = c.maxWeight || '';
  document.getElementById('newCaseMaxVolume').value = c.maxVolume || '';
  const addBtn = document.getElementById('casesManagerAdd');
  addBtn.textContent = 'Обновить';
  addBtn.dataset.editId = id;
};

window.deleteCase = async function(id) {
  const confirmed = await showConfirm('Удалить этот кофр?');
  if (!confirmed) return;
  deleteCommonCase(id);
  renderCasesList();
  showToast('Кофр удалён', 'neutral');
};

// ============================================================
// ОБРАБОТЧИКИ КНОПОК
// ============================================================

export function initCasesManagerHandlers() {
  const addBtn = document.getElementById('casesManagerAdd');
  if (!addBtn) return;

  addBtn.addEventListener('click', function() {
    const name = document.getElementById('newCaseName').value.trim();
    const qty = parseInt(document.getElementById('newCaseQty').value);
    const dimensions = document.getElementById('newCaseDim').value.trim();
    const emptyWeight = parseFloat(document.getElementById('newCaseWeight').value);
    const maxWeight = parseFloat(document.getElementById('newCaseMaxWeight').value);
    const maxVolume = parseFloat(document.getElementById('newCaseMaxVolume').value);

    if (!name) {
      showToast('Введите название кофра', 'warning');
      return;
    }
    if (isNaN(qty) || qty <= 0) {
      showToast('Вместимость должна быть положительным числом', 'warning');
      return;
    }

    const editId = this.dataset.editId;
    if (editId) {
      updateCommonCase(editId, {
        name,
        qty,
        dimensions,
        emptyWeight: isNaN(emptyWeight) ? 0 : emptyWeight,
        maxWeight: isNaN(maxWeight) ? 0 : maxWeight,
        maxVolume: isNaN(maxVolume) ? 0 : maxVolume,
      });
      showToast('Кофр обновлён', 'success');
    } else {
      const newCase = {
        id: 'case_' + Date.now(),
        name,
        qty,
        dimensions,
        emptyWeight: isNaN(emptyWeight) ? 0 : emptyWeight,
        maxWeight: isNaN(maxWeight) ? 0 : maxWeight,
        maxVolume: isNaN(maxVolume) ? 0 : maxVolume,
      };
      addCommonCase(newCase);
      showToast('Кофр добавлен', 'success');
    }

    // Очищаем поля
    document.getElementById('newCaseName').value = '';
    document.getElementById('newCaseQty').value = '';
    document.getElementById('newCaseDim').value = '';
    document.getElementById('newCaseWeight').value = '';
    document.getElementById('newCaseMaxWeight').value = '';
    document.getElementById('newCaseMaxVolume').value = '';
    this.textContent = '+ Добавить';
    delete this.dataset.editId;
    renderCasesList();
    if (casesManagerCallback) casesManagerCallback();
  });
}

export function initCasesManagerCloseHandler() {
  const closeBtn = document.getElementById('casesManagerClose');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeCasesManagerModal);
  }
}

export function initCasesManagerOverlayClose() {
  const overlay = document.getElementById('casesManagerModal');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeCasesManagerModal();
      }
    });
  }
}

// ============================================================
// ЭКСПОРТ ПО УМОЛЧАНИЮ
// ============================================================
export default {
  openCasesManagerModal,
  renderCasesList,
  initCasesManagerHandlers,
  initCasesManagerCloseHandler,
  initCasesManagerOverlayClose,
};