import { addMessages, init, locale } from "svelte-i18n";

export type AppLocale = "en" | "uk";

const STORAGE_KEY = "notify-guard-locale";
const DEFAULT_LOCALE: AppLocale = "en";
const SUPPORTED_LOCALES: AppLocale[] = ["en", "uk"];

const en = {
    app: {
        subtitle: "Device monitoring from NetBox + Telegram notifications",
        tabs: {
            devices: "Devices",
            bots: "Bots",
            logs: "Logs",
            rest: "REST Inbound",
        },
        refresh: "Refresh",
        autoRefresh: "Auto",
        language: "Language",
        sections: "Sections",
    },
    netbox: {
        title: "NetBox",
        apiUrl: "API URL",
        token: "Token",
        interval: "Monitoring interval, sec",
        save: "Save",
        sync: "Sync",
        syncing: "Syncing...",
        saved: "NetBox settings saved",
        synced: "Sync completed: {synced}/{total}",
    },
    devices: {
        searchPlaceholder: "Search device by name",
        onlyModbus: "Only modbus",
        resetFilters: "Reset filters",
        table: {
            device: "Device",
            ip: "IP",
            ping: "Ping",
            modbus: "Modbus",
            bots: "Bots",
            status: "Status",
            noResults: "Nothing found for current filter.",
            addBotHint: "Add a bot in the \"Bots\" tab",
        },
    },
    bots: {
        title: "New Telegram bot",
        name: "Name",
        token: "Token",
        add: "Add bot",
        table: {
            name: "Name",
            chats: "Chats",
            activeChats: "Active chats",
            action: "Action",
            empty: "No bots yet.",
        },
        deleted: "Bot deleted",
        settingsTitle: "Bot settings",
        loading: "Loading...",
        chatIdPlaceholder: "Chat ID",
        addChat: "Add chat",
        noChats: "There are no chats for this bot yet. Add first Chat ID.",
        mailingActive: "Mailing active",
        delete: "Delete",
        validation: {
            nameTokenRequired: "Enter bot name and token",
            chatIdRequired: "Enter Chat ID",
        },
        created: "Bot added",
    },
    history: {
        title: "Availability history",
        periodAll: "All",
        loading: "Loading history...",
        deviceMissing: "Device is no longer in database. History is unavailable.",
        empty: "No ping history yet. Enable Ping monitoring for this device and wait a few checks.",
        pingDisabledNow: "Ping monitoring is currently disabled.",
        now: "now",
        table: {
            from: "From",
            to: "To",
            status: "Status",
            duration: "Duration",
        },
        duration: {
            ongoing: "ongoing",
            invalid: "—",
            dhm: "{days}d {hours}h {minutes}m",
            hm: "{hours}h {minutes}m",
            m: "{minutes}m",
        },
    },
    logs: {
        delivery: {
            title: "Delivery history",
            subtitle: "Queued and sent notifications created inside the app.",
            empty: "No delivery history yet.",
            searchPlaceholder: "Search in message, idempotency key, or error...",
            pagination: {
                page: "Page {current} of {total}",
                prev: "Prev",
                next: "Next",
            },
            table: {
                created: "Created",
                status: "Status",
                message: "Message",
                attempts: "Attempts",
                idempotency: "Idempotency key",
                error: "Last error",
            },
        },
        rest: {
            title: "REST inbound history",
            subtitle: "Messages received from Home Assistant and other REST integrations.",
            empty: "No REST inbound messages yet.",
            searchPlaceholder: "Search in REST message...",
            table: {
                created: "Created",
                source: "Source",
                status: "Status",
                message: "Message",
                idempotency: "Idempotency key",
                action: "Action",
                view: "View",
            },
        },
        details: {
            title: "Message history",
            noKey: "No idempotency key",
            source: "Source",
            attempts: "Attempts",
            message: "Message",
            table: {
                created: "Created",
                status: "Status",
                attempts: "Attempts",
                sent: "Sent",
                next: "Next attempt",
                error: "Last error",
            },
        },
        app: {
            title: "Application logs",
            subtitle: "Backend events and request errors.",
            empty: "No application logs yet.",
            searchPlaceholder: "Search in message, scope, path, or status...",
            download: "Download .txt",
            lastTen: "Showing latest 10 records",
            table: {
                created: "Created",
                level: "Level",
                scope: "Scope",
                message: "Message",
                status: "Status",
                path: "Path",
            },
        },
    },
};

