// Parse a raw Overpass JSON dump (way + relation with building=*) into a
// locally-projected campus geometry that Three.js can extrude.
//
// Conventions:
//   +X east, +Y up, +Z south (right-handed, matches other scenes).
//   Origin = geometric centre of all footprints in the file.

export interface OsmBuildingFootprint {
  id: number;
  name?: string;
  kind?: string;
  heightM: number;
  /** Outer ring in local metres on the XZ plane. */
  outer: Array<[number, number]>;
  /** Optional inner rings for courtyards (multipolygon relations). */
  holes: Array<Array<[number, number]>>;
  /** Centroid lat/lon. */
  centerLatLon: [number, number];
}

export interface OsmCampusGeometry {
  centerLat: number;
  centerLon: number;
  buildings: OsmBuildingFootprint[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  extentMeters: number;
}

type OverpassNodeGeom = { lat: number; lon: number };

interface OverpassWay {
  type: 'way';
  id: number;
  tags?: Record<string, string>;
  geometry?: OverpassNodeGeom[];
}

interface OverpassRelationMember {
  type: 'way' | 'node' | 'relation';
  role: string;
  geometry?: OverpassNodeGeom[];
}

interface OverpassRelation {
  type: 'relation';
  id: number;
  tags?: Record<string, string>;
  members?: OverpassRelationMember[];
}

type OverpassElement = OverpassWay | OverpassRelation;

interface OverpassDump {
  elements: OverpassElement[];
}

const M_PER_DEG_LAT = 111_320;

function parseHeight(tags?: Record<string, string>): number {
  if (!tags) return 8;
  const h = tags.height ? parseFloat(tags.height) : NaN;
  if (!isNaN(h) && h > 0) return h;
  const levels = tags['building:levels'] ? parseFloat(tags['building:levels']) : NaN;
  if (!isNaN(levels) && levels > 0) return levels * 3.2;
  // Heuristic per tag flavour.
  const k = tags.building ?? '';
  if (k === 'apartments' || k === 'hostel' || k === 'residential') return 12;
  if (k === 'school' || k === 'university' || k === 'college') return 9;
  if (k === 'shed' || k === 'garage' || k === 'hut') return 3.5;
  return 7;
}

function projectRing(
  ring: OverpassNodeGeom[],
  centerLat: number,
  centerLon: number,
  mPerDegLon: number,
): Array<[number, number]> {
  return ring.map((pt) => {
    const x = (pt.lon - centerLon) * mPerDegLon;
    const z = -(pt.lat - centerLat) * M_PER_DEG_LAT;
    return [x, z] as [number, number];
  });
}

function ringCentroid(ring: Array<[number, number]>): [number, number] {
  let sx = 0;
  let sz = 0;
  for (const [x, z] of ring) {
    sx += x;
    sz += z;
  }
  const n = Math.max(ring.length, 1);
  return [sx / n, sz / n];
}

function latLonCentroid(ring: OverpassNodeGeom[]): [number, number] {
  let sLat = 0;
  let sLon = 0;
  for (const pt of ring) {
    sLat += pt.lat;
    sLon += pt.lon;
  }
  const n = Math.max(ring.length, 1);
  return [sLat / n, sLon / n];
}

export function parseOverpassDump(dump: OverpassDump): OsmCampusGeometry {
  const nodesLat: number[] = [];
  const nodesLon: number[] = [];
  for (const el of dump.elements) {
    if (el.type === 'way' && el.geometry) {
      for (const g of el.geometry) {
        nodesLat.push(g.lat);
        nodesLon.push(g.lon);
      }
    } else if (el.type === 'relation' && el.members) {
      for (const m of el.members) {
        if (m.geometry) for (const g of m.geometry) {
          nodesLat.push(g.lat);
          nodesLon.push(g.lon);
        }
      }
    }
  }
  if (!nodesLat.length) {
    throw new Error('OSM dump contains no usable geometry');
  }
  const centerLat = (Math.min(...nodesLat) + Math.max(...nodesLat)) / 2;
  const centerLon = (Math.min(...nodesLon) + Math.max(...nodesLon)) / 2;
  const mPerDegLon = M_PER_DEG_LAT * Math.cos((centerLat * Math.PI) / 180);

  const buildings: OsmBuildingFootprint[] = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  const pushBuilding = (
    id: number,
    tags: Record<string, string> | undefined,
    outerLatLon: OverpassNodeGeom[],
    holesLatLon: OverpassNodeGeom[][] = [],
  ) => {
    if (outerLatLon.length < 3) return;
    const outer = projectRing(outerLatLon, centerLat, centerLon, mPerDegLon);
    const holes = holesLatLon
      .filter((r) => r.length >= 3)
      .map((r) => projectRing(r, centerLat, centerLon, mPerDegLon));
    for (const [x, z] of outer) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    const [cLat, cLon] = latLonCentroid(outerLatLon);
    buildings.push({
      id,
      name: tags?.name,
      kind: tags?.building,
      heightM: parseHeight(tags),
      outer,
      holes,
      centerLatLon: [cLat, cLon],
    });
  };

  for (const el of dump.elements) {
    if (el.type === 'way' && el.geometry) {
      pushBuilding(el.id, el.tags, el.geometry);
    } else if (el.type === 'relation' && el.members) {
      const outers = el.members.filter((m) => m.role === 'outer' && m.geometry);
      const inners = el.members.filter((m) => m.role === 'inner' && m.geometry);
      // In practice relations may have multiple outer rings (separate buildings).
      for (const o of outers) {
        pushBuilding(el.id, el.tags, o.geometry!, inners.map((i) => i.geometry!));
      }
    }
  }

  const extentMeters = Math.max(maxX - minX, maxZ - minZ, 1);
  return {
    centerLat,
    centerLon,
    buildings,
    bounds: { minX, maxX, minZ, maxZ },
    extentMeters,
  };
}

export async function loadCampusFromUrl(url: string): Promise<OsmCampusGeometry> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load campus dataset: ${res.status}`);
  const dump = (await res.json()) as OverpassDump;
  return parseOverpassDump(dump);
}

export const NIT_TRICHY_DATASET = {
  label: 'NIT Tiruchirappalli',
  url: '/data/nit-trichy-buildings.json',
  centerLat: 10.7594,
  centerLon: 78.8169,
};

// Quick centroid/footprint helpers for picker UI.
export function computeBuildingCenter(b: OsmBuildingFootprint): [number, number] {
  return ringCentroid(b.outer);
}

export function buildingFootprintArea(b: OsmBuildingFootprint): number {
  let sum = 0;
  const r = b.outer;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    sum += (r[j][0] + r[i][0]) * (r[i][1] - r[j][1]);
  }
  return Math.abs(sum / 2);
}
