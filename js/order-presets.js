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
        // Очищаем все данные
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
        // Наложение: суммируем
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
        // Замена
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
// ИНИЦИАЛИЗАЦИЯ ОБРАБОТЧИКОВ
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