/**
 * Live mode — performance + AI co-creation.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────┐
 *   │ TRANSPORT (loop play/stop · BPM · bar/beat) │
 *   ├─────────────────────────────────────────────┤
 *   │ VOICE GRID (per-voice pad: mute · solo)     │
 *   │ — beat-synced LED pulses on each card —     │
 *   ├─────────────────────────────────────────────┤
 *   │ AI SUGGEST PANEL                            │
 *   │ — "drop a clap on every backbeat" → diff →  │
 *   │ accept hot-reloads the running composition  │
 *   └─────────────────────────────────────────────┘
 *
 * Built on existing Composition + isolateIR + AI provider stack. Mute/solo
 * toggles rebuild the IR via isolateIR and call Composition.update() so
 * voices drop in/out without restarting the loop.
 */

import {
  Composition,
  GroqProvider,
  WebLLMProvider,
  buildSystemPrompt,
  buildUserMessage,
  compileSync,
  extractAllDslBlocks,
  isTruncated,
  mergeBlocks,
} from "synth-javascript";

const GROQ_KEY_STORAGE = "synthjs.ai.groqKey";

export function mountLiveMode({ parent, project, onSourceChange }) {
  // Compile once on mount; bail early on broken sources with a friendly
  // panel so the user can switch back to compose mode and fix.
  let baselineIR;
  try {
    baselineIR = compileSync(project.source);
  } catch (err) {
    parent.innerHTML = `
      <div class="live-shell live-error">
        <div class="panel-head">
          <span class="panel-num">LIVE</span>
          <h2 class="panel-title">composition won't compile</h2>
        </div>
        <pre class="review-error">${escapeHtml(err?.message ?? String(err))}</pre>
        <p class="placeholder-blurb">Switch to compose mode and fix the diagnostics; live mode needs a clean IR to perform.</p>
      </div>
    `;
    return { destroy: () => {} };
  }

  const initialVoices = baselineIR.voices.map((v) => v.name);
  parent.innerHTML = renderShell(initialVoices);

  // ---- DOM refs ----
  const transportPlayBtn = parent.querySelector("#live-play");
  const transportStopBtn = parent.querySelector("#live-stop");
  const tempoLabel = parent.querySelector("#live-tempo");
  const beatLabel = parent.querySelector("#live-beat");
  const voiceGridEl = parent.querySelector("#live-voices");
  const aiInput = parent.querySelector("#live-ai-input");
  const aiSendBtn = parent.querySelector("#live-ai-send");
  const aiCancelBtn = parent.querySelector("#live-ai-cancel");
  const aiStatusEl = parent.querySelector("#live-ai-status");
  const aiStreamEl = parent.querySelector("#live-ai-stream");
  const aiResultEl = parent.querySelector("#live-ai-result");
  const aiAcceptBtn = parent.querySelector("#live-ai-accept");
  const aiRejectBtn = parent.querySelector("#live-ai-reject");
  const providerLabel = parent.querySelector("#live-ai-provider");

  // ---- State ----
  let composition = null;
  let isLooping = false;
  let beatTickHandle = 0;
  let mutedVoices = new Set();
  let soloVoices = new Set();
  let currentSource = project.source;
  let currentIR = baselineIR;
  let pendingProposal = null; // { proposed, summary }
  let aiAbort = null;

  // Provider — same selection logic as compose mode (read the saved Groq
  // key, prefer Groq when present, fall back to WebLLM).
  let provider = new WebLLMProvider();
  try {
    const key = localStorage.getItem(GROQ_KEY_STORAGE);
    if (key) {
      provider = new GroqProvider({ apiKey: key });
      providerLabel.textContent = "groq · llama 3.3 70b";
    } else {
      providerLabel.textContent = "webllm · llama 3.2 3b";
    }
  } catch {}

  // ---- Voice grid ----
  function renderVoices() {
    voiceGridEl.innerHTML = currentIR.voices
      .map((v) => {
        const muted = mutedVoices.has(v.name);
        const solo = soloVoices.has(v.name);
        const eventCount = v.events.length;
        return `
          <div class="voice-card ${muted ? "is-muted" : ""} ${solo ? "is-solo" : ""}" data-voice="${escapeHtml(v.name)}">
            <div class="voice-card-head">
              <span class="voice-card-led" aria-hidden="true"></span>
              <span class="voice-card-name">${escapeHtml(v.name)}</span>
              <span class="voice-card-meta">${eventCount} ev</span>
            </div>
            <div class="voice-card-buttons">
              <button class="pad-btn ${muted ? "is-on" : ""}" data-action="mute" title="Mute this voice">
                M
              </button>
              <button class="pad-btn pad-btn-solo ${solo ? "is-on" : ""}" data-action="solo" title="Solo this voice">
                S
              </button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  voiceGridEl.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-action]");
    if (!btn) return;
    const card = btn.closest(".voice-card");
    if (!card) return;
    const name = card.dataset.voice;
    if (btn.dataset.action === "mute") {
      if (mutedVoices.has(name)) mutedVoices.delete(name);
      else mutedVoices.add(name);
    } else if (btn.dataset.action === "solo") {
      if (soloVoices.has(name)) soloVoices.delete(name);
      else soloVoices.add(name);
    }
    renderVoices();
    applyMuteSolo();
  });

  /**
   * Apply the current mute + solo state to the running composition by
   * flipping per-voice gain gates — sample-accurate, no rescheduling.
   * Also works before any composition is playing: the gates are created
   * lazily, so toggling now persists into the next play().
   */
  function applyMuteSolo() {
    if (!composition) return;
    if (soloVoices.size > 0) {
      composition.setSolo(soloVoices);
    } else {
      composition.setSolo(new Set()); // clear any prior solo
      for (const v of currentIR.voices) {
        composition.setVoiceMuted(v.name, mutedVoices.has(v.name));
      }
    }
  }

  // ---- Transport ----
  async function startLoop() {
    if (composition) return;
    composition = new Composition(currentIR);
    // Re-apply any mute/solo state set before play started.
    applyMuteSolo();
    isLooping = true;
    transportPlayBtn.classList.add("is-on");
    setAiStatus("loop running — ask the assistant for a part");
    await composition.play({ loop: true });
    startBeatTicker();
  }

  async function stopLoop() {
    isLooping = false;
    transportPlayBtn.classList.remove("is-on");
    stopBeatTicker();
    if (composition) {
      composition.stop();
      try {
        await composition.destroy();
      } catch {}
      composition = null;
    }
    beatLabel.textContent = "—";
    clearBeatLEDs();
  }

  /**
   * Used when the IR itself changes (AI-accepted proposal). Mute/solo
   * doesn't go through here — the per-voice gain gates handle those
   * without touching the schedule.
   */
  async function hotReloadIR() {
    if (!composition) return;
    try {
      await composition.update(currentIR);
      applyMuteSolo();
    } catch (err) {
      console.warn("live: hot-reload failed", err);
    }
  }

  transportPlayBtn.addEventListener("click", () => {
    if (isLooping) stopLoop();
    else startLoop();
  });
  transportStopBtn.addEventListener("click", () => stopLoop());

  // ---- Beat ticker — drives the LED pulse on each voice card ----
  function startBeatTicker() {
    stopBeatTicker();
    const startedAt = performance.now();
    const tempo = currentIR.tempo;
    const tsNum = currentIR.timeSig?.numerator ?? 4;
    const tsDen = currentIR.timeSig?.denominator ?? 4;
    const beatMs = (60_000 / tempo) | 0;
    beatTickHandle = setInterval(() => {
      const elapsedMs = performance.now() - startedAt;
      const beatIdx = Math.floor(elapsedMs / beatMs);
      const beatInBar = (beatIdx % tsNum) + 1;
      const barIdx = Math.floor(beatIdx / tsNum) + 1;
      beatLabel.textContent = `${barIdx.toString().padStart(2, "0")}.${beatInBar}`;
      // Flash every voice-card LED on the downbeat for a satisfying pulse;
      // dim them briefly so they read as a series of pulses.
      const isDownbeat = beatIdx % tsNum === 0;
      for (const card of voiceGridEl.querySelectorAll(".voice-card")) {
        card.classList.toggle("is-pulse-strong", isDownbeat);
        card.classList.add("is-pulsing");
        setTimeout(() => card.classList.remove("is-pulsing"), beatMs / 2);
      }
    }, beatMs);
  }

  function stopBeatTicker() {
    if (beatTickHandle) clearInterval(beatTickHandle);
    beatTickHandle = 0;
  }

  function clearBeatLEDs() {
    for (const card of voiceGridEl.querySelectorAll(".voice-card")) {
      card.classList.remove("is-pulsing", "is-pulse-strong");
    }
  }

  // ---- AI suggest-a-part ----
  function setAiStatus(text) {
    aiStatusEl.textContent = text;
  }

  function clearProposal() {
    pendingProposal = null;
    aiResultEl.hidden = true;
    aiAcceptBtn.hidden = true;
    aiRejectBtn.hidden = true;
  }

  aiSendBtn.addEventListener("click", async () => {
    const instruction = aiInput.value.trim();
    if (!instruction) return;
    clearProposal();
    aiStreamEl.textContent = "";
    aiStreamEl.hidden = false;
    aiSendBtn.hidden = true;
    aiCancelBtn.hidden = false;
    setAiStatus("generating part…");
    aiAbort = new AbortController();

    const messages = [
      { role: "system", content: buildSystemPrompt() },
      {
        role: "user",
        content: buildUserMessage({
          currentSource,
          instruction:
            "Live performance — keep the existing tempo, time signature, and other voices. " +
            "If the request describes adding/altering a SINGLE voice or instrument, emit just that one block. " +
            "Otherwise emit the minimum set of blocks. " +
            instruction,
        }),
      },
    ];

    let collected = "";
    try {
      if (!provider.isReady()) {
        setAiStatus("loading model…");
        for await (const msg of provider.prepare?.({ signal: aiAbort.signal }) ?? []) {
          setAiStatus(msg);
        }
      }
      for await (const chunk of provider.chat(messages, {
        signal: aiAbort.signal,
        maxTokens: 4096,
        temperature: 0.7,
      })) {
        collected += chunk;
        aiStreamEl.textContent = collected;
        aiStreamEl.scrollTop = aiStreamEl.scrollHeight;
      }
    } catch (err) {
      if (err?.name === "AbortError") setAiStatus("cancelled");
      else setAiStatus(`error: ${err?.message ?? err}`);
      aiSendBtn.hidden = false;
      aiCancelBtn.hidden = true;
      return;
    }
    aiSendBtn.hidden = false;
    aiCancelBtn.hidden = true;
    aiAbort = null;

    const blocks = extractAllDslBlocks(collected);
    if (blocks.length === 0) {
      setAiStatus("model returned no fenced ```synth block");
      return;
    }
    let merged = currentSource;
    const replaced = [];
    const added = [];
    for (const b of blocks) {
      const m = mergeBlocks(merged, b);
      merged = m.text;
      replaced.push(...m.replaced);
      added.push(...m.added);
    }
    let proposedIR;
    try {
      proposedIR = compileSync(merged);
    } catch (err) {
      setAiStatus(`proposal does not compile: ${err?.message ?? err}`);
      return;
    }
    pendingProposal = { proposed: merged, ir: proposedIR };
    aiResultEl.hidden = false;
    aiResultEl.innerHTML = `
      <div class="live-ai-summary">
        ${replaced.length ? `<span class="live-ai-tag live-ai-tag-replaced">replaced ${replaced.join(", ")}</span>` : ""}
        ${added.length ? `<span class="live-ai-tag live-ai-tag-added">added ${added.join(", ")}</span>` : ""}
        ${truncatedNote(collected)}
      </div>
    `;
    aiAcceptBtn.hidden = false;
    aiRejectBtn.hidden = false;
    setAiStatus("proposal ready · accept hot-reloads it into the running loop");
  });

  aiCancelBtn.addEventListener("click", () => aiAbort?.abort());

  aiAcceptBtn.addEventListener("click", async () => {
    if (!pendingProposal) return;
    currentSource = pendingProposal.proposed;
    currentIR = pendingProposal.ir;
    onSourceChange?.(currentSource);
    renderVoices();
    aiInput.value = "";
    clearProposal();
    aiStreamEl.hidden = true;
    setAiStatus(isLooping ? "applied · running" : "applied · press play to hear it");
    if (composition) await hotReloadIR();
  });

  aiRejectBtn.addEventListener("click", () => {
    clearProposal();
    aiStreamEl.hidden = true;
    setAiStatus("rejected");
  });

  // ---- Boot ----
  tempoLabel.textContent = `${currentIR.tempo} bpm · ${currentIR.timeSig?.numerator ?? 4}/${currentIR.timeSig?.denominator ?? 4}`;
  beatLabel.textContent = "—";
  renderVoices();
  setAiStatus("press play to start the loop");

  return {
    destroy: async () => {
      await stopLoop();
    },
  };
}

