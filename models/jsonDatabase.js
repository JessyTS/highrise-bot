const fs = require("fs")
const path = require("path")

const file = path.join(__dirname, "../database.json")

exports.load = () => {
    if (!fs.existsSync(file)) return {}
    return JSON.parse(fs.readFileSync(file, "utf8"))
}

exports.save = (data) => {
    fs.writeFileSync(file, JSON.stringify(data, null, 4))
}
