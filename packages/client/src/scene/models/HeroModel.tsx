import { useRef } from "react";
import React from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { DEFAULT_APPEARANCE, type Appearance } from "@game/shared";
import { RoundedBox } from "@react-three/drei";
import { RoundLimb, RoundTorso, RoundHead, RoundSpike } from "./organicPrimitives";
import { toonGradient } from "../materials";

type Props = {
  bodyColor: string;
  appearance?: Appearance;
  isMoving: () => boolean;
  isAttacking?: () => boolean;
  isCasting?: () => boolean;
  isDead?: () => boolean;
  hasWeapon?: () => boolean;
  isFlying?: () => boolean;
};

function bobBase(_progress: number) {
  return Math.sin(performance.now() * 0.003) * 0.04;
}

const BODY_SCALE: Record<string, { torsoW: number; torsoH: number; armW: number; legW: number; height: number }> = {
  slim:   { torsoW: 0.45, torsoH: 0.6,  armW: 0.12, legW: 0.15, height: 1.0 },
  normal: { torsoW: 0.55, torsoH: 0.65, armW: 0.14, legW: 0.18, height: 1.0 },
  wide:   { torsoW: 0.68, torsoH: 0.72, armW: 0.17, legW: 0.21, height: 1.0 },
};

export function HeroModel({ bodyColor, appearance, isMoving, isAttacking, isCasting, isDead, hasWeapon, isFlying }: Props) {
  const ap = appearance ?? DEFAULT_APPEARANCE;
  const dims = BODY_SCALE[ap.body] ?? BODY_SCALE.normal;
  const shirt = ap.shirt ?? bodyColor;
  const pants = ap.pants;
  const skin = ap.skin;
  const hair = ap.hair;
  const eye = ap.eye;

  const root = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Mesh>(null);
  const rightLeg = useRef<THREE.Mesh>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const weapon = useRef<THREE.Mesh>(null);
  const castOrb = useRef<THREE.Mesh>(null);
  const castRing = useRef<THREE.Mesh>(null);
  const castLight = useRef<THREE.PointLight>(null);
  const leftEye = useRef<THREE.Mesh>(null);
  const rightEye = useRef<THREE.Mesh>(null);
  const walkPhase = useRef(0);
  const attackPhase = useRef(0);
  const castPhase = useRef(0);
  const nextBlink = useRef(performance.now() + 1000 + Math.random() * 3000);
  const blinkPhase = useRef(0);

  useFrame((_, dt) => {
    if (!root.current) return;
    const moving = isMoving();
    const dead = isDead?.() ?? false;
    const attacking = isAttacking?.() ?? false;

    if (dead) {
      root.current.rotation.x = THREE.MathUtils.lerp(root.current.rotation.x, Math.PI / 2 - 0.2, 0.1);
      root.current.position.y = THREE.MathUtils.lerp(root.current.position.y, -0.4, 0.1);
      return;
    } else {
      root.current.rotation.x = THREE.MathUtils.lerp(root.current.rotation.x, 0, 0.2);
      root.current.position.y = THREE.MathUtils.lerp(root.current.position.y, 0, 0.2);
    }

    if (moving) {
      walkPhase.current += dt * 9;
    } else {
      walkPhase.current *= 0.8;
    }
    const swing = Math.sin(walkPhase.current) * (moving ? 0.7 : 0.05);
    if (leftLeg.current) leftLeg.current.rotation.x = swing;
    if (rightLeg.current) rightLeg.current.rotation.x = -swing;
    if (leftArm.current) leftArm.current.rotation.x = -swing * 0.6;
    if (rightArm.current && attackPhase.current <= 0) rightArm.current.rotation.x = swing * 0.6;

    if (castPhase.current <= 0) {
      const bob = moving ? Math.abs(Math.sin(walkPhase.current)) * 0.05 : Math.sin(performance.now() * 0.003) * 0.04;
      root.current.position.y = (dead ? root.current.position.y : 0) + bob;
    }

    if (attacking && attackPhase.current <= 0) attackPhase.current = 1;
    if (attackPhase.current > 0) {
      attackPhase.current -= dt * 4;
      const t = Math.max(0, attackPhase.current);
      const lunge = Math.sin((1 - t) * Math.PI) * 1.4;
      if (rightArm.current) rightArm.current.rotation.x = -lunge;
    }

    const casting = isCasting?.() ?? false;
    if (casting && castPhase.current <= 0) castPhase.current = 1;
    if (castPhase.current > 0) {
      castPhase.current = Math.max(0, castPhase.current - dt * 1.4);
      const t = castPhase.current;
      const progress = 1 - t;
      const arc = Math.sin(progress * Math.PI);
      const raise = -1.7 * (progress < 0.85 ? 1 : 1 - (progress - 0.85) / 0.15);
      if (leftArm.current) leftArm.current.rotation.x = raise;
      if (rightArm.current && attackPhase.current <= 0) rightArm.current.rotation.x = raise;
      if (root.current && !dead) root.current.position.y = bobBase(progress) - 0.05 * arc;
      if (castOrb.current) {
        castOrb.current.visible = true;
        const s = 0.5 + arc * 1.2;
        castOrb.current.scale.set(s, s, s);
        const mat = castOrb.current.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.7 + arc * 0.3;
      }
      if (castRing.current) {
        castRing.current.visible = true;
        castRing.current.rotation.z = progress * Math.PI * 4;
        const rs = 0.5 + arc * 1.0;
        castRing.current.scale.set(rs, rs, 1);
        (castRing.current.material as THREE.MeshBasicMaterial).opacity = 0.7 * arc + 0.2;
      }
      if (castLight.current) {
        castLight.current.visible = true;
        castLight.current.intensity = 2 + arc * 4;
      }
    } else {
      if (castOrb.current) castOrb.current.visible = false;
      if (castRing.current) castRing.current.visible = false;
      if (castLight.current) castLight.current.visible = false;
    }

    // -- Flying pose override (superman pose) --
    if (isFlying?.()) {
      // Arms forward (raised up so when body tilts horizontal, arms point ahead)
      const armPose = -Math.PI * 0.85; // nearly straight forward
      if (leftArm.current) leftArm.current.rotation.x = armPose;
      if (rightArm.current && attackPhase.current <= 0) rightArm.current.rotation.x = armPose;
      // Legs together + slightly back (trailing)
      const legPose = -0.25;
      if (leftLeg.current) leftLeg.current.rotation.x = legPose;
      if (rightLeg.current) rightLeg.current.rotation.x = legPose;
      // Disable walk bob while flying
      if (root.current && castPhase.current <= 0) root.current.position.y = 0;
    }

    // -- Cute blinking eyes --
    const now = performance.now();
    if (blinkPhase.current > 0) {
      blinkPhase.current -= dt * 8; // blink lasts ~0.12s
      const closed = blinkPhase.current > 0;
      const sy = closed ? 0.1 : 1;
      if (leftEye.current) leftEye.current.scale.y = sy;
      if (rightEye.current) rightEye.current.scale.y = sy;
    } else if (now >= nextBlink.current) {
      blinkPhase.current = 1;
      nextBlink.current = now + 2500 + Math.random() * 3500;
    } else {
      if (leftEye.current) leftEye.current.scale.y = 1;
      if (rightEye.current) rightEye.current.scale.y = 1;
    }
  });

  // computed layout values from body shape
  const legY = 0.35;
  const torsoY = 0.95;
  const headY = 1.55;
  const armShoulderY = 1.18;

  return (
    <group ref={root}>
      {/* legs — rounded capsules instead of rectangular boxes */}
      <RoundLimb ref={leftLeg} length={0.55} radius={dims.legW * 0.5} color={pants} position={[-dims.legW * 0.95, legY, 0]} />
      <RoundLimb ref={rightLeg} length={0.55} radius={dims.legW * 0.5} color={pants} position={[dims.legW * 0.95, legY, 0]} />

      {/* torso — capsule scaled to width/depth, reads as a "pill" torso */}
      <RoundTorso width={dims.torsoW} height={dims.torsoH} depth={0.35} color={shirt} position={[0, torsoY, 0]} castShadow />

      {/* arms */}
      <group ref={leftArm} position={[-(dims.torsoW * 0.55 + dims.armW * 0.5), armShoulderY, 0]}>
        <RoundLimb length={0.5} radius={dims.armW * 0.5} color={skin} position={[0, -0.25, 0]} />
      </group>
      <group ref={rightArm} position={[dims.torsoW * 0.55 + dims.armW * 0.5, armShoulderY, 0]}>
        <RoundLimb length={0.5} radius={dims.armW * 0.5} color={skin} position={[0, -0.25, 0]} />
        <mesh ref={weapon} position={[0, -0.55, 0.1]} rotation={[Math.PI * 0.1, 0, 0]} visible={hasWeapon?.() ?? false}>
          <boxGeometry args={[0.06, 0.65, 0.06]} />
          <meshStandardMaterial color="#e5e7eb" metalness={0.5} roughness={0.4} />
        </mesh>
      </group>

      {/* cast vfx */}
      <mesh ref={castOrb} position={[0, 2.1, 0.4]} visible={false}>
        <sphereGeometry args={[0.22, 12, 8]} />
        <meshBasicMaterial color="#67e8f9" transparent />
      </mesh>
      <mesh ref={castRing} position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.7, 0.95, 24]} />
        <meshBasicMaterial color="#22d3ee" transparent side={THREE.DoubleSide} />
      </mesh>
      <pointLight ref={castLight} position={[0, 1.2, 0]} color="#22d3ee" intensity={2} distance={5} visible={false} />

      {/* head -- chibi sized (bigger than torso), rounded instead of a cube */}
      <RoundHead radius={0.32} color={skin} position={[0, headY + 0.05, 0]} />
      {/* eye whites (sparkly) */}
      <mesh position={[-0.13, headY + 0.06, 0.305]}>
        <boxGeometry args={[0.11, 0.13, 0.01]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0.13, headY + 0.06, 0.305]}>
        <boxGeometry args={[0.11, 0.13, 0.01]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      {/* eyes (pupils -- blink) */}
      <mesh ref={leftEye} position={[-0.13, headY + 0.05, 0.31]}>
        <boxGeometry args={[0.07, 0.09, 0.01]} />
        <meshBasicMaterial color={eye} />
      </mesh>
      <mesh ref={rightEye} position={[0.13, headY + 0.05, 0.31]}>
        <boxGeometry args={[0.07, 0.09, 0.01]} />
        <meshBasicMaterial color={eye} />
      </mesh>
      {/* eye highlight (sparkle) */}
      <mesh position={[-0.155, headY + 0.085, 0.315]}>
        <boxGeometry args={[0.02, 0.02, 0.01]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0.155, headY + 0.085, 0.315]}>
        <boxGeometry args={[0.02, 0.02, 0.01]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      {/* cheeks (cute blush) */}
      <mesh position={[-0.22, headY - 0.05, 0.28]}>
        <boxGeometry args={[0.1, 0.06, 0.01]} />
        <meshBasicMaterial color="#fb7185" transparent opacity={0.55} />
      </mesh>
      <mesh position={[0.22, headY - 0.05, 0.28]}>
        <boxGeometry args={[0.1, 0.06, 0.01]} />
        <meshBasicMaterial color="#fb7185" transparent opacity={0.55} />
      </mesh>
      {/* tiny smile */}
      <mesh position={[0, headY - 0.07, 0.305]}>
        <boxGeometry args={[0.1, 0.025, 0.01]} />
        <meshBasicMaterial color="#9a3412" />
      </mesh>

      {/* hair -- wrap in scaled group so hair fits the bigger chibi head */}
      <group scale={[1.25, 1.05, 1.25]} position={[0, headY * 0.04, 0]}>
        <Hair style={ap.hairStyle} color={hair} y={headY + 0.02} />
      </group>
      {/* accessories */}
      <Accessories ap={ap} headY={headY} />
    </group>
  );
}

