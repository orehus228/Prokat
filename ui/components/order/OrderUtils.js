// ui/components/order/OrderUtils.js

import { getState } from '../../../core/store.js';
import { getItemName, getCategory } from '../../../core/utils.js';

/**
 * Возвращает все пути позиций из инвентаря.
 * @returns {string[]} массив путей
 */
export function getAllPaths() {
  const state = getState();
  const inventory = state.inventory;
  const result = [];
  const stack = [];
  const orderKeys = state._categoryOrder || Object.keys(inventory);
  orderKeys.forEach(cat => {
    if (inventory[cat] !== undefined) {
      stack.push({ data: inventory[cat], path: [cat] });
    }
  });
  while (stack.length > 0) {
    const { data, path } = stack.pop();
    if (Array.isArray(data)) {
      data.forEach(item => {
        const fullPath = path.join('|') + '|' + item;
        result.push(fullPath);
      });
    } else if (data && typeof data === 'object') {
      const keys = Object.keys(data).filter(k => !k.startsWith('_'));
      for (let i = keys.length - 1; i >= 0; i--) {
        stack.push({ data: data[keys[i]], path: [...path, keys[i]] });
      }
    }
  }
  return result;
}

/**
 * Фильтрует пути по поисковому запросу.
 * @param {string[]} paths - массив путей
 * @param {string} query - поисковая строка
 * @param {Object} specs - объект с описаниями
 * @returns {string[]} отфильтрованные пути
 */
export function filterPathsByQuery(paths, query, specs) {
  const q = query.toLowerCase();
  return paths.filter(path => {
    const name = getItemName(path).toLowerCase();
    const spec = (specs && specs[path]) ? specs[path].toLowerCase() : '';
    return name.includes(q) || spec.includes(q);
  });
}

/**
 * Группирует пути по категориям.
 * @param {string[]} paths - массив путей
 * @returns {Object} объект { категория: [пути] }
 */
export function groupPathsByCategory(paths) {
  const grouped = {};
  paths.forEach(path => {
    const cat = getCategory(path);
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(path);
  });
  return grouped;
}

/**
 * Усекает длинное имя для отображения.
 * @param {string} name - полное имя
 * @param {number} maxLen - максимальная длина
 * @returns {string} усечённое имя
 */
export function truncateName(name, maxLen = 10) {
  if (name.length <= maxLen) return name;
  const parts = name.split(' ');
  if (parts.length <= 2) {
    return name.substring(0, maxLen - 3) + '...';
  }
  const first = parts[0];
  const last = parts[parts.length - 1];
  return first + ' ... ' + last;
}