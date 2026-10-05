import { Device, LocationPoint, Room, Worker } from "@/types/rtls";
export const worker: Worker = { id: "worker-001", name: "Rahul Kumar", employeeId: "WORKER-001", tagId: "TAG-001", beaconId: "BEACON-001", gatewayId: "GATEWAY-001" };
export const device: Device = { id: "TAG-001", name: "TAG-001", tagId: "TAG-001", status: "Online", battery: 87 };
export const rooms: Room[] = [
  { id: "R", name: "Room 1", type: "room", bounds: { x: 90, y: 85, width: 350, height: 195 }, fill: "#eef2f5" },
  { id: "VER", name: "Room 2", type: "room", bounds: { x: 440, y: 85, width: 470, height: 195 }, fill: "#eef2f5" },
  { id: "C", name: "Corridor", type: "corridor", bounds: { x: 240, y: 280, width: 670, height: 225 }, fill: "#edf1f5" }
];
export const locationSequence: LocationPoint[] = [
  { x: 250, y: 165, timestamp: "09:41:00" }, { x: 390, y: 165, timestamp: "09:41:08" }, { x: 430, y: 180, timestamp: "09:41:16" }, { x: 450, y: 180, timestamp: "09:41:24" }, { x: 525, y: 240, timestamp: "09:41:32" }, { x: 525, y: 280, timestamp: "09:41:40" }, { x: 300, y: 350, timestamp: "09:41:48" }, { x: 230, y: 350, timestamp: "09:41:56" }, { x: 200, y: 350, timestamp: "09:42:04" }, { x: 230, y: 350, timestamp: "09:42:12" }, { x: 300, y: 350, timestamp: "09:42:20" }, { x: 300, y: 450, timestamp: "09:42:28" }, { x: 230, y: 450, timestamp: "09:42:36" }, { x: 200, y: 450, timestamp: "09:42:44" }, { x: 230, y: 450, timestamp: "09:42:52" }, { x: 300, y: 450, timestamp: "09:43:00" }, { x: 525, y: 280, timestamp: "09:43:08" }, { x: 600, y: 180, timestamp: "09:43:16" }
];
// Mock-only signal readings keyed to the normalized location sequence.
// A future WebSocket adapter can replace this with its signal field.
export const signalSequence = ["-54 dBm", "-53 dBm", "-57 dBm", "-60 dBm", "-58 dBm", "-55 dBm", "-52 dBm", "-50 dBm"];
