// ui/components/Menu.js

/**
 * Компонент главного меню приложения.
 * Отвечает за отображение кнопок навигации и управление переключением между режимами.
 * @module ui/components/Menu
 */

import { esc } from '../../core/utils.js';
import { emit, EVENTS } from '../../core/events.js';
import { showToast } from '../toast.js';
import { showConfirm } from '../modal.js';

// ============================================================
// HTML-ШАБЛОН
// ============================================================

/**
 * Возвращает HTML-разметку меню.
 * @returns {string} HTML-строка
 */
function getMenuHTML() {
  return `
    <div class="card" id="mMenu">
      <h2 style="color:var(--text-secondary);font-weight:500;margin-bottom:12px;">Выберите действие:</h2>
      <div class="menu-grid">
        <button class="btn" id="btnCreateOrder">📋 Создать список</button>
        <button class="btn btn-sec" id="btnOpenOrder">📂 Открыть список</button>
        <button class="btn btn-loading" id="btnLoading">🚚 Рассчитать загрузку</button>
        <button class="btn btn-import" id="btnLoadLibrary">📥 Загрузить библиотеку</button>
        <button class="btn btn-reset" id="btnResetAll">🗑️ Сбросить данные</button>
        <button class="btn btn-purple" id="btnEditor">🏗️ Редактор склада</button>
        <button class="btn btn-purple" id="btnMonitoring">📊 Мониторинг проектов</button>
      </div>
    </div>
  `;
}

// ============================================================
// КОМПОНЕНТ
// ============================================================

/**
 * @typedef {Object} MenuCallbacks
 * @property {Function} onNavigate - вызывается при переключении режима (mode: string)
 * @property {Function} onLoadLibrary - вызывается при загрузке библиотеки
 * @property {Function} onResetData - вызывается при сбросе данных
 */

export class MenuComponent {
  /**
   * @param {HTMLElement} container - контейнер для рендеринга
   * @param {MenuCallbacks} callbacks - колбэки
   */
  constructor(container, callbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this._handlers = [];
  }

  /**
   * Рендерит меню в контейнер.
   */
  render() {
    if (!this.container) return;
    this.container.innerHTML = getMenuHTML();
    this._bindEvents();
  }

  /**
   * Привязывает обработчики событий к кнопкам.
   */
  _bindEvents() {
    const { onNavigate, onLoadLibrary, onResetData } = this.callbacks;

    const bind = (id, handler) => {
      const el = document.getElementById(id);
      if (el) {
        const wrapped = (e) => {
          e.preventDefault();
          handler(e);
        };
        el.addEventListener('click', wrapped);
        this._handlers.push({ el, event: 'click', handler: wrapped });
      }
    };

    // Кнопки навигации
    bind('btnCreateOrder', () => {
      if (onNavigate) onNavigate('order');
      emit(EVENTS.UI_STATE_CHANGED, { mode: 'order' });
    });

    bind('btnOpenOrder', () => {
      if (onNavigate) onNavigate('open');
      emit(EVENTS.UI_STATE_CHANGED, { mode: 'open' });
    });

    bind('btnLoading', () => {
      if (onNavigate) onNavigate('loading');
      emit(EVENTS.UI_STATE_CHANGED, { mode: 'loading' });
    });

    bind('btnEditor', () => {
      if (onNavigate) onNavigate('editor');
      emit(EVENTS.UI_STATE_CHANGED, { mode: 'editor' });
    });

    bind('btnMonitoring', () => {
      if (onNavigate) onNavigate('monitoring');
      emit(EVENTS.UI_STATE_CHANGED, { mode: 'monitoring' });
    });

    // Загрузка библиотеки
    bind('btnLoadLibrary', () => {
      if (onLoadLibrary) {
        onLoadLibrary();
      } else {
        // Дефолтное поведение: создаём input[type=file] и вызываем событие
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.style.display = 'none';
        document.body.appendChild(input);
        input.click();
        input.onchange = (e) => {
          const file = e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
              try {
                const data = JSON.parse(ev.target.result);
                emit(EVENTS.EDITOR_DATA_CHANGED, { action: 'importLibrary', data });
                showToast('Библиотека загружена', 'success');
              } catch (err) {
                showToast('Ошибка: ' + err.message, 'error');
              }
            };
            reader.readAsText(file);
          }
          document.body.removeChild(input);
        };
      }
    });

    // Сброс данных
    bind('btnResetAll', async () => {
      const confirmed = await showConfirm('Удалить все данные? Восстановление невозможно.', 'Сброс данных');
      if (confirmed) {
        if (onResetData) {
          onResetData();
        } else {
          // Дефолтный сброс: очищаем localStorage и перезагружаем
          localStorage.clear();
          location.reload();
        }
      }
    });
  }

  /**
   * Удаляет все обработчики событий.
   */
  destroy() {
    for (const { el, event, handler } of this._handlers) {
      el.removeEventListener(event, handler);
    }
    this._handlers = [];
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

// ============================================================
// ФАБРИЧНАЯ ФУНКЦИЯ (для удобства)
// ============================================================

/**
 * Создаёт и рендерит компонент меню.
 * @param {HTMLElement} container - контейнер
 * @param {MenuCallbacks} callbacks - колбэки
 * @returns {MenuComponent} экземпляр компонента
 */
export function createMenu(container, callbacks) {
  const menu = new MenuComponent(container, callbacks);
  menu.render();
  return menu;
}

export default {
  MenuComponent,
  createMenu,
};