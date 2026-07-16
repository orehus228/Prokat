// ui/theme.js
import { getState, setStateKey, saveState } from '../core/state.js';
import { STORAGE_KEYS } from '../core/config.js';

let currentTheme = 'dark';

/**
 * Загружает тему из состояния или localStorage.
 * @returns {string} 'dark' или 'light'
 */
export function loadTheme() {
  const state = getState();
  if (state.theme) {
    currentTheme = state.theme;
  } else {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.THEME);
      if (saved) {
        currentTheme = saved;
        state.theme = saved;
      } else {
        currentTheme = 'dark';
        state.theme = 'dark';
      }
    } catch (e) {
      currentTheme = 'dark';
      state.theme = 'dark';
    }
  }
  applyTheme(currentTheme);
  return currentTheme;
}

/**
 * Применяет тему к документу.
 * @param {string} theme - 'dark' или 'light'
 */
export function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  const toggle = document.getElementById('themeToggle');
  if (toggle) {
    toggle.classList.toggle('light', theme === 'light');
  }
  currentTheme = theme;
}

/**
 * Переключает тему между 'dark' и 'light'.
 * @param {Function} onToggle - колбэк после переключения (опционально)
 */
export function toggleTheme(onToggle) {
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  currentTheme = newTheme;
  applyTheme(newTheme);
  // Сохраняем в state и localStorage
  const state = getState();
  state.theme = newTheme;
  saveState();
  if (onToggle) onToggle(newTheme);
}

/**
 * Возвращает текущую тему.
 * @returns {string}
 */
export function getTheme() {
  return currentTheme;
}

/**
 * Инициализирует кнопку переключения темы.
 * @param {Function} onToggle - колбэк при переключении
 */
export function initThemeToggle(onToggle) {
  const toggle = document.getElementById('themeToggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      toggleTheme((theme) => {
        if (onToggle) onToggle(theme);
      });
    });
  }
  // Устанавливаем начальное состояние
  applyTheme(currentTheme);
}

export default {
  loadTheme,
  applyTheme,
  toggleTheme,
  getTheme,
  initThemeToggle,
};