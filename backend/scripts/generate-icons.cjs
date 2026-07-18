const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [192, 512];
const inputSvg = path.join(__dirname, '../../frontend/icons/icon.svg');
const outputDir = path.join(__dirname, '../../frontend/icons');

async function generate() {
  const svg = fs.readFileSync(inputSvg, 'utf-8');

  for (const size of sizes) {
    await sharp(Buffer.from(svg))
      .resize(size, size)
      .png()
      .toFile(path.join(outputDir, `icon-${size}.png`));
    console.log(`Generated icon-${size}.png`);
  }
}

generate().catch(console.error);
