// Better background removal using pixel-level alpha masking
import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs';

const src = './public/brand/recipes-logo-original.png';
const outDir = './public/brand';

async function main() {
  const { data, info } = await sharp(src)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  console.log('orig:', width, 'x', height, channels, 'channels');

  // Modify alpha based on luminance — make near-white transparent
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i], g = data[i+1], b = data[i+2];
    const lum = 0.2126*r + 0.7152*g + 0.0722*b;
    // pure white area → transparent
    if (lum > 245 && Math.abs(r-g) < 8 && Math.abs(g-b) < 8) {
      data[i+3] = 0;
    } else if (lum > 220 && Math.abs(r-g) < 12 && Math.abs(g-b) < 12) {
      // soft fade for edge antialiasing
      const fade = Math.max(0, 255 - Math.floor((lum - 220) * 7));
      data[i+3] = Math.min(data[i+3], fade);
    }
  }

  const masked = await sharp(data, { raw: { width, height, channels } })
    .png()
    .toBuffer();

  // Trim transparent borders
  const trimmed = await sharp(masked).trim({ background: { r:0, g:0, b:0, alpha:0 } }).toBuffer();
  await sharp(trimmed).toFile(path.join(outDir, 'recipes-logo-trimmed.png'));
  const tMeta = await sharp(trimmed).metadata();
  console.log('trimmed:', tMeta.width, 'x', tMeta.height);

  for (const size of [512, 256, 128, 64, 32]) {
    await sharp(trimmed)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(path.join(outDir, `recipes-logo-${size}.png`));
    console.log(`  ${size}x${size}`);
  }
  fs.copyFileSync(path.join(outDir, 'recipes-logo-32.png'), './public/favicon.png');

  // OG image — dark canvas with logo centered
  const ogBg = await sharp({
    create: { width: 1200, height: 630, channels: 4, background: { r: 10, g: 10, b: 10, alpha: 1 } }
  }).png().toBuffer();
  const logo380 = await sharp(trimmed)
    .resize(380, 380, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  await sharp(ogBg)
    .composite([{ input: logo380, gravity: 'center' }])
    .png()
    .toFile(path.join(outDir, 'og-image.png'));
  console.log('  og-image 1200x630');
}
main().catch(e => { console.error(e); process.exit(1); });
