"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

export type Locale = "ru" | "kk";

/** Map backend parameter IDs to i18n translation keys */
export const PARAM_KEY_MAP: Record<string, string> = {
  speed_kmh: "param_speed",
  traction_motor_temp_c: "param_motor_temp",
  traction_motor_current_a: "param_motor_current",
  dc_bus_voltage_v: "param_dc_bus",
  catenary_voltage_kv: "param_catenary_v",
  onboard_voltage_v: "param_onboard_v",
  battery_voltage_v: "param_battery_v",
  pantograph_current_a: "param_pantograph",
  brake_main_pressure_bar: "param_brake_main",
  brake_reservoir_pressure_bar: "param_brake_res",
  brake_cylinder_pressure_bar: "param_brake_cyl",
  regen_braking_power_kw: "param_regen_power",
  coolant_temp_c: "param_coolant",
  oil_temp_c: "param_oil_temp",
  oil_pressure_kpa: "param_oil_press",
  engine_rpm: "param_rpm",
  exhaust_temp_c: "param_exhaust",
  fuel_level_pct: "param_fuel_level",
  fuel_consumption_g_kwh: "param_fuel_rate",
  wheel_slip_pct: "param_wheel_slip",
  ambient_temp_c: "param_ambient",
  oil_pressure_idle_kpa: "param_oil_idle",
};

