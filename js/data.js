// data.js — Работа с данными (загрузка, сохранение, доступ)
import {
    CAT_NAMES,
    DUPLICATE_VIDEO_GROUPS,
    STORAGE_KEYS,
    DEFAULT_TRUCK_PRESETS
} from './config.js';

// Импортируем функции из order.js для синхронизации и кеширования
import { updateOrderPaths, updateAllPaths, clearCache } from './order.js';

export let editorData = {};
const calculationCache = new Map();

export function loadEditorData() {
    try {
        const saved = localStorage.getItem(STORAGE_KEYS.APP_DATA);
        if (saved) {
            const parsed = JSON.parse(saved);
            editorData = parsed;
            normalizeAllData();
            return;
        }
    } catch (e) {
        console.warn('Ошибка загрузки данных', e);
    }
    resetToEmpty();
    saveEditorData();
}

function resetToEmpty() {
    editorData = {
        inventory: {},
        stock: {},
        specs: {},
        itemProps: {},
        catNames: { ...CAT_NAMES },
        _categoryOrder: [],
        commonCases: [],
        truckPresets: [...DEFAULT_TRUCK_PRESETS]
    };
}

function normalizeAllData() {
    if (editorData.inventory && editorData.inventory.video) {
        const video = editorData.inventory.video;
        DUPLICATE_VIDEO_GROUPS.forEach(name => {
            if (video[name] !== undefined) {
                delete video[name];
                if (video._subOrder) {
                    const idx = video._subOrder.indexOf(name);
                    if (idx !== -1) video._subOrder.splice(idx, 1);
                }
            }
        });
        if (video._subOrder) {
            video._subOrder = video._subOrder.filter(k => video[k] !== undefined);
        }
    }

    for (let key in editorData.itemProps) {
        const props = editorData.itemProps[key];
        if (props.individualCases === undefined) props.individualCases = [];
        if (!Array.isArray(props.individualCases)) props.individualCases = [];
        if (props.allowCommon === undefined) props.allowCommon = false;
        if (props.commonCases === undefined) props.commonCases = [];
        if (!Array.isArray(props.commonCases)) props.commonCases = [];
        props.individualCases = props.individualCases.map(c => {
            if (c.maxCases === undefined) c.maxCases = 0;
            return c;
        });
        if (props.caseOptions !== undefined) delete props.caseOptions;
        if (props.weight === undefined) props.weight = 0;
        if (props.dimensions === undefined) props.dimensions = '';
        if (props.volume === undefined) props.volume = 0;
    }

    for (let cat in editorData.inventory) {
        const catData = editorData.inventory[cat];
        if (typeof catData === 'object' && !Array.isArray(catData)) {
            if (!catData._subOrder) {
                catData._subOrder = Object.keys(catData).filter(k => k !== '_subOrder');
            } else {
                catData._subOrder = catData._subOrder.filter(k => catData[k] !== undefined);
                Object.keys(catData).forEach(k => {
                    if (k !== '_subOrder' && !catData._subOrder.includes(k)) {
                        catData._subOrder.push(k);
                    }
                });
            }
        }
    }

    if (!editorData.truckPresets) {
        editorData.truckPresets = [...DEFAULT_TRUCK_PRESETS];
    }

    if (editorData._categoryOrder) {
        editorData._categoryOrder = editorData._categoryOrder.filter(cat => 
            editorData.inventory && editorData.inventory[cat] !== undefined
        );
    } else {
        editorData._categoryOrder = Object.keys(editorData.inventory);
    }
}

export function saveEditorData() {
    localStorage.setItem(STORAGE_KEYS.APP_DATA, JSON.stringify(editorData));
    calculationCache.clear();
    clearCache(); // вызов импортированной функции из order.js
}

export function resetAllData() {
    resetToEmpty();
    saveEditorData();
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('multi_')) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
}

