import type * as Three from "three";
import type { Theme } from "../lib/types";

export interface ThreeSceneApi {
  setTheme(theme: Theme, isReduced: boolean): void;
  setReduced(isReduced: boolean): void;
  dispose(): void;
}

interface Actor {
  group: Three.Group;
  kind: string;
  baseX: number;
  baseY: number;
  phase: number;
  drift: number;
  eyes: Three.Mesh[];
  head?: Three.Group;
  tail?: Three.Object3D;
  spin?: number;
  baseScale: number;
}

interface Options {
  maxPixelRatio: number;
  reduced: boolean;
}

function mix(a: string, b: string, t: number, THREE: typeof import("three")): string {
  return new THREE.Color(a).lerp(new THREE.Color(b), t).getStyle();
}

export async function createThreeScene(
  canvas: HTMLCanvasElement,
  options: Options
): Promise<ThreeSceneApi> {
  const THREE = await import("three");

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, options.maxPixelRatio));
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0.9, 7.4);
  camera.lookAt(0, 0.15, 0);

  const hemi = new THREE.HemisphereLight(0xfff6f4, 0xffe9df, 1.25);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff4e2, 1.35);
  key.position.set(3.2, 5.4, 4.5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xf7e3ff, 0.55);
  fill.position.set(-4, 2.5, -3);
  scene.add(fill);
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));

  const actorsRoot = new THREE.Group();
  scene.add(actorsRoot);

  let actors: Actor[] = [];
  let reduced = options.reduced;
  let raf = 0;
  let disposed = false;
  let currentTheme: Theme | null = null;
  let particleGeometry: Three.BufferGeometry | null = null;
  let particleVelocities: Float32Array | null = null;
  let particlePoints: Three.Points | null = null;
  let nextBlink = 2.4;
  let blinkUntil = 0;
  let pointerX = 0;
  let pointerY = 0;
  let cameraX = 0;
  let cameraY = 0.9;

  const clock = new THREE.Clock();

  function material(hex: string, opacity = 1): Three.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(hex),
      roughness: 0.88,
      metalness: 0,
      flatShading: true,
      transparent: true,
      opacity,
    });
  }

  function sphere(radius: number, mat: Three.Material, segments = 18): Three.Mesh {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, segments, Math.max(8, segments - 4)), mat);
    return mesh;
  }

  function disposeGroup(group: Three.Object3D): void {
    group.traverse((child) => {
      const maybe = child as Three.Mesh;
      if (maybe.geometry) maybe.geometry.dispose();
      const materialValue = (maybe as Three.Mesh).material;
      if (materialValue) {
        const list = Array.isArray(materialValue) ? materialValue : [materialValue];
        list.forEach((entry) => entry.dispose());
      }
    });
  }

  function buildCat(theme: Theme): Actor {
    const c = theme.colors;
    const fur = mix(c.primary, "#ffffff", 0.42, THREE);
    const furDeep = mix(c.primary, c.ink, 0.16, THREE);
    const cream = mix(c.secondary, "#ffffff", 0.5, THREE);
    const eyeColor = mix(c.ink, "#1d1418", 0.55, THREE);

    const group = new THREE.Group();
    const bodyMat = material(fur);
    const deepMat = material(furDeep);
    const creamMat = material(cream);
    const eyeMat = material(eyeColor);

    const body = sphere(0.58, bodyMat, 16);
    body.scale.set(1, 0.8, 0.74);
    group.add(body);

    const belly = sphere(0.3, creamMat, 14);
    belly.scale.set(1, 0.9, 0.42);
    belly.position.set(0, -0.06, 0.34);
    group.add(belly);

    const head = new THREE.Group();
    head.position.set(0, 0.62, 0.05);
    group.add(head);

    const skull = sphere(0.42, bodyMat, 18);
    skull.scale.set(1.04, 0.96, 0.92);
    head.add(skull);

    const earLeft = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.32, 4), deepMat);
    earLeft.position.set(-0.24, 0.34, -0.02);
    earLeft.rotation.z = 0.18;
    earLeft.rotation.y = 0.4;
    head.add(earLeft);
    const earRight = earLeft.clone();
    earRight.position.x = 0.24;
    earRight.rotation.z = -0.18;
    earRight.rotation.y = -0.4;
    head.add(earRight);

    const eyes: Three.Mesh[] = [];
    for (const x of [-0.15, 0.15]) {
      const eye = sphere(0.055, eyeMat, 12);
      eye.position.set(x, 0.06, 0.37);
      eye.scale.set(1, 1.15, 0.7);
      eyes.push(eye);
      head.add(eye);
    }

    const muzzle = sphere(0.13, creamMat, 12);
    muzzle.scale.set(1.25, 0.62, 0.7);
    muzzle.position.set(0, -0.08, 0.36);
    head.add(muzzle);

    const nose = sphere(0.035, material(mix(c.primary, c.ink, 0.4, THREE)), 10);
    nose.position.set(0, -0.04, 0.47);
    head.add(nose);

    const tailGroup = new THREE.Group();
    tailGroup.position.set(0.5, -0.16, -0.18);
    group.add(tailGroup);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.22, 0.16, 0.04),
      new THREE.Vector3(0.36, 0.42, 0.1),
      new THREE.Vector3(0.26, 0.62, 0.14),
    ]);
    const tail = new THREE.Mesh(new THREE.TubeGeometry(curve, 18, 0.075, 8, false), bodyMat);
    tailGroup.add(tail);

    for (const x of [-0.26, 0.26]) {
      const paw = sphere(0.13, creamMat, 10);
      paw.scale.set(1.1, 0.5, 1.2);
      paw.position.set(x, -0.56, 0.28);
      group.add(paw);
    }

    return {
      group,
      kind: "cat",
      baseX: 0,
      baseY: 0,
      phase: 0,
      drift: 0,
      eyes,
      head,
      tail: tailGroup,
      baseScale: 1,
    };
  }

  function buildDog(theme: Theme): Actor {
    const c = theme.colors;
    const fur = mix(c.accent, "#ffffff", 0.5, THREE);
    const furDeep = mix(c.accent, c.ink, 0.22, THREE);
    const cream = mix(c.secondary, "#ffffff", 0.55, THREE);
    const eyeColor = mix(c.ink, "#1d1418", 0.5, THREE);

    const group = new THREE.Group();
    const bodyMat = material(fur);
    const deepMat = material(furDeep);
    const creamMat = material(cream);
    const eyeMat = material(eyeColor);

    const body = sphere(0.62, bodyMat, 16);
    body.scale.set(1.06, 0.8, 0.76);
    group.add(body);

    const belly = sphere(0.32, creamMat, 14);
    belly.scale.set(1.05, 0.9, 0.42);
    belly.position.set(0, -0.08, 0.36);
    group.add(belly);

    const head = new THREE.Group();
    head.position.set(0, 0.66, 0.06);
    group.add(head);

    const skull = sphere(0.45, bodyMat, 18);
    skull.scale.set(1.02, 0.94, 0.9);
    head.add(skull);

    const earLeft = sphere(0.2, deepMat, 12);
    earLeft.scale.set(0.62, 1.15, 0.4);
    earLeft.position.set(-0.34, -0.02, 0);
    earLeft.rotation.z = 0.5;
    head.add(earLeft);
    const earRight = earLeft.clone();
    earRight.position.x = 0.34;
    earRight.rotation.z = -0.5;
    head.add(earRight);

    const eyes: Three.Mesh[] = [];
    for (const x of [-0.16, 0.16]) {
      const eye = sphere(0.055, eyeMat, 12);
      eye.position.set(x, 0.08, 0.4);
      eye.scale.set(1, 1.1, 0.7);
      eyes.push(eye);
      head.add(eye);
    }

    const muzzle = sphere(0.15, creamMat, 12);
    muzzle.scale.set(1.2, 0.7, 0.8);
    muzzle.position.set(0, -0.1, 0.38);
    head.add(muzzle);

    const nose = sphere(0.045, material(mix(c.ink, "#000000", 0.2, THREE)), 10);
    nose.position.set(0, -0.04, 0.52);
    head.add(nose);

    const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.12), material("#e8909d"));
    tongue.position.set(0, -0.17, 0.47);
    tongue.rotation.x = 0.3;
    head.add(tongue);

    const tailGroup = new THREE.Group();
    tailGroup.position.set(0.52, -0.1, -0.16);
    group.add(tailGroup);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.16, 0.22, 0.02),
      new THREE.Vector3(0.08, 0.46, 0.04),
    ]);
    tailGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.07, 7, false), bodyMat));

    for (const x of [-0.28, 0.28]) {
      const paw = sphere(0.14, creamMat, 10);
      paw.scale.set(1.1, 0.5, 1.2);
      paw.position.set(x, -0.6, 0.3);
      group.add(paw);
    }

    return {
      group,
      kind: "dog",
      baseX: 0,
      baseY: 0,
      phase: 1.7,
      drift: 0,
      eyes,
      head,
      tail: tailGroup,
      baseScale: 1,
    };
  }

  function buildClouds(theme: Theme): Three.Group {
    const group = new THREE.Group();
    const cloudMat = material(mix(theme.colors.secondary, "#ffffff", 0.72, THREE), 0.42);
    for (let index = 0; index < 6; index += 1) {
      const cloud = new THREE.Group();
      const count = 3 + Math.floor(Math.random() * 3);
      for (let part = 0; part < count; part += 1) {
        const puff = sphere(0.34 + Math.random() * 0.28, cloudMat, 12);
        puff.position.set((part - count / 2) * 0.36, Math.random() * 0.12, Math.random() * 0.2);
        puff.scale.y = 0.72;
        cloud.add(puff);
      }
      cloud.position.set(
        Math.random() * 6 - 3,
        2.45 + Math.random() * 0.95,
        -2.6 - Math.random() * 1.6
      );
      cloud.userData.base = cloud.position.clone();
      cloud.userData.speed = 0.16 + Math.random() * 0.2;
      cloud.userData.phase = Math.random() * Math.PI * 2;
      cloud.userData.scale = 0.34 + Math.random() * 0.2;
      cloud.scale.setScalar(cloud.userData.scale);
      group.add(cloud);
    }
    return group;
  }

  function buildYarn(theme: Theme): Actor {
    const c = theme.colors;
    const thread = mix(c.primary, "#ffffff", 0.2, THREE);
    const threadDeep = mix(c.primary, c.ink, 0.24, THREE);
    const group = new THREE.Group();
    const ball = sphere(0.4, material(thread), 16);
    group.add(ball);
    for (let index = 0; index < 3; index += 1) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.405, 0.028, 6, 22),
        material(threadDeep)
      );
      ring.rotation.x = Math.PI / 2.4 + index * 0.7;
      ring.rotation.y = index * 0.8;
      group.add(ring);
    }
    const trail = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.2, -0.32, 0.1),
      new THREE.Vector3(0.5, -0.42, 0.2),
      new THREE.Vector3(0.82, -0.34, 0.26),
    ]);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(trail, 14, 0.025, 6, false), material(threadDeep)));

    return {
      group,
      kind: "yarn",
      baseX: 0,
      baseY: 0,
      phase: 2.1,
      drift: 0,
      eyes: [],
      spin: 0.004,
      baseScale: 1,
    };
  }

  function buildHook(theme: Theme): Three.Group {
    const group = new THREE.Group();
    const wood = material(mix("#c9a06b", theme.colors.primary, 0.18, THREE));
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.3, 8), wood);
    group.add(shaft);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.035, 6, 14, Math.PI * 1.3), wood);
    hook.position.set(0, 0.68, 0);
    hook.rotation.z = 0.5;
    group.add(hook);
    group.rotation.z = 0.22;
    return group;
  }

  function buildPiggy(theme: Theme): Actor {
    const c = theme.colors;
    const skin = mix(c.primary, "#ffffff", 0.32, THREE);
    const skinDeep = mix(c.primary, c.ink, 0.14, THREE);
    const group = new THREE.Group();
    const skinMat = material(skin);
    const deepMat = material(skinDeep);

    const body = sphere(0.56, skinMat, 16);
    body.scale.set(1.1, 0.82, 0.82);
    group.add(body);

    const head = new THREE.Group();
    head.position.set(0, 0.5, 0.06);
    group.add(head);

    const skull = sphere(0.38, skinMat, 16);
    skull.scale.set(1, 0.92, 0.9);
    head.add(skull);

    const snoutMat = material(mix(c.accent, "#ffffff", 0.22, THREE));
    const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.16, 14), snoutMat);
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, -0.06, 0.36);
    head.add(snout);

    const snoutTip = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.02, 14), material(mix(c.accent, c.ink, 0.16, THREE)));
    snoutTip.rotation.x = Math.PI / 2;
    snoutTip.position.set(0, -0.06, 0.45);
    head.add(snoutTip);

    const eyes: Three.Mesh[] = [];
    for (const x of [-0.14, 0.14]) {
      const eye = sphere(0.045, material(mix(c.ink, "#241a1d", 0.5, THREE)), 10);
      eye.position.set(x, 0.08, 0.34);
      eyes.push(eye);
      head.add(eye);
    }

    for (const x of [-0.22, 0.22]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.24, 4), snoutMat);
      ear.position.set(x, 0.32, 0);
      ear.rotation.z = x > 0 ? -0.35 : 0.35;
      head.add(ear);
    }

    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.05), material(mix(c.ink, "#000000", 0.2, THREE)));
    slot.position.set(0, 0.44, 0.04);
    group.add(slot);

    for (const x of [-0.32, 0.32]) {
      for (const z of [-0.2, 0.2]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.2, 10), deepMat);
        leg.position.set(x, -0.5, z);
        group.add(leg);
      }
    }

    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 6, 14), deepMat);
    tail.position.set(0.56, 0.06, -0.16);
    group.add(tail);

    return {
      group,
      kind: "pig",
      baseX: 0,
      baseY: 0,
      phase: 0.9,
      drift: 0,
      eyes,
      head,
      baseScale: 1,
    };
  }

  function buildBag(theme: Theme): Actor {
    const group = new THREE.Group();
    const paper = material(mix(theme.colors.primary, "#ffffff", 0.15, THREE));
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.8, 0.3), paper);
    bag.position.y = -0.1;
    group.add(bag);
    const handle = new THREE.Mesh(
      new THREE.TorusGeometry(0.2, 0.035, 8, 20, Math.PI),
      material(mix(theme.colors.primary, theme.colors.ink, 0.18, THREE))
    );
    handle.position.set(0, 0.36, 0);
    handle.rotation.z = Math.PI;
    group.add(handle);
    return {
      group,
      kind: "bag",
      baseX: 0,
      baseY: 0,
      phase: 1.2,
      drift: 0,
      eyes: [],
      baseScale: 1,
    };
  }

  function buildCoins(theme: Theme, centerX: number, centerY: number): Three.Group {
    const group = new THREE.Group();
    const gold = material(mix("#e9c15c", theme.colors.accent, 0.2, THREE));
    for (let index = 0; index < 6; index += 1) {
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 14), gold);
      coin.position.set(
        centerX + (index - 2.5) * 0.17,
        centerY + (index % 3) * 0.13,
        0.18 + (index % 2) * 0.12
      );
      coin.rotation.x = 0.4 + (index % 3) * 0.35;
      coin.rotation.z = (index % 2) * 0.4;
      coin.userData.phase = index * 0.7;
      coin.userData.baseY = coin.position.y;
      group.add(coin);
    }
    return group;
  }

  function buildEnvelope(theme: Theme): Three.Group {
    const group = new THREE.Group();
    const paper = material(mix(theme.colors.secondary, "#ffffff", 0.5, THREE));
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.46, 0.035), paper);
    group.add(body);
    const flapShape = new THREE.Shape();
    flapShape.moveTo(-0.35, 0.23);
    flapShape.lineTo(0.35, 0.23);
    flapShape.lineTo(0, -0.02);
    flapShape.closePath();
    const flap = new THREE.Mesh(new THREE.ShapeGeometry(flapShape), material(mix(theme.colors.secondary, theme.colors.primary, 0.2, THREE)));
    flap.position.z = 0.02;
    group.add(flap);
    const seal = sphere(0.05, material(mix(theme.colors.accent, "#d9a441", 0.4, THREE)), 10);
    seal.position.set(0, 0.02, 0.03);
    group.add(seal);
    group.rotation.x = -0.16;
    return group;
  }

  function heartGeometry(THREE_NS: typeof import("three")): Three.ExtrudeGeometry {
    const shape = new THREE_NS.Shape();
    shape.moveTo(0, -0.18);
    shape.bezierCurveTo(0.02, -0.1, 0.28, 0.02, 0.2, 0.17);
    shape.bezierCurveTo(0.13, 0.3, 0.02, 0.2, 0, 0.14);
    shape.bezierCurveTo(-0.02, 0.2, -0.13, 0.3, -0.2, 0.17);
    shape.bezierCurveTo(-0.28, 0.02, -0.02, -0.1, 0, -0.18);
    return new THREE_NS.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 });
  }

  function buildHearts(theme: Theme): Three.Group {
    const group = new THREE.Group();
    const mat = material(mix(theme.colors.primary, "#ffffff", 0.2, THREE), 0.92);
    const mobile = window.innerWidth < 720;
    for (let index = 0; index < 4; index += 1) {
      const heart = new THREE.Mesh(heartGeometry(THREE), mat);
      heart.position.set(
        (index % 2 === 0 ? -1 : 1) * (mobile ? 0.9 : 1.78),
        -0.95 + index * 0.1,
        -0.35
      );
      heart.rotation.z = index % 2 === 0 ? 0.2 : -0.2;
      heart.scale.setScalar(0.38 + (index % 3) * 0.1);
      heart.userData.phase = index * 1.1;
      heart.userData.baseY = heart.position.y;
      group.add(heart);
    }
    return group;
  }

  function buildFlowers(theme: Theme): Three.Group {
    const group = new THREE.Group();
    const stemMat = material(mix("#9bb78f", theme.colors.primary, 0.1, THREE));
    const petalMat = material(mix("#ffffff", theme.colors.primary, 0.35, THREE));
    const centerMat = material("#f2c96a");
    for (let index = 0; index < 5; index += 1) {
      const flower = new THREE.Group();
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.5, 6), stemMat);
      stem.position.y = -0.2;
      flower.add(stem);
      for (let petal = 0; petal < 5; petal += 1) {
        const angle = (petal / 5) * Math.PI * 2;
        const leaf = sphere(0.075, petalMat, 10);
        leaf.scale.set(1, 0.55, 0.8);
        leaf.position.set(Math.cos(angle) * 0.09, 0.06, Math.sin(angle) * 0.09);
        flower.add(leaf);
      }
      const center = sphere(0.045, centerMat, 8);
      center.position.y = 0.06;
      flower.add(center);
      flower.position.set(index * 0.38 - 0.76, -1.3 + (index % 2) * 0.05, -0.28 - (index % 3) * 0.05);
      flower.userData.phase = index * 0.8;
      flower.userData.baseY = flower.position.y;
      flower.userData.baseScale = 0.7 + (index % 3) * 0.12;
      flower.scale.setScalar(0.001);
      group.add(flower);
    }
    return group;
  }

  function buildParticles(theme: Theme): Three.Points {
    const count = 130;
    const positions = new Float32Array(count * 3);
    particleVelocities = new Float32Array(count);
    for (let index = 0; index < count; index += 1) {
      positions[index * 3] = (Math.random() - 0.5) * 12;
      positions[index * 3 + 1] = Math.random() * 7 - 2;
      positions[index * 3 + 2] = (Math.random() - 0.5) * 4 - 1;
      particleVelocities[index] = 0.12 + Math.random() * 0.28;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    particleGeometry = geometry;

    const spriteCanvas = document.createElement("canvas");
    spriteCanvas.width = 32;
    spriteCanvas.height = 32;
    const context = spriteCanvas.getContext("2d");
    if (context) {
      const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
      gradient.addColorStop(0, "rgba(255,255,255,1)");
      gradient.addColorStop(0.4, "rgba(255,255,255,0.7)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 32, 32);
    }
    const texture = new THREE.CanvasTexture(spriteCanvas);
    const particleMaterial = new THREE.PointsMaterial({
      size: 0.1,
      map: texture,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: new THREE.Color(mix(theme.colors.accent, "#ffffff", 0.45, THREE)),
    });
    return new THREE.Points(geometry, particleMaterial);
  }

  function registerActor(actor: Actor): void {
    actor.group.userData.actor = actor;
    actorsRoot.add(actor.group);
    actors.push(actor);
  }

  function buildActors(theme: Theme): void {
    disposeGroup(actorsRoot);
    actorsRoot.clear();
    actors = [];
    if (particlePoints) {
      scene.remove(particlePoints);
      particlePoints.geometry.dispose();
      const particleMaterial = particlePoints.material as Three.PointsMaterial;
      particleMaterial.map?.dispose();
      particleMaterial.dispose();
      particlePoints = null;
    }
    particleGeometry = null;
    particleVelocities = null;

    const flags = theme.three_d;
    const mobile = window.innerWidth < 720;
    if (flags.clouds) actorsRoot.add(buildClouds(theme));
    if (flags.cat) registerActor(buildCat(theme));
    if (flags.dog) registerActor(buildDog(theme));
    if (flags.yarn_balls) registerActor(buildYarn(theme));
    if (flags.crochet_hook) {
      const hook = buildHook(theme);
      hook.position.set(mobile ? 0.48 : 1.72, mobile ? -1.18 : -0.86, 0.22);
      hook.scale.setScalar(mobile ? 0.52 : 0.76);
      hook.userData.phase = 0.4;
      actorsRoot.add(hook);
    }
    if (flags.piggy_bank) registerActor(buildPiggy(theme));
    if (flags.shopping_bag) registerActor(buildBag(theme));
    if (flags.coins) {
      const centerX = flags.piggy_bank ? 0 : mobile ? 0.78 : 2.1;
      const centerY = mobile ? -0.98 : -0.7;
      actorsRoot.add(buildCoins(theme, centerX, centerY));
    }
    if (flags.envelope) {
      const envelope = buildEnvelope(theme);
      envelope.position.set(mobile ? -0.92 : -1.5, mobile ? -1.12 : -0.86, 0.28);
      envelope.scale.setScalar(mobile ? 0.8 : 0.95);
      envelope.userData.phase = 2.2;
      actorsRoot.add(envelope);
    }
    if (flags.hearts) actorsRoot.add(buildHearts(theme));
    if (flags.flower) actorsRoot.add(buildFlowers(theme));
    if (flags.particles) {
      particlePoints = buildParticles(theme);
      scene.add(particlePoints);
    }

    actorsRoot.children.forEach((child) => {
      child.userData.basePosition = child.position.clone();
      if (child.userData.actor) {
        child.userData.baseScale = 1;
        child.scale.setScalar(0.001);
      } else {
        child.userData.baseScale = child.userData.baseScale ?? child.scale.x ?? 1;
        child.scale.setScalar(child.userData.baseScale);
      }
    });

    layout();
    if (!reduced) {
      actorsRoot.children.forEach((child) => {
        if (child.userData.actor) child.scale.setScalar(0.001);
      });
    }
  }

  function layout(): void {
    const mobile = window.innerWidth < 720;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const aspect = width / Math.max(1, height);

    actors.forEach((actor) => {
      const scale = mobile ? 0.5 : Math.min(1, Math.max(0.7, aspect * 0.42));
      actor.baseScale = scale;
      actor.group.userData.baseScale = scale;
      if (actor.kind === "cat") {
        actor.baseX = mobile ? -0.78 : -2.55;
        actor.baseY = mobile ? -1.42 : -1.3;
      } else if (actor.kind === "dog") {
        actor.baseX = mobile ? 0.78 : 2.55;
        actor.baseY = mobile ? -1.42 : -1.3;
      } else if (actor.kind === "yarn") {
        actor.baseX = mobile ? 0.92 : 2.3;
        actor.baseY = mobile ? -1.46 : -1.35;
      } else if (actor.kind === "pig") {
        actor.baseX = 0;
        actor.baseY = mobile ? -1.46 : -1.35;
      } else if (actor.kind === "bag") {
        actor.baseX = mobile ? 0.98 : 2.3;
        actor.baseY = mobile ? -1.35 : -1.2;
      }
      actor.group.position.set(actor.baseX, actor.baseY, 0);
    });
  }

  function setTheme(theme: Theme, isReduced: boolean): void {
    reduced = isReduced;
    currentTheme = theme;
    buildActors(theme);
  }

  function setReduced(isReduced: boolean): void {
    reduced = isReduced;
  }

  function onResize(): void {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, options.maxPixelRatio));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.updateProjectionMatrix();
    layout();
  }

  function onPointerMove(event: PointerEvent): void {
    if (reduced) return;
    pointerX = (event.clientX / window.innerWidth - 0.5) * 0.34;
    pointerY = (event.clientY / window.innerHeight - 0.5) * 0.18;
  }

  function tick(): void {
    if (disposed) return;
    raf = requestAnimationFrame(tick);
    const elapsed = clock.getElapsedTime();
    const motion = reduced ? 0.18 : 1;
    const t = elapsed;

    cameraX += (pointerX - cameraX) * 0.04;
    cameraY += (0.9 - pointerY - cameraY) * 0.04;
    camera.position.x = cameraX;
    camera.position.y = cameraY;
    camera.lookAt(0, 0.15, 0);

    actorsRoot.children.forEach((child) => {
      const actor = child.userData.actor as Actor | undefined;
      const phase = child.userData.phase ?? 0;
      if (actor) {
        const targetScale = actor.baseScale;
        const nextScale = child.scale.x + (targetScale - child.scale.x) * (reduced ? 0.2 : 0.07);
        child.scale.setScalar(nextScale);
        child.position.y = actor.baseY + Math.sin(t * 1.1 + actor.phase) * 0.04 * motion;
        if (actor.head) {
          actor.head.rotation.z = Math.sin(t * 0.65 + actor.phase) * 0.07 * motion;
          actor.head.rotation.y = Math.sin(t * 0.42 + actor.phase) * 0.1 * motion;
        }
        if (actor.tail) {
          actor.tail.rotation.z = Math.sin(t * 1.7 + actor.phase) * 0.22 * motion;
          actor.tail.rotation.x = Math.sin(t * 1.1 + actor.phase) * 0.08 * motion;
        }
        if (actor.spin) child.rotation.y += actor.spin * motion;
        if (actor.kind === "yarn") child.rotation.z = Math.sin(t * 0.5) * 0.12 * motion;
      } else {
        const base = child.userData.basePosition as Three.Vector3 | undefined;
        const scale = child.userData.baseScale;
        if (scale !== undefined) {
          const nextScale = child.scale.x + (scale - child.scale.x) * 0.08;
          child.scale.setScalar(nextScale);
        }
        if (child.userData.speed && base) {
          child.position.x = base.x + Math.sin(t * child.userData.speed + child.userData.phase) * 0.55 * motion;
          child.position.y = base.y + Math.sin(t * 0.6 + child.userData.phase) * 0.08 * motion;
        } else if (base) {
          child.position.y = base.y + Math.sin(t * 0.8 + phase) * 0.05 * motion;
        }
        if (child.userData.phase !== undefined && !child.userData.speed) {
          child.rotation.y += 0.002 * motion;
        }
      }

      child.children.forEach((grandchild) => {
        if (grandchild.userData.speed && grandchild.userData.base) {
          const base = grandchild.userData.base as Three.Vector3;
          grandchild.position.x =
            base.x + Math.sin(t * grandchild.userData.speed + grandchild.userData.phase) * 0.55 * motion;
          grandchild.position.y = base.y + Math.sin(t * 0.6 + grandchild.userData.phase) * 0.08 * motion;
          return;
        }
        if (grandchild.userData.phase !== undefined && grandchild.userData.baseY !== undefined) {
          grandchild.position.y =
            grandchild.userData.baseY + Math.sin(t * 1.3 + grandchild.userData.phase) * 0.09 * motion;
          grandchild.rotation.y += 0.004 * motion;
        }
        if (grandchild.userData.baseScale !== undefined && grandchild.userData.baseY !== undefined) {
          const bloom = Math.min(1, t / 1.6);
          grandchild.scale.setScalar(Math.max(0.001, grandchild.userData.baseScale * bloom));
        }
      });
    });

    if (t > nextBlink) {
      const blinking = actors.filter((actor) => actor.eyes.length > 0);
      const chosen = blinking[Math.floor(Math.random() * blinking.length)];
      if (chosen) {
        chosen.eyes.forEach((eye) => eye.scale.set(1, 0.08, 0.7));
        blinkUntil = t + 0.13;
      }
      nextBlink = t + 3 + Math.random() * 5;
    }
    if (t > blinkUntil && blinkUntil > 0) {
      actors.forEach((actor) => actor.eyes.forEach((eye) => eye.scale.set(1, 1.1, 0.7)));
      blinkUntil = 0;
    }

    if (particleGeometry && particleVelocities) {
      const position = particleGeometry.getAttribute("position") as Three.BufferAttribute;
      const array = position.array as Float32Array;
      for (let index = 0; index < particleVelocities.length; index += 1) {
        array[index * 3 + 1] += particleVelocities[index] * 0.004 * motion;
        if (array[index * 3 + 1] > 5) array[index * 3 + 1] = -2.2;
      }
      position.needsUpdate = true;
    }

    renderer.render(scene, camera);
  }

  if (currentTheme === null) {
    const fallback = {
      colors: {
        primary: "#F3B6CE",
        secondary: "#FFF6EE",
        accent: "#9FBFD8",
        ink: "#66414F",
        soft: "#FBE0EA",
        background_gradient: ["#FFF3F7", "#FBE0EA", "#F6CFE0"],
      },
      three_d: { clouds: true, cat: true, particles: true },
    } as unknown as Theme;
    setTheme(fallback, reduced);
  }

  window.addEventListener("resize", onResize);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
    } else if (!disposed) {
      clock.getDelta();
      tick();
    }
  });

  tick();

  return {
    setTheme,
    setReduced,
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointerMove);
      disposeGroup(actorsRoot);
      if (particleGeometry) particleGeometry.dispose();
      renderer.dispose();
    },
  };
}
