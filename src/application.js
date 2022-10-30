import fg from "fast-glob";
import fs from "node:fs";
import path from "node:path";
import { rcompare, coerce, maxSatisfying } from "semver";

import { Package } from "./domain/Package.js";

const KEY_SEPARATOR = "#";

export function createApplication({ database, server, uplink }) {
  return {
    start(host, port) {
      const pkgs = readFolderPackages(server.packagesFolder);
      database.initialize(packagesToData(pkgs));
      server.start(host, port);
    },
    async getLastPublishedPackages(limit = 10) {
      const values = await database.values();

      return values.sort(sortByCreated).slice(0, limit);
    },
    async versions(name) {
      const keys = await database.keys();
      const versions = keys.reduce((result, key) => {
        const [pkgName, version] = extractDatabaseKeyData(key);
        if (pkgName === name) result.push(version);
        return result;
      }, []);

      return versions;
    },
    async getPackage(name) {
      const versions = await this.versions(name);
      const lastVersion = versions.sort(rcompare)?.[0];

      return this.getPackageVersion(name, lastVersion);
    },
    async getPackageVersion(name, version) {
      const packageInfo = await database.get(databaseKey({ name, version }));
      if (!packageInfo)
        throw Error(`## [Error]: No info in database for ${name}@${version} .`);
      return new Package(packageInfo);
    },
    async getSemverVersion(name, version) {
      let _version = coerce(version);

      if (_version && _version.toString() !== version) {
        const versions = await this.versions(name);
        return maxSatisfying(versions, version)?.toString() || _version;
      } else {
        return _version;
      }
    },
    async savePackage(info) {
      const key = databaseKey(info);
      if (server.secure && (await database.exist(key))) {
        throw Error(
          "## [Error]: Packages cannot be overwritten in secure mode."
        );
      }
      database.set(databaseKey(info), info);
    },

    async getFileFromUplink({ name, version, file }) {
      if (!uplink) throw Error("## [Error]: No uplink provided.");

      const packageName = uplink.parseScopedName(name);
      const content = await uplink.get({ name, version, file });

      try {
        await this.getPackageVersion(packageName, version);
      } catch (error) {
        const packageJsonContent = this.constructPackageJson({
          name: packageName,
          version,
          uplink,
        });

        this.saveFile(
          path.join(name, version, "package.json"),
          JSON.stringify(packageJsonContent)
        );

        database.set(
          databaseKey({ name: packageName, version }),
          packageJsonContent
        );
      }

      return this.saveFile(path.join(name, version, file), content);
    },

    saveFile(filePath, content) {
      // The File System calls should be replaced with an adapter in the future to allow different ways of saving files.
      const pathSegments = filePath.split("/");
      const fileName = pathSegments.pop();
      const destinationPath = path.join(server.packagesFolder, ...pathSegments);
      const destinationFile = path.join(destinationPath, fileName);

      fs.mkdirSync(destinationPath, { recursive: true });
      fs.writeFileSync(destinationFile, content);
      return destinationFile;
    },

    getUplinkScopedName(scope, name) {
      return uplink.scopedName(scope, name);
    },

    constructPackageJson({ name, version, uplink }) {
      return {
        name,
        version,
        uplink: uplink.host,
        created: Date.now(),
      };
    },
  };
}

function readFolderPackages(folder) {
  const pkgJsonFiles = fg.sync(`${folder}/**/package.json`);

  return pkgJsonFiles.map(parseJsonFile);
}

function parseJsonFile(path) {
  const packageJsonContent = fs.readFileSync(path);
  const { ctimeMs } = fs.statSync(path);

  return { ...JSON.parse(packageJsonContent.toString()), created: ctimeMs };
}

function packagesToData(packages) {
  return packages.reduce((data, item) => {
    const pkg = new Package(item);
    data[databaseKey(pkg)] = pkg;
    return data;
  }, {});
}

function databaseKey({ name, version }) {
  return `${name}${KEY_SEPARATOR}${version}`;
}

function extractDatabaseKeyData(key) {
  return key.split(KEY_SEPARATOR);
}

function sortByCreated(a, b) {
  return a.created < b.created ? 1 : -1;
}
