import "./style.css";
import { capture, classifyReferrer } from "./analytics";
import {
  availableEdges,
  calculateMetrics,
  currentPuzzleId,
  edgeQuality,
  generatePuzzle,
  getEdge,
  getNode,
  isPlayablePuzzleId,
  millisecondsUntilNextUtcDay,
  PUZZLE_EPOCH_CONFIG,
} from "./game";
import { challengeUrl, shareText } from "./share";
import {
  activeSponsorPlacements,
  resolveSponsorFormDestination,
  SPONSOR_PLACEMENTS,
  sponsorAriaDescription,
  type SponsorPlacement,
} from "./sponsors";
import { hasPlayedBefore, loadProgress, recordCompletion, saveProgress } from "./storage";
import type { GameStatus, NetworkEdge, NodeId, RouteMetrics } from "./types";

const EXPERIMENT_ID = "packet-panic-v1";
const url = new URL(window.location.href);
const requestedPuzzle = url.searchParams.get("p");
const isChallenge = isPlayablePuzzleId(requestedPuzzle);
const puzzleId = isChallenge ? requestedPuzzle : currentPuzzleId();
const puzzle = generatePuzzle(puzzleId);
const activeSponsors = activeSponsorPlacements(SPONSOR_PLACEMENTS, currentPuzzleId());
const sponsorsByNode = new Map<NodeId, SponsorPlacement>(activeSponsors.map((placement) => [placement.nodeId, placement]));
let route: NodeId[] = ["src"];
let status: GameStatus = "routing";
let progress = loadProgress();
let hasCompletedThisSession = false;
let hasStarted = false;

const source = url.searchParams.get("source")?.slice(0, 120);
const campaign = url.searchParams.get("campaign")?.slice(0, 120);
const commonAnalytics = {
  experiment_id: EXPERIMENT_ID,
  puzzle_id: puzzle.id,
  source,
  campaign,
  referrer_class: classifyReferrer(document.referrer, window.location.hostname),
  returning_player: hasPlayedBefore(progress, puzzle.id),
};

const sponsorDestination = resolveSponsorFormDestination(import.meta.env.VITE_SPONSOR_FORM_URL, window.location.origin);

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("App mount point not found");

