import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { computeSolarAngles, DEG } from '../modules/solarGeometry';
import { useSimStore } from '../state/store';

const SAMPLE_HOURS = Array.from({ length: 15 }, (_, idx) => idx + 5);

type UploadedAsset = {
  name: string;
  kind: 'glb' | 'obj';
  data: ArrayBuffer | string;
};

type SelectionState = {
  label: string;
  point: [number, number, number];
  normal: [number, number, number];
};

type TerrainProfileSample = {
  hour: number;
  hourLabel: string;
  altitudeDeg: number;
  azimuthDeg: number;
  shaded: boolean;
  cosIncidence: number;
  directWm2: number;
};

type ModelStats = {
  name: string;
  source: 'demo' | 'upload';
  nativeSize: [number, number, number];
  meshCount: number;
  fitScale: number;
};

function clamp(x: number, min: number, max: number) {
  return Math.min(Math.max(x, min), max);
}

function formatHour(hour: number) {
  const rounded = Math.round(hour * 100) / 100;
  return `${rounded.toFixed(rounded % 1 === 0 ? 0 : 2)} h`;
}

function formatMeters(v: number) {
  return `${v.toFixed(v >= 10 ? 1 : 2)} u`;
}

function triggerDownload(filename: string, content: BlobPart, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  if (Array.isArray(material)) {
    material.forEach((item) => item.dispose());
    return;
  }
  material.dispose();
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      disposeMaterial(obj.material);
    }
  });
}

function collectPickables(root: THREE.Object3D): THREE.Object3D[] {
  const pickables: THREE.Object3D[] = [];
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.visible) {
      if (!obj.geometry.attributes.normal) {
        obj.geometry.computeVertexNormals();
      }
      obj.castShadow = true;
      obj.receiveShadow = true;
      pickables.push(obj);
    }
  });
  return pickables;
}

function campusHeight(x: number, z: number) {
  const ridge = 0.7 * Math.sin((x + 2) * 0.28) * Math.cos((z - 1.5) * 0.23);
  const mound = 0.9 * Math.exp(-((x - 4.2) ** 2 + (z + 1.8) ** 2) / 18);
  const dip = -0.45 * Math.exp(-((x + 5.5) ** 2 + (z - 3.2) ** 2) / 14);
  return ridge + mound + dip;
}

function addDemoBuilding(
  group: THREE.Group,
  size: [number, number, number],
  x: number,
  z: number,
  name: string,
  color: number,
) {
  const [w, h, d] = size;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.78,
      metalness: 0.08,
    }),
  );
  mesh.name = name;
  mesh.position.set(x, campusHeight(x, z) + h / 2, z);
  group.add(mesh);
}

function buildDemoCampus(): { object: THREE.Group; nativeSize: THREE.Vector3; meshCount: number } {
  const group = new THREE.Group();
  group.name = 'Demo campus';

  const terrainGeometry = new THREE.PlaneGeometry(28, 22, 160, 128);
  const positions = terrainGeometry.attributes.position as THREE.BufferAttribute;
  const colors: number[] = [];

  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = positions.getY(i);
    const y = campusHeight(x, z);
    positions.setZ(i, y);

    const green = clamp(0.24 + (y + 1.4) * 0.11, 0.18, 0.58);
    colors.push(0.11, green, 0.14 + green * 0.35);
  }

  terrainGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  terrainGeometry.rotateX(-Math.PI / 2);
  terrainGeometry.computeVertexNormals();

  const terrain = new THREE.Mesh(
    terrainGeometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.96,
      metalness: 0.02,
    }),
  );
  terrain.name = 'Terrain surface';
  group.add(terrain);

  const paths = new THREE.Mesh(
    new THREE.PlaneGeometry(10.5, 2.4),
    new THREE.MeshStandardMaterial({ color: 0x747b86, roughness: 0.88 }),
  );
  paths.rotation.x = -Math.PI / 2;
  paths.position.set(-1.4, campusHeight(-1.4, -0.6) + 0.025, -0.6);
  paths.name = 'Main walkway';
  group.add(paths);

  addDemoBuilding(group, [4.8, 2.2, 3.1], -2.8, -1.2, 'Academic block', 0xc9d5e8);
  addDemoBuilding(group, [3.2, 1.7, 2.6], 4.6, 3.6, 'Lab block', 0xb9c7dc);
  addDemoBuilding(group, [2.6, 3.4, 2.2], 1.2, -4.4, 'Library tower', 0xe1d4c0);
  addDemoBuilding(group, [5.3, 1.3, 1.9], 0.8, 4.8, 'Workshop shed', 0xb7c5a5);

  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  return {
    object: group,
    nativeSize: size,
    meshCount: collectPickables(group).length,
  };
}

