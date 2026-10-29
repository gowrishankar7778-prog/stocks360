// accessibility.js
document.addEventListener("DOMContentLoaded", function () {
  const toggleButton = document.getElementById("accessibility-toggle");

  if (!toggleButton) {
    console.log("Accessibility button not found");
    return;
  }

  // Load previous state
  let isOn = false;
  try {
    isOn = localStorage.getItem("specialAccessibility") === "true";
  } catch (e) {
    isOn = false;
  }

  function updateButton() {
    if (isOn) {
      toggleButton.textContent = "Turn Off Special Accessibility Features";
      toggleButton.setAttribute("aria-pressed", "true");
      document.body.classList.add("high-contrast");
    } else {
      toggleButton.textContent = "Turn On Special Accessibility Features";
      toggleButton.setAttribute("aria-pressed", "false");
      document.body.classList.remove("high-contrast");
    }
  }

  // Set initial state
  updateButton();

  // Button click
  toggleButton.addEventListener("click", function () {
    isOn = !isOn;

    try {
      localStorage.setItem("specialAccessibility", isOn);
    } catch (e) {
      // localStorage may be blocked in some browsers
    }

    updateButton();

    // Speak feedback
    if ("speechSynthesis" in window) {
      const message = isOn
        ? "Special accessibility features are now turned on."
        : "Special accessibility features are now turned off.";
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.rate = 0.9;
      speechSynthesis.speak(utterance);
    }
  });

  // Make pitch function available globally
  window.speakWithPitch = function (message, isRising) {
    if (!isOn) return;

    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.rate = 0.9;
      utterance.pitch = isRising === true ? 1.4 : isRising === false ? 0.7 : 1;
      speechSynthesis.speak(utterance);
    }
  };
});
