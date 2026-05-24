# Avatar Integration Strategy

> ⚠️ **DEPRECATED — out of scope per CLAUDE.md**
>
> Project policy is "procedural everything / no external asset downloads"
> (CLAUDE.md `## What the user is like`). GLTF / Ready Player Me / Mixamo
> are explicit non-goals for the current MVP.
>
> Kept for reference — if the policy ever changes, the steps below still
> describe a workable migration path. The procedural HeroModel +
> PlayerJobProps + per-NPC accessory system in `scene/models/` is the
> current production path.

สรุปแผนทางเลือกการเพิ่มตัวละครสมจริง (ไม่ต้องปั้น 3D เอง)

## เป้าหมาย
นำตัวละครแบบ skinned PBR (`glTF`/`GLB`) มาใช้ในเกมโดยไม่ต้องสร้างโมเดล 3D เอง โดยเลือก pipeline ที่เหมาะสมกับเป้าหมาย (MVP → Production → High‑Fidelity)

---

## 1) MVP — Ready Player Me + Mixamo (เร็วสุด)

- สรุป: ผู้เล่นสร้าง/ดาวน์โหลด GLB จาก Ready Player Me; ใช้ Mixamo เพื่อดาวน์โหลด/apply animation clips; โหลดด้วย `GLTFLoader` และเล่นคลิปด้วย `AnimationMixer`.
- ขั้นตอนหลัก:
  1. เพิ่ม `GLTFLoader` ใน pipeline (ปรับ `packages/client/src/assets/useAsset.ts`).
  2. สร้างคอมโพเนนต์ `GLTFHero` ที่โหลด GLB และเซ็ต `AnimationMixer` + clip control.
  3. ให้ UI เก็บ `avatar metadata` เป็น URL ไปยัง GLB (หรือบันทึกใน DB/server).
  4. Fallback: ถ้าไม่มี GLB ให้ใช้ `HeroModel` ปัจจุบัน (procedural).
- ไฟล์ที่ต้องมิเกรต/เพิ่ม (ตัวอย่าง):
  - `packages/client/src/assets/useAsset.ts`
  - `packages/client/src/assets/manifest.ts`
  - เพิ่ม `packages/client/src/scene/models/GLTFHero.tsx`
  - อัปเดต `packages/client/src/scene/models/HeroModel.tsx` (wrapper/fallback)
  - อัปเดต UI ตัวเลือกใน `packages/client/src/ui/CharacterSelect.tsx`
- ทรัพยากร (คร่าว): ดาวน์โหลด ~2–8 MB/ตัว (ไม่บีบอัด). แนะนำเป้าหมายเริ่มต้น: ~20 detailed characters visible ก่อนต้องทำ LOD/impostor.
- ระยะเวลาโดยประมาณ: 2–4 วัน.

---

## 2) Balanced — Self‑prepared GLB + Compression + LOD (แนะนำสำหรับ production)

- สรุป: สร้างหรือรับ GLB จาก MakeHuman/Blender หรือ RPM → optimize → encode DRACO (mesh) + KTX2/Basis (textures) → serve จาก CDN. เพิ่ม LOD, impostor และ reuse/instancing ของ skeleton.
- ขั้นตอนหลัก:
  1. เพิ่ม `DRACOLoader` + `KTX2Loader` (Basis) ใน `useAsset`.
  2. ตั้ง build step (CI) ที่ encode meshes/textures เป็น DRACO/KTX2.
  3. สร้าง LOD generator / impostor baker และใช้ `SkeletonUtils.clone` สำหรับหลายอินสแตนซ์.
  4. Migrate `HeroModel` ให้สลับระหว่าง procedural กับ GLTF.
- ไฟล์/ระบบที่ต้องเพิ่ม/เปลี่ยน: build scripts (gltf-pipeline / basisu), `useAsset.ts`, `manifest.ts`, LOD helpers ใน `scene/`.
- ทรัพยากร (คร่าว): ดาวน์โหลด ~0.5–3 MB/ตัว หลังบีบอัด; client practical target ~30–60 detailed visible (ขึ้นกับ polycount/postprocess).
- ระยะเวลาโดยประมาณ: 1–2 สัปดาห์.

