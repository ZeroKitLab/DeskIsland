import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite 配置：tauri dev 需要固定端口并禁用自动打开浏览器
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    target: "es2021",
    minify: "esbuild",
    sourcemap: false,
  },
});
