import type { DeviceSupport, MinigameConfig } from "../lib/types";

export interface DeviceCaps {
  touch: boolean;
  hover: boolean;
  mouse: boolean;
  gyro: boolean;
  accel: boolean;
  camera: boolean;
  mic: boolean;
  keyboard: boolean;
}

export function detectCaps(): DeviceCaps {
  const touch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const hover = window.matchMedia("(hover: hover)").matches;
  const fine = window.matchMedia("(pointer: fine)").matches;
  const orientation = "DeviceOrientationEvent" in window;
  const motion = "DeviceMotionEvent" in window;
  const gyro = ("Gyroscope" in window) || orientation;
  const accel = ("Accelerometer" in window) || motion;
  const media = Boolean(navigator.mediaDevices?.getUserMedia);
  return {
    touch,
    hover,
    mouse: fine || !touch,
    gyro,
    accel,
    camera: media,
    mic: media,
    keyboard: !touch || fine,
  };
}

export function capFor(support: DeviceSupport, caps: DeviceCaps): boolean {
  switch (support) {
    case "touch": return caps.touch;
    case "mouse": return caps.mouse;
    case "sensor_gyro": return caps.gyro;
    case "sensor_accel": return caps.accel;
    case "camera": return caps.camera;
    case "mic": return caps.mic;
    case "keyboard": return caps.keyboard;
    default: return false;
  }
}

export function supportsGame(game: MinigameConfig, caps: DeviceCaps): boolean {
  if (game.permissions.includes("camera") && !caps.camera) return false;
  if (game.permissions.includes("mic") && !caps.mic) return false;
  if (!game.device_support.length) return true;
  return game.device_support.some((support) => capFor(support, caps));
}

export function isTouchFirst(caps: DeviceCaps): boolean {
  return caps.touch && !caps.hover;
}

export function permissionFor(game: MinigameConfig, caps: DeviceCaps): "camera" | "mic" | "motion" | null {
  if (game.permissions.includes("camera")) return caps.camera ? "camera" : null;
  if (game.permissions.includes("mic")) return caps.mic ? "mic" : null;
  if (game.permissions.includes("motion")) {
    if (isTouchFirst(caps) && (caps.gyro || caps.accel)) return "motion";
    return null;
  }
  return null;
}
