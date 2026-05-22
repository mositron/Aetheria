import { Canvas } from "@react-three/fiber";
import { MenuScene } from "./MenuScene";
import { GameFrame } from "./GameFrame";
import { useT } from "../locales/useT";

type Props = {
  title: string;
  subtitle?: string;
  retrying?: boolean;
  onLogout?: () => void;
};

export function LoadingScreen({ title, subtitle, retrying, onLogout }: Props) {
  const t = useT();
  return (
    <div className="w-full h-full relative overflow-hidden">
      <div className="absolute inset-0">
        <Canvas camera={{ position: [0, 2, 10], fov: 50 }} dpr={[1, 1.25]} gl={{ antialias: true }}>
          <MenuScene variant="dungeon" />
        </Canvas>
      </div>
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.85)_100%)]" />

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-[24rem]">
          <GameFrame title={retrying ? t("loading.error") : t("loading.enteringWorld")} variant={retrying ? "violet" : "cyan"}>
            <div className="space-y-4 py-2 text-center">
              <div className="text-2xl font-black tracking-wider bg-gradient-to-b from-white to-cyan-300 text-transparent bg-clip-text">
                {title}
              </div>
              {subtitle && <div className="text-slate-300 text-sm">{subtitle}</div>}

              {!retrying && (
                <div className="flex justify-center gap-1.5 py-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              )}
              {retrying && (
                <>
                  <div className="text-amber-300 text-xs animate-pulse">{t("loading.reconnecting")}</div>
                  {onLogout && (
                    <button onClick={onLogout} className="btn-game danger text-xs">
                      {t("loading.logout")}
                    </button>
                  )}
                </>
              )}
            </div>
          </GameFrame>
        </div>
      </div>
    </div>
  );
}