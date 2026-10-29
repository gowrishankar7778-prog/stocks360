// stock-search.js
document.addEventListener("DOMContentLoaded", function () {
  const searchInput = document.getElementById("stock-search");
  const searchButton = document.getElementById("search-button");
  const stockResult = document.getElementById("stock-result");
  const historicalSelect = document.getElementById("historical-period");

  if (searchButton) {
    searchButton.addEventListener("click", function () {
      performSearch();
    });
  }

  if (searchInput) {
    searchInput.addEventListener("keypress", function (event) {
      if (event.key === "Enter") {
        performSearch();
      }
    });
  }

  if (historicalSelect) {
    historicalSelect.addEventListener("change", function () {
      const period = historicalSelect.value;
      if (period) {
        showHistoricalData(period);
      }
    });
  }

  function performSearch() {
    const query = searchInput.value.trim();

    if (query === "") {
      alert("Please enter a stock name or symbol.");
      return;
    }

    showSampleStockData(query);
  }

  function showSampleStockData(stockName) {
    if (stockResult) stockResult.hidden = false;

    document.getElementById("stock-name").textContent = stockName.toUpperCase() + " Limited";
    document.getElementById("stock-exchange").textContent = "NSE";
    document.getElementById("live-price").textContent = "₹ 245.60";
    document.getElementById("price-change").textContent = "+3.40 (1.40%)";
    document.getElementById("previous-close").textContent = "₹ 242.20";
    document.getElementById("today-open").textContent = "₹ 243.00";
    document.getElementById("today-high").textContent = "₹ 247.80";
    document.getElementById("today-low").textContent = "₹ 241.50";

    document.getElementById("historical-data").innerHTML = "";
    document.getElementById("historical-period").value = "";

    if (typeof window.speakWithPitch === "function") {
      window.speakWithPitch(
        stockName + " Limited. Live price 245 rupees 60 paise. Price is rising.",
        true
      );
    }
  }

  function showHistoricalData(period) {
    const historicalDiv = document.getElementById("historical-data");
    let html = "<h4>Historical Data (" + period + ")</h4><ul>";

    if (period === "5days") {
      html += "<li>24 Oct 2026: Close ₹ 242.20</li>";
      html += "<li>23 Oct 2026: Close ₹ 239.80</li>";
      html += "<li>22 Oct 2026: Close ₹ 241.50</li>";
      html += "<li>21 Oct 2026: Close ₹ 238.90</li>";
      html += "<li>20 Oct 2026: Close ₹ 236.40</li>";
    } else {
      html += "<li>Data for " + period + " will appear after API integration.</li>";
    }

    html += "</ul>";
    historicalDiv.innerHTML = html;
  }
});
