(() => {
  "use strict";

  const EMOJI = {
    sadness: "😢",
    joy: "😄",
    love: "💗",
    anger: "😠",
    fear: "😨",
    surprise: "😮",
  };

  const el = {
    form: document.getElementById("analysisForm"),
    statusDot: document.getElementById("statusDot"),
    serverStatusText: document.getElementById("serverStatusText"),
    textInput: document.getElementById("textInput"),
    charCount: document.getElementById("charCount"),
    analyzeBtn: document.getElementById("analyzeBtn"),
    errorMsg: document.getElementById("errorMsg"),
    orb: document.getElementById("orb"),
    orbEmoji: document.getElementById("orbEmoji"),
    signalRing: document.getElementById("signalRing"),
    previewTitle: document.getElementById("previewTitle"),
    previewText: document.getElementById("previewText"),
    resultSection: document.getElementById("resultSection"),
    emotionWord: document.getElementById("emotionWord"),
    emotionEmoji: document.getElementById("emotionEmoji"),
    confidenceText: document.getElementById("confidenceText"),
    echoedText: document.getElementById("echoedText"),
    confidenceMeter: document.getElementById("confidenceMeter"),
    meterValue: document.getElementById("meterValue"),
    resultSummary: document.getElementById("resultSummary"),
    barsContainer: document.getElementById("barsContainer"),
  };

  let modelReady = false;
  let isProcessing = false;

  async function checkHealth() {
    try {
      const res = await fetch("/health");
      if (!res.ok) throw new Error("Health check failed");

      const data = await res.json();
      modelReady = Boolean(data.model_loaded);

      if (modelReady) {
        setStatus("live", "Model ready");
      } else {
        setStatus("warming", "Model warming up");
        window.setTimeout(checkHealth, 3000);
      }
    } catch {
      modelReady = false;
      setStatus("down", "Server unavailable");
      window.setTimeout(checkHealth, 5000);
    }

    syncButtonState();
  }

  function setStatus(kind, text) {
    el.statusDot.className = `status-dot ${kind}`;
    el.serverStatusText.textContent = text;
  }

  function syncButtonState() {
    const hasText = el.textInput.value.trim().length > 0;
    el.analyzeBtn.disabled = !hasText || !modelReady || isProcessing;
  }

  function updateCharacterCount() {
    el.charCount.textContent = el.textInput.value.length;
  }

  el.textInput.addEventListener("input", () => {
    updateCharacterCount();
    hideError();
    syncButtonState();
  });

  el.textInput.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      runAnalysis();
    }
  });

  el.form.addEventListener("submit", (event) => {
    event.preventDefault();
    runAnalysis();
  });

  async function runAnalysis() {
    const text = el.textInput.value.trim();
    if (!text || !modelReady || isProcessing) return;

    hideError();
    enterThinking();

    try {
      const res = await fetch("/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const detail = body && body.detail
          ? typeof body.detail === "string"
            ? body.detail
            : "Moodline could not process that sentence."
          : `Request failed (${res.status}).`;
        throw new Error(detail);
      }

      const data = await res.json();
      renderResult(data, text);
    } catch (error) {
      exitThinking(false);
      showError(error.message || "Something went wrong. Try again.");
    }
  }

  function enterThinking() {
    isProcessing = true;
    el.analyzeBtn.classList.add("loading");
    el.analyzeBtn.querySelector(".btn-label").textContent = "Analyzing";
    el.orb.classList.remove("settled");
    el.orb.classList.add("thinking");
    el.orbEmoji.textContent = "AI";
    el.previewTitle.textContent = "Reading signal";
    el.previewText.textContent = "Moodline is comparing the sentence against the model's learned emotion patterns.";
    syncButtonState();
  }

  function exitThinking(success) {
    isProcessing = false;
    el.analyzeBtn.classList.remove("loading");
    el.analyzeBtn.querySelector(".btn-label").textContent = "Analyze mood";
    el.orb.classList.remove("thinking");

    if (!success) {
      el.orbEmoji.textContent = "AI";
      el.signalRing.style.setProperty("--meter", "0%");
      el.previewTitle.textContent = "Analysis paused";
      el.previewText.textContent = "Check the message below and try the sentence again.";
    }

    syncButtonState();
  }

  function renderResult(data, originalText) {
    const emotion = data.predicted_emotion;
    const confidence = Number(data.confidence || 0);
    const percentage = clamp(confidence * 100, 0, 100);
    const emoji = EMOJI[emotion] || "🙂";

    document.body.setAttribute("data-emotion", emotion);
    el.signalRing.style.setProperty("--meter", `${percentage}%`);
    el.confidenceMeter.style.setProperty("--meter", `${percentage}%`);

    el.orb.classList.add("settled");
    el.orbEmoji.textContent = emoji;
    el.previewTitle.textContent = `${capitalize(emotion)} detected`;
    el.previewText.textContent = `${percentage.toFixed(1)}% confidence from the live model response.`;

    el.emotionWord.textContent = capitalize(emotion);
    el.emotionEmoji.textContent = emoji;
    el.confidenceText.textContent = `${percentage.toFixed(1)}% confidence`;
    el.meterValue.textContent = `${Math.round(percentage)}%`;
    el.echoedText.textContent = `“${originalText}”`;
    el.resultSummary.textContent = buildSummary(emotion, percentage);

    renderBars(data.all_probabilites || {});
    revealResults();
    exitThinking(true);
  }

  function renderBars(probabilities) {
    const entries = Object.entries(probabilities).sort((a, b) => b[1] - a[1]);
    el.barsContainer.innerHTML = "";

    entries.forEach(([label, value], index) => {
      const percentage = clamp(Number(value) * 100, 0, 100);
      const row = document.createElement("div");
      row.className = `bar-row bar-${label}`;
      row.innerHTML = `
        <span class="bar-label" title="${label}">
          <span aria-hidden="true">${EMOJI[label] || ""}</span>
          <span>${label}</span>
        </span>
        <span class="bar-track" aria-hidden="true"><span class="bar-fill"></span></span>
        <span class="bar-pct">${percentage.toFixed(1)}%</span>
      `;

      el.barsContainer.appendChild(row);
      const fill = row.querySelector(".bar-fill");
      window.setTimeout(() => {
        fill.style.width = `${percentage}%`;
      }, 80 + index * 80);
    });
  }

  function revealResults() {
    el.resultSection.hidden = false;
    el.resultSection.classList.remove("entering");
    void el.resultSection.offsetWidth;
    el.resultSection.classList.add("entering");
    el.resultSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function showError(message) {
    el.errorMsg.textContent = message;
    el.errorMsg.hidden = false;
  }

  function hideError() {
    el.errorMsg.hidden = true;
  }

  function buildSummary(emotion, percentage) {
    const confidenceLabel = percentage >= 55 ? "strong" : percentage >= 32 ? "moderate" : "subtle";
    return `The model sees a ${confidenceLabel} ${emotion} signal in this sentence. Review the spectrum below for competing emotional cues.`;
  }

  function capitalize(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  updateCharacterCount();
  checkHealth();
})();
