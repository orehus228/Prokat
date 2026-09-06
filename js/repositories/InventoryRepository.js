// repositories/InventoryRepository.js
import { getState, saveState, rebuildInstancesIndex } from '../core/state.js';
import { INSTANCE_STATUSES } from '../core/config.js';
import { parsePath, joinPath } from '../utils/pathUtils.js';
import { getInstancesByPath, getInstanceStats, createInstance, deleteInstance, updateInstanceStatus, ensureInstancesForPath } from '../services/instance-service.js';

/**
 * Репозиторий для работы с данными склада:
 * - остатки (stock)
 * - спецификации (specs)
 * - свойства позиций (itemProps)
 * - общие кофры (commonCases)
 * - грузовики (truckPresets)
 * - экземпляры (instances)
 *
 * Все методы принимают полный путь позиции.
 */
class InventoryRepository {
  // ---- Stock ----
  getStock(path) {
    return getState().stock[path] ?? 0;
  }

  setStock(path, value) {
    const state = getState();
    state.stock[path] = Math.max(0, Number(value));
    saveState();
  }

  // ---- Specs ----
  getSpec(path) {
    return getState().specs[path] || '';
  }

  setSpec(path, value) {
    const state = getState();
    if (value && value.trim()) {
      state.specs[path] = value.trim();
    } else {
      delete state.specs[path];
    }
    saveState();
  }

  // ---- ItemProps ----
  getProps(path) {
    const state = getState();
    const props = state.itemProps[path];
    if (props) {
      // Нормализуем поля на случай отсутствия
      return {
        weight: props.weight ?? 0,
        dimensions: props.dimensions ?? '',
        volume: props.volume ?? 0,
        individualCases: props.individualCases ?? [],
        allowCommon: props.allowCommon ?? false,
        commonCases: props.commonCases ?? [],
      };
    }
    return { weight: 0, dimensions: '', volume: 0, individualCases: [], allowCommon: false, commonCases: [] };
  }

  setProps(path, props) {
    const state = getState();
    if (props && Object.keys(props).length > 0) {
      // Нормализуем обязательные поля
      const normalized = {
        weight: props.weight ?? 0,
        dimensions: props.dimensions ?? '',
        volume: props.volume ?? 0,
        individualCases: props.individualCases ?? [],
        allowCommon: props.allowCommon ?? false,
        commonCases: props.commonCases ?? [],
      };
      state.itemProps[path] = normalized;
    } else {
      delete state.itemProps[path];
    }
    saveState();
    // Очищаем кэш вычислений (если есть)
    state._calcCache?.clear();
  }

  // ---- Common Cases ----
  getCommonCases() {
    return getState().commonCases || [];
  }

  addCommonCase(caseObj) {
    const state = getState();
    state.commonCases.push(caseObj);
    saveState();
  }

  updateCommonCase(id, newData) {
    const state = getState();
    const idx = state.commonCases.findIndex(c => c.id === id);
    if (idx !== -1) {
      state.commonCases[idx] = { ...state.commonCases[idx], ...newData };
      saveState();
    }
  }

  deleteCommonCase(id) {
    const state = getState();
    state.commonCases = state.commonCases.filter(c => c.id !== id);
    // Удаляем ссылки из itemProps.commonCases
    for (let key in state.itemProps) {
      const props = state.itemProps[key];
      if (props.commonCases) {
        props.commonCases = props.commonCases.filter(opt => opt.caseId !== id);
        if (props.commonCases.length === 0) delete props.commonCases;
      }
    }
    saveState();
  }

  // ---- Truck Presets ----
  getTruckPresets() {
    return getState().truckPresets || [];
  }

  addTruckPreset(preset) {
    const state = getState();
    if (!state.truckPresets) state.truckPresets = [];
    if (!preset.id) preset.id = 'truck_' + Date.now();
    state.truckPresets.push(preset);
    saveState();
  }

  updateTruckPreset(id, newData) {
    const state = getState();
    const presets = state.truckPresets;
    const idx = presets.findIndex(p => p.id === id);
    if (idx !== -1) {
      presets[idx] = { ...presets[idx], ...newData };
      saveState();
    }
  }

  deleteTruckPreset(id) {
    const state = getState();
    state.truckPresets = state.truckPresets.filter(p => p.id !== id);
    saveState();
  }

  getTruckPreset(id) {
    return this.getTruckPresets().find(p => p.id === id);
  }

  // ---- Instances (делегируем сервису instance-service) ----
  getInstances(path) {
    return getInstancesByPath(path);
  }

  getInstanceStats(path) {
    return getInstanceStats(path);
  }

  addInstance(path, serialNumber = '', status = INSTANCE_STATUSES.STOCK, subrentInfo = null) {
    return createInstance(path, serialNumber, status, subrentInfo || { isSubrent: false, counterparty: '' });
  }

  deleteInstance(instanceId) {
    return deleteInstance(instanceId);
  }

  updateInstance(instanceId, newStatus, comment = '') {
    return updateInstanceStatus(instanceId, newStatus, null, comment);
  }

  syncInstancesWithStock(path, targetCount = null, serialPrefix = 'SN') {
    const state = getState();
    const stock = this.getStock(path);
    const target = targetCount !== null ? targetCount : stock;
    const instances = this.getInstances(path);
    const currentCount = instances.length;
    const errors = [];
    let created = 0;
    let deleted = 0;

    if (currentCount < target) {
      const newInstances = ensureInstancesForPath(path, target, serialPrefix);
      created = newInstances.length;
    } else if (currentCount > target) {
      const toDelete = instances
        .filter(inst => inst.status === INSTANCE_STATUSES.STOCK)
        .slice(0, currentCount - target);
      for (let inst of toDelete) {
        const success = deleteInstance(inst.id);
        if (success) deleted++;
        else errors.push(`Не удалось удалить экземпляр ${inst.id}`);
      }
    }
    rebuildInstancesIndex();
    saveState();
    return { created, deleted, errors };
  }

  getInstanceById(instanceId) {
    const state = getState();
    return state.instances[instanceId] || null;
  }
}

// Экспортируем синглтон
export const inventoryRepo = new InventoryRepository();
export default inventoryRepo;