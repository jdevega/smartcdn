# Smart CDN
A static server with some smart features.

This was a personal project that I found useful and I wanted to share it. It basically is a static content server with some extra features that I found interesting to have.

## Features

- **Static Content Server**: Serve files from a folder.
- **CLI**: Command line utility to start the server and publish packages to it.
- **Semver routes**: Use semver in the version segment of the URL to get the latest matching version.
- **SourceMap**: Add a source map header and reference at the end of each file to serve source map files to the browser.
- **Uplink server**: Fallback server to request files not found in the local one.
- **ImportMap**: Include redirections for paths.
- **Cache**: Add long term cache
- **Config file path**: Point to a config file out of the directory where the server has been started.
- **Watch mode**: Auto publish a package every time a file is updated in the folder where the bundled code is dropped.
- **Secure Mode**: The server rejects to override a version already published.

Coming soon:

- **Web UI**: A web interface to search and inspect published packages and server configuration.
- **Popular CDNs as uplinks**: Configure the server to use CDNs such as Skypack as uplink using a single option ( --uplink-skypack ).

## Getting started

Install it globally using yarn or npm

```js
npm install -g scdn
```

## Configuration

The server can be configured using ENV variables and/or using a config file. ENV variables take precedence over config file values.

ENV variables you can set are: `port`, `packagesFolder` and `uplink`.

The config file should be placed in the folder where the server is being started with `scdn.config.js` name. You can set dynamic configuration in this file for different running environments.

```js
const config = {
  host: "my.cdn.com",
  port: 3000,
  packagesFolder: "~/.cdnPackages",
  redirections: {
    "test@latest": "/test/2.0.0/entryPoint.js",
  },
};

if (process.env.NODE_ENV === "production") {
  config.port = 4000;
  config.redirections["test@latest"] = "/test/1.0.0/entryPoint.js";
}

export default config;
```

## CLI

The package includes the `scdn` CLI command.

### scdn start

Starts the server with the default configuration. This command has these options:

- -n, --host: The host name to be used in urls pointing to the server. [default: localhost]
- -p, --port: The port the server will be listening to. [default: 3000]
- -f, --packagesFolder: The path to the folder where the packages are/will be stored. [default: <USER_HOME>/.scdn]
- -u, --uplink: The first URL section of the server to be used as fallback. For example: https://uplink.cdn.com . [default: none]
- -s, --secure: Run the server in secure mode. In secure mode, publishing the same version of a package is forbiden. [default: false]
- -h: Print this help.

Examples:

```bash
> scdn start

> scdn start -s -n my.cdn.com -p 3001 -f /packages -u https://uplink.cdn.com

> scdn start --secure --host my.cdn.com --port 3001 --packagesFolder /packages --uplink https://uplink.cdn.com
```

### scdn publish

Publish a package to the server. The dist folder, package.json and README.md files are pushed to the server and stored. If you are not in the root of the package, or the dist folder is different, or the server is in a different machine, you can configure the options.

- -p, --port: Port number where the server is listening to. [default: 3000]
- -n, --host: host name or ip where the server is hosted. [default: localhost]
- -f, --folder: path to the folder where the the content to publish is placed. [default: ./dist]
- -r, --readme: Path to the README.md to include [default: ./REAME.md]
- -i, --package: Path to re package.json to include. [default: ./package.json]
- -w, --watch: Watch the folder to publish the content when it changes.
- -h: Print this help.

Examples:

```bash
> scdn publish

> scdn -n 192.168.0.1 -p 3001 -f /packages/todo/bundle -r /packages/todo/README.md -i /pacakges/todo/package.json

> scdn publish -w
```

### scdn view <package>

> Alias: `info`

Retrieve relevant information from any package published in the CDN

Example:

```bash
> scdn view my-package
```

## SemVer Routes

The server supports semmantic versioning in the URL, so routes like these can be used to get latest version matching it.

```js
// from 1.0.0 up to but not including the next minor version (1.1.0)
import "http://localhost:3000/todo/^1.0/index.js";

// from 1.0.0 up to but not including the next major version (2.0.0)
import "http://localhost:3000/todo/~1/index.js";
```
