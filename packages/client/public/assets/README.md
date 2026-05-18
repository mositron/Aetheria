# Game Assets

Drop GLTF/GLB models, WebP/PNG textures, and OGG/MP3 audio under this directory,
then register them in `packages/client/src/assets/manifest.ts`.

## Layout

```
public/assets/
├── models/      *.glb / *.gltf
├── textures/    *.webp / *.png / *.jpg
└── audio/       *.ogg / *.mp3
```

## Usage

```ts
import { useModel, useTexture } from "@/assets/useAsset";

function HeroRenderer() {
  const gltf = useModel("hero");
  if (!gltf) return <ProceduralHero />; // fallback while loading / missing
  return <primitive object={gltf.scene.clone()} />;
}
```

The game is fully procedural by default — adding assets is **optional** and
purely additive. Missing entries automatically fall back to procedural rendering.
