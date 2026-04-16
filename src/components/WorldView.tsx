import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useSimStore } from '../state/store';
import { computeSolarAngles, getDeclination } from '../modules/solarGeometry';
import { fetchClimateFor, formatLatLon, type ClimateResult } from '../modules/climate';

const EARTH_RADIUS = 2.2;
const SUN_DISTANCE = 24;
const AXIAL_TILT_DEG = 23.45;

const EARTH_TEXTURE_URLS = [
  'https://unpkg.com/three-globe@2.31.0/example/img/earth-blue-marble.jpg',
  'https://threejs.org/examples/textures/land_ocean_ice_cloud_2048.jpg',
];
const EARTH_NIGHT_URL = 'https://unpkg.com/three-globe@2.31.0/example/img/earth-night.jpg';
const EARTH_TOPOLOGY_URL = 'https://unpkg.com/three-globe@2.31.0/example/img/earth-topology.png';

type ViewPreset = 'globe' | 'region' | 'site';

const VIEW_PRESET_RADIUS: Record<ViewPreset, number> = {
  globe: 7.8,
  region: 5.4,
  site: 3.8,
};

const CITY_PRESETS: { label: string; lat: number; lon: number }[] = [
  { label: 'NIT Trichy, IN', lat: 10.759, lon: 78.813 },
  { label: 'New Delhi, IN', lat: 28.6139, lon: 77.209 },
  { label: 'London, UK', lat: 51.5072, lon: -0.1276 },
  { label: 'Nairobi, KE', lat: -1.2864, lon: 36.8172 },
  { label: 'Sydney, AU', lat: -33.8688, lon: 151.2093 },
  { label: 'Reykjavik, IS', lat: 64.1466, lon: -21.9426 },
  { label: 'Quito, EC', lat: -0.1807, lon: -78.4678 },
  { label: 'San Francisco, US', lat: 37.7749, lon: -122.4194 },
  { label: 'Tromso, NO', lat: 69.6492, lon: 18.9553 },
];

interface WorldProps {
  latitude: number;
  longitude: number;
  dayOfYear: number;
  timeOfDay: number;
  viewPreset: ViewPreset;
  focusNonce: number;
  onPick: (lat: number, lon: number) => void;
}

function dateFromDayOfYear(day: number): string {
  const d = new Date(Date.UTC(2025, 0, 1));
  d.setUTCDate(day);
  return d.toISOString().slice(5, 10);
}

function clamp(x: number, min: number, max: number) {
  return Math.min(Math.max(x, min), max);
}

function latLonToVec3(latDeg: number, lonDeg: number, radius: number): THREE.Vector3 {
  const lat = THREE.MathUtils.degToRad(latDeg);
  const lon = THREE.MathUtils.degToRad(lonDeg);
  const cosLat = Math.cos(lat);
  return new THREE.Vector3(
    radius * cosLat * Math.cos(lon),
    radius * Math.sin(lat),
    -radius * cosLat * Math.sin(lon),
  );
}

function vec3ToLatLon(v: THREE.Vector3): { lat: number; lon: number } {
  const n = v.clone().normalize();
  const lat = THREE.MathUtils.radToDeg(Math.asin(n.y));
  const lon = THREE.MathUtils.radToDeg(Math.atan2(-n.z, n.x));
  return { lat, lon };
}

function subsolarPoint(dayOfYear: number, solarTime: number, panelLon: number) {
  const lat = getDeclination(dayOfYear);
  const lon = panelLon + 15 * (12 - solarTime);
  const lonNorm = ((((lon + 180) % 360) + 360) % 360) - 180;
  return { lat, lon: lonNorm };
}

function sliderValue(value: number, step: number, unit?: string) {
  return `${value.toFixed(step < 1 ? 2 : 0)}${unit ? ` ${unit}` : ''}`;
}

function WorldSlider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="slider">
      <div className="slider-head">
        <span>{props.label}</span>
        <span className="slider-val">{sliderValue(props.value, props.step, props.unit)}</span>
      </div>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </label>
  );
}

