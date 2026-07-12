// data.js — Работа с данными (загрузка, сохранение, доступ)
import {
    CAT_NAMES,
    DEFAULT_INVENTORY,
    DEFAULT_STOCK,
    DEFAULT_SPECS,
    DEFAULT_PROPS,
    DEFAULT_COMMON_CASES,
    DEFAULT_CATEGORY_ORDER,
    DUPLICATE_VIDEO_GROUPS,
    STORAGE_KEYS
} from './config.js';

// ============================================================
// ГЛОБАЛЬНОЕ СОСТОЯНИЕ
// ============================================================
export let editorData = {};

// Кеш для расчётов (мемоизация) — пока не используется, но оставлю
const calculationCache = new Map();

// ============================================================
// ЗАГРУЗКА / СОХРАНЕНИЕ (единое хранилище)
// ============================================================
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
        console.warn('Ошибка загрузки данных, используем пустую структуру', e);
    }
    // Если нет сохранённых или ошибка — полностью пустая структура
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
        commonCases: []
    };
}

function normalizeAllData() {
    // 1. Удаляем дублирующиеся группы видео (оставляем только "Экран")
    if (editorData.inventory && editorData.inventory.video) {
        const video = editorData.inventory.video;
        // Удаляем группы из DUPLICATE_VIDEO_GROUPS (все, кроме "Экран")
        DUPLICATE_VIDEO_GROUPS.forEach(name => {
            if (video[name] !== undefined) {
                delete video[name];
                if (video._subOrder) {
                    const idx = video._subOrder.indexOf(name);
                    if (idx !== -1) video._subOrder.splice(idx, 1);
                }
            }
        });
        // Если "Экран" отсутствует, но есть другие группы – оставляем как есть
        if (video._subOrder) {
            video._subOrder = video._subOrder.filter(k => video[k] !== undefined);
        }
    }

    // 2. Приводим itemProps к корректному виду
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
        // Удаляем устаревшее поле caseOptions, если есть
        if (props.caseOptions !== undefined) delete props.caseOptions;
    }

    // 3. Категории с подгруппами: проверяем _subOrder
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

    // 4. Удаляем из stock, specs, itemProps ключи, которые не соответствуют существующим позициям
    // (очистка от мусора) — для простоты не делаем, так как это может удалить данные при импорте
}

export function saveEditorData() {
    localStorage.setItem(STORAGE_KEYS.APP_DATA, JSON.stringify(editorData));
    calculationCache.clear(); // сбрасываем кеш при сохранении
}

// ============================================================
// ПОЛНЫЙ СБРОС ДАННЫХ (для кнопки сброса)
// ============================================================
export function resetAllData() {
    resetToEmpty();
    saveEditorData();
    // Также очищаем данные заказа (если есть) — вызов из main.js
    // Но здесь только сброс редактора
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
        // Удаляем caseOptions
        if (newProps.caseOptions !== undefined) delete newProps.caseOptions;
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
}

export function renameCategory(oldName, newName) {
    if (oldName === newName) return;
    if (editorData.inventory[newName]) throw new Error('Категория с таким именем уже существует');
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
    saveEditorData();
}

export function renameSubgroup(catKey, oldSub, newSub) {
    if (oldSub === newSub) return;
    const catData = editorData.inventory[catKey];
    if (!catData || typeof catData !== 'object' || Array.isArray(catData)) return;
    if (catData[newSub]) throw new Error('Подгруппа с таким именем уже существует');
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
// КЕШИРОВАНИЕ (для оптимизации)
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
// ИНИЦИАЛИЗАЦИЯ
// ============================================================
export function initData() {
    loadEditorData();
}