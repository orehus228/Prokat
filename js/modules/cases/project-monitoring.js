// project-monitoring.js — Модуль мониторинга проектов
import {
    getProjects,
    getProject,
    getProjectItems,
    deleteProject,
    getStockValue,
    getItemProps,
    saveProject,
    clearProjectItems,
    addProjectItem
} from '../../data.js';

import {
    esc,
    showToast,
    showConfirm,
    showPrompt
} from '../../ui.js';

import {
    order,
    orderProject,
    loadOrderData,
    saveOrderData,
    setOrderProject,
    resetOrderProject
} from '../../order.js';

import { renderOrderAll } from '../../order-render.js';

// ============================================================
// СОСТОЯНИЕ
// ============================================================
let currentTab = 'list'; // list | timeline
let projectsCache = [];

// ============================================================
// ОСНОВНАЯ ФУНКЦИЯ РЕНДЕРИНГА
// ============================================================
export function renderMonitoringPage() {
    const container = document.getElementById('monitoringContent');
    if (!container) return;

    // Загружаем свежие данные
    projectsCache = getProjects();

    let html = `
        <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
            <button class="btn btn-green" id="monitoringCreateProjectBtn">➕ Создать проект</button>
            <button class="btn btn-sec" id="monitoringRefreshBtn">🔄 Обновить</button>
        </div>
        <div class="category-tabs" id="monitoringTabs">
            <div class="category-tab ${currentTab === 'list' ? 'active' : ''}" data-tab="list">📋 Список проектов</div>
            <div class="category-tab ${currentTab === 'timeline' ? 'active' : ''}" data-tab="timeline">📊 Таймлайн</div>
        </div>
        <div id="monitoringTabContent"></div>
    `;

    container.innerHTML = html;

    // Обработчики вкладок
    document.querySelectorAll('#monitoringTabs .category-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            currentTab = tab.dataset.tab;
            renderMonitoringPage();
        });
    });

    // Обработчики кнопок
    document.getElementById('monitoringCreateProjectBtn')?.addEventListener('click', createNewProject);
    document.getElementById('monitoringRefreshBtn')?.addEventListener('click', () => {
        projectsCache = getProjects();
        renderMonitoringPage();
        showToast('Данные обновлены', 'neutral');
    });

    // Рендерим контент вкладки
    renderTabContent(currentTab);
}

// ============================================================
// РЕНДЕРИНГ ВКЛАДКИ
// ============================================================
function renderTabContent(tab) {
    const container = document.getElementById('monitoringTabContent');
    if (!container) return;

    if (tab === 'list') {
        renderProjectList(container);
    } else if (tab === 'timeline') {
        renderTimeline(container);
    }
}

// ============================================================
// ВКЛАДКА "СПИСОК ПРОЕКТОВ" (КАНБАН-ДОСКА)
// ============================================================
function renderProjectList(container) {
    const projects = getProjects();
    const planned = projects.filter(p => p.status === 'planned');
    const active = projects.filter(p => p.status === 'active');
    const completed = projects.filter(p => p.status === 'completed');

    let html = `<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start;">`;

    // Колонка "Запланированные"
    html += renderProjectColumn('Запланированные', planned, '#8899aa');
    // Колонка "Активные"
    html += renderProjectColumn('Активные', active, '#4a9a5a');
    // Колонка "Завершённые"
    html += renderProjectColumn('Завершённые', completed, '#4a6a9a');

    html += `</div>`;
    container.innerHTML = html;
}

function renderProjectColumn(title, projects, color) {
    let html = `<div style="flex:1;min-width:280px;background:var(--bg-secondary);padding:12px;border-radius:8px;border:1px solid var(--border-color);">`;
    html += `<h4 style="margin-bottom:12px;color:var(--text-primary);border-bottom:2px solid ${color};padding-bottom:6px;">${title} (${projects.length})</h4>`;

    if (projects.length === 0) {
        html += `<div style="color:var(--text-muted);font-style:italic;padding:12px 0;">Нет проектов</div>`;
    } else {
        projects.forEach(p => {
            html += renderProjectCard(p, color);
        });
    }

    html += `</div>`;
    return html;
}

