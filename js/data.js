// data.js — Работа с данными (загрузка, сохранение, доступ)
// Версия с объединённым хранилищем и улучшенной нормализацией

import {
    CAT_NAMES,
    DEFAULT_INVENTORY,
    DEFAULT_STOCK,
    DEFAULT_SPECS,
    DEFAULT_PROPS,
    DEFAULT_COMMON_CASES,
    DEFAULT_CATEGORY_ORDER,
    DUPLICATE_VIDEO_GROUPS
} from './config.js';

// ============================================================
// ГЛОБАЛЬНОЕ СОСТОЯНИЕ
// ============================================================
export let editorData = {};

// Кеш для расчётов (мемоизация)
const calculationCache = new Map();

// ============================================================
// ЗАГРУЗКА / СОХРАНЕНИЕ (единое хранилище)
// ============================================================
const STORAGE_KEY = 'app_data';

export function loadEditorData() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            // Глубокое слияние с дефолтами
            editorData = mergeDefaults(parsed);
            normalizeAllData();
            return;
        }
    } catch (e) {
        console.warn('Ошибка загрузки данных, используем дефолтные', e);
    }
    // Если нет сохранённых или ошибка — берём дефолт
    resetToDefaults();
    saveEditorData();
}

function resetToDefaults() {
    editorData = {
        inventory: JSON.parse(JSON.stringify(DEFAULT_INVENTORY)),
        stock: JSON.parse(JSON.stringify(DEFAULT_STOCK)),
        specs: JSON.parse(JSON.stringify(DEFAULT_SPECS)),
        itemProps: JSON.parse(JSON.stringify(DEFAULT_PROPS)),
        catNames: JSON.parse(JSON.stringify(CAT_NAMES)),
        _categoryOrder: JSON.parse(JSON.stringify(DEFAULT_CATEGORY_ORDER)),
        commonCases: JSON.parse(JSON.stringify(DEFAULT_COMMON_CASES))
    };
    // Добавляем _subOrder для категорий с объектами
    for (let cat in editorData.inventory) {
        const catData = editorData.inventory[cat];
        if (typeof catData === 'object' && !Array.isArray(catData)) {
            if (!catData._subOrder) {
                catData._subOrder = Object.keys(catData).filter(k => k !== '_subOrder');
            }
        }
    }
}

function mergeDefaults(parsed) {
    const result = {
        inventory: { ...DEFAULT_INVENTORY, ...parsed.inventory },
        stock: { ...DEFAULT_STOCK, ...parsed.stock },
        specs: { ...DEFAULT_SPECS, ...parsed.specs },
        itemProps: { ...DEFAULT_PROPS, ...parsed.itemProps },
        catNames: { ...CAT_NAMES, ...parsed.catNames },
        _categoryOrder: parsed._categoryOrder || DEFAULT_CATEGORY_ORDER,
        commonCases: parsed.commonCases || DEFAULT_COMMON_CASES
    };
    // Дополнительная очистка
    if (result.itemProps) {
        for (let key in result.itemProps) {
            const props = result.itemProps[key];
            if (props.individualCases === undefined) props.individualCases = [];
            if (!Array.isArray(props.individualCases)) props.individualCases = [];
            if (props.allowCommon === undefined) props.allowCommon = false;
            if (props.commonCases === undefined) props.commonCases = [];
            if (!Array.isArray(props.commonCases)) props.commonCases = [];
            props.individualCases = props.individualCases.map(c => {
                if (c.maxCases === undefined) c.maxCases = 0;
                return c;
            });
        }
    }
    return result;
}

function normalizeAllData() {
    // Удаляем дубли видео-групп
    cleanupInventory(editorData.inventory, editorData.stock, editorData.specs, editorData.itemProps);
    // Приводим _subOrder к валидному виду
    for (let cat in editorData.inventory) {
        const catData = editorData.inventory[cat];
        if (typeof catData === 'object' && !Array.isArray(catData)) {
            if (!catData._subOrder) {
                catData._subOrder = Object.keys(catData).filter(k => k !== '_subOrder');
            } else {
                // Удаляем несуществующие ключи
                catData._subOrder = catData._subOrder.filter(k => catData[k] !== undefined);
                // Добавляем отсутствующие
                Object.keys(catData).forEach(k => {
                    if (k !== '_subOrder' && !catData._subOrder.includes(k)) {
                        catData._subOrder.push(k);
                    }
                });
            }
        }
    }
    // Чистим itemProps от мусора
    for (let key in editorData.itemProps) {
        const props = editorData.itemProps[key];
        if (props.individualCases && !Array.isArray(props.individualCases)) {
            props.individualCases = [];
        }
        if (props.commonCases && !Array.isArray(props.commonCases)) {
            props.commonCases = [];
        }
        if (props.allowCommon === undefined) props.allowCommon = false;
        // Конвертация старых полей
        if (props.case_qty !== undefined) {
            // уже обработано в mergeDefaults
        }
    }
}

export function saveEditorData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(editorData));
    calculationCache.clear(); // сбрасываем кеш при сохранении
}

// ============================================================
// ОЧИСТКА ОТ ДУБЛЕЙ (ЭКРАНЫ/КАБИНЕТЫ)
// ============================================================
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
            inventory.video = { "Телевизоры": ["Телевизор 55\"", "Телевизор 65\"", "Телевизор 75\""] };
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

// ============================================================
// КОНВЕРТАЦИЯ СТАРЫХ ДАННЫХ (для импорта)
// ============================================================
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
        converted[key] = newProps;
    }
    return converted;
}

