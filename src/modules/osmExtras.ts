// Amenities, man-made landmarks, barriers, place nodes — the overlays that
// give the campus scene its human-scale labels.

export interface PoiMarker {
  id: number;
  lat: number;
  lon: number;
  pos: [number, number];
  kind: string;
  name?: string;
  tags: Record<string, string>;
}

export interface BarrierLine {
  id: number;
  kind: string;
  polyline: Array<[number, number]>;
}

export interface WaterTower {
  id: number;
  pos: [number, number];
  name?: string;
}

export interface OsmExtras {
  pois: PoiMarker[];
  barriers: BarrierLine[];
  waterTowers: WaterTower[];
  placeLabels: PoiMarker[];
  amenityAreas: Array<{
    id: number;
    kind: string;
    polyline: Array<[number, number]>;
    closed: boolean;
    name?: string;
  }>;
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

function project(
  lat: number,
  lon: number,
  centerLat: number,
  centerLon: number,
  mPerDegLon: number,
): [number, number] {
  return [(lon - centerLon) * mPerDegLon, -(lat - centerLat) * M_PER_DEG_LAT];
}

function centroid(geom: OverpassNodeGeom[]): [number, number] {
  let sLat = 0;
  let sLon = 0;
  for (const g of geom) {
    sLat += g.lat;
    sLon += g.lon;
  }
  const n = Math.max(geom.length, 1);
  return [sLat / n, sLon / n];
}

export function parseOsmExtras(
  dump: OverpassDump,
  centerLat: number,
  centerLon: number,
): OsmExtras {
  const mPerDegLon = M_PER_DEG_LAT * Math.cos((centerLat * Math.PI) / 180);
  const out: OsmExtras = {
    pois: [],
    barriers: [],
    waterTowers: [],
    placeLabels: [],
    amenityAreas: [],
  };

  for (const el of dump.elements) {
    if (el.type === 'node') {
      const t = el.tags ?? {};
      const poi: PoiMarker = {
        id: el.id,
        lat: el.lat,
        lon: el.lon,
        pos: project(el.lat, el.lon, centerLat, centerLon, mPerDegLon),
        kind:
          t.amenity ??
          t.place ??
          t.shop ??
          t.emergency ??
          t.historic ??
          t.man_made ??
          'other',
        name: t.name,
        tags: t,
      };
      if (t.place) out.placeLabels.push(poi);
      else out.pois.push(poi);
      continue;
    }

    // way
    const t = el.tags ?? {};
    if (!el.geometry || el.geometry.length < 2) continue;
    const polyline = el.geometry.map((g) =>
      project(g.lat, g.lon, centerLat, centerLon, mPerDegLon),
    );
    const first = el.geometry[0];
    const last = el.geometry[el.geometry.length - 1];
    const closed = first.lat === last.lat && first.lon === last.lon;

    if (t.barrier) {
      out.barriers.push({ id: el.id, kind: t.barrier, polyline });
      continue;
    }
    if (t.man_made === 'water_tower' || t.man_made === 'storage_tank') {
      const [lat, lon] = centroid(el.geometry);
      out.waterTowers.push({
        id: el.id,
        pos: project(lat, lon, centerLat, centerLon, mPerDegLon),
        name: t.name,
      });
      continue;
    }
    if (t.amenity) {
      out.amenityAreas.push({
        id: el.id,
        kind: t.amenity,
        polyline,
        closed,
        name: t.name,
      });
      // Also surface as a labelled POI if named.
      if (t.name) {
        const [lat, lon] = centroid(el.geometry);
        out.pois.push({
          id: el.id,
          lat,
          lon,
          pos: project(lat, lon, centerLat, centerLon, mPerDegLon),
          kind: t.amenity,
          name: t.name,
          tags: t,
        });
      }
    }
  }

  // Also collect any node water_towers that snuck in as nodes.
  for (const el of dump.elements) {
    if (el.type === 'node' && el.tags?.man_made === 'water_tower') {
      out.waterTowers.push({
        id: el.id,
        pos: project(el.lat, el.lon, centerLat, centerLon, mPerDegLon),
        name: el.tags.name,
      });
    }
  }

  return out;
}

export async function loadOsmExtras(
  url: string,
  centerLat: number,
  centerLon: number,
): Promise<OsmExtras> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load extras: ${res.status}`);
  const dump = (await res.json()) as OverpassDump;
  return parseOsmExtras(dump, centerLat, centerLon);
}

export const NIT_EXTRAS_URL = '/data/nit-trichy-extras.json';

/** Emoji-style glyph used on CSS labels, quick readability cue. */
export function poiGlyph(kind: string): string {
  switch (kind) {
    case 'place_of_worship': return '🛐';
    case 'restaurant':
    case 'food_court': return '🍽';
    case 'cafe': return '☕';
    case 'atm':
    case 'bank': return '🏦';
    case 'bicycle_parking':
    case 'parking': return '🅿';
    case 'library': return '📚';
    case 'hospital': return '🏥';
    case 'police': return '🚓';
    case 'school':
    case 'university':
    case 'college': return '🎓';
    case 'water_tower': return '🗼';
    case 'shop': return '🛒';
    case 'fuel': return '⛽';
    default: return '•';
  }
}
