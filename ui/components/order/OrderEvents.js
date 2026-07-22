// ui/components/order/OrderEvents.js

import { showToast } from '../../toast.js';
import { getLinks } from '../../../services/order.js';
import { updateLinkCount } from './OrderTotals.js';
import { setCurrentCategoryForActions, toggleInfo, toggleDesc, editNote, handleQuantityChange, handleQuantityInput } from './OrderActions.js';
import { getCurrentCategory, updateRow, updateCommonCaseIndicators } from './OrderRenderer.js';

let _listeners = [];

export function bindOrderEvents(callbacks = {}) {
  const container = document.getElementById('categoryContents');
  if (!container) return;

  // Удаляем старые слушатели
  for (const { event, handler } of _listeners) {
    container.removeEventListener(event, handler);
  }
  _listeners = [];

  // Устанавливаем текущую категорию для действий
  setCurrentCategoryForActions(getCurrentCategory());

  // Делегированный обработчик кликов
  const clickHandler = (e) => {
    const target = e.target.closest('button');
    if (!target) return;

    // Кнопки количества (+/-)
    if (target.classList.contains('btn-c')) {
      e.preventDefault();
      const path = target.dataset.path;
      const delta = parseInt(target.dataset.delta, 10);
      if (!path || isNaN(delta)) return;
      handleQuantityChange(target, path, delta);
      return;
    }

    // Инфо
    if (target.classList.contains('info-btn')) {
      toggleInfo(target.dataset.path);
      return;
    }

    // Описание
    if (target.classList.contains('desc-btn')) {
      toggleDesc(target.dataset.path);
      return;
    }

    // Линк
    if (target.classList.contains('link-btn')) {
      if (callbacks.onOpenMatrix) {
        callbacks.onOpenMatrix(target.dataset.path);
      }
      return;
    }

    // Кофры
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

    // Заметка
    if (target.classList.contains('note-btn')) {
      editNote(target.dataset.path);
      return;
    }
  };

  const inputHandler = (e) => {
    const target = e.target;
    if (!target) return;
    if (target.classList.contains('qty-input') ||
        target.classList.contains('single-pieces-input') ||
        target.classList.contains('single-cases-input') ||
        target.classList.contains('child-multi-pieces') ||
        target.classList.contains('child-common-qty') ||
        target.classList.contains('child-extra-qty')) {
      handleQuantityInput(target);
    }
  };

  container.addEventListener('click', clickHandler);
  container.addEventListener('input', inputHandler);

  _listeners.push({ event: 'click', handler: clickHandler });
  _listeners.push({ event: 'input', handler: inputHandler });

  // Обновляем счётчик линков
  const links = getLinks();
  let linkCount = 0;
  for (const src in links) linkCount += links[src].length;
  updateLinkCount();
}

export function unbindOrderEvents() {
  const container = document.getElementById('categoryContents');
  if (!container) return;
  for (const { event, handler } of _listeners) {
    container.removeEventListener(event, handler);
  }
  _listeners = [];
}