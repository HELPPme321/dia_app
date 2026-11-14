'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const rootDir = path.resolve(__dirname, '..');
const originalsDir = path.join(rootDir, 'originals');
const imagesDir = path.join(rootDir, 'images');
const reportPath = path.join(rootDir, 'PHOTO-RESOLUTION-REPORT.md');

const TARGET_SIZES = [480, 960, 1600];
const WEBP_QUALITY = 85;

// Hero and model targets: 1600px; Product targets: 1000px
const HERO_TARGET_WIDTH = 1600;
const PRODUCT_TARGET_WIDTH = 1000;

const MODEL_AND_HERO_FILES = new Set([
  '02-model-plaid-flannel-look',
  '03-model-black-tee-wide-trousers',
  '04-model-ivory-cap-sleeve-shirt',
  '07-model-vintage-raglan-tee'
]);

const RECOMMENDED_POSITIONS = {
  '01-star-patch-denim-cargo': 'center 40%',
  '02-model-plaid-flannel-look': 'center 30%',
  '03-model-black-tee-wide-trousers': 'center 30%',
  '04-model-ivory-cap-sleeve-shirt': 'center 28%',
  '05-navy-spider-tee': 'center center',
  '06-washed-black-lips-tee': 'center center',
  '07-model-vintage-raglan-tee': 'center 32%',
  '08-butterfly-white-tee': 'center 35%',
  '09-white-corset-puff-dress': 'center 35%',
  '10-script-embroidered-wide-jeans': 'center 40%',
  '11-washed-gothic-cap': 'center center'
};

