// ui/components/EditorPage.js

/**
 * Компонент редактора склада.
 * Отвечает за управление категориями, подгруппами, позициями,
 * остатками, описаниями и свойствами.
 * @module ui/components/EditorPage
 */

import { getState, subscribe, saveState } from '../../core/store.js';
import { emit, EVENTS, on } from '../../core/events.js';
import { esc, deepClone, getItemName, getCategory } from '../../core/utils.js';
import { CAT_NAMES } from '../../core/config.js';
import { showToast } from '../toast.js';
import { showPrompt, showConfirm } from '../modal.js';
import { getStock, getStockByPath, setStock, setStockByPath, changeStock } from '../../services/stock.js';
import { getSpec, getSpecByPath, setSpec, setSpecByPath } from '../../services/specs.js';
import { getItemProps, getItemPropsByPath, setItemProps, addIndividualCaseVariant, removeIndividualCaseVariant, updateIndividualCaseVariant, addCommonCaseLink, removeCommonCaseLink, updateCommonCaseLink } from '../../services/itemProps.js';
import { getCommonCases, createCommonCase, updateCommonCase, deleteCommonCase } from '../../services/commonCases.js';
import { getTruckPresets, createTruckPreset, updateTruckPreset, deleteTruckPreset } from '../../services/trucks.js';
import { createCategory, deleteCategory, renameCategory, moveCategory, createSubgroup, deleteSubgroup, renameSubgroup, moveSubgroup, createItem, deleteItem, renameItem, moveItem, moveItemWithinGroup, getInventory, getCategoryOrder, getCategoryDisplayName, getItems, itemExists } from '../../services/inventory.js';
import { openPropsModalEditor } from '../components/PropsModal.js';
import { openCasesManagerModal } from '../components/CommonCasesManager.js';

// ============================================================
// КОМПОНЕНТ
// ============================================================

export class EditorPage {
  /**
   * @param {HTMLElement} container - контейнер для рендеринга
   * @param {Object} callbacks - колбэки (например, onNavigate)
   */
  constructor(container, callbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.currentCategory = null;
    this._handlers = [];
    this._unsubscribe = null;
  }

  /**
   * Инициализация компонента.
   */
  init() {
    // Подписываемся на изменения редактора
    this._unsubscribe = subscribe((changedKey, state) => {
      if (changedKey === 'inventory' || changedKey === 'stock' || changedKey === 'specs' ||
          changedKey === 'itemProps' || changedKey === 'commonCases' || changedKey === 'truckPresets' ||
          changedKey === '*') {
        this._onDataChanged();
      }
    });

    // Слушаем события
    this._handlers.push(
      on(EVENTS.EDITOR_DATA_CHANGED, () => this._onDataChanged())
    );

    this.render();
  }

  /**
   * Рендерит страницу.
   */
  render() {
    if (!this.container) return;
    this.container.innerHTML = this._getPageHTML();
    this._bindEvents();
    this._renderEditor();
  }

  /**
   * Возвращает HTML-разметку.
   */
  _getPageHTML() {
    return `
      <div class="card" id="editorPage">
        <button class="btn btn-sec" id="btnBackToMenu">◀ В меню</button>
        <h3 style="color:var(--text-primary);font-weight:600;margin-bottom:12px;">Редактор склада</h3>

        <div class="toolbar">
          <button id="exportBtn">📤 Экспорт JSON</button>
          <button id="importBtn">📥 Импорт JSON</button>
          <button id="resetBtn">🗑️ Сброс</button>
          <button id="saveHtmlBtn" class="btn-purple">📄 Сохранить в HTML</button>
          <button id="manageCasesBtn" class="btn-purple">📦 Общие кофры</button>
          <button id="manageTrucksBtn" class="btn-purple">🚚 Грузовики</button>
        </div>
        <input type="file" id="importFile" style="display:none" accept=".json">

        <div class="category-tabs" id="editorTabs"></div>
        <div id="editorContents"></div>

        <div class="editor-add">
          <input type="text" id="newCategoryName" placeholder="Новая категория">
          <button class="btn btn-green" style="width:auto;" id="addCategoryBtn">+ Добавить категорию</button>
        </div>
      </div>
    `;
  }

