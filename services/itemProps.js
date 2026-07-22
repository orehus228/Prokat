// services/itemProps.js

/**
 * Сервис для работы со свойствами позиций (вес, габариты, объём, кофры).
 * @module services/itemProps
 */

import { getState, saveState } from '../core/store.js';
import { emit, EVENTS } from '../core/events.js';
import { deepClone } from '../core/utils.js';

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================

/**
 * Формирует путь для позиции.
 * @param {string} catKey - имя категории
 * @param {string|null} subKey - имя подгруппы (null для корневого массива)
 * @param {string} itemName - имя позиции
 * @returns {string} путь
 */
function buildPath(catKey, subKey, itemName) {
  return subKey ? `${catKey}|${subKey}|${itemName}` : `${catKey}|${itemName}`;
}

/**
 * Возвращает дефолтные свойства.
 * @returns {Object} объект со свойствами по умолчанию
 */
function getDefaultProps() {
  return {
    weight: 0,
    dimensions: '',
    volume: 0,
    individualCases: [],
    allowCommon: false,
    commonCases: [],
  };
}

// ============================================================
// ПОЛУЧЕНИЕ СВОЙСТВ
// ============================================================

/**
 * Получает свойства позиции.
 * @param {string} catKey - имя категории
 * @param {string|null} subKey - имя подгруппы
 * @param {string} itemName - имя позиции
 * @returns {Object} свойства (с дефолтными значениями)
 */
export function getItemProps(catKey, subKey, itemName) {
  const path = buildPath(catKey, subKey, itemName);
  return getItemPropsByPath(path);
}

/**
 * Получает свойства по полному пути.
 * @param {string} path - путь
 * @returns {Object} свойства (с дефолтными значениями)
 */
export function getItemPropsByPath(path) {
  const state = getState();
  const props = state.itemProps[path];
  if (props) {
    // Заполняем недостающие поля дефолтами
    const def = getDefaultProps();
    return {
      weight: props.weight ?? def.weight,
      dimensions: props.dimensions ?? def.dimensions,
      volume: props.volume ?? def.volume,
      individualCases: Array.isArray(props.individualCases) ? [...props.individualCases] : [],
      allowCommon: props.allowCommon ?? def.allowCommon,
      commonCases: Array.isArray(props.commonCases) ? [...props.commonCases] : [],
    };
  }
  return getDefaultProps();
}

// ============================================================
// УСТАНОВКА СВОЙСТВ
// ============================================================

/**
 * Устанавливает свойства позиции (мердж с существующими).
 * @param {string} catKey - имя категории
 * @param {string|null} subKey - имя подгруппы
 * @param {string} itemName - имя позиции
 * @param {Object} newProps - новые свойства (частичные)
 * @returns {boolean} успех операции
 */
export function setItemProps(catKey, subKey, itemName, newProps) {
  const path = buildPath(catKey, subKey, itemName);
  return setItemPropsByPath(path, newProps);
}

/**
 * Устанавливает свойства по полному пути.
 * @param {string} path - путь
 * @param {Object} newProps - новые свойства (частичные)
 * @returns {boolean} успех операции
 */
export function setItemPropsByPath(path, newProps) {
  const state = getState();
  const current = state.itemProps[path] || {};
  // Мерджим, но без мутации оригинальных массивов
  const updated = {
    weight: newProps.weight !== undefined ? newProps.weight : current.weight ?? 0,
    dimensions: newProps.dimensions !== undefined ? newProps.dimensions : current.dimensions ?? '',
    volume: newProps.volume !== undefined ? newProps.volume : current.volume ?? 0,
    individualCases: newProps.individualCases !== undefined ? [...newProps.individualCases] : (current.individualCases ? [...current.individualCases] : []),
    allowCommon: newProps.allowCommon !== undefined ? newProps.allowCommon : current.allowCommon ?? false,
    commonCases: newProps.commonCases !== undefined ? [...newProps.commonCases] : (current.commonCases ? [...current.commonCases] : []),
  };

  // Проверяем, есть ли вообще какие-то непустые свойства, чтобы не хранить пустые объекты
  const hasData = updated.weight > 0 ||
                  updated.dimensions !== '' ||
                  updated.volume > 0 ||
                  updated.individualCases.length > 0 ||
                  updated.allowCommon === true ||
                  updated.commonCases.length > 0;

  if (hasData) {
    state.itemProps[path] = updated;
  } else {
    delete state.itemProps[path];
  }

  saveState();
  emit(EVENTS.EDITOR_DATA_CHANGED, { action: 'setItemProps', path, props: updated });
  return true;
}

// ============================================================
// РАБОТА С ИНДИВИДУАЛЬНЫМИ КОФРАМИ
// ============================================================

/**
 * Добавляет вариант индивидуального кофра для позиции.
 * @param {string} path - путь позиции
 * @param {Object} caseVariant - вариант кофра { qty, dimensions, weight, maxCases }
 * @returns {boolean} успех операции
 */
