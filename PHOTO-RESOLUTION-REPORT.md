# Dia Photo Resolution and Image Sharpness Report

Generated on **2026-11-14** via `scripts/optimize-images.js` using **sharp**.

All assets in this report are authentic originals from `dia-originals`. No stock placeholders or duplicate photos are used.

## Original Source vs. Serving Resolutions

| Asset Name | Role | Original Dimensions | Primary WebP Dimensions | Target Width | Status & Display Constraint |
|---|---|---:|---:|---:|---|
| `01-star-patch-denim-cargo` | Garment Product | 528 × 1000 | 528 × 1000 | 1000 px | ⚠️ Source is 528px wide (< 1000px target). **Cap container to max-width 528px**; framed presentation, no upscale. |
| `02-model-plaid-flannel-look` | Hero / Model / Product | 736 × 1104 | 736 × 1104 | 1600 px | ⚠️ Source is 736px wide (< 1600px target). **Cap container to max-width 736px**; framed presentation, no upscale. |
| `03-model-black-tee-wide-trousers` | Hero / Model / Product | 736 × 981 | 736 × 981 | 1600 px | ⚠️ Source is 736px wide (< 1600px target). **Cap container to max-width 736px**; framed presentation, no upscale. |
| `04-model-ivory-cap-sleeve-shirt` | Hero / Model / Product | 735 × 1103 | 735 × 1103 | 1600 px | ⚠️ Source is 735px wide (< 1600px target). **Cap container to max-width 735px**; framed presentation, no upscale. |
| `05-navy-spider-tee` | Garment Product | 564 × 564 | 564 × 564 | 1000 px | ⚠️ Source is 564px wide (< 1000px target). **Cap container to max-width 564px**; framed presentation, no upscale. |
| `06-washed-black-lips-tee` | Garment Product | 736 × 736 | 736 × 736 | 1000 px | ⚠️ Source is 736px wide (< 1000px target). **Cap container to max-width 736px**; framed presentation, no upscale. |
| `07-model-vintage-raglan-tee` | Hero / Model / Product | 736 × 981 | 736 × 981 | 1600 px | ⚠️ Source is 736px wide (< 1600px target). **Cap container to max-width 736px**; framed presentation, no upscale. |
| `08-butterfly-white-tee` | Garment Product | 736 × 1308 | 736 × 1308 | 1000 px | ⚠️ Source is 736px wide (< 1000px target). **Cap container to max-width 736px**; framed presentation, no upscale. |
| `09-white-corset-puff-dress` | Garment Product | 736 × 979 | 736 × 979 | 1000 px | ⚠️ Source is 736px wide (< 1000px target). **Cap container to max-width 736px**; framed presentation, no upscale. |
| `10-script-embroidered-wide-jeans` | Garment Product | 736 × 980 | 736 × 980 | 1000 px | ⚠️ Source is 736px wide (< 1000px target). **Cap container to max-width 736px**; framed presentation, no upscale. |
| `11-washed-gothic-cap` | Garment Product | 600 × 600 | 600 × 600 | 1000 px | ⚠️ Source is 600px wide (< 1000px target). **Cap container to max-width 600px**; framed presentation, no upscale. |

## Responsive Multi-Resolution Derivatives

All original assets have been processed into WebP at 85% quality across 3 responsive breakpoints:
- `images/[name]-480w.webp` (mobile / thumbnail)
- `images/[name]-960w.webp` (standard cards / tablet)
- `images/[name]-1600w.webp` (desktop / hero / retina display)
- `images/[name].webp` (canonical primary WebP asset)

## Sharpness & Presentation Safeguards

- **No Artificial Upscaling:** Containers for undersized images are capped to their natural width (528px-736px) so small images are not stretched or pixelated.
- **Framed Editorial Presentation:** Model photos in the Hero and Lookbook are rendered as tall framed portrait panels rather than full-bleed backgrounds, preserving crispness at native resolution.
- **Zero Blur Filters:** Backdrop filters, blurs, and muddy dark overlays over editorial photography are strictly disabled.
- **Layout Shift Prevention:** Intrinsic `width` and `height` attributes are specified on all `<img>` tags with responsive `srcset` and `sizes`.
- **Focal Alignment:** `object-fit: cover` with targeted `object-position` focal points prevents heads and garment embroidery from being cropped.
- **Lazy Loading:** All media below the fold specifies `loading="lazy"` and `decoding="async"`.

## Assets Too Small For Full-Bleed Slots (Requiring Capped Display)

The source assets range between **528px** and **736px** in width, which is below the full-bleed targets (1000px for products, 1600px for full-width hero backgrounds). They must be shown in constrained cards/frames:

- **`01-star-patch-denim-cargo`** (Garment): source is 528×1000px; target is 1000px wide. Cap presentation width to $\le$ 528px.
- **`02-model-plaid-flannel-look`** (Model/Hero): source is 736×1104px; target is 1600px wide. Cap presentation width to $\le$ 736px.
- **`03-model-black-tee-wide-trousers`** (Model/Hero): source is 736×981px; target is 1600px wide. Cap presentation width to $\le$ 736px.
- **`04-model-ivory-cap-sleeve-shirt`** (Model/Hero): source is 735×1103px; target is 1600px wide. Cap presentation width to $\le$ 735px.
- **`05-navy-spider-tee`** (Garment): source is 564×564px; target is 1000px wide. Cap presentation width to $\le$ 564px.
- **`06-washed-black-lips-tee`** (Garment): source is 736×736px; target is 1000px wide. Cap presentation width to $\le$ 736px.
- **`07-model-vintage-raglan-tee`** (Model/Hero): source is 736×981px; target is 1600px wide. Cap presentation width to $\le$ 736px.
- **`08-butterfly-white-tee`** (Garment): source is 736×1308px; target is 1000px wide. Cap presentation width to $\le$ 736px.
- **`09-white-corset-puff-dress`** (Garment): source is 736×979px; target is 1000px wide. Cap presentation width to $\le$ 736px.
- **`10-script-embroidered-wide-jeans`** (Garment): source is 736×980px; target is 1000px wide. Cap presentation width to $\le$ 736px.
- **`11-washed-gothic-cap`** (Garment): source is 600×600px; target is 1000px wide. Cap presentation width to $\le$ 600px.
