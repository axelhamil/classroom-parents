export type TouchFeedback = "lift" | "step" | "drop";

const TOUCH_FEEDBACK_MS: Record<TouchFeedback, number> = { lift: 10, step: 6, drop: 12 };

/**
 * A short tap of the phone's motor answering a gesture: a block lifted, moved
 * one place, dropped, where the device has one. Never the only feedback: most
 * browsers, iOS included, have no motor to drive.
 */
export function touchFeedback(kind: TouchFeedback): void {
  if ("vibrate" in navigator) navigator.vibrate(TOUCH_FEEDBACK_MS[kind]);
}

/** Confirms a deliberate gesture (a deadline marked done) with the drop tap. */
export function confirmByTouch(): void {
  touchFeedback("drop");
}
