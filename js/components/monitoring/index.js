// components/monitoring/index.js
import { getState, saveState } from '../../core/state.js';
import {
  getProjects,
  getProject,
  getProjectItems,
  saveProject,
  deleteProject,
  getAvailableQuantity,
} from '../../services/project-data.js';
import { getItemPropsByPath, getStockValue } from '../../data/editor-data.js';
import { showToast } from '../../ui/toast.js';
import { showConfirm, showPrompt } from '../../ui/modal.js';
import { esc } from '../../ui/dom.js';
import { emit, EVENTS } from '../../core/events.js';

let currentTab = 'list';

function getProjectStatusLabel(status) {
  const map = {
    planned: '📋 Запланирован',
    active: '🟢 Активен',
    completed: '✅ Завершён'
  };
  return map[status] || status;
}

function getProjectStatusColor(status) {
  const map = {
    planned: '#6c757d',
    active: '#28a745',
    completed: '#007bff'
  };
  return map[status] || '#6c757d';
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('ru-RU');
}

function getProjectTotalItems(projectId) {
  const items = getProjectItems(projectId);
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

export function renderMonitoringPage() {
  const container = document.getElementById('monitoringContent');
  if (!container) return;

  const tabsHtml = `
    <div class="category-tabs" id="monitoringTabs">
      <div class="category-tab ${currentTab === 'list' ? 'active' : ''}" data-tab="list">📋 Список проектов</div>
      <div class="category-tab ${currentTab === 'timeline' ? 'active' : ''}" data-tab="timeline">📊 Таймлайн</div>
    </div>
    <div id="monitoringContentInner"></div>
  `;

  container.innerHTML = tabsHtml;

  document.querySelectorAll('#monitoringTabs .category-tab').forEach(tab => {
    tab.addEventListener('click', function() {
      currentTab = this.dataset.tab;
      renderMonitoringPage();
    });
  });

  const inner = document.getElementById('monitoringContentInner');
  if (currentTab === 'list') {
    renderProjectList(inner);
  } else {
    renderTimeline(inner);
  }
}

function renderProjectList(container) {
  const projects = getProjects();
  const planned = projects.filter(p => p.status === 'planned');
  const active = projects.filter(p => p.status === 'active');
  const completed = projects.filter(p => p.status === 'completed');

  let html = `
    <div style="display:flex;gap:20px;flex-wrap:wrap;margin-top:12px;">
      <div style="flex:1;min-width:250px;background:var(--bg-secondary);padding:12px;border-radius:8px;border:1px solid var(--border-color);">
        <h3 style="color:var(--text-secondary);margin-bottom:10px;">📋 Запланированные (${planned.length})</h3>
        ${planned.length === 0 ? '<div class="empty-message">Нет проектов</div>' : ''}
        ${planned.map(p => renderProjectCard(p)).join('')}
      </div>
      <div style="flex:1;min-width:250px;background:var(--bg-secondary);padding:12px;border-radius:8px;border:1px solid var(--border-color);">
        <h3 style="color:var(--text-secondary);margin-bottom:10px;">🟢 Активные (${active.length})</h3>
        ${active.length === 0 ? '<div class="empty-message">Нет проектов</div>' : ''}
        ${active.map(p => renderProjectCard(p)).join('')}
      </div>
      <div style="flex:1;min-width:250px;background:var(--bg-secondary);padding:12px;border-radius:8px;border:1px solid var(--border-color);">
        <h3 style="color:var(--text-secondary);margin-bottom:10px;">✅ Завершённые (${completed.length})</h3>
        ${completed.length === 0 ? '<div class="empty-message">Нет проектов</div>' : ''}
        ${completed.map(p => renderProjectCard(p)).join('')}
      </div>
    </div>
  `;

  container.innerHTML = html;
}

function renderProjectCard(project) {
  const totalItems = getProjectTotalItems(project.id);
  const color = getProjectStatusColor(project.status);
  const statusLabel = getProjectStatusLabel(project.status);

  let conflictsHtml = '';
  if (project.start_date && project.end_date) {
    const allItems = getProjectItems(project.id);
    let hasConflict = false;
    const conflictList = [];
    allItems.forEach(item => {
      const result = getAvailableQuantity(
        item.equipment_path,
        project.start_date,
        project.end_date,
        item.quantity,
        project.id
      );
      if (result.isConflict) {
        hasConflict = true;
        const name = item.equipment_path.split('|').pop();
        conflictList.push(`${name} (доступно ${result.available} из ${result.totalStock})`);
      }
    });
    if (hasConflict) {
      conflictsHtml = `<div style="color:var(--danger);font-size:12px;margin-top:4px;">⚠️ Конфликт оборудования: ${conflictList.join(', ')}</div>`;
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
            📦 ${totalItems} позиций | ${statusLabel}
          </div>
          ${conflictsHtml}
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0;">
          <button class="btn btn-sm" onclick="window.editProject('${project.id}')" title="Редактировать" style="padding:2px 6px;font-size:12px;">✏️</button>
          <button class="btn btn-sm" onclick="window.openProjectList('${project.id}')" title="Открыть список" style="padding:2px 6px;font-size:12px;">📂</button>
          <button class="btn btn-sm" onclick="window.deleteProjectConfirm('${project.id}')" title="Удалить" style="padding:2px 6px;font-size:12px;background:var(--danger);color:white;">✕</button>
        </div>
      </div>
      <div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap;">
        <button class="btn btn-sm" onclick="window.setProjectStatus('${project.id}','planned')" style="padding:2px 6px;font-size:11px;background:${project.status === 'planned' ? 'var(--accent)' : 'var(--bg-input)'};">Запланировать</button>
        <button class="btn btn-sm" onclick="window.setProjectStatus('${project.id}','active')" style="padding:2px 6px;font-size:11px;background:${project.status === 'active' ? 'var(--accent)' : 'var(--bg-input)'};">Активировать</button>
        <button class="btn btn-sm" onclick="window.setProjectStatus('${project.id}','completed')" style="padding:2px 6px;font-size:11px;background:${project.status === 'completed' ? 'var(--accent)' : 'var(--bg-input)'};">Завершить</button>
      </div>
    </div>
  `;
}

function renderTimeline(container) {
  const projects = getProjects();
  if (projects.length === 0) {
    container.innerHTML = '<div class="empty-message">Нет проектов для отображения</div>';
    return;
  }

  let minDate = null, maxDate = null;
  projects.forEach(p => {
    if (p.start_date) {
      const d = new Date(p.start_date);
      if (!minDate || d < minDate) minDate = d;
    }
    if (p.end_date) {
      const d = new Date(p.end_date);
      if (!maxDate || d > maxDate) maxDate = d;
    }
  });

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
    <div style="overflow-x:auto;margin-top:12px;padding:4px 0;">
      <div style="position:relative;min-width:${totalDays * dayWidth + 200}px;">
        <div style="display:flex;margin-bottom:4px;padding-left:200px;">
          ${Array.from({ length: Math.min(totalDays + 1, 60) }, (_, i) => {
            const d = new Date(minDate);
            d.setDate(d.getDate() + i);
            return `<div style="flex:0 0 ${dayWidth}px;font-size:10px;color:var(--text-muted);text-align:center;">${d.getDate()}.${d.getMonth()+1}</div>`;
          }).join('')}
        </div>
  `;

  sorted.forEach(p => {
    if (!p.start_date || !p.end_date) return;
    const start = new Date(p.start_date);
    const end = new Date(p.end_date);
    const offset = Math.max(0, Math.round((start - minDate) / (1000 * 60 * 60 * 24)));
    const duration = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);
    const color = getProjectStatusColor(p.status);
    const statusLabel = getProjectStatusLabel(p.status);

    html += `
      <div style="display:flex;align-items:center;margin:4px 0;padding:2px 0;">
        <div style="width:200px;flex-shrink:0;font-size:13px;padding-right:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(p.name)}">
          ${esc(p.name)}
        </div>
        <div style="flex:1;position:relative;height:28px;background:var(--bg-input);border-radius:4px;overflow:hidden;">
          <div style="position:absolute;left:${offset * dayWidth}px;width:${duration * dayWidth}px;height:100%;background:${color};border-radius:4px;opacity:0.8;transition:0.3s;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:10px;color:white;text-shadow:0 0 4px rgba(0,0,0,0.5);"
               onclick="window.openProjectList('${p.id}')"
               title="${esc(p.name)} (${statusLabel})">
            ${duration > 3 ? `${duration} дн.` : ''}
          </div>
        </div>
      </div>
    `;
  });

  html += `</div></div>`;
  container.innerHTML = html;
}

// Глобальные функции для onclick
window.editProject = async function(id) {
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

  saveProject({ id: project.id, name, start_date: start, end_date: end, status: project.status });
  showToast('Проект обновлён', 'success');
  renderMonitoringPage();
  emit(EVENTS.PROJECT_CHANGED, { projectId: project.id });
};

window.openProjectList = function(id) {
  const project = getProject(id);
  if (!project) {
    showToast('Проект не найден', 'error');
    return;
  }
  localStorage.setItem('open_project_id', id);
  if (window.switchMode) {
    window.switchMode('open');
    const event = new CustomEvent('openProject', { detail: { projectId: id } });
    document.dispatchEvent(event);
    showToast(`Открыт проект "${project.name}"`, 'success');
  } else {
    showToast('Функция переключения режима не доступна', 'error');
  }
};

window.deleteProjectConfirm = async function(id) {
  const confirmed = await showConfirm('Удалить проект и все его позиции?');
  if (!confirmed) return;
  deleteProject(id);
  showToast('Проект удалён', 'neutral');
  renderMonitoringPage();
  emit(EVENTS.PROJECT_CHANGED, { projectId: id, deleted: true });
};

window.setProjectStatus = function(id, status) {
  const project = getProject(id);
  if (!project) {
    showToast('Проект не найден', 'error');
    return;
  }
  saveProject({ id: project.id, name: project.name, start_date: project.start_date, end_date: project.end_date, status });
  showToast(`Статус изменён на ${getProjectStatusLabel(status)}`, 'success');
  renderMonitoringPage();
  emit(EVENTS.PROJECT_CHANGED, { projectId: id, status });
};

export function initMonitoringUI() {
  document.addEventListener('projectsUpdated', () => {
    if (document.getElementById('monitoringPage')?.style.display !== 'none') {
      renderMonitoringPage();
    }
  });
}

export default {
  renderMonitoringPage,
  initMonitoringUI,
};