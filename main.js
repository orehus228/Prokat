import { initData, editorData, saveEditorData } from './data.js';
import { renderEditorAll, initRenderHandlers, addCategory } from './render.js';
import { initModalHandlers, showToast } from './ui.js';
import { initCases, openCasesManagerModal, addIndividualCaseVariantBtn, addCommonCaseVariantBtn } from './cases.js';
import { initOrder, loadOrderData } from './order.js';
import { renderOrderAll, applySearch, clearSearch } from './order-render.js';

function navigateTo(page) {
    const mMenu = document.getElementById('mMenu');
    const mPage = document.getElementById('mPage');
    const sPage = document.getElementById('sPage');
    const editorPage = document.getElementById('editorPage');
    if (mMenu) mMenu.style.display = (page === 'menu') ? 'block' : 'none';
    if (mPage) mPage.style.display = (page === 'mPage') ? 'block' : 'none';
    if (sPage) sPage.style.display = (page === 'sPage') ? 'block' : 'none';
    if (editorPage) editorPage.style.display = (page === 'editorPage') ? 'block' : 'none';
    if (page === 'mPage' && typeof renderOrderAll === 'function') renderOrderAll();
    if (page === 'editorPage' && typeof renderEditorAll === 'function') renderEditorAll();
    if (page === 'sPage') {
        const sRes = document.getElementById('sRes');
        const loadStatus = document.getElementById('loadStatus');
        const fSel = document.getElementById('fSel');
        if (sRes) sRes.style.display = 'none';
        if (loadStatus) loadStatus.textContent = 'Файл не выбран';
        if (fSel) fSel.value = '';
    }
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
                showToast('✅ Библиотека загружена');
                if (document.getElementById('mPage').style.display === 'block' && typeof renderOrderAll === 'function') renderOrderAll();
                if (document.getElementById('editorPage').style.display === 'block' && typeof renderEditorAll === 'function') renderEditorAll();
            } catch(err) {
                showToast('❌ Ошибка: ' + err.message);
            }
            document.body.removeChild(input);
        };
        reader.readAsText(file);
    };
}

function resetAll() {
    if (!confirm('⚠️ Удалить все данные?')) return;
    localStorage.clear();
    location.reload();
}

function saveOrderPreset() { showToast('Сохранение пресета (заглушка)'); }
function loadOrderPreset() { showToast('Загрузка пресета (заглушка)'); }
function exportOrderPresets() { showToast('Экспорт пресетов (заглушка)'); }
function importOrderPresets() { document.getElementById('orderPresetFileInput').click(); }
function deleteOrderPreset() { showToast('Удаление пресета (заглушка)'); }
function saveJ() { showToast('Сохранить JSON (заглушка)'); }
function savePdf() { showToast('Сохранить PDF (заглушка)'); }
function clearOrder() { showToast('Очистить список (заглушка)'); }
function openMatrixModal() { showToast('Матрица привязок (заглушка)'); }
function resetCheckboxes() { showToast('Сброс отметок (заглушка)'); }
function checkMissingItems() { showToast('Проверка пропущенного (заглушка)'); }

function initApp() {
    try {
        initData();
        loadOrderData();
        initModalHandlers();
        initCases();
        initRenderHandlers();
        document.getElementById('btnCreateOrder').addEventListener('click', () => navigateTo('mPage'));
        document.getElementById('btnOpenOrder').addEventListener('click', () => navigateTo('sPage'));
        document.getElementById('btnLoadLibrary').addEventListener('click', loadLibrary);
        document.getElementById('btnResetAll').addEventListener('click', resetAll);
        document.getElementById('btnEditor').addEventListener('click', () => navigateTo('editorPage'));
        document.querySelectorAll('#btnBackToMenu, #btnBackToMenu2, #btnBackToMenu3').forEach(btn => {
            btn.addEventListener('click', () => navigateTo('menu'));
        });
        document.getElementById('addCategoryBtn').addEventListener('click', addCategory);
        document.getElementById('addIndividualCaseVariantBtn').addEventListener('click', addIndividualCaseVariantBtn);
        document.getElementById('addCommonCaseVariantBtn').addEventListener('click', addCommonCaseVariantBtn);
        document.getElementById('openMatrixModal').addEventListener('click', openMatrixModal);
        document.getElementById('openCommonCasesManager').addEventListener('click', openCasesManagerModal);
        document.getElementById('saveOrderPreset').addEventListener('click', saveOrderPreset);
        document.getElementById('loadOrderPreset').addEventListener('click', loadOrderPreset);
        document.getElementById('exportOrderPresets').addEventListener('click', exportOrderPresets);
        document.getElementById('importOrderPresetsBtn').addEventListener('click', importOrderPresets);
        document.getElementById('orderPresetFileInput').addEventListener('change', function(e) {
            if (e.target.files[0]) {
                showToast('Импорт пресета (заглушка)');
                this.value = '';
            }
        });
        document.getElementById('deleteOrderPreset').addEventListener('click', deleteOrderPreset);
        document.getElementById('saveJ').addEventListener('click', saveJ);
        document.getElementById('savePdf').addEventListener('click', savePdf);
        document.getElementById('clearOrder').addEventListener('click', clearOrder);
        document.getElementById('searchInput').addEventListener('input', applySearch);
        document.getElementById('clearSearchBtn').addEventListener('click', clearSearch);
        document.getElementById('resetCheckboxes').addEventListener('click', resetCheckboxes);
        document.getElementById('checkMissingItems').addEventListener('click', checkMissingItems);
        document.getElementById('fSel').addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;
            document.getElementById('loadStatus').textContent = '✅ Загружено: ' + file.name;
            showToast('Загрузка списка (заглушка)');
        });
        // Переключение свойств (заказ)
        document.getElementById('togglePropsBtn').addEventListener('click', function() {
            showToast('Переключение свойств (заглушка)');
        });
        document.getElementById('detailToggle').addEventListener('click', function() {
            const details = document.getElementById('globalDetails');
            details.classList.toggle('open');
            localStorage.setItem('detailsOpen', JSON.stringify(details.classList.contains('open')));
            this.textContent = details.classList.contains('open') ? '📊 Скрыть' : '📊 Подробно';
        });
        navigateTo('menu');
        showToast('Прокатошная загружена (модульная версия)');
    } catch(e) {
        console.error('Ошибка инициализации:', e);
        showToast('Ошибка инициализации: ' + e.message);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}