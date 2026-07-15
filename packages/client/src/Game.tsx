import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Client, Room } from "colyseus.js";
import { Canvas } from "@react-three/fiber";
import { Sky, Stars } from "@react-three/drei";
import { MAPS, type MapId, type WorldState } from "@game/shared";
import { useStore } from "./store";
import { Scene } from "./scene/Scene";
import { HUD } from "./ui/HUD";
import { Chat } from "./ui/Chat";
import { Inventory } from "./ui/Inventory";
import { Hotbar } from "./ui/Hotbar";
import { JobPicker } from "./ui/JobPicker";
import { StatPanel } from "./ui/StatPanel";
import { NpcDialog } from "./ui/NpcDialog";
import { QuestLog } from "./ui/QuestLog";
import { StatusBadges } from "./ui/StatusBadges";
import { CastBar } from "./ui/CastBar";
import { PartyPanel } from "./ui/PartyPanel";
import { EventFeed } from "./ui/EventFeed";
import { BossBar } from "./ui/BossBar";
import { LowHpVignette } from "./ui/LowHpVignette";
import { SettingsPanel } from "./ui/SettingsPanel";
import { TouchControls } from "./ui/TouchControls";
import { MenuBar } from "./ui/MenuBar";
import { LoadingScreen } from "./ui/LoadingScreen";
import { DeathOverlay } from "./ui/DeathOverlay";
import { BiomeWidgets } from "./ui/BiomeWidgets";
import { InteractionPrompt } from "./ui/InteractionPrompt";
import { BottomBar } from "./ui/BottomBar";
import { SurvivalEffects } from "./ui/SurvivalEffects";
import { HintSystem } from "./ui/HintSystem";
import { EmoteWheel } from "./ui/EmoteWheel";
import { DailyReward } from "./ui/DailyReward";
import { TutorialFinger } from "./ui/TutorialFinger";
import { LevelUpCelebration } from "./ui/LevelUpCelebration";
import { BossSpawnToast } from "./ui/BossSpawnToast";
import { ItemHotbar } from "./ui/ItemHotbar";
import { ScreenJoystick } from "./ui/ScreenJoystick";
import { WaypointControls } from "./ui/WaypointControls";
import { QuestTracker } from "./ui/QuestTracker";
import { TargetDisplay } from "./ui/TargetDisplay";
import { JobAdvancement } from "./ui/JobAdvancement";
import { Onboarding } from "./ui/Onboarding";
import { WaypointsPanel } from "./ui/WaypointsPanel";
import { useSettings } from "./ui/SettingsPanel";
import { Sprite2DRenderer } from "./scene/Sprite2DRenderer";
import { ViewModeToggle } from "./ui/ViewModeToggle";
import { DayNight } from "./scene/DayNight";
import { useSfx } from "./hooks/useSfx";
import { useMusic } from "./hooks/useMusic";
import * as Sentry from "@sentry/react";

// Heavy / rarely-opened panels — lazy-loaded so they don't bloat initial bundle.
const CraftingPanel = lazy(() => import("./ui/CraftingPanel").then((m) => ({ default: m.CraftingPanel })));
const AchievementsPanel = lazy(() => import("./ui/AchievementsPanel").then((m) => ({ default: m.AchievementsPanel })));
const PhotoMode = lazy(() => import("./ui/PhotoMode").then((m) => ({ default: m.PhotoMode })));
const PetBox = lazy(() => import("./ui/PetBox").then((m) => ({ default: m.PetBox })));
const Leaderboard = lazy(() => import("./ui/Leaderboard").then((m) => ({ default: m.Leaderboard })));
const Mailbox = lazy(() => import("./ui/Mailbox").then((m) => ({ default: m.Mailbox })));
const FriendList = lazy(() => import("./ui/FriendList").then((m) => ({ default: m.FriendList })));
const OnlinePlayers = lazy(() => import("./ui/OnlinePlayers").then((m) => ({ default: m.OnlinePlayers })));
const GuildPanel = lazy(() => import("./ui/GuildPanel").then((m) => ({ default: m.GuildPanel })));
const AuctionHouse = lazy(() => import("./ui/AuctionHouse").then((m) => ({ default: m.AuctionHouse })));
const TradeWindow = lazy(() => import("./ui/TradeWindow").then((m) => ({ default: m.TradeWindow })));
const SkillTreeUI = lazy(() => import("./ui/SkillTreeUI").then((m) => ({ default: m.SkillTreeUI })));
const MarriageUI = lazy(() => import("./ui/MarriageUI").then((m) => ({ default: m.MarriageUI })));
const WorldCompanionPanel = lazy(() => import("./ui/WorldCompanionPanel").then((m) => ({ default: m.WorldCompanionPanel })));
const CombatLog = lazy(() => import("./ui/CombatLog").then((m) => ({ default: m.CombatLog })));
const WorldMap = lazy(() => import("./ui/WorldMap").then((m) => ({ default: m.WorldMap })));

