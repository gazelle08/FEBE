import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  publicDir: "Asset",
  server: {
    open: "/HTML/landing-page.html",
  },
  build: {
    rollupOptions: {
      input: {
        main: "HTML/landing-page.html",  
      }
    }
  }
});