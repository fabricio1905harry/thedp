export type VideoSource = { kind: "iframe" | "video"; src: string } | null;

/** YouTube / Vimeo page links or a direct file → something the page can play. */
export function videoSource(url: string | null | undefined, autoplay = false): VideoSource {
  const value = (url ?? "").trim();
  if (!value) return null;
  const yt = value.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/);
  if (yt) return { kind: "iframe", src: `https://www.youtube.com/embed/${yt[1]}?rel=0${autoplay ? "&autoplay=1" : ""}` };
  const vimeo = value.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return { kind: "iframe", src: `https://player.vimeo.com/video/${vimeo[1]}${autoplay ? "?autoplay=1" : ""}` };
  if (/^https?:\/\//.test(value) || value.startsWith("/")) return { kind: "video", src: value };
  return null;
}
