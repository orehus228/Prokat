// main.js — Точка входа, навигация, инициализация
import { initData, saveEditorData, editorData } from './data.js';
import { renderEditorAll, addCategory, initRenderHandlers } from './render-editor.js';
import { renderOrderAll, initOrderUI } from './render-order.js';
import { renderOpenOrder, initOpenUI } from './render-open.js';
import { initModalHandlers, showToast } from './ui.js';
import { initCases, openCasesManagerModal } from './cases.js';
import { loadOrderData } from './order.js';

console.log('main.js загружен');

// ============================================================
// НАВИГАЦИЯ
// ============================================================
let currentMode = 'menu'; // menu | editor | order | open

function switchMode(mode) {
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
// СОХРАНЕНИЕ JSON / PDF (заглушки)
// ============================================================
function saveOrderJSON() { showToast('Сохранить JSON (заглушка)'); }
function saveOrderPDF() { showToast('Сохранить PDF (заглушка)'); }
function clearOrder() { showToast('Очистить список (заглушка)'); }
function openMatrixModal() { showToast('Матрица привязок (заглушка)'); }

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

    // Назначаем обработчики кнопок навигации
    document.getElementById('btnMenuEditor')?.addEventListener('click', () => switchMode('editor'));
    document.getElementById('btnMenuOrder')?.addEventListener('click', () => switchMode('order'));
    document.getElementById('btnMenuOpen')?.addEventListener('click', () => switchMode('open'));
    document.getElementById('btnMenuLoadLibrary')?.addEventListener('click', loadLibrary);
    document.getElementById('btnMenuReset')?.addEventListener('click', resetAll);

    // Кнопки на странице заказа (заглушки)
    document.getElementById('btnSaveJSON')?.addEventListener('click', saveOrderJSON);
    document.getElementById('btnSavePDF')?.addEventListener('click', saveOrderPDF);
    document.getElementById('btnClearOrder')?.addEventListener('click', clearOrder);
    document.getElementById('btnMatrix')?.addEventListener('click', openMatrixModal);
    document.getElementById('btnCommonCases')?.addEventListener('click', () => openCasesManagerModal());

    // Кнопка добавления категории в редакторе
    document.getElementById('addCategoryBtn')?.addEventListener('click', addCategory);

    // Показываем меню по умолчанию
    switchMode('menu');
    showToast('Прокатошная загружена (новая архитектура)');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}