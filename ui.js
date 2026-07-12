// ui.js — Базовые утилиты и модальные окна (ввод текста, тосты)

// ============================================================
// ЭКРАНИРОВАНИЕ СТРОК ДЛЯ HTML
// ============================================================
export function esc(str) {
    return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ============================================================
// ВСПЛЫВАЮЩИЕ УВЕДОМЛЕНИЯ (TOAST)
// ============================================================
let toastTimeout = null;

export function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => t.classList.remove('show'), 2500);
}

// ============================================================
// МОДАЛКА ДЛЯ ВВОДА ТЕКСТА (название новой позиции/подгруппы/категории)
// ============================================================
let modalResolve = null;

export function showModalEditor(title, callback) {
    const overlay = document.getElementById('modalOverlay');
    if (!overlay) return;
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalInput').value = '';
    overlay.classList.add('open');
    document.getElementById('modalInput').focus();
    modalResolve = callback;
}

// Обработчики кнопок модалки (регистрируются один раз при загрузке)
export function initModalHandlers() {
    const cancelBtn = document.getElementById('modalCancel');
    const confirmBtn = document.getElementById('modalConfirm');
    const input = document.getElementById('modalInput');

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            document.getElementById('modalOverlay').classList.remove('open');
            if (modalResolve) modalResolve(null);
            modalResolve = null;
        });
    }

    if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
            const val = document.getElementById('modalInput').value;
            document.getElementById('modalOverlay').classList.remove('open');
            if (modalResolve) modalResolve(val);
            modalResolve = null;
        });
    }

    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') confirmBtn?.click();
            if (e.key === 'Escape') cancelBtn?.click();
        });
    }

    // Закрытие по клику на фон (overlay)
    const overlay = document.getElementById('modalOverlay');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                document.getElementById('modalOverlay').classList.remove('open');
                if (modalResolve) modalResolve(null);
                modalResolve = null;
            }
        });
    }
}

// ============================================================
// ВСЕ ФУНКЦИИ, СВЯЗАННЫЕ С КОФРАМИ, УДАЛЕНЫ (они в cases.js)
// ============================================================