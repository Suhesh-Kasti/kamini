import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { gsap } from "gsap";
import type { Theme } from "../lib/types";

export interface ThreeSceneApi {
  setTheme(theme: Theme, isReduced: boolean): void;
  setReduced(isReduced: boolean): void;
  dispose(): void;
}

interface CameraPreset {
  pos: [number, number, number];
  target: [number, number, number];
  fov: number;
}

interface SceneKit {
  group: THREE.Group;
  env: THREE.Texture;
  exposure: number;
  layout: (mobile: boolean) => CameraPreset;
  update: (t: number, dt: number, reduced: boolean) => void;
  dispose: () => void;
}

interface PetRig {
  group: THREE.Group;
  head: THREE.Group;
  eyes: THREE.Mesh[];
  tail: THREE.Object3D;
  body: THREE.Mesh;
}

const KIT_CACHE_LIMIT = 3;

function mix(hexA: string, hexB: string, t: number): THREE.Color {
  return new THREE.Color(hexA).lerp(new THREE.Color(hexB), t);
}

function mixStyle(hexA: string, hexB: string, t: number): string {
  return mix(hexA, hexB, t).getStyle();
}

export async function createThreeScene(
  canvas: HTMLCanvasElement,
  options: { maxPixelRatio: number; maxPixelRatioMobile: number; reduced: boolean }
): Promise<ThreeSceneApi> {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  const isMobile = () => window.innerWidth < 720;
  const dpr = () => Math.min(window.devicePixelRatio || 1, isMobile() ? options.maxPixelRatioMobile : options.maxPixelRatio);
  renderer.setPixelRatio(dpr());
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = false;

  renderer.setClearAlpha(0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.1, 100);
  const cache = new Map<string, SceneKit>();
  const cacheOrder: string[] = [];
  let current: SceneKit | null = null;
  let currentTheme: Theme | null = null;
  let reduced = options.reduced;
  let disposed = false;
  let baseCamera = new THREE.Vector3(0, 1, 5);
  let targetCamera = new THREE.Vector3(0, 0.5, 0);
  let pointerX = 0.5;
  let pointerY = 0.5;

  const parallaxX = gsap.quickTo(camera.position, "x", { duration: 1.1, ease: "power3.out" });
  const parallaxY = gsap.quickTo(camera.position, "y", { duration: 1.1, ease: "power3.out" });

  function canvasTexture(
    size: number,
    draw: (ctx: CanvasRenderingContext2D, size: number) => void,
    repeat: [number, number] = [1, 1],
    srgb = true
  ): THREE.CanvasTexture {
    const el = document.createElement("canvas");
    el.width = size;
    el.height = size;
    const ctx = el.getContext("2d");
    if (ctx) draw(ctx, size);
    const texture = new THREE.CanvasTexture(el);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat[0], repeat[1]);
    texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = 4;
    return texture;
  }

  function paperTexture(base: string, fleck: string): THREE.Texture {
    return canvasTexture(
      256,
      (ctx, size) => {
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, size, size);
        for (let i = 0; i < 2200; i += 1) {
          ctx.globalAlpha = 0.08 + Math.random() * 0.12;
          ctx.fillStyle = Math.random() > 0.5 ? fleck : "#ffffff";
          ctx.fillRect(Math.random() * size, Math.random() * size, Math.random() * 2.2, Math.random() * 2.2);
        }
        ctx.globalAlpha = 1;
      },
      [4, 4]
    );
  }

  function woodTexture(base: string, grain: string): THREE.Texture {
    return canvasTexture(
      512,
      (ctx, size) => {
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, size, size);
        for (let y = 0; y < size; y += 3) {
          ctx.globalAlpha = 0.05 + Math.random() * 0.08;
          ctx.strokeStyle = Math.random() > 0.4 ? grain : "#ffffff";
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let x = 0; x <= size; x += 8) {
            const wave = Math.sin((x + y) * 0.03) * 1.4 + Math.sin(y * 0.08) * 0.8;
            if (x === 0) ctx.moveTo(x, y + wave);
            else ctx.lineTo(x, y + wave);
          }
          ctx.stroke();
        }
        for (let i = 0; i < 4; i += 1) {
          const x = Math.random() * size;
          const y = Math.random() * size;
          ctx.globalAlpha = 0.14;
          ctx.strokeStyle = grain;
          for (let r = 2; r < 14; r += 2) {
            ctx.beginPath();
            ctx.ellipse(x, y, r * 2.2, r, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
      },
      [3, 2]
    );
  }

  function woolTexture(base: string, shade: string): { map: THREE.Texture; bump: THREE.Texture } {
    const map = canvasTexture(
      256,
      (ctx, size) => {
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, size, size);
        for (let i = 0; i < 1500; i += 1) {
          const x = Math.random() * size;
          const y = Math.random() * size;
          ctx.globalAlpha = 0.18 + Math.random() * 0.2;
          ctx.strokeStyle = Math.random() > 0.5 ? shade : "#ffffff";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(x, y, 3 + Math.random() * 6, 0.2, Math.PI * 0.9);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      },
      [3, 3]
    );
    const bump = canvasTexture(
      256,
      (ctx, size) => {
        ctx.fillStyle = "#808080";
        ctx.fillRect(0, 0, size, size);
        for (let i = 0; i < 2200; i += 1) {
          const v = Math.floor(80 + Math.random() * 110);
          ctx.fillStyle = `rgb(${v},${v},${v})`;
          ctx.beginPath();
          ctx.arc(Math.random() * size, Math.random() * size, 1 + Math.random() * 3, 0, Math.PI * 2);
          ctx.fill();
        }
      },
      [3, 3],
      false
    );
    return { map, bump };
  }

  function knitTexture(base: string, shade: string): { map: THREE.Texture; bump: THREE.Texture } {
    const map = canvasTexture(
      256,
      (ctx, size) => {
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, size, size);
        const step = 16;
        for (let x = 0; x < size; x += step) {
          ctx.strokeStyle = shade;
          ctx.globalAlpha = 0.4;
          ctx.lineWidth = 3;
          ctx.beginPath();
          for (let y = 0; y < size; y += 12) {
            const px = x + Math.sin(y * 0.15) * 3;
            if (y === 0) ctx.moveTo(px, y);
            else ctx.lineTo(px, y);
          }
          ctx.stroke();
        }
        for (let y = 0; y < size; y += step) {
          ctx.strokeStyle = "#ffffff";
          ctx.globalAlpha = 0.16;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(size, y);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      },
      [4, 4]
    );
    const bump = canvasTexture(
      256,
      (ctx, size) => {
        ctx.fillStyle = "#7a7a7a";
        ctx.fillRect(0, 0, size, size);
        for (let x = 0; x < size; x += 14) {
          ctx.strokeStyle = "#c8c8c8";
          ctx.lineWidth = 4;
          ctx.beginPath();
          for (let y = 0; y < size; y += 8) {
            const px = x + Math.sin(y * 0.2) * 4;
            if (y === 0) ctx.moveTo(px, y);
            else ctx.lineTo(px, y);
          }
          ctx.stroke();
        }
      },
      [4, 4],
      false
    );
    return { map, bump };
  }

  function leatherTexture(base: string, shade: string): { map: THREE.Texture; bump: THREE.Texture } {
    const map = canvasTexture(
      256,
      (ctx, size) => {
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, size, size);
        for (let i = 0; i < 2600; i += 1) {
          ctx.globalAlpha = 0.06 + Math.random() * 0.1;
          ctx.fillStyle = Math.random() > 0.5 ? shade : "#ffffff";
          ctx.beginPath();
          ctx.arc(Math.random() * size, Math.random() * size, 0.6 + Math.random() * 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      },
      [3, 3]
    );
    const bump = canvasTexture(
      256,
      (ctx, size) => {
        ctx.fillStyle = "#808080";
        ctx.fillRect(0, 0, size, size);
        for (let i = 0; i < 3600; i += 1) {
          const v = Math.floor(70 + Math.random() * 120);
          ctx.fillStyle = `rgb(${v},${v},${v})`;
          ctx.beginPath();
          ctx.arc(Math.random() * size, Math.random() * size, 0.6 + Math.random() * 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      },
      [3, 3],
      false
    );
    return { map, bump };
  }

  function chocolateTexture(base: string, shade: string): THREE.Texture {
    return canvasTexture(
      256,
      (ctx, size) => {
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, size, size);
        for (let i = 0; i < 1200; i += 1) {
          ctx.globalAlpha = 0.05 + Math.random() * 0.08;
          ctx.fillStyle = Math.random() > 0.5 ? shade : "#ffffff";
          ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1);
        }
        ctx.globalAlpha = 1;
      },
      [2, 2]
    );
  }

  function makeEnvironment(theme: Theme, sceneKey: string): THREE.Texture {
    const el = document.createElement("canvas");
    el.width = 1024;
    el.height = 512;
    const ctx = el.getContext("2d");
    if (ctx) {
      const sky = ctx.createLinearGradient(0, 0, 0, 512);
      sky.addColorStop(0, mixStyle(theme.colors.secondary, "#ffffff", 0.65));
      sky.addColorStop(0.42, theme.colors.secondary);
      sky.addColorStop(0.62, mixStyle(theme.colors.paper, theme.colors.secondary, 0.4));
      sky.addColorStop(1, mixStyle(theme.colors.primary, theme.colors.ink, 0.45));
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, 1024, 512);

      const sunX = sceneKey === "piggy_desk" ? 760 : sceneKey === "yarn_corner" ? 210 : 680;
      const sunY = sceneKey === "cloud_bank" ? 350 : 170;
      const sun = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 260);
      sun.addColorStop(0, "rgba(255,246,218,1)");
      sun.addColorStop(0.12, "rgba(255,238,196,0.95)");
      sun.addColorStop(0.5, "rgba(255,220,170,0.25)");
      sun.addColorStop(1, "rgba(255,220,170,0)");
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, 1024, 512);

      const blob = ctx.createRadialGradient(300, 210, 10, 300, 210, 280);
      blob.addColorStop(0, mixStyle(theme.colors.primary, "#ffffff", 0.35));
      blob.addColorStop(1, "rgba(255,255,255,0)");
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = blob;
      ctx.fillRect(0, 0, 1024, 512);
      ctx.globalAlpha = 1;
    }

    const texture = new THREE.CanvasTexture(el);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromEquirectangular(texture).texture;
    texture.dispose();
    pmrem.dispose();
    return env;
  }

  function blobShadowTexture(): THREE.Texture {
    return canvasTexture(
      128,
      (ctx, size) => {
        const gradient = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
        gradient.addColorStop(0, "rgba(0,0,0,0.55)");
        gradient.addColorStop(0.45, "rgba(0,0,0,0.28)");
        gradient.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
      },
      [1, 1],
      false
    );
  }

  const shadowTexture = blobShadowTexture();

  function blobShadow(size: number, opacity = 0.4): THREE.Mesh {
    const material = new THREE.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      opacity,
      depthWrite: false,
      color: 0x000000,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.012;
    mesh.renderOrder = -1;
    return mesh;
  }

  function sphere(radius: number, material: THREE.Material, segments = 32): THREE.Mesh {
    return new THREE.Mesh(new THREE.SphereGeometry(radius, segments, Math.max(12, Math.floor(segments * 0.7))), material);
  }

  function roundedBox(
    width: number,
    height: number,
    depth: number,
    radius: number,
    material: THREE.Material
  ): THREE.Mesh {
    return new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, 4, radius), material);
  }

  function petMaterials(theme: Theme, furHex: string, wool: boolean, textures: { map?: THREE.Texture; bump?: THREE.Texture }) {
    const fur = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(furHex),
      roughness: wool ? 0.96 : 0.82,
      metalness: 0,
      sheen: wool ? 1 : 0.55,
      sheenRoughness: 0.9,
      sheenColor: mix(furHex, "#ffffff", 0.35),
      map: textures.map ?? null,
      bumpMap: textures.bump ?? null,
      bumpScale: wool ? 0.035 : 0.018,
    });
    const belly = new THREE.MeshPhysicalMaterial({
      color: mix(theme.colors.paper, "#ffffff", 0.35),
      roughness: 0.9,
      sheen: 0.5,
      sheenColor: mix(theme.colors.paper, "#ffffff", 0.5),
      bumpMap: textures.bump ?? null,
      bumpScale: wool ? 0.03 : 0.012,
    });
    const dark = new THREE.MeshPhysicalMaterial({
      color: mix(furHex, theme.colors.ink, 0.32),
      roughness: 0.8,
      sheen: 0.4,
    });
    const eye = new THREE.MeshPhysicalMaterial({
      color: mix(theme.colors.ink, "#0b0808", 0.6),
      roughness: 0.12,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    });
    const catchlight = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const nose = new THREE.MeshPhysicalMaterial({
      color: mix(theme.colors.primary, theme.colors.ink, 0.28),
      roughness: 0.35,
      clearcoat: 0.8,
      clearcoatRoughness: 0.2,
    });
    const inner = new THREE.MeshStandardMaterial({
      color: mix(theme.colors.primary, "#ffffff", 0.25),
      roughness: 0.95,
    });
    return { fur, belly, dark, eye, catchlight, nose, inner };
  }

  function createCat(
    theme: Theme,
    furHex: string,
    textures: { map?: THREE.Texture; bump?: THREE.Texture },
    wool = false
  ): PetRig {
    const m = petMaterials(theme, furHex, wool, textures);
    const group = new THREE.Group();
    const body = sphere(0.52, m.fur, 40);
    body.scale.set(1.04, 0.9, 0.8);
    body.position.y = 0.55;
    body.castShadow = true;
    group.add(body);

    const chest = sphere(0.37, m.belly, 32);
    chest.scale.set(1, 0.9, 0.4);
    chest.position.set(0, 0.48, 0.3);
    group.add(chest);

    for (const x of [-0.24, 0.24]) {
      const paw = sphere(0.13, m.belly, 24);
      paw.scale.set(1.1, 0.55, 1.25);
      paw.position.set(x, 0.09, 0.3);
      paw.castShadow = true;
      group.add(paw);
    }

    const tailGroup = new THREE.Group();
    tailGroup.position.set(0.34, 0.5, -0.24);
    const tailCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.26, 0.14, -0.02),
      new THREE.Vector3(0.4, 0.44, -0.06),
      new THREE.Vector3(0.3, 0.7, 0.02),
      new THREE.Vector3(0.38, 0.82, 0.12),
    ]);
    const tail = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 32, 0.07, 10, false), m.fur);
    tail.castShadow = true;
    tailGroup.add(tail);
    group.add(tailGroup);

    const head = new THREE.Group();
    head.position.set(0, 1.05, 0.02);
    group.add(head);

    const skull = sphere(0.45, m.fur, 44);
    skull.scale.set(1.03, 0.95, 0.93);
    skull.castShadow = true;
    head.add(skull);

    for (const x of [-0.21, 0.21]) {
      const cheek = sphere(0.18, m.fur, 28);
      cheek.scale.set(1, 0.78, 0.6);
      cheek.position.set(x, -0.08, 0.3);
      head.add(cheek);
    }

    const muzzle = sphere(0.15, m.belly, 28);
    muzzle.scale.set(1.25, 0.68, 0.72);
    muzzle.position.set(0, -0.11, 0.38);
    head.add(muzzle);

    const nose = sphere(0.042, m.nose, 20);
    nose.scale.set(1.15, 0.8, 0.8);
    nose.position.set(0, -0.03, 0.5);
    head.add(nose);

    const mouthMaterial = new THREE.MeshBasicMaterial({ color: mix(theme.colors.ink, "#000000", 0.2) });
    for (const [sx, rot] of [
      [-1, 0.5],
      [1, -0.5],
    ] as const) {
      const mouthCurve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(0, -0.12, 0.49),
        new THREE.Vector3(sx * 0.05, -0.16, 0.505),
        new THREE.Vector3(sx * 0.09, -0.13, 0.49)
      );
      const mouth = new THREE.Mesh(new THREE.TubeGeometry(mouthCurve, 10, 0.008, 5, false), mouthMaterial);
      mouth.rotation.z = rot * 0.1;
      head.add(mouth);
    }

    const eyes: THREE.Mesh[] = [];
    for (const x of [-0.16, 0.16]) {
      const eye = sphere(0.072, m.eye, 28);
      eye.position.set(x, 0.055, 0.415);
      eye.scale.set(1, 1.16, 0.72);
      head.add(eye);
      eyes.push(eye);
      const glint = sphere(0.02, m.catchlight, 12);
      glint.position.set(x + 0.018, 0.09, 0.47);
      head.add(glint);
      const brow = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.12, 6), m.dark);
      brow.position.set(x, 0.19, 0.44);
      brow.rotation.z = x < 0 ? 0.25 : -0.25;
      brow.rotation.x = 0.2;
      head.add(brow);
    }

    for (const x of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 4), m.fur);
      ear.position.set(x * 0.27, 0.36, -0.02);
      ear.rotation.z = x * -0.16;
      ear.rotation.y = x * 0.35;
      ear.castShadow = true;
      head.add(ear);
      const innerEar = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.19, 4), m.inner);
      innerEar.position.set(x * 0.27, 0.36, 0.02);
      innerEar.rotation.z = x * -0.16;
      innerEar.rotation.y = x * 0.35;
      head.add(innerEar);
    }

    const whiskerMaterial = new THREE.MeshBasicMaterial({ color: mix(theme.colors.ink, "#ffffff", 0.4) });
    for (const x of [-1, 1]) {
      for (let i = 0; i < 3; i += 1) {
        const whisker = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.34, 4), whiskerMaterial);
        whisker.position.set(x * 0.18, -0.075 + i * 0.035, 0.46);
        whisker.rotation.z = Math.PI / 2 + x * (0.12 + i * 0.08);
        whisker.rotation.y = x * (0.1 + i * 0.1);
        head.add(whisker);
      }
    }

    return { group, head, eyes, tail: tailGroup, body };
  }

  function createDog(
    theme: Theme,
    furHex: string,
    textures: { map?: THREE.Texture; bump?: THREE.Texture }
  ): PetRig & { tongue: THREE.Mesh } {
    const m = petMaterials(theme, furHex, false, textures);
    const group = new THREE.Group();
    const body = sphere(0.55, m.fur, 40);
    body.scale.set(1.05, 0.9, 0.82);
    body.position.y = 0.55;
    body.castShadow = true;
    group.add(body);

    const chest = sphere(0.38, m.belly, 32);
    chest.scale.set(1, 0.9, 0.42);
    chest.position.set(0, 0.46, 0.32);
    group.add(chest);

    for (const x of [-0.26, 0.26]) {
      const paw = sphere(0.14, m.belly, 24);
      paw.scale.set(1.1, 0.55, 1.3);
      paw.position.set(x, 0.09, 0.32);
      paw.castShadow = true;
      group.add(paw);
    }

    const tailGroup = new THREE.Group();
    tailGroup.position.set(0.38, 0.58, -0.24);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.18, 0.22, -0.02),
      new THREE.Vector3(0.12, 0.46, 0.02),
    ]);
    const tail = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.075, 9, false), m.fur);
    tail.castShadow = true;
    tailGroup.add(tail);
    group.add(tailGroup);

    const head = new THREE.Group();
    head.position.set(0, 1.06, 0.03);
    group.add(head);

    const skull = sphere(0.46, m.fur, 44);
    skull.scale.set(1.02, 0.94, 0.9);
    skull.castShadow = true;
    head.add(skull);

    const snout = sphere(0.22, m.belly, 32);
    snout.scale.set(1, 0.78, 1.45);
    snout.position.set(0, -0.12, 0.38);
    head.add(snout);

    const nose = sphere(0.055, m.nose, 20);
    nose.scale.set(1.2, 0.85, 0.8);
    nose.position.set(0, -0.04, 0.64);
    head.add(nose);

    const eyes: THREE.Mesh[] = [];
    for (const x of [-0.17, 0.17]) {
      const eye = sphere(0.072, m.eye, 28);
      eye.position.set(x, 0.08, 0.4);
      eye.scale.set(1, 1.12, 0.72);
      head.add(eye);
      eyes.push(eye);
      const glint = sphere(0.02, m.catchlight, 12);
      glint.position.set(x + 0.018, 0.115, 0.455);
      head.add(glint);
    }

    for (const x of [-1, 1]) {
      const ear = sphere(0.2, m.dark, 24);
      ear.scale.set(0.6, 1.18, 0.38);
      ear.position.set(x * 0.33, -0.02, 0);
      ear.rotation.z = x * 0.52;
      ear.castShadow = true;
      head.add(ear);
    }

    const tongue = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.035, 0.1, 6, 10),
      new THREE.MeshPhysicalMaterial({ color: "#d97783", roughness: 0.35, clearcoat: 0.6 })
    );
    tongue.position.set(0, -0.2, 0.56);
    tongue.rotation.x = 0.5;
    head.add(tongue);

    return { group, head, eyes, tail: tailGroup, body, tongue };
  }

  function addBlink(rig: PetRig, next: { at: number }) {
    next.at = 2 + Math.random() * 4;
    return { rig, next, until: 0 };
  }

  function updateBlink(state: { rig: PetRig; next: { at: number }; until: number }, t: number) {
    if (t > state.next.at && state.until === 0) {
      state.rig.eyes.forEach((eye) => eye.scale.set(1, 0.1, 0.72));
      state.until = t + 0.12;
      state.next.at = t + 2.8 + Math.random() * 4.5;
    }
    if (state.until > 0 && t > state.until) {
      state.rig.eyes.forEach((eye) => eye.scale.set(1, 1.12, 0.72));
      state.until = 0;
    }
  }

  function kitLights(
    group: THREE.Group,
    theme: Theme,
    config: {
      keyColor: string;
      keyIntensity: number;
      keyPos: [number, number, number];
      ambient: number;
      rimColor: string;
      rimIntensity: number;
      rimPos: [number, number, number];
      shadow?: boolean;
    }
  ) {
    const hemi = new THREE.HemisphereLight(
      mixStyle(theme.colors.secondary, "#ffffff", 0.5),
      mixStyle(theme.colors.primary, theme.colors.ink, 0.4),
      config.ambient
    );
    group.add(hemi);

    const key = new THREE.DirectionalLight(config.keyColor, config.keyIntensity);
    key.position.set(...config.keyPos);
    if (config.shadow && !isMobile()) {
      key.castShadow = true;
      key.shadow.mapSize.set(512, 512);
      key.shadow.camera.near = 0.5;
      key.shadow.camera.far = 20;
      key.shadow.camera.left = -4;
      key.shadow.camera.right = 4;
      key.shadow.camera.top = 4;
      key.shadow.camera.bottom = -4;
      key.shadow.bias = -0.0006;
      key.shadow.normalBias = 0.02;
    }
    group.add(key);
    group.add(key.target);

    const rim = new THREE.SpotLight(config.rimColor, config.rimIntensity, 18, 0.7, 1, 2);
    rim.position.set(...config.rimPos);
    rim.target.position.set(0, 0.6, 0);
    group.add(rim);
    group.add(rim.target);
    return { key, rim };
  }

  function finishKit(
    group: THREE.Group,
    env: THREE.Texture,
    desktop: CameraPreset,
    mobilePreset: CameraPreset,
    exposure: number,
    update: (t: number, dt: number, reduced: boolean) => void,
    setupLayout: (mobile: boolean) => void
  ): SceneKit {
    const layout = (mobile: boolean) => {
      setupLayout(mobile);
      return mobile ? mobilePreset : desktop;
    };
    return {
      group,
      env,
      exposure,
      layout,
      update,
      dispose: () => disposeGroup(group),
    };
  }

  function disposeGroup(group: THREE.Object3D) {
    const materials = new Set<THREE.Material>();
    group.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const material = mesh.material;
      if (material) {
        const list = Array.isArray(material) ? material : [material];
        list.forEach((entry) => materials.add(entry));
      }
      const light = child as THREE.Light;
      if (light.isLight) {
        const shadowMap = (light as THREE.DirectionalLight).shadow?.map;
        shadowMap?.dispose();
      }
    });
    materials.forEach((material) => {
      const record = material as unknown as Record<string, unknown>;
      ["map", "bumpMap", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "alphaMap", "aoMap"].forEach((key) => {
        const texture = record[key] as THREE.Texture | null;
        texture?.dispose?.();
      });
      material.dispose();
    });
  }

  function buildKittenClose(theme: Theme): SceneKit {
    const group = new THREE.Group();
    const env = makeEnvironment(theme, "kitten_close");
    const paper = paperTexture(theme.colors.paper, theme.colors.highlight);
    const furBump = woolTexture(mixStyle(theme.colors.primary, theme.colors.paper, 0.35), theme.colors.highlight);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 24),
      new THREE.MeshStandardMaterial({ map: paper, color: mix(theme.colors.paper, "#ffffff", 0.1), roughness: 1 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    group.add(floor);

    const rug = roundedBox(6.5, 0.08, 4.4, 0.04, new THREE.MeshStandardMaterial({ map: paper, color: mix(theme.colors.primary, theme.colors.paper, 0.55), roughness: 0.95 }));
    rug.position.set(0.8, 0.04, -0.2);
    rug.receiveShadow = true;
    group.add(rug);

    const cat = createCat(theme, mixStyle(theme.colors.primary, theme.colors.paper, 0.42), furBump);
    cat.group.position.set(1.2, 0.08, 0.04);
    cat.group.rotation.y = -0.48;
    cat.group.scale.setScalar(1.9);
    group.add(cat.group);
    const catShadow = blobShadow(3.6, 0.35);
    catShadow.position.set(1.2, 0.095, 0.04);
    group.add(catShadow);

    kitLights(group, theme, {
      keyColor: mixStyle(theme.colors.secondary, "#ffffff", 0.35),
      keyIntensity: 2.2,
      keyPos: [-2.5, 4, 3.5],
      ambient: 1.35,
      rimColor: mixStyle(theme.colors.highlight, "#ffd6a0", 0.4),
      rimIntensity: 90,
      rimPos: [3.6, 3.2, -2.4],
      shadow: true,
    });

    const dust = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.012, 6, 5),
      new THREE.MeshBasicMaterial({ color: mixStyle(theme.colors.highlight, "#ffffff", 0.6), transparent: true, opacity: 0.55 }),
      34
    );
    const dummy = new THREE.Object3D();
    const dustSeeds: number[] = [];
    for (let i = 0; i < 34; i += 1) {
      dustSeeds.push(Math.random() * Math.PI * 2, Math.random());
      dummy.position.set((Math.random() - 0.5) * 5, 0.3 + Math.random() * 3, (Math.random() - 0.5) * 2.5);
      dummy.scale.setScalar(0.6 + Math.random() * 1.2);
      dummy.updateMatrix();
      dust.setMatrixAt(i, dummy.matrix);
    }
    group.add(dust);

    const blink = addBlink(cat, { at: 2 });

    return finishKit(
      group,
      env,
      { pos: [0.05, 1.25, 4.6], target: [0.25, 0.9, 0], fov: 30 },
      { pos: [0.1, 1.5, 5.2], target: [0.2, 2.15, 0], fov: 38 },
      1.08,
      (t, _dt, isReduced) => {
        updateBlink(blink, t);
        const motion = isReduced ? 0.2 : 1;
        cat.head.rotation.z = Math.sin(t * 0.55) * 0.06 * motion;
        cat.head.rotation.y = Math.sin(t * 0.34) * 0.08 * motion - 0.15;
        cat.tail.rotation.z = Math.sin(t * 1.25) * 0.2 * motion;
        cat.body.scale.y = 0.9 + Math.sin(t * 1.1) * 0.012 * motion;
        for (let i = 0; i < 34; i += 1) {
          const phase = dustSeeds[i * 2];
          const y = 0.3 + (dustSeeds[i * 2 + 1] * 2.7 + Math.sin(t * 0.3 + phase) * 0.18);
          dummy.position.set(
            Math.sin(t * 0.12 + phase) * 2.4,
            y,
            Math.cos(t * 0.1 + phase) * 1.2
          );
          dummy.scale.setScalar(0.6 + Math.sin(t * 0.5 + phase) * 0.2 + 0.8);
          dummy.updateMatrix();
          dust.setMatrixAt(i, dummy.matrix);
        }
        dust.instanceMatrix.needsUpdate = true;
      },
      (mobile) => {
        if (mobile) {
          cat.group.scale.setScalar(1.0);
          cat.group.position.set(0.9, 0.08, -0.4);
          rug.scale.set(0.8, 1, 0.8);
        } else {
          cat.group.scale.setScalar(1.9);
          cat.group.position.set(1.2, 0.08, 0.04);
          rug.scale.set(1, 1, 1);
        }
      }
    );
  }

  function buildCloudBank(theme: Theme): SceneKit {
    const group = new THREE.Group();
    const env = makeEnvironment(theme, "cloud_bank");
    const cloudMat = new THREE.MeshStandardMaterial({
      color: mix(theme.colors.secondary, "#ffffff", 0.5),
      roughness: 1,
      metalness: 0,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: mix(theme.colors.primary, theme.colors.secondary, 0.36),
      roughness: 1,
      metalness: 0,
    });
    const clouds: { mesh: THREE.Mesh; phase: number; speed: number; base: THREE.Vector3 }[] = [];
    const basePuff = new THREE.SphereGeometry(1, 14, 10);

    for (let i = 0; i < 8; i += 1) {
      const count = 4 + Math.floor(Math.random() * 3);
      const parts: THREE.BufferGeometry[] = [];
      for (let p = 0; p < count; p += 1) {
        const puff = basePuff.clone();
        const size = 0.42 + Math.random() * 0.62;
        puff.scale(size, size * 0.72, size * 0.85);
        puff.translate((p - count / 2) * 0.44, Math.random() * 0.3, (Math.random() - 0.5) * 0.45);
        parts.push(puff);
      }
      const merged = mergeGeometries(parts, false);
      parts.forEach((part) => part.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, i % 3 === 0 ? darkMat : cloudMat);
      const base = new THREE.Vector3(
        (Math.random() - 0.5) * 7,
        0.8 + Math.random() * 2.4,
        -2.6 + Math.random() * 3.2
      );
      mesh.position.copy(base);
      mesh.scale.setScalar(0.72 + Math.random() * 0.75);
      group.add(mesh);
      clouds.push({ mesh, phase: Math.random() * Math.PI * 2, speed: 0.07 + Math.random() * 0.1, base });
    }
    basePuff.dispose();

    const puddle = new THREE.Mesh(
      new THREE.CircleGeometry(6, 32),
      new THREE.MeshStandardMaterial({
        color: mix(theme.colors.accent, theme.colors.ink, 0.32),
        roughness: 0.32,
        metalness: 0.12,
      })
    );
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.y = -0.02;
    group.add(puddle);

    const rainCount = 90;
    const rain = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.005, 0.005, 0.34, 3),
      new THREE.MeshBasicMaterial({
        color: mixStyle(theme.colors.secondary, "#ffffff", 0.55),
        transparent: true,
        opacity: 0.42,
      }),
      rainCount
    );
    const dummy = new THREE.Object3D();
    const rainSeeds: number[] = [];
    for (let i = 0; i < rainCount; i += 1) {
      rainSeeds.push(Math.random() * 8, Math.random() * 6, Math.random() * 2 - 1);
      dummy.position.set((Math.random() - 0.5) * 9, Math.random() * 6 - 0.5, (Math.random() - 0.5) * 5);
      dummy.rotation.x = 0.12;
      dummy.updateMatrix();
      rain.setMatrixAt(i, dummy.matrix);
    }
    group.add(rain);

    kitLights(group, theme, {
      keyColor: mixStyle(theme.colors.secondary, "#ffffff", 0.5),
      keyIntensity: 1.3,
      keyPos: [-3, 4, 4],
      ambient: 1.6,
      rimColor: mixStyle(theme.colors.highlight, "#ffe6c0", 0.5),
      rimIntensity: 30,
      rimPos: [4, 2.4, 2],
      shadow: false,
    });

    return finishKit(
      group,
      env,
      { pos: [0, 1.35, 6.4], target: [0, 1.4, 0], fov: 46 },
      { pos: [0, 1.6, 7.2], target: [0, 2.4, 0], fov: 50 },
      1.02,
      (t, _dt, isReduced) => {
        const motion = isReduced ? 0.2 : 1;
        clouds.forEach((cloud) => {
          cloud.mesh.position.x = cloud.base.x + Math.sin(t * cloud.speed + cloud.phase) * 0.55 * motion;
          cloud.mesh.position.y = cloud.base.y + Math.sin(t * cloud.speed * 0.7 + cloud.phase) * 0.16 * motion;
        });
        for (let i = 0; i < rainCount; i += 1) {
          const speed = 0.55 + rainSeeds[i * 3] * 0.18;
          const y = ((rainSeeds[i * 3 + 1] * 6 - t * speed) % 6 + 6) % 6 - 0.5;
          dummy.position.set(
            Math.sin(rainSeeds[i * 3] * 3.1) * 4.2,
            y,
            Math.cos(rainSeeds[i * 3 + 2] * 2.4) * 2.4
          );
          dummy.rotation.x = 0.12;
          dummy.updateMatrix();
          rain.setMatrixAt(i, dummy.matrix);
        }
        rain.instanceMatrix.needsUpdate = true;
      },
      () => undefined
    );
  }

  function buildChocolateFlatlay(theme: Theme): SceneKit {
    const group = new THREE.Group();
    const env = makeEnvironment(theme, "chocolate_flatlay");
    const chocolateMap = chocolateTexture(mixStyle(theme.colors.highlight, "#3a1e14", 0.35), theme.colors.highlight);
    const paper = paperTexture(theme.colors.paper, theme.colors.accent);

    const chocolateMat = new THREE.MeshPhysicalMaterial({
      color: mix(theme.colors.highlight, "#24120b", 0.38),
      roughness: 0.42,
      clearcoat: 0.55,
      clearcoatRoughness: 0.28,
      map: chocolateMap,
      sheen: 0.2,
    });
    const caramelMat = new THREE.MeshPhysicalMaterial({
      color: mix(theme.colors.accent, "#d9a441", 0.4),
      roughness: 0.3,
      clearcoat: 0.9,
      clearcoatRoughness: 0.14,
    });
    const purpleMat = new THREE.MeshPhysicalMaterial({
      color: theme.colors.primary,
      roughness: 0.58,
      clearcoat: 0.35,
      clearcoatRoughness: 0.3,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: mix(theme.colors.accent, "#ffe9a8", 0.2),
      metalness: 1,
      roughness: 0.24,
      envMapIntensity: 1.6,
    });
    const creamMat = new THREE.MeshPhysicalMaterial({
      color: mix(theme.colors.secondary, "#ffffff", 0.3),
      roughness: 0.8,
      sheen: 0.3,
    });

    const desk = roundedBox(9, 0.22, 6, 0.06, new THREE.MeshStandardMaterial({ map: paper, color: theme.colors.paper, roughness: 0.92 }));
    desk.position.y = -0.15;
    desk.receiveShadow = true;
    group.add(desk);

    function chocolateBar(x: number, z: number, rotation: number) {
      const bar = new THREE.Group();
      const slab = roundedBox(1.9, 0.22, 1.0, 0.06, chocolateMat);
      slab.castShadow = true;
      bar.add(slab);
      for (let row = 0; row < 2; row += 1) {
        for (let col = 0; col < 4; col += 1) {
          const piece = roundedBox(0.4, 0.06, 0.38, 0.035, chocolateMat);
          piece.position.set(-0.66 + col * 0.44, 0.14, -0.22 + row * 0.44);
          piece.castShadow = true;
          bar.add(piece);
        }
      }
      const band = roundedBox(0.52, 0.24, 1.02, 0.03, purpleMat);
      band.position.set(0, 0.02, 0);
      bar.add(band);
      const gold = roundedBox(0.56, 0.05, 1.04, 0.02, goldMat);
      gold.position.set(0, 0.15, 0);
      bar.add(gold);
      bar.position.set(x, 0.12, z);
      bar.rotation.y = rotation;
      return bar;
    }

    const bars = [chocolateBar(-2.1, -0.5, 0.12), chocolateBar(2.15, 0.3, -0.08), chocolateBar(0.1, -1.55, 0.32)];
    bars.forEach((bar) => group.add(bar));

    const starShape = new THREE.Shape();
    const points = 5;
    for (let i = 0; i < points * 2; i += 1) {
      const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      const radius = i % 2 === 0 ? 0.42 : 0.19;
      const px = Math.cos(angle) * radius;
      const py = Math.sin(angle) * radius;
      if (i === 0) starShape.moveTo(px, py);
      else starShape.lineTo(px, py);
    }
    starShape.closePath();
    const starGeo = new THREE.ExtrudeGeometry(starShape, { depth: 0.16, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 3 });
    const stars: THREE.Group[] = [];
    for (let i = 0; i < 4; i += 1) {
      const star = new THREE.Group();
      const base = new THREE.Mesh(starGeo, chocolateMat);
      base.rotation.x = -Math.PI / 2;
      base.castShadow = true;
      star.add(base);
      const caramel = new THREE.Mesh(starGeo, caramelMat);
      caramel.scale.setScalar(0.78);
      caramel.rotation.x = -Math.PI / 2;
      caramel.position.y = 0.17;
      star.add(caramel);
      const foil = roundedBox(0.8, 0.05, 0.55, 0.025, goldMat);
      foil.position.set(0.1, -0.06, 0.15);
      star.add(foil);
      star.position.set(-0.9 + i * 0.62, 0.2, 1.1 + (i % 2) * 0.32);
      star.rotation.y = -0.2 + i * 0.12;
      group.add(star);
      stars.push(star);
    }

    const wrapped = roundedBox(0.95, 0.32, 0.6, 0.06, purpleMat);
    wrapped.position.set(2.2, 0.22, 1.1);
    wrapped.rotation.y = -0.18;
    group.add(wrapped);
    const label = roundedBox(0.6, 0.2, 0.02, 0.01, creamMat);
    label.position.set(2.2, 0.23, 1.42);
    label.rotation.y = -0.18;
    group.add(label);

    const dust = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.012, 5, 4),
      new THREE.MeshBasicMaterial({ color: mixStyle(theme.colors.highlight, "#3a1e14", 0.4), transparent: true, opacity: 0.4 }),
      70
    );
    const dummy = new THREE.Object3D();
    const dustSeeds: number[] = [];
    for (let i = 0; i < 70; i += 1) {
      dustSeeds.push(Math.random() * Math.PI * 2, Math.random());
      dummy.position.set((Math.random() - 0.5) * 5, 0.3 + Math.random() * 1.4, (Math.random() - 0.5) * 3);
      dummy.updateMatrix();
      dust.setMatrixAt(i, dummy.matrix);
    }
    group.add(dust);

    kitLights(group, theme, {
      keyColor: mixStyle(theme.colors.secondary, "#fff4dc", 0.4),
      keyIntensity: 3.2,
      keyPos: [-3, 5, 2.5],
      ambient: 1.2,
      rimColor: mixStyle(theme.colors.accent, "#ffe7a8", 0.4),
      rimIntensity: 110,
      rimPos: [3.2, 3.8, -1.5],
      shadow: true,
    });

    return finishKit(
      group,
      env,
      { pos: [0, 4.6, 4.2], target: [0, 0.2, 0], fov: 34 },
      { pos: [0, 5.2, 5.4], target: [0, 1.1, 0], fov: 38 },
      1.14,
      (t, _dt, isReduced) => {
        const motion = isReduced ? 0.2 : 1;
        stars.forEach((star, i) => {
          star.rotation.y += 0.0008 * (i + 1) * motion;
          star.position.y = 0.2 + Math.sin(t * 0.5 + i) * 0.012 * motion;
        });
        for (let i = 0; i < 70; i += 1) {
          const phase = dustSeeds[i * 2];
          dummy.position.set(
            Math.sin(t * 0.12 + phase) * 2.4,
            0.3 + dustSeeds[i * 2 + 1] * 1.3 + Math.sin(t * 0.4 + phase) * 0.05,
            Math.cos(t * 0.1 + phase) * 1.6
          );
          dummy.updateMatrix();
          dust.setMatrixAt(i, dummy.matrix);
        }
        dust.instanceMatrix.needsUpdate = true;
      },
      () => undefined
    );
  }

  function buildStudioAccessories(theme: Theme): SceneKit {
    const group = new THREE.Group();
    const env = makeEnvironment(theme, "studio_accessories");
    const leather = leatherTexture(mixStyle(theme.colors.highlight, "#1a0e10", 0.25), theme.colors.ink);
    const paper = paperTexture(theme.colors.paper, theme.colors.accent);

    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 12),
      new THREE.MeshStandardMaterial({ color: mix(theme.colors.secondary, "#ffffff", 0.2), roughness: 1 })
    );
    backdrop.position.set(0, 3, -3.2);
    group.add(backdrop);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshStandardMaterial({ map: paper, color: theme.colors.paper, roughness: 0.9 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    group.add(floor);

    const leatherMat = new THREE.MeshPhysicalMaterial({
      color: theme.colors.highlight,
      roughness: 0.5,
      sheen: 0.7,
      sheenColor: mix(theme.colors.highlight, "#ffffff", 0.3),
      map: leather.map,
      bumpMap: leather.bump,
      bumpScale: 0.02,
      clearcoat: 0.25,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: theme.colors.accent,
      metalness: 1,
      roughness: 0.2,
      envMapIntensity: 1.8,
    });
    const creamMat = new THREE.MeshPhysicalMaterial({
      color: mix(theme.colors.paper, "#ffffff", 0.3),
      roughness: 0.35,
      clearcoat: 0.5,
      clearcoatRoughness: 0.2,
    });

    function pedestal(x: number, z: number, height: number) {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.82, height, 48), creamMat);
      base.position.set(x, height / 2, z);
      base.castShadow = true;
      base.receiveShadow = true;
      group.add(base);
      const shadow = blobShadow(1.9, 0.25);
      shadow.position.set(x, 0.02, z);
      group.add(shadow);
      return base;
    }

    pedestal(-1.9, -0.2, 0.9);
    pedestal(0, 0.25, 0.5);
    pedestal(1.9, -0.1, 0.72);

    const bag = new THREE.Group();
    const bagBody = roundedBox(1.25, 0.8, 0.45, 0.12, leatherMat);
    bagBody.castShadow = true;
    bag.add(bagBody);
    const flap = roundedBox(1.2, 0.3, 0.47, 0.1, leatherMat);
    flap.position.set(0, 0.34, 0.01);
    flap.castShadow = true;
    bag.add(flap);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.035, 12, 40, Math.PI), goldMat);
    handle.position.set(0, 0.48, 0);
    bag.add(handle);
    const clasp = roundedBox(0.16, 0.12, 0.06, 0.02, goldMat);
    clasp.position.set(0, 0.24, 0.24);
    bag.add(clasp);
    bag.position.set(-1.9, 1.35, -0.2);
    bag.rotation.y = 0.28;
    group.add(bag);

    function heel(x: number, z: number, rotation: number, lying: boolean) {
      const shoe = new THREE.Group();
      const sole = roundedBox(0.95, 0.08, 0.38, 0.04, leatherMat);
      sole.position.y = 0.22;
      sole.castShadow = true;
      shoe.add(sole);
      const toe = roundedBox(0.5, 0.2, 0.34, 0.09, leatherMat);
      toe.position.set(0.2, 0.3, 0);
      toe.castShadow = true;
      shoe.add(toe);
      const arch = roundedBox(0.32, 0.38, 0.3, 0.08, leatherMat);
      arch.position.set(-0.12, 0.38, 0);
      shoe.add(arch);
      const heelPost = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.055, 0.26, 14), goldMat);
      heelPost.position.set(-0.36, 0.13, 0);
      shoe.add(heelPost);
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.02, 8, 24, Math.PI), leatherMat);
      strap.position.set(-0.06, 0.56, 0);
      strap.rotation.x = Math.PI / 2;
      shoe.add(strap);
      shoe.position.set(x, 0.5, z);
      shoe.rotation.y = rotation;
      if (lying) {
        shoe.rotation.z = Math.PI / 2.15;
        shoe.position.y = 0.86;
      }
      return shoe;
    }
    const heel1 = heel(0, 0.2, -0.35, false);
    const heel2 = heel(0.35, 0.4, 0.2, true);
    group.add(heel1, heel2);

    const perfume = new THREE.Group();
    const glass = new THREE.MeshPhysicalMaterial({
      color: mix(theme.colors.paper, "#ffffff", 0.4),
      transmission: 0.9,
      thickness: 0.6,
      roughness: 0.06,
      ior: 1.45,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      transparent: true,
    });
    const bottle = roundedBox(0.42, 0.62, 0.24, 0.08, glass);
    bottle.castShadow = true;
    perfume.add(bottle);
    const liquid = roundedBox(0.36, 0.4, 0.2, 0.06, new THREE.MeshPhysicalMaterial({ color: mix(theme.colors.accent, "#c98a3a", 0.4), transmission: 0.35, roughness: 0.2, transparent: true, opacity: 0.85 }));
    liquid.position.y = -0.06;
    perfume.add(liquid);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.16, 24), goldMat);
    cap.position.y = 0.4;
    perfume.add(cap);
    const label = roundedBox(0.26, 0.18, 0.02, 0.01, creamMat);
    label.position.set(0, -0.02, 0.13);
    perfume.add(label);
    perfume.position.set(1.9, 1.08, -0.1);
    perfume.rotation.y = -0.2;
    group.add(perfume);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 10, 32), goldMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(1.9, 0.78, 0.35);
    group.add(ring);

    kitLights(group, theme, {
      keyColor: mixStyle(theme.colors.secondary, "#ffffff", 0.45),
      keyIntensity: 3,
      keyPos: [2.8, 5, 3.4],
      ambient: 1.1,
      rimColor: mixStyle(theme.colors.accent, "#ffe3a3", 0.4),
      rimIntensity: 120,
      rimPos: [-3.5, 3.2, -1.2],
      shadow: true,
    });

    return finishKit(
      group,
      env,
      { pos: [0, 2.0, 5.7], target: [0, 2.2, 0], fov: 31 },
      { pos: [0, 1.8, 6.6], target: [0, 2.0, 0], fov: 36 },
      1.1,
      (t, _dt, isReduced) => {
        const motion = isReduced ? 0.2 : 1;
        perfume.rotation.y = -0.2 + Math.sin(t * 0.25) * 0.06 * motion;
        bag.rotation.y = 0.28 + Math.sin(t * 0.18 + 1) * 0.04 * motion;
        ring.rotation.z += 0.002 * motion;
      },
      () => undefined
    );
  }

  function buildPiggyDesk(theme: Theme): SceneKit {
    const group = new THREE.Group();
    const env = makeEnvironment(theme, "piggy_desk");
    const wood = woodTexture(mixStyle(theme.colors.primary, "#3d271a", 0.25), mixStyle(theme.colors.primary, "#1f120a", 0.35));
    const paper = paperTexture(theme.colors.paper, theme.colors.highlight);

    const desk = roundedBox(9, 0.3, 6, 0.06, new THREE.MeshStandardMaterial({ map: wood, color: mix(theme.colors.primary, "#ffffff", 0.2), roughness: 0.75 }));
    desk.position.y = -0.2;
    desk.receiveShadow = true;
    group.add(desk);

    const piggyMat = new THREE.MeshPhysicalMaterial({
      color: mix(theme.colors.highlight, "#ffffff", 0.22),
      roughness: 0.34,
      clearcoat: 0.55,
      clearcoatRoughness: 0.25,
    });
    const piggyDark = new THREE.MeshPhysicalMaterial({
      color: mix(theme.colors.highlight, theme.colors.ink, 0.18),
      roughness: 0.42,
      clearcoat: 0.35,
    });
    const piggy = new THREE.Group();
    const body = sphere(0.62, piggyMat, 44);
    body.scale.set(1.1, 0.86, 0.86);
    body.position.y = 0.58;
    body.castShadow = true;
    piggy.add(body);
    const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.16, 32), piggyDark);
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, 0.58, 0.55);
    piggy.add(snout);
    for (const x of [-0.08, 0.08]) {
      const nostril = sphere(0.026, new THREE.MeshStandardMaterial({ color: mix(theme.colors.ink, "#000000", 0.2) }), 12);
      nostril.position.set(x, 0.58, 0.64);
      piggy.add(nostril);
    }
    for (const x of [-0.24, 0.24]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.24, 4), piggyDark);
      ear.position.set(x, 1.05, 0.08);
      ear.rotation.z = x > 0 ? -0.35 : 0.35;
      piggy.add(ear);
    }
    for (const x of [-0.32, 0.32]) {
      for (const z of [-0.2, 0.2]) {
        const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.12, 6, 12), piggyDark);
        leg.position.set(x, 0.16, z);
        piggy.add(leg);
      }
    }
    const slot = roundedBox(0.3, 0.04, 0.06, 0.02, new THREE.MeshStandardMaterial({ color: theme.colors.ink, roughness: 0.4 }));
    slot.position.set(0, 1.18, 0.02);
    piggy.add(slot);
    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 8, 20), piggyDark);
    tail.position.set(0.62, 0.64, -0.15);
    tail.rotation.y = Math.PI / 2;
    piggy.add(tail);
    piggy.position.set(-1.7, 0, 0.1);
    piggy.rotation.y = 0.3;
    group.add(piggy);
    const piggyShadow = blobShadow(2.4, 0.3);
    piggyShadow.position.set(-1.7, 0.02, 0.1);
    group.add(piggyShadow);

    const coinMat = new THREE.MeshStandardMaterial({
      color: mix(theme.colors.accent, "#f2c96a", 0.45),
      metalness: 1,
      roughness: 0.24,
      envMapIntensity: 1.4,
    });
    const coinMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 20), coinMat, 18);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 18; i += 1) {
      dummy.position.set(-1.7 + Math.random() * 2.8, 0.03 + (i % 4) * 0.025, 0.6 + Math.random() * 1.1);
      dummy.rotation.set(Math.random() * 0.2, Math.random() * Math.PI, Math.random() * 0.2);
      dummy.updateMatrix();
      coinMesh.setMatrixAt(i, dummy.matrix);
    }
    group.add(coinMesh);

    const lamp = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.08, 32), new THREE.MeshStandardMaterial({ color: theme.colors.ink, roughness: 0.35, metalness: 0.4 }));
    lamp.add(base);
    const armCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.04, 0),
      new THREE.Vector3(0.25, 0.55, -0.05),
      new THREE.Vector3(0.1, 1.05, 0.18),
    ]);
    const arm = new THREE.Mesh(new THREE.TubeGeometry(armCurve, 20, 0.022, 8, false), new THREE.MeshStandardMaterial({ color: theme.colors.ink, roughness: 0.3, metalness: 0.5 }));
    lamp.add(arm);
    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(0.26, 0.28, 32, 1, true),
      new THREE.MeshPhysicalMaterial({ color: mix(theme.colors.highlight, "#fff1cf", 0.5), roughness: 0.6, side: THREE.DoubleSide, emissive: mix(theme.colors.highlight, "#ffdca0", 0.4), emissiveIntensity: 0.35 })
    );
    shade.position.set(0.1, 1.16, 0.18);
    shade.rotation.x = 0.5;
    lamp.add(shade);
    const bulb = new THREE.PointLight(mixStyle(theme.colors.accent, "#ffd9a0", 0.4), 12, 4, 2);
    bulb.position.set(0.1, 1.08, 0.2);
    lamp.add(bulb);
    lamp.position.set(1.9, 0.02, -0.7);
    lamp.rotation.y = -0.5;
    group.add(lamp);

    const ledger = roundedBox(1.1, 0.04, 0.7, 0.02, new THREE.MeshStandardMaterial({ map: paper, color: theme.colors.paper, roughness: 0.95 }));
    ledger.position.set(-2.1, 0.02, 1.0);
    ledger.rotation.y = -0.25;
    group.add(ledger);

    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.24, 24), new THREE.MeshStandardMaterial({ color: theme.colors.accent, roughness: 0.8 }));
    pot.position.set(2.3, 0.12, 0.9);
    group.add(pot);
    for (let i = 0; i < 5; i += 1) {
      const leaf = sphere(0.1, new THREE.MeshStandardMaterial({ color: mix(theme.colors.accent, "#5d7a58", 0.4), roughness: 0.9 }), 16);
      leaf.scale.set(0.5, 1.2, 0.3);
      leaf.position.set(2.3 + (i - 2) * 0.08, 0.32 + Math.random() * 0.1, 0.9 + (i % 2) * 0.06);
      leaf.rotation.z = (i - 2) * 0.3;
      group.add(leaf);
    }

    kitLights(group, theme, {
      keyColor: mixStyle(theme.colors.secondary, "#fff0d6", 0.4),
      keyIntensity: 2.2,
      keyPos: [-2, 4, 3],
      ambient: 1.15,
      rimColor: mixStyle(theme.colors.highlight, "#ffd9a0", 0.4),
      rimIntensity: 65,
      rimPos: [3, 2.6, 1],
      shadow: true,
    });

    return finishKit(
      group,
      env,
      { pos: [0.9, 1.3, 5], target: [0.2, 0.7, 0], fov: 36 },
      { pos: [0.8, 1.9, 5.6], target: [0.2, 1.8, 0], fov: 40 },
      1.08,
      (t, _dt, isReduced) => {
        const motion = isReduced ? 0.2 : 1;
        piggy.position.y = Math.sin(t * 1.1) * 0.012 * motion;
        piggy.rotation.z = Math.sin(t * 0.45) * 0.01 * motion;
        bulb.intensity = 12 + Math.sin(t * 2.8) * 0.4 * motion;
      },
      (mobile) => {
        piggy.position.x = mobile ? -0.8 : -1.7;
        piggyShadow.position.x = mobile ? -0.8 : -1.7;
      }
    );
  }

  function buildYarnCorner(theme: Theme): SceneKit {
    const group = new THREE.Group();
    const env = makeEnvironment(theme, "yarn_corner");
    const woolRose = woolTexture(mixStyle(theme.colors.primary, "#ffffff", 0.2), theme.colors.highlight);
    const woolCream = woolTexture(mixStyle(theme.colors.secondary, "#ffffff", 0.4), theme.colors.primary);
    const knit = knitTexture(mixStyle(theme.colors.secondary, "#ffffff", 0.3), theme.colors.primary);
    const wood = woodTexture(mixStyle(theme.colors.highlight, "#8a5a37", 0.4), mixStyle(theme.colors.highlight, "#3a2112", 0.4));

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(22, 18), new THREE.MeshStandardMaterial({ map: wood, color: mix(theme.colors.highlight, "#ffffff", 0.25), roughness: 0.82 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    group.add(floor);

    const wall = new THREE.Mesh(new THREE.PlaneGeometry(20, 10), new THREE.MeshStandardMaterial({ color: mix(theme.colors.secondary, "#ffffff", 0.25), roughness: 1 }));
    wall.position.set(0, 4.5, -3.4);
    group.add(wall);

    const windowLight = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.8), new THREE.MeshBasicMaterial({ color: mixStyle(theme.colors.secondary, "#fff7e5", 0.5) }));
    windowLight.position.set(-3.2, 2.8, -3.3);
    group.add(windowLight);

    const blanket = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 4.2, 30, 24), new THREE.MeshPhysicalMaterial({ map: knit.map, bumpMap: knit.bump, bumpScale: 0.04, color: mix(theme.colors.secondary, "#ffffff", 0.15), roughness: 1, sheen: 1, sheenColor: mix(theme.colors.primary, "#ffffff", 0.4) }));
    blanket.rotation.x = -Math.PI / 2;
    blanket.position.set(0.2, 0.015, 0.4);
    const position = blanket.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const y = position.getY(i);
      position.setZ(i, Math.sin(x * 1.2) * 0.03 + Math.cos(y * 1.6) * 0.025);
    }
    position.needsUpdate = true;
    blanket.geometry.computeVertexNormals();
    blanket.receiveShadow = true;
    group.add(blanket);

    const yarnColors = [
      mixStyle(theme.colors.primary, "#ffffff", 0.14),
      mixStyle(theme.colors.accent, "#ffffff", 0.18),
      mixStyle(theme.colors.highlight, "#ffffff", 0.22),
      mixStyle(theme.colors.secondary, "#ffffff", 0.35),
    ];
    const yarnBalls: THREE.Mesh[] = [];
    yarnColors.forEach((color, index) => {
      const ball = sphere(0.36 + index * 0.04, new THREE.MeshPhysicalMaterial({ color, map: woolRose.map, bumpMap: woolRose.bump, bumpScale: 0.04, roughness: 1, sheen: 1, sheenColor: mix(color, "#ffffff", 0.3) }), 40);
      ball.position.set(-1.6 + index * 0.62, 0.34 + index * 0.04, -0.6 + (index % 2) * 0.35);
      ball.castShadow = true;
      group.add(ball);
      yarnBalls.push(ball);
      const thread = new THREE.Mesh(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3([
            new THREE.Vector3(ball.position.x + 0.2, 0.32, ball.position.z + 0.1),
            new THREE.Vector3(ball.position.x + 0.55, 0.12, ball.position.z + 0.3),
            new THREE.Vector3(ball.position.x + 0.8, 0.04, ball.position.z + 0.1),
          ]),
          20,
          0.022,
          7,
          false
        ),
        new THREE.MeshStandardMaterial({ color, roughness: 0.95 })
      );
      group.add(thread);
    });

    const hook = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.15, 16), new THREE.MeshPhysicalMaterial({ color: mix(theme.colors.highlight, "#b47b4e", 0.3), roughness: 0.5, clearcoat: 0.4 }));
    handle.rotation.z = Math.PI / 2.6;
    hook.add(handle);
    const hookHead = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.028, 8, 20, Math.PI * 1.35), new THREE.MeshStandardMaterial({ color: mix(theme.colors.highlight, "#d1a06a", 0.3), roughness: 0.35, metalness: 0.25 }));
    hookHead.position.set(0.47, 0.3, 0);
    hookHead.rotation.z = 0.4;
    hook.add(hookHead);
    hook.position.set(1.3, 0.08, 0.6);
    hook.rotation.y = -0.2;
    group.add(hook);

    for (let i = 0; i < 4; i += 1) {
      const square = roundedBox(0.5, 0.04, 0.5, 0.02, new THREE.MeshPhysicalMaterial({ map: knit.map, bumpMap: knit.bump, bumpScale: 0.03, color: i % 2 === 0 ? mix(theme.colors.primary, "#ffffff", 0.3) : mix(theme.colors.accent, "#ffffff", 0.3), roughness: 1, sheen: 0.8 }));
      square.position.set(1.9 + (i % 2) * 0.5, 0.05 + i * 0.045, -0.3 + Math.floor(i / 2) * 0.45);
      square.rotation.y = i * 0.35;
      group.add(square);
    }

    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.55, 0.55, 40, 1, true), new THREE.MeshPhysicalMaterial({ map: knit.map, color: mix(theme.colors.primary, "#ffffff", 0.2), roughness: 1, side: THREE.DoubleSide, sheen: 0.6 }));
    basket.position.set(-1.1, 0.28, 0.7);
    group.add(basket);

    const cat = createCat(theme, mixStyle(theme.colors.accent, theme.colors.secondary, 0.45), woolCream, true);
    cat.group.position.set(1.0, 0.08, 0.2);
    cat.group.rotation.y = -0.45;
    cat.group.scale.setScalar(0.82);
    group.add(cat.group);
    const yarnCatShadow = blobShadow(2.2, 0.25);
    yarnCatShadow.position.set(1.0, 0.02, 0.2);
    group.add(yarnCatShadow);

    const blink = addBlink(cat, { at: 2 });

    kitLights(group, theme, {
      keyColor: mixStyle(theme.colors.secondary, "#fff2d8", 0.45),
      keyIntensity: 2.2,
      keyPos: [-4, 4, 3],
      ambient: 1.4,
      rimColor: mixStyle(theme.colors.highlight, "#ffd7a0", 0.35),
      rimIntensity: 55,
      rimPos: [3, 3, 1.5],
      shadow: true,
    });

    return finishKit(
      group,
      env,
      { pos: [0, 1.35, 5.3], target: [0.1, 0.75, 0], fov: 40 },
      { pos: [0, 1.8, 5.9], target: [0.1, 1.8, 0], fov: 43 },
      1.08,
      (t, _dt, isReduced) => {
        updateBlink(blink, t);
        const motion = isReduced ? 0.2 : 1;
        yarnBalls.forEach((ball, i) => {
          ball.rotation.y += 0.0015 * (i + 1) * motion;
          ball.position.y += Math.sin(t * 1.2 + i) * 0.0015 * motion;
        });
        cat.head.rotation.z = Math.sin(t * 0.6) * 0.08 * motion;
        cat.head.rotation.y = Math.sin(t * 0.4) * 0.12 * motion;
        cat.tail.rotation.z = Math.sin(t * 1.3) * 0.2 * motion;
      },
      (mobile) => {
        cat.group.position.set(mobile ? 1.0 : 1.75, 0.08, 0.2);
        yarnCatShadow.position.x = mobile ? 1.0 : 1.75;
      }
    );
  }

  function buildRugPlay(theme: Theme): SceneKit {
    const group = new THREE.Group();
    const env = makeEnvironment(theme, "rug_play");
    const knit = knitTexture(mixStyle(theme.colors.secondary, "#ffffff", 0.35), theme.colors.primary);
    const wood = woodTexture(mixStyle(theme.colors.paper, "#b98350", 0.22), mixStyle(theme.colors.paper, "#6b4a32", 0.28));
    const furBump = woolTexture(mixStyle(theme.colors.primary, "#ffffff", 0.25), theme.colors.highlight);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 20), new THREE.MeshStandardMaterial({ map: wood, color: mix(theme.colors.highlight, "#ffffff", 0.25), roughness: 0.8 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    group.add(floor);

    const rug = roundedBox(6.4, 0.08, 4.4, 0.04, new THREE.MeshPhysicalMaterial({ map: knit.map, bumpMap: knit.bump, bumpScale: 0.035, color: mix(theme.colors.primary, theme.colors.secondary, 0.55), roughness: 1, sheen: 0.8 }));
    rug.position.set(0, 0.05, 0.2);
    rug.receiveShadow = true;
    group.add(rug);

    const cat = createCat(theme, mixStyle(theme.colors.primary, "#ffffff", 0.3), furBump);
    cat.group.position.set(-1.35, 0.1, 0.1);
    cat.group.rotation.y = 0.3;
    cat.group.scale.setScalar(0.95);
    group.add(cat.group);

    const dog = createDog(theme, mixStyle(theme.colors.accent, "#ffffff", 0.42), furBump);
    dog.group.position.set(1.25, 0.1, 0.2);
    dog.group.rotation.y = -0.3;
    dog.group.scale.setScalar(0.9);
    group.add(dog.group);

    const catShadow = blobShadow(2.2, 0.28);
    catShadow.position.set(-1.35, 0.09, 0.1);
    group.add(catShadow);
    const dogShadow = blobShadow(2.2, 0.28);
    dogShadow.position.set(1.25, 0.09, 0.2);
    group.add(dogShadow);

    const toy = new THREE.Group();
    const ball = sphere(0.16, new THREE.MeshPhysicalMaterial({ color: mix(theme.colors.highlight, "#ffffff", 0.2), roughness: 0.5, clearcoat: 0.4 }), 24);
    ball.position.y = 0.16;
    toy.add(ball);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.035, 8, 24), new THREE.MeshStandardMaterial({ color: theme.colors.accent, roughness: 0.5 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.18;
    toy.add(ring);
    toy.position.set(0.1, 0.1, 1.2);
    group.add(toy);

    for (let i = 0; i < 3; i += 1) {
      const plant = new THREE.Group();
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.28, 20), new THREE.MeshStandardMaterial({ color: mix(theme.colors.accent, "#5d7a58", 0.25), roughness: 0.9 }));
      pot.position.y = 0.14;
      plant.add(pot);
      for (let l = 0; l < 5; l += 1) {
        const leaf = sphere(0.12, new THREE.MeshStandardMaterial({ color: mix(theme.colors.accent, "#4f6b4b", 0.35), roughness: 0.9 }), 16);
        leaf.scale.set(0.5, 1.3, 0.35);
        leaf.position.set((l - 2) * 0.08, 0.36 + Math.random() * 0.08, (l % 2) * 0.06);
        leaf.rotation.z = (l - 2) * 0.3;
        plant.add(leaf);
      }
      plant.position.set(-2.8 + i * 2.8, 0, -1.8 - i * 0.2);
      group.add(plant);
    }

    const blinkCat = addBlink(cat, { at: 2 });
    const blinkDog = addBlink(dog, { at: 3 });

    kitLights(group, theme, {
      keyColor: mixStyle(theme.colors.secondary, "#fff1d4", 0.4),
      keyIntensity: 2.3,
      keyPos: [-3, 4, 3.5],
      ambient: 1.35,
      rimColor: mixStyle(theme.colors.accent, "#ffe3a0", 0.35),
      rimIntensity: 55,
      rimPos: [3.5, 2.4, 1.5],
      shadow: true,
    });

    return finishKit(
      group,
      env,
      { pos: [0, 0.95, 5.8], target: [0, 0.5, 0], fov: 44 },
      { pos: [0, 1.5, 6.4], target: [0, 1.4, 0], fov: 46 },
      1.08,
      (t, _dt, isReduced) => {
        updateBlink(blinkCat, t);
        updateBlink(blinkDog, t + 1.7);
        const motion = isReduced ? 0.2 : 1;
        cat.head.rotation.z = Math.sin(t * 0.5) * 0.06 * motion;
        cat.tail.rotation.z = Math.sin(t * 1.4) * 0.22 * motion;
        dog.head.rotation.z = Math.sin(t * 0.45 + 1) * 0.05 * motion;
        dog.tail.rotation.z = Math.sin(t * 2.1) * 0.3 * motion;
        cat.body.scale.y = 0.9 + Math.sin(t * 1.1) * 0.01 * motion;
        dog.body.scale.y = 0.9 + Math.sin(t * 1.3 + 1) * 0.01 * motion;
        toy.rotation.y += 0.002 * motion;
        toy.position.y = 0.1 + Math.abs(Math.sin(t * 1.2)) * 0.015 * motion;
      },
      (mobile) => {
        cat.group.position.set(mobile ? -1.25 : -2.35, 0.1, 0.1);
        dog.group.position.set(mobile ? 1.25 : 2.35, 0.1, 0.2);
        catShadow.position.x = mobile ? -1.25 : -2.35;
        dogShadow.position.x = mobile ? 1.25 : 2.35;
      }
    );
  }

  function buildKit(theme: Theme): SceneKit {
    switch (theme.scene) {
      case "kitten_close":
        return buildKittenClose(theme);
      case "cloud_bank":
        return buildCloudBank(theme);
      case "chocolate_flatlay":
        return buildChocolateFlatlay(theme);
      case "studio_accessories":
        return buildStudioAccessories(theme);
      case "piggy_desk":
        return buildPiggyDesk(theme);
      case "yarn_corner":
        return buildYarnCorner(theme);
      case "rug_play":
      default:
        return buildRugPlay(theme);
    }
  }

  function applyCamera(preset: CameraPreset) {
    camera.fov = preset.fov;
    camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.updateProjectionMatrix();
    baseCamera.set(...preset.pos);
    targetCamera.set(...preset.target);
    camera.position.copy(baseCamera);
    camera.lookAt(targetCamera);
    parallaxX(baseCamera.x);
    parallaxY(baseCamera.y);
  }

  function setTheme(theme: Theme, isReduced: boolean) {
    reduced = isReduced;
    currentTheme = theme;
    if (!current) {
      let kit = cache.get(theme.scene);
      if (!kit) {
        kit = buildKit(theme);
        cache.set(theme.scene, kit);
        cacheOrder.push(theme.scene);
      }
      current = kit;
      scene.add(kit.group);
      scene.environment = kit.env;
      renderer.toneMappingExposure = kit.exposure;
      const preset = kit.layout(isMobile());
      applyCamera(preset);
      kit.group.scale.setScalar(0.001);
      gsap.to(kit.group.scale, { x: 1, y: 1, z: 1, duration: reduced ? 0.4 : 1.25, ease: "power3.out" });
      return;
    }

    const previous = current;
    let kit = cache.get(theme.scene);
    if (!kit) {
      kit = buildKit(theme);
      cache.set(theme.scene, kit);
      cacheOrder.push(theme.scene);
    }
    current = kit;
    scene.remove(previous.group);
    scene.add(kit.group);
    scene.environment = kit.env;
    renderer.toneMappingExposure = kit.exposure;
    const preset = kit.layout(isMobile());
    applyCamera(preset);
    kit.group.scale.setScalar(0.001);
    gsap.to(kit.group.scale, { x: 1, y: 1, z: 1, duration: reduced ? 0.35 : 1.05, ease: "power3.out" });
    previous.group.scale.setScalar(1);

    while (cacheOrder.length > KIT_CACHE_LIMIT) {
      const oldest = cacheOrder.find((sceneKey) => sceneKey !== currentTheme?.scene);
      if (!oldest) break;
      const evicted = cache.get(oldest);
      if (evicted) {
        scene.remove(evicted.group);
        evicted.dispose();
        evicted.env.dispose();
        cache.delete(oldest);
      }
      cacheOrder.splice(cacheOrder.indexOf(oldest), 1);
    }
  }

  function onResize() {
    renderer.setPixelRatio(dpr());
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.updateProjectionMatrix();
    if (current) {
      const preset = current.layout(isMobile());
      applyCamera(preset);
    }
  }

  function onPointerMove(event: PointerEvent) {
    if (reduced) return;
    pointerX = event.clientX / window.innerWidth;
    pointerY = event.clientY / window.innerHeight;
    const strength = currentTheme?.scene === "chocolate_flatlay" ? 0.16 : 0.3;
    parallaxX(baseCamera.x + (pointerX - 0.5) * strength);
    parallaxY(baseCamera.y - (pointerY - 0.5) * strength * 0.55);
  }

  let lastTime = 0;
  function tick(time: number) {
    if (disposed || document.hidden || !current) return;
    const t = time;
    const dt = lastTime === 0 ? 0.016 : Math.min(0.05, t - lastTime);
    lastTime = t;
    camera.lookAt(targetCamera);
    current.update(t, dt, reduced);
    renderer.render(scene, camera);
  }

  function onVisibilityChange() {
    if (!document.hidden) {
      lastTime = 0;
      gsap.ticker.wake();
    }
  }

  gsap.ticker.add(tick);
  window.addEventListener("resize", onResize);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  document.addEventListener("visibilitychange", onVisibilityChange);

  return {
    setTheme,
    setReduced(isReduced: boolean) {
      reduced = isReduced;
    },
    dispose() {
      disposed = true;
      gsap.ticker.remove(tick);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      cache.forEach((kit) => {
        scene.remove(kit.group);
        kit.dispose();
        kit.env.dispose();
      });
      cache.clear();
      renderer.dispose();
      shadowTexture.dispose();
    },
  };
}
