/**
 * A short tap of the phone's motor confirming a deliberate gesture (a deadline
 * marked done), where the device has one. Never the only feedback: most
 * browsers, iOS included, have no motor to drive.
 */
export function confirmByTouch(): void {
  if ("vibrate" in navigator) navigator.vibrate(12);
}
