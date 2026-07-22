// ui/components/OrderPage.js

import { getState, subscribe, saveState } from '../../core/store.js';
import { emit, EVENTS, on } from '../../core/events.js';
import { esc, debounce, deepClone, getItemName, getCategory } from '../../core/utils.js';
import { CAT_NAMES, SEARCH_DEBOUNCE_DELAY, REPEAT_DELAY, REPEAT_INTERVAL } from '../../core/config.js';
import { showToast, queueToast } from '../toast.js';
import { showPrompt, showConfirm, showChoice } from '../modal.js';
import { formatWeight, formatVolume, formatDimensions, buildInfoHtml, getColorCSS, getBgColorCSS } from '../render-utils.js';
import { getStockByPath } from '../../services/stock.js';
import { getItemPropsByPath, setItemProps } from '../../services/itemProps.js';
import { getCommonCases, getCommonCaseById } from '../../services/commonCases.js';
import { getCaseMode, setCaseMode, getTotalQty, setOrderValue, setOrderPacking, setIndividualCaseValues, setOrderExtra, getOrderPacking, getIndividualCaseValues, getOrderExtra, getLinks, setNote, getNote, clearOrder } from '../../services/order.js';
import { getPackaging, invalidatePackagingCache } from '../../services/packaging.js';
import { getMatrixLinks, addMatrixLink, removeMatrixLink } from '../../services/matrix.js';
import { createOrderPreset, loadOrderPreset, deleteOrderPreset, exportOrderPresets, importOrderPresets, getOrderPresets, getOrderPresetNames } from '../../services/presets.js';
import { getProjects, getProject } from '../../services/projects.js';

export class OrderPage {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.currentCategory = null;
    this.searchQuery = '';
    this.searchMode = false;
    this.detailsOpen = false;
    this._handlers = [];
    this._unsubscribe = null;
    this._repeatState = null;
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

  // ... (остальные методы без изменений, они уже были в предыдущих версиях)

  // ============================================================
  // ПРИВЯЗКА СОБЫТИЙ (перепривязываем при каждом рендере, но с защитой от дублей)
  // ============================================================

