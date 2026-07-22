// services/projects.js

/**
 * Сервис для управления проектами и их позициями.
 * @module services/projects
 */

import { getState, saveState } from '../core/store.js';
import { emit, EVENTS } from '../core/events.js';
import { generateId, deepClone, intervalsOverlap, isValidDate } from '../core/utils.js';
import { getStockByPath } from './stock.js';

// ============================================================
// ОПРЕДЕЛЕНИЕ ТИПОВ (JSDoc)
// ============================================================

/**
 * @typedef {Object} Project
 * @property {string} id - уникальный ID
 * @property {string} name - название проекта
 * @property {string} start_date - дата начала (YYYY-MM-DD)
 * @property {string} end_date - дата окончания (YYYY-MM-DD)
 * @property {string} status - статус: 'planned' | 'active' | 'completed'
 */

/**
 * @typedef {Object} ProjectItem
 * @property {string} id - уникальный ID
 * @property {string} project_id - ID проекта
 * @property {string} equipment_path - путь к позиции
 * @property {number} quantity - количество
 */

/**
 * @typedef {Object} AvailabilityResult
 * @property {number} available - доступное количество
 * @property {number} totalStock - всего на складе
 * @property {number} allocated - уже занято в других проектах
 * @property {Array<{project: string, quantity: number, projectId: string}>} conflicts - список конфликтующих проектов
 * @property {boolean} isConflict - true, если запрошенное количество превышает доступное
 */

// ============================================================
// ПОЛУЧЕНИЕ ДАННЫХ
// ============================================================

/**
 * Возвращает массив всех проектов.
 * @returns {Project[]} копия массива проектов
 */
export function getProjects() {
  return deepClone(getState().projects || []);
}

/**
 * Возвращает проект по ID.
 * @param {string} id - ID проекта
 * @returns {Project|null} проект или null
 */
export function getProject(id) {
  const state = getState();
  const found = state.projects.find(p => p.id === id);
  return found ? deepClone(found) : null;
}

/**
 * Возвращает все позиции проекта.
 * @param {string} projectId - ID проекта
 * @returns {ProjectItem[]} массив позиций (копия)
 */
export function getProjectItems(projectId) {
  const state = getState();
  return deepClone(state.projectItems.filter(item => item.project_id === projectId));
}

/**
 * Возвращает все позиции всех проектов.
 * @returns {ProjectItem[]} массив всех позиций (копия)
 */
export function getAllProjectItems() {
  return deepClone(getState().projectItems || []);
}

// ============================================================
// CRUD ПРОЕКТОВ
// ============================================================

/**
 * Создаёт новый проект.
 * @param {Omit<Project, 'id'>} projectData - данные проекта (без id)
 * @returns {Project} созданный проект
 * @throws {Error} если обязательные поля отсутствуют или даты некорректны
 */
export function createProject(projectData) {
  const state = getState();

  // Валидация
  if (!projectData.name || projectData.name.trim() === '') {
    throw new Error('Название проекта обязательно');
  }
  if (projectData.start_date && !isValidDate(projectData.start_date)) {
    throw new Error('Некорректная дата начала');
  }
  if (projectData.end_date && !isValidDate(projectData.end_date)) {
    throw new Error('Некорректная дата окончания');
  }

  const newProject = {
    id: generateId('proj'),
    name: projectData.name.trim(),
    start_date: projectData.start_date || '',
    end_date: projectData.end_date || '',
    status: projectData.status || 'planned',
  };

  if (!state.projects) state.projects = [];
  state.projects.push(newProject);

  saveState();
  emit(EVENTS.PROJECT_CHANGED, { action: 'create', project: newProject });
  return deepClone(newProject);
}

/**
 * Обновляет существующий проект.
 * @param {string} id - ID проекта
 * @param {Partial<Project>} newData - новые данные (частичные)
 * @returns {Project} обновлённый проект
 * @throws {Error} если проект не найден или данные некорректны
 */
