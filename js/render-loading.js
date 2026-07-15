// render-loading.js — Полностью переписанный модуль расчёта загрузки
import {
    getItemProps,
    getCommonCases,
    getTruckPresets,
    addTruckPreset,
    updateTruckPreset,
    deleteTruckPreset
} from './data.js';

import {
    getOrderPacking,
    getCaseMode,
    getCaseOptions,
    getSelectedOption,
    getIndividualCaseValues,
    loadOrderData
} from './order.js';

import {
    esc,
    showToast,
    showPrompt,
    showConfirm
} from './ui.js';

import { getActiveItemsOrder } from './order-helpers.js';

// ============================================================
// УПРАВЛЕНИЕ ВЫБРАННЫМИ ГРУЗОВИКАМИ
// ============================================================
const SELECTED_TRUCKS_KEY = 'selected_truck_ids';
export let selectedTruckIds = [];
let loadingResult = null;

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
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ ГРУЗОВЫХ МЕСТ
// ============================================================

/** Разбивает строку габаритов "AxBxC" на массив [A, B, C] */
function parseDimensions(dimStr) {
    if (!dimStr || typeof dimStr !== 'string') return [0, 0, 0];
    const parts = dimStr.split('x').map(s => parseFloat(s.trim()));
    if (parts.length === 3 && parts.every(v => !isNaN(v) && v > 0)) {
        return parts;
    }
    return [0, 0, 0];
}

/** Создаёт грузовое место с заданными параметрами */
function createCargoItem(width, height, depth, weight, name, path) {
    return { width, height, depth, weight, name, path };
}

// ============================================================
// ПРЕОБРАЗОВАНИЕ ПОЗИЦИЙ В ГРУЗОВЫЕ МЕСТА
// ============================================================

function generateCargoItemsForPath(path, qty) {
    if (qty <= 0) return [];

    const props = getItemProps(path);
    const mode = getCaseMode(path);
    const packing = getOrderPacking(path);
    const individualVals = getIndividualCaseValues(path);
    const options = getCaseOptions(path);
    const unitWeight = props.weight || 0;
    const itemDims = parseDimensions(props.dimensions || '');
    const hasItemDims = itemDims[0] > 0 && itemDims[1] > 0 && itemDims[2] > 0;

    const result = [];

    // === 1. Общие кофры ===
    if (packing.length > 0) {
        let remaining = qty;
        for (const p of packing) {
            const caseObj = getCommonCases().find(c => c.id === p.caseId);
            if (!caseObj) continue;
            const piecesInCase = Math.min(remaining, p.pieces || 0);
            if (piecesInCase <= 0) continue;
            const caseDims = parseDimensions(caseObj.dimensions || '');
            if (caseDims[0] > 0 && caseDims[1] > 0 && caseDims[2] > 0) {
                const weight = piecesInCase * unitWeight + (caseObj.emptyWeight || 0);
                result.push(createCargoItem(caseDims[0], caseDims[1], caseDims[2], weight, caseObj.name || 'Общий кофр', path));
            }
            remaining -= piecesInCase;
        }
        if (remaining > 0 && hasItemDims) {
            result.push(createCargoItem(itemDims[0], itemDims[1], itemDims[2], remaining * unitWeight, 'Без кофра (остаток)', path));
        }
        return result;
    }

    // === 2. Индивидуальные кофры (мультирежим) ===
    if (individualVals.length > 0 && options.length > 0) {
        let remaining = qty;
        for (let i = 0; i < individualVals.length; i++) {
            const val = individualVals[i];
            if (val <= 0) continue;
            const opt = options[i] || options[0];
            const alt = mode.alt;
            let dimsStr, emptyWeight, qtyPerCase;
            if (alt && mode.enabled && mode.useAlt) {
                dimsStr = alt.dims || '';
                emptyWeight = alt.weight || 0;
                qtyPerCase = alt.qty || 1;
            } else {
                dimsStr = opt.dims || '';
                emptyWeight = opt.weight || 0;
                qtyPerCase = opt.qty || 1;
            }
            const caseDims = parseDimensions(dimsStr);
            if (caseDims[0] > 0 && caseDims[1] > 0 && caseDims[2] > 0) {
                const unitsHere = Math.min(remaining, val);
                if (unitsHere <= 0) continue;
                const fullCases = Math.floor(unitsHere / qtyPerCase);
                const rem = unitsHere % qtyPerCase;
                for (let c = 0; c < fullCases; c++) {
                    const weight = qtyPerCase * unitWeight + emptyWeight;
                    result.push(createCargoItem(caseDims[0], caseDims[1], caseDims[2], weight, `Кофр вар.${i+1}`, path));
                }
                if (rem > 0) {
                    const weight = rem * unitWeight + emptyWeight;
                    result.push(createCargoItem(caseDims[0], caseDims[1], caseDims[2], weight, `Кофр вар.${i+1} (неполный)`, path));
                }
                remaining -= unitsHere;
            }
        }
        if (remaining > 0 && hasItemDims) {
            result.push(createCargoItem(itemDims[0], itemDims[1], itemDims[2], remaining * unitWeight, 'Без кофра (остаток)', path));
        }
        return result;
    }

    // === 3. Один кофр (режим enabled) ===
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
            // Нет кофра – используем габариты позиции
            if (hasItemDims) {
                result.push(createCargoItem(itemDims[0], itemDims[1], itemDims[2], qty * unitWeight, 'Без кофра', path));
            }
            return result;
        }
        const caseDims = parseDimensions(dimsStr);
        if (caseDims[0] > 0 && caseDims[1] > 0 && caseDims[2] > 0) {
            const fullCases = Math.floor(qty / qtyPerCase);
            const rem = qty % qtyPerCase;
            for (let c = 0; c < fullCases; c++) {
                const weight = qtyPerCase * unitWeight + emptyWeight;
                result.push(createCargoItem(caseDims[0], caseDims[1], caseDims[2], weight, 'Кофр', path));
            }
            if (rem > 0) {
                const weight = rem * unitWeight + emptyWeight;
                result.push(createCargoItem(caseDims[0], caseDims[1], caseDims[2], weight, 'Неполный кофр', path));
            }
        } else if (hasItemDims) {
            // Если у кофра нет габаритов – используем габариты позиции
            result.push(createCargoItem(itemDims[0], itemDims[1], itemDims[2], qty * unitWeight, 'Без кофра (ошибка кофра)', path));
        }
        return result;
    }

    // === 4. Без кофров ===
    if (hasItemDims) {
        result.push(createCargoItem(itemDims[0], itemDims[1], itemDims[2], qty * unitWeight, 'Без кофра', path));
    }
    return result;
}

