// modules/cases/matrix.js — Матрица привязок (рендеринг, пресеты, редактирование)
import {
    editorData,
    saveEditorData
} from '../../data.js';

import {
    esc,
    showToast,
    showPrompt,
    showConfirm
} from '../../ui.js';

import { CAT_NAMES, STORAGE_KEYS } from '../../config.js';
import {
    links,
    saveOrderData
} from '../../order.js';

// Исправлено: импорт из order-helpers.js
import { updateLinkCountOrder } from '../../order-helpers.js';

// ============================================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ДЛЯ МАТРИЦЫ
// ============================================================
let matrixZoomLevel = 1;
let openCategories = [];
let scrollToPath = null;
let matrixFullNames = true;

const MATRIX_PRESETS_KEY = STORAGE_KEYS.MATRIX_PRESETS || 'matrix_presets';
const MATRIX_FULLNAMES_KEY = 'matrix_full_names';

// ============================================================
// ЗАГРУЗКА/СОХРАНЕНИЕ СОСТОЯНИЯ
// ============================================================
function loadMatrixFullNames() {
    try {
        const val = localStorage.getItem(MATRIX_FULLNAMES_KEY);
        if (val !== null) {
            matrixFullNames = val === 'true';
        }
    } catch (e) {
        matrixFullNames = true;
    }
}
loadMatrixFullNames();

function saveMatrixFullNames() {
    localStorage.setItem(MATRIX_FULLNAMES_KEY, String(matrixFullNames));
}

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================
function getAllItemPaths() {
    const res = [];
    function traverse(obj, path) {
        if (Array.isArray(obj)) {
            obj.forEach(item => res.push(path.length ? path.join('|') + '|' + item : item));
        } else if (typeof obj === 'object' && obj !== null) {
            for (let key in obj) {
                if (key.startsWith('_')) continue;
                traverse(obj[key], [...path, key]);
            }
        }
    }
    traverse(editorData.inventory, []);
    return res;
}

function truncateName(name, maxLen = 10) {
    if (name.length <= maxLen) return name;
    const parts = name.split(' ');
    if (parts.length <= 2) {
        return name.substring(0, maxLen-3) + '...';
    }
    const first = parts[0];
    const last = parts[parts.length-1];
    return first + ' ... ' + last;
}

