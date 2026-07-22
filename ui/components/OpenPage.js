// ui/components/OpenPage.js

/**
 * Компонент страницы открытия/просмотра заказа.
 * Отображает чек-лист с возможностью отмечать собранные позиции,
 * отслеживает прогресс, проверяет пропущенные позиции.
 * @module ui/components/OpenPage
 */

import { getState, subscribe, saveState } from '../../core/store.js';
import { emit, EVENTS, on } from '../../core/events.js';
import { esc, deepClone, getItemName, getCategory, formatDate } from '../../core/utils.js';
import { showToast } from '../toast.js';
import { showConfirm } from '../modal.js';
import { formatWeight, formatVolume } from '../render-utils.js';
import { getItemPropsByPath } from '../../services/itemProps.js';
import { parseUnitVolume } from '../../services/packaging.js';

// ============================================================
// КОМПОНЕНТ
// ============================================================

export class OpenPage {
  /**
   * @param {HTMLElement} container - контейнер для рендеринга
   * @param {Object} callbacks - колбэки (например, onNavigate)
   */
  constructor(container, callbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.loadedOrder = null;
    this.openChecked = {};
    this.openCategoryState = {};
    this.openDescState = {};
    this._handlers = [];
    this._unsubscribe = null;
    this._storageKey = 'open_state';
  }

  /**
   * Инициализация компонента.
   */
  init() {
    // Загружаем сохранённое состояние чек-листа
    this._loadState();

    // Подписываемся на изменения (чтобы обновлять прогресс)
    this._unsubscribe = subscribe((changedKey, state) => {
      if (changedKey === 'openChecked' || changedKey === '*') {
        this._updateProgress();
      }
    });

    // Слушаем событие открытия проекта из мониторинга
    this._handlers.push(
      on(EVENTS.PROJECT_CHANGED, () => {}),
      on('openProject', (data) => {
        if (data?.projectId) {
          this._loadProject(data.projectId);
        }
      })
    );

    this.render();
    this._checkAutoLoad();
  }

  /**
   * Рендерит страницу.
   */
  render() {
    if (!this.container) return;
    this.container.innerHTML = this._getPageHTML();
    this._bindEvents();
    this._renderContent();
  }