export function addIndividualCaseVariant(path, caseVariant) {
  const props = getItemPropsByPath(path);
  const variants = props.individualCases || [];
  variants.push({
    qty: Math.max(1, parseInt(caseVariant.qty, 10) || 1),
    dimensions: caseVariant.dimensions || '',
    weight: parseFloat(caseVariant.weight) || 0,
    maxCases: Math.max(0, parseInt(caseVariant.maxCases, 10) || 0),
  });
  setItemPropsByPath(path, { individualCases: variants });
  return true;
}

/**
 * Удаляет вариант индивидуального кофра по индексу.
 * @param {string} path - путь позиции
 * @param {number} index - индекс варианта
 * @returns {boolean} успех операции
 */
export function removeIndividualCaseVariant(path, index) {
  const props = getItemPropsByPath(path);
  const variants = props.individualCases || [];
  if (index < 0 || index >= variants.length) return false;
  variants.splice(index, 1);
  setItemPropsByPath(path, { individualCases: variants });
  return true;
}

/**
 * Обновляет вариант индивидуального кофра.
 * @param {string} path - путь позиции
 * @param {number} index - индекс варианта
 * @param {Object} newData - новые данные варианта
 * @returns {boolean} успех операции
 */
export function updateIndividualCaseVariant(path, index, newData) {
  const props = getItemPropsByPath(path);
  const variants = props.individualCases || [];
  if (index < 0 || index >= variants.length) return false;
  variants[index] = {
    ...variants[index],
    qty: newData.qty !== undefined ? Math.max(1, parseInt(newData.qty, 10) || 1) : variants[index].qty,
    dimensions: newData.dimensions !== undefined ? newData.dimensions : variants[index].dimensions,
    weight: newData.weight !== undefined ? parseFloat(newData.weight) || 0 : variants[index].weight,
    maxCases: newData.maxCases !== undefined ? Math.max(0, parseInt(newData.maxCases, 10) || 0) : variants[index].maxCases,
  };
  setItemPropsByPath(path, { individualCases: variants });
  return true;
}

// ============================================================
// РАБОТА С ОБЩИМИ КОФРАМИ (связи)
// ============================================================

/**
 * Добавляет связь с общим кофром для позиции.
 * @param {string} path - путь позиции
 * @param {string} caseId - ID общего кофра
 * @param {number} qty - количество единиц позиции в кофре
 * @returns {boolean} успех операции
 */
export function addCommonCaseLink(path, caseId, qty) {
  const props = getItemPropsByPath(path);
  const links = props.commonCases || [];
  // Проверяем, нет ли уже такой связи
  const existing = links.find(l => l.caseId === caseId);
  if (existing) {
    existing.qty = Math.max(1, parseInt(qty, 10) || 1);
  } else {
    links.push({
      caseId,
      qty: Math.max(1, parseInt(qty, 10) || 1),
    });
  }
  setItemPropsByPath(path, { commonCases: links });
  return true;
}

/**
 * Удаляет связь с общим кофром.
 * @param {string} path - путь позиции
 * @param {string} caseId - ID общего кофра
 * @returns {boolean} успех операции
 */
export function removeCommonCaseLink(path, caseId) {
  const props = getItemPropsByPath(path);
  const links = props.commonCases || [];
  const filtered = links.filter(l => l.caseId !== caseId);
  if (filtered.length === links.length) return false;
  setItemPropsByPath(path, { commonCases: filtered });
  return true;
}

/**
 * Обновляет связь с общим кофром.
 * @param {string} path - путь позиции
 * @param {string} caseId - ID общего кофра
 * @param {number} newQty - новое количество
 * @returns {boolean} успех операции
 */
export function updateCommonCaseLink(path, caseId, newQty) {
  const props = getItemPropsByPath(path);
  const links = props.commonCases || [];
  const link = links.find(l => l.caseId === caseId);
  if (!link) return false;
  link.qty = Math.max(1, parseInt(newQty, 10) || 1);
  setItemPropsByPath(path, { commonCases: links });
  return true;
}

// ============================================================
// ПОЛУЧЕНИЕ ВСЕХ СВОЙСТВ
// ============================================================

/**
 * Возвращает все свойства позиций.
 * @returns {Object} копия объекта itemProps
 */
export function getAllItemProps() {
  return deepClone(getState().itemProps);
}

// ============================================================
// ЭКСПОРТ ПО УМОЛЧАНИЮ
// ============================================================

export default {
  getItemProps,
  getItemPropsByPath,
  setItemProps,
  setItemPropsByPath,
  addIndividualCaseVariant,
  removeIndividualCaseVariant,
  updateIndividualCaseVariant,
  addCommonCaseLink,
  removeCommonCaseLink,
  updateCommonCaseLink,
  getAllItemProps,
};