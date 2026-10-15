import React from "react";

/** Identifying illustrations; these do not depict live phase, orientation, or scale. */
export function PlanetGlyph({ body }: { body: string }): React.ReactElement {
  const markings = (() => {
    switch (body) {
      case "Mercury":
        return (
          <>
            <circle cx="19" cy="19" r="3" />
            <circle cx="29" cy="27" r="4" />
            <circle cx="18" cy="30" r="1.5" />
          </>
        );
      case "Venus":
        return (
          <>
            <path d="M14 20 Q23 15 34 20 M11 25 Q24 20 37 25 M15 30 Q25 26 33 30" />
          </>
        );
      case "Mars":
        return (
          <>
            <path d="M16 15 L21 19 L18 24 L24 28 L22 36 M29 13 L28 18 L33 22" />
            <circle cx="30" cy="29" r="2" />
          </>
        );
      case "Jupiter":
        return (
          <>
            <path d="M14 16 Q24 19 34 16 M11 23 Q24 26 37 23 M12 29 Q24 32 36 29" />
            <ellipse cx="29" cy="30" rx="4" ry="2" />
          </>
        );
      case "Saturn":
        return (
          <>
            <path d="M17 21 Q24 23 31 21 M16 26 Q24 28 32 26" />
            <ellipse
              cx="24"
              cy="24"
              rx="21"
              ry="6"
              transform="rotate(-25 24 24)"
            />
          </>
        );
      case "Uranus":
        return (
          <>
            <path d="M15 20 Q24 23 33 20 M13 27 Q24 30 35 27" />
            <ellipse
              cx="24"
              cy="24"
              rx="6"
              ry="20"
              transform="rotate(25 24 24)"
            />
          </>
        );
      case "Neptune":
        return (
          <>
            <path d="M15 17 Q24 20 33 17 M11 25 Q24 21 37 25 M15 32 Q24 28 33 32" />
            <ellipse cx="20" cy="24" rx="3" ry="1.5" />
          </>
        );
      default:
        return null;
    }
  })();

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 48 48"
      className="h-10 w-10 shrink-0 text-primary"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle
        cx="24"
        cy="24"
        r={body === "Saturn" ? 10 : 14}
        className="fill-primary/10"
      />
      {markings}
    </svg>
  );
}
