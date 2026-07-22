// core/events.js

// ============================================================
// ШИНА СОБЫТИЙ (Event Bus)
// ============================================================

const listeners = new Map();

/**
 * Подписывается на событие.
 * @param {string} event - имя события
 * @param {Function} callback - функция-обработчик
 * @returns {Function} функция для отписки
 */
export function on(event, callback) {
  if (!listeners.has(event)) {
    listeners.set(event, []);
  }
  listeners.get(event).push(callback);
  return () => off(event, callback);
}

/**
 * Отписывается от события.
 * @param {string} event - имя события
 * @param {Function} callback - функция-обработчик
 */
export function off(event, callback) {
  if (!listeners.has(event)) return;
  const callbacks = listeners.get(event);
  const idx = callbacks.indexOf(callback);
  if (idx !== -1) {
    callbacks.splice(idx, 1);
  }
  if (callbacks.length === 0) {
    listeners.delete(event);
  }
}

/**
 * Генерирует событие (синхронно).
 * @param {string} event - имя события
 * @param {*} data - данные события
 */
export function emit(event, data) {
  if (!listeners.has(event)) return;
  const callbacks = listeners.get(event);
  for (let cb of callbacks) {
    try {
      cb(data);
    } catch (e) {
      console.warn(`Ошибка в обработчике события "${event}":`, e);
    }
  }
}

/**
 * Генерирует событие асинхронно (в микротаске).
 * @param {string} event - имя события
 * @param {*} data - данные события
 */
export function emitAsync(event, data) {
  Promise.resolve().then(() => emit(event, data));
}

/**
 * Очищает все подписки.
 */
export function clearAllListeners() {
  listeners.clear();
}

// ============================================================
// ПРЕДОПРЕДЕЛЁННЫЕ ИМЕНА СОБЫТИЙ (для удобства)
// ============================================================

export const EVENTS = {
  // Изменение данных редактора
  EDITOR_DATA_CHANGED: 'editor:dataChanged',
  // Изменение данных заказа
  ORDER_DATA_CHANGED: 'order:dataChanged',
  // Изменение состояния UI (открытые категории, чекбоксы и т.д.)
  UI_STATE_CHANGED: 'ui:stateChanged',
  // Изменение проекта
  PROJECT_CHANGED: 'project:changed',
  // Переключение темы
  THEME_CHANGED: 'theme:changed',
  // Открытие/закрытие модалок
  MODAL_OPENED: 'modal:opened',
  MODAL_CLOSED: 'modal:closed',
  // Обновление списка позиций
  ITEMS_UPDATED: 'items:updated',
  // Событие для перехода к проекту
  OPEN_PROJECT_REQUESTED: 'project:openRequested',
};

export default {
  on,
  off,
  emit,
  emitAsync,
  clearAllListeners,
  EVENTS,
};