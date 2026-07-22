// ui/components/MatrixModal.js

import { getState, subscribe } from '../../core/store.js';
import { emit, EVENTS } from '../../core/events.js';
import { esc, getItemName, getCategory, debounce } from '../../core/utils.js';
import { MATRIX_BASE } from '../../core/config.js';
import { showToast } from '../toast.js';
import { showPrompt, showConfirm } from '../modal.js';
import {
  getMatrixLinks,
  setMatrixLinks,
  addMatrixLink,
  removeMatrixLink,
  clearMatrixLinks,
  getMatrixPresets,
  createMatrixPreset,
  loadMatrixPreset,
  deleteMatrixPreset,
  renameMatrixPreset,
  exportMatrixPresets,
  importMatrixPresets,
  getMatrixCellValue,
} from '../../services/matrix.js';
import { getInventory, getCategoryOrder } from '../../services/inventory.js';
import { CAT_NAMES } from '../../core/config.js';

let matrixInstance = null;

export class MatrixModal {
  constructor(options = {}) {
    this.options = options;
    this.sourcePath = options.sourcePath || null;
    this.showPresets = options.showPresets !== undefined ? options.showPresets : true;
    this.category = options.category || null;
    this.onClose = options.onClose || null;
    this.zoomLevel = 1;
    this.openCategories = [];
    this.scrollToPath = null;
    this.fullNames = true;
    this._unsubscribe = null;
    this._modalEl = null;
    this._container = null;
  }

  init() {
    let modal = document.getElementById('matrixModal');
    if (!modal) {
      modal = this._createModalDOM();
      document.body.appendChild(modal);
    }
    this._modalEl = modal;
    this._container = modal.querySelector('#matrixContainer');
    this._bindEvents();
    this._loadFullNamesState();
    this._populatePresetSelect();
    this._render();
    this._modalEl.classList.add('open');
    matrixInstance = this;
  }

  _createModalDOM() {
    const div = document.createElement('div');
    div.className = 'modal-overlay';
    div.id = 'matrixModal';
    div.innerHTML = `
      <div class="modal" style="max-width:95vw;max-height:85vh;overflow:hidden;display:flex;flex-direction:column;">
        <h3 style="color:var(--text-primary);">📊 Матрица привязок</h3>
        <div class="filter-row" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
          <input type="text" id="matrixSearchSource" placeholder="Фильтр источников" style="flex:1;padding:6px 10px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:4px;color:var(--text-primary);">
          <input type="text" id="matrixSearchTarget" placeholder="Фильтр целей" style="flex:1;padding:6px 10px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:4px;color:var(--text-primary);">
        </div>

        <div class="matrix-zoom-controls">
          <span class="zoom-label">Масштаб:</span>
          <button class="zoom-btn" data-zoom="0.5">50%</button>
          <button class="zoom-btn" data-zoom="0.75">75%</button>
          <button class="zoom-btn active" data-zoom="1">100%</button>
          <button class="zoom-btn" data-zoom="1.25">125%</button>
          <button class="zoom-btn" data-zoom="1.5">150%</button>
          <span id="matrixZoomLevelLabel" style="min-width:50px;text-align:center;color:var(--text-secondary);font-size:14px;">100%</span>
        </div>

        <div id="matrixPresetPanel" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;align-items:center;">
          <button class="btn btn-sm" id="matrixSavePreset">💾 Сохранить</button>
          <button class="btn btn-sm" id="matrixLoadPreset">📂 Загрузить</button>
          <button class="btn btn-sm" id="matrixDeletePreset">✕ Удалить</button>
          <button class="btn btn-sm" id="matrixExportPresets">📤 Экспорт</button>
          <button class="btn btn-sm" id="matrixImportPresets">📥 Импорт</button>
          <input type="file" id="matrixPresetFileInput" style="display:none" accept=".json">
          <select id="matrixPresetSelect" style="flex:1;min-width:120px;padding:6px 10px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:4px;color:var(--text-primary);">
            <option value="">— Выберите пресет —</option>
          </select>
          <label style="display:flex;align-items:center;gap:6px;color:var(--text-secondary);font-size:14px;cursor:pointer;">
            <input type="checkbox" id="matrixOverlayToggle"> Наложение
          </label>
        </div>

        <div class="table-wrap" id="matrixContainer" style="overflow:auto;flex:1;min-height:300px;"></div>

        <div class="buttons matrix-footer" style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid var(--border-color);flex-shrink:0;background:var(--bg-card);position:sticky;bottom:0;z-index:20;">
          <button class="cancel" id="matrixClearAll">🗑️ Удалить все привязки</button>
          <button class="cancel" id="matrixClose">Закрыть</button>
        </div>
      </div>
    `;
    return div;
  }