app.innerHTML = `
  <div class="page-shell">
    <header class="site-header">
      <a class="brand" href="/" aria-label="Cramzz Lab home">
        <span class="brand-mark" aria-hidden="true">C/</span>
        <span>CRAMZZ LAB</span>
      </a>
      <div class="header-actions">
        <span class="connection-status" id="connection-status" role="status">
          <span class="status-dot" aria-hidden="true"></span>
          <span id="connection-copy">${PUZZLE_EPOCH_CONFIG.mode === "configured" ? "Live" : "Preview"}</span>
        </span>
        <a class="quiet-link" href="/ledger/">Experiment ledger</a>
      </div>
    </header>

    <main id="game">
      <section class="intro" aria-labelledby="page-title">
        <p class="eyebrow">${PUZZLE_EPOCH_CONFIG.mode === "configured" ? "DAILY" : "PREVIEW"} ROUTING DRILL <span aria-hidden="true">//</span> #${puzzle.number.toString().padStart(3, "0")}</p>
        <h1 id="page-title">Packet <span>Panic.</span></h1>
        <p class="lede">Get one packet from IN to OUT. Broken links are down, orange links are congested, and your TTL expires after six hops.</p>
        <div class="intro-meta">
          <span>${formatPuzzleDate(puzzle.id)}</span>
          <span aria-hidden="true">•</span>
          <span>~45 seconds</span>
          <span aria-hidden="true">•</span>
          <span>No account</span>
        </div>
      </section>

      <div class="game-layout">
        <section class="game-card" aria-labelledby="network-heading">
          <div class="game-card-topline">
            <div>
              <p class="section-kicker">${PUZZLE_EPOCH_CONFIG.mode === "configured" ? "LIVE" : "PREVIEW"} NETWORK</p>
              <h2 id="network-heading">Choose the next hop</h2>
            </div>
            <button class="icon-button" id="help-button" type="button" aria-expanded="false" aria-controls="help-panel">
              <span aria-hidden="true">?</span><span class="sr-only">How to play</span>
            </button>
          </div>

          <div class="help-panel" id="help-panel" hidden>
            <p><strong>Your goal:</strong> deliver the packet to OUT in six hops or fewer.</p>
            <ul>
              <li><span class="legend-swatch fast"></span> Healthy links are usually fast and reliable.</li>
              <li><span class="legend-swatch congested"></span> Congested links add 65% latency.</li>
              <li><span class="legend-swatch broken"></span> Broken links cannot carry traffic.</li>
            </ul>
            <p>Every hop compounds reliability. The quickest-looking route may not earn the best score.</p>
          </div>

          <div class="stats" aria-label="Current route metrics">
            <div class="stat">
              <span class="stat-label">LATENCY</span>
              <strong id="latency-stat">0<span>ms</span></strong>
            </div>
            <div class="stat">
              <span class="stat-label">RELIABILITY</span>
              <strong id="reliability-stat">100<span>%</span></strong>
            </div>
            <div class="stat ttl-stat">
              <span class="stat-label">TTL LEFT</span>
              <strong id="ttl-stat">${puzzle.maxHops}<span>hops</span></strong>
            </div>
            <div class="stat streak-stat">
              <span class="stat-label">STREAK</span>
              <strong id="streak-stat-value">${progress.streak}<span>days</span></strong>
            </div>
          </div>

          <div class="network-wrap">
            <div class="network-map" id="network-map" aria-describedby="map-instructions"></div>
            <p class="sr-only" id="map-instructions">Use Tab to move among available next-hop routers, then Enter or Space to route the packet.</p>
          </div>

          <div class="route-console" aria-live="polite" aria-atomic="true">
            <div>
              <span class="console-label">ROUTE</span>
              <div class="route-path" id="route-path"></div>
            </div>
            <button class="text-button" id="restart-button" type="button">Restart route</button>
          </div>

          <p class="announcer" id="announcer" role="status" aria-live="polite"></p>
          <div class="result-panel" id="result-panel" hidden></div>
        </section>

        <aside class="side-rail" aria-label="Experiment and sponsor information">
          <section class="brief-card">
            <p class="section-kicker">TODAY'S CONDITIONS</p>
            <h2>Read the network.</h2>
            <div class="condition-list" id="condition-list"></div>
            <p class="microcopy">Link health is visible. Route quality is not. Pick your trade-off.</p>
          </section>

          <section class="sponsor-card">
            <div class="sponsor-label">SCHEDULED INVENTORY · ${SPONSOR_PLACEMENTS.length < 20 ? "BOOKINGS OPEN" : "FULLY BOOKED"}</div>
            <p class="section-kicker">FOUNDING BOOKINGS ${String(SPONSOR_PLACEMENTS.length).padStart(2, "0")}/20 TOTAL</p>
            <h2>Your brand can live on a router.</h2>
            <p>₹499 books one of seven eligible routers for a clearly labelled 30-day window. Later bookings receive the next open window. Sponsorship never changes game outcomes.</p>
            ${renderSponsorRoster(activeSponsors)}
            <a class="sponsor-button" id="sponsor-button" href="${escapeAttribute(sponsorDestination.url)}">
              Book a node <span aria-hidden="true">↗</span>
            </a>
            <p class="sponsor-note">Creative is reviewed before any payment link is issued.</p>
          </section>

          <section class="principle-card">
            <span class="principle-icon" aria-hidden="true">◎</span>
            <p><strong>Built in public.</strong> Packet Panic has fourteen days to earn a sponsor or a meaningful audience signal.</p>
            <a href="/ledger/">See the live experiment ledger →</a>
          </section>
        </aside>
      </div>
    </main>

    <footer>
      <p>Experiment 001 by <a href="/">Cramzz Lab</a>.</p>
      <nav aria-label="Legal">
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a href="/sponsor-policy">Sponsor policy</a>
      </nav>
    </footer>
  </div>
`;

const networkMap = mustFind<HTMLElement>("#network-map");
const routePath = mustFind<HTMLElement>("#route-path");
const resultPanel = mustFind<HTMLElement>("#result-panel");
const announcer = mustFind<HTMLElement>("#announcer");
const helpButton = mustFind<HTMLButtonElement>("#help-button");
const helpPanel = mustFind<HTMLElement>("#help-panel");

renderConditions();
renderGame();
updateConnectionStatus();

capture("experiment_view", commonAnalytics);
if (isChallenge) capture("challenge_visit", commonAnalytics);
if (!isChallenge) scheduleDailyRollover();
if (url.searchParams.get("payment") === "returned") {
  capture("payment_returned", commonAnalytics);
  announce("Payment return received. Sponsor placement remains pending until payment is manually confirmed as captured.");
}