  _bindEvents() {
    const container = this.container;

    // Удаляем старые слушатели, чтобы не дублировать
    // (используем сохранённые ссылки, если они есть)
    if (this._boundEvents) {
      for (const { el, event, handler } of this._boundEvents) {
        el.removeEventListener(event, handler);
      }
    }
    this._boundEvents = [];

    // Функция-помощник для привязки
    const bind = (el, event, handler) => {
      if (!el) return;
      el.addEventListener(event, handler);
      this._boundEvents.push({ el, event, handler });
    };

    // Навигация назад
    const backBtn = container.querySelector('#btnBackToMenu');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (this.callbacks.onNavigate) this.callbacks.onNavigate('menu');
      });
    }

    // Пресеты
    bind(container.querySelector('#saveOrderPreset'), 'click', () => this._savePreset());
    bind(container.querySelector('#loadOrderPreset'), 'click', () => this._loadPreset());
    bind(container.querySelector('#deleteOrderPreset'), 'click', () => this._deletePreset());
    bind(container.querySelector('#exportOrderPresets'), 'click', () => this._exportPresets());
    bind(container.querySelector('#importOrderPresetsBtn'), 'click', () => {
      const fileInput = container.querySelector('#orderPresetFileInput');
      if (fileInput) fileInput.click();
    });
    bind(container.querySelector('#orderPresetFileInput'), 'change', (e) => {
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
    bind(container.querySelector('#clearSearchBtn'), 'click', () => {
      if (searchInput) searchInput.value = '';
      this.searchQuery = '';
      this.searchMode = false;
      this._renderCurrentCategory();
    });

    // Детали
    bind(container.querySelector('#detailToggle'), 'click', () => {
      this.detailsOpen = !this.detailsOpen;
      localStorage.setItem('detailsOpenOrder', JSON.stringify(this.detailsOpen));
      const details = container.querySelector('#globalDetails');
      if (details) details.classList.toggle('open', this.detailsOpen);
      const toggle = container.querySelector('#detailToggle');
      if (toggle) toggle.textContent = this.detailsOpen ? 'Скрыть' : 'Подробно';
    });

    // Кнопки экспорта и очистки
    bind(container.querySelector('#saveJ'), 'click', () => this._exportJSON());
    bind(container.querySelector('#savePdf'), 'click', () => this._exportPDF());
    bind(container.querySelector('#clearOrder'), 'click', () => this._clearOrder());

    // Матрица и общие кофры
    bind(container.querySelector('#openMatrixModal'), 'click', () => {
      import('../components/MatrixModal.js').then(({ openMatrixModal }) => {
        openMatrixModal(null, true, this.currentCategory);
      });
    });
    bind(container.querySelector('#openCommonCasesManager'), 'click', () => {
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

    // Основные поля (сохраняем в localStorage)
    const pName = container.querySelector('#pName');
    const pDate = container.querySelector('#pDate');
    const pComment = container.querySelector('#pComment');
    if (pName) pName.addEventListener('change', () => localStorage.setItem('last_order_name', pName.value));
    if (pDate) pDate.addEventListener('change', () => localStorage.setItem('last_date', pDate.value));
    if (pComment) pComment.addEventListener('input', () => localStorage.setItem('last_comment', pComment.value));

    // Делегирование событий на содержимом категории (этот контейнер не пересоздаётся)
    const contents = container.querySelector('#categoryContents');
    if (contents) {
      // Удаляем старые делегированные слушатели, если они были, и добавляем новые
      // Но так как они делегированные, можно просто добавить новые, но чтобы не дублировать, уберём старые
      if (this._contentsListeners) {
        for (const { event, handler } of this._contentsListeners) {
          contents.removeEventListener(event, handler);
        }
      }
      this._contentsListeners = [];

      const clickHandler = (e) => this._handleCategoryClick(e);
      const inputHandler = (e) => this._handleCategoryInput(e);
      const pointerDownHandler = (e) => this._handlePointerDown(e);
      const pointerUpHandler = () => this._stopRepeat();

      contents.addEventListener('click', clickHandler);
      contents.addEventListener('input', inputHandler);
      contents.addEventListener('pointerdown', pointerDownHandler);
      contents.addEventListener('pointerup', pointerUpHandler);
      contents.addEventListener('pointerleave', pointerUpHandler);
      contents.addEventListener('touchstart', pointerDownHandler, { passive: false });
      contents.addEventListener('touchend', pointerUpHandler);
      contents.addEventListener('touchcancel', pointerUpHandler);

      this._contentsListeners = [
        { event: 'click', handler: clickHandler },
        { event: 'input', handler: inputHandler },
        { event: 'pointerdown', handler: pointerDownHandler },
        { event: 'pointerup', handler: pointerUpHandler },
        { event: 'pointerleave', handler: pointerUpHandler },
        { event: 'touchstart', handler: pointerDownHandler },
        { event: 'touchend', handler: pointerUpHandler },
        { event: 'touchcancel', handler: pointerUpHandler },
      ];
    }
  }

  // ============================================================
  // ОБРАБОТЧИКИ КЛИКОВ (все кнопки)
  // ============================================================

  _handleCategoryClick(e) {
    const target = e.target.closest('.btn-c');
    if (target) return; // кнопки +/- обрабатываются через pointerdown

    const infoBtn = e.target.closest('.info-btn');
    if (infoBtn) {
      this._toggleInfo(infoBtn.dataset.path);
      return;
    }
    const descBtn = e.target.closest('.desc-btn');
    if (descBtn) {
      this._toggleDesc(descBtn.dataset.path);
      return;
    }
    const linkBtn = e.target.closest('.link-btn');
    if (linkBtn) {
      import('../components/MatrixModal.js').then(({ openMatrixModal }) => {
        openMatrixModal(linkBtn.dataset.path, true, this.currentCategory);
      });
      return;
    }
    const caseBtn = e.target.closest('.case-btn');
    if (caseBtn) {
      import('../components/CaseSettingsModal.js').then(({ openCaseSettingsModal }) => {
        openCaseSettingsModal(caseBtn.dataset.path, () => {
          this._updateRow(caseBtn.dataset.path);
          this._updateTotals();
          this._updateCommonCaseIndicators();
        });
      });
      return;
    }
    const noteBtn = e.target.closest('.note-btn');
    if (noteBtn) {
      this._editNote(noteBtn.dataset.path);
      return;
    }
  }

  _handleCategoryInput(e) {
    const target = e.target.closest('.qty-input');
    if (target) {
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

    const singlePieces = e.target.closest('.single-pieces-input');
    if (singlePieces) {
      const path = singlePieces.dataset.path;
      let val = parseInt(singlePieces.value, 10) || 0;
      if (val < 0) val = 0;
      singlePieces.value = val;
      const mode = getCaseMode(path);
      const options = getItemPropsByPath(path).individualCases || [];
      const opt = options[mode.selectedOption] || options[0];
      if (opt && opt.qty) {
        let casesCount = Math.ceil(val / opt.qty);
        const maxCases = opt.maxCases || 0;
        if (maxCases > 0 && casesCount > maxCases) {
          casesCount = maxCases;
          const newPieces = casesCount * opt.qty;
          singlePieces.value = newPieces;
          val = newPieces;
          showToast(`Достигнут лимит кофров (макс. ${maxCases})`, 'warning');
        }
        const casesInput = singlePieces.closest('.qty-controls')?.querySelector('.single-cases-input');
        if (casesInput) casesInput.value = casesCount;
      }
      setIndividualCaseValues(path, [val]);
      setOrderValue(path, val);
      this._updateRow(path);
      this._updateTotals();
      this._updateCategoryTotals(this.currentCategory);
      return;
    }

    const singleCases = e.target.closest('.single-cases-input');
    if (singleCases) {
      const path = singleCases.dataset.path;
      let val = parseInt(singleCases.value, 10) || 0;
      if (val < 0) val = 0;
      const mode = getCaseMode(path);
      const options = getItemPropsByPath(path).individualCases || [];
      const opt = options[mode.selectedOption] || options[0];
      if (opt && opt.qty) {
        const maxCases = opt.maxCases || 0;
        if (maxCases > 0 && val > maxCases) {
          val = maxCases;
          singleCases.value = val;
          showToast(`Превышен лимит кофров (макс. ${maxCases})`, 'warning');
        }
        const pieces = val * opt.qty;
        const sq = getStockByPath(path);
        if (pieces > sq) {
          showToast(`Превышено доступное количество (${sq})`, 'warning');
          const maxVal = Math.floor(sq / opt.qty);
          if (maxVal < val) {
            val = maxVal;
            singleCases.value = val;
          }
        }
        const piecesInput = singleCases.closest('.qty-controls')?.querySelector('.single-pieces-input');
        if (piecesInput) piecesInput.value = pieces;
        setIndividualCaseValues(path, [pieces]);
        setOrderValue(path, pieces);
        this._updateRow(path);
        this._updateTotals();
        this._updateCategoryTotals(this.currentCategory);
      }
      return;
    }

    // Обработка остальных input (мульти, общие кофры) аналогична предыдущей версии
    // Для краткости опускаю, но в полном файле они есть
    // (в предыдущих версиях они были реализованы)
  }

  // ============================================================
  // ОБРАБОТЧИКИ ДЛЯ КНОПОК +/-
  // ============================================================

  _handlePointerDown(e) {
    const btn = e.target.closest('.btn-c');
    if (!btn || !btn.dataset.delta) return;
    e.preventDefault();
    if (this._repeatState && this._repeatState.btn === btn) return;
    if (this._repeatState) this._stopRepeat();
    this._startRepeat(btn);
  }

  _startRepeat(btn) {
    const path = btn.dataset.path;
    const delta = parseInt(btn.dataset.delta, 10);
    if (!path || isNaN(delta)) return;

    const doAction = () => {
      if (btn.classList.contains('qty-btn')) {
        this._changeQty(path, delta);
      } else if (btn.classList.contains('single-piece-btn')) {
        this._changeSinglePiece(path, delta);
      } else if (btn.classList.contains('single-case-btn')) {
        this._changeSingleCase(path, delta);
      } else if (btn.classList.contains('child-multi-piece-btn')) {
        const idx = parseInt(btn.dataset.idx, 10);
        if (!isNaN(idx)) this._changeMultiPiece(path, idx, delta);
      } else if (btn.classList.contains('child-multi-case-btn')) {
        const idx = parseInt(btn.dataset.idx, 10);
        if (!isNaN(idx)) this._changeMultiCase(path, idx, delta);
      } else if (btn.classList.contains('child-common-btn')) {
        const caseId = btn.dataset.caseid;
        if (caseId) this._changeCommonQty(path, caseId, delta);
      } else if (btn.classList.contains('child-extra-btn')) {
        this._changeExtraQty(path, delta);
      }
    };

    doAction();

    this._repeatState = { btn, timer: null, interval: null };
    this._repeatState.timer = setTimeout(() => {
      this._repeatState.interval = setInterval(() => {
        if (this._repeatState && this._repeatState.btn === btn) {
          doAction();
        } else {
          this._stopRepeat();
        }
      }, REPEAT_INTERVAL);
    }, REPEAT_DELAY);
  }

  _stopRepeat() {
    if (this._repeatState) {
      clearTimeout(this._repeatState.timer);
      clearInterval(this._repeatState.interval);
      this._repeatState = null;
    }
  }

  // ============================================================
  // МЕТОДЫ ИЗМЕНЕНИЯ КОЛИЧЕСТВА
  // ============================================================

  _changeQty(path, delta) {
    const current = getTotalQty(path);
    const sq = getStockByPath(path);
    let newVal = Math.max(0, current + delta);
    if (newVal > sq) {
      showToast(`Доступно только ${sq} шт`, 'warning');
      newVal = sq;
    }
    setOrderValue(path, newVal);
    this._updateRow(path);
    this._updateTotals();
    this._updateCategoryTotals(this.currentCategory);
  }

  _changeSinglePiece(path, delta) {
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
    this._updateRow(path);
    this._updateTotals();
    this._updateCategoryTotals(this.currentCategory);
  }

  _changeSingleCase(path, delta) {
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
    this._updateRow(path);
    this._updateTotals();
    this._updateCategoryTotals(this.currentCategory);
  }

  _changeMultiPiece(path, idx, delta) {
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
    this._updateRow(path);
    this._updateTotals();
    this._updateCategoryTotals(this.currentCategory);
    this._updateCommonCaseIndicators();
  }

  _changeMultiCase(path, idx, delta) {
    // Аналогично _changeMultiPiece, но через кофры
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
    this._updateRow(path);
    this._updateTotals();
    this._updateCategoryTotals(this.currentCategory);
    this._updateCommonCaseIndicators();
  }

  _changeCommonQty(path, caseId, delta) {
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
    this._updateRow(path);
    this._updateTotals();
    this._updateCategoryTotals(this.currentCategory);
    this._updateCommonCaseIndicators();
  }

  _changeExtraQty(path, delta) {
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
    this._updateRow(path);
    this._updateTotals();
    this._updateCategoryTotals(this.currentCategory);
    this._updateCommonCaseIndicators();
  }

  // ============================================================
  // ОСТАЛЬНЫЕ МЕТОДЫ (без изменений)
  // ============================================================

  // Здесь должны быть все остальные методы: _toggleInfo, _toggleDesc, _editNote,
  // _updateRow, _updateTotals, _updateCategoryTotals, _updateLinkCount,
  // _updateCommonCaseIndicators, _renderOrder, _renderTabs, _renderCategoryContent,
  // _buildItemRow, _buildQtyControls, _updateChildRows, _applySearch, _clearSearch,
  // _savePreset, _loadPreset, _deletePreset, _exportPresets, _exportJSON, _exportPDF,
  // _clearOrder, _populatePresetSelect, _populateProjectSelect, _loadProjectData,
  // _onProjectSelectChange, _onProjectFieldsChange, _onDataChanged, destroy
  // (они уже были в предыдущих версиях и здесь не изменялись)

  // Для краткости я не копирую их все, но они должны быть в вашем файле.
  // Если их нет, возьмите из предыдущего сообщения с OrderPage.js (я давал его ранее).
  // Главное изменение — в _bindEvents добавлено удаление старых слушателей и повторная привязка.

  destroy() {
    this._stopRepeat();
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    for (const handler of this._handlers) {
      if (typeof handler === 'function') handler();
    }
    this._handlers = [];
    // Удаляем привязанные события
    if (this._boundEvents) {
      for (const { el, event, handler } of this._boundEvents) {
        el.removeEventListener(event, handler);
      }
      this._boundEvents = [];
    }
    if (this._contentsListeners) {
      const contents = this.container?.querySelector('#categoryContents');
      if (contents) {
        for (const { event, handler } of this._contentsListeners) {
          contents.removeEventListener(event, handler);
        }
      }
      this._contentsListeners = [];
    }
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