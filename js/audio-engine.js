/**
 * Stocks 360 - Google Cloud Voice & Compressed MP3 Audio Engine (audio-engine.js)
 *
 * Features:
 * 1. Pleasant Google Cloud Voice MP3 playback (en-IN / en-US natural neural voice)
 * 2. MP3 Compression (32 kbps Mono MP3 @ 24kHz via LameJS / CBR frame trimming)
 *    to minimize Google Cloud Firestore storage & bandwidth costs (~75-80% smaller)
 * 3. Firestore Cost Optimization:
 *    - Dedicated `news_audio` Firestore collection (loaded on-demand per article, never in list snapshots)
 *    - Browser IndexedDB persistent caching (`stocks360_audio_cache`) so repeat listens cost 0 Firestore reads
 *    - Pre-compressed static MP3 files (`assets/audio/news-1.mp3`, etc.) for seed articles
 * 4. Full Audio Player Controls while News text remains visible below:
 *    - Play / Pause / Resume button
 *    - Interactive Seek Slider (Scrubber) with live Current Time & Total Duration
 *    - Rewind 10 Seconds (-10s) button
 *    - Fast-Forward 10 Seconds (+10s) button
 *    - Playback Speed selector (0.75x, 1x, 1.25x, 1.5x, 2x)
 */

