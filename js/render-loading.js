// render-loading.js — Режим расчёта загрузки (отдельная страница)
import {
    editorData,
    getItemProps,
    getCommonCases,
    getTruckPresets,
    addTruckPreset,
    updateTruckPreset,
    deleteTruckPreset,
    saveEditorData
} from './data.js';

import {
    order,
    orderSplits,
    getTotalQty,
    getOrderPacking,
    getCaseMode,
    getCaseOptions,
    getSelectedOption,
    getIndividualCaseValues,
    calcItemWeightWithMode,
    calcItemVolumeWithMode,
    loadOrderData
} from './order.js';

import {
    esc,
    showToast,
    showPrompt,
    showConfirm
} from './ui.js';

import { getActiveItemsOrder } from './order-helpers.js';

// Ключ для сохранения выбранных грузовиков
const SELECTED_TRUCKS_KEY = 'selected_truck_ids';

// ============================================================
// СОСТОЯНИЕ СТРАНИЦЫ РАСЧЁТА ЗАГРУЗКИ
// ============================================================
export let selectedTruckIds = [];
let loadingResult = null;
let truckPresets = [];

// ============================================================
// ЗАГРУЗКА/СОХРАНЕНИЕ ВЫБРАННЫХ ГРУЗОВИКОВ
// ============================================================
export function loadSelectedTrucks() {
    try {
        const saved = localStorage.getItem(SELECTED_TRUCKS_KEY);
        if (saved) {
            selectedTruckIds = JSON.parse(saved);
            const presets = getTruckPresets();
            selectedTruckIds = selectedTruckIds.filter(id => presets.some(p => p.id === id));
        } else {
            selectedTruckIds = [];
        }
    } catch (e) {
        selectedTruckIds = [];
    }
}

export function saveSelectedTrucks() {
    localStorage.setItem(SELECTED_TRUCKS_KEY, JSON.stringify(selectedTruckIds));
}

// ============================================================
// ПОЛУЧЕНИЕ ДАННЫХ ДЛЯ РАСЧЁТА
// ============================================================
function getOrderItemsForLoading() {
    return getActiveItemsOrder();
}

