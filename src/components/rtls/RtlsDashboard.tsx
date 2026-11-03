"use client";

import { useEffect, useMemo, useState } from "react";
import { MovementEvent } from "@/types/rtls";
import { roomEmployees as fallbackEmployees } from "@/data/mockRtlsData";

const CONFIGURED_API_BASE = (process.env.NEXT_PUBLIC_RTLS_API_URL || "/api/ips").replace(/\/+$/, "");

function apiUrl(path: string): string {
  const apiBase = /\/api(?:\/ips)?$/.test(CONFIGURED_API_BASE)
    ? CONFIGURED_API_BASE
    : `${CONFIGURED_API_BASE}/api`;
  return `${apiBase}/${path.replace(/^\/+/, "")}`;
}

export const NORTH_GW_MAC = "FCE8C07E0214";
export const SOUTH_GW_MAC = "FCE8C07D10D4";

export function formatMac(mac?: string): string {
  if (!mac) return "N/A";
  const clean = mac.replace(/[^A-Fa-f0-9]/g, "").toUpperCase();
  if (clean.length === 12) {
    return clean.match(/.{1,2}/g)?.join(":") ?? mac;
  }
  return mac;
}

export const GATEWAYS: Record<
  string,
  { x: number; y: number; roomKey: string; name: string; shortName: string; zoneName: string }
> = {
  [NORTH_GW_MAC]: {
    x: 500,
    y: 54,
    roomKey: "NORTH",
    name: "Gateway XC015137",
    shortName: "North (XC015137)",
    zoneName: "Zone North (Entrance)",
  },
  [SOUTH_GW_MAC]: {
    x: 500,
    y: 430,
    roomKey: "SOUTH",
    name: "Gateway XC210864",
    shortName: "South (XC210864)",
    zoneName: "Zone South (Workstations)",
  },
};

export type Employee = {
  employeeId: string;
  employeeName: string;
  department: string | null;
  bleMac: string;
};

export type Location = Employee & {
  gatewayMac: string;
  gatewayName: string;
  currentZone: string;
  rssi: number;
  sampleCount: number;
  lastSeenAt: string;
  secondsAgo: number;
  x?: number;
  y?: number;
  ratio?: number;
  isMidpoint?: boolean;
  rssiGw1?: number;
  rssiGw2?: number;
};

export type Update = Partial<Employee> & {
  bleMac: string;
  x?: number;
  y?: number;
  ratio?: number;
  isMidpoint?: boolean;
  zone?: string;
  rssiGw1?: number;
  rssiGw2?: number;
};

export type GatewayHealth = {
  mac: string;
  name: string;
  shortName: string;
  status: "online" | "lost" | "unseen";
  lastSeen: number | null;
  rssi: number | null;
};

// Target positions inside Zone North matching the screenshot layout
const NORTH_SLOTS = [
  { x: 335, y: 182 },
  { x: 352, y: 224 },
  { x: 530, y: 168 },
  { x: 260, y: 195 },
  { x: 620, y: 205 },
  { x: 420, y: 155 },
];

// Target positions inside Zone South
const SOUTH_SLOTS = [
  { x: 420, y: 410 },
  { x: 580, y: 430 },
  { x: 330, y: 440 },
  { x: 660, y: 400 },
  { x: 490, y: 470 },
  { x: 270, y: 390 },
];