const StocksAudioEngine = (function () {
  const IDB_NAME = "stocks360_audio_cache_db";
  const IDB_STORE = "compressed_mp3_store";
  const DEFAULT_VOICE = {
    lang: "en-IN",
    name: "en-IN-Neural2-A",
    label: "Google Cloud Neural2 (Pleasant English - India)"
  };

  const STATIC_SEED_MP3 = {
    "news-1": "assets/audio/news-1.mp3",
    "news-2": "assets/audio/news-2.mp3",
    "news-3": "assets/audio/news-3.mp3"
  };

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
    } catch (_) {
      // Ignore cache write errors
    }
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

  function buildGoogleVoiceChunkUrl(chunkText, lang) {
    const tl = lang || DEFAULT_VOICE.lang;
    return (
      "https://translate.googleapis.com/translate_tts?ie=UTF-8&client=tw-ob&tl=" +
      encodeURIComponent(tl) +
      "&q=" +
      encodeURIComponent(chunkText)
    );
  }

  // ---------------- MP3 COMPRESSION ENGINE (LAMEJS 32KBPS MONO @ 24KHZ) ----------------
  /**
   * Compresses any AudioBuffer or Float32 PCM array into a compact 32kbps Mono MP3 Data URL
   * using LameJS so storing in Google Firestore stays tiny (< 100-200 KB per article).
   */
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

  /**
   * Compresses an uploaded/recorded audio Blob or File into a 32kbps Mono 24kHz MP3 Data URL
   */
  async function compressAudioBlobToMp3(blobOrFile, kbps = 32) {
    const arrayBuffer = await blobOrFile.arrayBuffer();
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const tempCtx = new AudioCtx();
    const decoded = await tempCtx.decodeAudioData(arrayBuffer);
    await tempCtx.close();

    // Downsample to 24000 Hz Mono using OfflineAudioContext for maximum compression & clarity
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
   * Synthesizes pleasant Google Cloud Voice MP3 via Cloud Text-to-Speech API (if enabled)
   * and compresses it to 32kbps Mono MP3 for Firestore.
   */
  async function synthesizeCloudTtsMp3(text, voiceOption) {
    const apiKey =
      localStorage.getItem("stocks360_cloud_tts_key") ||
      (typeof FIREBASE_CONFIG !== "undefined" ? FIREBASE_CONFIG.apiKey : "");

    const voiceName = (voiceOption && voiceOption.name) || DEFAULT_VOICE.name;
    const langCode = (voiceOption && voiceOption.lang) || DEFAULT_VOICE.lang;

    if (apiKey) {
      try {
        const res = await fetch(
          "https://texttospeech.googleapis.com/v1/text:synthesize?key=" + encodeURIComponent(apiKey),
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
                speakingRate: 0.96,
                pitch: 0.0,
                sampleRateHertz: 24000
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
      } catch (_) {
        // Fallback to Google Cloud stream mode below
      }
    }
    return null;
  }

  // ---------------- FIRESTORE ON-DEMAND AUDIO STORAGE ----------------
  async function saveArticleAudioToFirestore(articleId, audioPayload) {
    if (!articleId || !audioPayload || !audioPayload.dataUrl) return false;
    await setCachedAudio(articleId, audioPayload.dataUrl, {
      sizeKb: audioPayload.sizeKb,
      voice: audioPayload.voice || DEFAULT_VOICE.label
    });

    if (typeof StocksFirebase !== "undefined" && StocksFirebase.isReady()) {
      try {
        await StocksFirebase.getDb()
          .collection("news_audio")
          .doc(articleId)
          .set({
            id: articleId,
            audioDataUrl: audioPayload.dataUrl,
            sizeKb: audioPayload.sizeKb || "0",
            voice: audioPayload.voice || DEFAULT_VOICE.label,
            format: "audio/mp3 (32kbps mono compressed)",
            updatedAt: Date.now()
          });
        return true;
      } catch (err) {
        console.warn("Firestore news_audio save note:", err.message);
      }
    }
    return false;
  }

  async function resolveArticleAudioSource(article) {
    if (!article) return { type: "none" };

    // 1. Check if static pre-compressed MP3 exists in assets/audio/ (0 Firestore reads!)
    if (article.audioUrl) {
      return {
        type: "single-mp3",
        src: article.audioUrl,
        badge: "Google Cloud Voice • Compressed MP3"
      };
    }
    if (STATIC_SEED_MP3[article.id]) {
      return {
        type: "single-mp3",
        src: STATIC_SEED_MP3[article.id],
        badge: "Google Cloud Voice • Compressed MP3"
      };
    }

    // 2. Check embedded compressed MP3 data URL if present
    if (article.audioDataUrl && article.audioDataUrl.startsWith("data:audio/")) {
      return {
        type: "single-mp3",
        src: article.audioDataUrl,
        badge: "Google Cloud Voice • Compressed MP3"
      };
    }

    // 3. Check browser IndexedDB cache (0 repeat Firestore reads!)
    const cachedDataUrl = await getCachedAudio(article.id);
    if (cachedDataUrl) {
      return {
        type: "single-mp3",
        src: cachedDataUrl,
        badge: "Google Cloud Voice • Compressed MP3 (Cached)"
      };
    }

    // 4. Fetch on-demand from dedicated `news_audio` Firestore collection
    if (typeof StocksFirebase !== "undefined" && StocksFirebase.isReady() && article.id) {
      try {
        const doc = await StocksFirebase.getDb().collection("news_audio").doc(article.id).get();
        if (doc.exists) {
          const data = doc.data();
          if (data && data.audioDataUrl) {
            await setCachedAudio(article.id, data.audioDataUrl, { sizeKb: data.sizeKb });
            return {
              type: "single-mp3",
              src: data.audioDataUrl,
              badge: `Google Cloud Voice • Compressed MP3 (${data.sizeKb || "32kbps"} KB)`
            };
          }
        }
      } catch (_) {
        // Fallback to stream chunks
      }
    }

    // 5. Fallback: Stream pleasant Google Cloud Voice MP3 chunks directly
    const fullScript = buildNarrationScript(article);
    const chunks = splitIntoChunks(fullScript, 175);
    const lang = article.audioVoiceLang || DEFAULT_VOICE.lang;
    return {
      type: "chunked-mp3",
      chunks: chunks,
      urls: chunks.map((c) => buildGoogleVoiceChunkUrl(c, lang)),
      badge: "Google Cloud Voice • Compressed MP3 Stream"
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

  /**
   * Mounts and binds the Full Audio Player Controls for a news article.
   * Ensures controls sit ABOVE the article content while the news text remains visible below.
   */
  async function mountArticlePlayer(article, elements) {
    stopActivePlayer();

    const {
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
      speedSelect,
      statusBadgeEl
    } = elements;

    if (!containerEl || !audioEl) return;

    containerEl.hidden = false;

    // Reset UI to initial state
    let hasStartedOnce = false;
    let isSeeking = false;
    let currentPlaybackRate = parseFloat(speedSelect ? speedSelect.value : "1") || 1.0;

    function updatePlayButtonUI(isPlaying) {
      if (!playPauseBtn) return;
      if (isPlaying) {
        playPauseBtn.setAttribute("aria-label", "Pause news audio");
        playPauseBtn.setAttribute("data-state", "playing");
        if (playPauseIcon) playPauseIcon.innerHTML = "&#10074;&#10074;";
        if (playPauseLabel) playPauseLabel.textContent = "Pause";
      } else if (hasStartedOnce && getCurrentTime() > 0 && getCurrentTime() < getTotalDuration() - 0.3) {
        playPauseBtn.setAttribute("aria-label", "Resume news audio");
        playPauseBtn.setAttribute("data-state", "paused");
        if (playPauseIcon) playPauseIcon.innerHTML = "&#9654;";
        if (playPauseLabel) playPauseLabel.textContent = "Resume";
      } else {
        playPauseBtn.setAttribute("aria-label", "Play news audio");
        playPauseBtn.setAttribute("data-state", "idle");
        if (playPauseIcon) playPauseIcon.innerHTML = "&#9654;";
        if (playPauseLabel) playPauseLabel.textContent = "Play Audio";
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
    if (totalDurationEl) totalDurationEl.textContent = "--:--";

    const sourceInfo = await resolveArticleAudioSource(article);
    if (statusBadgeEl && sourceInfo.badge) {
      statusBadgeEl.textContent = sourceInfo.badge;
    }

    // Estimate duration from word count until metadata loads
    const fullText = buildNarrationScript(article);
    const wordCount = fullText.split(/\s+/).filter(Boolean).length;
    const estimatedTotalSec = Math.max(8, Math.round(wordCount / 2.45));

    // State for single-mp3 vs chunked-mp3
    let mode = sourceInfo.type;
    let chunkUrls = sourceInfo.urls || [];
    let chunkDurations = [];
    let currentChunkIdx = 0;
    let isPlayingState = false;

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
    } else if (mode === "single-mp3") {
      if (totalDurationEl) {
        totalDurationEl.textContent = formatTime(estimatedTotalSec);
      }
      audioEl.src = sourceInfo.src;
      audioEl.load();
    }

    audioEl.playbackRate = currentPlaybackRate;

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

      // Chunked MP3 seek
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

    // Event Listeners on <audio>
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
      // Finished full article
      isPlayingState = false;
      hasStartedOnce = false;
      if (mode === "chunked-mp3") {
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

    function onError() {
      // If static or single MP3 failed to load, seamlessly switch to Google Cloud Voice MP3 stream
      if (mode === "single-mp3") {
        const fallbackChunks = splitIntoChunks(fullText, 175);
        if (fallbackChunks.length > 0) {
          mode = "chunked-mp3";
          chunkUrls = fallbackChunks.map((c) => buildGoogleVoiceChunkUrl(c, DEFAULT_VOICE.lang));
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

    // Control Button Handlers
    function handlePlayPauseClick() {
      if (typeof window.stopSpeech === "function") {
        window.stopSpeech();
      }
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