// ============================================================
// ФУНКЦИЯ ПРЕОБРАЗОВАНИЯ ПОЗИЦИЙ В ГРУЗОВЫЕ МЕСТА
// ============================================================
function getItemDimensions(path, qty) {
    const props = getItemProps(path);
    const mode = getCaseMode(path);
    const packing = getOrderPacking(path);
    const result = [];

    // Если есть привязка к общим кофрам
    if (packing.length > 0) {
        let remaining = qty;
        for (let p of packing) {
            const caseObj = getCommonCases().find(c => c.id === p.caseId);
            if (!caseObj) continue;
            const unitsInThisCase = Math.min(remaining, p.pieces || 0);
            if (unitsInThisCase <= 0) continue;
            const dims = caseObj.dimensions ? caseObj.dimensions.split('x').map(s => parseFloat(s.trim())) : [0,0,0];
            const w = dims[0] || 0;
            const h = dims[1] || 0;
            const d = dims[2] || 0;
            const unitWeight = props.weight || 0;
            const totalWeight = unitsInThisCase * unitWeight + (caseObj.emptyWeight || 0);
            const name = caseObj.name || 'Общий кофр';
            result.push({ width: w, height: h, depth: d, weight: totalWeight, name, path });
            remaining -= unitsInThisCase;
        }
        if (remaining > 0) {
            const dims = props.dimensions ? props.dimensions.split('x').map(s => parseFloat(s.trim())) : [0,0,0];
            const w = dims[0] || 0;
            const h = dims[1] || 0;
            const d = dims[2] || 0;
            const unitWeight = props.weight || 0;
            result.push({ width: w, height: h, depth: d, weight: remaining * unitWeight, name: 'Без кофра (остаток)', path });
        }
        return result;
    }

    // Индивидуальные кофры
    const individualVals = getIndividualCaseValues(path);
    const options = getCaseOptions(path);
    if (individualVals.length > 0 && options.length > 0) {
        let remaining = qty;
        for (let i = 0; i < individualVals.length; i++) {
            const val = individualVals[i];
            if (val <= 0) continue;
            const opt = options[i] || options[0];
            const alt = mode.alt;
            let dimsStr, emptyWeight, qtyPerCase;
            if (alt && mode.enabled) {
                dimsStr = alt.dims || '';
                emptyWeight = alt.weight || 0;
                qtyPerCase = alt.qty || 1;
            } else {
                dimsStr = opt.dims || '';
                emptyWeight = opt.weight || 0;
                qtyPerCase = opt.qty || 1;
            }
            const dims = dimsStr.split('x').map(s => parseFloat(s.trim()));
            const w = dims[0] || 0;
            const h = dims[1] || 0;
            const d = dims[2] || 0;
            const unitWeight = props.weight || 0;
            const unitsInThisCase = Math.min(remaining, val);
            if (unitsInThisCase <= 0) continue;
            const fullCases = Math.floor(unitsInThisCase / qtyPerCase);
            const rem = unitsInThisCase % qtyPerCase;
            for (let c = 0; c < fullCases; c++) {
                result.push({ width: w, height: h, depth: d, weight: qtyPerCase * unitWeight + emptyWeight, name: `Кофр вар.${i+1}`, path });
            }
            if (rem > 0) {
                result.push({ width: w, height: h, depth: d, weight: rem * unitWeight + emptyWeight, name: `Кофр вар.${i+1} (неполный)`, path });
            }
            remaining -= unitsInThisCase;
        }
        if (remaining > 0) {
            const dims = props.dimensions ? props.dimensions.split('x').map(s => parseFloat(s.trim())) : [0,0,0];
            const w = dims[0] || 0;
            const h = dims[1] || 0;
            const d = dims[2] || 0;
            const unitWeight = props.weight || 0;
            result.push({ width: w, height: h, depth: d, weight: remaining * unitWeight, name: 'Без кофра (остаток)', path });
        }
        return result;
    }

    // Режим кофров (один вариант)
    if (mode.enabled) {
        let opt = getSelectedOption(path);
        let alt = mode.alt;
        let dimsStr, emptyWeight, qtyPerCase;
        if (alt && mode.useAlt) {
            dimsStr = alt.dims || '';
            emptyWeight = alt.weight || 0;
            qtyPerCase = alt.qty || 1;
        } else if (opt) {
            dimsStr = opt.dims || '';
            emptyWeight = opt.weight || 0;
            qtyPerCase = opt.qty || 1;
        } else {
            const dims = props.dimensions ? props.dimensions.split('x').map(s => parseFloat(s.trim())) : [0,0,0];
            const w = dims[0] || 0;
            const h = dims[1] || 0;
            const d = dims[2] || 0;
            const unitWeight = props.weight || 0;
            result.push({ width: w, height: h, depth: d, weight: qty * unitWeight, name: 'Без кофра', path });
            return result;
        }
        const dims = dimsStr.split('x').map(s => parseFloat(s.trim()));
        const w = dims[0] || 0;
        const h = dims[1] || 0;
        const d = dims[2] || 0;
        const unitWeight = props.weight || 0;
        const fullCases = Math.floor(qty / qtyPerCase);
        const rem = qty % qtyPerCase;
        for (let c = 0; c < fullCases; c++) {
            result.push({ width: w, height: h, depth: d, weight: qtyPerCase * unitWeight + emptyWeight, name: 'Кофр', path });
        }
        if (rem > 0) {
            result.push({ width: w, height: h, depth: d, weight: rem * unitWeight + emptyWeight, name: 'Неполный кофр', path });
        }
        return result;
    }

    // Без кофров
    const dims = props.dimensions ? props.dimensions.split('x').map(s => parseFloat(s.trim())) : [0,0,0];
    const w = dims[0] || 0;
    const h = dims[1] || 0;
    const d = dims[2] || 0;
    const unitWeight = props.weight || 0;
    result.push({ width: w, height: h, depth: d, weight: qty * unitWeight, name: 'Без кофра', path });
    return result;
}