function resolveGateway(
  update: Update,
  prevLoc?: Location
): { gatewayMac: string; currentZone: string; rssi: number; x?: number; y?: number } {
  const isExplicitSouthZone = Boolean(
    update.zone &&
      (update.zone.toUpperCase().includes("SOUTH") ||
        update.zone.toUpperCase().includes("WORKSTATION"))
  );
  const isExplicitNorthZone = Boolean(
    update.zone &&
      (update.zone.toUpperCase().includes("NORTH") ||
        update.zone.toUpperCase().includes("ENTRANCE"))
  );

  const gw1Rssi = update.rssiGw1;
  const gw2Rssi = update.rssiGw2;

  let targetMac = NORTH_GW_MAC;

  // 1. Explicit zone takes priority
  if (isExplicitSouthZone) {
    targetMac = SOUTH_GW_MAC;
  } else if (isExplicitNorthZone) {
    targetMac = NORTH_GW_MAC;
  }
  // 2. Direct RSSI comparison with 3 dBm hysteresis to avoid rapid flipping
  else if (typeof gw1Rssi === "number" && typeof gw2Rssi === "number") {
    if (prevLoc?.gatewayMac === SOUTH_GW_MAC) {
      targetMac = gw1Rssi > gw2Rssi + 3 ? NORTH_GW_MAC : SOUTH_GW_MAC;
    } else {
      targetMac = gw2Rssi > gw1Rssi + 3 ? SOUTH_GW_MAC : NORTH_GW_MAC;
    }
  }
  // 3. Single gateway reporting
  else if (typeof gw2Rssi === "number" && typeof gw1Rssi !== "number") {
    targetMac = SOUTH_GW_MAC;
  } else if (typeof gw1Rssi === "number" && typeof gw2Rssi !== "number") {
    targetMac = NORTH_GW_MAC;
  }
  // 4. Server ratio
  else if (typeof update.ratio === "number") {
    targetMac = update.ratio >= 0.5 ? SOUTH_GW_MAC : NORTH_GW_MAC;
  }
  // 5. Retain previous gateway instead of reverting to North
  else if (prevLoc?.gatewayMac) {
    targetMac = prevLoc.gatewayMac;
  }

  const chosenGw = GATEWAYS[targetMac] ?? GATEWAYS[NORTH_GW_MAC];
  const currentZone = update.zone || chosenGw.zoneName;

  let rssi = -70;
  if (targetMac === SOUTH_GW_MAC) {
    rssi = gw2Rssi ?? gw1Rssi ?? prevLoc?.rssi ?? -70;
  } else {
    rssi = gw1Rssi ?? gw2Rssi ?? prevLoc?.rssi ?? -70;
  }

  return {
    gatewayMac: targetMac,
    currentZone,
    rssi,
    x: update.x,
    y: update.y,
  };
}

type PositionedLocation = Location & {
  renderX: number;
  renderY: number;
  labelAnchor: "start" | "end";
  labelOffsetX: number;
};

