// ui/components/OrderPage.js

/**
 * Главный компонент страницы заказа.
 * Максимально простой: рендерит вкладки, категории, обрабатывает клики по кнопкам через прямые обработчики.
 * @module ui/components/OrderPage
 */

import { getState, subscribe, saveState } from '../../core/store.js';
import { getOrder, getTotalQty, setOrderValue, clearOrder } from '../../services/order.js';
import { getStockByPath } from '../../services/stock.js';
import { getItemPropsByPath } from '../../services/itemProps.js';
import { getCategoryOrder, getCategoryDisplayName } from '../../services/inventory.js';
import { CAT_NAMES } from '../../core/config.js';
import { showToast } from '../toast.js';
import { esc, getItemName } from '../../core/utils.js';

// ============================================================
// КОМПОНЕНТ
// ============================================================

export class OrderPage {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.currentCategory = null;
    this._unsubscribe = null;
  }

  init() {
    // Подписываемся на изменения заказа, чтобы обновлять UI
    this._unsubscribe = subscribe((changedKey) => {
      if (changedKey === 'order' || changedKey === 'orderPacking' ||
          changedKey === 'individualCaseValues' || changedKey === 'orderExtra' ||
          changedKey === 'caseModes' || changedKey === '*') {
        this.render();
      }
    });

    this.render();
  }

  render() {
    if (!this.container) return;
    this.container.innerHTML = this._getPageHTML();
    this._bindEvents();
    this._renderTabs();
    this._renderCategory();
    this._updateTotals();
    this._updateLinkCount();
  }

  _getPageHTML() {
    return `
      <div class="card" id="orderPage">
        <button class="btn btn-sec" id="btnBackToMenu">◀ В меню</button>
        <h3 style="color:var(--text-primary);font-weight:600;margin-bottom:12px;">Создание списка</h3>

        <input type="text" id="pName" class="input-field" placeholder="Название мероприятия">
        <input type="date" id="pDate" class="input-field">
        <textarea id="pComment" class="input-textarea" placeholder="Комментарий"></textarea>

        <div class="category-tabs" id="categoryTabs"></div>
        <div id="categoryContents"></div>

        <div id="globalTotals" class="global-totals">
          <span><strong>Всего:</strong> <span id="totalQty">0</span> шт</span>
          <span><strong>Вес:</strong> <span id="totalWeight">0</span> кг</span>
          <span><strong>Объём:</strong> <span id="totalVolume">0</span> м³</span>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:15px;">
          <button class="btn btn-green" style="flex:1;" id="saveJ">💾 Сохранить JSON</button>
          <button class="btn btn-orange" style="flex:1;" id="savePdf">📄 Сохранить PDF</button>
          <button class="btn btn-red" style="flex:1;" id="clearOrder">🗑️ Очистить</button>
        </div>
      </div>
    `;
  }

  _bindEvents() {
    const container = this.container;

    // Навигация назад
    container.querySelector('#btnBackToMenu')?.addEventListener('click', () => {
      if (this.callbacks.onNavigate) this.callbacks.onNavigate('menu');
    });

    // Очистка заказа
    container.querySelector('#clearOrder')?.addEventListener('click', () => {
      clearOrder();
      this.render();
      showToast('Список очищен', 'success');
    });

    // Экспорт JSON (заглушка)
    container.querySelector('#saveJ')?.addEventListener('click', () => {
      showToast('Экспорт JSON будет реализован позже', 'neutral');
    });

    // Экспорт PDF (заглушка)
    container.querySelector('#savePdf')?.addEventListener('click', () => {
      showToast('Экспорт PDF будет реализован позже', 'neutral');
    });

    // Поля ввода (для сохранения в localStorage — опционально)
    const pName = container.querySelector('#pName');
    const pDate = container.querySelector('#pDate');
    const pComment = container.querySelector('#pComment');
    if (pName) pName.addEventListener('change', () => localStorage.setItem('last_order_name', pName.value));
    if (pDate) pDate.addEventListener('change', () => localStorage.setItem('last_date', pDate.value));
    if (pComment) pComment.addEventListener('input', () => localStorage.setItem('last_comment', pComment.value));

    // Восстанавливаем сохранённые значения
    if (pName) pName.value = localStorage.getItem('last_order_name') || '';
    if (pDate) pDate.value = localStorage.getItem('last_date') || '';
    if (pComment) pComment.value = localStorage.getItem('last_comment') || '';
  }

  // ============================================================
  // РЕНДЕРИНГ ВКЛАДОК
  // ============================================================

  _renderTabs() {
    const container = this.container.querySelector('#categoryTabs');
    if (!container) return;
    const state = getState();
    const orderKeys = state._categoryOrder || Object.keys(state.inventory);
    if (orderKeys.length === 0) {
      container.innerHTML = '<div class="empty-message">Нет категорий</div>';
      return;
    }
    container.innerHTML = '';
    orderKeys.forEach(key => {
      if (!state.inventory[key]) return;
      const tab = document.createElement('div');
      tab.className = 'category-tab' + (key === this.currentCategory ? ' active' : '');
      tab.textContent = CAT_NAMES[key] || key;
      tab.dataset.cat = key;
      tab.addEventListener('click', () => {
        this.currentCategory = key;
        this._renderTabs();
        this._renderCategory();
        this._updateTotals();
        this._updateLinkCount();
      });
      container.appendChild(tab);
    });
    if (!this.currentCategory || !orderKeys.includes(this.currentCategory)) {
      this.currentCategory = orderKeys[0];
      this._renderTabs();
    }
  }

  // ============================================================
  // РЕНДЕРИНГ КАТЕГОРИИ
  // ============================================================

  _renderCategory() {
    const container = this.container.querySelector('#categoryContents');
    if (!container) return;
    const state = getState();
    const catKey = this.currentCategory;
    const catData = state.inventory[catKey];
    if (!catData) {
      container.innerHTML = '<div class="empty-message">Категория пуста</div>';
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'category-content active';

    if (Array.isArray(catData)) {
      // Плоский список
      catData.forEach(item => {
        const path = catKey + '|' + item;
        wrapper.appendChild(this._buildItemRow(path));
      });
    } else if (typeof catData === 'object') {
      // Вложенные подгруппы
      const subOrder = catData._subOrder || Object.keys(catData).filter(k => k !== '_subOrder');
      subOrder.forEach(subKey => {
        const subItems = catData[subKey];
        if (!Array.isArray(subItems)) return;
        const subgroupDiv = document.createElement('div');
        subgroupDiv.className = 'subgroup';
        const header = document.createElement('div');
        header.className = 'subgroup-header';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'name';
        nameSpan.textContent = subKey;
        header.appendChild(nameSpan);
        subgroupDiv.appendChild(header);
        const itemsDiv = document.createElement('div');
        itemsDiv.className = 'items-list';
        subItems.forEach(item => {
          const path = catKey + '|' + subKey + '|' + item;
          itemsDiv.appendChild(this._buildItemRow(path));
        });
        subgroupDiv.appendChild(itemsDiv);
        wrapper.appendChild(subgroupDiv);
      });
    } else {
      wrapper.innerHTML = '<div class="empty-message">Неизвестный формат данных</div>';
    }

    container.innerHTML = '';
    container.appendChild(wrapper);

    // Обновляем итоги категории
    this._updateCategoryTotals(catKey);
  }

  // ============================================================
  // ПОСТРОЕНИЕ СТРОКИ ПОЗИЦИИ
  // ============================================================

  _buildItemRow(path) {
    const sq = getStockByPath(path);
    const totalQty = getTotalQty(path);
    const props = getItemPropsByPath(path);
    const isOverstock = totalQty > sq;
    const isAdded = totalQty > 0;
    const rowClass = (isAdded ? 'added' : '') + (isOverstock ? ' overstock' : '');

    const row = document.createElement('div');
    row.className = `row ${rowClass}`;
    row.dataset.path = path;

    // name-area
    const nameArea = document.createElement('div');
    nameArea.className = 'name-area';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'name';
    nameSpan.textContent = getItemName(path);
    nameArea.appendChild(nameSpan);
    row.appendChild(nameArea);

    // extra-info (краткая информация)
    const extraDiv = document.createElement('div');
    extraDiv.className = 'extra-info';
    let info = `<span>в наличии: <strong>${sq}</strong></span>`;
    if (totalQty > 0) {
      info = `<span><strong>${totalQty}</strong> шт добавлено</span> ` + info;
    }
    extraDiv.innerHTML = info;
    row.appendChild(extraDiv);

    // action-buttons (пока только кнопки количества и заглушки)
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'action-buttons';

    // Кнопки количества будут в qty-controls

    row.appendChild(actionsDiv);

    // qty-controls
    const qtyControls = this._buildQtyControls(path);
    row.appendChild(qtyControls);

    // Заметка и линк — пока просто текст для демонстрации
    // (можно добавить позже)

    return row;
  }

  _buildQtyControls(path) {
    const totalQty = getTotalQty(path);
    const div = document.createElement('div');
    div.className = 'qty-controls';

    const minusBtn = document.createElement('button');
    minusBtn.className = 'btn-c qty-btn';
    minusBtn.dataset.path = path;
    minusBtn.dataset.delta = '-1';
    minusBtn.textContent = '−';
    minusBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this._handleQtyClick(path, -1);
    });

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'qty-input';
    input.value = totalQty;
    input.min = 0;
    input.step = 1;
    input.dataset.path = path;
    input.addEventListener('change', (e) => {
      const val = parseInt(e.target.value, 10) || 0;
      this._handleQtyChange(path, val);
    });

    const plusBtn = document.createElement('button');
    plusBtn.className = 'btn-c qty-btn';
    plusBtn.dataset.path = path;
    plusBtn.dataset.delta = '1';
    plusBtn.textContent = '+';
    plusBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this._handleQtyClick(path, 1);
    });

    div.appendChild(minusBtn);
    div.appendChild(input);
    div.appendChild(plusBtn);
    return div;
  }

  // ============================================================
  // ОБРАБОТЧИКИ КОЛИЧЕСТВА
  // ============================================================

  _handleQtyClick(path, delta) {
    const current = getTotalQty(path);
    const sq = getStockByPath(path);
    let newVal = Math.max(0, current + delta);
    if (newVal > sq) {
      showToast(`Доступно только ${sq} шт`, 'warning');
      newVal = sq;
    }
    this._handleQtyChange(path, newVal);
  }

  _handleQtyChange(path, newVal) {
    setOrderValue(path, newVal);
    // Обновляем строку и итоги
    this._updateRow(path);
    this._updateTotals();
    this._updateCategoryTotals(this.currentCategory);
  }

  // ============================================================
  // ОБНОВЛЕНИЕ СТРОКИ
  // ============================================================

  _updateRow(path) {
    const container = this.container.querySelector('#categoryContents');
    if (!container) return;
    const oldRow = container.querySelector(`.row[data-path="${path}"]`);
    if (!oldRow) return;

    // Просто заменяем строку новой (это надёжно)
    const newRow = this._buildItemRow(path);
    oldRow.replaceWith(newRow);
  }

  // ============================================================
  // ОБНОВЛЕНИЕ ИТОГОВ
  // ============================================================

  _updateTotals() {
    const state = getState();
    let totalQty = 0;
    for (const path in state.order) {
      totalQty += state.order[path];
    }
    const qtyEl = document.getElementById('totalQty');
    if (qtyEl) qtyEl.textContent = totalQty;
    // Вес и объём пока просто заглушки
  }

  _updateCategoryTotals(catKey) {
    // Можно реализовать позже, если нужно
  }

  _updateLinkCount() {
    // Заглушка
    const el = document.getElementById('linkCount');
    if (el) el.textContent = '(0 активных)';
  }

  // ============================================================
  // УНИЧТОЖЕНИЕ
  // ============================================================

  destroy() {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
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