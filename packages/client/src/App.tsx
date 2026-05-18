import { useStore } from "./store";
import { Login } from "./ui/Login";
import { CharacterSelect } from "./ui/CharacterSelect";
import { Game } from "./Game";
import { OrientationHint } from "./ui/OrientationPrompt";

export function App() {
  const token = useStore((s) => s.token);
  const characterId = useStore((s) => s.characterId);
  return (
    <>
      <OrientationHint />
      {!token ? <Login /> : !characterId ? <CharacterSelect /> : <Game />}
    </>
  );
}
