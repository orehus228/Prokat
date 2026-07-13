// order-presets.js — Управление пресетами заказа
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
    loadOrderData
} from './order.js';

import {
    showToast,
    showPrompt,
    showConfirm
} from './ui.js';

import {
    renderOrderAll
} from './order-render.js';

import { STORAGE_KEYS } from './config.js';

const ORDER_PRESETS_KEY = STORAGE_KEYS.ORDER_PRESETS || 'order_presets';

// ============================================================
// ПОЛУЧЕНИЕ И СОХРАНЕНИЕ ПРЕСЕТОВ
// ============================================================

export function getOrderPresets() {
    try {
        const raw = localStorage.getItem(ORDER_PRESETS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

export function saveOrderPresets(presets) {
    localStorage.setItem(ORDER_PRESETS_KEY, JSON.stringify(presets));
}

// ============================================================
// ЗАПОЛНЕНИЕ SELECT
// ============================================================

export function populateOrderPresetSelect() {
    const select = document.getElementById('orderPresetSelect');
    if (!select) return;
    const presets = getOrderPresets();
    select.innerHTML = '<option value="">— Выберите пресет —</option>';
    presets.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        select.appendChild(opt);
    });
}

// ============================================================
// СОХРАНЕНИЕ ПРЕСЕТА
// ============================================================

export async function saveOrderPreset() {
    const name = await showPrompt('Сохранить пресет заказа', 'Введите имя пресета:', '', '');
    if (!name || !name.trim()) return;
    
    const presets = getOrderPresets();
    const existing = presets.find(p => p.name === name.trim());
    if (existing) {
        const overwrite = await showConfirm(`Пресет "${name.trim()}" уже существует. Перезаписать?`);
        if (!overwrite) return;
        const idx = presets.indexOf(existing);
        presets.splice(idx, 1);
    }
    
    const snapshot = {
        order: { ...order },
        splits: JSON.parse(JSON.stringify(orderSplits)),
        links: JSON.parse(JSON.stringify(links)),
        notes: { ...notes },
        packing: JSON.parse(JSON.stringify(orderPacking)),
        individualCases: JSON.parse(JSON.stringify(individualCaseValues)),
        routes: JSON.parse(JSON.stringify(commonRoutes)),
        caseModes: JSON.parse(JSON.stringify(caseModes)),
        exclude: { ...orderExclude },
        extra: { ...orderExtra }
    };
    
    presets.push({ name: name.trim(), data: snapshot });
    saveOrderPresets(presets);
    populateOrderPresetSelect();
    showToast('Пресет сохранён', 'success');
}

// ============================================================
// ЗАГРУЗКА ПРЕСЕТА
// ============================================================

export async function loadOrderPreset(overlay = true) {
    const select = document.getElementById('orderPresetSelect');
    const name = select.value;
    if (!name) {
        showToast('Выберите пресет', 'warning');
        return;
    }
    
    const presets = getOrderPresets();
    const preset = presets.find(p => p.name === name);
    if (!preset) {
        showToast('Пресет не найден', 'error');
        return;
    }
    
    const data = preset.data;
    
    if (!overlay) {
        for (let key in order) delete order[key];
        for (let key in orderSplits) delete orderSplits[key];
        for (let key in links) delete links[key];
        for (let key in notes) delete notes[key];
        for (let key in orderPacking) delete orderPacking[key];
        for (let key in individualCaseValues) delete individualCaseValues[key];
        for (let key in commonRoutes) delete commonRoutes[key];
        for (let key in caseModes) delete caseModes[key];
        for (let key in orderExclude) delete orderExclude[key];
        for (let key in orderExtra) delete orderExtra[key];
    }
    
    if (overlay) {
        for (let path in data.order) {
            order[path] = (order[path] || 0) + data.order[path];
        }
        for (let path in data.splits) {
            if (!orderSplits[path]) orderSplits[path] = [];
            data.splits[path].forEach(seg => {
                orderSplits[path].push({ ...seg });
            });
        }
        for (let path in data.links) {
            if (!links[path]) links[path] = [];
            data.links[path].forEach(pl => {
                const existing = links[path].find(l => l.target === pl.target);
                if (existing) existing.multiplier += pl.multiplier;
                else links[path].push({ ...pl });
            });
        }
        for (let path in data.notes) {
            if (!notes[path]) notes[path] = data.notes[path];
        }
        for (let path in data.packing) {
            if (!orderPacking[path]) orderPacking[path] = [];
            data.packing[path].forEach(p => {
                const existing = orderPacking[path].find(ep => ep.caseId === p.caseId);
                if (existing) existing.qty += p.qty;
                else orderPacking[path].push({ ...p });
            });
        }
        for (let path in data.individualCases) {
            if (!individualCaseValues[path]) individualCaseValues[path] = [];
            data.individualCases[path].forEach((v, idx) => {
                if (individualCaseValues[path][idx] !== undefined) {
                    individualCaseValues[path][idx] += v;
                } else {
                    individualCaseValues[path][idx] = v;
                }
            });
        }
        for (let path in data.routes) {
            if (!commonRoutes[path]) commonRoutes[path] = [];
            data.routes[path].forEach(r => {
                const existing = commonRoutes[path].find(er => er.target === r.target);
                if (existing) existing.multiplier += r.multiplier;
                else commonRoutes[path].push({ ...r });
            });
        }
        for (let path in data.caseModes) {
            if (!caseModes[path]) caseModes[path] = { ...data.caseModes[path] };
        }
        for (let path in data.exclude) {
            orderExclude[path] = true;
        }
        for (let path in data.extra) {
            orderExtra[path] = (orderExtra[path] || 0) + data.extra[path];
        }
    } else {
        Object.assign(order, data.order);
        Object.assign(orderSplits, JSON.parse(JSON.stringify(data.splits)));
        Object.assign(links, JSON.parse(JSON.stringify(data.links)));
        Object.assign(notes, data.notes);
        Object.assign(orderPacking, JSON.parse(JSON.stringify(data.packing)));
        Object.assign(individualCaseValues, JSON.parse(JSON.stringify(data.individualCases)));
        Object.assign(commonRoutes, JSON.parse(JSON.stringify(data.routes)));
        Object.assign(caseModes, JSON.parse(JSON.stringify(data.caseModes)));
        Object.assign(orderExclude, data.exclude);
        Object.assign(orderExtra, data.extra || {});
    }
    
    saveOrderData();
    renderOrderAll();
    showToast(`Пресет "${name}" загружен ${overlay ? '(наложение)' : '(замена)'}`, 'success');
}

// ============================================================
// УДАЛЕНИЕ ПРЕСЕТА
// ============================================================

export async function deleteOrderPreset() {
    const select = document.getElementById('orderPresetSelect');
    const name = select.value;
    if (!name) {
        showToast('Выберите пресет', 'warning');
        return;
    }
    
    const confirmed = await showConfirm(`Удалить пресет "${name}"?`);
    if (!confirmed) return;
    
    let presets = getOrderPresets();
    presets = presets.filter(p => p.name !== name);
    saveOrderPresets(presets);
    populateOrderPresetSelect();
    showToast('Пресет удалён', 'neutral');
}

// ============================================================
// ЭКСПОРТ ПРЕСЕТОВ
// ============================================================

export function exportOrderPresets() {
    const presets = getOrderPresets();
    if (presets.length === 0) {
        showToast('Нет пресетов для экспорта', 'warning');
        return;
    }
    
    const blob = new Blob([JSON.stringify(presets, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'order_presets.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Пресеты экспортированы', 'success');
}

// ============================================================
// ИМПОРТ ПРЕСЕТОВ
// ============================================================

export function importOrderPresets(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (!Array.isArray(data)) throw new Error('Неверный формат: ожидается массив');
            
            data.forEach(p => {
                if (!p.name || typeof p.name !== 'string') throw new Error('У пресета отсутствует имя');
                if (!p.data || typeof p.data !== 'object') throw new Error('У пресета отсутствуют данные');
            });
            
            let presets = getOrderPresets();
            data.forEach(newP => {
                const idx = presets.findIndex(p => p.name === newP.name);
                if (idx !== -1) presets[idx] = newP;
                else presets.push(newP);
            });
            
            saveOrderPresets(presets);
            populateOrderPresetSelect();
            showToast('Пресеты импортированы', 'success');
        } catch(err) {
            showToast('Ошибка импорта: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
}

// ============================================================
// ЭКСПОРТ JSON И PDF
// ============================================================

export function exportOrderJSON() {
    const projectName = document.getElementById('pName').value.trim() || "Мероприятие";
    const date = document.getElementById('pDate').value || new Date().toLocaleDateString('ru-RU');
    const comment = document.getElementById('pComment').value.trim() || "";

    // собираем активные позиции
    const items = {};
    const splits = {};
    // здесь нужно собрать все данные из order, orderSplits, orderExtra, orderPacking и т.д.
    // для простоты используем существующие объекты
    const data = {
        project_name: projectName,
        date: date,
        comment: comment,
        items: order,
        splits: orderSplits,
        specs: {}, // можно добавить, но для JSON это необязательно
        packing: orderPacking,
        individual_cases: individualCaseValues,
        routes: commonRoutes,
        links: links,
        notes: notes,
        exclude: orderExclude,
        extra: orderExtra
    };

    if (Object.keys(order).length === 0 && Object.keys(orderSplits).length === 0 && Object.keys(orderExtra).length === 0 && Object.keys(orderPacking).length === 0) {
        showToast('Список пуст', 'warning');
        return;
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = projectName + ".json";
    a.click();
    URL.revokeObjectURL(url);
    showToast('JSON сохранён', 'success');
}

export function exportOrderPDF() {
    // Реализация PDF (генерация HTML и открытие в новом окне)
    const projectName = document.getElementById('pName').value.trim() || "Мероприятие";
    const date = document.getElementById('pDate').value || new Date().toLocaleDateString('ru-RU');
    const comment = document.getElementById('pComment').value.trim() || "";

    // Собираем позиции из order, orderSplits и т.д.
    // Для простоты используем getActiveItemsOrder из order-helpers.js (импортируем)
    // Но чтобы не усложнять, реализуем простой вариант:
    const items = [];
    for (let path in order) {
        if (order[path] > 0) items.push({ path, qty: order[path] });
    }
    for (let path in orderSplits) {
        orderSplits[path].forEach(seg => {
            if (seg.qty > 0) items.push({ path, qty: seg.qty });
        });
    }
    // также нужно учесть orderPacking, но для PDF можно пропустить

    if (items.length === 0) {
        showToast('Нет позиций для экспорта', 'warning');
        return;
    }

    // Группировка по категориям
    const catItems = {};
    items.forEach(({ path, qty }) => {
        const parts = path.split('|');
        const cat = parts[0];
        const name = parts.slice(1).join(' → ');
        if (!catItems[cat]) catItems[cat] = [];
        catItems[cat].push({ name, qty });
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
</style>
</head><body>
<h1>Чек-лист: ${projectName}</h1>
<div class="meta"><strong>Дата:</strong> ${date}<br><strong>Комментарий:</strong> ${comment||'—'}</div>
<table><thead><tr><th>Категория</th><th>Позиция</th><th>Кол-во (шт)</th></tr></thead><tbody>`;
    let grandQty = 0;
    const orderKeys = editorData._categoryOrder || Object.keys(editorData.inventory);
    orderKeys.forEach(cat => {
        if (!catItems[cat]) return;
        let first = true, catQty = 0;
        for (let item of catItems[cat]) {
            catQty += item.qty;
            html += `<tr><td>${first ? cat : ''}</td><td>${item.name}</td><td>${item.qty}</td></tr>`;
            first = false;
        }
        grandQty += catQty;
        html += `<tr class="total-row"><td colspan="2"><strong>Итого в категории</strong></td><td><strong>${catQty} шт</strong></td></tr>`;
    });
    html += `<tr class="grand-total"><td colspan="2"><strong>Общий итог</strong></td><td><strong>${grandQty} шт</strong></td></tr>`;
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

// ============================================================
// ИНИЦИАЛИЗАЦИЯ ОБРАБОТЧИКОВ ПРЕСЕТОВ
// ============================================================

export function initOrderPresetsUI() {
    const saveBtn = document.getElementById('saveOrderPreset');
    const loadBtn = document.getElementById('loadOrderPreset');
    const deleteBtn = document.getElementById('deleteOrderPreset');
    const exportBtn = document.getElementById('exportOrderPresets');
    const importBtn = document.getElementById('importOrderPresetsBtn');
    const fileInput = document.getElementById('orderPresetFileInput');
    const overlayToggle = document.getElementById('orderOverlayToggle');

    if (saveBtn) {
        saveBtn.addEventListener('click', saveOrderPreset);
    }
    
    if (loadBtn) {
        loadBtn.addEventListener('click', async () => {
            const overlay = overlayToggle ? overlayToggle.checked : false;
            await loadOrderPreset(overlay);
        });
    }
    
    if (deleteBtn) {
        deleteBtn.addEventListener('click', deleteOrderPreset);
    }
    
    if (exportBtn) {
        exportBtn.addEventListener('click', exportOrderPresets);
    }
    
    if (importBtn && fileInput) {
        importBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', function(e) {
            if (this.files[0]) {
                importOrderPresets(this.files[0]);
                this.value = '';
            }
        });
    }

    populateOrderPresetSelect();
}