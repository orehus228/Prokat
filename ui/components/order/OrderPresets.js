// ui/components/order/OrderPresets.js

import { showToast } from '../../toast.js';
import { showPrompt, showConfirm } from '../../modal.js';
import {
  getOrderPresets,
  createOrderPreset,
  loadOrderPreset,
  deleteOrderPreset,
  exportOrderPresets,
  importOrderPresets,
  getOrderPresetNames
} from '../../../services/presets.js';
import { updateTotals, updateLinkCount } from './OrderTotals.js';
import { renderCategoryContent, getCurrentCategory, updateCommonCaseIndicators } from './OrderRenderer.js';

/**
 * Заполняет select пресетов.
 */
export function populatePresetSelect() {
  const select = document.getElementById('orderPresetSelect');
  if (!select) return;
  const names = getOrderPresetNames();
  select.innerHTML = '<option value="">— Выберите пресет —</option>';
  names.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
}

/**
 * Сохраняет текущий заказ как пресет.
 */
export async function savePreset() {
  const name = await showPrompt('Сохранить пресет заказа', 'Введите имя пресета:', '', '');
  if (!name || !name.trim()) return;
  try {
    createOrderPreset(name.trim());
    populatePresetSelect();
    showToast('Пресет сохранён', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/**
 * Загружает пресет (с учётом наложения).
 */
export async function loadPreset() {
  const select = document.getElementById('orderPresetSelect');
  const name = select?.value;
  if (!name) {
    showToast('Выберите пресет', 'warning');
    return;
  }
  const overlay = document.getElementById('orderOverlayToggle')?.checked || false;
  try {
    loadOrderPreset(name, overlay);
    // Обновляем рендеринг
    const cat = getCurrentCategory();
    if (cat) renderCategoryContent(cat);
    updateTotals();
    updateLinkCount();
    updateCommonCaseIndicators();
    showToast(`Пресет "${name}" загружен ${overlay ? '(наложение)' : '(замена)'}`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/**
 * Удаляет выбранный пресет.
 */
export async function deletePreset() {
  const select = document.getElementById('orderPresetSelect');
  const name = select?.value;
  if (!name) {
    showToast('Выберите пресет', 'warning');
    return;
  }
  const confirmed = await showConfirm(`Удалить пресет "${name}"?`);
  if (!confirmed) return;
  try {
    deleteOrderPreset(name);
    populatePresetSelect();
    showToast('Пресет удалён', 'neutral');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/**
 * Экспортирует все пресеты в JSON-файл.
 */
export function exportPresets() {
  try {
    const json = exportOrderPresets();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'order_presets.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Пресеты экспортированы', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/**
 * Импортирует пресеты из JSON-файла.
 * @param {File} file - выбранный файл
 */
export function importPresets(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const count = importOrderPresets(e.target.result);
      populatePresetSelect();
      showToast(`Импортировано ${count} пресетов`, 'success');
    } catch (err) {
      showToast('Ошибка: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}