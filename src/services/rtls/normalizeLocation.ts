import { NormalizedLocation } from "@/types/rtls";

export type RtlsMessage = Partial<NormalizedLocation> & { workerId?: string; tagId?: string; beaconId?: string; gatewayId?: string; x: number; y: number; timestamp: string };

export function normalizeLocation(message: RtlsMessage, fallback: Pick<NormalizedLocation, "workerId" | "tagId" | "beaconId" | "gatewayId" | "signal" | "battery">): NormalizedLocation {
  return { workerId: message.workerId ?? fallback.workerId, tagId: message.tagId ?? fallback.tagId, beaconId: message.beaconId ?? fallback.beaconId, gatewayId: message.gatewayId ?? fallback.gatewayId, timestamp: message.timestamp, x: message.x, y: message.y, signal: message.signal ?? fallback.signal, battery: message.battery ?? fallback.battery };
}