function renderProjectCard(project, color) {
    const items = getProjectItems(project.id);
    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
    const itemCount = items.length;

    // Проверяем коллизии (есть ли конфликты с другими проектами)
    const conflicts = checkProjectConflicts(project);

    let conflictIndicator = '';
    if (conflicts.length > 0) {
        conflictIndicator = `<span style="color:var(--danger);font-weight:bold;margin-left:8px;">⚠️ ${conflicts.length} конфликт(ов)</span>`;
    }

    let html = `<div style="background:var(--bg-card);padding:10px;border-radius:6px;margin-bottom:8px;border-left:4px solid ${color};cursor:pointer;transition:0.15s;" 
                onclick="window.openProject('${project.id}')"
                onmouseover="this.style.background='var(--bg-hover)'" 
                onmouseout="this.style.background='var(--bg-card)'">`;
    html += `<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">`;
    html += `<strong style="font-size:15px;">${esc(project.name)}</strong>`;
    html += `<div style="display:flex;gap:4px;">`;
    html += `<button class="btn btn-sm" onclick="event.stopPropagation();window.editProject('${project.id}')" style="padding:2px 8px;font-size:12px;">✏️</button>`;
    html += `<button class="btn btn-sm" onclick="event.stopPropagation();window.deleteProjectHandler('${project.id}')" style="padding:2px 8px;font-size:12px;background:var(--danger);color:white;">🗑️</button>`;
    html += `</div>`;
    html += `</div>`;
    html += `<div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">`;
    html += `<span>📅 ${project.start_date || '—'} – ${project.end_date || '—'}</span>`;
    html += `<span style="margin-left:12px;">📦 ${itemCount} позиций (${totalItems} шт)</span>`;
    html += conflictIndicator;
    html += `</div>`;
    if (conflicts.length > 0) {
        html += `<div style="font-size:12px;color:var(--danger);margin-top:4px;">`;
        conflicts.forEach(c => {
            html += `<div>• ${c.equipment}: занято ${c.quantity} шт в проекте "${c.project}"</div>`;
        });
        html += `</div>`;
    }
    html += `</div>`;
    return html;
}

function checkProjectConflicts(project) {
    if (project.status === 'completed') return [];
    const allProjects = getProjects();
    const allItems = getProjectItems();
    const conflicts = [];

    // Находим пересекающиеся проекты
    const nStart = new Date(project.start_date).getTime();
    const nEnd = new Date(project.end_date).getTime();

    const overlapping = allProjects.filter(p => {
        if (p.id === project.id) return false;
        if (p.status === 'completed') return false;
        const pStart = new Date(p.start_date).getTime();
        const pEnd = new Date(p.end_date).getTime();
        return (pStart <= nEnd && pEnd >= nStart);
    });

    if (overlapping.length === 0) return [];

    // Собираем все позиции текущего проекта
    const projectItems = allItems.filter(item => item.project_id === project.id);

    projectItems.forEach(item => {
        overlapping.forEach(overlap => {
            const overlapItems = allItems.filter(oi => oi.project_id === overlap.id && oi.equipment_path === item.equipment_path);
            const totalOverlap = overlapItems.reduce((sum, oi) => sum + oi.quantity, 0);
            if (totalOverlap > 0) {
                const pathParts = item.equipment_path.split('|');
                const name = pathParts[pathParts.length - 1];
                conflicts.push({
                    equipment: name,
                    quantity: totalOverlap,
                    project: overlap.name
                });
            }
        });
    });

    return conflicts;
}

// ============================================================
// ВКЛАДКА "ТАЙМЛАЙН"
// ============================================================
function renderTimeline(container) {
    const projects = getProjects();
    if (projects.length === 0) {
        container.innerHTML = `<div style="color:var(--text-muted);padding:20px;text-align:center;">Нет проектов для отображения на таймлайне</div>`;
        return;
    }

    // Находим минимальную и максимальную дату
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
        container.innerHTML = `<div style="color:var(--text-muted);padding:20px;text-align:center;">Нет корректных дат для отображения</div>`;
        return;
    }

    // Расширяем диапазон на 2 дня для отступов
    minDate = new Date(minDate);
    minDate.setDate(minDate.getDate() - 2);
    maxDate = new Date(maxDate);
    maxDate.setDate(maxDate.getDate() + 2);

    const totalDays = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24)) + 1;
    const dayWidth = Math.min(40, Math.max(20, 600 / totalDays));

    let html = `<div style="overflow-x:auto;padding:8px 0;">`;
    html += `<div style="min-width:${Math.max(800, totalDays * dayWidth + 200)}px;">`;

    // Заголовок с датами
    html += `<div style="display:flex;border-bottom:2px solid var(--border-color);padding-bottom:4px;margin-bottom:4px;">`;
    html += `<div style="min-width:200px;font-weight:bold;color:var(--text-secondary);">Проект</div>`;
    for (let i = 0; i < totalDays; i++) {
        const d = new Date(minDate);
        d.setDate(d.getDate() + i);
        const day = d.getDate();
        const month = d.getMonth() + 1;
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
        html += `<div style="width:${dayWidth}px;text-align:center;font-size:11px;color:${isWeekend ? 'var(--text-muted)' : 'var(--text-secondary)'};">${day}.${month}</div>`;
    }
    html += `</div>`;

    // Строки проектов
    projects.forEach(p => {
        const statusColor = p.status === 'planned' ? '#8899aa' : (p.status === 'active' ? '#4a9a5a' : '#4a6a9a');
        const start = new Date(p.start_date);
        const end = new Date(p.end_date);
        const startOffset = Math.max(0, Math.round((start - minDate) / (1000 * 60 * 60 * 24)));
        const duration = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);
        const left = startOffset * dayWidth;
        const width = duration * dayWidth;

        html += `<div style="display:flex;align-items:center;margin:4px 0;padding:4px 0;border-bottom:1px solid var(--border-light);position:relative;">`;
        html += `<div style="min-width:200px;font-size:13px;color:var(--text-primary);">${esc(p.name)}</div>`;
        html += `<div style="position:relative;height:28px;flex:1;">`;
        html += `<div style="position:absolute;left:${left}px;width:${width}px;height:28px;background:${statusColor};border-radius:4px;opacity:0.8;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;font-weight:bold;transition:0.2s;" 
                    onclick="window.openProject('${p.id}')"
                    onmouseover="this.style.opacity='1'"
                    onmouseout="this.style.opacity='0.8'">${esc(p.name)}</div>`;
        html += `</div>`;
        html += `</div>`;
    });

    html += `</div></div>`;
    container.innerHTML = html;
}