helpButton.addEventListener("click", () => {
  const willOpen = helpPanel.hidden;
  helpPanel.hidden = !willOpen;
  helpButton.setAttribute("aria-expanded", String(willOpen));
});

mustFind<HTMLButtonElement>("#restart-button").addEventListener("click", () => {
  route = ["src"];
  status = "routing";
  hasStarted = false;
  resultPanel.hidden = true;
  announce("Route reset. Choose an available router from Origin.");
  renderGame();
});

mustFind<HTMLAnchorElement>("#sponsor-button").addEventListener("click", () => {
  capture("sponsor_cta_clicked", commonAnalytics);
  if (sponsorDestination.opensForm) capture("sponsor_form_opened", commonAnalytics);
});

window.addEventListener("online", updateConnectionStatus);
window.addEventListener("offline", updateConnectionStatus);

function mustFind<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing UI element: ${selector}`);
  return element;
}

function formatPuzzleDate(id: string): string {
  return new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${id}T00:00:00Z`))
    .toUpperCase();
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function sponsorAssetUrl(path: string): string {
  return new URL(`${import.meta.env.BASE_URL}${path}`, window.location.origin).toString();
}

function renderSponsorRoster(placements: SponsorPlacement[]): string {
  if (placements.length === 0) return "";
  return `
    <ul class="active-sponsor-list" aria-label="Active Founding Node sponsors">
      ${placements.map((placement) => `
        <li>
          <span>Sponsored</span>
          <a
            href="${escapeAttribute(placement.destinationUrl)}"
            target="_blank"
            rel="sponsored nofollow noopener noreferrer"
            aria-label="Sponsored: visit ${escapeAttribute(placement.brandName)}"
          >${escapeHtml(placement.brandName)} ↗</a>
        </li>`).join("")}
    </ul>`;
}

function renderConditions(): void {
  const broken = puzzle.edges.filter((edge) => edge.broken).length;
  const congested = puzzle.edges.filter((edge) => edge.congested).length;
  mustFind<HTMLElement>("#condition-list").innerHTML = `
    <div><span class="condition-number">${puzzle.nodes.length}</span><span>network nodes</span></div>
    <div><span class="condition-number coral">${broken}</span><span>broken links</span></div>
    <div><span class="condition-number amber">${congested}</span><span>congested links</span></div>
    <div><span class="condition-number">${puzzle.maxHops}</span><span>hop TTL</span></div>
  `;
}

function renderGame(restoreGameplayFocus = false): void {
  const metrics = calculateMetrics(puzzle, route);
  const current = route.at(-1) ?? "src";
  const nextEdges = status === "routing" ? availableEdges(puzzle, route) : [];
  const nextNodeIds = new Set(nextEdges.map((edge) => edge.to));
  const usedEdges = new Set(route.slice(0, -1).map((node, index) => `${node}-${route[index + 1]}`));

  networkMap.innerHTML = `
    <svg class="network-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"></path>
        </marker>
      </defs>
      ${puzzle.edges.map((edge) => renderEdge(edge, usedEdges.has(edge.id), current === edge.from)).join("")}
    </svg>
    ${puzzle.nodes.map((node) => {
      const sponsor = sponsorsByNode.get(node.id);
      const isCurrent = node.id === current;
      const isVisited = route.includes(node.id);
      const isAvailable = nextNodeIds.has(node.id);
      const edge = nextEdges.find((candidate) => candidate.to === node.id);
      const detail = edge ? `, ${Math.round(edge.latency * (edge.congested ? 1.65 : 1))} milliseconds, ${edge.reliability}% reliable${edge.congested ? ", congested" : ""}` : "";
      const disabled = !isAvailable || status !== "routing";
      return `
        <button
          class="network-node node-${node.kind}${isCurrent ? " current" : ""}${isVisited ? " visited" : ""}${isAvailable ? " available" : ""}${sponsor ? " sponsored-node" : ""}"
          style="--node-x:${node.x}%;--node-y:${node.y}%"
          type="button"
          data-node-id="${node.id}"
          ${disabled ? "disabled" : ""}
          ${isCurrent ? 'aria-current="step"' : ""}
          aria-label="${isAvailable ? "Route to " : ""}${node.label}${detail}${sponsor ? `. ${escapeAttribute(sponsorAriaDescription(sponsor))}` : ""}"
        >
          <span class="node-pulse" aria-hidden="true"></span>
          ${sponsor ? '<span class="node-sponsored-tag" aria-hidden="true">Sponsored</span>' : ""}
          ${sponsor?.logoPath
            ? `<img class="node-sponsor-logo" src="${escapeAttribute(sponsorAssetUrl(sponsor.logoPath))}" alt="" aria-hidden="true">`
            : `<span class="node-code">${node.shortLabel}</span>`}
          <span class="node-name">${node.label}${sponsor ? `<small>Sponsored · ${escapeHtml(sponsor.brandName)}</small>` : ""}</span>
        </button>`;
    }).join("")}
  `;

  networkMap.querySelectorAll<HTMLButtonElement>("[data-node-id]:not(:disabled)").forEach((button) => {
    button.addEventListener("click", () => chooseNode(button.dataset.nodeId as NodeId));
  });

  routePath.innerHTML = route.map((nodeId, index) => {
    const node = getNode(puzzle, nodeId);
    const divider = index < route.length - 1 ? '<span class="route-arrow" aria-hidden="true">→</span>' : "";
    return `<span>${node.shortLabel}</span>${divider}`;
  }).join("");

  mustFind<HTMLElement>("#latency-stat").innerHTML = `${metrics.latency}<span>ms</span>`;
  mustFind<HTMLElement>("#reliability-stat").innerHTML = `${Math.round(metrics.reliability * 100)}<span>%</span>`;
  mustFind<HTMLElement>("#ttl-stat").innerHTML = `${Math.max(0, puzzle.maxHops - metrics.hops)}<span>hops</span>`;
  mustFind<HTMLElement>("#streak-stat-value").innerHTML = `${progress.streak}<span>days</span>`;

  if (status !== "routing") renderResult(metrics);

  if (restoreGameplayFocus) {
    const focusTarget = status === "routing"
      ? networkMap.querySelector<HTMLButtonElement>("[data-node-id]:not(:disabled)")
      : resultPanel.querySelector<HTMLButtonElement>("button");
    focusTarget?.focus();
  }
}

