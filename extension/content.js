(() => {
  const SOURCE = "movie-english-study";
  const frameId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const isTopFrame = window.top === window;

  let video = findVideo();
  let frameFloatingSub = null;

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || message.source !== SOURCE) return;

    if (message.kind === "OVERLAY") {
      if (message.targetFrameId && message.targetFrameId !== frameId) {
        setFrameOverlay("", false);
        return;
      }
      if (!isTopFrame) setFrameOverlay(message.text, message.visible);
      return;
    }

    if (message.kind !== "COMMAND") return;

    if (!message.targetFrameId || message.targetFrameId === frameId) {
      runVideoCommand(message.command);
      return;
    }

    forwardCommandToChildFrames(message);
  });

  window.setInterval(() => {
    if (!video || !document.contains(video)) video = findVideo();
    if (!video) return;

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;

    window.top.postMessage(
      {
        source: SOURCE,
        kind: "STATUS",
        state: {
          frameId,
          currentTime,
          duration,
          paused: video.paused,
          readyState: video.readyState,
          src: video.currentSrc || video.src || location.href,
          title: document.title || location.hostname,
        },
      },
      "*",
    );
  }, 180);

  document.addEventListener("fullscreenchange", () => {
    if (!isTopFrame && frameFloatingSub) mountFrameFloatingSub();
  });

  if (!isTopFrame) return;
  if (document.querySelector(".mes-panel")) return;
  if (!isHtmlDocument()) return;

  let activeVideoState = null;
  let activeVideoSeenAt = 0;
  let subtitles = [];
  let subtitleLibrary = [];
  let suggestedSubtitle = null;
  let activeIndex = -1;
  let activeButton = null;
  let offsetSeconds = 0;
  let loopCurrentLine = false;
  let lastSuggestionCheck = 0;
  let uiEnabled = false;
  let timerId = 0;

  const panel = document.createElement("aside");
  panel.className = "mes-panel";
  panel.innerHTML = `
    <div class="mes-header">
      <div>
        <h2 class="mes-title">English Study</h2>
        <p class="mes-meta" data-role="meta">Looking for video...</p>
      </div>
      <button class="mes-close" type="button" title="Close">x</button>
    </div>
    <div class="mes-controls">
      <label class="mes-file" title="Load subtitle">
        CC
        <input data-role="file" type="file" accept=".srt,.vtt,text/vtt" multiple />
      </label>
      <button class="mes-icon-button" data-role="play" type="button" title="Play or pause" aria-label="Play or pause">></button>
      <button class="mes-icon-button" data-role="repeat" type="button" title="Repeat current line" aria-label="Repeat current line">R</button>
      <button class="mes-icon-button" data-role="loop" type="button" aria-pressed="false" title="Loop current line" aria-label="Loop current line">L</button>
      <button class="mes-icon-button" data-role="fullscreen" type="button" title="Toggle fullscreen" aria-label="Toggle fullscreen">FS</button>
      <button class="mes-icon-button" data-role="libraryToggle" type="button" title="Subtitle library" aria-label="Subtitle library">Lib</button>
    </div>
    <label class="mes-offset">
      Offset
      <button class="mes-offset-button" data-role="subEarlier" type="button" title="Subtitle earlier by 0.5s">Sub -</button>
      <input data-role="offset" type="number" step="0.1" value="0" />
      <button class="mes-offset-button" data-role="subLater" type="button" title="Subtitle later by 0.5s">Sub +</button>
      <button class="mes-offset-button" data-role="offsetReset" type="button" title="Reset offset">0</button>
      seconds
    </label>
    <div class="mes-suggestion" data-role="suggestion">
      <span data-role="suggestionText"></span>
      <button data-role="useSuggestion" type="button">Use</button>
    </div>
    <div class="mes-library" data-role="library">
      <div class="mes-library-header">
        <span data-role="libraryMeta">Library empty</span>
        <button class="mes-library-clear" data-role="clearLibrary" type="button">Clear</button>
      </div>
      <ol class="mes-library-list" data-role="libraryList"></ol>
    </div>
    <div class="mes-timeline">
      <span data-role="currentTime">0:00</span>
      <input data-role="timeline" type="range" min="0" max="0" step="0.1" value="0" />
      <span data-role="duration">0:00</span>
    </div>
    <div class="mes-current" data-role="current">Load a subtitle file to start.</div>
    <ol class="mes-list" data-role="list"></ol>
  `;

  document.documentElement.append(panel);

  const openPanelButton = document.createElement("button");
  openPanelButton.type = "button";
  openPanelButton.className = "mes-open-panel";
  openPanelButton.textContent = "Sub panel";
  document.documentElement.append(openPanelButton);

  const floatingSub = document.createElement("div");
  floatingSub.className = "mes-floating-sub";
  floatingSub.setAttribute("aria-live", "polite");
  document.documentElement.append(floatingSub);
  panel.hidden = true;

  document.addEventListener("fullscreenchange", () => {
    mountFloatingSubForFullscreen();
  });

  const meta = panel.querySelector('[data-role="meta"]');
  const fileInput = panel.querySelector('[data-role="file"]');
  const playButton = panel.querySelector('[data-role="play"]');
  const repeatButton = panel.querySelector('[data-role="repeat"]');
  const loopButton = panel.querySelector('[data-role="loop"]');
  const fullscreenButton = panel.querySelector('[data-role="fullscreen"]');
  const libraryToggleButton = panel.querySelector('[data-role="libraryToggle"]');
  const offsetInput = panel.querySelector('[data-role="offset"]');
  const subEarlierButton = panel.querySelector('[data-role="subEarlier"]');
  const subLaterButton = panel.querySelector('[data-role="subLater"]');
  const offsetResetButton = panel.querySelector('[data-role="offsetReset"]');
  const suggestionRow = panel.querySelector('[data-role="suggestion"]');
  const suggestionText = panel.querySelector('[data-role="suggestionText"]');
  const useSuggestionButton = panel.querySelector('[data-role="useSuggestion"]');
  const libraryPanel = panel.querySelector('[data-role="library"]');
  const libraryMeta = panel.querySelector('[data-role="libraryMeta"]');
  const libraryList = panel.querySelector('[data-role="libraryList"]');
  const clearLibraryButton = panel.querySelector('[data-role="clearLibrary"]');
  const timelineInput = panel.querySelector('[data-role="timeline"]');
  const currentTimeLabel = panel.querySelector('[data-role="currentTime"]');
  const durationLabel = panel.querySelector('[data-role="duration"]');
  const currentLine = panel.querySelector('[data-role="current"]');
  const subtitleList = panel.querySelector('[data-role="list"]');
  const closeButton = panel.querySelector(".mes-close");

  loadSubtitleLibrary();

  chrome.runtime?.onMessage?.addListener((message) => {
    if (message?.type === "MES_TOGGLE_UI") {
      setUiEnabled(!uiEnabled);
    }
  });

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || message.source !== SOURCE || message.kind !== "STATUS") return;

    const state = message.state;
    if (!state || !state.frameId) return;

    if (
      !activeVideoState ||
      state.frameId === activeVideoState.frameId ||
      (state.duration && state.duration > activeVideoState.duration)
    ) {
      activeVideoState = state;
      activeVideoSeenAt = Date.now();
    }
  });

  closeButton.addEventListener("click", () => {
    panel.hidden = true;
    openPanelButton.classList.add("mes-visible");
  });

  openPanelButton.addEventListener("click", () => {
    panel.hidden = false;
    openPanelButton.classList.remove("mes-visible");
  });

  fileInput.addEventListener("change", async () => {
    const files = [...(fileInput.files || [])];
    if (!files.length) return;

    try {
      const imported = [];
      for (const file of files) {
        const rawText = await file.text();
        const parsed = parseSubtitle(rawText, file.name);
        if (parsed.length) {
          imported.push({
            id: `${file.name}-${file.size}-${file.lastModified}`,
            name: file.name,
            text: rawText,
            cueCount: parsed.length,
            searchableName: normalizeTitle(file.name),
            importedAt: Date.now(),
          });
        }
      }

      if (!imported.length) {
        throw new Error("No subtitle entries found in the selected file(s).");
      }

      subtitleLibrary = mergeSubtitleLibrary(subtitleLibrary, imported);
      loadSubtitle(imported[0]);
      libraryPanel.classList.add("mes-visible");
      renderSubtitleLibrary();
      saveSubtitleLibrary(() => {
        loadSubtitleLibrary();
        meta.textContent =
          imported.length === 1
            ? `${getCueCount(imported[0])} lines loaded and saved`
            : `${imported.length} subtitle files imported and saved`;
        updateSuggestion();
      });
      fileInput.value = "";
    } catch (error) {
      subtitles = [];
      renderSubtitles();
      currentLine.textContent = error.message || "Could not read subtitle file.";
      currentLine.classList.add("mes-error");
      meta.textContent = "Subtitle failed to load";
    }
  });

  useSuggestionButton.addEventListener("click", () => {
    if (!suggestedSubtitle) return;
    loadSubtitle(suggestedSubtitle);
    suggestionRow.classList.remove("mes-visible");
    meta.textContent = `${getCueCount(suggestedSubtitle)} lines loaded`;
  });

  libraryToggleButton.addEventListener("click", () => {
    libraryPanel.classList.toggle("mes-visible");
    renderSubtitleLibrary();
  });

  clearLibraryButton.addEventListener("click", () => {
    subtitleLibrary = [];
    suggestedSubtitle = null;
    saveSubtitleLibrary(renderSubtitleLibrary);
    suggestionRow.classList.remove("mes-visible");
  });

  offsetInput.addEventListener("input", () => {
    offsetSeconds = Number.parseFloat(offsetInput.value) || 0;
    updateActiveSubtitle();
  });

  subEarlierButton.addEventListener("click", () => {
    adjustOffset(-0.5);
  });

  subLaterButton.addEventListener("click", () => {
    adjustOffset(0.5);
  });

  offsetResetButton.addEventListener("click", () => {
    setOffset(0);
  });

  playButton.addEventListener("click", () => {
    const state = getFreshVideoState();
    if (!state) return;
    sendCommand({ type: state.paused ? "play" : "pause" });
  });

  repeatButton.addEventListener("click", () => {
    const line = subtitles[activeIndex];
    if (!line || !getFreshVideoState()) return;
    sendCommand({ type: "playAt", time: Math.max(0, line.start - offsetSeconds + 0.02) });
  });

  loopButton.addEventListener("click", () => {
    loopCurrentLine = !loopCurrentLine;
    loopButton.setAttribute("aria-pressed", String(loopCurrentLine));
  });

  fullscreenButton.addEventListener("click", () => {
    toggleFullscreen();
  });

  timelineInput.addEventListener("input", () => {
    if (!getFreshVideoState()) return;
    sendCommand({ type: "seek", time: Number.parseFloat(timelineInput.value) || 0 });
    activeVideoState.currentTime = Number.parseFloat(timelineInput.value) || 0;
    updateTimeline();
    updateActiveSubtitle();
  });

  timerId = window.setInterval(() => {
    updateMeta();
    updateTimeline();
    updatePlayButton();
    updateActiveSubtitle();
    handleLooping();

    const now = Date.now();
    if (now - lastSuggestionCheck > 2000) {
      lastSuggestionCheck = now;
      updateSuggestion();
    }
  }, 180);

  function findVideo() {
    const videos = [...document.querySelectorAll("video")];
    return videos.find((item) => item.duration || item.currentSrc || item.src) || videos[0] || null;
  }

  function isHtmlDocument() {
    return (
      document instanceof HTMLDocument ||
      document.contentType === "text/html" ||
      document.contentType === "application/xhtml+xml"
    );
  }

  function setUiEnabled(nextEnabled) {
    uiEnabled = nextEnabled;
    panel.hidden = !uiEnabled;
    openPanelButton.classList.remove("mes-visible");

    if (!uiEnabled) {
      updateOverlayText("", false);
      return;
    }

    updateActiveSubtitle();
  }

  function setFrameOverlay(text, visible) {
    if (!frameFloatingSub) {
      frameFloatingSub = document.createElement("div");
      frameFloatingSub.className = "mes-floating-sub";
      frameFloatingSub.setAttribute("aria-live", "polite");
      mountFrameFloatingSub();
    }

    mountFrameFloatingSub();
    frameFloatingSub.textContent = text || "";
    frameFloatingSub.classList.toggle(
      "mes-visible",
      Boolean(visible && text && document.fullscreenElement),
    );
  }

  function mountFrameFloatingSub() {
    if (!frameFloatingSub) return;

    const fullscreenElement = document.fullscreenElement;
    const target =
      fullscreenElement && fullscreenElement !== frameFloatingSub
        ? fullscreenElement
        : document.documentElement;

    if (frameFloatingSub.parentElement !== target) {
      target.append(frameFloatingSub);
    }
  }

  function loadSubtitle(entry) {
    subtitles = entry.cues || parseSubtitle(entry.text, entry.name);
    renderSubtitles();
    activeIndex = -1;
    activeButton = null;
    currentLine.textContent = subtitles.length
      ? "Use Play or the site player, then the current line will appear here."
      : "No subtitle entries found.";
    currentLine.classList.toggle("mes-error", subtitles.length === 0);
    updateOverlayText("", false);
  }

  function adjustOffset(delta) {
    setOffset(offsetSeconds + delta);
  }

  function setOffset(value) {
    offsetSeconds = Math.round(value * 10) / 10;
    offsetInput.value = offsetSeconds.toFixed(1);
    updateActiveSubtitle();
    meta.textContent = `Offset ${offsetSeconds.toFixed(1)}s`;
  }

  function loadSubtitleLibrary() {
    if (!getStorage()) {
      renderSubtitleLibrary();
      return;
    }

    getStorage().get({ subtitleLibrary: [] }, (result) => {
      subtitleLibrary = Array.isArray(result.subtitleLibrary)
        ? result.subtitleLibrary.map(normalizeLibraryEntry)
        : [];
      renderSubtitleLibrary();
      updateSuggestion();
    });
  }

  function saveSubtitleLibrary(afterSave) {
    const storage = getStorage();
    if (!storage) {
      meta.textContent = "Storage is not available. Reload the extension.";
      afterSave?.();
      return;
    }

    storage.set(
      {
        subtitleLibrary: subtitleLibrary.slice(-80).map((entry) => ({
          id: entry.id,
          name: entry.name,
          text: entry.text,
          cueCount: getCueCount(entry),
          searchableName: entry.searchableName || normalizeTitle(entry.name),
          importedAt: entry.importedAt || Date.now(),
        })),
      },
      () => {
        const error = chrome.runtime?.lastError;
        if (error) {
          meta.textContent = `Could not save library: ${error.message}`;
        }
        afterSave?.();
      },
    );
  }

  function getStorage() {
    if (typeof chrome === "undefined") return null;
    return chrome.storage?.local || null;
  }

  function mergeSubtitleLibrary(existing, imported) {
    const byId = new Map(existing.map((entry) => [entry.id || entry.name, entry]));
    for (const entry of imported) {
      byId.set(entry.id || entry.name, entry);
    }
    return [...byId.values()];
  }

  function normalizeLibraryEntry(entry) {
    return {
      id: entry.id || entry.name,
      name: entry.name,
      text: entry.text,
      cueCount: entry.cueCount || entry.cues?.length || 0,
      searchableName: entry.searchableName || normalizeTitle(entry.name),
      importedAt: entry.importedAt || Date.now(),
    };
  }

  function getCueCount(entry) {
    return entry.cueCount || entry.cues?.length || 0;
  }

  function renderSubtitleLibrary() {
    libraryList.innerHTML = "";
    libraryMeta.textContent = subtitleLibrary.length
      ? `${subtitleLibrary.length} subtitle file(s)`
      : "Library empty";

    if (!subtitleLibrary.length) {
      const emptyItem = document.createElement("li");
      emptyItem.className = "mes-library-empty";
      emptyItem.textContent = "No saved subtitles yet. Press CC to import .srt or .vtt files.";
      libraryList.append(emptyItem);
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const entry of subtitleLibrary) {
      const item = document.createElement("li");
      const name = document.createElement("span");
      const useButton = document.createElement("button");
      const deleteButton = document.createElement("button");

      item.className = "mes-library-item";
      name.className = "mes-library-name";
      name.textContent = entry.name;
      name.title = entry.name;

      useButton.type = "button";
      useButton.textContent = "Use";
      useButton.addEventListener("click", () => {
        loadSubtitle(entry);
        meta.textContent = `${getCueCount(entry)} lines loaded`;
        libraryPanel.classList.remove("mes-visible");
      });

      deleteButton.type = "button";
      deleteButton.textContent = "Del";
      deleteButton.addEventListener("click", () => {
        subtitleLibrary = subtitleLibrary.filter((itemEntry) => itemEntry.id !== entry.id);
        if (suggestedSubtitle?.id === entry.id) {
          suggestedSubtitle = null;
          suggestionRow.classList.remove("mes-visible");
        }
        saveSubtitleLibrary(renderSubtitleLibrary);
      });

      item.append(name, useButton, deleteButton);
      fragment.append(item);
    }

    libraryList.append(fragment);
  }

  function updateSuggestion() {
    if (!subtitleLibrary.length || subtitles.length) return;

    const best = findBestSubtitleMatch();
    if (!best || best.score < 0.46) {
      suggestedSubtitle = null;
      suggestionRow.classList.remove("mes-visible");
      return;
    }

    suggestedSubtitle = best.entry;
    suggestionText.textContent = `Suggested: ${best.entry.name}`;
    suggestionRow.classList.add("mes-visible");
  }

  function findBestSubtitleMatch() {
    const pageText = normalizeTitle(
      [
        document.title,
        location.hostname,
        decodeURIComponent(location.pathname),
        document.querySelector('meta[property="og:title"]')?.content || "",
      ].join(" "),
    );

    if (!pageText) return null;

    let best = null;
    for (const entry of subtitleLibrary) {
      const candidate = entry.searchableName || normalizeTitle(entry.name);
      const score = scoreTitleMatch(pageText, candidate);
      if (!best || score > best.score) best = { entry, score };
    }

    return best;
  }

  function normalizeTitle(value) {
    return value
      .toLowerCase()
      .replace(/\.[a-z0-9]{2,4}$/i, " ")
      .replace(/s(\d{1,2})e(\d{1,2})/gi, " season $1 episode $2 ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(
        /\b(english|subtitle|subtitles|www|com|co|srt|vtt|web|dl|bluray|brrip|webrip|x264|x265|h264|h265|1080p|720p|480p)\b/g,
        " ",
      )
      .replace(/\s+/g, " ")
      .trim();
  }

  function scoreTitleMatch(pageText, candidateText) {
    const pageTokens = new Set(pageText.split(" ").filter((token) => token.length > 1));
    const candidateTokens = new Set(candidateText.split(" ").filter((token) => token.length > 1));
    if (!pageTokens.size || !candidateTokens.size) return 0;

    let overlap = 0;
    for (const token of candidateTokens) {
      if (pageTokens.has(token)) overlap += token.length >= 4 ? 1.4 : 1;
    }

    return overlap / Math.sqrt(pageTokens.size * candidateTokens.size);
  }

  function runVideoCommand(command) {
    if (!command) return;
    if (!video || !document.contains(video)) video = findVideo();
    if (!video) return;

    if (command.type === "seek" && Number.isFinite(command.time)) {
      video.currentTime = Math.max(0, command.time);
      return;
    }

    if (command.type === "playAt" && Number.isFinite(command.time)) {
      video.currentTime = Math.max(0, command.time);
      video.play();
      return;
    }

    if (command.type === "play") video.play();
    if (command.type === "pause") video.pause();
  }

  function sendCommand(command) {
    const state = getFreshVideoState();
    if (!state) return;

    const message = {
      source: SOURCE,
      kind: "COMMAND",
      targetFrameId: state.frameId,
      command,
    };

    if (state.frameId === frameId) {
      runVideoCommand(command);
      return;
    }

    forwardCommandToChildFrames(message);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
      return;
    }

    const target = findFullscreenTarget();
    if (target?.requestFullscreen) {
      target.requestFullscreen();
    }
  }

  function findFullscreenTarget() {
    const state = getFreshVideoState();
    if (!state) return document.documentElement;

    if (state.frameId === frameId) {
      return video || document.documentElement;
    }

    const frames = [...document.querySelectorAll("iframe")];
    const playerFrame = frames.find((frame) => isLikelyVideoFrame(frame, state));
    return playerFrame || document.documentElement;
  }

  function isLikelyVideoFrame(frame, state) {
    const haystack = [
      frame.src,
      frame.title,
      frame.name,
      frame.id,
      frame.className,
      state.src,
      state.title,
    ]
      .join(" ")
      .toLowerCase();

    return Boolean(
      haystack &&
        (haystack.includes("player") ||
          haystack.includes("embed") ||
          haystack.includes("video") ||
          haystack.includes(new URL(state.src || location.href, location.href).hostname)),
    );
  }

  function forwardCommandToChildFrames(message) {
    for (const frame of document.querySelectorAll("iframe")) {
      try {
        frame.contentWindow?.postMessage(message, "*");
      } catch {
        // Cross-origin frames can still receive postMessage through contentWindow.
      }
    }
  }

  function broadcastToChildFrames(message) {
    for (const frame of document.querySelectorAll("iframe")) {
      try {
        frame.contentWindow?.postMessage(message, "*");
      } catch {
        // Some frames are not reachable, which is fine.
      }
    }
  }

  function getFreshVideoState() {
    if (!activeVideoState) return null;
    if (Date.now() - activeVideoSeenAt > 2000) return null;
    return activeVideoState;
  }

  function updateMeta() {
    const state = getFreshVideoState();
    if (!state) {
      meta.textContent = "Looking for video...";
      return;
    }

    const suffix = state.duration ? ` - ${formatTime(state.duration)}` : "";
    meta.textContent = `Video found${suffix}`;
  }

  function parseSubtitle(rawText, fileName) {
    const normalized = rawText
      .replace(/^\uFEFF/, "")
      .replace(/\r/g, "")
      .replace(/^WEBVTT[^\n]*(\n|$)/i, "")
      .trim();

    if (!normalized) return [];

    const blocks = normalized.split(/\n{2,}/);
    const entries = [];

    for (const block of blocks) {
      const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
      const timeLineIndex = lines.findIndex((line) => line.includes("-->"));
      if (timeLineIndex === -1) continue;

      const [startRaw, endRaw] = lines[timeLineIndex].split("-->").map((value) => value.trim());
      const start = parseTimestamp(startRaw);
      const end = parseTimestamp(endRaw);
      const text = lines
        .slice(timeLineIndex + 1)
        .join(" ")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();

      if (Number.isFinite(start) && Number.isFinite(end) && text) {
        entries.push({ start, end, text });
      }
    }

    if (!entries.length && /\.(srt|vtt)$/i.test(fileName)) {
      throw new Error("This looks like a subtitle file, but no timed lines were found.");
    }

    return entries.sort((a, b) => a.start - b.start);
  }

  function parseTimestamp(value) {
    const cleanValue = value.split(/\s+/)[0].replace(",", ".");
    const parts = cleanValue.split(":").map(Number);

    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return Number.NaN;
  }

  function renderSubtitles() {
    subtitleList.innerHTML = "";

    const fragment = document.createDocumentFragment();
    subtitles.forEach((subtitle, index) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      const time = document.createElement("span");
      const text = document.createElement("span");

      button.type = "button";
      button.className = "mes-item";
      button.dataset.index = String(index);
      button.addEventListener("click", () => {
        if (!getFreshVideoState()) return;
        sendCommand({ type: "playAt", time: Math.max(0, subtitle.start - offsetSeconds + 0.02) });
      });

      time.className = "mes-time";
      time.textContent = formatTime(subtitle.start);
      text.className = "mes-text";
      text.textContent = subtitle.text;

      button.append(time, text);
      item.append(button);
      fragment.append(item);
    });

    subtitleList.append(fragment);
  }

  function updateActiveSubtitle() {
    const state = getFreshVideoState();
    if (!state || !subtitles.length) {
      updateOverlayText("", false);
      return;
    }

    const subtitleTime = state.currentTime + offsetSeconds;
    const nextIndex = findSubtitleIndex(subtitleTime);

    if (nextIndex === activeIndex) return;

    if (activeButton) activeButton.classList.remove("mes-active");
    activeIndex = nextIndex;
    activeButton =
      nextIndex >= 0 ? subtitleList.querySelector(`[data-index="${nextIndex}"]`) : null;

    if (activeButton) {
      activeButton.classList.add("mes-active");
      currentLine.textContent = subtitles[nextIndex].text;
      updateOverlayText(subtitles[nextIndex].text, true);
      currentLine.classList.remove("mes-error");
      activeButton.scrollIntoView({ block: "center", behavior: "smooth" });
    } else {
      currentLine.textContent = "Between subtitle lines...";
      updateOverlayText("", false);
    }
  }

  function updateOverlayText(text, visible) {
    if (!uiEnabled) {
      text = "";
      visible = false;
    }

    mountFloatingSubForFullscreen();
    floatingSub.textContent = text;
    floatingSub.classList.toggle("mes-visible", visible);

    const state = getFreshVideoState();
    const message = {
      source: SOURCE,
      kind: "OVERLAY",
      targetFrameId: state?.frameId || null,
      text,
      visible,
    };

    broadcastToChildFrames(message);
  }

  function mountFloatingSubForFullscreen() {
    const fullscreenElement = document.fullscreenElement;
    const target =
      fullscreenElement && fullscreenElement !== floatingSub
        ? fullscreenElement
        : document.documentElement;

    if (floatingSub.parentElement !== target) {
      target.append(floatingSub);
    }
  }

  function updateTimeline() {
    const state = getFreshVideoState();
    if (!state) {
      timelineInput.max = "0";
      timelineInput.value = "0";
      currentTimeLabel.textContent = "0:00";
      durationLabel.textContent = "0:00";
      return;
    }

    timelineInput.max = String(state.duration || state.currentTime || 0);
    timelineInput.value = String(Math.min(state.currentTime, state.duration || state.currentTime));
    currentTimeLabel.textContent = formatTime(state.currentTime);
    durationLabel.textContent = state.duration ? formatTime(state.duration) : "0:00";
  }

  function updatePlayButton() {
    const state = getFreshVideoState();
    playButton.textContent = state && !state.paused ? "||" : ">";
    playButton.title = state && !state.paused ? "Pause" : "Play";
  }

  function findSubtitleIndex(time) {
    let low = 0;
    let high = subtitles.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const subtitle = subtitles[mid];

      if (time < subtitle.start) high = mid - 1;
      else if (time > subtitle.end) low = mid + 1;
      else return mid;
    }

    return -1;
  }

  function handleLooping() {
    const state = getFreshVideoState();
    if (!state || !loopCurrentLine || activeIndex < 0) return;

    const line = subtitles[activeIndex];
    const subtitleTime = state.currentTime + offsetSeconds;
    if (subtitleTime >= line.end - 0.05) {
      sendCommand({ type: "playAt", time: Math.max(0, line.start - offsetSeconds + 0.02) });
    }
  }

  function formatTime(seconds) {
    const safeSeconds = Math.max(0, seconds);
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const secs = Math.floor(safeSeconds % 60);

    if (hours > 0) return `${hours}:${pad(minutes)}:${pad(secs)}`;
    return `${minutes}:${pad(secs)}`;
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }
})();
