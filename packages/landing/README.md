<p align="center">
  <img src="images/logo.png" alt="MangoWave logo" width="150">
</p>

# MangoWave Landing Page

Static landing page served at [mangowave.app](https://mangowave.app). Pure HTML + CSS, no JavaScript.

## Structure

```
landing/
├── index.html       # Single-page landing with inline SVG icons
├── style.css        # Extracted styles
├── favicon.ico      # Browser tab icon
├── images/          # Visual assets
│   ├── logo.png     # MangoWave logo (transparent background)
│   └── howling.png  # Background wolf image (subtle opacity layer)
└── icons/           # Favicons and touch icons
    ├── apple-touch-icon.png
    ├── android-chrome-192x192.png
    ├── android-chrome-512x512.png
    ├── favicon-16x16.png
    └── favicon-32x32.png
```

## Design

- **Colors:** orange `#ff8c32`, purple `#e050e0`, gradient between them, dark background `#0a0a0a`
- **Features grid:** 500+ Presets, 10-Band EQ, Spotify Integration, WebGL 2, Real-Time FFT, Zero Install
- **CTA:** links to [play.mangowave.app](https://play.mangowave.app)
- **Footer:** GitHub repo link, Ko-fi "Buy Mango a Treat" link
- **Social cards:** OG + Twitter meta tags with `howling.png` preview image

## Deployment

The deploy workflow syncs `packages/landing/` to `s3://mangowave-frontend/landing/`. A CloudFront Function (`mangowave-host-router`) routes requests with `Host: mangowave.app` to the `/landing/` prefix in S3.
