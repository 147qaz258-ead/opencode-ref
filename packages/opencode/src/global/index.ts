import fs from "fs/promises"
import path from "path"
import os from "os"

const app = "opencode"

// Project-local storage for cloud deployment
// All data stored in .opencode/ directory within the project
//
// FIX: Use import.meta.dir to resolve path relative to this file
// This ensures data is stored in the correct location regardless of CWD
const projectRoot = path.join(
  process.env.OPENCODE_HOME ||
    path.resolve(import.meta.dir, "../../../../"), // src/global -> src -> opencode -> packages -> root
  ".opencode",
)

// data is just projectRoot, Storage module adds "storage" suffix
const data = projectRoot
const cache = path.join(projectRoot, "cache")
const config = path.join(projectRoot, "config")
const state = path.join(projectRoot, "state")

export namespace Global {
  export const Path = {
    // Allow override via OPENCODE_TEST_HOME for test isolation
    get home() {
      return process.env.OPENCODE_TEST_HOME || os.homedir()
    },
    data,
    bin: path.join(data, "storage", "bin"),
    log: path.join(data, "storage", "log"),
    cache,
    config,
    state,
    // The application root directory (where package.json and .env usually reside)
    root: path.dirname(projectRoot),
  }
}


await Promise.all([
  fs.mkdir(Global.Path.data, { recursive: true }),
  fs.mkdir(Global.Path.config, { recursive: true }),
  fs.mkdir(Global.Path.state, { recursive: true }),
  fs.mkdir(Global.Path.log, { recursive: true }),
  fs.mkdir(Global.Path.bin, { recursive: true }),
])

const CACHE_VERSION = "14"

const version = await Bun.file(path.join(Global.Path.cache, "version"))
  .text()
  .catch(() => "0")

if (version !== CACHE_VERSION) {
  try {
    const contents = await fs.readdir(Global.Path.cache)
    await Promise.all(
      contents.map((item) =>
        fs.rm(path.join(Global.Path.cache, item), {
          recursive: true,
          force: true,
        }),
      ),
    )
  } catch (e) {}
  await Bun.file(path.join(Global.Path.cache, "version")).write(CACHE_VERSION)
}
