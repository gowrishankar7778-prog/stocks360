try {
  const puppeteer = require('puppeteer');
  console.log('puppeteer available!');
} catch (e) {
  console.log('puppeteer not available:', e.message);
}
