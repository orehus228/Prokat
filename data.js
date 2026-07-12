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

export let editorData = null;
export let editorCurrentCategory = 'sound';

export function cleanupInventory(inventory, stock, specs, itemProps) {
    if (!inventory || !inventory.video) return inventory;
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
    return inventory;
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
                    cases.push({ qty: q, dimensions: d, weight: w });
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

export function loadEditorData() {
    const saved = localStorage.getItem('inventoryEditorData');
    if (saved) {
        try {
            editorData = JSON.parse(saved);
            if (!editorData.inventory) editorData.inventory = JSON.parse(JSON.stringify(DEFAULT_INVENTORY));
            if (!editorData.stock) editorData.stock = JSON.parse(JSON.stringify(DEFAULT_STOCK));
            if (!editorData.specs) editorData.specs = JSON.parse(JSON.stringify(DEFAULT_SPECS));
            if (!editorData.itemProps) editorData.itemProps = JSON.parse(JSON.stringify(DEFAULT_PROPS));
            if (!editorData.catNames) editorData.catNames = JSON.parse(JSON.stringify(CAT_NAMES));
            if (!editorData._categoryOrder) editorData._categoryOrder = JSON.parse(JSON.stringify(DEFAULT_CATEGORY_ORDER));
            if (!editorData.commonCases) editorData.commonCases = JSON.parse(JSON.stringify(DEFAULT_COMMON_CASES));
            cleanupInventory(editorData.inventory, editorData.stock, editorData.specs, editorData.itemProps);
            for (let cat in editorData.inventory) {
                const catData = editorData.inventory[cat];
                if (typeof catData === 'object' && !Array.isArray(catData)) {
                    if (!catData._subOrder) catData._subOrder = Object.keys(catData).filter(k => k !== '_subOrder');
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
                delete props.case_qty;
                delete props.case_dimensions;
                delete props.case_weight;
            }
            return;
        } catch(e) {
            console.warn('Ошибка загрузки данных, используем дефолтные', e);
        }
    }
    editorData = {
        inventory: JSON.parse(JSON.stringify(DEFAULT_INVENTORY)),
        stock: JSON.parse(JSON.stringify(DEFAULT_STOCK)),
        specs: JSON.parse(JSON.stringify(DEFAULT_SPECS)),
        itemProps: JSON.parse(JSON.stringify(DEFAULT_PROPS)),
        catNames: JSON.parse(JSON.stringify(CAT_NAMES)),
        _categoryOrder: JSON.parse(JSON.stringify(DEFAULT_CATEGORY_ORDER)),
        commonCases: JSON.parse(JSON.stringify(DEFAULT_COMMON_CASES))
    };
    cleanupInventory(editorData.inventory, editorData.stock, editorData.specs, editorData.itemProps);
    for (let cat in editorData.inventory) {
        const catData = editorData.inventory[cat];
        if (typeof catData === 'object' && !Array.isArray(catData)) {
            catData._subOrder = Object.keys(catData).filter(k => k !== '_subOrder');
        }
    }
    saveEditorData();
}

export function saveEditorData() {
    localStorage.setItem('inventoryEditorData', JSON.stringify(editorData));
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
    const key = getStockKey(catKey, subKey, itemName);
    return editorData.itemProps[key] || {};
}

export function setItemProps(catKey, subKey, itemName, props) {
    const key = getStockKey(catKey, subKey, itemName);
    if (props && Object.keys(props).length > 0) editorData.itemProps[key] = props;
    else delete editorData.itemProps[key];
    saveEditorData();
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

export function setCurrentCategory(cat) {
    editorCurrentCategory = cat;
}

export function initData() {
    loadEditorData();
    if (editorData._categoryOrder && editorData._categoryOrder.length > 0) {
        editorCurrentCategory = editorData._categoryOrder[0];
    } else {
        editorCurrentCategory = 'sound';
    }
}