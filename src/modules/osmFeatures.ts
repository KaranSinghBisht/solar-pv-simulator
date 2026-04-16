// Parse non-building OSM features (roads, water, landuse zones, trees)
// and project them into the same local metre-XZ frame that osmBuildings uses.

export interface FeatureWay {
  id: number;
  tags: Record<string, string>;
  category: 'road' | 'water' | 'wood' | 'park' | 'grass' | 'farmland' | 'industrial' | 'pitch' | 'playground' | 'waterway' | 'other';
  polyline: Array<[number, number]>;
  closed: boolean;
  widthMeters?: number;
}

export interface FeatureTree {
  id: number;
  pos: [number, number];
}

export interface OsmFeatures {
  roads: FeatureWay[];
  waterPolygons: FeatureWay[];
  woodPolygons: FeatureWay[];
  grassPolygons: FeatureWay[]; // park, forest, grass-like
  farmlandPolygons: FeatureWay[];
  industrialPolygons: FeatureWay[];
  sportsPolygons: FeatureWay[];
  waterways: FeatureWay[]; // linear
  trees: FeatureTree[];
}

type OverpassNodeGeom = { lat: number; lon: number };

interface OverpassWay {
  type: 'way';
  id: number;
  tags?: Record<string, string>;
  geometry?: OverpassNodeGeom[];
}

interface OverpassNode {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

interface OverpassDump {
  elements: Array<OverpassWay | OverpassNode>;
}

const M_PER_DEG_LAT = 111_320;

function roadWidth(highway: string | undefined): number {
  switch (highway) {
    case 'trunk':
    case 'trunk_link':
      return 11;
    case 'primary': return 10;
    case 'secondary': return 8.5;
    case 'tertiary': return 7;
    case 'residential': return 5.5;
    case 'service': return 4;
    case 'unclassified': return 5;
    case 'track': return 3.5;
    case 'path':
    case 'footway': return 2;
    default: return 4;
  }
}

function categorize(tags: Record<string, string> | undefined, kind: 'way' | 'node'): FeatureWay['category'] | 'tree' | null {
  if (!tags) return null;
  if (kind === 'node' && tags.natural === 'tree') return 'tree';
  if (tags.highway) return 'road';
  if (tags.waterway) return 'waterway';
  if (tags.natural === 'water') return 'water';
  if (tags.natural === 'wood') return 'wood';
  if (tags.natural === 'scrub') return 'grass';
  if (tags.landuse === 'forest') return 'wood';
  if (tags.landuse === 'grass' || tags.landuse === 'meadow' || tags.landuse === 'village_green') return 'grass';
  if (tags.landuse === 'farmland' || tags.landuse === 'orchard') return 'farmland';
  if (tags.landuse === 'industrial' || tags.landuse === 'quarry' || tags.landuse === 'retail' || tags.landuse === 'wasteland') return 'industrial';
  if (tags.leisure === 'pitch' || tags.leisure === 'playground' || tags.leisure === 'park' || tags.leisure === 'garden') return 'pitch';
  return 'other';
}

function projectRing(
  ring: OverpassNodeGeom[],
  centerLat: number,
  centerLon: number,
  mPerDegLon: number,
): Array<[number, number]> {
  return ring.map((pt) => [
    (pt.lon - centerLon) * mPerDegLon,
    -(pt.lat - centerLat) * M_PER_DEG_LAT,
  ]);
}

/**
 * Parse Overpass dump into feature collections.
 * centerLat/centerLon must match the centre already computed for the building
 * dataset so the two layers line up perfectly.
 */
export function parseOsmFeatures(
  dump: OverpassDump,
  centerLat: number,
  centerLon: number,
): OsmFeatures {
  const mPerDegLon = M_PER_DEG_LAT * Math.cos((centerLat * Math.PI) / 180);
  const out: OsmFeatures = {
    roads: [],
    waterPolygons: [],
    woodPolygons: [],
    grassPolygons: [],
    farmlandPolygons: [],
    industrialPolygons: [],
    sportsPolygons: [],
    waterways: [],
    trees: [],
  };

  for (const el of dump.elements) {
    if (el.type === 'node') {
      const cat = categorize(el.tags, 'node');
      if (cat === 'tree') {
        out.trees.push({
          id: el.id,
          pos: [(el.lon - centerLon) * mPerDegLon, -(el.lat - centerLat) * M_PER_DEG_LAT],
        });
      }
      continue;
    }

    if (!el.geometry || el.geometry.length < 2) continue;
    const polyline = projectRing(el.geometry, centerLat, centerLon, mPerDegLon);
    const first = el.geometry[0];
    const last = el.geometry[el.geometry.length - 1];
    const closed = first.lat === last.lat && first.lon === last.lon;
    const cat = categorize(el.tags, 'way');
    if (!cat || cat === 'tree') continue;
    const feature: FeatureWay = {
      id: el.id,
      tags: el.tags ?? {},
      category: cat as FeatureWay['category'],
      polyline,
      closed,
      widthMeters: cat === 'road' ? roadWidth(el.tags?.highway) : undefined,
    };
    switch (cat) {
      case 'road': out.roads.push(feature); break;
      case 'water': out.waterPolygons.push(feature); break;
      case 'wood': out.woodPolygons.push(feature); break;
      case 'grass': out.grassPolygons.push(feature); break;
      case 'farmland': out.farmlandPolygons.push(feature); break;
      case 'industrial': out.industrialPolygons.push(feature); break;
      case 'pitch':
      case 'playground': out.sportsPolygons.push(feature); break;
      case 'waterway': out.waterways.push(feature); break;
    }
  }

  return out;
}

export async function loadOsmFeatures(
  url: string,
  centerLat: number,
  centerLon: number,
): Promise<OsmFeatures> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load OSM features: ${res.status}`);
  const dump = (await res.json()) as OverpassDump;
  return parseOsmFeatures(dump, centerLat, centerLon);
}

// ---- geometry helpers ----------------------------------------------------

export function pointInPolygon(
  polygon: Array<[number, number]>,
  x: number,
  y: number,
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function polygonBounds(polygon: Array<[number, number]>) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of polygon) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY };
}

/** Scatter points inside a polygon on a seeded-looking random grid. */
export function scatterInPolygon(
  polygon: Array<[number, number]>,
  density: number,
  maxPoints = 400,
): Array<[number, number]> {
  const { minX, maxX, minY, maxY } = polygonBounds(polygon);
  const step = Math.max(1 / Math.sqrt(density), 3);
  const pts: Array<[number, number]> = [];
  for (let x = minX; x <= maxX && pts.length < maxPoints; x += step) {
    for (let y = minY; y <= maxY && pts.length < maxPoints; y += step) {
      const jx = x + (Math.random() - 0.5) * step * 0.6;
      const jy = y + (Math.random() - 0.5) * step * 0.6;
      if (pointInPolygon(polygon, jx, jy)) pts.push([jx, jy]);
    }
  }
  return pts;
}

export const NIT_FEATURES_URL = '/data/nit-trichy-features.json';
