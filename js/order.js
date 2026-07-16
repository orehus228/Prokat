// order.js — Данные заказа (полная версия с синхронизацией путей)
import {
    getItemProps,
    getCommonCases,
    getCachedCalculation,
    setCachedCalculation,
    clearCache as clearCalculationCache
} from './data.js';

export let order = {};
export let orderSplits = {};
export let links = {};
export let notes = {};
export let orderPacking = {};
export let individualCaseValues = {};
export let commonRoutes = {};
export let caseModes = {};
export let orderExclude = {};
export let orderExtra = {};

// НОВОЕ ДЛЯ ПРОЕКТОВ
export let orderProject = {
    id: null,
    name: '',
    start_date: '',
    end_date: '',
    status: 'planned' // planned | active | completed
};

const STORAGE_ORDER_KEY = 'app_order_data';

export function clearCache() {
    clearCalculationCache();
}

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
        orderExtra = data.orderExtra || {};
        
        // НОВОЕ ДЛЯ ПРОЕКТОВ
        orderProject = data.orderProject || {
            id: null,
            name: '',
            start_date: '',
            end_date: '',
            status: 'planned'
        };

        // Нормализация caseModes (старая логика)
        for (let path in caseModes) {
            const mode = caseModes[path];
            if (mode.enabled === undefined) mode.enabled = false;
            if (mode.alt === undefined) mode.alt = null;
            if (mode.selectedOption === undefined) mode.selectedOption = 0;
            if (mode.accumulate === undefined) mode.accumulate = false;
            if (mode.multiSelected === undefined) mode.multiSelected = [];
            if (mode.commonSelected === undefined) mode.commonSelected = [];
            if (mode.useAlt === undefined) mode.useAlt = false;
            if (mode.criteria === undefined) mode.criteria = 'weight';
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
        orderExclude,
        orderExtra,
        orderProject  // <-- добавлено
    };
    localStorage.setItem(STORAGE_ORDER_KEY, JSON.stringify(data));
    clearCache();
}

export function updateAllPaths(oldPrefix, newPrefix) {
    const objectsToUpdate = [
        { obj: order, name: 'order' },
        { obj: orderSplits, name: 'orderSplits' },
        { obj: links, name: 'links' },
        { obj: notes, name: 'notes' },
        { obj: orderPacking, name: 'orderPacking' },
        { obj: individualCaseValues, name: 'individualCaseValues' },
        { obj: commonRoutes, name: 'commonRoutes' },
        { obj: caseModes, name: 'caseModes' },
        { obj: orderExclude, name: 'orderExclude' },
        { obj: orderExtra, name: 'orderExtra' }
    ];

    objectsToUpdate.forEach(({ obj, name }) => {
        const keys = Object.keys(obj);
        keys.forEach(oldKey => {
            if (oldKey.startsWith(oldPrefix)) {
                const newKey = oldKey.replace(oldPrefix, newPrefix);
                obj[newKey] = obj[oldKey];
                delete obj[oldKey];
                if (name === 'orderSplits' && Array.isArray(obj[newKey])) {
                    obj[newKey].forEach(seg => {
                        if (seg.path && seg.path.startsWith(oldPrefix)) {
                            seg.path = seg.path.replace(oldPrefix, newPrefix);
                        }
                    });
                }
                if (name === 'links' && Array.isArray(obj[newKey])) {
                    obj[newKey].forEach(link => {
                        if (link.target && link.target.startsWith(oldPrefix)) {
                            link.target = link.target.replace(oldPrefix, newPrefix);
                        }
                    });
                }
                if (name === 'commonRoutes' && Array.isArray(obj[newKey])) {
                    obj[newKey].forEach(route => {
                        if (route.target && route.target.startsWith(oldPrefix)) {
                            route.target = route.target.replace(oldPrefix, newPrefix);
                        }
                    });
                }
            }
        });
    });
    saveOrderData();
}

export function updateOrderPaths(oldPath, newPath) {
    if (oldPath === newPath) return;
    const objectsToUpdate = [
        order, orderSplits, links, notes, orderPacking,
        individualCaseValues, commonRoutes, caseModes, orderExclude, orderExtra
    ];
    objectsToUpdate.forEach(obj => {
        if (obj[oldPath] !== undefined) {
            obj[newPath] = obj[oldPath];
            delete obj[oldPath];
        }
    });
    saveOrderData();
}

// ============================================================
// БАЗОВЫЕ ФУНКЦИИ
// ============================================================

