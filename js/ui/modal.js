// ui/modal.js
import { getElement, createElement } from './dom.js';

let modalResolve = null;
let modalReject = null;

// ============================================================
// PROMPT — модалка с вводом текста
// ============================================================

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
// CHOICE — выбор одного из нескольких вариантов (исправлен с использованием select)
// ============================================================

export function showChoice(title, message, options) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modalOverlay');
    if (!overlay) {
      // Если модалки нет, возвращаем первый вариант или null
      resolve(options[0]?.value || null);
      return;
    }
    const titleEl = document.getElementById('modalTitle');
    if (titleEl) titleEl.textContent = title;
    const labelEl = document.getElementById('modalLabel');
    if (labelEl) labelEl.textContent = message;
    const input = document.getElementById('modalInput');
    if (input) {
      input.style.display = 'none';
      const container = input.parentNode;
      const oldSelect = container.querySelector('.choice-select');
      if (oldSelect) oldSelect.remove();

      const select = document.createElement('select');
      select.className = 'choice-select';
      select.style.cssText = 'width:100%;padding:8px 12px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:4px;color:var(--text-primary);font-size:14px;margin:12px 0;';
      options.forEach((opt) => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label + (opt.description ? ' (' + opt.description + ')' : '');
        select.appendChild(option);
      });
      container.insertBefore(select, input.nextSibling);
      // Фокус на select
      select.focus();
    }
    overlay.classList.add('open');

    const cleanup = () => {
      overlay.classList.remove('open');
      if (input) {
        input.style.display = '';
        const select = input.parentNode.querySelector('.choice-select');
        if (select) select.remove();
      }
    };

    const confirmBtn = document.getElementById('modalConfirm');
    const cancelBtn = document.getElementById('modalCancel');

    const getSelected = () => {
      const select = document.querySelector('.choice-select');
      if (select) {
        const val = select.value;
        console.log('[showChoice] Выбрано значение:', val);
        return val;
      }
      return options[0]?.value || null;
    };

    const handleConfirm = () => {
      cleanup();
      resolve(getSelected());
    };
    const handleCancel = () => {
      cleanup();
      resolve(null);
    };
    const handleKeydown = (e) => {
      if (e.key === 'Enter') handleConfirm();
      if (e.key === 'Escape') handleCancel();
    };

    if (confirmBtn) confirmBtn.onclick = handleConfirm;
    if (cancelBtn) cancelBtn.onclick = handleCancel;
    if (input) input.onkeydown = handleKeydown;
    overlay.onclick = (e) => { if (e.target === overlay) handleCancel(); };
  });
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ МОДАЛОК
// ============================================================

export function initModalHandlers() {
  const overlay = document.getElementById('modalOverlay');
  const confirmOverlay = document.getElementById('confirmOverlay');
  const input = document.getElementById('modalInput');

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modalOverlay = document.getElementById('modalOverlay');
      if (modalOverlay && modalOverlay.classList.contains('open')) {
        if (modalReject) modalReject();
        modalOverlay.classList.remove('open');
        return;
      }
      const confirmOverlayEl = document.getElementById('confirmOverlay');
      if (confirmOverlayEl && confirmOverlayEl.classList.contains('open')) {
        const noBtn = document.getElementById('confirmNo');
        if (noBtn) noBtn.click();
        confirmOverlayEl.classList.remove('open');
        return;
      }
    }
  });

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
  showChoice,
  initModalHandlers,
};