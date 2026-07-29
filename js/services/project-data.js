// services/project-data.js
import { getState, setStateKey, saveState } from '../core/state.js';
import { getStockValue } from '../data/editor-data.js';
import {
  reserveInstances,
  releaseInstances,
  getAvailableInstances,
  getInstancesByPath,
  updateInstanceStatus,
  getInstanceStats,
} from './instance-service.js';
import { INSTANCE_STATUSES } from '../core/config.js';

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

/**
 * Возвращает список instanceId для позиции в проекте.
 * @param {string} projectId
 * @param {string} path
 * @returns {string[]}
 */
export function getProjectItemInstances(projectId, path) {
  const items = getProjectItems(projectId);
  const item = items.find(i => i.equipment_path === path);
  return item?.instanceIds || [];
}

/**
 * Проверяет, используется ли экземпляр в каком-либо проекте (кроме указанного).
 * @param {string} instanceId
 * @param {string} excludeProjectId
 * @returns {boolean}
 */
export function isInstanceUsedInOtherProject(instanceId, excludeProjectId = null) {
  const state = getState();
  const instance = state.instances[instanceId];
  if (!instance) return false;
  if (instance.status !== INSTANCE_STATUSES.RESERVED && instance.status !== INSTANCE_STATUSES.ISSUED) {
    return false;
  }
  if (instance.currentProjectId && instance.currentProjectId !== excludeProjectId) {
    return true;
  }
  return false;
}

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ ДАТ
// ============================================================

/**
 * Преобразует дату в UTC timestamp для корректного сравнения.
 * @param {string} dateStr - дата в формате YYYY-MM-DD
 * @returns {number} timestamp в миллисекундах
 */
function toUTCTimestamp(dateStr) {
  if (!dateStr) return 0;
  const parts = dateStr.split('-').map(Number);
  return Date.UTC(parts[0], parts[1] - 1, parts[2]);
}

/**
 * Проверяет пересечение двух периодов (включительно).
 * @param {number} start1 - UTC timestamp начала первого периода
 * @param {number} end1 - UTC timestamp окончания первого периода
 * @param {number} start2 - UTC timestamp начала второго периода
 * @param {number} end2 - UTC timestamp окончания второго периода
 * @returns {boolean} true если периоды пересекаются
 */
function periodsOverlap(start1, end1, start2, end2) {
  return start1 <= end2 && end1 >= start2;
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
  // Освобождаем все экземпляры, привязанные к этому проекту
  const items = getProjectItems(id);
  for (let item of items) {
    if (item.instanceIds && item.instanceIds.length > 0) {
      releaseInstances(item.instanceIds, id, `Удаление проекта ${id}`);
    }
  }
  state.projects = state.projects.filter(p => p.id !== id);
  state.projectItems = state.projectItems.filter(item => item.project_id !== id);
  saveState();
}

// ============================================================
// РАБОТА С ПОЗИЦИЯМИ ПРОЕКТА
// ============================================================

/**
 * Добавляет или обновляет позицию в проекте с учётом экземпляров.
 * @param {string|null} projectId - id проекта (null для освобождения всех экземпляров)
 * @param {string} equipmentPath - путь позиции
 * @param {number} quantity - запрашиваемое количество (может быть 0 для удаления)
 * @param {object} options - { subrentInfo: { isSubrent, counterparty }, instanceIds: [] } (опционально)
 * @returns {object} { success: boolean, error: string, reservedInstances: object[] }
 */