  /**
   * Возвращает HTML-разметку.
   */
  _getPageHTML() {
    return `
      <div class="card" id="openPage">
        <button class="btn btn-sec" id="btnBackToMenu">◀ В меню</button>
        <h3 style="color:var(--text-primary);font-weight:600;margin-bottom:12px;">Открыть список</h3>

        <label class="btn btn-sec" for="fSel" style="display:inline-block;cursor:pointer;">📂 Выберите JSON-файл</label>
        <input type="file" id="fSel" style="display:none" accept=".json">

        <div style="margin-top:12px;font-size:14px;color:var(--text-secondary);">
          <span id="loadStatus">Файл не выбран</span>
        </div>

        <div id="sRes" style="display:none;margin-top:16px;">
          <h2 id="rName" style="color:var(--text-primary);">Мероприятие</h2>
          <div id="rDate" style="color:var(--text-secondary);margin-bottom:10px;">Дата:</div>
          <div id="rComment" style="color:var(--text-muted);margin-bottom:12px;font-style:italic;padding:10px;background:var(--bg-secondary);border-radius:10px;"></div>

          <button class="btn btn-red" id="resetCheckboxes" style="width:auto;padding:8px 18px;font-size:14px;">🔄 Сброс отметок</button>
          <button class="btn btn-purple" id="checkMissingItems" style="width:auto;padding:8px 18px;font-size:14px;margin-left:8px;">🔍 Проверить пропущенное</button>

          <div id="sCats" style="margin-top:16px;"></div>

          <div id="globalTotalsOpen" class="global-totals" style="margin-top:16px;">
            <span><strong>Общий вес:</strong> <span id="totalWeightOpen">0</span> кг</span>
            <span><strong>Общий объём:</strong> <span id="totalVolumeOpen">0</span> м³</span>
          </div>

          <div class="progress-container" style="margin-top:12px;">
            <strong>Собрано:</strong> <span id="progressCount">0/0</span>
            <span id="progressPercent" style="margin-left:10px;color:var(--text-secondary);">0%</span>
            <div class="progress-bar-bg"><div id="progressBar" class="progress-bar-fill" style="width:0%;"></div></div>
          </div>
        </div>
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

    // Загрузка файла
    const fileInput = container.querySelector('#fSel');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) {
          container.querySelector('#loadStatus').textContent = 'Файл не выбран';
          return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const data = JSON.parse(ev.target.result);
            if (!data.items || typeof data.items !== 'object') {
              throw new Error('Неверный формат: отсутствует поле items');
            }
            container.querySelector('#loadStatus').textContent = 'Загружено: ' + (data.project_name || 'Без названия');
            this.loadedOrder = data;
            // Сбрасываем состояние чек-листа при новой загрузке
            this.openChecked = {};
            this.openCategoryState = {};
            this.openDescState = {};
            this._saveState();
            this._renderContent();
            this._updateProgress();
            showToast('Список загружен', 'success');
          } catch (err) {
            container.querySelector('#loadStatus').textContent = 'Ошибка: ' + err.message;
            showToast('Ошибка загрузки: ' + err.message, 'error');
          }
        };
        reader.readAsText(file);
      });
    }

    // Сброс отметок
    container.querySelector('#resetCheckboxes')?.addEventListener('click', async () => {
      if (!this.loadedOrder) return;
      const confirmed = await showConfirm('Сбросить все отметки?');
      if (!confirmed) return;
      this.openChecked = {};
      this._saveState();
      this._renderContent();
      this._updateProgress();
      showToast('Отметки сброшены', 'neutral');
    });

    // Проверка пропущенных
    container.querySelector('#checkMissingItems')?.addEventListener('click', () => {
      this._checkMissing();
    });

    // Делегирование для чекбоксов и toggle-кнопок
    const catsContainer = container.querySelector('#sCats');
    if (catsContainer) {
      catsContainer.addEventListener('change', (e) => {
        const cb = e.target.closest('.open-check');
        if (cb) {
          const path = cb.dataset.path;
          this.openChecked[path] = cb.checked;
          this._saveState();
          this._updateProgress();
          const row = cb.closest('.row');
          if (row) {
            row.style.background = cb.checked ? 'var(--added-bg)' : '';
          }
        }
      });

      catsContainer.addEventListener('click', (e) => {
        const toggle = e.target.closest('.category-toggle');
        if (toggle) {
          const path = toggle.dataset.path;
          this.openCategoryState[path] = !this.openCategoryState[path];
          this._saveState();
          this._renderContent();
          this._updateProgress();
          return;
        }

        const descToggle = e.target.closest('.desc-toggle');
        if (descToggle) {
          const path = descToggle.dataset.path;
          this.openDescState[path] = !this.openDescState[path];
          this._saveState();
          // Находим блок описания и переключаем его
          const block = descToggle.closest('.row')?.querySelector('.desc-block');
          if (block) {
            block.style.display = this.openDescState[path] ? 'block' : 'none';
            descToggle.textContent = this.openDescState[path] ? '📕' : '📄';
          }
        }
      });
    }
  }

  // ============================================================
  // РЕНДЕРИНГ СОДЕРЖИМОГО
  // ============================================================

  _renderContent() {
    const sRes = this.container.querySelector('#sRes');
    if (!this.loadedOrder) {
      if (sRes) sRes.style.display = 'none';
      return;
    }
    if (sRes) sRes.style.display = 'block';

    const d = this.loadedOrder;
    this.container.querySelector('#rName').textContent = d.project_name || 'Мероприятие';
    this.container.querySelector('#rDate').textContent = 'Дата: ' + (d.date || '—');
    this.container.querySelector('#rComment').textContent = d.comment || '';

    const container = this.container.querySelector('#sCats');
    if (!container) return;
    container.innerHTML = '';

    // Строим дерево
    const tree = {};
    const items = d.items || {};
    for (const path in items) {
      const qty = items[path];
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

    const specs = d.specs || {};
    const html = this._buildTreeHTML(tree, 0, '', specs);
    container.innerHTML = html;

    // Восстанавливаем состояние описаний
    container.querySelectorAll('.desc-block').forEach(block => {
      const path = block.dataset.path;
      if (this.openDescState[path]) {
        block.style.display = 'block';
        const toggle = block.closest('.row')?.querySelector('.desc-toggle');
        if (toggle) toggle.textContent = '📕';
      }
    });

    // Восстанавливаем состояние чекбоксов
    container.querySelectorAll('.open-check').forEach(cb => {
      const path = cb.dataset.path;
      if (this.openChecked[path]) {
        cb.checked = true;
        const row = cb.closest('.row');
        if (row) row.style.background = 'var(--added-bg)';
      }
    });

    this._updateTotals();
  }

  _buildTreeHTML(node, level, parentPath, specs) {
    let html = '';
    const keys = Object.keys(node).filter(k => k !== '_items');
    keys.sort();

    for (const key of keys) {
      const child = node[key];
      const fullPath = parentPath ? parentPath + '|' + key : key;
      const isOpen = !this.openCategoryState[fullPath];
      const toggleIcon = isOpen ? '▼' : '▶';

      const paddingLeft = level === 0 ? '12px' : (12 + level * 16) + 'px';
      const borderColor = level === 0 ? 'var(--accent)' : 'var(--border-light)';
      html += `<div class="${level === 0 ? 'sub-cat-t' : 'sub-sub-cat-t'}" style="cursor:pointer;border-left:3px solid ${borderColor};padding-left:${paddingLeft};margin:4px 0;" onclick="document.querySelector('[data-path=\\'${esc(fullPath)}\\']')?.click()">`;
      html += `<span class="category-toggle" data-path="${esc(fullPath)}" style="cursor:pointer;">${toggleIcon} ${esc(key)} (${child._items ? child._items.length : 0})</span>`;
      html += `</div>`;

      const contentStyle = isOpen ? '' : 'display:none;';
      html += `<div class="category-content-open" style="${contentStyle}padding-left:${level * 20 + 10}px;">`;

      if (child._items) {
        for (const item of child._items) {
          const checked = this.openChecked[item.path] || false;
          const desc = specs[item.path] || '';
          const hasDesc = !!desc;
          const descOpen = this.openDescState[item.path] || false;

          const props = getItemPropsByPath(item.path);
          const weight = (props.weight || 0) * item.qty;
          const unitVol = parseUnitVolume(props.dimensions);
          const volume = unitVol * item.qty;
          const dims = props.dimensions || 'н/д';

          html += `<div class="row" style="border-left:2px solid var(--border-color);padding-left:8px;margin-left:10px;background:${checked ? 'var(--added-bg)' : ''};display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:6px 0;border-bottom:1px solid var(--border-color);">`;
          html += `<div class="main-line" style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;flex:1 1 100%;">`;
          html += `<div class="name-area" style="display:flex;align-items:center;gap:8px;flex:1 1 200px;">`;
          html += `<label style="display:flex;align-items:center;gap:8px;cursor:pointer;">`;
          html += `<input type="checkbox" class="open-check" data-path="${esc(item.path)}" ${checked ? 'checked' : ''}>`;
          html += `<span class="name">${esc(item.name)}</span>`;
          html += `</label>`;
          if (hasDesc) {
            html += `<button class="desc-toggle" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:16px;">${descOpen ? '📕' : '📄'}</button>`;
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

      html += this._buildTreeHTML(child, level + 1, fullPath, specs);
      html += `</div>`;
    }
    return html;
  }