const SERVER_WS = `ws://${location.hostname}:2567`;

export function Game() {
  const { token, characterId, setRoom, pushChat, logout, exitToSelect, viewMode } = useStore();
  useSfx();
  useMusic();
  const [room, setLocalRoom] = useState<Room<WorldState> | null>(null);
  const [ready, setReady] = useState(false);
  const [mapId, setMapId] = useState<MapId>("field");
  const [error, setError] = useState<string | null>(null);
  const [showCompanion, setShowCompanion] = useState(false);
  const clientRef = useRef<Client | null>(null);
  const settings = useSettings();
  const isTouch = typeof window !== "undefined" && matchMedia("(hover: none) and (pointer: coarse)").matches;

  useEffect(() => {
    if (!clientRef.current) clientRef.current = new Client(SERVER_WS);
    const client = clientRef.current;
    let active = true;
    let currentRoom: Room<WorldState> | null = null;
    setReady(false);

    async function connect(targetMap: MapId) {
      try {
        // safety: if joinOrCreate hangs > 12s, throw so we show an error instead of staring at the loading screen forever
        // one WorldRoom handles all mapIds — warp via state.mapId changes
        const join = client.joinOrCreate<WorldState>("world", { token, characterId, mapId: targetMap });
        const r = await Promise.race([
          join,
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("เซิร์ฟเวอร์ไม่ตอบสนอง (timeout) — ลองรีสตาร์ทเซิร์ฟเวอร์")), 12000)),
        ]);
        if (!active) { r.leave(); return; }
        currentRoom = r;
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(() => reject(new Error("ซิงค์สเตทล้มเหลว — อาจมี schema ไม่ตรงกัน (ลอง regen Prisma + รีสตาร์ท)")), 8000);
          if (r.state && r.state.players) { clearTimeout(t); return resolve(); }
          r.onStateChange.once(() => { clearTimeout(t); resolve(); });
        });
        if (!active) { r.leave(); return; }
        setLocalRoom(r);
        setRoom(r);
        setReady(true);
        r.onMessage("chat", (m: any) => pushChat(m));
        r.onMessage("whisper" as any, (m: any) => pushChat({ from: `🔒 ${m.from}`, text: m.text, ts: m.ts }));
        // Early sink for "fishing" — the InteractionPrompt panel that owns
        // this message mounts lazily, so without a placeholder colyseus.js
        // spams "onMessage() not registered" until the panel appears.
        r.onMessage("fishing" as any, () => {});
        r.onMessage("proposal_received", ({ fromName }: any) => {
          if (confirm(`💍 ${fromName} ขอแต่งงานกับคุณ! ยอมรับหรือไม่?`)) {
            r.send("accept_proposal", { proposerName: fromName });
          } else {
            r.send("decline_proposal", { proposerName: fromName });
          }
        });
        // WorldRoom: warp is state.mapId change → Colyseus state sync handles scene reload
        // The "warp" message is kept for any legacy code that still sends it
        r.onMessage("warp", async (m: any) => {
          // For world room, mapId changes via state — just update local mapId to trigger re-render
          setMapId(m.mapId);
        });
        r.onLeave(() => { if (currentRoom === r) { setRoom(null); setReady(false); } });
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        // distinguish auth failures (token bad/expired) from network failures
        const isAuthErr = /invalid token|missing token|unauthorized/i.test(msg);
        const isCharErr = /missing characterId|no character|character already in game/i.test(msg);
        if (isAuthErr) {
          logout();
        } else if (isCharErr) {
          // bounce back to character select
          exitToSelect();
        } else {
          setError(msg);
          // auto-retry network errors after a short delay
          setTimeout(() => { if (active) connect(targetMap); }, 3000);
        }
      }
    }

    connect(mapId);
    return () => {
      active = false;
      currentRoom?.leave();
      setRoom(null);
    };
     
  }, [token, characterId, mapId]);

