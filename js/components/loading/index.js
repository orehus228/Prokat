// components/loading/index.js
import { getState, saveState } from '../../core/state.js';
import { getTruckPresets, addTruckPreset, updateTruckPreset, deleteTruckPreset } from '../../data/editor-data.js';
import { getActiveItemsOrder } from '../order/helpers.js';
import { getItemDimensions, calculateLoading } from '../../services/packing.js';
import { showToast } from '../../ui/toast.js';
import { showConfirm } from '../../ui/modal.js';
import { esc } from '../../ui/dom.js';
import { STORAGE_KEYS } from '../../core/config.js';

const SELECTED_TRUCKS_KEY = STORAGE_KEYS.SELECTED_TRUCKS;

// ============================================================
// СОСТОЯНИЕ
// ============================================================

let loadingResult = null;

// ============================================================
// ЗАГРУЗКА/СОХРАНЕНИЕ ВЫБРАННЫХ ГРУЗОВИКОВ
// ============================================================

function loadSelectedTrucks() {
  try {
    const saved = localStorage.getItem(SELECTED_TRUCKS_KEY);
    if (saved) {
      const ids = JSON.parse(saved);
      const presets = getTruckPresets();
      return ids.filter(id => presets.some(p => p.id === id));
    }
  } catch (e) {
    console.warn('Ошибка загрузки выбранных грузовиков', e);
  }
  return [];
}

function saveSelectedTrucks(ids) {
  localStorage.setItem(SELECTED_TRUCKS_KEY, JSON.stringify(ids));
}

// ============================================================
// ОСНОВНАЯ ФУНКЦИЯ РАСЧЁТА
// ============================================================

function runCalculation() {
  const items = getActiveItemsOrder();
  if (items.length === 0) {
    showToast('Нет позиций для расчёта', 'warning');
    return null;
  }

  let allCargo = [];
  for (let item of items) {
    const dims = getItemDimensions(item.path, item.qty);
    allCargo = allCargo.concat(dims);
  }

  if (allCargo.length === 0) {
    showToast('Нет груза для расчёта (все позиции без габаритов)', 'warning');
    return null;
  }

  const presets = getTruckPresets();
  const selectedIds = loadSelectedTrucks();
  const selectedTrucks = presets.filter(p => selectedIds.includes(p.id));
  if (selectedTrucks.length === 0) {
    showToast('Выберите хотя бы один грузовик', 'warning');
    return null;
  }

  // Преобразуем грузовики в формат для упаковки
  const trucks = selectedTrucks.map(t => ({
    id: t.id,
    name: t.name,
    width: t.width || 0,
    height: t.height || 0,
    depth: t.length || t.depth || 0,
    maxWeight: t.maxWeight || 0,
  }));

  const result = calculateLoading(trucks, allCargo);
  loadingResult = result;
  return result;
}

// ============================================================
// ЭКСПОРТ РЕЗУЛЬТАТОВ
// ============================================================

