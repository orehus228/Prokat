// components/order/actions.js
import { getState, saveState } from '../../core/state.js';
import { getStockValue, getItemProps, getCommonCases } from '../../data/editor-data.js';
import {
  getOrderPacking,
  getIndividualCaseValues,
  getOrderExtra,
  getTotalQty,
  setOrderValue,
  setOrderPacking,
  setIndividualCaseValues,
  setOrderExtra,
  getOrderProject,
  getOrderInstances,
  setOrderInstances,
  clearAllOrderInstances,
  getOrderSubrent,
  addSubrentItem,
  removeSubrentItem,
  updateSubrentItem,
} from '../../services/order-data.js';
import { getAvailableQuantity, addProjectItem, getProject, getProjects } from '../../services/project-data.js';
import * as calc from '../../services/calculations.js';
import { showToast } from '../../ui/toast.js';
import {
  updateRowOrder,
  updateTotalsOrder,
  updateCategoryTotalsOrder,
  toggleInfoOrder,
  toggleDescOrder,
  openNoteEditorOrder,
  refreshRow,
  currentOrderCategory,
} from './render.js';
import {
  updateAllCommonCaseIndicators,
  updateChildRowsForPath,
} from './helpers.js';

// ============================================================
// СИНХРОНИЗАЦИЯ С ПРОЕКТОМ
// ============================================================

/**
 * Синхронизирует позицию с проектом: резервирует или освобождает экземпляры.
 * @param {string} path - путь позиции
 * @param {number} quantity - новое количество (если не указано, берётся из заказа)
 * @param {object|null} subrentInfo - информация о субаренде (пока не используется)
 */
function syncProjectItem(path, quantity, subrentInfo = null) {
  const project = getOrderProject();
  if (!project.id || !project.start_date || !project.end_date) {
    // Если проект не задан или нет дат, ничего не делаем
    return;
  }

  const qty = quantity !== undefined ? quantity : getTotalQty(path);

  // Вызываем addProjectItem с новым количеством
  const result = addProjectItem(project.id, path, qty, { subrentInfo });
  if (!result.success) {
    showToast(result.error, 'warning', 4000);
  }
}

/**
 * Синхронизирует все позиции заказа с текущим проектом.
 * Используется при смене проекта.
 */
export function syncAllProjectItems() {
  const state = getState();
  const project = getOrderProject();

  // Собираем все пути с ненулевым количеством
  const allPaths = new Set();
  for (let p in state.order) if (state.order[p] > 0) allPaths.add(p);
  for (let p in state.orderPacking) {
    const total = state.orderPacking[p].reduce((s, item) => s + (item.pieces || 0), 0);
    if (total > 0) allPaths.add(p);
  }
  for (let p in state.individualCaseValues) {
    const total = state.individualCaseValues[p].reduce((a, b) => a + b, 0);
    if (total > 0) allPaths.add(p);
  }
  for (let p in state.orderExtra) if (state.orderExtra[p] > 0) allPaths.add(p);

  try {
    if (!project.id || !project.start_date || !project.end_date) {
      // Если нет проекта, освобождаем все экземпляры
      for (let path of allPaths) {
        const instanceIds = getOrderInstances(path);
        if (instanceIds && instanceIds.length > 0) {
          addProjectItem(null, path, 0);
        }
      }
      clearAllOrderInstances();
      return;
    }

    // Синхронизируем все позиции с проектом
    for (let path of allPaths) {
      const qty = getTotalQty(path);
      const subrentInfo = null;
      const result = addProjectItem(project.id, path, qty, { subrentInfo });
      if (!result.success) {
        showToast(`Ошибка синхронизации "${path}": ${result.error}`, 'warning', 3000);
      }
    }

    // Удаляем позиции, которые есть в проекте, но которых нет в заказе
    const projectObj = getProject(project.id);
    if (projectObj) {
      const projectItems = projectObj.projectItems || [];
      for (let item of projectItems) {
        const path = item.equipment_path;
        if (!allPaths.has(path)) {
          addProjectItem(project.id, path, 0);
        }
      }
    }
  } catch (error) {
    console.error('Ошибка в syncAllProjectItems:', error);
    showToast('Ошибка синхронизации с проектом: ' + error.message, 'error', 4000);
  }
}

