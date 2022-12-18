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
const chalk = require("chalk");
const relativeDate = require("tiny-relative-date");
const columns = require("cli-columns");

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
    const config = parseFolder(
      args.config || process.env.config || "scdn.config.js"
    );
    const watch = args.watch || process.env.watch;
    const secure = args.secure || process.env.secure;

    return {
      host,
      port,
      packagesFolder,
      sourceFolder,
      readmePath,
      packagePath,
      config,
      watch,
      secure,
    };
  }

  function parseFolder(folder) {
    if (!folder) return undefined;
    if (folder[0] === "~") return path.join(os.homedir(), folder.slice(1));
    return folder;
  }

  /** @type {import("../types/Options").CommandLineOptions} */
  // @ts-ignore
  const { host, port, sourceFolder, readmePath, packagePath, config, secure } =
    parseOptions();

  // @ts-ignore
  const argv = yargs(hideBin(process.argv))
    .usage("$0 <command> [options]")
    .command(
      "start",
      "Start the CDN server.",
      {
        host: {
          alias: "n",
          description: "Host name where the server is hosted",
          default: host,
        },
        port: {
          alias: "p",
          description: "Port number where the host will be listening.",
        },
        packagesFolder: {
          alias: "f",
          description:
            "Absolute path to the folder that will be used to store the files.",
        },
        uplink: {
          alias: "u",
          description:
            "The host name to be used as fallback to request files from.",
        },
        config: {
          alias: "c",
          description: "Path of the config file",
          default: config,
        },
        secure: {
          alias: "s",
          description: "Run server in secure mode.",
        },
      },
      start
    )
    .command(
      "publish",
      "Publish a package to the CDN host.",
      {
        host: {
          alias: "n",
          type: "string",
          description: "Server's hostname or IP",
          default: host,
        },
        port: {
          alias: "p",
          type: "number",
          description: "Port number where the server is listening at",
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
        watch: {
          alias: "w",
          type: "boolean",
          description:
            "Publish the package when changes are made to the files in the folder with the content",
        },
      },
      publishPackage
    )
    .command({
      command: "view <package>",
      aliases: ["info"],
      describe: "View detailed info about a package",
      handler: async (argv) => {
        try {
          const pkg = argv.package;
          if (!pkg) throw Error("You forgot the package name?");
          // @ts-ignore
          const response = await fetch(
            `http://${host}:${port}/api/packages/${pkg}`
          );
          if (!response.ok) {
            throw Error(`Package ${pkg} not found.`);
          }
          const packageInfo = await response.json();

          const {
            package: {
              name,
              version,
              keywords,
              entryPoints = [],
              created,
              dependencies = [],
              description,
              uplink,
              author,
            },
            versions,
          } = packageInfo;
          // @ts-ignore

          const deps = Object.keys(dependencies || {}).map((dep) => {
            return `${chalk.yellow(dep)}: ${dependencies[dep]}`;
          });

          console.log(
            chalk.underline.bold(
              `${chalk.green(name)}@${chalk.green(version)}`
            ) +
              " | " +
              (uplink ? "From " + chalk.red(uplink) : "Published locally") +
              " | " +
              "deps: " +
              chalk.green((deps || []).length) +
              " | " +
              "versions: " +
              chalk.yellow(versions.length)
          );

          if (description) {
            console.log(description);
          }

          if (keywords.length) {
            console.log("");
            console.log("keywords:", chalk.yellow(keywords.join(", ")));
          }

          const maxDeps = 24;
          if (deps.length) {
            console.log("");
            console.log("dependencies:");
            console.log(columns(deps.slice(0, maxDeps), { padding: 1 }));
            if (deps.length > maxDeps) {
              console.log(`(...and ${deps.length - maxDeps} more.)`);
            }
          }

          if (entryPoints.length) {
            console.log("");
            console.log("entry points:");
            console.log(
              columns(
                entryPoints.map((entryPoint) => chalk.blueBright(entryPoint)),
                { padding: 1 }
              )
            );
          }

          const maxVersions = 6;
          if (versions.length) {
            console.log("\nversions:");
            console.log(
              columns(
                versions
                  .slice(0, maxVersions)
                  .map((version) => chalk.green(version)),
                {
                  padding: 1,
                }
              )
            );
            if (versions.length > maxVersions) {
              console.log(`(...and ${versions.length - maxVersions} more.)`);
            }
          }

          console.log("");
          console.log(
            "Published",
            chalk.yellow(relativeDate(created)),
            author ? "by " + chalk.yellow(author) : ""
          );
        } catch (error) {
          console.log(chalk.red(error.message));
        }
      },
    })
    .help("h").argv;

  function start(args) {
    const { port, packagesFolder, uplink, config, secure } = args;
    const child = spawn("node", [path.join(__dirname, "..", "src/index.js")], {
      env: {
        PATH: process.env.PATH,
        port,
        packagesFolder,
        uplink,
        config,
        secure,
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
    const { host, port, packagePath, readmePath, sourceFolder, watch } =
      parseOptions(args);

    async function publish() {
      try {
        if (!fileExists(path.join(process.cwd(), sourceFolder)))
          throw Error(`## [Error] Source folder not found ${sourceFolder} .`);
        if (!fileExists(packagePath))
          throw Error(
            `## [Error] package.json file not found at ${packagePath} .`
          );

        const { name, version } = JSON.parse(
          fs.readFileSync(path.join(process.cwd(), packagePath)).toString()
        );

        const readmeFileExists = fileExists(readmePath);
        if (!readmeFileExists)
          console.warn(`## [Warn] README.md file not found at ${readmePath}.`);

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
      } catch (error) {}
    }

    function debounce(func, timeout = 300) {
      let timer;
      return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          try {
            func.apply(this, args);
          } catch (error) {
            clearTimeout(timer);
          }
        }, timeout);
      };
    }

    if (watch) {
      const watchedPath = path.join(process.cwd(), sourceFolder);
      const publishDebounced = debounce(publish, 1000);
      try {
        // @ts-ignore
        fs.watch(watchedPath, {}, (event, filename) => {
          if (packagePath.includes(filename) || readmePath.includes(filename))
            return;
          try {
            fs.readdir(watchedPath, (err, files) => {
              if (!err && files.length) publishDebounced(watchedPath);
            });
          } catch (error) {}
        });
        console.log("## Watching", watchedPath, "to be published on changes.");
      } catch (error) {
        console.log("## [error] Path not found", watchedPath);
      }
    } else {
      publish();
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