// ============================================================
// ОБРАБОТЧИКИ ДЕЙСТВИЙ
// ============================================================

// Создание нового проекта
async function createNewProject() {
    const name = await showPrompt('Создание проекта', 'Введите название проекта:', '', 'Название...');
    if (!name || !name.trim()) return;

    const startDate = await showPrompt('Создание проекта', 'Дата начала (ГГГГ-ММ-ДД):', new Date().toISOString().split('T')[0]);
    if (!startDate) return;

    const endDate = await showPrompt('Создание проекта', 'Дата окончания (ГГГГ-ММ-ДД):', new Date().toISOString().split('T')[0]);
    if (!endDate) return;

    const statusOptions = ['planned', 'active', 'completed'];
    const statusLabels = ['Запланирован', 'Активен', 'Завершён'];
    const status = await showPrompt('Создание проекта', 'Статус (0-Запланирован, 1-Активен, 2-Завершён):', '0');
    const statusIndex = parseInt(status) || 0;

    const project = {
        id: Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        name: name.trim(),
        start_date: startDate,
        end_date: endDate,
        status: statusOptions[Math.min(statusIndex, 2)] || 'planned'
    };

    saveProject(project);
    showToast('Проект создан', 'success');
    renderMonitoringPage();
}

// Открыть проект (переход в режим создания списка с загрузкой данных проекта)
window.openProject = function(projectId) {
    const project = getProject(projectId);
    if (!project) {
        showToast('Проект не найден', 'error');
        return;
    }

    // Загружаем данные проекта в orderProject
    setOrderProject({
        id: project.id,
        name: project.name,
        start_date: project.start_date,
        end_date: project.end_date,
        status: project.status
    });

    // Загружаем позиции проекта в order
    const items = getProjectItems(projectId);
    // Очищаем текущий заказ
    for (let key in order) delete order[key];
    items.forEach(item => {
        order[item.equipment_path] = item.quantity;
    });

    saveOrderData();
    showToast(`Проект "${project.name}" загружен для редактирования`, 'success');

    // Переключаемся на страницу создания списка
    document.getElementById('btnCreateOrder')?.click();
    // Обновляем рендер
    renderOrderAll();
};

// Редактировать проект
window.editProject = async function(projectId) {
    const project = getProject(projectId);
    if (!project) {
        showToast('Проект не найден', 'error');
        return;
    }

    const name = await showPrompt('Редактирование проекта', 'Название:', project.name);
    if (!name || !name.trim()) return;

    const startDate = await showPrompt('Редактирование проекта', 'Дата начала:', project.start_date || '');
    if (!startDate) return;

    const endDate = await showPrompt('Редактирование проекта', 'Дата окончания:', project.end_date || '');
    if (!endDate) return;

    const statusOptions = ['planned', 'active', 'completed'];
    const currentIndex = statusOptions.indexOf(project.status);
    const status = await showPrompt('Редактирование проекта', 'Статус (0-Запланирован, 1-Активен, 2-Завершён):', String(currentIndex));
    const statusIndex = parseInt(status) || 0;

    const updated = {
        ...project,
        name: name.trim(),
        start_date: startDate,
        end_date: endDate,
        status: statusOptions[Math.min(statusIndex, 2)] || 'planned'
    };

    saveProject(updated);
    showToast('Проект обновлён', 'success');
    renderMonitoringPage();
};

// Удалить проект
window.deleteProjectHandler = async function(projectId) {
    const confirmed = await showConfirm('Удалить проект и все связанные позиции?');
    if (!confirmed) return;

    deleteProject(projectId);
    showToast('Проект удалён', 'neutral');
    renderMonitoringPage();
};

// ============================================================
// ИНИЦИАЛИЗАЦИЯ (вызывается из main.js)
// ============================================================
export function initMonitoring() {
    // Пустая функция для совместимости
}