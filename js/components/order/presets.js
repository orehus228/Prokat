// components/order/presets.js
import { getState, saveState } from '../../core/state.js';
import { STORAGE_KEYS } from '../../core/config.js';
import { getOrder, getOrderSplits, getLinks, getNotes, getOrderPacking, getIndividualCaseValues, getCommonRoutes, getCaseModes, getOrderExclude, getOrderExtra, getTotalQty, getOrderProject, getOrderSubrent } from '../../services/order-data.js';
import { getItemPropsByPath } from '../../services/calculations.js';
import { getAvailableQuantity } from '../../services/project-data.js';
import { showToast } from '../../ui/toast.js';
import { showPrompt, showConfirm } from '../../ui/modal.js';
import { esc, getElement } from '../../ui/dom.js';
import { renderOrderAll } from './render.js';
import { invalidateFlatItemsCache } from './helpers.js';
import { CAT_NAMES } from '../../core/config.js';
import { getCommonCases } from '../../data/editor-data.js';
import * as calc from '../../services/calculations.js';

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
// НОРМАЛИЗАЦИЯ ДАННЫХ ПРЕСЕТА
// ============================================================

function normalizePresetData(data) {
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
  // Субаренда — массив объектов, нормализация не требуется
  if (data.subrent && Array.isArray(data.subrent)) {
    data.subrent = data.subrent.map(item => ({
      id: item.id || 'subrent_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      name: item.name || 'Без названия',
      qty: Math.max(1, parseInt(item.qty) || 1),
      weight: parseFloat(item.weight) || 0,
      dimensions: item.dimensions || '',
      counterparty: item.counterparty || '',
      start_date: item.start_date || '',
      end_date: item.end_date || '',
      comment: item.comment || '',
    }));
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
    subrent: JSON.parse(JSON.stringify(state.orderSubrent)), // <-- ДОБАВЛЕНО
  };

  presets.push({ name: name.trim(), data: snapshot });
  saveOrderPresets(presets);
  populateOrderPresetSelect();
  showToast('Пресет сохранён', 'success');
}

