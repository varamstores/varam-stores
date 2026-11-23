// Tiny toast store for the admin: toast.success('Saved') / toast.error('…'). Rendered by <Toaster />.
export interface ToastItem { id: number; kind: 'success' | 'error' | 'info'; text: string }

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<(t: ToastItem[]) => void>();
const emit = () => listeners.forEach((l) => l(items));

function push(kind: ToastItem['kind'], text: string) {
  const id = nextId++;
  items = [...items.slice(-3), { id, kind, text }];
  emit();
  window.setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 3500);
}

export function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

export function subscribe(l: (t: ToastItem[]) => void) {
  listeners.add(l);
  l(items);
  return () => { listeners.delete(l); };
}

export const toast = {
  success: (text: string) => push('success', text),
  error: (text: string) => push('error', text),
  info: (text: string) => push('info', text),
};
