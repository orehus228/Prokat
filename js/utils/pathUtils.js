// utils/pathUtils.js

/**
 * Утилиты для работы с иерархическими путями позиций.
 * Формат пути: "категория|подгруппа|имя" или "категория|имя" (если без подгруппы).
 */

/**
 * Разбирает путь на составляющие.
 * @param {string} path - полный путь
 * @returns {{ category: string, subgroup: string|null, name: string }}
 */
export function parsePath(path) {
  const parts = path.split('|');
  if (parts.length < 2) {
    throw new Error(`Некорректный путь: "${path}" (минимум 2 части)`);
  }
  const category = parts[0];
  const name = parts[parts.length - 1];
  const subgroup = parts.length > 2 ? parts.slice(1, -1).join('|') : null;
  return { category, subgroup, name };
}

/**
 * Собирает путь из категории, подгруппы и имени.
 * @param {string} category
 * @param {string|null} subgroup
 * @param {string} name
 * @returns {string}
 */
export function joinPath(category, subgroup, name) {
  if (!category || !name) throw new Error('Категория и имя обязательны');
  return subgroup ? `${category}|${subgroup}|${name}` : `${category}|${name}`;
}

/**
 * Возвращает категорию из пути.
 * @param {string} path
 * @returns {string}
 */
export function getCategory(path) {
  return parsePath(path).category;
}

/**
 * Возвращает подгруппу (или null).
 * @param {string} path
 * @returns {string|null}
 */
export function getSubgroup(path) {
  return parsePath(path).subgroup;
}

/**
 * Возвращает имя позиции (последняя часть).
 * @param {string} path
 * @returns {string}
 */
export function getItemName(path) {
  return parsePath(path).name;
}

/**
 * Проверяет, является ли путь валидным.
 * @param {string} path
 * @returns {boolean}
 */
export function isValidPath(path) {
  try {
    parsePath(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Заменяет префикс в пути (используется при переименовании категорий/подгрупп).
 * @param {string} path
 * @param {string} oldPrefix
 * @param {string} newPrefix
 * @returns {string}
 */
export function replacePathPrefix(path, oldPrefix, newPrefix) {
  if (!path.startsWith(oldPrefix)) return path;
  return newPrefix + path.slice(oldPrefix.length);
}

export default {
  parsePath,
  joinPath,
  getCategory,
  getSubgroup,
  getItemName,
  isValidPath,
  replacePathPrefix,
};