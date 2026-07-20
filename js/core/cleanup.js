// core/cleanup.js
import { DUPLICATE_VIDEO_GROUPS, CASE_MODES_DEFAULTS } from './config.js';

/**
 * Удаляет дублирующиеся группы в категории video (например, "Экраны").
 * Также чистит соответствующие записи в stock, specs, itemProps.
 * @param {object} inventory - объект инвентаря
 * @param {object} stock - объект stock
 * @param {object} specs - объект specs
 * @param {object} itemProps - объект itemProps
 */
export function cleanupInventory(inventory, stock, specs, itemProps) {
  if (!inventory || !inventory.video) return;
  let changed = false;
  DUPLICATE_VIDEO_GROUPS.forEach(name => {
    if (inventory.video[name] !== undefined) {
      delete inventory.video[name];
      changed = true;
      if (inventory.video._subOrder) {
        const idx = inventory.video._subOrder.indexOf(name);
        if (idx !== -1) inventory.video._subOrder.splice(idx, 1);
      }
    }
  });
  const prefixes = ['video|Экран|', 'video|Экраны|'];
  const keysToDeleteStock = Object.keys(stock || {}).filter(k => prefixes.some(p => k.startsWith(p)));
  keysToDeleteStock.forEach(k => delete stock[k]);
  const keysToDeleteSpecs = Object.keys(specs || {}).filter(k => prefixes.some(p => k.startsWith(p)));
  keysToDeleteSpecs.forEach(k => delete specs[k]);
  const keysToDeleteProps = Object.keys(itemProps || {}).filter(k => prefixes.some(p => k.startsWith(p)));
  keysToDeleteProps.forEach(k => delete itemProps[k]);

  if (changed) {
    const keys = Object.keys(inventory.video).filter(k => k !== '_subOrder');
    if (keys.length === 0) {
      inventory.video = { "Телевизоры": [] };
      inventory.video._subOrder = ["Телевизоры"];
    }
    if (inventory.video._subOrder) {
      inventory.video._subOrder = inventory.video._subOrder.filter(k => inventory.video[k] !== undefined);
      if (inventory.video._subOrder.length === 0) {
        inventory.video._subOrder = Object.keys(inventory.video).filter(k => k !== '_subOrder');
      }
    }
  }
}

/**
 * Нормализует itemProps: добавляет отсутствующие поля, преобразует старые форматы.
 * @param {object} itemProps - объект itemProps
 */
export function normalizeItemProps(itemProps) {
  for (let key in itemProps) {
    const props = itemProps[key];
    if (!props) continue;
    if (props.individualCases === undefined) props.individualCases = [];
    if (props.allowCommon === undefined) props.allowCommon = false;
    if (props.commonCases === undefined) props.commonCases = [];
    if (props.weight === undefined) props.weight = 0;
    if (props.dimensions === undefined) props.dimensions = '';
    if (props.volume === undefined) props.volume = 0;
    // Если есть старые поля case_qty, case_dimensions, case_weight – конвертируем
    // (эта логика может быть вынесена сюда, но пока оставим в editor-data.js для совместимости)
  }
}

/**
 * Нормализует подгруппы внутри категорий.
 * @param {object} inventory - объект инвентаря
 */
export function normalizeSubgroups(inventory) {
  for (let cat in inventory) {
    const catData = inventory[cat];
    if (catData && typeof catData === 'object' && !Array.isArray(catData)) {
      if (!catData._subOrder) {
        catData._subOrder = Object.keys(catData).filter(k => k !== '_subOrder');
      } else {
        catData._subOrder = catData._subOrder.filter(k => catData[k] !== undefined);
        // Добавляем недостающие ключи
        Object.keys(catData).forEach(k => {
          if (k !== '_subOrder' && !catData._subOrder.includes(k)) {
            catData._subOrder.push(k);
          }
        });
      }
    }
  }
}

/**
 * Нормализует caseModes: добавляет недостающие поля по умолчанию.
 * @param {object} caseModes - объект caseModes
 */
export function normalizeCaseModes(caseModes) {
  for (let path in caseModes) {
    const mode = caseModes[path];
    if (typeof mode !== 'object' || mode === null) {
      caseModes[path] = { ...CASE_MODES_DEFAULTS };
      continue;
    }
    for (let key in CASE_MODES_DEFAULTS) {
      if (mode[key] === undefined) mode[key] = CASE_MODES_DEFAULTS[key];
    }
  }
}

/**
 * Нормализует порядок категорий.
 * @param {Array} categoryOrder - массив порядка категорий
 * @param {object} inventory - объект инвентаря
 * @returns {Array} отфильтрованный массив
 */
export function normalizeCategoryOrder(categoryOrder, inventory) {
  if (!categoryOrder) return Object.keys(inventory);
  return categoryOrder.filter(cat => inventory && inventory[cat] !== undefined);
}

export default {
  cleanupInventory,
  normalizeItemProps,
  normalizeSubgroups,
  normalizeCaseModes,
  normalizeCategoryOrder,
};