export function updateProject(id, newData) {
  const state = getState();
  const idx = state.projects.findIndex(p => p.id === id);
  if (idx === -1) {
    throw new Error(`Проект с ID "${id}" не найден`);
  }

  const current = state.projects[idx];
  const updated = { ...current };

  if (newData.name !== undefined) {
    if (!newData.name || newData.name.trim() === '') {
      throw new Error('Название проекта обязательно');
    }
    updated.name = newData.name.trim();
  }
  if (newData.start_date !== undefined) {
    if (newData.start_date && !isValidDate(newData.start_date)) {
      throw new Error('Некорректная дата начала');
    }
    updated.start_date = newData.start_date || '';
  }
  if (newData.end_date !== undefined) {
    if (newData.end_date && !isValidDate(newData.end_date)) {
      throw new Error('Некорректная дата окончания');
    }
    updated.end_date = newData.end_date || '';
  }
  if (newData.status !== undefined) {
    const validStatuses = ['planned', 'active', 'completed'];
    if (!validStatuses.includes(newData.status)) {
      throw new Error(`Статус должен быть одним из: ${validStatuses.join(', ')}`);
    }
    updated.status = newData.status;
  }

  state.projects[idx] = updated;
  saveState();
  emit(EVENTS.PROJECT_CHANGED, { action: 'update', project: updated });
  return deepClone(updated);
}

/**
 * Удаляет проект и все его позиции.
 * @param {string} id - ID проекта
 * @returns {boolean} успех операции
 * @throws {Error} если проект не найден
 */
export function deleteProject(id) {
  const state = getState();
  const idx = state.projects.findIndex(p => p.id === id);
  if (idx === -1) {
    throw new Error(`Проект с ID "${id}" не найден`);
  }

  state.projects.splice(idx, 1);
  // Удаляем все позиции проекта
  state.projectItems = state.projectItems.filter(item => item.project_id !== id);

  saveState();
  emit(EVENTS.PROJECT_CHANGED, { action: 'delete', projectId: id });
  return true;
}

// ============================================================
// РАБОТА С ПОЗИЦИЯМИ ПРОЕКТА
// ============================================================

/**
 * Добавляет или обновляет позицию в проекте.
 * @param {string} projectId - ID проекта
 * @param {string} equipmentPath - путь к позиции
 * @param {number} quantity - количество
 * @returns {ProjectItem} добавленная/обновлённая позиция
 * @throws {Error} если проект не найден или количество некорректно
 */
export function addProjectItem(projectId, equipmentPath, quantity) {
  const state = getState();

  const project = state.projects.find(p => p.id === projectId);
  if (!project) {
    throw new Error(`Проект с ID "${projectId}" не найден`);
  }

  const qty = Math.max(0, parseInt(quantity, 10) || 0);
  if (qty === 0) {
    // Если количество 0 — удаляем позицию
    state.projectItems = state.projectItems.filter(
      item => !(item.project_id === projectId && item.equipment_path === equipmentPath)
    );
    saveState();
    emit(EVENTS.PROJECT_CHANGED, { action: 'removeItem', projectId, equipmentPath });
    return null;
  }

  // Проверяем, есть ли уже такая позиция
  const existingIdx = state.projectItems.findIndex(
    item => item.project_id === projectId && item.equipment_path === equipmentPath
  );
  let item;
  if (existingIdx !== -1) {
    state.projectItems[existingIdx].quantity = qty;
    item = state.projectItems[existingIdx];
  } else {
    item = {
      id: generateId('pitem'),
      project_id: projectId,
      equipment_path: equipmentPath,
      quantity: qty,
    };
    state.projectItems.push(item);
  }

  saveState();
  emit(EVENTS.PROJECT_CHANGED, { action: 'addItem', projectId, equipmentPath, quantity: qty });
  return deepClone(item);
}

/**
 * Удаляет позицию из проекта.
 * @param {string} projectId - ID проекта
 * @param {string} equipmentPath - путь к позиции
 * @returns {boolean} успех операции
 */
export function removeProjectItem(projectId, equipmentPath) {
  const state = getState();
  const initialLength = state.projectItems.length;
  state.projectItems = state.projectItems.filter(
    item => !(item.project_id === projectId && item.equipment_path === equipmentPath)
  );
  if (state.projectItems.length === initialLength) return false;
  saveState();
  emit(EVENTS.PROJECT_CHANGED, { action: 'removeItem', projectId, equipmentPath });
  return true;
}

