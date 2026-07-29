// components/order/index.js
import { getState, setStateKey, saveState } from '../../core/state.js';
import { getOrderProject, setOrderProject } from '../../services/order-data.js';
import { getProjects, getProject, saveProject, addProjectItem } from '../../services/project-data.js';
import { getItemProps, setItemProps, getCommonCases, getTruckPresets } from '../../data/editor-data.js';
import { showToast, queueToast } from '../../ui/toast.js';
import { showPrompt, showConfirm } from '../../ui/modal.js';
import { esc, getElement, debounce } from '../../ui/dom.js';
import { initOrderUI, renderOrderAll, setCurrentCategory, clearSearchOrder } from './render.js';
import { initOrderPresetsUI } from './presets.js';
import { initOrderActions, clearOrderData, syncAllProjectItems } from './actions.js';
import { updateLinkCountOrder, updateAllCommonCaseIndicators } from './helpers.js';
import { openMatrixModal } from '../cases/matrix.js';
import { openCasesManagerModal } from '../cases/common-manager.js';

export function initOrderPage() {
  initOrderUI();
  initOrderPresetsUI();
  initOrderActions();
  renderOrderAll();
  loadProjectDataIntoUI();
  setupProjectUIHandlers();
  setupExportButtons();
  updateLinkCountOrder();
  updateAllCommonCaseIndicators();
  // Синхронизируем текущий заказ с проектом при загрузке
  syncAllProjectItems();
  showToast('Страница заказа загружена', 'neutral', 1500);
}

function loadProjectDataIntoUI() {
  const project = getOrderProject();
  const nameInput = document.getElementById('pProjectName');
  const startInput = document.getElementById('pStartDate');
  const endInput = document.getElementById('pEndDate');
  const statusSelect = document.getElementById('pProjectStatus');
  if (nameInput) nameInput.value = project.name || '';
  if (startInput) startInput.value = project.start_date || '';
  if (endInput) endInput.value = project.end_date || '';
  if (statusSelect) statusSelect.value = project.status || 'planned';
  populateProjectSelect();
}

function populateProjectSelect() {
  const select = document.getElementById('pProjectSelect');
  if (!select) return;
  const projects = getProjects();
  const currentProjectId = getOrderProject().id;
  select.innerHTML = '<option value="">— Выберите существующий проект —</option>';
  projects.forEach(p => {
    const selected = (p.id === currentProjectId) ? 'selected' : '';
    select.innerHTML += `<option value="${p.id}" ${selected}>${esc(p.name)} (${p.start_date || '—'} – ${p.end_date || '—'})</option>`;
  });
}