  // ============================================================
  // ОБНОВЛЕНИЕ ПРОГРЕССА
  // ============================================================

  _updateProgress() {
    if (!this.loadedOrder) return;
    const items = this.loadedOrder.items || {};
    const total = Object.keys(items).filter(p => items[p] > 0).length;
    let done = 0;
    for (const path in items) {
      if (items[path] > 0 && this.openChecked[path]) done++;
    }
    const progressCount = this.container.querySelector('#progressCount');
    const progressPercent = this.container.querySelector('#progressPercent');
    const progressBar = this.container.querySelector('#progressBar');
    if (progressCount) progressCount.textContent = done + '/' + total;
    const percent = total === 0 ? 0 : Math.round((done / total) * 100);
    if (progressPercent) progressPercent.textContent = percent + '%';
    if (progressBar) {
      progressBar.style.width = percent + '%';
      progressBar.classList.toggle('complete', percent === 100);
    }
  }

  _updateTotals() {
    if (!this.loadedOrder) return;
    const items = this.loadedOrder.items || {};
    let totalWeight = 0, totalVolume = 0;
    for (const path in items) {
      const qty = items[path];
      if (qty <= 0) continue;
      const props = getItemPropsByPath(path);
      totalWeight += (props.weight || 0) * qty;
      const unitVol = parseUnitVolume(props.dimensions);
      totalVolume += unitVol * qty;
    }
    const weightEl = this.container.querySelector('#totalWeightOpen');
    const volumeEl = this.container.querySelector('#totalVolumeOpen');
    if (weightEl) weightEl.textContent = totalWeight.toFixed(1);
    if (volumeEl) volumeEl.textContent = totalVolume.toFixed(3);
  }

