// ui/dom.js

/**
 * Экранирует специальные HTML-символы.
 * @param {string} str - строка для экранирования
 * @returns {string} экранированная строка
 */
export function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Ищет элемент по селектору, возвращает null, если не найден.
 * @param {string} selector - CSS-селектор
 * @param {Element} parent - родительский элемент (по умолчанию document)
 * @returns {Element|null}
 */
export function getElement(selector, parent = document) {
  const el = parent.querySelector(selector);
  if (!el) console.warn('Элемент не найден:', selector);
  return el;
}

/**
 * Ищет элемент по селектору, выбрасывает ошибку, если не найден.
 * @param {string} selector - CSS-селектор
 * @param {Element} parent - родительский элемент (по умолчанию document)
 * @returns {Element}
 * @throws {Error} если элемент не найден
 */
export function getElementSafe(selector, parent = document) {
  const el = parent.querySelector(selector);
  if (!el) throw new Error(`Элемент "${selector}" не найден`);
  return el;
}

/**
 * Создаёт debounce-функцию.
 * @param {Function} fn - функция для debounce
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
 * Утилита для создания элементов с атрибутами и дочерними элементами.
 * @param {string} tag - имя тега
 * @param {object} attrs - атрибуты
 * @param  {...(Node|string)} children - дочерние элементы или текст
 * @returns {HTMLElement}
 */
export function createElement(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (let [key, val] of Object.entries(attrs)) {
    if (key === 'className') {
      el.className = val;
    } else if (key === 'dataset') {
      for (let [dKey, dVal] of Object.entries(val)) {
        el.dataset[dKey] = dVal;
      }
    } else if (key === 'style' && typeof val === 'object') {
      Object.assign(el.style, val);
    } else if (key.startsWith('on') && typeof val === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), val);
    } else {
      el.setAttribute(key, val);
    }
  }
  children.forEach(child => {
    if (typeof child === 'string') {
      el.appendChild(document.createTextNode(child));
    } else if (child instanceof Node) {
      el.appendChild(child);
    }
  });
  return el;
}

/**
 * Утилита для переключения класса.
 * @param {Element} el - элемент
 * @param {string} className - класс
 * @param {boolean} force - принудительное состояние
 */
export function toggleClass(el, className, force) {
  if (force !== undefined) {
    el.classList.toggle(className, force);
  } else {
    el.classList.toggle(className);
  }
}

/**
 * Утилита для удаления всех дочерних элементов.
 * @param {Element} el - элемент
 */
export function emptyElement(el) {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

export default {
  esc,
  getElement,
  getElementSafe,
  debounce,
  createElement,
  toggleClass,
  emptyElement,
};