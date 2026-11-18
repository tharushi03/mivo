// How a piece of clothing fitted, as buyers answer it in a review. Client-safe.
export const FIT_OPTIONS = ["SMALL", "TRUE", "LARGE"] as const;
export type Fit = (typeof FIT_OPTIONS)[number];

export const FIT_LABEL: Record<Fit, string> = {
  SMALL: "Runs small",
  TRUE: "True to size",
  LARGE: "Runs large",
};

export const isFit = (v: unknown): v is Fit => typeof v === "string" && (FIT_OPTIONS as readonly string[]).includes(v);
