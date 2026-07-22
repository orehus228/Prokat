// main.js

/**
 * Точка входа в приложение.
 * Инициализирует store, тему, модалки, компоненты страниц и навигацию.
 * @module main
 */

import { initStore, getState, saveState, loadState } from './core/store.js';
import { emit, EVENTS } from './core/events.js';
import { initTheme } from './ui/theme.js';
import { initModalHandlers } from './ui/modal.js';
import { showToast } from './ui/toast.js';
import { createMenu } from './ui/components/Menu.js';
// Импорт нового OrderPage
import { createOrderPage } from './ui/components/OrderPage.js';
import { createEditorPage } from './ui/components/EditorPage.js';
import { createOpenPage } from './ui/components/OpenPage.js';
import { createLoadingPage } from './ui/components/LoadingPage.js';
import { createMonitoringPage } from './ui/components/MonitoringPage.js';

// ============================================================
// СОСТОЯНИЕ ПРИЛОЖЕНИЯ
// ============================================================

let currentMode = 'menu';
let appComponents = {};

// ============================================================
// КОНТЕЙНЕРЫ
// ============================================================

const containers = {
  menu: document.getElementById('mMenu'),
  order: document.getElementById('mPage'),
  editor: document.getElementById('editorPage'),
  open: document.getElementById('sPage'),
  loading: document.getElementById('loadingPage'),
  monitoring: document.getElementById('monitoringPage'),
};

// ============================================================
// ФУНКЦИЯ ПЕРЕКЛЮЧЕНИЯ РЕЖИМОВ
// ============================================================

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
        appComponents.order = createOrderPage(container, {
          onNavigate: switchMode,
        });
      } else {
        // Принудительно обновляем
        if (typeof appComponents.order.render === 'function') {
          appComponents.order.render();
        } else if (typeof appComponents.order._onDataChanged === 'function') {
          appComponents.order._onDataChanged();
        }
      }
      break;
    case 'editor':
      if (!appComponents.editor) {
        appComponents.editor = createEditorPage(container, {
          onNavigate: switchMode,
        });
      } else {
        appComponents.editor._renderEditor();
      }
      break;
    case 'open':
      if (!appComponents.open) {
        appComponents.open = createOpenPage(container, {
          onNavigate: switchMode,
        });
      } else {
        appComponents.open._renderContent();
      }
      break;
    case 'loading':
      if (!appComponents.loading) {
        appComponents.loading = createLoadingPage(container, {
          onNavigate: switchMode,
        });
      } else {
        appComponents.loading._renderTruckSelection();
        appComponents.loading._renderResult();
      }
      break;
    case 'monitoring':
      if (!appComponents.monitoring) {
        appComponents.monitoring = createMonitoringPage(container, {
          onNavigate: switchMode,
        });
      } else {
        appComponents.monitoring._render();
      }
      break;
  }

  emit(EVENTS.UI_STATE_CHANGED, { mode });
}

// ============================================================
// ЗАГРУЗКА БИБЛИОТЕКИ
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

        if (!data.inventory) {
          showToast('Ошибка: в файле отсутствует inventory', 'error');
          return;
        }

        // Обновляем состояние напрямую через store
        const state = getState();
        state.inventory = data.inventory || {};
        state.stock = data.stock || {};
        state.specs = data.specs || {};
        state.itemProps = data.itemProps || {};
        state.catNames = data.catNames || {};
        state._categoryOrder = data._categoryOrder || [];
        state.commonCases = data.commonCases || [];
        state.truckPresets = data.truckPresets || [];
        state.projects = data.projects || [];
        state.projectItems = data.projectItems || [];

        // Нормализация структуры
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

        if (currentMode === 'editor' && appComponents.editor) {
          appComponents.editor._renderEditor();
        } else if (currentMode === 'order' && appComponents.order) {
          if (typeof appComponents.order.render === 'function') {
            appComponents.order.render();
          } else {
            appComponents.order._onDataChanged();
          }
        } else if (currentMode === 'open' && appComponents.open) {
          appComponents.open._renderContent();
        } else if (currentMode === 'loading' && appComponents.loading) {
          appComponents.loading._renderTruckSelection();
          appComponents.loading._renderResult();
        } else if (currentMode === 'monitoring' && appComponents.monitoring) {
          appComponents.monitoring._render();
        }

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
// СБРОС ВСЕХ ДАННЫХ
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
// ГЛОБАЛЬНЫЕ ФУНКЦИИ
// ============================================================

window.switchMode = switchMode;
window.loadLibrary = loadLibrary;
window.resetAllData = resetAllData;

// ============================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================

function initApp() {
  console.log('[App] Инициализация...');
  initStore();
  loadState(); // Загружаем данные
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
  loadLibrary,
  resetAllData,
  initApp,
};