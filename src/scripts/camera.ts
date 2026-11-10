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

export function mountCameraGame(container: HTMLElement, ctx: CameraContext): () => void {
  if (!ctx.stream) throw new Error("No camera stream");
  let alive = true;
  let done = false;
  let captured = "";
  const root = document.createElement("div");
  root.className = "interaction mg-camera";
  root.innerHTML = `
    <p class="interaction__prompt">${str(ctx.content, "prompt", "a small countdown. be yourself.")}</p>
    <div class="mg-camera__frame">
      <video class="mg-camera__video" autoplay muted playsinline></video>
      <span class="mg-camera__count">3</span>
      <span class="mg-camera__flash" aria-hidden="true"></span>
    </div>
    <p class="mg-camera__privacy">this stays on your phone, I promise.</p>
    <div class="mg-camera__result" hidden>
      <div class="mg-camera__polaroid"><img data-selfie-img alt="the photo you just took"></div>
      <p class="mg-camera__note">${str(ctx.content, "note", "look at you.")}</p>
      <p class="mg-camera__promise">this stays on your phone, I promise.</p>
      <div class="mg-camera__actions">
        <button type="button" class="soft-btn mg-camera__keep"><i class="fa-solid fa-bookmark" aria-hidden="true"></i><span>keep me</span></button>
        <button type="button" class="soft-btn mg-camera__delete" aria-label="delete this photo"><i class="fa-solid fa-trash-can" aria-hidden="true"></i><span>delete</span></button>
      </div>
    </div>`;
  container.append(root);
  const video = root.querySelector<HTMLVideoElement>(".mg-camera__video");
  const count = root.querySelector<HTMLElement>(".mg-camera__count");
  const flash = root.querySelector<HTMLElement>(".mg-camera__flash");
  const result = root.querySelector<HTMLElement>(".mg-camera__result");
  const image = root.querySelector<HTMLImageElement>("[data-selfie-img]");
  const note = root.querySelector<HTMLElement>(".mg-camera__note");
  if (!video || !count || !result || !image || !note) throw new Error("Camera UI failed");
  video.srcObject = ctx.stream;
  void video.play().catch(() => undefined);

  const stopStream = () => {
    ctx.stream?.getTracks().forEach((track) => track.stop());
  };

  const capture = () => {
    if (!alive || done) return;
    const width = video.videoWidth || 720;
    const height = video.videoHeight || 960;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.translate(width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, width, height);
    captured = canvas.toDataURL("image/jpeg", 0.86);
    stopStream();
    video.remove();
    image.src = captured;
    result.hidden = false;
    root.querySelector<HTMLElement>(".mg-camera__frame")?.classList.add("is-captured");
    ctx.cue("success");
    ctx.whisper(str(ctx.content, "note", "there you are."));
    gsap.fromTo(result, { opacity: 0, y: 14, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: "back.out(1.3)" });
    gsap.fromTo(image, { scale: 1.04 }, { scale: 1, duration: 0.7, ease: "power2.out" });
  };

  const countdown = () => {
    const steps = ctx.reduced ? ["1"] : ["3", "2", "1"];
    let index = 0;
    const next = () => {
      if (!alive || done) return;
      if (index >= steps.length) {
        capture();
        return;
      }
      count.textContent = steps[index];
      count.classList.remove("is-ticking");
      void count.offsetWidth;
      count.classList.add("is-ticking");
      gsap.fromTo(count, { scale: 1.35, opacity: 0.3 }, { scale: 1, opacity: 1, duration: 0.32, ease: "power2.out" });
      index += 1;
      window.setTimeout(next, ctx.reduced ? 350 : 850);
    };
    next();
  };

  const finish = (kept: boolean) => {
    if (done) return;
    done = true;
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

  root.querySelector<HTMLButtonElement>(".mg-camera__keep")?.addEventListener("click", () => finish(true), { once: true });
  root.querySelector<HTMLButtonElement>(".mg-camera__delete")?.addEventListener("click", () => finish(false), { once: true });

  gsap.fromTo(root, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" });
  gsap.set(flash, { opacity: 0 });
  window.setTimeout(() => {
    if (!alive) return;
    countdown();
    gsap.to(flash, { opacity: 0.85, duration: 0.06, delay: ctx.reduced ? 0.35 : 2.65, yoyo: true, repeat: 1 });
  }, 450);

  return () => {
    alive = false;
    stopStream();
    gsap.killTweensOf([root, count, flash, image]);
  };
}
