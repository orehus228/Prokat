// components/order/presets.js
import { getState, saveState } from '../../core/state.js';
import { STORAGE_KEYS } from '../../core/config.js';
import { getOrder, getOrderSplits, getLinks, getNotes, getOrderPacking, getIndividualCaseValues, getCommonRoutes, getCaseModes, getOrderExclude, getOrderExtra, getTotalQty, getOrderProject } from '../../services/order-data.js';
import { getItemPropsByPath } from '../../services/calculations.js';
import { showToast } from '../../ui/toast.js';
import { showPrompt, showConfirm } from '../../ui/modal.js';
import { esc, getElement } from '../../ui/dom.js';
import { renderOrderAll } from './render.js';
import { invalidateFlatItemsCache } from './helpers.js';

// ============================================================
// ПОЛУЧЕНИЕ И СОХРАНЕНИЕ ПРЕСЕТОВ
// ============================================================

const ORDER_PRESETS_KEY = STORAGE_KEYS.ORDER_PRESETS;

function getOrderPresets() {
  try {
    const raw = localStorage.getItem(ORDER_PRESETS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveOrderPresets(presets) {
  localStorage.setItem(ORDER_PRESETS_KEY, JSON.stringify(presets));
}

// ============================================================
// НОРМАЛИЗАЦИЯ ДАННЫХ ПРЕСЕТА (конвертация старых форматов)
// ============================================================

function normalizePresetData(data) {
  // Нормализация packing: если есть поле qty, преобразуем в pieces
  if (data.packing) {
    for (let path in data.packing) {
      data.packing[path] = data.packing[path].map(p => {
        if (p.qty !== undefined && p.pieces === undefined) {
          return { caseId: p.caseId, pieces: p.qty };
        }
        return p;
      });
    }
  }
  return data;
}

// ============================================================
// ЗАПОЛНЕНИЕ SELECT
// ============================================================

export function populateOrderPresetSelect() {
  const select = document.getElementById('orderPresetSelect');
  if (!select) return;
  const presets = getOrderPresets();
  select.innerHTML = '<option value="">— Выберите пресет —</option>';
  presets.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = p.name;
    select.appendChild(opt);
  });
}

// ============================================================
// СОХРАНЕНИЕ ПРЕСЕТА
// ============================================================

export async function saveOrderPreset() {
  const name = await showPrompt('Сохранить пресет заказа', 'Введите имя пресета:', '', '');
  if (!name || !name.trim()) return;

  const presets = getOrderPresets();
  const existing = presets.find(p => p.name === name.trim());
  if (existing) {
    const overwrite = await showConfirm(`Пресет "${name.trim()}" уже существует. Перезаписать?`);
    if (!overwrite) return;
    const idx = presets.indexOf(existing);
    presets.splice(idx, 1);
  }

  const state = getState();
  const snapshot = {
    order: { ...state.order },
    splits: JSON.parse(JSON.stringify(state.orderSplits)),
    links: JSON.parse(JSON.stringify(state.links)),
    notes: { ...state.notes },
    packing: JSON.parse(JSON.stringify(state.orderPacking)),
    individualCases: JSON.parse(JSON.stringify(state.individualCaseValues)),
    routes: JSON.parse(JSON.stringify(state.commonRoutes)),
    caseModes: JSON.parse(JSON.stringify(state.caseModes)),
    exclude: { ...state.orderExclude },
    extra: { ...state.orderExtra },
  };

  presets.push({ name: name.trim(), data: snapshot });
  saveOrderPresets(presets);
  populateOrderPresetSelect();
  showToast('Пресет сохранён', 'success');
}

// ============================================================
// ЗАГРУЗКА ПРЕСЕТА
// ============================================================

export async function loadOrderPreset(overlay = true) {
  const select = document.getElementById('orderPresetSelect');
  const name = select.value;
  if (!name) {
    showToast('Выберите пресет', 'warning');
    return;
  }

  const presets = getOrderPresets();
  const preset = presets.find(p => p.name === name);
  if (!preset) {
    showToast('Пресет не найден', 'error');
    return;
  }

  // Нормализуем данные пресета перед загрузкой
  const data = normalizePresetData(preset.data);
  const state = getState();

  if (!overlay) {
    // Очищаем все поля заказа
    for (let key in state.order) delete state.order[key];
    for (let key in state.orderSplits) delete state.orderSplits[key];
    for (let key in state.links) delete state.links[key];
    for (let key in state.notes) delete state.notes[key];
    for (let key in state.orderPacking) delete state.orderPacking[key];
    for (let key in state.individualCaseValues) delete state.individualCaseValues[key];
    for (let key in state.commonRoutes) delete state.commonRoutes[key];
    for (let key in state.caseModes) delete state.caseModes[key];
    for (let key in state.orderExclude) delete state.orderExclude[key];
    for (let key in state.orderExtra) delete state.orderExtra[key];
  }

  if (overlay) {
    // Наложение: суммируем количества
    for (let path in data.order) {
      state.order[path] = (state.order[path] || 0) + data.order[path];
    }
    for (let path in data.splits) {
      if (!state.orderSplits[path]) state.orderSplits[path] = [];
      data.splits[path].forEach(seg => {
        state.orderSplits[path].push({ ...seg });
      });
    }
    for (let path in data.links) {
      if (!state.links[path]) state.links[path] = [];
      data.links[path].forEach(pl => {
        const existing = state.links[path].find(l => l.target === pl.target);
        if (existing) existing.multiplier += pl.multiplier;
        else state.links[path].push({ ...pl });
      });
    }
    for (let path in data.notes) {
      if (!state.notes[path]) state.notes[path] = data.notes[path];
    }
    for (let path in data.packing) {
      if (!state.orderPacking[path]) state.orderPacking[path] = [];
      data.packing[path].forEach(p => {
        // ИСПРАВЛЕНО: используем pieces вместо qty
        const existing = state.orderPacking[path].find(ep => ep.caseId === p.caseId);
        if (existing) {
          existing.pieces = (existing.pieces || 0) + (p.pieces || 0);
        } else {
          state.orderPacking[path].push({ caseId: p.caseId, pieces: p.pieces || 0 });
        }
      });
    }
    for (let path in data.individualCases) {
      if (!state.individualCaseValues[path]) state.individualCaseValues[path] = [];
      data.individualCases[path].forEach((v, idx) => {
        if (state.individualCaseValues[path][idx] !== undefined) {
          state.individualCaseValues[path][idx] += v;
        } else {
          state.individualCaseValues[path][idx] = v;
        }
      });
    }
    for (let path in data.routes) {
      if (!state.commonRoutes[path]) state.commonRoutes[path] = [];
      data.routes[path].forEach(r => {
        const existing = state.commonRoutes[path].find(er => er.target === r.target);
        if (existing) existing.multiplier += r.multiplier;
        else state.commonRoutes[path].push({ ...r });
      });
    }
    for (let path in data.caseModes) {
      if (!state.caseModes[path]) state.caseModes[path] = { ...data.caseModes[path] };
    }
    for (let path in data.exclude) {
      state.orderExclude[path] = true;
    }
    for (let path in data.extra) {
      state.orderExtra[path] = (state.orderExtra[path] || 0) + data.extra[path];
    }
  } else {
    // Замена: просто присваиваем
    Object.assign(state.order, data.order);
    Object.assign(state.orderSplits, JSON.parse(JSON.stringify(data.splits)));
    Object.assign(state.links, JSON.parse(JSON.stringify(data.links)));
    Object.assign(state.notes, data.notes);
    Object.assign(state.orderPacking, JSON.parse(JSON.stringify(data.packing)));
    Object.assign(state.individualCaseValues, JSON.parse(JSON.stringify(data.individualCases)));
    Object.assign(state.commonRoutes, JSON.parse(JSON.stringify(data.routes)));
    Object.assign(state.caseModes, JSON.parse(JSON.stringify(data.caseModes)));
    Object.assign(state.orderExclude, data.exclude);
    Object.assign(state.orderExtra, data.extra || {});
  }

  saveState();
  invalidateFlatItemsCache();
  renderOrderAll();
  showToast(`Пресет "${name}" загружен ${overlay ? '(наложение)' : '(замена)'}`, 'success');
}

// ============================================================
// УДАЛЕНИЕ ПРЕСЕТА
// ============================================================

export async function deleteOrderPreset() {
  const select = document.getElementById('orderPresetSelect');
  const name = select.value;
  if (!name) {
    showToast('Выберите пресет', 'warning');
    return;
  }
  const confirmed = await showConfirm(`Удалить пресет "${name}"?`);
  if (!confirmed) return;
  let presets = getOrderPresets();
  presets = presets.filter(p => p.name !== name);
  saveOrderPresets(presets);
  populateOrderPresetSelect();
  showToast('Пресет удалён', 'neutral');
}

// ============================================================
// ЭКСПОРТ ПРЕСЕТОВ
// ============================================================

export function exportOrderPresets() {
  const presets = getOrderPresets();
  if (presets.length === 0) {
    showToast('Нет пресетов для экспорта', 'warning');
    return;
  }
  const blob = new Blob([JSON.stringify(presets, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'order_presets.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Пресеты экспортированы', 'success');
}

// ============================================================
// ИМПОРТ ПРЕСЕТОВ
// ============================================================

export function importOrderPresets(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data)) throw new Error('Неверный формат: ожидается массив');
      data.forEach(p => {
        if (!p.name || typeof p.name !== 'string') throw new Error('У пресета отсутствует имя');
        if (!p.data || typeof p.data !== 'object') throw new Error('У пресета отсутствуют данные');
      });
      let presets = getOrderPresets();
      data.forEach(newP => {
        const idx = presets.findIndex(p => p.name === newP.name);
        if (idx !== -1) presets[idx] = newP;
        else presets.push(newP);
      });
      saveOrderPresets(presets);
      populateOrderPresetSelect();
      showToast('Пресеты импортированы', 'success');
    } catch (err) {
      showToast('Ошибка импорта: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

// ============================================================
// ЭКСПОРТ JSON И PDF (для текущего заказа)
// ============================================================

export function exportOrderJSON() {
  const state = getState();
  const projectName = document.getElementById('pName')?.value.trim() || 'Мероприятие';
  const date = document.getElementById('pDate')?.value || new Date().toLocaleDateString('ru-RU');
  const comment = document.getElementById('pComment')?.value.trim() || '';

  const data = {
    project_name: projectName,
    date: date,
    comment: comment,
    items: state.order,
    splits: state.orderSplits,
    specs: state.specs || {},
    packing: state.orderPacking,
    individual_cases: state.individualCaseValues,
    routes: state.commonRoutes,
    links: state.links,
    notes: state.notes,
    exclude: state.orderExclude,
    extra: state.orderExtra,
  };

  const totalItems = Object.keys(state.order).length + Object.keys(state.orderSplits).length + Object.keys(state.orderExtra).length;
  if (totalItems === 0 && Object.keys(state.orderPacking).length === 0) {
    showToast('Список пуст', 'warning');
    return;
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = projectName + '.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('JSON сохранён', 'success');
}

export function exportOrderPDF() {
  const state = getState();
  const projectName = document.getElementById('pName')?.value.trim() || 'Мероприятие';
  const date = document.getElementById('pDate')?.value || new Date().toLocaleDateString('ru-RU');
  const comment = document.getElementById('pComment')?.value.trim() || '';

  // Собираем позиции
  const items = [];
  for (let path in state.order) {
    if (state.order[path] > 0) items.push({ path, qty: state.order[path] });
  }
  for (let path in state.orderSplits) {
    state.orderSplits[path].forEach(seg => {
      if (seg.qty > 0) items.push({ path, qty: seg.qty });
    });
  }
  for (let path in state.orderExtra) {
    if (state.orderExtra[path] > 0) items.push({ path, qty: state.orderExtra[path] });
  }

  if (items.length === 0) {
    showToast('Нет позиций для экспорта', 'warning');
    return;
  }

  // Группировка по категориям
  const catItems = {};
  items.forEach(({ path, qty }) => {
    const parts = path.split('|');
    const cat = parts[0];
    const name = parts.slice(1).join(' → ');
    if (!catItems[cat]) catItems[cat] = [];
    catItems[cat].push({ name, qty });
  });

  let html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Чек-лист</title>
<style>
body{font-family:'Segoe UI',Arial,sans-serif;margin:40px;color:#222;background:#fff}
h1{color:#2c3e50;border-bottom:2px solid #3498db;padding-bottom:10px}
.meta{margin:20px 0;color:#555}
table{width:100%;border-collapse:collapse;margin-top:20px;font-size:14px}
th{background:#2c3e50;color:#fff;padding:8px;text-align:left}
td{padding:6px 8px;border-bottom:1px solid #ddd}
tr:nth-child(even){background:#f9f9f9}
.total-row{font-weight:bold;background:#e6f2ff!important;border-top:2px solid #3498db}
.grand-total{font-weight:bold;background:#d4e6ff!important;border-top:3px solid #1a3a5a;font-size:16px}
.actions{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);display:flex;gap:12px;background:white;padding:12px 24px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.2);z-index:1000;}
.actions .print{background:#2c3e50;color:white;}
.actions .close{background:#ddd;color:#333;}
</style>
</head><body>
<h1>Чек-лист: ${esc(projectName)}</h1>
<div class="meta"><strong>Дата:</strong> ${esc(date)}<br><strong>Комментарий:</strong> ${esc(comment || '—')}</div>
<table><thead><tr><th>Категория</th><th>Позиция</th><th>Кол-во (шт)</th></tr></thead><tbody>`;

  let grandQty = 0;
  const orderKeys = state._categoryOrder || Object.keys(state.inventory);
  orderKeys.forEach(cat => {
    if (!catItems[cat]) return;
    let first = true, catQty = 0;
    for (let item of catItems[cat]) {
      catQty += item.qty;
      html += `<tr><td>${first ? esc(cat) : ''}</td><td>${esc(item.name)}</td><td>${item.qty}</td></tr>`;
      first = false;
    }
    grandQty += catQty;
    html += `<tr class="total-row"><td colspan="2"><strong>Итого в категории</strong></td><td><strong>${catQty} шт</strong></td></tr>`;
  });
  html += `<tr class="grand-total"><td colspan="2"><strong>Общий итог</strong></td><td><strong>${grandQty} шт</strong></td></tr>`;
  html += `</tbody></table>
<div class="actions">
  <button class="print" onclick="window.print()">Сохранить PDF</button>
  <button class="close" onclick="window.close()">Назад</button>
</div>
</body></html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
    win.focus();
  } else {
    showToast('Не удалось открыть новую вкладку', 'error');
  }
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ ОБРАБОТЧИКОВ ПРЕСЕТОВ
// ============================================================

export function initOrderPresetsUI() {
  const saveBtn = document.getElementById('saveOrderPreset');
  const loadBtn = document.getElementById('loadOrderPreset');
  const deleteBtn = document.getElementById('deleteOrderPreset');
  const exportBtn = document.getElementById('exportOrderPresets');
  const importBtn = document.getElementById('importOrderPresetsBtn');
  const fileInput = document.getElementById('orderPresetFileInput');
  const overlayToggle = document.getElementById('orderOverlayToggle');

  if (saveBtn) {
    saveBtn.addEventListener('click', saveOrderPreset);
  }
  if (loadBtn) {
    loadBtn.addEventListener('click', async () => {
      const overlay = overlayToggle ? overlayToggle.checked : false;
      await loadOrderPreset(overlay);
    });
  }
  if (deleteBtn) {
    deleteBtn.addEventListener('click', deleteOrderPreset);
  }
  if (exportBtn) {
    exportBtn.addEventListener('click', exportOrderPresets);
  }
  if (importBtn && fileInput) {
    importBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', function(e) {
      if (this.files[0]) {
        importOrderPresets(this.files[0]);
        this.value = '';
      }
    });
  }

  populateOrderPresetSelect();
}

export default {
  getOrderPresets,
  saveOrderPresets,
  populateOrderPresetSelect,
  saveOrderPreset,
  loadOrderPreset,
  deleteOrderPreset,
  exportOrderPresets,
  importOrderPresets,
  exportOrderJSON,
  exportOrderPDF,
  initOrderPresetsUI,
};