export function addProjectItem(projectId, equipmentPath, quantity, options = {}) {
  const state = getState();

  // ОСОБЫЙ СЛУЧАЙ: освобождение всех экземпляров для пути (отвязка проекта)
  if (projectId === null && quantity === 0) {
    // Находим все записи с этим путём в любом проекте
    const allItems = state.projectItems.filter(item => item.equipment_path === equipmentPath);
    let releasedCount = 0;
    for (let item of allItems) {
      if (item.instanceIds && item.instanceIds.length > 0) {
        const result = releaseInstances(item.instanceIds, item.project_id, `Освобождение при отвязке проекта`);
        releasedCount += result.released;
      }
      // Удаляем запись
      const idx = state.projectItems.indexOf(item);
      if (idx !== -1) state.projectItems.splice(idx, 1);
    }
    saveState();
    return { success: true, reservedInstances: [] };
  }

  // Если projectId не указан, но quantity > 0 — ошибка
  if (!projectId) {
    return { success: false, error: 'Не указан проект', reservedInstances: [] };
  }

  const existingIndex = state.projectItems.findIndex(
    item => item.project_id === projectId && item.equipment_path === equipmentPath
  );

  // Если количество 0 или меньше, удаляем позицию
  if (quantity <= 0) {
    if (existingIndex !== -1) {
      const item = state.projectItems[existingIndex];
      // Освобождаем экземпляры
      if (item.instanceIds && item.instanceIds.length > 0) {
        releaseInstances(item.instanceIds, projectId, `Удаление позиции ${equipmentPath} из проекта`);
      }
      state.projectItems.splice(existingIndex, 1);
      saveState();
      return { success: true, reservedInstances: [] };
    }
    return { success: true, reservedInstances: [] };
  }

  // Проверяем, есть ли экземпляры для этого пути
  const instances = getInstancesByPath(equipmentPath);
  let reserved = [];
  let instanceIds = options.instanceIds || [];

  // Если есть экземпляры, используем резервирование
  if (instances.length > 0) {
    // Получаем проект для дат
    const project = getProject(projectId);
    if (!project) {
      return { success: false, error: 'Проект не найден', reservedInstances: [] };
    }
    if (!project.start_date || !project.end_date) {
      return { success: false, error: 'У проекта не заданы даты', reservedInstances: [] };
    }

    // Проверяем, не превышает ли запрошенное количество доступных экземпляров
    const available = getAvailableInstances(equipmentPath, project.start_date, project.end_date, projectId);
    if (available.length < quantity) {
      return {
        success: false,
        error: `Недостаточно доступных экземпляров для "${equipmentPath}" (доступно: ${available.length}, требуется: ${quantity})`,
        reservedInstances: [],
      };
    }

    // Освобождаем старые экземпляры, если обновляем
    if (existingIndex !== -1) {
      const oldItem = state.projectItems[existingIndex];
      if (oldItem.instanceIds && oldItem.instanceIds.length > 0) {
        releaseInstances(oldItem.instanceIds, projectId, `Обновление позиции ${equipmentPath}`);
      }
    }

    // Резервируем новые
    const subrentInfo = options.subrentInfo || null;
    const result = reserveInstances(
      equipmentPath,
      quantity,
      projectId,
      project.start_date,
      project.end_date,
      subrentInfo
    );
    if (!result.success) {
      return result;
    }
    reserved = result.reservedInstances;
    instanceIds = reserved.map(inst => inst.id);
  } else {
    // Если экземпляров нет, используем старую логику (только количество)
    // Проверяем остаток на складе
    const stock = getStockValue(equipmentPath);
    // Получаем уже занятое количество в других проектах
    const otherProjects = getProjects().filter(p => p.id !== projectId);
    let usedInOther = 0;
    for (let p of otherProjects) {
      const items = getProjectItems(p.id);
      const item = items.find(i => i.equipment_path === equipmentPath);
      if (item) usedInOther += item.quantity;
    }
    const available = stock - usedInOther;
    if (quantity > available) {
      return {
        success: false,
        error: `Недостаточно доступного количества для "${equipmentPath}" (доступно: ${available}, требуется: ${quantity})`,
        reservedInstances: [],
      };
    }
  }

  // Сохраняем или обновляем позицию
  const newItem = {
    id: existingIndex !== -1 ? state.projectItems[existingIndex].id : Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    project_id: projectId,
    equipment_path: equipmentPath,
    quantity: quantity,
    instanceIds: instanceIds,
    subrentInfo: options.subrentInfo || null,
  };

  if (existingIndex !== -1) {
    state.projectItems[existingIndex] = newItem;
  } else {
    state.projectItems.push(newItem);
  }

  saveState();
  return { success: true, reservedInstances: reserved };
}

/**
 * Удаляет позицию из проекта (освобождает экземпляры).
 * @param {string} id - id записи projectItems
 * @returns {boolean}
 */
export function removeProjectItem(id) {
  const state = getState();
  const index = state.projectItems.findIndex(item => item.id === id);
  if (index === -1) return false;
  const item = state.projectItems[index];
  if (item.instanceIds && item.instanceIds.length > 0) {
    releaseInstances(item.instanceIds, item.project_id, `Удаление позиции ${item.equipment_path}`);
  }
  state.projectItems.splice(index, 1);
  saveState();
  return true;
}

/**
 * Очищает все позиции проекта (освобождает все экземпляры).
 * @param {string} projectId
 */
