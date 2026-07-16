// ui/modal.js
import { getElement, createElement } from './dom.js';

let modalResolve = null;
let modalReject = null;

// ============================================================
// PROMPT — модалка с вводом текста
// ============================================================

/**
 * Показывает модалку с полем ввода.
 * @param {string} title - заголовок
 * @param {string} label - текст метки (необязательно)
 * @param {string} defaultValue - значение по умолчанию
 * @param {string} placeholder - плейсхолдер
 * @param {Function} validator - функция валидации (если возвращает строку — ошибка)
 * @returns {Promise<string|null>}
 */
export function showPrompt(title, label = 'Введите значение:', defaultValue = '', placeholder = '', validator = null) {
  return new Promise((resolve, reject) => {
    const overlay = document.getElementById('modalOverlay');
    if (!overlay) {
      reject(new Error('Модалка не найдена'));
      return;
    }
    const titleEl = document.getElementById('modalTitle');
    if (titleEl) titleEl.textContent = title;
    const labelEl = document.getElementById('modalLabel');
    if (labelEl) labelEl.textContent = label;
    const input = document.getElementById('modalInput');
    if (input) {
      input.value = defaultValue;
      input.placeholder = placeholder || '';
    }
    overlay.classList.add('open');
    if (input) {
      input.focus();
      input.select();
    }

    modalResolve = (val) => {
      overlay.classList.remove('open');
      if (validator) {
        const error = validator(val);
        if (error) {
          // Импортируем showToast динамически, чтобы избежать циклической зависимости
          import('./toast.js').then(({ showToast }) => {
            showToast(error, 'error');
            setTimeout(() => showPrompt(title, label, val, placeholder, validator).then(resolve).catch(reject), 100);
          });
          return;
        }
      }
      resolve(val);
    };
    modalReject = () => {
      overlay.classList.remove('open');
      resolve(null);
    };

    const confirmBtn = document.getElementById('modalConfirm');
    const cancelBtn = document.getElementById('modalCancel');
    const inputEl = document.getElementById('modalInput');

    const newConfirm = () => { if (modalResolve) modalResolve(inputEl ? inputEl.value : ''); };
    const newCancel = () => { if (modalReject) modalReject(); };
    const newKeydown = (e) => {
      if (e.key === 'Enter') newConfirm();
      if (e.key === 'Escape') newCancel();
    };

    if (confirmBtn) confirmBtn.onclick = newConfirm;
    if (cancelBtn) cancelBtn.onclick = newCancel;
    if (inputEl) inputEl.onkeydown = newKeydown;
    overlay.onclick = (e) => { if (e.target === overlay) newCancel(); };
  });
}

// ============================================================
// CONFIRM — модалка подтверждения
// ============================================================

/**
 * Показывает модалку подтверждения.
 * @param {string} message - текст сообщения
 * @param {string} title - заголовок (по умолчанию 'Подтверждение')
 * @returns {Promise<boolean>}
 */
export function showConfirm(message, title = 'Подтверждение') {
  return new Promise((resolve) => {
    const overlay = document.getElementById('confirmOverlay');
    if (!overlay) {
      resolve(confirm(message));
      return;
    }
    const titleEl = document.getElementById('confirmTitle');
    if (titleEl) titleEl.textContent = title;
    const msgEl = document.getElementById('confirmMessage');
    if (msgEl) msgEl.textContent = message;
    overlay.classList.add('open');

    const yesBtn = document.getElementById('confirmYes');
    const noBtn = document.getElementById('confirmNo');

    const cleanup = () => {
      overlay.classList.remove('open');
      if (yesBtn) yesBtn.onclick = null;
      if (noBtn) noBtn.onclick = null;
      overlay.onclick = null;
    };

    if (yesBtn) yesBtn.onclick = () => { cleanup(); resolve(true); };
    if (noBtn) noBtn.onclick = () => { cleanup(); resolve(false); };
    overlay.onclick = (e) => {
      if (e.target === overlay) { cleanup(); resolve(false); }
    };
  });
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ МОДАЛОК (для обработчиков ESC и т.д.)
// ============================================================

export function initModalHandlers() {
  const overlay = document.getElementById('modalOverlay');
  const confirmOverlay = document.getElementById('confirmOverlay');
  const input = document.getElementById('modalInput');

  // Обработчик клика по оверлею для modalOverlay (уже есть в showPrompt)
  // Но добавим глобальный обработчик ESC для всех модалок
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Закрываем active модалки
      const modalOverlay = document.getElementById('modalOverlay');
      if (modalOverlay && modalOverlay.classList.contains('open')) {
        if (modalReject) modalReject();
        modalOverlay.classList.remove('open');
        return;
      }
      const confirmOverlayEl = document.getElementById('confirmOverlay');
      if (confirmOverlayEl && confirmOverlayEl.classList.contains('open')) {
        // confirm не имеет reject, просто имитируем нажатие "Нет"
        const noBtn = document.getElementById('confirmNo');
        if (noBtn) noBtn.click();
        confirmOverlayEl.classList.remove('open');
        return;
      }
    }
  });

  // Для случая, если пользователь кликнул на оверлей confirmOverlay
  if (confirmOverlay) {
    confirmOverlay.addEventListener('click', (e) => {
      if (e.target === confirmOverlay) {
        const noBtn = document.getElementById('confirmNo');
        if (noBtn) noBtn.click();
      }
    });
  }
}

export default {
  showPrompt,
  showConfirm,
  initModalHandlers,
};