// services/project-data.js
import { getState, setStateKey, saveState } from '../core/state.js';
import { getStockValue } from '../data/editor-data.js'; // будет создан позже

// ============================================================
// ГЕТТЕРЫ
// ============================================================

export function getProjects() {
  return getState().projects || [];
}

export function getProject(id) {
  return getProjects().find(p => p.id === id);
}

export function getProjectItems(projectId) {
  const state = getState();
  return state.projectItems.filter(item => item.project_id === projectId);
}

export function getAllProjectItems() {
  return getState().projectItems || [];
}

// ============================================================
// СОЗДАНИЕ / ОБНОВЛЕНИЕ / УДАЛЕНИЕ ПРОЕКТОВ
// ============================================================

export function saveProject(project) {
  const state = getState();
  const projects = state.projects;
  const index = projects.findIndex(p => p.id === project.id);
  if (index !== -1) {
    projects[index] = { ...projects[index], ...project };
  } else {
    project.id = project.id || Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    projects.push(project);
  }
  saveState();
  return project;
}

export function deleteProject(id) {
  const state = getState();
  state.projects = state.projects.filter(p => p.id !== id);
  state.projectItems = state.projectItems.filter(item => item.project_id !== id);
  saveState();
}

// ============================================================
// РАБОТА С ПОЗИЦИЯМИ ПРОЕКТА
// ============================================================

export function addProjectItem(projectId, equipmentPath, quantity) {
  const state = getState();
  const items = state.projectItems;
  const existing = items.find(item => item.project_id === projectId && item.equipment_path === equipmentPath);
  if (existing) {
    existing.quantity = quantity;
  } else {
    items.push({
      id: Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      project_id: projectId,
      equipment_path: equipmentPath,
      quantity,
    });
  }
  saveState();
}

export function removeProjectItem(id) {
  const state = getState();
  state.projectItems = state.projectItems.filter(item => item.id !== id);
  saveState();
}

export function clearProjectItems(projectId) {
  const state = getState();
  state.projectItems = state.projectItems.filter(item => item.project_id !== projectId);
  saveState();
}

// ============================================================
// ПРОВЕРКА ДОСТУПНОСТИ (С КОНФЛИКТАМИ)
// ============================================================

export function getAvailableQuantity(equipmentPath, startDate, endDate, requestedQty, currentProjectId = null) {
  if (!startDate || !endDate) {
    const totalStock = getStockValue(equipmentPath);
    return { available: requestedQty, conflicts: [], allocated: 0, totalStock };
  }

  const projects = getProjects();
  const allItems = getAllProjectItems();
  const totalStock = getStockValue(equipmentPath);
  const nStart = new Date(startDate).getTime();
  const nEnd = new Date(endDate).getTime();

  const overlapping = projects.filter(p => {
    if (p.id === currentProjectId) return false;
    if (p.status === 'completed') return false;
    const pStart = new Date(p.start_date).getTime();
    const pEnd = new Date(p.end_date).getTime();
    return (pStart <= nEnd && pEnd >= nStart);
  });

  const overlapIds = overlapping.map(p => p.id);
  let allocated = 0;
  const conflicts = [];
  overlapping.forEach(p => {
    const items = allItems.filter(item => item.project_id === p.id && item.equipment_path === equipmentPath);
    const totalInProject = items.reduce((sum, item) => sum + item.quantity, 0);
    if (totalInProject > 0) {
      allocated += totalInProject;
      conflicts.push({ project: p.name, quantity: totalInProject, projectId: p.id });
    }
  });

  const available = totalStock - allocated;
  return {
    available: Math.max(0, available),
    conflicts,
    totalStock,
    allocated,
    isConflict: requestedQty > available,
  };
}

// ============================================================
// ЭКСПОРТ ПО УМОЛЧАНИЮ
// ============================================================
export default {
  getProjects,
  getProject,
  getProjectItems,
  getAllProjectItems,
  saveProject,
  deleteProject,
  addProjectItem,
  removeProjectItem,
  clearProjectItems,
  getAvailableQuantity,
};