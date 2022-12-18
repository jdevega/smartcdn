import * as dotenv from "dotenv";
import path from "node:path";
import os from "node:os";

import { ExpressServer } from "./adapters/ExpressServer.js";
import { MemoryDatabase } from "./adapters/MemoryDatabase.js";
import { createApplication } from "./application.js";
import { GenericUplink } from "./adapters/GenericUplink.js";
import { PackageName } from "./domain/PackageName.js";

// Load env variables from .env
dotenv.config();

(async () => {
  // Load variables from config file into process.env
  try {
    let configFilePath =
      process.env.config || path.join(process.cwd(), "scdn.config.js");
    if (!configFilePath.startsWith("/"))
      configFilePath = path.join(process.cwd(), configFilePath);
    const config = await import(configFilePath);

    console.log("## Using config file", configFilePath);

    process.env = { ...config.default, ...process.env };
  } catch (error) {}

  const {
    port = 3000,
    packagesFolder = `${os.homedir()}/.scdn`,
    uplink: uplinkHost,
    host = "localhost",
    secure = false,
  } = process.env;

  console.log("## Host name:", host);
  console.log("## Port:", port);
  console.log("## Secure mode:", secure ? "ON" : "OFF");
  console.log("## Packages folder:", packagesFolder);
  if (uplinkHost) console.log("## Uplink:", uplinkHost);

  const database = new MemoryDatabase();
  const uplink = uplinkHost && new GenericUplink(uplinkHost);
  const server = new ExpressServer({
    database,
    packagesFolder,
    // @ts-ignore
    redirections: process.env.redirections,
    secure: Boolean(secure),
  });

  const application = createApplication({
    server,
    database,
    uplink,
  });

  server.route(
    "/api/packages",
    { method: "POST" },
    ...server.middlewares.uploadPackage,
    async ({ packageJsonContent }) => {
      const { name, version } = packageJsonContent;
      try {
        await application.savePackage(packageJsonContent);
        return {
          message: `[info] Package published at http://localhost:${port}/view/${name}/${version}`,
        };
      } catch (error) {
        return {
          status: 403,
          message: error.message,
        };
      }
    }
  );
  // Redirections
  server.use(server.middlewares.serveRedirections);

  // UI static files
  const { pathname: uiRoot } = new URL("../ui", import.meta.url);
  server.static(uiRoot);

  // Packages static files
  server.static(packagesFolder);

  // JS source map
  server.use(server.middlewares.staticWithSourceMap);

  // API Redirections endpoint
  server.route("/api/redirections", server.middlewares.redirections);

  // API published packages
  server.route(
    "/api/packages",
    async () => await application.getLastPublishedPackages(100)
  );

  // API Last published packages
  server.route(
    "/api/packages/last/:count",
    async ({ params: { count = 12 } }) =>
      await application.getLastPublishedPackages(count)
  );

  // API search for published packages
  server.route(
    "/api/packages/search/:query",
    async ({ params: { query } }) =>
      await application.findPublishedPackages(query)
  );

  server.route(
    ["/api/packages/@:scope/:name", "/api/packages/:name"],
    async ({ params: { scope, name } }) => {
      try {
        const packageName = new PackageName({ scope, name });
        const pkg = await application.getPackage(packageName.name);
        const versions = await application.versions(name);
        return { package: pkg, versions };
      } catch (error) {
        return { message: error.message, status: 404 };
      }
    }
  );
  server.route(
    ["/api/packages/@:scope/:name/:version", "/api/packages/:name/:version"],
    async ({ params: { scope, name, version } }) => {
      try {
        const packageName = new PackageName({ scope, name });
        const pkg = await application.getPackageVersion(
          packageName.name,
          version
        );
        const versions = await application.versions(name);
        return { package: pkg, versions };
      } catch (error) {
        return { message: error.message, status: 404 };
      }
    }
  );

  // Source map
  server.route(
    "/:name/:version/:file.js.map",
    ({ params: { name, version, file } }) => {
      return {
        message: `[warn] Source map not found at /${name}/${version}/${file}.map`,
        status: 404,
      };
    }
  );

  // Scoped packages route
  server.route(
    "/@:scope/:name/:version/:file(*)",
    async ({ params: { scope, name, version, file } }, { redirect }) => {
      const scopedName = application.getUplinkScopedName(scope, name);
      redirect(`/${scopedName}/${version}/${file}`);
    }
  );

  server.route(
    ["/@:scope/:name/:version", "/:name/:version"],
    async ({ params: { scope, name, version } }, { redirect }) => {
      try {
        const packageName = scope ? ["@" + scope, name].join("/") : name;
        const _version = await application.getSemverVersion(
          packageName,
          version
        );
        const pkg = await application.getPackageVersion(packageName, _version);

        redirect(
          `/${application.getUplinkScopedName(
            scope,
            name
          )}/${_version}/${pkg.defaultEntryPoint()}`
        );
      } catch (error) {
        return { message: error.message, status: 404 };
      }
    }
  );

  server.route(
    ["/@:scope/:name", "/:name"],
    /**
     *
     * @param {object} request
     * @param {object} request.params
     * @param {string} request.params.scope
     * @param {string} request.params.name
     * @returns
     */
    async ({ params: { scope, name } }, { redirect }) => {
      try {
        const packageName = new PackageName({ scope, name }); // scope ? ["@" + scope, name].join("/") : name;
        const pkg = await application.getPackage(packageName.name);

        redirect(
          `/${application.getUplinkScopedName(scope, name)}/${
            pkg.version
          }/${pkg.defaultEntryPoint()}`
        );
      } catch (error) {
        return { message: error.message, status: 404 };
      }
    }
  );

  // Normal package route
  server.route(
    "/:name/:version/:file(*)",
    async ({ params: { name, version, file } }, { redirect }) => {
      try {
        // @ts-ignore
        await application.getFileFromUplink({ name, version, file });
        redirect(`/${name}/${version}/${file}`);
      } catch (error) {
        return {
          status: 404,
          message:
            error.message ||
            `[error] ${name}/${version}/${file} file not found in uplink.`,
        };
      }
    }
  );

  application.start(host, port);
})();
