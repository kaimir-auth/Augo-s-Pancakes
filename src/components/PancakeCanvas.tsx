import React, { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { sound } from '../utils/sound';

interface PancakeCanvasProps {
  stack: number[];
  hoveredIndex: number | null;
  onHoverIndex: (index: number | null) => void;
  onFlip: (k: number) => void;
  isAnimating: boolean;
  isWon: boolean;
  hintK: number | null;
  cameraPreset: string;
}

export const PancakeCanvas: React.FC<PancakeCanvasProps> = ({
  stack,
  hoveredIndex,
  onHoverIndex,
  onFlip,
  isAnimating,
  isWon,
  hintK,
  cameraPreset,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const pancakeMeshesRef = useRef<THREE.Mesh[]>([]);
  const spatulaGroupRef = useRef<THREE.Group | null>(null);
  const butterMeshRef = useRef<THREE.Mesh | null>(null);
  const animStateRef = useRef<{
    active: boolean;
    startTime: number;
    k: number;
    pivot: THREE.Group | null;
    originalPositions: { mesh: THREE.Mesh; y: number }[];
  }>({
    active: false,
    startTime: 0,
    k: 0,
    pivot: null,
    originalPositions: [],
  });

  // Track latest props in refs for animation loop
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const isAnimatingRef = useRef(isAnimating);
  isAnimatingRef.current = isAnimating;
  const isWonRef = useRef(isWon);
  isWonRef.current = isWon;
  const hoveredIndexRef = useRef(hoveredIndex);
  hoveredIndexRef.current = hoveredIndex;
  const hintKRef = useRef(hintK);
  hintKRef.current = hintK;

  // Camera Orbit state
  const orbitRef = useRef({
    isDragging: false,
    prevX: 0,
    prevY: 0,
    theta: 0.15, // horizontal angle
    phi: 0.95,   // vertical angle
    radius: 17.5,
    targetY: 2.8,
  });

  // Particle system for steam / crumbs on landing
  const particlesRef = useRef<{
    mesh: THREE.Points;
    velocities: THREE.Vector3[];
    lifespans: number[];
    maxLifespans: number[];
  } | null>(null);

  // Stack geometry measurements
  const PANCAKE_HEIGHT = 0.52;
  const BASE_Y = 0.42;

  // Calculate Y height for a pancake at stack index (0 = top pancake)
  const getYForIndex = useCallback((index: number, total: number) => {
    return BASE_Y + (total - 1 - index) * PANCAKE_HEIGHT;
  }, [PANCAKE_HEIGHT, BASE_Y]);

  // Texture generator for pancake top with printed diner numeral
  const createPancakeTextures = useCallback((val: number, radius: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // Golden baked background with cooked butter griddle gradient
    const grad = ctx.createRadialGradient(256, 256, 40, 256, 256, 250);
    grad.addColorStop(0, '#f2bf6e');
    grad.addColorStop(0.55, '#e09e46');
    grad.addColorStop(0.88, '#be6d23');
    grad.addColorStop(1.0, '#783b0f');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(256, 256, 252, 0, Math.PI * 2);
    ctx.fill();

    // Subtle cooked bubbles / griddle speckles
    ctx.fillStyle = 'rgba(120, 50, 10, 0.12)';
    for (let i = 0; i < 45; i++) {
      const angle = (i * 137.5 * Math.PI) / 180;
      const dist = 35 + (i * 4.2) % 200;
      const sx = 256 + Math.cos(angle) * dist;
      const sy = 256 + Math.sin(angle) * dist;
      ctx.beginPath();
      ctx.arc(sx, sy, 2 + (i % 4), 0, Math.PI * 2);
      ctx.fill();
    }

    // Concentric golden syrup ring
    ctx.strokeStyle = 'rgba(100, 40, 10, 0.22)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(256, 256, 230, 0, Math.PI * 2);
    ctx.stroke();

    // Inner embossed badge with number
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.shadowColor = 'rgba(80, 30, 0, 0.45)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;

    ctx.font = 'bold 150px "Fraunces", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${val}`, 256, 260);

    // Number border / ring
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(256, 256, 120, 0, Math.PI * 2);
    ctx.stroke();

    const topTexture = new THREE.CanvasTexture(canvas);
    topTexture.colorSpace = THREE.SRGBColorSpace;

    // Sponge edge texture
    const edgeCanvas = document.createElement('canvas');
    edgeCanvas.width = 256;
    edgeCanvas.height = 64;
    const edgeCtx = edgeCanvas.getContext('2d')!;
    const edgeGrad = edgeCtx.createLinearGradient(0, 0, 0, 64);
    edgeGrad.addColorStop(0, '#c97828');
    edgeGrad.addColorStop(0.5, '#e59e48');
    edgeGrad.addColorStop(1, '#a85a1a');
    edgeCtx.fillStyle = edgeGrad;
    edgeCtx.fillRect(0, 0, 256, 64);

    const edgeTexture = new THREE.CanvasTexture(edgeCanvas);
    edgeTexture.colorSpace = THREE.SRGBColorSpace;

    return { topTexture, edgeTexture };
  }, []);

  // Spawn landing steam puff particles
  const triggerLandingParticles = useCallback((yPos: number, radius: number) => {
    if (!particlesRef.current || !sceneRef.current) return;
    const { mesh, velocities, lifespans, maxLifespans } = particlesRef.current;
    const posAttr = mesh.geometry.attributes.position as THREE.BufferAttribute;

    const count = 35;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.2;
      const speed = 0.08 + Math.random() * 0.12;
      const px = Math.cos(angle) * (radius * 0.9);
      const pz = Math.sin(angle) * (radius * 0.9);

      posAttr.setXYZ(i, px, yPos + 0.1, pz);
      velocities[i].set(Math.cos(angle) * speed, 0.04 + Math.random() * 0.08, Math.sin(angle) * speed);
      lifespans[i] = 1.0;
      maxLifespans[i] = 1.0;
    }
    posAttr.needsUpdate = true;
    mesh.visible = true;
  }, []);

  // Update camera position based on spherical coordinates
  const updateCameraFromOrbit = useCallback(() => {
    if (!cameraRef.current) return;
    const { theta, phi, radius, targetY } = orbitRef.current;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);

    cameraRef.current.position.set(
      radius * sinPhi * sinTheta,
      targetY + radius * cosPhi,
      radius * sinPhi * cosTheta
    );
    cameraRef.current.lookAt(0, targetY, 0);
  }, []);

  // Apply camera presets
  useEffect(() => {
    if (cameraPreset === 'default') {
      orbitRef.current.theta = 0.2;
      orbitRef.current.phi = 0.95;
      orbitRef.current.radius = 17.5;
      orbitRef.current.targetY = 2.8;
    } else if (cameraPreset === 'top') {
      orbitRef.current.theta = 0;
      orbitRef.current.phi = 0.12; // Almost straight down
      orbitRef.current.radius = 16.0;
      orbitRef.current.targetY = 2.0;
    } else if (cameraPreset === 'side') {
      orbitRef.current.theta = 0.4;
      orbitRef.current.phi = 1.45; // Low table level
      orbitRef.current.radius = 16.5;
      orbitRef.current.targetY = 2.5;
    } else if (cameraPreset === 'diner') {
      orbitRef.current.theta = -0.55;
      orbitRef.current.phi = 1.05;
      orbitRef.current.radius = 15.0;
      orbitRef.current.targetY = 2.8;
    }
    updateCameraFromOrbit();
  }, [cameraPreset, updateCameraFromOrbit]);

  // Main 3D Scene Initialization
  useEffect(() => {
    if (!containerRef.current) return;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x191310);
    scene.fog = new THREE.FogExp2(0x191310, 0.022);

    // Camera
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    cameraRef.current = camera;
    updateCameraFromOrbit();

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    rendererRef.current = renderer;

    containerRef.current.appendChild(renderer.domElement);

    // Warm Ambient Lighting
    const ambientLight = new THREE.AmbientLight(0xffeedd, 1.1);
    scene.add(ambientLight);

    // Key Directional Light (Warm Morning Breakfast Light)
    const dirLight = new THREE.DirectionalLight(0xfff3db, 2.2);
    dirLight.position.set(8, 16, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 40;
    dirLight.shadow.camera.left = -10;
    dirLight.shadow.camera.right = 10;
    dirLight.shadow.camera.top = 10;
    dirLight.shadow.camera.bottom = -10;
    dirLight.shadow.bias = -0.0004;
    scene.add(dirLight);

    // Secondary Soft Rim Light (Cool Blue-Lavender bounce for depth)
    const rimLight = new THREE.DirectionalLight(0xa5c4e8, 0.65);
    rimLight.position.set(-12, 10, -10);
    scene.add(rimLight);

    // Warm Honey Point Light centered above plate
    const honeyLight = new THREE.PointLight(0xffbb66, 1.2, 18);
    honeyLight.position.set(0, 7, 2);
    scene.add(honeyLight);

    // Diner Table Top (Rich Warm Walnut Wood Surface)
    const tableGeo = new THREE.CylinderGeometry(18, 18, 0.5, 64);
    const tableMat = new THREE.MeshStandardMaterial({
      color: 0x2e1e16,
      roughness: 0.65,
      metalness: 0.05,
    });
    const tableMesh = new THREE.Mesh(tableGeo, tableMat);
    tableMesh.position.y = -0.25;
    tableMesh.receiveShadow = true;
    scene.add(tableMesh);

    // Warm Ceramic Diner Plate
    const plateGroup = new THREE.Group();
    // Inner Plate Well
    const plateBaseGeo = new THREE.CylinderGeometry(6.6, 6.2, 0.22, 64);
    const plateMat = new THREE.MeshStandardMaterial({
      color: 0xf5f3ee,
      roughness: 0.25,
      metalness: 0.08,
    });
    const plateBase = new THREE.Mesh(plateBaseGeo, plateMat);
    plateBase.position.y = 0.11;
    plateBase.receiveShadow = true;
    plateGroup.add(plateBase);

    // Raised Plate Rim with subtle blue diner ring
    const plateRimGeo = new THREE.TorusGeometry(6.6, 0.45, 16, 64);
    plateRimGeo.rotateX(Math.PI / 2);
    const plateRim = new THREE.Mesh(plateRimGeo, plateMat);
    plateRim.position.y = 0.25;
    plateRim.receiveShadow = true;
    plateGroup.add(plateRim);

    // Delicate blue diner trim ring
    const blueRingGeo = new THREE.TorusGeometry(6.3, 0.04, 8, 64);
    blueRingGeo.rotateX(Math.PI / 2);
    const blueRingMat = new THREE.MeshStandardMaterial({ color: 0x3b6691, roughness: 0.3 });
    const blueRing = new THREE.Mesh(blueRingGeo, blueRingMat);
    blueRing.position.y = 0.26;
    plateGroup.add(blueRing);

    scene.add(plateGroup);

    // 3D Metal Spatula Model
    const spatula = new THREE.Group();
    // Spatula Turner Blade
    const bladeGeo = new THREE.BoxGeometry(4.2, 0.06, 3.2);
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0xced4da,
      metalness: 0.85,
      roughness: 0.25,
    });
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.castShadow = true;
    spatula.add(blade);

    // Spatula Blade Slots (perforations)
    const slotMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.9, roughness: 0.3 });
    for (let s = -1; s <= 1; s++) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 1.8), slotMat);
      slot.position.set(s * 0.9, 0, 0);
      spatula.add(slot);
    }

    // Spatula Angled Neck
    const neckGeo = new THREE.CylinderGeometry(0.12, 0.12, 2.8, 16);
    neckGeo.rotateZ(Math.PI / 4.5);
    const neck = new THREE.Mesh(neckGeo, bladeMat);
    neck.position.set(-3.2, 0.7, 0);
    neck.castShadow = true;
    spatula.add(neck);

    // Spatula Wooden Handle
    const handleGeo = new THREE.CylinderGeometry(0.25, 0.28, 4.2, 16);
    handleGeo.rotateZ(Math.PI / 2);
    const handleMat = new THREE.MeshStandardMaterial({
      color: 0x692415,
      roughness: 0.45,
      metalness: 0.1,
    });
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.position.set(-6.2, 1.5, 0);
    handle.castShadow = true;
    spatula.add(handle);

    spatula.visible = false;
    scene.add(spatula);
    spatulaGroupRef.current = spatula;

    // Steam / Crumb Landing Particles
    const particleCount = 40;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities: THREE.Vector3[] = [];
    const lifespans: number[] = [];
    const maxLifespans: number[] = [];

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = -100;
      positions[i * 3 + 2] = 0;
      velocities.push(new THREE.Vector3());
      lifespans.push(0);
      maxLifespans.push(1);
    }

    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0xfff4d0,
      size: 0.25,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
    });
    const particleMesh = new THREE.Points(particleGeo, particleMat);
    particleMesh.visible = false;
    scene.add(particleMesh);
    particlesRef.current = { mesh: particleMesh, velocities, lifespans, maxLifespans };

    // Melting Butter Pat on Top
    const butterGeo = new THREE.BoxGeometry(0.9, 0.45, 0.9);
    const butterMat = new THREE.MeshStandardMaterial({
      color: 0xffe86b,
      roughness: 0.25,
      metalness: 0.05,
    });
    const butter = new THREE.Mesh(butterGeo, butterMat);
    butter.castShadow = true;
    butter.rotation.y = 0.35;
    scene.add(butter);
    butterMeshRef.current = butter;

    // Animation Loop
    let animationFrameId: number;
    let clock = new THREE.Clock();

    const renderLoop = () => {
      animationFrameId = requestAnimationFrame(renderLoop);
      const delta = clock.getDelta();
      const time = clock.getElapsedTime();

      // Update Steam Particles
      if (particlesRef.current && particlesRef.current.mesh.visible) {
        const { mesh, velocities, lifespans } = particlesRef.current;
        const posAttr = mesh.geometry.attributes.position as THREE.BufferAttribute;
        let anyAlive = false;

        for (let i = 0; i < particleCount; i++) {
          if (lifespans[i] > 0) {
            lifespans[i] -= delta * 1.8;
            if (lifespans[i] <= 0) {
              posAttr.setY(i, -100);
            } else {
              anyAlive = true;
              const vx = velocities[i].x;
              const vy = velocities[i].y;
              const vz = velocities[i].z;
              posAttr.setXYZ(
                i,
                posAttr.getX(i) + vx * delta * 60,
                posAttr.getY(i) + vy * delta * 60,
                posAttr.getZ(i) + vz * delta * 60
              );
              velocities[i].y -= 0.002; // gentle gravity
            }
          }
        }
        posAttr.needsUpdate = true;
        if (!anyAlive) {
          mesh.visible = false;
        }
      }

      // Handle Flip Animation in Progress
      if (animStateRef.current.active && animStateRef.current.pivot) {
        const elapsed = time - animStateRef.current.startTime;
        const totalDuration = 0.95; // snappy, satisfying flip speed
        const pivot = animStateRef.current.pivot;
        const k = animStateRef.current.k;

        // Stage 1: Spatula slides in from left (0 to 0.18s)
        // Stage 2: Lift up + tilt (0.18 to 0.45s)
        // Stage 3: Rotate 180 deg around Z/X (0.4 to 0.75s)
        // Stage 4: Slam down onto stack with landing sound + particle burst (0.75 to 0.95s)
        if (elapsed < 0.18) {
          const tSlide = elapsed / 0.18;
          if (spatulaGroupRef.current) {
            spatulaGroupRef.current.visible = true;
            // slide from x = -7 to x = 0
            const currentX = -7 * (1 - tSlide);
            spatulaGroupRef.current.position.x = currentX;
          }
        } else if (elapsed < totalDuration) {
          const flipPhase = (elapsed - 0.18) / (totalDuration - 0.18);

          // Arc Y trajectory: peak at t = 0.5
          const arcY = Math.sin(flipPhase * Math.PI) * 3.4;
          pivot.position.y = (pivot.userData.initialY || 2.0) + arcY;

          // Rotation: 0 to 180 degrees (PI radians) with smooth easeInOut
          const rotProgress = Math.min(Math.max((flipPhase - 0.15) / 0.7, 0), 1);
          // Cubic ease-in-out
          const easeRot = rotProgress < 0.5
            ? 4 * rotProgress * rotProgress * rotProgress
            : 1 - Math.pow(-2 * rotProgress + 2, 3) / 2;
          
          pivot.rotation.z = easeRot * Math.PI;

          // Butter moves with top pancake during flip
          if (butterMeshRef.current) {
            butterMeshRef.current.visible = false;
          }
        } else {
          // Animation finished!
          animStateRef.current.active = false;
          if (spatulaGroupRef.current) {
            spatulaGroupRef.current.visible = false;
          }
          if (butterMeshRef.current) {
            butterMeshRef.current.visible = true;
          }

          // Trigger landing impact sound and particle puff
          sound.playPancakeLanding(k);
          triggerLandingParticles(1.2, 2.5);

          // Clean up pivot group and notify parent component
          if (animStateRef.current.pivot) {
            const meshesToReattach = [...animStateRef.current.pivot.children];
            meshesToReattach.forEach((m) => {
              if (m !== spatulaGroupRef.current) {
                scene.attach(m);
              }
            });
            scene.remove(animStateRef.current.pivot);
            animStateRef.current.pivot = null;
          }

          // Trigger state update
          onFlip(k);
        }
      }

      // Gentle celebratory bounce if puzzle is won
      if (isWonRef.current && !animStateRef.current.active) {
        const bounce = Math.sin(time * 4) * 0.08;
        if (butterMeshRef.current) {
          butterMeshRef.current.position.y = (butterMeshRef.current.userData.baseY || 4.2) + bounce;
          butterMeshRef.current.rotation.y = time * 0.8;
        }
      }

      // Spatula hover preview positioning (when idle)
      if (!animStateRef.current.active && spatulaGroupRef.current) {
        const hoverIdx = hoveredIndexRef.current;
        if (hoverIdx !== null && hoverIdx >= 0 && pancakeMeshesRef.current[hoverIdx]) {
          const targetMesh = pancakeMeshesRef.current[hoverIdx];
          const targetY = targetMesh.position.y - 0.22;
          spatulaGroupRef.current.visible = true;
          spatulaGroupRef.current.position.set(-3.2 + Math.sin(time * 5) * 0.15, targetY, 0);
          spatulaGroupRef.current.rotation.set(0, 0, 0);
        } else {
          spatulaGroupRef.current.visible = false;
        }
      }

      // Render scene
      renderer.render(scene, camera);
    };

    renderLoop();

    // Resize Handler
    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const newW = containerRef.current.clientWidth;
      const newH = containerRef.current.clientHeight;
      cameraRef.current.aspect = newW / newH;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(newW, newH);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      renderer.dispose();
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [getYForIndex, onFlip, triggerLandingParticles, updateCameraFromOrbit]);

  // Rebuild / Update 3D Pancake Stack when stack values change
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Clear existing pancake meshes
    pancakeMeshesRef.current.forEach((m) => {
      scene.remove(m);
      if (m.geometry) m.geometry.dispose();
    });
    pancakeMeshesRef.current = [];

    const total = stack.length;

    stack.forEach((val, index) => {
      // Pancake geometry: radius proportional to val (e.g. 1.25 + val * 0.32)
      const radius = 1.25 + val * 0.34;
      const height = PANCAKE_HEIGHT;
      const geo = new THREE.CylinderGeometry(radius, radius * 1.02, height, 48, 1);

      const { topTexture, edgeTexture } = createPancakeTextures(val, radius);

      // Multi-material: [side, top, bottom]
      const sideMat = new THREE.MeshStandardMaterial({
        map: edgeTexture,
        roughness: 0.65,
        metalness: 0.05,
      });
      const topMat = new THREE.MeshStandardMaterial({
        map: topTexture,
        roughness: 0.55,
        metalness: 0.08,
      });
      const bottomMat = new THREE.MeshStandardMaterial({
        color: 0x944917,
        roughness: 0.7,
      });

      const mesh = new THREE.Mesh(geo, [sideMat, topMat, bottomMat]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      const y = getYForIndex(index, total);
      mesh.position.set(0, y, 0);
      mesh.userData = { index, val, radius, baseY: y };

      scene.add(mesh);
      pancakeMeshesRef.current.push(mesh);
    });

    // Position Butter on top pancake
    if (butterMeshRef.current && total > 0) {
      const topY = getYForIndex(0, total) + PANCAKE_HEIGHT * 0.5 + 0.22;
      butterMeshRef.current.position.set(0, topY, 0);
      butterMeshRef.current.userData = { baseY: topY };
      butterMeshRef.current.visible = true;
    }
  }, [stack, getYForIndex, createPancakeTextures, PANCAKE_HEIGHT]);

  // Update Materials / Highlighting based on hover, hint, or win state
  useEffect(() => {
    pancakeMeshesRef.current.forEach((mesh, i) => {
      const materials = mesh.material as THREE.MeshStandardMaterial[];
      const topMat = materials[1];
      const sideMat = materials[0];

      if (!topMat || !sideMat) return;

      const isSliceHovered = hoveredIndex !== null && i <= hoveredIndex;
      const isHintTarget = hintK !== null && i === hintK - 1;

      if (isWon) {
        // Glorious victory honey glow
        topMat.emissive.setHex(0x15803d);
        topMat.emissiveIntensity = 0.35;
        sideMat.emissive.setHex(0x166534);
        sideMat.emissiveIntensity = 0.25;
      } else if (isSliceHovered) {
        // Active spatula slice glowing amber/red-orange
        topMat.emissive.setHex(0xe11d48);
        topMat.emissiveIntensity = 0.5;
        sideMat.emissive.setHex(0xc026d3);
        sideMat.emissiveIntensity = 0.4;
      } else if (isHintTarget) {
        // Solver hint pulsing golden cyan
        topMat.emissive.setHex(0x0284c7);
        topMat.emissiveIntensity = 0.6;
        sideMat.emissive.setHex(0x0369a1);
        sideMat.emissiveIntensity = 0.45;
      } else {
        // Natural resting state
        topMat.emissive.setHex(0x000000);
        topMat.emissiveIntensity = 0;
        sideMat.emissive.setHex(0x000000);
        sideMat.emissiveIntensity = 0;
      }
    });
  }, [hoveredIndex, isWon, hintK]);

  // Perform Animated 3D Flip
  const initiateAnimatedFlip = useCallback((k: number) => {
    if (isAnimatingRef.current || animStateRef.current.active) return;
    if (k < 2 || k > stackRef.current.length) return;

    const scene = sceneRef.current;
    if (!scene) return;

    // Sound effect
    sound.playSpatulaSlide();
    setTimeout(() => {
      sound.playFlipWhoosh();
    }, 280);

    // Group top k pancakes into pivot
    const flippingMeshes = pancakeMeshesRef.current.slice(0, k);
    if (flippingMeshes.length === 0) return;

    const minY = flippingMeshes[flippingMeshes.length - 1].position.y;
    const maxY = flippingMeshes[0].position.y;
    const centerY = (minY + maxY) / 2;

    const pivot = new THREE.Group();
    pivot.position.set(0, centerY, 0);
    pivot.userData = { initialY: centerY };
    scene.add(pivot);

    // Attach flipping pancakes to pivot
    flippingMeshes.forEach((mesh) => {
      pivot.attach(mesh);
    });

    // Attach spatula to pivot
    if (spatulaGroupRef.current) {
      spatulaGroupRef.current.position.set(0, -0.25, 0);
      spatulaGroupRef.current.visible = true;
      pivot.attach(spatulaGroupRef.current);
    }

    animStateRef.current = {
      active: true,
      startTime: performance.now() / 1000,
      k,
      pivot,
      originalPositions: [],
    };
  }, []);

  // Pointer Interaction (Raycasting, Drag Orbit, Clicks)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    orbitRef.current.isDragging = true;
    orbitRef.current.prevX = e.clientX;
    orbitRef.current.prevY = e.clientY;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current || !cameraRef.current) return;

    if (orbitRef.current.isDragging) {
      const deltaX = e.clientX - orbitRef.current.prevX;
      const deltaY = e.clientY - orbitRef.current.prevY;
      orbitRef.current.prevX = e.clientX;
      orbitRef.current.prevY = e.clientY;

      orbitRef.current.theta -= deltaX * 0.008;
      // Clamp vertical phi to prevent flipping upside down
      orbitRef.current.phi = Math.max(0.08, Math.min(Math.PI / 2.05, orbitRef.current.phi - deltaY * 0.008));
      updateCameraFromOrbit();
      return;
    }

    // Raycast when not dragging
    if (isAnimatingRef.current || animStateRef.current.active) {
      onHoverIndex(null);
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), cameraRef.current);

    const intersects = raycaster.intersectObjects(pancakeMeshesRef.current);
    if (intersects.length > 0) {
      const hit = intersects[0].object as THREE.Mesh;
      const hitIdx = hit.userData.index;
      if (typeof hitIdx === 'number') {
        if (hoveredIndexRef.current !== hitIdx) {
          sound.playHoverTick();
        }
        onHoverIndex(hitIdx);
        return;
      }
    }
    onHoverIndex(null);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    orbitRef.current.isDragging = false;
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isAnimatingRef.current || animStateRef.current.active || isWonRef.current) return;
    if (hoveredIndex !== null) {
      const k = hoveredIndex + 1; // flip top k pancakes
      if (k >= 2) {
        initiateAnimatedFlip(k);
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    orbitRef.current.radius = Math.max(9.5, Math.min(26.0, orbitRef.current.radius + e.deltaY * 0.015));
    updateCameraFromOrbit();
  };

  // Expose flip initiation programmatically (for sidebar, hotkeys, solver autoplay)
  useEffect(() => {
    (window as unknown as { triggerPancakeFlip?: (k: number) => void }).triggerPancakeFlip = (k: number) => {
      initiateAnimatedFlip(k);
    };
    return () => {
      delete (window as unknown as { triggerPancakeFlip?: (k: number) => void }).triggerPancakeFlip;
    };
  }, [initiateAnimatedFlip]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full cursor-grab active:cursor-grabbing overflow-hidden touch-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => {
        orbitRef.current.isDragging = false;
        onHoverIndex(null);
      }}
      onClick={handleClick}
      onWheel={handleWheel}
    />
  );
};