const translations: Record<Locale, Record<string, string>> = {
  ru: {
    // Nav
    digital_twin: "Digital Twin",
    nav_dashboard: "Панель",
    nav_alerts: "Оповещения",
    nav_trends: "Тренды",
    nav_map: "Карта",
    nav_replay: "Воспроизведение",
    nav_admin: "Админ",
    loco_electric: "Электро",
    loco_diesel: "Дизель",

    // Connection
    live: "ОНЛАЙН",
    reconnecting: "ПЕРЕПОДКЛЮЧЕНИЕ",
    no_connection: "НЕТ СВЯЗИ",

    // Login
    ktz_monitor: "Мониторинг локомотивов КТЖ",
    system_access: "Вход в систему",
    username: "Имя пользователя",
    password: "Пароль",
    login_btn: "Войти",
    login_error: "Введите имя пользователя и пароль",
    login_success: "Авторизация успешна",
    login_fail: "Ошибка авторизации",
    demo_credentials: "Демо: admin / admin123 · dispatcher / disp123 · cabin / cabin123",

    // Dashboard
    health_index: "Индекс здоровья",
    realtime_condition: "Состояние локомотива в реальном времени",
    excellent: "Отлично",
    good: "Хорошо",
    warning: "Внимание",
    critical: "Критично",
    degradation_factors: "Факторы деградации",
    recent_alerts: "Последние оповещения",
    subsystems: "Подсистемы",
    loading: "Загрузка...",
    connection_lost: "Нет связи — данные могут быть устаревшими",
    stale_data: "Данные устарели",
    no_connection_loco: "Нет связи с локомотивом",
    actions: "Действия",
    params: "параметров",
    all_nominal: "Все параметры в норме",
    no_active_alerts: "Нет активных оповещений",
    initializing: "Инициализация...",

    // Subsystem names
    sub_traction: "Тяга",
    sub_electrical: "Электрика",
    sub_braking: "Тормоза",
    sub_cooling: "Охлаждение",
    sub_speed: "Скорость",
    sub_diesel: "Дизель",
    sub_auxiliary: "Вспомог.",

    // Parameter labels
    param_speed: "Скорость",
    param_motor_temp: "Темп. двигателя",
    param_motor_current: "Ток двигателя",
    param_dc_bus: "Шина DC",
    param_catenary_v: "Контактная сеть",
    param_onboard_v: "Борт. напряжение",
    param_battery_v: "Батарея",
    param_pantograph: "Пантограф",
    param_brake_main: "Тормоз осн.",
    param_brake_res: "Тормоз рез.",
    param_brake_cyl: "Тормоз цил.",
    param_regen_power: "Рекуперация",
    param_coolant: "Охлаждающая ж.",
    param_oil_temp: "Темп. масла",
    param_oil_press: "Давл. масла",
    param_rpm: "Обороты",
    param_exhaust: "Выхлоп",
    param_fuel_level: "Уровень топлива",
    param_fuel_rate: "Расход топлива",
    param_wheel_slip: "Проскальз.",
    param_ambient: "Темп. среды",
    param_oil_idle: "Масло хол. ход",

    // Alerts page
    alerts_title: "Оповещения",
    severity_critical: "Критическое",
    severity_warning: "Предупреждение",
    severity_info: "Информация",
    filter_all: "Все",
    total: "всего",
    col_time: "Время",
    col_parameter: "Параметр",
    col_severity: "Важность",
    col_value: "Значение",
    col_threshold: "Порог",
    col_status: "Статус",
    no_alerts_found: "Оповещения не найдены",
    acknowledge: "Подтвердить",
    add_annotation: "Добавить заметку...",
    save: "Сохранить",
    annotation_label: "Заметка:",
    alert_acknowledged: "Оповещение подтверждено",
    failed_acknowledge: "Ошибка подтверждения",
    annotation_saved: "Заметка сохранена",
    failed_annotation: "Ошибка сохранения заметки",
    failed_load_alerts: "Ошибка загрузки оповещений",
    page_of: "Стр. {page} из {total}",

    // Cabin
    cabin_speed: "Скорость",
    cabin_motor_temp: "Темп. двигателя",
    cabin_brake: "Давление тормозов",
    cabin_fuel: "Уровень топлива",
    cabin_coolant: "Темп. охлаждения",
    issues_detected: "{count} проблем обнаружено",
    issue_detected: "{count} проблема обнаружена",
    cabin_related: "Связанные датчики",
    cabin_ai_title: "ИИ-помощник",
    cabin_ai_placeholder: "Спросите о локомотиве...",
    cabin_ai_send: "Отправить",

    // Trends
    trends_title: "Тренды",
    metric_speed: "Скорость (км/ч)",
    metric_motor_temp: "Температура двигателя (°C)",
    metric_brake_press: "Давление тормозов (бар)",
    metric_coolant_temp: "Температура охлаждения (°C)",
    live_btn: "В реальном времени",
    paused_btn: "Пауза",
    waiting_data: "Ожидание данных...",

    // Map
    route_label: "Маршрут: Астана → Караганда",

    // Replay
    replay_title: "Воспроизведение",
    last_5min: "Последние 5 мин",
    last_10min: "Последние 10 мин",
    last_15min: "Последние 15 мин",
    play: "Старт",
    pause: "Пауза",
    replay_frame: "Кадр {current} / {total}",
    replay_label: "Воспроизведение:",
    hi_timeline: "Хронология индекса здоровья",
    alerts_at: "Оповещения на {time}",
    no_alerts_at: "Нет оповещений в этот момент",
    loading_history: "Загрузка истории...",
    no_data_range: "Нет данных за выбранный период. Подождите несколько минут.",

    // Admin
    admin_title: "Настройки администратора",
    tab_simulation: "Симуляция",
    tab_users: "Пользователи",
    tab_export: "Экспорт",
    sim_running: "Запущен",
    sim_stopped: "Остановлен",
    sim_scenario: "Сценарий:",
    sim_uptime: "Время работы:",
    sim_start: "Запустить",
    sim_stop: "Остановить",
    sim_apply: "Применить сценарий",
    users_username: "Имя пользователя",
    users_role: "Роль",
    users_actions: "Действия",
    users_add: "Добавить пользователя",
    users_add_btn: "Добавить",
    users_fill_fields: "Заполните все поля",
    users_created: "Пользователь создан",
    users_deleted: "Пользователь удалён",
    users_pwd_reset: "Пароль сброшен",
    users_new_pwd: "Новый пароль:",
    export_last_1h: "Последний 1 час",
    export_last_6h: "Последние 6 часов",
    export_last_24h: "Последние 24 часа",
    export_btn: "Экспорт",
    export_started: "Загрузка началась",
    export_error: "Ошибка экспорта",
    export_lang: "Язык отчёта",
    export_lang_ru: "Русский",
    export_lang_kk: "Қазақша",

    // Action / alert messages
    action_check_sensor: "Проверьте подключение датчика",
    action_critical: "КРИТИЧНО: {param} = {value} — требуется немедленное вмешательство",
    action_warning: "ВНИМАНИЕ: {param} = {value} — контролируйте, готовьтесь к действиям",
    action_monitor: "Контролируйте тренд {param} — приближение к зоне предупреждения",
    action_normal: "Норма",
    alert_exceeded: "{param} превысил порог ({severity}): {value} (порог: {threshold})",
    alert_below: "{param} ниже порога ({severity}): {value} (порог: {threshold})",
  },
  kk: {
    // Nav
    digital_twin: "Digital Twin",
    nav_dashboard: "Басқару",
    nav_alerts: "Хабарламалар",
    nav_trends: "Трендтер",
    nav_map: "Карта",
    nav_replay: "Қайта ойнату",
    nav_admin: "Әкімші",
    loco_electric: "Электр",
    loco_diesel: "Дизель",

    // Connection
    live: "ЖЕЛІДЕ",
    reconnecting: "ҚАЙТА ҚОСЫЛУ",
    no_connection: "БАЙЛАНЫС ЖОҚ",

    // Login
    ktz_monitor: "ҚТЖ локомотивтерін бақылау",
    system_access: "Жүйеге кіру",
    username: "Пайдаланушы аты",
    password: "Құпия сөз",
    login_btn: "Кіру",
    login_error: "Пайдаланушы атын және құпия сөзді енгізіңіз",
    login_success: "Авторизация сәтті аяқталды",
    login_fail: "Авторизация қатесі",
    demo_credentials: "Демо: admin / admin123 · dispatcher / disp123 · cabin / cabin123",

    // Dashboard
    health_index: "Денсаулық индексі",
    realtime_condition: "Локомотивтің нақты уақыттағы жағдайы",
    excellent: "Тамаша",
    good: "Жақсы",
    warning: "Ескерту",
    critical: "Сыни",
    degradation_factors: "Тозу факторлары",
    recent_alerts: "Соңғы хабарламалар",
    subsystems: "Ішкі жүйелер",
    loading: "Жүктелуде...",
    connection_lost: "Байланыс жоқ — деректер ескірген болуы мүмкін",
    stale_data: "Деректер ескірді",
    no_connection_loco: "Локомотивпен байланыс жоқ",
    actions: "Әрекеттер",
    params: "параметр",
    all_nominal: "Барлық параметрлер қалыпты",
    no_active_alerts: "Белсенді хабарлама жоқ",
    initializing: "Іске қосылуда...",

    // Subsystem names
    sub_traction: "Тарту",
    sub_electrical: "Электрика",
    sub_braking: "Тежегіш",
    sub_cooling: "Салқындату",
    sub_speed: "Жылдамдық",
    sub_diesel: "Дизель",
    sub_auxiliary: "Қосалқы",

    // Parameter labels
    param_speed: "Жылдамдық",
    param_motor_temp: "Қозғалт. темп.",
    param_motor_current: "Қозғалт. тогы",
    param_dc_bus: "DC шина",
    param_catenary_v: "Байланыс желісі",
    param_onboard_v: "Борт кернеуі",
    param_battery_v: "Аккумулятор",
    param_pantograph: "Пантограф",
    param_brake_main: "Негізгі тежегіш",
    param_brake_res: "Резерв тежегіш",
    param_brake_cyl: "Цилиндр тежегіш",
    param_regen_power: "Рекуперация",
    param_coolant: "Салқындатқыш",
    param_oil_temp: "Май темп.",
    param_oil_press: "Май қысымы",
    param_rpm: "Айналым",
    param_exhaust: "Шығарынды",
    param_fuel_level: "Отын деңгейі",
    param_fuel_rate: "Отын шығыны",
    param_wheel_slip: "Сырғу",
    param_ambient: "Орта темп.",
    param_oil_idle: "Май бос жүріс",

    // Alerts page
    alerts_title: "Хабарламалар",
    severity_critical: "Сыни",
    severity_warning: "Ескерту",
    severity_info: "Ақпарат",
    filter_all: "Барлығы",
    total: "барлығы",
    col_time: "Уақыт",
    col_parameter: "Параметр",
    col_severity: "Маңыздылық",
    col_value: "Мән",
    col_threshold: "Шек",
    col_status: "Күй",
    no_alerts_found: "Хабарламалар табылмады",
    acknowledge: "Растау",
    add_annotation: "Жазба қосу...",
    save: "Сақтау",
    annotation_label: "Жазба:",
    alert_acknowledged: "Хабарлама расталды",
    failed_acknowledge: "Растау қатесі",
    annotation_saved: "Жазба сақталды",
    failed_annotation: "Жазбаны сақтау қатесі",
    failed_load_alerts: "Хабарламаларды жүктеу қатесі",
    page_of: "{page} / {total} бет",

    // Cabin
    cabin_speed: "Жылдамдық",
    cabin_motor_temp: "Қозғалт. темп.",
    cabin_brake: "Тежегіш қысымы",
    cabin_fuel: "Отын деңгейі",
    cabin_coolant: "Салқындату темп.",
    issues_detected: "{count} мәселе анықталды",
    issue_detected: "{count} мәселе анықталды",
    cabin_related: "Байланысты сенсорлар",
    cabin_ai_title: "ИИ-көмекші",
    cabin_ai_placeholder: "Локомотив туралы сұраңыз...",
    cabin_ai_send: "Жіберу",

    // Trends
    trends_title: "Трендтер",
    metric_speed: "Жылдамдық (км/сағ)",
    metric_motor_temp: "Қозғалтқыш температурасы (°C)",
    metric_brake_press: "Тежегіш қысымы (бар)",
    metric_coolant_temp: "Салқындату температурасы (°C)",
    live_btn: "Нақты уақытта",
    paused_btn: "Тоқтатылды",
    waiting_data: "Деректерді күту...",

    // Map
    route_label: "Бағыт: Астана → Қарағанды",

    // Replay
    replay_title: "Қайта ойнату",
    last_5min: "Соңғы 5 мин",
    last_10min: "Соңғы 10 мин",
    last_15min: "Соңғы 15 мин",
    play: "Бастау",
    pause: "Тоқтату",
    replay_frame: "Кадр {current} / {total}",
    replay_label: "Қайта ойнату:",
    hi_timeline: "Денсаулық индексі хронологиясы",
    alerts_at: "{time} хабарламалары",
    no_alerts_at: "Бұл сәтте хабарлама жоқ",
    loading_history: "Тарих жүктелуде...",
    no_data_range: "Таңдалған кезеңде деректер жоқ. Бірнеше минут күтіңіз.",

    // Admin
    admin_title: "Әкімші баптаулары",
    tab_simulation: "Симуляция",
    tab_users: "Пайдаланушылар",
    tab_export: "Экспорт",
    sim_running: "Жұмыс істеуде",
    sim_stopped: "Тоқтатылған",
    sim_scenario: "Сценарий:",
    sim_uptime: "Жұмыс уақыты:",
    sim_start: "Бастау",
    sim_stop: "Тоқтату",
    sim_apply: "Сценарий қолдану",
    users_username: "Пайдаланушы аты",
    users_role: "Рөл",
    users_actions: "Әрекеттер",
    users_add: "Пайдаланушы қосу",
    users_add_btn: "Қосу",
    users_fill_fields: "Барлық өрістерді толтырыңыз",
    users_created: "Пайдаланушы құрылды",
    users_deleted: "Пайдаланушы жойылды",
    users_pwd_reset: "Құпия сөз қалпына келтірілді",
    users_new_pwd: "Жаңа құпия сөз:",
    export_last_1h: "Соңғы 1 сағат",
    export_last_6h: "Соңғы 6 сағат",
    export_last_24h: "Соңғы 24 сағат",
    export_btn: "Экспорт",
    export_started: "Жүктеу басталды",
    export_error: "Экспорт қатесі",
    export_lang: "Есеп тілі",
    export_lang_ru: "Орысша",
    export_lang_kk: "Қазақша",

    // Action / alert messages
    action_check_sensor: "Сенсор қосылымын тексеріңіз",
    action_critical: "СЫНИ: {param} = {value} — шұғыл іс-шара қажет",
    action_warning: "ЕСКЕРТУ: {param} = {value} — бақылаңыз, дайын болыңыз",
    action_monitor: "{param} трендін бақылаңыз — ескерту аймағына жақындау",
    action_normal: "Қалыпты",
    alert_exceeded: "{param} шекті мәннен асты ({severity}): {value} (шек: {threshold})",
    alert_below: "{param} шекті мәннен төмен ({severity}): {value} (шек: {threshold})",
  },
};

interface LocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: "ru",
  setLocale: () => {},
  t: (key) => key,
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ru");

  useEffect(() => {
    const stored = localStorage.getItem("locale");
    if (stored === "kk" || stored === "ru") setLocaleState(stored);
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem("locale", l);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let str = translations[locale][key] ?? translations.ru[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replace(`{${k}}`, String(v));
        }
      }
      return str;
    },
    [locale],
  );

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}