  _bindEvents() {
    const modal = this._modalEl;
    if (!modal) return;

    modal.querySelector('#matrixClose')?.addEventListener('click', () => this.close());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.close();
    });

    const srcFilter = modal.querySelector('#matrixSearchSource');
    const tgtFilter = modal.querySelector('#matrixSearchTarget');
    if (srcFilter) srcFilter.addEventListener('input', () => this._render());
    if (tgtFilter) tgtFilter.addEventListener('input', () => this._render());

    modal.querySelectorAll('.zoom-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const zoom = parseFloat(btn.dataset.zoom);
        if (!isNaN(zoom) && zoom !== this.zoomLevel) {
          this.zoomLevel = zoom;
          modal.querySelectorAll('.zoom-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const label = modal.querySelector('#matrixZoomLevelLabel');
          if (label) label.textContent = Math.round(zoom * 100) + '%';
          this._render();
        }
      });
    });

    modal.querySelector('#matrixSavePreset')?.addEventListener('click', () => this._savePreset());
    modal.querySelector('#matrixLoadPreset')?.addEventListener('click', () => this._loadPreset());
    modal.querySelector('#matrixDeletePreset')?.addEventListener('click', () => this._deletePreset());
    modal.querySelector('#matrixExportPresets')?.addEventListener('click', () => this._exportPresets());
    modal.querySelector('#matrixImportPresets')?.addEventListener('click', () => {
      const fileInput = modal.querySelector('#matrixPresetFileInput');
      if (fileInput) fileInput.click();
    });
    modal.querySelector('#matrixPresetFileInput')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const count = importMatrixPresets(ev.target.result);
            showToast(`Импортировано ${count} пресетов`, 'success');
            this._populatePresetSelect();
          } catch (err) {
            showToast('Ошибка: ' + err.message, 'error');
          }
        };
        reader.readAsText(file);
        e.target.value = '';
      }
    });

    modal.querySelector('#matrixClearAll')?.addEventListener('click', async () => {
      const confirmed = await showConfirm('Удалить все привязки?');
      if (!confirmed) return;
      clearMatrixLinks();
      this._render();
      this._updateLinkCount();
      showToast('Все привязки удалены', 'neutral');
    });

    // Управление отображением полных названий
    const controls = modal.querySelector('.matrix-zoom-controls');
    if (controls && !modal.querySelector('#matrixNameToggle')) {
      const toggleDiv = document.createElement('div');
      toggleDiv.className = 'matrix-name-toggle';
      toggleDiv.id = 'matrixNameToggle';
      toggleDiv.innerHTML = `
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
          <input type="checkbox" ${this.fullNames ? 'checked' : ''}> Полные названия
        </label>
      `;
      toggleDiv.querySelector('input').addEventListener('change', (e) => {
        this.fullNames = e.target.checked;
        localStorage.setItem('matrix_full_names', String(this.fullNames));
        this._render();
      });
      controls.after(toggleDiv);
    }

    this._unsubscribe = subscribe((changedKey, state) => {
      if (changedKey === 'links' || changedKey === '*') {
        this._render();
        this._updateLinkCount();
      }
    });
  }

  _loadFullNamesState() {
    try {
      const val = localStorage.getItem('matrix_full_names');
      if (val !== null) {
        this.fullNames = val === 'true';
      }
    } catch { this.fullNames = true; }
  }

  _render() {
    const container = this._container;
    if (!container) return;

    const state = getState();
    const inventory = state.inventory || {};
    const allPaths = this._getAllPaths(inventory);
    if (allPaths.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted);">Нет позиций в инвентаре</p>';
      return;
    }

    const srcFilter = this._modalEl.querySelector('#matrixSearchSource')?.value?.toLowerCase() || '';
    const tgtFilter = this._modalEl.querySelector('#matrixSearchTarget')?.value?.toLowerCase() || '';

    const catMap = {};
    for (const p of allPaths) {
      const cat = getCategory(p);
      if (!catMap[cat]) catMap[cat] = [];
      catMap[cat].push({ full: p, name: getItemName(p) });
    }

    let allTargets = allPaths.map(p => ({ full: p, name: getItemName(p), cat: getCategory(p) }));
    const unique = [];
    const seen = new Set();
    for (const t of allTargets) {
      if (!seen.has(t.full)) {
        seen.add(t.full);
        unique.push(t);
      }
    }
    allTargets = unique;
    if (tgtFilter) {
      allTargets = allTargets.filter(t => t.name.toLowerCase().includes(tgtFilter));
    }

    const baseColWidth = MATRIX_BASE.COL_WIDTH;
    const baseFontSize = MATRIX_BASE.FONT_SIZE;
    const basePadding = MATRIX_BASE.PADDING;
    const baseHeight = MATRIX_BASE.ROW_HEIGHT;
    const sourceWidth = this.fullNames ? MATRIX_BASE.SOURCE_WIDTH_FULL : MATRIX_BASE.SOURCE_WIDTH;

    const colWidth = Math.round(baseColWidth * this.zoomLevel);
    const fontSize = baseFontSize * this.zoomLevel;
    const padding = Math.round(basePadding * this.zoomLevel);
    const height = Math.round(baseHeight * this.zoomLevel);

    let html = `<div class="matrix-table-wrapper"><table class="matrix-table" style="font-size:${fontSize}px; table-layout:fixed; width:100%;">`;
    html += `<thead><tr><th class="matrix-header" style="width:${sourceWidth}px; min-width:${sourceWidth}px; max-width:${sourceWidth}px; padding:${padding}px; height:${height}px; font-size:${fontSize}px; position:sticky; left:0; z-index:25;">Источник \\ Цель</th>`;
    for (const target of allTargets) {
      const displayName = this.fullNames ? target.name : this._truncateName(target.name);
      html += `<th class="matrix-header" style="width:${colWidth}px; min-width:${colWidth}px; max-width:${colWidth}px; padding:${padding}px; height:${height}px; font-size:${fontSize}px;" title="${esc(target.name)}">${esc(displayName)}</th>`;
    }
    html += '</tr></thead><tbody>';

    const links = getMatrixLinks();
    const orderKeys = state._categoryOrder || Object.keys(inventory);

    for (const cat of orderKeys) {
      const items = catMap[cat] || [];
      let filtered = items;
      if (srcFilter) {
        filtered = items.filter(item => item.name.toLowerCase().includes(srcFilter));
      }
      if (filtered.length === 0) continue;

      const catId = 'cat_' + cat + '_' + Date.now();
      const isOpen = this.openCategories.includes(cat);
      const toggleIcon = isOpen ? '▼' : '▶';

      html += `<tr class="matrix-category" data-category="${cat}">`;
      html += `<td class="matrix-cell matrix-category-toggle" style="width:${sourceWidth}px; min-width:${sourceWidth}px; max-width:${sourceWidth}px; padding:${padding}px; height:${height}px; font-size:${fontSize}px; position:sticky; left:0; z-index:20; background:var(--bg-secondary); border:1px solid var(--matrix-border); text-align:center; cursor:pointer;" onclick="window._matrixToggleCategory('${catId}', '${cat}')">`;
      html += `<span class="toggle" id="toggle_${catId}">${toggleIcon}</span>`;
      html += `</td>`;
      html += `<td colspan="${allTargets.length}" style="text-align:left;padding:${padding}px 10px;background:var(--bg-secondary);border:1px solid var(--border-color);font-size:${fontSize}px;cursor:pointer;" onclick="window._matrixToggleCategory('${catId}', '${cat}')">`;
      html += `${CAT_NAMES[cat] || cat} (${filtered.length})`;
      html += `</td>`;
      html += `</tr>`;

      html += `<tbody id="${catId}" class="matrix-category-items" style="display:${isOpen ? 'table-row-group' : 'none'};">`;
      for (let i = 0; i < filtered.length; i++) {
        const source = filtered[i];
        const rowClass = i % 2 === 0 ? 'row-even' : 'row-odd';
        const rowId = (this.scrollToPath && source.full === this.scrollToPath) ? 'id="matrix-scroll-target"' : '';
        html += `<tr class="${rowClass}" ${rowId}>`;
        const sourceDisplay = this.fullNames ? source.name : this._truncateName(source.name);
        html += `<td class="matrix-cell matrix-source" style="width:${sourceWidth}px; min-width:${sourceWidth}px; max-width:${sourceWidth}px; padding:${padding}px; height:${height}px; overflow:hidden; text-overflow:ellipsis; font-size:${fontSize}px; position:sticky; left:0; z-index:15; background:${i % 2 === 0 ? 'var(--matrix-row-even)' : 'var(--matrix-row-odd)'};" title="${esc(source.name)}">${esc(sourceDisplay)}</td>`;
        for (const target of allTargets) {
          if (source.full === target.full) {
            html += `<td class="matrix-cell matrix-diagonal" style="width:${colWidth}px; min-width:${colWidth}px; max-width:${colWidth}px; padding:${padding}px; height:${height}px; font-size:${fontSize}px;">—</td>`;
          } else {
            const val = getMatrixCellValue(source.full, target.full);
            if (val > 0) {
              html += `<td class="matrix-cell matrix-value-cell" style="width:${colWidth}px; min-width:${colWidth}px; max-width:${colWidth}px; padding:${padding}px; height:${height}px; overflow:hidden; text-overflow:ellipsis; font-size:${fontSize}px; cursor:pointer;" data-src="${esc(source.full)}" data-target="${esc(target.full)}" onclick="window._editMatrixCell(this, '${esc(source.full)}', '${esc(target.full)}')">`;
              html += `<span class="matrix-value" style="font-size:${fontSize}px;">${val.toFixed(2)}</span>`;
              html += `</td>`;
            } else {
              html += `<td class="matrix-cell matrix-empty" style="width:${colWidth}px; min-width:${colWidth}px; max-width:${colWidth}px; padding:${padding}px; height:${height}px; font-size:${fontSize}px; cursor:pointer;" data-src="${esc(source.full)}" data-target="${esc(target.full)}" onclick="window._editMatrixCell(this, '${esc(source.full)}', '${esc(target.full)}')">+</td>`;
            }
          }
        }
        html += '</tr>';
      }
      html += '</tbody>';
    }

    html += '</tbody></table></div>';
    container.innerHTML = html;

    if (this.scrollToPath) {
      setTimeout(() => {
        const targetRow = container.querySelector('#matrix-scroll-target');
        if (targetRow) {
          targetRow.scrollIntoView({ block: 'center', behavior: 'smooth' });
          targetRow.style.background = 'var(--bg-active)';
          setTimeout(() => { targetRow.style.background = ''; }, 2000);
          this.scrollToPath = null;
        }
      }, 100);
    }

    const toggleInput = this._modalEl.querySelector('#matrixNameToggle input');
    if (toggleInput) toggleInput.checked = this.fullNames;
  }

  _getAllPaths(inventory) {
    const result = [];
    const stack = [];
    const orderKeys = getCategoryOrder();
    for (const cat of orderKeys) {
      if (inventory[cat] !== undefined) {
        stack.push({ data: inventory[cat], path: [cat] });
      }
    }
    while (stack.length > 0) {
      const { data, path } = stack.pop();
      if (Array.isArray(data)) {
        for (const item of data) {
          const fullPath = path.join('|') + '|' + item;
          result.push(fullPath);
        }
      } else if (data && typeof data === 'object') {
        const keys = Object.keys(data).filter(k => !k.startsWith('_'));
        for (let i = keys.length - 1; i >= 0; i--) {
          stack.push({ data: data[keys[i]], path: [...path, keys[i]] });
        }
      }
    }
    return result;
  }

  _truncateName(name, maxLen = 10) {
    if (name.length <= maxLen) return name;
    const parts = name.split(' ');
    if (parts.length <= 2) {
      return name.substring(0, maxLen - 3) + '...';
    }
    const first = parts[0];
    const last = parts[parts.length - 1];
    return first + ' ... ' + last;
  }

  _populatePresetSelect() {
    const select = this._modalEl?.querySelector('#matrixPresetSelect');
    if (!select) return;
    const presets = getMatrixPresets();
    select.innerHTML = '<option value="">— Выберите пресет —</option>';
    for (const p of presets) {
      const opt = document.createElement('option');
      opt.value = p.name;
      opt.textContent = p.name;
      select.appendChild(opt);
    }
  }

  async _savePreset() {
    const name = await showPrompt('Сохранить пресет матрицы', 'Введите имя пресета:', '', '');
    if (!name || !name.trim()) return;
    try {
      createMatrixPreset(name.trim());
      this._populatePresetSelect();
      showToast('Пресет сохранён', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async _loadPreset() {
    const select = this._modalEl?.querySelector('#matrixPresetSelect');
    const name = select?.value;
    if (!name) {
      showToast('Выберите пресет', 'warning');
      return;
    }
    const overlay = this._modalEl?.querySelector('#matrixOverlayToggle')?.checked || false;
    try {
      loadMatrixPreset(name, overlay);
      this._render();
      this._updateLinkCount();
      showToast(`Пресет "${name}" загружен ${overlay ? '(наложение)' : '(замена)'}`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async _deletePreset() {
    const select = this._modalEl?.querySelector('#matrixPresetSelect');
    const name = select?.value;
    if (!name) {
      showToast('Выберите пресет', 'warning');
      return;
    }
    const confirmed = await showConfirm(`Удалить пресет "${name}"?`);
    if (!confirmed) return;
    try {
      deleteMatrixPreset(name);
      this._populatePresetSelect();
      showToast('Пресет удалён', 'neutral');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  _exportPresets() {
    try {
      const json = exportMatrixPresets();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'matrix_presets.json';
      a.click();
      URL.revokeObjectURL(url);
      showToast('Пресеты экспортированы', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // Обновление счётчика привязок без зависимости от OrderPage
  _updateLinkCount() {
    const el = document.getElementById('linkCount');
    if (el) {
      const links = getMatrixLinks();
      let count = 0;
      for (const src in links) count += links[src].length;
      el.textContent = `(${count} активных)`;
    }
  }

  close() {
    if (this._modalEl) {
      this._modalEl.classList.remove('open');
    }
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    if (this.onClose) this.onClose();
    matrixInstance = null;
  }

  destroy() {
    this.close();
  }
}

// Глобальные функции для onclick
window._matrixToggleCategory = function(catId, catName) {
  if (!matrixInstance) return;
  const tbody = document.getElementById(catId);
  const toggle = document.getElementById('toggle_' + catId);
  if (!tbody || !toggle) return;
  const isOpen = tbody.style.display !== 'none';
  if (isOpen) {
    tbody.style.display = 'none';
    toggle.textContent = '▶';
    const idx = matrixInstance.openCategories.indexOf(catName);
    if (idx !== -1) matrixInstance.openCategories.splice(idx, 1);
  } else {
    tbody.style.display = 'table-row-group';
    toggle.textContent = '▼';
    if (!matrixInstance.openCategories.includes(catName)) {
      matrixInstance.openCategories.push(catName);
    }
  }
};

window._editMatrixCell = async function(td, src, target) {
  if (!matrixInstance) return;
  const currentVal = getMatrixCellValue(src, target);
  const val = await showPrompt(
    currentVal > 0 ? 'Изменить множитель' : 'Введите множитель',
    'Множитель (0 для удаления):',
    currentVal > 0 ? String(currentVal) : '1'
  );
  if (val === null) return;
  const num = parseFloat(val);
  if (isNaN(num) || num === 0) {
    removeMatrixLink(src, target);
  } else {
    addMatrixLink(src, target, num);
  }
  matrixInstance._render();
  matrixInstance._updateLinkCount();
  showToast('Привязка обновлена', 'success');
};

export function openMatrixModal(sourcePath, showPresets = true, category = null, onClose = null) {
  if (matrixInstance) {
    matrixInstance.close();
  }
  const modal = new MatrixModal({ sourcePath, showPresets, category, onClose });
  modal.init();
  return modal;
}

export default {
  MatrixModal,
  openMatrixModal,
};