import sharp from "sharp";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const logo = join(root, "public", "aap-logo.png");
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "icon.png");

/** Square app icon: navy background + white AAP broom (fixes blank white-on-white launcher icon). */
await sharp(logo)
  .resize(780, 780, { fit: "contain", background: { r: 10, g: 22, b: 40, alpha: 1 } })
  .extend({
    top: 122,
    bottom: 122,
    left: 122,
    right: 122,
    background: { r: 10, g: 22, b: 40, alpha: 1 },
  })
  .png()
  .toFile(out);

console.log("Wrote", out);