// ============================================================
// ЭВРИСТИЧЕСКИЙ АЛГОРИТМ УПАКОВКИ (Corner-Based с проверкой веса)
// ============================================================
function packItems(truck, items) {
    // Сортируем по убыванию объёма
    const sortedItems = [...items].sort((a, b) => {
        const volA = a.width * a.height * a.depth;
        const volB = b.width * b.height * b.depth;
        return volB - volA;
    });

    const packed = [];
    const points = [{ x: 0, y: 0, z: 0 }];
    let currentWeight = 0;
    const maxWeight = truck.maxWeight || Infinity;

    for (let item of sortedItems) {
        if (currentWeight + item.weight > maxWeight) {
            return { success: false, packed, failedItem: item, reason: 'weight' };
        }

        let placed = false;
        for (let i = 0; i < points.length; i++) {
            const pt = points[i];
            if (pt.x + item.width <= truck.width &&
                pt.y + item.height <= truck.height &&
                pt.z + item.depth <= truck.depth) {
                let collision = false;
                for (let p of packed) {
                    if (pt.x < p.x + p.w && pt.x + item.width > p.x &&
                        pt.y < p.y + p.h && pt.y + item.height > p.y &&
                        pt.z < p.z + p.d && pt.z + item.depth > p.z) {
                        collision = true;
                        break;
                    }
                }
                if (!collision) {
                    packed.push({
                        x: pt.x, y: pt.y, z: pt.z,
                        w: item.width, h: item.height, d: item.depth,
                        weight: item.weight,
                        name: item.name,
                        path: item.path
                    });
                    currentWeight += item.weight;
                    points.splice(i, 1);
                    points.push({ x: pt.x + item.width, y: pt.y, z: pt.z });
                    points.push({ x: pt.x, y: pt.y + item.height, z: pt.z });
                    points.push({ x: pt.x, y: pt.y, z: pt.z + item.depth });
                    points.sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
                    placed = true;
                    break;
                }
            }
        }
        if (!placed) {
            return { success: false, packed, failedItem: item, reason: 'space' };
        }
    }
    return { success: true, packed };
}

// ============================================================
// ОСНОВНАЯ ФУНКЦИЯ РАСЧЁТА
// ============================================================
function calculateLoading() {
    const items = getOrderItemsForLoading();
    if (items.length === 0) {
        showToast('Нет позиций для расчёта', 'warning');
        return null;
    }

    let allCargo = [];
    for (let item of items) {
        const dims = getItemDimensions(item.path, item.qty);
        allCargo = allCargo.concat(dims);
    }

    if (allCargo.length === 0) {
        showToast('Нет груза для расчёта (все позиции без габаритов)', 'warning');
        return null;
    }

    const presets = getTruckPresets();
    const selectedTrucks = presets.filter(p => selectedTruckIds.includes(p.id));
    if (selectedTrucks.length === 0) {
        showToast('Выберите хотя бы один грузовик', 'warning');
        return null;
    }

    const result = {
        trucks: [],
        totalWeight: 0,
        totalVolume: 0,
        failedItems: []
    };

    let remainingCargo = allCargo.slice();

    for (let truck of selectedTrucks) {
        const truckResult = packItems(truck, remainingCargo);
        if (truckResult.success) {
            result.trucks.push({
                truckName: truck.name,
                items: truckResult.packed,
                totalWeight: truckResult.packed.reduce((s, i) => s + i.weight, 0),
                totalVolume: truckResult.packed.reduce((s, i) => s + i.w * i.h * i.d / 1000000, 0)
            });
            const packedPaths = truckResult.packed.map(p => p.path + p.name);
            remainingCargo = remainingCargo.filter((item, idx) => {
                return !truckResult.packed.some(p => p.path === item.path && p.name === item.name);
            });
            result.totalWeight += truckResult.packed.reduce((s, i) => s + i.weight, 0);
            result.totalVolume += truckResult.packed.reduce((s, i) => s + i.w * i.h * i.d / 1000000, 0);
        } else {
            if (truckResult.packed.length > 0) {
                result.trucks.push({
                    truckName: truck.name + ' (частично)',
                    items: truckResult.packed,
                    totalWeight: truckResult.packed.reduce((s, i) => s + i.weight, 0),
                    totalVolume: truckResult.packed.reduce((s, i) => s + i.w * i.h * i.d / 1000000, 0)
                });
                remainingCargo = remainingCargo.filter((item, idx) => {
                    return !truckResult.packed.some(p => p.path === item.path && p.name === item.name);
                });
                result.totalWeight += truckResult.packed.reduce((s, i) => s + i.weight, 0);
                result.totalVolume += truckResult.packed.reduce((s, i) => s + i.w * i.h * i.d / 1000000, 0);
                if (truckResult.failedItem) {
                    result.failedItems.push(truckResult.failedItem);
                }
            } else {
                result.failedItems = remainingCargo.slice();
                break;
            }
        }
        if (remainingCargo.length === 0) break;
    }

    if (remainingCargo.length > 0) {
        result.failedItems = result.failedItems.concat(remainingCargo);
    }

    return result;
}

