"use strict";

const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const { execFile, spawn } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
const HOST = "127.0.0.1";
const PORT = Number(process.env.BRIDGE_PORT || 8765);
const ROOT = __dirname;
const REPOSITORY = "rivers205/amazon-ops-core";
const API_VERSION = "2022-11-28";
const STATIC_FILES = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/status.json", ["status.json", "application/json; charset=utf-8"]]
]);

function run(command, args, options = {}) {
  return execFileAsync(command, args, {
    windowsHide: true,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    ...options
  });
}

async function hasGhAuth() {
  try {
    await run("gh", ["auth", "status", "--hostname", "github.com"]);
    return true;
  } catch (error) {
    return false;
  }
}

function readGitCredential() {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["credential", "fill"], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "ignore"]
    });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error("GIT_CREDENTIAL_UNAVAILABLE"));
      const fields = new Map(output.split(/\r?\n/).filter(Boolean).map((line) => line.split(/=(.*)/s, 2)));
      output = "";
      const token = fields.get("password");
      if (!token) return reject(new Error("GIT_CREDENTIAL_UNAVAILABLE"));
      resolve(token);
    });
    child.stdin.end("protocol=https\nhost=github.com\n\n");
  });
}

async function ghGet(endpoint) {
  const { stdout } = await run("gh", [
    "api",
    "--method", "GET",
    "-H", "Accept: application/vnd.github+json",
    "-H", `X-GitHub-Api-Version: ${API_VERSION}`,
    endpoint
  ]);
  return JSON.parse(stdout);
}

async function credentialManagerGet(endpoint) {
  let token = await readGitCredential();
  try {
    const response = await fetch(`https://api.github.com/${endpoint}`, {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": API_VERSION,
        "User-Agent": "ai-bridge-dashboard-local"
      }
    });
    if (!response.ok) throw new Error(`GITHUB_API_${response.status}`);
    return await response.json();
  } finally {
    token = null;
  }
}

async function environmentTokenGet(endpoint) {
  const token = process.env.GH_TOKEN;
  if (!token) throw new Error("GH_TOKEN_UNAVAILABLE");
  const response = await fetch(`https://api.github.com/${endpoint}`, {
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": API_VERSION,
      "User-Agent": "ai-bridge-dashboard-local"
    }
  });
  if (!response.ok) throw new Error(`GITHUB_API_${response.status}`);
  return response.json();
}

async function createGitHubReader() {
  if (await hasGhAuth()) {
    return { authMethod: "GH_CLI", get: ghGet };
  }
  if (process.env.GH_TOKEN) {
    return { authMethod: "FINE_GRAINED_ENV", get: environmentTokenGet };
  }
  let probeToken = await readGitCredential();
  if (!probeToken) throw new Error("NO_GITHUB_AUTH");
  probeToken = null;
  return { authMethod: "GIT_CREDENTIAL_MANAGER", get: credentialManagerGet };
}

function sanitizePullRequest(pr) {
  return {
    number: pr.number,
    title: pr.title,
    state: pr.state,
    draft: Boolean(pr.draft),
    created_at: pr.created_at,
    updated_at: pr.updated_at,
    closed_at: pr.closed_at,
    merged_at: pr.merged_at,
    html_url: pr.html_url
  };
}

function sanitizeIssue(issue) {
  return {
    number: issue.number,
    title: issue.title,
    state: issue.state,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
    url: issue.html_url
  };
}

async function readRepositoryState() {
  const reader = await createGitHubReader();
  const base = `repos/${REPOSITORY}`;
  const [pullRequests, issueRows, commits] = await Promise.all([
    reader.get(`${base}/pulls?state=all&sort=updated&direction=desc&per_page=100`),
    reader.get(`${base}/issues?state=all&sort=updated&direction=desc&per_page=100`),
    reader.get(`${base}/commits?per_page=10`)
  ]);
  const latestCommit = commits[0] || null;
  const commitStatus = latestCommit
    ? await reader.get(`${base}/commits/${encodeURIComponent(latestCommit.sha)}/status`)
    : null;

  return {
    schemaVersion: 1,
    repository: REPOSITORY,
    readOnly: true,
    authMethod: reader.authMethod,
    fetchedAt: new Date().toISOString(),
    pullRequests: pullRequests.map(sanitizePullRequest),
    issues: issueRows.filter((issue) => !issue.pull_request).map(sanitizeIssue),
    latestCommit: latestCommit ? {
      sha: latestCommit.sha,
      message: latestCommit.commit?.message || "",
      committedAt: latestCommit.commit?.committer?.date || null,
      url: latestCommit.html_url,
      status: commitStatus?.state || "pending"
    } : null
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(payload));
}

async function serveStatic(urlPath, response) {
  const entry = STATIC_FILES.get(urlPath);
  if (!entry) return false;
  const [filename, contentType] = entry;
  const content = await fs.readFile(path.join(ROOT, filename));
  response.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'self' data:; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(content);
  return true;
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${HOST}:${PORT}`);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" });
    }

    if (url.pathname === "/api/github-state") {
      if (request.method !== "GET") return sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" });
      const state = await readRepositoryState();
      return sendJson(response, 200, state);
    }

    if (await serveStatic(url.pathname, response)) return;
    sendJson(response, 404, { error: "NOT_FOUND" });
  } catch (error) {
    sendJson(response, 503, { error: "GITHUB_READ_UNAVAILABLE" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`AI 协作桥接看板已启动：http://${HOST}:${PORT}/`);
  console.log(`只读监控仓库：${REPOSITORY}`);
});
