// main.js
import { initData } from './data.js';
import { renderEditorAll, initRenderHandlers, addCategory } from './render.js';
import { initModalHandlers, showToast } from './ui.js';
import { initCases, openCasesManagerModal, addIndividualCaseVariantBtn, addCommonCaseVariantBtn } from './cases.js';
import { loadOrderData } from './order.js';
import { renderOrderAll, applySearch, clearSearch } from './order-render.js';

console.log('main.js загружен');

function navigateTo(page) {
    console.log('navigateTo:', page);
    document.getElementById('mMenu').style.display = (page === 'menu') ? 'block' : 'none';
    document.getElementById('mPage').style.display = (page === 'mPage') ? 'block' : 'none';
    document.getElementById('sPage').style.display = (page === 'sPage') ? 'block' : 'none';
    document.getElementById('editorPage').style.display = (page === 'editorPage') ? 'block' : 'none';
    if (page === 'mPage') renderOrderAll();
    if (page === 'editorPage') renderEditorAll();
}

function loadLibrary() { /* ... */ }
function resetAll() { /* ... */ }

function initApp() {
    console.log('Инициализация...');
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
    document.getElementById('openCommonCasesManager').addEventListener('click', openCasesManagerModal);
    // ... остальные обработчики (из предыдущих версий)
    
    navigateTo('menu');
    showToast('Загружено');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}