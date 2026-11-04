import React, { useLayoutEffect, useRef } from "react";

/** Keep the score node in place so updates do not disturb surrounding controls. */
export function UpdatedScore({
  value,
  gameId,
}: {
  value: string | null;
  gameId: string;
}): React.ReactElement {
  const node = useRef<HTMLSpanElement>(null);
  const previous = useRef({ value, gameId });

  useLayoutEffect(() => {
    const changed =
      previous.current.gameId === gameId && previous.current.value !== value;
    previous.current = { value, gameId };
    const element = node.current;
    if (
      !changed ||
      !element ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const animation = element.animate([{ opacity: 0.55 }, { opacity: 1 }], {
      duration: 220,
      easing: "ease-out",
    });
    return () => animation.cancel();
  }, [value, gameId]);

  return (
    <span ref={node} data-live-score>
      {value ?? "-"}
    </span>
  );
}