export function clearProjectItems(projectId) {
  const state = getState();
  const items = getProjectItems(projectId);
  for (let item of items) {
    if (item.instanceIds && item.instanceIds.length > 0) {
      releaseInstances(item.instanceIds, projectId, `Очистка проекта ${projectId}`);
    }
  }
  state.projectItems = state.projectItems.filter(item => item.project_id !== projectId);
  saveState();
}

// ============================================================
// ПРОВЕРКА ДОСТУПНОСТИ (С КОНФЛИКТАМИ)
// ============================================================

/**
 * Проверяет доступность позиции на указанный период с учётом экземпляров.
 * @param {string} equipmentPath
 * @param {string} startDate
 * @param {string} endDate
 * @param {number} requestedQty
 * @param {string|null} currentProjectId
 * @returns {object} { available, conflicts, totalStock, allocated, isConflict, instanceDetails }
 */
export function getAvailableQuantity(equipmentPath, startDate, endDate, requestedQty, currentProjectId = null) {
  if (!startDate || !endDate) {
    const totalStock = getStockValue(equipmentPath);
    return {
      available: requestedQty,
      conflicts: [],
      allocated: 0,
      totalStock,
      isConflict: requestedQty > totalStock,
      instanceDetails: null,
    };
  }

  const start = toUTCTimestamp(startDate);
  const end = toUTCTimestamp(endDate);

  // Проверяем, есть ли экземпляры для этого пути
  const instances = getInstancesByPath(equipmentPath);
  if (instances.length > 0) {
    // Используем экземплярный учёт
    const availableInstances = getAvailableInstances(equipmentPath, startDate, endDate, currentProjectId);
    const totalStock = getStockValue(equipmentPath);
    const allocated = instances.length - availableInstances.length;

    // Собираем конфликты (проекты, которые занимают экземпляры)
    const conflictMap = new Map();
    for (let inst of instances) {
      if (inst.currentProjectId && inst.currentProjectId !== currentProjectId) {
        const project = getProject(inst.currentProjectId);
        if (project) {
          if (!conflictMap.has(project.id)) {
            conflictMap.set(project.id, { project: project.name, quantity: 0 });
          }
          conflictMap.get(project.id).quantity += 1;
        }
      }
    }
    const conflicts = Array.from(conflictMap.values());

    const available = availableInstances.length;
    return {
      available: available,
      conflicts: conflicts,
      allocated: allocated,
      totalStock: totalStock,
      isConflict: requestedQty > available,
      instanceDetails: {
        total: instances.length,
        stock: instances.filter(i => i.status === INSTANCE_STATUSES.STOCK).length,
        reserved: instances.filter(i => i.status === INSTANCE_STATUSES.RESERVED).length,
        issued: instances.filter(i => i.status === INSTANCE_STATUSES.ISSUED).length,
        repair: instances.filter(i => i.status === INSTANCE_STATUSES.REPAIR).length,
        writtenOff: instances.filter(i => i.status === INSTANCE_STATUSES.WRITTEN_OFF).length,
      },
    };
  } else {
    // Старая логика (без серийников)
    const projects = getProjects();
    const allItems = getAllProjectItems();
    const totalStock = getStockValue(equipmentPath);

    const overlapping = projects.filter(p => {
      if (p.id === currentProjectId) return false;
      if (p.status === 'completed') return false;
      if (!p.start_date || !p.end_date) return false;
      const pStart = toUTCTimestamp(p.start_date);
      const pEnd = toUTCTimestamp(p.end_date);
      return periodsOverlap(start, end, pStart, pEnd);
    });

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
      instanceDetails: null,
    };
  }
}

/**
 * Возвращает все экземпляры, задействованные в проекте.
 * @param {string} projectId
 * @returns {object[]}
 */
export function getProjectInstances(projectId) {
  const items = getProjectItems(projectId);
  const state = getState();
  const result = [];
  for (let item of items) {
    if (item.instanceIds) {
      for (let id of item.instanceIds) {
        if (state.instances[id]) {
          result.push(state.instances[id]);
        }
      }
    }
  }
  return result;
}

// ============================================================
// ЭКСПОРТ ПО УМОЛЧАНИЮ
// ============================================================
export default {
  getProjects,
  getProject,
  getProjectItems,
  getAllProjectItems,
  getProjectItemInstances,
  isInstanceUsedInOtherProject,
  saveProject,
  deleteProject,
  addProjectItem,
  removeProjectItem,
  clearProjectItems,
  getAvailableQuantity,
  getProjectInstances,
};