// ui/components/order/OrderProjects.js

import { getState } from '../../../core/store.js';
import { esc } from '../../../core/utils.js';
import { showToast } from '../../toast.js';
import { getProjects, getProject, createProject, updateProject } from '../../../services/projects.js';
import { getOrderProject, setOrderProject } from '../../../services/order.js';

/**
 * Заполняет select проектов.
 */
export function populateProjectSelect() {
  const select = document.getElementById('pProjectSelect');
  if (!select) return;
  const projects = getProjects();
  const currentProject = getOrderProject();
  select.innerHTML = '<option value="">— Выберите проект —</option>';
  projects.forEach(p => {
    const selected = (p.id === currentProject.id) ? 'selected' : '';
    select.innerHTML += `<option value="${p.id}" ${selected}>${esc(p.name)} (${p.start_date || '—'} – ${p.end_date || '—'})</option>`;
  });
}

/**
 * Загружает данные текущего проекта в поля формы.
 */
export function loadProjectData() {
  const project = getOrderProject();
  const nameInput = document.getElementById('pProjectName');
  const startInput = document.getElementById('pStartDate');
  const endInput = document.getElementById('pEndDate');
  const statusSelect = document.getElementById('pProjectStatus');
  if (nameInput) nameInput.value = project.name || '';
  if (startInput) startInput.value = project.start_date || '';
  if (endInput) endInput.value = project.end_date || '';
  if (statusSelect) statusSelect.value = project.status || 'planned';
}

/**
 * Обрабатывает выбор проекта из списка.
 */
export function onProjectSelectChange() {
  const select = document.getElementById('pProjectSelect');
  const projectId = select?.value;
  if (!projectId) {
    setOrderProject({ id: null, name: '', start_date: '', end_date: '', status: 'planned' });
    loadProjectData();
    return;
  }
  const project = getProject(projectId);
  if (project) {
    setOrderProject(project);
    loadProjectData();
    showToast(`Проект "${project.name}" загружен`, 'success');
  }
}

/**
 * Обрабатывает изменение полей проекта (создание или обновление).
 */
export function onProjectFieldsChange() {
  const name = document.getElementById('pProjectName')?.value?.trim() || '';
  const start = document.getElementById('pStartDate')?.value || '';
  const end = document.getElementById('pEndDate')?.value || '';
  const status = document.getElementById('pProjectStatus')?.value || 'planned';

  if (!name) {
    setOrderProject({ id: null, name: '', start_date: start, end_date: end, status });
    return;
  }

  const state = getState();
  const currentId = state.orderProject?.id || null;
  if (currentId) {
    const existing = getProject(currentId);
    if (existing) {
      updateProject(currentId, { name, start_date: start, end_date: end, status });
    } else {
      const newProject = createProject({ name, start_date: start, end_date: end, status });
      setOrderProject(newProject);
    }
  } else {
    const newProject = createProject({ name, start_date: start, end_date: end, status });
    setOrderProject(newProject);
  }
  populateProjectSelect();
}