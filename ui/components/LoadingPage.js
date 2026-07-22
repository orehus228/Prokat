// ui/components/LoadingPage.js

/**
 * Компонент страницы расчёта загрузки грузовиков.
 * Отвечает за выбор грузовиков, запуск расчёта и отображение результатов.
 * @module ui/components/LoadingPage
 */

import { getState, subscribe, saveState } from '../../core/store.js';
import { emit, EVENTS, on } from '../../core/events.js';
import { esc, deepClone, formatDate } from '../../core/utils.js';
import { showToast } from '../toast.js';
import { showConfirm } from '../modal.js';
import { getTruckPresets, getTruckPresetById, getSelectedTruckIds, setSelectedTruckIds, addSelectedTruck, removeSelectedTruck, clearSelectedTrucks } from '../../services/trucks.js';
import { calculateOrderLoadingSync } from '../../services/loading.js';
import { formatWeight, formatVolume } from '../render-utils.js';
import { openTruckManager } from '../components/TruckManager.js';

// ============================================================
// КОМПОНЕНТ
// ============================================================

export class LoadingPage {
  /**
   * @param {HTMLElement} container - контейнер для рендеринга
   * @param {Object} callbacks - колбэки (например, onNavigate)
   */
  constructor(container, callbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this._handlers = [];
    this._unsubscribe = null;
    this._loadingResult = null;
  }

  /**
   * Инициализация компонента.
   */
  init() {
    // Подписываемся на изменения выбранных грузовиков
    this._unsubscribe = subscribe((changedKey, state) => {
      if (changedKey === 'selectedTruckIds' || changedKey === '*') {
        this._renderTruckSelection();
      }
    });

    // Слушаем события
    this._handlers.push(
      on(EVENTS.TRUCKS_SELECTED, () => this._renderTruckSelection()),
      on(EVENTS.EDITOR_DATA_CHANGED, () => this._renderTruckSelection())
    );

    this.render();
  }

  /**
   * Рендерит страницу.
   */
  render() {
    if (!this.container) return;
    this.container.innerHTML = this._getPageHTML();
    this._bindEvents();
    this._renderTruckSelection();
    this._renderResult();
  }

  /**
   * Возвращает HTML-разметку.
   */
  _getPageHTML() {
    return `
      <div class="card" id="loadingPage">
        <button class="btn btn-sec" id="btnBackToMenu">◀ В меню</button>
        <h3 style="color:var(--text-primary);font-weight:600;margin-bottom:12px;">🚚 Расчёт загрузки</h3>

        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:12px;">
          <button class="btn btn-green" id="calcLoadingBtn">📊 Рассчитать</button>
          <button class="btn btn-purple" id="manageTrucksBtn">🚛 Управление грузовиками</button>
          <button class="btn btn-sec" id="exportLoadingJson">📤 Экспорт JSON</button>
          <button class="btn btn-orange" id="exportLoadingPdf">📄 Экспорт PDF</button>
        </div>

        <div style="margin-bottom:12px;">
          <strong style="color:var(--text-secondary);">Выберите грузовики для загрузки:</strong>
          <div id="truckSelection" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;"></div>
        </div>

        <div id="loadingResult" style="margin-top:12px;"></div>
      </div>
    `;
  }

  // ============================================================
  // ПРИВЯЗКА СОБЫТИЙ
  // ============================================================

