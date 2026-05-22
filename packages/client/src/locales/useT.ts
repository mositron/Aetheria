import { th } from "./th";
import { en } from "./en";
import { useStore } from "../store";

const locales = { th, en } as const;

export type Lang = keyof typeof locales;

export function useT() {
  const lang = useStore((s) => s.lang);
  return (key: string, params?: Record<string, string | number>): string => {
    const locale = locales[lang as Lang] ?? locales.th;
    let text = (locale as Record<string, string>)[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
    }
    return text;
  };
}