// ============================================================
// АЛГОРИТМ УПАКОВКИ (С ПОВОРОТАМИ)
// ============================================================

function packItems(truck, items) {
    // Генерируем все возможные ориентации для каждого предмета
    const allOrientations = items.map(item => {
        const dims = [
            { w: item.width, h: item.height, d: item.depth },
            { w: item.width, h: item.depth, d: item.height },
            { w: item.height, h: item.width, d: item.depth },
            { w: item.height, h: item.depth, d: item.width },
            { w: item.depth, h: item.width, d: item.height },
            { w: item.depth, h: item.height, d: item.width }
        ];
        // Убираем дубликаты
        const unique = [];
        const seen = new Set();
        for (const d of dims) {
            const key = `${d.w},${d.h},${d.d}`;
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(d);
            }
        }
        return { item, orientations: unique };
    });

    // Сортируем по максимальному объёму (убывание)
    allOrientations.sort((a, b) => {
        const volA = Math.max(...a.orientations.map(o => o.w * o.h * o.d));
        const volB = Math.max(...b.orientations.map(o => o.w * o.h * o.d));
        return volB - volA;
    });

    const packed = [];
    const points = [{ x: 0, y: 0, z: 0 }];
    let currentWeight = 0;
    const maxWeight = truck.maxWeight || Infinity;

    for (const entry of allOrientations) {
        const item = entry.item;
        let placed = false;
        // Пробуем все ориентации
        for (const orient of entry.orientations) {
            if (currentWeight + item.weight > maxWeight) {
                break; // вес не позволяет – переход к следующему предмету
            }
            const w = orient.w, h = orient.h, d = orient.d;
            for (let i = 0; i < points.length; i++) {
                const pt = points[i];
                if (pt.x + w <= truck.width &&
                    pt.y + h <= truck.height &&
                    pt.z + d <= truck.depth) {
                    // Проверка коллизий
                    let collision = false;
                    for (const p of packed) {
                        if (pt.x < p.x + p.w && pt.x + w > p.x &&
                            pt.y < p.y + p.h && pt.y + h > p.y &&
                            pt.z < p.z + p.d && pt.z + d > p.z) {
                            collision = true;
                            break;
                        }
                    }
                    if (!collision) {
                        packed.push({
                            x: pt.x, y: pt.y, z: pt.z,
                            w, h, d,
                            weight: item.weight,
                            name: item.name,
                            path: item.path
                        });
                        currentWeight += item.weight;
                        points.splice(i, 1);
                        points.push({ x: pt.x + w, y: pt.y, z: pt.z });
                        points.push({ x: pt.x, y: pt.y + h, z: pt.z });
                        points.push({ x: pt.x, y: pt.y, z: pt.z + d });
                        points.sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
                        placed = true;
                        break;
                    }
                }
            }
            if (placed) break;
        }
        if (!placed) {
            console.warn(`❌ Не удалось разместить: ${item.name} (${item.width}x${item.height}x${item.depth} см, ${item.weight} кг)`);
            return { success: false, packed, failedItem: item, reason: 'space' };
        }
    }
    return { success: true, packed };
}

