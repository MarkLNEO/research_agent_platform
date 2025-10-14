import { useEffect } from 'react';

type ShortcutMap = Record<string, () => void>;

export function useKeyboardShortcuts(handlers: ShortcutMap) {
  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      try {
        const selection = window.getSelection?.();
        if (selection && !selection.isCollapsed) {
          return;
        }
      } catch {
        // ignore selection errors in non-DOM environments
      }

      const key = event.key.toLowerCase();
      if (handlers[key]) {
        event.preventDefault();
        handlers[key]?.();
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [handlers]);
}