  // ============================================================
  // ПРОВЕРКА ПРОПУЩЕННЫХ
  // ============================================================

  _checkMissing() {
    if (!this.loadedOrder) return;
    const items = this.loadedOrder.items || {};
    const missing = [];
    for (const path in items) {
      if (items[path] > 0 && !this.openChecked[path]) {
        missing.push(getItemName(path));
      }
    }
    if (missing.length === 0) {
      showToast('✅ Все позиции отмечены!', 'success');
      // Сбрасываем подсветку
      this.container.querySelectorAll('.row').forEach(row => {
        row.style.borderLeft = '2px solid var(--border-color)';
      });
    } else {
      const msg = 'Не отмечены: ' + missing.join(', ');
      showToast('⚠️ ' + msg, 'warning');
      // Подсвечиваем пропущенные
      this.container.querySelectorAll('.open-check').forEach(cb => {
        const path = cb.dataset.path;
        const row = cb.closest('.row');
        if (row && this.loadedOrder.items[path] > 0 && !cb.checked) {
          row.style.borderLeft = '4px solid var(--danger)';
        } else if (row) {
          row.style.borderLeft = '2px solid var(--border-color)';
        }
      });
    }
  }

  // ============================================================
  // ЗАГРУЗКА ПРОЕКТА ИЗ МОНИТОРИНГА
  // ============================================================

  _loadProject(projectId) {
    // Пытаемся найти проект в state
    const state = getState();
    const project = state.projects?.find(p => p.id === projectId);
    if (!project) {
      showToast('Проект не найден', 'error');
      return;
    }

    // Ищем сохранённый JSON для проекта (хранится в localStorage)
    // Для простоты — пробуем найти файл проекта в данных
    const projectData = state.projectData?.[projectId];
    if (projectData) {
      this.loadedOrder = projectData;
      this.openChecked = {};
      this.openCategoryState = {};
      this.openDescState = {};
      this._saveState();
      this._renderContent();
      this._updateProgress();
      const status = this.container.querySelector('#loadStatus');
      if (status) status.textContent = 'Загружен проект: ' + project.name;
      showToast(`Проект "${project.name}" загружен`, 'success');
    } else {
      showToast('Нет данных для проекта', 'warning');
    }
  }

  _checkAutoLoad() {
    const projectId = localStorage.getItem('open_project_id');
    if (projectId) {
      localStorage.removeItem('open_project_id');
      this._loadProject(projectId);
    }
  }

  // ============================================================
  // СОХРАНЕНИЕ / ЗАГРУЗКА СОСТОЯНИЯ
  // ============================================================

  _loadState() {
    try {
      const raw = localStorage.getItem(this._storageKey);
      if (raw) {
        const data = JSON.parse(raw);
        this.openChecked = data.openChecked || {};
        this.openCategoryState = data.openCategoryState || {};
        this.openDescState = data.openDescState || {};
      }
    } catch (e) {
      console.warn('Ошибка загрузки состояния открытия', e);
    }
  }

  _saveState() {
    const data = {
      openChecked: this.openChecked,
      openCategoryState: this.openCategoryState,
      openDescState: this.openDescState,
    };
    localStorage.setItem(this._storageKey, JSON.stringify(data));
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

export function createOpenPage(container, callbacks) {
  const page = new OpenPage(container, callbacks);
  page.init();
  return page;
}

export default {
  OpenPage,
  createOpenPage,
};