---

## 3) High‑Fidelity — Full PBR, Blendshapes, Face/Voice Sync (สำหรับคุณภาพสูง)

- สรุป: โมเดลคุณภาพสูง (MakeHuman/Blender/Commercial), full PBR+SSS, blendshapes/facial rigs, real‑time face/voice retargeting และ texture streaming.
- ขั้นตอนหลัก:
  1. ออกแบบ asset spec (bone count, blendshape list, texture sets).
  2. สร้าง retargeting pipeline (Mixamo → custom retarget หากจำเป็น).
  3. เพิ่ม facial capture / blendshape retargeting (WebRTC/ARKit) และ lip sync.
  4. เพิ่ม texture streaming / GPU atlas / advanced LOD.
- ผลกระทบทรัพยากร: ดาวน์โหลด 4–20+ MB/ตัว; VRAM สูง (แต่ละตัวอาจกิน 16+ MB ขึ้นไป); without aggressive LOD expect 10–30 heavy characters max per client.
- ระยะเวลาโดยประมาณ: หลายสัปดาห์ → เดือน ขึ้นกับขอบเขต.

---

## Common Migration Steps (ทั้งสามทางเลือก)

- Asset loader
  - อัปเกรด `packages/client/src/assets/useAsset.ts` ให้รองรับ GLB/glTF/DRACO/KTX2.
- Model component
  - สร้าง `packages/client/src/scene/models/GLTFHero.tsx` (load gltf, setup `AnimationMixer`, expose clip controls).
  - ปรับ `HeroModel` เพื่อ fallback หรือสลับไปมา.
- Manifest & Hosting
  - เพิ่ม GLB entries ใน `packages/client/src/assets/manifest.ts`.
  - Serve assets จาก `public/assets` หรือ CDN; เก็บเฉพาะ `avatar metadata` บน server (ไม่ส่ง mesh ผ่าน Colyseus).
- Performance
  - ทำ LOD/impostor, enable DRACO/KTX2, skeleton cloning, reuse materials/textures, culling.
- Legal
  - ตรวจ license ของโมเดล/เท็กซ์เจอร์ก่อนใช้งานเชิงพาณิชย์.

---

## Resource & Scalability Notes (สรุป)

- Client cost = network download + VRAM + GPU drawcalls. เน้น texture memory มากกว่าตัว vertex buffers ในหลายกรณี.
- ตัวเลขคร่าว ๆ per client budget: aim ≤ 50–150 MB VRAM practical.
- Visible detailed characters per client (โดยประมาณ):
  - MVP: ~20
  - Balanced (with compression/LOD): ~30–60
  - High‑Fidelity: ~10–30 (ขึ้นกับการปรับ LOD)
- Server concurrency: ไม่ถูกจำกัดโดย mesh rendering — แต่ขึ้นกับ room logic, bandwidth และ CPU ของ Colyseus; แยก asset hosting (CDN) ออกจาก game server.

---

## Recommended Next Steps (MVP path)

1. ตัดสินใจใช้ Ready Player Me หรือโหลด GLB ต้นทางอื่นสำหรับ MVP.
2. สร้าง `GLTFHero` ตัวอย่างที่โหลด GLB และเล่น Mixamo clips.
3. ปรับ `useAsset.ts` ให้รองรับ GLB และทดสอบโหลดบน `CharacterSelect`.
4. หลังได้ MVP: เพิ่ม DRACO/KTX2, LOD, และ profiling.

---

ไฟล์นี้ถูกสร้างโดยผู้ช่วยเพื่อให้คุณกลับมาอ่านได้ทีหลัง — ถ้าต้องการผมสามารถแปลงเป็น checklist patch หรือสร้างตัวอย่าง `GLTFHero` ให้ทดลองได้ทันที
