import { useEffect } from "react";
import { useStore } from "../store";
import { music } from "../sfx/music";

// Hook: call once at app top-level to wire store -> MusicController
export function useMusic() {
  const musicEnabled = useStore((s) => s.musicEnabled);
  const musicVolume = useStore((s) => s.musicVolume);

  useEffect(() => {
    if (musicEnabled) {
      music.start(musicVolume);
    } else {
      music.stop();
    }
    return () => { music.stop(); };
  }, [musicEnabled]);

  useEffect(() => {
    music.setVolume(musicVolume);
  }, [musicVolume]);
}