function setupProjectUIHandlers() {
  const projectSelect = document.getElementById('pProjectSelect');
  if (projectSelect) {
    projectSelect.addEventListener('change', function() {
      const projectId = this.value;
      if (!projectId) {
        // Если выбран пустой проект, сбрасываем данные проекта, но оставляем заказ
        setOrderProject({ id: null, name: '', start_date: '', end_date: '', status: 'planned' });
        document.getElementById('pProjectName').value = '';
        document.getElementById('pStartDate').value = '';
        document.getElementById('pEndDate').value = '';
        const statusSelect = document.getElementById('pProjectStatus');
        if (statusSelect) statusSelect.value = 'planned';
        // Синхронизируем: освобождаем все экземпляры, так как проект не выбран
        syncAllProjectItems();
        showToast('Проект отвязан', 'neutral');
        updateAllCommonCaseIndicators();
        return;
      }
      const project = getProject(projectId);
      if (project) {
        document.getElementById('pProjectName').value = project.name || '';
        document.getElementById('pStartDate').value = project.start_date || '';
        document.getElementById('pEndDate').value = project.end_date || '';
        const statusSelect = document.getElementById('pProjectStatus');
        if (statusSelect) statusSelect.value = project.status || 'planned';
        setOrderProject({
          id: project.id,
          name: project.name,
          start_date: project.start_date,
          end_date: project.end_date,
          status: project.status || 'planned',
        });
        // Синхронизируем заказ с выбранным проектом
        syncAllProjectItems();
        showToast(`Проект "${project.name}" загружен`, 'success');
        updateAllCommonCaseIndicators();
      }
    });
  }

  // Создаём debounced-версию обработчика изменения полей проекта
  const debouncedSync = debounce(() => {
    const name = document.getElementById('pProjectName').value.trim();
    const start = document.getElementById('pStartDate').value;
    const end = document.getElementById('pEndDate').value;
    const status = document.getElementById('pProjectStatus')?.value || 'planned';
    
    if (!name) {
      // Если нет названия, сохраняем только даты и статус
      setOrderProject({ id: null, name: '', start_date: start, end_date: end, status });
      // Освобождаем все экземпляры, так как проект без названия невалиден
      syncAllProjectItems();
      return;
    }
    
    let projectId = getOrderProject().id;
    if (!projectId) {
      // Создаём новый проект
      const newProject = saveProject({ name, start_date: start, end_date: end, status });
      projectId = newProject.id;
      setOrderProject({ id: projectId, name, start_date: start, end_date: end, status });
    } else {
      // Обновляем существующий
      const existing = getProject(projectId);
      if (existing) {
        saveProject({ id: projectId, name, start_date: start, end_date: end, status });
        setOrderProject({ id: projectId, name, start_date: start, end_date: end, status });
      } else {
        // Если проект с таким id не найден, создаём новый
        const newProject = saveProject({ name, start_date: start, end_date: end, status });
        projectId = newProject.id;
        setOrderProject({ id: projectId, name, start_date: start, end_date: end, status });
      }
    }
    populateProjectSelect();
    // Синхронизируем заказ с обновлённым проектом (с debounce)
    syncAllProjectItems();
    updateAllCommonCaseIndicators();
  }, 500);

  // Обработчики для полей проекта с debounce
  const fields = ['pProjectName', 'pStartDate', 'pEndDate'];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', debouncedSync);
      el.addEventListener('change', debouncedSync);
    }
  });

  // Статус проекта – синхронизация сразу (без debounce, так как это менее критично)
  const statusSelect = document.getElementById('pProjectStatus');
  if (statusSelect) {
    statusSelect.addEventListener('change', function() {
      const status = this.value;
      const name = document.getElementById('pProjectName').value.trim();
      const start = document.getElementById('pStartDate').value;
      const end = document.getElementById('pEndDate').value;
      const projectId = getOrderProject().id;
      if (name && projectId) {
        saveProject({ id: projectId, name, start_date: start, end_date: end, status });
        setOrderProject({ ...getOrderProject(), status });
        // Синхронизация не требуется при смене статуса, но можно обновить индикаторы
        updateAllCommonCaseIndicators();
      } else {
        setOrderProject({ ...getOrderProject(), status });
      }
    });
  }
}

function setupExportButtons() {
  const saveJSONBtn = document.getElementById('saveJ');
  const savePDFBtn = document.getElementById('savePdf');
  const clearBtn = document.getElementById('clearOrder');

  if (saveJSONBtn) {
    saveJSONBtn.addEventListener('click', () => {
      import('./presets.js').then(module => module.exportOrderJSON());
    });
  }
  if (savePDFBtn) {
    savePDFBtn.addEventListener('click', () => {
      import('./presets.js').then(module => module.exportOrderPDF());
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', clearOrderData);
  }

  const matrixBtn = document.getElementById('openMatrixModal');
  if (matrixBtn) {
    matrixBtn.addEventListener('click', () => {
      openMatrixModal();
    });
  }
  const commonBtn = document.getElementById('openCommonCasesManager');
  if (commonBtn) {
    commonBtn.addEventListener('click', () => {
      openCasesManagerModal(() => {
        updateAllCommonCaseIndicators();
      });
    });
  }
}

export default {
  initOrderPage,
  loadProjectDataIntoUI,
  populateProjectSelect,
  setupProjectUIHandlers,
};