export function getTotalQty(path) {
    const packing = getOrderPacking(path);
    if (packing.length > 0) {
        const extra = getOrderExtra(path);
        return extra + packing.reduce((s, p) => s + (p.pieces || 0), 0);
    }

    const mode = getCaseMode(path);
    const vals = getIndividualCaseValues(path);
    if (mode.enabled && vals.length > 0) {
        return vals.reduce((a, b) => a + b, 0);
    }

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

export function getOrderExtra(path) {
    return orderExtra[path] || 0;
}

export function setOrderExtra(path, val) {
    val = Math.max(0, parseInt(val) || 0);
    if (val > 0) {
        orderExtra[path] = val;
    } else {
        delete orderExtra[path];
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
        caseModes[path] = {
            enabled: false,
            alt: null,
            selectedOption: 0,
            accumulate: false,
            multiSelected: [],
            commonSelected: [],
            useAlt: false,
            criteria: 'weight'
        };
        saveOrderData();
    }
    return caseModes[path];
}

export function getCaseOptions(path) {
    const props = getItemProps(path);
    return (props.individualCases || []).map(c => ({
        qty: Number(c.qty)||0,
        dims: c.dimensions||'',
        weight: Number(c.weight)||0,
        maxCases: Number(c.maxCases)||0
    }));
}

export function getSelectedOption(path) {
    const mode = getCaseMode(path);
    const options = getCaseOptions(path);
    if (options.length === 0) return null;
    const idx = mode.selectedOption || 0;
    if (idx >= options.length) return options[0];
    return options[idx];
}

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
    const vals = getIndividualCaseValues(path);
    const extra = getOrderExtra(path);

    if (packing.length > 0) {
        let totalPacked = 0;
        packing.forEach(p => {
            const caseObj = getCommonCases().find(c => c.id === p.caseId);
            if (caseObj && p.pieces > 0) {
                const emptyWeight = caseObj.emptyWeight || 0;
                const unitWeight = props.weight;
                result += p.pieces * unitWeight + (p.pieces > 0 ? emptyWeight : 0);
                totalPacked += p.pieces;
            }
        });
        const remainder = qty - totalPacked - extra;
        if (remainder > 0) {
            result += remainder * props.weight;
        }
        if (extra > 0) {
            result += extra * props.weight;
        }
    }
    else if (vals.length > 0) {
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
    }
    else {
        result = qty * props.weight;
    }

    setCachedCalculation('weight_' + cacheKey, result);
    return result;
}

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
    const vals = getIndividualCaseValues(path);
    const extra = getOrderExtra(path);

    if (packing.length > 0) {
        let totalPacked = 0;
        packing.forEach(p => {
            const caseObj = getCommonCases().find(c => c.id === p.caseId);
            if (caseObj && p.pieces > 0) {
                if (caseObj.dimensions) {
                    const dims = caseObj.dimensions.split('x').map(s => parseFloat(s.trim()));
                    if (dims.length === 3 && dims.every(d => !isNaN(d) && d > 0)) {
                        const caseVolume = (dims[0]*dims[1]*dims[2]) / 1000000;
                        result += caseVolume;
                    }
                }
                totalPacked += p.pieces;
            }
        });
        const remainder = qty - totalPacked - extra;
        if (remainder > 0) {
            const dims = props.dimensions.split('x').map(s => parseFloat(s.trim()));
            if (dims.length === 3 && dims.every(d => !isNaN(d) && d > 0)) {
                result += (dims[0]*dims[1]*dims[2]) / 1000000 * remainder;
            }
        }
        if (extra > 0) {
            const dims = props.dimensions.split('x').map(s => parseFloat(s.trim()));
            if (dims.length === 3 && dims.every(d => !isNaN(d) && d > 0)) {
                result += (dims[0]*dims[1]*dims[2]) / 1000000 * extra;
            }
        }
    } else if (vals.length > 0) {
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
        const dims = props.dimensions.split('x').map(s => parseFloat(s.trim()));
        if (dims.length === 3 && dims.every(d => !isNaN(d) && d > 0)) {
            result = (dims[0]*dims[1]*dims[2]) / 1000000 * qty;
        }
    }

    setCachedCalculation('volume_' + cacheKey, result);
    return result;
}

export function calcItemCases(path, qty) {
    const mode = getCaseMode(path);
    if (!mode.enabled) return 0;
    const options = getCaseOptions(path);
    if (options.length === 0) return 0;
    const vals = getIndividualCaseValues(path);
    if (vals.length === 0) return 0;
    let totalCases = 0;
    vals.forEach((v, idx) => {
        if (v <= 0) return;
        const opt = options[idx] || options[0];
        totalCases += Math.ceil(v / opt.qty);
    });
    return totalCases;
}

// ============================================================
// НОВЫЕ ФУНКЦИИ ДЛЯ РАБОТЫ С ПРОЕКТАМИ
// ============================================================

export function setOrderProject(projectData) {
    Object.assign(orderProject, projectData);
    saveOrderData();
}

export function getOrderProject() {
    return { ...orderProject };
}

export function resetOrderProject() {
    orderProject = {
        id: null,
        name: '',
        start_date: '',
        end_date: '',
        status: 'planned'
    };
    saveOrderData();
}