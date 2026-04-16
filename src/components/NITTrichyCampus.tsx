import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useSimStore } from '../state/store';
import { computeSolarAngles } from '../modules/solarGeometry';
import {
  NIT_TRICHY_DATASET,
  buildingFootprintArea,
  loadCampusFromUrl,
  type OsmCampusGeometry,
  type OsmBuildingFootprint,
} from '../modules/osmBuildings';
import {
  NIT_FEATURES_URL,
  loadOsmFeatures,
  scatterInPolygon,
  type OsmFeatures,
  type FeatureWay,
} from '../modules/osmFeatures';
import {
  NIT_EXTRAS_URL,
  loadOsmExtras,
  type OsmExtras,
} from '../modules/osmExtras';

const NIT_BBOX = { west: 78.8030, south: 10.7500, east: 78.8275, north: 10.7870 };
const NIT_SATELLITE_URL = '/data/nit-trichy-satellite.jpg';
const M_PER_DEG_LAT = 111_320;

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function footprintToShape(outer: Array<[number, number]>, holes: Array<Array<[number, number]>>) {
  const shape = new THREE.Shape();
  shape.moveTo(outer[0][0], outer[0][1]);
  for (let i = 1; i < outer.length; i++) shape.lineTo(outer[i][0], outer[i][1]);
  for (const hole of holes) {
    const path = new THREE.Path();
    path.moveTo(hole[0][0], hole[0][1]);
    for (let i = 1; i < hole.length; i++) path.lineTo(hole[i][0], hole[i][1]);
    shape.holes.push(path);
  }
  return shape;
}

function buildingColorFor(b: OsmBuildingFootprint): number {
  const k = b.kind ?? '';
  const name = (b.name ?? '').toLowerCase();
  // Hostels / residential — warm terracotta
  if (k === 'hostel' || k === 'apartments' || k === 'residential' || /hostel|hall|mess/.test(name)) {
    const reds = [0xc5845a, 0xb87850, 0xcf9168, 0xa8714d];
    return reds[b.id % reds.length];
  }
  // Academic / college
  if (k === 'university' || k === 'school' || k === 'college' || /block|dept|department|lab|library|auditorium|admin/.test(name)) {
    const conc = [0xd9d2bd, 0xc8c2ae, 0xe4dbc6, 0xbeb59f];
    return conc[b.id % conc.length];
  }
  // Industrial / shed / utility
  if (k === 'industrial' || k === 'shed' || k === 'garage' || k === 'warehouse') {
    return 0x8a8f95;
  }
  // Default varied palette
  const mix = [0xb9c0cf, 0xcdd4e0, 0xaab5c4, 0xd0c5b0, 0xc4b9a8, 0xd6d0bc];
  return mix[b.id % mix.length];
}

