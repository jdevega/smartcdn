/** @typedef {import('../../types/Server').ServerAdapter} ServerAdapter*/

import express from "express";
import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import tar from "tar";
import multer from "multer";
import os from "node:os";
import cors from "cors";

/**
 * @class
 * @implements {ServerAdapter}
 */
export class ExpressServer {
  /**
   * Create a new ExpressServer instance with the adapters
   * @param {import('../../types/Server').ServerOptions} adapters
   */
  constructor({ database, packagesFolder, uplink, secure, redirections = {} }) {
    this._packagesFolder = packagesFolder;
    this._uplink = uplink;
    this._database = database;
    this._redirections = redirections;
    this._secure = Boolean(secure);

    this._app = express();
    this._app.use(cors());

    this.route(["/", "/search/*", "/view/*"], (req, res) => {
      const { pathname: root } = new URL(
        "../../ui/index.html",
        import.meta.url
      );
      res.sendFile(root);
    });
  }

  get uplink() {
    return this._uplink;
  }

  get packagesFolder() {
    return this._packagesFolder;
  }

  get secure() {
    return this._secure;
  }

  start(host, port) {
    this._host = host;
    this._port = port;

    this._app.listen(port, () =>
      console.log(`SCDN Server listening at http://${host}:${port}`)
    );
  }

  use(middleware) {
    this._app.use(middleware);
  }

  static(folder) {
    this._app.use(express.static(folder));
  }

  route(paths, options, ...fns) {
    const _resultFn = typeof options === "function" ? options : fns.pop();
    const _options = typeof options === "object" ? options : {};

    let method = this._app.get.bind(this._app);
    if (_options.method) {
      method = this._app[_options.method.toLowerCase()].bind(this._app);
    }

    [].concat(paths).forEach((path) => {
      method(path, ...fns, async (req, res) => {
        const response = await _resultFn(req, {
          redirect: res.redirect.bind(res),
          sendFile: res.sendFile.bind(res),
        });
        if (typeof response === "object") {
          const { status = 200, ...data } = response;
          res.status(status).send(data);
        }
      });
    });
  }

  redirect(path, response) {
    response.redirect(path);
  }
  get middlewares() {
    return {
      uploadPackage: [
        multer({ dest: os.tmpdir() }).single("package"),
        createUploadPackageMiddleware(this._packagesFolder),
      ],
      staticWithSourceMap: staticWithSourceMap.bind(this),
      serveRedirections: serveRedirections.bind(this),
      redirections: redirections.bind(this),
    };
  }
}

function createUploadPackageMiddleware(packagePath) {
  return async function uploadPackageMiddleware(req, res, next) {
    const { file } = req;
    const [readStream, extractPath] = await extractPackage(file);
    readStream.on("end", async () => {
      const packageJsonContent = parseJsonFile(
        path.join(extractPath, "package.json")
      );
      const { name, version } = packageJsonContent;

      const destinationPath = path.join(packagePath, name, version);
      fs.rmSync(destinationPath, { recursive: true, force: true });
      fs.mkdirSync(destinationPath, { recursive: true });

      fs.cpSync(extractPath, destinationPath, { recursive: true });
      fs.rmSync(extractPath, { recursive: true, force: true });

      req.packageJsonContent = packageJsonContent;

      await next();
    });
  };
}

async function staticWithSourceMap(req, res, next) {
  if (req.path.endsWith(".js")) {
    const fileName = req.path.split("/").pop();
    const filePath = path.join(this._packagesFolder, req.path);
    const sourceMapPath = filePath + ".map";
    try {
      fs.statSync(filePath);

      try {
        fs.statSync(sourceMapPath);

        res
          .set("Content-Type", "application/javascript")
          .set("SourceMap", `${fileName}.map`);

        await fs
          .createReadStream(filePath)
          .on("end", () => {
            res.write(`\n//# sourceMappingURL=${fileName}.map`);
          })
          .pipe(res);
      } catch (error) {
        res.set("Cache-control", "public, immutable");
        res.sendFile(filePath);
      }
    } catch (error) {
      await next();
    }
  } else {
    await next();
  }
}

async function serveRedirections(req, res, next) {
  const redirection = this._redirections[req.path.slice(1)];
  if (redirection) {
    console.log(
      `[info]: Redirecting based on import map from ${req.path} to ${redirection} .`
    );
    res.redirect(redirection);
  } else {
    await next();
  }
}

function redirections(req, res) {
  const hostAndPort = `http://${this._host}:${this._port}`;
  const redirections = Object.keys(this._redirections).reduce((result, key) => {
    result[key] = [hostAndPort, this._redirections[key]].join("");
    return result;
  }, {});
  return redirections;
}

/**
 *
 * @param {*} file
 * @returns {Promise<[fs.ReadStream, string]>}
 */
async function extractPackage(file) {
  const extractPath = path.join(file.destination, "scdn_tmp_package");
  await fsp.mkdir(extractPath, { recursive: true });
  const rs = fs.createReadStream(file.path);
  // @ts-ignore
  rs.pipe(tar.x({ cwd: extractPath, sync: true }));
  return [rs, extractPath];
}

function parseJsonFile(path) {
  const packageJsonContent = fs.readFileSync(path);

  return JSON.parse(packageJsonContent.toString());
}
