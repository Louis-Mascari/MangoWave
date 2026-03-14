<p align="center">
  <img src="images/logo.png" alt="MangoWave logo" width="150">
</p>

# MangoWave Landing Page

Static landing page served at [mangowave.app](https://mangowave.app). Pure HTML + CSS, no JavaScript.

## Structure

```
landing/
├── index.html       # Single-page landing with inline SVG icons, JSON-LD structured data
├── style.css        # Extracted styles
├── robots.txt       # Search engine directives + sitemap reference
├── sitemap.xml      # Single-URL sitemap (mangowave.app)
├── favicon.ico      # Browser tab icon
├── images/          # Visual assets
│   ├── logo.png     # MangoWave logo (transparent background)
│   ├── howling.png  # Background dog image (subtle opacity layer)
│   └── social-card.png  # 1200×630 OG/Twitter social share image
└── icons/           # Favicons and touch icons
    ├── apple-touch-icon.png
    ├── android-chrome-192x192.png
    ├── android-chrome-512x512.png
    ├── favicon-16x16.png
    └── favicon-32x32.png
```

## Design

- **Colors:** orange `#ff8c32`, purple `#e050e0`, gradient between them, dark background `#0a0a0a`
- **Features grid:** 400+ Visuals, Any Audio Source, Desktop & Mobile, No Signup, No Install, No Ads
- **CTA:** links to [play.mangowave.app](https://play.mangowave.app)
- **Footer:** GitHub repo link, Ko-fi "Buy Mango a Treat" link
- **Social cards:** OG + Twitter meta tags with `social-card.png` (1200×630, gradient branding)
- **SEO:** canonical link, robots.txt, sitemap.xml, JSON-LD `SoftwareApplication` schema

## Deployment

Deployed via GitHub Actions alongside the main app. CloudFront routes `mangowave.app` requests to landing page assets.
