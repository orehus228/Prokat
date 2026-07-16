// components/cases/index.js
import { initPropsSaveHandler, initPropsCancelHandler } from './props-modal.js';
import { initCasesManagerHandlers, initCasesManagerCloseHandler, initCasesManagerOverlayClose } from './common-manager.js';
import { initMatrixHandlers } from './matrix.js';
import { openCaseSettingsModal } from './case-settings.js';
import { openPropsModalEditor } from './props-modal.js';
import { openCasesManagerModal } from './common-manager.js';
import { openMatrixModal } from './matrix.js';

// Экспортируем функции для использования в других модулях
export {
  openPropsModalEditor,
  openCasesManagerModal,
  openMatrixModal,
  openCaseSettingsModal,
};

/**
 * Инициализация всех обработчиков для модалок кофров.
 * Вызывается один раз при старте приложения.
 */
export function initCases() {
  // Модалка свойств позиции
  initPropsSaveHandler();
  initPropsCancelHandler();

  // Менеджер общих кофров
  initCasesManagerHandlers();
  initCasesManagerCloseHandler();
  initCasesManagerOverlayClose();

  // Матрица привязок
  initMatrixHandlers();

  // Глобальные функции для onclick (если используются в HTML)
  window.addIndividualCaseVariant = () => {
    import('./props-modal.js').then(module => {
      module.addIndividualCaseVariantBtn();
    });
  };
  window.addCommonCaseVariant = () => {
    import('./props-modal.js').then(module => {
      module.addCommonCaseVariantBtn();
    });
  };
  window.addNewCaseFromProps = (btn) => {
    import('./props-modal.js').then(module => {
      module.addNewCaseFromProps(btn);
    });
  };
  window.editCase = (id) => {
    import('./common-manager.js').then(module => {
      module.editCase(id);
    });
  };
  window.deleteCase = (id) => {
    import('./common-manager.js').then(module => {
      module.deleteCase(id);
    });
  };
  window.openCaseSettingsModal = openCaseSettingsModal;
}

export default {
  initCases,
  openPropsModalEditor,
  openCasesManagerModal,
  openMatrixModal,
  openCaseSettingsModal,
};