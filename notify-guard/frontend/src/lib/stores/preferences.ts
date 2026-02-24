import { writable } from "svelte/store";
import { normalizeLocale, setAppLocale, type AppLocale } from "$lib/i18n";

const THEME_STORAGE_KEY = "notify-guard-theme";

export const appLocaleStore = writable<AppLocale>("en");
export const isDarkThemeStore = writable(false);

export function initializeAppLocale(rawLocale: string | null | undefined) {
    appLocaleStore.set(normalizeLocale(rawLocale ?? "en"));
}

export function setLanguage(nextLocale: AppLocale) {
    appLocaleStore.set(nextLocale);
    setAppLocale(nextLocale);
}

export function initializeTheme() {
    if (typeof window === "undefined") {
        return;
    }

    const root = document.documentElement;
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);

    const shouldUseDark = savedTheme
        ? savedTheme === "dark"
        : root.classList.contains("dark") ||
        window.matchMedia("(prefers-color-scheme: dark)").matches;

    applyTheme(shouldUseDark);
    isDarkThemeStore.set(shouldUseDark);
}

export function toggleTheme(checked: boolean) {
    isDarkThemeStore.set(checked);
    applyTheme(checked);
}

function applyTheme(isDark: boolean) {
    if (typeof window === "undefined") {
        return;
    }

    const root = document.documentElement;
    root.classList.toggle("dark", isDark);
    localStorage.setItem(THEME_STORAGE_KEY, isDark ? "dark" : "light");
}
