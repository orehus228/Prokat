// order.js — Данные заказа (order, splits, packing, routes, caseModes)
import { getItemProps, getCommonCases, getCachedCalculation, setCachedCalculation, clearCache } from './data.js';

export let order = {};
export let orderSplits = {};
export let links = {};
export let notes = {};
export let orderPacking = {};
export let individualCaseValues = {};
export let commonRoutes = {};
export let caseModes = {};

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
        caseModes
    };
    localStorage.setItem(STORAGE_ORDER_KEY, JSON.stringify(data));
    clearCache();
}

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

export function calcItemCases(path, qty) {
    if (qty <= 0) return 0;
    const mode = getCaseMode(path);
    if (!mode.enabled) return 0;
    const opt = getSelectedOption(path);
    if (!opt || opt.qty <= 0) return 0;
    return Math.ceil(qty / opt.qty);
}

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
    saveOrderData();
}