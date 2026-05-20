/**
 * Captures browser console/page errors on /hub using system Chrome.
 * Usage: node scripts/test-hub-page.mjs [baseUrl]
 */
import { chromium } from "playwright";
import pg from "pg";
import { config } from "dotenv";
import { existsSync } from "fs";
import { resolve } from "path";

for (const f of [".env.worktree", ".env"]) {
  const p = resolve(process.cwd(), f);
  if (existsSync(p)) {
    config({ path: p });
    break;
  }
}

const BASE = process.argv[2] ?? `http://localhost:${process.env.FRONTEND_PORT ?? "3002"}`;
const API =
  (process.env.NEXT_PUBLIC_API_URL && process.env.NEXT_PUBLIC_API_URL.trim()) ||
  `http://localhost:${process.env.PORT ?? "8080"}`;
const DB = process.env.DATABASE_URL ?? "postgres://multica:multica@localhost:5432/multica?sslmode=disable";
const EMAIL = process.env.HUB_TEST_EMAIL ?? "xuruofei42@gmail.com";

async function login() {
  const client = new pg.Client(DB);
  await client.connect();
  try {
    await client.query("DELETE FROM verification_code WHERE email = $1", [EMAIL]);
    const sendRes = await fetch(`${API}/auth/send-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL }),
    });
    if (!sendRes.ok) throw new Error(`send-code ${sendRes.status}`);
    const { rows } = await client.query(
      "SELECT code FROM verification_code WHERE email = $1 AND used = FALSE AND expires_at > now() ORDER BY created_at DESC LIMIT 1",
      [EMAIL],
    );
    if (!rows[0]) throw new Error("no verification code");
    const verifyRes = await fetch(`${API}/auth/verify-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, code: rows[0].code }),
    });
    if (!verifyRes.ok) throw new Error(`verify-code ${verifyRes.status}`);
    const { token } = await verifyRes.json();
    return token;
  } finally {
    await client.end();
  }
}

const errors = [];
const logs = [];
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
});
const page = await browser.newPage();
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}\n${e.stack ?? ""}`));
page.on("console", (msg) => {
  const line = `[${msg.type()}] ${msg.text()}`;
  logs.push(line);
  if (msg.type() === "error") errors.push(`[console] ${msg.text()}`);
});
page.on("requestfailed", (req) => {
  errors.push(`[requestfailed] ${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
});

async function apiFetch(token, path, init = {}, slug) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    ...(slug ? { "X-Workspace-Slug": slug } : {}),
    ...(init.headers ?? {}),
  };
  const res = await fetch(`${API}${path}`, { ...init, headers });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  return json;
}

async function ensureFixture(token) {
  const workspaces = await apiFetch(token, "/api/workspaces");
  if (workspaces.length === 0) {
    const ws = await apiFetch(token, "/api/workspaces", {
      method: "POST",
      body: JSON.stringify({ name: "Hub Test", slug: "hub-test-ws" }),
    });
    workspaces.push(ws);
  }
  const ws = workspaces[0];

  const client = new pg.Client(DB);
  await client.connect();
  try {
    let agentRows = await client.query(
      `SELECT id, name FROM agent WHERE workspace_id = $1 AND archived_at IS NULL ORDER BY created_at LIMIT 1`,
      [ws.id],
    );
    if (agentRows.rows.length === 0) {
      const userRow = await client.query(`SELECT id FROM "user" WHERE email = $1 LIMIT 1`, [EMAIL]);
      const userId = userRow.rows[0]?.id;
      if (!userId) throw new Error(`user missing: ${EMAIL}`);
      const runtimeIns = await client.query(
        `INSERT INTO agent_runtime (
           workspace_id, daemon_id, name, runtime_mode, provider, status,
           device_info, metadata, last_seen_at
         )
         VALUES ($1, NULL, $2, 'cloud', $3, 'online', $4, '{}'::jsonb, now())
         RETURNING id`,
        [ws.id, "Hub test runtime", "hub_test_runtime", "Hub test runtime"],
      );
      const runtimeId = runtimeIns.rows[0].id;
      agentRows = await client.query(
        `INSERT INTO agent (
           workspace_id, name, description, runtime_mode, runtime_config,
           runtime_id, visibility, max_concurrent_tasks, owner_id
         )
         VALUES ($1, $2, '', 'cloud', '{}'::jsonb, $3, 'workspace', 1, $4)
         RETURNING id, name`,
        [ws.id, "Hub Test Agent", runtimeId, userId],
      );
    }
    return { ws, agent: { id: agentRows.rows[0].id, name: agentRows.rows[0].name }, workspaces };
  } finally {
    await client.end();
  }
}

