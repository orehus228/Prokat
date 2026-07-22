// components/open/render.js
import { getState, setStateKey, saveState } from '../../core/state.js';
// ⭐ Импортируем всё из calculations.js
import * as calc from '../../services/calculations.js';
import { getCommonCases, getStockValue } from '../../data/editor-data.js';
import { esc, getElement } from '../../ui/dom.js';
import { showToast } from '../../ui/toast.js';
import { showConfirm } from '../../ui/modal.js';
import { formatWeight, formatVolume } from '../../ui/render-utils.js';
import { getOrderPacking } from '../../services/order-data.js';

// ============================================================
// СОСТОЯНИЕ СТРАНИЦЫ ОТКРЫТИЯ
// ============================================================

let loadedOrder = null;
let openChecked = {};
let openCategoryState = {};
let openDescState = {};

const OPEN_STORAGE_KEY = 'open_state';

// ============================================================
// ЗАГРУЗКА / СОХРАНЕНИЕ СОСТОЯНИЯ ЧЕК-ЛИСТА
// ============================================================

function loadOpenState() {
  try {
    const raw = localStorage.getItem(OPEN_STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      openChecked = data.openChecked || {};
      openCategoryState = data.openCategoryState || {};
      openDescState = data.openDescState || {};
    }
  } catch (e) {
    console.warn('Ошибка загрузки состояния открытия', e);
  }
}

function saveOpenState() {
  const data = { openChecked, openCategoryState, openDescState };
  localStorage.setItem(OPEN_STORAGE_KEY, JSON.stringify(data));
}

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================

function parseUnitVolumeFromString(dimensions) {
  return calc.parseUnitVolume(dimensions);
}

// ============================================================
// ОТРИСОВКА ЗАГРУЖЕННОГО ЗАКАЗА
// ============================================================

