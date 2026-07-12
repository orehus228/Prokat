// config.js — Константы и ключи хранилища (без дефолтных данных)
export const STORAGE_KEYS = {
    APP_DATA: 'app_data',
    ORDER_DATA: 'app_order_data',
    OPEN_STATE: 'open_state',
    UI_STATE: 'app_ui_state'
};

// Названия категорий без эмодзи (только текст)
export const CAT_NAMES = {
    sound: "Звук",
    light: "Свет",
    video: "Видео",
    construct: "Конструктив",
    cables: "Коммутация",
    extra: "Другое"
};

// Все дефолтные данные теперь пустые
export const DEFAULT_INVENTORY = {};
export const DEFAULT_STOCK = {};
export const DEFAULT_SPECS = {};
export const DEFAULT_PROPS = {};
export const DEFAULT_COMMON_CASES = [];
export const DEFAULT_CATEGORY_ORDER = [];

// Группы для удаления дублей (оставляем только "Экран")
// При импорте удаляем "Экраны", оставляем "Экран"
export const DUPLICATE_VIDEO_GROUPS = ['Экраны'];
// "Экран" остаётся