// ui/components/MonitoringPage.js

/**
 * Компонент мониторинга проектов.
 * Отображает список проектов с фильтрацией по статусу,
 * таймлайн проектов, позволяет управлять статусами,
 * редактировать и удалять проекты, открывать их в чек-листе.
 * @module ui/components/MonitoringPage
 */

import { getState, subscribe, saveState } from '../../core/store.js';
import { emit, EVENTS, on } from '../../core/events.js';
import { esc, formatDate, intervalsOverlap, deepClone } from '../../core/utils.js';
import { showToast } from '../toast.js';
import { showPrompt, showConfirm } from '../modal.js';
import { getProjects, getProject, getProjectItems, createProject, updateProject, deleteProject, getAvailableQuantity } from '../../services/projects.js';
import { getOrderProject, setOrderProject } from '../../services/order.js';

// ============================================================
// КОМПОНЕНТ
// ============================================================

export class MonitoringPage {
  /**
   * @param {HTMLElement} container - контейнер для рендеринга
   * @param {Object} callbacks - колбэки (например, onNavigate, onOpenProject)
   */
  constructor(container, callbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.currentTab = 'list';
    this._handlers = [];
    this._unsubscribe = null;
  }

  /**
   * Инициализация компонента.
   */
  init() {
    // Подписываемся на изменения проектов
    this._unsubscribe = subscribe((changedKey, state) => {
      if (changedKey === 'projects' || changedKey === 'projectItems' || changedKey === '*') {
        this._render();
      }
    });

    // Слушаем события
    this._handlers.push(
      on(EVENTS.PROJECT_CHANGED, () => this._render())
    );

    this.render();
  }

  /**
   * Рендерит страницу.
   */
  render() {
    if (!this.container) return;
    this.container.innerHTML = this._getPageHTML();
    this._bindEvents();
    this._render();
  }

  /**
   * Возвращает HTML-разметку.
   */
  _getPageHTML() {
    return `
      <div class="card" id="monitoringPage">
        <button class="btn btn-sec" id="btnBackToMenu">◀ В меню</button>
        <h3 style="color:var(--text-primary);font-weight:600;margin-bottom:12px;">📊 Мониторинг проектов</h3>

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
          <button class="btn btn-green" id="createProjectBtn">➕ Создать проект</button>
        </div>

        <div class="category-tabs" id="monitoringTabs">
          <div class="category-tab active" data-tab="list">📋 Список проектов</div>
          <div class="category-tab" data-tab="timeline">📊 Таймлайн</div>
        </div>

        <div id="monitoringContent" style="margin-top:12px;"></div>
      </div>
    `;
  }

  // ============================================================
  // ПРИВЯЗКА СОБЫТИЙ
  // ============================================================