function renderEdge(edge: NetworkEdge, used: boolean, fromCurrent: boolean): string {
  const from = getNode(puzzle, edge.from);
  const to = getNode(puzzle, edge.to);
  const classes = [
    "network-edge",
    edge.broken ? "broken" : edgeQuality(edge),
    used ? "used" : "",
    fromCurrent && !edge.broken ? "candidate" : "",
  ].filter(Boolean).join(" ");
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const latency = Math.round(edge.latency * (edge.congested ? 1.65 : 1));
  return `
    <g class="${classes}">
      <line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" marker-end="url(#arrow)"></line>
      ${fromCurrent && !edge.broken ? `<text x="${midX}" y="${midY - 1.4}" text-anchor="middle">${latency}ms</text>` : ""}
      ${edge.broken ? `<path class="break-mark" d="M ${midX - 1.5} ${midY - 2} l 3 4 M ${midX + 1.5} ${midY - 2} l -3 4"></path>` : ""}
    </g>`;
}

function chooseNode(nodeId: NodeId): void {
  if (status !== "routing") return;
  const current = route.at(-1) ?? "src";
  const edge = getEdge(puzzle, current, nodeId);
  if (!edge || edge.broken || route.includes(nodeId)) {
    announce("That link is unavailable. Choose a highlighted next hop.");
    return;
  }

  if (!hasStarted) {
    hasStarted = true;
    capture("game_start", commonAnalytics);
  }
  route = [...route, nodeId];
  const metrics = calculateMetrics(puzzle, route);

  if (nodeId === "dst") {
    status = "delivered";
    announce(`Packet delivered in ${metrics.hops} hops with ${metrics.latency} milliseconds latency.`);
    completeGame(metrics);
  } else if (metrics.hops >= puzzle.maxHops || availableEdges(puzzle, route).length === 0) {
    status = "dropped";
    announce(metrics.hops >= puzzle.maxHops ? "TTL expired. The packet was dropped." : "Dead end. The packet was dropped.");
    completeGame(metrics);
  } else {
    const node = getNode(puzzle, nodeId);
    announce(`Packet reached ${node.label}. ${puzzle.maxHops - metrics.hops} hops remain.`);
  }
  renderGame(true);
}

