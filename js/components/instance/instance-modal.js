// components/instance/instance-modal.js
import { getState, saveState, rebuildInstancesIndex } from '../../core/state.js';
import {
  getInstancesByPath,
  getInstanceStats,
  updateInstanceStatus,
  getInstance,
} from '../../services/instance-service.js';
import { getProject } from '../../services/project-data.js';
import { getOrderInstances } from '../../services/order-data.js'; // <-- новый импорт
import {
  INSTANCE_STATUSES,
  INSTANCE_STATUS_LABELS,
  INSTANCE_STATUS_COLORS,
} from '../../core/config.js';
import { showToast } from '../../ui/toast.js';
import { showConfirm, showPrompt, showChoice } from '../../ui/modal.js';
import { esc } from '../../ui/dom.js';

let currentModalPath = null;
let currentOrderPath = null; // для передачи пути из заказа

/**
 * Открывает модалку со списком экземпляров для указанного пути.
 * @param {string} path - путь позиции
 * @param {string} orderPath - путь позиции в заказе (для подсветки зарезервированных)
 */
export function openInstanceListModal(path, orderPath = null) {
  if (!path) {
    showToast('Путь не указан', 'error');
    return;
  }
  currentModalPath = path;
  currentOrderPath = orderPath || path; // если не передан, используем тот же путь
  const modal = document.getElementById('instanceModal');
  if (!modal) {
    showToast('Модалка экземпляров не найдена', 'error');
    return;
  }

  renderInstanceList(path, currentOrderPath);
  modal.classList.add('open');

  modal.onclick = function(e) {
    if (e.target === modal) {
      closeInstanceModal();
    }
  };

  const closeBtn = document.getElementById('instanceModalClose');
  if (closeBtn) {
    closeBtn.removeEventListener('click', closeInstanceModal);
    closeBtn.addEventListener('click', closeInstanceModal);
  }
}

/**
 * Закрывает модалку экземпляров.
 */
export function closeInstanceModal() {
  const modal = document.getElementById('instanceModal');
  if (modal) modal.classList.remove('open');
  currentModalPath = null;
  currentOrderPath = null;
}

/**
 * Отрисовывает список экземпляров в модалке.
 * @param {string} path
 * @param {string} orderPath - путь в заказе для подсветки зарезервированных
 */
