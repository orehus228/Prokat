// main.js
import { initState, getState, saveState } from './core/state.js';
import { loadTheme, initThemeToggle, applyTheme } from './ui/theme.js';
import { initModalHandlers } from './ui/modal.js';
import { showToast } from './ui/toast.js';
import { esc, getElement } from './ui/dom.js';
import { EVENTS, emit, on } from './core/events.js';

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

let currentMode = 'menu';
let currentTheme = 'dark';

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

  if (mode === 'editor') renderEditorAll();
  if (mode === 'order') initOrderPage();
  if (mode === 'open') {
    const sRes = document.getElementById('sRes');
    if (sRes) sRes.style.display = 'none';
    const status = document.getElementById('loadStatus');
    if (status) status.textContent = 'Файл не выбран';
    const fileInput = document.getElementById('fSel');
    if (fileInput) fileInput.value = '';
  }
  if (mode === 'loading') renderLoadingPage();
  if (mode === 'monitoring') {
    renderMonitoringPage();
    initMonitoringUI();
  }

  emit(EVENTS.UI_STATE_CHANGED, { mode });
}

function toggleTheme() {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  applyTheme(currentTheme);
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
        if (currentMode === 'editor') renderEditorAll();
        else if (currentMode === 'order') initOrderPage();
        else if (currentMode === 'loading') renderLoadingPage();
        else if (currentMode === 'monitoring') renderMonitoringPage();
        emit(EVENTS.EDITOR_DATA_CHANGED, { source: 'loadLibrary' });
      } catch (err) {
        showToast('Ошибка: ' + err.message, 'error');
      }
      document.body.removeChild(input);
    };
    reader.readAsText(file);
  };
}

async function resetLibrary() {
  const { showConfirm } = await import('./ui/modal.js');
  const confirmed = await showConfirm('Удалить всю библиотеку? Все данные будут потеряны.');
  if (!confirmed) return;
  resetAllData();
  for (let key in STORAGE_KEYS) {
    localStorage.removeItem(STORAGE_KEYS[key]);
  }
  location.reload();
}

function exportInventoryHTML() {
  import('./components/editor/render.js').then(module => {
    module.exportInventoryHTML();
  });
}

function initApp() {
  console.log('Инициализация приложения...');
  initState();
  loadThemeFromState();
  initModalHandlers();
  initCases();
  initRenderHandlers();
  initOpenUI();
  initTruckManagerHandlers();

  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }

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

  const addCategoryBtn = document.getElementById('addCategoryBtn');
  if (addCategoryBtn) {
    addCategoryBtn.addEventListener('click', addCategory);
  }

  const saveHtmlBtn = document.getElementById('saveHtmlBtn');
  if (saveHtmlBtn) {
    saveHtmlBtn.addEventListener('click', exportInventoryHTML);
  }

  switchMode('menu');
  showToast('Прокатошная загружена', 'neutral', 1500);
  emit(EVENTS.UI_STATE_CHANGED, { mode: 'menu', initialized: true });
  console.log('Приложение инициализировано');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

export default {
  switchMode,
  toggleTheme,
  loadLibrary,
  resetLibrary,
  exportInventoryHTML,
  initApp,
};

window.switchMode = switchMode;
window.toggleTheme = toggleTheme;