// ============================================================
// ПРОВЕРКА ДОСТУПНОСТИ В ПРОЕКТАХ
// ============================================================

function checkAndWarnAvailability(path, requestedQty) {
  const project = getOrderProject();
  if (!project.start_date || !project.end_date) return true;

  const result = getAvailableQuantity(path, project.start_date, project.end_date, requestedQty, project.id);
  if (result.isConflict) {
    const conflictNames = result.conflicts.map(c => `${c.project} (${c.quantity} шт)`).join(', ');
    const instanceInfo = result.instanceDetails
      ? ` (всего экз.: ${result.instanceDetails.total}, занято: ${result.instanceDetails.reserved + result.instanceDetails.issued})`
      : '';
    showToast(`⚠️ Доступно: ${result.available} шт${instanceInfo}. Занято в проектах: ${conflictNames}`, 'warning', 4000);
    return false;
  }
  return true;
}

// ============================================================
// НОВАЯ УНИВЕРСАЛЬНАЯ ФУНКЦИЯ ИЗМЕНЕНИЯ КОЛИЧЕСТВА
// ============================================================

/**
 * Универсальная функция изменения количества для всех режимов.
 * @param {string} path - путь позиции
 * @param {number} delta - изменение (может быть отрицательным)
 * @param {object} config - конфигурация
 * @param {string} config.mode - 'order' | 'single' | 'multi' | 'common' | 'extra'
 * @param {number} [config.idx] - индекс варианта для multi
 * @param {string} [config.caseId] - id общего кофра для common
 * @param {Function} [config.onSuccess] - колбэк после успешного изменения
 */
