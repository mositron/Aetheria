// Generate PNG icons from SVG source
// Run from packages/client/public/assets: node ../../scripts/generate-icons.mjs

import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Paths - from packages/client/scripts to packages/client/public
const SVG_PATH = join(__dirname, '..', 'public', 'icon.svg');
const OUTPUT_DIR = join(__dirname, '..', 'public', 'assets', 'icons');

// Icon sizes for PWA
const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

async function generateIcons() {
  console.log('🔧 Generating PWA icons from SVG...\n');

  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    await mkdir(OUTPUT_DIR, { recursive: true });
    console.log(`Created: ${OUTPUT_DIR}`);
  }

  // Read SVG
  const svgBuffer = await readFile(SVG_PATH);
  console.log(`Read SVG: ${SVG_PATH}`);

  // Generate each size
  for (const size of SIZES) {
    const filename = `icon-${size}.png`;
    const outputPath = join(OUTPUT_DIR, filename);

    try {
      await sharp(svgBuffer)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 13, g: 13, b: 43, alpha: 1 } // #0d0d2b background
        })
        .png({ compressionLevel: 9 })
        .toFile(outputPath);

      console.log(`  ✓ Generated ${filename} (${size}x${size})`);
    } catch (err) {
      console.error(`  ✗ Failed to generate ${filename}: ${err.message}`);
    }
  }

  console.log('\n✅ Icon generation complete!');
  console.log(`   Output: ${OUTPUT_DIR}`);
}

generateIcons().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});