function completeGame(metrics: RouteMetrics): void {
  progress = recordCompletion(progress, {
    puzzleId: puzzle.id,
    won: metrics.delivered,
    score: metrics.score,
    grade: metrics.grade,
    hops: metrics.hops,
    completedAt: new Date().toISOString(),
  });
  saveProgress(progress);
  if (hasCompletedThisSession) return;
  hasCompletedThisSession = true;
  capture("game_complete", {
    ...commonAnalytics,
    outcome: metrics.delivered ? "delivered" : "dropped",
    latency_ms: metrics.latency,
    reliability_pct: Math.round(metrics.reliability * 1_000) / 10,
    hops: metrics.hops,
    grade: metrics.grade,
  });
}

function renderResult(metrics: RouteMetrics): void {
  resultPanel.hidden = false;
  const won = status === "delivered";
  resultPanel.className = `result-panel ${won ? "won" : "lost"}`;
  resultPanel.innerHTML = `
    <div class="result-heading">
      <div class="result-grade" aria-label="Grade ${metrics.grade}">${won ? metrics.grade : "×"}</div>
      <div>
        <p class="section-kicker">${won ? "PACKET DELIVERED" : "PACKET DROPPED"}</p>
        <h3>${won ? routeResultHeading(metrics.grade) : "The network wins this one."}</h3>
        <p>${won ? `${metrics.score} points · ${metrics.hops} hops · ${metrics.latency}ms` : "Trace a different route and try again."}</p>
      </div>
    </div>
    <pre class="share-preview" aria-label="Share result preview">${escapeHtml(shareText(puzzle, route, metrics).split("\n\n")[0])}</pre>
    <div class="result-actions">
      <button class="primary-button" id="share-button" type="button">Share result <span aria-hidden="true">↗</span></button>
      <button class="secondary-button" id="copy-button" type="button">Copy score</button>
      ${won ? '<button class="secondary-button" id="result-retry-button" type="button">Try another route</button>' : '<button class="secondary-button" id="result-retry-button" type="button">Retry</button>'}
    </div>
  `;

  mustFind<HTMLButtonElement>("#share-button").addEventListener("click", () => shareResult(metrics));
  mustFind<HTMLButtonElement>("#copy-button").addEventListener("click", () => copyResult(metrics));
  mustFind<HTMLButtonElement>("#result-retry-button").addEventListener("click", () => {
    route = ["src"];
    status = "routing";
    hasStarted = false;
    resultPanel.hidden = true;
    announce("Choose a new route. Your first result remains in today's streak.");
    renderGame(true);
  });
}

function routeResultHeading(grade: RouteMetrics["grade"]): string {
  if (grade === "S") return "Clean route. Zero panic.";
  if (grade === "A") return "Delivered with room to spare.";
  if (grade === "B") return "Delivered. The packet felt it.";
  return "Delivered—barely.";
}

async function shareResult(metrics: RouteMetrics): Promise<void> {
  capture("share_opened", commonAnalytics);
  const text = shareText(puzzle, route, metrics);
  if (navigator.share) {
    try {
      await navigator.share({ title: "Packet Panic", text: text.split("\n\n")[0], url: challengeUrl(puzzle.id) });
      capture("share_completed", { ...commonAnalytics, source: "native-share" });
      announce("Share sheet opened with your result.");
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }
  await copyResult(metrics);
}

async function copyResult(metrics: RouteMetrics): Promise<void> {
  const text = shareText(puzzle, route, metrics);
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.className = "clipboard-fallback";
    document.body.append(textarea);
    textarea.select();
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    } finally {
      textarea.remove();
    }
  }
  if (!copied) {
    announce("Copy failed. Select the score preview and copy it manually.");
    return;
  }
  capture("share_completed", { ...commonAnalytics, source: "copy" });
  announce("Result copied. Challenge a friend.");
  const button = document.querySelector<HTMLButtonElement>("#copy-button");
  if (button) {
    button.textContent = "Copied!";
    window.setTimeout(() => { button.textContent = "Copy score"; }, 1_600);
  }
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function announce(message: string): void {
  announcer.textContent = "";
  window.requestAnimationFrame(() => { announcer.textContent = message; });
}

function updateConnectionStatus(): void {
  const statusElement = mustFind<HTMLElement>("#connection-status");
  const copy = mustFind<HTMLElement>("#connection-copy");
  statusElement.classList.toggle("offline", !navigator.onLine);
  copy.textContent = navigator.onLine
    ? (PUZZLE_EPOCH_CONFIG.mode === "configured" ? "Live" : "Preview")
    : "Offline · game still works";
}

function scheduleDailyRollover(): void {
  window.setTimeout(() => window.location.reload(), millisecondsUntilNextUtcDay() + 1_000);
}
