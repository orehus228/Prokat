// main.js — Точка входа, навигация, инициализация (исправленная версия)
import { initData, saveEditorData, editorData } from './data.js';
import { renderEditorAll, addCategory, initRenderHandlers } from './render-editor.js';
import { renderOrderAll, initOrderUI, exportOrderJSON, exportOrderPDF, clearOrderData } from './render-order.js';
import { renderOpenOrder, initOpenUI } from './render-open.js';
import { initModalHandlers, showToast } from './ui.js';
import { initCases, openCasesManagerModal, openMatrixModal } from './cases.js';
import { loadOrderData } from './order.js';

console.log('main.js загружен');

// ============================================================
// НАВИГАЦИЯ
// ============================================================
let currentMode = 'menu'; // menu | editor | order | open

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

// ============================================================
// ЗАГРУЗКА БИБЛИОТЕКИ (из файла)
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
                if (data.inventory) editorData.inventory = data.inventory;
                if (data.stock) editorData.stock = data.stock;
                if (data.specs) editorData.specs = data.specs;
                if (data.itemProps) editorData.itemProps = data.itemProps;
                if (data.catNames) editorData.catNames = data.catNames;
                if (data._categoryOrder) editorData._categoryOrder = data._categoryOrder;
                if (data.commonCases) editorData.commonCases = data.commonCases;
                saveEditorData();
                showToast('✅ Библиотека загружена');
                if (currentMode === 'editor') renderEditorAll();
                if (currentMode === 'order') renderOrderAll();
            } catch(err) {
                showToast('❌ Ошибка: ' + err.message);
            }
            document.body.removeChild(input);
        };
        reader.readAsText(file);
    };
}

// ============================================================
// СБРОС ДАННЫХ
// ============================================================
function resetAll() {
    if (!confirm('⚠️ Удалить все данные?')) return;
    localStorage.clear();
    location.reload();
}

// ============================================================
// ПРЕСЕТЫ (ЗАГЛУШКИ)
// ============================================================
function savePreset() { showToast('Сохранение пресета (заглушка)'); }
function loadPreset() { showToast('Загрузка пресета (заглушка)'); }
function exportPresets() { showToast('Экспорт пресетов (заглушка)'); }
function importPresets() { document.getElementById('presetFileInput').click(); }
function deletePreset() { showToast('Удаление пресета (заглушка)'); }

// ============================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================
function initApp() {
    console.log('Инициализация...');
    initData();
    loadOrderData();
    initModalHandlers();
    initCases();
    initRenderHandlers();
    initOrderUI();
    initOpenUI();

    // === НАВИГАЦИЯ ПО КНОПКАМ МЕНЮ ===
    const btnMenuOrder = document.getElementById('btnMenuOrder');
    const btnMenuOpen = document.getElementById('btnMenuOpen');
    const btnMenuEditor = document.getElementById('btnMenuEditor');
    const btnMenuLoadLibrary = document.getElementById('btnMenuLoadLibrary');
    const btnMenuReset = document.getElementById('btnMenuReset');

    if (btnMenuOrder) btnMenuOrder.addEventListener('click', () => switchMode('order'));
    if (btnMenuOpen) btnMenuOpen.addEventListener('click', () => switchMode('open'));
    if (btnMenuEditor) btnMenuEditor.addEventListener('click', () => switchMode('editor'));
    if (btnMenuLoadLibrary) btnMenuLoadLibrary.addEventListener('click', loadLibrary);
    if (btnMenuReset) btnMenuReset.addEventListener('click', resetAll);

    // === КНОПКИ "В МЕНЮ" ===
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

    // === КНОПКИ НА СТРАНИЦЕ ЗАКАЗА ===
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
                showToast('Импорт пресета (заглушка)');
                this.value = '';
            }
        });
    }
    if (btnDeletePreset) btnDeletePreset.addEventListener('click', deletePreset);
    if (btnSaveJSON) btnSaveJSON.addEventListener('click', exportOrderJSON);
    if (btnSavePDF) btnSavePDF.addEventListener('click', exportOrderPDF);
    if (btnClearOrder) btnClearOrder.addEventListener('click', clearOrderData);

    // === РЕДАКТОР ===
    const addCategoryBtn = document.getElementById('addCategoryBtn');
    if (addCategoryBtn) addCategoryBtn.addEventListener('click', addCategory);

    // Показываем меню по умолчанию
    switchMode('menu');
    showToast('Прокатошная загружена (исправленная версия)');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}