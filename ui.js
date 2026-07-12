// ui.js — Базовые утилиты и модальные окна (ввод текста, тосты)
import { openCasesManagerModal } from './cases.js';

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
// ЗАГЛУШКИ ДЛЯ ФУНКЦИЙ, КОТОРЫЕ БУДУТ ПЕРЕОПРЕДЕЛЕНЫ В ДРУГИХ МОДУЛЯХ
// (чтобы избежать ошибок при импорте)
// ============================================================
export function openPropsModalEditor(catKey, subKey, itemName, onSaveCallback) {
    // Эта функция будет переопределена в cases.js, но для безопасности оставляем заглушку
    showToast('Редактор свойств (заглушка)');
}

// Экспортируем также openCasesManagerModal, но она уже определена в cases.js,
// поэтому здесь мы её не переопределяем, а просто реэкспортируем.
// Чтобы не было циклических зависимостей, мы не импортируем её здесь,
// а просто объявляем пустую функцию, которая будет заменена в main.js.
// Но правильнее будет импортировать из cases.js, но тогда будет циклическая зависимость.
// Поэтому в main.js мы явно назначаем обработчики.
// Здесь оставляем заглушку.
export function openCasesManagerModal() {
    showToast('Менеджер общих кофров (заглушка)');
}