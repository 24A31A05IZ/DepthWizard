// DepthWizard — Three.js 3D Terrain Viewer
// Interactive WebGL terrain with orbit controls, fly-through, and elevation inspection.

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import styles from '../pages/StepPage.module.css';

interface TerrainViewerProps {
  heightmapGrid: number[][];  // 2D array of elevation 0-1
  gridW: number;
  gridH: number;
  textureB64?: string;        // Original image as texture (JPEG base64)
  isMetric?: boolean;
  scaleLabel?: string;        // e.g. "m" or "rel."
}

const TERRAIN_SIZE = 10;      // World units
const HEIGHT_SCALE = 3.0;     // Vertical exaggeration for visual clarity

export default function TerrainViewer({
  heightmapGrid,
  gridW,
  gridH,
  textureB64,
  scaleLabel = 'rel.',
}: TerrainViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const frameRef = useRef<number>(0);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());

  const [tooltip, setTooltip] = useState<{ x: number; y: number; elev: string } | null>(null);
  const [wireframe, setWireframe] = useState(false);
  const [showTexture, setShowTexture] = useState(true);
  const [flyMode, setFlyMode] = useState(false);

  // Build THREE.js scene
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030712);
    scene.fog = new THREE.FogExp2(0x0a1628, 0.08);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(60, mount.clientWidth / mount.clientHeight, 0.01, 100);
    camera.position.set(0, 6, 12);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 1;
    controls.maxDistance = 30;
    controls.maxPolarAngle = Math.PI / 2 + 0.1;
    controlsRef.current = controls;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x203050, 0.8);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffeedd, 2.0);
    sunLight.position.set(5, 10, 5);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight(0x2060a0, 0.6);
    fillLight.position.set(-5, 3, -5);
    scene.add(fillLight);

    // Grid helper
    const gridHelper = new THREE.GridHelper(TERRAIN_SIZE * 2, 20, 0x1a3a6a, 0x0d2040);
    gridHelper.position.y = -0.02;
    scene.add(gridHelper);

    // Axis labels (simple lines)
    const axisGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-TERRAIN_SIZE / 2, 0, 0),
      new THREE.Vector3(TERRAIN_SIZE / 2, 0, 0),
    ]);
    scene.add(new THREE.Line(axisGeo, new THREE.LineBasicMaterial({ color: 0xff4444, opacity: 0.4, transparent: true })));

    // Build terrain mesh
    buildTerrain(scene, heightmapGrid, gridW, gridH, textureB64);

    // Stars
    addStars(scene);

    // Animate
    function animate() {
      frameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    // Resize handler
    function onResize() {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(frameRef.current);
      controls.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heightmapGrid, gridW, gridH, textureB64]);

  function buildTerrain(
    scene: THREE.Scene,
    grid: number[][],
    w: number,
    h: number,
    texB64: string | undefined,
  ) {
    // Remove old mesh
    if (meshRef.current) {
      scene.remove(meshRef.current);
      meshRef.current.geometry.dispose();
    }

    const geometry = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, w - 1, h - 1);
    geometry.rotateX(-Math.PI / 2);

    const posArr = geometry.attributes.position.array as Float32Array;

    // Apply height to each vertex
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        const vIdx = (row * w + col) * 3;
        const elev = grid[row]?.[col] ?? 0;
        posArr[vIdx + 1] = elev * HEIGHT_SCALE;
      }
    }

    geometry.computeVertexNormals();
    geometry.attributes.position.needsUpdate = true;

    // Material
    let material: THREE.MeshStandardMaterial;

    if (texB64) {
      const texture = new THREE.TextureLoader().load(`data:image/jpeg;base64,${texB64}`);
      texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
      material = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.85,
        metalness: 0.05,
      });
    } else {
      // Vertex color by elevation
      const colors: number[] = [];
      for (let row = 0; row < h; row++) {
        for (let col = 0; col < w; col++) {
          const elev = grid[row]?.[col] ?? 0;
          const color = elevationToColor(elev);
          colors.push(color.r, color.g, color.b);
        }
      }
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.85,
        metalness: 0.05,
      });
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    scene.add(mesh);
    meshRef.current = mesh;
  }

  function elevationToColor(t: number): THREE.Color {
    // Viridis-like: purple → blue → cyan → green → yellow
    const r = Math.max(0, Math.min(1, 0.27 + t * 0.6 - Math.sin(t * Math.PI) * 0.15));
    const g = Math.max(0, Math.min(1, 0.1 + t * 0.85));
    const b = Math.max(0, Math.min(1, 0.7 - t * 0.5));
    return new THREE.Color(r, g, b);
  }

  function addStars(scene: THREE.Scene) {
    const starsGeo = new THREE.BufferGeometry();
    const positions: number[] = [];
    for (let i = 0; i < 2000; i++) {
      positions.push(
        (Math.random() - 0.5) * 200,
        Math.random() * 80 + 20,
        (Math.random() - 0.5) * 200,
      );
    }
    starsGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const starsMat = new THREE.PointsMaterial({ color: 0xaaccff, size: 0.08, transparent: true, opacity: 0.6 });
    scene.add(new THREE.Points(starsGeo, starsMat));
  }

  // Wireframe toggle
  useEffect(() => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    mat.wireframe = wireframe;
  }, [wireframe]);

  // Texture toggle
  useEffect(() => {
    if (!meshRef.current || !sceneRef.current) return;
    buildTerrain(
      sceneRef.current,
      heightmapGrid,
      gridW,
      gridH,
      showTexture ? textureB64 : undefined,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTexture]);

  // Fly mode: auto-orbit animation
  useEffect(() => {
    if (!controlsRef.current) return;
    controlsRef.current.autoRotate = flyMode;
    controlsRef.current.autoRotateSpeed = 0.8;
  }, [flyMode]);

  // Click-to-inspect elevation
  const onCanvasClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!mountRef.current || !cameraRef.current || !meshRef.current) return;
    const rect = mountRef.current.getBoundingClientRect();
    mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
    const hits = raycasterRef.current.intersectObject(meshRef.current);
    if (hits.length > 0) {
      const pt = hits[0].point;
      // Map world Y back to elevation
      const elev = pt.y / HEIGHT_SCALE;
      setTooltip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        elev: `${elev.toFixed(3)} ${scaleLabel}`,
      });
      setTimeout(() => setTooltip(null), 3000);
    }
  }, [scaleLabel]);

  return (
    <div style={{ position: 'relative' }}>
      {/* Controls overlay */}
      <div className={styles.viewerOverlay}>
        <button className={`${styles.controlBtn} ${wireframe ? styles.active : ''}`} onClick={() => setWireframe(w => !w)}>
          🔲 Wireframe
        </button>
        {textureB64 && (
          <button className={`${styles.controlBtn} ${showTexture ? styles.active : ''}`} onClick={() => setShowTexture(t => !t)}>
            🖼 Texture
          </button>
        )}
        <button className={`${styles.controlBtn} ${flyMode ? styles.active : ''}`} onClick={() => setFlyMode(f => !f)}>
          ✈ Auto-Orbit
        </button>
        <button className={styles.controlBtn} onClick={() => {
          if (cameraRef.current && controlsRef.current) {
            cameraRef.current.position.set(0, 6, 12);
            controlsRef.current.target.set(0, 0, 0);
            controlsRef.current.update();
          }
        }}>⌂ Reset View</button>
      </div>

      {/* Canvas mount */}
      <div
        ref={mountRef}
        className={styles.viewerCanvas}
        style={{ height: 520, cursor: 'crosshair' }}
        onClick={onCanvasClick}
      />

      {/* Elevation tooltip */}
      {tooltip && (
        <div
          className={styles.elevTooltip}
          style={{ left: tooltip.x + 12, top: tooltip.y - 12, position: 'absolute' }}
        >
          ↕ Elevation: {tooltip.elev}
        </div>
      )}

      {/* Hint */}
      <div className={styles.viewerHint}>
        🖱 Drag to orbit · Scroll to zoom · Right-drag to pan · Click terrain to inspect elevation
      </div>
    </div>
  );
}
