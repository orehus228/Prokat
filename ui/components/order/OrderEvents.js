// ui/components/order/OrderEvents.js

import { showToast } from '../../toast.js';
import { getLinks } from '../../../services/order.js';
import { updateLinkCount } from './OrderTotals.js';
import { setCurrentCategoryForActions, toggleInfo, toggleDesc, editNote, handleQuantityChange, handleQuantityInput } from './OrderActions.js';
import { getCurrentCategory, updateRow, updateCommonCaseIndicators } from './OrderRenderer.js';

let eventsBound = false;

export function bindOrderEvents(callbacks = {}) {
  if (eventsBound) return;
  eventsBound = true;

  const container = document.getElementById('categoryContents');
  if (!container) {
    console.warn('[OrderEvents] #categoryContents not found');
    return;
  }

  console.log('[OrderEvents] Привязка событий');

  // Устанавливаем текущую категорию для действий
  const cat = getCurrentCategory();
  console.log('[OrderEvents] Текущая категория при привязке:', cat);
  setCurrentCategoryForActions(cat);

  // Удаляем старые слушатели, если они были (на случай перепривязки)
  // Чтобы не накапливать, используем флаг eventsBound, но при повторной привязке нужно удалить старые.
  // Для простоты привязываем один раз.

  container.addEventListener('click', (e) => {
    const target = e.target.closest('button');
    if (!target) return;

    // Кнопки количества (+/-)
    if (target.classList.contains('btn-c')) {
      e.preventDefault();
      const path = target.dataset.path;
      const delta = parseInt(target.dataset.delta, 10);
      if (!path || isNaN(delta)) {
        console.warn('[OrderEvents] Невалидные данные кнопки:', target);
        return;
      }
      console.log('[OrderEvents] Клик по кнопке количества:', path, delta);
      handleQuantityChange(target, path, delta);
      return;
    }

    // Остальные кнопки...
    if (target.classList.contains('info-btn')) {
      toggleInfo(target.dataset.path);
      return;
    }
    if (target.classList.contains('desc-btn')) {
      toggleDesc(target.dataset.path);
      return;
    }
    if (target.classList.contains('link-btn')) {
      if (callbacks.onOpenMatrix) {
        callbacks.onOpenMatrix(target.dataset.path);
      }
      return;
    }
    if (target.classList.contains('case-btn')) {
      if (callbacks.onOpenCaseSettings) {
        callbacks.onOpenCaseSettings(target.dataset.path, () => {
          updateRow(target.dataset.path);
          import('./OrderTotals.js').then(({ updateTotals, updateCategoryTotals }) => {
            updateTotals();
            const cat = getCurrentCategory();
            if (cat) updateCategoryTotals(cat);
          });
          updateCommonCaseIndicators();
        });
      }
      return;
    }
    if (target.classList.contains('note-btn')) {
      editNote(target.dataset.path);
      return;
    }
  });

  container.addEventListener('input', (e) => {
    const target = e.target;
    if (!target) return;
    if (target.classList.contains('qty-input') ||
        target.classList.contains('single-pieces-input') ||
        target.classList.contains('single-cases-input') ||
        target.classList.contains('child-multi-pieces') ||
        target.classList.contains('child-common-qty') ||
        target.classList.contains('child-extra-qty')) {
      console.log('[OrderEvents] Ввод в поле количества:', target);
      handleQuantityInput(target);
    }
  });

  // Обновляем счётчик линков
  const links = getLinks();
  let linkCount = 0;
  for (const src in links) linkCount += links[src].length;
  updateLinkCount();

  console.log('[OrderEvents] Привязка событий завершена');
}

export function unbindOrderEvents() {
  eventsBound = false;
  // Здесь можно удалить слушатели, но для простоты не будем
}

export function updateEventsCategory() {
  const cat = getCurrentCategory();
  console.log('[OrderEvents] updateEventsCategory вызван, категория:', cat);
  setCurrentCategoryForActions(cat);
}