function extrudeRoadRibbon(
  polyline: Array<[number, number]>,
  width: number,
): THREE.BufferGeometry | null {
  if (polyline.length < 2) return null;
  const half = width / 2;
  const positions: number[] = [];
  const indices: number[] = [];
  const pts2 = polyline.map((p) => new THREE.Vector2(p[0], p[1]));
  const lefts: THREE.Vector2[] = [];
  const rights: THREE.Vector2[] = [];
  for (let i = 0; i < pts2.length; i++) {
    let tx = 0;
    let ty = 0;
    if (i === 0) {
      tx = pts2[1].x - pts2[0].x;
      ty = pts2[1].y - pts2[0].y;
    } else if (i === pts2.length - 1) {
      tx = pts2[i].x - pts2[i - 1].x;
      ty = pts2[i].y - pts2[i - 1].y;
    } else {
      tx = pts2[i + 1].x - pts2[i - 1].x;
      ty = pts2[i + 1].y - pts2[i - 1].y;
    }
    const len = Math.hypot(tx, ty) || 1;
    const nx = -ty / len;
    const ny = tx / len;
    lefts.push(new THREE.Vector2(pts2[i].x + nx * half, pts2[i].y + ny * half));
    rights.push(new THREE.Vector2(pts2[i].x - nx * half, pts2[i].y - ny * half));
  }
  const y = 0.03;
  for (let i = 0; i < lefts.length; i++) {
    positions.push(lefts[i].x, y, lefts[i].y);
    positions.push(rights[i].x, y, rights[i].y);
  }
  for (let i = 0; i < lefts.length - 1; i++) {
    const a = i * 2;
    const b = i * 2 + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function polygonToPlaneGeometry(polygon: Array<[number, number]>, y: number): THREE.BufferGeometry | null {
  if (polygon.length < 3) return null;
  const shape = new THREE.Shape();
  shape.moveTo(polygon[0][0], polygon[0][1]);
  for (let i = 1; i < polygon.length; i++) shape.lineTo(polygon[i][0], polygon[i][1]);
  try {
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, y, 0);
    return geo;
  } catch {
    return null;
  }
}

// Sky gradient that tracks sun altitude.
const SKY_SHADER = {
  vertex: `
    varying vec3 vWorld;
    void main() {
      vWorld = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragment: `
    varying vec3 vWorld;
    uniform vec3 top;
    uniform vec3 bottom;
    uniform vec3 horizon;
    uniform float sunAlt;
    void main() {
      float h = clamp((normalize(vWorld).y + 0.1) / 1.1, 0.0, 1.0);
      vec3 dayHorizon = mix(horizon, top, h);
      vec3 duskHorizon = mix(vec3(0.95, 0.45, 0.25), vec3(0.12, 0.08, 0.25), h);
      vec3 night = mix(vec3(0.02, 0.03, 0.08), vec3(0.01, 0.02, 0.05), h);
      float t = smoothstep(-0.15, 0.15, sunAlt);
      float dusk = smoothstep(0.0, 0.25, 1.0 - abs(sunAlt - 0.1) * 4.0);
      vec3 col = mix(night, dayHorizon, t);
      col = mix(col, duskHorizon, dusk * (1.0 - t));
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

// -------------------------------------------------------------------------
// Component
// -------------------------------------------------------------------------

export default function NITTrichyCampus() {
  const s = useSimStore();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const hoverLabelRef = useRef<HTMLDivElement | null>(null);

  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const sunMeshRef = useRef<THREE.Mesh | null>(null);
  const hemiRef = useRef<THREE.HemisphereLight | null>(null);
  const skyMatRef = useRef<THREE.ShaderMaterial | null>(null);
  const selectionMeshRef = useRef<THREE.Mesh | null>(null);
  const disposersRef = useRef<Array<() => void>>([]);
  const windowUniformsRef = useRef<{ u_nightFactor: { value: number } } | null>(null);

  const [campus, setCampus] = useState<OsmCampusGeometry | null>(null);
  const [features, setFeatures] = useState<OsmFeatures | null>(null);
  const [extras, setExtras] = useState<OsmExtras | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selection, setSelection] = useState<{
    name: string;
    kind?: string;
    heightM: number;
    areaM2: number;
    lat: number;
    lon: number;
  } | null>(null);

  // Load both datasets.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const campusData = await loadCampusFromUrl(NIT_TRICHY_DATASET.url);
        if (cancelled) return;
        setCampus(campusData);
        const feats = await loadOsmFeatures(
          NIT_FEATURES_URL,
          campusData.centerLat,
          campusData.centerLon,
        );
        if (!cancelled) setFeatures(feats);
        try {
          const ex = await loadOsmExtras(
            NIT_EXTRAS_URL,
            campusData.centerLat,
            campusData.centerLon,
          );
          if (!cancelled) setExtras(ex);
        } catch {
          // extras file optional
        }
      } catch (err) {
        if (!cancelled) setLoadError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Snap simulation lat/lon to NIT Trichy when this tab opens with data.
  useEffect(() => {
    if (!campus) return;
    s.patch({
      latitude: NIT_TRICHY_DATASET.centerLat,
      longitude: NIT_TRICHY_DATASET.centerLon,
      locationLabel: NIT_TRICHY_DATASET.label,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campus]);

  // Build scene.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !campus) return;
    const campusLocal = campus;
    const featuresLocal = features;
    const extrasLocal = extras;
    const extent = campusLocal.extentMeters;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x9cb4d6, extent * 1.4, extent * 4);

    const camera = new THREE.PerspectiveCamera(
      45,
      mount.clientWidth / mount.clientHeight,
      1,
      extent * 10,
    );

    // Skydome ----------------------------------------------------------
    const skyGeo = new THREE.SphereGeometry(extent * 6, 48, 32);
    const skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_SHADER.vertex,
      fragmentShader: SKY_SHADER.fragment,
      uniforms: {
        top: { value: new THREE.Color(0x1e4b90) },
        bottom: { value: new THREE.Color(0x6c9adc) },
        horizon: { value: new THREE.Color(0xaec8ef) },
        sunAlt: { value: 0.7 },
      },
      side: THREE.BackSide,
      depthWrite: false,
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    scene.add(sky);
    skyMatRef.current = skyMat;

    // Ground: Esri World Imagery satellite tile for the campus bbox ----
    const mPerDegLon = M_PER_DEG_LAT * Math.cos((campusLocal.centerLat * Math.PI) / 180);
    const westX = (NIT_BBOX.west - campusLocal.centerLon) * mPerDegLon;
    const eastX = (NIT_BBOX.east - campusLocal.centerLon) * mPerDegLon;
    const northZ = -(NIT_BBOX.north - campusLocal.centerLat) * M_PER_DEG_LAT;
    const southZ = -(NIT_BBOX.south - campusLocal.centerLat) * M_PER_DEG_LAT;
    const bboxWidth = eastX - westX;
    const bboxDepth = southZ - northZ;
    const bboxCx = (westX + eastX) / 2;
    const bboxCz = (northZ + southZ) / 2;

    // Subtle backdrop well below the ground so it never z-fights the satellite plane.
    const skirtSize = Math.max(bboxWidth, bboxDepth) * 3;
    const skirtGeo = new THREE.PlaneGeometry(skirtSize, skirtSize);
    const skirtMat = new THREE.MeshStandardMaterial({
      color: 0x2b3a22,
      roughness: 1,
    });
    const skirt = new THREE.Mesh(skirtGeo, skirtMat);
    skirt.rotation.x = -Math.PI / 2;
    skirt.position.set(bboxCx, -3, bboxCz);
    skirt.receiveShadow = false;
    scene.add(skirt);
    disposersRef.current.push(() => { skirtGeo.dispose(); skirtMat.dispose(); });

    const groundGeo = new THREE.PlaneGeometry(bboxWidth, bboxDepth, 1, 1);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.95,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const satLoader = new THREE.TextureLoader();
    satLoader.load(
      NIT_SATELLITE_URL,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        groundMat.map = tex;
        groundMat.needsUpdate = true;
      },
      undefined,
      () => {
        // Fallback: nice grass colour.
        groundMat.color.setHex(0x5e7a48);
        groundMat.needsUpdate = true;
      },
    );
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(bboxCx, 0, bboxCz);
    ground.receiveShadow = true;
    scene.add(ground);

    // ---------- Landuse + leisure polygons -------------------------------
    const polyAdd = (poly: FeatureWay, color: number, y: number, opacity = 1) => {
      if (poly.polyline.length < 3 || !poly.closed) return;
      const geo = polygonToPlaneGeometry(poly.polyline, y);
      if (!geo) return;
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 1,
        metalness: 0,
        transparent: opacity < 1,
        opacity,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      scene.add(mesh);
      disposersRef.current.push(() => { geo.dispose(); mat.dispose(); });
    };

    // Roads, waterways, landuse polygons and scattered trees are read from
    // the satellite imagery now; we skip re-rendering them in 3D to avoid
    // doubling up on the ground texture.

    // Water towers (OSM man_made=water_tower) — iconic Indian campus landmarks.
    if (extrasLocal) {
      const towerLegMat = new THREE.MeshStandardMaterial({ color: 0x6b6b6b, roughness: 0.8 });
      const towerTankMat = new THREE.MeshStandardMaterial({
        color: 0xcdd7e6,
        roughness: 0.55,
        metalness: 0.2,
        emissive: 0x101820,
        emissiveIntensity: 0.1,
      });
      const legGeo = new THREE.CylinderGeometry(0.35, 0.45, 14, 6);
      const tankGeo = new THREE.CylinderGeometry(3, 2.6, 5, 16);
      for (const wt of extrasLocal.waterTowers) {
        const legs = new THREE.Mesh(legGeo, towerLegMat);
        legs.position.set(wt.pos[0], 7, wt.pos[1]);
        legs.castShadow = true;
        legs.receiveShadow = true;
        scene.add(legs);
        const tank = new THREE.Mesh(tankGeo, towerTankMat);
        tank.position.set(wt.pos[0], 16.5, wt.pos[1]);
        tank.castShadow = true;
        tank.receiveShadow = true;
        scene.add(tank);
      }
      disposersRef.current.push(() => {
        legGeo.dispose();
        tankGeo.dispose();
        towerLegMat.dispose();
        towerTankMat.dispose();
      });

      // Barriers (fences, walls) — thin dark ribbons at waist height.
      const barrierMat = new THREE.MeshStandardMaterial({
        color: 0x4a4740,
        roughness: 0.95,
      });
      for (const b of extrasLocal.barriers) {
        const geo = extrudeRoadRibbon(b.polyline, 0.25);
        if (!geo) continue;
        const mesh = new THREE.Mesh(geo, barrierMat);
        mesh.position.y = 1.2;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        disposersRef.current.push(() => geo.dispose());
      }
      disposersRef.current.push(() => barrierMat.dispose());

    }

    // Lights ----------------------------------------------------------
    const hemi = new THREE.HemisphereLight(0xaac8ff, 0x2a3a1c, 0.35);
    scene.add(hemi);
    hemiRef.current = hemi;

    const sunLight = new THREE.DirectionalLight(0xfff0c2, 1.6);
    sunLight.castShadow = true;
    const sRadius = extent * 0.9;
    sunLight.shadow.camera.left = -sRadius;
    sunLight.shadow.camera.right = sRadius;
    sunLight.shadow.camera.top = sRadius;
    sunLight.shadow.camera.bottom = -sRadius;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = extent * 5;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.bias = -0.0001;
    sunLight.shadow.normalBias = 0.08;
    scene.add(sunLight);
    scene.add(sunLight.target);
    sunLightRef.current = sunLight;

    // Sun disc — small, pushed far away, renders behind everything so it
    // reads as a distant light source instead of floating in the scene.
    const sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(extent * 0.008, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xffeab0, depthTest: false, depthWrite: false }),
    );
    sunMesh.renderOrder = -1;
    scene.add(sunMesh);
    sunMeshRef.current = sunMesh;

    // Buildings ------------------------------------------------------
    // Procedural window shader grafted onto MeshStandardMaterial via
    // onBeforeCompile so we keep PBR lighting + shadows for free.
    const windowUniforms = { u_nightFactor: { value: 0.0 } };
    windowUniformsRef.current = windowUniforms;
    const patchWindows = (mat: THREE.MeshStandardMaterial) => {
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.u_nightFactor = windowUniforms.u_nightFactor;
        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            `#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNormal;`,
          )
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWorldNormal = normalize(mat3(modelMatrix) * normal);`,
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            `#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNormal;\nuniform float u_nightFactor;`,
          )
          .replace(
            '#include <map_fragment>',
            `#include <map_fragment>
            {
              vec3 absN = abs(vWorldNormal);
              float isWall = step(0.5, 1.0 - absN.y);
              float useZ = step(absN.x, absN.z);
              float horizontal = mix(vWorldPos.x, vWorldPos.z, useZ);
              // Floor bands — thin dark horizontal separators every ~3.2 m
              float band = fract(vWorldPos.y / 3.2);
              float floorLine = smoothstep(0.92, 0.99, band) - smoothstep(0.99, 1.0, band);
              // Window grid
              float wx = fract(horizontal / 3.0);
              float wy = fract((vWorldPos.y - 1.3) / 3.2);
              float winMask = step(0.18, wx) * step(wx, 0.82) * step(0.35, wy) * step(wy, 0.75);
              winMask *= isWall;
              // Darken daytime windows to read as glass, warm glow at night
              vec3 glassDay = diffuseColor.rgb * 0.42 + vec3(0.05, 0.07, 0.12);
              vec3 windowNight = vec3(1.0, 0.78, 0.45);
              vec3 winCol = mix(glassDay, windowNight, u_nightFactor);
              diffuseColor.rgb = mix(diffuseColor.rgb, winCol, winMask * 0.85);
              // Floor separator darkens walls slightly
              diffuseColor.rgb *= 1.0 - floorLine * isWall * 0.4;
              // Slight roof tint (top faces)
              float isRoof = step(0.5, absN.y);
              diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.82 + vec3(0.02, 0.015, 0.01), isRoof);
            }
            `,
          );
        // Add emissive lift for windows at night in the emissive pass.
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            vec3 absN2 = abs(vWorldNormal);
            float isWall2 = step(0.5, 1.0 - absN2.y);
            float useZ2 = step(absN2.x, absN2.z);
            float horizontal2 = mix(vWorldPos.x, vWorldPos.z, useZ2);
            float wx2 = fract(horizontal2 / 3.0);
            float wy2 = fract((vWorldPos.y - 1.3) / 3.2);
            float winMask2 = step(0.18, wx2) * step(wx2, 0.82) * step(0.35, wy2) * step(wy2, 0.75);
            totalEmissiveRadiance += vec3(1.0, 0.78, 0.45) * winMask2 * isWall2 * u_nightFactor * 1.2;
          }
          `,
        );
      };
      mat.needsUpdate = true;
    };

    const buildingGroup = new THREE.Group();
    const buildingMeshes: THREE.Mesh[] = [];
    (buildingGroup as unknown as { _windowUniforms?: typeof windowUniforms })._windowUniforms = windowUniforms;
    for (const b of campusLocal.buildings) {
      try {
        const shape = footprintToShape(b.outer, b.holes);
        const geo = new THREE.ExtrudeGeometry(shape, {
          depth: b.heightM,
          bevelEnabled: false,
          curveSegments: 4,
        });
        geo.rotateX(-Math.PI / 2);
        geo.computeVertexNormals();
        const mat = new THREE.MeshStandardMaterial({
          color: buildingColorFor(b),
          roughness: 0.68,
          metalness: 0.05,
        });
        patchWindows(mat);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = { building: b };
        buildingGroup.add(mesh);
        buildingMeshes.push(mesh);
        disposersRef.current.push(() => {
          geo.dispose();
          mat.dispose();
        });
      } catch {
        // skip bad polygons
      }
    }
    scene.add(buildingGroup);

    // Selection highlight ribbons.
    const selectionMat = new THREE.MeshBasicMaterial({
      color: 0x46e8a5,
      transparent: true,
      opacity: 0.4,
      depthTest: false,
    });
    const selectionMesh = new THREE.Mesh(new THREE.BufferGeometry(), selectionMat);
    selectionMesh.visible = false;
    selectionMesh.renderOrder = 3;
    scene.add(selectionMesh);
    selectionMeshRef.current = selectionMesh;

    // Compass arrow.
    const compass = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(-extent / 2 + 30, 1, -extent / 2 + 30),
      extent * 0.08,
      0xff6b6b,
      extent * 0.02,
      extent * 0.012,
    );
    scene.add(compass);

    // Camera controls -----------------------------------------------
    const camState = {
      theta: Math.PI / 3.4,
      phi: Math.PI / 3.0,
      radius: extent * 0.42,
    };
    const target = new THREE.Vector3(0, 12, 0);

    function updateCam() {
      const x = target.x + camState.radius * Math.sin(camState.phi) * Math.cos(camState.theta);
      const y = target.y + camState.radius * Math.cos(camState.phi);
      const z = target.z + camState.radius * Math.sin(camState.phi) * Math.sin(camState.theta);
      camera.position.set(x, y, z);
      camera.lookAt(target);
    }
    updateCam();

    const dom = renderer.domElement;
    let dragging = false;
    let panning = false;
    let moved = false;
    let lastX = 0;
    let lastY = 0;

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    function screenToNdc(e: { clientX: number; clientY: number }) {
      const rect = dom.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }
    function pickBuilding(e: { clientX: number; clientY: number }) {
      screenToNdc(e);
      raycaster.setFromCamera(ndc, camera);
      return raycaster.intersectObjects(buildingMeshes, false)[0] ?? null;
    }

    function onDown(e: PointerEvent) {
      dragging = true;
      panning = e.shiftKey || e.button === 2;
      moved = false;
      lastX = e.clientX;
      lastY = e.clientY;
      dom.setPointerCapture(e.pointerId);
    }
    function onMove(e: PointerEvent) {
      if (!dragging) {
        const label = hoverLabelRef.current;
        if (label) {
          const hit = pickBuilding(e);
          if (hit && hit.object.userData.building) {
            const b = hit.object.userData.building as OsmBuildingFootprint;
            label.style.display = 'block';
            const rect = dom.getBoundingClientRect();
            label.style.left = `${e.clientX - rect.left + 12}px`;
            label.style.top = `${e.clientY - rect.top + 12}px`;
            label.textContent = b.name ? `${b.name} · ${b.heightM.toFixed(1)} m` : `Building #${b.id}`;
          } else {
            label.style.display = 'none';
          }
        }
        return;
      }
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      if (panning) {
        const scale = camState.radius * 0.001;
        const right = new THREE.Vector3();
        const upv = new THREE.Vector3();
        camera.matrix.extractBasis(right, upv, new THREE.Vector3());
        target.addScaledVector(right, -dx * scale);
        target.addScaledVector(upv, dy * scale);
      } else {
        camState.theta -= dx * 0.005;
        camState.phi = Math.min(Math.max(camState.phi + dy * 0.005, 0.15), Math.PI / 2.02);
      }
      lastX = e.clientX;
      lastY = e.clientY;
      updateCam();
    }
    function onUp(e: PointerEvent) {
      dragging = false;
      try { dom.releasePointerCapture(e.pointerId); } catch {}
      if (!moved) {
        const hit = pickBuilding(e);
        if (hit && hit.object.userData.building) {
          const b = hit.object.userData.building as OsmBuildingFootprint;
          const mesh = hit.object as THREE.Mesh;
          setSelection({
            name: b.name ?? `Building #${b.id}`,
            kind: b.kind,
            heightM: b.heightM,
            areaM2: buildingFootprintArea(b),
            lat: b.centerLatLon[0],
            lon: b.centerLatLon[1],
          });
          if (selectionMeshRef.current) {
            const clone = (mesh.geometry as THREE.BufferGeometry).clone();
            selectionMeshRef.current.geometry.dispose();
            selectionMeshRef.current.geometry = clone;
            selectionMeshRef.current.position.copy(mesh.position);
            selectionMeshRef.current.rotation.copy(mesh.rotation);
            selectionMeshRef.current.scale.copy(mesh.scale);
            selectionMeshRef.current.visible = true;
          }
        }
      }
    }
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      camState.radius = Math.min(
        Math.max(camState.radius * (1 + e.deltaY * 0.0012), extent * 0.15),
        extent * 3.5,
      );
      updateCam();
    }
    function onContext(e: Event) { e.preventDefault(); }

    dom.addEventListener('pointerdown', onDown);
    dom.addEventListener('pointermove', onMove);
    dom.addEventListener('pointerup', onUp);
    dom.addEventListener('pointercancel', onUp);
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('contextmenu', onContext);

    function onResize() {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    let frame = 0;
    function animate() {
      frame = requestAnimationFrame(animate);
      const selMesh = selectionMeshRef.current;
      if (selMesh && selMesh.visible) {
        const m = (selMesh.material as THREE.MeshBasicMaterial);
        m.opacity = 0.25 + 0.25 * (0.5 + 0.5 * Math.sin(Date.now() * 0.004));
      }
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerup', onUp);
      dom.removeEventListener('pointercancel', onUp);
      dom.removeEventListener('wheel', onWheel);
      dom.removeEventListener('contextmenu', onContext);
      disposersRef.current.forEach((d) => d());
      disposersRef.current = [];
      groundGeo.dispose();
      groundMat.dispose();
      skyGeo.dispose();
      skyMat.dispose();
      selectionMat.dispose();
      selectionMesh.geometry.dispose();
      renderer.dispose();
      if (dom.parentElement === mount) mount.removeChild(dom);
    };
  }, [campus, features, extras]);

  // Sun angles drive sky, sun mesh, and shadow direction.
  const sunData = useMemo(
    () => computeSolarAngles({
      latitude: s.latitude,
      dayOfYear: s.dayOfYear,
      timeOfDay: s.timeOfDay,
      panelTiltDeg: 0,
      panelAzimuthDeg: 0,
    }),
    [s.latitude, s.dayOfYear, s.timeOfDay],
  );

  useEffect(() => {
    const sunLight = sunLightRef.current;
    const sunMesh = sunMeshRef.current;
    const hemi = hemiRef.current;
    const skyMat = skyMatRef.current;
    if (!sunLight || !sunMesh || !hemi || !skyMat || !campus) return;

    const distance = campus.extentMeters * 1.5;
    const [sx, sy, sz] = sunData.sunVector;
    const sunY = sunData.isDay ? Math.max(sy, 0.05) : sy;
    sunMesh.position.set(sx * distance, sunY * distance, sz * distance);
    sunLight.position.copy(sunMesh.position);
    sunLight.target.position.set(0, 0, 0);
    sunLight.target.updateMatrixWorld();

    const altRad = (sunData.altitudeDeg * Math.PI) / 180;
    skyMat.uniforms.sunAlt.value = Math.sin(altRad);

    if (sunData.isDay) {
      sunLight.intensity = 2.2 * Math.max(0.2, sunY);
      hemi.intensity = 0.35 + 0.25 * Math.max(0, sy);
      sunMesh.visible = true;
      const warmth = 1 - Math.min(sy * 2.2, 1);
      const lightColor = new THREE.Color(0xfff0c2).lerp(new THREE.Color(0xff8a3c), warmth * 0.85);
      sunLight.color.copy(lightColor);
    } else {
      sunLight.intensity = 0.03;
      hemi.intensity = 0.1;
      sunMesh.visible = false;
    }

    // Drive window glow shader — ramps up as the sun drops.
    const nightFactor = THREE.MathUtils.clamp(1 - (sunData.altitudeDeg + 10) / 40, 0, 1);
    if (windowUniformsRef.current) {
      windowUniformsRef.current.u_nightFactor.value = nightFactor;
    }
  }, [sunData, campus]);

  return (
    <section className="panel campus-panel">
      <div className="world-header">
        <div>
          <h2>NIT Tiruchirappalli — live 3D campus</h2>
          <p className="theory-p" style={{ marginTop: 2 }}>
            {campus && features
              ? `${campus.buildings.length} buildings, ${features.roads.length} road segments, ${(features.waterPolygons.length + features.waterways.length)} water features from OpenStreetMap. Drag to orbit · shift-drag to pan · scroll to zoom · click a building.`
              : loading
                ? 'Loading NIT Trichy OSM dataset…'
                : 'Dataset unavailable.'}
          </p>
        </div>
        <div className="campus-inline-controls">
          <label className="slider" style={{ minWidth: 220 }}>
            <div className="slider-head">
              <span>Solar time</span>
              <span className="slider-val">{s.timeOfDay.toFixed(2)} h</span>
            </div>
            <input
              type="range"
              min={0}
              max={24}
              step={0.25}
              value={s.timeOfDay}
              onChange={(e) => s.set('timeOfDay', Number(e.target.value))}
            />
          </label>
          <label className="slider" style={{ minWidth: 220 }}>
            <div className="slider-head">
              <span>Day of year</span>
              <span className="slider-val">{s.dayOfYear}</span>
            </div>
            <input
              type="range"
              min={1}
              max={365}
              step={1}
              value={s.dayOfYear}
              onChange={(e) => s.set('dayOfYear', Number(e.target.value))}
            />
          </label>
          <div className="campus-time-presets">
            <button className="preset-btn" onClick={() => s.set('timeOfDay', 6.25)}>Sunrise</button>
            <button className="preset-btn" onClick={() => s.set('timeOfDay', 12)}>Noon</button>
            <button className="preset-btn" onClick={() => s.set('timeOfDay', 15.5)}>Afternoon</button>
            <button className="preset-btn" onClick={() => s.set('timeOfDay', 18)}>Sunset</button>
          </div>
          <div className="campus-sun-chip">
            alt {sunData.altitudeDeg.toFixed(1)}° · az {sunData.azimuthDeg.toFixed(1)}°
          </div>
        </div>
      </div>

      <div className="world-grid">
        <div className="world-scene-wrap campus-scene">
          <div ref={mountRef} className="world-mount" />
          <div ref={hoverLabelRef} className="world-hover-label" />
          <div className="scene-overlay">
            <div><strong>NIT Trichy</strong></div>
            <div>{campus ? `${campus.buildings.length} buildings` : '—'} · {features?.roads.length ?? 0} roads</div>
            <div>Sun alt {sunData.altitudeDeg.toFixed(1)}° · az {sunData.azimuthDeg.toFixed(1)}°</div>
            <div style={{ color: '#ff6b6b' }}>Red arrow = True North</div>
          </div>
          {loadError && (
            <div className="world-error" style={{ position: 'absolute', top: 12, right: 12 }}>
              {loadError}
            </div>
          )}
        </div>
        <div className="world-side">
          {selection ? (
            <>
              <div className="metric">
                <div className="metric-label">Selected building</div>
                <div className="metric-value" style={{ fontSize: 14 }}>{selection.name}</div>
              </div>
              {selection.kind && (
                <div className="metric">
                  <div className="metric-label">OSM tag</div>
                  <div className="metric-value" style={{ fontSize: 13 }}>{selection.kind}</div>
                </div>
              )}
              <div className="metric">
                <div className="metric-label">Roof height (estimate)</div>
                <div className="metric-value">{selection.heightM.toFixed(1)} m</div>
              </div>
              <div className="metric">
                <div className="metric-label">Footprint area</div>
                <div className="metric-value">{selection.areaM2.toFixed(0)} m²</div>
              </div>
              <div className="metric">
                <div className="metric-label">Coordinates</div>
                <div className="metric-value" style={{ fontSize: 13 }}>
                  {selection.lat.toFixed(4)}°N, {selection.lon.toFixed(4)}°E
                </div>
              </div>
              <div className="metric">
                <div className="metric-label">Rooftop PV potential</div>
                <div className="metric-value">{(selection.areaM2 * 0.6 * 180).toFixed(0)} W peak</div>
              </div>
              <div className="theory-p" style={{ marginTop: 6 }}>
                60 % usable roof × 180 W/m² module density.
              </div>
            </>
          ) : (
            <div className="world-climate">
              <div className="substring-head">Pick a building</div>
              <div className="theory-p" style={{ marginTop: 6 }}>
                Click any building to probe its footprint, height, and rooftop PV potential.
                Drag time-of-day and day-of-year sliders in the left controls to watch shadows sweep.
              </div>
            </div>
          )}
          <div className="world-climate">
            <div className="substring-head">Data source</div>
            <div className="theory-p" style={{ marginTop: 4 }}>
              OpenStreetMap contributors via Overpass API. Buildings, roads, water, forest and
              landuse polygons are rendered live. Heights from tags, otherwise type-based estimates.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
