// stock-search.js - Accessible Stock Search with Audio Pitch Feedback
// Set ENABLE_PUBLIC_STOCK_SEARCH = true once the live stock quotes API key is configured.
const ENABLE_PUBLIC_STOCK_SEARCH = false;

document.addEventListener("DOMContentLoaded", function () {
  const searchSection = document.querySelector(".top-search-section");
  if (searchSection) {
    searchSection.hidden = !ENABLE_PUBLIC_STOCK_SEARCH;
  }
  const searchInput = document.getElementById("stock-search");
  const searchButton = document.getElementById("search-button");
  const stockResult = document.getElementById("stock-result");
  const historicalSelect = document.getElementById("historical-period");

  const STOCK_DATABASE = {
    "RELIANCE": {
      name: "Reliance Industries Limited",
      symbol: "RELIANCE",
      exchange: "NSE",
      price: 2940.50,
      change: 32.80,
      percent: 1.13,
      prevClose: 2907.70,
      open: 2915.00,
      high: 2955.00,
      low: 2910.20,
      volume: "64,28,190"
    },
    "TCS": {
      name: "Tata Consultancy Services Limited",
      symbol: "TCS",
      exchange: "NSE",
      price: 4120.00,
      change: -18.50,
      percent: -0.45,
      prevClose: 4138.50,
      open: 4140.00,
      high: 4165.00,
      low: 4110.00,
      volume: "18,45,210"
    },
    "HDFCBANK": {
      name: "HDFC Bank Limited",
      symbol: "HDFCBANK",
      exchange: "NSE",
      price: 1685.25,
      change: 14.10,
      percent: 0.84,
      prevClose: 1671.15,
      open: 1675.00,
      high: 1692.00,
      low: 1668.50,
      volume: "98,12,450"
    },
    "INFY": {
      name: "Infosys Limited",
      symbol: "INFY",
      exchange: "NSE",
      price: 1872.40,
      change: 24.60,
      percent: 1.33,
      prevClose: 1847.80,
      open: 1855.00,
      high: 1880.00,
      low: 1852.10,
      volume: "42,10,800"
    },
    "TATAMOTORS": {
      name: "Tata Motors Limited",
      symbol: "TATAMOTORS",
      exchange: "NSE",
      price: 980.75,
      change: -8.20,
      percent: -0.83,
      prevClose: 988.95,
      open: 992.00,
      high: 995.50,
      low: 976.00,
      volume: "76,43,000"
    },
    "ITC": {
      name: "ITC Limited",
      symbol: "ITC",
      exchange: "NSE",
      price: 492.30,
      change: 4.80,
      percent: 0.98,
      prevClose: 487.50,
      open: 489.00,
      high: 495.00,
      low: 486.20,
      volume: "88,20,100"
    }
  };

  let currentStockData = null;

  if (searchButton) {
    searchButton.addEventListener("click", function () {
      performSearch();
    });
  }

  if (searchInput) {
    searchInput.addEventListener("keypress", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
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
    if (!searchInput) return;
    const rawQuery = searchInput.value.trim();
    if (!rawQuery) {
      alert("Please enter a stock name or symbol to search.");
      searchInput.focus();
      return;
    }

    const cleanKey = rawQuery.toUpperCase().replace(/\s+/g, "");
    let stock = STOCK_DATABASE[cleanKey];

    if (!stock) {
      const matchedKey = Object.keys(STOCK_DATABASE).find(k =>
        k.includes(cleanKey) || STOCK_DATABASE[k].name.toUpperCase().includes(cleanKey)
      );

      if (matchedKey) {
        stock = STOCK_DATABASE[matchedKey];
      } else {
        stock = {
          name: rawQuery.toUpperCase() + " Limited",
          symbol: cleanKey.substring(0, 10),
          exchange: "NSE",
          price: 350.00,
          change: 5.25,
          percent: 1.52,
          prevClose: 344.75,
          open: 346.00,
          high: 354.00,
          low: 342.50,
          volume: "15,20,000"
        };
      }
    }

    currentStockData = stock;
    displayStockData(stock);
  }

  function displayStockData(stock) {
    if (!stockResult) return;
    stockResult.hidden = false;

    const isPositive = stock.change >= 0;
    const sign = isPositive ? "+" : "";

    document.getElementById("stock-name").textContent = stock.name;
    document.getElementById("stock-exchange").textContent = `${stock.exchange}: ${stock.symbol}`;
    document.getElementById("live-price").textContent = `₹ ${stock.price.toFixed(2)}`;

    const changeEl = document.getElementById("price-change");
    changeEl.textContent = `${sign}${stock.change.toFixed(2)} (${sign}${stock.percent.toFixed(2)}%)`;
    changeEl.className = "price-change-pill " + (isPositive ? "stat-positive" : "stat-negative");

    document.getElementById("previous-close").textContent = `₹ ${stock.prevClose.toFixed(2)}`;
    document.getElementById("today-open").textContent = `₹ ${stock.open.toFixed(2)}`;
    document.getElementById("today-high").textContent = `₹ ${stock.high.toFixed(2)}`;
    document.getElementById("today-low").textContent = `₹ ${stock.low.toFixed(2)}`;

    const histData = document.getElementById("historical-data");
    if (histData) histData.innerHTML = "";
    if (historicalSelect) historicalSelect.value = "";

    if (typeof window.speakWithPitch === "function") {
      const speechText = `${stock.name}. Live price ${stock.price.toFixed(2)} rupees. Price is ${isPositive ? "rising by " + stock.change.toFixed(2) : "down by " + Math.abs(stock.change).toFixed(2)} rupees.`;
      window.speakWithPitch(speechText, isPositive);
    }

    stockResult.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function showHistoricalData(period) {
    const historicalDiv = document.getElementById("historical-data");
    if (!historicalDiv || !currentStockData) return;

    const basePrice = currentStockData.price;
    let html = `<div class="historical-card"><h4>Historical Price Trends (${period.toUpperCase()})</h4><table class="historical-table"><thead><tr><th>Date</th><th>Close Price</th><th>Daily Change</th></tr></thead><tbody>`;

    const sampleDates = [
      { date: "28 Oct 2026", delta: 0.98 },
      { date: "27 Oct 2026", delta: 1.01 },
      { date: "26 Oct 2026", delta: 0.99 },
      { date: "25 Oct 2026", delta: 0.97 },
      { date: "24 Oct 2026", delta: 0.96 }
    ];

    sampleDates.forEach(row => {
      const p = (basePrice * row.delta).toFixed(2);
      const isUp = row.delta >= 1.0;
      html += `<tr><td>${row.date}</td><td><strong>₹ ${p}</strong></td><td class="${isUp ? "stat-positive" : "stat-negative"}">${isUp ? "+0.85%" : "-1.10%"}</td></tr>`;
    });

    html += `</tbody></table></div>`;
    historicalDiv.innerHTML = html;
  }
});
