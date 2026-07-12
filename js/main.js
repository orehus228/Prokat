// main.js — Точка входа, навигация, инициализация
import { initData, saveEditorData, editorData, resetAllData } from './data.js';
import { renderEditorAll, addCategory, initRenderHandlers } from './render-editor.js';
import { renderOrderAll, initOrderUI, exportOrderJSON, exportOrderPDF, clearOrderData } from './render-order.js';
import { renderOpenOrder, initOpenUI } from './render-open.js';
import { initModalHandlers, showToast, showConfirm } from './ui.js';
import { initCases, openCasesManagerModal, openMatrixModal, openCaseSettingsModal } from './cases.js';
import { loadOrderData, saveOrderData } from './order.js';
import { STORAGE_KEYS } from './config.js';

console.log('main.js загружен');

let currentMode = 'menu';
let currentTheme = 'dark';

function switchMode(mode) {
    console.log('switchMode:', mode);
    currentMode = mode;
    const menu = document.getElementById('mMenu');
    const editorPage = document.getElementById('editorPage');
    const orderPage = document.getElementById('orderPage');
    const openPage = document.getElementById('openPage');

    if (menu) menu.style.display = (mode === 'menu') ? 'block' : 'none';
    if (editorPage) editorPage.style.display = (mode === 'editor') ? 'block' : 'none';
    if (orderPage) orderPage.style.display = (mode === 'order') ? 'block' : 'none';
    if (openPage) openPage.style.display = (mode === 'open') ? 'block' : 'none';

    if (mode === 'editor') renderEditorAll();
    if (mode === 'order') renderOrderAll();
    if (mode === 'open') {
        const sRes = document.getElementById('sRes');
        if (sRes) sRes.style.display = 'none';
        document.getElementById('loadStatus').textContent = 'Файл не выбран';
        document.getElementById('fSel').value = '';
    }
}

function toggleTheme() {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', currentTheme);
    localStorage.setItem('theme', currentTheme);
    // Кнопка уже обновляется через CSS, текст не нужен
    showToast('Тема: ' + (currentTheme === 'dark' ? 'тёмная' : 'светлая'), 'info');
}

function loadTheme() {
    const saved = localStorage.getItem('theme');
    if (saved) {
        currentTheme = saved;
    } else {
        currentTheme = 'dark';
    }
    document.body.setAttribute('data-theme', currentTheme);
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
                if (data.inventory) editorData.inventory = data.inventory;
                if (data.stock) editorData.stock = data.stock;
                if (data.specs) editorData.specs = data.specs;
                if (data.itemProps) editorData.itemProps = data.itemProps;
                if (data.catNames) editorData.catNames = data.catNames;
                if (data._categoryOrder) editorData._categoryOrder = data._categoryOrder;
                if (data.commonCases) editorData.commonCases = data.commonCases;
                saveEditorData();
                showToast('Библиотека загружена', 'success');
                if (currentMode === 'editor') renderEditorAll();
                if (currentMode === 'order') renderOrderAll();
            } catch(err) {
                showToast('Ошибка: ' + err.message, 'error');
            }
            document.body.removeChild(input);
        };
        reader.readAsText(file);
    };
}

async function resetLibrary() {
    const confirmed = await showConfirm('Удалить всю библиотеку? Все данные будут потеряны.');
    if (!confirmed) return;
    resetAllData();
    for (let key in STORAGE_KEYS) {
        localStorage.removeItem(STORAGE_KEYS[key]);
    }
    location.reload();
}

function savePreset() { showToast('Сохранение пресета (заглушка)', 'info'); }
function loadPreset() { showToast('Загрузка пресета (заглушка)', 'info'); }
function exportPresets() { showToast('Экспорт пресетов (заглушка)', 'info'); }
function importPresets() { document.getElementById('presetFileInput').click(); }
function deletePreset() { showToast('Удаление пресета (заглушка)', 'info'); }

function initApp() {
    console.log('Инициализация...');
    initData();
    loadOrderData();
    loadTheme();
    initModalHandlers();
    initCases();
    initRenderHandlers();
    initOrderUI();
    initOpenUI();

    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) themeToggle.addEventListener('click', toggleTheme);

    const btnMenuOrder = document.getElementById('btnMenuOrder');
    const btnMenuOpen = document.getElementById('btnMenuOpen');
    const btnMenuEditor = document.getElementById('btnMenuEditor');
    const btnMenuLoadLibrary = document.getElementById('btnMenuLoadLibrary');
    const btnMenuResetLibrary = document.getElementById('btnMenuResetLibrary');

    if (btnMenuOrder) btnMenuOrder.addEventListener('click', () => switchMode('order'));
    if (btnMenuOpen) btnMenuOpen.addEventListener('click', () => switchMode('open'));
    if (btnMenuEditor) btnMenuEditor.addEventListener('click', () => switchMode('editor'));
    if (btnMenuLoadLibrary) btnMenuLoadLibrary.addEventListener('click', loadLibrary);
    if (btnMenuResetLibrary) btnMenuResetLibrary.addEventListener('click', resetLibrary);

    const backBtns = document.querySelectorAll('#btnBackToMenu, #btnBackToMenu2, #btnBackToMenu3');
    backBtns.forEach(btn => {
        if (btn) {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                console.log('Кнопка "В меню" нажата');
                switchMode('menu');
            });
        }
    });

    const btnMatrix = document.getElementById('btnMatrix');
    const btnCommonCases = document.getElementById('btnCommonCases');
    const btnSavePreset = document.getElementById('btnSavePreset');
    const btnLoadPreset = document.getElementById('btnLoadPreset');
    const btnExportPresets = document.getElementById('btnExportPresets');
    const btnImportPresets = document.getElementById('btnImportPresets');
    const presetFileInput = document.getElementById('presetFileInput');
    const btnDeletePreset = document.getElementById('btnDeletePreset');
    const btnSaveJSON = document.getElementById('btnSaveJSON');
    const btnSavePDF = document.getElementById('btnSavePDF');
    const btnClearOrder = document.getElementById('btnClearOrder');

    if (btnMatrix) btnMatrix.addEventListener('click', () => openMatrixModal());
    if (btnCommonCases) btnCommonCases.addEventListener('click', () => openCasesManagerModal());
    if (btnSavePreset) btnSavePreset.addEventListener('click', savePreset);
    if (btnLoadPreset) btnLoadPreset.addEventListener('click', loadPreset);
    if (btnExportPresets) btnExportPresets.addEventListener('click', exportPresets);
    if (btnImportPresets) btnImportPresets.addEventListener('click', importPresets);
    if (presetFileInput) {
        presetFileInput.addEventListener('change', function(e) {
            if (e.target.files[0]) {
                showToast('Импорт пресета (заглушка)', 'info');
                this.value = '';
            }
        });
    }
    if (btnDeletePreset) btnDeletePreset.addEventListener('click', deletePreset);
    if (btnSaveJSON) btnSaveJSON.addEventListener('click', exportOrderJSON);
    if (btnSavePDF) btnSavePDF.addEventListener('click', exportOrderPDF);
    if (btnClearOrder) btnClearOrder.addEventListener('click', clearOrderData);

    const addCategoryBtn = document.getElementById('addCategoryBtn');
    if (addCategoryBtn) addCategoryBtn.addEventListener('click', addCategory);

    switchMode('menu');
    showToast('Прокатошная загружена', 'success');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}