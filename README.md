# UGC Fashion Enhancer

- Upload an image
- Enhance quality (upscale ×2/×4, denoise, brightness, natural colors)
- Detect clothing/accessories (on-device TFJS, no identity processing)
- Generate a short UGC-style video (mp4, 10–20s) with soft zoom/pan and simple text hook

## Local

```bash
pnpm i # or npm i / yarn
pnpm dev
```

## Deploy (Vercel)

```bash
vercel deploy --prod --yes --token $VERCEL_TOKEN --name agentic-2e7f661c
```
