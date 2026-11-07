// accessibility.js - Enhanced WCAG AAA Accessibility Controller with Audio Feedback
document.addEventListener("DOMContentLoaded", function () {
  const toggleButton = document.getElementById("accessibility-toggle");

  // Load previous state from localStorage
  let isOn = false;
  try {
    isOn = localStorage.getItem("specialAccessibility") === "true";
  } catch (e) {
    isOn = false;
  }

  function updateButton() {
    if (!toggleButton) return;
    if (isOn) {
      toggleButton.textContent = "Turn Off Special Accessibility";
      toggleButton.setAttribute("aria-pressed", "true");
      document.body.classList.add("high-contrast");
    } else {
      toggleButton.textContent = "Turn On Special Accessibility";
      toggleButton.setAttribute("aria-pressed", "false");
      document.body.classList.remove("high-contrast");
    }
  }

  // Initial apply
  updateButton();

  function toggleAccessibility() {
    isOn = !isOn;
    try {
      localStorage.setItem("specialAccessibility", isOn);
    } catch (e) {}

    updateButton();

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const message = isOn
        ? "Special accessibility features turned on. High contrast mode active."
        : "Special accessibility features turned off.";
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.rate = 0.95;
      window.speechSynthesis.speak(utterance);
    }
  }

  if (toggleButton) {
    toggleButton.addEventListener("click", toggleAccessibility);
  }

  // Global Keyboard Shortcut: Alt + A toggles accessibility
  document.addEventListener("keydown", function (e) {
    if (e.altKey && (e.key === "a" || e.key === "A")) {
      e.preventDefault();
      toggleAccessibility();
      return;
    }

    // Global Keyboard Shortcut: Escape key collapses any open/expanded collapsible sections across the entire website
    if (e.key === "Escape" || e.key === "Esc") {
      let collapsedSomething = false;
      const activeEl = document.activeElement;

      // 1. If focus is currently inside or on a Ratio Info toggle button/box
      if (activeEl) {
        const currentRatioBox = activeEl.closest(".ratio-info-box");
        if (currentRatioBox && !currentRatioBox.hasAttribute("hidden")) {
          currentRatioBox.setAttribute("hidden", "");
          const prevBtn = currentRatioBox.previousElementSibling;
          if (prevBtn && prevBtn.classList && prevBtn.classList.contains("ratio-info-toggle-btn")) {
            prevBtn.setAttribute("aria-expanded", "false");
            prevBtn.focus();
          }
          e.preventDefault();
          return;
        }

        const currentRatioBtn = activeEl.closest(".ratio-info-toggle-btn");
        if (currentRatioBtn && currentRatioBtn.getAttribute("aria-expanded") === "true") {
          currentRatioBtn.setAttribute("aria-expanded", "false");
          const nextBox = currentRatioBtn.nextElementSibling;
          if (nextBox && nextBox.classList && nextBox.classList.contains("ratio-info-box")) {
            nextBox.setAttribute("hidden", "");
          }
          e.preventDefault();
          return;
        }

        // 2. If focus is inside or on an Audio Player card
        const currentAudioCard = activeEl.closest("#news-audio-player-card, #learn-audio-player-card, .news-audio-player-card");
        if (currentAudioCard && !currentAudioCard.hasAttribute("hidden") && !currentAudioCard.hidden) {
          currentAudioCard.setAttribute("hidden", "");
          currentAudioCard.hidden = true;
          const trigger = document.querySelector(`[aria-controls="${currentAudioCard.id}"]`) || document.getElementById("listen-article-btn") || document.getElementById("learn-listen-article-btn");
          if (trigger) {
            trigger.setAttribute("aria-expanded", "false");
            trigger.focus();
          }
          e.preventDefault();
          return;
        }
      }

      // 3. Collapse all open Ratio Information boxes across the page
      const openRatioBoxes = document.querySelectorAll(".ratio-info-box:not([hidden])");
      if (openRatioBoxes.length > 0) {
        openRatioBoxes.forEach((box) => {
          box.setAttribute("hidden", "");
          const prevBtn = box.previousElementSibling;
          if (prevBtn && prevBtn.classList && prevBtn.classList.contains("ratio-info-toggle-btn")) {
            prevBtn.setAttribute("aria-expanded", "false");
          }
        });
        collapsedSomething = true;
      }

      // 4. Collapse any open Ask 360 AI boxes / drawers across the site
      const openAiBoxes = document.querySelectorAll(
        "#home-ask360-drawer:not([hidden]), #detail-ask360-box:not([hidden]), #nl-ask360-box:not([hidden]), #learn-ask360-box:not([hidden]), .ask360-box:not([hidden])"
      );
      if (openAiBoxes.length > 0) {
        openAiBoxes.forEach((box) => {
          box.hidden = true;
          box.setAttribute("hidden", "");
          const trigger = document.querySelector(`[aria-controls="${box.id}"]`) || box.previousElementSibling;
          if (trigger && trigger.setAttribute) {
            trigger.setAttribute("aria-expanded", "false");
          }
        });
        collapsedSomething = true;
      }

      // 7. Collapse any open audio player cards
      const openAudioCards = document.querySelectorAll(
        "#news-audio-player-card:not([hidden]), #learn-audio-player-card:not([hidden])"
      );
      if (openAudioCards.length > 0) {
        openAudioCards.forEach((card) => {
          card.hidden = true;
          card.setAttribute("hidden", "");
          const trigger = document.querySelector(`[aria-controls="${card.id}"]`) || document.getElementById("listen-article-btn") || document.getElementById("learn-listen-article-btn");
          if (trigger && trigger.setAttribute) {
            trigger.setAttribute("aria-expanded", "false");
          }
        });
        collapsedSomething = true;
      }

      // 8. Universal fallback: Collapse any remaining element with aria-expanded="true"
      const expandedButtons = document.querySelectorAll('button[aria-expanded="true"]');
      if (expandedButtons.length > 0) {
        expandedButtons.forEach((btn) => {
          btn.setAttribute("aria-expanded", "false");
          const targetId = btn.getAttribute("aria-controls");
          let targetEl = targetId ? document.getElementById(targetId) : null;
          if (!targetEl && btn.nextElementSibling) {
            targetEl = btn.nextElementSibling;
          }
          if (targetEl) {
            targetEl.hidden = true;
            targetEl.setAttribute("hidden", "");
          }
        });
        collapsedSomething = true;
      }

      // 9. Close synonym popup if open
      const synBox = document.getElementById("synonym-box");
      if (synBox && synBox.style.display !== "none") {
        synBox.style.display = "none";
        collapsedSomething = true;
      }

      if (collapsedSomething) {
        e.preventDefault();
      }
    }
  });

  // Global speech helper with pitch modulation for financial data
  window.speakWithPitch = function (message, isRising) {
    if (!isOn) return;

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.rate = 0.9;
      // High pitch (1.35) for gains, lower pitch (0.75) for drops
      utterance.pitch = isRising === true ? 1.35 : isRising === false ? 0.75 : 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  // Stop speech helper
  window.stopSpeech = function () {
    if (typeof StocksAudioEngine !== "undefined" && typeof StocksAudioEngine.pauseActivePlayer === "function") {
      StocksAudioEngine.pauseActivePlayer();
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  };
});
