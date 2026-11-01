/**
 * Stocks 360 - Cloud & Natural Voice Audio Engine (audio-engine.js)
 *
 * Multi-tier resilient audio playback across all devices (Android, iPhone, iPad, MacBook, Windows):
 * 1. Browser IndexedDB persistent MP3 cache (`stocks360_audio_cache_db` -> 0 repeat Firestore reads)
 * 2. Google Cloud Firebase Firestore on-demand MP3 (`site_settings/audio_<id>`)
 * 3. Pre-bundled compressed MP3 (`assets/audio/<id>.mp3` or `article.audioUrl`)
 * 4. Automatic seamless fallback to Natural Web Speech Synthesis (`window.speechSynthesis`)
 *    with full Play/Pause/Resume, -10s/+10s skip, interactive seek bar, and 0.75x-2x speed control.
 */

const StocksAudioEngine = (function () {
  const IDB_NAME = "stocks360_audio_cache_db";
  const IDB_STORE = "compressed_mp3_store";
  const VOICE_CONFIG_CACHE_KEY = "stocks360_firebase_voice_config";
  const BUNDLED_AUDIO_IDS = { "news-1": true, "news-2": true, "news-3": true };

  const DEFAULT_VOICE_CONFIG = {
    cloudTtsUrl: "https://texttospeech.googleapis.com/v1/text:synthesize",
    voiceStreamUrl: "https://translate.googleapis.com/translate_tts",
    languageCode: "en-IN",
    voiceName: "en-IN-Neural2-A",
    speakingRate: 0.96,
    audioEncoding: "MP3",
    sampleRateHertz: 24000,
    compressionKbps: 32
  };

  let cachedVoiceConfig = null;
  let cachedVoicesList = [];

  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      cachedVoicesList = window.speechSynthesis.getVoices() || [];
      window.speechSynthesis.addEventListener("voiceschanged", function () {
        cachedVoicesList = window.speechSynthesis.getVoices() || [];
      });
    } catch (_) {}
  }

  function withTimeout(promise, ms, fallbackValue) {
    return Promise.race([
      promise,
      new Promise((resolve) => setTimeout(() => resolve(fallbackValue), ms))
    ]);
  }

  // ---------------- LOAD GOOGLE VOICE API CONFIG FROM FIREBASE ----------------
  async function getFirebaseVoiceConfig() {
    if (cachedVoiceConfig && cachedVoiceConfig.voiceStreamUrl) {
      return cachedVoiceConfig;
    }

    try {
      const localSaved = sessionStorage.getItem(VOICE_CONFIG_CACHE_KEY);
      if (localSaved) {
        cachedVoiceConfig = Object.assign({}, DEFAULT_VOICE_CONFIG, JSON.parse(localSaved));
        return cachedVoiceConfig;
      }
    } catch (_) {}

    // 1. Load from Google Firebase Firestore (`site_settings/google_voice_api`)
    if (typeof StocksFirebase !== "undefined" && StocksFirebase.isReady()) {
      try {
        const doc = await withTimeout(
          StocksFirebase.getDb()
            .collection("site_settings")
            .doc("google_voice_api")
            .get(),
          2200,
          null
        );
        if (doc && doc.exists) {
          cachedVoiceConfig = Object.assign({}, DEFAULT_VOICE_CONFIG, doc.data() || {});
          try {
            sessionStorage.setItem(VOICE_CONFIG_CACHE_KEY, JSON.stringify(cachedVoiceConfig));
          } catch (_) {}
          return cachedVoiceConfig;
        }
      } catch (err) {
        console.warn("Firebase voice config load note:", err.message);
      }
    }

    // 2. Fallback to runtime config loaded from gitignored firebase-secret.json or defaults
    if (typeof FIREBASE_CONFIG !== "undefined") {
      cachedVoiceConfig = Object.assign(
        {},
        DEFAULT_VOICE_CONFIG,
        { apiKey: FIREBASE_CONFIG.apiKey || "" },
        FIREBASE_CONFIG.googleVoiceApi || {}
      );
      return cachedVoiceConfig;
    }

    cachedVoiceConfig = Object.assign({}, DEFAULT_VOICE_CONFIG);
    return cachedVoiceConfig;
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
    if (!articleId) return null;
    try {
      const db = await withTimeout(openCacheDb(), 1200, null);
      if (!db) return null;
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
    if (!articleId || !audioDataUrl) return;
    try {
      const db = await withTimeout(openCacheDb(), 1200, null);
      if (!db) return;
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
    const bodyText = article.content || article.body || "";
    if (bodyText) {
      parts.push(cleanHtmlToText(bodyText));
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

  function selectBestNaturalVoice(preferredLang) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
    const voices =
      cachedVoicesList.length > 0
        ? cachedVoicesList
        : window.speechSynthesis.getVoices() || [];
    if (!voices || voices.length === 0) return null;

    const targetLang = (preferredLang || "en-IN").toLowerCase();
    const langPrefix = targetLang.split("-")[0] || "en";

    let bestVoice = null;
    let bestScore = -999;

    for (let i = 0; i < voices.length; i++) {
      const v = voices[i];
      const vLang = (v.lang || "").toLowerCase().replace("_", "-");
      const vName = (v.name || "").toLowerCase();

      if (!vLang.startsWith(langPrefix) && !vName.includes("english") && !vName.includes("india")) {
        continue;
      }

      let score = 0;
      if (vLang === targetLang) score += 35;
      else if (vLang.startsWith("en-in")) score += 30;
      else if (vLang.startsWith("en-gb") || vLang.startsWith("en-us")) score += 22;
      else if (vLang.startsWith("en")) score += 15;

      // Prefer natural / neural / assistant voices across Chrome, Android, Edge, macOS, and iOS
      if (vName.includes("natural") || vName.includes("neural")) score += 45;
      if (vName.includes("google")) score += 40;
      if (vName.includes("online")) score += 25;
      if (vName.includes("premium") || vName.includes("enhanced") || vName.includes("siri")) score += 35;
      if (
        vName.includes("neerja") ||
        vName.includes("prabhat") ||
        vName.includes("rishi") ||
        vName.includes("veena") ||
        vName.includes("samantha") ||
        vName.includes("aria") ||
        vName.includes("jenny") ||
        vName.includes("daniel")
      ) {
        score += 28;
      }
      if (!v.localService) score += 10;

      if (score > bestScore) {
        bestScore = score;
        bestVoice = v;
      }
    }

    return bestVoice || voices[0] || null;
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
    const apiKey =
      voiceCfg.apiKey ||
      (typeof FIREBASE_CONFIG !== "undefined" ? FIREBASE_CONFIG.apiKey : "");
    const cloudTtsUrl = voiceCfg.cloudTtsUrl || DEFAULT_VOICE_CONFIG.cloudTtsUrl;

    if (apiKey && cloudTtsUrl) {
      const voiceName =
        (voiceOption && voiceOption.name) || voiceCfg.voiceName || "en-IN-Neural2-A";
      const langCode =
        (voiceOption && voiceOption.lang) || voiceCfg.languageCode || "en-IN";
      const speakingRate = parseFloat(voiceCfg.speakingRate || "0.96") || 0.96;
      const sampleRateHertz = parseInt(voiceCfg.sampleRateHertz || "24000", 10) || 24000;

      try {
        const res = await withTimeout(
          fetch(cloudTtsUrl + "?key=" + encodeURIComponent(apiKey), {
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
          }),
          3500,
          null
        );

        if (res && res.ok) {
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

    // 1. Direct inline audioDataUrl if attached to the object
    if (article.audioDataUrl && String(article.audioDataUrl).startsWith("data:audio")) {
      return {
        type: "single-mp3",
        src: article.audioDataUrl
      };
    }

    // 2. Check browser IndexedDB cache first (0 repeat Firestore reads!)
    if (article.id) {
      const cachedDataUrl = await getCachedAudio(article.id);
      if (cachedDataUrl) {
        return {
          type: "single-mp3",
          src: cachedDataUrl
        };
      }
    }

    // 3. Fetch on-demand compressed MP3 from Google Firebase Firestore (`site_settings/audio_<id>`)
    if (typeof StocksFirebase !== "undefined" && StocksFirebase.isReady() && article.id) {
      try {
        const doc = await withTimeout(
          StocksFirebase.getDb()
            .collection("site_settings")
            .doc("audio_" + article.id)
            .get(),
          2200,
          null
        );
        if (doc && doc.exists) {
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

    // 4. Check explicit audioUrl or bundled local MP3 (`assets/audio/news-1.mp3`, `news-2.mp3`, `news-3.mp3`)
    //    and auto-backfill into Firebase Firestore (`site_settings/audio_<id>`) so all future users stream from Firebase!
    const staticUrl =
      (article.audioUrl && String(article.audioUrl).trim()) ||
      (article.id && BUNDLED_AUDIO_IDS[article.id] ? "assets/audio/" + article.id + ".mp3" : "");

    if (staticUrl) {
      if (article.id && typeof StocksFirebase !== "undefined" && StocksFirebase.isReady()) {
        // Asynchronously compress & store into Firebase Firestore on first play if not in Firestore yet
        setTimeout(async function () {
          try {
            const resp = await fetch(staticUrl);
            if (resp.ok) {
              const blob = await resp.blob();
              let payload = null;
              if (typeof lamejs !== "undefined") {
                payload = await compressAudioBlobToMp3(blob, 32);
              } else {
                const dataUrl = await blobToDataUrl(blob);
                payload = { dataUrl: dataUrl, sizeKb: (blob.size / 1024).toFixed(1) };
              }
              if (payload && payload.dataUrl) {
                await saveArticleAudioToFirestore(article.id, payload);
              }
            }
          } catch (_) {}
        }, 50);
      }
      return {
        type: "single-mp3",
        src: staticUrl
      };
    }

    // 5. On-Demand First-User-Play MP3 Generation & Auto-Save to Firebase Firestore!
    //    If Admin didn't play/generate the MP3 earlier, the very first user who plays the article
    //    triggers automatic MP3 synthesis, compresses it to 32kbps Mono MP3, and saves it to
    //    Firebase Firestore (`site_settings/audio_<id>`) for all subsequent users!
    const fullScript = buildNarrationScript(article);
    const lang = article.audioVoiceLang || "en-IN";
    if (fullScript && article.id) {
      try {
        const synthesized = await synthesizeCloudTtsMp3(fullScript, {
          lang: lang,
          name:
            lang === "en-GB"
              ? "en-GB-Neural2-A"
              : lang === "en-US"
              ? "en-US-Neural2-F"
              : "en-IN-Neural2-A"
        });
        if (synthesized && synthesized.dataUrl) {
          await saveArticleAudioToFirestore(article.id, synthesized);
          return {
            type: "single-mp3",
            src: synthesized.dataUrl
          };
        }
      } catch (_) {}
    }

    // 6. Fallback to cross-device Natural Speech Synthesis Engine (`window.speechSynthesis`)
    const chunks = splitIntoChunks(fullScript, 175);
    return {
      type: "speech-synthesis",
      chunks: chunks,
      lang: lang
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

  function pauseActivePlayer() {
    if (activeController && typeof activeController.pause === "function") {
      activeController.pause();
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
    } = elements || {};

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
    let preloadPromise = null;
    let currentPlaybackRate = parseFloat(speedSelect ? speedSelect.value : "1") || 1.0;

    const fullText = buildNarrationScript(article);
    const speechChunks = splitIntoChunks(fullText, 175);
    const voiceLang = (article && article.audioVoiceLang) || "en-IN";
    const wordCount = fullText.split(/\s+/).filter(Boolean).length;
    const estimatedTotalSec = Math.max(6, Math.round(wordCount / 2.45));
    const totalChars = speechChunks.reduce((acc, c) => acc + c.length, 0) || 1;
    const chunkDurations = speechChunks.map((c) =>
      Math.max(1.8, (c.length / totalChars) * estimatedTotalSec)
    );

    let mode = "single-mp3";
    let currentChunkIdx = 0;
    let isPlayingState = false;
    let activeUtteranceToken = 0;
    let speechTimerId = null;
    let chunkStartedAtMs = 0;
    let chunkPausedOffsetSec = 0;
    let internalSpeechCancel = false;

    function clearSpeechTimer() {
      if (speechTimerId) {
        clearInterval(speechTimerId);
        speechTimerId = null;
      }
    }

    function cancelBrowserSpeechQuietly() {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        internalSpeechCancel = true;
        activeUtteranceToken++;
        try {
          window.speechSynthesis.cancel();
        } catch (_) {}
        internalSpeechCancel = false;
      }
    }

    function updatePlayButtonUI(isPlaying) {
      if (!playPauseBtn) return;
      if (isPlaying) {
        playPauseBtn.setAttribute("aria-label", "Pause");
        playPauseBtn.setAttribute("data-state", "playing");
        if (playPauseIcon) playPauseIcon.innerHTML = "&#10074;&#10074;";
        if (playPauseLabel) playPauseLabel.textContent = "Pause";
      } else if (
        hasStartedOnce &&
        getCurrentTime() > 0 &&
        getCurrentTime() < getTotalDuration() - 0.3
      ) {
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
    if (totalDurationEl) totalDurationEl.textContent = formatTime(estimatedTotalSec);

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
      let inChunk = chunkPausedOffsetSec;
      if (isPlayingState && chunkStartedAtMs > 0) {
        const deltaSec = ((Date.now() - chunkStartedAtMs) / 1000) * currentPlaybackRate;
        inChunk = Math.min(
          chunkDurations[currentChunkIdx] || 3,
          chunkPausedOffsetSec + deltaSec
        );
      }
      return Math.min(getTotalDuration(), elapsedBefore + inChunk);
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

    // ---------------- SPEECH SYNTHESIS PLAYBACK ENGINE ----------------
    function startSpeechFromCurrentChunk() {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      if (speechChunks.length === 0) return;

      cancelBrowserSpeechQuietly();
      clearSpeechTimer();

      if (currentChunkIdx < 0 || currentChunkIdx >= speechChunks.length) {
        currentChunkIdx = 0;
        chunkPausedOffsetSec = 0;
      }

      const chunkText = speechChunks[currentChunkIdx];
      const chunkDur = chunkDurations[currentChunkIdx] || 3;

      // If resuming mid-chunk, slice text proportionally by word boundary
      let textToSpeak = chunkText;
      if (chunkPausedOffsetSec > 0.4 && chunkPausedOffsetSec < chunkDur - 0.3) {
        const ratio = Math.max(0, Math.min(0.85, chunkPausedOffsetSec / chunkDur));
        const charOffset = Math.floor(chunkText.length * ratio);
        const spaceIdx = chunkText.indexOf(" ", charOffset);
        if (spaceIdx > 0 && spaceIdx < chunkText.length - 3) {
          textToSpeak = chunkText.slice(spaceIdx + 1);
        }
      } else {
        chunkPausedOffsetSec = 0;
      }

      const myToken = ++activeUtteranceToken;
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      const preferredVoice = selectBestNaturalVoice(voiceLang);
      if (preferredVoice) {
        utterance.voice = preferredVoice;
        utterance.lang = preferredVoice.lang || voiceLang;
      } else {
        utterance.lang = voiceLang;
      }

      // Clamp rate to safe natural bounds supported across iOS/Android/Desktop
      utterance.rate = Math.max(0.5, Math.min(2.0, currentPlaybackRate * 0.96));
      utterance.pitch = 1.0;

      hasStartedOnce = true;
      isPlayingState = true;
      chunkStartedAtMs = Date.now();
      updatePlayButtonUI(true);
      syncProgressUI();

      speechTimerId = setInterval(function () {
        if (!isPlayingState || mode !== "speech-synthesis") return;
        // Chrome desktop workaround: keep speechSynthesis alive past 14 seconds
        if (
          typeof window !== "undefined" &&
          "speechSynthesis" in window &&
          window.speechSynthesis.speaking &&
          !window.speechSynthesis.paused
        ) {
          try {
            window.speechSynthesis.resume();
          } catch (_) {}
        }
        syncProgressUI();
      }, 250);

      utterance.onend = function () {
        if (myToken !== activeUtteranceToken || internalSpeechCancel) return;
        chunkPausedOffsetSec = 0;
        if (currentChunkIdx < speechChunks.length - 1) {
          currentChunkIdx++;
          startSpeechFromCurrentChunk();
          return;
        }
        // Finished entire article
        clearSpeechTimer();
        isPlayingState = false;
        hasStartedOnce = false;
        currentChunkIdx = 0;
        chunkPausedOffsetSec = 0;
        chunkStartedAtMs = 0;
        syncProgressUI(0, getTotalDuration());
        updatePlayButtonUI(false);
      };

      utterance.onerror = function (ev) {
        if (myToken !== activeUtteranceToken || internalSpeechCancel) return;
        const errType = ev && ev.error ? String(ev.error) : "";
        if (errType === "canceled" || errType === "interrupted") return;
        chunkPausedOffsetSec = 0;
        if (currentChunkIdx < speechChunks.length - 1) {
          currentChunkIdx++;
          startSpeechFromCurrentChunk();
        } else {
          clearSpeechTimer();
          isPlayingState = false;
          updatePlayButtonUI(false);
        }
      };

      try {
        window.speechSynthesis.resume();
        window.speechSynthesis.speak(utterance);
      } catch (_) {}
    }

    function pauseSpeechSynthesis() {
      if (!isPlayingState) return;
      if (chunkStartedAtMs > 0) {
        const deltaSec = ((Date.now() - chunkStartedAtMs) / 1000) * currentPlaybackRate;
        chunkPausedOffsetSec = Math.min(
          chunkDurations[currentChunkIdx] || 3,
          chunkPausedOffsetSec + deltaSec
        );
      }
      chunkStartedAtMs = 0;
      isPlayingState = false;
      clearSpeechTimer();
      cancelBrowserSpeechQuietly();
      syncProgressUI();
      updatePlayButtonUI(false);
    }

    function switchToSpeechSynthesis(shouldAutoPlay) {
      try {
        audioEl.pause();
        audioEl.removeAttribute("src");
      } catch (_) {}
      mode = "speech-synthesis";
      if (totalDurationEl) {
        totalDurationEl.textContent = formatTime(getTotalDuration());
      }
      if (shouldAutoPlay) {
        startSpeechFromCurrentChunk();
      } else {
        syncProgressUI();
      }
    }

    async function ensureAudioSourceLoaded() {
      if (sourceInitialized) return;
      if (preloadPromise) return preloadPromise;

      preloadPromise = (async function () {
        const sourceInfo = await resolveArticleAudioSource(article);
        sourceInitialized = true;

        if (sourceInfo.type === "single-mp3" && sourceInfo.src) {
          mode = "single-mp3";
          audioEl.src = sourceInfo.src;
          audioEl.playbackRate = currentPlaybackRate;
          try {
            audioEl.load();
          } catch (_) {}
        } else {
          mode = "speech-synthesis";
          if (totalDurationEl) {
            totalDurationEl.textContent = formatTime(getTotalDuration());
          }
        }
      })();

      return preloadPromise;
    }

    // Begin pre-resolving audio source immediately on mount so user click has zero network wait
    ensureAudioSourceLoaded();

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

      // Speech synthesis seek: locate exact sentence chunk and offset
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

      currentChunkIdx = targetIdx;
      chunkPausedOffsetSec = offsetInChunk;
      chunkStartedAtMs = Date.now();
      syncProgressUI(clamped, total);

      if (isPlayingState) {
        startSpeechFromCurrentChunk();
      }
    }

    function onLoadedMetadata() {
      if (mode !== "single-mp3") return;
      audioEl.playbackRate = currentPlaybackRate;
      syncProgressUI();
    }

    function onTimeUpdate() {
      if (mode !== "single-mp3") return;
      syncProgressUI();
    }

    function onPlay() {
      if (mode !== "single-mp3") return;
      cancelBrowserSpeechQuietly();
      hasStartedOnce = true;
      isPlayingState = true;
      audioEl.playbackRate = currentPlaybackRate;
      updatePlayButtonUI(true);
    }

    function onPause() {
      if (mode !== "single-mp3") return;
      isPlayingState = false;
      updatePlayButtonUI(false);
    }

    function onEnded() {
      if (mode !== "single-mp3") return;
      isPlayingState = false;
      hasStartedOnce = false;
      try {
        audioEl.currentTime = 0;
      } catch (_) {}
      syncProgressUI(0, getTotalDuration());
      updatePlayButtonUI(false);
    }

    function onError() {
      if (mode === "single-mp3") {
        // Automatic seamless fallback to Natural Speech Synthesis if MP3 is missing or blocked
        switchToSpeechSynthesis(isPlayingState || !containerEl.hidden);
      }
    }

    audioEl.addEventListener("loadedmetadata", onLoadedMetadata);
    audioEl.addEventListener("timeupdate", onTimeUpdate);
    audioEl.addEventListener("play", onPlay);
    audioEl.addEventListener("pause", onPause);
    audioEl.addEventListener("ended", onEnded);
    audioEl.addEventListener("error", onError);

    async function startOrResumePlayback() {
      // Stop any accessibility announcement speech before playing article
      cancelBrowserSpeechQuietly();

      if (!sourceInitialized) {
        await ensureAudioSourceLoaded();
      }

      if (mode === "single-mp3" && audioEl.src) {
        isPlayingState = true;
        hasStartedOnce = true;
        audioEl.playbackRate = currentPlaybackRate;
        updatePlayButtonUI(true);
        try {
          await audioEl.play();
        } catch (err) {
          console.warn("MP3 playback fallback to natural voice:", err && err.message);
          switchToSpeechSynthesis(true);
        }
      } else {
        switchToSpeechSynthesis(true);
      }
    }

    async function handleTriggerClick() {
      if (triggerBtn) {
        triggerBtn.hidden = true;
        triggerBtn.setAttribute("aria-expanded", "true");
      }
      containerEl.hidden = false;

      await startOrResumePlayback();
      if (playPauseBtn) {
        playPauseBtn.focus();
      }
    }

    async function handlePlayPauseClick() {
      if (!sourceInitialized) {
        await ensureAudioSourceLoaded();
      }

      if (mode === "single-mp3") {
        if (!audioEl.paused) {
          audioEl.pause();
        } else {
          await startOrResumePlayback();
        }
      } else {
        if (isPlayingState) {
          pauseSpeechSynthesis();
        } else {
          startSpeechFromCurrentChunk();
        }
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
      if (mode === "single-mp3") {
        audioEl.playbackRate = rate;
      } else if (isPlayingState) {
        if (chunkStartedAtMs > 0) {
          const deltaSec = ((Date.now() - chunkStartedAtMs) / 1000) * currentPlaybackRate;
          chunkPausedOffsetSec = Math.min(
            chunkDurations[currentChunkIdx] || 3,
            chunkPausedOffsetSec + deltaSec
          );
        }
        startSpeechFromCurrentChunk();
      }
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
      pause: function () {
        if (mode === "single-mp3") {
          try {
            if (!audioEl.paused) audioEl.pause();
          } catch (_) {}
        } else {
          pauseSpeechSynthesis();
        }
      },
      destroy: function () {
        clearSpeechTimer();
        cancelBrowserSpeechQuietly();
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
    pauseActivePlayer: pauseActivePlayer,
    stopActivePlayer: stopActivePlayer
  };
})();
