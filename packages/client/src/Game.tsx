import { useEffect, useRef, useState } from "react";
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
import { CraftingPanel } from "./ui/CraftingPanel";
import { AchievementsPanel } from "./ui/AchievementsPanel";
import { HintSystem } from "./ui/HintSystem";
import { EmoteWheel } from "./ui/EmoteWheel";
import { DailyReward } from "./ui/DailyReward";
import { PhotoMode } from "./ui/PhotoMode";
import { TutorialFinger } from "./ui/TutorialFinger";
import { PetBox } from "./ui/PetBox";
import { LevelUpCelebration } from "./ui/LevelUpCelebration";
import { ScreenJoystick } from "./ui/ScreenJoystick";
import { Leaderboard } from "./ui/Leaderboard";
import { Mailbox } from "./ui/Mailbox";
import { WaypointControls } from "./ui/WaypointControls";
import { QuestTracker } from "./ui/QuestTracker";
import { TargetDisplay } from "./ui/TargetDisplay";
import { FriendList } from "./ui/FriendList";
import { GuildPanel } from "./ui/GuildPanel";
import { AuctionHouse } from "./ui/AuctionHouse";
import { useSettings } from "./ui/SettingsPanel";
import { DayNight } from "./scene/DayNight";
import { useSfx } from "./hooks/useSfx";

const SERVER_WS = `ws://${location.hostname}:2567`;

export function Game() {
  const { token, characterId, setRoom, pushChat, logout, exitToSelect } = useStore();
  useSfx();
  const [room, setLocalRoom] = useState<Room<WorldState> | null>(null);
  const [ready, setReady] = useState(false);
  const [mapId, setMapId] = useState<MapId>("field");
  const [error, setError] = useState<string | null>(null);
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
        const join = client.joinOrCreate<WorldState>(`map_${targetMap}`, { token, characterId, mapId: targetMap });
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
        r.onMessage("warp", async (m: any) => {
          await r.leave();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, characterId, mapId]);

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
    <div className="w-full h-full relative">
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
        <Scene room={room} />
      </Canvas>
      <HUD room={room} />
      <MenuBar />
      <TouchControls room={room} />
      <DeathOverlay room={room} />
      <BiomeWidgets room={room} />
      <InteractionPrompt room={room} />
      <BottomBar room={room} />
      <SurvivalEffects room={room} />
      <CraftingPanel room={room} />
      <AchievementsPanel room={room} />
      <HintSystem room={room} />
      <EmoteWheel room={room} />
      <DailyReward room={room} />
      <PhotoMode />
      <TutorialFinger room={room} />
      <PetBox room={room} />
      <LevelUpCelebration room={room} />
      <ScreenJoystick />
      <Leaderboard />
      <Mailbox room={room} />
      <WaypointControls />
      <QuestTracker room={room} />
      <TargetDisplay room={room} />
      <FriendList room={room} />
      <GuildPanel room={room} />
      <AuctionHouse room={room} />
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
    </div>
  );
}
