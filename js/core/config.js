// core/config.js
export const STORAGE_KEYS = {
  APP_DATA: 'app_data',
  ORDER_DATA: 'app_order_data',
  OPEN_STATE: 'open_state',
  UI_STATE: 'app_ui_state',
  ORDER_PRESETS: 'order_presets',
  MATRIX_PRESETS: 'matrix_presets',
  SELECTED_TRUCKS: 'selected_truck_ids',
  MATRIX_FULLNAMES: 'matrix_full_names',
  THEME: 'theme',
  ORDER_DETAILS_OPEN: 'detailsOpenOrder',
  OPEN_PROJECT_ID: 'open_project_id',
};

export const CAT_NAMES = {
  sound: 'Звук',
  light: 'Свет',
  video: 'Видео',
  construct: 'Конструктив',
  cables: 'Коммутация',
  extra: 'Другое',
};

export const DEFAULT_INVENTORY = {};
export const DEFAULT_STOCK = {};
export const DEFAULT_SPECS = {};
export const DEFAULT_PROPS = {};
export const DEFAULT_COMMON_CASES = [];
export const DEFAULT_CATEGORY_ORDER = [];

export const DUPLICATE_VIDEO_GROUPS = ['Экраны'];

export const DEFAULT_TRUCK_PRESETS = [
  { id: 'truck_1', name: 'Грузовик 10т', length: 600, width: 240, height: 240, maxWeight: 10000 },
  { id: 'truck_2', name: 'Фура 20т', length: 1360, width: 245, height: 270, maxWeight: 20000 },
];

// Прочие константы
export const CASE_MODES_DEFAULTS = {
  enabled: false,
  alt: null,
  selectedOption: 0,
  accumulate: false,
  multiSelected: [],
  commonSelected: [],
  useAlt: false,
  criteria: 'weight',
};

export const DEFAULT_PROJECT_STATUS = 'planned';
export const PROJECT_STATUSES = ['planned', 'active', 'completed'];