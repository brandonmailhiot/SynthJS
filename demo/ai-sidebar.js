import {
  Composition,
  WebLLMProvider,
  buildSystemPrompt,
  buildUserMessage,
  compileSync,
  diffLines,
  extractDslBlock,
  formatDiff,
  isTruncated,
  isolateIR,
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

  const playRange = async (source, lineRange) => {
    await stopPreview();
    let ir;
    try {
      ir = compileSync(source);
    } catch (err) {
      setStatus(`compile failed: ${err?.message ?? err}`);
      return;
    }
    if (lineRange) {
      try {
        ir = isolateIR(ir, { lineRange });
      } catch {}
    }
    if (!ir.voices.length || ir.voices.every((v) => v.events.length === 0)) {
      setStatus("nothing to play in the changed range");
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
    try {
      // Drain prepare() messages first if the model isn't loaded.
      if (!provider.isReady()) {
        setStatus("loading model…");
        for await (const msg of provider.prepare({ signal: abort.signal })) {
          setStatus(msg);
        }
        setStatus("ready");
      }
      setStatus("generating…");
      for await (const chunk of provider.chat(messages, {
        signal: abort.signal,
        // Compositions are long — multiple voices times many lines. Give the
        // model enough headroom for a full revision; WebLLM's default is
        // tighter than the model's actual context allows.
        maxTokens: 4096,
        temperature: 0.7,
      })) {
        collected += chunk;
        streamEl.textContent = collected;
        streamEl.scrollTop = streamEl.scrollHeight;
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

    const proposed = extractDslBlock(collected);
    if (!proposed) {
      setStatus("model did not return a fenced ```synth block");
      return;
    }
    const truncated = isTruncated(collected);

    // Validate: make sure it compiles. If not, surface diagnostics so the
    // musician can decide whether to accept anyway.
    try {
      compileSync(proposed);
      setStatus(
        truncated
          ? "proposal compiles, but output was truncated — try splitting the request or raising the token budget"
          : "proposal compiles cleanly",
      );
    } catch (err) {
      setStatus(
        truncated
          ? `proposal truncated and did not compile: ${err?.message ?? err}`
          : `proposal does not compile: ${err?.message ?? err}`,
      );
    }

    showDiff(currentSource, proposed);
  });

  cancelBtn.addEventListener("click", () => {
    abort?.abort();
  });

  listenBeforeBtn.addEventListener("click", () => {
    if (lastBefore === null) return;
    const range = lastDiff?.oldRange ?? null;
    setStatus(range ? `previewing before · lines ${range[0]}-${range[1]}` : "previewing before");
    playRange(lastBefore, range);
  });

  listenAfterBtn.addEventListener("click", () => {
    if (lastAfter === null) return;
    const range = lastDiff?.newRange ?? null;
    setStatus(range ? `previewing after · lines ${range[0]}-${range[1]}` : "previewing after");
    playRange(lastAfter, range);
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
