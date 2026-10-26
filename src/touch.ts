/** Continuous 360-degree input with a small dead zone and normalized outer radius. */
export function joystickVector(dx: number, dy: number, radius = 45): { x: number; y: number } {
  const distance = Math.hypot(dx, dy);
  const magnitude = Math.min(1, distance / radius);
  const deadZone = 0.12;
  if (magnitude <= deadZone) return { x: 0, y: 0 };
  const strength = (magnitude - deadZone) / (1 - deadZone);
  return { x: dx / distance * strength, y: dy / distance * strength };
}
