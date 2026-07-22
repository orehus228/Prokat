// ui/toast.js

/**
 * Система тост-уведомлений с очередью.
 * @module ui/toast
 */

import { TOAST_DURATION } from '../core/config.js';

// ============================================================
// СОСТОЯНИЕ
// ============================================================

let toastTimeout = null;
let toastQueue = [];
let toastElement = null;

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================

/**
 * Создаёт элемент тоста, если его нет.
 * @returns {HTMLElement} элемент тоста
 */
function getToastElement() {
  if (toastElement) return toastElement;
  const el = document.getElementById('toast');
  if (el) {
    toastElement = el;
    return el;
  }
  const newEl = document.createElement('div');
  newEl.id = 'toast';
  newEl.className = 'toast';
  document.body.appendChild(newEl);
  toastElement = newEl;
  return newEl;
}

/**
 * Показывает следующий тост из очереди.
 */
function processQueue() {
  if (toastQueue.length === 0) return;
  const next = toastQueue.shift();
  showToast(next.msg, next.type, next.duration);
}

// ============================================================
// ОСНОВНАЯ ФУНКЦИЯ
// ============================================================

/**
 * Показывает тост-уведомление.
 * @param {string} msg - текст сообщения
 * @param {string} [type='neutral'] - тип: 'neutral', 'success', 'warning', 'error'
 * @param {number} [duration=2500] - длительность показа в мс
 */
export function showToast(msg, type = 'neutral', duration = TOAST_DURATION) {
  const toast = getToastElement();

  // Если тост уже виден — ставим в очередь
  if (toast.classList.contains('show')) {
    toastQueue.push({ msg, type, duration });
    return;
  }

  // Показываем тост
  toast.textContent = msg;
  toast.className = 'toast ' + type;
  
  // Принудительный reflow для анимации
  void toast.offsetWidth;
  
  toast.classList.add('show');
  
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
    // Проверяем очередь
    if (toastQueue.length > 0) {
      processQueue();
    }
  }, duration);
}

/**
 * Добавляет тост в очередь (без немедленного показа).
 * @param {string} msg - текст сообщения
 * @param {string} [type='neutral'] - тип
 * @param {number} [duration=2500] - длительность
 */
export function queueToast(msg, type = 'neutral', duration = TOAST_DURATION) {
  const toast = getToastElement();
  if (!toast.classList.contains('show')) {
    showToast(msg, type, duration);
  } else {
    toastQueue.push({ msg, type, duration });
  }
}

/**
 * Очищает очередь тостов.
 */
export function clearToastQueue() {
  toastQueue = [];
}

/**
 * Скрывает текущий тост принудительно.
 */
export function hideToast() {
  const toast = getToastElement();
  toast.classList.remove('show');
  clearTimeout(toastTimeout);
  toastTimeout = null;
  // Не обрабатываем очередь автоматически — вызывающий может сам вызвать processQueue
}

// ============================================================
// ЭКСПОРТ ПО УМОЛЧАНИЮ
// ============================================================

export default {
  showToast,
  queueToast,
  clearToastQueue,
  hideToast,
};