// ============================================================
// ЗАГРУЗКА ПРЕСЕТА (С ПРОВЕРКОЙ ДОСТУПНОСТИ)
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

  const data = normalizePresetData(preset.data);
  const state = getState();
  const project = getOrderProject();

  // Список пропущенных позиций
  const skipped = [];

  // Вспомогательная функция для проверки доступности
  function checkAvailability(path, requestedQty) {
    if (requestedQty <= 0) return true;
    if (!project.start_date || !project.end_date) return true;

    const result = getAvailableQuantity(path, project.start_date, project.end_date, requestedQty, project.id);
    if (result.isConflict) {
      const conflictNames = result.conflicts.map(c => `${c.project} (${c.quantity} шт)`).join(', ');
      console.warn(`[presets] Конфликт для "${path}": доступно ${result.available}, конфликты: ${conflictNames}`);
      return false;
    }
    return true;
  }

  function checkPathWithOverlay(path, addedQty) {
    const currentQty = getTotalQty(path);
    const totalAfter = currentQty + addedQty;
    return checkAvailability(path, totalAfter);
  }

  // --- Обработка order (прямые количества) ---
  if (data.order) {
    for (let path in data.order) {
      const addedQty = data.order[path];
      if (addedQty <= 0) continue;
      if (overlay) {
        if (!checkPathWithOverlay(path, addedQty)) {
          skipped.push(path + ' (order)');
          continue;
        }
        state.order[path] = (state.order[path] || 0) + addedQty;
      } else {
        if (!checkAvailability(path, addedQty)) {
          skipped.push(path + ' (order)');
          continue;
        }
        state.order[path] = addedQty;
      }
    }
  }

  // --- Обработка splits ---
  if (data.splits) {
    for (let path in data.splits) {
      const segments = data.splits[path] || [];
      if (segments.length === 0) continue;
      const totalAdded = segments.reduce((s, seg) => s + (seg.qty || 0), 0);
      if (totalAdded <= 0) continue;
      if (overlay) {
        if (!checkPathWithOverlay(path, totalAdded)) {
          skipped.push(path + ' (splits)');
          continue;
        }
        if (!state.orderSplits[path]) state.orderSplits[path] = [];
        segments.forEach(seg => {
          state.orderSplits[path].push({ ...seg });
        });
      } else {
        if (!checkAvailability(path, totalAdded)) {
          skipped.push(path + ' (splits)');
          continue;
        }
        state.orderSplits[path] = segments.map(seg => ({ ...seg }));
      }
    }
  }

  // --- Обработка links (матрица привязок) ---
  if (data.links) {
    for (let src in data.links) {
      const links = data.links[src] || [];
      if (links.length === 0) continue;
      // Проверку не делаем, так как links не изменяют количество напрямую
      if (overlay) {
        if (!state.links[src]) state.links[src] = [];
        links.forEach(pl => {
          const existing = state.links[src].find(l => l.target === pl.target);
          if (existing) existing.multiplier += pl.multiplier;
          else state.links[src].push({ ...pl });
        });
      } else {
        state.links[src] = links.map(pl => ({ ...pl }));
      }
    }
  }

  // --- Обработка notes ---
  if (data.notes) {
    for (let path in data.notes) {
      if (overlay) {
        if (!state.notes[path]) state.notes[path] = data.notes[path];
      } else {
        state.notes[path] = data.notes[path];
      }
    }
  }

  // --- Обработка packing (общие кофры) ---
  if (data.packing) {
    for (let path in data.packing) {
      const packingItems = data.packing[path] || [];
      if (packingItems.length === 0) continue;
      const totalAdded = packingItems.reduce((s, p) => s + (p.pieces || 0), 0);
      if (totalAdded <= 0) continue;
      if (overlay) {
        if (!checkPathWithOverlay(path, totalAdded)) {
          skipped.push(path + ' (packing)');
          continue;
        }
        if (!state.orderPacking[path]) state.orderPacking[path] = [];
        packingItems.forEach(p => {
          const existing = state.orderPacking[path].find(ep => ep.caseId === p.caseId);
          if (existing) {
            existing.pieces = (existing.pieces || 0) + (p.pieces || 0);
          } else {
            state.orderPacking[path].push({ caseId: p.caseId, pieces: p.pieces || 0 });
          }
        });
      } else {
        if (!checkAvailability(path, totalAdded)) {
          skipped.push(path + ' (packing)');
          continue;
        }
        state.orderPacking[path] = packingItems.map(p => ({ caseId: p.caseId, pieces: p.pieces || 0 }));
      }
    }
  }

  // --- Обработка individualCases (индивидуальные кофры) ---
  if (data.individualCases) {
    for (let path in data.individualCases) {
      const vals = data.individualCases[path] || [];
      const totalAdded = vals.reduce((a, b) => a + b, 0);
      if (totalAdded <= 0) continue;
      if (overlay) {
        if (!checkPathWithOverlay(path, totalAdded)) {
          skipped.push(path + ' (individualCases)');
          continue;
        }
        if (!state.individualCaseValues[path]) state.individualCaseValues[path] = [];
        vals.forEach((v, idx) => {
          if (state.individualCaseValues[path][idx] !== undefined) {
            state.individualCaseValues[path][idx] += v;
          } else {
            state.individualCaseValues[path][idx] = v;
          }
        });
      } else {
        if (!checkAvailability(path, totalAdded)) {
          skipped.push(path + ' (individualCases)');
          continue;
        }
        state.individualCaseValues[path] = vals.map(v => v);
      }
    }
  }

  // --- Обработка routes ---
  if (data.routes) {
    for (let path in data.routes) {
      const routes = data.routes[path] || [];
      if (routes.length === 0) continue;
      if (overlay) {
        if (!state.commonRoutes[path]) state.commonRoutes[path] = [];
        routes.forEach(r => {
          const existing = state.commonRoutes[path].find(er => er.target === r.target);
          if (existing) existing.multiplier += r.multiplier;
          else state.commonRoutes[path].push({ ...r });
        });
      } else {
        state.commonRoutes[path] = routes.map(r => ({ ...r }));
      }
    }
  }

  // --- Обработка caseModes ---
  if (data.caseModes) {
    for (let path in data.caseModes) {
      if (overlay) {
        if (!state.caseModes[path]) state.caseModes[path] = { ...data.caseModes[path] };
      } else {
        state.caseModes[path] = { ...data.caseModes[path] };
      }
    }
  }

  // --- Обработка exclude ---
  if (data.exclude) {
    for (let path in data.exclude) {
      state.orderExclude[path] = true;
    }
  }

  // --- Обработка extra (остаток вне кофров) ---
  if (data.extra) {
    for (let path in data.extra) {
      const addedQty = data.extra[path] || 0;
      if (addedQty <= 0) continue;
      if (overlay) {
        if (!checkPathWithOverlay(path, addedQty)) {
          skipped.push(path + ' (extra)');
          continue;
        }
        state.orderExtra[path] = (state.orderExtra[path] || 0) + addedQty;
      } else {
        if (!checkAvailability(path, addedQty)) {
          skipped.push(path + ' (extra)');
          continue;
        }
        state.orderExtra[path] = addedQty;
      }
    }
  }

  // --- Обработка subrent (субаренда) ---
  if (data.subrent && Array.isArray(data.subrent) && data.subrent.length > 0) {
    if (overlay) {
      // Добавляем новые элементы, избегая дублирования по id
      const existingIds = new Set(state.orderSubrent.map(item => item.id));
      data.subrent.forEach(item => {
        if (!existingIds.has(item.id)) {
          state.orderSubrent.push({ ...item });
          existingIds.add(item.id);
        } else {
          // Если id совпадает, можно обновить существующий (опционально)
          // Для простоты пропускаем дубли
        }
      });
    } else {
      state.orderSubrent = data.subrent.map(item => ({ ...item }));
    }
  }

  // Сохраняем состояние
  saveState();
  invalidateFlatItemsCache();
  renderOrderAll();

  // Показываем уведомление о пропущенных позициях
  if (skipped.length > 0) {
    showToast(`Пропущены позиции из-за конфликтов: ${skipped.join(', ')}`, 'warning', 5000);
  } else {
    showToast(`Пресет "${name}" загружен ${overlay ? '(наложение)' : '(замена)'}`, 'success');
  }
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
// ЭКСПОРТ JSON
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
    subrent: state.orderSubrent || [], // <-- ДОБАВЛЕНО
  };

  const totalItems = Object.keys(state.order).length + Object.keys(state.orderSplits).length + Object.keys(state.orderExtra).length;
  if (totalItems === 0 && Object.keys(state.orderPacking).length === 0 && state.orderSubrent.length === 0) {
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

// ============================================================
// ЭКСПОРТ PDF (с добавлением субаренды)
// ============================================================

export function exportOrderPDF() {
  const state = getState();
  const projectName = document.getElementById('pName')?.value.trim() || 'Мероприятие';

  const allPaths = new Set();
  for (let p in state.order) {
    if (state.order[p] > 0) allPaths.add(p);
  }
  for (let p in state.orderPacking) {
    const total = state.orderPacking[p].reduce((s, item) => s + (item.pieces || 0), 0);
    if (total > 0) allPaths.add(p);
  }
  for (let p in state.individualCaseValues) {
    const total = state.individualCaseValues[p].reduce((a, b) => a + b, 0);
    if (total > 0) allPaths.add(p);
  }
  for (let p in state.orderExtra) {
    if (state.orderExtra[p] > 0) allPaths.add(p);
  }

  const catMap = {};
  const commonCases = getCommonCases();
  const commonCasesUsed = {};

  allPaths.forEach(path => {
    const packing = state.orderPacking[path] || [];
    const totalPacked = packing.reduce((s, item) => s + (item.pieces || 0), 0);
    const extra = state.orderExtra[path] || 0;
    const qty = totalPacked + extra + (state.order[path] || 0);
    if (qty <= 0) return;

    const parts = path.split('|');
    const cat = parts[0];
    const name = parts.slice(1).join(' → ');
    const props = getItemPropsByPath(path);
    const unitWeight = props.weight || 0;
    const mode = state.caseModes[path] || {};
    const individualVals = state.individualCaseValues[path] || [];

    let weightContent = 0;
    if (packing.length > 0) {
      packing.forEach(p => {
        weightContent += p.pieces * unitWeight;
      });
      if (extra > 0) weightContent += extra * unitWeight;
      packing.forEach(p => {
        const c = commonCases.find(c => c.id === p.caseId);
        if (c) {
          if (!commonCasesUsed[p.caseId]) {
            commonCasesUsed[p.caseId] = {
              name: c.name,
              dims: c.dimensions || '?',
              emptyWeight: c.emptyWeight || 0,
              maxWeight: c.maxWeight || 0,
              items: [],
              totalContentWeight: 0
            };
          }
          commonCasesUsed[p.caseId].items.push({ name, pieces: p.pieces });
          commonCasesUsed[p.caseId].totalContentWeight += p.pieces * unitWeight;
        }
      });
    } else if (individualVals.length > 0 && mode.enabled) {
      weightContent = qty * unitWeight;
    } else {
      weightContent = qty * unitWeight;
    }

    const volume = calc.calcItemVolume(path, qty, mode, packing, individualVals, extra);

    const spec = state.specs[path] || '';
    const note = state.notes[path] || '';

    let caseInfo = '';
    if (packing.length > 0) {
      const caseDetails = packing.map(p => {
        const c = commonCases.find(c => c.id === p.caseId);
        const caseName = c ? c.name : 'удалённый кофр';
        return `${caseName} (${p.pieces} шт)`;
      }).join(', ');
      caseInfo = `Кофр: ${caseDetails}`;
    } else if (individualVals.length > 0 && mode.enabled) {
      const options = calc.getCaseOptions(path);
      const details = individualVals.map((v, idx) => {
        if (v <= 0) return null;
        const opt = options[idx] || options[0];
        const casesCount = Math.ceil(v / opt.qty);
        return `вариант ${idx+1} (${v} шт, ${casesCount} кофр)`;
      }).filter(Boolean).join(', ');
      caseInfo = `индивидуальные кофры: ${details}`;
    } else if (extra > 0 && packing.length === 0) {
      caseInfo = `вне кофра (${extra} шт)`;
    }

    if (!catMap[cat]) catMap[cat] = [];
    catMap[cat].push({ name, qty, weight: weightContent, volume, caseInfo, spec, note, path });
  });

  // --- Субаренда ---
  const subrentItems = getOrderSubrent();

  // Формируем HTML
  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Чек-лист</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 20px; font-size: 12px; color: #222; background: #fff; }
    h1 { font-size: 18px; margin: 0 0 10px 0; color: #2c3e50; border-bottom: 1px solid #ccc; padding-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { background: #2c3e50; color: #fff; padding: 6px 8px; text-align: left; font-weight: 600; font-size: 12px; }
    td { padding: 4px 8px; border-bottom: 1px solid #e0e0e0; vertical-align: top; }
    .cat-header { background: #f0f4f8; font-weight: 700; font-size: 13px; border-top: 2px solid #2c3e50; }
    .cat-header td { padding: 6px 8px; }
    .item td { padding: 3px 8px; }
    .qty { text-align: center; white-space: nowrap; }
    .weight { text-align: right; white-space: nowrap; }
    .volume { text-align: right; white-space: nowrap; }
    .case-info { font-size: 12px; font-weight: bold; color: #1a3a5a; background: #eaf2f8; padding: 2px 6px; border-radius: 3px; display: inline-block; }
    .extra-info { font-size: 11px; margin-top: 2px; padding: 2px 6px; border-radius: 3px; display: inline-block; }
    .spec-info { background: #fff3cd; border: 1px solid #ffc107; color: #856404; }
    .note-info { background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; }
    .subrent-row td { background: #e8f0fe; }
    .common-cases { margin-top: 12px; border-top: 2px solid #2c3e50; padding-top: 8px; }
    .common-cases h3 { font-size: 14px; margin: 4px 0 6px 0; color: #2c3e50; }
    .case-detail { font-size: 12px; padding: 4px 0; border-bottom: 1px solid #eee; }
    .case-detail strong { color: #1a3a5a; }
    .case-detail .case-weight { font-weight: bold; color: #c0392b; }
    .case-items { margin-left: 16px; font-size: 12px; color: #444; }
    .totals { margin-top: 12px; padding: 8px 12px; background: #e6f2ff; border-radius: 4px; font-weight: 600; font-size: 13px; display: flex; gap: 20px; flex-wrap: wrap; }
    .totals span { white-space: nowrap; }
    .actions { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); display: flex; gap: 12px; background: white; padding: 8px 20px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); z-index: 1000; }
    .actions button { padding: 6px 18px; border: none; border-radius: 4px; font-size: 13px; cursor: pointer; }
    .print { background: #2c3e50; color: white; }
    .close { background: #ddd; color: #333; }
    @media print { .actions { display: none; } body { margin: 10px; } }
  </style>
</head>
<body>
<h1>Чек-лист: ${esc(projectName)}</h1>
<table>
  <thead>
    <tr><th style="width:14%;">Категория</th><th style="width:30%;">Позиция</th><th style="width:8%;text-align:center;">Кол-во</th><th style="width:10%;text-align:right;">Вес, кг</th><th style="width:10%;text-align:right;">Объём, м³</th><th style="width:28%;">Упаковка / Контрагент</th></tr>
  </thead>
  <tbody>`;

  let grandQty = 0, grandWeightContent = 0, grandVolume = 0;
  const orderKeys = state._categoryOrder || Object.keys(state.inventory);

  orderKeys.forEach(cat => {
    if (!catMap[cat]) return;
    const items = catMap[cat];
    let catQty = 0, catWeight = 0, catVolume = 0;
    html += `<tr class="cat-header"><td colspan="6"><strong>${CAT_NAMES[cat] || cat}</strong></td></tr>`;
    items.forEach(item => {
      catQty += item.qty;
      catWeight += item.weight;
      catVolume += item.volume;
      let extraText = '';
      if (item.spec) extraText += `<div class="extra-info spec-info">Описание: ${esc(item.spec)}</div>`;
      if (item.note) extraText += `<div class="extra-info note-info">Заметка: ${esc(item.note)}</div>`;
      html += `<tr class="item">
        <td></td>
        <td>${esc(item.name)}${extraText}</td>
        <td class="qty">${item.qty}</td>
        <td class="weight">${item.weight.toFixed(1)}</td>
        <td class="volume">${item.volume.toFixed(3)}</td>
        <td class="case-info">${item.caseInfo ? esc(item.caseInfo) : ''}</td>
      </tr>`;
    });
    html += `<tr style="font-weight:600;background:#f8fafc;border-top:1px solid #ccc;">
      <td colspan="2" style="text-align:right;">Итого в категории:</td>
      <td class="qty">${catQty}</td>
      <td class="weight">${catWeight.toFixed(1)}</td>
      <td class="volume">${catVolume.toFixed(3)}</td>
      <td></td>
    </tr>`;
    grandQty += catQty;
    grandWeightContent += catWeight;
    grandVolume += catVolume;
  });

  // --- Субаренда ---
  if (subrentItems.length > 0) {
    let subrentQty = 0, subrentWeight = 0, subrentVolume = 0;
    html += `<tr class="cat-header"><td colspan="6"><strong>🔄 Субаренда</strong></td></tr>`;
    subrentItems.forEach(item => {
      const qty = item.qty || 0;
      const weight = (item.weight || 0) * qty;
      let volume = 0;
      if (item.dimensions) {
        const dims = item.dimensions.split('x').map(parseFloat);
        if (dims.length === 3 && dims.every(v => !isNaN(v) && v > 0)) {
          volume = (dims[0] * dims[1] * dims[2]) / 1000000 * qty;
        }
      }
      subrentQty += qty;
      subrentWeight += weight;
      subrentVolume += volume;
      const info = [
        item.counterparty ? 'Контрагент: ' + esc(item.counterparty) : '',
        item.start_date ? 'с ' + esc(item.start_date) : '',
        item.end_date ? 'по ' + esc(item.end_date) : '',
        item.comment ? '(' + esc(item.comment) + ')' : ''
      ].filter(Boolean).join(' ');
      html += `<tr class="item subrent-row">
        <td></td>
        <td>🔄 ${esc(item.name)}<div class="extra-info" style="font-size:11px;color:#555;">${info}</div></td>
        <td class="qty">${qty}</td>
        <td class="weight">${weight.toFixed(1)}</td>
        <td class="volume">${volume.toFixed(3)}</td>
        <td></td>
      </tr>`;
    });
    html += `<tr style="font-weight:600;background:#f8fafc;border-top:1px solid #ccc;">
      <td colspan="2" style="text-align:right;">Итого субаренда:</td>
      <td class="qty">${subrentQty}</td>
      <td class="weight">${subrentWeight.toFixed(1)}</td>
      <td class="volume">${subrentVolume.toFixed(3)}</td>
      <td></td>
    </tr>`;
    grandQty += subrentQty;
    grandWeightContent += subrentWeight;
    grandVolume += subrentVolume;
  }

  html += `</tbody></table>`;

  // Блок общих кофров
  const usedCaseIds = Object.keys(commonCasesUsed);
  let totalCaseWeight = 0;
  if (usedCaseIds.length > 0) {
    html += `<div class="common-cases"><h3>Общие кофры</h3>`;
    usedCaseIds.forEach(caseId => {
      const data = commonCasesUsed[caseId];
      const caseFullWeight = data.totalContentWeight + data.emptyWeight;
      totalCaseWeight += caseFullWeight;
      html += `<div class="case-detail">
        <strong>${esc(data.name)}</strong> — габариты: ${esc(data.dims)}, вес пустого: ${data.emptyWeight} кг, макс. вес: ${data.maxWeight} кг, <span class="case-weight">вес с содержимым: ${caseFullWeight.toFixed(1)} кг</span>
        <div class="case-items">`;
      data.items.forEach(item => {
        html += `<div>${esc(item.name)} — ${item.pieces} шт</div>`;
      });
      html += `</div></div>`;
    });
    html += `</div>`;
  }

  const grandTotalWeight = grandWeightContent + totalCaseWeight;
  html += `<div class="totals">
    <span>Всего: ${grandQty} шт</span>
    <span>Общий вес: ${grandTotalWeight.toFixed(1)} кг</span>
    <span>Общий объём: ${grandVolume.toFixed(3)} м³</span>
  </div>`;

  html += `<div class="actions">
    <button class="print" onclick="window.print()">Сохранить PDF</button>
    <button class="close" onclick="window.close()">Закрыть</button>
  </div>
</body></html>`;

  const win = window.open('', '_blank', 'width=900,height=700');
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