// order-presets.js — Управление пресетами заказа + экспорт JSON/PDF
import {
    order,
    orderSplits,
    links,
    notes,
    orderPacking,
    individualCaseValues,
    commonRoutes,
    caseModes,
    orderExclude,
    orderExtra,
    saveOrderData,
    loadOrderData,
    getOrderPacking,
    getIndividualCaseValues,
    getCommonRoutes,
    getTotalQty,
    calcItemWeightWithMode,
    calcItemVolumeWithMode,
    calcItemCases,
    getCaseMode,
    getSelectedOption,
    getItemProps,
    getCommonCases,
    editorData
} from './order.js'; // но getItemProps и getCommonCases в data.js, исправим

// Импортируем недостающие функции из data.js
import { getItemProps, getCommonCases, editorData as editorData2 } from './data.js';
// но у нас уже есть editorData, давайте переименуем

import { STORAGE_KEYS, CAT_NAMES } from './config.js';
import { showToast, showPrompt, showConfirm, esc } from './ui.js';
import { renderOrderAll } from './order-render.js';

const ORDER_PRESETS_KEY = STORAGE_KEYS.ORDER_PRESETS || 'order_presets';

// ... (остальной код пресетов)

// ============================================================
// ЭКСПОРТ JSON
// ============================================================
export function exportOrderJSON() {
    const data = {
        project_name: document.getElementById('pName').value.trim() || "Мероприятие",
        date: document.getElementById('pDate').value || new Date().toLocaleDateString('ru-RU'),
        comment: document.getElementById('pComment').value.trim() || "",
        items: order,
        splits: orderSplits,
        specs: editorData2.specs || {},
        packing: getOrderPacking(),
        individual_cases: getIndividualCaseValues(),
        routes: getCommonRoutes(),
        links: links,
        notes: notes,
        exclude: orderExclude,
        extra: orderExtra
    };
    if (Object.keys(order).length === 0 && Object.keys(orderSplits).length === 0 && Object.keys(orderExtra).length === 0 && Object.keys(orderPacking).length === 0) {
        showToast('Список пуст', 'warning'); return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = data.project_name + ".json";
    a.click();
    URL.revokeObjectURL(url);
    showToast('JSON сохранён', 'success');
}

// ============================================================
// ЭКСПОРТ PDF
// ============================================================
export function exportOrderPDF() {
    const data = {
        project_name: document.getElementById('pName').value.trim() || "Мероприятие",
        date: document.getElementById('pDate').value || new Date().toLocaleDateString('ru-RU'),
        comment: document.getElementById('pComment').value.trim() || ""
    };
    // Получаем активные предметы
    const items = [];
    const allPaths = new Set();
    for (let p in order) allPaths.add(p);
    for (let p in orderExtra) allPaths.add(p);
    for (let p in orderPacking) allPaths.add(p);
    for (let p in individualCaseValues) {
        const vals = individualCaseValues[p];
        if (vals.reduce((a,b) => a + b, 0) > 0) allPaths.add(p);
    }
    allPaths.forEach(path => {
        const qty = getTotalQty(path);
        if (qty > 0) items.push({ path, qty });
    });

    if (items.length === 0) { showToast('Нет позиций для экспорта', 'warning'); return; }

    const catItems = {};
    items.forEach(({ path, qty }) => {
        const parts = path.split('|');
        const cat = parts[0];
        const name = parts.slice(1).join(' → ');
        if (!catItems[cat]) catItems[cat] = [];
        const weight = calcItemWeightWithMode(path, qty);
        const volume = calcItemVolumeWithMode(path, qty);
        const dims = getItemProps(path).dimensions || 'н/д';
        const packing = getOrderPacking(path);
        const mode = getCaseMode(path);
        let detail = 'без кофра';
        if (packing.length > 0) {
            const commonCases = getCommonCases();
            const names = packing.map(p => {
                const c = commonCases.find(c => c.id === p.caseId);
                return c ? c.name : 'удалённый кофр';
            }).join(', ');
            detail = 'общие кофры: ' + names;
        } else if (mode.enabled) {
            const opt = getSelectedOption(path);
            const alt = mode.alt;
            if (alt) {
                detail = 'альт. кофр, ' + alt.qty + ' шт/кофр';
            } else if (opt) {
                const cases = calcItemCases(path, qty);
                detail = 'кофр ' + opt.qty + ' шт/кофр, всего ' + cases + ' кофр' + (cases > 1 ? 'ов' : '');
            }
        }
        catItems[cat].push({ name, qty, weight, volume, dims, detail });
    });

    let html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Чек-лист</title>
<style>
body{font-family:'Segoe UI',Arial,sans-serif;margin:40px;color:#222;background:#fff}
h1{color:#2c3e50;border-bottom:2px solid #3498db;padding-bottom:10px}
.meta{margin:20px 0;color:#555}
table{width:100%;border-collapse:collapse;margin-top:20px;font-size:14px}
th{background:#2c3e50;color:#fff;padding:8px;text-align:left}
td{padding:6px 8px;border-bottom:1px solid #ddd}
tr:nth-child(even){background:#f9f9f9}
.total-row{font-weight:bold;background:#e6f2ff!important;border-top:2px solid #3498db}
.grand-total{font-weight:bold;background:#d4e6ff!important;border-top:3px solid #1a3a5a;font-size:16px}
.actions{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);display:flex;gap:12px;background:white;padding:12px 24px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.2);z-index:1000;}
.actions button{padding:10px 24px;border:none;border-radius:6px;font-size:16px;cursor:pointer;font-weight:600;}
.actions .print{background:#2c3e50;color:white;}
.actions .close{background:#ddd;color:#333;}
.actions .print:hover{background:#1a2a3a;}
.actions .close:hover{background:#ccc;}
</style>
</head><body>
<h1>Чек-лист: ${esc(data.project_name)}</h1>
<div class="meta"><strong>Дата:</strong> ${esc(data.date)}<br><strong>Комментарий:</strong> ${esc(data.comment||'—')}</div>
<table><thead><tr><th>Категория</th><th>Позиция</th><th>Кол-во (шт)</th><th>Вес (кг)</th><th>Объём (м³)</th><th>Габариты (см)</th><th>Детали</th></tr></thead><tbody>`;
    let grandQty=0,grandWeight=0,grandVolume=0;
    const orderKeys = editorData2._categoryOrder || Object.keys(editorData2.inventory);
    orderKeys.forEach(cat => {
        if (!catItems[cat]) return;
        let first=true, catQty=0,catWeight=0,catVolume=0;
        for (let item of catItems[cat]) {
            catQty += item.qty;
            catWeight += item.weight;
            catVolume += item.volume;
            html += `<tr><td>${first ? CAT_NAMES[cat]||cat : ''}</td><td>${esc(item.name)}</td><td>${item.qty}</td><td>${item.weight.toFixed(1)}</td><td>${item.volume.toFixed(3)}</td><td>${esc(item.dims)}</td><td>${esc(item.detail)}</td></tr>`;
            first = false;
        }
        grandQty += catQty; grandWeight += catWeight; grandVolume += catVolume;
        html += `<tr class="total-row"><td colspan="2"><strong>Итого в категории</strong></td><td><strong>${catQty} шт</strong></td><td><strong>${catWeight.toFixed(1)} кг</strong></td><td><strong>${catVolume.toFixed(3)} м³</strong></td><td></td><td></td></tr>`;
    });
    html += `<tr class="grand-total"><td colspan="2"><strong>Общий итог</strong></td><td><strong>${grandQty} шт</strong></td><td><strong>${grandWeight.toFixed(1)} кг</strong></td><td><strong>${grandVolume.toFixed(3)} м³</strong></td><td></td><td></td></tr>`;
    html += `</tbody></table>
<div class="actions">
    <button class="print" onclick="window.print()">Сохранить PDF</button>
    <button class="close" onclick="window.close()">Назад</button>
</div>
</body></html>`;

    const win = window.open('', '_blank');
    if (win) {
        win.document.write(html);
        win.document.close();
        win.focus();
    } else {
        showToast('Не удалось открыть новую вкладку', 'error');
    }
}

// ... (остальные функции пресетов: getOrderPresets, saveOrderPresets, populateOrderPresetSelect, saveOrderPreset, loadOrderPreset, deleteOrderPreset, exportOrderPresets, importOrderPresets, initOrderPresetsUI)