// ============================================================
// ОТРИСОВКА СТРАНИЦЫ
// ============================================================
export function renderLoadingPage() {
    const container = document.getElementById('loadingContent');
    if (!container) return;

    loadOrderData();
    loadSelectedTrucks();
    truckPresets = getTruckPresets();

    let html = `
        <div style="margin-bottom:16px;">
            <h3 style="color:var(--text-primary);font-weight:600;margin-bottom:12px;">Расчёт загрузки</h3>
            <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:12px;">
                <button class="btn btn-green" id="calcLoadingBtn">Рассчитать</button>
                <button class="btn btn-sec" id="manageTrucksBtn">Управление грузовиками</button>
            </div>
            <div style="margin-bottom:12px;">
                <strong style="color:var(--text-secondary);">Выберите грузовики для загрузки:</strong>
                <div id="truckSelection" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;"></div>
            </div>
        </div>
        <div id="loadingResult" style="margin-top:12px;"></div>
    `;

    container.innerHTML = html;

    renderTruckSelection();

    document.getElementById('calcLoadingBtn')?.addEventListener('click', runCalculation);
    document.getElementById('manageTrucksBtn')?.addEventListener('click', openTruckManager);
}

function renderTruckSelection() {
    const container = document.getElementById('truckSelection');
    if (!container) return;
    const presets = getTruckPresets();
    if (presets.length === 0) {
        container.innerHTML = '<span style="color:var(--text-muted);">Нет грузовиков. Добавьте в управлении.</span>';
        return;
    }
    let html = '';
    presets.forEach(t => {
        const checked = selectedTruckIds.includes(t.id) ? 'checked' : '';
        html += `
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:14px;color:var(--text-secondary);">
                <input type="checkbox" class="truck-check" value="${t.id}" ${checked}>
                ${t.name} (${t.length}x${t.width}x${t.height} см, макс. ${t.maxWeight || 0} кг)
            </label>
        `;
    });
    container.innerHTML = html;

    container.querySelectorAll('.truck-check').forEach(cb => {
        cb.addEventListener('change', () => {
            if (cb.checked) {
                if (!selectedTruckIds.includes(cb.value)) {
                    selectedTruckIds.push(cb.value);
                }
            } else {
                selectedTruckIds = selectedTruckIds.filter(id => id !== cb.value);
            }
            saveSelectedTrucks();
        });
    });
}

function runCalculation() {
    const result = calculateLoading();
    loadingResult = result;
    renderResult(result);
}

function renderResult(result) {
    const container = document.getElementById('loadingResult');
    if (!container) return;

    if (!result) {
        container.innerHTML = '';
        return;
    }

    let html = `<div style="border-top:1px solid var(--border-color);padding-top:12px;">`;
    html += `<h4 style="color:var(--text-primary);">Результат расчёта</h4>`;

    if (result.trucks.length === 0) {
        html += `<p style="color:var(--text-muted);">Ничего не загружено</p>`;
    } else {
        result.trucks.forEach((t, idx) => {
            html += `<div style="margin:8px 0;padding:10px;background:var(--bg-secondary);border-radius:6px;border-left:3px solid var(--accent);">`;
            html += `<strong>${t.truckName}</strong> — ${t.items.length} предметов, вес: ${t.totalWeight.toFixed(1)} кг, объём: ${t.totalVolume.toFixed(3)} м³`;
            html += `<div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">`;
            t.items.forEach(item => {
                const name = item.name || 'Предмет';
                html += `<div>• ${name} (${item.w}x${item.h}x${item.d} см, ${item.weight.toFixed(1)} кг)</div>`;
            });
            html += `</div></div>`;
        });
    }

    if (result.failedItems && result.failedItems.length > 0) {
        html += `<div style="margin:8px 0;padding:10px;background:var(--overstock-bg);border-radius:6px;border-left:3px solid var(--danger);">`;
        html += `<strong style="color:var(--danger);">Не поместились (${result.failedItems.length} шт):</strong>`;
        html += `<div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">`;
        result.failedItems.forEach(item => {
            const name = item.name || 'Предмет';
            html += `<div>• ${name} (${item.width||0}x${item.height||0}x${item.depth||0} см, ${item.weight||0} кг)</div>`;
        });
        html += `</div></div>`;
    }

    html += `<div style="margin-top:8px;font-size:14px;color:var(--text-secondary);">`;
    html += `<span>Общий вес: ${result.totalWeight.toFixed(1)} кг</span> | `;
    html += `<span>Общий объём: ${result.totalVolume.toFixed(3)} м³</span>`;
    html += `</div>`;

    html += `<div style="margin-top:12px;display:flex;gap:10px;">`;
    html += `<button class="btn btn-green" id="exportLoadingJson">Экспорт JSON</button>`;
    html += `<button class="btn btn-orange" id="exportLoadingPdf">Экспорт PDF</button>`;
    html += `</div>`;

    html += `</div>`;
    container.innerHTML = html;

    document.getElementById('exportLoadingJson')?.addEventListener('click', exportLoadingJSON);
    document.getElementById('exportLoadingPdf')?.addEventListener('click', exportLoadingPDF);
}