function renderShell(initialVoiceNames) {
  return `
    <div class="live-shell">
      <div class="live-transport">
        <div class="live-transport-readout">
          <span class="readout-eyebrow">tempo</span>
          <span class="readout-value" id="live-tempo">— bpm · 4/4</span>
        </div>
        <div class="live-transport-readout">
          <span class="readout-eyebrow">bar.beat</span>
          <span class="readout-value live-beat-value" id="live-beat">—</span>
        </div>
        <div class="live-transport-buttons">
          <button id="live-play" class="btn btn-primary live-play-btn">
            <span class="btn-glyph">▶</span><span class="btn-label">loop</span>
          </button>
          <button id="live-stop" class="btn btn-stop">
            <span class="btn-glyph">■</span><span class="btn-label">stop</span>
          </button>
        </div>
      </div>

      <div class="panel-head">
        <span class="panel-num">VOICES</span>
        <h2 class="panel-title">mute · solo · pulse</h2>
        <span class="status-led status-led--idle"></span>
      </div>
      <div id="live-voices" class="voice-grid"></div>

      <div class="panel-head live-ai-head">
        <span class="panel-num">SUGGEST</span>
        <h2 class="panel-title">ask the assistant for a part</h2>
        <span class="readout" id="live-ai-provider">…</span>
      </div>
      <div class="live-ai-pane">
        <textarea
          id="live-ai-input"
          class="ai-input"
          rows="2"
          placeholder="e.g. 'add a clap on the backbeat' or 'replace the lead with a slower melody'"
        ></textarea>
        <div class="ai-buttons">
          <button id="live-ai-send" class="btn btn-primary">
            <span class="btn-glyph">▸</span><span class="btn-label">send</span>
          </button>
          <button id="live-ai-cancel" class="btn" hidden>
            <span class="btn-glyph">■</span><span class="btn-label">cancel</span>
          </button>
        </div>
        <p class="ai-status" id="live-ai-status">…</p>
        <pre id="live-ai-stream" class="ai-stream" hidden></pre>
        <div id="live-ai-result" class="live-ai-result" hidden></div>
        <div class="ai-buttons">
          <button id="live-ai-accept" class="btn btn-primary" hidden>
            <span class="btn-glyph">✓</span><span class="btn-label">accept · hot-reload</span>
          </button>
          <button id="live-ai-reject" class="btn btn-stop" hidden>
            <span class="btn-glyph">×</span><span class="btn-label">reject</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

function truncatedNote(collected) {
  return isTruncated(collected)
    ? `<span class="live-ai-tag live-ai-tag-warn">truncated</span>`
    : "";
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
