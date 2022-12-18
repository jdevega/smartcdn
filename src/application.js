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
    async getLastPublishedPackages(limit = 12) {
      const values = await database.values();

      return {
        total: values.length,
        packages: values
          .sort(sortByCreated)
          .reduce(groupByName, [])
          .slice(0, limit),
      };
    },
    async findPublishedPackages(query) {
      const keys = await database.keys();
      const matchedKeys = keys.reduce((result, key) => {
        if (key.includes(query)) result.push(key);
        return result;
      }, []);

      let packages = [];
      try {
        packages = await Promise.all(
          matchedKeys.map(database.get.bind(database))
        );

        packages = packages.sort(sortByCreated).reduce(groupByName, []);
      } catch (error) {
        packages = [];
      }

      return { packages };
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
      const exists = await database.exist(key);
      if (server.secure && exists) {
        throw Error(
          "## [Error]: Packages cannot be overwritten in secure mode."
        );
      }
      if (!exists) {
        info.created = Date.now();
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

  return pkgJsonFiles.map((packageJsonFilePath) => {
    const packageJsonContent = parseJsonFile(packageJsonFilePath);

    let readme;
    try {
      readme = readReadmeFile(path.dirname(packageJsonFilePath));
    } catch (error) {
      return packageJsonContent;
    }

    return { ...packageJsonContent, readme };
  });
}

function readReadmeFile(filePath) {
  return fs.readFileSync(path.join(filePath, "README.md")).toString();
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

function groupByName(result, item) {
  function hasItemWithName(name) {
    return result.find((i) => i.name === name);
  }

  const currentItem = hasItemWithName(item.name);
  if (!currentItem) {
    item.versions = [item.version];
    result.push(item);
  } else {
    currentItem.versions.push(item.version);
  }
  return result;
}
