import { LocationPoint } from "@/types/rtls";

export function getMovementStatus(previous: LocationPoint | undefined, current: LocationPoint, threshold = 2) {
  if (!previous) return "Stationary";
  return Math.hypot(current.x - previous.x, current.y - previous.y) > threshold ? "Moving" : "Stationary";
}

export function getSignalQuality(dbm: string) {
  const value = Number.parseInt(dbm, 10);
  if (value >= -60) return "Good";
  if (value >= -75) return "Moderate";
  return "Weak";
}

export function getRelativeTime(timestamp: string) {
  const [hours, minutes, seconds] = timestamp.split(":").map(Number);
  const total = hours * 3600 + minutes * 60 + seconds;
  const latest = new Date();
  const now = latest.getHours() * 3600 + latest.getMinutes() * 60 + latest.getSeconds();
  return `${Math.max(0, now - total)} sec ago`;
}