try {
  const token = await login();
  const { ws, agent, workspaces } = await ensureFixture(token);
  console.log("User:", EMAIL, "workspaces:", workspaces.length, "fixture:", ws.slug, agent.name);

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate((t) => localStorage.setItem("multica_token", t), token);
  await page.goto(`${BASE}/hub`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(2000);

  // Expand every workspace and click every agent add button
  for (const w of workspaces.slice(0, 5)) {
    await page.getByRole("button", { name: w.name }).click();
    await page.waitForTimeout(800);
    const agentBtns = page.locator("aside button").filter({ hasText: /^/ });
    const count = await page.getByRole("button").filter({ has: page.locator("svg.lucide-plus") }).count();
    for (let i = 0; i < Math.min(count, 3); i++) {
      await page.getByRole("button").filter({ has: page.locator("svg.lucide-plus") }).nth(i).click();
      await page.waitForTimeout(500);
    }
  }
  await page.waitForTimeout(2000);

  // Open a second workspace panel if available
  if (workspaces.length > 1) {
    const ws2 = workspaces[1];
    const { rows: agents2 } = await (async () => {
      const client = new pg.Client(DB);
      await client.connect();
      try {
        return client.query(
          `SELECT name FROM agent WHERE workspace_id = $1 AND archived_at IS NULL LIMIT 1`,
          [ws2.id],
        );
      } finally {
        await client.end();
      }
    })();
    if (agents2[0]) {
      await page.getByRole("button", { name: ws2.name }).click();
      await page.waitForTimeout(1000);
      await page.getByRole("button", { name: agents2[0].name }).first().click();
      await page.waitForTimeout(2000);
    }
  }

  // Corrupt persisted hub state (common after schema changes)
  await page.evaluate(() => {
    localStorage.setItem(
      "multica:hub:multi-chat",
      JSON.stringify({
        state: {
          layout: "2x2",
          panels: [
            {
              id: "stale-panel",
              workspaceId: "00000000-0000-0000-0000-000000000000",
              workspaceSlug: "missing-ws",
              projectId: null,
              projectName: null,
              agentId: "00000000-0000-0000-0000-000000000001",
              agentName: "Ghost",
              sessionId: "00000000-0000-0000-0000-000000000002",
            },
          ],
        },
        version: 0,
      }),
    );
  });
  await page.reload({ waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(3000);
  errors.length = 0; // reset after reload

  // Type in chat input and send
  const editor = page.locator("[data-testid='editor'], .ProseMirror, textarea").first();
  if (await editor.count()) {
    await editor.click();
    await editor.fill("hello from hub test");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(4000);
  }

  const bodyText = await page.locator("body").innerText();
  console.log("URL:", page.url());
  console.log("Body preview:", bodyText.slice(0, 600).replace(/\n/g, " | "));
  const realErrors = errors.filter(
    (e) =>
      !e.includes("net::ERR_ABORTED") &&
      !e.includes("requestfailed") &&
      !e.includes("workspace_slug is required") &&
      !e.includes("missing authorization"),
  );
  const slugErrors = errors.filter((e) => e.includes("workspace_slug is required"));
  if (slugErrors.length > 0) {
    console.error("REGRESSION: task messages fetched without workspace slug:", slugErrors.length);
    process.exit(1);
  }
  console.log("Errors:", realErrors.length, "(ignored aborted:", errors.length - realErrors.length, ")");
  for (const e of realErrors) console.log("---\n" + e);
  if (realErrors.length > 0) {
    console.log("\nRecent console logs:");
    for (const l of logs.slice(-30)) console.log(l);
    process.exit(1);
  }
} catch (e) {
  console.error("Script failed:", e);
  process.exit(1);
} finally {
  await browser.close();
}