function computeNonOverlappingPositions(
  group: Location[],
  isSouthZone: boolean
): PositionedLocation[] {
  if (group.length === 0) return [];

  const bounds = isSouthZone
    ? { xMin: 95, xMax: 870, yMin: 335, yMax: 515 }
    : { xMin: 95, xMax: 870, yMin: 85, yMax: 265 };

  const slots = isSouthZone ? SOUTH_SLOTS : NORTH_SLOTS;

  // 1. Assign base coordinates
  const items = group.map((loc, idx) => {
    let x = loc.x;
    let y = loc.y;

    if (
      typeof x !== "number" ||
      typeof y !== "number" ||
      isNaN(x) ||
      isNaN(y) ||
      (x === 0 && y === 0)
    ) {
      const slot = slots[idx % slots.length];
      x = slot.x;
      y = slot.y;
    } else {
      x = Math.max(bounds.xMin, Math.min(bounds.xMax, x));
      y = Math.max(bounds.yMin, Math.min(bounds.yMax, y));
    }

    return { loc, x, y };
  });

  // 2. Identify tight clusters (distance < 50px) and disperse in an orbit
  const CLUSTER_DIST = 50;
  const clustered = new Set<number>();

  for (let i = 0; i < items.length; i++) {
    if (clustered.has(i)) continue;
    const cluster = [i];
    clustered.add(i);

    for (let j = i + 1; j < items.length; j++) {
      if (clustered.has(j)) continue;
      const d = Math.hypot(items[i].x - items[j].x, items[i].y - items[j].y);
      if (d < CLUSTER_DIST) {
        cluster.push(j);
        clustered.add(j);
      }
    }

    if (cluster.length > 1) {
      let avgX = 0;
      let avgY = 0;
      for (const idx of cluster) {
        avgX += items[idx].x;
        avgY += items[idx].y;
      }
      avgX /= cluster.length;
      avgY /= cluster.length;

      const radius = 42 + (cluster.length - 2) * 10;
      cluster.forEach((memberIdx, rank) => {
        const angle = (2 * Math.PI * rank) / cluster.length - Math.PI / 2;
        let nx = avgX + radius * Math.cos(angle);
        let ny = avgY + radius * Math.sin(angle);

        nx = Math.max(bounds.xMin, Math.min(bounds.xMax, nx));
        ny = Math.max(bounds.yMin, Math.min(bounds.yMax, ny));

        items[memberIdx].x = nx;
        items[memberIdx].y = ny;
      });
    }
  }

  // 3. Iterative relaxation to guarantee a minimum distance of 60px between any two tags
  const MIN_DIST = 60;
  for (let iter = 0; iter < 8; iter++) {
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        let dx = items[j].x - items[i].x;
        let dy = items[j].y - items[i].y;
        let dist = Math.hypot(dx, dy);

        if (dist < MIN_DIST) {
          if (dist === 0) {
            dx = (i % 2 === 0 ? 1 : -1) * (MIN_DIST / 2);
            dy = (j % 2 === 0 ? 1 : -1) * (MIN_DIST / 2);
            dist = Math.hypot(dx, dy);
          }

          const push = (MIN_DIST - dist) / 2;
          const nx = (dx / dist) * push;
          const ny = (dy / dist) * push;

          items[i].x = Math.max(bounds.xMin, Math.min(bounds.xMax, items[i].x - nx));
          items[i].y = Math.max(bounds.yMin, Math.min(bounds.yMax, items[i].y - ny));
          items[j].x = Math.max(bounds.xMin, Math.min(bounds.xMax, items[j].x + nx));
          items[j].y = Math.max(bounds.yMin, Math.min(bounds.yMax, items[j].y + ny));
        }
      }
    }
  }

  return items.map(({ loc, x, y }) => {
    const isNearRightWall = x > 740;
    return {
      ...loc,
      renderX: Math.round(x),
      renderY: Math.round(y),
      labelAnchor: isNearRightWall ? "end" : "start",
      labelOffsetX: isNearRightWall ? -16 : 16,
    };
  });
}

