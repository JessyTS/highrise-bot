const fs = require("node:fs")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

const root = path.resolve(__dirname, "..")
const folders = [path.join(root, "src"), path.join(root, "test")]
const files = [path.join(root, "app.js")]

function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) collect(absolute)
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(absolute)
  }
}

for (const folder of folders) collect(folder)

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" })
  if (result.status !== 0) process.exit(result.status || 1)
}

console.log(`Syntaxe valide : ${files.length} fichiers vérifiés.`)
