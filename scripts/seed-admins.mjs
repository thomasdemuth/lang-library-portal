// Seeds the starting management accounts. Run:  npm run seed
// Reads scripts/seed.local.json (gitignored — never commit passwords):
//   [{ "username": "…", "email": "…", "name": "…", "password": "…" }, …]
// Idempotent: re-running updates the same usernames (and bumps session_v).
import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";

const scrypt = promisify(scryptCb);

const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt:16384:8:1:${salt.toString("base64")}:${key.toString("base64")}`;
}

let seeds;
try {
  seeds = JSON.parse(await readFile(new URL("./seed.local.json", import.meta.url), "utf8"));
} catch {
  console.error("Create scripts/seed.local.json (copy seed.local.example.json).");
  process.exit(1);
}

for (const s of seeds) {
  if (!s.username || !s.email || !s.name || !s.password || s.password.length < 10) {
    console.error(`Skipping invalid entry (need username/email/name and a 10+ char password):`, s.username ?? s);
    process.exitCode = 1;
    continue;
  }
  const body = {
    username: s.username.toLowerCase(),
    email: s.email.toLowerCase(),
    name: s.name,
    password_hash: await hashPassword(s.password),
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/admins?on_conflict=username`, {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`✗ ${body.username}: ${res.status} ${await res.text()}`);
    process.exitCode = 1;
  } else {
    const [row] = await res.json();
    console.log(`✓ ${row.username}  (${row.email})  id=${row.id}`);
  }
}
console.log("Done. Passwords in seed.local.json can now be deleted if you like.");