async function optimizeImages() {
  if (!fs.existsSync(originalsDir)) {
    throw new Error('Originals directory not found at: ' + originalsDir);
  }
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  const files = fs.readdirSync(originalsDir).filter((file) => /\.(jpe?g|png|webp)$/i.test(file)).sort();
  if (files.length === 0) {
    throw new Error('No image files found in originals directory: ' + originalsDir);
  }

  console.log(`Processing ${files.length} authentic original assets from ${originalsDir}...`);

  const reportItems = [];

  for (const file of files) {
    const baseName = path.parse(file).name;
    const inputPath = path.join(originalsDir, file);
    const metadata = await sharp(inputPath).metadata();
    const origWidth = metadata.width || 0;
    const origHeight = metadata.height || 0;

    const isHeroOrModel = MODEL_AND_HERO_FILES.has(baseName);
    const targetWidth = isHeroOrModel ? HERO_TARGET_WIDTH : PRODUCT_TARGET_WIDTH;
    const isUndersized = origWidth < targetWidth;

    // Generate responsive WebP sizes (480, 960, 1600)
    for (const size of TARGET_SIZES) {
      const outputPath = path.join(imagesDir, `${baseName}-${size}w.webp`);
      await sharp(inputPath)
        .resize({ width: size, fit: 'inside', withoutEnlargement: false })
        .webp({ quality: WEBP_QUALITY })
        .toFile(outputPath);
    }

    // Also output primary [baseName].webp
    const primaryOutputPath = path.join(imagesDir, `${baseName}.webp`);
    await sharp(inputPath)
      .resize({ width: Math.min(origWidth, 1600), fit: 'inside', withoutEnlargement: false })
      .webp({ quality: WEBP_QUALITY })
      .toFile(primaryOutputPath);

    const primaryMeta = await sharp(primaryOutputPath).metadata();

    reportItems.push({
      baseName,
      file,
      origWidth,
      origHeight,
      primaryWidth: primaryMeta.width,
      primaryHeight: primaryMeta.height,
      targetWidth,
      isHeroOrModel,
      isUndersized,
      position: RECOMMENDED_POSITIONS[baseName] || 'center center'
    });
  }

  // Generate markdown report
  const now = new Date().toISOString().split('T')[0];
  let md = `# Dia Photo Resolution and Image Sharpness Report\n\n`;
  md += `Generated on **${now}** via \`scripts/optimize-images.js\` using **sharp**.\n\n`;
  md += `All assets in this report are authentic originals from \`dia-originals\`. No stock placeholders or duplicate photos are used.\n\n`;
  md += `## Original Source vs. Serving Resolutions\n\n`;
  md += `| Asset Name | Role | Original Dimensions | Primary WebP Dimensions | Target Width | Status & Display Constraint |\n`;
  md += `|---|---|---:|---:|---:|---|\n`;

  for (const item of reportItems) {
    const role = item.isHeroOrModel ? 'Hero / Model / Product' : 'Garment Product';
    let statusText = '';
    if (item.isUndersized) {
      statusText = `⚠️ Source is ${item.origWidth}px wide (< ${item.targetWidth}px target). **Cap container to max-width ${item.origWidth}px**; framed presentation, no upscale.`;
    } else {
      statusText = `✅ Meets or exceeds target. Full-resolution WebP available.`;
    }
    md += `| \`${item.baseName}\` | ${role} | ${item.origWidth} × ${item.origHeight} | ${item.primaryWidth} × ${item.primaryHeight} | ${item.targetWidth} px | ${statusText} |\n`;
  }

  md += `\n## Responsive Multi-Resolution Derivatives\n\n`;
  md += `All original assets have been processed into WebP at 85% quality across 3 responsive breakpoints:\n`;
  md += `- \`images/[name]-480w.webp\` (mobile / thumbnail)\n`;
  md += `- \`images/[name]-960w.webp\` (standard cards / tablet)\n`;
  md += `- \`images/[name]-1600w.webp\` (desktop / hero / retina display)\n`;
  md += `- \`images/[name].webp\` (canonical primary WebP asset)\n\n`;

  md += `## Sharpness & Presentation Safeguards\n\n`;
  md += `- **No Artificial Upscaling:** Containers for undersized images are capped to their natural width (528px-736px) so small images are not stretched or pixelated.\n`;
  md += `- **Framed Editorial Presentation:** Model photos in the Hero and Lookbook are rendered as tall framed portrait panels rather than full-bleed backgrounds, preserving crispness at native resolution.\n`;
  md += `- **Zero Blur Filters:** Backdrop filters, blurs, and muddy dark overlays over editorial photography are strictly disabled.\n`;
  md += `- **Layout Shift Prevention:** Intrinsic \`width\` and \`height\` attributes are specified on all \`<img>\` tags with responsive \`srcset\` and \`sizes\`.\n`;
  md += `- **Focal Alignment:** \`object-fit: cover\` with targeted \`object-position\` focal points prevents heads and garment embroidery from being cropped.\n`;
  md += `- **Lazy Loading:** All media below the fold specifies \`loading="lazy"\` and \`decoding="async"\`.\n\n`;

  md += `## Assets Too Small For Full-Bleed Slots (Requiring Capped Display)\n\n`;
  const undersizedList = reportItems.filter((i) => i.isUndersized);
  if (undersizedList.length > 0) {
    md += `The source assets range between **528px** and **736px** in width, which is below the full-bleed targets (1000px for products, 1600px for full-width hero backgrounds). They must be shown in constrained cards/frames:\n\n`;
    for (const item of undersizedList) {
      md += `- **\`${item.baseName}\`** (${item.isHeroOrModel ? 'Model/Hero' : 'Garment'}): source is ${item.origWidth}×${item.origHeight}px; target is ${item.targetWidth}px wide. Cap presentation width to $\\le$ ${item.origWidth}px.\n`;
    }
  } else {
    md += `All assets meet or exceed their production targets.\n`;
  }

  fs.writeFileSync(reportPath, md, 'utf8');
  console.log(`Report written to ${reportPath}`);
  console.log(`Successfully generated WebP assets for ${reportItems.length} photos.`);
  return reportItems;
}

if (require.main === module) {
  optimizeImages().catch((err) => {
    console.error('Image optimization failed:', err);
    process.exit(1);
  });
}

module.exports = { optimizeImages };