function changeQuantity(path, delta, config = {}) {
  const { mode, idx, caseId, onSuccess } = config;
  const state = getState();

  // --- 1. Получаем текущее значение ---
  let currentVal = 0;
  let sourceArray = null;

  switch (mode) {
    case 'order':
      currentVal = state.order[path] || 0;
      break;
    case 'single':
      const singleVals = state.individualCaseValues[path] || [];
      currentVal = singleVals[0] || 0;
      break;
    case 'multi':
      sourceArray = state.individualCaseValues[path] || [];
      currentVal = (idx !== undefined && sourceArray[idx] !== undefined) ? sourceArray[idx] : 0;
      break;
    case 'common': {
      const packing = state.orderPacking[path] || [];
      const p = packing.find(p => p.caseId === caseId);
      currentVal = p ? p.pieces || 0 : 0;
      break;
    }
    case 'extra':
      currentVal = state.orderExtra[path] || 0;
      break;
    default:
      console.warn('Неизвестный режим изменения:', mode);
      return;
  }

  // --- 2. Вычисляем новое значение ---
  let newVal = Math.max(0, currentVal + delta);

  // --- 3. Проверка на остаток (stock) для прямых режимов ---
  const stock = getStockValue(path);
  if (mode === 'order' || mode === 'single' || mode === 'multi') {
    if (newVal > stock) {
      const name = path.split('|').pop();
      showToast(`Превышено доступное количество для "${name}" (доступно ${stock})`, 'warning');
      return;
    }
  }

  // --- 4. Проверка доступности (конфликты с проектами) ---
  // Вычисляем общее количество позиции после изменения
  let totalAfterChange = 0;
  switch (mode) {
    case 'order':
      totalAfterChange = newVal + getSegmentsSum(path) + getExtraTotal(path);
      break;
    case 'single':
      totalAfterChange = newVal + getExtraTotal(path);
      break;
    case 'multi': {
      const vals = [...sourceArray];
      vals[idx] = newVal;
      totalAfterChange = vals.reduce((a, b) => a + b, 0) + getExtraTotal(path);
      break;
    }
    case 'common': {
      const packAfter = state.orderPacking[path] || [];
      const found = packAfter.find(p => p.caseId === caseId);
      if (found) found.pieces = newVal;
      else if (newVal > 0) packAfter.push({ caseId, pieces: newVal });
      const totalPacked = packAfter.reduce((s, p) => s + p.pieces, 0);
      const extra = state.orderExtra[path] || 0;
      totalAfterChange = totalPacked + extra;
      break;
    }
    case 'extra': {
      const packAfter = state.orderPacking[path] || [];
      const totalPacked = packAfter.reduce((s, p) => s + p.pieces, 0);
      totalAfterChange = totalPacked + newVal;
      break;
    }
  }

  if (!checkAndWarnAvailability(path, totalAfterChange)) {
    // Если недоступно, не меняем значение
    return;
  }

  // --- 5. Сохраняем новое значение ---
  switch (mode) {
    case 'order':
      setOrderValue(path, newVal);
      break;
    case 'single':
      setIndividualCaseValues(path, [newVal]);
      setOrderValue(path, newVal);
      break;
    case 'multi': {
      const vals = state.individualCaseValues[path] || [];
      vals[idx] = newVal;
      setIndividualCaseValues(path, vals);
      const total = vals.reduce((a, b) => a + b, 0);
      setOrderValue(path, total);
      break;
    }
    case 'common': {
      const packing = state.orderPacking[path] || [];
      const found = packing.find(p => p.caseId === caseId);
      if (found) found.pieces = newVal;
      else if (newVal > 0) packing.push({ caseId, pieces: newVal });
      setOrderPacking(path, packing);
      const totalPacked = packing.reduce((s, p) => s + p.pieces, 0);
      const extra = state.orderExtra[path] || 0;
      setOrderValue(path, totalPacked + extra);
      break;
    }
    case 'extra': {
      setOrderExtra(path, newVal);
      const packing = state.orderPacking[path] || [];
      const totalPacked = packing.reduce((s, p) => s + p.pieces, 0);
      setOrderValue(path, totalPacked + newVal);
      break;
    }
  }

  // --- 6. Синхронизация с проектом ---
  syncProjectItem(path);

  // --- 7. Обновление UI ---
  updateRowOrder(path, true);
  updateTotalsOrder();
  updateCategoryTotalsOrder(currentOrderCategory);
  updateAllCommonCaseIndicators();

  if (onSuccess) onSuccess();
}

// Вспомогательные функции для подсчёта дополнительных количеств
function getSegmentsSum(path) {
  const state = getState();
  if (!state.orderSplits[path]) return 0;
  return state.orderSplits[path].reduce((s, seg) => s + (seg.qty || 0), 0);
}

function getExtraTotal(path) {
  const state = getState();
  const extra = state.orderExtra[path] || 0;
  const packing = state.orderPacking[path] || [];
  const totalPacked = packing.reduce((s, p) => s + p.pieces, 0);
  return totalPacked + extra;
}

// ============================================================
// ОБРАБОТЧИКИ ИЗМЕНЕНИЯ КОЛИЧЕСТВА ДЛЯ СУБАРЕНДЫ
// ============================================================

/**
 * Изменяет количество субарендной позиции на delta.
 * @param {string} id - ID позиции субаренды
 * @param {number} delta - изменение
 */
function handleSubrentQuantityChange(id, delta) {
  const subrentItems = getOrderSubrent();
  const item = subrentItems.find(it => it.id === id);
  if (!item) {
    showToast('Позиция субаренды не найдена', 'error');
    return;
  }
  const newQty = Math.max(0, (item.qty || 0) + delta);
  updateSubrentItem(id, { qty: newQty });
  updateTotalsOrder();
  // Перерисовываем категорию, чтобы обновить отображение субаренды
  const { renderOrderCategory } = await import('./render.js');
  renderOrderCategory(currentOrderCategory);
}

