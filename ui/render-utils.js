// ui/render-utils.js

/**
 * Вспомогательные функции для рендеринга UI.
 * Содержит утилиты для форматирования, цветовой индикации и построения HTML-блоков.
 * @module ui/render-utils
 */

import { esc } from '../core/utils.js';
import { CM3_TO_M3 } from '../core/config.js';
import { getItemPropsByPath } from '../services/itemProps.js';
import { getCaseMode, getOrderPacking, getIndividualCaseValues, getOrderExtra } from '../services/order.js';
import { getPackaging } from '../services/packaging.js';
import { getCommonCaseById } from '../services/commonCases.js';

// ============================================================
// ЦВЕТОВАЯ ИНДИКАЦИЯ (градиент зелёный → жёлтый → красный)
// ============================================================

/**
 * Возвращает цвет в зависимости от процента заполнения.
 * @param {number} percent - процент (0–100)
 * @returns {{ r: number, g: number, b: number }} компоненты RGB
 */
export function getColorByPercent(percent) {
  const p = Math.max(0, Math.min(100, percent));
  let r, g, b;
  if (p < 80) {
    const t = p / 80;
    r = Math.round(76 + (200 - 76) * t * 0.6);
    g = Math.round(175 + (235 - 175) * t);
    b = Math.round(76 + (0 - 76) * t * 0.2);
  } else if (p < 90) {
    const t = (p - 80) / 10;
    r = Math.round(200 + (255 - 200) * t);
    g = 235;
    b = 0;
  } else if (p < 100) {
    const t = (p - 90) / 10;
    r = 255;
    g = Math.round(235 + (165 - 235) * t);
    b = 0;
  } else {
    r = 244;
    g = 67;
    b = 54;
  }
  return {
    r: Math.min(255, Math.round(r)),
    g: Math.min(255, Math.round(g)),
    b: Math.min(255, Math.round(b)),
  };
}

/**
 * Возвращает CSS-цвет для процента заполнения.
 * @param {number} percent - процент (0–100)
 * @returns {string} CSS-цвет (rgb)
 */