function Accessories({ ap, headY }: { ap: Appearance; headY: number }) {
  return (
    <>
      {/* Hat */}
      {ap.hat === "cap" && (
        <group position={[0, headY + 0.4, 0]}>
          <mesh scale={[1, 0.65, 1]}><sphereGeometry args={[0.34, 10, 8]} /><meshToonMaterial color={ap.hatColor || "#fbbf24"} gradientMap={toonGradient} /></mesh>
          <mesh position={[0, -0.08, 0.3]}><boxGeometry args={[0.55, 0.06, 0.2]} /><meshToonMaterial color={ap.hatColor || "#fbbf24"} gradientMap={toonGradient} /></mesh>
        </group>
      )}
      {ap.hat === "wizard" && (
        <group position={[0, headY + 0.42, 0]}>
          <mesh><boxGeometry args={[0.6, 0.08, 0.6]} /><meshToonMaterial color={ap.hatColor || "#7c3aed"} gradientMap={toonGradient} /></mesh>
          <RoundSpike radius={0.3} height={0.75} color={ap.hatColor || "#7c3aed"} position={[0, 0.415, 0]} />
          <mesh position={[0, 0.79, 0]}><sphereGeometry args={[0.07, 8, 8]} /><meshStandardMaterial color="#fde047" emissive="#fbbf24" emissiveIntensity={0.6} /></mesh>
        </group>
      )}
      {ap.hat === "crown" && (
        <group position={[0, headY + 0.4, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.26, 0.06, 8, 16]} />
            <meshStandardMaterial color={ap.hatColor || "#fde047"} metalness={0.6} />
          </mesh>
          {[-0.2, 0, 0.2].map((x, i) => (
            <RoundSpike key={`x${i}`} radius={0.045} height={0.2} color={ap.hatColor || "#fde047"} position={[x, 0.15, 0]} />
          ))}
          {[-0.2, 0.2].map((z, i) => (
            <RoundSpike key={`z${i}`} radius={0.045} height={0.2} color={ap.hatColor || "#fde047"} position={[0, 0.15, z]} />
          ))}
          <mesh position={[0, 0.27, 0]}><octahedronGeometry args={[0.06, 0]} /><meshStandardMaterial color="#dc2626" emissive="#dc2626" emissiveIntensity={0.5} /></mesh>
        </group>
      )}
      {ap.hat === "headband" && (
        <group position={[0, headY + 0.18, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.32, 0.045, 6, 16]} />
            <meshToonMaterial color={ap.hatColor || "#f472b6"} gradientMap={toonGradient} />
          </mesh>
          <RoundedBox args={[0.1, 0.06, 0.06]} radius={0.02} smoothness={2} position={[0, 0.03, 0.34]}>
            <meshToonMaterial color={ap.hatColor || "#f472b6"} gradientMap={toonGradient} />
          </RoundedBox>
        </group>
      )}
      {/* Glasses — "round" used to be literally square boxes; now real rings. */}
      {ap.glasses === "round" && (
        <group position={[0, headY + 0.04, 0.32]}>
          <mesh position={[-0.13, 0, 0]}><torusGeometry args={[0.07, 0.015, 6, 12]} /><meshStandardMaterial color="#1f2937" /></mesh>
          <mesh position={[0.13, 0, 0]}><torusGeometry args={[0.07, 0.015, 6, 12]} /><meshStandardMaterial color="#1f2937" /></mesh>
          <mesh position={[0, 0, 0]}><boxGeometry args={[0.13, 0.02, 0.02]} /><meshStandardMaterial color="#1f2937" /></mesh>
        </group>
      )}
      {ap.glasses === "sun" && (
        <group position={[0, headY + 0.04, 0.32]}>
          <RoundedBox args={[0.16, 0.12, 0.02]} radius={0.03} smoothness={2} position={[-0.13, 0, 0]}><meshStandardMaterial color="#000" metalness={0.8} /></RoundedBox>
          <RoundedBox args={[0.16, 0.12, 0.02]} radius={0.03} smoothness={2} position={[0.13, 0, 0]}><meshStandardMaterial color="#000" metalness={0.8} /></RoundedBox>
          <mesh position={[0, 0, 0]}><boxGeometry args={[0.13, 0.02, 0.02]} /><meshStandardMaterial color="#000" /></mesh>
        </group>
      )}
      {/* Scarf */}
      {ap.scarf === "regular" && (
        <group position={[0, 1.32, 0]}>
          <RoundedBox args={[0.55, 0.18, 0.4]} radius={0.06} smoothness={2}><meshToonMaterial color={ap.scarfColor || "#f472b6"} gradientMap={toonGradient} /></RoundedBox>
          <RoundedBox args={[0.12, 0.28, 0.05]} radius={0.03} smoothness={2} position={[0.15, -0.18, 0.18]}><meshToonMaterial color={ap.scarfColor || "#f472b6"} gradientMap={toonGradient} /></RoundedBox>
        </group>
      )}
      {ap.scarf === "long" && (
        <group position={[0, 1.32, 0]}>
          <RoundedBox args={[0.55, 0.18, 0.4]} radius={0.06} smoothness={2}><meshToonMaterial color={ap.scarfColor || "#f472b6"} gradientMap={toonGradient} /></RoundedBox>
          <RoundedBox args={[0.14, 0.7, 0.05]} radius={0.03} smoothness={2} position={[0.18, -0.4, 0.16]}><meshToonMaterial color={ap.scarfColor || "#f472b6"} gradientMap={toonGradient} /></RoundedBox>
          <RoundedBox args={[0.14, 0.5, 0.05]} radius={0.03} smoothness={2} position={[-0.18, -0.3, 0.16]}><meshToonMaterial color={ap.scarfColor || "#f472b6"} gradientMap={toonGradient} /></RoundedBox>
        </group>
      )}
    </>
  );
}