// ============================================================
// РЕНДЕРИНГ МАТРИЦЫ
// ============================================================
function renderMatrix() {
    const container = document.getElementById('matrixContainer');
    if (!container) return;
    const allPaths = getAllItemPaths();
    if (allPaths.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);">Нет позиций</p>';
        return;
    }
    const srcFilter = document.getElementById('matrixSearchSource')?.value?.toLowerCase() || '';
    const tgtFilter = document.getElementById('matrixSearchTarget')?.value?.toLowerCase() || '';

    const catMap = {};
    allPaths.forEach(p => {
        const parts = p.split('|');
        const cat = parts[0];
        if (!catMap[cat]) catMap[cat] = [];
        catMap[cat].push({ full: p, name: parts[parts.length-1] });
    });

    let allTargets = [];
    allPaths.forEach(p => {
        const parts = p.split('|');
        allTargets.push({ full: p, name: parts[parts.length-1], cat: parts[0] });
    });
    const unique = [];
    const seen = new Set();
    allTargets.forEach(t => { if (!seen.has(t.full)) { seen.add(t.full); unique.push(t); } });
    allTargets = unique;
    if (tgtFilter) allTargets = allTargets.filter(t => t.name.toLowerCase().includes(tgtFilter));

    const baseColWidth = 90;
    const baseFontSize = 13;
    const basePadding = 4;
    const baseHeight = 32;

    const colWidth = Math.round(baseColWidth * matrixZoomLevel);
    const fontSize = baseFontSize * matrixZoomLevel;
    const padding = Math.round(basePadding * matrixZoomLevel);
    const height = Math.round(baseHeight * matrixZoomLevel);
    const sourceWidth = matrixFullNames ? 250 : 120;

    let html = `<div class="matrix-table-wrapper"><table class="matrix-table" style="font-size:${fontSize}px; table-layout:fixed; width:100%;">`;
    html += `<thead><tr><th class="matrix-header" style="width:${sourceWidth}px; min-width:${sourceWidth}px; max-width:${sourceWidth}px; padding:${padding}px; height:${height}px; font-size:${fontSize}px; position:sticky; left:0; z-index:25;">Источник \\ Цель</th>`;
    allTargets.forEach(target => {
        const displayName = matrixFullNames ? target.name : truncateName(target.name);
        html += `<th class="matrix-header" style="width:${colWidth}px; min-width:${colWidth}px; max-width:${colWidth}px; padding:${padding}px; height:${height}px; font-size:${fontSize}px;" title="${esc(target.name)}">${displayName}</th>`;
    });
    html += '</tr></thead><tbody>';

    const orderKeys = editorData._categoryOrder || Object.keys(editorData.inventory);
    orderKeys.forEach(cat => {
        const items = catMap[cat] || [];
        let filtered = items;
        if (srcFilter) filtered = items.filter(item => item.name.toLowerCase().includes(srcFilter));
        if (filtered.length === 0) return;

        const catId = 'cat_' + cat + '_' + Date.now();
        const isOpen = openCategories.includes(cat);
        const toggleIcon = isOpen ? '▼' : '▶';
        html += `<tr class="matrix-category" onclick="window.toggleMatrixCategory('${catId}', '${cat}')">`;
        html += `<td class="matrix-cell matrix-category-toggle" style="width:${sourceWidth}px; min-width:${sourceWidth}px; max-width:${sourceWidth}px; padding:${padding}px; height:${height}px; font-size:${fontSize}px; position:sticky; left:0; z-index:20; background:var(--bg-secondary); border:1px solid var(--matrix-border); text-align:center; cursor:pointer;">`;
        html += `<span class="toggle" id="toggle_${catId}">${toggleIcon}</span>`;
        html += `</td>`;
        html += `<td colspan="${allTargets.length}" style="text-align:left;padding:${padding}px 10px;background:var(--bg-secondary);border:1px solid var(--border-color);font-size:${fontSize}px;cursor:pointer;">`;
        html += `${CAT_NAMES[cat]||cat} (${filtered.length})`;
        html += `</td>`;
        html += `</tr>`;

        html += `<tbody id="${catId}" class="matrix-category-items" style="display:${isOpen ? 'table-row-group' : 'none'};">`;
        filtered.forEach((source, idx) => {
            const rowClass = idx % 2 === 0 ? 'row-even' : 'row-odd';
            const rowId = (scrollToPath && source.full === scrollToPath) ? 'id="matrix-scroll-target"' : '';
            html += `<tr class="${rowClass}" ${rowId}>`;
            const sourceDisplay = matrixFullNames ? source.name : truncateName(source.name);
            html += `<td class="matrix-cell matrix-source" style="width:${sourceWidth}px; min-width:${sourceWidth}px; max-width:${sourceWidth}px; padding:${padding}px; height:${height}px; overflow:hidden; text-overflow:ellipsis; font-size:${fontSize}px; position:sticky; left:0; z-index:15; background:${idx % 2 === 0 ? 'var(--matrix-row-even)' : 'var(--matrix-row-odd)'};" title="${esc(source.name)}">${sourceDisplay}</td>`;
            allTargets.forEach(target => {
                if (source.full === target.full) {
                    html += `<td class="matrix-cell matrix-diagonal" style="width:${colWidth}px; min-width:${colWidth}px; max-width:${colWidth}px; padding:${padding}px; height:${height}px; font-size:${fontSize}px;">—</td>`;
                } else {
                    const allLinks = [];
                    for (let src in links) {
                        const lnk = links[src].find(l => l.target === target.full);
                        if (lnk) {
                            allLinks.push({ source: src, multiplier: lnk.multiplier });
                        }
                    }
                    const currentLinks = allLinks.filter(l => l.source === source.full);
                    const totalMultiplier = currentLinks.reduce((sum, l) => sum + l.multiplier, 0);

                    if (totalMultiplier > 0) {
                        let cellContent = `<span class="matrix-value" style="font-size:${fontSize}px;">${totalMultiplier.toFixed(2)}</span>`;
                        html += `<td class="matrix-cell matrix-value-cell" style="width:${colWidth}px; min-width:${colWidth}px; max-width:${colWidth}px; padding:${padding}px; height:${height}px; overflow:hidden; text-overflow:ellipsis; font-size:${fontSize}px;" data-src="${source.full}" data-target="${target.full}" onclick="window.editMatrixCell(this,'${source.full}','${target.full}')">${cellContent}</td>`;
                    } else {
                        html += `<td class="matrix-cell matrix-empty" style="width:${colWidth}px; min-width:${colWidth}px; max-width:${colWidth}px; padding:${padding}px; height:${height}px; font-size:${fontSize}px;" data-src="${source.full}" data-target="${target.full}" onclick="window.editMatrixCell(this,'${source.full}','${target.full}')">+</td>`;
                    }
                }
            });
            html += '</tr>';
        });
        html += '</tbody>';
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;

    const zoomControls = document.querySelector('.matrix-zoom-controls');
    if (zoomControls && !document.getElementById('matrixNameToggle')) {
        const toggleDiv = document.createElement('div');
        toggleDiv.className = 'matrix-name-toggle';
        toggleDiv.id = 'matrixNameToggle';
        toggleDiv.innerHTML = `
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                <input type="checkbox" ${matrixFullNames ? 'checked' : ''}> Полные названия
            </label>
        `;
        toggleDiv.querySelector('input').addEventListener('change', function() {
            matrixFullNames = this.checked;
            saveMatrixFullNames();
            renderMatrix();
        });
        zoomControls.after(toggleDiv);
    } else {
        const toggleInput = document.querySelector('#matrixNameToggle input');
        if (toggleInput) toggleInput.checked = matrixFullNames;
    }

    if (scrollToPath) {
        setTimeout(() => {
            const targetRow = document.getElementById('matrix-scroll-target');
            if (targetRow) {
                targetRow.scrollIntoView({ block: 'center', behavior: 'smooth' });
                targetRow.style.background = 'var(--bg-active)';
                setTimeout(() => {
                    targetRow.style.background = '';
                }, 2000);
                scrollToPath = null;
            }
        }, 100);
    }
}

function applyMatrixZoom() {
    document.querySelectorAll('.zoom-btn').forEach(btn => {
        btn.classList.toggle('active', parseFloat(btn.dataset.zoom) === matrixZoomLevel);
    });
    const label = document.getElementById('matrixZoomLevelLabel');
    if (label) label.textContent = Math.round(matrixZoomLevel * 100) + '%';
    renderMatrix();
}

function setupZoomButtons() {
    document.querySelectorAll('.zoom-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const zoom = parseFloat(this.dataset.zoom);
            if (!isNaN(zoom) && zoom !== matrixZoomLevel) {
                matrixZoomLevel = zoom;
                applyMatrixZoom();
            }
        });
    });
}

