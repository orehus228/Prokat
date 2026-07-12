// main.js — точка входа (исправленная версия)
import { initData, editorData, saveEditorData, loadEditorData } from './data.js';
import { renderEditorAll, initRenderHandlers, addCategory } from './render.js';
import { initModalHandlers, showToast } from './ui.js';
import { initCases, openCasesManagerModal, addIndividualCaseVariantBtn, addCommonCaseVariantBtn } from './cases.js';
import { initOrder, loadOrderData } from './order.js';
import { renderOrderAll, applySearch, clearSearch, renderOrderCategory } from './order-render.js';

console.log('main.js загружен');

// ============================================================
// ФУНКЦИИ НАВИГАЦИИ
// ============================================================
function navigateTo(page) {
    console.log('navigateTo вызван с page:', page);
    const mMenu = document.getElementById('mMenu');
    const mPage = document.getElementById('mPage');
    const sPage = document.getElementById('sPage');
    const editorPage = document.getElementById('editorPage');
    
    if (mMenu) mMenu.style.display = (page === 'menu') ? 'block' : 'none';
    if (mPage) mPage.style.display = (page === 'mPage') ? 'block' : 'none';
    if (sPage) sPage.style.display = (page === 'sPage') ? 'block' : 'none';
    if (editorPage) editorPage.style.display = (page === 'editorPage') ? 'block' : 'none';
    
    if (page === 'mPage') {
        console.log('Переход на страницу заказа');
        if (typeof renderOrderAll === 'function') {
            renderOrderAll();
        } else {
            console.warn('renderOrderAll не определён');
            showToast('Ошибка: renderOrderAll не определён');
        }
    }
    if (page === 'sPage') {
        console.log('Переход на страницу открытия списка');
        const sRes = document.getElementById('sRes');
        const loadStatus = document.getElementById('loadStatus');
        const fSel = document.getElementById('fSel');
        if (sRes) sRes.style.display = 'none';
        if (loadStatus) loadStatus.textContent = 'Файл не выбран';
        if (fSel) fSel.value = '';
    }
    if (page === 'editorPage') {
        console.log('Переход на страницу редактора');
        if (typeof renderEditorAll === 'function') {
            renderEditorAll();
        } else {
            console.warn('renderEditorAll не определён');
            showToast('Ошибка: renderEditorAll не определён');
        }
    }
}

// ============================================================
// ЗАГРУЗКА БИБЛИОТЕКИ
// ============================================================
function loadLibrary() {
    console.log('loadLibrary вызван');
    showToast('Загрузка библиотеки...');
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
                if (document.getElementById('mPage').style.display === 'block' && typeof renderOrderAll === 'function') {
                    renderOrderAll();
                }
                if (document.getElementById('editorPage').style.display === 'block' && typeof renderEditorAll === 'function') {
                    renderEditorAll();
                }
            } catch(err) {
                showToast('❌ Ошибка: ' + err.message);
            }
            document.body.removeChild(input);
        };
        reader.readAsText(file);
    };
}

// ============================================================
// СБРОС ВСЕХ ДАННЫХ
// ============================================================
function resetAll() {
    if (!confirm('⚠️ Удалить все данные?')) return;
    localStorage.clear();
    location.reload();
}

// ============================================================
// ПРЕСЕТЫ (ЗАГЛУШКИ)
// ============================================================
function saveOrderPreset() { showToast('Сохранение пресета (заглушка)'); }
function loadOrderPreset() { showToast('Загрузка пресета (заглушка)'); }
function exportOrderPresets() { showToast('Экспорт пресетов (заглушка)'); }
function importOrderPresets() { document.getElementById('orderPresetFileInput').click(); }
function deleteOrderPreset() { showToast('Удаление пресета (заглушка)'); }

// ============================================================
// ОБРАБОТЧИКИ ДЛЯ КНОПОК СТРАНИЦЫ ЗАКАЗА
// ============================================================
function saveJ() { showToast('Сохранить JSON (заглушка)'); }
function savePdf() { showToast('Сохранить PDF (заглушка)'); }
function clearOrder() { showToast('Очистить список (заглушка)'); }
function openMatrixModal() { showToast('Матрица привязок (заглушка)'); }

// ============================================================
// ОБРАБОТЧИКИ ДЛЯ СТРАНИЦЫ ОТКРЫТИЯ СПИСКА
// ============================================================
function resetCheckboxes() { showToast('Сброс отметок (заглушка)'); }
function checkMissingItems() { showToast('Проверка пропущенного (заглушка)'); }

