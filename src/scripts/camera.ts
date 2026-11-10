import { gsap } from "gsap";
import { printKeepsake } from "./print";
import type { GameCue } from "./minigames";

interface CameraContext {
  content: Record<string, unknown>;
  stream: MediaStream | null;
  reduced: boolean;
  complete: () => void;
  whisper: (text: string) => void;
  cue: (kind: GameCue) => void;
  printCaption?: string;
  printSignature?: string;
}

const SELFIE_KEY = "pocket-mood.selfie.v1";

function str(content: Record<string, unknown>, key: string, fallback = ""): string {
  const value = content[key];
  return typeof value === "string" ? value : fallback;
}

/**
 * Catch the camera. The custom permission card already ran. The still is
 * captured only when she catches the target, never on a timer.
 */
export function mountCameraGame(container: HTMLElement, ctx: CameraContext): () => void {
  if (!ctx.stream) throw new Error("No camera stream");
  let alive = true;
  let capturing = false;
  let done = false;
  let captured = "";
  let drift: gsap.core.Tween | null = null;

  const root = document.createElement("div");
  root.className = "interaction mg-camera mg-camera--catch";
  root.innerHTML = `
    <p class="interaction__prompt">${str(ctx.content, "prompt", "catch the little camera. it is quicker than you think.")}</p>
    <div class="catch-stage mg-camera__catch">
      <button type="button" class="catch-target mg-camera__target" aria-label="catch the camera and take a photo">
        <i class="fa-solid fa-camera-retro" aria-hidden="true"></i>
      </button>
    </div>
    <p class="mg-camera__privacy">camera is on. nothing is saved until you catch it.</p>
    <button type="button" class="soft-btn mg-camera__away">put the camera away</button>
    <div class="mg-camera__result" hidden>
      <div class="mg-camera__polaroid"><img data-selfie-img alt="the photo you just took"></div>
      <p class="mg-camera__note">${str(ctx.content, "note", "look at you.")}</p>
      <p class="mg-camera__promise">this stays on your phone, I promise.</p>
      <div class="mg-camera__actions">
        <button type="button" class="soft-btn mg-camera__keep"><i class="fa-solid fa-bookmark" aria-hidden="true"></i><span>keep me</span></button>
        <button type="button" class="soft-btn mg-camera__delete" aria-label="delete this photo"><i class="fa-solid fa-trash-can" aria-hidden="true"></i><span>delete</span></button>
      </div>
    </div>`;
  const video = document.createElement("video");
  video.className = "mg-camera__video";
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.srcObject = ctx.stream;
  container.append(root);

  const stage = root.querySelector<HTMLElement>(".mg-camera__catch");
  const target = root.querySelector<HTMLButtonElement>(".mg-camera__target");
  const away = root.querySelector<HTMLButtonElement>(".mg-camera__away");
  const result = root.querySelector<HTMLElement>(".mg-camera__result");
  const image = root.querySelector<HTMLImageElement>("[data-selfie-img]");
  const note = root.querySelector<HTMLElement>(".mg-camera__note");
  if (!stage || !target || !away || !result || !image || !note) throw new Error("Camera UI failed");
  stage.append(video);
  void video.play().catch(() => undefined);

  const stopStream = () => ctx.stream?.getTracks().forEach((track) => track.stop());

  const driftTarget = () => {
    if (!alive || capturing) return;
    const rect = stage.getBoundingClientRect();
    const maxX = Math.max(12, (rect.width - 84) / 2);
    const maxY = Math.max(10, (rect.height - 84) / 2);
    drift = gsap.to(target, {
      x: gsap.utils.random(-maxX, maxX),
      y: gsap.utils.random(-maxY, maxY),
      rotate: gsap.utils.random(-8, 8),
      duration: ctx.reduced ? 2.6 : gsap.utils.random(1.2, 2.0),
      ease: "sine.inOut",
      onComplete: driftTarget,
    });
  };

  const capture = async () => {
    if (!alive || capturing || done) return;
    capturing = true;
    drift?.kill();
    target.classList.add("is-caught");
    stage.classList.add("is-caught");
    try { await video.play(); } catch { /* the stream may already have a frame */ }
    if (video.videoWidth === 0 || video.readyState < 2) {
      await new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, 1200);
        const ready = () => {
          window.clearTimeout(timer);
          resolve();
        };
        video.addEventListener("loadeddata", ready, { once: true });
        video.addEventListener("playing", ready, { once: true });
      });
    }
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) {
      capturing = false;
      target.classList.remove("is-caught");
      stage.classList.remove("is-caught");
      ctx.cue("miss");
      ctx.whisper("the camera blinked. catch it again.");
      driftTarget();
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      capturing = false;
      return;
    }
    context.translate(width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, width, height);
    captured = canvas.toDataURL("image/jpeg", 0.86);
    stopStream();
    image.src = captured;
    result.hidden = false;
    root.querySelector<HTMLElement>(".mg-camera__privacy")?.setAttribute("hidden", "");
    away.hidden = true;
    target.disabled = true;
    video.remove();
    ctx.cue("success");
    ctx.whisper(str(ctx.content, "note", "there you are."));
    gsap.fromTo(result, { opacity: 0, y: 14, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "back.out(1.3)" });
    capturing = false;
  };

  const finish = (kept: boolean) => {
    if (done) return;
    done = true;
    stopStream();
    if (kept && captured) {
      try { localStorage.setItem(SELFIE_KEY, captured); } catch { /* ignore */ }
      printKeepsake(captured, ctx.printCaption ?? str(ctx.content, "caption", "kept on {date}"), ctx.printSignature ?? "pocket mood");
      note.textContent = "kept on this phone only.";
    } else {
      try { localStorage.removeItem(SELFIE_KEY); } catch { /* ignore */ }
      image.removeAttribute("src");
      note.textContent = "gone. I never saw a thing.";
    }
    gsap.to(root, { opacity: 0, y: -8, duration: 0.4, ease: "power2.in" });
    window.setTimeout(() => { if (alive) ctx.complete(); }, 700);
  };

  const putAway = () => {
    if (done) return;
    done = true;
    drift?.kill();
    stopStream();
    ctx.whisper("camera away. no photo.");
    gsap.to(root, { opacity: 0, duration: 0.3, ease: "power2.in" });
    window.setTimeout(() => { if (alive) ctx.complete(); }, 350);
  };

  target.addEventListener("click", () => void capture());
  target.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    void capture();
  });
  away.addEventListener("click", putAway);
  root.querySelector<HTMLButtonElement>(".mg-camera__keep")?.addEventListener("click", () => finish(true), { once: true });
  root.querySelector<HTMLButtonElement>(".mg-camera__delete")?.addEventListener("click", () => finish(false), { once: true });

  gsap.fromTo(root, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" });
  driftTarget();

  return () => {
    alive = false;
    done = true;
    drift?.kill();
    stopStream();
    gsap.killTweensOf([root, target, result, image]);
  };
}
