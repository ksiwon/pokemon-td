import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Sentry 릴리스 이름에 쓴다. 릴리스가 없으면 세션·사람 수를 보여 주는 화면이 아예
// 안 열린다(utils/sentry.ts). 커밋마다 새 릴리스를 만들면 사람 수가 그만큼 잘게
// 쪼개지므로, 판이 바뀔 때만 올라가는 package.json 버전을 쓴다.
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: {
    host: "0.0.0.0",
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    },
  },
});