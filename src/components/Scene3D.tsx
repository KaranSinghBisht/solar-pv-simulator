import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useSimStore } from '../state/store';
import { runSimulation } from '../modules/simulation';

// Three.js scene with sun, panel, optional obstacle, and cast shadow.
// Everything lives inside a single useEffect that owns resize + render loop.

interface Props {
  panelShadeFactor: number; // 0-1
  incidenceDeg: number;
  sun: [number, number, number];
  normal: [number, number, number];
  isDay: boolean;
  tiltDeg: number;
  azDeg: number;
  obstacleEnabled: boolean;
  obstaclePos: [number, number, number];
  obstacleSize: [number, number, number];
  showNormal: boolean;
  showRay: boolean;
  irradianceColor: number;
}

function shadeColorForFactor(factor: number): number {
  // Interpolate dark blue -> warm yellow by irradiance (0..1200 W/m²).
  const t = Math.min(Math.max(factor, 0), 1);
  const r = Math.round(36 + (250 - 36) * t);
  const g = Math.round(60 + (210 - 60) * t);
  const b = Math.round(120 + (60 - 120) * t);
  return (r << 16) | (g << 8) | b;
}

function SceneController(props: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const sunMeshRef = useRef<THREE.Mesh | null>(null);
  const panelGroupRef = useRef<THREE.Group | null>(null);
  const panelMeshRef = useRef<THREE.Mesh | null>(null);
  const obstacleRef = useRef<THREE.Mesh | null>(null);
  const normalArrowRef = useRef<THREE.ArrowHelper | null>(null);
  const sunRayRef = useRef<THREE.ArrowHelper | null>(null);
  const hemisphereLightRef = useRef<THREE.HemisphereLight | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth;
    const height = mount.clientHeight;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x0b1220, 1);
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0b1220, 22, 60);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 120);
    camera.position.set(6, 5, 7.5);
    camera.lookAt(0, 1, 0);
    cameraRef.current = camera;

    // Ground
    const groundGeo = new THREE.PlaneGeometry(40, 40);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x1a2438, roughness: 0.9 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Compass / grid lines for orientation
    const grid = new THREE.GridHelper(40, 40, 0x244066, 0x13233d);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.35;
    scene.add(grid);

    // Ambient + hemisphere fill
    const hemi = new THREE.HemisphereLight(0x7fa8ff, 0x0a1120, 0.35);
    scene.add(hemi);
    hemisphereLightRef.current = hemi;

    // Sun directional light
    const sunLight = new THREE.DirectionalLight(0xffe6a8, 1.2);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 50;
    sunLight.shadow.camera.left = -8;
    sunLight.shadow.camera.right = 8;
    sunLight.shadow.camera.top = 8;
    sunLight.shadow.camera.bottom = -8;
    scene.add(sunLight);
    scene.add(sunLight.target);
    sunLightRef.current = sunLight;

    // Sun mesh (visual marker)
    const sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd96b }),
    );
    scene.add(sunMesh);
    sunMeshRef.current = sunMesh;

    // Panel pole
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 1.6, 12),
      new THREE.MeshStandardMaterial({ color: 0x5a6b85, metalness: 0.4, roughness: 0.4 }),
    );
    pole.position.set(0, 0.8, 0);
    pole.castShadow = true;
    pole.receiveShadow = true;
    scene.add(pole);

    // Panel group (pivot at top of pole)
    const panelGroup = new THREE.Group();
    panelGroup.position.set(0, 1.6, 0);
    scene.add(panelGroup);
    panelGroupRef.current = panelGroup;

    const panelGeo = new THREE.BoxGeometry(2.2, 0.06, 1.3);
    const panelMat = new THREE.MeshStandardMaterial({
      color: 0x2c4a86,
      roughness: 0.35,
      metalness: 0.2,
      emissive: 0x0a1020,
    });
    const panelMesh = new THREE.Mesh(panelGeo, panelMat);
    panelMesh.castShadow = true;
    panelMesh.receiveShadow = true;
    panelGroup.add(panelMesh);
    panelMeshRef.current = panelMesh;

    // Panel subtle grid lines (cells)
    const frameGeo = new THREE.EdgesGeometry(panelGeo);
    const frameLine = new THREE.LineSegments(
      frameGeo,
      new THREE.LineBasicMaterial({ color: 0x8fb7ff }),
    );
    panelGroup.add(frameLine);

    // Obstacle
    const obstacleGeo = new THREE.BoxGeometry(1, 1, 1);
    const obstacleMat = new THREE.MeshStandardMaterial({ color: 0x334066, roughness: 0.8 });
    const obstacle = new THREE.Mesh(obstacleGeo, obstacleMat);
    obstacle.castShadow = true;
    obstacle.receiveShadow = true;
    scene.add(obstacle);
    obstacleRef.current = obstacle;

    // Panel normal arrow
    const normalArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 1.65, 0),
      1.2,
      0x46e8a5,
      0.25,
      0.12,
    );
    scene.add(normalArrow);
    normalArrowRef.current = normalArrow;

    // Sun ray arrow
    const sunRay = new THREE.ArrowHelper(
      new THREE.Vector3(1, -1, 0).normalize(),
      new THREE.Vector3(5, 5, 0),
      3.5,
      0xffd96b,
      0.35,
      0.16,
    );
    scene.add(sunRay);
    sunRayRef.current = sunRay;

    // Orbit controls (manual implementation to avoid three/examples import surprises)
    const state = { theta: Math.PI / 5, phi: Math.PI / 3, radius: 10.5, target: new THREE.Vector3(0, 1.2, 0), dragging: false, lastX: 0, lastY: 0 };
    function updateCamera() {
      const r = state.radius;
      const x = r * Math.sin(state.phi) * Math.sin(state.theta);
      const y = r * Math.cos(state.phi);
      const z = r * Math.sin(state.phi) * Math.cos(state.theta);
      camera.position.set(state.target.x + x, state.target.y + y, state.target.z + z);
      camera.lookAt(state.target);
    }
    updateCamera();

    const dom = renderer.domElement;
    function onDown(e: PointerEvent) {
      state.dragging = true;
      state.lastX = e.clientX;
      state.lastY = e.clientY;
      dom.setPointerCapture(e.pointerId);
    }
    function onMove(e: PointerEvent) {
      if (!state.dragging) return;
      const dx = (e.clientX - state.lastX) * 0.005;
      const dy = (e.clientY - state.lastY) * 0.005;
      state.theta -= dx;
      state.phi = Math.min(Math.max(state.phi + dy, 0.15), Math.PI - 0.15);
      state.lastX = e.clientX;
      state.lastY = e.clientY;
      updateCamera();
    }
    function onUp(e: PointerEvent) {
      state.dragging = false;
      try { dom.releasePointerCapture(e.pointerId); } catch {}
    }
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      state.radius = Math.min(Math.max(state.radius * (1 + e.deltaY * 0.0012), 3.5), 30);
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
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(mount);

    let frameId = 0;
    function animate() {
      frameId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerup', onUp);
      dom.removeEventListener('pointercancel', onUp);
      dom.removeEventListener('wheel', onWheel);
      renderer.dispose();
      panelGeo.dispose();
      panelMat.dispose();
      groundGeo.dispose();
      groundMat.dispose();
      obstacleGeo.dispose();
      obstacleMat.dispose();
      frameGeo.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update dynamic scene properties from props every render.
  useEffect(() => {
    const panelGroup = panelGroupRef.current;
    const panelMesh = panelMeshRef.current;
    const sunLight = sunLightRef.current;
    const sunMesh = sunMeshRef.current;
    const obstacle = obstacleRef.current;
    const normalArrow = normalArrowRef.current;
    const sunRay = sunRayRef.current;
    const hemi = hemisphereLightRef.current;
    if (!panelGroup || !panelMesh || !sunLight || !sunMesh || !obstacle || !normalArrow || !sunRay || !hemi) return;

    // Panel orientation: rotate about X for tilt, Y for azimuth.
    panelGroup.rotation.set(0, 0, 0);
    panelGroup.rotateY(-props.azDeg * Math.PI / 180);
    panelGroup.rotateX(-props.tiltDeg * Math.PI / 180);

    // Sun position
    const distance = 12;
    const sunPos = new THREE.Vector3(props.sun[0], props.sun[1], props.sun[2]).multiplyScalar(distance);
    if (!props.isDay) sunPos.y = Math.max(sunPos.y, -3);
    sunLight.position.copy(sunPos);
    sunLight.target.position.set(0, 1.4, 0);
    sunLight.target.updateMatrixWorld();
    sunLight.intensity = props.isDay ? 1.15 : 0.05;
    hemi.intensity = props.isDay ? 0.35 : 0.08;
    sunMesh.visible = props.isDay;
    sunMesh.position.copy(sunPos);

    // Sun ray arrow from sun toward panel
    sunRay.visible = props.showRay && props.isDay;
    if (sunRay.visible) {
      const dir = new THREE.Vector3(-props.sun[0], -props.sun[1], -props.sun[2]).normalize();
      sunRay.position.copy(sunPos);
      sunRay.setDirection(dir);
      sunRay.setLength(distance * 0.45, 0.35, 0.16);
    }

    // Panel shading color by irradiance level
    const mat = panelMesh.material as THREE.MeshStandardMaterial;
    const colorHex = shadeColorForFactor(props.irradianceColor);
    mat.color.setHex(colorHex);
    mat.emissiveIntensity = 0.25 * props.panelShadeFactor;

    // Obstacle visibility + transform
    obstacle.visible = props.obstacleEnabled;
    if (props.obstacleEnabled) {
      obstacle.position.set(props.obstaclePos[0], props.obstaclePos[1] + props.obstacleSize[1] / 2, props.obstaclePos[2]);
      obstacle.scale.set(props.obstacleSize[0], props.obstacleSize[1], props.obstacleSize[2]);
    }

    // Normal arrow
    normalArrow.visible = props.showNormal;
    if (normalArrow.visible) {
      const worldNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(panelGroup.quaternion);
      normalArrow.position.set(0, 1.65, 0);
      normalArrow.setDirection(worldNormal.normalize());
    }
  }, [props]);

  return <div ref={mountRef} className="scene-mount" />;
}

export default function Scene3D() {
  const state = useSimStore();
  const sim = useMemo(() => runSimulation(state), [state]);
  const poa = sim.irradiance.total;
  const irrColor = Math.min(poa / 1100, 1);

  return (
    <SceneController
      panelShadeFactor={sim.irradiance.shadingFactor}
      incidenceDeg={sim.angles.incidenceDeg}
      sun={sim.angles.sunVector}
      normal={sim.angles.panelNormal}
      isDay={sim.angles.isDay}
      tiltDeg={state.panelTiltDeg}
      azDeg={state.panelAzimuthDeg}
      obstacleEnabled={state.obstacleEnabled}
      obstaclePos={state.obstaclePos}
      obstacleSize={state.obstacleSize}
      showNormal={state.showPanelNormal}
      showRay={state.showSunRay}
      irradianceColor={irrColor}
    />
  );
}
