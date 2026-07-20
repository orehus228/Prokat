// core/cleanup.js
import { DUPLICATE_VIDEO_GROUPS, CASE_MODES_DEFAULTS } from './config.js';

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

export function normalizeSubgroups(inventory) {
  for (let cat in inventory) {
    const catData = inventory[cat];
    if (catData && typeof catData === 'object' && !Array.isArray(catData)) {
      if (!catData._subOrder) {
        catData._subOrder = Object.keys(catData).filter(k => k !== '_subOrder');
      } else {
        catData._subOrder = catData._subOrder.filter(k => catData[k] !== undefined);
        Object.keys(catData).forEach(k => {
          if (k !== '_subOrder' && !catData._subOrder.includes(k)) {
            catData._subOrder.push(k);
          }
        });
      }
    }
  }
}

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

export function normalizeCategoryOrder(categoryOrder, inventory) {
  if (!categoryOrder) return Object.keys(inventory);
  return categoryOrder.filter(cat => inventory && inventory[cat] !== undefined);
}

export default {
  cleanupInventory,
  normalizeSubgroups,
  normalizeCaseModes,
  normalizeCategoryOrder,
};