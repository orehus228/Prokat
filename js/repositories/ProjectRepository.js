// repositories/ProjectRepository.js
import { getState, saveState } from '../core/state.js';

/**
 * Репозиторий для работы с проектами:
 * - projects (список проектов)
 * - projectItems (позиции проектов)
 */
class ProjectRepository {
  // ---- Projects ----
  getProjects() {
    return getState().projects || [];
  }

  getProject(id) {
    return this.getProjects().find(p => p.id === id);
  }

  saveProject(project) {
    const state = getState();
    const projects = state.projects || [];
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

  deleteProject(id) {
    const state = getState();
    state.projects = state.projects.filter(p => p.id !== id);
    state.projectItems = state.projectItems.filter(item => item.project_id !== id);
    saveState();
  }

  // ---- Project Items ----
  getProjectItems(projectId) {
    const state = getState();
    return state.projectItems.filter(item => item.project_id === projectId);
  }

  getAllProjectItems() {
    return getState().projectItems || [];
  }

  getProjectItemInstances(projectId, path) {
    const items = this.getProjectItems(projectId);
    const item = items.find(i => i.equipment_path === path);
    return item?.instanceIds || [];
  }

  addProjectItem(projectId, equipmentPath, quantity, options = {}) {
    const state = getState();
    const existingIndex = state.projectItems.findIndex(
      item => item.project_id === projectId && item.equipment_path === equipmentPath
    );

    // Если количество 0 или меньше, удаляем
    if (quantity <= 0) {
      if (existingIndex !== -1) {
        state.projectItems.splice(existingIndex, 1);
        saveState();
        return { success: true, reservedInstances: [] };
      }
      return { success: true, reservedInstances: [] };
    }

    const newItem = {
      id: existingIndex !== -1 ? state.projectItems[existingIndex].id : Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      project_id: projectId,
      equipment_path: equipmentPath,
      quantity: quantity,
      instanceIds: options.instanceIds || [],
      subrentInfo: options.subrentInfo || null,
    };

    if (existingIndex !== -1) {
      state.projectItems[existingIndex] = newItem;
    } else {
      state.projectItems.push(newItem);
    }
    saveState();
    return { success: true, reservedInstances: [] };
  }

  removeProjectItem(id) {
    const state = getState();
    const index = state.projectItems.findIndex(item => item.id === id);
    if (index === -1) return false;
    state.projectItems.splice(index, 1);
    saveState();
    return true;
  }

  clearProjectItems(projectId) {
    const state = getState();
    state.projectItems = state.projectItems.filter(item => item.project_id !== projectId);
    saveState();
  }

  // ---- Получение всех экземпляров проекта ----
  getProjectInstances(projectId) {
    const items = this.getProjectItems(projectId);
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
}

export const projectRepo = new ProjectRepository();
export default projectRepo;