  // ============================================================
  // ПРИВЯЗКА СОБЫТИЙ
  // ============================================================

  _bindEvents() {
    const container = this.container;

    // Навигация назад
    const backBtn = container.querySelector('#btnBackToMenu');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (this.callbacks.onNavigate) this.callbacks.onNavigate('menu');
      });
    }

    // Экспорт
    container.querySelector('#exportBtn')?.addEventListener('click', () => this._exportJSON());

    // Импорт
    container.querySelector('#importBtn')?.addEventListener('click', () => {
      const fileInput = container.querySelector('#importFile');
      if (fileInput) fileInput.click();
    });
    container.querySelector('#importFile')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const data = JSON.parse(ev.target.result);
            this._importJSON(data);
            showToast('Импорт выполнен', 'success');
          } catch (err) {
            showToast('Ошибка: ' + err.message, 'error');
          }
        };
        reader.readAsText(file);
        e.target.value = '';
      }
    });

    // Сброс
    container.querySelector('#resetBtn')?.addEventListener('click', async () => {
      const confirmed = await showConfirm('Сбросить все данные редактора?', 'Сброс');
      if (confirmed) {
        const state = getState();
        state.inventory = {};
        state.stock = {};
        state.specs = {};
        state.itemProps = {};
        state.catNames = {};
        state._categoryOrder = [];
        state.commonCases = [];
        // Не сбрасываем truckPresets и проекты
        saveState();
        this._renderEditor();
        showToast('Данные сброшены', 'neutral');
      }
    });

    // Сохранить в HTML
    container.querySelector('#saveHtmlBtn')?.addEventListener('click', () => this._exportHTML());

    // Общие кофры
    container.querySelector('#manageCasesBtn')?.addEventListener('click', () => {
      openCasesManagerModal(() => {
        this._renderEditor();
      });
    });

    // Грузовики
    container.querySelector('#manageTrucksBtn')?.addEventListener('click', () => {
      // Открываем модалку управления грузовиками
      import('../components/TruckManager.js').then(({ openTruckManager }) => {
        openTruckManager(() => {
          this._renderEditor();
        });
      });
    });

    // Добавление категории
    container.querySelector('#addCategoryBtn')?.addEventListener('click', () => this._addCategory());

    // Нажатие Enter в поле новой категории
    container.querySelector('#newCategoryName')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._addCategory();
    });

    // Делегирование событий на содержимом
    const contents = container.querySelector('#editorContents');
    if (contents) {
      contents.addEventListener('click', (e) => this._handleEditorClick(e));
      contents.addEventListener('input', (e) => this._handleEditorInput(e));
      contents.addEventListener('change', (e) => this._handleEditorChange(e));
    }
  }

  // ============================================================
  // РЕНДЕРИНГ РЕДАКТОРА
  // ============================================================

  _renderEditor() {
    const state = getState();
    const inventory = state.inventory;
    const order = state._categoryOrder || Object.keys(inventory);

    // Рендерим вкладки
    this._renderTabs(order);

    // Рендерим содержимое
    if (this.currentCategory && inventory[this.currentCategory]) {
      this._renderCategory(this.currentCategory);
    } else if (order.length > 0) {
      this.currentCategory = order[0];
      this._renderCategory(this.currentCategory);
    } else {
      const contents = this.container.querySelector('#editorContents');
      if (contents) contents.innerHTML = '<div class="empty-message">Создайте первую категорию</div>';
    }
  }

  _renderTabs(order) {
    const container = this.container.querySelector('#editorTabs');
    if (!container) return;
    container.innerHTML = '';

    const state = getState();
    order.forEach(key => {
      if (!state.inventory[key]) return;
      const tab = document.createElement('div');
      tab.className = 'category-tab' + (key === this.currentCategory ? ' active' : '');
      const label = state.catNames[key] || key;
      tab.innerHTML = `<span>${esc(label)}</span>`;
      const actions = document.createElement('div');
      actions.className = 'tab-actions';

      const upBtn = document.createElement('button');
      upBtn.textContent = '▲';
      upBtn.title = 'Вверх';
      upBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._moveCategory(key, -1);
      });
      actions.appendChild(upBtn);

      const downBtn = document.createElement('button');
      downBtn.textContent = '▼';
      downBtn.title = 'Вниз';
      downBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._moveCategory(key, 1);
      });
      actions.appendChild(downBtn);

      const renameBtn = document.createElement('button');
      renameBtn.textContent = '✏️';
      renameBtn.title = 'Переименовать';
      renameBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._renameCategory(key);
      });
      actions.appendChild(renameBtn);

      const delBtn = document.createElement('button');
      delBtn.textContent = '✕';
      delBtn.className = 'danger';
      delBtn.title = 'Удалить';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._deleteCategory(key);
      });
      actions.appendChild(delBtn);

      tab.appendChild(actions);
      tab.dataset.cat = key;
      tab.addEventListener('click', (e) => {
        if (!e.target.closest('button')) {
          this.currentCategory = key;
          this._renderEditor();
        }
      });
      container.appendChild(tab);
    });
  }

  _renderCategory(catKey) {
    const container = this.container.querySelector('#editorContents');
    if (!container) return;
    const state = getState();
    const catData = state.inventory[catKey];
    if (!catData) {
      container.innerHTML = '<div class="empty-message">Категория пуста</div>';
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'category-content active';

    if (Array.isArray(catData)) {
      // Плоский список
      const listDiv = document.createElement('div');
      listDiv.className = 'subgroup';
      listDiv.style.border = 'none';

      const header = document.createElement('div');
      header.className = 'subgroup-header';
      header.innerHTML = `<span class="name">${state.catNames[catKey] || catKey}</span>`;
      listDiv.appendChild(header);

      const itemsDiv = document.createElement('div');
      itemsDiv.className = 'items-list';
      if (catData.length === 0) {
        itemsDiv.innerHTML = '<div class="empty-message">Нет позиций</div>';
      } else {
        catData.forEach(item => {
          itemsDiv.appendChild(this._buildItemRow(catKey, null, item));
        });
      }
      listDiv.appendChild(itemsDiv);

      const addBtn = document.createElement('button');
      addBtn.className = 'add-item';
      addBtn.textContent = '+ Добавить позицию';
      addBtn.addEventListener('click', () => this._addItem(catKey, null));
      listDiv.appendChild(addBtn);

      wrapper.appendChild(listDiv);
    } else if (typeof catData === 'object') {
      // Вложенные подгруппы
      const subOrder = catData._subOrder || Object.keys(catData).filter(k => k !== '_subOrder');
      subOrder.forEach(subKey => {
        const subItems = catData[subKey];
        if (!Array.isArray(subItems)) return;

        const subgroup = document.createElement('div');
        subgroup.className = 'subgroup';

        const header = document.createElement('div');
        header.className = 'subgroup-header';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'name';
        nameSpan.textContent = subKey;
        nameSpan.title = 'Двойной клик для переименования';
        nameSpan.addEventListener('dblclick', () => this._renameSubgroup(catKey, subKey));
        header.appendChild(nameSpan);

        const controls = document.createElement('div');
        controls.className = 'controls';

        const renameBtn = document.createElement('button');
        renameBtn.textContent = '✏️';
        renameBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._renameSubgroup(catKey, subKey);
        });
        controls.appendChild(renameBtn);

        const upBtn = document.createElement('button');
        upBtn.textContent = '▲';
        upBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._moveSubgroup(catKey, subKey, -1);
        });
        controls.appendChild(upBtn);

        const downBtn = document.createElement('button');
        downBtn.textContent = '▼';
        downBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._moveSubgroup(catKey, subKey, 1);
        });
        controls.appendChild(downBtn);

        const delBtn = document.createElement('button');
        delBtn.textContent = '✕';
        delBtn.className = 'danger';
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._deleteSubgroup(catKey, subKey);
        });
        controls.appendChild(delBtn);

        header.appendChild(controls);
        subgroup.appendChild(header);

        const itemsDiv = document.createElement('div');
        itemsDiv.className = 'items-list';
        if (subItems.length === 0) {
          itemsDiv.innerHTML = '<div class="empty-message">Нет позиций</div>';
        } else {
          subItems.forEach(item => {
            itemsDiv.appendChild(this._buildItemRow(catKey, subKey, item));
          });
        }
        subgroup.appendChild(itemsDiv);

        const addBtn = document.createElement('button');
        addBtn.className = 'add-item';
        addBtn.textContent = '+ Добавить позицию';
        addBtn.addEventListener('click', () => this._addItem(catKey, subKey));
        subgroup.appendChild(addBtn);

        wrapper.appendChild(subgroup);
      });

      // Кнопка добавления подгруппы
      const addSubBtn = document.createElement('button');
      addSubBtn.className = 'add-subgroup';
      addSubBtn.textContent = '+ Добавить подгруппу';
      addSubBtn.addEventListener('click', () => this._addSubgroup(catKey));
      wrapper.appendChild(addSubBtn);
    } else {
      wrapper.innerHTML = '<div class="empty-message">Неизвестный формат данных</div>';
    }

    container.innerHTML = '';
    container.appendChild(wrapper);
  }

  // ============================================================
  // ПОСТРОЕНИЕ СТРОКИ ПОЗИЦИИ В РЕДАКТОРЕ
  // ============================================================

  _buildItemRow(catKey, subKey, itemName) {
    const row = document.createElement('div');
    row.className = 'item-row';

    const mainLine = document.createElement('div');
    mainLine.className = 'main-line';
    mainLine.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:4px 0;';

    // Имя
    const nameDiv = document.createElement('span');
    nameDiv.className = 'name';
    nameDiv.style.cssText = 'flex:1 1 180px;font-size:14px;';
    nameDiv.textContent = itemName;
    nameDiv.title = 'Двойной клик для переименования';
    nameDiv.addEventListener('dblclick', () => this._renameItem(catKey, subKey, itemName));
    mainLine.appendChild(nameDiv);

    // Остаток
    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.className = 'qty';
    qtyInput.style.cssText = 'width:70px;padding:4px 6px;border:1px solid var(--border-light);border-radius:4px;font-size:14px;text-align:center;background:var(--bg-input);color:var(--text-primary);flex-shrink:0;';
    const stock = getStock(catKey, subKey, itemName);
    qtyInput.value = stock;
    qtyInput.dataset.path = subKey ? `${catKey}|${subKey}|${itemName}` : `${catKey}|${itemName}`;
    qtyInput.addEventListener('change', (e) => {
      const val = parseInt(e.target.value, 10) || 0;
      setStockByPath(e.target.dataset.path, val);
      showToast('Остаток обновлён', 'neutral');
    });
    mainLine.appendChild(qtyInput);

    // Описание
    const specInput = document.createElement('input');
    specInput.type = 'text';
    specInput.className = 'spec';
    specInput.style.cssText = 'flex:2 1 200px;padding:4px 6px;border:1px solid var(--border-light);border-radius:4px;font-size:13px;min-width:120px;background:var(--bg-input);color:var(--text-primary);';
    specInput.placeholder = 'Комментарий...';
    const spec = getSpec(catKey, subKey, itemName);
    specInput.value = spec;
    specInput.dataset.path = subKey ? `${catKey}|${subKey}|${itemName}` : `${catKey}|${itemName}`;
    specInput.addEventListener('change', (e) => {
      setSpecByPath(e.target.dataset.path, e.target.value);
      showToast('Описание обновлено', 'neutral');
    });
    mainLine.appendChild(specInput);

    // Действия
    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.style.cssText = 'display:flex;gap:4px;flex-shrink:0;';

    const upBtn = document.createElement('button');
    upBtn.textContent = '⬆';
    upBtn.title = 'Переместить вверх';
    upBtn.style.cssText = 'background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:16px;padding:0 4px;';
    upBtn.addEventListener('click', () => {
      moveItemWithinGroup(catKey, subKey, itemName, -1);
      this._renderEditor();
    });
    actions.appendChild(upBtn);

    const downBtn = document.createElement('button');
    downBtn.textContent = '⬇';
    downBtn.title = 'Переместить вниз';
    downBtn.style.cssText = 'background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:16px;padding:0 4px;';
    downBtn.addEventListener('click', () => {
      moveItemWithinGroup(catKey, subKey, itemName, 1);
      this._renderEditor();
    });
    actions.appendChild(downBtn);

    const propsBtn = document.createElement('button');
    propsBtn.textContent = '📦';
    propsBtn.title = 'Свойства';
    propsBtn.style.cssText = 'background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:16px;padding:0 4px;';
    propsBtn.addEventListener('click', () => {
      openPropsModalEditor(catKey, subKey, itemName, () => {
        this._renderEditor();
      });
    });
    actions.appendChild(propsBtn);

    const moveBtn = document.createElement('button');
    moveBtn.textContent = '↗';
    moveBtn.title = 'Переместить в другую категорию';
    moveBtn.style.cssText = 'background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:16px;padding:0 4px;';
    moveBtn.addEventListener('click', () => this._moveItemTo(catKey, subKey, itemName));
    actions.appendChild(moveBtn);

    const renameBtn = document.createElement('button');
    renameBtn.textContent = '✏️';
    renameBtn.title = 'Переименовать';
    renameBtn.style.cssText = 'background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:16px;padding:0 4px;';
    renameBtn.addEventListener('click', () => this._renameItem(catKey, subKey, itemName));
    actions.appendChild(renameBtn);

    const delBtn = document.createElement('button');
    delBtn.textContent = '✕';
    delBtn.title = 'Удалить';
    delBtn.style.cssText = 'background:none;border:none;color:var(--danger);cursor:pointer;font-size:16px;padding:0 4px;';
    delBtn.addEventListener('click', () => this._deleteItem(catKey, subKey, itemName));
    actions.appendChild(delBtn);

    mainLine.appendChild(actions);
    row.appendChild(mainLine);

    // Информация о свойствах
    const props = getItemProps(catKey, subKey, itemName);
    const infoDiv = document.createElement('div');
    infoDiv.className = 'props-info';
    infoDiv.style.cssText = 'font-size:12px;color:var(--text-secondary);padding:4px 0 0 12px;border-left:2px solid var(--accent);margin-left:12px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;';
    const weight = props.weight ? props.weight + ' кг' : 'н/д';
    const dims = props.dimensions || 'н/д';
    const cases = (props.individualCases || []).length;
    const common = (props.commonCases || []).length;
    infoDiv.innerHTML = `
      <span>Вес: ${weight}</span>
      <span>Габариты: ${dims}</span>
      <span>Индивидуальные кофры: ${cases}</span>
      <span>Общие кофры: ${common}</span>
      <span>Общие кофры разрешены: ${props.allowCommon ? 'Да' : 'Нет'}</span>
    `;
    row.appendChild(infoDiv);

    return row;
  }

  // ============================================================
  // ОБРАБОТЧИКИ СОБЫТИЙ В РЕДАКТОРЕ
  // ============================================================

  _handleEditorClick(e) {
    // Обработка кликов по кнопкам внутри строк — уже обработаны через прямые слушатели
  }

  _handleEditorInput(e) {
    // Обработка ввода — уже обработаны через прямые слушатели
  }

  _handleEditorChange(e) {
    // Обработка изменения — уже обработаны через прямые слушатели
  }

  // ============================================================
  // ОПЕРАЦИИ С КАТЕГОРИЯМИ
  // ============================================================

  async _addCategory() {
    const input = this.container.querySelector('#newCategoryName');
    const name = input?.value?.trim();
    if (!name) {
      showToast('Введите название категории', 'warning');
      return;
    }
    try {
      createCategory(name);
      input.value = '';
      this._renderEditor();
      showToast('Категория добавлена', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async _renameCategory(key) {
    const newName = await showPrompt('Переименовать категорию', 'Новое название:', key);
    if (!newName || newName === key) return;
    try {
      renameCategory(key, newName);
      if (this.currentCategory === key) this.currentCategory = newName;
      this._renderEditor();
      showToast('Категория переименована', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async _deleteCategory(key) {
    const confirmed = await showConfirm(`Удалить категорию "${key}"? Все позиции будут удалены.`);
    if (!confirmed) return;
    try {
      deleteCategory(key);
      if (this.currentCategory === key) {
        const order = getCategoryOrder();
        this.currentCategory = order.length > 0 ? order[0] : null;
      }
      this._renderEditor();
      showToast('Категория удалена', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  _moveCategory(key, delta) {
    try {
      moveCategory(key, delta);
      this._renderEditor();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // ============================================================
  // ОПЕРАЦИИ С ПОДГРУППАМИ
  // ============================================================

  async _addSubgroup(catKey) {
    const name = await showPrompt('Введите название новой подгруппы', 'Название:', '', '');
    if (!name || !name.trim()) return;
    try {
      createSubgroup(catKey, name.trim());
      this._renderEditor();
      showToast('Подгруппа добавлена', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async _renameSubgroup(catKey, subKey) {
    const newName = await showPrompt('Переименовать подгруппу', 'Новое название:', subKey);
    if (!newName || newName === subKey) return;
    try {
      renameSubgroup(catKey, subKey, newName);
      this._renderEditor();
      showToast('Подгруппа переименована', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async _deleteSubgroup(catKey, subKey) {
    const confirmed = await showConfirm(`Удалить подгруппу "${subKey}"?`);
    if (!confirmed) return;
    try {
      deleteSubgroup(catKey, subKey);
      this._renderEditor();
      showToast('Подгруппа удалена', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  _moveSubgroup(catKey, subKey, delta) {
    try {
      moveSubgroup(catKey, subKey, delta);
      this._renderEditor();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // ============================================================
  // ОПЕРАЦИИ С ПОЗИЦИЯМИ
  // ============================================================

  async _addItem(catKey, subKey) {
    const name = await showPrompt('Введите название новой позиции', 'Название:', '', '');
    if (!name || !name.trim()) return;
    try {
      createItem(catKey, subKey, name.trim());
      this._renderEditor();
      showToast('Позиция добавлена', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async _renameItem(catKey, subKey, oldName) {
    const newName = await showPrompt('Переименовать позицию', 'Новое название:', oldName);
    if (!newName || newName === oldName) return;
    try {
      renameItem(catKey, subKey, oldName, newName);
      this._renderEditor();
      showToast('Позиция переименована', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async _deleteItem(catKey, subKey, itemName) {
    const confirmed = await showConfirm(`Удалить позицию "${itemName}"?`);
    if (!confirmed) return;
    try {
      deleteItem(catKey, subKey, itemName);
      this._renderEditor();
      showToast('Позиция удалена', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async _moveItemTo(catKey, subKey, itemName) {
    const targetPath = await showPrompt(
      'Переместить позицию',
      'Введите путь (категория|подгруппа) или "категория" для корневого списка:',
      '',
      'Например: light|Приборы'
    );
    if (!targetPath) return;
    const parts = targetPath.split('|');
    const targetCat = parts[0];
    const targetSub = parts[1] || null;
    try {
      moveItem(catKey, subKey, itemName, targetCat, targetSub);
      this._renderEditor();
      showToast(`"${itemName}" перемещён`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // ============================================================
  // ЭКСПОРТ / ИМПОРТ
  // ============================================================

  _exportJSON() {
    const state = getState();
    const data = {
      inventory: state.inventory,
      stock: state.stock,
      specs: state.specs,
      itemProps: state.itemProps,
      catNames: state.catNames,
      _categoryOrder: state._categoryOrder,
      commonCases: state.commonCases,
      truckPresets: state.truckPresets,
      projects: state.projects,
      projectItems: state.projectItems,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'library.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('JSON экспортирован', 'success');
  }

  _importJSON(data) {
    const state = getState();
    if (data.inventory) state.inventory = data.inventory;
    if (data.stock) state.stock = data.stock;
    if (data.specs) state.specs = data.specs;
    if (data.itemProps) state.itemProps = data.itemProps;
    if (data.catNames) state.catNames = data.catNames;
    if (data._categoryOrder) state._categoryOrder = data._categoryOrder;
    if (data.commonCases) state.commonCases = data.commonCases;
    if (data.truckPresets) state.truckPresets = data.truckPresets;
    if (data.projects) state.projects = data.projects;
    if (data.projectItems) state.projectItems = data.projectItems;
    // Нормализация структуры
    for (const cat in state.inventory) {
      const catData = state.inventory[cat];
      if (catData && typeof catData === 'object' && !Array.isArray(catData)) {
        if (!catData._subOrder) {
          catData._subOrder = Object.keys(catData).filter(k => k !== '_subOrder');
        }
      }
    }
    saveState();
    this._renderEditor();
  }

  _exportHTML() {
    const state = getState();
    let html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Инвентарь</title>
<style>
body{font-family:'Segoe UI',Arial,sans-serif;margin:40px;color:#222;background:#fff}
h1{color:#2c3e50;border-bottom:2px solid #3498db;padding-bottom:10px}
table{width:100%;border-collapse:collapse;margin-top:20px;font-size:14px}
th{background:#2c3e50;color:#fff;padding:8px;text-align:left}
td{padding:6px 8px;border-bottom:1px solid #ddd}
tr:nth-child(even){background:#f9f9f9}
.category{background:#e6f2ff;font-weight:bold}
.subgroup{background:#f0f4f8;font-weight:bold}
</style>
</head><body>
<h1>Инвентарь склада</h1>
<table><thead><tr><th>Категория</th><th>Подгруппа</th><th>Позиция</th><th>В наличии</th><th>Вес (кг)</th><th>Габариты (см)</th></tr></thead><tbody>`;

    const order = state._categoryOrder || Object.keys(state.inventory);
    order.forEach(cat => {
      const catData = state.inventory[cat];
      if (!catData) return;
      if (Array.isArray(catData)) {
        catData.forEach(item => {
          const path = cat + '|' + item;
          const stock = state.stock[path] || 0;
          const props = state.itemProps[path] || {};
          html += `<tr><td>${esc(cat)}</td><td></td><td>${esc(item)}</td><td>${stock}</td><td>${props.weight || ''}</td><td>${props.dimensions || ''}</td></tr>`;
        });
      } else if (typeof catData === 'object') {
        const subOrder = catData._subOrder || Object.keys(catData).filter(k => k !== '_subOrder');
        subOrder.forEach(sub => {
          const items = catData[sub] || [];
          if (!Array.isArray(items)) return;
          items.forEach(item => {
            const path = cat + '|' + sub + '|' + item;
            const stock = state.stock[path] || 0;
            const props = state.itemProps[path] || {};
            html += `<tr><td>${esc(cat)}</td><td>${esc(sub)}</td><td>${esc(item)}</td><td>${stock}</td><td>${props.weight || ''}</td><td>${props.dimensions || ''}</td></tr>`;
          });
        });
      }
    });

    html += `</tbody></table>
<div style="margin-top:30px;display:flex;gap:12px;">
  <button onclick="window.print()" style="padding:10px 24px;background:#2c3e50;color:white;border:none;border-radius:6px;font-size:16px;cursor:pointer;">Сохранить PDF</button>
  <button onclick="window.close()" style="padding:10px 24px;background:#ddd;color:#333;border:none;border-radius:6px;font-size:16px;cursor:pointer;">Закрыть</button>
</div>
</body></html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
    } else {
      showToast('Не удалось открыть окно', 'error');
    }
  }

  // ============================================================
  // ОБРАБОТКА ИЗМЕНЕНИЙ ДАННЫХ
  // ============================================================

  _onDataChanged() {
    this._renderEditor();
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
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

// ============================================================
// ФАБРИЧНАЯ ФУНКЦИЯ
// ============================================================

export function createEditorPage(container, callbacks) {
  const page = new EditorPage(container, callbacks);
  page.init();
  return page;
}

export default {
  EditorPage,
  createEditorPage,
};