export function getColorCSS(percent) {
  const { r, g, b } = getColorByPercent(percent);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Возвращает полупрозрачный фон для процента заполнения.
 * @param {number} percent - процент (0–100)
 * @param {number} [alpha=0.2] - прозрачность (0–1)
 * @returns {string} CSS-цвет (rgba)
 */
export function getBgColorCSS(percent, alpha = 0.2) {
  const { r, g, b } = getColorByPercent(percent);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

// ============================================================
// ФОРМАТИРОВАНИЕ
// ============================================================

/**
 * Форматирует вес в кг.
 * @param {number} weight - вес в кг
 * @param {number} [decimals=1] - количество знаков после запятой
 * @returns {string} отформатированная строка
 */
export function formatWeight(weight, decimals = 1) {
  if (!weight || weight <= 0) return '0 кг';
  return weight.toFixed(decimals) + ' кг';
}

/**
 * Форматирует объём в м³.
 * @param {number} volume - объём в м³
 * @param {number} [decimals=3] - количество знаков после запятой
 * @returns {string} отформатированная строка
 */
export function formatVolume(volume, decimals = 3) {
  if (!volume || volume <= 0) return '0 м³';
  return volume.toFixed(decimals) + ' м³';
}

/**
 * Форматирует габариты (если пусто — возвращает 'н/д').
 * @param {string} dimensions - строка габаритов
 * @returns {string}
 */
export function formatDimensions(dimensions) {
  return dimensions || 'н/д';
}

/**
 * Форматирует количество в штуках.
 * @param {number} qty - количество
 * @returns {string}
 */
export function formatQuantity(qty) {
  return (qty || 0) + ' шт';
}

// ============================================================
// ПОСТРОЕНИЕ HTML-БЛОКА ИНФОРМАЦИИ О ПОЗИЦИИ
// ============================================================

/**
 * Строит HTML для блока информации о позиции (используется в строке заказа).
 * @param {string} path - полный путь позиции
 * @param {Object} [props] - свойства позиции (если не переданы, будут получены)
 * @param {Object} [mode] - режим кофров (если не передан, будет получен)
 * @returns {string} HTML-строка
 */
export function buildInfoHtml(path, props, mode) {
  const actualProps = props || getItemPropsByPath(path);
  const actualMode = mode || getCaseMode(path);

  const packing = getOrderPacking(path);
  const individualVals = getIndividualCaseValues(path);
  const extra = getOrderExtra(path);
  const options = actualProps.individualCases || [];

  const isMulti = actualMode.enabled && options.length > 1 &&
                  actualMode.multiSelected && actualMode.multiSelected.some(v => v === true);

  let html = `<div style="display:flex;flex-wrap:wrap;gap:12px;font-size:13px;">`;

  // Вес 1 шт
  const weightPerUnit = actualProps.weight ? actualProps.weight + ' кг' : 'н/д';
  html += `<span><strong>Вес 1 шт:</strong> ${weightPerUnit}</span>`;

  // Габариты
  html += `<span><strong>Габариты:</strong> ${formatDimensions(actualProps.dimensions)}</span>`;

  // Объём 1 шт
  if (actualProps.volume) {
    html += `<span><strong>Объём 1 шт:</strong> ${formatVolume(actualProps.volume)}</span>`;
  }

  // Информация о кофрах
  if (packing.length > 0) {
    // Общие кофры
    html += `<div style="width:100%;"><strong>Общие кофры:</strong></div>`;
    for (const p of packing) {
      const caseObj = getCommonCaseById(p.caseId);
      const name = caseObj ? caseObj.name : 'удалённый кофр';
      html += `<div style="padding-left:12px;">• ${esc(name)}: ${p.pieces || 0} шт</div>`;
    }
    if (extra > 0) {
      html += `<div style="padding-left:12px;">• Вне кофра: ${extra} шт</div>`;
    }
  } else if (actualMode.enabled && isMulti && individualVals.length > 1) {
    // Мультикофры
    html += `<div style="width:100%;"><strong>Мультикофры:</strong></div>`;
    for (let i = 0; i < individualVals.length; i++) {
      const val = individualVals[i] || 0;
      if (val <= 0) continue;
      const opt = options[i] || options[0];
      const casesCount = Math.ceil(val / (opt.qty || 1));
      html += `<div style="padding-left:12px;">• Вариант ${i + 1}: ${val} шт (${casesCount} кофр${casesCount > 1 ? 'а' : ''}) — габ: ${formatDimensions(opt.dimensions)}, вес кофра: ${opt.weight || 0} кг</div>`;
    }
  } else if (actualMode.enabled && individualVals.length === 1 && !packing.length && !isMulti) {
    // Один кофр (с альтернативой)
    const opt = options[actualMode.selectedOption] || options[0];
    const val = individualVals[0] || 0;
    const casesCount = opt && opt.qty ? Math.ceil(val / opt.qty) : 0;
    html += `<div style="width:100%;"><strong>Кофр:</strong></div>`;
    if (opt && val > 0) {
      html += `<div style="padding-left:12px;">• Вариант ${(actualMode.selectedOption || 0) + 1}: ${val} шт (${casesCount} кофр${casesCount > 1 ? 'а' : ''}) — габ: ${formatDimensions(opt.dimensions)}, вес кофра: ${opt.weight || 0} кг</div>`;
    }
    if (actualMode.alt && actualMode.useAlt) {
      html += `<div style="padding-left:12px;">• Альтернативный: вместимость ${actualMode.alt.qty || 0} шт, габ: ${formatDimensions(actualMode.alt.dims)}, вес: ${actualMode.alt.weight || 0} кг</div>`;
    }
  }

  // Статус режимов кофров (кратко)
  html += `<div style="width:100%;"><strong>Статус кофров:</strong></div>`;
  html += `<div style="width:100%;padding-left:12px;">`;
  html += `<span>Режим: ${actualMode.enabled ? '✅ Вкл' : '❌ Выкл'}</span>`;
  if (packing.length > 0) {
    html += `<span style="margin-left:12px;">📦 Общие: ${packing.length} шт</span>`;
  }
  if (isMulti) {
    html += `<span style="margin-left:12px;">🔀 Мульти</span>`;
  }
  if (actualMode.alt && actualMode.useAlt) {
    html += `<span style="margin-left:12px;">🔄 Альт.</span>`;
  }
  html += `</div>`;

  html += `</div>`;
  return html;
}

// ============================================================
// ЭКСПОРТ ПО УМОЛЧАНИЮ
// ============================================================

export default {
  getColorByPercent,
  getColorCSS,
  getBgColorCSS,
  formatWeight,
  formatVolume,
  formatDimensions,
  formatQuantity,
  buildInfoHtml,
};