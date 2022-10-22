#!/usr/bin/env node

// CLI utility to start the host and publish packages to it.

const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const fetch = require("node-fetch");
const { spawn } = require("node:child_process");
const tar = require("tar");
const FormData = require("form-data");

const ONE_CDN_FOLDER = ".scdn";

(async () => {
  function parseOptions(args = {}) {
    require("dotenv").config();
    const host = args.host || process.env.host || "localhost";
    const port = parseInt(args.port || process.env.port || "3000");
    const packagesFolder =
      parseFolder(args.packagesFolder || process.env.packagesFolder) ||
      path.join(os.homedir(), ONE_CDN_FOLDER);
    const sourceFolder =
      args.sourceFolder || process.env.sourceFolder || "dist";
    const readmePath =
      args.readmePath || process.env.readmePath || "./README.md";
    const packagePath =
      args.packgePath || process.env.packagePath || "./package.json";

    return {
      host,
      port,
      packagesFolder,
      sourceFolder,
      readmePath,
      packagePath,
    };
  }

  function parseFolder(folder) {
    if (!folder) return undefined;
    if (folder[0] === "~") return path.join(os.homedir(), folder.slice(1));
    return folder;
  }

  /** @type {import("../types/Options").CommandLineOptions} */
  const { host, port, packagesFolder, sourceFolder, readmePath, packagePath } =
    parseOptions();

  const argv = yargs(hideBin(process.argv))
    .usage("$0 <command> [options]")
    .command(
      "start",
      "Start the CDN server.",
      {
        port: {
          alias: "p",
          description: "Port number where the host will be listening.",
          default: port,
        },
        packagesFolder: {
          alias: "f",
          description:
            "Absolute path to the folder that will be used to store the files.",
          default: packagesFolder,
        },
        uplink: {
          alias: "u",
          description:
            "The host name to be used as fallback to request files from.",
        },
      },
      start
    )
    .command(
      "publish",
      "Publish a package to the CDN host.",
      {
        host: {
          alias: "s",
          type: "string",
          description: "host hostname or IP",
          default: host,
        },
        port: {
          alias: "p",
          type: "number",
          description: "Port number where the host is listening",
          default: port,
        },
        folder: {
          alias: "f",
          type: "string",
          description: "Folder containing the content to publish",
          default: sourceFolder,
        },
        readme: {
          alias: "r",
          type: "string",
          description: "Path to the README.md to include",
          default: readmePath,
        },
        package: {
          alias: "i",
          type: "string",
          description: "Path to the package.json to include",
          default: packagePath,
        },
      },
      publishPackage
    )
    .help("h").argv;

  function start(args) {
    const { port, packagesFolder, uplink } = args;
    const child = spawn("node", [path.join(__dirname, "..", "src/index.js")], {
      env: {
        PATH: process.env.PATH,
        port,
        packagesFolder,
        uplink,
      },
    });

    child.stdout.on("data", (data) => {
      console.log(data.toString());
    });

    child.stderr.on("data", (data) => {
      console.error(`error: ${data}`);
    });

    child.on("error", (error) => {
      console.error(`error: ${error.message}`);
    });

    child.on("close", (code) => {
      console.log(`child process exited with code ${code}`);
    });
  }

  async function publishPackage(args) {
    const { host, port, packagePath, readmePath, sourceFolder } =
      parseOptions(args);

    try {
      if (!fileExists(packagePath))
        throw Error(`[Error] package.json file not found at ${packagePath}.`);

      const { name, version } = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), packagePath)).toString()
      );

      const readmeFileExists = fileExists(readmePath);
      if (!readmeFileExists)
        console.warn(`[Warn] README.md file not found at ${readmePath}.`);

      const artifactPath = createArtifact({
        name,
        version,
        sourceFolder,
        packagePath,
        readmePath: readmeFileExists && readmePath,
      });

      const form = createForm({ name, version, file: artifactPath });
      // @ts-ignore
      const response = await fetch(`http://${host}:${port}/api/packages`, {
        method: "POST",
        body: form,
        headers: form.getHeaders(),
      });

      const { message } = await response.json();

      console.log(message);
    } catch (error) {
      console.error(error);
    }
  }

  function fileExists(path) {
    try {
      fs.existsSync(path);
      return true;
    } catch (err) {
      return false;
    }
  }

  function createArtifact({
    name,
    version,
    sourceFolder,
    packagePath,
    readmePath,
  }) {
    fs.copyFileSync(packagePath, path.join(sourceFolder, packagePath));
    if (readmePath)
      fs.copyFileSync(readmePath, path.join(sourceFolder, readmePath));

    const artifactPath = `${os.tmpdir()}/${name
      .replace("@", "")
      .replace("/", "_")}_${version}.tar`;

    tar.create(
      {
        sync: true,
        gzip: true,
        file: artifactPath,
        cwd: path.join(process.cwd(), sourceFolder),
      },
      ["."]
    );

    return artifactPath;
  }

  function createForm({ name, version, file }) {
    const form = new FormData();
    form.append("name", name);
    form.append("version", version);
    // @ts-ignore
    form.append("package", fs.createReadStream(file));
    return form;
  }
})();
