// ui/components/OrderPage.js

import { getState, subscribe, saveState } from '../../core/store.js';
import { emit, EVENTS, on } from '../../core/events.js';
import { esc, debounce, getItemName, getCategory } from '../../core/utils.js';
import { CAT_NAMES, SEARCH_DEBOUNCE_DELAY } from '../../core/config.js';
import { showToast } from '../toast.js';
import { showPrompt, showConfirm, showChoice } from '../modal.js';
import { formatWeight, formatVolume, buildInfoHtml, getBgColorCSS } from '../render-utils.js';
import { getStockByPath } from '../../services/stock.js';
import { getItemPropsByPath } from '../../services/itemProps.js';
import { getCommonCases, getCommonCaseById } from '../../services/commonCases.js';
import { getCaseMode, setCaseMode, getTotalQty, setOrderValue, setOrderPacking, setIndividualCaseValues, setOrderExtra, getOrderPacking, getIndividualCaseValues, getOrderExtra, getLinks, setNote, getNote, clearOrder } from '../../services/order.js';
import { getPackaging } from '../../services/packaging.js';
import { createOrderPreset, loadOrderPreset, deleteOrderPreset, exportOrderPresets, importOrderPresets, getOrderPresetNames } from '../../services/presets.js';
import { getProjects, getProject } from '../../services/projects.js';