export function cleanupInventory(inventory, stock, specs, itemProps) {
    if (!inventory || !inventory.video) return;
    let changed = false;
    DUPLICATE_VIDEO_GROUPS.forEach(name => {
        if (inventory.video[name] !== undefined) {
            delete inventory.video[name];
            changed = true;
            if (inventory.video._subOrder) {
                const idx = inventory.video._subOrder.indexOf(name);
                if (idx !== -1) inventory.video._subOrder.splice(idx, 1);
            }
        }
    });
    const prefixes = ['video|Экран|', 'video|Экраны|'];
    const keysToDeleteStock = Object.keys(stock || {}).filter(k => prefixes.some(p => k.startsWith(p)));
    keysToDeleteStock.forEach(k => delete stock[k]);
    const keysToDeleteSpecs = Object.keys(specs || {}).filter(k => prefixes.some(p => k.startsWith(p)));
    keysToDeleteSpecs.forEach(k => delete specs[k]);
    const keysToDeleteProps = Object.keys(itemProps || {}).filter(k => prefixes.some(p => k.startsWith(p)));
    keysToDeleteProps.forEach(k => delete itemProps[k]);

    if (changed) {
        const keys = Object.keys(inventory.video).filter(k => k !== '_subOrder');
        if (keys.length === 0) {
            inventory.video = { "Телевизоры": [] };
            inventory.video._subOrder = ["Телевизоры"];
        }
        if (inventory.video._subOrder) {
            inventory.video._subOrder = inventory.video._subOrder.filter(k => inventory.video[k] !== undefined);
            if (inventory.video._subOrder.length === 0) {
                inventory.video._subOrder = Object.keys(inventory.video).filter(k => k !== '_subOrder');
            }
        }
    }
}

export function convertOldItemProps(itemProps) {
    const converted = {};
    for (let key in itemProps) {
        const props = itemProps[key];
        const newProps = { ...props };
        let hasOld = false;
        let qtyArr = [], dimArr = [], weightArr = [];
        if (props.case_qty !== undefined) {
            hasOld = true;
            qtyArr = Array.isArray(props.case_qty) ? props.case_qty : [props.case_qty];
        }
        if (props.case_dimensions !== undefined) {
            hasOld = true;
            dimArr = Array.isArray(props.case_dimensions) ? props.case_dimensions : [props.case_dimensions];
        }
        if (props.case_weight !== undefined) {
            hasOld = true;
            weightArr = Array.isArray(props.case_weight) ? props.case_weight : [props.case_weight];
        }
        if (hasOld) {
            const len = Math.max(qtyArr.length, dimArr.length, weightArr.length);
            const cases = [];
            for (let i = 0; i < len; i++) {
                const q = qtyArr[i] !== undefined ? Number(qtyArr[i]) : 0;
                const d = dimArr[i] !== undefined ? String(dimArr[i]) : '';
                const w = weightArr[i] !== undefined ? Number(weightArr[i]) : 0;
                if (q > 0 || d || w > 0) {
                    cases.push({ qty: q, dimensions: d, weight: w, maxCases: 0 });
                }
            }
            if (cases.length > 0) {
                newProps.individualCases = cases;
            } else {
                newProps.individualCases = [];
            }
            delete newProps.case_qty;
            delete newProps.case_dimensions;
            delete newProps.case_weight;
        } else {
            if (newProps.individualCases === undefined) newProps.individualCases = [];
            if (newProps.allowCommon === undefined) newProps.allowCommon = false;
            if (newProps.commonCases === undefined) newProps.commonCases = [];
        }
        if (newProps.allowCommon === undefined) newProps.allowCommon = false;
        if (newProps.commonCases === undefined) newProps.commonCases = [];
        if (newProps.individualCases && Array.isArray(newProps.individualCases)) {
            newProps.individualCases = newProps.individualCases.map(c => {
                if (c.maxCases === undefined) c.maxCases = 0;
                return c;
            });
        }
        if (newProps.weight === undefined) newProps.weight = 0;
        if (newProps.dimensions === undefined) newProps.dimensions = '';
        if (newProps.volume === undefined) newProps.volume = 0;
        if (newProps.caseOptions !== undefined) delete newProps.caseOptions;
        converted[key] = newProps;
    }
    return converted;
}

export function getStockKey(catKey, subKey, itemName) {
    if (subKey) return catKey + '|' + subKey + '|' + itemName;
    return catKey + '|' + itemName;
}

export function getStock(catKey, subKey, itemName) {
    const key = getStockKey(catKey, subKey, itemName);
    return editorData.stock[key] !== undefined ? editorData.stock[key] : 0;
}

export function setStock(catKey, subKey, itemName, val) {
    const key = getStockKey(catKey, subKey, itemName);
    editorData.stock[key] = Number(val);
    saveEditorData();
}

export function getSpec(catKey, subKey, itemName) {
    const key = getStockKey(catKey, subKey, itemName);
    return editorData.specs[key] || '';
}

export function setSpec(catKey, subKey, itemName, val) {
    const key = getStockKey(catKey, subKey, itemName);
    if (val && val.trim()) editorData.specs[key] = val;
    else delete editorData.specs[key];
    saveEditorData();
}

