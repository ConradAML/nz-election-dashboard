import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(() => {
  const isGitHubPagesBuild = process.env.GITHUB_ACTIONS === "true";

  return {
    base: isGitHubPagesBuild ? "/nz-election-dashboard/" : "/",
    plugins: [react()],
    server: { proxy: { "/demo-xml/": {
      target: "https://mediademo.electionresults.govt.nz",
      changeOrigin: true,
      rewrite: (url) => url.replace(/^\/demo-xml\//, "/xml/"),
    } } },
  };
});