/**
 * Очищает все позиции проекта.
 * @param {string} projectId - ID проекта
 * @returns {boolean} успех операции
 */
export function clearProjectItems(projectId) {
  const state = getState();
  state.projectItems = state.projectItems.filter(item => item.project_id !== projectId);
  saveState();
  emit(EVENTS.PROJECT_CHANGED, { action: 'clearItems', projectId });
  return true;
}

// ============================================================
// ПРОВЕРКА ДОСТУПНОСТИ (С КОНФЛИКТАМИ)
// ============================================================

/**
 * Проверяет доступность позиции для проекта с учётом пересечений.
 * @param {string} equipmentPath - путь к позиции
 * @param {string} startDate - дата начала проекта (YYYY-MM-DD)
 * @param {string} endDate - дата окончания проекта (YYYY-MM-DD)
 * @param {number} requestedQty - запрошенное количество
 * @param {string|null} currentProjectId - ID текущего проекта (исключается из конфликтов)
 * @returns {AvailabilityResult} результат проверки
 */
export function getAvailableQuantity(
  equipmentPath,
  startDate,
  endDate,
  requestedQty,
  currentProjectId = null
) {
  const totalStock = getStockByPath(equipmentPath);

  // Если даты не заданы — считаем, что всё доступно
  if (!startDate || !endDate || !isValidDate(startDate) || !isValidDate(endDate)) {
    return {
      available: requestedQty,
      totalStock,
      allocated: 0,
      conflicts: [],
      isConflict: requestedQty > totalStock,
    };
  }

  const projects = getProjects();
  const allItems = getAllProjectItems();

  // Находим проекты, пересекающиеся по времени
  const overlappingProjects = projects.filter(p => {
    if (p.id === currentProjectId) return false;
    if (p.status === 'completed') return false;
    if (!p.start_date || !p.end_date) return false;
    if (!isValidDate(p.start_date) || !isValidDate(p.end_date)) return false;
    return intervalsOverlap(startDate, endDate, p.start_date, p.end_date);
  });

  // Собираем конфликты
  const conflicts = [];
  let allocated = 0;

  for (const p of overlappingProjects) {
    const items = allItems.filter(
      item => item.project_id === p.id && item.equipment_path === equipmentPath
    );
    const totalInProject = items.reduce((sum, item) => sum + item.quantity, 0);
    if (totalInProject > 0) {
      allocated += totalInProject;
      conflicts.push({
        project: p.name,
        projectId: p.id,
        quantity: totalInProject,
      });
    }
  }

  const available = Math.max(0, totalStock - allocated);
  const isConflict = requestedQty > available;

  return {
    available,
    totalStock,
    allocated,
    conflicts,
    isConflict,
  };
}

/**
 * Проверяет все позиции проекта на конфликты.
 * @param {string} projectId - ID проекта
 * @returns {Array<{path: string, quantity: number, available: number, conflicts: Array}>}
 */
export function checkAllProjectConflicts(projectId) {
  const project = getProject(projectId);
  if (!project) return [];
  if (!project.start_date || !project.end_date) return [];

  const items = getProjectItems(projectId);
  const results = [];

  for (const item of items) {
    const result = getAvailableQuantity(
      item.equipment_path,
      project.start_date,
      project.end_date,
      item.quantity,
      projectId
    );
    if (result.isConflict) {
      results.push({
        path: item.equipment_path,
        quantity: item.quantity,
        available: result.available,
        conflicts: result.conflicts,
      });
    }
  }

  return results;
}

// ============================================================
// ЭКСПОРТ ПО УМОЛЧАНИЮ
// ============================================================

export default {
  getProjects,
  getProject,
  getProjectItems,
  getAllProjectItems,
  createProject,
  updateProject,
  deleteProject,
  addProjectItem,
  removeProjectItem,
  clearProjectItems,
  getAvailableQuantity,
  checkAllProjectConflicts,
};