function WorldScene(props: WorldProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const hoverTextRef = useRef<HTMLDivElement | null>(null);
  const earthGroupRef = useRef<THREE.Group | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const updateCameraRef = useRef<(() => void) | null>(null);
  const cameraStateRef = useRef({
    theta: Math.PI / 1.55,
    phi: Math.PI / 2.08,
    radius: VIEW_PRESET_RADIUS.globe,
  });
  const pickMarkerRef = useRef<THREE.Mesh | null>(null);
  const selectionRingRef = useRef<THREE.Mesh | null>(null);
  const normalArrowRef = useRef<THREE.ArrowHelper | null>(null);
  const sunArrowRef = useRef<THREE.ArrowHelper | null>(null);
  const sunGroupRef = useRef<THREE.Group | null>(null);
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const latestOnPickRef = useRef(props.onPick);

  useEffect(() => {
    latestOnPickRef.current = props.onPick;
  }, [props.onPick]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(width, height);
    renderer.setClearColor(0x02030a, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 400);
    cameraRef.current = camera;

    function updateCamera() {
      const cam = cameraStateRef.current;
      const x = cam.radius * Math.sin(cam.phi) * Math.cos(cam.theta);
      const y = cam.radius * Math.cos(cam.phi);
      const z = cam.radius * Math.sin(cam.phi) * Math.sin(cam.theta);
      camera.position.set(x, y, z);
      camera.lookAt(0, 0, 0);
    }

    updateCameraRef.current = updateCamera;
    updateCamera();

    const starCount = 4500;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 90 + Math.random() * 40;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPositions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.cos(phi);
      starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      size: 0.35,
      color: 0xffffff,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    const earthGroup = new THREE.Group();
    earthGroup.rotation.z = -THREE.MathUtils.degToRad(AXIAL_TILT_DEG);
    earthGroupRef.current = earthGroup;
    scene.add(earthGroup);

    const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS, 96, 96);
    const earthMat = new THREE.MeshPhongMaterial({
      color: 0x1f3a68,
      emissive: 0x050a18,
      emissiveIntensity: 0.65,
      specular: 0x223355,
      shininess: 18,
    });
    const earth = new THREE.Mesh(earthGeo, earthMat);
    earthGroup.add(earth);

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');

    function tryLoad(urls: string[], onLoad: (texture: THREE.Texture) => void) {
      let idx = 0;
      const attempt = () => {
        if (idx >= urls.length) return;
        loader.load(
          urls[idx],
          (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = 4;
            onLoad(texture);
          },
          undefined,
          () => {
            idx += 1;
            attempt();
          },
        );
      };
      attempt();
    }

    tryLoad(EARTH_TEXTURE_URLS, (texture) => {
      earthMat.map = texture;
      earthMat.color.setHex(0xffffff);
      earthMat.needsUpdate = true;
    });
    tryLoad([EARTH_NIGHT_URL], (texture) => {
      earthMat.emissiveMap = texture;
      earthMat.emissiveIntensity = 1;
      earthMat.emissive.setHex(0xffffff);
      earthMat.needsUpdate = true;
    });
    tryLoad([EARTH_TOPOLOGY_URL], (texture) => {
      earthMat.bumpMap = texture;
      earthMat.bumpScale = 0.02;
      earthMat.needsUpdate = true;
    });

    const atmosphereGeo = new THREE.SphereGeometry(EARTH_RADIUS * 1.08, 64, 64);
    const atmosphereMat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        glowColor: { value: new THREE.Color(0x5fb8ff) },
      },
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        uniform vec3 glowColor;
        void main() {
          float intensity = pow(0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.5);
          gl_FragColor = vec4(glowColor, 1.0) * intensity;
        }
      `,
    });
    earthGroup.add(new THREE.Mesh(atmosphereGeo, atmosphereMat));

    const pinGeo = new THREE.ConeGeometry(0.05, 0.22, 16);
    pinGeo.translate(0, 0.11, 0);
    const pinMat = new THREE.MeshBasicMaterial({ color: 0x46e8a5 });
    const pin = new THREE.Mesh(pinGeo, pinMat);
    const pinGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 20, 20),
      new THREE.MeshBasicMaterial({
        color: 0x46e8a5,
        transparent: true,
        opacity: 0.24,
      }),
    );
    pin.add(pinGlow);
    pin.renderOrder = 3;
    earthGroup.add(pin);
    pickMarkerRef.current = pin;

    const selectionRing = new THREE.Mesh(
      new THREE.RingGeometry(0.12, 0.18, 48),
      new THREE.MeshBasicMaterial({
        color: 0x8af7bf,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
      }),
    );
    selectionRing.renderOrder = 2;
    scene.add(selectionRing);
    selectionRingRef.current = selectionRing;

    const normalArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, EARTH_RADIUS, 0),
      0.62,
      0x46e8a5,
      0.16,
      0.08,
    );
    scene.add(normalArrow);
    normalArrowRef.current = normalArrow;

    const sunArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, EARTH_RADIUS + 0.4, 0),
      1.2,
      0xffc85a,
      0.2,
      0.1,
    );
    scene.add(sunArrow);
    sunArrowRef.current = sunArrow;

    const sunGroup = new THREE.Group();
    scene.add(sunGroup);
    sunGroupRef.current = sunGroup;

    sunGroup.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(0.7, 32, 32),
        new THREE.MeshBasicMaterial({ color: 0xffe6a8 }),
      ),
    );

    const sunHaloGeo = new THREE.SphereGeometry(1.4, 48, 48);
    const sunHaloMat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      uniforms: { haloColor: { value: new THREE.Color(0xffc85a) } },
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        uniform vec3 haloColor;
        void main() {
          float i = pow(0.8 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
          gl_FragColor = vec4(haloColor, 1.0) * i;
        }
      `,
    });
    sunGroup.add(new THREE.Mesh(sunHaloGeo, sunHaloMat));

    const sunLight = new THREE.DirectionalLight(0xfff1cc, 2.35);
    scene.add(sunLight);
    scene.add(sunLight.target);
    sunLightRef.current = sunLight;

    const ambient = new THREE.AmbientLight(0x2a3a60, 0.18);
    scene.add(ambient);

    const dom = renderer.domElement;
    let dragging = false;
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

    function raycastEarth() {
      raycaster.setFromCamera(ndc, camera);
      return raycaster.intersectObject(earth, false)[0] ?? null;
    }

    function onClick(e: { clientX: number; clientY: number }) {
      screenToNdc(e);
      const hit = raycastEarth();
      if (!hit) return;
      const local = earthGroup.worldToLocal(hit.point.clone());
      const { lat, lon } = vec3ToLatLon(local);
      latestOnPickRef.current(lat, lon);
    }

    function updateHoverLabel(e: PointerEvent) {
      screenToNdc(e);
      const hit = raycastEarth();
      const label = hoverTextRef.current;
      if (!label) return;
      if (!hit) {
        label.style.display = 'none';
        return;
      }
      const local = earthGroup.worldToLocal(hit.point.clone());
      const { lat, lon } = vec3ToLatLon(local);
      const rect = dom.getBoundingClientRect();
      label.style.display = 'block';
      label.style.left = `${e.clientX - rect.left + 12}px`;
      label.style.top = `${e.clientY - rect.top + 12}px`;
      label.textContent = formatLatLon(lat, lon);
    }

    function onDown(e: PointerEvent) {
      dragging = true;
      moved = false;
      lastX = e.clientX;
      lastY = e.clientY;
      dom.setPointerCapture(e.pointerId);
    }

    function onMove(e: PointerEvent) {
      updateHoverLabel(e);
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      const cam = cameraStateRef.current;
      cam.theta -= dx * 0.005;
      cam.phi = clamp(cam.phi + dy * 0.005, 0.22, Math.PI - 0.22);
      lastX = e.clientX;
      lastY = e.clientY;
      updateCamera();
    }

    function onUp(e: PointerEvent) {
      dragging = false;
      try {
        dom.releasePointerCapture(e.pointerId);
      } catch {
        // no-op
      }
      if (!moved) onClick(e);
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const cam = cameraStateRef.current;
      cam.radius = clamp(cam.radius * (1 + e.deltaY * 0.0012), 3.1, 24);
      updateCamera();
    }

    dom.addEventListener('pointerdown', onDown);
    dom.addEventListener('pointermove', onMove);
    dom.addEventListener('pointerup', onUp);
    dom.addEventListener('pointercancel', onUp);
    dom.addEventListener('wheel', onWheel, { passive: false });

    function onResize() {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(mount);

    let frame = 0;
    function animate() {
      frame = requestAnimationFrame(animate);
      stars.rotation.y += 0.0003;
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerup', onUp);
      dom.removeEventListener('pointercancel', onUp);
      dom.removeEventListener('wheel', onWheel);
      renderer.dispose();
      earthGeo.dispose();
      earthMat.dispose();
      atmosphereGeo.dispose();
      atmosphereMat.dispose();
      pinGeo.dispose();
      pinMat.dispose();
      starGeo.dispose();
      starMat.dispose();
      sunHaloGeo.dispose();
      sunHaloMat.dispose();
      selectionRing.geometry.dispose();
      (selectionRing.material as THREE.Material).dispose();
      normalArrow.line.geometry.dispose();
      (normalArrow.line.material as THREE.Material).dispose();
      normalArrow.cone.geometry.dispose();
      (normalArrow.cone.material as THREE.Material).dispose();
      sunArrow.line.geometry.dispose();
      (sunArrow.line.material as THREE.Material).dispose();
      sunArrow.cone.geometry.dispose();
      (sunArrow.cone.material as THREE.Material).dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    const pin = pickMarkerRef.current;
    const ring = selectionRingRef.current;
    const normalArrow = normalArrowRef.current;
    const sunArrow = sunArrowRef.current;
    const earthGroup = earthGroupRef.current;
    const sunGroup = sunGroupRef.current;
    const sunLight = sunLightRef.current;
    if (!pin || !ring || !normalArrow || !sunArrow || !earthGroup || !sunGroup || !sunLight) {
      return;
    }

    const pinLocal = latLonToVec3(props.latitude, props.longitude, EARTH_RADIUS * 1.008);
    const pinWorld = pinLocal.clone().applyQuaternion(earthGroup.quaternion);
    const worldNormal = pinWorld.clone().normalize();

    pin.position.copy(pinLocal);
    pin.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      pinLocal.clone().normalize(),
    );

    ring.position.copy(pinWorld.clone().multiplyScalar(1.012));
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), worldNormal);

    const subsolar = subsolarPoint(props.dayOfYear, props.timeOfDay, props.longitude);
    const sunWorldDir = latLonToVec3(subsolar.lat, subsolar.lon, 1)
      .applyQuaternion(earthGroup.quaternion)
      .normalize();
    const sunWorld = sunWorldDir.clone().multiplyScalar(SUN_DISTANCE);
    sunGroup.position.copy(sunWorld);
    sunLight.position.copy(sunWorld);
    sunLight.target.position.set(0, 0, 0);
    sunLight.target.updateMatrixWorld();

    const toSun = sunWorld.clone().sub(pinWorld).normalize();
    const directHit = worldNormal.dot(toSun) > 0;

    normalArrow.position.copy(pinWorld.clone().multiplyScalar(1.025));
    normalArrow.setDirection(worldNormal);
    normalArrow.setLength(0.72, 0.18, 0.08);
    normalArrow.setColor(new THREE.Color(directHit ? 0x46e8a5 : 0x7f96c7));

    const rayOrigin = pinWorld.clone().add(toSun.clone().multiplyScalar(1.28));
    sunArrow.position.copy(rayOrigin);
    sunArrow.setDirection(toSun.clone().negate());
    sunArrow.setLength(1.28, 0.24, 0.11);
    sunArrow.setColor(new THREE.Color(directHit ? 0xffc85a : 0x58688d));

    const ringMaterial = ring.material as THREE.MeshBasicMaterial;
    ringMaterial.color.setHex(directHit ? 0x8af7bf : 0x7d8fb8);
    ringMaterial.opacity = directHit ? 0.84 : 0.52;
  }, [props.latitude, props.longitude, props.dayOfYear, props.timeOfDay]);

  useEffect(() => {
    const earthGroup = earthGroupRef.current;
    const updateCamera = updateCameraRef.current;
    if (!earthGroup || !updateCamera) return;

    const pinWorld = latLonToVec3(props.latitude, props.longitude, 1)
      .applyQuaternion(earthGroup.quaternion)
      .normalize();
    const cam = cameraStateRef.current;
    cam.radius = VIEW_PRESET_RADIUS[props.viewPreset];
    cam.theta = Math.atan2(pinWorld.z, pinWorld.x);
    cam.phi = clamp(Math.acos(clamp(pinWorld.y, -1, 1)), 0.24, Math.PI - 0.24);
    updateCamera();
  }, [props.latitude, props.longitude, props.viewPreset, props.focusNonce]);

  return (
    <div className="world-mount-wrap">
      <div ref={mountRef} className="world-mount" />
      <div ref={hoverTextRef} className="world-hover-label" />
    </div>
  );
}

