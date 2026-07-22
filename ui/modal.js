// ui/modal.js

/**
 * Универсальная система модальных окон.
 * Поддерживает: prompt (ввод текста), confirm (подтверждение), choice (выбор из вариантов).
 * @module ui/modal
 */

// ============================================================
// СОСТОЯНИЕ
// ============================================================

let currentResolve = null;
let currentReject = null;
let activeModalType = null;

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================

/**
 * Закрывает все модалки и очищает состояние.
 */
function closeAllModals() {
  const overlays = document.querySelectorAll('.modal-overlay');
  for (const overlay of overlays) {
    overlay.classList.remove('open');
  }
  // Очищаем обработчики
  const input = document.getElementById('modalInput');
  if (input) {
    input.style.display = '';
    const radioGroup = input.parentNode?.querySelector('.radio-group');
    if (radioGroup) radioGroup.remove();
    input.value = '';
    input.onkeydown = null;
  }
  const confirmBtn = document.getElementById('modalConfirm');
  const cancelBtn = document.getElementById('modalCancel');
  if (confirmBtn) confirmBtn.onclick = null;
  if (cancelBtn) cancelBtn.onclick = null;
  
  const overlay = document.getElementById('modalOverlay');
  if (overlay) overlay.onclick = null;
  
  currentResolve = null;
  currentReject = null;
  activeModalType = null;
}

// ============================================================
// PROMPT — МОДАЛКА С ВВОДОМ ТЕКСТА
// ============================================================

/**
 * Показывает модалку с полем ввода.
 * @param {string} title - заголовок
 * @param {string} [label='Введите значение:'] - подпись к полю
 * @param {string} [defaultValue=''] - значение по умолчанию
 * @param {string} [placeholder=''] - плейсхолдер
 * @param {Function} [validator] - функция валидации (возвращает строку ошибки или null)
 * @returns {Promise<string|null>} введённое значение или null при отмене
 */
export function showPrompt(title, label = 'Введите значение:', defaultValue = '', placeholder = '', validator = null) {
  return new Promise((resolve, reject) => {
    const overlay = document.getElementById('modalOverlay');
    if (!overlay) {
      reject(new Error('Модалка не найдена'));
      return;
    }

    const titleEl = document.getElementById('modalTitle');
    const labelEl = document.getElementById('modalLabel');
    const input = document.getElementById('modalInput');
    const confirmBtn = document.getElementById('modalConfirm');
    const cancelBtn = document.getElementById('modalCancel');

    if (!titleEl || !labelEl || !input || !confirmBtn || !cancelBtn) {
      reject(new Error('Не все элементы модалки найдены в DOM'));
      return;
    }

    // Настраиваем UI
    titleEl.textContent = title;
    labelEl.textContent = label;
    input.value = defaultValue;
    input.placeholder = placeholder || '';
    input.style.display = '';
    input.type = 'text';
    // Удаляем старые radio-группы
    const oldGroup = input.parentNode?.querySelector('.radio-group');
    if (oldGroup) oldGroup.remove();
    // Убираем старые обработчики
    confirmBtn.onclick = null;
    cancelBtn.onclick = null;
    input.onkeydown = null;
    overlay.onclick = null;

    activeModalType = 'prompt';
    overlay.classList.add('open');
    input.focus();
    input.select();

    const handleConfirm = () => {
      const val = input.value;
      if (validator) {
        const error = validator(val);
        if (error) {
          import('./toast.js').then(({ showToast }) => {
            showToast(error, 'error');
            setTimeout(() => {
              input.focus();
              input.select();
            }, 100);
          });
          return;
        }
      }
      closeAllModals();
      resolve(val);
    };

    const handleCancel = () => {
      closeAllModals();
      resolve(null);
    };

    const handleKeydown = (e) => {
      if (e.key === 'Enter') handleConfirm();
      if (e.key === 'Escape') handleCancel();
    };

    confirmBtn.onclick = handleConfirm;
    cancelBtn.onclick = handleCancel;
    input.onkeydown = handleKeydown;
    overlay.onclick = (e) => {
      if (e.target === overlay) handleCancel();
    };
  });
}

// ============================================================
// CONFIRM — МОДАЛКА ПОДТВЕРЖДЕНИЯ
// ============================================================

/**
 * Показывает модалку подтверждения.
 * @param {string} message - сообщение
 * @param {string} [title='Подтверждение'] - заголовок
 * @returns {Promise<boolean>} true — подтверждено, false — отменено
 */
export function showConfirm(message, title = 'Подтверждение') {
  return new Promise((resolve) => {
    const overlay = document.getElementById('confirmOverlay');
    if (!overlay) {
      resolve(confirm(message));
      return;
    }

    const titleEl = document.getElementById('confirmTitle');
    const msgEl = document.getElementById('confirmMessage');
    const yesBtn = document.getElementById('confirmYes');
    const noBtn = document.getElementById('confirmNo');

    if (!titleEl || !msgEl || !yesBtn || !noBtn) {
      resolve(confirm(message));
      return;
    }

    titleEl.textContent = title;
    msgEl.textContent = message;
    yesBtn.onclick = null;
    noBtn.onclick = null;
    overlay.onclick = null;

    overlay.classList.add('open');

    const cleanup = () => {
      overlay.classList.remove('open');
      yesBtn.onclick = null;
      noBtn.onclick = null;
      overlay.onclick = null;
    };

    yesBtn.onclick = () => { cleanup(); resolve(true); };
    noBtn.onclick = () => { cleanup(); resolve(false); };
    overlay.onclick = (e) => {
      if (e.target === overlay) { cleanup(); resolve(false); }
    };
  });
}

