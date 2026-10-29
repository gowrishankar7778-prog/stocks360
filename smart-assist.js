// smart-assist.js
// Improved: Get word under cursor/focus (no selection needed)
// Alt+3 = Synonyms, Alt+6 = Ask 360 (inline), Ctrl = Stop speech

document.addEventListener("DOMContentLoaded", function () {

  const synonymDict = {
    "market": ["marketplace", "exchange", "trading arena"],
    "stock": ["share", "equity", "security"],
    "price": ["cost", "value", "rate"],
    "investor": ["shareholder", "buyer", "capitalist"],
    "company": ["firm", "corporation", "business"],
    "profit": ["gain", "earning", "return"],
    "loss": ["deficit", "decline", "drop"],
    "volatility": ["fluctuation", "instability", "variation"],
    "regulation": ["rule", "control", "governance"],
    "regulator": ["authority", "watchdog", "supervisor"],
    "capital": ["funds", "money", "investment"],
    "share": ["stock", "equity", "portion"],
    "trading": ["buying and selling", "dealing", "exchange"],
    "index": ["benchmark", "indicator", "measure"],
    "sentiment": ["mood", "feeling", "outlook"],
    "growth": ["expansion", "increase", "development"],
    "risk": ["danger", "uncertainty", "hazard"],
    "return": ["profit", "yield", "gain"],
    "dividend": ["payout", "distribution", "yield"],
    "portfolio": ["collection", "holdings", "investments"],
    "bull": ["optimistic", "rising market"],
    "bear": ["pessimistic", "falling market"],
    "liquidity": ["cash availability", "ease of conversion"],
    "asset": ["property", "holding", "resource"],
    "liability": ["debt", "obligation", "responsibility"],
    "equity": ["ownership", "stock", "shares"],
    "bond": ["debt instrument", "debenture"],
    "mutual": ["collective", "shared"],
    "fund": ["pool of money", "investment vehicle"],
    "broker": ["agent", "intermediary", "dealer"],
    "exchange": ["marketplace", "bourse"],
    "sebi": ["Securities and Exchange Board of India"],
    "nse": ["National Stock Exchange"],
    "bse": ["Bombay Stock Exchange"],
    "performance": ["result", "showing", "outcome"],
    "sector": ["industry", "segment", "area"],
    "data": ["information", "figures", "statistics"],
    "movement": ["change", "shift", "fluctuation"],
    "understanding": ["knowledge", "comprehension", "awareness"]
  };

  function speak(text) {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  }

  function stopSpeech() {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }

  // Get the word under the current cursor / caret position
  function getWordUnderCursor() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;

    // If user has already selected text, use that
    const selectedText = selection.toString().trim();
    if (selectedText.length > 0) {
      return selectedText.toLowerCase().replace(/[^a-zA-Z]/g, "");
    }

    // Otherwise get word at caret position
    try {
      const range = selection.getRangeAt(0);
      const node = range.startContainer;

      if (node.nodeType !== Node.TEXT_NODE) return null;

      const text = node.textContent;
      let pos = range.startOffset;

      // Move left to find start of word
      let start = pos;
      while (start > 0 && /[a-zA-Z]/.test(text[start - 1])) {
        start--;
      }

      // Move right to find end of word
      let end = pos;
      while (end < text.length && /[a-zA-Z]/.test(text[end])) {
        end++;
      }

      const word = text.substring(start, end).trim().toLowerCase();
      return word.length > 1 ? word : null;
    } catch (e) {
      return null;
    }
  }

  // Show synonyms box + speak
  function showSynonyms(word) {
    if (!word || word.length < 2) {
      speak("Could not detect a word. Please place the cursor on a word and try again.");
      return;
    }

    const synonyms = synonymDict[word];
    let message = "";

    if (synonyms && synonyms.length > 0) {
      message = "Synonyms for " + word + " are: " + synonyms.join(", ") + ". ";
      message += "Example: The " + word + " plays an important role in the economy.";
    } else {
      message = "Sorry, no synonyms found for the word " + word + ".";
    }

    let box = document.getElementById("synonym-box");
    if (!box) {
      box = document.createElement("div");
      box.id = "synonym-box";
      box.setAttribute("role", "status");
      box.setAttribute("aria-live", "polite");
      box.style.cssText = "position:fixed; bottom:20px; left:20px; right:20px; max-width:600px; margin:auto; background:#212529; color:white; padding:15px 20px; border-radius:8px; z-index:9999; font-size:16px; box-shadow:0 4px 12px rgba(0,0,0,0.3);";
      document.body.appendChild(box);
    }
    box.innerHTML = message + ' <button id="close-synonym-box" style="margin-left:15px; padding:4px 10px; cursor:pointer;">Close</button>';
    box.style.display = "block";

    document.getElementById("close-synonym-box").onclick = function () {
      box.style.display = "none";
      stopSpeech();
    };

    setTimeout(function () {
      if (box) box.style.display = "none";
    }, 15000);

    speak(message);
  }

  // Open Ask 360 inline (click the visible button)
  function openAsk360() {
    const buttons = document.querySelectorAll(".ask360-btn");
    let found = false;

    buttons.forEach(function (btn) {
      if (btn.offsetParent !== null) {
        // If already open, just focus the input
        const expanded = btn.getAttribute("aria-expanded") === "true";
        if (!expanded) {
          btn.click();
        }
        // Focus the textarea
        setTimeout(function () {
          const box = btn.nextElementSibling;
          if (box) {
            const textarea = box.querySelector("textarea");
            if (textarea) textarea.focus();
          }
        }, 100);
        found = true;
        
      }
    });

    if (!found) {
      
    }
  }

  // Keyboard shortcuts
  document.addEventListener("keydown", function (e) {
    // Ctrl = Stop speech
    if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key === "Control") {
      stopSpeech();
      return;
    }

    // Also stop on Ctrl alone release or common stop
    if (e.key === "Control") {
      stopSpeech();
    }

    // Alt + 3 → Synonyms (word under cursor)
    if (e.altKey && (e.key === "3" || e.code === "Digit3")) {
      e.preventDefault();
      const word = getWordUnderCursor();
      showSynonyms(word);
    }

    // Alt + 6 → Ask 360
    if (e.altKey && (e.key === "6" || e.code === "Digit6")) {
      e.preventDefault();
      openAsk360();
    }
  });

  // Double-click still works
  document.addEventListener("dblclick", function () {
    const word = getWordUnderCursor();
    if (word) {
      showSynonyms(word);
    }
  });

});
