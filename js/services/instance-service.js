// services/instance-service.js
import { getState, saveState, rebuildInstancesIndex } from '../core/state.js';
import { INSTANCE_STATUSES, INSTANCE_STATUS_LABELS } from '../core/config.js';
import { getStockValue } from '../data/editor-data.js';

/**
 * Создаёт новый экземпляр оборудования.
 * @param {string} path - путь позиции (категория|подгруппа|имя)
 * @param {string} serialNumber - серийный номер (может быть пустой строкой)
 * @param {string} initialStatus - начальный статус (по умолчанию 'stock')
 * @param {object} subrentInfo - информация о субаренде { isSubrent: boolean, counterparty: string }
 * @returns {object} созданный экземпляр
 */
export function createInstance(path, serialNumber = '', initialStatus = INSTANCE_STATUSES.STOCK, subrentInfo = { isSubrent: false, counterparty: '' }) {
  const state = getState();
  const id = 'inst_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  
  const instance = {
    id,
    path,
    serialNumber: serialNumber.trim(),
    status: initialStatus,
    currentProjectId: null,
    subrentInfo: { ...subrentInfo },
    history: [
      {
        timestamp: new Date().toISOString(),
        status: initialStatus,
        projectId: null,
        comment: 'Создание экземпляра'
      }
    ]
  };
  
  state.instances[id] = instance;
  if (!state.instancesByPath[path]) {
    state.instancesByPath[path] = [];
  }
  state.instancesByPath[path].push(id);
  
  saveState();
  return instance;
}

/**
 * Возвращает экземпляр по id.
 * @param {string} id
 * @returns {object|null}
 */
export function getInstance(id) {
  const state = getState();
  return state.instances[id] || null;
}

/**
 * Возвращает все экземпляры для указанного пути.
 * @param {string} path
 * @returns {object[]}
 */
export function getInstancesByPath(path) {
  const state = getState();
  const ids = state.instancesByPath[path] || [];
  return ids.map(id => state.instances[id]).filter(Boolean);
}

/**
 * Возвращает все экземпляры для указанного статуса.
 * @param {string} status
 * @returns {object[]}
 */
export function getInstancesByStatus(status) {
  const state = getState();
  const result = [];
  for (let id in state.instances) {
    if (state.instances[id].status === status) {
      result.push(state.instances[id]);
    }
  }
  return result;
}

/**
 * Возвращает все экземпляры, привязанные к проекту.
 * @param {string} projectId
 * @returns {object[]}
 */
export function getInstancesForProject(projectId) {
  const state = getState();
  const result = [];
  for (let id in state.instances) {
    if (state.instances[id].currentProjectId === projectId) {
      result.push(state.instances[id]);
    }
  }
  return result;
}

/**
 * Обновляет статус экземпляра с записью в историю.
 * @param {string} instanceId
 * @param {string} newStatus - один из INSTANCE_STATUSES
 * @param {string|null} projectId - id проекта (если применимо)
 * @param {string} comment - комментарий к изменению
 * @returns {boolean} успешно ли обновлено
 */
export function updateInstanceStatus(instanceId, newStatus, projectId = null, comment = '') {
  const state = getState();
  const instance = state.instances[instanceId];
  if (!instance) {
    console.warn('Экземпляр не найден:', instanceId);
    return false;
  }
  
  const oldStatus = instance.status;
  if (oldStatus === newStatus) {
    return true;
  }
  
  if (oldStatus === INSTANCE_STATUSES.WRITTEN_OFF) {
    console.warn('Нельзя изменить статус списанного экземпляра');
    return false;
  }
  
  instance.status = newStatus;
  instance.currentProjectId = projectId;
  
  instance.history.push({
    timestamp: new Date().toISOString(),
    status: newStatus,
    projectId: projectId,
    comment: comment || `Изменение статуса: ${INSTANCE_STATUS_LABELS[oldStatus] || oldStatus} → ${INSTANCE_STATUS_LABELS[newStatus] || newStatus}`
  });
  
  saveState();
  // Обновляем индекс, чтобы getInstancesByPath сразу видел изменения
  rebuildInstancesIndex();
  
  return true;
}

