// core/config.js

/**
 * Конфигурация приложения.
 * Все константы собраны в одном месте для удобства поддержки.
 * @module core/config
 */

// ============================================================
// КЛЮЧИ ДЛЯ localStorage
// ============================================================

export const STORAGE_KEYS = {
  /** Основные данные приложения (инвентарь, остатки, свойства, проекты и т.д.) */
  APP_DATA: 'app_data',
  /** Данные текущего заказа (позиции, упаковка, привязки, режимы кофров) */
  ORDER_DATA: 'app_order_data',
  /** Состояние UI (открытые категории, чекбоксы, свёрнутые блоки) */
  UI_STATE: 'app_ui_state',
  /** Пресеты заказов */
  ORDER_PRESETS: 'order_presets',
  /** Пресеты матрицы привязок */
  MATRIX_PRESETS: 'matrix_presets',
  /** ID выбранных грузовиков для расчёта загрузки */
  SELECTED_TRUCKS: 'selected_truck_ids',
  /** Режим отображения полных названий в матрице (true/false) */
  MATRIX_FULLNAMES: 'matrix_full_names',
  /** Тема оформления ('dark' или 'light') */
  THEME: 'theme',
  /** Открыта ли детальная статистика в заказе */
  ORDER_DETAILS_OPEN: 'detailsOpenOrder',
  /** ID проекта, который нужно открыть при переходе на страницу открытия */
  OPEN_PROJECT_ID: 'open_project_id',
};

// ============================================================
// ДЕФОЛТНЫЕ ЗНАЧЕНИЯ ДЛЯ СОСТОЯНИЯ
// ============================================================

/** Дефолтный пустой инвентарь */
export const DEFAULT_INVENTORY = {};

/** Дефолтные остатки на складе */
export const DEFAULT_STOCK = {};

/** Дефолтные описания (спецификации) */
export const DEFAULT_SPECS = {};

/** Дефолтные свойства позиций (вес, габариты, кофры) */
export const DEFAULT_PROPS = {};

/** Дефолтный список общих кофров */
export const DEFAULT_COMMON_CASES = [];

/** Дефолтный порядок категорий */
export const DEFAULT_CATEGORY_ORDER = [];

/** Дефолтные пресеты грузовиков */
export const DEFAULT_TRUCK_PRESETS = [
  { id: 'truck_1', name: 'Грузовик 10т', length: 600, width: 240, height: 240, maxWeight: 10000 },
  { id: 'truck_2', name: 'Фура 20т', length: 1360, width: 245, height: 270, maxWeight: 20000 },
];

/** Дефолтные значения для режима кофров позиции */
export const CASE_MODES_DEFAULTS = {
  enabled: false,
  alt: null, // { qty, weight, dims }
  selectedOption: 0,
  accumulate: false,
  multiSelected: [], // boolean[] для мультирежима
  commonSelected: [], // string[] id общих кофров
  useAlt: false,
  criteria: 'weight', // 'weight' | 'volume'
};

// ============================================================
// КОНСТАНТЫ ДЛЯ ИМЁН КАТЕГОРИЙ (отображение)
// ============================================================

export const CAT_NAMES = {
  sound: 'Звук',
  light: 'Свет',
  video: 'Видео',
  construct: 'Конструктив',
  cables: 'Коммутация',
  extra: 'Другое',
};

// ============================================================
// ДРУГИЕ КОНСТАНТЫ
// ============================================================

/** Список дублирующихся групп, которые нужно удалять при чистке (устаревшее) */
export const DUPLICATE_VIDEO_GROUPS = ['Экраны'];

/** Статусы проекта */
export const PROJECT_STATUSES = ['planned', 'active', 'completed'];
export const DEFAULT_PROJECT_STATUS = 'planned';

/** Максимальная глубина рекурсивного обхода дерева инвентаря (защита от зацикливания) */
export const MAX_TRAVERSAL_DEPTH = 15;

// ============================================================
// КОНСТАНТЫ ДЛЯ МАТРИЦЫ
// ============================================================

/** Базовые размеры ячеек матрицы (в пикселях) при масштабе 1 */
export const MATRIX_BASE = {
  COL_WIDTH: 90,
  ROW_HEIGHT: 32,
  FONT_SIZE: 13,
  PADDING: 4,
  SOURCE_WIDTH: 120,
  SOURCE_WIDTH_FULL: 250,
};

// ============================================================
// КОНСТАНТЫ ДЛЯ РАСЧЁТА ЗАГРУЗКИ
// ============================================================

/** Минимальный зазор между предметами при упаковке (см) */
export const PACKING_GAP = 0;

/** Коэффициент для преобразования см³ в м³ */
export const CM3_TO_M3 = 1_000_000;

// ============================================================
// КОНСТАНТЫ ДЛЯ ТОСТОВ
// ============================================================

export const TOAST_DURATION = 2500;

// ============================================================
// КОНСТАНТЫ ДЛЯ ПОИСКА
// ============================================================

export const SEARCH_DEBOUNCE_DELAY = 300;

// ============================================================
// КОНСТАНТЫ ДЛЯ ПОВТОРНЫХ НАЖАТИЙ КНОПОК (+/-)
// ============================================================

export const REPEAT_DELAY = 400; // задержка перед началом повтора (мс)
export const REPEAT_INTERVAL = 100; // интервал между повторами (мс)

// ============================================================
// ЭКСПОРТ ПО УМОЛЧАНИЮ (для удобства)
// ============================================================

export default {
  STORAGE_KEYS,
  DEFAULT_INVENTORY,
  DEFAULT_STOCK,
  DEFAULT_SPECS,
  DEFAULT_PROPS,
  DEFAULT_COMMON_CASES,
  DEFAULT_CATEGORY_ORDER,
  DEFAULT_TRUCK_PRESETS,
  CASE_MODES_DEFAULTS,
  CAT_NAMES,
  DUPLICATE_VIDEO_GROUPS,
  PROJECT_STATUSES,
  DEFAULT_PROJECT_STATUS,
  MAX_TRAVERSAL_DEPTH,
  MATRIX_BASE,
  PACKING_GAP,
  CM3_TO_M3,
  TOAST_DURATION,
  SEARCH_DEBOUNCE_DELAY,
  REPEAT_DELAY,
  REPEAT_INTERVAL,
};