// components/order/index.js
import { getState, setStateKey, saveState } from '../../core/state.js';
import { getOrderProject, setOrderProject, getProjects, getProject, saveProject } from '../../services/project-data.js';
import { getItemProps, setItemProps, getCommonCases, getTruckPresets } from '../../data/editor-data.js';
import { showToast, queueToast } from '../../ui/toast.js';
import { showPrompt, showConfirm } from '../../ui/modal.js';
import { esc, getElement } from '../../ui/dom.js';
import { initOrderUI, renderOrderAll, setCurrentCategory, clearSearchOrder } from './render.js';
import { initOrderPresetsUI } from './presets.js';
import { initOrderActions, clearOrderData } from './actions.js';
import { updateLinkCountOrder, updateAllCommonCaseIndicators } from './helpers.js';
import { openMatrixModal } from '../cases/matrix.js';
import { openCasesManagerModal } from '../cases/common-manager.js';

// ============================================================
// ИНИЦИАЛИЗАЦИЯ СТРАНИЦЫ ЗАКАЗА
// ============================================================

export function initOrderPage() {
  // Инициализируем UI (поиск, кнопки итогов, дата/комментарий)
  initOrderUI();

  // Инициализируем пресеты
  initOrderPresetsUI();

  // Инициализируем обработчики событий (кнопки ±, клики)
  initOrderActions();

  // Рендерим всё
  renderOrderAll();

  // Загружаем данные проекта в UI
  loadProjectDataIntoUI();

  // Настраиваем обработчики для привязки к проекту
  setupProjectUIHandlers();

  // Настраиваем кнопки экспорта/очистки
  setupExportButtons();

  // Обновляем счётчик привязок
  updateLinkCountOrder();

  // Обновляем индикаторы кофров
  updateAllCommonCaseIndicators();

  showToast('Страница заказа загружена', 'neutral', 1500);
}

// ============================================================
// ЗАГРУЗКА ДАННЫХ ПРОЕКТА В UI
// ============================================================

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

// ============================================================
// ОБРАБОТЧИКИ UI ПРОЕКТА
// ============================================================

function setupProjectUIHandlers() {
  const projectSelect = document.getElementById('pProjectSelect');
  if (projectSelect) {
    projectSelect.addEventListener('change', function() {
      const projectId = this.value;
      if (!projectId) return;
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
        showToast(`Проект "${project.name}" загружен`, 'success');
        // Обновляем индикаторы после загрузки проекта
        updateAllCommonCaseIndicators();
      }
    });
  }

  const fields = ['pProjectName', 'pStartDate', 'pEndDate'];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', function() {
        const name = document.getElementById('pProjectName').value.trim();
        const start = document.getElementById('pStartDate').value;
        const end = document.getElementById('pEndDate').value;
        const status = document.getElementById('pProjectStatus')?.value || 'planned';
        if (!name) {
          setOrderProject({ id: null, name: '', start_date: start, end_date: end, status });
          return;
        }
        let projectId = getOrderProject().id;
        if (!projectId) {
          const newProject = saveProject({ name, start_date: start, end_date: end, status });
          projectId = newProject.id;
        } else {
          const existing = getProject(projectId);
          if (existing) {
            saveProject({ id: projectId, name, start_date: start, end_date: end, status });
          } else {
            const newProject = saveProject({ name, start_date: start, end_date: end, status });
            projectId = newProject.id;
          }
        }
        setOrderProject({ id: projectId, name, start_date: start, end_date: end, status });
        populateProjectSelect();
        updateAllCommonCaseIndicators();
      });
    }
  });

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
      } else {
        setOrderProject({ ...getOrderProject(), status });
      }
    });
  }
}

// ============================================================
// КНОПКИ ЭКСПОРТА И ОЧИСТКИ
// ============================================================

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

  // Кнопки матрицы и общих кофров
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
        // Обновляем индикаторы после закрытия
        updateAllCommonCaseIndicators();
      });
    });
  }
}

// ============================================================
// ЭКСПОРТ ПО УМОЛЧАНИЮ
// ============================================================
export default {
  initOrderPage,
  loadProjectDataIntoUI,
  populateProjectSelect,
  setupProjectUIHandlers,
};