  _bindEvents() {
    const container = this.container;

    // Навигация назад
    const backBtn = container.querySelector('#btnBackToMenu');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (this.callbacks.onNavigate) this.callbacks.onNavigate('menu');
      });
    }

    // Создание проекта
    container.querySelector('#createProjectBtn')?.addEventListener('click', () => {
      this._createProject();
    });

    // Переключение вкладок
    container.querySelectorAll('#monitoringTabs .category-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.currentTab = tab.dataset.tab;
        container.querySelectorAll('#monitoringTabs .category-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this._render();
      });
    });

    // Делегирование событий на контенте
    const content = container.querySelector('#monitoringContent');
    if (content) {
      content.addEventListener('click', (e) => this._handleContentClick(e));
    }
  }

  // ============================================================
  // РЕНДЕРИНГ СОДЕРЖИМОГО
  // ============================================================

  _render() {
    const container = this.container.querySelector('#monitoringContent');
    if (!container) return;

    if (this.currentTab === 'list') {
      this._renderList(container);
    } else {
      this._renderTimeline(container);
    }
  }

  // ============================================================
  // СПИСОК ПРОЕКТОВ
  // ============================================================

  _renderList(container) {
    const projects = getProjects();
    const planned = projects.filter(p => p.status === 'planned');
    const active = projects.filter(p => p.status === 'active');
    const completed = projects.filter(p => p.status === 'completed');

    let html = `
      <div style="display:flex;gap:20px;flex-wrap:wrap;">
        <div style="flex:1;min-width:250px;background:var(--bg-secondary);padding:12px;border-radius:8px;border:1px solid var(--border-color);">
          <h3 style="color:var(--text-secondary);margin-bottom:10px;">📋 Запланированные (${planned.length})</h3>
          ${planned.length === 0 ? '<div class="empty-message">Нет проектов</div>' : ''}
          ${planned.map(p => this._buildProjectCard(p)).join('')}
        </div>
        <div style="flex:1;min-width:250px;background:var(--bg-secondary);padding:12px;border-radius:8px;border:1px solid var(--border-color);">
          <h3 style="color:var(--text-secondary);margin-bottom:10px;">🟢 Активные (${active.length})</h3>
          ${active.length === 0 ? '<div class="empty-message">Нет проектов</div>' : ''}
          ${active.map(p => this._buildProjectCard(p)).join('')}
        </div>
        <div style="flex:1;min-width:250px;background:var(--bg-secondary);padding:12px;border-radius:8px;border:1px solid var(--border-color);">
          <h3 style="color:var(--text-secondary);margin-bottom:10px;">✅ Завершённые (${completed.length})</h3>
          ${completed.length === 0 ? '<div class="empty-message">Нет проектов</div>' : ''}
          ${completed.map(p => this._buildProjectCard(p)).join('')}
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  _buildProjectCard(project) {
    const items = getProjectItems(project.id);
    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

    const statusColors = {
      planned: '#6c757d',
      active: '#28a745',
      completed: '#007bff',
    };
    const statusLabels = {
      planned: '📋 Запланирован',
      active: '🟢 Активен',
      completed: '✅ Завершён',
    };
    const color = statusColors[project.status] || '#6c757d';
    const statusLabel = statusLabels[project.status] || project.status;

    // Проверяем конфликты
    let conflictsHtml = '';
    if (project.start_date && project.end_date) {
      const conflicts = [];
      for (const item of items) {
        const result = getAvailableQuantity(
          item.equipment_path,
          project.start_date,
          project.end_date,
          item.quantity,
          project.id
        );
        if (result.isConflict) {
          const name = item.equipment_path.split('|').pop();
          conflicts.push(`${name} (доступно ${result.available} из ${result.totalStock})`);
        }
      }
      if (conflicts.length > 0) {
        conflictsHtml = `<div style="color:var(--danger);font-size:12px;margin-top:4px;">⚠️ Конфликт: ${conflicts.join(', ')}</div>`;
      }
    }

    return `
      <div style="padding:8px 10px;margin-bottom:8px;background:var(--bg-card);border-radius:6px;border-left:4px solid ${color};border:1px solid var(--border-color);">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <div style="flex:1;">
            <strong style="font-size:14px;">${esc(project.name)}</strong>
            <div style="font-size:12px;color:var(--text-secondary);">
              ${formatDate(project.start_date)} – ${formatDate(project.end_date)}
            </div>
            <div style="font-size:12px;color:var(--text-secondary);">
              📦 ${totalItems} шт (${items.length} позиций) | ${statusLabel}
            </div>
            ${conflictsHtml}
          </div>
          <div style="display:flex;gap:4px;flex-shrink:0;">
            <button class="btn btn-sm" data-action="edit" data-id="${project.id}" title="Редактировать" style="padding:2px 6px;font-size:12px;">✏️</button>
            <button class="btn btn-sm" data-action="open" data-id="${project.id}" title="Открыть список" style="padding:2px 6px;font-size:12px;">📂</button>
            <button class="btn btn-sm" data-action="delete" data-id="${project.id}" title="Удалить" style="padding:2px 6px;font-size:12px;background:var(--danger);color:white;">✕</button>
          </div>
        </div>
        <div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap;">
          <button class="btn btn-sm" data-action="status" data-id="${project.id}" data-status="planned" style="padding:2px 6px;font-size:11px;background:${project.status === 'planned' ? 'var(--accent)' : 'var(--bg-input)'};">Запланировать</button>
          <button class="btn btn-sm" data-action="status" data-id="${project.id}" data-status="active" style="padding:2px 6px;font-size:11px;background:${project.status === 'active' ? 'var(--accent)' : 'var(--bg-input)'};">Активировать</button>
          <button class="btn btn-sm" data-action="status" data-id="${project.id}" data-status="completed" style="padding:2px 6px;font-size:11px;background:${project.status === 'completed' ? 'var(--accent)' : 'var(--bg-input)'};">Завершить</button>
        </div>
      </div>
    `;
  }

  // ============================================================
  // ТАЙМЛАЙН
  // ============================================================

  _renderTimeline(container) {
    const projects = getProjects();
    if (projects.length === 0) {
      container.innerHTML = '<div class="empty-message">Нет проектов для отображения</div>';
      return;
    }

    let minDate = null, maxDate = null;
    for (const p of projects) {
      if (p.start_date) {
        const d = new Date(p.start_date);
        if (!minDate || d < minDate) minDate = d;
      }
      if (p.end_date) {
        const d = new Date(p.end_date);
        if (!maxDate || d > maxDate) maxDate = d;
      }
    }

    if (!minDate || !maxDate) {
      container.innerHTML = '<div class="empty-message">Нет проектов с датами</div>';
      return;
    }

    minDate = new Date(minDate);
    minDate.setDate(minDate.getDate() - 2);
    maxDate = new Date(maxDate);
    maxDate.setDate(maxDate.getDate() + 2);

    const totalDays = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24));
    if (totalDays <= 0) {
      container.innerHTML = '<div class="empty-message">Некорректный диапазон дат</div>';
      return;
    }

    const sorted = [...projects].sort((a, b) => {
      if (!a.start_date) return 1;
      if (!b.start_date) return -1;
      return new Date(a.start_date) - new Date(b.start_date);
    });

    const dayWidth = Math.max(20, Math.min(60, 800 / totalDays));

    let html = `
      <div style="overflow-x:auto;padding:4px 0;">
        <div style="position:relative;min-width:${totalDays * dayWidth + 200}px;">
          <div style="display:flex;margin-bottom:4px;padding-left:200px;">
            ${Array.from({ length: Math.min(totalDays + 1, 60) }, (_, i) => {
              const d = new Date(minDate);
              d.setDate(d.getDate() + i);
              return `<div style="flex:0 0 ${dayWidth}px;font-size:10px;color:var(--text-muted);text-align:center;">${d.getDate()}.${d.getMonth()+1}</div>`;
            }).join('')}
          </div>
    `;

    const statusColors = {
      planned: '#6c757d',
      active: '#28a745',
      completed: '#007bff',
    };

    for (const p of sorted) {
      if (!p.start_date || !p.end_date) continue;
      const start = new Date(p.start_date);
      const end = new Date(p.end_date);
      const offset = Math.max(0, Math.round((start - minDate) / (1000 * 60 * 60 * 24)));
      const duration = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);
      const color = statusColors[p.status] || '#6c757d';

      html += `
        <div style="display:flex;align-items:center;margin:4px 0;padding:2px 0;">
          <div style="width:200px;flex-shrink:0;font-size:13px;padding-right:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(p.name)}">
            ${esc(p.name)}
          </div>
          <div style="flex:1;position:relative;height:28px;background:var(--bg-input);border-radius:4px;overflow:hidden;">
            <div style="position:absolute;left:${offset * dayWidth}px;width:${duration * dayWidth}px;height:100%;background:${color};border-radius:4px;opacity:0.8;transition:0.3s;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:10px;color:white;text-shadow:0 0 4px rgba(0,0,0,0.5);"
                 data-action="open" data-id="${p.id}"
                 title="${esc(p.name)} (${duration} дн.)">
              ${duration > 3 ? `${duration} дн.` : ''}
            </div>
          </div>
        </div>
      `;
    }

    html += `</div></div>`;
    container.innerHTML = html;
  }

  // ============================================================
  // ОБРАБОТЧИК КЛИКОВ В КОНТЕНТЕ
  // ============================================================

  async _handleContentClick(e) {
    const target = e.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;
    const id = target.dataset.id;

    switch (action) {
      case 'edit':
        await this._editProject(id);
        break;
      case 'delete':
        await this._deleteProject(id);
        break;
      case 'open':
        this._openProject(id);
        break;
      case 'status':
        const status = target.dataset.status;
        await this._setProjectStatus(id, status);
        break;
    }
  }

  // ============================================================
  // ОПЕРАЦИИ С ПРОЕКТАМИ
  // ============================================================

  async _createProject() {
    const name = await showPrompt('Создать проект', 'Введите название проекта:', '', '');
    if (!name || !name.trim()) return;
    const start = await showPrompt('Дата начала (YYYY-MM-DD)', 'Начало:', '', '');
    const end = await showPrompt('Дата окончания (YYYY-MM-DD)', 'Окончание:', '', '');
    try {
      const project = createProject({
        name: name.trim(),
        start_date: start || '',
        end_date: end || '',
        status: 'planned',
      });
      showToast(`Проект "${project.name}" создан`, 'success');
      this._render();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async _editProject(id) {
    const project = getProject(id);
    if (!project) {
      showToast('Проект не найден', 'error');
      return;
    }
    const name = await showPrompt('Редактировать проект', 'Название:', project.name);
    if (name === null) return;
    const start = await showPrompt('Дата начала (YYYY-MM-DD)', 'Начало:', project.start_date || '');
    if (start === null) return;
    const end = await showPrompt('Дата окончания (YYYY-MM-DD)', 'Окончание:', project.end_date || '');
    if (end === null) return;
    try {
      updateProject(id, {
        name: name.trim(),
        start_date: start || '',
        end_date: end || '',
      });
      showToast('Проект обновлён', 'success');
      this._render();
      emit(EVENTS.PROJECT_CHANGED, { action: 'update', projectId: id });
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async _deleteProject(id) {
    const project = getProject(id);
    if (!project) {
      showToast('Проект не найден', 'error');
      return;
    }
    const confirmed = await showConfirm(`Удалить проект "${project.name}" и все его позиции?`);
    if (!confirmed) return;
    try {
      deleteProject(id);
      showToast('Проект удалён', 'neutral');
      this._render();
      emit(EVENTS.PROJECT_CHANGED, { action: 'delete', projectId: id });
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  _openProject(id) {
    const project = getProject(id);
    if (!project) {
      showToast('Проект не найден', 'error');
      return;
    }

    // Устанавливаем проект в заказ
    setOrderProject({
      id: project.id,
      name: project.name,
      start_date: project.start_date,
      end_date: project.end_date,
      status: project.status,
    });

    // Переключаемся на страницу открытия (или заказа) с этим проектом
    // Сохраняем ID для автоматической загрузки
    localStorage.setItem('open_project_id', project.id);

    if (this.callbacks.onNavigate) {
      this.callbacks.onNavigate('open');
    } else if (window.switchMode) {
      window.switchMode('open');
    } else {
      showToast('Не удалось переключиться на страницу открытия', 'error');
    }

    showToast(`Открыт проект "${project.name}"`, 'success');
    emit(EVENTS.OPEN_PROJECT_REQUESTED, { projectId: project.id });
  }

  async _setProjectStatus(id, status) {
    const project = getProject(id);
    if (!project) {
      showToast('Проект не найден', 'error');
      return;
    }
    try {
      updateProject(id, { status });
      showToast(`Статус изменён на ${status}`, 'success');
      this._render();
      emit(EVENTS.PROJECT_CHANGED, { action: 'status', projectId: id, status });
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // ============================================================
  // УНИЧТОЖЕНИЕ
  // ============================================================

  destroy() {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    for (const handler of this._handlers) {
      if (typeof handler === 'function') handler();
    }
    this._handlers = [];
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

// ============================================================
// ФАБРИЧНАЯ ФУНКЦИЯ
// ============================================================

export function createMonitoringPage(container, callbacks) {
  const page = new MonitoringPage(container, callbacks);
  page.init();
  return page;
}

export default {
  MonitoringPage,
  createMonitoringPage,
};