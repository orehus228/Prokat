// main.js

import { initStore, getState, saveState, loadState, updateState } from './core/store.js';
import { emit, EVENTS } from './core/events.js';
import { initTheme } from './ui/theme.js';
import { initModalHandlers } from './ui/modal.js';
import { showToast } from './ui/toast.js';
import { createMenu } from './ui/components/Menu.js';
import { createOrderPage } from './ui/components/OrderPage.js';
import { createEditorPage } from './ui/components/EditorPage.js';
import { createOpenPage } from './ui/components/OpenPage.js';
import { createLoadingPage } from './ui/components/LoadingPage.js';
import { createMonitoringPage } from './ui/components/MonitoringPage.js';

let currentMode = 'menu';
let appComponents = {};

const containers = {
  menu: document.getElementById('mMenu'),
  order: document.getElementById('mPage'),
  editor: document.getElementById('editorPage'),
  open: document.getElementById('sPage'),
  loading: document.getElementById('loadingPage'),
  monitoring: document.getElementById('monitoringPage'),
};

export function switchMode(mode) {
  console.log('[App] switchMode:', mode);
  currentMode = mode;

  for (const key in containers) {
    if (containers[key]) {
      containers[key].style.display = 'none';
    }
  }

  const container = containers[mode];
  if (container) {
    container.style.display = 'block';
  } else {
    console.warn('[App] Контейнер для режима не найден:', mode);
    return;
  }

  switch (mode) {
    case 'menu':
      if (!appComponents.menu) {
        appComponents.menu = createMenu(container, {
          onNavigate: switchMode,
          onLoadLibrary: loadLibrary,
          onResetData: resetAllData,
        });
      }
      break;
    case 'order':
      if (!appComponents.order) {
        appComponents.order = createOrderPage(container, { onNavigate: switchMode });
      } else {
        appComponents.order._onDataChanged();
      }
      break;
    case 'editor':
      if (!appComponents.editor) {
        appComponents.editor = createEditorPage(container, { onNavigate: switchMode });
      } else {
        appComponents.editor._renderEditor();
      }
      break;
    case 'open':
      if (!appComponents.open) {
        appComponents.open = createOpenPage(container, { onNavigate: switchMode });
      } else {
        appComponents.open._renderContent();
      }
      break;
    case 'loading':
      if (!appComponents.loading) {
        appComponents.loading = createLoadingPage(container, { onNavigate: switchMode });
      } else {
        appComponents.loading._renderTruckSelection();
        appComponents.loading._renderResult();
      }
      break;
    case 'monitoring':
      if (!appComponents.monitoring) {
        appComponents.monitoring = createMonitoringPage(container, { onNavigate: switchMode });
      } else {
        appComponents.monitoring._render();
      }
      break;
  }

  emit(EVENTS.UI_STATE_CHANGED, { mode });
}

// ============================================================
// ЗАГРУЗКА БИБЛИОТЕКИ (с диагностикой)
// ============================================================

function loadLibrary() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.click();

  input.onchange = function(e) {
    const file = e.target.files[0];
    if (!file) {
      document.body.removeChild(input);
      return;
    }
    const reader = new FileReader();
    reader.onload = function(ev) {
      try {
        const data = JSON.parse(ev.target.result);
        console.log('[loadLibrary] Данные загружены, ключи:', Object.keys(data));

        // Проверяем наличие ключей
        if (!data.inventory) {
          showToast('Ошибка: в файле отсутствует inventory', 'error');
          return;
        }

        // Обновляем состояние через updateState
        updateState({
          inventory: data.inventory || {},
          stock: data.stock || {},
          specs: data.specs || {},
          itemProps: data.itemProps || {},
          catNames: data.catNames || {},
          _categoryOrder: data._categoryOrder || [],
          commonCases: data.commonCases || [],
          truckPresets: data.truckPresets || [],
          projects: data.projects || [],
          projectItems: data.projectItems || [],
        });

        // Принудительно перезагружаем состояние из localStorage (для синхронизации)
        loadState();

        showToast('Библиотека загружена', 'success');
        emit(EVENTS.EDITOR_DATA_CHANGED, { action: 'importLibrary' });

        // Обновляем все компоненты
        for (const key in appComponents) {
          const comp = appComponents[key];
          if (comp && typeof comp._onDataChanged === 'function') {
            comp._onDataChanged();
          } else if (comp && typeof comp._render === 'function') {
            comp._render();
          } else if (comp && typeof comp.render === 'function') {
            comp.render();
          }
        }

        // Перерисовываем текущую страницу
        if (currentMode === 'editor' && appComponents.editor) {
          appComponents.editor._renderEditor();
        } else if (currentMode === 'order' && appComponents.order) {
          appComponents.order._onDataChanged();
        } else if (currentMode === 'open' && appComponents.open) {
          appComponents.open._renderContent();
        } else if (currentMode === 'loading' && appComponents.loading) {
          appComponents.loading._renderTruckSelection();
          appComponents.loading._renderResult();
        } else if (currentMode === 'monitoring' && appComponents.monitoring) {
          appComponents.monitoring._render();
        }

        // Проверяем, что данные действительно сохранились
        const state = getState();
        console.log('[loadLibrary] После загрузки, в state inventory позиций:', Object.keys(state.inventory).length);
        console.log('[loadLibrary] После загрузки, в state itemProps позиций:', Object.keys(state.itemProps).length);

      } catch (err) {
        console.error('[loadLibrary] Ошибка:', err);
        showToast('Ошибка: ' + err.message, 'error');
      }
      document.body.removeChild(input);
    };
    reader.readAsText(file);
  };
}

