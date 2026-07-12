// ui.js — Базовые утилиты и модалка ввода текста

let toastTimeout = null;
let modalResolve = null;

export function esc(str) {
    return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => t.classList.remove('show'), 2500);
}

export function showModalEditor(title, callback) {
    const overlay = document.getElementById('modalOverlay');
    if (!overlay) return;
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalInput').value = '';
    overlay.classList.add('open');
    document.getElementById('modalInput').focus();
    modalResolve = callback;
}

export function initModalHandlers() {
    const cancelBtn = document.getElementById('modalCancel');
    const confirmBtn = document.getElementById('modalConfirm');
    const input = document.getElementById('modalInput');
    const overlay = document.getElementById('modalOverlay');

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            overlay.classList.remove('open');
            if (modalResolve) modalResolve(null);
            modalResolve = null;
        });
    }

    if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
            const val = input.value;
            overlay.classList.remove('open');
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

    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('open');
                if (modalResolve) modalResolve(null);
                modalResolve = null;
            }
        });
    }
}