/**
 * Добавляет произвольную запись в историю экземпляра.
 * @param {string} instanceId
 * @param {string} status
 * @param {string|null} projectId
 * @param {string} comment
 */
export function addHistoryEntry(instanceId, status, projectId = null, comment = '') {
  const state = getState();
  const instance = state.instances[instanceId];
  if (!instance) return;
  
  instance.history.push({
    timestamp: new Date().toISOString(),
    status,
    projectId,
    comment
  });
  saveState();
}

/**
 * Возвращает доступные экземпляры для позиции на указанный период.
 * @param {string} path
 * @param {string} startDate - дата начала (YYYY-MM-DD)
 * @param {string} endDate - дата окончания (YYYY-MM-DD)
 * @param {string|null} excludeProjectId - id проекта, который исключается из проверки (текущий)
 * @returns {object[]} массив доступных экземпляров
 */
export function getAvailableInstances(path, startDate, endDate, excludeProjectId = null) {
  const instances = getInstancesByPath(path);
  if (instances.length === 0) {
    return [];
  }
  
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  
  const available = instances.filter(instance => {
    if (instance.status === INSTANCE_STATUSES.STOCK) {
      return true;
    }
    
    if (instance.currentProjectId && instance.currentProjectId !== excludeProjectId) {
      const project = getState().projects.find(p => p.id === instance.currentProjectId);
      if (project) {
        const pStart = new Date(project.start_date).getTime();
        const pEnd = new Date(project.end_date).getTime();
        if (pStart <= end && pEnd >= start) {
          return false;
        }
      }
    }
    
    if (instance.status === INSTANCE_STATUSES.REPAIR || instance.status === INSTANCE_STATUSES.WRITTEN_OFF) {
      return false;
    }
    
    return true;
  });
  
  return available;
}

/**
 * Резервирует указанное количество экземпляров для проекта.
 * @param {string} path
 * @param {number} quantity - количество для резервирования
 * @param {string} projectId
 * @param {string} startDate
 * @param {string} endDate
 * @param {object} subrentInfo - информация о субаренде (опционально)
 * @returns {object} { success: boolean, reservedInstances: object[], error: string }
 */
export function reserveInstances(path, quantity, projectId, startDate, endDate, subrentInfo = null) {
  if (quantity <= 0) {
    return { success: true, reservedInstances: [] };
  }
  
  const instances = getAvailableInstances(path, startDate, endDate, projectId);
  
  if (instances.length === 0) {
    const stock = getStockValue(path);
    if (stock > 0) {
      return {
        success: false,
        reservedInstances: [],
        error: `Нет доступных экземпляров для "${path}". Создайте их в редакторе склада.`
      };
    }
    return {
      success: false,
      reservedInstances: [],
      error: `Недостаточно доступных экземпляров для "${path}" (доступно: 0)`
    };
  }
  
  const toReserve = instances.slice(0, quantity);
  if (toReserve.length < quantity) {
    return {
      success: false,
      reservedInstances: [],
      error: `Недостаточно доступных экземпляров для "${path}" (доступно: ${toReserve.length}, требуется: ${quantity})`
    };
  }
  
  const reserved = [];
  for (let instance of toReserve) {
    if (subrentInfo) {
      instance.subrentInfo = { ...instance.subrentInfo, ...subrentInfo };
    }
    const updated = updateInstanceStatus(instance.id, INSTANCE_STATUSES.RESERVED, projectId, `Зарезервировано для проекта ${projectId}`);
    if (updated) {
      reserved.push(instance);
    } else {
      for (let r of reserved) {
        updateInstanceStatus(r.id, INSTANCE_STATUSES.STOCK, null, 'Откат резервирования');
      }
      return {
        success: false,
        reservedInstances: [],
        error: `Ошибка при резервировании экземпляра ${instance.id}`
      };
    }
  }
  
  return { success: true, reservedInstances: reserved };
}

/**
 * Освобождает экземпляры от проекта (переводит в статус 'stock').
 * @param {string[]} instanceIds
 * @param {string} projectId - для проверки, что экземпляры принадлежат этому проекту
 * @param {string} comment - комментарий
 * @returns {object} { success: boolean, released: number, errors: string[] }
 */
