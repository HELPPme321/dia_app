# Dia photo resolution report

Checked against the supplied `dia-photos.zip` and the WebP files currently committed under `dia-web-app/images/` on 2026-11-01.

## Supplied source files vs. files currently served

| File | Supplied PNG dimensions | Current repository WebP dimensions | Assessment |
|---|---:|---:|---|
| `01-model-moss-bomber` | 485 × 633 | 360 × 470 | Replace for hero; source is below 1600 px on the long side |
| `03-model-black-tee` | 443 × 626 | 340 × 480 | Replace for hero; source is below 1600 px |
| `05-model-city-tailoring` | 452 × 678 | 320 × 480 | Replace for hero; source is below 1600 px |
| `04-model-monogram-jacket` | 335 × 597 | 269 × 480 | Replace for hero use; source is below 1600 px |
| `06-model-striped-polo` | 640 × 640 | 360 × 360 | Replace for hero use; source is below 1600 px |
| `07-model-ivory-suit` | 1131 × 1500 | 360 × 477 | Replace for hero use; source is below 1600 px |
| `02-product-black-tee` | 720 × 720 | 360 × 360 | Replace for product cards; source is below 1000 px |
| `08-product-leather-totes` | 1080 × 1080 | 360 × 360 | Supplied original meets product target; current repository copy does not |
| `09-product-white-cap` | 360 × 201 | 360 × 201 | Replace for product cards; source is below 1000 px |
| `10-product-chino-pants` | 1500 × 1500 | 360 × 360 | Supplied original meets product target; current repository copy does not |

## Display safeguards

- Homepage hero frames are capped to the actual width of each currently committed hero WebP: 360 px, 340 px, and 320 px.
- Product images use centered `object-fit: contain` and natural sizing, rather than being stretched to fill their cards.
- Lookbook, bag, and admin thumbnails are constrained to their available source dimensions.
- The hero background is a forest-green/gold gradient only. The model photograph itself is not blurred, tinted, or darkened.
- The first hero image is eager/high-priority; the next slide is preloaded.
- `srcset` and `sizes` hints are present, but each image currently has one committed candidate. A true multi-size responsive source set requires additional derivative files to be added to the repository.

## Files that need higher-resolution replacements

For the 1600 px hero target, replace all model photos used in the hero: `01-model-moss-bomber`, `03-model-black-tee`, `05-model-city-tailoring`, and any admin hero images `04-model-monogram-jacket` / `06-model-striped-polo`. The supplied `07-model-ivory-suit` is 1500 px on its long side, so it is also just below the stated target.

For the 1000 px product target, replace `02-product-black-tee` and `09-product-white-cap`. Restore the supplied original-size versions of `08-product-leather-totes` and `10-product-chino-pants` in place of their 360 px repository copies.

Do not upscale these sources. Keep the currently committed images displayed smaller until higher-resolution replacements are supplied.