// ============================================================
// ДОСТУП К ДАННЫМ (геттеры/сеттеры)
// ============================================================
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
    const key = getStockKey(catKey, subKey, itemName);
    return editorData.itemProps[key] || {};
}

export function setItemProps(catKey, subKey, itemName, props) {
    const key = getStockKey(catKey, subKey, itemName);
    if (props && Object.keys(props).length > 0) editorData.itemProps[key] = props;
    else delete editorData.itemProps[key];
    saveEditorData();
}

// ============================================================
// ФУНКЦИИ ДЛЯ БЕЗОПАСНОГО ПЕРЕИМЕНОВАНИЯ / ПЕРЕМЕЩЕНИЯ
// ============================================================
function updateAllKeys(oldPath, newPath) {
    // Обновление stock
    if (editorData.stock[oldPath] !== undefined) {
        editorData.stock[newPath] = editorData.stock[oldPath];
        delete editorData.stock[oldPath];
    }
    // specs
    if (editorData.specs[oldPath] !== undefined) {
        editorData.specs[newPath] = editorData.specs[oldPath];
        delete editorData.specs[oldPath];
    }
    // itemProps
    if (editorData.itemProps[oldPath] !== undefined) {
        editorData.itemProps[newPath] = editorData.itemProps[oldPath];
        delete editorData.itemProps[oldPath];
    }
    // Также нужно обновить ссылки в order и других местах? Это делается в order.js отдельно.
}

export function renameCategory(oldName, newName) {
    if (oldName === newName) return;
    if (editorData.inventory[newName]) throw new Error('Категория с таким именем уже существует');
    editorData.inventory[newName] = editorData.inventory[oldName];
    delete editorData.inventory[oldName];
    // Обновляем _categoryOrder
    const idx = editorData._categoryOrder.indexOf(oldName);
    if (idx !== -1) editorData._categoryOrder[idx] = newName;
    // Обновляем catNames
    if (editorData.catNames[oldName]) {
        editorData.catNames[newName] = editorData.catNames[oldName];
        delete editorData.catNames[oldName];
    }
    // Обновляем все ключи в stock, specs, itemProps
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
    saveEditorData();
}

export function renameSubgroup(catKey, oldSub, newSub) {
    if (oldSub === newSub) return;
    const catData = editorData.inventory[catKey];
    if (!catData || typeof catData !== 'object' || Array.isArray(catData)) return;
    if (catData[newSub]) throw new Error('Подгруппа с таким именем уже существует');
    catData[newSub] = catData[oldSub];
    delete catData[oldSub];
    // Обновляем _subOrder
    const order = catData._subOrder;
    if (order) {
        const idx = order.indexOf(oldSub);
        if (idx !== -1) order[idx] = newSub;
    }
    // Обновляем пути
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
    saveEditorData();
}

export function renameItem(catKey, subKey, oldName, newName) {
    if (oldName === newName) return;
    const targetArray = subKey ? editorData.inventory[catKey][subKey] : editorData.inventory[catKey];
    if (!Array.isArray(targetArray)) return;
    const idx = targetArray.indexOf(oldName);
    if (idx === -1) throw new Error('Позиция не найдена');
    if (targetArray.includes(newName)) throw new Error('Позиция с таким именем уже существует');
    targetArray[idx] = newName;
    const oldPath = getStockKey(catKey, subKey, oldName);
    const newPath = getStockKey(catKey, subKey, newName);
    updateAllKeys(oldPath, newPath);
    saveEditorData();
}

export function moveItem(catKey, subKey, itemName, targetCat, targetSub) {
    // Удаляем из источника
    const sourceArray = subKey ? editorData.inventory[catKey][subKey] : editorData.inventory[catKey];
    if (!Array.isArray(sourceArray)) throw new Error('Источник не массив');
    const idx = sourceArray.indexOf(itemName);
    if (idx === -1) throw new Error('Позиция не найдена');
    sourceArray.splice(idx, 1);

    // Добавляем в цель
    const targetArray = targetSub ? editorData.inventory[targetCat][targetSub] : editorData.inventory[targetCat];
    if (!Array.isArray(targetArray)) throw new Error('Цель не массив');
    if (targetArray.includes(itemName)) {
        // Откат
        sourceArray.splice(idx, 0, itemName);
        throw new Error('Цель уже содержит этот элемент');
    }
    targetArray.push(itemName);

    // Обновляем ключи
    const oldPath = getStockKey(catKey, subKey, itemName);
    const newPath = getStockKey(targetCat, targetSub, itemName);
    updateAllKeys(oldPath, newPath);
    saveEditorData();
}

// ============================================================
// РАБОТА С ОБЩИМИ КОФРАМИ
// ============================================================
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
    // Удаляем ссылки из itemProps
    for (let key in editorData.itemProps) {
        const props = editorData.itemProps[key];
        if (props.commonCases) {
            props.commonCases = props.commonCases.filter(opt => opt.caseId !== id);
            if (props.commonCases.length === 0) delete props.commonCases;
        }
    }
    saveEditorData();
}

// ============================================================
// КЕШИРОВАНИЕ РАСЧЁТОВ (для оптимизации)
// ============================================================
export function getCachedCalculation(key) {
    return calculationCache.get(key);
}

export function setCachedCalculation(key, value) {
    calculationCache.set(key, value);
}

export function clearCache() {
    calculationCache.clear();
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ (вызывается из main.js)
// ============================================================
export function initData() {
    loadEditorData();
}