import { useEffect, useRef } from "react";

export function shouldCloseEditorOnEscape(
  event: Pick<KeyboardEvent, "key" | "defaultPrevented">,
): boolean {
  return event.key === "Escape" && !event.defaultPrevented;
}

/**
 * Radix overlays handle Escape during document capture and mark it defaultPrevented,
 * so this listener must remain in the bubble phase on window.
 */
export function useEditorEscape(active: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) {
      return;
    }

    const handler = (event: KeyboardEvent): void => {
      if (shouldCloseEditorOnEscape(event)) {
        onCloseRef.current();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active]);
}