async function parseUploadedAsset(
  asset: UploadedAsset,
): Promise<{ object: THREE.Object3D; nativeSize: THREE.Vector3; meshCount: number }> {
  const object =
    asset.kind === 'glb'
      ? await new Promise<THREE.Object3D>((resolve, reject) => {
          const loader = new GLTFLoader();
          loader.parse(
            asset.data as ArrayBuffer,
            '',
            (gltf) => resolve(gltf.scene),
            (err) => reject(err),
          );
        })
      : new OBJLoader().parse(asset.data as string);

  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const meshCount = collectPickables(object).length;
  return { object, nativeSize: size, meshCount };
}

function normalizeLoadedObject(object: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  object.position.set(-center.x, -box.min.y, -center.z);
  const fitScale = 16 / Math.max(size.x, size.z, 1);
  return { fitScale, size };
}

export default function CampusTerrainView() {
  const s = useSimStore();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const terrainRootRef = useRef<THREE.Group | null>(null);
  const pickablesRef = useRef<THREE.Object3D[]>([]);
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const sunMeshRef = useRef<THREE.Mesh | null>(null);
  const sunArrowRef = useRef<THREE.ArrowHelper | null>(null);
  const markerRef = useRef<THREE.Mesh | null>(null);
  const markerRingRef = useRef<THREE.Mesh | null>(null);
  const markerNormalRef = useRef<THREE.ArrowHelper | null>(null);
  const orbitRef = useRef({
    theta: Math.PI / 5.3,
    phi: Math.PI / 3.1,
    radius: 22,
    target: new THREE.Vector3(0, 2.6, 0),
  });
  const fitScaleRef = useRef(1);

  const [asset, setAsset] = useState<UploadedAsset | null>(null);
  const [stats, setStats] = useState<ModelStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [profile, setProfile] = useState<TerrainProfileSample[]>([]);
  const [currentSample, setCurrentSample] = useState<TerrainProfileSample | null>(null);
  const [northOffsetDeg, setNorthOffsetDeg] = useState(0);
  const [displayScale, setDisplayScale] = useState(1);
  const [verticalExaggeration, setVerticalExaggeration] = useState(1);

  const currentSolar = useMemo(
    () =>
      computeSolarAngles({
        latitude: s.latitude,
        dayOfYear: s.dayOfYear,
        timeOfDay: s.timeOfDay,
        panelTiltDeg: 0,
        panelAzimuthDeg: 0,
      }),
    [s.latitude, s.dayOfYear, s.timeOfDay],
  );

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x09111f, 1);
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x09111f, 34, 80);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(42, mount.clientWidth / mount.clientHeight, 0.1, 250);
    cameraRef.current = camera;

    const updateCamera = () => {
      const orbit = orbitRef.current;
      const x = orbit.radius * Math.sin(orbit.phi) * Math.sin(orbit.theta);
      const y = orbit.radius * Math.cos(orbit.phi);
      const z = orbit.radius * Math.sin(orbit.phi) * Math.cos(orbit.theta);
      camera.position.set(orbit.target.x + x, orbit.target.y + y, orbit.target.z + z);
      camera.lookAt(orbit.target);
    };
    updateCamera();

    scene.add(new THREE.HemisphereLight(0xa6c8ff, 0x0b1220, 0.68));
    scene.add(new THREE.AmbientLight(0x1f2b42, 0.3));

    const sunLight = new THREE.DirectionalLight(0xffefc4, 1.8);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.left = -22;
    sunLight.shadow.camera.right = 22;
    sunLight.shadow.camera.top = 22;
    sunLight.shadow.camera.bottom = -22;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 90;
    scene.add(sunLight);
    scene.add(sunLight.target);
    sunLightRef.current = sunLight;

    const sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.8, 28, 28),
      new THREE.MeshBasicMaterial({ color: 0xffd780 }),
    );
    scene.add(sunMesh);
    sunMeshRef.current = sunMesh;

    const sunArrow = new THREE.ArrowHelper(
      new THREE.Vector3(1, -1, 0).normalize(),
      new THREE.Vector3(5, 8, 0),
      7.5,
      0xffc85a,
      0.75,
      0.35,
    );
    scene.add(sunArrow);
    sunArrowRef.current = sunArrow;

    const terrainRoot = new THREE.Group();
    scene.add(terrainRoot);
    terrainRootRef.current = terrainRoot;

    const basePlate = new THREE.Mesh(
      new THREE.CircleGeometry(22, 96),
      new THREE.MeshStandardMaterial({
        color: 0x0c1627,
        roughness: 1,
      }),
    );
    basePlate.rotation.x = -Math.PI / 2;
    basePlate.position.y = -0.05;
    basePlate.receiveShadow = true;
    scene.add(basePlate);

    const grid = new THREE.GridHelper(42, 42, 0x244066, 0x122038);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.35;
    scene.add(grid);

    const northArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(-16, 0.01, 12),
      3.5,
      0x46e8a5,
      0.55,
      0.22,
    );
    scene.add(northArrow);

    const eastArrow = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-16, 0.01, 12),
      3,
      0x5fb8ff,
      0.45,
      0.18,
    );
    scene.add(eastArrow);

    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 18, 18),
      new THREE.MeshStandardMaterial({
        color: 0x46e8a5,
        emissive: 0x123d31,
        emissiveIntensity: 0.8,
      }),
    );
    marker.visible = false;
    scene.add(marker);
    markerRef.current = marker;

    const markerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.38, 0.62, 48),
      new THREE.MeshBasicMaterial({
        color: 0x8af7bf,
        transparent: true,
        opacity: 0.84,
        side: THREE.DoubleSide,
      }),
    );
    markerRing.visible = false;
    scene.add(markerRing);
    markerRingRef.current = markerRing;

    const markerNormal = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 0),
      2.2,
      0x8af7bf,
      0.5,
      0.24,
    );
    markerNormal.visible = false;
    scene.add(markerNormal);
    markerNormalRef.current = markerNormal;

    const dom = renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let dragging = false;
    let moved = false;
    let lastX = 0;
    let lastY = 0;

    const resetCamera = () => {
      orbitRef.current.theta = Math.PI / 5.3;
      orbitRef.current.phi = Math.PI / 3.1;
      orbitRef.current.radius = 22;
      orbitRef.current.target.set(0, 2.6, 0);
      updateCamera();
    };

    const screenToNdc = (clientX: number, clientY: number) => {
      const rect = dom.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    };

    const tryPick = (clientX: number, clientY: number) => {
      if (!cameraRef.current || pickablesRef.current.length === 0) return;
      screenToNdc(clientX, clientY);
      raycaster.setFromCamera(ndc, cameraRef.current);
      const hit = raycaster.intersectObjects(pickablesRef.current, true)[0];
      if (!hit || !hit.face) return;
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
      const worldNormal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
      if (worldNormal.y < 0) worldNormal.negate();
      const label = hit.object.name || hit.object.parent?.name || 'Terrain mesh';
      setSelection({
        label,
        point: [hit.point.x, hit.point.y, hit.point.z],
        normal: [worldNormal.x, worldNormal.y, worldNormal.z],
      });
    };

    const onDown = (e: PointerEvent) => {
      dragging = true;
      moved = false;
      lastX = e.clientX;
      lastY = e.clientY;
      dom.setPointerCapture(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = (e.clientX - lastX) * 0.005;
      const dy = (e.clientY - lastY) * 0.005;
      if (Math.abs(dx) + Math.abs(dy) > 0.01) moved = true;
      orbitRef.current.theta -= dx;
      orbitRef.current.phi = clamp(orbitRef.current.phi + dy, 0.18, Math.PI - 0.12);
      lastX = e.clientX;
      lastY = e.clientY;
      updateCamera();
    };

    const onUp = (e: PointerEvent) => {
      dragging = false;
      try {
        dom.releasePointerCapture(e.pointerId);
      } catch {
        // no-op
      }
      if (!moved) tryPick(e.clientX, e.clientY);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      orbitRef.current.radius = clamp(orbitRef.current.radius * (1 + e.deltaY * 0.0012), 8, 48);
      updateCamera();
    };

    dom.addEventListener('pointerdown', onDown);
    dom.addEventListener('pointermove', onMove);
    dom.addEventListener('pointerup', onUp);
    dom.addEventListener('pointercancel', onUp);
    dom.addEventListener('wheel', onWheel, { passive: false });

    const resizeObserver = new ResizeObserver(() => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    });
    resizeObserver.observe(mount);

    let frameId = 0;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    (mount as HTMLDivElement).dataset.resetCamera = 'true';
    (mount as HTMLDivElement).onclick = null;
    (mount as HTMLDivElement).ondblclick = () => resetCamera();

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerup', onUp);
      dom.removeEventListener('pointercancel', onUp);
      dom.removeEventListener('wheel', onWheel);
      renderer.dispose();
      basePlate.geometry.dispose();
      disposeMaterial(basePlate.material);
      grid.geometry.dispose();
      disposeMaterial(grid.material as THREE.Material);
      sunMesh.geometry.dispose();
      disposeMaterial(sunMesh.material);
      marker.geometry.dispose();
      disposeMaterial(marker.material);
      markerRing.geometry.dispose();
      disposeMaterial(markerRing.material);
      if (terrainRoot.children.length) {
        terrainRoot.children.forEach((child) => disposeObject(child));
      }
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    const root = terrainRootRef.current;
    if (!root) return;
    const terrainRoot: THREE.Group = root;
    setLoading(true);
    setError(null);
    setSelection(null);

    let disposed = false;

    async function loadModel() {
      try {
        const loaded = asset ? await parseUploadedAsset(asset) : buildDemoCampus();
        if (disposed) {
          disposeObject(loaded.object);
          return;
        }

        while (terrainRoot.children.length) {
          const child = terrainRoot.children.pop();
          if (child) {
            terrainRoot.remove(child);
            disposeObject(child);
          }
        }

        const holder = new THREE.Group();
        const { fitScale } = normalizeLoadedObject(loaded.object);
        fitScaleRef.current = fitScale;
        holder.add(loaded.object);
        terrainRoot.add(holder);
        pickablesRef.current = collectPickables(holder);

        setStats({
          name: asset?.name ?? 'Demo campus',
          source: asset ? 'upload' : 'demo',
          nativeSize: [loaded.nativeSize.x, loaded.nativeSize.y, loaded.nativeSize.z],
          meshCount: loaded.meshCount,
          fitScale,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse model.');
      } finally {
        if (!disposed) setLoading(false);
      }
    }

    loadModel();

    return () => {
      disposed = true;
    };
  }, [asset]);

  useEffect(() => {
    const terrainRoot = terrainRootRef.current;
    if (!terrainRoot) return;
    const uniformScale = fitScaleRef.current * displayScale;
    terrainRoot.rotation.y = northOffsetDeg * DEG;
    terrainRoot.scale.set(uniformScale, uniformScale * verticalExaggeration, uniformScale);
    setSelection(null);
  }, [northOffsetDeg, displayScale, verticalExaggeration, stats?.name]);

  useEffect(() => {
    const marker = markerRef.current;
    const ring = markerRingRef.current;
    const normalArrow = markerNormalRef.current;
    if (!marker || !ring || !normalArrow) return;

    if (!selection) {
      marker.visible = false;
      ring.visible = false;
      normalArrow.visible = false;
      return;
    }

    const point = new THREE.Vector3(...selection.point);
    const normal = new THREE.Vector3(...selection.normal).normalize();

    marker.visible = true;
    marker.position.copy(point);
    ring.visible = true;
    ring.position.copy(point.clone().add(normal.clone().multiplyScalar(0.06)));
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);

    normalArrow.visible = true;
    normalArrow.position.copy(point.clone().add(normal.clone().multiplyScalar(0.08)));
    normalArrow.setDirection(normal);
    normalArrow.setLength(2.2, 0.5, 0.24);
  }, [selection]);

  useEffect(() => {
    const sunLight = sunLightRef.current;
    const sunMesh = sunMeshRef.current;
    const sunArrow = sunArrowRef.current;
    if (!sunLight || !sunMesh || !sunArrow) return;

    const target = selection ? new THREE.Vector3(...selection.point) : new THREE.Vector3(0, 1.8, 0);
    const sunDir = new THREE.Vector3(...currentSolar.sunVector).normalize();
    const sunPos = sunDir.clone().multiplyScalar(34);

    sunMesh.position.copy(sunPos);
    sunMesh.visible = currentSolar.isDay;

    sunLight.position.copy(sunPos);
    sunLight.target.position.copy(target);
    sunLight.target.updateMatrixWorld();
    sunLight.intensity = currentSolar.isDay ? 2.1 : 0.22;

    const arrowOrigin = target.clone().add(sunDir.clone().multiplyScalar(8.5));
    sunArrow.position.copy(arrowOrigin);
    sunArrow.setDirection(sunDir.clone().negate());
    sunArrow.setLength(8.2, 0.8, 0.32);
    sunArrow.setColor(new THREE.Color(currentSolar.isDay ? 0xffc85a : 0x5a657b));
    sunArrow.visible = true;
  }, [currentSolar, selection]);

  useEffect(() => {
    if (!selection || pickablesRef.current.length === 0) {
      setProfile([]);
      setCurrentSample(null);
      return;
    }

    const point = new THREE.Vector3(...selection.point);
    const normal = new THREE.Vector3(...selection.normal).normalize();

    const sampleAtTime = (timeOfDay: number): TerrainProfileSample => {
      const solar = computeSolarAngles({
        latitude: s.latitude,
        dayOfYear: s.dayOfYear,
        timeOfDay,
        panelTiltDeg: 0,
        panelAzimuthDeg: 0,
      });

      if (!solar.isDay) {
        return {
          hour: timeOfDay,
          hourLabel: formatHour(timeOfDay),
          altitudeDeg: solar.altitudeDeg,
          azimuthDeg: solar.azimuthDeg,
          shaded: false,
          cosIncidence: 0,
          directWm2: 0,
        };
      }

      const sunDir = new THREE.Vector3(...solar.sunVector).normalize();
      const cosIncidence = Math.max(normal.dot(sunDir), 0);
      let shaded = false;

      if (cosIncidence > 0) {
        const ray = new THREE.Raycaster(
          point.clone().add(normal.clone().multiplyScalar(0.08)).add(sunDir.clone().multiplyScalar(0.03)),
          sunDir,
          0.01,
          200,
        );
        shaded = ray.intersectObjects(pickablesRef.current, true).length > 0;
      }

      return {
        hour: timeOfDay,
        hourLabel: formatHour(timeOfDay),
        altitudeDeg: solar.altitudeDeg,
        azimuthDeg: solar.azimuthDeg,
        shaded,
        cosIncidence,
        directWm2: shaded ? 0 : s.dni * cosIncidence,
      };
    };

    setProfile(SAMPLE_HOURS.map(sampleAtTime));
    setCurrentSample(sampleAtTime(s.timeOfDay));
  }, [selection, s.latitude, s.dayOfYear, s.timeOfDay, s.dni, northOffsetDeg, displayScale, verticalExaggeration, stats?.name]);

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const lower = file.name.toLowerCase();
    try {
      if (lower.endsWith('.glb')) {
        setAsset({ name: file.name, kind: 'glb', data: await file.arrayBuffer() });
      } else if (lower.endsWith('.obj')) {
        setAsset({ name: file.name, kind: 'obj', data: await file.text() });
      } else {
        setError('Use a .glb or .obj model for the terrain tab.');
      }
    } finally {
      e.target.value = '';
    }
  }

  function exportScreenshot() {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const fileStem = (stats?.name ?? 'campus-terrain').replace(/\.[^/.]+$/, '').replace(/\s+/g, '-').toLowerCase();
    const dataUrl = renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${fileStem}-terrain-view.png`;
    a.click();
  }

  function exportCsv() {
    if (!selection || profile.length === 0) return;
    const rows = [
      'hour,altitude_deg,azimuth_deg,shaded,cos_incidence,direct_wm2',
      ...profile.map(
        (sample) =>
          `${sample.hour},${sample.altitudeDeg.toFixed(3)},${sample.azimuthDeg.toFixed(3)},${sample.shaded ? 1 : 0},${sample.cosIncidence.toFixed(4)},${sample.directWm2.toFixed(2)}`,
      ),
    ];
    const fileStem = (stats?.name ?? 'terrain-profile').replace(/\.[^/.]+$/, '').replace(/\s+/g, '-').toLowerCase();
    triggerDownload(`${fileStem}-irradiance-profile.csv`, rows.join('\n'), 'text/csv;charset=utf-8');
  }

  const selectedSlopeDeg = selection
    ? Math.acos(clamp(selection.normal[1], -1, 1)) * (180 / Math.PI)
    : 0;

  return (
    <section className="panel terrain-panel">
      <div className="terrain-header">
        <div>
          <h2>Campus Terrain Lab</h2>
          <p className="theory-p terrain-intro">
            Upload a campus `.glb` or `.obj`, align its north, then click any roof or terrain patch
            to evaluate direct sun access through the day. Until you have the real college mesh, the
            built-in demo campus gives you the full workflow.
          </p>
        </div>
        <div className="terrain-header-note">
          Scene axes: east = +x · up = +y · south = +z
        </div>
      </div>

      <div className="terrain-grid">
        <div className="terrain-scene-wrap">
          <div ref={mountRef} className="terrain-mount" />
          <div className="scene-overlay terrain-scene-info">
            <div><strong>{stats?.name ?? 'Loading model'}</strong></div>
            <div>{stats?.source === 'upload' ? 'Uploaded terrain mesh' : 'Built-in demo campus'}</div>
            <div>Sun altitude {currentSolar.altitudeDeg.toFixed(1)}° · Time {formatHour(s.timeOfDay)}</div>
          </div>
          <div className="terrain-legend">
            <span><i className="terrain-legend-green" /> picked analysis point</span>
            <span><i className="terrain-legend-gold" /> incoming sun direction</span>
          </div>
        </div>

        <div className="terrain-side">
          <div className="terrain-card">
            <div className="substring-head">Terrain source</div>
            <div className="terrain-actions">
              <button className="preset-btn" onClick={() => setAsset(null)}>
                Use demo campus
              </button>
              <label className="preset-btn terrain-upload">
                Load .glb / .obj
                <input type="file" accept=".glb,.obj" onChange={handleUpload} />
              </label>
            </div>
            <div className="terrain-status">
              <span>Model: {stats?.name ?? 'Preparing terrain…'}</span>
              <span>Meshes: {stats?.meshCount ?? 0}</span>
              <span>
                Native box:{' '}
                {stats
                  ? `${formatMeters(stats.nativeSize[0])} × ${formatMeters(stats.nativeSize[1])} × ${formatMeters(stats.nativeSize[2])}`
                  : '—'}
              </span>
            </div>
            <div className="theory-p terrain-note">
              `.glb` is the best option for a real college mesh. `.obj` works too, but textures and
              material fidelity may be simpler.
            </div>
          </div>

          <div className="terrain-card">
            <div className="substring-head">Alignment</div>
            <label className="slider">
              <div className="slider-head">
                <span>North offset</span>
                <span className="slider-val">{northOffsetDeg.toFixed(0)}°</span>
              </div>
              <input
                type="range"
                min={-180}
                max={180}
                step={1}
                value={northOffsetDeg}
                onChange={(e) => setNorthOffsetDeg(Number(e.target.value))}
              />
            </label>
            <label className="slider">
              <div className="slider-head">
                <span>Display scale</span>
                <span className="slider-val">{displayScale.toFixed(2)}×</span>
              </div>
              <input
                type="range"
                min={0.4}
                max={2.5}
                step={0.05}
                value={displayScale}
                onChange={(e) => setDisplayScale(Number(e.target.value))}
              />
            </label>
            <label className="slider">
              <div className="slider-head">
                <span>Vertical exaggeration</span>
                <span className="slider-val">{verticalExaggeration.toFixed(2)}×</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={3}
                step={0.05}
                value={verticalExaggeration}
                onChange={(e) => setVerticalExaggeration(Number(e.target.value))}
              />
            </label>
            <div className="theory-p terrain-note">
              After changing alignment or scale, click the surface again to refresh the analysis
              point on the transformed mesh.
            </div>
          </div>

          <div className="terrain-card">
            <div className="substring-head">Point analysis</div>
            {selection && currentSample ? (
              <div className="world-mini-grid">
                <div className="metric">
                  <div className="metric-label">Selected patch</div>
                  <div className="metric-value terrain-metric-copy">{selection.label}</div>
                </div>
                <div className="metric">
                  <div className="metric-label">Slope</div>
                  <div className="metric-value">{selectedSlopeDeg.toFixed(1)}°</div>
                </div>
                <div className="metric">
                  <div className="metric-label">Shadowed now</div>
                  <div className="metric-value">{currentSample.shaded ? 'Yes' : 'No'}</div>
                </div>
                <div className="metric">
                  <div className="metric-label">Direct now</div>
                  <div className="metric-value">{currentSample.directWm2.toFixed(0)} W/m²</div>
                </div>
              </div>
            ) : (
              <div className="theory-p terrain-note">
                Click a roof, facade, or ground patch in the 3D scene to start terrain analysis.
              </div>
            )}
          </div>

          <div className="terrain-card">
            <div className="substring-head">Exports</div>
            <div className="terrain-actions">
              <button className="preset-btn" onClick={exportScreenshot}>
                Export PNG
              </button>
              <button className="preset-btn" onClick={exportCsv} disabled={!selection || profile.length === 0}>
                Export hourly CSV
              </button>
            </div>
            <div className="theory-p terrain-note">
              PNG captures the current terrain view. CSV exports hourly direct irradiance and shade
              state for the selected patch.
            </div>
          </div>

          {loading ? <div className="terrain-loading">Loading terrain mesh…</div> : null}
          {error ? <div className="world-error">{error}</div> : null}
        </div>
      </div>

      <div className="chart-block terrain-chart">
        <h3>Hourly Direct Irradiance On Selected Patch</h3>
        {profile.length > 0 ? (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={profile}>
              <defs>
                <linearGradient id="terrainSolarFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#ffbd4a" stopOpacity={0.7} />
                  <stop offset="100%" stopColor="#ffbd4a" stopOpacity={0.06} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#22314f" strokeDasharray="3 3" />
              <XAxis dataKey="hourLabel" stroke="#9fb4d9" tick={{ fontSize: 11 }} />
              <YAxis stroke="#9fb4d9" tick={{ fontSize: 11 }} width={56} />
              <Tooltip
                contentStyle={{
                  background: '#101a2e',
                  border: '1px solid #2b3a5e',
                  borderRadius: 8,
                  color: '#e6eefc',
                }}
                formatter={(value: number, key: string) => [
                  key === 'directWm2' ? `${value.toFixed(0)} W/m²` : value,
                  key === 'directWm2' ? 'Direct irradiance' : key,
                ]}
                labelFormatter={(label) => `Hour ${label}`}
              />
              <Area
                type="monotone"
                dataKey="directWm2"
                stroke="#ffbd4a"
                fill="url(#terrainSolarFill)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="terrain-chart-empty">
            Pick a surface patch in the 3D scene to generate the daily sun-exposure profile.
          </div>
        )}
      </div>
    </section>
  );
}
