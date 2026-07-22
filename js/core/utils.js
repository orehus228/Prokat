// core/utils.js

/**
 * Утилиты общего назначения.
 * Чистые функции, не имеющие побочных эффектов.
 * @module core/utils
 */

// ============================================================
// ЭКРАНИРОВАНИЕ HTML
// ============================================================

/**
 * Экранирует специальные HTML-символы для безопасной вставки в DOM.
 * @param {string} str - строка для экранирования
 * @returns {string} экранированная строка
 */
export function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ============================================================
// ГЕНЕРАЦИЯ ИДЕНТИФИКАТОРОВ
// ============================================================

/**
 * Генерирует уникальный ID на основе времени и случайной строки.
 * @param {string} [prefix='id'] - префикс для ID
 * @returns {string} уникальный ID
 */
export function generateId(prefix = 'id') {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 7);
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Генерирует короткий случайный ID (для временных ключей).
 * @param {number} [length=6] - длина ID
 * @returns {string} случайный ID
 */
export function shortId(length = 6) {
  return Math.random().toString(36).substring(2, 2 + length);
}

// ============================================================
// РАБОТА С ПУТЯМИ (РАЗДЕЛИТЕЛЬ — "|")
// ============================================================

/**
 * Разделяет путь на части.
 * @param {string} path - путь вида "cat|sub|item"
 * @returns {string[]} массив частей
 */
export function splitPath(path) {
  return path ? path.split('|') : [];
}

/**
 * Объединяет части в путь.
 * @param {string[]} parts - массив частей
 * @returns {string} путь
 */
export function joinPath(parts) {
  return parts.filter(Boolean).join('|');
}

/**
 * Получает последнюю часть пути (имя позиции).
 * @param {string} path - путь
 * @returns {string} последняя часть
 */
export function getItemName(path) {
  const parts = splitPath(path);
  return parts.length > 0 ? parts[parts.length - 1] : '';
}

/**
 * Получает категорию (первую часть пути).
 * @param {string} path - путь
 * @returns {string} категория
 */
export function getCategory(path) {
  const parts = splitPath(path);
  return parts.length > 0 ? parts[0] : '';
}

/**
 * Проверяет, является ли путь корректным (не пустой, содержит хотя бы одну часть).
 * @param {string} path - путь
 * @returns {boolean}
 */
export function isValidPath(path) {
  return typeof path === 'string' && path.length > 0 && path.includes('|');
}

/**
 * Заменяет обратные слеши на прямые (для нормализации).
 * @param {string} path - путь
 * @returns {string} нормализованный путь
 */
export function normalizePathSlashes(path) {
  return path ? path.replace(/\\/g, '|') : '';
}

// ============================================================
// РАБОТА С ДАТАМИ
// ============================================================

/**
 * Преобразует строку даты в объект Date (без времени).
 * @param {string} dateStr - дата в формате YYYY-MM-DD
 * @returns {Date|null} объект Date или null, если невалидно
 */
export function parseDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

/**
 * Форматирует дату в локальный формат (ДД.ММ.ГГГГ).
 * @param {string} dateStr - дата в формате YYYY-MM-DD
 * @param {string} [fallback='—'] - строка при отсутствии даты
 * @returns {string} отформатированная дата
 */
export function formatDate(dateStr, fallback = '—') {
  const d = parseDate(dateStr);
  if (!d || isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString('ru-RU');
}

/**
 * Проверяет, пересекаются ли два временных интервала.
 * @param {string} start1 - начало первого интервала (YYYY-MM-DD)
 * @param {string} end1 - конец первого интервала (YYYY-MM-DD)
 * @param {string} start2 - начало второго интервала (YYYY-MM-DD)
 * @param {string} end2 - конец второго интервала (YYYY-MM-DD)
 * @returns {boolean} true, если интервалы пересекаются
 */
export function intervalsOverlap(start1, end1, start2, end2) {
  const s1 = parseDate(start1);
  const e1 = parseDate(end1);
  const s2 = parseDate(start2);
  const e2 = parseDate(end2);
  if (!s1 || !e1 || !s2 || !e2) return false;
  return s1 <= e2 && s2 <= e1;
}

/**
 * Проверяет, является ли дата валидной.
 * @param {string} dateStr - дата в формате YYYY-MM-DD
 * @returns {boolean}
 */
export function isValidDate(dateStr) {
  return parseDate(dateStr) !== null;
}

// ============================================================
// ОБЪЕКТНЫЕ ОПЕРАЦИИ
// ============================================================

/**
 * Безопасно получает значение по пути (точечная нотация).
 * @param {Object} obj - объект
 * @param {string} path - путь через точку, например "a.b.c"
 * @param {*} [defaultValue] - значение по умолчанию
 * @returns {*} найденное значение или defaultValue
 */
export function getNested(obj, path, defaultValue = undefined) {
  const keys = path.split('.');
  let result = obj;
  for (const key of keys) {
    if (result && typeof result === 'object' && key in result) {
      result = result[key];
    } else {
      return defaultValue;
    }
  }
  return result;
}

/**
 * Безопасно устанавливает значение по пути (создаёт промежуточные объекты).
 * @param {Object} obj - объект-приёмник (изменяется по ссылке)
 * @param {string} path - путь через точку
 * @param {*} value - устанавливаемое значение
 */
export function setNested(obj, path, value) {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  current[keys[keys.length - 1]] = value;
}

/**
 * Очищает объект от свойств с falsy-значениями (кроме 0 и false).
 * @param {Object} obj - объект
 * @returns {Object} новый объект без пустых значений
 */
export function cleanObject(obj) {
  const result = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined && val !== null && val !== '' && !(Array.isArray(val) && val.length === 0)) {
      result[key] = val;
    }
  }
  return result;
}