export function renderOpenOrder(d) {
  loadedOrder = d;
  const container = document.getElementById('sCats');
  if (!container) return;
  container.innerHTML = '';
  document.getElementById('sRes').style.display = 'block';
  document.getElementById('rName').textContent = d.project_name || 'Мероприятие';
  document.getElementById('rDate').textContent = 'Дата: ' + (d.date || '—');
  document.getElementById('rComment').textContent = d.comment || '';

  // Построение дерева для отображения
  const tree = {};
  for (let path in d.items) {
    const qty = d.items[path];
    if (qty <= 0) continue;
    const parts = path.split('|');
    let current = tree;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        if (!current._items) current._items = [];
        current._items.push({ path, name: part, qty });
      } else {
        if (!current[part]) current[part] = {};
        current = current[part];
      }
    }
  }

  // Загружаем спецификации, если они есть в данных заказа
  const specs = d.specs || {};

  function buildTreeHTML(node, level, parentPath) {
    let html = '';
    const keys = Object.keys(node).filter(k => k !== '_items');
    keys.sort();
    for (let key of keys) {
      const child = node[key];
      const fullPath = parentPath ? parentPath + '|' + key : key;
      const isOpen = !openCategoryState[fullPath];
      const toggleIcon = isOpen ? '▼' : '▶';
      if (level === 0) {
        html += `<div class="sub-cat-t" style="cursor:pointer;border-left:3px solid var(--accent);padding-left:12px;" onclick="window.toggleOpenCategory('${esc(fullPath)}')">${toggleIcon} ${key} (${child._items ? child._items.length : 0})</div>`;
      } else {
        html += `<div class="sub-sub-cat-t" style="cursor:pointer;border-left-color:var(--border-light);padding-left:${12 + level * 16}px;" onclick="window.toggleOpenCategory('${esc(fullPath)}')">${toggleIcon} ${key} (${child._items ? child._items.length : 0})</div>`;
      }
      const contentStyle = isOpen ? '' : 'display:none;';
      html += `<div class="category-content-open" style="${contentStyle}padding-left:${level * 20 + 10}px;">`;
      if (child._items) {
        for (let item of child._items) {
          const checked = openChecked[item.path] || false;
          const desc = specs[item.path] || '';
          const hasDesc = !!desc;
          const descOpen = openDescState[item.path] || false;
          // Вес и объём считаем как для товара (без кофров, только базовые свойства)
          const props = calc.getItemPropsByPath(item.path);
          const weight = (props.weight || 0) * item.qty;
          const unitVol = parseUnitVolumeFromString(props.dimensions);
          const volume = unitVol * item.qty;
          const dims = props.dimensions || 'н/д';

          html += `<div class="row" style="border-left:2px solid var(--border-color);padding-left:8px;margin-left:10px;background:${checked ? 'var(--added-bg)' : ''};display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:6px 0;border-bottom:1px solid var(--border-color);">`;
          html += `<div class="main-line" style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;flex:1 1 100%;">`;
          html += `<div class="name-area" style="display:flex;align-items:center;gap:8px;flex:1 1 200px;">`;
          html += `<label style="display:flex;align-items:center;gap:8px;cursor:pointer;">`;
          html += `<input type="checkbox" class="open-check" data-path="${esc(item.path)}" ${checked ? 'checked' : ''} onchange="window.toggleOpenChecked('${esc(item.path)}', this)">`;
          html += `<span class="name">${esc(item.name)}</span>`;
          html += `</label>`;
          if (hasDesc) {
            html += `<button class="desc-toggle" onclick="window.toggleOpenDesc('${esc(item.path)}')" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:16px;">${descOpen ? '📕' : '📄'}</button>`;
          }
          html += `</div>`;
          html += `<div style="display:flex;gap:12px;flex-wrap:wrap;font-size:14px;color:var(--text-secondary);flex:1 1 auto;justify-content:flex-start;">`;
          html += `<span style="min-width:60px;">${item.qty} шт</span>`;
          html += `<span style="min-width:60px;">${formatWeight(weight)}</span>`;
          html += `<span style="min-width:60px;">${formatVolume(volume)}</span>`;
          html += `<span style="min-width:80px;">${dims}</span>`;
          html += `</div>`;
          html += `</div>`;
          if (hasDesc) {
            html += `<div class="desc-block" data-path="${esc(item.path)}" style="display:${descOpen ? 'block' : 'none'};margin-left:20px;width:100%;flex-basis:100%;padding:4px 12px;background:var(--bg-secondary);border-radius:6px;font-size:13px;color:var(--text-secondary);border-left:3px solid var(--accent);">${esc(desc)}</div>`;
          }
          html += `</div>`;
        }
      }
      html += buildTreeHTML(child, level + 1, fullPath);
      html += `</div>`;
    }
    return html;
  }

  const html = buildTreeHTML(tree, 0, '');
  container.innerHTML = html;
  updateOpenProgress();
}

// ============================================================
// ГЛОБАЛЬНЫЕ ФУНКЦИИ ДЛЯ ONCLICK
// ============================================================

window.toggleOpenCategory = function(fullPath) {
  openCategoryState[fullPath] = !openCategoryState[fullPath];
  saveOpenState();
  if (loadedOrder) renderOpenOrder(loadedOrder);
};

window.toggleOpenDesc = function(path) {
  openDescState[path] = !openDescState[path];
  saveOpenState();
  const block = document.querySelector(`.desc-block[data-path="${CSS.escape(path)}"]`);
  if (block) {
    block.style.display = openDescState[path] ? 'block' : 'none';
    const btn = block.closest('.row')?.querySelector('.desc-toggle');
    if (btn) btn.textContent = openDescState[path] ? '📕' : '📄';
  }
};

window.toggleOpenChecked = function(path, checkbox) {
  openChecked[path] = checkbox.checked;
  saveOpenState();
  updateOpenProgress();
  const row = checkbox.closest('.row');
  if (row) {
    row.style.background = checkbox.checked ? 'var(--added-bg)' : '';
  }
};

// ============================================================
// ОБНОВЛЕНИЕ ПРОГРЕССА
// ============================================================