export function getItemProps(catKey, subKey, itemName) {
    let key;
    if (arguments.length === 1) {
        key = catKey;
    } else {
        key = getStockKey(catKey, subKey, itemName);
    }
    const props = editorData.itemProps[key];
    if (props) {
        if (props.weight === undefined) props.weight = 0;
        if (props.dimensions === undefined) props.dimensions = '';
        if (props.volume === undefined) props.volume = 0;
        return props;
    }
    return { weight: 0, dimensions: '', volume: 0, individualCases: [], allowCommon: false, commonCases: [] };
}

export function setItemProps(catKey, subKey, itemName, props) {
    const key = getStockKey(catKey, subKey, itemName);
    if (props && Object.keys(props).length > 0) {
        if (props.weight === undefined) props.weight = 0;
        if (props.dimensions === undefined) props.dimensions = '';
        if (props.volume === undefined) props.volume = 0;
        editorData.itemProps[key] = props;
    } else {
        delete editorData.itemProps[key];
    }
    saveEditorData();
    clearCache(); // вызов импортированной функции
}

export function getCommonCases() {
    return editorData.commonCases || [];
}

export function addCommonCase(caseObj) {
    editorData.commonCases.push(caseObj);
    saveEditorData();
}

export function updateCommonCase(id, newData) {
    const idx = editorData.commonCases.findIndex(c => c.id === id);
    if (idx !== -1) {
        editorData.commonCases[idx] = { ...editorData.commonCases[idx], ...newData };
        saveEditorData();
    }
}

export function deleteCommonCase(id) {
    editorData.commonCases = editorData.commonCases.filter(c => c.id !== id);
    for (let key in editorData.itemProps) {
        const props = editorData.itemProps[key];
        if (props.commonCases) {
            props.commonCases = props.commonCases.filter(opt => opt.caseId !== id);
            if (props.commonCases.length === 0) delete props.commonCases;
        }
    }
    saveEditorData();
}

export function getTruckPresets() {
    return editorData.truckPresets || [];
}

export function addTruckPreset(preset) {
    if (!editorData.truckPresets) editorData.truckPresets = [];
    if (!preset.id) preset.id = 'truck_' + Date.now();
    editorData.truckPresets.push(preset);
    saveEditorData();
}

export function updateTruckPreset(id, newData) {
    const presets = getTruckPresets();
    const idx = presets.findIndex(p => p.id === id);
    if (idx !== -1) {
        presets[idx] = { ...presets[idx], ...newData };
        saveEditorData();
    }
}

export function deleteTruckPreset(id) {
    editorData.truckPresets = editorData.truckPresets.filter(p => p.id !== id);
    saveEditorData();
}

export function getTruckPreset(id) {
    return getTruckPresets().find(p => p.id === id);
}

export function getCachedCalculation(key) {
    return calculationCache.get(key);
}

export function setCachedCalculation(key, value) {
    calculationCache.set(key, value);
}

// Удалено локальное объявление clearCache — используем импортированное

// ===== ПЕРЕИМЕНОВАНИЕ И ПЕРЕМЕЩЕНИЕ С СИНХРОНИЗАЦИЕЙ ЗАКАЗА =====
export function renameCategory(oldName, newName) {
    if (oldName === newName) return;
    if (editorData.inventory[newName]) throw new Error('Категория уже существует');
    editorData.inventory[newName] = editorData.inventory[oldName];
    delete editorData.inventory[oldName];
    const idx = editorData._categoryOrder.indexOf(oldName);
    if (idx !== -1) editorData._categoryOrder[idx] = newName;
    if (editorData.catNames[oldName]) {
        editorData.catNames[newName] = editorData.catNames[oldName];
        delete editorData.catNames[oldName];
    }
    const oldPrefix = oldName + '|';
    const newPrefix = newName + '|';
    const keysToUpdate = Object.keys(editorData.stock).filter(k => k.startsWith(oldPrefix));
    keysToUpdate.forEach(k => {
        const newK = k.replace(oldPrefix, newPrefix);
        editorData.stock[newK] = editorData.stock[k];
        delete editorData.stock[k];
    });
    const specKeys = Object.keys(editorData.specs).filter(k => k.startsWith(oldPrefix));
    specKeys.forEach(k => {
        const newK = k.replace(oldPrefix, newPrefix);
        editorData.specs[newK] = editorData.specs[k];
        delete editorData.specs[k];
    });
    const propsKeys = Object.keys(editorData.itemProps).filter(k => k.startsWith(oldPrefix));
    propsKeys.forEach(k => {
        const newK = k.replace(oldPrefix, newPrefix);
        editorData.itemProps[newK] = editorData.itemProps[k];
        delete editorData.itemProps[k];
    });
    updateAllPaths(oldPrefix, newPrefix);
    saveEditorData();
}