function renderInstanceList(path, orderPath = null) {
  if (!path) {
    console.warn('renderInstanceList: путь не указан');
    return;
  }

  const container = document.getElementById('instanceListContainer');
  if (!container) {
    console.warn('renderInstanceList: контейнер не найден');
    return;
  }

  rebuildInstancesIndex();

  const instances = getInstancesByPath(path);
  const stats = getInstanceStats(path);

  // Получаем ID экземпляров, зарезервированных в текущем заказе (если передан orderPath)
  let reservedInOrderIds = [];
  if (orderPath) {
    reservedInOrderIds = getOrderInstances(orderPath) || [];
  }

  console.log('[renderInstanceList] Экземпляры для', path, instances.map(i => ({ id: i.id, status: i.status })));
  console.log('[renderInstanceList] Зарезервированные в заказе:', reservedInOrderIds);

  const title = document.getElementById('instanceModalTitle');
  if (title) {
    const name = path.split('|').pop();
    title.textContent = `Экземпляры: ${name}`;
  }

  const statsEl = document.getElementById('instanceStats');
  if (statsEl) {
    const parts = [];
    if (stats.stock > 0) parts.push(`<span style="color:${INSTANCE_STATUS_COLORS[INSTANCE_STATUSES.STOCK]}">${stats.stock} на складе</span>`);
    if (stats.reserved > 0) parts.push(`<span style="color:${INSTANCE_STATUS_COLORS[INSTANCE_STATUSES.RESERVED]}">${stats.reserved} зарезервировано</span>`);
    if (stats.issued > 0) parts.push(`<span style="color:${INSTANCE_STATUS_COLORS[INSTANCE_STATUSES.ISSUED]}">${stats.issued} выдано</span>`);
    if (stats.repair > 0) parts.push(`<span style="color:${INSTANCE_STATUS_COLORS[INSTANCE_STATUSES.REPAIR]}">${stats.repair} в ремонте</span>`);
    if (stats.writtenOff > 0) parts.push(`<span style="color:${INSTANCE_STATUS_COLORS[INSTANCE_STATUSES.WRITTEN_OFF]}">${stats.writtenOff} списано</span>`);
    statsEl.innerHTML = `Всего: ${instances.length} (${parts.join(', ')})`;
  }

  const table = document.getElementById('instanceTable');
  if (!table) {
    console.warn('renderInstanceList: таблица не найдена');
    return;
  }

  if (instances.length === 0) {
    table.innerHTML = '<div class="empty-message" style="padding:20px;text-align:center;">Нет экземпляров для этой позиции</div>';
    return;
  }

  let html = `
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <thead>
        <tr style="background:var(--bg-secondary);border-bottom:2px solid var(--border-color);">
          <th style="padding:6px 8px;text-align:left;">№</th>
          <th style="padding:6px 8px;text-align:left;">ID</th>
          <th style="padding:6px 8px;text-align:left;">Серийный номер</th>
          <th style="padding:6px 8px;text-align:left;">Статус</th>
          <th style="padding:6px 8px;text-align:left;">Проект</th>
          <th style="padding:6px 8px;text-align:left;">Субаренда</th>
          <th style="padding:6px 8px;text-align:left;">В заказе</th>
          <th style="padding:6px 8px;text-align:left;">Действия</th>
        </tr>
      </thead>
      <tbody>
  `;

  instances.forEach((inst, index) => {
    const statusColor = INSTANCE_STATUS_COLORS[inst.status] || '#888';
    const statusLabel = INSTANCE_STATUS_LABELS[inst.status] || inst.status;
    const projectName = inst.currentProjectId ? getProject(inst.currentProjectId)?.name || 'Неизвестный' : '—';
    const subrent = inst.subrentInfo?.isSubrent ? `🔄 ${esc(inst.subrentInfo.counterparty || 'Субаренда')}` : '—';
    const serial = inst.serialNumber || 'б/н';
    const rowClass = index % 2 === 0 ? 'row-even' : 'row-odd';

    // Проверяем, зарезервирован ли этот экземпляр в текущем заказе
    const isInOrder = reservedInOrderIds.includes(inst.id);
    const inOrderLabel = isInOrder ? '📌 Да' : '—';
    const rowBg = isInOrder ? 'background:rgba(74, 122, 90, 0.2);' : '';

    html += `
      <tr class="${rowClass}" style="border-bottom:1px solid var(--border-color);${rowBg}">
        <td style="padding:4px 8px;">${index + 1}</td>
        <td style="padding:4px 8px;font-size:11px;color:var(--text-muted);">${esc(inst.id)}</td>
        <td style="padding:4px 8px;font-weight:500;">${esc(serial)}</td>
        <td style="padding:4px 8px;color:${statusColor};">${statusLabel}</td>
        <td style="padding:4px 8px;">${esc(projectName)}</td>
        <td style="padding:4px 8px;">${subrent}</td>
        <td style="padding:4px 8px;font-weight:${isInOrder ? 'bold' : 'normal'};color:${isInOrder ? 'var(--success)' : 'var(--text-muted)'};">${inOrderLabel}</td>
        <td style="padding:4px 8px;">
          <button class="btn btn-sm change-instance-status-btn" data-id="${inst.id}" style="padding:2px 8px;font-size:12px;background:var(--color-link);color:white;">Изменить статус</button>
          ${inst.status === INSTANCE_STATUSES.STOCK || inst.status === INSTANCE_STATUSES.WRITTEN_OFF ? `<button class="btn btn-sm delete-instance-btn" data-id="${inst.id}" style="padding:2px 8px;font-size:12px;background:var(--danger);color:white;">Удалить</button>` : ''}
        </td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  table.innerHTML = html;

  table.querySelectorAll('.change-instance-status-btn').forEach(btn => {
    btn.addEventListener('click', async function(e) {
      e.stopPropagation();
      const id = this.dataset.id;
      await handleChangeStatus(id);
    });
  });

  table.querySelectorAll('.delete-instance-btn').forEach(btn => {
    btn.addEventListener('click', async function(e) {
      e.stopPropagation();
      const id = this.dataset.id;
      await handleDeleteInstance(id);
    });
  });
}

/**
 * Обработчик изменения статуса экземпляра.
 * @param {string} instanceId
 */
async function handleChangeStatus(instanceId) {
  const instance = getInstance(instanceId);
  if (!instance) {
    showToast('Экземпляр не найден', 'error');
    return;
  }

  const statusOptions = [
    { value: INSTANCE_STATUSES.STOCK, label: 'На складе' },
    { value: INSTANCE_STATUSES.RESERVED, label: 'Зарезервировано' },
    { value: INSTANCE_STATUSES.ISSUED, label: 'Выдано' },
    { value: INSTANCE_STATUSES.REPAIR, label: 'В ремонте' },
    { value: INSTANCE_STATUSES.WRITTEN_OFF, label: 'Списано' },
  ];

  const allowed = statusOptions.filter(opt => {
    if (instance.status === INSTANCE_STATUSES.WRITTEN_OFF && opt.value !== INSTANCE_STATUSES.WRITTEN_OFF) {
      return false;
    }
    return true;
  });

  const newStatus = await showChoice(
    'Изменить статус экземпляра',
    `Текущий статус: ${INSTANCE_STATUS_LABELS[instance.status] || instance.status}`,
    allowed
  );

  if (!newStatus) {
    return;
  }

  // Если новый статус совпадает со старым — предупреждаем и не закрываем
  if (newStatus === instance.status) {
    showToast('Статус уже установлен, выберите другой', 'warning');
    return;
  }

  let comment = await showPrompt('Комментарий (необязательно):', 'Комментарий:', '', 'Введите комментарий...');
  if (comment === null) {
    comment = '';
  }

  console.log('[handleChangeStatus] Новый статус:', newStatus);
  const success = updateInstanceStatus(instanceId, newStatus, null, comment || 'Изменение статуса в модалке');
  console.log('[handleChangeStatus] success:', success);

  if (success) {
    const updated = getInstance(instanceId);
    console.log('[handleChangeStatus] updated:', updated);
    if (updated && updated.status === newStatus) {
      showToast('Статус обновлён', 'success');
      rebuildInstancesIndex();
      if (currentModalPath) {
        renderInstanceList(currentModalPath, currentOrderPath);
      } else {
        renderInstanceList(instance.path, currentOrderPath);
      }
    } else {
      console.warn('Статус не изменился после updateInstanceStatus, пробуем принудительно сохранить состояние ещё раз');
      saveState();
      rebuildInstancesIndex();
      const reUpdated = getInstance(instanceId);
      if (reUpdated && reUpdated.status === newStatus) {
        showToast('Статус обновлён (принудительно)', 'success');
        if (currentModalPath) {
          renderInstanceList(currentModalPath, currentOrderPath);
        } else {
          renderInstanceList(instance.path, currentOrderPath);
        }
      } else {
        showToast('Не удалось обновить статус', 'error');
        console.error('Статус не изменился даже после принудительного сохранения. instanceId:', instanceId, 'newStatus:', newStatus);
      }
    }
  } else {
    showToast('Ошибка обновления статуса', 'error');
  }
}

/**
 * Обработчик удаления экземпляра.
 * @param {string} instanceId
 */
async function handleDeleteInstance(instanceId) {
  const instance = getInstance(instanceId);
  if (!instance) {
    showToast('Экземпляр не найден', 'error');
    return;
  }

  if (instance.status !== INSTANCE_STATUSES.STOCK && instance.status !== INSTANCE_STATUSES.WRITTEN_OFF) {
    showToast('Нельзя удалить экземпляр в статусе ' + (INSTANCE_STATUS_LABELS[instance.status] || instance.status), 'warning');
    return;
  }

  const confirmed = await showConfirm(`Удалить экземпляр ${instance.serialNumber || 'б/н'}?`);
  if (!confirmed) return;

  const { deleteInstance } = await import('../../services/instance-service.js');
  const success = deleteInstance(instanceId);
  if (success) {
    showToast('Экземпляр удалён', 'success');
    rebuildInstancesIndex();
    if (currentModalPath) {
      renderInstanceList(currentModalPath, currentOrderPath);
    } else {
      renderInstanceList(instance.path, currentOrderPath);
    }
  } else {
    showToast('Ошибка удаления', 'error');
  }
}

// Для совместимости с onclick (если используется)
window.openInstanceListModal = openInstanceListModal;
window.closeInstanceModal = closeInstanceModal;

export default {
  openInstanceListModal,
  closeInstanceModal,
};