// ============================================================
// СБРОС ДАННЫХ
// ============================================================

async function resetAllData() {
  const { showConfirm } = await import('./ui/modal.js');
  const confirmed = await showConfirm('Удалить все данные? Восстановление невозможно.', 'Сброс данных');
  if (!confirmed) return;

  for (const key in localStorage) {
    if (key.startsWith('app_') || key === 'theme' || key === 'open_state' || key === 'detailsOpenOrder' || key === 'last_mode' || key === 'order_presets' || key === 'matrix_presets') {
      localStorage.removeItem(key);
    }
  }

  const state = getState();
  state.inventory = {};
  state.stock = {};
  state.specs = {};
  state.itemProps = {};
  state.catNames = {};
  state._categoryOrder = [];
  state.commonCases = [];
  state.truckPresets = [];
  state.projects = [];
  state.projectItems = [];
  state.order = {};
  state.orderSplits = {};
  state.links = {};
  state.notes = {};
  state.orderPacking = {};
  state.individualCaseValues = {};
  state.commonRoutes = {};
  state.caseModes = {};
  state.orderExclude = {};
  state.orderExtra = {};
  state.orderProject = { id: null, name: '', start_date: '', end_date: '', status: 'planned' };
  state.openChecked = {};
  state.openCategoryState = {};
  state.openDescState = {};
  state.selectedTruckIds = [];
  state.matrixFullNames = true;
  state.theme = 'dark';
  state._calcCache = new Map();
  saveState();

  for (const key in appComponents) {
    if (appComponents[key] && typeof appComponents[key].destroy === 'function') {
      appComponents[key].destroy();
    }
    delete appComponents[key];
  }

  location.reload();
}

// ============================================================
// ЭКСПОРТ HTML
// ============================================================

export function exportInventoryHTML() {
  const state = getState();
  let html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Инвентарь</title>
<style>
body{font-family:'Segoe UI',Arial,sans-serif;margin:40px;color:#222;background:#fff}
h1{color:#2c3e50;border-bottom:2px solid #3498db;padding-bottom:10px}
table{width:100%;border-collapse:collapse;margin-top:20px;font-size:14px}
th{background:#2c3e50;color:#fff;padding:8px;text-align:left}
td{padding:6px 8px;border-bottom:1px solid #ddd}
tr:nth-child(even){background:#f9f9f9}
.category{background:#e6f2ff;font-weight:bold}
.subgroup{background:#f0f4f8;font-weight:bold}
</style>
</head><body>
<h1>Инвентарь склада</h1>
<table><thead><tr><th>Категория</th><th>Подгруппа</th><th>Позиция</th><th>В наличии</th><th>Вес (кг)</th><th>Габариты (см)</th></tr></thead><tbody>`;

  const order = state._categoryOrder || Object.keys(state.inventory);
  for (const cat of order) {
    const catData = state.inventory[cat];
    if (!catData) continue;
    if (Array.isArray(catData)) {
      for (const item of catData) {
        const path = cat + '|' + item;
        const stock = state.stock[path] || 0;
        const props = state.itemProps[path] || {};
        html += `<tr><td>${esc(cat)}</td><td></td><td>${esc(item)}</td><td>${stock}</td><td>${props.weight || ''}</td><td>${props.dimensions || ''}</td></tr>`;
      }
    } else if (typeof catData === 'object') {
      const subOrder = catData._subOrder || Object.keys(catData).filter(k => k !== '_subOrder');
      for (const sub of subOrder) {
        const items = catData[sub] || [];
        if (!Array.isArray(items)) continue;
        for (const item of items) {
          const path = cat + '|' + sub + '|' + item;
          const stock = state.stock[path] || 0;
          const props = state.itemProps[path] || {};
          html += `<tr><td>${esc(cat)}</td><td>${esc(sub)}</td><td>${esc(item)}</td><td>${stock}</td><td>${props.weight || ''}</td><td>${props.dimensions || ''}</td></tr>`;
        }
      }
    }
  }

  html += `</tbody></table>
<div style="margin-top:30px;display:flex;gap:12px;">
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
// ГЛОБАЛЬНЫЕ
// ============================================================

window.switchMode = switchMode;
window.exportInventoryHTML = exportInventoryHTML;
window.loadLibrary = loadLibrary;
window.resetAllData = resetAllData;

// ============================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================

function initApp() {
  console.log('[App] Инициализация...');
  initStore();
  initTheme();
  initModalHandlers();

  const savedMode = localStorage.getItem('last_mode') || 'menu';
  switchMode(savedMode);

  const origSwitch = switchMode;
  switchMode = function(mode) {
    origSwitch(mode);
    localStorage.setItem('last_mode', mode);
  };
  window.switchMode = switchMode;

  document.addEventListener('openProject', (e) => {
    const projectId = e.detail?.projectId;
    if (projectId) {
      localStorage.setItem('open_project_id', projectId);
      switchMode('open');
    }
  });

  showToast('📦 Прокатошная загружена', 'neutral', 1500);
  emit(EVENTS.UI_STATE_CHANGED, { mode: currentMode, initialized: true });
  console.log('[App] Инициализация завершена');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

export default {
  switchMode,
  exportInventoryHTML,
  loadLibrary,
  resetAllData,
  initApp,
};