// ============================================================
// ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
// ============================================================
function initApp() {
    console.log('Инициализация приложения...');
    try {
        initData();
        loadOrderData();
        initModalHandlers();
        initCases();
        initRenderHandlers();
        
        // === НАВИГАЦИЯ ===
        const btnCreateOrder = document.getElementById('btnCreateOrder');
        const btnOpenOrder = document.getElementById('btnOpenOrder');
        const btnLoadLibrary = document.getElementById('btnLoadLibrary');
        const btnResetAll = document.getElementById('btnResetAll');
        const btnEditor = document.getElementById('btnEditor');
        const btnBackToMenu = document.querySelectorAll('#btnBackToMenu, #btnBackToMenu2, #btnBackToMenu3');
        
        if (btnCreateOrder) {
            btnCreateOrder.addEventListener('click', function() {
                console.log('Кнопка "Создать список" нажата');
                navigateTo('mPage');
            });
        } else {
            console.warn('btnCreateOrder не найден');
        }
        
        if (btnOpenOrder) {
            btnOpenOrder.addEventListener('click', function() {
                console.log('Кнопка "Открыть список" нажата');
                navigateTo('sPage');
            });
        } else {
            console.warn('btnOpenOrder не найден');
        }
        
        if (btnLoadLibrary) {
            btnLoadLibrary.addEventListener('click', loadLibrary);
        } else {
            console.warn('btnLoadLibrary не найден');
        }
        
        if (btnResetAll) {
            btnResetAll.addEventListener('click', resetAll);
        } else {
            console.warn('btnResetAll не найден');
        }
        
        if (btnEditor) {
            btnEditor.addEventListener('click', function() {
                console.log('Кнопка "Редактор склада" нажата');
                navigateTo('editorPage');
            });
        } else {
            console.warn('btnEditor не найден');
        }
        
        btnBackToMenu.forEach(btn => {
            btn.addEventListener('click', function() {
                console.log('Кнопка "В меню" нажата');
                navigateTo('menu');
            });
        });
        
        // === СТРАНИЦА ЗАКАЗА ===
        const togglePropsBtn = document.getElementById('togglePropsBtn');
        if (togglePropsBtn) {
            togglePropsBtn.addEventListener('click', function() {
                showToast('Переключение свойств (заглушка)');
            });
        }
        
        const openMatrixModalBtn = document.getElementById('openMatrixModal');
        if (openMatrixModalBtn) {
            openMatrixModalBtn.addEventListener('click', openMatrixModal);
        }
        
        const openCommonCasesManagerBtn = document.getElementById('openCommonCasesManager');
        if (openCommonCasesManagerBtn) {
            openCommonCasesManagerBtn.addEventListener('click', openCasesManagerModal);
        }
        
        const saveOrderPresetBtn = document.getElementById('saveOrderPreset');
        if (saveOrderPresetBtn) {
            saveOrderPresetBtn.addEventListener('click', saveOrderPreset);
        }
        
        const loadOrderPresetBtn = document.getElementById('loadOrderPreset');
        if (loadOrderPresetBtn) {
            loadOrderPresetBtn.addEventListener('click', loadOrderPreset);
        }
        
        const exportOrderPresetsBtn = document.getElementById('exportOrderPresets');
        if (exportOrderPresetsBtn) {
            exportOrderPresetsBtn.addEventListener('click', exportOrderPresets);
        }
        
        const importOrderPresetsBtn = document.getElementById('importOrderPresetsBtn');
        if (importOrderPresetsBtn) {
            importOrderPresetsBtn.addEventListener('click', importOrderPresets);
        }
        
        const orderPresetFileInput = document.getElementById('orderPresetFileInput');
        if (orderPresetFileInput) {
            orderPresetFileInput.addEventListener('change', function(e) {
                if (e.target.files[0]) {
                    showToast('Импорт пресета (заглушка)');
                    this.value = '';
                }
            });
        }
        
        const deleteOrderPresetBtn = document.getElementById('deleteOrderPreset');
        if (deleteOrderPresetBtn) {
            deleteOrderPresetBtn.addEventListener('click', deleteOrderPreset);
        }
        
        const saveJBtn = document.getElementById('saveJ');
        if (saveJBtn) {
            saveJBtn.addEventListener('click', saveJ);
        }
        
        const savePdfBtn = document.getElementById('savePdf');
        if (savePdfBtn) {
            savePdfBtn.addEventListener('click', savePdf);
        }
        
        const clearOrderBtn = document.getElementById('clearOrder');
        if (clearOrderBtn) {
            clearOrderBtn.addEventListener('click', clearOrder);
        }
        
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', applySearch);
        }
        
        const clearSearchBtn = document.getElementById('clearSearchBtn');
        if (clearSearchBtn) {
            clearSearchBtn.addEventListener('click', clearSearch);
        }
        
        // === СТРАНИЦА ОТКРЫТИЯ СПИСКА ===
        const resetCheckboxesBtn = document.getElementById('resetCheckboxes');
        if (resetCheckboxesBtn) {
            resetCheckboxesBtn.addEventListener('click', resetCheckboxes);
        }
        
        const checkMissingItemsBtn = document.getElementById('checkMissingItems');
        if (checkMissingItemsBtn) {
            checkMissingItemsBtn.addEventListener('click', checkMissingItems);
        }
        
        const fSel = document.getElementById('fSel');
        if (fSel) {
            fSel.addEventListener('change', function(e) {
                const file = e.target.files[0];
                if (!file) return;
                document.getElementById('loadStatus').textContent = '✅ Загружено: ' + file.name;
                showToast('Загрузка списка (заглушка)');
            });
        }
        
        // === РЕДАКТОР ===
        const addCategoryBtn = document.getElementById('addCategoryBtn');
        if (addCategoryBtn) {
            addCategoryBtn.addEventListener('click', addCategory);
        }
        
        const addIndividualCaseVariantBtnEl = document.getElementById('addIndividualCaseVariantBtn');
        if (addIndividualCaseVariantBtnEl) {
            addIndividualCaseVariantBtnEl.addEventListener('click', addIndividualCaseVariantBtn);
        }
        
        const addCommonCaseVariantBtnEl = document.getElementById('addCommonCaseVariantBtn');
        if (addCommonCaseVariantBtnEl) {
            addCommonCaseVariantBtnEl.addEventListener('click', addCommonCaseVariantBtn);
        }
        
        // === ПОКАЗЫВАЕМ МЕНЮ ===
        navigateTo('menu');
        showToast('Прокатошная загружена (модульная версия)');
    } catch(e) {
        console.error('Ошибка инициализации:', e);
        showToast('Ошибка инициализации: ' + e.message);
    }
}

// Запускаем после загрузки DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}