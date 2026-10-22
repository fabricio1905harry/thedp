/**
 * M9: a signed-in buyer must not be offered "Create a wholesale account".
 * CMS blocks whose CTA points to the signup page are turned into a
 * "My account" link (or dropped when they are a pure sign-up banner and the
 * buyer is already approved).
 */
type Content = Record<string, unknown>;

export function pointsToSignup(content: Content): boolean {
  const link = typeof content.cta_link === "string" ? content.cta_link : "";
  return link.startsWith("/cadastro");
}

export function adaptCtaForSignedIn<T extends { key: string; content: Content }>(
  blocks: T[],
  opts: { signedIn: boolean; approved: boolean; myAccountLabel: string }
): T[] {
  if (!opts.signedIn) return blocks;
  const out: T[] = [];
  for (const block of blocks) {
    if (!pointsToSignup(block.content)) {
      out.push(block);
      continue;
    }
    if (opts.approved && block.key === "institutional_banner") continue;
    out.push({ ...block, content: { ...block.content, cta_text: opts.myAccountLabel, cta_link: "/minha-conta" } });
  }
  return out;
}
