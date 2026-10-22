/** Payment proof (bank transfer) upload rules, shared by the buyer UI and the server action. */
export const PROOF_BUCKET = "payment-proofs";
export const PROOF_MAX_BYTES = 8 * 1024 * 1024;
export const PROOF_ACCEPT = "application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png";

/** Detects PDF/JPG/PNG from the file's magic bytes (the client-sent MIME type is not trusted). */
export function detectProofType(bytes: Uint8Array): { ext: string; mime: string } | null {
  const startsWith = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (startsWith([0x25, 0x50, 0x44, 0x46])) return { ext: "pdf", mime: "application/pdf" };
  if (startsWith([0xff, 0xd8, 0xff])) return { ext: "jpg", mime: "image/jpeg" };
  if (startsWith([0x89, 0x50, 0x4e, 0x47])) return { ext: "png", mime: "image/png" };
  return null;
}
