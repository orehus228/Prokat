// components/order/subrent-modal.js
import { getState, saveState } from '../../core/state.js';
import { addSubrentItem, updateSubrentItem, getOrderSubrent } from '../../services/order-data.js';
import { showToast } from '../../ui/toast.js';
import { renderOrderCategory, currentOrderCategory } from './render.js';
import { updateTotalsOrder } from './render.js';

let currentEditId = null;

/**
 * Открывает модальное окно для добавления или редактирования субаренды.
 * @param {string|null} id - id позиции для редактирования, если null — добавление
 */
export function openSubrentModal(id = null) {
  const modal = document.getElementById('subrentModal');
  if (!modal) {
    showToast('Модальное окно субаренды не найдено', 'error');
    return;
  }

  currentEditId = id;

  const titleEl = document.getElementById('subrentModalTitle');
  const nameInput = document.getElementById('subrentName');
  const qtyInput = document.getElementById('subrentQty');
  const weightInput = document.getElementById('subrentWeight');
  const dimsInput = document.getElementById('subrentDimensions');
  const counterpartyInput = document.getElementById('subrentCounterparty');
  const startDateInput = document.getElementById('subrentStartDate');
  const endDateInput = document.getElementById('subrentEndDate');
  const commentInput = document.getElementById('subrentComment');
  const saveBtn = document.getElementById('subrentSaveBtn');
  const cancelBtn = document.getElementById('subrentCancelBtn');

  if (!titleEl || !nameInput || !qtyInput || !weightInput || !dimsInput ||
      !counterpartyInput || !startDateInput || !endDateInput || !commentInput ||
      !saveBtn || !cancelBtn) {
    showToast('Ошибка: не все элементы модалки субаренды найдены', 'error');
    return;
  }

  if (id) {
    // Редактирование
    const items = getOrderSubrent();
    const item = items.find(it => it.id === id);
    if (!item) {
      showToast('Позиция субаренды не найдена', 'error');
      return;
    }
    titleEl.textContent = 'Редактирование субаренды';
    nameInput.value = item.name || '';
    qtyInput.value = item.qty || 1;
    weightInput.value = item.weight || '';
    dimsInput.value = item.dimensions || '';
    counterpartyInput.value = item.counterparty || '';
    startDateInput.value = item.start_date || '';
    endDateInput.value = item.end_date || '';
    commentInput.value = item.comment || '';
  } else {
    // Добавление
    titleEl.textContent = 'Добавление субаренды';
    nameInput.value = '';
    qtyInput.value = 1;
    weightInput.value = '';
    dimsInput.value = '';
    counterpartyInput.value = '';
    startDateInput.value = '';
    endDateInput.value = '';
    commentInput.value = '';
  }

  // Сохранение
  const handleSave = () => {
    const name = nameInput.value.trim();
    if (!name) {
      showToast('Введите название позиции', 'warning');
      return;
    }
    const qty = parseInt(qtyInput.value);
    if (isNaN(qty) || qty < 1) {
      showToast('Количество должно быть положительным числом', 'warning');
      return;
    }
    const weight = parseFloat(weightInput.value) || 0;
    const dimensions = dimsInput.value.trim();
    const counterparty = counterpartyInput.value.trim();
    const start_date = startDateInput.value;
    const end_date = endDateInput.value;
    const comment = commentInput.value.trim();

    const data = { name, qty, weight, dimensions, counterparty, start_date, end_date, comment };

    let success;
    if (id) {
      success = updateSubrentItem(id, data);
      if (success) {
        showToast('Позиция субаренды обновлена', 'success');
      } else {
        showToast('Ошибка обновления', 'error');
        return;
      }
    } else {
      const newItem = addSubrentItem(data);
      if (newItem) {
        showToast('Позиция субаренды добавлена', 'success');
      } else {
        showToast('Ошибка добавления', 'error');
        return;
      }
    }

    // Закрываем модалку
    modal.classList.remove('open');
    // Перерисовываем заказ
    renderOrderCategory(currentOrderCategory);
    updateTotalsOrder();
  };

  // Отмена / закрытие
  const handleCancel = () => {
    modal.classList.remove('open');
  };

  // Назначаем обработчики
  saveBtn.onclick = handleSave;
  cancelBtn.onclick = handleCancel;
  // Закрытие по клику на оверлей
  modal.onclick = function(e) {
    if (e.target === modal) {
      handleCancel();
    }
  };

  // Открываем модалку
  modal.classList.add('open');
  // Фокус на первое поле
  nameInput.focus();
  nameInput.select();
}

export default {
  openSubrentModal,
};