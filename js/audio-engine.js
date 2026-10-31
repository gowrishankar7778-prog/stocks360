/**
 * Stocks 360 - Cloud Audio Engine (audio-engine.js)
 *
 * All Google Cloud Voice API configurations, keys, and compressed MP3 files
 * are stored strictly in Google Cloud Firebase Firestore (`site_settings/google_voice_api`
 * and `site_settings/audio_<id>`) and are NEVER placed in GitHub.
 */

const StocksAudioEngine = (function () {
  const IDB_NAME = "stocks360_audio_cache_db";
  const IDB_STORE = "compressed_mp3_store";
  const VOICE_CONFIG_CACHE_KEY = "stocks360_firebase_voice_config";

  let cachedVoiceConfig = null;

  // ---------------- LOAD GOOGLE VOICE API CONFIG FROM FIREBASE ----------------
  async function getFirebaseVoiceConfig() {
    if (cachedVoiceConfig && cachedVoiceConfig.voiceStreamUrl) {
      return cachedVoiceConfig;
    }

    try {
      const localSaved = sessionStorage.getItem(VOICE_CONFIG_CACHE_KEY);
      if (localSaved) {
        cachedVoiceConfig = JSON.parse(localSaved);
        if (cachedVoiceConfig && cachedVoiceConfig.voiceStreamUrl) {
          return cachedVoiceConfig;
        }
      }
    } catch (_) {}

    // 1. Load from Google Firebase Firestore (`site_settings/google_voice_api`)
    if (typeof StocksFirebase !== "undefined" && StocksFirebase.isReady()) {
      try {
        const doc = await StocksFirebase.getDb()
          .collection("site_settings")
          .doc("google_voice_api")
          .get();
        if (doc.exists) {
          cachedVoiceConfig = doc.data() || {};
          try {
            sessionStorage.setItem(VOICE_CONFIG_CACHE_KEY, JSON.stringify(cachedVoiceConfig));
          } catch (_) {}
          return cachedVoiceConfig;
        }
      } catch (err) {
        console.warn("Firebase voice config load note:", err.message);
      }
    }

    // 2. Fallback to runtime config loaded from gitignored firebase-secret.json
    if (typeof FIREBASE_CONFIG !== "undefined" && FIREBASE_CONFIG.googleVoiceApi) {
      cachedVoiceConfig = Object.assign(
        { apiKey: FIREBASE_CONFIG.apiKey || "" },
        FIREBASE_CONFIG.googleVoiceApi
      );
      return cachedVoiceConfig;
    }

    return {};
  }

  // ---------------- INDEXEDDB PERSISTENT CACHE (0 REPEAT FIRESTORE READS) ----------------
  function openCacheDb() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        return reject(new Error("IndexedDB not supported"));
      }
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function (e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = function (e) {
        resolve(e.target.result);
      };
      req.onerror = function (e) {
        reject(e.target.error);
      };
    });
  }

  async function getCachedAudio(articleId) {
    try {
      const db = await openCacheDb();
      return await new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE, "readonly");
        const store = tx.objectStore(IDB_STORE);
        const req = store.get(articleId);
        req.onsuccess = () => resolve(req.result ? req.result.audioDataUrl : null);
        req.onerror = () => resolve(null);
      });
    } catch (_) {
      return null;
    }
  }

  async function setCachedAudio(articleId, audioDataUrl, meta) {
    try {
      const db = await openCacheDb();
      await new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        const store = tx.objectStore(IDB_STORE);
        store.put({
          id: articleId,
          audioDataUrl: audioDataUrl,
          updatedAt: Date.now(),
          meta: meta || {}
        });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (_) {}
  }

  // ---------------- TEXT NORMALIZATION & SENTENCE CHUNKING ----------------
  function buildNarrationScript(article) {
    if (!article) return "";
    const parts = [];
    if (article.title) {
      parts.push(cleanHtmlToText(article.title) + ".");
    }
    if (article.content) {
      parts.push(cleanHtmlToText(article.content));
    }
    if (article.glossary && article.glossary.trim()) {
      parts.push("Glossary. " + cleanHtmlToText(article.glossary));
    }
    const takeaways = article.takeaways || article.synopsis || "";
    if (takeaways && takeaways.trim()) {
      parts.push("Key Takeaways. " + cleanHtmlToText(takeaways));
    }
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  function cleanHtmlToText(html) {
    if (!html) return "";
    return String(html)
      .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, ". ")
      .replace(/<br\s*\/?>/gi, ". ")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, " and ")
      .replace(/&lt;/gi, " ")
      .replace(/&gt;/gi, " ")
      .replace(/\.\s*\./g, ".")
      .replace(/\s+/g, " ")
      .trim();
  }

  function splitIntoChunks(text, maxLen = 175) {
    const clean = cleanHtmlToText(text);
    if (!clean) return [];
    const rawSentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [clean];
    const chunks = [];
    let current = "";

    for (let i = 0; i < rawSentences.length; i++) {
      const trimmed = rawSentences[i].trim();
      if (!trimmed) continue;
      if ((current ? current + " " + trimmed : trimmed).length <= maxLen) {
        current = current ? current + " " + trimmed : trimmed;
      } else {
        if (current) chunks.push(current);
        if (trimmed.length <= maxLen) {
          current = trimmed;
        } else {
          const words = trimmed.split(" ");
          let temp = "";
          for (let j = 0; j < words.length; j++) {
            const w = words[j];
            if ((temp ? temp + " " + w : w).length <= maxLen) {
              temp = temp ? temp + " " + w : w;
            } else {
              if (temp) chunks.push(temp);
              temp = w;
            }
          }
          current = temp;
        }
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }

  function buildVoiceStreamUrl(voiceCfg, chunkText, lang) {
    const baseUrl = voiceCfg && voiceCfg.voiceStreamUrl;
    if (!baseUrl) return "";
    const tl = lang || (voiceCfg && voiceCfg.languageCode) || "en-IN";
    return (
      baseUrl +
      "?ie=UTF-8&client=tw-ob&tl=" +
      encodeURIComponent(tl) +
      "&q=" +
      encodeURIComponent(chunkText)
    );
  }

  // ---------------- MP3 COMPRESSION ENGINE (LAMEJS 32KBPS MONO @ 24KHZ) ----------------
  function encodePcmToCompressedMp3DataUrl(float32Samples, sampleRate, kbps = 32) {
    if (typeof lamejs === "undefined") {
      throw new Error("MP3 compression library (lamejs) is not loaded.");
    }
    const targetSampleRate = sampleRate || 24000;
    const mp3encoder = new lamejs.Mp3Encoder(1, targetSampleRate, kbps);
    const samplesInt16 = new Int16Array(float32Samples.length);

    for (let i = 0; i < float32Samples.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Samples[i]));
      samplesInt16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    const mp3Data = [];
    const blockSize = 1152;
    for (let i = 0; i < samplesInt16.length; i += blockSize) {
      const sampleChunk = samplesInt16.subarray(i, i + blockSize);
      const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
      if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
      }
    }
    const mp3End = mp3encoder.flush();
    if (mp3End.length > 0) {
      mp3Data.push(mp3End);
    }

    const blob = new Blob(mp3Data, { type: "audio/mp3" });
    return blobToDataUrl(blob);
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function compressAudioBlobToMp3(blobOrFile, kbps = 32) {
    const arrayBuffer = await blobOrFile.arrayBuffer();
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const tempCtx = new AudioCtx();
    const decoded = await tempCtx.decodeAudioData(arrayBuffer);
    await tempCtx.close();

    const targetRate = 24000;
    const targetLength = Math.ceil(decoded.duration * targetRate);
    const offlineCtx = new OfflineAudioContext(1, targetLength, targetRate);
    const src = offlineCtx.createBufferSource();
    src.buffer = decoded;
    src.connect(offlineCtx.destination);
    src.start(0);

    const rendered = await offlineCtx.startRendering();
    const monoData = rendered.getChannelData(0);
    const dataUrl = await encodePcmToCompressedMp3DataUrl(monoData, targetRate, kbps);
    const approxBytes = Math.round((dataUrl.length * 3) / 4);
    return {
      dataUrl: dataUrl,
      sizeBytes: approxBytes,
      sizeKb: (approxBytes / 1024).toFixed(1),
      durationSec: Math.round(decoded.duration)
    };
  }

  /**
   * Synthesizes pleasant Google Cloud Voice MP3 using configuration stored in Firebase (`site_settings/google_voice_api`)
   */
  async function synthesizeCloudTtsMp3(text, voiceOption) {
    const voiceCfg = await getFirebaseVoiceConfig();
    const apiKey = voiceCfg.apiKey || (typeof FIREBASE_CONFIG !== "undefined" ? FIREBASE_CONFIG.apiKey : "");
    const cloudTtsUrl = voiceCfg.cloudTtsUrl;

    if (apiKey && cloudTtsUrl) {
      const voiceName = (voiceOption && voiceOption.name) || voiceCfg.voiceName || "en-IN-Neural2-A";
      const langCode = (voiceOption && voiceOption.lang) || voiceCfg.languageCode || "en-IN";
      const speakingRate = parseFloat(voiceCfg.speakingRate || "0.96") || 0.96;
      const sampleRateHertz = parseInt(voiceCfg.sampleRateHertz || "24000", 10) || 24000;

      try {
        const res = await fetch(
          cloudTtsUrl + "?key=" + encodeURIComponent(apiKey),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              input: { text: cleanHtmlToText(text).slice(0, 4800) },
              voice: {
                languageCode: langCode,
                name: voiceName
              },
              audioConfig: {
                audioEncoding: "MP3",
                speakingRate: speakingRate,
                pitch: 0.0,
                sampleRateHertz: sampleRateHertz
              }
            })
          }
        );

        if (res.ok) {
          const data = await res.json();
          if (data && data.audioContent) {
            const rawBinary = atob(data.audioContent);
            const bytes = new Uint8Array(rawBinary.length);
            for (let i = 0; i < rawBinary.length; i++) {
              bytes[i] = rawBinary.charCodeAt(i);
            }
            const rawBlob = new Blob([bytes], { type: "audio/mp3" });
            if (typeof lamejs !== "undefined") {
              return await compressAudioBlobToMp3(rawBlob, 32);
            }
            const dataUrl = "data:audio/mp3;base64," + data.audioContent;
            return {
              dataUrl: dataUrl,
              sizeBytes: bytes.length,
              sizeKb: (bytes.length / 1024).toFixed(1),
              durationSec: Math.max(1, Math.round(bytes.length / 4000))
            };
          }
        }
      } catch (_) {}
    }
    return null;
  }

  // ---------------- FIRESTORE ON-DEMAND AUDIO STORAGE ----------------
  async function saveArticleAudioToFirestore(articleId, audioPayload) {
    if (!articleId || !audioPayload || !audioPayload.dataUrl) return false;
    await setCachedAudio(articleId, audioPayload.dataUrl, {
      sizeKb: audioPayload.sizeKb
    });

    if (typeof StocksFirebase !== "undefined" && StocksFirebase.isReady()) {
      try {
        await StocksFirebase.getDb()
          .collection("site_settings")
          .doc("audio_" + articleId)
          .set({
            id: articleId,
            audioDataUrl: audioPayload.dataUrl,
            sizeKb: audioPayload.sizeKb || "0",
            format: "audio/mp3",
            updatedAt: Date.now()
          });
        return true;
      } catch (err) {
        console.warn("Firestore audio save note:", err.message);
      }
    }
    return false;
  }

  async function resolveArticleAudioSource(article) {
    if (!article) return { type: "none" };

    // 1. Check browser IndexedDB cache first (0 repeat Firestore reads!)
    const cachedDataUrl = await getCachedAudio(article.id);
    if (cachedDataUrl) {
      return {
        type: "single-mp3",
        src: cachedDataUrl
      };
    }

    // 2. Fetch on-demand compressed MP3 from Google Firebase Firestore (`site_settings/audio_<id>`)
    if (typeof StocksFirebase !== "undefined" && StocksFirebase.isReady() && article.id) {
      try {
        const doc = await StocksFirebase.getDb()
          .collection("site_settings")
          .doc("audio_" + article.id)
          .get();
        if (doc.exists) {
          const data = doc.data();
          if (data && data.audioDataUrl) {
            await setCachedAudio(article.id, data.audioDataUrl, { sizeKb: data.sizeKb });
            return {
              type: "single-mp3",
              src: data.audioDataUrl
            };
          }
        }
      } catch (_) {}
    }

    // 3. Stream using Google Voice API config loaded from Firebase (`site_settings/google_voice_api`)
    const voiceCfg = await getFirebaseVoiceConfig();
    const fullScript = buildNarrationScript(article);
    const chunks = splitIntoChunks(fullScript, 175);
    const lang = article.audioVoiceLang || voiceCfg.languageCode || "en-IN";
    return {
      type: "chunked-mp3",
      chunks: chunks,
      urls: chunks.map((c) => buildVoiceStreamUrl(voiceCfg, c, lang)).filter(Boolean)
    };
  }

  // ---------------- FULL AUDIO PLAYER CONTROLLER ----------------
  let activeController = null;

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const totalSec = Math.floor(seconds);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return mins + ":" + (secs < 10 ? "0" + secs : secs);
  }

  function stopActivePlayer() {
    if (activeController && typeof activeController.destroy === "function") {
      activeController.destroy();
      activeController = null;
    }
  }

  async function mountArticlePlayer(article, elements) {
    stopActivePlayer();

    const {
      triggerBtn,
      containerEl,
      audioEl,
      playPauseBtn,
      playPauseIcon,
      playPauseLabel,
      rewind10Btn,
      forward10Btn,
      seekSlider,
      currentTimeEl,
      totalDurationEl,
      speedSelect
    } = elements;

    if (!containerEl || !audioEl) return;

    // Initially keep audio controls hidden and show ONLY the "Listen to the Article" button
    containerEl.hidden = true;
    if (triggerBtn) {
      triggerBtn.hidden = false;
      triggerBtn.setAttribute("aria-expanded", "false");
    }

    let hasStartedOnce = false;
    let isSeeking = false;
    let sourceInitialized = false;
    let currentPlaybackRate = parseFloat(speedSelect ? speedSelect.value : "1") || 1.0;

    function updatePlayButtonUI(isPlaying) {
      if (!playPauseBtn) return;
      if (isPlaying) {
        playPauseBtn.setAttribute("aria-label", "Pause");
        playPauseBtn.setAttribute("data-state", "playing");
        if (playPauseIcon) playPauseIcon.innerHTML = "&#10074;&#10074;";
        if (playPauseLabel) playPauseLabel.textContent = "Pause";
      } else if (hasStartedOnce && getCurrentTime() > 0 && getCurrentTime() < getTotalDuration() - 0.3) {
        playPauseBtn.setAttribute("aria-label", "Resume");
        playPauseBtn.setAttribute("data-state", "paused");
        if (playPauseIcon) playPauseIcon.innerHTML = "&#9654;";
        if (playPauseLabel) playPauseLabel.textContent = "Resume";
      } else {
        playPauseBtn.setAttribute("aria-label", "Play");
        playPauseBtn.setAttribute("data-state", "idle");
        if (playPauseIcon) playPauseIcon.innerHTML = "&#9654;";
        if (playPauseLabel) playPauseLabel.textContent = "Play";
      }
    }

    function updateSliderFill(percent) {
      if (!seekSlider) return;
      const clamped = Math.max(0, Math.min(100, percent || 0));
      seekSlider.style.setProperty("--seek-fill", clamped.toFixed(1) + "%");
    }

    updatePlayButtonUI(false);
    if (seekSlider) {
      seekSlider.value = "0";
      updateSliderFill(0);
    }
    if (currentTimeEl) currentTimeEl.textContent = "0:00";

    const fullText = buildNarrationScript(article);
    const wordCount = fullText.split(/\s+/).filter(Boolean).length;
    const estimatedTotalSec = Math.max(8, Math.round(wordCount / 2.45));
    if (totalDurationEl) totalDurationEl.textContent = formatTime(estimatedTotalSec);

    let mode = "single-mp3";
    let chunkUrls = [];
    let chunkDurations = [];
    let currentChunkIdx = 0;
    let isPlayingState = false;

    async function ensureAudioSourceLoaded() {
      if (sourceInitialized) return;
      sourceInitialized = true;

      const sourceInfo = await resolveArticleAudioSource(article);
      mode = sourceInfo.type;
      chunkUrls = sourceInfo.urls || [];

      if (mode === "chunked-mp3" && chunkUrls.length > 0) {
        const totalChars = sourceInfo.chunks.reduce((acc, c) => acc + c.length, 0) || 1;
        chunkDurations = sourceInfo.chunks.map((c) =>
          Math.max(2.5, (c.length / totalChars) * estimatedTotalSec)
        );
        if (totalDurationEl) {
          totalDurationEl.textContent = formatTime(
            chunkDurations.reduce((a, b) => a + b, 0)
          );
        }
        audioEl.src = chunkUrls[0];
      } else if (mode === "single-mp3" && sourceInfo.src) {
        audioEl.src = sourceInfo.src;
        audioEl.load();
      }
      audioEl.playbackRate = currentPlaybackRate;
    }

    function getTotalDuration() {
      if (mode === "single-mp3") {
        if (Number.isFinite(audioEl.duration) && audioEl.duration > 0) {
          return audioEl.duration;
        }
        return estimatedTotalSec;
      }
      return chunkDurations.reduce((a, b) => a + b, 0) || estimatedTotalSec;
    }

    function getCurrentTime() {
      if (mode === "single-mp3") {
        return audioEl.currentTime || 0;
      }
      let elapsedBefore = 0;
      for (let i = 0; i < currentChunkIdx; i++) {
        elapsedBefore += chunkDurations[i] || 0;
      }
      return elapsedBefore + (audioEl.currentTime || 0);
    }

    function seekToSeconds(targetSeconds) {
      const total = getTotalDuration();
      const clamped = Math.max(0, Math.min(total, targetSeconds));

      if (mode === "single-mp3") {
        try {
          audioEl.currentTime = clamped;
        } catch (_) {}
        syncProgressUI(clamped, total);
        return;
      }

      let accum = 0;
      let targetIdx = 0;
      let offsetInChunk = 0;
      for (let i = 0; i < chunkDurations.length; i++) {
        const d = chunkDurations[i];
        if (clamped <= accum + d || i === chunkDurations.length - 1) {
          targetIdx = i;
          offsetInChunk = Math.max(0, clamped - accum);
          break;
        }
        accum += d;
      }

      const wasPlaying = isPlayingState;
      if (targetIdx !== currentChunkIdx) {
        currentChunkIdx = targetIdx;
        audioEl.src = chunkUrls[currentChunkIdx];
        audioEl.playbackRate = currentPlaybackRate;
        audioEl.addEventListener(
          "loadedmetadata",
          function onMeta() {
            audioEl.removeEventListener("loadedmetadata", onMeta);
            try {
              audioEl.currentTime = Math.min(offsetInChunk, audioEl.duration || offsetInChunk);
            } catch (_) {}
            if (wasPlaying) {
              audioEl.play().catch(() => {});
            }
          },
          { once: true }
        );
        audioEl.load();
      } else {
        try {
          audioEl.currentTime = offsetInChunk;
        } catch (_) {}
      }
      syncProgressUI(clamped, total);
    }

    function syncProgressUI(cur, tot) {
      const current = cur !== undefined ? cur : getCurrentTime();
      const total = tot !== undefined ? tot : getTotalDuration();
      if (currentTimeEl) currentTimeEl.textContent = formatTime(current);
      if (totalDurationEl && total > 0) totalDurationEl.textContent = formatTime(total);
      if (seekSlider && !isSeeking && total > 0) {
        const pct = Math.max(0, Math.min(100, (current / total) * 100));
        seekSlider.value = pct.toFixed(2);
        updateSliderFill(pct);
      }
    }

    function onLoadedMetadata() {
      audioEl.playbackRate = currentPlaybackRate;
      if (mode === "chunked-mp3" && Number.isFinite(audioEl.duration) && audioEl.duration > 0) {
        chunkDurations[currentChunkIdx] = audioEl.duration;
      }
      syncProgressUI();
    }

    function onTimeUpdate() {
      syncProgressUI();
    }

    function onPlay() {
      if (typeof window.stopSpeech === "function") {
        window.stopSpeech();
      }
      hasStartedOnce = true;
      isPlayingState = true;
      audioEl.playbackRate = currentPlaybackRate;
      updatePlayButtonUI(true);
    }

    function onPause() {
      isPlayingState = false;
      updatePlayButtonUI(false);
    }

    function onEnded() {
      if (mode === "chunked-mp3" && currentChunkIdx < chunkUrls.length - 1) {
        currentChunkIdx++;
        audioEl.src = chunkUrls[currentChunkIdx];
        audioEl.playbackRate = currentPlaybackRate;
        audioEl.play().catch(() => {});
        return;
      }
      isPlayingState = false;
      hasStartedOnce = false;
      if (mode === "chunked-mp3" && chunkUrls.length > 0) {
        currentChunkIdx = 0;
        audioEl.src = chunkUrls[0];
      } else {
        try {
          audioEl.currentTime = 0;
        } catch (_) {}
      }
      syncProgressUI(0, getTotalDuration());
      updatePlayButtonUI(false);
    }

    async function onError() {
      if (mode === "single-mp3") {
        const voiceCfg = await getFirebaseVoiceConfig();
        const fallbackChunks = splitIntoChunks(fullText, 175);
        if (fallbackChunks.length > 0 && voiceCfg.voiceStreamUrl) {
          mode = "chunked-mp3";
          chunkUrls = fallbackChunks.map((c) =>
            buildVoiceStreamUrl(voiceCfg, c, voiceCfg.languageCode || "en-IN")
          );
          const totalChars = fallbackChunks.reduce((acc, c) => acc + c.length, 0) || 1;
          chunkDurations = fallbackChunks.map((c) =>
            Math.max(2.5, (c.length / totalChars) * estimatedTotalSec)
          );
          currentChunkIdx = 0;
          audioEl.src = chunkUrls[0];
          audioEl.playbackRate = currentPlaybackRate;
          if (isPlayingState) {
            audioEl.play().catch(() => {});
          }
        }
      }
    }

    audioEl.addEventListener("loadedmetadata", onLoadedMetadata);
    audioEl.addEventListener("timeupdate", onTimeUpdate);
    audioEl.addEventListener("play", onPlay);
    audioEl.addEventListener("pause", onPause);
    audioEl.addEventListener("ended", onEnded);
    audioEl.addEventListener("error", onError);

    async function handleTriggerClick() {
      if (typeof window.stopSpeech === "function") {
        window.stopSpeech();
      }
      if (triggerBtn) {
        triggerBtn.hidden = true;
        triggerBtn.setAttribute("aria-expanded", "true");
      }
      containerEl.hidden = false;

      await ensureAudioSourceLoaded();
      audioEl.playbackRate = currentPlaybackRate;
      audioEl.play().catch((err) => {
        console.warn("Audio playback start note:", err.message);
      });
      if (playPauseBtn) {
        playPauseBtn.focus();
      }
    }

    async function handlePlayPauseClick() {
      if (typeof window.stopSpeech === "function") {
        window.stopSpeech();
      }
      await ensureAudioSourceLoaded();
      if (!audioEl.paused) {
        audioEl.pause();
      } else {
        audioEl.playbackRate = currentPlaybackRate;
        audioEl.play().catch((err) => {
          console.warn("Audio playback start note:", err.message);
        });
      }
    }

    function handleRewind10() {
      seekToSeconds(getCurrentTime() - 10);
    }

    function handleForward10() {
      seekToSeconds(getCurrentTime() + 10);
    }

    function handleSliderInput() {
      isSeeking = true;
      const pct = parseFloat(seekSlider.value) || 0;
      updateSliderFill(pct);
      const previewSec = (pct / 100) * getTotalDuration();
      if (currentTimeEl) currentTimeEl.textContent = formatTime(previewSec);
    }

    function handleSliderChange() {
      const pct = parseFloat(seekSlider.value) || 0;
      const targetSec = (pct / 100) * getTotalDuration();
      isSeeking = false;
      seekToSeconds(targetSec);
    }

    function handleSpeedChange() {
      const rate = parseFloat(speedSelect.value) || 1.0;
      currentPlaybackRate = rate;
      audioEl.playbackRate = rate;
    }

    if (triggerBtn) triggerBtn.addEventListener("click", handleTriggerClick);
    if (playPauseBtn) playPauseBtn.addEventListener("click", handlePlayPauseClick);
    if (rewind10Btn) rewind10Btn.addEventListener("click", handleRewind10);
    if (forward10Btn) forward10Btn.addEventListener("click", handleForward10);
    if (seekSlider) {
      seekSlider.addEventListener("input", handleSliderInput);
      seekSlider.addEventListener("change", handleSliderChange);
    }
    if (speedSelect) {
      speedSelect.addEventListener("change", handleSpeedChange);
    }

    activeController = {
      destroy: function () {
        try {
          audioEl.pause();
        } catch (_) {}
        audioEl.removeEventListener("loadedmetadata", onLoadedMetadata);
        audioEl.removeEventListener("timeupdate", onTimeUpdate);
        audioEl.removeEventListener("play", onPlay);
        audioEl.removeEventListener("pause", onPause);
        audioEl.removeEventListener("ended", onEnded);
        audioEl.removeEventListener("error", onError);

        if (triggerBtn) triggerBtn.removeEventListener("click", handleTriggerClick);
        if (playPauseBtn) playPauseBtn.removeEventListener("click", handlePlayPauseClick);
        if (rewind10Btn) rewind10Btn.removeEventListener("click", handleRewind10);
        if (forward10Btn) forward10Btn.removeEventListener("click", handleForward10);
        if (seekSlider) {
          seekSlider.removeEventListener("input", handleSliderInput);
          seekSlider.removeEventListener("change", handleSliderChange);
        }
        if (speedSelect) {
          speedSelect.removeEventListener("change", handleSpeedChange);
        }
      }
    };
  }

  return {
    buildNarrationScript: buildNarrationScript,
    compressAudioBlobToMp3: compressAudioBlobToMp3,
    synthesizeCloudTtsMp3: synthesizeCloudTtsMp3,
    saveArticleAudioToFirestore: saveArticleAudioToFirestore,
    resolveArticleAudioSource: resolveArticleAudioSource,
    mountArticlePlayer: mountArticlePlayer,
    stopActivePlayer: stopActivePlayer
  };
})();

if (typeof window !== "undefined") {
  window.StocksAudioEngine = StocksAudioEngine;
}