/**
 * Глубокое клонирование объекта (без циклических ссылок).
 * @param {*} obj - любой объект
 * @returns {*} клон
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (Array.isArray(obj)) return obj.map(deepClone);
  const cloned = {};
  for (const key of Object.keys(obj)) {
    cloned[key] = deepClone(obj[key]);
  }
  return cloned;
}

// ============================================================
// МАССИВНЫЕ ОПЕРАЦИИ
// ============================================================

/**
 * Перемещает элемент в массиве на указанное количество позиций.
 * @param {Array} arr - массив (изменяется по ссылке)
 * @param {number} fromIndex - текущий индекс
 * @param {number} delta - смещение (+1 вправо, -1 влево)
 * @returns {boolean} успех операции
 */
export function moveArrayItem(arr, fromIndex, delta) {
  if (!Array.isArray(arr)) return false;
  const toIndex = fromIndex + delta;
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= arr.length || toIndex >= arr.length) return false;
  const [item] = arr.splice(fromIndex, 1);
  arr.splice(toIndex, 0, item);
  return true;
}

/**
 * Удаляет дубликаты из массива (по строгому равенству).
 * @param {Array} arr - массив
 * @returns {Array} новый массив без дубликатов
 */
export function uniqueArray(arr) {
  return [...new Set(arr)];
}

/**
 * Группирует массив объектов по значению ключа.
 * @param {Array} arr - массив объектов
 * @param {string} key - ключ для группировки
 * @returns {Object} объект, где ключи — значения groupKey, значения — массивы элементов
 */
export function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const group = item[key];
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {});
}

// ============================================================
// ФУНКЦИИ ОГРАНИЧЕНИЯ ВЫЗОВОВ (debounce / throttle)
// ============================================================

/**
 * Создаёт debounce-функцию (вызов после паузы).
 * @param {Function} fn - функция
 * @param {number} delay - задержка в мс
 * @returns {Function} обёрнутая функция
 */
export function debounce(fn, delay = 300) {
  let timeout = null;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Создаёт throttle-функцию (не чаще одного вызова за интервал).
 * @param {Function} fn - функция
 * @param {number} limit - минимальный интервал в мс
 * @returns {Function} обёрнутая функция
 */
export function throttle(fn, limit = 300) {
  let inThrottle = false;
  return function (...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// ============================================================
// ФУНКЦИИ ДЛЯ ЧИСЕЛ
// ============================================================

/**
 * Ограничивает число в заданном диапазоне.
 * @param {number} value - число
 * @param {number} min - минимум
 * @param {number} max - максимум
 * @returns {number} ограниченное число
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Округляет число до заданного количества знаков.
 * @param {number} value - число
 * @param {number} [decimals=2] - количество знаков после запятой
 * @returns {number} округлённое число
 */
export function roundTo(value, decimals = 2) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

// ============================================================
// ПРОВЕРКИ ТИПОВ
// ============================================================

/**
 * Проверяет, является ли значение числом (включая строковые числа).
 * @param {*} value - значение
 * @returns {boolean}
 */
export function isNumeric(value) {
  return !isNaN(parseFloat(value)) && isFinite(value);
}

/**
 * Проверяет, является ли значение целым числом.
 * @param {*} value - значение
 * @returns {boolean}
 */
export function isInteger(value) {
  return Number.isInteger(Number(value));
}

/**
 * Проверяет, является ли значение непустой строкой.
 * @param {*} value - значение
 * @returns {boolean}
 */
export function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

// ============================================================
// РАБОТА С localStorage (безопасная)
// ============================================================

/**
 * Безопасно получает данные из localStorage с парсингом JSON.
 * @param {string} key - ключ
 * @param {*} [defaultValue] - значение по умолчанию
 * @returns {*} распарсенное значение или defaultValue
 */
export function safeGetStorage(key, defaultValue = null) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return defaultValue;
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}

/**
 * Безопасно сохраняет данные в localStorage (сериализует в JSON).
 * @param {string} key - ключ
 * @param {*} value - значение
 * @returns {boolean} успех операции
 */
export function safeSetStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// ============================================================
// ЭКСПОРТ ПО УМОЛЧАНИЮ
// ============================================================

export default {
  esc,
  generateId,
  shortId,
  splitPath,
  joinPath,
  getItemName,
  getCategory,
  isValidPath,
  normalizePathSlashes,
  parseDate,
  formatDate,
  intervalsOverlap,
  isValidDate,
  getNested,
  setNested,
  cleanObject,
  deepClone,
  moveArrayItem,
  uniqueArray,
  groupBy,
  debounce,
  throttle,
  clamp,
  roundTo,
  isNumeric,
  isInteger,
  isNonEmptyString,
  safeGetStorage,
  safeSetStorage,
};