/**
 * Обрабатывает ввод в поле количества субаренды.
 * @param {string} id - ID позиции
 * @param {number} newVal - новое значение
 */
function handleSubrentQuantityInput(id, newVal) {
  const subrentItems = getOrderSubrent();
  const item = subrentItems.find(it => it.id === id);
  if (!item) {
    showToast('Позиция субаренды не найдена', 'error');
    return;
  }
  const qty = Math.max(0, parseInt(newVal) || 0);
  updateSubrentItem(id, { qty });
  updateTotalsOrder();
  const { renderOrderCategory } = await import('./render.js');
  renderOrderCategory(currentOrderCategory);
}

/**
 * Открывает модалку редактирования субаренды.
 * @param {string} id - ID позиции
 */
function openSubrentEditModal(id) {
  import('./subrent-modal.js').then(module => {
    module.openSubrentModal(id);
  });
}

// ============================================================
// ОБРАБОТЧИКИ СОБЫТИЙ (ПОВТОР ПРИ УДЕРЖАНИИ)
// ============================================================

let repeatTimer = null;
let repeatInterval = null;
let currentBtn = null;

function startRepeat(btn) {
  if (repeatInterval) return;
  currentBtn = btn;
  const path = btn.dataset.path;
  const delta = parseInt(btn.dataset.delta);
  if (!path || isNaN(delta)) return;

  const doAction = () => {
    let mode = 'order';
    let idx, caseId;

    if (btn.classList.contains('single-piece-btn') || btn.classList.contains('single-case-btn')) {
      mode = 'single';
    } else if (btn.classList.contains('child-multi-piece-btn') || btn.classList.contains('child-multi-case-btn')) {
      mode = 'multi';
      idx = parseInt(btn.dataset.idx);
    } else if (btn.classList.contains('child-common-btn')) {
      mode = 'common';
      caseId = btn.dataset.caseid;
    } else if (btn.classList.contains('child-extra-btn')) {
      mode = 'extra';
    } else if (btn.classList.contains('subrent-qty-btn')) {
      // Обработка субаренды
      const id = btn.dataset.id;
      if (id) handleSubrentQuantityChange(id, delta);
      return;
    }

    changeQuantity(path, delta, { mode, idx, caseId });
  };

  // Выполняем сразу
  doAction();

  // Запускаем повтор с задержкой
  if (repeatTimer) clearTimeout(repeatTimer);
  repeatTimer = setTimeout(() => {
    repeatInterval = setInterval(() => {
      if (currentBtn !== btn) {
        stopRepeat();
        return;
      }
      doAction();
    }, 100);
  }, 400);
}

function stopRepeat() {
  clearTimeout(repeatTimer);
  clearInterval(repeatInterval);
  repeatTimer = null;
  repeatInterval = null;
  currentBtn = null;
}

function handlePointerDown(e) {
  const btn = e.target.closest('.btn-c');
  if (!btn || !btn.dataset.delta) return;
  e.preventDefault();
  if (currentBtn === btn) return;
  if (currentBtn) stopRepeat();
  startRepeat(btn);
}

function handlePointerUp(e) {
  stopRepeat();
}

// ============================================================
// ОБРАБОТЧИК ВВОДА В ПОЛЯ (input)
// ============================================================

