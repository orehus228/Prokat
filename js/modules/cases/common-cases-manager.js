// modules/cases/common-cases-manager.js — Управление общими кофрами с индикацией заполнения
import {
    getCommonCases,
    addCommonCase,
    updateCommonCase,
    deleteCommonCase,
    saveEditorData,
    getItemProps
} from '../../data.js';
import {
    getOrderPacking,
    orderPacking
} from '../../order.js';
import {
    esc,
    showToast,
    showPrompt,
    showConfirm
} from '../../ui.js';
import { getColorByPercent } from '../../order-helpers.js';

let casesManagerCallback = null;

// ============================================================
// МОДАЛКА УПРАВЛЕНИЯ ОБЩИМИ КОФРАМИ
// ============================================================
export function openCasesManagerModal(callback) {
    casesManagerCallback = callback || null;
    renderCasesList();
    document.getElementById('casesManagerModal').classList.add('open');
}

function renderCasesList() {
    const container = document.getElementById('casesList');
    const cases = getCommonCases();
    if (cases.length === 0) {
        container.innerHTML = '<div class="empty-message">Нет общих кофров</div>';
        return;
    }
    // Собираем статистику заполнения для каждого кофра
    const stats = new Map();
    cases.forEach(c => {
        stats.set(c.id, { totalWeight: 0, maxWeight: c.maxWeight || 0, name: c.name });
    });
    for (let path in orderPacking) {
        const packing = getOrderPacking(path);
        const props = getItemProps(path);
        const unitWeight = props.weight || 0;
        packing.forEach(p => {
            if (p.pieces <= 0) return;
            const stat = stats.get(p.caseId);
            if (stat) stat.totalWeight += p.pieces * unitWeight;
        });
    }

    let html = '';
    cases.forEach(c => {
        const stat = stats.get(c.id);
        const fillPercent = stat && stat.maxWeight > 0 ? Math.min(100, Math.round((stat.totalWeight / stat.maxWeight) * 100)) : 0;
        const { r, g, b } = getColorByPercent(fillPercent);
        const color = `rgb(${r}, ${g}, ${b})`;
        html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-bottom:1px solid var(--border-color);gap:10px;">
            <div style="flex:1;">
                <strong>${esc(c.name)}</strong>
                <br>
                <span style="font-size:13px;color:var(--text-secondary);">Вместимость: ${c.qty} шт, Габ: ${c.dimensions || 'н/д'}, Вес пустого: ${c.emptyWeight || 0} кг, Макс. вес: ${c.maxWeight || 0} кг, Макс. объём: ${c.maxVolume || 0} м³</span>
                <div style="margin-top:4px;display:flex;align-items:center;gap:8px;">
                    <div style="flex:1;height:6px;background:var(--bg-input);border-radius:3px;overflow:hidden;">
                        <div style="width:${fillPercent}%;height:100%;background:${color};border-radius:3px;transition:width 0.3s;"></div>
                    </div>
                    <span style="font-size:12px;color:${color};font-weight:bold;min-width:40px;">${fillPercent}%</span>
                </div>
            </div>
            <div>
                <button class="btn btn-sm" style="width:auto;padding:2px 8px;font-size:12px;" onclick="window.editCase('${c.id}')">✏️</button>
                <button class="btn btn-sm" style="width:auto;padding:2px 8px;font-size:12px;background:var(--danger);color:white;" onclick="window.deleteCase('${c.id}')">✕</button>
            </div>
        </div>`;
    });
    container.innerHTML = html;
}

export function editCase(id) {
    const cases = getCommonCases();
    const c = cases.find(c => c.id === id);
    if (!c) return;
    document.getElementById('newCaseName').value = c.name || '';
    document.getElementById('newCaseQty').value = c.qty || '';
    document.getElementById('newCaseDim').value = c.dimensions || '';
    document.getElementById('newCaseWeight').value = c.emptyWeight || '';
    document.getElementById('newCaseMaxWeight').value = c.maxWeight || '';
    document.getElementById('newCaseMaxVolume').value = c.maxVolume || '';
    const addBtn = document.getElementById('casesManagerAdd');
    addBtn.textContent = 'Обновить';
    addBtn.dataset.editId = id;
}

export async function deleteCase(id) {
    const confirmed = await showConfirm('Удалить этот кофр?');
    if (!confirmed) return;
    deleteCommonCase(id);
    renderCasesList();
    showToast('Кофр удалён', 'neutral');
}

export function initCasesManagerHandlers() {
    const addBtn = document.getElementById('casesManagerAdd');
    addBtn.addEventListener('click', function() {
        const name = document.getElementById('newCaseName').value.trim();
        const qty = parseInt(document.getElementById('newCaseQty').value);
        const dimensions = document.getElementById('newCaseDim').value.trim();
        const emptyWeight = parseFloat(document.getElementById('newCaseWeight').value);
        const maxWeight = parseFloat(document.getElementById('newCaseMaxWeight').value);
        const maxVolume = parseFloat(document.getElementById('newCaseMaxVolume').value);
        if (!name) { showToast('Введите название кофра', 'warning'); return; }
        if (isNaN(qty) || qty <= 0) { showToast('Вместимость должна быть положительным числом', 'warning'); return; }
        const editId = this.dataset.editId;
        if (editId) {
            updateCommonCase(editId, { name, qty, dimensions, emptyWeight: isNaN(emptyWeight)?0:emptyWeight, maxWeight: isNaN(maxWeight)?0:maxWeight, maxVolume: isNaN(maxVolume)?0:maxVolume });
            showToast('Кофр обновлён', 'success');
        } else {
            const newCase = {
                id: 'case_' + Date.now(),
                name, qty, dimensions, emptyWeight: isNaN(emptyWeight)?0:emptyWeight, maxWeight: isNaN(maxWeight)?0:maxWeight, maxVolume: isNaN(maxVolume)?0:maxVolume
            };
            addCommonCase(newCase);
            showToast('Кофр добавлен', 'success');
        }
        document.getElementById('newCaseName').value = '';
        document.getElementById('newCaseQty').value = '';
        document.getElementById('newCaseDim').value = '';
        document.getElementById('newCaseWeight').value = '';
        document.getElementById('newCaseMaxWeight').value = '';
        document.getElementById('newCaseMaxVolume').value = '';
        this.textContent = '+ Добавить';
        delete this.dataset.editId;
        renderCasesList();
        if (casesManagerCallback) casesManagerCallback();
    });
}

export function initCasesManagerCloseHandler() {
    document.getElementById('casesManagerClose').addEventListener('click', () => {
        document.getElementById('casesManagerModal').classList.remove('open');
        if (casesManagerCallback) casesManagerCallback();
    });
}

export function initCasesManagerOverlayClose() {
    const overlay = document.getElementById('casesManagerModal');
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            document.getElementById('casesManagerModal').classList.remove('open');
            if (casesManagerCallback) casesManagerCallback();
        }
    });
}