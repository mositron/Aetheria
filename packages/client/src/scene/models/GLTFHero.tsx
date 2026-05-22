/**
 * P4.29 — GLTF asset loader stub.
 *
 * To adopt 3D character models:
 *  1. Place .glb/.gltf files in public/models/
 *  2. Replace the procedural mesh in CharacterModel.tsx with GLTFLoader.
 *  3. For animation: use useAnimations() from @react-three/drei.
 *
 * Example integration:
 *   import { useGLTF } from '@react-three/drei';
 *   const { scene, animations } = useGLTF('/models/hero.glb');
 *   const { actions } = useAnimations(animations, groupRef);
 *   useEffect(() => { actions['Run']?.play(); }, []);
 *
 * Until models are provided, all characters render as procedural
 * capsule/box geometry via CharacterModel.tsx. This stub documents
 * the integration point and is safe to leave in the codebase.
 */

export {};