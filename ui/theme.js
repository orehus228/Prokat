// ui/theme.js

/**
 * Модуль управления темой оформления (тёмная / светлая).
 * Загружает тему из store и применяет CSS-атрибут `data-theme`.
 * @module ui/theme
 */

import { getState, setStateKey, saveState } from '../core/store.js';
import { STORAGE_KEYS } from '../core/config.js';
import { emit, EVENTS } from '../core/events.js';
import { safeGetStorage, safeSetStorage } from '../core/utils.js';

// ============================================================
// СОСТОЯНИЕ ТЕМЫ
// ============================================================

let currentTheme = 'dark';

// ============================================================
// ПУБЛИЧНЫЕ ФУНКЦИИ
// ============================================================

/**
 * Загружает тему из store или localStorage.
 * @returns {string} текущая тема ('dark' или 'light')
 */
export function loadTheme() {
  const state = getState();
  if (state.theme) {
    currentTheme = state.theme;
  } else {
    // Fallback: пробуем достать из localStorage напрямую
    const saved = safeGetStorage(STORAGE_KEYS.THEME, 'dark');
    currentTheme = saved;
    state.theme = saved;
  }
  applyTheme(currentTheme);
  return currentTheme;
}

/**
 * Применяет тему к документу.
 * @param {string} theme - 'dark' или 'light'
 */
export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.body.setAttribute('data-theme', theme);
  
  // Обновляем состояние кнопки (если есть)
  const toggle = document.getElementById('themeToggle');
  if (toggle) {
    toggle.classList.toggle('light', theme === 'light');
  }
  
  currentTheme = theme;
}

/**
 * Переключает тему между 'dark' и 'light'.
 */
export function toggleTheme() {
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  currentTheme = newTheme;
  
  // Применяем
  applyTheme(newTheme);
  
  // Сохраняем в store и localStorage
  const state = getState();
  state.theme = newTheme;
  saveState();
  
  // Генерируем событие
  emit(EVENTS.THEME_CHANGED, { theme: newTheme });
}

/**
 * Возвращает текущую тему.
 * @returns {string} 'dark' или 'light'
 */
export function getTheme() {
  return currentTheme;
}

/**
 * Устанавливает тему принудительно.
 * @param {string} theme - 'dark' или 'light'
 */
export function setTheme(theme) {
  if (theme !== 'dark' && theme !== 'light') {
    console.warn('[Theme] Некорректная тема:', theme);
    return;
  }
  if (theme === currentTheme) return;
  currentTheme = theme;
  applyTheme(theme);
  
  const state = getState();
  state.theme = theme;
  saveState();
  
  emit(EVENTS.THEME_CHANGED, { theme });
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ (вызывается из main.js)
// ============================================================

/**
 * Инициализирует модуль темы.
 * - Загружает сохранённую тему.
 * - Навешивает обработчик на кнопку переключения.
 * @param {Function} [onToggle] - колбэк после переключения
 */
export function initTheme(onToggle) {
  loadTheme();
  
  const toggle = document.getElementById('themeToggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      toggleTheme();
      if (onToggle) onToggle(currentTheme);
    });
  }
}

// ============================================================
// ЭКСПОРТ ПО УМОЛЧАНИЮ
// ============================================================

export default {
  loadTheme,
  applyTheme,
  toggleTheme,
  getTheme,
  setTheme,
  initTheme,
};