export default function WorldView() {
  const s = useSimStore();
  const [busy, setBusy] = useState(false);
  const [climate, setClimate] = useState<ClimateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [climateOpen, setClimateOpen] = useState(false);
  const [viewPreset, setViewPreset] = useState<ViewPreset>('region');
  const [focusNonce, setFocusNonce] = useState(0);
  const activeCityLabel = useMemo(() => {
    const match = CITY_PRESETS.find(
      (city) => Math.abs(city.lat - s.latitude) < 0.02 && Math.abs(city.lon - s.longitude) < 0.02,
    );
    return match?.label ?? 'Custom location';
  }, [s.latitude, s.longitude]);

  const subsolar = useMemo(
    () => subsolarPoint(s.dayOfYear, s.timeOfDay, s.longitude),
    [s.dayOfYear, s.timeOfDay, s.longitude],
  );

  const localSun = useMemo(
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

  function refocus(nextPreset?: ViewPreset) {
    if (nextPreset) setViewPreset(nextPreset);
    setFocusNonce((value) => value + 1);
  }

  function applyCoordinates(lat: number, lon: number, label: string) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    s.patch({
      latitude: clamp(lat, -90, 90),
      longitude: ((((lon + 180) % 360) + 360) % 360) - 180,
      locationLabel: label,
    });
    setClimate(null);
    setError(null);
    setClimateOpen(false);
  }

  function handlePick(lat: number, lon: number) {
    applyCoordinates(lat, lon, 'Custom pick');
    if (viewPreset === 'globe') {
      setViewPreset('region');
    }
    setFocusNonce((value) => value + 1);
  }

  function applyCity(city: { label: string; lat: number; lon: number }) {
    applyCoordinates(city.lat, city.lon, city.label);
    if (viewPreset === 'globe') {
      setViewPreset('region');
    }
    setFocusNonce((value) => value + 1);
  }

  async function handleImportClimate() {
    setBusy(true);
    setError(null);
    setClimateOpen(true);
    try {
      const result = await fetchClimateFor(s.latitude, s.longitude, s.dayOfYear);
      setClimate(result);
      s.patch({
        dni: Math.round(result.dni),
        dhi: Math.round(result.dhi),
        ghi: Math.round(result.ghi),
        ambientTempC: Math.round(result.ambientTempC),
        cellTempMode: 'estimated',
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel world-panel">
      <div className="world-header">
        <div>
          <h2>World Explorer</h2>
          <p className="theory-p world-intro">
            Pick a site on the globe, then change day and solar time to see how the incoming sun
            direction changes at that exact point. The globe coordinates now match the Earth texture
            and the simulator state.
          </p>
        </div>
        <div className="world-header-note">Drag to orbit · Scroll to zoom · Click to set site</div>
      </div>

      <div className="world-grid">
        <div className="world-scene-wrap">
          <WorldScene
            latitude={s.latitude}
            longitude={s.longitude}
            dayOfYear={s.dayOfYear}
            timeOfDay={s.timeOfDay}
            viewPreset={viewPreset}
            focusNonce={focusNonce}
            onPick={handlePick}
          />

          <div className="scene-overlay world-scene-info">
            <div><strong>{s.locationLabel}</strong></div>
            <div>{formatLatLon(s.latitude, s.longitude)}</div>
            <div>
              {localSun.isDay ? 'Daylight' : 'Night'} · Alt {localSun.altitudeDeg.toFixed(1)}°
            </div>
          </div>

          <div className="world-overlay-controls">
            {(['globe', 'region', 'site'] as ViewPreset[]).map((preset) => (
              <button
                key={preset}
                className={`world-view-btn ${viewPreset === preset ? 'world-view-btn-active' : ''}`}
                onClick={() => refocus(preset)}
              >
                {preset === 'globe' ? 'Globe' : preset === 'region' ? 'Region' : 'Site'}
              </button>
            ))}
            <button className="world-view-btn" onClick={() => refocus()}>
              Recenter
            </button>
          </div>

          <div className="world-legend">
            <span><i className="world-legend-normal" /> selected surface normal</span>
            <span><i className="world-legend-sun" /> incoming sun ray</span>
          </div>
        </div>

        <div className="world-side">
          <div className="world-card">
            <div className="substring-head">Selected site</div>
            <label className="toggle">
              <span>Preset city</span>
              <select
                value={activeCityLabel}
                onChange={(e) => {
                  const city = CITY_PRESETS.find((item) => item.label === e.target.value);
                  if (city) applyCity(city);
                }}
              >
                <option value="Custom location">Custom location</option>
                {CITY_PRESETS.map((city) => (
                  <option key={city.label} value={city.label}>
                    {city.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="world-input-grid">
              <label className="toggle world-inline-input">
                <span>Latitude</span>
                <input
                  type="number"
                  value={Number(s.latitude.toFixed(3))}
                  min={-90}
                  max={90}
                  step={0.1}
                  onChange={(e) =>
                    applyCoordinates(Number(e.target.value), s.longitude, 'Manual coordinates')
                  }
                />
              </label>
              <label className="toggle world-inline-input">
                <span>Longitude</span>
                <input
                  type="number"
                  value={Number(s.longitude.toFixed(3))}
                  min={-180}
                  max={180}
                  step={0.1}
                  onChange={(e) =>
                    applyCoordinates(s.latitude, Number(e.target.value), 'Manual coordinates')
                  }
                />
              </label>
            </div>
            <div className="world-status">
              <span>{s.locationLabel}</span>
              <span>{formatLatLon(s.latitude, s.longitude)}</span>
            </div>
          </div>

          <div className="world-card">
            <div className="substring-head">World time controls</div>
            <WorldSlider
              label={`Day of year (${dateFromDayOfYear(s.dayOfYear)})`}
              value={s.dayOfYear}
              min={1}
              max={365}
              step={1}
              onChange={(value) => s.set('dayOfYear', value)}
            />
            <WorldSlider
              label="Local solar time at pin"
              value={s.timeOfDay}
              min={0}
              max={24}
              step={0.25}
              unit="h"
              onChange={(value) => s.set('timeOfDay', value)}
            />
            <div className="theory-p world-help">
              `12.0 h` means solar noon at the selected pin. Change the time here and the sun moves
              around the Earth and the selected-point arrows update with it.
            </div>
          </div>

          <div className="world-card">
            <div className="substring-head">Sun at selected point</div>
            <div className="world-mini-grid">
              <div className="metric">
                <div className="metric-label">Daylight</div>
                <div className="metric-value">{localSun.isDay ? 'Yes' : 'No'}</div>
              </div>
              <div className="metric">
                <div className="metric-label">Altitude</div>
                <div className="metric-value">{localSun.altitudeDeg.toFixed(1)}°</div>
              </div>
              <div className="metric">
                <div className="metric-label">Zenith</div>
                <div className="metric-value">{localSun.zenithDeg.toFixed(1)}°</div>
              </div>
              <div className="metric">
                <div className="metric-label">Subsolar point</div>
                <div className="metric-value world-small-copy">
                  {formatLatLon(subsolar.lat, subsolar.lon)}
                </div>
              </div>
            </div>
          </div>

          <details
            className="world-climate-card"
            open={climateOpen}
            onToggle={(e) => setClimateOpen((e.target as HTMLDetailsElement).open)}
          >
            <summary>Climate import</summary>
            <button className="preset-btn world-import" onClick={handleImportClimate} disabled={busy}>
              {busy ? 'Fetching NASA POWER…' : 'Import NASA POWER climate'}
            </button>

            {error ? <div className="world-error">{error}</div> : null}

            {climate ? (
              <div className="world-climate">
                <div className="substring-head">NASA POWER · {climate.dateISO}</div>
                <ul>
                  <li>GHI (raw daily): {climate.raw.ghiKwhDay.toFixed(2)} kWh/m²</li>
                  <li>DNI (raw daily): {climate.raw.dniKwhDay.toFixed(2)} kWh/m²</li>
                  <li>DHI (raw daily): {climate.raw.dhiKwhDay.toFixed(2)} kWh/m²</li>
                  <li>T2m: {climate.raw.tempC.toFixed(1)} °C</li>
                </ul>
                <div className="theory-p world-help">
                  These daily totals are converted into educational peak-hour slider values so the
                  rest of the simulator remains interactive.
                </div>
              </div>
            ) : (
              <div className="theory-p world-help">
                Pulls daily GHI, DNI, DHI, and 2 m temperature for the selected point and seeds
                the sliders used everywhere else in the simulator.
              </div>
            )}
          </details>
        </div>
      </div>
    </section>
  );
}
