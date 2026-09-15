const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  await page.goto('http://127.0.0.1:8765/admin/docs.html?preview#quote');
  await page.waitForSelector('#view-quote .doc-assistant');
  assert.equal(await page.locator('#view-quote .doc-assistant').count(), 1);
  const made = await page.evaluate(() => window.__docsAssistant.makeQuestionnaire());
  assert.match(made, /# 견적서 작성 질문지/);
  assert.match(made, /<!-- field:id%3AtoName -->/);
  const filled = made.replace('기관·회사 이름: ', '기관·회사 이름: 새빛도서관');
  await page.evaluate(text => window.__docsAssistant.importQuestionnaire(text), filled);
  assert.equal(await page.locator('#toName').inputValue(), '새빛도서관');
  const wordSize = await page.evaluate(async () => (await window.__docsAssistant.buildDocxBlob()).size);
  assert.ok(wordSize > 5000);
  const pending = page.waitForEvent('download');
  await page.locator('#view-quote .doc-assist-word').click();
  const download = await pending;
  await download.saveAs('output/견적서_편집본.docx');
  const saved=fs.readFileSync('output/견적서_편집본.docx');
  assert.equal(saved.subarray(0,2).toString(), 'PK');
  for(const name of ['statement','kit','roster','fees','royalty']){
    await page.locator(`[data-view="${name}"]`).click();
    await page.waitForSelector(`#view-${name} .doc-assistant`);
    assert.equal(await page.locator('.doc-assistant').count(), 1);
    const size=await page.evaluate(async () => (await window.__docsAssistant.buildDocxBlob()).size);
    assert.ok(size > 4000, `${name} DOCX should not be empty`);
  }
  await page.locator('[data-view="statement"]').click();
  await page.screenshot({ path: 'output/docs-assistant-preview.png', fullPage: true });
  await browser.close();
  console.log('docs assistant QA passed');
})().catch(error => { console.error(error); process.exit(1); });
