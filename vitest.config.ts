import path from "path";
import { defineConfig } from "vitest/config";

// El alias "@/*" -> "./src/*" ya existe en tsconfig.json (usado por Next.js
// y por el propio código); vitest no lo resuelve solo, así que hace falta
// declararlo también acá para poder testear módulos que importan con "@/".
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
