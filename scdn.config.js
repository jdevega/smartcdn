import os from "node:os";
import path from "node:path";

export default {
  redirections: {
    "ing-feat-layout/1.0.2/gema_application-header.js":
      "/ing-feat-layout/1.0.1/gema_application-header.js",
    "router@latest": "/ing-web-es_router/1.8.0/dist-router/interface.js",
  },
  port: 3000,
  host: "localhost",
  secure: true,
  packagesFolder: path.join(os.homedir(), ".scdn"),
  uplink: "https://cdnjs.cloudflare.com/ajax/libs/",
};