// World companion panel toggle
  useEffect(() => {
    const onToggle = () => setShowCompanion((v) => !v);
    window.addEventListener("toggle-companions", onToggle);
    return () => window.removeEventListener("toggle-companions", onToggle);
  }, []);

// Global mailbox unread-count subscription → updates the menu-bar badge
  useEffect(() => {
    if (!room) return;
    const setMailUnread = useStore.getState().setMailUnread;
    const off = room.onMessage("mail:unreadCount" as any, (m: any) => {
      if (typeof m?.count === "number") setMailUnread(m.count);
    });
    return () => off?.();
  }, [room]);

  if (error) {
    return <LoadingScreen title="การเชื่อมต่อขัดข้อง" subtitle={error} onLogout={logout} retrying />;
  }

  if (!room || !ready) {
    return <LoadingScreen title={`เข้าสู่ ${MAPS[mapId].name}`} subtitle="กำลังโหลดโลก..." />;
  }

  const isDungeon = mapId === "dungeon";
  const useShadows = settings.shadows && !isTouch;
  const useHighQ = settings.highQuality && !isTouch;

return (
    <div id="game-canvas" className="w-full h-full relative">
      <a href="#game-canvas" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-cyan-600 focus:text-white focus:rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-300">
        ข้ามไปเนื้อหาหลัก
      </a>
{viewMode === "3d" ? (
        <Canvas
          shadows={useShadows ? { type: 1, enabled: true } : false}
          gl={{ antialias: useHighQ, powerPreference: "high-performance" }}
          dpr={useHighQ ? [1, 1.5] : [1, 1]}
          camera={{ position: [0, 12, 12], fov: 55 }}
        >
          {isDungeon ? (
            <>
              <color attach="background" args={["#0a0517"]} />
              <Stars radius={50} depth={40} count={1500} factor={4} fade speed={0.5} />
              <ambientLight intensity={0.25} />
              <directionalLight position={[10, 15, 5]} intensity={0.5} castShadow />
            </>
          ) : (
            <DayNight mapId={mapId} />
          )}
          <Sentry.ErrorBoundary fallback={<div className="text-white p-4">เกิดข้อผิดพลาด กรุณารีเฟรชหน้า</div>}>
            <Scene room={room} />
          </Sentry.ErrorBoundary>
        </Canvas>
      ) : (
        <Sprite2DRenderer
          room={room}
          mapId={mapId}
        />
      )}
      <HUD room={room} />
      <MenuBar />
      <TouchControls room={room} />
      <DeathOverlay room={room} />
      <BiomeWidgets room={room} />
      <InteractionPrompt room={room} />
      <BottomBar room={room} />
      <SurvivalEffects room={room} />
      <Suspense fallback={null}>
        <CraftingPanel room={room} />
        <AchievementsPanel room={room} />
        <PhotoMode />
<PetBox room={room} />
        <SkillTreeUI room={room} />
        <Leaderboard />
        <Mailbox room={room} />
        <FriendList room={room} />
        <OnlinePlayers room={room} />
        <GuildPanel room={room} />
        <AuctionHouse room={room} />
        <TradeWindow room={room} />
        <CombatLog room={room} />
        <WorldMap room={room} />
      </Suspense>
      <HintSystem room={room} />
      <EmoteWheel room={room} />
      <DailyReward room={room} />
      <TutorialFinger room={room} />
      <LevelUpCelebration room={room} />
      <BossSpawnToast room={room} />
      <ItemHotbar room={room} />
      <ScreenJoystick />
      <WaypointControls />
      <QuestTracker room={room} />
      <TargetDisplay room={room} />
      <JobAdvancement room={room} />
      <Onboarding room={room} />
<WaypointsPanel />
      <MarriageUI room={room} />
      <Chat room={room} />
      <Inventory room={room} />
      <Hotbar room={room} />
      <JobPicker room={room} />
      <StatPanel room={room} />
      <NpcDialog room={room} />
      <QuestLog room={room} />
      <StatusBadges room={room} />
      {/* Minimap is rendered inside HUD's top-right column */}
      <CastBar room={room} />
      <PartyPanel room={room} />
      <EventFeed room={room} />
      <BossBar room={room} />
      <LowHpVignette room={room} />
      <SettingsPanel />
<Suspense fallback={null}>
        {showCompanion && <WorldCompanionPanel room={room} />}
      </Suspense>
    </div>
  );
}
