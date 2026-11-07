const fs = require('fs');
const path = require('path');
const vm = require('vm');

const filePath = path.join(__dirname, '..', 'js', 'stock-search.js');
let code = fs.readFileSync(filePath, 'utf8');

function safeReplace(source, target, replacement) {
  const normSource = source.replace(/\r\n/g, '\n');
  const normTarget = target.replace(/\r\n/g, '\n');
  if (!normSource.includes(normTarget)) {
    throw new Error('Target block not found: ' + normTarget.slice(0, 80));
  }
  return normSource.replace(normTarget, replacement.replace(/\r\n/g, '\n'));
}

// 1. Initial load & quick pills
const oldInitTarget = `  // Starter Quick Pick Pills
  quickPills.forEach((pill) => {
    pill.addEventListener("click", function () {
      const sym = this.getAttribute("data-symbol");
      if (searchInput && sym) {
        searchInput.value = sym;
        performSearch(sym);
      }
    });
  });

  if (searchButton) {
    searchButton.addEventListener("click", () => performSearch());
  }

  // Keyboard navigation on search input is handled below in the suggestions controller

  // Look for URL query param (e.g. index.html?symbol=TCS)
  const urlParams = new URLSearchParams(window.location.search);
  const paramSymbol = urlParams.get("symbol") || urlParams.get("stock");
  if (paramSymbol) {
    if (searchInput) searchInput.value = paramSymbol;
    setTimeout(() => performSearch(paramSymbol), 150);
  }`;

const newInitReplacement = `  // Starter Quick Pick Pills
  function bindQuickPills() {
    const pills = document.querySelectorAll(".stock-quick-pick");
    pills.forEach((pill) => {
      pill.addEventListener("click", function () {
        const sym = this.getAttribute("data-symbol");
        if (searchInput && sym) {
          searchInput.value = sym;
          performSearch(sym, true);
        }
      });
    });
  }
  bindQuickPills();

  if (searchButton) {
    searchButton.addEventListener("click", () => performSearch(undefined, true));
  }

  // Keyboard navigation on search input is handled below in the suggestions controller

  // Look for URL query param (e.g. index.html?symbol=TCS)
  const urlParams = new URLSearchParams(window.location.search);
  const paramSymbol = urlParams.get("symbol") || urlParams.get("stock");
  if (paramSymbol) {
    if (searchInput) searchInput.value = paramSymbol;
    setTimeout(() => performSearch(paramSymbol, true), 150);
  } else {
    // Automatically render Reliance or TCS as featured analysis on first homepage load
    setTimeout(() => {
      const dataset = getStockDataset();
      const defaultStock = findStock("RELIANCE") || findStock("TCS") || (dataset.length > 0 ? dataset[0] : null);
      if (defaultStock) {
        activeCompanyData = defaultStock;
        renderDetailedCompanyAnalysis(defaultStock, false);
      }
    }, 150);
  }`;

code = safeReplace(code, oldInitTarget, newInitReplacement);

// 2. performSearch function signature
const oldPerformSearch = `  function performSearch(forcedQuery) {
    if (suggestionBox) suggestionBox.style.display = "none";
    const q = (forcedQuery || (searchInput ? searchInput.value : "")).trim();
    if (!q) {
      alert("Please enter a stock name or symbol (e.g. HSCL, Aegis Logistics, TCS, INFY, HDFC Bank, Reliance).");
      if (searchInput) searchInput.focus();
      return;
    }

    let stock = findStock(q);
    if (!stock) {
      // Dynamic fallback synthesizer for any valid NSE ticker or search query
      stock = synthesizeNseStock(q);
    }

    activeCompanyData = stock;
    renderDetailedCompanyAnalysis(stock);
  }`;

const newPerformSearch = `  function performSearch(forcedQuery, shouldScroll = true) {
    if (suggestionBox) suggestionBox.style.display = "none";
    const q = (forcedQuery || (searchInput ? searchInput.value : "")).trim();
    if (!q) {
      alert("Please enter a stock name or symbol (e.g. HSCL, Aegis Logistics, TCS, INFY, HDFC Bank, Reliance).");
      if (searchInput) searchInput.focus();
      return;
    }

    let stock = findStock(q);
    if (!stock) {
      // Dynamic fallback synthesizer for any valid NSE ticker or search query
      stock = synthesizeNseStock(q);
    }

    activeCompanyData = stock;
    renderDetailedCompanyAnalysis(stock, shouldScroll);
  }`;

code = safeReplace(code, oldPerformSearch, newPerformSearch);

// 3. renderDetailedCompanyAnalysis signature and unhiding
const oldRenderDef = `  // ---------------- RENDER COMPLETE DETAILED VIEW ----------------
  function renderDetailedCompanyAnalysis(stock) {
    if (!stockResult) return;
    stockResult.hidden = false;`;

const newRenderDef = `  // ---------------- RENDER COMPLETE DETAILED VIEW ----------------
  function renderDetailedCompanyAnalysis(stock, shouldScroll = true) {
    if (!stock || !stockResult) return;
    stockResult.removeAttribute("hidden");
    stockResult.hidden = false;
    stockResult.style.display = "block";`;

code = safeReplace(code, oldRenderDef, newRenderDef);

// 4. scrollIntoView conditional
const oldScroll = `    stockResult.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ---------------- DEDICATED RELIABLE SPEECH SYNTHESIS ENGINE ----------------`;

const newScroll = `    if (shouldScroll) {
      stockResult.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  // ---------------- DEDICATED RELIABLE SPEECH SYNTHESIS ENGINE ----------------`;

code = safeReplace(code, oldScroll, newScroll);

// Validate JS syntax
try {
  new vm.Script(code);
  console.log('Syntax validation passed successfully!');
} catch (err) {
  console.error('Syntax validation failed:', err);
  process.exit(1);
}

fs.writeFileSync(filePath, code, 'utf8');
console.log('Successfully patched js/stock-search.js');
