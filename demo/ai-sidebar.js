import {
  Composition,
  GroqProvider,
  WebLLMProvider,
  buildSystemPrompt,
  buildUserMessage,
  compileSync,
  diffLines,
  extractAllDslBlocks,
  formatDiff,
  isTruncated,
  mergeBlocks,
} from "synth-javascript";

const GROQ_KEY_STORAGE = "synthjs.ai.groqKey";

/**
 * Mounts the AI sidebar inside `parent`. Caller passes in editor handles so
 * the sidebar can read the current source, write proposed diffs back, and
 * play either the current or proposed version through the existing
 * Composition runtime.
 */
export function mountAiSidebar({ parent, getSource, setSource }) {
  parent.classList.add("ai-sidebar");
  parent.innerHTML = `
    <div class="ai-head">
      <span class="panel-num">04</span>
      <h2 class="panel-title">ai assistant</h2>
    </div>
    <div class="ai-settings">
      <label class="field">
        <span class="field-label">provider</span>
        <select id="ai-provider">
          <option value="webllm">WebLLM (browser, offline · Llama 3.2 3B)</option>
          <option value="groq">Groq (Llama 3.3 70B — needs free API key)</option>
          <option value="anthropic" disabled>Anthropic — coming soon</option>
          <option value="openai" disabled>OpenAI — coming soon</option>
        </select>
      </label>
      <label class="field" id="ai-key-field" hidden>
        <span class="field-label">groq api key</span>
        <input
          id="ai-api-key"
          type="password"
          autocomplete="off"
          placeholder="gsk_… (get one free at console.groq.com)"
        />
      </label>
      <p class="ai-status" id="ai-status">webllm selected — first request downloads ~1.5 GB</p>
    </div>
    <textarea
      id="ai-input"
      class="ai-input"
      placeholder="describe a change — e.g. 'add a 2-bar fill before the drop' or 'make the lead more melancholic'"
      rows="3"
    ></textarea>
    <div class="ai-buttons">
      <button id="ai-send" class="btn btn-primary">
        <span class="btn-glyph">▸</span><span class="btn-label">send</span>
      </button>
      <button id="ai-cancel" class="btn" hidden>
        <span class="btn-glyph">■</span><span class="btn-label">cancel</span>
      </button>
      <button
        id="ai-start-fresh"
        class="btn"
        hidden
        title="Drop the current proposal + conversation history and start a new request"
      >
        <span class="btn-glyph">↺</span><span class="btn-label">start fresh</span>
      </button>
      <button id="ai-reference" class="btn" title="Send the current edit back to the AI as a reference">
        <span class="btn-glyph">↻</span><span class="btn-label">use as reference</span>
      </button>
    </div>
    <pre id="ai-stream" class="ai-stream" hidden></pre>
    <div id="ai-diff-pane" class="ai-diff-pane" hidden>
      <div class="panel-head ai-diff-head">
        <span class="panel-title">proposed diff</span>
      </div>
      <pre id="ai-diff" class="ai-diff"></pre>
      <div class="ai-buttons ai-diff-buttons">
        <button id="ai-listen-before" class="btn">
          <span class="btn-glyph">▶</span><span class="btn-label">full before</span>
        </button>
        <button id="ai-listen-after" class="btn">
          <span class="btn-glyph">▶</span><span class="btn-label">full after</span>
        </button>
        <button
          id="ai-listen-diff-before"
          class="btn"
          title="Play the original composition starting at the first beat the change touches"
        >
          <span class="btn-glyph">▶</span><span class="btn-label">diff before</span>
        </button>
        <button
          id="ai-listen-diff-after"
          class="btn"
          title="Play the proposed composition from the first beat the change touches"
        >
          <span class="btn-glyph">▶</span><span class="btn-label">diff after</span>
        </button>
        <button id="ai-stop-preview" class="btn">
          <span class="btn-glyph">■</span><span class="btn-label">stop</span>
        </button>
        <button id="ai-edit" class="btn" title="Load the proposal into the editor without applying it as final">
          <span class="btn-glyph">✎</span><span class="btn-label">edit in place</span>
        </button>
        <button id="ai-accept" class="btn btn-primary">
          <span class="btn-glyph">✓</span><span class="btn-label">accept</span>
        </button>
        <button id="ai-reject" class="btn btn-stop">
          <span class="btn-glyph">×</span><span class="btn-label">reject</span>
        </button>
      </div>
    </div>
  `;

  const statusEl = parent.querySelector("#ai-status");
  const providerEl = parent.querySelector("#ai-provider");
  const keyFieldEl = parent.querySelector("#ai-key-field");
  const apiKeyEl = parent.querySelector("#ai-api-key");
  const inputEl = parent.querySelector("#ai-input");
  const sendBtn = parent.querySelector("#ai-send");
  const cancelBtn = parent.querySelector("#ai-cancel");
  const startFreshBtn = parent.querySelector("#ai-start-fresh");
  const referenceBtn = parent.querySelector("#ai-reference");
  const streamEl = parent.querySelector("#ai-stream");
  const diffPane = parent.querySelector("#ai-diff-pane");
  const diffEl = parent.querySelector("#ai-diff");
  const listenBeforeBtn = parent.querySelector("#ai-listen-before");
  const listenAfterBtn = parent.querySelector("#ai-listen-after");
  const listenDiffBeforeBtn = parent.querySelector("#ai-listen-diff-before");
  const listenDiffAfterBtn = parent.querySelector("#ai-listen-diff-after");
  const stopPreviewBtn = parent.querySelector("#ai-stop-preview");
  const acceptBtn = parent.querySelector("#ai-accept");
  const rejectBtn = parent.querySelector("#ai-reject");
  const editBtn = parent.querySelector("#ai-edit");

  let provider = new WebLLMProvider();
  let abort = null;
  let groqKey = "";
  // Conversation state for the iterative refinement flow:
  //   - baselineSource: the editor source as it stood when this conversation
  //     started. Every proposal is merged against this, so refinements stay
  //     anchored to the same original instead of compounding edits.
  //   - turnCount: just for the status line readout.
  let baselineSource = null;
  let turnCount = 0;
  let lastBefore = null;
  let lastAfter = null;
  let lastDiff = null;
  let lastChangedNames = []; // [{kind: "voice"|"instrument", name}]
  let userReference = null; // user-edited DSL fed back as context for the next prompt
  let previewComposition = null;
  let previewStopTimer = null;

  const setStatus = (text) => {
    statusEl.textContent = text;
  };

  // Restore the user's Groq API key (if any) from previous sessions. Stored
  // in localStorage; never sent anywhere except api.groq.com.
  try {
    groqKey = localStorage.getItem(GROQ_KEY_STORAGE) ?? "";
  } catch {}
  apiKeyEl.value = groqKey;

  const refreshProvider = () => {
    const sel = providerEl.value;
    if (sel === "webllm") {
      keyFieldEl.hidden = true;
      provider = new WebLLMProvider();
      setStatus(
        provider.isReady()
          ? "webllm ready (Llama 3.2 3B in browser)"
          : "webllm selected — first request downloads ~1.5 GB",
      );
    } else if (sel === "groq") {
      keyFieldEl.hidden = false;
      if (!groqKey) {
        setStatus("paste your free Groq API key (console.groq.com) to enable");
        provider = new WebLLMProvider();
        return;
      }
      provider = new GroqProvider({ apiKey: groqKey });
      setStatus("groq ready (Llama 3.3 70B via api.groq.com)");
    }
  };

  providerEl.addEventListener("change", refreshProvider);
  apiKeyEl.addEventListener("change", () => {
    groqKey = apiKeyEl.value.trim();
    try {
      if (groqKey) localStorage.setItem(GROQ_KEY_STORAGE, groqKey);
      else localStorage.removeItem(GROQ_KEY_STORAGE);
    } catch {}
    refreshProvider();
  });
  // If a key was already saved, default to Groq on next load.
  if (groqKey) {
    providerEl.value = "groq";
    refreshProvider();
  }

  const stopPreview = async () => {
    if (previewStopTimer !== null) {
      clearTimeout(previewStopTimer);
      previewStopTimer = null;
    }
    if (previewComposition) {
      previewComposition.stop();
      try {
        await previewComposition.destroy();
      } catch {}
      previewComposition = null;
    }
  };

  /**
   * Walk an IR and find the union (in whole-note beats) of every event
   * whose voice or instrument was touched by the merge. Returns null when
   * no changes were tracked or none of them resolved to a playable event.
   */
  const computeChangeRange = (ir, changed) => {
    if (!ir || !changed?.length) return null;
    const voiceNames = new Set();
    const instrumentNames = new Set();
    for (const c of changed) {
      if (c.kind === "voice") voiceNames.add(c.name);
      if (c.kind === "instrument") instrumentNames.add(c.name);
    }
    let firstBeat = Number.POSITIVE_INFINITY;
    let lastEnd = 0;
    for (const v of ir.voices) {
      const voiceMatches = voiceNames.has(v.name);
      for (const e of v.events) {
        const instrMatches = instrumentNames.has(e.instrument.name);
        if (!voiceMatches && !instrMatches) continue;
        if (e.startBeat < firstBeat) firstBeat = e.startBeat;
        const end = e.startBeat + e.durationBeats;
        if (end > lastEnd) lastEnd = end;
      }
    }
    if (firstBeat === Number.POSITIVE_INFINITY) return null;
    return { fromBeat: firstBeat, toBeat: lastEnd };
  };

  const playFullFrom = async (source, fromBeat, toBeat) => {
    await stopPreview();
    let ir;
    try {
      ir = compileSync(source);
    } catch (err) {
      setStatus(`compile failed: ${err?.message ?? err}`);
      return;
    }
    if (!ir.voices.length || ir.voices.every((v) => v.events.length === 0)) {
      setStatus("composition has no playable events");
      return;
    }
    previewComposition = new Composition(ir);
    await previewComposition.play(fromBeat > 0 ? { from: fromBeat } : {});
    if (typeof toBeat === "number" && toBeat > fromBeat) {
      const wholeNotesToPlay = toBeat - fromBeat;
      const seconds = (wholeNotesToPlay * 4 * 60) / ir.tempo;
      previewStopTimer = setTimeout(
        () => {
          stopPreview();
          setStatus("diff preview finished");
        },
        seconds * 1000 + 200, // small tail so the last note's release rings out
      );
    }
  };

  const playFull = async (source) => {
    await stopPreview();
    let ir;
    try {
      ir = compileSync(source);
    } catch (err) {
      setStatus(`compile failed: ${err?.message ?? err}`);
      return;
    }
    if (!ir.voices.length || ir.voices.every((v) => v.events.length === 0)) {
      setStatus("composition has no playable events");
      return;
    }
    previewComposition = new Composition(ir);
    await previewComposition.play();
  };

  const showDiff = (before, after) => {
    lastBefore = before;
    lastAfter = after;
    lastDiff = diffLines(before, after);
    diffEl.textContent = formatDiff(lastDiff, 2) || "(no textual change)";
    diffPane.hidden = false;
  };

  const resetUI = () => {
    streamEl.hidden = true;
    streamEl.textContent = "";
    diffPane.hidden = true;
    diffEl.textContent = "";
    lastBefore = null;
    lastAfter = null;
    lastDiff = null;
    lastChangedNames = [];
  };

  /**
   * Parse mergeBlocks' string labels (e.g. "voice pluck", "instrument
   * pluck_synth") back into structured {kind, name} entries so the
   * diff-preview range computation can match by IR voice + instrument.
   */
  const parseChangedLabels = (merge) => {
    const out = [];
    for (const label of [...(merge.replaced ?? []), ...(merge.added ?? [])]) {
      if (label.startsWith("voice ")) out.push({ kind: "voice", name: label.slice(6) });
      else if (label.startsWith("instrument ")) {
        out.push({ kind: "instrument", name: label.slice(11) });
      }
    }
    return out;
  };

  sendBtn.addEventListener("click", async () => {
    const instruction = inputEl.value.trim();
    if (!instruction) return;

    // Conversation lifecycle:
    //   - First send of a session: snapshot the editor as the baseline.
    //   - Refinement send (proposal already on screen): the AI sees the
    //     current proposal as the new "current composition" + the new
    //     instruction, framed as a refinement. We do NOT accumulate prior
    //     assistant turns — that quickly blows past per-minute token caps
    //     on free hosted tiers (Groq's 12K TPM, etc.). Constant request
    //     size each turn keeps refinements feasible.
    const isRefinement = baselineSource !== null;
    if (!isRefinement) {
      baselineSource = getSource();
      turnCount = 1;
    } else {
      turnCount += 1;
    }
    const turn = turnCount;

    const sourceForPrompt = isRefinement && lastAfter ? lastAfter : baselineSource;
    const userMessage = buildUserMessage({
      currentSource: sourceForPrompt,
      instruction: isRefinement
        ? `This is a refinement of your previous proposal. Apply this change on top of it: ${instruction}`
        : instruction,
      ...(userReference ? { reference: userReference } : {}),
    });

    // Reset diff/stream UI but keep conversation state.
    streamEl.hidden = false;
    streamEl.textContent = "";
    diffPane.hidden = true;
    diffEl.textContent = "";
    inputEl.value = "";
    sendBtn.hidden = true;
    cancelBtn.hidden = false;
    startFreshBtn.hidden = false;

    const messages = [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: userMessage },
    ];

    abort = new AbortController();
    let collected = "";
    const MAX_ATTEMPTS = 3;
    try {
      // Drain prepare() messages first if the model isn't loaded.
      if (!provider.isReady()) {
        setStatus("loading model…");
        for await (const msg of provider.prepare({ signal: abort.signal })) {
          setStatus(msg);
        }
        setStatus("ready");
      }
      let attempt = 0;
      let convo = messages;
      while (attempt < MAX_ATTEMPTS) {
        attempt++;
        setStatus(
          attempt === 1
            ? `generating… (turn ${turn})`
            : `continuing… (${attempt}/${MAX_ATTEMPTS}, turn ${turn})`,
        );
        for await (const chunk of provider.chat(convo, {
          signal: abort.signal,
          // Full multi-voice revisions are long. Llama-3.2-3B's context
          // allows much more than the prior cap; give it real headroom so
          // the assistant doesn't cut off mid-voice.
          maxTokens: 8192,
          temperature: 0.7,
        })) {
          collected += chunk;
          streamEl.textContent = collected;
          streamEl.scrollTop = streamEl.scrollHeight;
        }
        if (!isTruncated(collected)) break;
        if (attempt >= MAX_ATTEMPTS) {
          setStatus(`output still truncated after ${attempt} continuation attempts`);
          break;
        }
        // Auto-continue: feed the partial output back as an assistant turn
        // and ask the model to resume without repeating itself.
        convo = [
          ...messages,
          { role: "assistant", content: collected },
          {
            role: "user",
            content:
              "Continue from exactly where you left off. Do not repeat any earlier content. Close the ```synth block when finished.",
          },
        ];
      }
    } catch (err) {
      if (err?.name === "AbortError") {
        setStatus("cancelled");
      } else {
        setStatus(`error: ${err?.message ?? err}`);
      }
      sendBtn.hidden = false;
      cancelBtn.hidden = true;
      return;
    }

    sendBtn.hidden = false;
    cancelBtn.hidden = true;
    abort = null;

    const aiBlocks = extractAllDslBlocks(collected);
    if (aiBlocks.length === 0) {
      setStatus("model did not return a fenced ```synth block");
      return;
    }
    let truncated = isTruncated(collected);

    // Splice each AI-emitted block into the current composition by named
    // block. Some smaller models emit multiple ```synth blocks instead of
    // one — merge them sequentially so no edits are lost. Saves the model
    // from regenerating unchanged voices on every turn.
    const applyAllBlocks = (base, blocks) => {
      let text = base;
      const replaced = [];
      const added = [];
      let skipped = 0;
      for (const b of blocks) {
        const m = mergeBlocks(text, b);
        text = m.text;
        replaced.push(...m.replaced);
        added.push(...m.added);
        skipped += m.skipped;
      }
      return { text, replaced, added, skipped };
    };
    let merge = applyAllBlocks(baselineSource, aiBlocks);
    let proposed = merge.text;
    lastChangedNames = parseChangedLabels(merge);
    const summary = [];
    if (merge.replaced.length) summary.push(`replaced ${merge.replaced.join(", ")}`);
    if (merge.added.length) summary.push(`added ${merge.added.join(", ")}`);

    // Validate. If compile fails, send the error back to the AI for a
    // single auto-fix attempt before surfacing the failure to the user.
    let compileError = null;
    try {
      compileSync(proposed);
    } catch (err) {
      compileError = err?.message ?? String(err);
    }

    if (compileError) {
      setStatus(`proposal does not compile — asking AI to fix: ${compileError}`);
      try {
        const fixConvo = [
          ...messages,
          { role: "assistant", content: collected },
          {
            role: "user",
            content: `The previous output failed to compile with: ${compileError}\n\nPlease fix the error and emit the FULL corrected composition as a single \`\`\`synth fenced block. Remember: an "instrument define" block contains ONLY field declarations (oscillator, envelope, filter, detune, pitch_sweep, gain) — never musical events.`,
          },
        ];
        let fixed = "";
        for await (const chunk of provider.chat(fixConvo, {
          signal: abort?.signal,
          maxTokens: 8192,
          temperature: 0.5,
        })) {
          fixed += chunk;
          streamEl.textContent = collected + "\n\n--- AUTO-FIX ---\n" + fixed;
          streamEl.scrollTop = streamEl.scrollHeight;
        }
        const fixedBlocks = extractAllDslBlocks(fixed);
        if (fixedBlocks.length > 0) {
          merge = applyAllBlocks(baselineSource, fixedBlocks);
          proposed = merge.text;
          truncated = isTruncated(fixed);
          try {
            compileSync(proposed);
            compileError = null;
            setStatus("auto-fix succeeded — proposal compiles cleanly");
          } catch (err) {
            compileError = err?.message ?? String(err);
            setStatus(`auto-fix still does not compile: ${compileError}`);
          }
        } else {
          setStatus(`auto-fix did not return a fenced block; original error: ${compileError}`);
        }
      } catch (err) {
        if (err?.name !== "AbortError") {
          setStatus(`auto-fix failed: ${err?.message ?? err}`);
        }
      }
    } else {
      const summaryText = summary.length ? ` (${summary.join("; ")})` : "";
      setStatus(
        truncated
          ? `proposal compiles${summaryText}, but output was truncated — review carefully`
          : `proposal compiles cleanly${summaryText}`,
      );
    }

    showDiff(baselineSource, proposed);
  });

  cancelBtn.addEventListener("click", () => {
    abort?.abort();
  });

  listenBeforeBtn.addEventListener("click", () => {
    if (lastBefore === null) return;
    setStatus("previewing the original composition");
    playFull(lastBefore);
  });

  listenAfterBtn.addEventListener("click", () => {
    if (lastAfter === null) return;
    setStatus("previewing the proposed composition");
    playFull(lastAfter);
  });

  /**
   * Diff-context preview — plays the FULL composition (all voices) but
   * starting at the first beat the change touches and stopping after the
   * last beat the change touches. The musician hears the modified voice
   * land in context with the rest of the piece.
   */
  const playDiffInContext = async (label, source, otherSource) => {
    if (source === null) return;
    let ir;
    try {
      ir = compileSync(source);
    } catch (err) {
      setStatus(`compile failed: ${err?.message ?? err}`);
      return;
    }
    // Range derived from the side that actually contains the changed
    // events. For "before" the changes don't exist in `source`, so we use
    // `otherSource` (the proposal) to find the affected beats; the same
    // beats are then played from the original.
    let rangeIr = ir;
    if (otherSource) {
      try {
        rangeIr = compileSync(otherSource);
      } catch {}
    }
    const range = computeChangeRange(rangeIr, lastChangedNames);
    if (!range) {
      setStatus(`previewing ${label} (no change range — playing from start)`);
      playFull(source);
      return;
    }
    const fromSec = (range.fromBeat * 4 * 60) / ir.tempo;
    const toSec = (range.toBeat * 4 * 60) / ir.tempo;
    setStatus(
      `previewing ${label} from ${fromSec.toFixed(2)}s to ${toSec.toFixed(2)}s — change in context`,
    );
    playFullFrom(source, range.fromBeat, range.toBeat);
  };

  listenDiffBeforeBtn.addEventListener("click", () => {
    playDiffInContext("before (diff range)", lastBefore, lastAfter);
  });

  listenDiffAfterBtn.addEventListener("click", () => {
    playDiffInContext("after (diff range)", lastAfter, lastAfter);
  });

  stopPreviewBtn.addEventListener("click", () => {
    stopPreview();
    setStatus("preview stopped");
  });

  const endConversation = () => {
    baselineSource = null;
    turnCount = 0;
    startFreshBtn.hidden = true;
  };

  acceptBtn.addEventListener("click", async () => {
    if (lastAfter === null) return;
    await stopPreview();
    setSource(lastAfter);
    userReference = null;
    setStatus("applied to editor");
    resetUI();
    endConversation();
  });

  rejectBtn.addEventListener("click", async () => {
    await stopPreview();
    setStatus("rejected");
    resetUI();
    endConversation();
  });

  editBtn.addEventListener("click", async () => {
    if (lastAfter === null) return;
    await stopPreview();
    setSource(lastAfter);
    setStatus("loaded into editor — edit and click 'use as reference' to refine");
    resetUI();
    endConversation();
  });

  startFreshBtn.addEventListener("click", async () => {
    await stopPreview();
    setStatus("conversation cleared — next request starts fresh");
    resetUI();
    endConversation();
  });

  referenceBtn.addEventListener("click", () => {
    userReference = getSource();
    setStatus("current editor contents stored as reference for the next request");
  });
}