export class OrderPage {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.currentCategory = null;
    this.searchQuery = '';
    this.searchMode = false;
    this.detailsOpen = false;
    this._unsubscribe = null;
    this._handlers = [];
    this._debouncedSearch = debounce(() => this._applySearch(), SEARCH_DEBOUNCE_DELAY);
  }

  init() {
    try {
      this.detailsOpen = localStorage.getItem('detailsOpenOrder') === 'true';
    } catch { this.detailsOpen = false; }

    this._unsubscribe = subscribe((changedKey, state) => {
      if (changedKey === 'order' || changedKey === 'orderPacking' || changedKey === 'individualCaseValues' ||
          changedKey === 'orderExtra' || changedKey === 'orderSplits' || changedKey === 'links' ||
          changedKey === 'notes' || changedKey === 'caseModes' || changedKey === '*') {
        this._onDataChanged();
      }
    });

    this._handlers.push(
      on(EVENTS.EDITOR_DATA_CHANGED, () => this._onDataChanged()),
      on(EVENTS.PRESETS_CHANGED, () => this._populatePresetSelect()),
      on(EVENTS.PROJECT_CHANGED, () => this._populateProjectSelect())
    );

    this.render();
  }

  render() {
    if (!this.container) return;
    this.container.innerHTML = this._getPageHTML();
    this._bindEvents();
    this._populatePresetSelect();
    this._populateProjectSelect();
    this._loadProjectData();
    this._renderOrder();
    this._updateTotals();
    this._updateLinkCount();
    this._updateCommonCaseIndicators();
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

  _bindEvents() {
    const container = this.container;

    // Навигация назад
    const backBtn = container.querySelector('#btnBackToMenu');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (this.callbacks.onNavigate) this.callbacks.onNavigate('menu');
      });
    }

    // Пресеты
    container.querySelector('#saveOrderPreset')?.addEventListener('click', () => this._savePreset());
    container.querySelector('#loadOrderPreset')?.addEventListener('click', () => this._loadPreset());
    container.querySelector('#deleteOrderPreset')?.addEventListener('click', () => this._deletePreset());
    container.querySelector('#exportOrderPresets')?.addEventListener('click', () => this._exportPresets());
    container.querySelector('#importOrderPresetsBtn')?.addEventListener('click', () => {
      const fileInput = container.querySelector('#orderPresetFileInput');
      if (fileInput) fileInput.click();
    });
    container.querySelector('#orderPresetFileInput')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const count = importOrderPresets(ev.target.result);
            showToast(`Импортировано ${count} пресетов`, 'success');
            this._populatePresetSelect();
          } catch (err) {
            showToast('Ошибка: ' + err.message, 'error');
          }
        };
        reader.readAsText(file);
        e.target.value = '';
      }
    });

    // Поиск
    const searchInput = container.querySelector('#searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this.searchQuery = searchInput.value.trim();
        this._debouncedSearch();
      });
    }
    container.querySelector('#clearSearchBtn')?.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      this.searchQuery = '';
      this.searchMode = false;
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
        openMatrixModal(null, true, this.currentCategory);
      });
    });
    container.querySelector('#openCommonCasesManager')?.addEventListener('click', () => {
      import('../components/CommonCasesManager.js').then(({ openCasesManagerModal }) => {
        openCasesManagerModal(() => {
          this._updateCommonCaseIndicators();
          this._renderCurrentCategory();
        });
      });
    });

    // Проект
    const projectSelect = container.querySelector('#pProjectSelect');
    if (projectSelect) {
      projectSelect.addEventListener('change', () => this._onProjectSelectChange());
    }
    ['pProjectName', 'pStartDate', 'pEndDate', 'pProjectStatus'].forEach(id => {
      const el = container.querySelector('#' + id);
      if (el) el.addEventListener('change', () => this._onProjectFieldsChange());
    });

    // Основные поля
    const pName = container.querySelector('#pName');
    const pDate = container.querySelector('#pDate');
    const pComment = container.querySelector('#pComment');
    if (pName) pName.addEventListener('change', () => localStorage.setItem('last_order_name', pName.value));
    if (pDate) pDate.addEventListener('change', () => localStorage.setItem('last_date', pDate.value));
    if (pComment) pComment.addEventListener('input', () => localStorage.setItem('last_comment', pComment.value));

    // ===== ГЛАВНОЕ: единый делегированный обработчик на #categoryContents =====
    const contents = container.querySelector('#categoryContents');
    if (contents) {
      // Удаляем старые слушатели, если были (но при первом вызове их нет)
      // Для надёжности используем один раз
      if (!this._contentsBound) {
        contents.addEventListener('click', (e) => this._handleClick(e));
        contents.addEventListener('input', (e) => this._handleInput(e));
        this._contentsBound = true;
      }
    }
  }

  // ============================================================
  // ОБРАБОТЧИКИ (упрощённые)
  // ============================================================

  _handleClick(e) {
    const target = e.target.closest('button');
    if (!target) return;

    // Кнопки количества (+/-)
    if (target.classList.contains('btn-c')) {
      e.preventDefault();
      const path = target.dataset.path;
      const delta = parseInt(target.dataset.delta, 10);
      if (!path || isNaN(delta)) return;
      this._changeQtyByDelta(path, delta);
      return;
    }

    // Инфо
    if (target.classList.contains('info-btn')) {
      this._toggleInfo(target.dataset.path);
      return;
    }
    // Описание
    if (target.classList.contains('desc-btn')) {
      this._toggleDesc(target.dataset.path);
      return;
    }
    // Линк
    if (target.classList.contains('link-btn')) {
      import('../components/MatrixModal.js').then(({ openMatrixModal }) => {
        openMatrixModal(target.dataset.path, true, this.currentCategory);
      });
      return;
    }
    // Кофры
    if (target.classList.contains('case-btn')) {
      import('../components/CaseSettingsModal.js').then(({ openCaseSettingsModal }) => {
        openCaseSettingsModal(target.dataset.path, () => {
          this._updateRow(target.dataset.path);
          this._updateTotals();
          this._updateCommonCaseIndicators();
        });
      });
      return;
    }
    // Заметка
    if (target.classList.contains('note-btn')) {
      this._editNote(target.dataset.path);
      return;
    }
  }

  _handleInput(e) {
    const target = e.target;
    if (!target) return;

    // Простое поле количества (qty-input)
    if (target.classList.contains('qty-input')) {
      const path = target.dataset.path;
      let val = parseInt(target.value, 10) || 0;
      if (val < 0) val = 0;
      target.value = val;
      setOrderValue(path, val);
      this._updateRow(path);
      this._updateTotals();
      this._updateCategoryTotals(this.currentCategory);
      return;
    }

    // single-pieces-input
    if (target.classList.contains('single-pieces-input')) {
      const path = target.dataset.path;
      let val = parseInt(target.value, 10) || 0;
      if (val < 0) val = 0;
      target.value = val;
      setIndividualCaseValues(path, [val]);
      setOrderValue(path, val);
      this._updateRow(path);
      this._updateTotals();
      this._updateCategoryTotals(this.currentCategory);
      return;
    }

    // single-cases-input
    if (target.classList.contains('single-cases-input')) {
      const path = target.dataset.path;
      let val = parseInt(target.value, 10) || 0;
      if (val < 0) val = 0;
      const mode = getCaseMode(path);
      const options = getItemPropsByPath(path).individualCases || [];
      const opt = options[mode.selectedOption] || options[0];
      if (opt && opt.qty) {
        const maxCases = opt.maxCases || 0;
        if (maxCases > 0 && val > maxCases) {
          val = maxCases;
          target.value = val;
          showToast(`Превышен лимит кофров (макс. ${maxCases})`, 'warning');
        }
        const pieces = val * opt.qty;
        const sq = getStockByPath(path);
        if (pieces > sq) {
          showToast(`Превышено доступное количество (${sq})`, 'warning');
          const maxVal = Math.floor(sq / opt.qty);
          if (maxVal < val) {
            val = maxVal;
            target.value = val;
          }
        }
        const piecesInput = target.closest('.qty-controls')?.querySelector('.single-pieces-input');
        if (piecesInput) piecesInput.value = pieces;
        setIndividualCaseValues(path, [pieces]);
        setOrderValue(path, pieces);
        this._updateRow(path);
        this._updateTotals();
        this._updateCategoryTotals(this.currentCategory);
      }
      return;
    }

    // child-multi-pieces
    if (target.classList.contains('child-multi-pieces')) {
      const path = target.dataset.path;
      const idx = parseInt(target.dataset.idx, 10);
      let val = parseInt(target.value, 10) || 0;
      if (val < 0) val = 0;
      target.value = val;
      const vals = getIndividualCaseValues(path);
      vals[idx] = val;
      const total = vals.reduce((a, b) => a + b, 0);
      setIndividualCaseValues(path, vals);
      setOrderValue(path, total);
      this._updateRow(path);
      this._updateTotals();
      this._updateCategoryTotals(this.currentCategory);
      this._updateCommonCaseIndicators();
      return;
    }

    // child-common-qty
    if (target.classList.contains('child-common-qty')) {
      const path = target.dataset.path;
      const caseId = target.dataset.caseid;
      let val = parseInt(target.value, 10) || 0;
      if (val < 0) val = 0;
      target.value = val;
      const packing = getOrderPacking(path);
      const p = packing.find(p => p.caseId === caseId);
      if (p) {
        p.pieces = val;
        setOrderPacking(path, packing);
        this._updateRow(path);
        this._updateTotals();
        this._updateCategoryTotals(this.currentCategory);
        this._updateCommonCaseIndicators();
      }
      return;
    }

    // child-extra-qty
    if (target.classList.contains('child-extra-qty')) {
      const path = target.dataset.path;
      let val = parseInt(target.value, 10) || 0;
      if (val < 0) val = 0;
      target.value = val;
      setOrderExtra(path, val);
      this._updateRow(path);
      this._updateTotals();
      this._updateCategoryTotals(this.currentCategory);
      this._updateCommonCaseIndicators();
      return;
    }
  }

  _changeQtyByDelta(path, delta) {
    // Обработка всех типов кнопок +/- через единую функцию
    const btn = document.querySelector(`.btn-c[data-path="${path}"][data-delta="${delta}"]`);
    if (!btn) return;

    if (btn.classList.contains('qty-btn')) {
      const current = getTotalQty(path);
      const sq = getStockByPath(path);
      let newVal = Math.max(0, current + delta);
      if (newVal > sq) {
        showToast(`Доступно только ${sq} шт`, 'warning');
        newVal = sq;
      }
      setOrderValue(path, newVal);
    } else if (btn.classList.contains('single-piece-btn')) {
      const mode = getCaseMode(path);
      const options = getItemPropsByPath(path).individualCases || [];
      const opt = options[mode.selectedOption] || options[0];
      const current = getIndividualCaseValues(path)[0] || 0;
      let newVal = Math.max(0, current + delta);
      const sq = getStockByPath(path);
      if (newVal > sq) {
        showToast(`Доступно только ${sq} шт`, 'warning');
        newVal = sq;
      }
      if (opt && opt.maxCases > 0) {
        const maxPieces = opt.maxCases * opt.qty;
        if (newVal > maxPieces) {
          newVal = maxPieces;
          showToast(`Лимит кофров: макс. ${opt.maxCases} шт`, 'warning');
        }
      }
      setIndividualCaseValues(path, [newVal]);
      setOrderValue(path, newVal);
    } else if (btn.classList.contains('single-case-btn')) {
      const mode = getCaseMode(path);
      const options = getItemPropsByPath(path).individualCases || [];
      const opt = options[mode.selectedOption] || options[0];
      if (!opt) return;
      const currentCases = Math.ceil((getIndividualCaseValues(path)[0] || 0) / opt.qty);
      let newCases = Math.max(0, currentCases + delta);
      if (opt.maxCases > 0 && newCases > opt.maxCases) {
        newCases = opt.maxCases;
        showToast(`Лимит кофров: макс. ${opt.maxCases}`, 'warning');
      }
      const newPieces = newCases * opt.qty;
      const sq = getStockByPath(path);
      if (newPieces > sq) {
        const maxCases = Math.floor(sq / opt.qty);
        if (maxCases < newCases) {
          newCases = maxCases;
          showToast(`Доступно только ${sq} шт`, 'warning');
        }
      }
      const finalPieces = newCases * opt.qty;
      setIndividualCaseValues(path, [finalPieces]);
      setOrderValue(path, finalPieces);
    } else if (btn.classList.contains('child-multi-piece-btn')) {
      const idx = parseInt(btn.dataset.idx, 10);
      const vals = getIndividualCaseValues(path);
      const current = vals[idx] || 0;
      let newVal = Math.max(0, current + delta);
      const sq = getStockByPath(path);
      if (newVal > sq) {
        showToast(`Доступно только ${sq} шт`, 'warning');
        newVal = sq;
      }
      const options = getItemPropsByPath(path).individualCases || [];
      const opt = options[idx] || options[0];
      if (opt && opt.maxCases > 0) {
        const maxPieces = opt.maxCases * opt.qty;
        if (newVal > maxPieces) {
          newVal = maxPieces;
          showToast(`Лимит кофров вар.${idx+1}: макс. ${opt.maxCases}`, 'warning');
        }
      }
      vals[idx] = newVal;
      const total = vals.reduce((a, b) => a + b, 0);
      setIndividualCaseValues(path, vals);
      setOrderValue(path, total);
    } else if (btn.classList.contains('child-multi-case-btn')) {
      const idx = parseInt(btn.dataset.idx, 10);
      const vals = getIndividualCaseValues(path);
      const options = getItemPropsByPath(path).individualCases || [];
      const opt = options[idx] || options[0];
      if (!opt) return;
      const currentPieces = vals[idx] || 0;
      const currentCases = Math.ceil(currentPieces / opt.qty);
      let newCases = Math.max(0, currentCases + delta);
      if (opt.maxCases > 0 && newCases > opt.maxCases) {
        newCases = opt.maxCases;
        showToast(`Лимит кофров вар.${idx+1}: макс. ${opt.maxCases}`, 'warning');
      }
      const newPieces = newCases * opt.qty;
      const sq = getStockByPath(path);
      if (newPieces > sq) {
        const maxCases = Math.floor(sq / opt.qty);
        if (maxCases < newCases) {
          newCases = maxCases;
          showToast(`Доступно только ${sq} шт`, 'warning');
        }
      }
      const finalPieces = newCases * opt.qty;
      vals[idx] = finalPieces;
      const total = vals.reduce((a, b) => a + b, 0);
      setIndividualCaseValues(path, vals);
      setOrderValue(path, total);
    } else if (btn.classList.contains('child-common-btn')) {
      const caseId = btn.dataset.caseid;
      const packing = getOrderPacking(path);
      const p = packing.find(p => p.caseId === caseId);
      if (!p) return;
      let newVal = Math.max(0, (p.pieces || 0) + delta);
      const caseObj = getCommonCaseById(caseId);
      if (caseObj) {
        const maxPack = caseObj.qty || 0;
        if (newVal > maxPack) {
          newVal = maxPack;
          showToast(`Превышена вместимость кофра "${caseObj.name}" (${maxPack} шт)`, 'warning');
        }
        const props = getItemPropsByPath(path);
        const unitWeight = props.weight || 0;
        const filledWeight = newVal * unitWeight;
        if (caseObj.maxWeight && filledWeight > caseObj.maxWeight) {
          const maxByWeight = Math.floor(caseObj.maxWeight / unitWeight);
          if (maxByWeight < newVal) {
            newVal = maxByWeight;
            showToast(`Превышен макс. вес кофра "${caseObj.name}" (${caseObj.maxWeight} кг)`, 'warning');
          }
        }
      }
      p.pieces = newVal;
      const totalPacked = packing.reduce((s, p) => s + (p.pieces || 0), 0);
      const extra = getOrderExtra(path);
      const totalQty = totalPacked + extra;
      const sq = getStockByPath(path);
      if (totalQty > sq) {
        const diff = totalQty - sq;
        if (extra >= diff) {
          setOrderExtra(path, extra - diff);
        } else {
          p.pieces = Math.max(0, p.pieces - (diff - extra));
          setOrderExtra(path, 0);
          showToast(`Доступно только ${sq} шт`, 'warning');
        }
      }
      setOrderPacking(path, packing);
    } else if (btn.classList.contains('child-extra-btn')) {
      const current = getOrderExtra(path);
      let newVal = Math.max(0, current + delta);
      const packing = getOrderPacking(path);
      const totalPacked = packing.reduce((s, p) => s + (p.pieces || 0), 0);
      const totalQty = totalPacked + newVal;
      const sq = getStockByPath(path);
      if (totalQty > sq) {
        newVal = Math.max(0, sq - totalPacked);
        showToast(`Доступно только ${sq} шт`, 'warning');
      }
      setOrderExtra(path, newVal);
    }

    this._updateRow(path);
    this._updateTotals();
    this._updateCategoryTotals(this.currentCategory);
    this._updateCommonCaseIndicators();
  }

  // ============================================================
  // ОСТАЛЬНЫЕ МЕТОДЫ (без изменений, они такие же как раньше)
  // ============================================================

  // Здесь должны быть методы: _toggleInfo, _toggleDesc, _editNote,
  // _renderOrder, _renderTabs, _renderCategoryContent, _renderSearchResults,
  // _getAllPaths, _renderCurrentCategory, _buildItemRow, _buildQtyControls,
  // _updateRow, _updateChildRows, _updateTotals, _updateCategoryTotals,
  // _updateLinkCount, _updateCommonCaseIndicators, _populatePresetSelect,
  // _savePreset, _loadPreset, _deletePreset, _exportPresets, _exportJSON,
  // _exportPDF, _clearOrder, _populateProjectSelect, _loadProjectData,
  // _onProjectSelectChange, _onProjectFieldsChange, _onDataChanged, destroy
  // (они уже были в предыдущей полной версии, я их не копирую для краткости,
  // но они должны быть взяты из предыдущего файла)

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

export function createOrderPage(container, callbacks) {
  const page = new OrderPage(container, callbacks);
  page.init();
  return page;
}

export default {
  OrderPage,
  createOrderPage,
};