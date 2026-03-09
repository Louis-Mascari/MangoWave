# MangoWave Landing Page

Static landing page served at [mangowave.app](https://mangowave.app). Pure HTML + CSS, no JavaScript.

## Files

- `index.html` — single-page landing with inline SVG icons
- `style.css` — extracted styles
- `logo.png` — MangoWave logo (transparent background)
- `howling.png` — background wolf image (subtle opacity layer)
- `favicon.ico` + icon PNGs — favicons and touch icons

## Design

- **Colors:** orange `#ff8c32`, purple `#e050e0`, gradient between them, dark background `#0a0a0a`
- **Features grid:** 500+ Presets, 10-Band EQ, Spotify Integration, WebGL 2, Real-Time FFT, Zero Install
- **CTA:** links to [play.mangowave.app](https://play.mangowave.app)
- **Footer:** GitHub repo link, Ko-fi "Buy Mango a Treat" link
- **Social cards:** OG + Twitter meta tags with `howling.png` preview image

## Deployment

The deploy workflow syncs `packages/landing/` to `s3://mangowave-frontend/landing/`. A CloudFront Function (`mangowave-host-router`) routes requests with `Host: mangowave.app` to the `/landing/` prefix in S3.
