// ui.js — Базовые утилиты и модалки

// ============================================================
// ТОСТЫ
// ============================================================
let toastTimeout = null;
let toastQueue = [];
let isToastShowing = false;

export function showToast(msg, type = 'neutral', duration = 2500) {
    const t = document.getElementById('toast');
    if (!t) {
        const newToast = document.createElement('div');
        newToast.id = 'toast';
        newToast.className = 'toast';
        document.body.appendChild(newToast);
        showToast(msg, type, duration);
        return;
    }

    // Если тост уже виден, сбрасываем таймер и перезаписываем
    if (t.classList.contains('show')) {
        clearTimeout(toastTimeout);
        toastQueue = [];
        t.textContent = msg;
        t.className = 'toast ' + type;
        toastTimeout = setTimeout(() => {
            t.classList.remove('show');
            isToastShowing = false;
            if (toastQueue.length > 0) {
                const next = toastQueue.shift();
                showToast(next.msg, next.type, next.duration);
            }
        }, duration);
        void t.offsetWidth;
        t.classList.add('show');
        return;
    }

    t.textContent = msg;
    t.className = 'toast ' + type;
    void t.offsetWidth;
    t.classList.add('show');
    isToastShowing = true;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        t.classList.remove('show');
        isToastShowing = false;
        if (toastQueue.length > 0) {
            const next = toastQueue.shift();
            showToast(next.msg, next.type, next.duration);
        }
    }, duration);
}

// ============================================================
// МОДАЛКА ВВОДА ТЕКСТА (prompt)
// ============================================================
let modalResolve = null;
let modalReject = null;

export function showPrompt(title, label = 'Введите значение:', defaultValue = '', placeholder = '', validator = null) {
    return new Promise((resolve, reject) => {
        const overlay = document.getElementById('modalOverlay');
        if (!overlay) {
            reject(new Error('Модалка не найдена'));
            return;
        }
        document.getElementById('modalTitle').textContent = title;
        const labelEl = document.getElementById('modalLabel');
        if (labelEl) labelEl.textContent = label;
        const input = document.getElementById('modalInput');
        input.value = defaultValue;
        input.placeholder = placeholder || '';
        overlay.classList.add('open');
        input.focus();
        input.select();

        modalResolve = (val) => {
            overlay.classList.remove('open');
            if (validator) {
                const error = validator(val);
                if (error) {
                    showToast(error, 'error');
                    setTimeout(() => showPrompt(title, label, val, placeholder, validator).then(resolve).catch(reject), 100);
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

        const newConfirm = () => { if (modalResolve) modalResolve(inputEl.value); };
        const newCancel = () => { if (modalReject) modalReject(); };
        const newKeydown = (e) => {
            if (e.key === 'Enter') newConfirm();
            if (e.key === 'Escape') newCancel();
        };

        confirmBtn.onclick = newConfirm;
        cancelBtn.onclick = newCancel;
        inputEl.onkeydown = newKeydown;
        overlay.onclick = (e) => { if (e.target === overlay) newCancel(); };
    });
}

export function showModalEditor(title, callback) {
    showPrompt(title, 'Название:', '', 'Введите название...')
        .then(val => callback(val))
        .catch(() => callback(null));
}

// ============================================================
// КАСТОМНОЕ ПОДТВЕРЖДЕНИЕ (confirm)
// ============================================================
export function showConfirm(message, title = 'Подтверждение') {
    return new Promise((resolve) => {
        const overlay = document.getElementById('confirmOverlay');
        if (!overlay) {
            resolve(confirm(message));
            return;
        }
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = message;
        overlay.classList.add('open');

        const yesBtn = document.getElementById('confirmYes');
        const noBtn = document.getElementById('confirmNo');

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
// ЭКРАНИРОВАНИЕ
// ============================================================
export function esc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// ============================================================
// DOM-УТИЛИТЫ
// ============================================================
export function getElement(selector, parent = document) {
    const el = parent.querySelector(selector);
    if (!el) console.warn('Элемент не найден:', selector);
    return el;
}

export function getElementSafe(selector, parent = document) {
    const el = parent.querySelector(selector);
    if (!el) throw new Error(`Элемент "${selector}" не найден`);
    return el;
}

// ============================================================
// DEBOUNCE
// ============================================================
export function debounce(fn, delay = 300) {
    let timeout = null;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, args), delay);
    };
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ МОДАЛКИ
// ============================================================
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