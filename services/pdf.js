const puppeteer = require("puppeteer-core");

let browser = null;

async function getBrowser() {
  if (browser && browser.connected) return browser;
  browser = await puppeteer.launch({
    executablePath: "/snap/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  return browser;
}

async function renderPdf(html, options = {}) {
  const b = await getBrowser();
  const page = await b.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 15000 });
    await page.evaluate(() => {
      document.querySelectorAll(".no-print").forEach(el => el.remove());
    });
    const pdf = await page.pdf({
      format: options.format || "A4",
      landscape: options.landscape || false,
      printBackground: true,
      margin: options.margin || { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return pdf;
  } finally {
    await page.close();
  }
}

process.on("exit", () => { if (browser) browser.close(); });

module.exports = { renderPdf };
