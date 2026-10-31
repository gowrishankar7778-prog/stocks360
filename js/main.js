// main.js
// Common functions and Stock 360 AI top assistant handler for Stocks 360

document.addEventListener("DOMContentLoaded", function () {
  const askBtn = document.getElementById("home-ask360-btn");
  const askDrawer = document.getElementById("home-ask360-drawer");
  const askInput = document.getElementById("home-ask360-input");
  const askSend = document.getElementById("home-ask360-send");
  const askResponse = document.getElementById("home-ask360-response");

  if (askBtn && askDrawer) {
    askBtn.addEventListener("click", function () {
      const isHidden = askDrawer.hidden;
      askDrawer.hidden = !isHidden;
      askBtn.setAttribute("aria-expanded", isHidden ? "true" : "false");
      if (isHidden && askInput) {
        askInput.focus();
      }
    });
  }

  function handleTopAsk360() {
    if (!askInput || !askResponse) return;
    const q = askInput.value.trim();
    if (!q) {
      askResponse.innerHTML = `<p class="ask360-error">Please enter a question for Stock 360 AI.</p>`;
      return;
    }

    const lowerQ = q.toLowerCase();
    let answer = "In financial literacy, understanding core market concepts helps build long-term clarity. ";

    if (lowerQ.includes("sebi") || lowerQ.includes("regulat")) {
      answer += "SEBI (Securities and Exchange Board of India) is the primary market regulator that protects investor interests and ensures fair, transparent trading practices.";
    } else if (lowerQ.includes("ipo") || lowerQ.includes("primary")) {
      answer += "An Initial Public Offering (IPO) is when a company offers its shares to the public for the first time in the primary market to raise capital.";
    } else if (lowerQ.includes("dividend") || lowerQ.includes("profit")) {
      answer += "A dividend is a portion of a company's earnings distributed to its shareholders as a return on their ownership.";
    } else if (lowerQ.includes("bull") || lowerQ.includes("bear")) {
      answer += "A Bull market refers to a period of rising prices and positive sentiment, whereas a Bear market refers to sustained price declines.";
    } else if (lowerQ.includes("volatility") || lowerQ.includes("risk")) {
      answer += "Market volatility measures how quickly and significantly prices fluctuate. Understanding risk helps learners focus on fundamentals rather than short-term noise.";
    } else {
      answer += "Stock markets connect companies seeking capital with investors. Remember that all explanations on Stocks 360 are strictly for educational purposes only and do not constitute investment advice in any manner.";
    }

    const safeQ = q.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    askResponse.innerHTML = `
      <div class="ask360-ai-card">
        <div class="ai-header">
          <span class="ai-badge">&#10024; Stock 360 AI Response</span>
        </div>
        <p class="ai-question-echo"><strong>Question:</strong> "${safeQ}"</p>
        <p class="ai-answer-text">${answer}</p>
      </div>
    `;

    if (typeof window.speakWithPitch === "function") {
      window.speakWithPitch(answer, true);
    }
  }

  if (askSend) {
    askSend.addEventListener("click", handleTopAsk360);
  }

  if (askInput) {
    askInput.addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        handleTopAsk360();
      }
    });
  }
});