// ============================================================
// ЭКСПОРТ РЕЗУЛЬТАТОВ
// ============================================================
function exportLoadingJSON() {
    if (!loadingResult) {
        showToast('Нет данных для экспорта', 'warning');
        return;
    }
    const data = {
        project_name: document.getElementById('pName')?.value.trim() || 'Загрузка',
        date: new Date().toLocaleDateString('ru-RU'),
        trucks: loadingResult.trucks.map(t => ({
            name: t.truckName,
            items: t.items.map(i => ({
                name: i.name,
                dimensions: `${i.w}x${i.h}x${i.d}`,
                weight: i.weight
            })),
            totalWeight: t.totalWeight,
            totalVolume: t.totalVolume
        })),
        failedItems: loadingResult.failedItems.map(i => ({
            name: i.name,
            dimensions: `${i.width||0}x${i.height||0}x${i.depth||0}`,
            weight: i.weight||0
        })),
        totalWeight: loadingResult.totalWeight,
        totalVolume: loadingResult.totalVolume
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'loading_plan.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('JSON экспортирован', 'success');
}

function exportLoadingPDF() {
    if (!loadingResult) {
        showToast('Нет данных для экспорта', 'warning');
        return;
    }
    const projectName = document.getElementById('pName')?.value.trim() || 'Загрузка';
    let html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>План загрузки</title>
<style>
body{font-family:'Segoe UI',Arial,sans-serif;margin:40px;color:#222;background:#fff}
h1{color:#2c3e50;border-bottom:2px solid #3498db;padding-bottom:10px}
.truck{margin:16px 0;padding:12px;border:1px solid #ddd;border-radius:6px;}
.truck h3{margin:0 0 8px 0;color:#2c3e50;}
.item{font-size:14px;padding:2px 0;border-bottom:1px solid #f0f0f0;}
.failed{color:#c0392b;background:#fde8e8;padding:12px;border-radius:6px;margin:12px 0;}
.summary{margin-top:20px;font-weight:bold;font-size:16px;}
</style>
</head><body>
<h1>План загрузки: ${esc(projectName)}</h1>
<p>Дата: ${new Date().toLocaleDateString('ru-RU')}</p>`;

    loadingResult.trucks.forEach((t, idx) => {
        html += `<div class="truck"><h3>${t.truckName}</h3>`;
        html += `<p>Предметов: ${t.items.length}, вес: ${t.totalWeight.toFixed(1)} кг, объём: ${t.totalVolume.toFixed(3)} м³</p>`;
        t.items.forEach(item => {
            html += `<div class="item">• ${item.name} (${item.w}x${item.h}x${item.d} см, ${item.weight.toFixed(1)} кг)</div>`;
        });
        html += `</div>`;
    });

    if (loadingResult.failedItems && loadingResult.failedItems.length > 0) {
        html += `<div class="failed"><strong>Не поместились:</strong>`;
        loadingResult.failedItems.forEach(item => {
            html += `<div>• ${item.name} (${item.width||0}x${item.height||0}x${item.depth||0} см, ${item.weight||0} кг)</div>`;
        });
        html += `</div>`;
    }

    html += `<div class="summary">Общий вес: ${loadingResult.totalWeight.toFixed(1)} кг | Общий объём: ${loadingResult.totalVolume.toFixed(3)} м³</div>`;
    html += `<div style="margin-top:30px;display:flex;gap:12px;">
        <button onclick="window.print()" style="padding:10px 24px;background:#2c3e50;color:white;border:none;border-radius:6px;font-size:16px;cursor:pointer;">Сохранить PDF</button>
        <button onclick="window.close()" style="padding:10px 24px;background:#ddd;color:#333;border:none;border-radius:6px;font-size:16px;cursor:pointer;">Назад</button>
    </div>`;
    html += `</body></html>`;

    const win = window.open('', '_blank');
    if (win) {
        win.document.write(html);
        win.document.close();
        win.focus();
    } else {
        showToast('Не удалось открыть окно', 'error');
    }
}

// ============================================================
// УПРАВЛЕНИЕ ГРУЗОВИКАМИ (модалка)
// ============================================================
function openTruckManager() {
    const modal = document.getElementById('truckManagerModal');
    if (!modal) {
        showToast('Модалка управления грузовиками не найдена', 'error');
        return;
    }
    renderTruckList();
    modal.classList.add('open');
}

function renderTruckList() {
    const container = document.getElementById('truckList');
    const presets = getTruckPresets();
    if (presets.length === 0) {
        container.innerHTML = '<div class="empty-message">Нет грузовиков</div>';
        return;
    }
    let html = '';
    presets.forEach(t => {
        html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-bottom:1px solid var(--border-color);gap:10px;">
            <div><strong>${esc(t.name)}</strong><br>
            <span style="font-size:13px;color:var(--text-secondary);">${t.length}x${t.width}x${t.height} см, макс. вес: ${t.maxWeight||0} кг</span></div>
            <div>
                <button class="btn btn-sm" onclick="window.editTruck('${t.id}')">✏️</button>
                <button class="btn btn-sm" onclick="window.deleteTruck('${t.id}')" style="background:var(--danger);color:white;">✕</button>
            </div>
        </div>`;
    });
    container.innerHTML = html;
}

window.editTruck = function(id) {
    const presets = getTruckPresets();
    const t = presets.find(p => p.id === id);
    if (!t) return;
    document.getElementById('truckName').value = t.name || '';
    document.getElementById('truckLength').value = t.length || '';
    document.getElementById('truckWidth').value = t.width || '';
    document.getElementById('truckHeight').value = t.height || '';
    document.getElementById('truckMaxWeight').value = t.maxWeight || '';
    const addBtn = document.getElementById('truckAddBtn');
    addBtn.textContent = 'Обновить';
    addBtn.dataset.editId = id;
};

window.deleteTruck = async function(id) {
    const confirmed = await showConfirm('Удалить грузовик?');
    if (!confirmed) return;
    deleteTruckPreset(id);
    selectedTruckIds = selectedTruckIds.filter(tid => tid !== id);
    saveSelectedTrucks();
    renderTruckList();
    renderTruckSelection();
    showToast('Грузовик удалён', 'neutral');
};

export function initTruckManagerHandlers() {
    const addBtn = document.getElementById('truckAddBtn');
    if (addBtn) {
        addBtn.addEventListener('click', function() {
            const name = document.getElementById('truckName').value.trim();
            const length = parseFloat(document.getElementById('truckLength').value);
            const width = parseFloat(document.getElementById('truckWidth').value);
            const height = parseFloat(document.getElementById('truckHeight').value);
            const maxWeight = parseFloat(document.getElementById('truckMaxWeight').value);
            if (!name) { showToast('Введите название', 'warning'); return; }
            if (isNaN(length) || length <= 0) { showToast('Введите длину', 'warning'); return; }
            if (isNaN(width) || width <= 0) { showToast('Введите ширину', 'warning'); return; }
            if (isNaN(height) || height <= 0) { showToast('Введите высоту', 'warning'); return; }
            const editId = this.dataset.editId;
            if (editId) {
                updateTruckPreset(editId, { name, length, width, height, maxWeight: isNaN(maxWeight)?0:maxWeight });
                showToast('Грузовик обновлён', 'success');
            } else {
                addTruckPreset({ name, length, width, height, maxWeight: isNaN(maxWeight)?0:maxWeight });
                showToast('Грузовик добавлен', 'success');
            }
            document.getElementById('truckName').value = '';
            document.getElementById('truckLength').value = '';
            document.getElementById('truckWidth').value = '';
            document.getElementById('truckHeight').value = '';
            document.getElementById('truckMaxWeight').value = '';
            this.textContent = '+ Добавить';
            delete this.dataset.editId;
            renderTruckList();
            renderTruckSelection();
        });
    }

    const closeBtn = document.getElementById('truckManagerClose');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.getElementById('truckManagerModal').classList.remove('open');
        });
    }

    const overlay = document.getElementById('truckManagerModal');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('open');
            }
        });
    }
}
