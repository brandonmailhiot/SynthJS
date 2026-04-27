import {
  Composition,
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
          <option value="webllm">WebLLM (browser, offline)</option>
          <option value="groq" disabled>Groq — coming soon</option>
          <option value="anthropic" disabled>Anthropic — coming soon</option>
          <option value="openai" disabled>OpenAI — coming soon</option>
        </select>
      </label>
      <p class="ai-status" id="ai-status">model not loaded — first request will download ~1.5 GB</p>
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
          <span class="btn-glyph">▶</span><span class="btn-label">before</span>
        </button>
        <button id="ai-listen-after" class="btn">
          <span class="btn-glyph">▶</span><span class="btn-label">after</span>
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
  const inputEl = parent.querySelector("#ai-input");
  const sendBtn = parent.querySelector("#ai-send");
  const cancelBtn = parent.querySelector("#ai-cancel");
  const referenceBtn = parent.querySelector("#ai-reference");
  const streamEl = parent.querySelector("#ai-stream");
  const diffPane = parent.querySelector("#ai-diff-pane");
  const diffEl = parent.querySelector("#ai-diff");
  const listenBeforeBtn = parent.querySelector("#ai-listen-before");
  const listenAfterBtn = parent.querySelector("#ai-listen-after");
  const stopPreviewBtn = parent.querySelector("#ai-stop-preview");
  const acceptBtn = parent.querySelector("#ai-accept");
  const rejectBtn = parent.querySelector("#ai-reject");
  const editBtn = parent.querySelector("#ai-edit");

  let provider = new WebLLMProvider();
  let abort = null;
  let lastBefore = null;
  let lastAfter = null;
  let lastDiff = null;
  let userReference = null; // user-edited DSL fed back as context for the next prompt
  let previewComposition = null;

  const setStatus = (text) => {
    statusEl.textContent = text;
  };

  const stopPreview = async () => {
    if (previewComposition) {
      previewComposition.stop();
      try {
        await previewComposition.destroy();
      } catch {}
      previewComposition = null;
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
  };

  sendBtn.addEventListener("click", async () => {
    const instruction = inputEl.value.trim();
    if (!instruction) return;
    resetUI();
    sendBtn.hidden = true;
    cancelBtn.hidden = false;
    streamEl.hidden = false;

    const currentSource = getSource();
    // Split system + user so providers with KV-cache reuse skip re-encoding
    // the grammar primer on follow-up turns. Big speedup on second + later
    // requests in the same session.
    const messages = [
      { role: "system", content: buildSystemPrompt() },
      {
        role: "user",
        content: buildUserMessage({
          currentSource,
          instruction,
          ...(userReference ? { reference: userReference } : {}),
        }),
      },
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
        setStatus(attempt === 1 ? "generating…" : `continuing… (${attempt}/${MAX_ATTEMPTS})`);
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
    let merge = applyAllBlocks(currentSource, aiBlocks);
    let proposed = merge.text;
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
          merge = applyAllBlocks(currentSource, fixedBlocks);
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

    showDiff(currentSource, proposed);
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

  stopPreviewBtn.addEventListener("click", () => {
    stopPreview();
    setStatus("preview stopped");
  });

  acceptBtn.addEventListener("click", async () => {
    if (lastAfter === null) return;
    await stopPreview();
    setSource(lastAfter);
    userReference = null;
    setStatus("applied to editor");
    resetUI();
  });

  rejectBtn.addEventListener("click", async () => {
    await stopPreview();
    setStatus("rejected");
    resetUI();
  });

  editBtn.addEventListener("click", async () => {
    if (lastAfter === null) return;
    await stopPreview();
    setSource(lastAfter);
    setStatus("loaded into editor — edit and click 'use as reference' to refine");
    resetUI();
  });

  referenceBtn.addEventListener("click", () => {
    userReference = getSource();
    setStatus("current editor contents stored as reference for the next request");
  });
}