function RtlsMap({
  locations,
  selectedId,
  onSelect,
  gatewayStates,
}: {
  locations: Location[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  gatewayStates: Record<string, GatewayHealth>;
}) {
  const northPositioned = useMemo(
    () =>
      computeNonOverlappingPositions(
        locations.filter(
          (loc) =>
            loc.gatewayMac === NORTH_GW_MAC && !loc.currentZone.toUpperCase().includes("SOUTH")
        ),
        false
      ),
    [locations]
  );

  const southPositioned = useMemo(
    () =>
      computeNonOverlappingPositions(
        locations.filter(
          (loc) => loc.gatewayMac === SOUTH_GW_MAC || loc.currentZone.toUpperCase().includes("SOUTH")
        ),
        true
      ),
    [locations]
  );

  const allPositioned = useMemo(
    () => [...northPositioned, ...southPositioned],
    [northPositioned, southPositioned]
  );

  return (
    <div className="map-wrap">
      <svg
        className="floor-map"
        viewBox="0 0 1000 585"
        role="img"
        aria-label="Live indoor RTLS floor plan"
      >
        <defs>
          {/* Subtle background grid pattern */}
          <pattern id="grid-pattern" width="45" height="45" patternUnits="userSpaceOnUse">
            <path
              d="M 45 0 L 0 0 0 45"
              fill="none"
              stroke="#0f192b"
              strokeWidth="0.8"
              strokeOpacity="0.7"
            />
          </pattern>

          {/* Purple glow filter matching the screenshot aesthetic */}
          <filter id="purple-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Cyan glow for active selection or gateway */}
          <filter id="cyan-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Map Background Canvas */}
        <rect width="1000" height="620" fill="#070c18" />

        {/* Grid Overlay */}
        <rect x="40" y="30" width="920" height="530" fill="url(#grid-pattern)" />

        {/* Outer Dashed Cyan Perimeter (Matches Screenshot) */}
        <rect
          x="40"
          y="30"
          width="920"
          height="530"
          rx="6"
          fill="none"
          stroke="#06b6d4"
          strokeWidth="1.5"
          strokeDasharray="7 6"
          strokeOpacity="0.85"
        />

        {/* Center Vertical Guideline */}
        <line
          x1="500"
          y1="40"
          x2="500"
          y2="550"
          stroke="#101d33"
          strokeWidth="1"
          strokeDasharray="4 4"
        />

        {/* ========================================================= */}
        {/* ZONE NORTH (ENTRANCE) - Matches Screenshot                */}
        {/* ========================================================= */}
        <g id="zone-north">
          {/* Zone North Container Box with subtle slate border */}
          <rect
            x="52"
            y="42"
            width="896"
            height="250"
            rx="4"
            fill="#091222"
            fillOpacity="0.75"
            stroke="#eb9006ff"
            strokeWidth="1.5"
          />

          {/* Zone North Title */}
          <text x="74" y="74" fill="#f8fafc" fontSize="16" fontWeight="700" letterSpacing="-0.01em">
            Zone North (Entrance)
          </text>

          {/* Center Anchor Square */}
          <rect x="496" y="186" width="7" height="7" fill="#475569" rx="1.5" />
        </g>

        {/* ========================================================= */}
        {/* ZONE SOUTH (WORKSTATIONS) - Matches Screenshot            */}
        {/* ========================================================= */}
        <g id="zone-south">
          {/* Zone South Container Box with vibrant green border */}
          <rect
            x="52"
            y="300"
            width="896"
            height="250"
            rx="4"
            fill="#051918"
            fillOpacity="0.8"
            stroke="#16e161ff"
            strokeWidth="1.5"
          />

          {/* Zone South Title */}
          <text x="74" y="332" fill="#f8fafc" fontSize="16" fontWeight="700" letterSpacing="-0.01em">
            Zone South (Workstations)
          </text>

          {/* Center Anchor Square */}
          <rect x="496" y="426" width="7" height="7" fill="#475569" rx="1.5" />
        </g>

        {/* ========================================================= */}
        {/* WORKER TAGS (Non-Overlapping Glowing Purple Circles)      */}
        {/* ========================================================= */}
        {allPositioned.map((loc) => {
          const isSelected = loc.employeeId === selectedId;

          return (
            <g
              key={loc.employeeId || loc.bleMac}
              transform={`translate(${loc.renderX} ${loc.renderY})`}
              onClick={() => onSelect(loc.employeeId)}
              style={{ cursor: "pointer", transition: "transform 0.4s ease-out" }}
            >
              {/* Soft Purple Glow Aura */}
              <circle
                r={isSelected ? 22 : 16}
                fill="#a855f7"
                fillOpacity={isSelected ? 0.45 : 0.28}
                filter="url(#purple-glow)"
              />

              {/* Active Selection Pulse Ring */}
              {isSelected && (
                <circle
                  r="18"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="2"
                  strokeDasharray="3 3"
                >
                  <animate attributeName="r" values="14;26;14" dur="2s" repeatCount="indefinite" />
                  <animate
                    attributeName="stroke-opacity"
                    values="1;0.4;1"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}

              {/* Core Purple Dot */}
              <circle
                r={isSelected ? 9 : 7.5}
                fill={isSelected ? "#c084fc" : "#a855f7"}
                stroke="#ffffff"
                strokeWidth="1.5"
                strokeOpacity="0.85"
              />
              <circle r="2.5" fill="#ffffff" />

              {/* Worker Name with dark outline halo to prevent overlapping blur */}
              <text
                x={loc.labelOffsetX}
                y="-8"
                textAnchor={loc.labelAnchor}
                fill={isSelected ? "#ffffff" : "#f1f5f9"}
                fontSize={isSelected ? "12" : "11"}
                fontWeight={isSelected ? "700" : "600"}
                style={{
                  paintOrder: "stroke fill",
                  stroke: "#070c18",
                  strokeWidth: "3.5px",
                  strokeLinejoin: "round",
                }}
              >
                {loc.employeeName || loc.employeeId}
                {loc.isMidpoint ? " ⚡" : ""}
              </text>

              {/* RSSI Label with dark outline halo */}
              <text
                x={loc.labelOffsetX}
                y="7"
                textAnchor={loc.labelAnchor}
                fill="#94a3b8"
                fontSize="10"
                fontWeight="500"
                style={{
                  paintOrder: "stroke fill",
                  stroke: "#070c18",
                  strokeWidth: "3px",
                  strokeLinejoin: "round",
                }}
              >
                {loc.rssi} dBm
              </text>

              <title>
                {loc.employeeName} · {loc.currentZone} ({loc.rssi} dBm)
              </title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function RtlsDashboard() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<MovementEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [gatewayStates, setGatewayStates] = useState<Record<string, GatewayHealth>>({
    [NORTH_GW_MAC]: {
      mac: NORTH_GW_MAC,
      name: GATEWAYS[NORTH_GW_MAC].name,
      shortName: GATEWAYS[NORTH_GW_MAC].shortName,
      status: "online",
      lastSeen: null, // will be set on first real packet
      rssi: -58,
    },
    [SOUTH_GW_MAC]: {
      mac: SOUTH_GW_MAC,
      name: GATEWAYS[SOUTH_GW_MAC].name,
      shortName: GATEWAYS[SOUTH_GW_MAC].shortName,
      status: "online",
      lastSeen: null, // will be set on first real packet
      rssi: -64,
    },
  });

  // Fetch initial employee list
  useEffect(() => {
    let alive = true;
    fetch(apiUrl("employees"))
      .then((r) => r.json())
      .then((json) => {
        if (alive && json.status === "success") {
          setEmployees(json.data);
        }
      })
      .catch(() => {
        if (alive) {
          // Initialize demo roster if backend is not yet accessible
          const mocks: Employee[] = fallbackEmployees.map((e) => ({
            employeeId: e.employeeId,
            employeeName: e.name,
            department: "Operations",
            bleMac: e.tagId,
          }));
          setEmployees(mocks);

          // Populate with 3 initial tags in Zone North matching screenshot
          const initialLocations: Location[] = mocks.map((m, idx) => ({
            ...m,
            gatewayMac: NORTH_GW_MAC,
            gatewayName: GATEWAYS[NORTH_GW_MAC].name,
            currentZone: "Zone North (Entrance)",
            rssi: -54 - idx * 4,
            sampleCount: 1,
            lastSeenAt: new Date().toISOString(),
            secondsAgo: 0,
            x: NORTH_SLOTS[idx % NORTH_SLOTS.length].x,
            y: NORTH_SLOTS[idx % NORTH_SLOTS.length].y,
            rssiGw1: -54 - idx * 4,
            rssiGw2: -78 - idx * 2,
          }));
          setLocations(initialLocations);
        }
      });

    return () => {
      alive = false;
    };
  }, []);

  // Subscribe to live locations via SSE and poll initial locations
  useEffect(() => {
    let alive = true;

    fetch(`${apiUrl("locations")}?window=60`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (alive && json.status === "success" && Array.isArray(json.data) && json.data.length > 0) {
          setLocations(json.data);
        }
      })
      .catch(() => {
        // live feed fallback already populated
      });

    const source = new EventSource(apiUrl("locations/stream"));

    source.addEventListener("location", (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data);
        const update: Update = payload.data;
        if (payload.type !== "LOCATION_UPDATE" || !update?.bleMac) return;

        const now = Date.now();

        // Track heartbeat and health of gateways.
        // Update on explicit RSSI fields OR on any packet that indicates
        // which gateway is actively seeing this tag (via zone or ratio).
        setGatewayStates((prev) => {
          const next = { ...prev };

          // Update North gateway heartbeat if rssiGw1 is present
          if (update.rssiGw1 !== undefined) {
            next[NORTH_GW_MAC] = {
              ...next[NORTH_GW_MAC],
              status: "online",
              lastSeen: now,
              rssi: update.rssiGw1,
            };
          }

          // Update South gateway heartbeat if rssiGw2 is present
          if (update.rssiGw2 !== undefined) {
            next[SOUTH_GW_MAC] = {
              ...next[SOUTH_GW_MAC],
              status: "online",
              lastSeen: now,
              rssi: update.rssiGw2,
            };
          }

          // Fallback: if backend doesn't send explicit rssiGw1/rssiGw2 but
          // does indicate a zone, keep the responsible gateway alive.
          // Any SSE packet proves the North gateway is reachable (it is the
          // relay / primary gateway).  Only update South when we have clear
          // evidence a tag is in the South zone.
          const isExplicitSouth =
            update.zone &&
            (update.zone.toUpperCase().includes("SOUTH") ||
              update.zone.toUpperCase().includes("WORKSTATION"));

          if (update.rssiGw2 === undefined && isExplicitSouth) {
            // Tag is in South zone but rssiGw2 was omitted → South is alive
            next[SOUTH_GW_MAC] = {
              ...next[SOUTH_GW_MAC],
              status: "online",
              lastSeen: now,
            };
          }

          if (update.rssiGw1 === undefined) {
            // Any packet at all keeps North alive (it bridges all BLE traffic)
            next[NORTH_GW_MAC] = {
              ...next[NORTH_GW_MAC],
              status: "online",
              lastSeen: now,
            };
          }

          return next;
        });

        setLocations((current) => {
          const index = current.findIndex((loc) => loc.bleMac === update.bleMac);
          const prevItem = index >= 0 ? current[index] : undefined;

          // Intelligently resolve gateway
          const resolved = resolveGateway(update, prevItem);

          const item: Location = {
            employeeId: update.employeeId || prevItem?.employeeId || "",
            employeeName: update.employeeName || prevItem?.employeeName || "",
            department: update.department ?? prevItem?.department ?? null,
            bleMac: update.bleMac,
            gatewayMac: resolved.gatewayMac,
            gatewayName: GATEWAYS[resolved.gatewayMac]?.name ?? "Gateway",
            currentZone: resolved.currentZone,
            rssi: resolved.rssi,
            sampleCount: (prevItem?.sampleCount ?? 0) + 1,
            lastSeenAt: new Date().toISOString(),
            secondsAgo: 0,
            x: resolved.x ?? prevItem?.x,
            y: resolved.y ?? prevItem?.y,
            ratio: update.ratio ?? prevItem?.ratio,
            isMidpoint: update.isMidpoint ?? prevItem?.isMidpoint,
            rssiGw1: update.rssiGw1 ?? prevItem?.rssiGw1,
            rssiGw2: update.rssiGw2 ?? prevItem?.rssiGw2,
          };

          if (index < 0) return [...current, item];
          const next = [...current];
          next[index] = item;
          return next;
        });
      } catch {
        setError("Received an invalid live location update");
      }
    });

    source.onerror = () => {
      // Reconnection handled automatically by browser EventSource
    };

    return () => {
      alive = false;
      source.close();
    };
  }, []);

  // Monitor gateway health every 3 seconds to catch dropped signals
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      const TIMEOUT_MS = 14000; // 14 seconds without packet = lost

      setGatewayStates((prev) => {
        let changed = false;
        const next = { ...prev };

        for (const mac of [NORTH_GW_MAC, SOUTH_GW_MAC]) {
          const gw = next[mac];
          if (gw.lastSeen && gw.status === "online" && now - gw.lastSeen > TIMEOUT_MS) {
            next[mac] = { ...gw, status: "lost" };
            changed = true;
          }
        }

        return changed ? next : prev;
      });
    }, 3000);

    return () => clearInterval(timer);
  }, []);

  const selectedEmployee = employees.find((item) => item.employeeId === selectedId);
  const selectedLocation = locations.find((item) => item.employeeId === selectedId);

  // Record zone movement history
  useEffect(() => {
    if (!selectedLocation) return;
    setHistory((items) =>
      items.at(-1)?.roomName === selectedLocation.currentZone
        ? items
        : [
            ...items,
            {
              roomId: selectedLocation.gatewayMac,
              roomName: selectedLocation.currentZone,
              timestamp: new Date().toLocaleTimeString(),
            },
          ]
    );
  }, [selectedLocation]);

  const southGwLost = gatewayStates[SOUTH_GW_MAC]?.status === "lost";

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">Location intelligence</div>
          <h1>RTLS Monitor</h1>
        </div>

        <div className="topbar-right">
          <div className="gateway-chips">
            {Object.values(gatewayStates).map((gw) => (
              <span
                key={gw.mac}
                className={`gw-chip ${gw.status}`}
                title={
                  gw.lastSeen
                    ? `Gateway MAC: ${formatMac(gw.mac)} · Last seen ${Math.round((Date.now() - gw.lastSeen) / 1000)}s ago`
                    : `Gateway MAC: ${formatMac(gw.mac)} · No packets received yet`
                }
              >
                <span className="gw-dot" />
                <span>{gw.shortName}</span>
                <code style={{ fontSize: "10px", color: "#94a3b8", fontFamily: "monospace", whiteSpace: "nowrap" }}>[{formatMac(gw.mac)}]</code>
                <b style={{ whiteSpace: "nowrap" }}>{gw.status === "online" ? `${gw.rssi ?? -70} dBm` : gw.status.toUpperCase()}</b>
              </span>
            ))}
          </div>

          <div className="live-pill">
            <span className="live-dot" />
            LIVE TRACKING · {locations.length} ON FLOOR
          </div>
        </div>
      </header>

      {/* Gateway Alert Banner if South Gateway signal drops */}
      {southGwLost && (
        <div className="gw-alert-banner">
          <div>
            <strong>⚠️ South Zone Gateway XC210864 (MAC: {formatMac(SOUTH_GW_MAC)}) Signal Lost</strong>
            <p>
              No packets received from the South Gateway. ID cards in the South Zone may
              intermittently link or fail over to the North Gateway. Please check South Gateway power
              and network connectivity.
            </p>
          </div>
          <span className="gw-alert-meta">
            Last seen{" "}
            {Math.round((Date.now() - (gatewayStates[SOUTH_GW_MAC].lastSeen ?? 0)) / 1000)}s ago
          </span>
        </div>
      )}

      {error && <div className="api-error">{error}</div>}

      <div className="dashboard">
        <section className="card map-card">
          <div className="card-heading">
            <h2>Live Map</h2>
            <span className="map-meta">
              {selectedEmployee
                ? `Tracking: ${selectedEmployee.employeeName}`
                : "Active floor monitoring"}{" "}
              · Live SSE
            </span>
          </div>

          <RtlsMap
            locations={locations}
            selectedId={selectedId}
            onSelect={setSelectedId}
            gatewayStates={gatewayStates}
          />
        </section>

        <aside className="side">
          <section className="card info-card">
            {!selectedEmployee && (
              <div className="section">
                <h3>All employees ({employees.length})</h3>
                <div className="worker-list">
                  {employees.map((employee) => (
                    <button
                      className="worker-option"
                      key={employee.employeeId}
                      onClick={() => setSelectedId(employee.employeeId)}
                    >
                      <span className="avatar">
                        {employee.employeeName.slice(0, 2).toUpperCase()}
                      </span>
                      <span>
                        <strong>{employee.employeeName}</strong>
                        <small>
                          {employee.employeeId} · {employee.department || "Operations"}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedEmployee && (
              <div className="section">
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  style={{
                    marginBottom: "16px",
                    padding: "6px 10px",
                    border: "1px solid #273b5c",
                    borderRadius: "7px",
                    background: "#0c1628",
                    color: "#94a3b8",
                    fontSize: "11px",
                  }}
                >
                  ← All employees
                </button>
                <h3>Worker details</h3>
                <div className="identity">
                  <div className="avatar">
                    {selectedEmployee.employeeName.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <strong>{selectedEmployee.employeeName}</strong>
                    <span>
                      {selectedEmployee.employeeId} · {selectedEmployee.department || "Operations"}
                    </span>
                  </div>
                </div>

                <div className="stats">
                  <div className="stat">
                    <label>BLE Beacon MAC</label>
                    <b style={{ fontFamily: "monospace", fontSize: "11px" }}>
                      {formatMac(selectedEmployee.bleMac)}
                    </b>
                  </div>
                  <div className="stat">
                    <label>Connected Gateway MAC</label>
                    <b style={{ fontFamily: "monospace", fontSize: "11px", color: "#38bdf8" }}>
                      {selectedLocation ? formatMac(selectedLocation.gatewayMac) : "N/A"}
                    </b>
                  </div>
                  <div className="stat">
                    <label>Signal</label>
                    <b>
                      {selectedLocation ? `${selectedLocation.rssi} dBm` : "No signal"}
                    </b>
                    <small>
                      {selectedLocation ? `${selectedLocation.secondsAgo}s ago` : "Offline"}
                    </small>
                  </div>
                  {selectedLocation?.rssiGw1 !== undefined && (
                    <div className="stat">
                      <label>North GW RSSI</label>
                      <b>{selectedLocation.rssiGw1} dBm</b>
                    </div>
                  )}
                  {selectedLocation?.rssiGw2 !== undefined && (
                    <div className="stat">
                      <label>South GW RSSI</label>
                      <b>{selectedLocation.rssiGw2} dBm</b>
                    </div>
                  )}
                </div>
              </div>
            )}

            {selectedEmployee && (
              <div className="section">
                <h3>Current zone &amp; Gateway</h3>
                <div className="room-banner">
                  <span>Detected Zone</span>
                  <strong>{selectedLocation?.currentZone || "Not detected"}</strong>
                </div>
                {selectedLocation && (
                  <div
                    style={{
                      marginTop: "10px",
                      padding: "10px 12px",
                      background: "#08101f",
                      borderRadius: "8px",
                      border: "1px solid #152238",
                      fontSize: "11px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b" }}>
                      <span>Gateway</span>
                      <strong style={{ color: "#38bdf8" }}>{selectedLocation.gatewayName}</strong>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        color: "#64748b",
                        marginTop: "6px",
                      }}
                    >
                      <span>Gateway MAC</span>
                      <code style={{ color: "#f1f5f9", fontFamily: "monospace", fontWeight: "700" }}>
                        {formatMac(selectedLocation.gatewayMac)}
                      </code>
                    </div>
                  </div>
                )}
              </div>
            )}

            {selectedEmployee && (
              <div className="section">
                <h3>Recent history</h3>
                <div className="history">
                  {history
                    .slice(-5)
                    .reverse()
                    .map((event, index) => (
                      <div className="history-row" key={`${event.timestamp}-${index}`}>
                        <span className="history-marker" />
                        <strong>{event.roomName}</strong>
                        <span className="history-time">{event.timestamp}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
