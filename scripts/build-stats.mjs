// Generates dist/diagnostics.svg — a themed stats panel built from the GitHub API.
// Runs inside GitHub Actions with GITHUB_TOKEN; no third-party stats service involved.
import { mkdirSync, writeFileSync } from "node:fs";

const LOGIN = "LRecodex";
const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error("GITHUB_TOKEN is required");
  process.exit(1);
}

const query = `query($login: String!) {
  user(login: $login) {
    followers { totalCount }
    repositories(ownerAffiliations: OWNER, privacy: PUBLIC, first: 100) {
      totalCount
      nodes {
        stargazerCount
        isFork
        languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name color } }
        }
      }
    }
    contributionsCollection {
      totalCommitContributions
      totalPullRequestContributions
      totalIssueContributions
      totalPullRequestReviewContributions
      contributionCalendar { totalContributions }
    }
  }
}`;

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Authorization: `bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": LOGIN,
  },
  body: JSON.stringify({ query, variables: { login: LOGIN } }),
});
if (!res.ok) {
  console.error(`GitHub API returned ${res.status}: ${await res.text()}`);
  process.exit(1);
}
const payload = await res.json();
if (payload.errors) {
  console.error(JSON.stringify(payload.errors, null, 2));
  process.exit(1);
}

const u = payload.data.user;
const cc = u.contributionsCollection;
const repos = u.repositories.nodes;
const stars = repos.reduce((s, r) => s + r.stargazerCount, 0);

const langBytes = new Map();
for (const repo of repos) {
  if (repo.isFork || !repo.languages) continue;
  for (const edge of repo.languages.edges) {
    const { name, color } = edge.node;
    const cur = langBytes.get(name) ?? { size: 0, color: color ?? "#8aa3c2" };
    cur.size += edge.size;
    langBytes.set(name, cur);
  }
}
const totalBytes = [...langBytes.values()].reduce((s, l) => s + l.size, 0) || 1;
const topLangs = [...langBytes.entries()]
  .map(([name, { size, color }]) => ({ name, color, pct: (size / totalBytes) * 100 }))
  .sort((a, b) => b.pct - a.pct)
  .slice(0, 6);

const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const stats = [
  ["contributions (12 mo)", fmt(cc.contributionCalendar.totalContributions)],
  ["commits", fmt(cc.totalCommitContributions)],
  ["pull requests", fmt(cc.totalPullRequestContributions)],
  ["code reviews", fmt(cc.totalPullRequestReviewContributions)],
  ["issues filed", fmt(cc.totalIssueContributions)],
  ["stars earned", fmt(stars)],
  ["followers", fmt(u.followers.totalCount)],
];

const statRows = stats
  .map(([label, value], i) => {
    const y = 106 + i * 30;
    return `  <g class="row" style="animation-delay:${(0.3 + i * 0.15).toFixed(2)}s">
    <text x="60" y="${y}" class="lbl">${esc(label)}</text>
    <text x="430" y="${y}" text-anchor="end" class="val">${esc(value)}</text>
    <line x1="60" y1="${y + 9}" x2="430" y2="${y + 9}" stroke="#0f1e33"/>
  </g>`;
  })
  .join("\n");

const langRows = topLangs
  .map((l, i) => {
    const y = 112 + i * 38;
    const w = Math.max(6, (l.pct / 100) * 340);
    return `  <g class="row" style="animation-delay:${(0.5 + i * 0.15).toFixed(2)}s">
    <text x="530" y="${y}" class="lbl">${esc(l.name)}</text>
    <text x="940" y="${y}" text-anchor="end" class="pct">${l.pct.toFixed(1)}%</text>
  </g>
  <rect x="530" y="${y + 8}" width="410" height="6" rx="3" fill="#0d1a2e"/>
  <rect x="530" y="${y + 8}" height="6" rx="3" fill="${esc(l.color)}" width="0">
    <animate attributeName="width" from="0" to="${((l.pct / 100) * 410).toFixed(1)}" begin="${(0.6 + i * 0.2).toFixed(2)}s" dur="0.8s" fill="freeze"/>
  </rect>`;
  })
  .join("\n");

const scanned = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";

const svg = `<svg width="1000" height="380" viewBox="0 0 1000 380" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="panelbg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#060a15"/>
      <stop offset="1" stop-color="#0a1124"/>
    </linearGradient>
  </defs>
  <style>
    text { font-family: 'Consolas','Courier New',monospace; }
    .ttl { font-size: 14px; fill: #8aa3c2; letter-spacing: 2px; }
    .sec { font-size: 15px; fill: #00f0ff; letter-spacing: 2px; font-weight: bold; }
    .lbl { font-size: 14px; fill: #6d87a8; }
    .val { font-size: 16px; fill: #00f0ff; font-weight: bold; }
    .pct { font-size: 13px; fill: #8aa3c2; }
    .ok  { font-size: 14px; fill: #2bff88; }
    .dim { font-size: 12px; fill: #33465f; }
    .row { animation: fadein .3s ease both; }
    @keyframes fadein { from { opacity: 0; } to { opacity: 1; } }
    .led { animation: pulse 2s ease-in-out infinite; }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .3; } }
  </style>

  <rect x="0.5" y="0.5" width="999" height="379" rx="12" fill="url(#panelbg)" stroke="#14263f"/>
  <rect x="0.5" y="0.5" width="999" height="46" rx="12" fill="#0a1224"/>
  <rect x="0.5" y="34" width="999" height="13" fill="#0a1224"/>
  <line x1="0.5" y1="47" x2="999.5" y2="47" stroke="#14263f"/>

  <circle cx="28" cy="24" r="6" fill="#ff2d95"/>
  <circle cx="50" cy="24" r="6" fill="#f7c948"/>
  <circle cx="72" cy="24" r="6" fill="#00f0ff"/>
  <text x="96" y="29" class="ttl">LRX DIAGNOSTICS — /proc/${LOGIN}</text>
  <text x="972" y="29" class="ttl" text-anchor="end">v5.0</text>

  <text x="60" y="78" class="sec">// SYSTEM READOUT</text>
${statRows}

  <line x1="490" y1="64" x2="490" y2="320" stroke="#0f1e33"/>

  <text x="530" y="78" class="sec">// TOP LANGUAGES</text>
${langRows}

  <line x1="24" y1="332" x2="976" y2="332" stroke="#122543"/>
  <circle cx="44" cy="354" r="4" fill="#2bff88" class="led"/>
  <text x="60" y="359" class="ok">diagnostics complete — no critical issues found</text>
  <text x="972" y="359" text-anchor="end" class="dim">last scan: ${scanned}</text>
</svg>
`;

mkdirSync("dist", { recursive: true });
writeFileSync("dist/diagnostics.svg", svg);
console.log(`dist/diagnostics.svg written (${stats.length} stats, ${topLangs.length} languages)`);
