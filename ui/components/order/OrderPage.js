// ui/components/order/OrderPage.js

import { getState, subscribe, saveState } from '../../../core/store.js';
import { emit, EVENTS, on } from '../../../core/events.js';
import { debounce } from '../../../core/utils.js';
import { CAT_NAMES, SEARCH_DEBOUNCE_DELAY } from '../../../core/config.js';
import { showToast } from '../../toast.js';
import { clearOrder } from '../../../services/order.js';
import { getProjects } from '../../../services/projects.js';

// Импорт всех модулей OrderPage
import {
  getAllPaths,
  filterPathsByQuery,
  groupPathsByCategory,
  truncateName
} from './OrderUtils.js';

import {
  updateTotals,
  updateCategoryTotals,
  updateLinkCount
} from './OrderTotals.js';

import {
  setCurrentCategory,
  getCurrentCategory,
  setSearchMode,
  getSearchMode,
  setSearchQuery,
  getSearchQuery,
  renderTabs,
  renderCategoryContent,
  renderSearchResults,
  buildItemRow,
  buildQtyControls,
  updateRow,
  updateChildRows,
  updateCommonCaseIndicators
} from './OrderRenderer.js';

import {
  setCurrentCategoryForActions,
  toggleInfo,
  toggleDesc,
  editNote,
  changeQty,
  changeSinglePiece,
  changeSingleCase,
  changeMultiPiece,
  changeMultiCase,
  changeCommonQty,
  changeExtraQty,
  handleQuantityChange,
  handleQuantityInput
} from './OrderActions.js';

import {
  bindOrderEvents,
  unbindOrderEvents,
  updateEventsCategory
} from './OrderEvents.js';

import {
  populatePresetSelect,
  savePreset,
  loadPreset,
  deletePreset,
  exportPresets,
  importPresets
} from './OrderPresets.js';

import {
  populateProjectSelect,
  loadProjectData,
  onProjectSelectChange,
  onProjectFieldsChange
} from './OrderProjects.js';

// ============================================================
// ОСНОВНОЙ КОМПОНЕНТ
// ============================================================