// ============================================================
// ПРЕСЕТЫ МАТРИЦЫ
// ============================================================
function getMatrixPresets() {
    try {
        const raw = localStorage.getItem(MATRIX_PRESETS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function saveMatrixPresets(presets) {
    localStorage.setItem(MATRIX_PRESETS_KEY, JSON.stringify(presets));
}

function populateMatrixPresetSelect() {
    const select = document.getElementById('matrixPresetSelect');
    if (!select) return;
    const presets = getMatrixPresets();
    select.innerHTML = '<option value="">— Выберите пресет —</option>';
    presets.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        select.appendChild(opt);
    });
}

async function saveMatrixPreset() {
    const name = await showPrompt('Сохранить пресет матрицы', 'Введите имя пресета:', '', '');
    if (!name || !name.trim()) return;
    const presets = getMatrixPresets();
    const existing = presets.find(p => p.name === name.trim());
    if (existing) {
        const overwrite = await showConfirm(`Пресет "${name.trim()}" уже существует. Перезаписать?`);
        if (!overwrite) return;
        const idx = presets.indexOf(existing);
        presets.splice(idx, 1);
    }
    const snapshot = {};
    for (let src in links) {
        snapshot[src] = links[src].map(l => ({ ...l }));
    }
    presets.push({ name: name.trim(), links: snapshot });
    saveMatrixPresets(presets);
    populateMatrixPresetSelect();
    showToast('Пресет сохранён', 'success');
}

async function loadMatrixPreset(overlay = true) {
    const select = document.getElementById('matrixPresetSelect');
    const name = select.value;
    if (!name) {
        showToast('Выберите пресет', 'warning');
        return;
    }
    const presets = getMatrixPresets();
    const preset = presets.find(p => p.name === name);
    if (!preset) {
        showToast('Пресет не найден', 'error');
        return;
    }
    if (!overlay) {
        for (let key in links) delete links[key];
    }
    for (let src in preset.links) {
        preset.links[src].forEach(pl => {
            if (!links[src]) links[src] = [];
            const existing = links[src].find(l => l.target === pl.target);
            if (existing) {
                existing.multiplier += pl.multiplier;
            } else {
                links[src].push({ target: pl.target, multiplier: pl.multiplier });
            }
        });
    }
    saveOrderData();
    renderMatrix();
    updateLinkCountOrder();
    showToast(`Пресет "${name}" загружен ${overlay ? '(наложение)' : '(замена)'}`, 'success');
}

async function deleteMatrixPreset() {
    const select = document.getElementById('matrixPresetSelect');
    const name = select.value;
    if (!name) {
        showToast('Выберите пресет', 'warning');
        return;
    }
    const confirmed = await showConfirm(`Удалить пресет "${name}"?`);
    if (!confirmed) return;
    let presets = getMatrixPresets();
    presets = presets.filter(p => p.name !== name);
    saveMatrixPresets(presets);
    populateMatrixPresetSelect();
    showToast('Пресет удалён', 'neutral');
}

function exportMatrixPresets() {
    const presets = getMatrixPresets();
    if (presets.length === 0) {
        showToast('Нет пресетов для экспорта', 'warning');
        return;
    }
    const blob = new Blob([JSON.stringify(presets, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'matrix_presets.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Пресеты экспортированы', 'success');
}

function importMatrixPresets(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (!Array.isArray(data)) throw new Error('Неверный формат: ожидается массив');
            data.forEach(p => {
                if (!p.name || typeof p.name !== 'string') throw new Error('У пресета отсутствует имя');
                if (!p.links || typeof p.links !== 'object') throw new Error('У пресета отсутствуют привязки');
            });
            let presets = getMatrixPresets();
            data.forEach(newP => {
                const idx = presets.findIndex(p => p.name === newP.name);
                if (idx !== -1) presets[idx] = newP;
                else presets.push(newP);
            });
            saveMatrixPresets(presets);
            populateMatrixPresetSelect();
            showToast('Пресеты импортированы', 'success');
        } catch(err) {
            showToast('Ошибка импорта: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
}

// ============================================================
// ОСНОВНАЯ ФУНКЦИЯ ОТКРЫТИЯ МАТРИЦЫ
// ============================================================
export function openMatrixModal(sourcePath, showPresets = true, category = null) {
    const modal = document.getElementById('matrixModal');
    if (!modal) {
        showToast('Матрица привязок не найдена', 'error');
        return;
    }

    const srcInput = document.getElementById('matrixSearchSource');
    const tgtInput = document.getElementById('matrixSearchTarget');
    if (!srcInput || !tgtInput) {
        showToast('Ошибка: элементы фильтров матрицы не найдены в DOM', 'error');
        return;
    }

    if (sourcePath) {
        srcInput.value = sourcePath.split('|').pop();
        scrollToPath = sourcePath;
        const catName = category || (sourcePath.split('|')[0]);
        if (catName && !openCategories.includes(catName)) {
            openCategories.push(catName);
        }
    } else {
        srcInput.value = '';
        scrollToPath = null;
        if (category && !openCategories.includes(category)) {
            openCategories.push(category);
        }
    }
    tgtInput.value = '';
    matrixZoomLevel = 1;
    applyMatrixZoom();
    renderMatrix();
    populateMatrixPresetSelect();
    const panel = document.getElementById('matrixPresetPanel');
    if (panel) panel.style.display = showPresets ? 'flex' : 'none';
    modal.classList.add('open');
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ ОБРАБОТЧИКОВ МАТРИЦЫ
// ============================================================
export function initMatrixHandlers() {
    const closeBtn = document.getElementById('matrixClose');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.getElementById('matrixModal').classList.remove('open');
            openCategories = [];
            scrollToPath = null;
        });
    }
    const clearBtn = document.getElementById('matrixClearAll');
    if (clearBtn) {
        clearBtn.addEventListener('click', async () => {
            const confirmed = await showConfirm('Удалить все привязки?');
            if (!confirmed) return;
            for (let key in links) delete links[key];
            saveOrderData();
            renderMatrix();
            updateLinkCountOrder();
            showToast('Все привязки удалены', 'neutral');
        });
    }
    const srcInput = document.getElementById('matrixSearchSource');
    if (srcInput) srcInput.addEventListener('input', renderMatrix);
    const tgtInput = document.getElementById('matrixSearchTarget');
    if (tgtInput) tgtInput.addEventListener('input', renderMatrix);

    setupZoomButtons();

    const savePresetBtn = document.getElementById('matrixSavePreset');
    if (savePresetBtn) savePresetBtn.addEventListener('click', saveMatrixPreset);

    const loadPresetBtn = document.getElementById('matrixLoadPreset');
    if (loadPresetBtn) {
        loadPresetBtn.addEventListener('click', async () => {
            const overlay = document.getElementById('matrixOverlayToggle')?.checked || false;
            await loadMatrixPreset(overlay);
        });
    }

    const deletePresetBtn = document.getElementById('matrixDeletePreset');
    if (deletePresetBtn) deletePresetBtn.addEventListener('click', deleteMatrixPreset);

    const exportPresetsBtn = document.getElementById('matrixExportPresets');
    if (exportPresetsBtn) exportPresetsBtn.addEventListener('click', exportMatrixPresets);

    const importPresetsBtn = document.getElementById('matrixImportPresets');
    const fileInput = document.getElementById('matrixPresetFileInput');
    if (importPresetsBtn && fileInput) {
        importPresetsBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', function(e) {
            if (this.files[0]) {
                importMatrixPresets(this.files[0]);
                this.value = '';
            }
        });
    }

    const modal = document.getElementById('matrixModal');
    if (modal) {
        const observer = new MutationObserver(() => {
            if (modal.classList.contains('open')) {
                populateMatrixPresetSelect();
            }
        });
        observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
    }
}