function handleContainerInput(e) {
  const target = e.target.closest('input[type="number"]');
  if (!target) return;

  // Проверка на субаренду
  if (target.classList.contains('subrent-qty-input')) {
    const id = target.dataset.id;
    if (id) {
      const val = parseInt(target.value) || 0;
      handleSubrentQuantityInput(id, val);
    }
    return;
  }

  const path = target.dataset.path;
  if (!path) return;

  let newVal = parseInt(target.value);
  if (isNaN(newVal) || newVal < 0) newVal = 0;
  target.value = newVal;

  // Определяем режим и дополнительные параметры
  let mode = 'order';
  let idx, caseId;

  if (target.classList.contains('single-pieces-input') || target.classList.contains('single-cases-input')) {
    mode = 'single';
  } else if (target.classList.contains('child-multi-pieces') || target.classList.contains('child-multi-cases')) {
    mode = 'multi';
    idx = parseInt(target.dataset.idx);
  } else if (target.classList.contains('child-common-qty')) {
    mode = 'common';
    caseId = target.dataset.caseid;
  } else if (target.classList.contains('child-extra-qty')) {
    mode = 'extra';
  }

  // Вычисляем дельту относительно сохранённого старого значения
  const oldVal = parseInt(target.dataset.oldValue) || 0;
  const delta = newVal - oldVal;
  if (delta === 0) return;
  target.dataset.oldValue = newVal;

  // Для полей кофров требуется дополнительная логика
  const options = calc.getCaseOptions(path);
  let deltaInPieces = delta;

  if (target.classList.contains('single-cases-input')) {
    const opt = calc.getSelectedOption(path);
    if (opt && opt.qty > 0) {
      deltaInPieces = delta * opt.qty;
      changeQuantity(path, deltaInPieces, { mode: 'single' });
    }
  } else if (target.classList.contains('child-multi-cases')) {
    if (idx !== undefined && options[idx]) {
      deltaInPieces = delta * options[idx].qty;
      changeQuantity(path, deltaInPieces, { mode: 'multi', idx });
    }
  } else if (target.classList.contains('single-pieces-input')) {
    changeQuantity(path, delta, { mode: 'single' });
  } else if (target.classList.contains('child-multi-pieces')) {
    if (idx !== undefined) {
      changeQuantity(path, delta, { mode: 'multi', idx });
    }
  } else if (target.classList.contains('child-common-qty')) {
    changeQuantity(path, delta, { mode: 'common', caseId });
  } else if (target.classList.contains('child-extra-qty')) {
    changeQuantity(path, delta, { mode: 'extra' });
  } else if (target.classList.contains('qty-input')) {
    changeQuantity(path, delta, { mode: 'order' });
  } else {
    changeQuantity(path, delta, { mode: 'order' });
  }
}

// ============================================================
// ОБРАБОТЧИК КЛИКОВ (кнопки Инфо, Описание, Линк, Заметка, кофры, субаренда)
// ============================================================