function exportLoadingJSON() {
  if (!loadingResult) {
    showToast('Нет данных для экспорта', 'warning');
    return;
  }
  const projectName = document.getElementById('pName')?.value.trim() || 'Загрузка';
  const data = {
    project_name: projectName,
    date: new Date().toLocaleDateString('ru-RU'),
    trucks: loadingResult.trucks.map(t => ({
      name: t.truckName,
      items: t.items.map(i => ({
        name: i.name,
        dimensions: `${i.w}x${i.h}x${i.d}`,
        weight: i.weight
      })),
      totalWeight: t.totalWeight,
      totalVolume: t.totalVolume
    })),
    failedItems: loadingResult.failedItems.map(i => ({
      name: i.name,
      dimensions: `${i.width||0}x${i.height||0}x${i.depth||0}`,
      weight: i.weight||0
    })),
    totalWeight: loadingResult.totalWeight,
    totalVolume: loadingResult.totalVolume
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'loading_plan.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('JSON экспортирован', 'success');
}

function exportLoadingPDF() {
  if (!loadingResult) {
    showToast('Нет данных для экспорта', 'warning');
    return;
  }
  const projectName = document.getElementById('pName')?.value.trim() || 'Загрузка';
  let html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>План загрузки</title>
<style>
body{font-family:'Segoe UI',Arial,sans-serif;margin:40px;color:#222;background:#fff}
h1{color:#2c3e50;border-bottom:2px solid #3498db;padding-bottom:10px}
.truck{margin:16px 0;padding:12px;border:1px solid #ddd;border-radius:6px;}
.truck h3{margin:0 0 8px 0;color:#2c3e50;}
.item{font-size:14px;padding:2px 0;border-bottom:1px solid #f0f0f0;}
.failed{color:#c0392b;background:#fde8e8;padding:12px;border-radius:6px;margin:12px 0;}
.summary{margin-top:20px;font-weight:bold;font-size:16px;}
</style>
</head><body>
<h1>План загрузки: ${esc(projectName)}</h1>
<p>Дата: ${new Date().toLocaleDateString('ru-RU')}</p>`;

  loadingResult.trucks.forEach((t, idx) => {
    html += `<div class="truck"><h3>${esc(t.truckName)}</h3>`;
    html += `<p>Предметов: ${t.items.length}, вес: ${t.totalWeight.toFixed(1)} кг, объём: ${t.totalVolume.toFixed(3)} м³</p>`;
    t.items.forEach(item => {
      html += `<div class="item">• ${esc(item.name)} (${item.w}x${item.h}x${item.d} см, ${item.weight.toFixed(1)} кг)</div>`;
    });
    html += `</div>`;
  });

  if (loadingResult.failedItems && loadingResult.failedItems.length > 0) {
    html += `<div class="failed"><strong>Не поместились:</strong>`;
    loadingResult.failedItems.forEach(item => {
      html += `<div>• ${esc(item.name)} (${item.width||0}x${item.height||0}x${item.depth||0} см, ${item.weight||0} кг)</div>`;
    });
    html += `</div>`;
  }

  html += `<div class="summary">Общий вес: ${loadingResult.totalWeight.toFixed(1)} кг | Общий объём: ${loadingResult.totalVolume.toFixed(3)} м³</div>`;
  html += `<div style="margin-top:30px;display:flex;gap:12px;">
    <button onclick="window.print()" style="padding:10px 24px;background:#2c3e50;color:white;border:none;border-radius:6px;font-size:16px;cursor:pointer;">Сохранить PDF</button>
    <button onclick="window.close()" style="padding:10px 24px;background:#ddd;color:#333;border:none;border-radius:6px;font-size:16px;cursor:pointer;">Назад</button>
  </div>`;
  html += `</body></html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
    win.focus();
  } else {
    showToast('Не удалось открыть окно', 'error');
  }
}

// ============================================================
// РЕНДЕРИНГ СТРАНИЦЫ
// ============================================================

export function renderLoadingPage() {
  const container = document.getElementById('loadingContent');
  if (!container) return;

  const presets = getTruckPresets();
  const selectedIds = loadSelectedTrucks();

  let html = `
    <div style="margin-bottom:16px;">
      <h3 style="color:var(--text-primary);font-weight:600;margin-bottom:12px;">Расчёт загрузки</h3>
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:12px;">
        <button class="btn btn-green" id="calcLoadingBtn">Рассчитать</button>
        <button class="btn btn-sec" id="manageTrucksBtn">Управление грузовиками</button>
      </div>
      <div style="margin-bottom:12px;">
        <strong style="color:var(--text-secondary);">Выберите грузовики для загрузки:</strong>
        <div id="truckSelection" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;"></div>
      </div>
    </div>
    <div id="loadingResult" style="margin-top:12px;"></div>
  `;

  container.innerHTML = html;

  // Рендерим выбор грузовиков
  const selectionContainer = document.getElementById('truckSelection');
  if (selectionContainer) {
    if (presets.length === 0) {
      selectionContainer.innerHTML = '<span style="color:var(--text-muted);">Нет грузовиков. Добавьте в управлении.</span>';
    } else {
      let selHtml = '';
      presets.forEach(t => {
        const checked = selectedIds.includes(t.id) ? 'checked' : '';
        selHtml += `
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:14px;color:var(--text-secondary);">
            <input type="checkbox" class="truck-check" value="${t.id}" ${checked}>
            ${esc(t.name)} (${t.length||0}x${t.width||0}x${t.height||0} см, макс. ${t.maxWeight||0} кг)
          </label>
        `;
      });
      selectionContainer.innerHTML = selHtml;

      selectionContainer.querySelectorAll('.truck-check').forEach(cb => {
        cb.addEventListener('change', () => {
          const ids = Array.from(selectionContainer.querySelectorAll('.truck-check:checked'))
            .map(c => c.value);
          saveSelectedTrucks(ids);
        });
      });
    }
  }

  // Кнопка расчёта
  document.getElementById('calcLoadingBtn')?.addEventListener('click', () => {
    const result = runCalculation();
    renderResult(result);
  });

  // Кнопка управления грузовиками
  document.getElementById('manageTrucksBtn')?.addEventListener('click', openTruckManager);
}

// ============================================================
// ОТРИСОВКА РЕЗУЛЬТАТА
// ============================================================

function renderResult(result) {
  const container = document.getElementById('loadingResult');
  if (!container) return;

  if (!result) {
    container.innerHTML = '';
    return;
  }

  let html = `<div style="border-top:1px solid var(--border-color);padding-top:12px;">`;
  html += `<h4 style="color:var(--text-primary);">Результат расчёта</h4>`;

  if (result.trucks.length === 0) {
    html += `<p style="color:var(--text-muted);">Ничего не загружено</p>`;
  } else {
    result.trucks.forEach((t, idx) => {
      html += `<div style="margin:8px 0;padding:10px;background:var(--bg-secondary);border-radius:6px;border-left:3px solid var(--accent);">`;
      html += `<strong>${esc(t.truckName)}</strong> — ${t.items.length} предметов, вес: ${t.totalWeight.toFixed(1)} кг, объём: ${t.totalVolume.toFixed(3)} м³`;
      html += `<div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">`;
      t.items.forEach(item => {
        const name = item.name || 'Предмет';
        html += `<div>• ${esc(name)} (${item.w}x${item.h}x${item.d} см, ${item.weight.toFixed(1)} кг)</div>`;
      });
      html += `</div></div>`;
    });
  }

  if (result.failedItems && result.failedItems.length > 0) {
    html += `<div style="margin:8px 0;padding:10px;background:var(--overstock-bg);border-radius:6px;border-left:3px solid var(--danger);">`;
    html += `<strong style="color:var(--danger);">Не поместились (${result.failedItems.length} шт):</strong>`;
    html += `<div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">`;
    result.failedItems.forEach(item => {
      const name = item.name || 'Предмет';
      html += `<div>• ${esc(name)} (${item.width||0}x${item.height||0}x${item.depth||0} см, ${item.weight||0} кг)</div>`;
    });
    html += `</div></div>`;
  }

  html += `<div style="margin-top:8px;font-size:14px;color:var(--text-secondary);">`;
  html += `<span>Общий вес: ${result.totalWeight.toFixed(1)} кг</span> | `;
  html += `<span>Общий объём: ${result.totalVolume.toFixed(3)} м³</span>`;
  html += `</div>`;

  html += `<div style="margin-top:12px;display:flex;gap:10px;">`;
  html += `<button class="btn btn-green" id="exportLoadingJson">Экспорт JSON</button>`;
  html += `<button class="btn btn-orange" id="exportLoadingPdf">Экспорт PDF</button>`;
  html += `</div>`;

  html += `</div>`;
  container.innerHTML = html;

  document.getElementById('exportLoadingJson')?.addEventListener('click', exportLoadingJSON);
  document.getElementById('exportLoadingPdf')?.addEventListener('click', exportLoadingPDF);
}

// ============================================================
// УПРАВЛЕНИЕ ГРУЗОВИКАМИ (МОДАЛКА)
// ============================================================

function openTruckManager() {
  const modal = document.getElementById('truckManagerModal');
  if (!modal) {
    showToast('Модалка управления грузовиками не найдена', 'error');
    return;
  }
  renderTruckList();
  modal.classList.add('open');
}

function renderTruckList() {
  const container = document.getElementById('truckList');
  const presets = getTruckPresets();
  if (presets.length === 0) {
    container.innerHTML = '<div class="empty-message">Нет грузовиков</div>';
    return;
  }
  let html = '';
  presets.forEach(t => {
    html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-bottom:1px solid var(--border-color);gap:10px;">
      <div><strong>${esc(t.name)}</strong><br>
      <span style="font-size:13px;color:var(--text-secondary);">${t.length||0}x${t.width||0}x${t.height||0} см, макс. вес: ${t.maxWeight||0} кг</span></div>
      <div>
        <button class="btn btn-sm" onclick="window.editTruck('${t.id}')">✏️</button>
        <button class="btn btn-sm" onclick="window.deleteTruck('${t.id}')" style="background:var(--danger);color:white;">✕</button>
      </div>
    </div>`;
  });
  container.innerHTML = html;
}

window.editTruck = function(id) {
  const presets = getTruckPresets();
  const t = presets.find(p => p.id === id);
  if (!t) return;
  document.getElementById('truckName').value = t.name || '';
  document.getElementById('truckLength').value = t.length || '';
  document.getElementById('truckWidth').value = t.width || '';
  document.getElementById('truckHeight').value = t.height || '';
  document.getElementById('truckMaxWeight').value = t.maxWeight || '';
  const addBtn = document.getElementById('truckAddBtn');
  addBtn.textContent = 'Обновить';
  addBtn.dataset.editId = id;
};

window.deleteTruck = async function(id) {
  const confirmed = await showConfirm('Удалить грузовик?');
  if (!confirmed) return;
  deleteTruckPreset(id);
  // Удаляем из выбранных
  const selected = loadSelectedTrucks();
  saveSelectedTrucks(selected.filter(tid => tid !== id));
  renderTruckList();
  renderLoadingPage();
  showToast('Грузовик удалён', 'neutral');
};

// ============================================================
// ИНИЦИАЛИЗАЦИЯ ОБРАБОТЧИКОВ
// ============================================================

export function initTruckManagerHandlers() {
  const addBtn = document.getElementById('truckAddBtn');
  if (addBtn) {
    addBtn.addEventListener('click', function() {
      const name = document.getElementById('truckName').value.trim();
      const length = parseFloat(document.getElementById('truckLength').value);
      const width = parseFloat(document.getElementById('truckWidth').value);
      const height = parseFloat(document.getElementById('truckHeight').value);
      const maxWeight = parseFloat(document.getElementById('truckMaxWeight').value);
      if (!name) { showToast('Введите название', 'warning'); return; }
      if (isNaN(length) || length <= 0) { showToast('Введите длину', 'warning'); return; }
      if (isNaN(width) || width <= 0) { showToast('Введите ширину', 'warning'); return; }
      if (isNaN(height) || height <= 0) { showToast('Введите высоту', 'warning'); return; }
      const editId = this.dataset.editId;
      if (editId) {
        updateTruckPreset(editId, { name, length, width, height, maxWeight: isNaN(maxWeight)?0:maxWeight });
        showToast('Грузовик обновлён', 'success');
      } else {
        addTruckPreset({ name, length, width, height, maxWeight: isNaN(maxWeight)?0:maxWeight });
        showToast('Грузовик добавлен', 'success');
      }
      document.getElementById('truckName').value = '';
      document.getElementById('truckLength').value = '';
      document.getElementById('truckWidth').value = '';
      document.getElementById('truckHeight').value = '';
      document.getElementById('truckMaxWeight').value = '';
      this.textContent = '+ Добавить';
      delete this.dataset.editId;
      renderTruckList();
      renderLoadingPage();
    });
  }

  const closeBtn = document.getElementById('truckManagerClose');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      document.getElementById('truckManagerModal').classList.remove('open');
    });
  }

  const overlay = document.getElementById('truckManagerModal');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('open');
      }
    });
  }
}

export default {
  renderLoadingPage,
  initTruckManagerHandlers,
};