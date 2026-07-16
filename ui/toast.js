// ui/toast.js
let toastTimeout = null;
let toastQueue = [];

/**
 * Показывает тост-уведомление.
 * @param {string} msg - текст сообщения
 * @param {string} type - тип: 'neutral', 'success', 'warning', 'error'
 * @param {number} duration - длительность показа в мс
 */
export function showToast(msg, type = 'neutral', duration = 2500) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }

  // Если тост уже виден — ставим в очередь или заменяем
  if (t.classList.contains('show')) {
    clearTimeout(toastTimeout);
    toastQueue = [];
    t.textContent = msg;
    t.className = 'toast ' + type;
    toastTimeout = setTimeout(() => {
      t.classList.remove('show');
      if (toastQueue.length > 0) {
        const next = toastQueue.shift();
        showToast(next.msg, next.type, next.duration);
      }
    }, duration);
    void t.offsetWidth;
    t.classList.add('show');
    return;
  }

  t.textContent = msg;
  t.className = 'toast ' + type;
  void t.offsetWidth; // принудительный reflow для анимации
  t.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    t.classList.remove('show');
    if (toastQueue.length > 0) {
      const next = toastQueue.shift();
      showToast(next.msg, next.type, next.duration);
    }
  }, duration);
}

/**
 * Очередь тостов (используется автоматически).
 */
export function queueToast(msg, type = 'neutral', duration = 2500) {
  toastQueue.push({ msg, type, duration });
  // Если тост не активен, показываем сразу
  const t = document.getElementById('toast');
  if (!t || !t.classList.contains('show')) {
    const next = toastQueue.shift();
    if (next) showToast(next.msg, next.type, next.duration);
  }
}

export default {
  showToast,
  queueToast,
};