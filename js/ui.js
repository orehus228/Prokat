// ui.js — Базовые утилиты и модалка ввода текста
// Улучшенная версия с обработкой ошибок и расширенными возможностями

let toastTimeout = null;
let modalResolve = null;

// Экранирование HTML-сущностей
export function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Показ тост-сообщения
export function showToast(msg, duration = 2500) {
    const t = document.getElementById('toast');
    if (!t) {
        console.warn('Элемент #toast не найден');
        return;
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => t.classList.remove('show'), duration);
}

// Модалка ввода текста (улучшена: валидация, обработка ошибок)
export function showModalEditor(title, callback, initialValue = '') {
    const overlay = document.getElementById('modalOverlay');
    if (!overlay) {
        showToast('Ошибка: модалка не найдена');
        return;
    }
    document.getElementById('modalTitle').textContent = title;
    const input = document.getElementById('modalInput');
    input.value = initialValue || '';
    overlay.classList.add('open');
    input.focus();
    input.select();
    modalResolve = callback;
}

// Инициализация обработчиков модалки
export function initModalHandlers() {
    const cancelBtn = document.getElementById('modalCancel');
    const confirmBtn = document.getElementById('modalConfirm');
    const input = document.getElementById('modalInput');
    const overlay = document.getElementById('modalOverlay');

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            closeModal(null);
        });
    }

    if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
            const val = input.value.trim();
            closeModal(val || null);
        });
    }

    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                confirmBtn?.click();
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                cancelBtn?.click();
            }
        });
    }

    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeModal(null);
            }
        });
    }
}

function closeModal(value) {
    const overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.classList.remove('open');
    if (modalResolve) {
        modalResolve(value);
        modalResolve = null;
    }
}

// Утилита для безопасного получения DOM-элемента
export function getElement(id) {
    const el = document.getElementById(id);
    if (!el) console.warn(`Элемент #${id} не найден`);
    return el;
}

// Форматирование чисел
export function formatNumber(num, decimals = 1) {
    if (isNaN(num)) return '0';
    return Number(num).toFixed(decimals);
}

// Парсинг размеров "120x80x60" в массив чисел
export function parseDimensions(dimStr) {
    if (!dimStr) return null;
    const parts = dimStr.split('x').map(s => parseFloat(s.trim()));
    if (parts.length === 3 && parts.every(d => !isNaN(d) && d > 0)) {
        return parts;
    }
    return null;
}

// Вычисление объёма из размеров (см³ -> м³)
export function calcVolumeFromDims(dimStr) {
    const dims = parseDimensions(dimStr);
    if (!dims) return 0;
    return (dims[0] * dims[1] * dims[2]) / 1000000;
}