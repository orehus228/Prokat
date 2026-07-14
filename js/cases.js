// cases.js — реэкспорт всех функций из модулей cases
export * from './modules/cases/props-modal.js';
export * from './modules/cases/common-cases-manager.js';
export * from './modules/cases/matrix.js';
export * from './modules/cases/case-settings.js';

import {
    initPropsSaveHandler,
    initPropsCancelHandler,
    addIndividualCaseVariantBtn,
    addCommonCaseVariantBtn,
    addNewCaseFromProps
} from './modules/cases/props-modal.js';

import {
    initCasesManagerHandlers,
    initCasesManagerCloseHandler,
    initCasesManagerOverlayClose,
    editCase,
    deleteCase
} from './modules/cases/common-cases-manager.js';

import { initMatrixHandlers } from './modules/cases/matrix.js';

// Функции для альтернативного кофра и удаления привязки уже привязаны в case-settings.js,
// поэтому их не нужно добавлять здесь.

export function initCases() {
    initPropsSaveHandler();
    initPropsCancelHandler();
    initCasesManagerHandlers();
    initCasesManagerCloseHandler();
    initCasesManagerOverlayClose();
    initMatrixHandlers();

    // Глобальные функции для использования в HTML (onclick)
    window.addIndividualCaseVariant = addIndividualCaseVariantBtn;
    window.addCommonCaseVariant = addCommonCaseVariantBtn;
    window.addNewCaseFromProps = addNewCaseFromProps;
    window.editCase = editCase;
    window.deleteCase = deleteCase;
}