  _bindEvents() {
    const container = this.container;

    // Навигация назад
    const backBtn = container.querySelector('#btnBackToMenu');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (this.callbacks.onNavigate) this.callbacks.onNavigate('menu');
      });
    }

    // Расчёт
    container.querySelector('#calcLoadingBtn')?.addEventListener('click', () => {
      this._calculate();
    });

    // Управление грузовиками
    container.querySelector('#manageTrucksBtn')?.addEventListener('click', () => {
      openTruckManager(() => {
        this._renderTruckSelection();
      });
    });

    // Экспорт JSON
    container.querySelector('#exportLoadingJson')?.addEventListener('click', () => {
      this._exportJSON();
    });

    // Экспорт PDF
    container.querySelector('#exportLoadingPdf')?.addEventListener('click', () => {
      this._exportPDF();
    });

    // Делегирование для чекбоксов выбора грузовиков
    const selection = container.querySelector('#truckSelection');
    if (selection) {
      selection.addEventListener('change', (e) => {
        const cb = e.target.closest('.truck-check');
        if (cb) {
          const id = cb.value;
          if (cb.checked) {
            addSelectedTruck(id);
          } else {
            removeSelectedTruck(id);
          }
        }
      });
    }
  }

  // ============================================================
  // РЕНДЕРИНГ ВЫБОРА ГРУЗОВИКОВ
  // ============================================================

  _renderTruckSelection() {
    const container = this.container.querySelector('#truckSelection');
    if (!container) return;
    const presets = getTruckPresets();
    const selectedIds = getSelectedTruckIds();

    if (presets.length === 0) {
      container.innerHTML = '<span style="color:var(--text-muted);">Нет грузовиков. Добавьте в управлении.</span>';
      return;
    }

    let html = '';
    for (const t of presets) {
      const checked = selectedIds.includes(t.id) ? 'checked' : '';
      html += `
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:14px;color:var(--text-secondary);">
          <input type="checkbox" class="truck-check" value="${t.id}" ${checked}>
          ${esc(t.name)} (${t.length||0}x${t.width||0}x${t.height||0} см, макс. ${t.maxWeight||0} кг)
        </label>
      `;
    }
    container.innerHTML = html;
  }

  // ============================================================
  // РАСЧЁТ
  // ============================================================

  _calculate() {
    const selectedIds = getSelectedTruckIds();
    if (selectedIds.length === 0) {
      showToast('Выберите хотя бы один грузовик', 'warning');
      return;
    }

    try {
      const result = calculateOrderLoadingSync(selectedIds);
      this._loadingResult = result;
      this._renderResult();
      showToast('Расчёт выполнен', 'success');
    } catch (err) {
      showToast('Ошибка расчёта: ' + err.message, 'error');
    }
  }

  // ============================================================
  // РЕНДЕРИНГ РЕЗУЛЬТАТА
  // ============================================================

  _renderResult() {
    const container = this.container.querySelector('#loadingResult');
    if (!container) return;
    const result = this._loadingResult;
    if (!result) {
      container.innerHTML = '';
      return;
    }

    const totalItems = result.trucks.reduce((sum, t) => sum + t.items.length, 0);
    const failedCount = result.failedItems ? result.failedItems.length : 0;

    let html = `<div style="border-top:1px solid var(--border-color);padding-top:12px;">`;
    html += `<h4 style="color:var(--text-primary);">Результат расчёта</h4>`;
    html += `<div style="margin-bottom:8px;font-size:14px;color:var(--text-secondary);">`;
    html += `Всего загружено: ${totalItems} предметов, вес: ${formatWeight(result.totalWeight)}, объём: ${formatVolume(result.totalVolume)}`;
    if (failedCount > 0) {
      html += ` <span style="color:var(--danger);">⚠️ Не поместилось: ${failedCount} шт</span>`;
    }
    html += `</div>`;

    if (result.trucks.length === 0) {
      html += `<p style="color:var(--text-muted);">Ничего не загружено</p>`;
    } else {
      for (const truck of result.trucks) {
        const vol = truck.totalVolume || 0;
        html += `<div style="margin:8px 0;padding:10px;background:var(--bg-secondary);border-radius:6px;border-left:3px solid var(--accent);">`;
        html += `<strong>${esc(truck.truckName)}</strong> — ${truck.items.length} предметов, вес: ${formatWeight(truck.totalWeight)}, объём: ${formatVolume(vol)}`;
        html += `<div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">`;
        for (const item of truck.items) {
          const label = item.label || 'Предмет';
          html += `<div>• ${esc(label)} (${item.w}x${item.h}x${item.d} см, ${formatWeight(item.weight)})</div>`;
        }
        html += `</div></div>`;
      }
    }

    if (result.failedItems && result.failedItems.length > 0) {
      html += `<div style="margin:8px 0;padding:10px;background:var(--overstock-bg);border-radius:6px;border-left:3px solid var(--danger);">`;
      html += `<strong style="color:var(--danger);">Не поместились (${result.failedItems.length} шт):</strong>`;
      html += `<div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">`;
      for (const item of result.failedItems) {
        const label = item.label || 'Предмет';
        html += `<div>• ${esc(label)} (${item.width||0}x${item.height||0}x${item.depth||0} см, ${formatWeight(item.weight)})</div>`;
      }
      html += `</div></div>`;
    }

    html += `</div>`;
    container.innerHTML = html;
  }

  // ============================================================
  // ЭКСПОРТ
  // ============================================================

  _exportJSON() {
    if (!this._loadingResult) {
      showToast('Нет данных для экспорта', 'warning');
      return;
    }
    const name = 'Загрузка_' + new Date().toLocaleDateString('ru-RU');
    const data = {
      project_name: name,
      date: new Date().toISOString().split('T')[0],
      trucks: this._loadingResult.trucks.map(t => ({
        name: t.truckName,
        items: t.items.map(i => ({
          label: i.label || 'Предмет',
          width: i.w || 0,
          height: i.h || 0,
          depth: i.d || 0,
          weight: i.weight || 0,
        })),
        totalWeight: t.totalWeight,
        totalVolume: t.totalVolume,
      })),
      failedItems: (this._loadingResult.failedItems || []).map(i => ({
        label: i.label || 'Предмет',
        width: i.width || 0,
        height: i.height || 0,
        depth: i.depth || 0,
        weight: i.weight || 0,
      })),
      totalWeight: this._loadingResult.totalWeight,
      totalVolume: this._loadingResult.totalVolume,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'loading_plan.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('JSON экспортирован', 'success');
  }

  _exportPDF() {
    if (!this._loadingResult) {
      showToast('Нет данных для экспорта', 'warning');
      return;
    }
    const name = 'Загрузка_' + new Date().toLocaleDateString('ru-RU');

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
<h1>План загрузки: ${esc(name)}</h1>
<p>Дата: ${new Date().toLocaleDateString('ru-RU')}</p>`;

    for (const truck of this._loadingResult.trucks) {
      const vol = truck.totalVolume || 0;
      html += `<div class="truck"><h3>${esc(truck.truckName)}</h3>`;
      html += `<p>Предметов: ${truck.items.length}, вес: ${truck.totalWeight.toFixed(1)} кг, объём: ${vol.toFixed(3)} м³</p>`;
      for (const item of truck.items) {
        const label = item.label || 'Предмет';
        html += `<div class="item">• ${esc(label)} (${item.w}x${item.h}x${item.d} см, ${item.weight.toFixed(1)} кг)</div>`;
      }
      html += `</div>`;
    }

    if (this._loadingResult.failedItems && this._loadingResult.failedItems.length > 0) {
      html += `<div class="failed"><strong>Не поместились (${this._loadingResult.failedItems.length} шт):</strong>`;
      for (const item of this._loadingResult.failedItems) {
        const label = item.label || 'Предмет';
        html += `<div>• ${esc(label)} (${item.width||0}x${item.height||0}x${item.depth||0} см, ${item.weight||0} кг)</div>`;
      }
      html += `</div>`;
    }

    html += `<div class="summary">Общий вес: ${this._loadingResult.totalWeight.toFixed(1)} кг | Общий объём: ${this._loadingResult.totalVolume.toFixed(3)} м³</div>`;
    html += `<div style="margin-top:30px;display:flex;gap:12px;">
      <button onclick="window.print()" style="padding:10px 24px;background:#2c3e50;color:white;border:none;border-radius:6px;font-size:16px;cursor:pointer;">Сохранить PDF</button>
      <button onclick="window.close()" style="padding:10px 24px;background:#ddd;color:#333;border:none;border-radius:6px;font-size:16px;cursor:pointer;">Закрыть</button>
    </div>
</body></html>`;

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
  // УНИЧТОЖЕНИЕ
  // ============================================================

  destroy() {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    for (const handler of this._handlers) {
      if (typeof handler === 'function') handler();
    }
    this._handlers = [];
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

// ============================================================
// ФАБРИЧНАЯ ФУНКЦИЯ
// ============================================================

export function createLoadingPage(container, callbacks) {
  const page = new LoadingPage(container, callbacks);
  page.init();
  return page;
}

export default {
  LoadingPage,
  createLoadingPage,
};