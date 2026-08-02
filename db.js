const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const DB_PATH = process.env.SQLITE_DB_PATH || path.join(__dirname, "practice.db");
const SCHEMA_PATH = path.join(__dirname, "setup.sql");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);

// Rebuilds the schema fresh on every boot, matching setup.sql's re-runnable design.
function initSchema() {
  const schema = fs.readFileSync(SCHEMA_PATH, "utf8");
  db.exec(schema);
}

module.exports = { db, initSchema };