// ============================================================
// ОСНОВНАЯ ФУНКЦИЯ РАСЧЁТА
// ============================================================

function calculateLoading() {
    const items = getActiveItemsOrder();
    console.log('📦 Позиции для загрузки:', items);
    if (items.length === 0) {
        showToast('Нет позиций для расчёта', 'warning');
        return null;
    }

    // Генерируем грузовые места
    let allCargo = [];
    for (const item of items) {
        const cargo = generateCargoItemsForPath(item.path, item.qty);
        console.log(`📐 Для "${item.path}" (${item.qty} шт) создано ${cargo.length} мест:`, cargo);
        allCargo = allCargo.concat(cargo);
    }

    if (allCargo.length === 0) {
        showToast('Нет груза для расчёта (все позиции без габаритов)', 'warning');
        return null;
    }

    const presets = getTruckPresets();
    const selectedTrucks = presets.filter(p => selectedTruckIds.includes(p.id));
    console.log('🚛 Выбранные грузовики:', selectedTrucks);
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

    for (const truck of selectedTrucks) {
        console.log(`🚚 Загрузка в "${truck.name}" (${truck.length}x${truck.width}x${truck.height} см, макс. вес ${truck.maxWeight} кг)`);
        const truckResult = packItems(truck, remainingCargo);
        if (truckResult.success) {
            result.trucks.push({
                truckName: truck.name,
                items: truckResult.packed,
                totalWeight: truckResult.packed.reduce((s, i) => s + i.weight, 0),
                totalVolume: truckResult.packed.reduce((s, i) => s + i.w * i.h * i.d / 1000000, 0)
            });
            // Удаляем упакованные предметы
            const packedKeys = truckResult.packed.map(p => `${p.path}|${p.name}|${p.w}|${p.h}|${p.d}`);
            remainingCargo = remainingCargo.filter(item => {
                const key = `${item.path}|${item.name}|${item.width}|${item.height}|${item.depth}`;
                return !packedKeys.includes(key);
            });
            result.totalWeight += truckResult.packed.reduce((s, i) => s + i.weight, 0);
            result.totalVolume += truckResult.packed.reduce((s, i) => s + i.w * i.h * i.d / 1000000, 0);
            console.log(`✅ Загружено ${truckResult.packed.length} предметов, осталось ${remainingCargo.length}`);
        } else {
            if (truckResult.packed.length > 0) {
                result.trucks.push({
                    truckName: truck.name + ' (частично)',
                    items: truckResult.packed,
                    totalWeight: truckResult.packed.reduce((s, i) => s + i.weight, 0),
                    totalVolume: truckResult.packed.reduce((s, i) => s + i.w * i.h * i.d / 1000000, 0)
                });
                const packedKeys = truckResult.packed.map(p => `${p.path}|${p.name}|${p.w}|${p.h}|${p.d}`);
                remainingCargo = remainingCargo.filter(item => {
                    const key = `${item.path}|${item.name}|${item.width}|${item.height}|${item.depth}`;
                    return !packedKeys.includes(key);
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

    console.log('📊 ИТОГ расчёта:', result);
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
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
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