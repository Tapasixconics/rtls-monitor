import { rooms } from "@/data/mockRtlsData";
import { Geofence } from "@/types/rtls";

export const geofences: Geofence[] = rooms.map(({ id, name, type, bounds }) => ({ id, name, type, label: name, bounds: { xMin: bounds.x, xMax: bounds.x + bounds.width, yMin: bounds.y, yMax: bounds.y + bounds.height } }));

export function detectArea(x: number, y: number, geofences: Geofence[]): Geofence | null {
  return geofences.find(({ bounds }) => x >= bounds.xMin && x <= bounds.xMax && y >= bounds.yMin && y <= bounds.yMax) ?? null;
}

export function detectRoom(x: number, y: number) {
  return detectArea(x, y, geofences)?.id ?? null;
}
