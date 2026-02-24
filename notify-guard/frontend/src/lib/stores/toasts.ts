import { writable } from "svelte/store";

export type Toast = {
    id: number;
    message: string;
    kind: "success" | "error";
};

export const toastsStore = writable<Toast[]>([]);

export function pushToast(message: string, kind: Toast["kind"]) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    toastsStore.update((items) => [...items, { id, message, kind }]);

    setTimeout(() => {
        toastsStore.update((items) => items.filter((toast) => toast.id !== id));
    }, 3500);
}

export function removeToast(id: number) {
    toastsStore.update((items) => items.filter((toast) => toast.id !== id));
}
