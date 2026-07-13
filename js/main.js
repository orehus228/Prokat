// main.js — Точка входа, навигация, инициализация
import { initData, saveEditorData, editorData, resetAllData } from './data.js';
import { renderEditorAll, addCategory, initRenderHandlers } from './render-editor.js';
import { renderOrderAll, initOrderUI } from './order-render.js';
import { exportOrderJSON, exportOrderPDF, initOrderPresetsUI } from './order-presets.js';
import { clearOrderData } from './order-actions.js';
import { renderOpenOrder, initOpenUI } from './render-open.js';
import { renderLoadingPage, initTruckManagerHandlers } from './render-loading.js';
import { initModalHandlers, showToast, showConfirm } from './ui.js';
import { initCases, openCasesManagerModal, openMatrixModal, openCaseSettingsModal } from './cases.js';
import { loadOrderData, saveOrderData } from './order.js';
import { STORAGE_KEYS } from './config.js';

console.log('main.js загружен');

let currentMode = 'menu';
let currentTheme = 'dark';

// Ключ для сохранения выбранных грузовиков
const SELECTED_TRUCKS_KEY = 'selected_truck_ids';

function switchMode(mode) {
    console.log('switchMode:', mode);
    currentMode = mode;
    const menu = document.getElementById('mMenu');
    const editorPage = document.getElementById('editorPage');
    const orderPage = document.getElementById('mPage');
    const openPage = document.getElementById('sPage');
    const loadingPage = document.getElementById('loadingPage');

    if (menu) menu.style.display = (mode === 'menu') ? 'block' : 'none';
    if (editorPage) editorPage.style.display = (mode === 'editor') ? 'block' : 'none';
    if (orderPage) orderPage.style.display = (mode === 'order') ? 'block' : 'none';
    if (openPage) openPage.style.display = (mode === 'open') ? 'block' : 'none';
    if (loadingPage) loadingPage.style.display = (mode === 'loading') ? 'block' : 'none';

    if (mode === 'editor') renderEditorAll();
    if (mode === 'order') renderOrderAll();
    if (mode === 'open') {
        const sRes = document.getElementById('sRes');
        if (sRes) sRes.style.display = 'none';
        document.getElementById('loadStatus').textContent = 'Файл не выбран';
        document.getElementById('fSel').value = '';
    }
    if (mode === 'loading') {
        const saved = localStorage.getItem(SELECTED_TRUCKS_KEY);
        if (saved) {
            try {
                window.selectedTruckIds = JSON.parse(saved);
            } catch(e) {
                window.selectedTruckIds = [];
            }
        } else {
            window.selectedTruckIds = [];
        }
        renderLoadingPage();
    }
}

function toggleTheme() {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', currentTheme);
    localStorage.setItem('theme', currentTheme);
    const toggle = document.getElementById('themeToggle');
    if (toggle) toggle.classList.toggle('light', currentTheme === 'light');
    showToast('Тема: ' + (currentTheme === 'dark' ? 'тёмная' : 'светлая'), 'neutral');
}

function loadTheme() {
    const saved = localStorage.getItem('theme');
    if (saved) {
        currentTheme = saved;
    } else {
        currentTheme = 'dark';
    }
    document.body.setAttribute('data-theme', currentTheme);
    const toggle = document.getElementById('themeToggle');
    if (toggle) toggle.classList.toggle('light', currentTheme === 'light');
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
                if (data.truckPresets) editorData.truckPresets = data.truckPresets;
                saveEditorData();
                showToast('Библиотека загружена', 'success');
                if (currentMode === 'editor') renderEditorAll();
                else if (currentMode === 'order') renderOrderAll();
                else if (currentMode === 'loading') renderLoadingPage();
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

function exportInventoryHTML() {
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

    const order = editorData._categoryOrder || Object.keys(editorData.inventory);
    order.forEach(cat => {
        const catData = editorData.inventory[cat];
        if (!catData) return;
        if (Array.isArray(catData)) {
            catData.forEach(item => {
                const path = cat + '|' + item;
                const stock = editorData.stock[path] || 0;
                const props = editorData.itemProps[path] || {};
                html += `<tr><td>${cat}</td><td></td><td>${item}</td><td>${stock}</td><td>${props.weight || ''}</td><td>${props.dimensions || ''}</td></tr>`;
            });
        } else if (typeof catData === 'object') {
            const subOrder = catData._subOrder || Object.keys(catData).filter(k => k !== '_subOrder');
            subOrder.forEach(sub => {
                const items = catData[sub];
                if (!Array.isArray(items)) return;
                items.forEach(item => {
                    const path = cat + '|' + sub + '|' + item;
                    const stock = editorData.stock[path] || 0;
                    const props = editorData.itemProps[path] || {};
                    html += `<tr><td>${cat}</td><td>${sub}</td><td>${item}</td><td>${stock}</td><td>${props.weight || ''}</td><td>${props.dimensions || ''}</td></tr>`;
                });
            });
        }
    });

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

function initApp() {
    console.log('Инициализация...');
    initData();
    loadOrderData();
    loadTheme();
    initModalHandlers();
    initCases();
    initRenderHandlers();
    initOrderUI();          // инициализация UI заказа (вкладки, поиск и т.д.)
    initOrderPresetsUI();   // инициализация пресетов (теперь в отдельном модуле)
    initOpenUI();
    initTruckManagerHandlers();

    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) themeToggle.addEventListener('click', toggleTheme);

    const btnMenuOrder = document.getElementById('btnCreateOrder');
    const btnMenuOpen = document.getElementById('btnOpenOrder');
    const btnMenuEditor = document.getElementById('btnEditor');
    const btnMenuLoadLibrary = document.getElementById('btnLoadLibrary');
    const btnMenuResetLibrary = document.getElementById('btnResetAll');
    const btnMenuLoading = document.getElementById('btnLoading');

    if (btnMenuOrder) btnMenuOrder.addEventListener('click', () => switchMode('order'));
    if (btnMenuOpen) btnMenuOpen.addEventListener('click', () => switchMode('open'));
    if (btnMenuEditor) btnMenuEditor.addEventListener('click', () => switchMode('editor'));
    if (btnMenuLoadLibrary) btnMenuLoadLibrary.addEventListener('click', loadLibrary);
    if (btnMenuResetLibrary) btnMenuResetLibrary.addEventListener('click', resetLibrary);
    if (btnMenuLoading) btnMenuLoading.addEventListener('click', () => switchMode('loading'));

    const backBtns = document.querySelectorAll('#btnBackToMenu, #btnBackToMenu2, #btnBackToMenu3, #btnBackToMenu4');
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

    if (btnMatrix) btnMatrix.addEventListener('click', () => openMatrixModal());
    if (btnCommonCases) btnCommonCases.addEventListener('click', () => openCasesManagerModal());
    if (btnSaveJSON) btnSaveJSON.addEventListener('click', exportOrderJSON);
    if (btnSavePDF) btnSavePDF.addEventListener('click', exportOrderPDF);
    if (btnClearOrder) btnClearOrder.addEventListener('click', clearOrderData);

    const addCategoryBtn = document.getElementById('addCategoryBtn');
    if (addCategoryBtn) addCategoryBtn.addEventListener('click', addCategory);

    const saveHtmlBtn = document.getElementById('saveHtmlBtn');
    if (saveHtmlBtn) saveHtmlBtn.addEventListener('click', exportInventoryHTML);

    switchMode('menu');
    showToast('Прокатошная загружена', 'neutral');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}