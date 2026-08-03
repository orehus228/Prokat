// components/instance/instance-modal.js
import { getState, saveState, rebuildInstancesIndex } from '../../core/state.js';
import {
  getInstancesByPath,
  getInstanceStats,
  updateInstanceStatus,
  getInstance,
} from '../../services/instance-service.js';
import { getProject } from '../../services/project-data.js';
import {
  INSTANCE_STATUSES,
  INSTANCE_STATUS_LABELS,
  INSTANCE_STATUS_COLORS,
} from '../../core/config.js';
import { showToast } from '../../ui/toast.js';
import { showConfirm, showPrompt, showChoice } from '../../ui/modal.js';
import { esc } from '../../ui/dom.js';

let currentModalPath = null;

/**
 * Открывает модалку со списком экземпляров для указанного пути.
 * @param {string} path - путь позиции
 */
export function openInstanceListModal(path) {
  if (!path) {
    showToast('Путь не указан', 'error');
    return;
  }
  currentModalPath = path;
  const modal = document.getElementById('instanceModal');
  if (!modal) {
    showToast('Модалка экземпляров не найдена', 'error');
    return;
  }

  renderInstanceList(path);
  modal.classList.add('open');

  // Обработчик закрытия по клику на оверлей
  modal.onclick = function(e) {
    if (e.target === modal) {
      closeInstanceModal();
    }
  };

  // Обработчик для кнопки "Закрыть"
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
}

/**
 * Отрисовывает список экземпляров в модалке.
 * @param {string} path
 */
function renderInstanceList(path) {
  if (!path) {
    console.warn('renderInstanceList: путь не указан');
    return;
  }

  const container = document.getElementById('instanceListContainer');
  if (!container) {
    console.warn('renderInstanceList: контейнер не найден');
    return;
  }

  // Перестраиваем индекс для гарантии актуальности
  rebuildInstancesIndex();

  const instances = getInstancesByPath(path);
  const stats = getInstanceStats(path);

  console.log('[renderInstanceList] Экземпляры для', path, instances.map(i => ({ id: i.id, status: i.status })));

  // Заголовок
  const title = document.getElementById('instanceModalTitle');
  if (title) {
    const name = path.split('|').pop();
    title.textContent = `Экземпляры: ${name}`;
  }

  // Статистика
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

  // Таблица
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
          <th style="padding:6px 8px;text-align:left;">Серийный номер</th>
          <th style="padding:6px 8px;text-align:left;">Статус</th>
          <th style="padding:6px 8px;text-align:left;">Проект</th>
          <th style="padding:6px 8px;text-align:left;">Субаренда</th>
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

    html += `
      <tr class="${rowClass}" style="border-bottom:1px solid var(--border-color);">
        <td style="padding:4px 8px;">${index + 1}</td>
        <td style="padding:4px 8px;font-weight:500;">${esc(serial)}</td>
        <td style="padding:4px 8px;color:${statusColor};">${statusLabel}</td>
        <td style="padding:4px 8px;">${esc(projectName)}</td>
        <td style="padding:4px 8px;">${subrent}</td>
        <td style="padding:4px 8px;">
          <button class="btn btn-sm change-instance-status-btn" data-id="${inst.id}" style="padding:2px 8px;font-size:12px;background:var(--color-link);color:white;">Изменить статус</button>
          ${inst.status === INSTANCE_STATUSES.STOCK || inst.status === INSTANCE_STATUSES.WRITTEN_OFF ? `<button class="btn btn-sm delete-instance-btn" data-id="${inst.id}" style="padding:2px 8px;font-size:12px;background:var(--danger);color:white;">Удалить</button>` : ''}
        </td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  table.innerHTML = html;

  // Обработчики для кнопок (делегирование через таблицу)
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

  // Исключаем недопустимые переходы
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

  let comment = await showPrompt('Комментарий (необязательно):', 'Комментарий:', '', 'Введите комментарий...');
  if (comment === null) {
    comment = '';
  }

  const oldStatus = instance.status;
  const success = updateInstanceStatus(instanceId, newStatus, null, comment || 'Изменение статуса в модалке');

  if (success) {
    // Проверяем, изменился ли статус в объекте
    const updated = getInstance(instanceId);
    if (updated && updated.status === newStatus) {
      showToast('Статус обновлён', 'success');
      rebuildInstancesIndex();
      // Обновляем currentModalPath и перерисовываем
      currentModalPath = updated.path;
      renderInstanceList(currentModalPath);
    } else {
      // Если статус не изменился, пробуем принудительно сохранить состояние ещё раз
      console.warn('Статус не изменился после updateInstanceStatus, пробуем принудительно сохранить');
      saveState();
      rebuildInstancesIndex();
      const reUpdated = getInstance(instanceId);
      if (reUpdated && reUpdated.status === newStatus) {
        showToast('Статус обновлён (принудительно)', 'success');
        currentModalPath = reUpdated.path;
        renderInstanceList(currentModalPath);
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
      renderInstanceList(currentModalPath);
    } else {
      renderInstanceList(instance.path);
    }
  } else {
    showToast('Ошибка удаления', 'error');
  }
}

// Глобальные функции для вызова из onclick (для кнопок, если будут)
window.openInstanceListModal = openInstanceListModal;
window.closeInstanceModal = closeInstanceModal;

export default {
  openInstanceListModal,
  closeInstanceModal,
};