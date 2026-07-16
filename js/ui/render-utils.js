// ui/render-utils.js
import { esc } from './dom.js';
import { getItemPropsByPath, getCaseMode, getCaseOptions, getSelectedOption } from '../services/calculations.js';
import { getOrderPacking, getIndividualCaseValues, getOrderExtra } from '../services/order-data.js';
import { getCommonCases } from '../data/editor-data.js';

// ============================================================
// ЦВЕТОВАЯ ИНДИКАЦИЯ (градиент зелёный → жёлтый → красный)
// ============================================================

/**
 * Возвращает цвет в зависимости от процента заполнения.
 * @param {number} percent - процент (0–100)
 * @returns {object} { r, g, b } — компоненты RGB
 */
export function getColorByPercent(percent) {
  let r, g, b;
  if (percent < 80) {
    const t = percent / 80;
    r = Math.round(76 + (200 - 76) * t * 0.6);
    g = Math.round(175 + (235 - 175) * t);
    b = Math.round(76 + (0 - 76) * t * 0.2);
  } else if (percent < 90) {
    const t = (percent - 80) / 10;
    r = Math.round(200 + (255 - 200) * t);
    g = Math.round(235 + (235 - 235) * t);
    b = Math.round(0 + (0 - 0) * t);
  } else if (percent < 100) {
    const t = (percent - 90) / 10;
    r = 255;
    g = Math.round(235 + (165 - 235) * t);
    b = Math.round(0 + (0 - 0) * t);
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
 * @param {number} alpha - прозрачность (0–1), по умолчанию 0.2
 * @returns {string} CSS-цвет (rgba)
 */
export function getBgColorCSS(percent, alpha = 0.2) {
  const { r, g, b } = getColorByPercent(percent);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ============================================================
// ФОРМАТИРОВАНИЕ ГАБАРИТОВ И ОБЪЁМА
// ============================================================

/**
 * Преобразует строку габаритов в читаемый формат.
 * @param {string} dimensions - строка вида "120x80x60"
 * @returns {string} отформатированная строка
 */
export function formatDimensions(dimensions) {
  if (!dimensions) return 'н/д';
  return dimensions;
}

/**
 * Форматирует объём в м³.
 * @param {number} volume - объём в м³
 * @param {number} decimals - количество знаков после запятой
 * @returns {string} отформатированная строка
 */
export function formatVolume(volume, decimals = 3) {
  if (!volume || volume <= 0) return '0 м³';
  return volume.toFixed(decimals) + ' м³';
}

/**
 * Форматирует вес в кг.
 * @param {number} weight - вес в кг
 * @param {number} decimals - количество знаков после запятой
 * @returns {string} отформатированная строка
 */
export function formatWeight(weight, decimals = 1) {
  if (!weight || weight <= 0) return '0 кг';
  return weight.toFixed(decimals) + ' кг';
}

// ============================================================
// ПОСТРОЕНИЕ HTML-БЛОКА ИНФОРМАЦИИ О ПОЗИЦИИ
// ============================================================

/**
 * Строит HTML для блока информации о позиции (используется в строке заказа).
 * @param {string} path - полный путь позиции
 * @param {object} props - свойства позиции (из getItemPropsByPath)
 * @param {object} mode - режим кофров (из getCaseMode)
 * @returns {string} HTML-строка
 */
export function buildInfoHtml(path, props, mode) {
  let html = `<div style="display:flex;flex-wrap:wrap;gap:12px;">`;

  const weightPerUnit = (props.weight !== undefined && props.weight !== null) ? props.weight + ' кг' : 'н/д';
  html += `<span><strong>Вес 1 шт:</strong> ${weightPerUnit}</span>`;

  const dims = props.dimensions || 'н/д';
  html += `<span><strong>Габариты:</strong> ${dims}</span>`;

  if (props.volume) {
    html += `<span><strong>Объём 1 шт:</strong> ${props.volume} м³</span>`;
  }

  const options = getCaseOptions(path);
  const individualVals = getIndividualCaseValues(path);
  const packing = getOrderPacking(path);
  const extra = getOrderExtra(path);
  const isMulti = mode.multiSelected && mode.multiSelected.some(v => v === true);

  if (packing.length > 0) {
    html += `<div style="width:100%;"><strong>Общие кофры:</strong></div>`;
    const commonCases = getCommonCases();
    packing.forEach(p => {
      const c = commonCases.find(c => c.id === p.caseId);
      const name = c ? c.name : 'удалённый кофр';
      html += `<div style="padding-left:12px;font-size:13px;color:var(--text-secondary);">• ${esc(name)}: ${p.pieces || 0} шт</div>`;
    });
    if (extra > 0) {
      html += `<div style="padding-left:12px;font-size:13px;color:var(--text-secondary);">• Вне кофра: ${extra} шт</div>`;
    }
  } else if (mode.enabled && isMulti && individualVals.length > 1) {
    html += `<div style="width:100%;"><strong>Мультикофры:</strong></div>`;
    options.forEach((opt, idx) => {
      const val = individualVals[idx] || 0;
      if (val > 0) {
        const casesCount = Math.ceil(val / opt.qty);
        html += `<div style="padding-left:12px;font-size:13px;color:var(--text-secondary);">• Вариант ${idx + 1}: ${val} шт (${casesCount} кофр${casesCount > 1 ? 'а' : ''}) — габ: ${opt.dimensions || 'н/д'}, вес кофра: ${opt.weight || 0} кг</div>`;
      }
    });
  } else if (mode.enabled && individualVals.length === 1 && !packing.length && !isMulti) {
    html += `<div style="width:100%;"><strong>Один кофр:</strong></div>`;
    const opt = getSelectedOption(path);
    const val = individualVals[0] || 0;
    if (val > 0 && opt) {
      const casesCount = Math.ceil(val / opt.qty);
      html += `<div style="padding-left:12px;font-size:13px;color:var(--text-secondary);">• Вариант ${(mode.selectedOption || 0) + 1}: ${val} шт (${casesCount} кофр${casesCount > 1 ? 'а' : ''}) — габ: ${opt.dimensions || 'н/д'}, вес кофра: ${opt.weight || 0} кг</div>`;
    }
    if (mode.alt && mode.useAlt) {
      html += `<div style="padding-left:12px;font-size:13px;color:var(--text-secondary);">• Альтернативный: вместимость ${mode.alt.qty || 0} шт</div>`;
    }
  }

  html += `<div style="width:100%;"><strong>Статус режимов кофров:</strong></div>`;
  html += `<div style="width:100%;padding-left:12px;font-size:13px;color:var(--text-secondary);">
    <span>Режим: ${mode.enabled ? '[Вкл]' : '[Выкл]'}</span>
    ${packing.length > 0 ? `<span style="margin-left:12px;">[Общие кофры] ${packing.length} шт</span>` : ''}
    ${isMulti ? `<span style="margin-left:12px;">[Мульти]</span>` : ''}
    ${individualVals.length === 1 && mode.enabled && !packing.length && !isMulti ? `<span style="margin-left:12px;">[Один кофр]</span>` : ''}
    ${mode.alt && mode.useAlt ? `<span style="margin-left:12px;">[Альт.]</span>` : ''}
  </div>`;

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
  formatDimensions,
  formatVolume,
  formatWeight,
  buildInfoHtml,
};