export function releaseInstances(instanceIds, projectId, comment = 'Освобождение от проекта') {
  if (!instanceIds || instanceIds.length === 0) {
    return { success: true, released: 0, errors: [] };
  }
  
  const errors = [];
  let released = 0;
  
  for (let id of instanceIds) {
    const instance = getInstance(id);
    if (!instance) {
      errors.push(`Экземпляр ${id} не найден`);
      continue;
    }
    if (instance.currentProjectId !== projectId) {
      errors.push(`Экземпляр ${id} не принадлежит проекту ${projectId}`);
      continue;
    }
    if (instance.status === INSTANCE_STATUSES.STOCK) {
      released++;
      continue;
    }
    const updated = updateInstanceStatus(id, INSTANCE_STATUSES.STOCK, null, comment);
    if (updated) {
      released++;
    } else {
      errors.push(`Не удалось освободить экземпляр ${id}`);
    }
  }
  
  return { success: errors.length === 0, released, errors };
}

/**
 * Создаёт недостающие экземпляры для позиции, чтобы их общее количество соответствовало stock.
 * @param {string} path
 * @param {number} targetCount - желаемое количество экземпляров (если не указано, берётся из stock)
 * @param {string} serialPrefix - префикс для генерации серийных номеров
 * @returns {object[]} созданные экземпляры
 */
export function ensureInstancesForPath(path, targetCount = null, serialPrefix = 'SN') {
  const state = getState();
  const existing = getInstancesByPath(path);
  const currentCount = existing.length;
  
  if (targetCount === null) {
    targetCount = getStockValue(path) || 0;
  }
  
  if (currentCount >= targetCount) {
    return [];
  }
  
  const toCreate = targetCount - currentCount;
  const created = [];
  for (let i = 0; i < toCreate; i++) {
    const serialNumber = `${serialPrefix}-${path.replace(/[^a-zA-Z0-9]/g, '-')}-${currentCount + i + 1}`;
    const instance = createInstance(path, serialNumber, INSTANCE_STATUSES.STOCK);
    created.push(instance);
  }
  
  rebuildInstancesIndex();
  saveState();
  
  return created;
}

/**
 * Удаляет экземпляр (только если он в статусе 'stock' или 'written_off').
 * @param {string} instanceId
 * @returns {boolean}
 */
export function deleteInstance(instanceId) {
  const state = getState();
  const instance = state.instances[instanceId];
  if (!instance) return false;
  
  if (instance.status !== INSTANCE_STATUSES.STOCK && instance.status !== INSTANCE_STATUSES.WRITTEN_OFF) {
    console.warn('Нельзя удалить экземпляр в статусе:', instance.status);
    return false;
  }
  
  const path = instance.path;
  if (state.instancesByPath[path]) {
    state.instancesByPath[path] = state.instancesByPath[path].filter(id => id !== instanceId);
    if (state.instancesByPath[path].length === 0) {
      delete state.instancesByPath[path];
    }
  }
  
  delete state.instances[instanceId];
  saveState();
  return true;
}

/**
 * Получает статистику по экземплярам для позиции.
 * @param {string} path
 * @returns {object} { total, stock, reserved, issued, repair, writtenOff }
 */
export function getInstanceStats(path) {
  const instances = getInstancesByPath(path);
  const stats = {
    total: instances.length,
    stock: 0,
    reserved: 0,
    issued: 0,
    repair: 0,
    writtenOff: 0,
  };
  
  for (let inst of instances) {
    switch (inst.status) {
      case INSTANCE_STATUSES.STOCK: stats.stock++; break;
      case INSTANCE_STATUSES.RESERVED: stats.reserved++; break;
      case INSTANCE_STATUSES.ISSUED: stats.issued++; break;
      case INSTANCE_STATUSES.REPAIR: stats.repair++; break;
      case INSTANCE_STATUSES.WRITTEN_OFF: stats.writtenOff++; break;
    }
  }
  
  return stats;
}

export default {
  createInstance,
  getInstance,
  getInstancesByPath,
  getInstancesByStatus,
  getInstancesForProject,
  updateInstanceStatus,
  addHistoryEntry,
  getAvailableInstances,
  reserveInstances,
  releaseInstances,
  ensureInstancesForPath,
  deleteInstance,
  getInstanceStats,
};