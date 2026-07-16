// main.js
import { initState, getState, saveState } from './core/state.js';
import { loadTheme, initThemeToggle, applyTheme } from './ui/theme.js';
import { initModalHandlers } from './ui/modal.js';
import { showToast } from './ui/toast.js';
import { esc, getElement } from './ui/dom.js';
import { EVENTS, emit, on } from './core/events.js';

// Импорты компонентов
import { initOrderPage } from './components/order/index.js';
import { renderEditorAll, initRenderHandlers, addCategory } from './components/editor/render.js';
import { initOpenUI } from './components/open/render.js';
import { renderLoadingPage, initTruckManagerHandlers } from './components/loading/index.js';
import { renderMonitoringPage, initMonitoringUI } from './components/monitoring/index.js';
import { initCases } from './components/cases/index.js';
import { exportOrderJSON, exportOrderPDF, initOrderPresetsUI } from './components/order/presets.js';
import { clearOrderData } from './components/order/actions.js';
import { resetAllData } from './data/editor-data.js';
import { STORAGE_KEYS } from './core/config.js';

// ============================================================
// СОСТОЯНИЕ ПРИЛОЖЕНИЯ
// ============================================================

let currentMode = 'menu';
let currentTheme = 'dark';

// ============================================================
// НАВИГАЦИЯ
// ============================================================

function switchMode(mode) {
  console.log('switchMode:', mode);
  currentMode = mode;
  const menu = document.getElementById('mMenu');
  const editorPage = document.getElementById('editorPage');
  const orderPage = document.getElementById('mPage');
  const openPage = document.getElementById('sPage');
  const loadingPage = document.getElementById('loadingPage');
  const monitoringPage = document.getElementById('monitoringPage');

  if (menu) menu.style.display = (mode === 'menu') ? 'block' : 'none';
  if (editorPage) editorPage.style.display = (mode === 'editor') ? 'block' : 'none';
  if (orderPage) orderPage.style.display = (mode === 'order') ? 'block' : 'none';
  if (openPage) openPage.style.display = (mode === 'open') ? 'block' : 'none';
  if (loadingPage) loadingPage.style.display = (mode === 'loading') ? 'block' : 'none';
  if (monitoringPage) monitoringPage.style.display = (mode === 'monitoring') ? 'block' : 'none';

  // Инициализация страниц при переключении
  if (mode === 'editor') {
    renderEditorAll();
  }
  if (mode === 'order') {
    initOrderPage();
  }
  if (mode === 'open') {
    const sRes = document.getElementById('sRes');
    if (sRes) sRes.style.display = 'none';
    const status = document.getElementById('loadStatus');
    if (status) status.textContent = 'Файл не выбран';
    const fileInput = document.getElementById('fSel');
    if (fileInput) fileInput.value = '';
  }
  if (mode === 'loading') {
    renderLoadingPage();
  }
  if (mode === 'monitoring') {
    renderMonitoringPage();
    initMonitoringUI();
  }

  // Отправляем событие о смене страницы
  emit(EVENTS.UI_STATE_CHANGED, { mode });
}

// ============================================================
// ТЕМА
// ============================================================

function toggleTheme() {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  applyTheme(currentTheme);
  // Сохраняем в state (уже делает applyTheme через state)
  const state = getState();
  state.theme = currentTheme;
  saveState();
  showToast('Тема: ' + (currentTheme === 'dark' ? 'тёмная' : 'светлая'), 'neutral');
}

function loadThemeFromState() {
  const state = getState();
  currentTheme = state.theme || 'dark';
  applyTheme(currentTheme);
}

