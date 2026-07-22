// core/events.js

/**
 * Шина событий (Event Bus) для межкомпонентного взаимодействия.
 * Позволяет слабо связывать модули через события.
 * @module core/events
 */

// ============================================================
// ХРАНИЛИЩЕ ПОДПИСЧИКОВ
// ============================================================

/** @type {Map<string, Array<Function>>} */
const listeners = new Map();

// ============================================================
// ПУБЛИЧНЫЕ МЕТОДЫ
// ============================================================

/**
 * Подписывается на событие.
 * @param {string} event - имя события
 * @param {Function} callback - функция-обработчик (получает данные события)
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
  const index = callbacks.indexOf(callback);
  if (index !== -1) {
    callbacks.splice(index, 1);
  }
  if (callbacks.length === 0) {
    listeners.delete(event);
  }
}

/**
 * Генерирует событие синхронно.
 * @param {string} event - имя события
 * @param {*} [data] - данные события
 */
export function emit(event, data) {
  if (!listeners.has(event)) return;
  const callbacks = listeners.get(event);
  for (const cb of callbacks) {
    try {
      cb(data);
    } catch (err) {
      console.warn(`[Events] Ошибка в обработчике события "${event}":`, err);
    }
  }
}

/**
 * Генерирует событие асинхронно (в микротаске).
 * @param {string} event - имя события
 * @param {*} [data] - данные события
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
// ПРЕДОПРЕДЕЛЁННЫЕ ИМЕНА СОБЫТИЙ
// ============================================================

/**
 * @enum {string}
 */
export const EVENTS = {
  /** Изменение данных редактора (инвентарь, остатки, свойства) */
  EDITOR_DATA_CHANGED: 'editor:dataChanged',

  /** Изменение данных заказа (позиции, упаковка, привязки) */
  ORDER_DATA_CHANGED: 'order:dataChanged',

  /** Изменение UI-состояния (открытые категории, поиск, режимы) */
  UI_STATE_CHANGED: 'ui:stateChanged',

  /** Изменение проекта (создание, обновление, удаление) */
  PROJECT_CHANGED: 'project:changed',

  /** Переключение темы */
  THEME_CHANGED: 'theme:changed',

  /** Открытие модалки */
  MODAL_OPENED: 'modal:opened',

  /** Закрытие модалки */
  MODAL_CLOSED: 'modal:closed',

  /** Обновление списка позиций (например, после добавления/удаления) */
  ITEMS_UPDATED: 'items:updated',

  /** Запрос на открытие конкретного проекта */
  OPEN_PROJECT_REQUESTED: 'project:openRequested',

  /** Изменение выделенных грузовиков */
  TRUCKS_SELECTED: 'trucks:selected',

  /** Изменение пресетов (заказов или матрицы) */
  PRESETS_CHANGED: 'presets:changed',

  /** Очистка кэша расчётов */
  CACHE_CLEARED: 'cache:cleared',
};

// ============================================================
// ЭКСПОРТ ПО УМОЛЧАНИЮ
// ============================================================

export default {
  on,
  off,
  emit,
  emitAsync,
  clearAllListeners,
  EVENTS,
};