// ============================================================
// CHOICE — МОДАЛКА ВЫБОРА ИЗ ВАРИАНТОВ
// ============================================================

/**
 * Показывает модалку с выбором одного из вариантов (радиокнопки).
 * @param {string} title - заголовок
 * @param {string} message - сообщение/инструкция
 * @param {Array<{value: string, label: string, description?: string}>} options - варианты выбора
 * @returns {Promise<string>} выбранное значение (или значение первого варианта при отмене)
 */
export function showChoice(title, message, options) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modalOverlay');
    if (!overlay) {
      resolve(options[0]?.value || '');
      return;
    }

    const titleEl = document.getElementById('modalTitle');
    const labelEl = document.getElementById('modalLabel');
    const input = document.getElementById('modalInput');
    const confirmBtn = document.getElementById('modalConfirm');
    const cancelBtn = document.getElementById('modalCancel');

    if (!titleEl || !labelEl || !input || !confirmBtn || !cancelBtn) {
      resolve(options[0]?.value || '');
      return;
    }

    titleEl.textContent = title;
    labelEl.textContent = message;
    input.style.display = 'none';
    input.value = '';
    input.onkeydown = null;

    // Удаляем старую radio-группу
    const oldGroup = input.parentNode?.querySelector('.radio-group');
    if (oldGroup) oldGroup.remove();

    // Создаём radio-группу
    const radioGroup = document.createElement('div');
    radioGroup.className = 'radio-group';
    radioGroup.style.margin = '12px 0';

    options.forEach((opt, idx) => {
      const label = document.createElement('label');
      label.style.display = 'block';
      label.style.margin = '6px 0';
      label.style.cursor = 'pointer';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'modal_choice';
      radio.value = opt.value;
      if (idx === 0) radio.checked = true;
      label.appendChild(radio);
      label.appendChild(document.createTextNode(' ' + opt.label));
      if (opt.description) {
        const desc = document.createElement('span');
        desc.style.fontSize = '12px';
        desc.style.color = 'var(--text-muted)';
        desc.style.marginLeft = '12px';
        desc.textContent = ' (' + opt.description + ')';
        label.appendChild(desc);
      }
      radioGroup.appendChild(label);
    });

    input.parentNode?.insertBefore(radioGroup, input.nextSibling);

    confirmBtn.onclick = null;
    cancelBtn.onclick = null;
    overlay.onclick = null;

    overlay.classList.add('open');

    const getSelected = () => {
      const selected = document.querySelector('input[name="modal_choice"]:checked');
      return selected ? selected.value : (options[0]?.value || '');
    };

    const handleConfirm = () => {
      const val = getSelected();
      closeAllModals();
      resolve(val);
    };

    const handleCancel = () => {
      const val = options[0]?.value || '';
      closeAllModals();
      resolve(val);
    };

    const handleKeydown = (e) => {
      if (e.key === 'Enter') handleConfirm();
      if (e.key === 'Escape') handleCancel();
    };

    confirmBtn.onclick = handleConfirm;
    cancelBtn.onclick = handleCancel;
    document.addEventListener('keydown', handleKeydown);

    // Сохраняем обработчик для очистки при закрытии
    const originalClose = closeAllModals;
    const wrappedClose = () => {
      document.removeEventListener('keydown', handleKeydown);
      originalClose();
    };
    // Заменяем глобальный closeAllModals на время работы модалки
    const savedClose = window._modalClose;
    window._modalClose = wrappedClose;
    // Восстанавливаем при закрытии
    const cleanup = () => {
      document.removeEventListener('keydown', handleKeydown);
      if (window._modalClose === wrappedClose) {
        window._modalClose = savedClose;
      }
    };
    // Переопределяем closeAllModals на время
    const origCloseAll = closeAllModals;
    closeAllModals = function() {
      cleanup();
      origCloseAll();
    };
    // Восстанавливаем при resolve
    const origResolve = resolve;
    resolve = function(val) {
      cleanup();
      origResolve(val);
    };
    // Восстанавливаем при reject
    const origReject = (err) => { cleanup(); };
    // Сохраняем для очистки
    overlay.onclick = (e) => {
      if (e.target === overlay) handleCancel();
    };
  });
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ ГЛОБАЛЬНЫХ ОБРАБОТЧИКОВ
// ============================================================

/**
 * Инициализирует глобальные обработчики для модалок (Escape).
 * Вызывается из main.js.
 */
export function initModalHandlers() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Проверяем все открытые модалки
      const modalOverlay = document.getElementById('modalOverlay');
      if (modalOverlay && modalOverlay.classList.contains('open')) {
        const cancelBtn = document.getElementById('modalCancel');
        if (cancelBtn) cancelBtn.click();
        return;
      }
      const confirmOverlay = document.getElementById('confirmOverlay');
      if (confirmOverlay && confirmOverlay.classList.contains('open')) {
        const noBtn = document.getElementById('confirmNo');
        if (noBtn) noBtn.click();
        return;
      }
    }
  });
}

// ============================================================
// ЭКСПОРТ ПО УМОЛЧАНИЮ
// ============================================================

export default {
  showPrompt,
  showConfirm,
  showChoice,
  initModalHandlers,
};