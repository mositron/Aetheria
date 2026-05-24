// Single-active-modal guarantee. Any modal that opts in by calling
// useExclusiveModal(id, open, setOpen) will auto-close itself when ANY
// other modal opens. Uses a window CustomEvent so panels don't need to
// know about each other.

import { useEffect } from "react";
import type { PanelId } from "../store";

const EVENT = "modal-opened";

export function useExclusiveModal(
  id: PanelId,
  open: boolean,
  setOpen: (v: boolean) => void,
) {
  useEffect(() => {
    if (open) {
      window.dispatchEvent(new CustomEvent(EVENT, { detail: { id } }));
    }
    const onOpened = (e: Event) => {
      const detail = (e as CustomEvent<{ id: PanelId }>).detail;
      if (detail?.id !== id && open) setOpen(false);
    };
    window.addEventListener(EVENT, onOpened);
    return () => window.removeEventListener(EVENT, onOpened);
  }, [open, id, setOpen]);
}