// ============================================================
// ЗАГРУЗКА БИБЛИОТЕКИ (импорт JSON)
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
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
      try {
        const data = JSON.parse(ev.target.result);
        const state = getState();
        // Загружаем все поля редактора
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
        // Нормализация
        for (let cat in state.inventory) {
          const catData = state.inventory[cat];
          if (catData && typeof catData === 'object' && !Array.isArray(catData)) {
            if (!catData._subOrder) {
              catData._subOrder = Object.keys(catData).filter(k => k !== '_subOrder');
            } else {
              catData._subOrder = catData._subOrder.filter(k => catData[k] !== undefined);
              Object.keys(catData).forEach(k => {
                if (k !== '_subOrder' && !catData._subOrder.includes(k)) {
                  catData._subOrder.push(k);
                }
              });
            }
          }
        }
        saveState();
        showToast('Библиотека загружена', 'success');
        // Обновляем текущую страницу
        if (currentMode === 'editor') renderEditorAll();
        else if (currentMode === 'order') initOrderPage();
        else if (currentMode === 'loading') renderLoadingPage();
        else if (currentMode === 'monitoring') renderMonitoringPage();
        // Отправляем событие
        emit(EVENTS.EDITOR_DATA_CHANGED, { source: 'loadLibrary' });
      } catch (err) {
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

async function resetLibrary() {
  const { showConfirm } = await import('./ui/modal.js');
  const confirmed = await showConfirm('Удалить всю библиотеку? Все данные будут потеряны.');
  if (!confirmed) return;
  resetAllData();
  // Очищаем все ключи хранилища
  for (let key in STORAGE_KEYS) {
    localStorage.removeItem(STORAGE_KEYS[key]);
  }
  // Перезагружаем страницу
  location.reload();
}

// ============================================================
// ЭКСПОРТ ИНВЕНТАРЯ В HTML (для редактора)
// ============================================================

function exportInventoryHTML() {
  import('./components/editor/render.js').then(module => {
    module.exportInventoryHTML();
  });
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
// ============================================================

function initApp() {
  console.log('Инициализация приложения...');

  // 1. Инициализация состояния
  initState();

  // 2. Загрузка темы
  loadThemeFromState();

  // 3. Инициализация модалок
  initModalHandlers();

  // 4. Инициализация модалок кофров (cases)
  initCases();

  // 5. Инициализация обработчиков редактора
  initRenderHandlers();

  // 6. Инициализация страницы открытия (чек-лист)
  initOpenUI();

  // 7. Инициализация управления грузовиками
  initTruckManagerHandlers();

  // 8. Инициализация кнопки темы
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }

  // ============================================================
  // КНОПКИ ГЛАВНОГО МЕНЮ
  // ============================================================

  const btnMenuOrder = document.getElementById('btnCreateOrder');
  const btnMenuOpen = document.getElementById('btnOpenOrder');
  const btnMenuEditor = document.getElementById('btnEditor');
  const btnMenuLoadLibrary = document.getElementById('btnLoadLibrary');
  const btnMenuResetLibrary = document.getElementById('btnResetAll');
  const btnMenuLoading = document.getElementById('btnLoading');
  const btnMenuMonitoring = document.getElementById('btnMonitoring');

  if (btnMenuOrder) btnMenuOrder.addEventListener('click', () => switchMode('order'));
  if (btnMenuOpen) btnMenuOpen.addEventListener('click', () => switchMode('open'));
  if (btnMenuEditor) btnMenuEditor.addEventListener('click', () => switchMode('editor'));
  if (btnMenuLoadLibrary) btnMenuLoadLibrary.addEventListener('click', loadLibrary);
  if (btnMenuResetLibrary) btnMenuResetLibrary.addEventListener('click', resetLibrary);
  if (btnMenuLoading) btnMenuLoading.addEventListener('click', () => switchMode('loading'));
  if (btnMenuMonitoring) btnMenuMonitoring.addEventListener('click', () => switchMode('monitoring'));

  // ============================================================
  // КНОПКИ "В МЕНЮ" НА ВСЕХ СТРАНИЦАХ
  // ============================================================

  const backBtns = document.querySelectorAll('#btnBackToMenu, #btnBackToMenu2, #btnBackToMenu3, #btnBackToMenu4, #btnBackToMenu5');
  backBtns.forEach(btn => {
    if (btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        console.log('Кнопка "В меню" нажата');
        switchMode('menu');
      });
    }
  });

  // ============================================================
  // КНОПКИ НА СТРАНИЦЕ ЗАКАЗА (матрица, общие кофры, экспорт, очистка)
  // ============================================================

  const btnMatrix = document.getElementById('openMatrixModal');
  const btnCommonCases = document.getElementById('openCommonCasesManager');
  const btnSaveJSON = document.getElementById('saveJ');
  const btnSavePDF = document.getElementById('savePdf');
  const btnClearOrder = document.getElementById('clearOrder');

  if (btnMatrix) {
    btnMatrix.addEventListener('click', () => {
      import('./components/cases/matrix.js').then(module => {
        module.openMatrixModal();
      });
    });
  }
  if (btnCommonCases) {
    btnCommonCases.addEventListener('click', () => {
      import('./components/cases/common-manager.js').then(module => {
        module.openCasesManagerModal();
      });
    });
  }
  if (btnSaveJSON) {
    btnSaveJSON.addEventListener('click', exportOrderJSON);
  }
  if (btnSavePDF) {
    btnSavePDF.addEventListener('click', exportOrderPDF);
  }
  if (btnClearOrder) {
    btnClearOrder.addEventListener('click', clearOrderData);
  }

  // ============================================================
  // КНОПКИ РЕДАКТОРА
  // ============================================================

  const addCategoryBtn = document.getElementById('addCategoryBtn');
  if (addCategoryBtn) {
    addCategoryBtn.addEventListener('click', addCategory);
  }

  const saveHtmlBtn = document.getElementById('saveHtmlBtn');
  if (saveHtmlBtn) {
    saveHtmlBtn.addEventListener('click', exportInventoryHTML);
  }

  // ============================================================
  // ЗАПУСК
  // ============================================================

  // Стартуем в меню
  switchMode('menu');
  showToast('Прокатошная загружена', 'neutral', 1500);

  // Отправляем событие о готовности
  emit(EVENTS.UI_STATE_CHANGED, { mode: 'menu', initialized: true });

  console.log('Приложение инициализировано');
}

// ============================================================
// ЗАПУСК ПРИЛОЖЕНИЯ
// ============================================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// ============================================================
// ЭКСПОРТ (для отладки и глобального доступа)
// ============================================================

export default {
  switchMode,
  toggleTheme,
  loadLibrary,
  resetLibrary,
  exportInventoryHTML,
  initApp,
};

// Делаем некоторые функции доступными глобально для onclick в HTML
window.switchMode = switchMode;
window.toggleTheme = toggleTheme;