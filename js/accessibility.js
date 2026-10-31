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
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  };
});
