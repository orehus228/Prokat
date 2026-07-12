// order.js — Данные заказа (order, splits, packing, routes, caseModes, excludeFromLoading)
import { getItemProps, getCommonCases, getCachedCalculation, setCachedCalculation, clearCache } from './data.js';

// ============================================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ЗАКАЗА
// ============================================================
export let order = {};
export let orderSplits = {};
export let links = {};
export let notes = {};
export let orderPacking = {};
export let individualCaseValues = {};
export let commonRoutes = {};
export let caseModes = {};
export let orderExclude = {}; // Добавлено

// ============================================================
// ЗАГРУЗКА / СОХРАНЕНИЕ
// ============================================================
const STORAGE_ORDER_KEY = 'app_order_data';

export function loadOrderData() {
    try {
        const raw = localStorage.getItem(STORAGE_ORDER_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        order = data.order || {};
        orderSplits = data.orderSplits || {};
        links = data.links || {};
        notes = data.notes || {};
        orderPacking = data.orderPacking || {};
        individualCaseValues = data.individualCaseValues || {};
        commonRoutes = data.commonRoutes || {};
        caseModes = data.caseModes || {};
        orderExclude = data.orderExclude || {};
        // Приводим caseModes к корректному виду
        for (let path in caseModes) {
            const mode = caseModes[path];
            if (mode.enabled === undefined) mode.enabled = false;
            if (mode.alt === undefined) mode.alt = null;
            if (mode.selectedOption === undefined) mode.selectedOption = 0;
            if (mode.accumulate === undefined) mode.accumulate = false;
        }
    } catch (e) {
        console.warn('Ошибка загрузки данных заказа', e);
    }
}

export function saveOrderData() {
    const data = {
        order,
        orderSplits,
        links,
        notes,
        orderPacking,
        individualCaseValues,
        commonRoutes,
        caseModes,
        orderExclude
    };
    localStorage.setItem(STORAGE_ORDER_KEY, JSON.stringify(data));
    clearCache();
}

// ============================================================
// ФУНКЦИИ ДЛЯ РАБОТЫ С КОЛИЧЕСТВАМИ
// ============================================================
export function getTotalQty(path) {
    let total = order[path] || 0;
    if (orderSplits[path]) {
        total += orderSplits[path].reduce((s, seg) => s + (seg.qty || 0), 0);
    }
    return total;
}

export function getSegmentsSum(path) {
    if (!orderSplits[path]) return 0;
    return orderSplits[path].reduce((s, seg) => s + (seg.qty || 0), 0);
}

export function getOrderPacking(path) {
    return orderPacking[path] || [];
}

export function setOrderPacking(path, packing) {
    if (packing && packing.length > 0) {
        orderPacking[path] = packing;
    } else {
        delete orderPacking[path];
    }
    saveOrderData();
}

export function getCommonRoutes(path) {
    return commonRoutes[path] || [];
}

export function setCommonRoutes(path, route) {
    if (route && route.length > 0) {
        commonRoutes[path] = route;
    } else {
        delete commonRoutes[path];
    }
    saveOrderData();
}

export function getIndividualCaseValues(path) {
    return individualCaseValues[path] || [];
}

export function setIndividualCaseValues(path, vals) {
    if (vals && vals.length > 0) {
        individualCaseValues[path] = vals;
    } else {
        delete individualCaseValues[path];
    }
    saveOrderData();
}

export function getCaseMode(path) {
    if (!caseModes[path]) {
        caseModes[path] = { enabled: false, alt: null, selectedOption: 0, accumulate: false };
        saveOrderData();
    }
    return caseModes[path];
}

export function getCaseOptions(path) {
    const props = getItemProps(path);
    return (props.individualCases || []).map(c => ({ qty: Number(c.qty)||0, dims: c.dimensions||'', weight: Number(c.weight)||0 }));
}

export function getSelectedOption(path) {
    const mode = getCaseMode(path);
    const options = getCaseOptions(path);
    if (options.length === 0) return null;
    const idx = mode.selectedOption || 0;
    if (idx >= options.length) return options[0];
    return options[idx];
}

// ============================================================
// ФУНКЦИИ ДЛЯ ИСКЛЮЧЕНИЯ ИЗ ЗАГРУЗКИ (если нужны, но оставим для совместимости)
// ============================================================
export function isExcludedFromLoading(path) {
    return !!orderExclude[path];
}

export function setExcludeFromLoading(path, exclude) {
    if (exclude) {
        orderExclude[path] = true;
    } else {
        delete orderExclude[path];
    }
    saveOrderData();
}

// ============================================================
// ПОЛУЧЕНИЕ ГАБАРИТОВ ПОЗИЦИИ ДЛЯ РАСЧЁТА ЗАГРУЗКИ (не используется в этом файле, но оставим)
// ============================================================
export function getItemDimensionsForLoading(path, qty) {
    // Возвращает массив объектов { width, height, depth, weight } для каждой единицы/кофра
    // Если позиция исключена, возвращаем пустой массив
    if (isExcludedFromLoading(path)) {
        return [];
    }

    const props = getItemProps(path);
    const mode = getCaseMode(path);
    const packing = getOrderPacking(path);
    const totalQty = qty || getTotalQty(path);
    if (totalQty <= 0) return [];

    // Проверяем, есть ли привязка к общим кофрам
    if (packing.length > 0) {
        // Каждый общий кофр — это отдельный элемент с его габаритами
        const result = [];
        let remaining = totalQty;
        for (let p of packing) {
            const caseObj = getCommonCases().find(c => c.id === p.caseId);
            if (!caseObj) continue;
            // Сколько единиц помещается в этот кофр
            const capacity = caseObj.qty || 1;
            const unitsInThisCase = Math.min(remaining, capacity);
            if (unitsInThisCase <= 0) continue;
            // Вес: вес позиций + вес кофра
            const unitWeight = props.weight || 0;
            const totalWeight = unitsInThisCase * unitWeight + (caseObj.emptyWeight || 0);
            // Габариты кофра
            const dims = caseObj.dimensions ? caseObj.dimensions.split('x').map(s => parseFloat(s.trim())) : [0,0,0];
            const w = dims[0] || 0;
            const h = dims[1] || 0;
            const d = dims[2] || 0;
            result.push({ width: w, height: h, depth: d, weight: totalWeight, name: caseObj.name });
            remaining -= unitsInThisCase;
        }
        // Если остались единицы (не поместились в кофры), добавляем их без кофра
        if (remaining > 0) {
            const dims = props.dimensions ? props.dimensions.split('x').map(s => parseFloat(s.trim())) : [0,0,0];
            const w = dims[0] || 0;
            const h = dims[1] || 0;
            const d = dims[2] || 0;
            const unitWeight = props.weight || 0;
            result.push({ width: w, height: h, depth: d, weight: remaining * unitWeight, name: 'Без кофра (остаток)' });
        }
        return result;
    }

    // Индивидуальные кофры (мульти-кофры)
    const individualVals = getIndividualCaseValues(path);
    const options = getCaseOptions(path);
    if (individualVals.length > 0 && options.length > 0) {
        const result = [];
        let remaining = totalQty;
        // Проходим по каждому варианту мульти-кофра
        for (let i = 0; i < individualVals.length; i++) {
            const val = individualVals[i];
            if (val <= 0) continue;
            const opt = options[i] || options[0];
            const unitsInThisCase = Math.min(remaining, val);
            if (unitsInThisCase <= 0) continue;
            // Если есть альтернативный кофр, используем его
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
            const totalWeight = unitsInThisCase * unitWeight + emptyWeight;
            // Рассчитываем, сколько полных кофров получится
            const fullCases = Math.floor(unitsInThisCase / qtyPerCase);
            const rem = unitsInThisCase % qtyPerCase;
            // Добавляем полные кофры
            for (let c = 0; c < fullCases; c++) {
                result.push({ width: w, height: h, depth: d, weight: qtyPerCase * unitWeight + emptyWeight, name: `Кофр вар.${i+1}` });
            }
            if (rem > 0) {
                // Неполный кофр — занимает тот же объём, вес меньше
                result.push({ width: w, height: h, depth: d, weight: rem * unitWeight + emptyWeight, name: `Кофр вар.${i+1} (неполный)` });
            }
            remaining -= unitsInThisCase;
        }
        // Остаток без кофров
        if (remaining > 0) {
            const dims = props.dimensions ? props.dimensions.split('x').map(s => parseFloat(s.trim())) : [0,0,0];
            const w = dims[0] || 0;
            const h = dims[1] || 0;
            const d = dims[2] || 0;
            const unitWeight = props.weight || 0;
            result.push({ width: w, height: h, depth: d, weight: remaining * unitWeight, name: 'Без кофра (остаток)' });
        }
        return result;
    }

    // Если режим кофров включён, но нет мульти-вариантов, используем выбранный вариант или альтернативный
    if (mode.enabled) {
        let opt = getSelectedOption(path);
        let alt = mode.alt;
        let dimsStr, emptyWeight, qtyPerCase;
        if (alt) {
            dimsStr = alt.dims || '';
            emptyWeight = alt.weight || 0;
            qtyPerCase = alt.qty || 1;
        } else if (opt) {
            dimsStr = opt.dims || '';
            emptyWeight = opt.weight || 0;
            qtyPerCase = opt.qty || 1;
        } else {
            // Нет данных — используем собственные габариты
            const dims = props.dimensions ? props.dimensions.split('x').map(s => parseFloat(s.trim())) : [0,0,0];
            const w = dims[0] || 0;
            const h = dims[1] || 0;
            const d = dims[2] || 0;
            const unitWeight = props.weight || 0;
            return [{ width: w, height: h, depth: d, weight: totalQty * unitWeight, name: 'Без кофра' }];
        }
        const dims = dimsStr.split('x').map(s => parseFloat(s.trim()));
        const w = dims[0] || 0;
        const h = dims[1] || 0;
        const d = dims[2] || 0;
        const unitWeight = props.weight || 0;
        const fullCases = Math.floor(totalQty / qtyPerCase);
        const rem = totalQty % qtyPerCase;
        const result = [];
        for (let c = 0; c < fullCases; c++) {
            result.push({ width: w, height: h, depth: d, weight: qtyPerCase * unitWeight + emptyWeight, name: 'Кофр' });
        }
        if (rem > 0) {
            result.push({ width: w, height: h, depth: d, weight: rem * unitWeight + emptyWeight, name: 'Неполный кофр' });
        }
        return result;
    }

    // Без кофров — используем собственные габариты
    const dims = props.dimensions ? props.dimensions.split('x').map(s => parseFloat(s.trim())) : [0,0,0];
    const w = dims[0] || 0;
    const h = dims[1] || 0;
    const d = dims[2] || 0;
    const unitWeight = props.weight || 0;
    return [{ width: w, height: h, depth: d, weight: totalQty * unitWeight, name: 'Без кофра' }];
}

// ============================================================
// РАСЧЁТ ВЕСА С КЕШИРОВАНИЕМ
// ============================================================
function getCacheKey(path, qty, mode) {
    return `${path}|${qty}|${mode.enabled}|${mode.selectedOption}|${mode.alt ? 'alt' : 'none'}|${mode.accumulate}`;
}

export function calcItemWeightWithMode(path, qty) {
    if (qty <= 0) return 0;
    const props = getItemProps(path);
    if (!props.weight) return 0;

    const mode = getCaseMode(path);
    const cacheKey = getCacheKey(path, qty, mode);
    const cached = getCachedCalculation('weight_' + cacheKey);
    if (cached !== undefined) return cached;

    let result = 0;
    const packing = getOrderPacking(path);

    if (packing.length > 0) {
        let totalPacked = 0;
        packing.forEach(p => {
            const caseObj = getCommonCases().find(c => c.id === p.caseId);
            if (caseObj) {
                const emptyWeight = caseObj.emptyWeight || 0;
                const unitWeight = props.weight;
                result += p.qty * unitWeight + (p.qty > 0 ? emptyWeight : 0);
                totalPacked += p.qty;
            }
        });
        const remainder = qty - totalPacked;
        if (remainder > 0) {
            result += remainder * props.weight;
        }
    } else {
        const vals = getIndividualCaseValues(path);
        if (vals.length > 0) {
            const options = getCaseOptions(path);
            vals.forEach((v, idx) => {
                if (v <= 0) return;
                const opt = options[idx] || options[0];
                const fullCases = Math.floor(v / opt.qty);
                const rem = v % opt.qty;
                const fullCaseWeight = (opt.weight || 0) + (opt.qty * props.weight);
                result += fullCases * fullCaseWeight;
                if (rem > 0) result += (opt.weight || 0) + (rem * props.weight);
            });
        } else {
            const mode = getCaseMode(path);
            if (!mode.enabled) {
                result = qty * props.weight;
            } else {
                const opt = getSelectedOption(path);
                if (!opt || opt.qty <= 0) {
                    result = qty * props.weight;
                } else {
                    const fullCases = Math.floor(qty / opt.qty);
                    const rem = qty % opt.qty;
                    const fullCaseWeight = (opt.weight || 0) + (opt.qty * props.weight);
                    result = fullCases * fullCaseWeight;
                    if (rem > 0) result += (opt.weight || 0) + (rem * props.weight);
                }
            }
        }
    }

    setCachedCalculation('weight_' + cacheKey, result);
    return result;
}

// ============================================================
// РАСЧЁТ ОБЪЁМА С КЕШИРОВАНИЕМ
// ============================================================
export function calcItemVolumeWithMode(path, qty) {
    if (qty <= 0) return 0;
    const props = getItemProps(path);
    if (!props.dimensions) return 0;

    const mode = getCaseMode(path);
    const cacheKey = getCacheKey(path, qty, mode);
    const cached = getCachedCalculation('volume_' + cacheKey);
    if (cached !== undefined) return cached;

    let result = 0;
    const packing = getOrderPacking(path);

    if (packing.length > 0) {
        let totalPacked = 0;
        packing.forEach(p => {
            const caseObj = getCommonCases().find(c => c.id === p.caseId);
            if (caseObj && p.qty > 0) {
                if (caseObj.dimensions) {
                    const dims = caseObj.dimensions.split('x').map(s => parseFloat(s.trim()));
                    if (dims.length === 3 && dims.every(d => !isNaN(d) && d > 0)) {
                        const caseVolume = (dims[0]*dims[1]*dims[2]) / 1000000;
                        result += caseVolume;
                    }
                }
                totalPacked += p.qty;
            }
        });
        const remainder = qty - totalPacked;
        if (remainder > 0) {
            const dims = props.dimensions.split('x').map(s => parseFloat(s.trim()));
            if (dims.length === 3 && dims.every(d => !isNaN(d) && d > 0)) {
                result += (dims[0]*dims[1]*dims[2]) / 1000000 * remainder;
            }
        }
    } else {
        const vals = getIndividualCaseValues(path);
        if (vals.length > 0) {
            const options = getCaseOptions(path);
            vals.forEach((v, idx) => {
                if (v <= 0) return;
                const opt = options[idx] || options[0];
                const fullCases = Math.floor(v / opt.qty);
                const rem = v % opt.qty;
                if (opt.dims) {
                    const dims = opt.dims.split('x').map(s => parseFloat(s.trim()));
                    if (dims.length === 3 && dims.every(d => !isNaN(d) && d > 0)) {
                        const caseVolume = (dims[0]*dims[1]*dims[2]) / 1000000;
                        result += fullCases * caseVolume;
                        if (rem > 0) result += caseVolume;
                    }
                }
            });
        } else {
            const mode = getCaseMode(path);
            if (!mode.enabled) {
                const dims = props.dimensions.split('x').map(s => parseFloat(s.trim()));
                if (dims.length === 3 && dims.every(d => !isNaN(d) && d > 0)) {
                    result = (dims[0]*dims[1]*dims[2]) / 1000000 * qty;
                }
            } else {
                const opt = getSelectedOption(path);
                if (!opt || opt.qty <= 0) {
                    const dims = props.dimensions.split('x').map(s => parseFloat(s.trim()));
                    if (dims.length === 3 && dims.every(d => !isNaN(d) && d > 0)) {
                        result = (dims[0]*dims[1]*dims[2]) / 1000000 * qty;
                    }
                } else {
                    const fullCases = Math.floor(qty / opt.qty);
                    const rem = qty % opt.qty;
                    if (opt.dims) {
                        const dims = opt.dims.split('x').map(s => parseFloat(s.trim()));
                        if (dims.length === 3 && dims.every(d => !isNaN(d) && d > 0)) {
                            const caseVolume = (dims[0]*dims[1]*dims[2]) / 1000000;
                            result = fullCases * caseVolume;
                            if (rem > 0) result += caseVolume;
                        }
                    }
                }
            }
        }
    }

    setCachedCalculation('volume_' + cacheKey, result);
    return result;
}

// ============================================================
// РАСЧЁТ КОЛИЧЕСТВА КОФРОВ
// ============================================================
export function calcItemCases(path, qty) {
    if (qty <= 0) return 0;
    const mode = getCaseMode(path);
    if (!mode.enabled) return 0;
    const opt = getSelectedOption(path);
    if (!opt || opt.qty <= 0) return 0;
    return Math.ceil(qty / opt.qty);
}

// ============================================================
// ОБНОВЛЕНИЕ ПУТЕЙ ПРИ ПЕРЕИМЕНОВАНИИ
// ============================================================
export function updateOrderPaths(oldPath, newPath) {
    if (order[oldPath] !== undefined) {
        order[newPath] = order[oldPath];
        delete order[oldPath];
    }
    if (orderSplits[oldPath] !== undefined) {
        orderSplits[newPath] = orderSplits[oldPath];
        delete orderSplits[oldPath];
    }
    if (links[oldPath] !== undefined) {
        links[newPath] = links[oldPath];
        delete links[oldPath];
    }
    if (notes[oldPath] !== undefined) {
        notes[newPath] = notes[oldPath];
        delete notes[oldPath];
    }
    if (orderPacking[oldPath] !== undefined) {
        orderPacking[newPath] = orderPacking[oldPath];
        delete orderPacking[oldPath];
    }
    if (individualCaseValues[oldPath] !== undefined) {
        individualCaseValues[newPath] = individualCaseValues[oldPath];
        delete individualCaseValues[oldPath];
    }
    if (commonRoutes[oldPath] !== undefined) {
        commonRoutes[newPath] = commonRoutes[oldPath];
        delete commonRoutes[oldPath];
    }
    if (caseModes[oldPath] !== undefined) {
        caseModes[newPath] = caseModes[oldPath];
        delete caseModes[oldPath];
    }
    if (orderExclude[oldPath] !== undefined) {
        orderExclude[newPath] = orderExclude[oldPath];
        delete orderExclude[oldPath];
    }
    saveOrderData();
}