export class OrderPage {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.detailsOpen = false;
    this._unsubscribe = null;
    this._handlers = [];
    this._debouncedSearch = debounce(() => this._applySearch(), SEARCH_DEBOUNCE_DELAY);
  }

  init() {
    try {
      this.detailsOpen = localStorage.getItem('detailsOpenOrder') === 'true';
    } catch { this.detailsOpen = false; }

    // Подписка на изменения store
    this._unsubscribe = subscribe((changedKey, state) => {
      if (changedKey === 'order' || changedKey === 'orderPacking' ||
          changedKey === 'individualCaseValues' || changedKey === 'orderExtra' ||
          changedKey === 'orderSplits' || changedKey === 'links' ||
          changedKey === 'notes' || changedKey === 'caseModes' || changedKey === '*') {
        this._onDataChanged();
      }
    });

    // Слушаем события
    this._handlers.push(
      on(EVENTS.EDITOR_DATA_CHANGED, () => this._onDataChanged()),
      on(EVENTS.PRESETS_CHANGED, () => populatePresetSelect()),
      on(EVENTS.PROJECT_CHANGED, () => populateProjectSelect())
    );

    this.render();
  }

  render() {
    if (!this.container) return;
    this.container.innerHTML = this._getPageHTML();
    this._bindEvents();
    populatePresetSelect();
    populateProjectSelect();
    loadProjectData();
    this._renderOrder();
    updateTotals();
    updateLinkCount();
    updateCommonCaseIndicators();
  }

  _getPageHTML() {
    return `
      <div class="card" id="orderPage">
        <button class="btn btn-sec" id="btnBackToMenu">◀ В меню</button>
        <h3 style="color:var(--text-primary);font-weight:600;margin-bottom:12px;">Создание списка</h3>

        <input type="text" id="pName" class="input-field" placeholder="Название мероприятия">
        <input type="date" id="pDate" class="input-field">
        <textarea id="pComment" class="input-textarea" placeholder="Комментарий"></textarea>

        <div style="margin-bottom:15px;padding:12px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border-color);">
          <h4 style="color:var(--text-secondary);margin-bottom:8px;">📋 Привязка к проекту</h4>
          <div style="display:flex;flex-wrap:wrap;gap:10px;">
            <div style="flex:1;min-width:150px;">
              <label style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:2px;">Название проекта</label>
              <input type="text" id="pProjectName" placeholder="Название проекта" class="input-field">
            </div>
            <div style="flex:0 1 160px;">
              <label style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:2px;">Дата начала</label>
              <input type="date" id="pStartDate" class="input-field">
            </div>
            <div style="flex:0 1 160px;">
              <label style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:2px;">Дата окончания</label>
              <input type="date" id="pEndDate" class="input-field">
            </div>
            <div style="flex:0 1 150px;">
              <label style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:2px;">Статус</label>
              <select id="pProjectStatus" class="input-field" style="padding:8px;">
                <option value="planned">Запланирован</option>
                <option value="active">Активен</option>
                <option value="completed">Завершён</option>
              </select>
            </div>
          </div>
          <div style="margin-top:8px;">
            <label style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:2px;">Или выберите существующий проект</label>
            <select id="pProjectSelect" class="input-field" style="padding:8px;">
              <option value="">— Выберите проект —</option>
            </select>
          </div>
        </div>

        <div style="margin-bottom:15px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;">
          <button class="btn btn-purple" id="openMatrixModal">📊 Матрица привязок</button>
          <span style="font-size:14px;color:var(--text-secondary);" id="linkCount">(0 активных)</span>
          <button class="btn btn-purple" id="openCommonCasesManager">📦 Общие кофры</button>
        </div>

        <div class="preset-bar">
          <select id="orderPresetSelect"><option value="">— Выберите пресет —</option></select>
          <button id="saveOrderPreset">💾 Сохранить</button>
          <button id="loadOrderPreset">📂 Загрузить</button>
          <button id="exportOrderPresets">📤 Экспорт</button>
          <button id="importOrderPresetsBtn">📥 Импорт</button>
          <input type="file" id="orderPresetFileInput" style="display:none" accept=".json">
          <button id="deleteOrderPreset" style="color:var(--danger);">✕ Удалить</button>
          <label class="overlay-toggle"><input type="checkbox" id="orderOverlayToggle"> Наложение</label>
        </div>

        <div class="category-tabs" id="categoryTabs"></div>
        <div class="search-box">
          <input type="text" id="searchInput" placeholder="Поиск...">
          <button class="clear-btn" id="clearSearchBtn">✕</button>
        </div>
        <div id="categoryContents"></div>

        <div id="globalTotals" class="global-totals">
          <span><strong>Всего:</strong> <span id="totalQty">0</span> шт</span>
          <span><strong>Вес:</strong> <span id="totalWeight">0</span> кг</span>
          <span><strong>Объём:</strong> <span id="totalVolume">0</span> м³</span>
          <button class="detail-btn" id="detailToggle">Подробно</button>
          <div class="global-details" id="globalDetails"></div>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:15px;">
          <button class="btn btn-green" style="flex:1;" id="saveJ">💾 Сохранить JSON</button>
          <button class="btn btn-orange" style="flex:1;" id="savePdf">📄 Сохранить PDF</button>
          <button class="btn btn-red" style="flex:1;" id="clearOrder">🗑️ Очистить</button>
        </div>
      </div>
    `;
  }

  // ============================================================
  // ПРИВЯЗКА СОБЫТИЙ
  // ============================================================

  _bindEvents() {
    const container = this.container;

    // Навигация
    container.querySelector('#btnBackToMenu')?.addEventListener('click', () => {
      if (this.callbacks.onNavigate) this.callbacks.onNavigate('menu');
    });

    // Пресеты
    container.querySelector('#saveOrderPreset')?.addEventListener('click', savePreset);
    container.querySelector('#loadOrderPreset')?.addEventListener('click', loadPreset);
    container.querySelector('#deleteOrderPreset')?.addEventListener('click', deletePreset);
    container.querySelector('#exportOrderPresets')?.addEventListener('click', exportPresets);
    container.querySelector('#importOrderPresetsBtn')?.addEventListener('click', () => {
      const fileInput = container.querySelector('#orderPresetFileInput');
      if (fileInput) fileInput.click();
    });
    container.querySelector('#orderPresetFileInput')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        importPresets(file);
        e.target.value = '';
      }
    });

    // Поиск
    const searchInput = container.querySelector('#searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        setSearchQuery(searchInput.value.trim());
        this._debouncedSearch();
      });
    }
    container.querySelector('#clearSearchBtn')?.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      setSearchQuery('');
      setSearchMode(false);
      this._renderCurrentCategory();
    });

    // Детали
    container.querySelector('#detailToggle')?.addEventListener('click', () => {
      this.detailsOpen = !this.detailsOpen;
      localStorage.setItem('detailsOpenOrder', JSON.stringify(this.detailsOpen));
      const details = container.querySelector('#globalDetails');
      if (details) details.classList.toggle('open', this.detailsOpen);
      const toggle = container.querySelector('#detailToggle');
      if (toggle) toggle.textContent = this.detailsOpen ? 'Скрыть' : 'Подробно';
    });

    // Экспорт и очистка
    container.querySelector('#saveJ')?.addEventListener('click', () => this._exportJSON());
    container.querySelector('#savePdf')?.addEventListener('click', () => this._exportPDF());
    container.querySelector('#clearOrder')?.addEventListener('click', () => this._clearOrder());

    // Матрица и общие кофры
    container.querySelector('#openMatrixModal')?.addEventListener('click', () => {
      import('../components/MatrixModal.js').then(({ openMatrixModal }) => {
        openMatrixModal(null, true, getCurrentCategory());
      });
    });
    container.querySelector('#openCommonCasesManager')?.addEventListener('click', () => {
      import('../components/CommonCasesManager.js').then(({ openCasesManagerModal }) => {
        openCasesManagerModal(() => {
          updateCommonCaseIndicators();
          this._renderCurrentCategory();
        });
      });
    });

    // Проект
    const projectSelect = container.querySelector('#pProjectSelect');
    if (projectSelect) {
      projectSelect.addEventListener('change', onProjectSelectChange);
    }
    ['pProjectName', 'pStartDate', 'pEndDate', 'pProjectStatus'].forEach(id => {
      const el = container.querySelector('#' + id);
      if (el) el.addEventListener('change', onProjectFieldsChange);
    });

    // Основные поля
    const pName = container.querySelector('#pName');
    const pDate = container.querySelector('#pDate');
    const pComment = container.querySelector('#pComment');
    if (pName) pName.addEventListener('change', () => localStorage.setItem('last_order_name', pName.value));
    if (pDate) pDate.addEventListener('change', () => localStorage.setItem('last_date', pDate.value));
    if (pComment) pComment.addEventListener('input', () => localStorage.setItem('last_comment', pComment.value));

    // Привязываем события для категорий (клики и инпуты)
    bindOrderEvents({
      onOpenMatrix: (path) => {
        import('../components/MatrixModal.js').then(({ openMatrixModal }) => {
          openMatrixModal(path, true, getCurrentCategory());
        });
      },
      onOpenCaseSettings: (path, callback) => {
        import('../components/CaseSettingsModal.js').then(({ openCaseSettingsModal }) => {
          openCaseSettingsModal(path, callback);
        });
      }
    });
  }

  // ============================================================
  // РЕНДЕРИНГ
  // ============================================================

  _renderOrder() {
    const state = getState();
    const orderKeys = state._categoryOrder || Object.keys(state.inventory);
    if (orderKeys.length === 0) {
      const tabs = this.container.querySelector('#categoryTabs');
      if (tabs) tabs.innerHTML = '<div class="empty-message">Нет категорий</div>';
      const contents = this.container.querySelector('#categoryContents');
      if (contents) contents.innerHTML = '';
      return;
    }
    let currentCat = getCurrentCategory();
    if (!currentCat || !orderKeys.includes(currentCat)) {
      currentCat = orderKeys[0];
      setCurrentCategory(currentCat);
    }
    renderTabs((catKey) => {
      setCurrentCategory(catKey);
      setSearchMode(false);
      setSearchQuery('');
      const input = document.getElementById('searchInput');
      if (input) input.value = '';
      this._renderCurrentCategory();
      updateTotals();
      updateLinkCount();
      updateEventsCategory();
    });
    this._renderCurrentCategory();
  }

  _renderCurrentCategory() {
    const cat = getCurrentCategory();
    if (cat) {
      renderCategoryContent(cat);
      updateEventsCategory();
    }
  }

  _applySearch() {
    const query = getSearchQuery();
    if (query) {
      setSearchMode(true);
      const container = document.getElementById('categoryContents');
      if (container) {
        const state = getState();
        const allPaths = getAllPaths();
        const filtered = filterPathsByQuery(allPaths, query, state.specs || {});
        if (filtered.length === 0) {
          container.innerHTML = '<div class="empty-message">Ничего не найдено</div>';
        } else {
          const grouped = groupPathsByCategory(filtered);
          const wrapper = document.createElement('div');
          wrapper.className = 'category-content active';
          const orderKeys = state._categoryOrder || Object.keys(state.inventory);
          orderKeys.forEach(cat => {
            if (!grouped[cat]) return;
            const catTitle = document.createElement('div');
            catTitle.className = 'sub-cat-t';
            catTitle.textContent = CAT_NAMES[cat] || cat;
            wrapper.appendChild(catTitle);
            grouped[cat].forEach(path => {
              wrapper.appendChild(buildItemRow(path, 1));
            });
          });
          container.innerHTML = '';
          container.appendChild(wrapper);
        }
      }
    } else {
      setSearchMode(false);
      this._renderCurrentCategory();
    }
  }

  // ============================================================
  // ЭКСПОРТ JSON / PDF
  // ============================================================

  _exportJSON() {
    const state = getState();
    const name = this.container.querySelector('#pName')?.value?.trim() || 'Мероприятие';
    const date = this.container.querySelector('#pDate')?.value || new Date().toLocaleDateString('ru-RU');
    const comment = this.container.querySelector('#pComment')?.value?.trim() || '';

    const data = {
      project_name: name,
      date,
      comment,
      items: state.order,
      splits: state.orderSplits,
      specs: state.specs || {},
      packing: state.orderPacking,
      individual_cases: state.individualCaseValues,
      routes: state.commonRoutes,
      links: state.links,
      notes: state.notes,
      exclude: state.orderExclude,
      extra: state.orderExtra,
    };

    const totalItems = Object.keys(state.order).length +
                       Object.keys(state.orderSplits).length +
                       Object.keys(state.orderExtra).length;
    if (totalItems === 0 && Object.keys(state.orderPacking).length === 0) {
      showToast('Список пуст', 'warning');
      return;
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('JSON сохранён', 'success');
  }

  _exportPDF() {
    const state = getState();
    const name = this.container.querySelector('#pName')?.value?.trim() || 'Мероприятие';
    const date = this.container.querySelector('#pDate')?.value || new Date().toLocaleDateString('ru-RU');
    const comment = this.container.querySelector('#pComment')?.value?.trim() || '';

    const items = [];
    for (const path in state.order) {
      if (state.order[path] > 0) items.push({ path, qty: state.order[path] });
    }
    for (const path in state.orderSplits) {
      const splits = state.orderSplits[path] || [];
      splits.forEach(seg => {
        if (seg.qty > 0) items.push({ path, qty: seg.qty });
      });
    }
    for (const path in state.orderExtra) {
      if (state.orderExtra[path] > 0) items.push({ path, qty: state.orderExtra[path] });
    }

    if (items.length === 0) {
      showToast('Нет позиций для экспорта', 'warning');
      return;
    }

    const catItems = {};
    items.forEach(({ path, qty }) => {
      const parts = path.split('|');
      const cat = parts[0];
      const itemName = parts.slice(1).join(' → ');
      if (!catItems[cat]) catItems[cat] = [];
      catItems[cat].push({ name: itemName, qty });
    });

    let html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Чек-лист</title>
<style>
body{font-family:'Segoe UI',Arial,sans-serif;margin:40px;color:#222;background:#fff}
h1{color:#2c3e50;border-bottom:2px solid #3498db;padding-bottom:10px}
.meta{margin:20px 0;color:#555}
table{width:100%;border-collapse:collapse;margin-top:20px;font-size:14px}
th{background:#2c3e50;color:#fff;padding:8px;text-align:left}
td{padding:6px 8px;border-bottom:1px solid #ddd}
tr:nth-child(even){background:#f9f9f9}
.total-row{font-weight:bold;background:#e6f2ff!important;border-top:2px solid #3498db}
.grand-total{font-weight:bold;background:#d4e6ff!important;border-top:3px solid #1a3a5a;font-size:16px}
.actions{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);display:flex;gap:12px;background:white;padding:12px 24px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.2);z-index:1000;}
.actions .print{background:#2c3e50;color:white;}
.actions .close{background:#ddd;color:#333;}
</style>
</head><body>
<h1>Чек-лист: ${name}</h1>
<div class="meta"><strong>Дата:</strong> ${date}<br><strong>Комментарий:</strong> ${comment || '—'}</div>
<table><thead><tr><th>Категория</th><th>Позиция</th><th>Кол-во (шт)</th></tr></thead><tbody>`;

    let grandQty = 0;
    const orderKeys = state._categoryOrder || Object.keys(state.inventory);
    orderKeys.forEach(cat => {
      if (!catItems[cat]) return;
      let first = true, catQty = 0;
      for (const item of catItems[cat]) {
        catQty += item.qty;
        html += `<tr><td>${first ? cat : ''}</td><td>${item.name}</td><td>${item.qty}</td></tr>`;
        first = false;
      }
      grandQty += catQty;
      html += `<tr class="total-row"><td colspan="2"><strong>Итого в категории</strong></td><td><strong>${catQty} шт</strong></td></tr>`;
    });
    html += `<tr class="grand-total"><td colspan="2"><strong>Общий итог</strong></td><td><strong>${grandQty} шт</strong></td></tr>`;
    html += `</tbody></table>
<div class="actions">
  <button class="print" onclick="window.print()">Сохранить PDF</button>
  <button class="close" onclick="window.close()">Назад</button>
</div>
</body></html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
    } else {
      showToast('Не удалось открыть новую вкладку', 'error');
    }
  }

  // ============================================================
  // ОЧИСТКА ЗАКАЗА
  // ============================================================

  async _clearOrder() {
    const { showConfirm } = await import('../../modal.js');
    const confirmed = await showConfirm('Очистить список?');
    if (!confirmed) return;
    clearOrder();
    this._renderOrder();
    updateTotals();
    updateLinkCount();
    updateCommonCaseIndicators();
    showToast('Список очищен', 'success');
  }

  // ============================================================
  // ОБРАБОТКА ИЗМЕНЕНИЙ
  // ============================================================

  _onDataChanged() {
    this._renderOrder();
    updateTotals();
    updateLinkCount();
    updateCommonCaseIndicators();
  }

  // ============================================================
  // УНИЧТОЖЕНИЕ
  // ============================================================

  destroy() {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    for (const handler of this._handlers) {
      if (typeof handler === 'function') handler();
    }
    this._handlers = [];
    unbindOrderEvents();
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

// ============================================================
// ФАБРИЧНАЯ ФУНКЦИЯ
// ============================================================

export function createOrderPage(container, callbacks) {
  const page = new OrderPage(container, callbacks);
  page.init();
  return page;
}

export default {
  OrderPage,
  createOrderPage,
};