const uk = {
    app: {
        subtitle: "Моніторинг пристроїв з NetBox + Telegram сповіщення",
        tabs: {
            devices: "Пристрої",
            bots: "Боти",
            logs: "Логи",
            rest: "REST вхідні",
        },
        refresh: "Оновити",
        autoRefresh: "Авто",
        language: "Мова",
        sections: "Розділи",
    },
    netbox: {
        title: "NetBox",
        apiUrl: "URL API",
        token: "Token",
        interval: "Інтервал моніторингу, сек",
        save: "Зберегти",
        sync: "Синхронізувати",
        syncing: "Синхронізація...",
        saved: "Налаштування NetBox збережено",
        synced: "Синхронізація завершена: {synced}/{total}",
    },
    devices: {
        searchPlaceholder: "Пошук пристрою по імені",
        onlyModbus: "Тільки modbus",
        resetFilters: "Скинути фільтри",
        table: {
            device: "Пристрій",
            ip: "IP",
            ping: "Ping",
            modbus: "Modbus",
            bots: "Боти",
            status: "Статус",
            noResults: "Нічого не знайдено за поточним фільтром.",
            addBotHint: "Додайте бота у вкладці \"Боти\"",
        },
    },
    bots: {
        title: "Новий Telegram бот",
        name: "Назва",
        token: "Token",
        add: "Додати бота",
        table: {
            name: "Назва",
            chats: "Чатів",
            activeChats: "Активних чатів",
            action: "Дія",
            empty: "Ще немає жодного бота.",
        },
        deleted: "Бота видалено",
        settingsTitle: "Налаштування бота",
        loading: "Завантаження...",
        chatIdPlaceholder: "Chat ID",
        addChat: "Додати чат",
        noChats: "Для цього бота ще немає чатів. Додайте перший Chat ID.",
        mailingActive: "Розсилка активна",
        delete: "Видалити",
        validation: {
            nameTokenRequired: "Вкажіть назву і токен бота",
            chatIdRequired: "Вкажіть Chat ID",
        },
        created: "Бота додано",
    },
    history: {
        title: "Історія доступності",
        periodAll: "Усі",
        loading: "Завантаження історії...",
        deviceMissing: "Пристрою вже немає у базі. Історія недоступна.",
        empty: "Історії пінгу ще немає. Увімкніть моніторинг Ping для цього пристрою і зачекайте кілька циклів перевірки.",
        pingDisabledNow: "Зараз моніторинг Ping вимкнений.",
        now: "зараз",
        table: {
            from: "З",
            to: "По",
            status: "Статус",
            duration: "Тривалість",
        },
        duration: {
            ongoing: "триває",
            invalid: "—",
            dhm: "{days}д {hours}г {minutes}хв",
            hm: "{hours}г {minutes}хв",
            m: "{minutes}хв",
        },
    },
    logs: {
        delivery: {
            title: "Історія відправок",
            subtitle: "Черга та відправлені сповіщення, створені всередині застосунку.",
            empty: "Історія відправок поки порожня.",
            searchPlaceholder: "Пошук у повідомленні, idempotency key або помилці...",
            pagination: {
                page: "Сторінка {current} з {total}",
                prev: "Назад",
                next: "Далі",
            },
            table: {
                created: "Створено",
                status: "Статус",
                message: "Повідомлення",
                attempts: "Спроби",
                idempotency: "Idempotency key",
                error: "Остання помилка",
            },
        },
        rest: {
            title: "REST вхідні повідомлення",
            subtitle: "Повідомлення з Home Assistant та інших REST-інтеграцій.",
            empty: "REST-вхідних повідомлень поки немає.",
            searchPlaceholder: "Пошук у REST-повідомленні...",
            table: {
                created: "Створено",
                source: "Джерело",
                status: "Статус",
                message: "Повідомлення",
                idempotency: "Idempotency key",
                action: "Дія",
                view: "Переглянути",
            },
        },
        details: {
            title: "Історія повідомлення",
            noKey: "Без idempotency key",
            source: "Джерело",
            attempts: "Спроби",
            message: "Повідомлення",
            table: {
                created: "Створено",
                status: "Статус",
                attempts: "Спроби",
                sent: "Відправлено",
                next: "Наступна спроба",
                error: "Остання помилка",
            },
        },
        app: {
            title: "Логи застосунку",
            subtitle: "Події бекенда та помилки запитів.",
            empty: "Логи застосунку поки порожні.",
            searchPlaceholder: "Пошук у повідомленні, scope, шляху або статусі...",
            download: "Завантажити .txt",
            lastTen: "Показано останні 10 записів",
            table: {
                created: "Створено",
                level: "Рівень",
                scope: "Scope",
                message: "Повідомлення",
                status: "Статус",
                path: "Шлях",
            },
        },
    },
};

addMessages("en", en);
addMessages("uk", uk);

function resolveInitialLocale(): AppLocale {
    if (typeof window === "undefined") {
        return DEFAULT_LOCALE;
    }

    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "uk") {
        return stored;
    }

    const browserLanguage = window.navigator.language.toLowerCase();
    return browserLanguage.startsWith("uk") ? "uk" : DEFAULT_LOCALE;
}

const initialLocale = resolveInitialLocale();

init({
    fallbackLocale: DEFAULT_LOCALE,
    initialLocale,
});

locale.set(initialLocale);

export function setAppLocale(nextLocale: AppLocale) {
    const value = SUPPORTED_LOCALES.includes(nextLocale)
        ? nextLocale
        : DEFAULT_LOCALE;

    locale.set(value);

    if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, value);
    }
}

export function normalizeLocale(value: string | null | undefined): AppLocale {
    if (value === "uk") {
        return "uk";
    }

    if (value === "en") {
        return "en";
    }

    return DEFAULT_LOCALE;
}