function updateOpenProgress() {
  if (!loadedOrder) return;
  const total = Object.keys(loadedOrder.items).filter(p => loadedOrder.items[p] > 0).length;
  let done = 0;
  for (let path in loadedOrder.items) {
    if (loadedOrder.items[path] > 0 && openChecked[path]) done++;
  }
  document.getElementById('progressCount').textContent = done + '/' + total;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  document.getElementById('progressPercent').textContent = percent + '%';
  const bar = document.getElementById('progressBar');
  bar.style.width = percent + '%';
  bar.classList.toggle('complete', percent === 100);

  let totalWeight = 0, totalVolume = 0;
  for (let path in loadedOrder.items) {
    const qty = loadedOrder.items[path];
    if (qty > 0) {
      const props = calc.getItemPropsByPath(path);
      totalWeight += (props.weight || 0) * qty;
      const unitVol = parseUnitVolumeFromString(props.dimensions);
      totalVolume += unitVol * qty;
    }
  }
  document.getElementById('totalWeightOpen').textContent = totalWeight.toFixed(1);
  document.getElementById('totalVolumeOpen').textContent = totalVolume.toFixed(3);
}

// ============================================================
// СБРОС ЧЕКБОКСОВ
// ============================================================

export async function resetCheckboxes() {
  if (!loadedOrder) return;
  const confirmed = await showConfirm('Сбросить все отметки?');
  if (!confirmed) return;
  openChecked = {};
  saveOpenState();
  renderOpenOrder(loadedOrder);
  showToast('Отметки сброшены', 'neutral');
}

// ============================================================
// ПРОВЕРКА ПРОПУЩЕННЫХ ПОЗИЦИЙ
// ============================================================

export function checkMissingItems() {
  if (!loadedOrder) return;
  const missing = [];
  for (let path in loadedOrder.items) {
    if (loadedOrder.items[path] > 0 && !openChecked[path]) {
      const parts = path.split('|');
      missing.push(parts[parts.length - 1]);
    }
  }
  if (missing.length === 0) {
    showToast('Все позиции отмечены!', 'success');
  } else {
    const msg = 'Не отмечены: ' + missing.join(', ');
    showToast(msg, 'warning');
    document.querySelectorAll('.open-check').forEach(cb => {
      const path = cb.dataset.path;
      if (loadedOrder.items[path] > 0 && !cb.checked) {
        cb.closest('.row').style.borderLeft = '4px solid var(--danger)';
      } else {
        cb.closest('.row').style.borderLeft = '2px solid var(--border-color)';
      }
    });
  }
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ СТРАНИЦЫ ОТКРЫТИЯ
// ============================================================

export function initOpenUI() {
  loadOpenState();

  const fileInput = document.getElementById('fSel');
  if (fileInput) {
    fileInput.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (!file) {
        document.getElementById('loadStatus').textContent = 'Файл не выбран';
        return;
      }
      const reader = new FileReader();
      reader.onload = function(ev) {
        try {
          const data = JSON.parse(ev.target.result);
          if (!data.items || typeof data.items !== 'object') {
            throw new Error('Неверный формат: отсутствует поле items');
          }
          document.getElementById('loadStatus').textContent = 'Загружено: ' + (data.project_name || 'Без названия');
          renderOpenOrder(data);
        } catch (err) {
          document.getElementById('loadStatus').textContent = 'Ошибка: ' + err.message;
          showToast('Ошибка загрузки: ' + err.message, 'error');
        }
      };
      reader.readAsText(file);
    });
  }

  const resetBtn = document.getElementById('resetCheckboxes');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetCheckboxes);
  }
  const missingBtn = document.getElementById('checkMissingItems');
  if (missingBtn) {
    missingBtn.addEventListener('click', checkMissingItems);
  }

  // Обработчик для открытия проекта (из мониторинга)
  document.addEventListener('openProject', (e) => {
    const projectId = e.detail?.projectId;
    if (projectId) {
      // Попытка загрузить JSON проекта из localStorage или из состояния
      // Для упрощения – просто показываем тост
      showToast(`Загружен проект ID: ${projectId}`, 'neutral');
    }
  });
}

export default {
  renderOpenOrder,
  resetCheckboxes,
  checkMissingItems,
  initOpenUI,
};