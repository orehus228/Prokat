// order.js — Данные и логика заказа (сплиттер, мультикофры, сохранение)
import { getItemProps, getCommonCases } from './data.js';

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

// ============================================================
// ЗАГРУЗКА / СОХРАНЕНИЕ ЗАКАЗА
// ============================================================
export function loadOrderData() {
    try { order = JSON.parse(localStorage.getItem('order_data')) || {}; } catch(e){}
    try { orderSplits = JSON.parse(localStorage.getItem('order_splits')) || {}; } catch(e){}
    try { links = JSON.parse(localStorage.getItem('order_links')) || {}; } catch(e){}
    try { notes = JSON.parse(localStorage.getItem('item_notes')) || {}; } catch(e){}
    try { orderPacking = JSON.parse(localStorage.getItem('order_packing')) || {}; } catch(e){}
    try { individualCaseValues = JSON.parse(localStorage.getItem('individualCaseValues')) || {}; } catch(e){}
    try { commonRoutes = JSON.parse(localStorage.getItem('commonRoutes')) || {}; } catch(e){}
    try { caseModes = JSON.parse(localStorage.getItem('caseModes')) || {}; } catch(e){}
}

export function saveOrderData() {
    localStorage.setItem('order_data', JSON.stringify(order));
    localStorage.setItem('order_splits', JSON.stringify(orderSplits));
    localStorage.setItem('order_links', JSON.stringify(links));
    localStorage.setItem('item_notes', JSON.stringify(notes));
    localStorage.setItem('order_packing', JSON.stringify(orderPacking));
    localStorage.setItem('individualCaseValues', JSON.stringify(individualCaseValues));
    localStorage.setItem('commonRoutes', JSON.stringify(commonRoutes));
    localStorage.setItem('caseModes', JSON.stringify(caseModes));
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
    if (!caseModes[path]) caseModes[path] = { enabled: false, alt: null, selectedOption: 0, accumulate: false };
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
// РАСЧЁТ ВЕСА/ОБЪЁМА С УЧЁТОМ РЕЖИМОВ КОФРОВ
// ============================================================
export function calcItemWeightWithMode(path, qty) {
    const props = getItemProps(path);
    if (!props.weight) return 0;
    const packing = getOrderPacking(path);
    if (packing.length > 0) {
        let totalWeight = 0;
        let totalPacked = 0;
        packing.forEach(p => {
            const caseObj = getCommonCases().find(c => c.id === p.caseId);
            if (caseObj) {
                const emptyWeight = caseObj.emptyWeight || 0;
                const unitWeight = props.weight;
                totalWeight += p.qty * unitWeight + (p.qty > 0 ? emptyWeight : 0);
                totalPacked += p.qty;
            }
        });
        const remainder = qty - totalPacked;
        if (remainder > 0) {
            totalWeight += remainder * props.weight;
        }
        return totalWeight;
    }
    const vals = getIndividualCaseValues(path);
    if (vals.length > 0) {
        const options = getCaseOptions(path);
        let totalWeight = 0;
        vals.forEach((v, idx) => {
            if (v <= 0) return;
            const opt = options[idx] || options[0];
            const fullCases = Math.floor(v / opt.qty);
            const rem = v % opt.qty;
            const fullCaseWeight = (opt.weight || 0) + (opt.qty * props.weight);
            totalWeight += fullCases * fullCaseWeight;
            if (rem > 0) totalWeight += (opt.weight || 0) + (rem * props.weight);
        });
        return totalWeight;
    }
    const mode = getCaseMode(path);
    if (!mode.enabled) return qty * props.weight;
    const opt = getSelectedOption(path);
    if (!opt || opt.qty <= 0) return qty * props.weight;
    const fullCases = Math.floor(qty / opt.qty);
    const rem = qty % opt.qty;
    let weight = 0;
    const fullCaseWeight = (opt.weight || 0) + (opt.qty * props.weight);
    weight += fullCases * fullCaseWeight;
    if (rem > 0) weight += (opt.weight || 0) + (rem * props.weight);
    return weight;
}

export function calcItemVolumeWithMode(path, qty) {
    const props = getItemProps(path);
    if (!props.dimensions) return 0;
    const packing = getOrderPacking(path);
    if (packing.length > 0) {
        let totalVolume = 0;
        let totalPacked = 0;
        packing.forEach(p => {
            const caseObj = getCommonCases().find(c => c.id === p.caseId);
            if (caseObj && p.qty > 0) {
                if (caseObj.dimensions) {
                    const dims = caseObj.dimensions.split('x').map(s => parseFloat(s.trim()));
                    if (dims.length === 3 && dims.every(d => !isNaN(d) && d > 0)) {
                        const caseVolume = (dims[0]*dims[1]*dims[2]) / 1000000;
                        totalVolume += caseVolume;
                    }
                }
                totalPacked += p.qty;
            }
        });
        const remainder = qty - totalPacked;
        if (remainder > 0) {
            const dims = props.dimensions.split('x').map(s => parseFloat(s.trim()));
            if (dims.length === 3 && dims.every(d => !isNaN(d) && d > 0)) {
                totalVolume += (dims[0]*dims[1]*dims[2]) / 1000000 * remainder;
            }
        }
        return totalVolume;
    }
    const vals = getIndividualCaseValues(path);
    if (vals.length > 0) {
        const options = getCaseOptions(path);
        let totalVolume = 0;
        vals.forEach((v, idx) => {
            if (v <= 0) return;
            const opt = options[idx] || options[0];
            const fullCases = Math.floor(v / opt.qty);
            const rem = v % opt.qty;
            if (opt.dims) {
                const dims = opt.dims.split('x').map(s => parseFloat(s.trim()));
                if (dims.length === 3 && dims.every(d => !isNaN(d) && d > 0)) {
                    const caseVolume = (dims[0]*dims[1]*dims[2]) / 1000000;
                    totalVolume += fullCases * caseVolume;
                    if (rem > 0) totalVolume += caseVolume;
                }
            }
        });
        return totalVolume;
    }
    const mode = getCaseMode(path);
    if (!mode.enabled) {
        const dims = props.dimensions.split('x').map(s => parseFloat(s.trim()));
        if (dims.length !== 3 || dims.some(isNaN)) return 0;
        return (dims[0]*dims[1]*dims[2]) / 1000000 * qty;
    }
    const opt = getSelectedOption(path);
    if (!opt || opt.qty <= 0) {
        const dims = props.dimensions.split('x').map(s => parseFloat(s.trim()));
        if (dims.length !== 3 || dims.some(isNaN)) return 0;
        return (dims[0]*dims[1]*dims[2]) / 1000000 * qty;
    }
    const fullCases = Math.floor(qty / opt.qty);
    const rem = qty % opt.qty;
    let volume = 0;
    if (opt.dims) {
        const dims = opt.dims.split('x').map(s => parseFloat(s.trim()));
        if (dims.length === 3 && dims.every(d => !isNaN(d) && d > 0)) {
            const caseVolume = (dims[0]*dims[1]*dims[2]) / 1000000;
            volume += fullCases * caseVolume;
            if (rem > 0) volume += caseVolume;
        }
    }
    return volume;
}

export function calcItemCases(path, qty) {
    const mode = getCaseMode(path);
    if (!mode.enabled) return 0;
    const opt = getSelectedOption(path);
    if (!opt || opt.qty <= 0) return 0;
    return Math.ceil(qty / opt.qty);
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ (вызывается из main.js)
// ============================================================
export function initOrder() {
    loadOrderData();
}