export function renameSubgroup(catKey, oldSub, newSub) {
    if (oldSub === newSub) return;
    const catData = editorData.inventory[catKey];
    if (!catData || typeof catData !== 'object' || Array.isArray(catData)) return;
    if (catData[newSub]) throw new Error('Подгруппа уже существует');
    catData[newSub] = catData[oldSub];
    delete catData[oldSub];
    const order = catData._subOrder;
    if (order) {
        const idx = order.indexOf(oldSub);
        if (idx !== -1) order[idx] = newSub;
    }
    const oldPrefix = catKey + '|' + oldSub + '|';
    const newPrefix = catKey + '|' + newSub + '|';
    const keysToUpdate = Object.keys(editorData.stock).filter(k => k.startsWith(oldPrefix));
    keysToUpdate.forEach(k => {
        const newK = k.replace(oldPrefix, newPrefix);
        editorData.stock[newK] = editorData.stock[k];
        delete editorData.stock[k];
    });
    const specKeys = Object.keys(editorData.specs).filter(k => k.startsWith(oldPrefix));
    specKeys.forEach(k => {
        const newK = k.replace(oldPrefix, newPrefix);
        editorData.specs[newK] = editorData.specs[k];
        delete editorData.specs[k];
    });
    const propsKeys = Object.keys(editorData.itemProps).filter(k => k.startsWith(oldPrefix));
    propsKeys.forEach(k => {
        const newK = k.replace(oldPrefix, newPrefix);
        editorData.itemProps[newK] = editorData.itemProps[k];
        delete editorData.itemProps[k];
    });
    updateAllPaths(oldPrefix, newPrefix);
    saveEditorData();
}

export function renameItem(catKey, subKey, oldName, newName) {
    if (oldName === newName) return;
    const targetArray = subKey ? editorData.inventory[catKey][subKey] : editorData.inventory[catKey];
    if (!Array.isArray(targetArray)) return;
    const idx = targetArray.indexOf(oldName);
    if (idx === -1) throw new Error('Позиция не найдена');
    if (targetArray.includes(newName)) throw new Error('Позиция уже существует');
    targetArray[idx] = newName;
    const oldPath = getStockKey(catKey, subKey, oldName);
    const newPath = getStockKey(catKey, subKey, newName);
    if (editorData.stock[oldPath] !== undefined) {
        editorData.stock[newPath] = editorData.stock[oldPath];
        delete editorData.stock[oldPath];
    }
    if (editorData.specs[oldPath] !== undefined) {
        editorData.specs[newPath] = editorData.specs[oldPath];
        delete editorData.specs[oldPath];
    }
    if (editorData.itemProps[oldPath] !== undefined) {
        editorData.itemProps[newPath] = editorData.itemProps[oldPath];
        delete editorData.itemProps[oldPath];
    }
    updateOrderPaths(oldPath, newPath);
    saveEditorData();
}

export function moveItem(catKey, subKey, itemName, targetCat, targetSub) {
    const sourceArray = subKey ? editorData.inventory[catKey][subKey] : editorData.inventory[catKey];
    if (!Array.isArray(sourceArray)) throw new Error('Источник не массив');
    const idx = sourceArray.indexOf(itemName);
    if (idx === -1) throw new Error('Позиция не найдена');
    sourceArray.splice(idx, 1);
    const targetArray = targetSub ? editorData.inventory[targetCat][targetSub] : editorData.inventory[targetCat];
    if (!Array.isArray(targetArray)) throw new Error('Цель не массив');
    if (targetArray.includes(itemName)) {
        sourceArray.splice(idx, 0, itemName);
        throw new Error('Цель уже содержит этот элемент');
    }
    targetArray.push(itemName);
    const oldPath = getStockKey(catKey, subKey, itemName);
    const newPath = getStockKey(targetCat, targetSub, itemName);
    if (editorData.stock[oldPath] !== undefined) {
        editorData.stock[newPath] = editorData.stock[oldPath];
        delete editorData.stock[oldPath];
    }
    if (editorData.specs[oldPath] !== undefined) {
        editorData.specs[newPath] = editorData.specs[oldPath];
        delete editorData.specs[oldPath];
    }
    if (editorData.itemProps[oldPath] !== undefined) {
        editorData.itemProps[newPath] = editorData.itemProps[oldPath];
        delete editorData.itemProps[oldPath];
    }
    updateOrderPaths(oldPath, newPath);
    saveEditorData();
}

export function initData() {
    loadEditorData();
}