function Hair({ style, color, y }: { style: Appearance["hairStyle"]; color: string; y: number }) {
  if (style === "bald") return null;
  const mt = <meshToonMaterial color={color} gradientMap={toonGradient} />;

  // Every style shares the same rounded scalp dome — only the style-specific
  // extra (back-hair/tail/spikes/bun) differs below.
  const dome = (
    <mesh position={[0, y + 0.22, 0]} scale={[1, 0.55, 1]}>
      <sphereGeometry args={[0.34, 10, 8]} />
      {mt}
    </mesh>
  );

  if (style === "short") {
    return (
      <group>
        {dome}
        <mesh position={[0, y + 0.14, -0.18]} scale={[1, 0.7, 0.6]}>
          <sphereGeometry args={[0.28, 8, 6]} />
          {mt}
        </mesh>
      </group>
    );
  }

  if (style === "long") {
    return (
      <group>
        {dome}
        {/* back hair flowing down to mid-torso */}
        <mesh position={[0, y - 0.22, -0.24]} scale={[1.35, 2.0, 0.45]}>
          <sphereGeometry args={[0.26, 8, 8]} />
          {mt}
        </mesh>
        {/* side bangs */}
        <mesh position={[-0.22, y - 0.05, 0.15]} scale={[0.5, 1.6, 0.9]}>
          <sphereGeometry args={[0.11, 6, 6]} />
          {mt}
        </mesh>
        <mesh position={[0.22, y - 0.05, 0.15]} scale={[0.5, 1.6, 0.9]}>
          <sphereGeometry args={[0.11, 6, 6]} />
          {mt}
        </mesh>
      </group>
    );
  }

  if (style === "ponytail") {
    return (
      <group>
        {dome}
        <RoundLimb length={0.55} radius={0.08} color={color} position={[0, y + 0.02, -0.34]} rotation={[0.5, 0, 0]} />
      </group>
    );
  }

  if (style === "spiky") {
    return (
      <group>
        {dome}
        <RoundSpike radius={0.09} height={0.28} color={color} position={[-0.13, y + 0.4, 0]} rotation={[0, 0, 0.2]} />
        <RoundSpike radius={0.09} height={0.3} color={color} position={[0, y + 0.42, 0]} />
        <RoundSpike radius={0.09} height={0.28} color={color} position={[0.13, y + 0.4, 0]} rotation={[0, 0, -0.2]} />
      </group>
    );
  }

  if (style === "bun") {
    return (
      <group>
        {dome}
        <mesh position={[0, y + 0.43, 0]}>
          <sphereGeometry args={[0.14, 8, 6]} />
          {mt}
        </mesh>
      </group>
    );
  }

  return null;
}
