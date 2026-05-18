import { useStore } from "./store";
import { Login } from "./ui/Login";
import { CharacterSelect } from "./ui/CharacterSelect";
import { Game } from "./Game";

export function App() {
  const token = useStore((s) => s.token);
  const characterId = useStore((s) => s.characterId);
  if (!token) return <Login />;
  if (!characterId) return <CharacterSelect />;
  return <Game />;
}
