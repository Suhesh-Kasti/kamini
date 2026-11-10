const PRINT_SHEET_CLASS = "print-keepsake";

export function formatCaption(template: string): string {
  const date = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  return template.replace("{date}", date);
}

export function printKeepsake(src: string, caption: string, signature: string): void {
  document.querySelectorAll(`.${PRINT_SHEET_CLASS}`).forEach((node) => node.remove());
  const sheet = document.createElement("div");
  sheet.className = PRINT_SHEET_CLASS;
  const frame = document.createElement("figure");
  frame.className = "print-keepsake__frame";
  const img = document.createElement("img");
  img.src = src;
  img.alt = "a kept photo";
  const text = document.createElement("figcaption");
  text.className = "print-keepsake__caption";
  text.textContent = formatCaption(caption);
  const sign = document.createElement("span");
  sign.className = "print-keepsake__signature";
  sign.textContent = signature;
  frame.append(img, text, sign);
  sheet.append(frame);
  document.body.append(sheet);
  const cleanup = () => {
    sheet.remove();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup, { once: true });
  window.setTimeout(() => {
    window.print();
    window.setTimeout(cleanup, 800);
  }, 60);
}