// ============================================================
// ГЛОБАЛЬНЫЕ ФУНКЦИИ ДЛЯ ОБРАБОТКИ СОБЫТИЙ (через window)
// ============================================================
window.toggleMatrixCategory = function(catId, catName) {
    const tbody = document.getElementById(catId);
    const toggle = document.getElementById('toggle_' + catId);
    if (!tbody || !toggle) return;
    const isOpen = tbody.style.display !== 'none';
    if (isOpen) {
        tbody.style.display = 'none';
        toggle.textContent = '▶';
        const idx = openCategories.indexOf(catName);
        if (idx !== -1) openCategories.splice(idx, 1);
    } else {
        tbody.style.display = 'table-row-group';
        toggle.textContent = '▼';
        if (!openCategories.includes(catName)) {
            openCategories.push(catName);
        }
    }
};

window.editMatrixCell = async function(td, src, target) {
    const existing = links[src] ? links[src].find(l => l.target === target) : null;
    const currentVal = existing ? existing.multiplier : '';
    const val = await showPrompt(
        currentVal !== '' ? 'Изменить множитель' : 'Введите множитель',
        'Множитель (0 для удаления):',
        currentVal !== '' ? currentVal : '1'
    );
    if (val === null) return;
    const num = parseFloat(val);
    if (isNaN(num) || num === 0) {
        if (links[src]) {
            links[src] = links[src].filter(l => l.target !== target);
            if (links[src].length === 0) delete links[src];
        }
    } else {
        if (!links[src]) links[src] = [];
        const existingLink = links[src].find(l => l.target === target);
        if (existingLink) existingLink.multiplier = num;
        else links[src].push({ target, multiplier: num });
    }
    saveOrderData();
    renderMatrix();
    updateLinkCountOrder();
    showToast('Привязка обновлена', 'success');
};