function handleContainerClick(e) {
  const target = e.target.closest('.btn-c');
  if (target) return; // обработано pointerdown

  // --- Обработка субаренды ---
  const editBtn = e.target.closest('.edit-subrent-btn');
  if (editBtn) {
    const id = editBtn.dataset.id;
    if (id) openSubrentEditModal(id);
    return;
  }

  const deleteBtn = e.target.closest('.delete-subrent-btn');
  if (deleteBtn) {
    const id = deleteBtn.dataset.id;
    if (id) {
      import('../../ui/modal.js').then(({ showConfirm }) => {
        showConfirm('Удалить позицию субаренды?').then(confirmed => {
          if (confirmed) {
            const success = removeSubrentItem(id);
            if (success) {
              showToast('Позиция субаренды удалена', 'neutral');
              const { renderOrderCategory } = await import('./render.js');
              renderOrderCategory(currentOrderCategory);
              updateTotalsOrder();
            } else {
              showToast('Ошибка удаления', 'error');
            }
          }
        });
      });
    }
    return;
  }

  // --- Остальные кнопки ---
  const infoBtn = e.target.closest('.info-btn');
  if (infoBtn) { toggleInfoOrder(infoBtn); return; }
  const descBtn = e.target.closest('.desc-btn');
  if (descBtn) { toggleDescOrder(descBtn); return; }
  const linkBtn = e.target.closest('.link-btn');
  if (linkBtn) {
    import('../cases/matrix.js').then(module => {
      module.openMatrixModal(linkBtn.dataset.path, false, currentOrderCategory);
    });
    return;
  }
  const caseBtn = e.target.closest('.case-btn');
  if (caseBtn) {
    import('../cases/case-settings.js').then(module => {
      module.openCaseSettingsModal(caseBtn.dataset.path, () => {
        refreshRow(caseBtn.dataset.path);
        updateAllCommonCaseIndicators();
        updateTotalsOrder();
      });
    });
    return;
  }
  const noteBtn = e.target.closest('.note-btn');
  if (noteBtn) { openNoteEditorOrder(noteBtn); return; }
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ ДЕЛЕГАЦИИ СОБЫТИЙ
// ============================================================

let eventDelegationInitialized = false;

export function setupEventDelegation() {
  if (eventDelegationInitialized) return;
  const container = document.getElementById('categoryContents');
  if (!container) return;

  container.removeEventListener('click', handleContainerClick);
  container.removeEventListener('input', handleContainerInput);
  container.removeEventListener('pointerdown', handlePointerDown);
  container.removeEventListener('pointerup', handlePointerUp);
  container.removeEventListener('pointerleave', handlePointerUp);
  container.removeEventListener('touchstart', handlePointerDown);
  container.removeEventListener('touchend', handlePointerUp);
  container.removeEventListener('touchcancel', handlePointerUp);

  container.addEventListener('click', handleContainerClick);
  container.addEventListener('input', handleContainerInput);
  container.addEventListener('pointerdown', handlePointerDown);
  container.addEventListener('pointerup', handlePointerUp);
  container.addEventListener('pointerleave', handlePointerUp);
  container.addEventListener('touchstart', handlePointerDown, { passive: false });
  container.addEventListener('touchend', handlePointerUp);
  container.addEventListener('touchcancel', handlePointerUp);

  eventDelegationInitialized = true;
}

// ============================================================
// ОЧИСТКА ЗАКАЗА
// ============================================================

export async function clearOrderData() {
  const { showConfirm } = await import('../../ui/modal.js');
  const confirmed = await showConfirm('Очистить список? Все зарезервированные экземпляры будут освобождены.');
  if (!confirmed) return;
  const state = getState();
  
  const project = getOrderProject();
  if (project.id) {
    const allPaths = new Set();
    for (let p in state.order) if (state.order[p] > 0) allPaths.add(p);
    for (let p in state.orderPacking) {
      const total = state.orderPacking[p].reduce((s, item) => s + (item.pieces || 0), 0);
      if (total > 0) allPaths.add(p);
    }
    for (let p in state.individualCaseValues) {
      const total = state.individualCaseValues[p].reduce((a, b) => a + b, 0);
      if (total > 0) allPaths.add(p);
    }
    for (let p in state.orderExtra) if (state.orderExtra[p] > 0) allPaths.add(p);
    
    for (let path of allPaths) {
      addProjectItem(project.id, path, 0);
    }
  }
  
  for (let key in state.order) delete state.order[key];
  for (let key in state.orderSplits) delete state.orderSplits[key];
  for (let key in state.links) delete state.links[key];
  for (let key in state.notes) delete state.notes[key];
  for (let key in state.orderPacking) delete state.orderPacking[key];
  for (let key in state.individualCaseValues) delete state.individualCaseValues[key];
  for (let key in state.commonRoutes) delete state.commonRoutes[key];
  for (let key in state.caseModes) delete state.caseModes[key];
  for (let key in state.orderExclude) delete state.orderExclude[key];
  for (let key in state.orderExtra) delete state.orderExtra[key];
  state.orderSubrent = []; // <-- Очищаем субаренду
  
  clearAllOrderInstances();
  
  saveState();
  const { renderOrderAll } = await import('./render.js');
  renderOrderAll();
  updateAllCommonCaseIndicators();
  showToast('Список очищен, экземпляры освобождены', 'success');
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ (вызов из main)
// ============================================================

export function initOrderActions() {
  setupEventDelegation();
}

export default {
  setupEventDelegation,
  initOrderActions,
  clearOrderData,
  syncAllProjectItems,
};