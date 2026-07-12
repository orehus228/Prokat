export const CAT_NAMES = {
    sound: "🔊 Звук",
    light: "💡 Свет",
    video: "🎥 Видео",
    construct: "🏗️ Конструктив",
    cables: "🔌 Коммутация",
    extra: "📦 Другое"
};

export const DEFAULT_INVENTORY = {
    sound: {
        "Акустические системы": ["Топ пассивный d&b Q1", "Сабвуфер пассивный d&b Q-Sub"],
        "Пульты": { "Цифровые": ["Behringer x32 Rack", "Midas MR18"] }
    },
    light: { "Приборы": ["LED Wash 19x40", "Beam 295W"] },
    extra: ["Кейс с бобышками", "Стяжной ремень"],
    video: { "Телевизоры": ["Телевизор 55\"", "Телевизор 65\"", "Телевизор 75\""] }
};

export const DEFAULT_STOCK = {
    "sound|Акустические системы|Топ пассивный d&b Q1": 8,
    "sound|Акустические системы|Сабвуфер пассивный d&b Q-Sub": 6,
    "sound|Пульты|Цифровые|Behringer x32 Rack": 1,
    "sound|Пульты|Цифровые|Midas MR18": 1,
    "light|Приборы|LED Wash 19x40": 4,
    "light|Приборы|Beam 295W": 9999,
    "extra|Кейс с бобышками": 2,
    "extra|Стяжной ремень": 9999,
    "video|Телевизоры|Телевизор 55\"": 0,
    "video|Телевизоры|Телевизор 65\"": 0,
    "video|Телевизоры|Телевизор 75\"": 0
};

export const DEFAULT_SPECS = {
    "sound|Акустические системы|Топ пассивный d&b Q1": "Speakon NL4, Набор для крепления d&b",
    "sound|Акустические системы|Сабвуфер пассивный d&b Q-Sub": "Speakon NL2",
    "sound|Пульты|Цифровые|Behringer x32 Rack": "Питание IEC C13, Стереопара",
    "extra|Кейс с бобышками": "Бобышки, пальцы, шплинты, молоток"
};

export const DEFAULT_PROPS = {
    "sound|Акустические системы|Топ пассивный d&b Q1": { weight: 25, dimensions: "60x40x30", individualCases: [], allowCommon: false, commonCases: [] },
    "sound|Акустические системы|Сабвуфер пассивный d&b Q-Sub": { weight: 30, dimensions: "70x50x40", individualCases: [], allowCommon: false, commonCases: [] },
    "light|Приборы|LED Wash 19x40": { weight: 8, dimensions: "50x30x20", individualCases: [], allowCommon: false, commonCases: [] }
};

export const DEFAULT_COMMON_CASES = [
    { id: 'case1', name: 'Ящик 120x80x60', qty: 2, dimensions: '120x80x60', emptyWeight: 15, maxWeight: 100, maxVolume: 0.576 },
    { id: 'case2', name: 'Ящик 80x60x50', qty: 1, dimensions: '80x60x50', emptyWeight: 10, maxWeight: 60, maxVolume: 0.24 }
];

export const DEFAULT_CATEGORY_ORDER = Object.keys(DEFAULT_INVENTORY);
export const DUPLICATE_VIDEO_GROUPS = ['Экраны', 'Экран', 'Кабинеты'];