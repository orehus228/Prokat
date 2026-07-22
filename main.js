// main.js
// (исправлена функция loadLibrary — добавлено принудительное обновление всех компонентов)

import { initStore, getState, saveState } from './core/store.js';
import { emit, EVENTS } from './core/events.js';
import { initTheme, getTheme } from './ui/theme.js';
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
    if (containers[key]) containers[key].style.display = 'none';
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
        appComponents.menu = createMenu(container, { onNavigate: switchMode, onLoadLibrary: loadLibrary, onResetData: resetAllData });
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

function loadLibrary() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.click();

  input.onchange = function(e) {
    const file = e.target.files[0];
    if (!file) { document.body.removeChild(input); return; }
    const reader = new FileReader();
    reader.onload = function(ev) {
      try {
        const data = JSON.parse(ev.target.result);
        const state = getState();

        if (data.inventory) state.inventory = data.inventory;
        if (data.stock) state.stock = data.stock;
        if (data.specs) state.specs = data.specs;
        if (data.itemProps) state.itemProps = data.itemProps;
        if (data.catNames) state.catNames = data.catNames;
        if (data._categoryOrder) state._categoryOrder = data._categoryOrder;
        if (data.commonCases) state.commonCases = data.commonCases;
        if (data.truckPresets) state.truckPresets = data.truckPresets;
        if (data.projects) state.projects = data.projects;
        if (data.projectItems) state.projectItems = data.projectItems;

        // Нормализация структуры инвентаря
        for (const cat in state.inventory) {
          const catData = state.inventory[cat];
          if (catData && typeof catData === 'object' && !Array.isArray(catData)) {
            if (!catData._subOrder) {
              catData._subOrder = Object.keys(catData).filter(k => k !== '_subOrder');
            }
          }
        }

        saveState();
        showToast('Библиотека загружена', 'success');
        emit(EVENTS.EDITOR_DATA_CHANGED, { action: 'importLibrary' });

        // Принудительно обновляем все существующие компоненты
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
        // Дополнительно, если открыта страница редактора — перерисовываем
        if (currentMode === 'editor' && appComponents.editor) {
          appComponents.editor._renderEditor();
        }
        if (currentMode === 'order' && appComponents.order) {
          appComponents.order._onDataChanged();
        }
      } catch (err) {
        showToast('Ошибка: ' + err.message, 'error');
      }
      document.body.removeChild(input);
    };
    reader.readAsText(file);
  };
}

async function resetAllData() {
  const { showConfirm } = await import('./ui/modal.js');
  const confirmed = await showConfirm('Удалить все данные? Восстановление невозможно.', 'Сброс данных');
  if (!confirmed) return;
  for (const key in localStorage) {
    if (key.startsWith('app_') || key === 'theme' || key === 'open_state' || key === 'detailsOpenOrder' || key === 'last_mode') {
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
  state._calcCache.clear();
  saveState();

  for (const key in appComponents) {
    if (appComponents[key] && typeof appComponents[key].destroy === 'function') {
      appComponents[key].destroy();
    }
    delete appComponents[key];
  }
  location.reload();
}

export function exportInventoryHTML() {
  // ... (без изменений)
}

window.switchMode = switchMode;
window.exportInventoryHTML = exportInventoryHTML;
window.loadLibrary = loadLibrary;
window.resetAllData = resetAllData;

function initApp() {
  console.log('[App] Инициализация...');
  initStore();
  initTheme((theme) => { console.log('[App] Тема изменена:', theme); });
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