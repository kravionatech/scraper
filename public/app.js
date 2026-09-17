let currentData = null;
let timerInterval = null;

// Tab switcher
document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
        btn.classList.add("active");
        const target = document.getElementById(btn.dataset.tab);
        if (target) target.classList.add("active");
    });
});

// =========================================================
// DYNAMIC MULTI-SELECTOR BUILDER
// =========================================================
const selectorsList = document.getElementById("customSelectorsList");
const addSelectorBtn = document.getElementById("addSelectorBtn");

function addSelectorRow(name = "", selector = "", attr = "text") {
    if (!selectorsList) return;
    const row = document.createElement("div");
    row.className = "selector-row";
    row.innerHTML = `
        <div class="sel-name">
            <input type="text" class="field-name" placeholder="Field Label (e.g. title)" value="${escapeHtml(name)}" />
        </div>
        <div class="sel-query">
            <input type="text" class="field-sel" placeholder="CSS Selector (e.g. .price, h1, a)" value="${escapeHtml(selector)}" />
        </div>
        <div class="sel-attr">
            <select class="field-attr">
                <option value="text"${attr === 'text' ? ' selected' : ''}>Text (Inner)</option>
                <option value="href"${attr === 'href' ? ' selected' : ''}>href (Link URL)</option>
                <option value="src"${attr === 'src' ? ' selected' : ''}>src (Media/Img)</option>
                <option value="alt"${attr === 'alt' ? ' selected' : ''}>alt (Img Alt)</option>
                <option value="content"${attr === 'content' ? ' selected' : ''}>content (Meta)</option>
                <option value="class"${attr === 'class' ? ' selected' : ''}>class</option>
                <option value="id"${attr === 'id' ? ' selected' : ''}>id</option>
            </select>
        </div>
        <button type="button" class="btn-remove-sel" title="Remove Field">✕</button>
    `;

    row.querySelector(".btn-remove-sel").addEventListener("click", () => {
        if (selectorsList.children.length > 1) {
            row.remove();
        } else {
            row.querySelector(".field-name").value = "";
            row.querySelector(".field-sel").value = "";
        }
    });

    selectorsList.appendChild(row);
}

if (addSelectorBtn) {
    addSelectorBtn.addEventListener("click", () => addSelectorRow());
}

// Initialize selector list with 1 default row
if (selectorsList && selectorsList.children.length === 0) {
    addSelectorRow("items", "");
}

// Timeout Slider display sync
const timeoutSlider = document.getElementById("timeoutSlider");
const timeoutDisplay = document.getElementById("timeoutDisplay");
if (timeoutSlider && timeoutDisplay) {
    timeoutSlider.addEventListener("input", () => {
        timeoutDisplay.innerText = `${timeoutSlider.value}s`;
    });
}

// Browser emulation change handler
const browserEmulation = document.getElementById("browserEmulation");
const customUaGroup = document.getElementById("customUaGroup");
if (browserEmulation && customUaGroup) {
    browserEmulation.addEventListener("change", () => {
        customUaGroup.style.display = browserEmulation.value === "custom" ? "flex" : "none";
    });
}

// 1-Click Live Test Presets click
document.querySelectorAll(".preset-chips .chip").forEach(chip => {
    chip.addEventListener("click", () => {
        document.getElementById("targetUrl").value = chip.dataset.url;
        if (selectorsList) {
            selectorsList.innerHTML = "";
            addSelectorRow(chip.dataset.selName || "items", chip.dataset.sel || "", "text");
        }
        startScrape();
    });
});

// Trigger Scrape on button or Enter key
document.getElementById("scrapeBtn").addEventListener("click", startScrape);
document.getElementById("targetUrl").addEventListener("keydown", (e) => {
    if (e.key === "Enter") startScrape();
});

async function startScrape() {
    let urlInput = document.getElementById("targetUrl").value.trim();
    const errorBox = document.getElementById("scrapeErrorBox");
    if (errorBox) errorBox.style.display = "none";

    if (!urlInput) {
        if (errorBox) {
            errorBox.style.display = "block";
            errorBox.innerHTML = "⚠️ <b>Please enter a website URL</b> (e.g. <code>https://news.ycombinator.com</code> or <code>quotes.toscrape.com</code>)";
        } else {
            alert("Please enter a valid website URL");
        }
        return;
    }

    const btn = document.getElementById("scrapeBtn");
    const btnText = document.getElementById("btnText");
    const btnSpinner = document.getElementById("btnSpinner");
    const perfBar = document.getElementById("performanceBar");
    const latencyDisplay = document.getElementById("latencyDisplay");
    const verdictTag = document.getElementById("verdictTag");
    const resultsWrapper = document.getElementById("resultsWrapper");

    // UI Loading state
    btn.disabled = true;
    btnSpinner.style.display = "inline-block";
    btnText.innerText = "Extracting...";
    perfBar.style.display = "flex";
    resultsWrapper.style.display = "none";
    verdictTag.className = "verdict-tag";
    verdictTag.innerText = "Measuring...";

    // Live millisecond stopwatch
    const startTime = performance.now();
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const elapsed = (performance.now() - startTime) / 1000;
        latencyDisplay.innerText = elapsed.toFixed(2) + "s";
    }, 30);

    // Collect custom selectors from dynamic rows
    const custom_selectors = [];
    document.querySelectorAll("#customSelectorsList .selector-row").forEach(row => {
        const nameInput = row.querySelector(".field-name").value.trim();
        const selInput = row.querySelector(".field-sel").value.trim();
        const attrInput = row.querySelector(".field-attr").value.trim();
        if (selInput) {
            custom_selectors.push({
                name: nameInput || "custom",
                selector: selInput,
                attribute: attrInput || "text"
            });
        }
    });

    // Resolve user agent and timeout
    let effUserAgent = null;
    if (browserEmulation) {
        if (browserEmulation.value === "custom") {
            effUserAgent = document.getElementById("customUaInput") ? document.getElementById("customUaInput").value.trim() : null;
        } else if (browserEmulation.value) {
            effUserAgent = browserEmulation.value;
        }
    }

    const effTimeout = timeoutSlider ? parseFloat(timeoutSlider.value) : 12.0;
    const bypassCache = document.getElementById("bypassCache") ? document.getElementById("bypassCache").checked : false;

    try {
        const res = await fetch("/api/scrape", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                url: urlInput,
                custom_selectors: custom_selectors,
                bypass_cache: bypassCache,
                user_agent: effUserAgent,
                timeout_seconds: effTimeout
            })
        });

        clearInterval(timerInterval);
        const data = await res.json();
        currentData = data;

        // Total time
        const elapsedSec = (data.duration_sec !== undefined) ? data.duration_sec : ((performance.now() - startTime) / 1000).toFixed(2);
        latencyDisplay.innerText = `${elapsedSec}s`;

        if (data.success && elapsedSec <= 2.0) {
            verdictTag.className = "verdict-tag";
            verdictTag.innerText = "⚡ Passed < 2s";
        } else if (data.success) {
            verdictTag.className = "verdict-tag warning";
            verdictTag.innerText = `⏱️ ${elapsedSec}s`;
        } else {
            verdictTag.className = "verdict-tag error";
            verdictTag.innerText = "❌ Scrape Failed";
        }

        // Fill breakdown
        document.getElementById("fetchTime").innerText = (data.fetch_duration_ms || 0) + "ms";
        document.getElementById("parseTime").innerText = (data.parse_duration_ms || 0) + "ms";
        document.getElementById("pageSize").innerText = (data.page_size_kb || 0) + " KB";
        document.getElementById("httpStatus").innerText = data.status_code || (data.success ? "200" : "ERR");

        if (data.success) {
            if (errorBox) errorBox.style.display = "none";
            renderResults(data);
            resultsWrapper.style.display = "block";
            // Reset search filter
            const filterInput = document.getElementById("resultsFilterInput");
            if (filterInput) {
                filterInput.value = "";
                applyResultsFilter();
            }
        } else {
            resultsWrapper.style.display = "none";
            if (errorBox) {
                errorBox.style.display = "block";
                errorBox.innerHTML = `❌ <b>Extraction Failed:</b> ${escapeHtml(data.error || "Unable to fetch website content.")}<br><span style="font-size:12px;opacity:0.85;">Check that the URL is correct, online, and not blocking automated requests.</span>`;
            } else {
                alert("Scraper Error: " + (data.error || "Failed to fetch website."));
            }
        }
    } catch (err) {
        clearInterval(timerInterval);
        latencyDisplay.innerText = ((performance.now() - startTime) / 1000).toFixed(2) + "s";
        if (errorBox) {
            errorBox.style.display = "block";
            errorBox.innerHTML = `❌ <b>Backend Error:</b> Failed to connect to local server: ${escapeHtml(err.message)}`;
        } else {
            alert("Failed to communicate with Scraper backend: " + err.message);
        }
    } finally {
        btn.disabled = false;
        btnSpinner.style.display = "none";
        btnText.innerText = "Scrape In < 2s";
    }
}

// =========================================================
// RENDER EXTRACTION RESULTS
// =========================================================
function renderResults(data) {
    // 1. Overview
    document.getElementById("pageTitle").innerText = data.title || "No Title Found";
    document.getElementById("pageDescription").innerText = data.description || "No meta description found on page.";
    const linkEl = document.getElementById("pageFinalUrl");
    linkEl.href = data.url;
    linkEl.innerText = data.url;

    const fav = document.getElementById("pageFavicon");
    if (data.favicon) {
        fav.src = data.favicon;
        fav.style.display = "inline-block";
    } else {
        fav.style.display = "none";
    }

    const ogHolder = document.getElementById("ogImageHolder");
    if (data.og_image) {
        ogHolder.innerHTML = `<img src="${data.og_image}" alt="og-image" onerror="this.parentElement.innerHTML='<span class=\'no-img\'>OG Image failed to load</span>'" />`;
    } else {
        ogHolder.innerHTML = `<span class="no-img">No OG preview available</span>`;
    }

    document.getElementById("textSnippet").innerText = data.text_sample || "(No extracted text)";

    // 2. Custom Selectors
    const customContent = document.getElementById("customContent");
    customContent.innerHTML = "";
    let customCountTotal = 0;
    if (data.custom_data && Object.keys(data.custom_data).length > 0) {
        for (const [key, val] of Object.entries(data.custom_data)) {
            const isArray = Array.isArray(val);
            const count = isArray ? val.length : 1;
            customCountTotal += count;

            const box = document.createElement("div");
            box.className = "custom-field-box";
            box.innerHTML = `
                <div class="custom-field-title">
                    <span>${escapeHtml(key)}</span>
                    <span class="custom-field-count">${count} items</span>
                </div>
                <ul class="custom-field-items">
                    ${isArray ? val.map(item => `<li>${escapeHtml(item)}</li>`).join("") : `<li>${escapeHtml(String(val))}</li>`}
                </ul>
            `;
            customContent.appendChild(box);
        }
    } else {
        customContent.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">No custom selector specified. Expand "Advanced Selectors & Crawler Controls" above to target specific tags, classes, or IDs.</p>`;
    }
    document.getElementById("customCount").innerText = customCountTotal;

    // 3. Headings
    const headingsList = document.getElementById("headingsList");
    headingsList.innerHTML = "";
    (data.headings || []).forEach(h => {
        const li = document.createElement("li");
        li.innerHTML = `<span>${escapeHtml(h.text)}</span> <span class="tag-badge">${escapeHtml(h.tag)}</span>`;
        headingsList.appendChild(li);
    });
    document.getElementById("headingCount").innerText = (data.headings || []).length;

    // 4. Links
    const linksList = document.getElementById("linksList");
    linksList.innerHTML = "";
    (data.links || []).forEach(l => {
        const li = document.createElement("li");
        li.innerHTML = `<a href="${escapeHtml(l.url)}" target="_blank">${escapeHtml(l.text || l.url)}</a>`;
        linksList.appendChild(li);
    });
    document.getElementById("linksCount").innerText = (data.links || []).length;

    // 5. Images
    const imagesGallery = document.getElementById("imagesGallery");
    imagesGallery.innerHTML = "";
    (data.images || []).forEach(img => {
        const card = document.createElement("div");
        card.className = "img-card";
        card.innerHTML = `
            <img src="${escapeHtml(img.src)}" alt="${escapeHtml(img.alt || 'img')}" loading="lazy" onerror="this.parentElement.style.display='none'"/>
            <div class="img-alt">${escapeHtml(img.alt || img.src)}</div>
        `;
        imagesGallery.appendChild(card);
    });
    document.getElementById("imagesCount").innerText = (data.images || []).length;

    // 6. Extracted Tables Matrix [NEW]
    const tablesContent = document.getElementById("tablesContent");
    const tablesCount = document.getElementById("tablesCount");
    if (tablesContent) {
        tablesContent.innerHTML = "";
        const tblList = data.tables || [];
        if (tablesCount) tablesCount.innerText = tblList.length;

        if (tblList.length > 0) {
            tblList.forEach((tbl, idx) => {
                const box = document.createElement("div");
                box.className = "extracted-table-box";

                let headerHtml = "";
                if (tbl.headers && tbl.headers.length > 0) {
                    headerHtml = `<thead><tr>${tbl.headers.map(h => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>`;
                }

                let bodyHtml = "";
                if (tbl.rows && tbl.rows.length > 0) {
                    bodyHtml = `<tbody>${tbl.rows.map(r => `<tr>${r.map(c => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody>`;
                }

                box.innerHTML = `
                    <div class="extracted-table-header">
                        <h5>📊 Table #${idx + 1} (${tbl.rows ? tbl.rows.length : 0} rows)</h5>
                        <button type="button" class="btn-outline btn-copy-tbl" data-tbl-idx="${idx}">📋 Copy Table CSV</button>
                    </div>
                    <div class="table-responsive-scroll">
                        <table class="data-table">
                            ${headerHtml}
                            ${bodyHtml}
                        </table>
                    </div>
                `;
                tablesContent.appendChild(box);
            });

            // Bind copy buttons
            tablesContent.querySelectorAll(".btn-copy-tbl").forEach(btn => {
                btn.addEventListener("click", () => {
                    const idx = parseInt(btn.dataset.tblIdx, 10);
                    const tbl = tblList[idx];
                    if (!tbl) return;
                    let csv = "";
                    if (tbl.headers && tbl.headers.length) {
                        csv += tbl.headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(",") + "\n";
                    }
                    (tbl.rows || []).forEach(row => {
                        csv += row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",") + "\n";
                    });
                    navigator.clipboard.writeText(csv);
                    btn.innerText = "✅ Copied!";
                    setTimeout(() => { btn.innerText = "📋 Copy Table CSV"; }, 2000);
                });
            });
        } else {
            tablesContent.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">No HTML &lt;table&gt; elements detected on this webpage.</p>`;
        }
    }

    // 7. Page Meta Tags & Directives [NEW]
    const metaTagsContent = document.getElementById("metaTagsContent");
    const metaCount = document.getElementById("metaCount");
    if (metaTagsContent) {
        metaTagsContent.innerHTML = "";
        const metas = data.meta_tags || {};
        const metaKeys = Object.keys(metas);
        if (metaCount) metaCount.innerText = metaKeys.length;

        if (metaKeys.length > 0) {
            let rowsHtml = metaKeys.map(k => `
                <tr>
                    <td class="meta-name">${escapeHtml(k)}</td>
                    <td class="meta-content">${escapeHtml(metas[k])}</td>
                </tr>
            `).join("");

            metaTagsContent.innerHTML = `
                <table class="meta-table">
                    <thead>
                        <tr>
                            <th>Directive / Property</th>
                            <th>Tag Content</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            `;
        } else {
            metaTagsContent.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">No &lt;meta&gt; tags extracted from this document.</p>`;
        }
    }

    // 8. Raw JSON
    document.getElementById("rawJsonCode").innerText = JSON.stringify(data, null, 2);
}

// =========================================================
// LIVE SEARCH FILTER
// =========================================================
const resultsFilterInput = document.getElementById("resultsFilterInput");
const clearFilterBtn = document.getElementById("clearFilterBtn");
const filterMatchesCount = document.getElementById("filterMatchesCount");

function applyResultsFilter() {
    if (!resultsFilterInput) return;
    const q = (resultsFilterInput.value || "").toLowerCase().trim();

    if (!q) {
        if (clearFilterBtn) clearFilterBtn.style.display = "none";
        if (filterMatchesCount) filterMatchesCount.innerText = "";
        document.querySelectorAll("#headingsList li, #linksList li, .custom-field-box, .extracted-table-box, .meta-table tbody tr, .img-card").forEach(el => {
            el.style.display = "";
        });
        return;
    }

    if (clearFilterBtn) clearFilterBtn.style.display = "inline-block";
    let matches = 0;

    // Filter headings
    document.querySelectorAll("#headingsList li").forEach(el => {
        const match = el.textContent.toLowerCase().includes(q);
        el.style.display = match ? "" : "none";
        if (match) matches++;
    });

    // Filter links
    document.querySelectorAll("#linksList li").forEach(el => {
        const match = el.textContent.toLowerCase().includes(q);
        el.style.display = match ? "" : "none";
        if (match) matches++;
    });

    // Filter custom fields
    document.querySelectorAll(".custom-field-box").forEach(el => {
        const match = el.textContent.toLowerCase().includes(q);
        el.style.display = match ? "" : "none";
        if (match) matches++;
    });

    // Filter tables
    document.querySelectorAll(".extracted-table-box").forEach(el => {
        const match = el.textContent.toLowerCase().includes(q);
        el.style.display = match ? "" : "none";
        if (match) matches++;
    });

    // Filter meta tags
    document.querySelectorAll(".meta-table tbody tr").forEach(el => {
        const match = el.textContent.toLowerCase().includes(q);
        el.style.display = match ? "" : "none";
        if (match) matches++;
    });

    // Filter images
    document.querySelectorAll(".img-card").forEach(el => {
        const match = el.textContent.toLowerCase().includes(q);
        el.style.display = match ? "" : "none";
        if (match) matches++;
    });

    if (filterMatchesCount) {
        filterMatchesCount.innerText = `${matches} items matching`;
    }
}

if (resultsFilterInput) {
    resultsFilterInput.addEventListener("input", applyResultsFilter);
}

if (clearFilterBtn) {
    clearFilterBtn.addEventListener("click", () => {
        resultsFilterInput.value = "";
        applyResultsFilter();
        resultsFilterInput.focus();
    });
}

// Helpers
function escapeHtml(text) {
    if (!text) return "";
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function buildCsvContent(data) {
    if (!data) return "";
    let csv = "Type,Field,Value\n";
    csv += `"Metadata","Title","${(data.title || '').replace(/"/g, '""')}"\n`;
    csv += `"Metadata","URL","${(data.url || '').replace(/"/g, '""')}"\n`;
    csv += `"Metadata","Description","${(data.description || '').replace(/"/g, '""')}"\n`;

    (data.headings || []).forEach(h => {
        csv += `"Heading","${h.tag}","${h.text.replace(/"/g, '""')}"\n`;
    });

    (data.links || []).forEach(l => {
        csv += `"Link","${(l.text || '').replace(/"/g, '""')}","${l.url.replace(/"/g, '""')}"\n`;
    });

    if (data.custom_data) {
        for (const [key, val] of Object.entries(data.custom_data)) {
            if (Array.isArray(val)) {
                val.forEach(item => {
                    csv += `"Custom","${key}","${String(item).replace(/"/g, '""')}"\n`;
                });
            } else {
                csv += `"Custom","${key}","${String(val).replace(/"/g, '""')}"\n`;
            }
        }
    }

    if (data.meta_tags) {
        for (const [mName, mVal] of Object.entries(data.meta_tags)) {
            csv += `"Meta","${mName}","${String(mVal).replace(/"/g, '""')}"\n`;
        }
    }

    return csv;
}

// Export actions
const copyJsonBtn = document.getElementById("copyJsonBtn");
if (copyJsonBtn) {
    copyJsonBtn.addEventListener("click", () => {
        if (!currentData) return;
        navigator.clipboard.writeText(JSON.stringify(currentData, null, 2));
        copyJsonBtn.innerText = "✅ JSON Copied!";
        setTimeout(() => { copyJsonBtn.innerText = "📋 Copy JSON"; }, 2000);
    });
}

const copyCsvBtn = document.getElementById("copyCsvBtn");
if (copyCsvBtn) {
    copyCsvBtn.addEventListener("click", () => {
        if (!currentData) return;
        const csv = buildCsvContent(currentData);
        navigator.clipboard.writeText(csv);
        copyCsvBtn.innerText = "✅ CSV Copied!";
        setTimeout(() => { copyCsvBtn.innerText = "📋 Copy CSV"; }, 2000);
    });
}

const copyTextBtn = document.getElementById("copyTextBtn");
if (copyTextBtn) {
    copyTextBtn.addEventListener("click", () => {
        if (!currentData) return;
        navigator.clipboard.writeText(currentData.text_sample || "");
        copyTextBtn.innerText = "✅ Text Copied!";
        setTimeout(() => { copyTextBtn.innerText = "📄 Copy Text"; }, 2000);
    });
}

const downloadJsonBtn = document.getElementById("downloadJsonBtn");
if (downloadJsonBtn) {
    downloadJsonBtn.addEventListener("click", () => {
        if (!currentData) return;
        const blob = new Blob([JSON.stringify(currentData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `scrape_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    });
}

const downloadCsvBtn = document.getElementById("downloadCsvBtn");
if (downloadCsvBtn) {
    downloadCsvBtn.addEventListener("click", () => {
        if (!currentData) return;
        const csv = buildCsvContent(currentData);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `scrape_${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    });
}

// =========================================================
// GA4 ACTIVE USERS TRAFFIC ENGINE
// =========================================================
let currentTrafficJobId = null;
let trafficPollInterval = null;

// Quick campaign presets click
document.querySelectorAll(".ga-campaign-presets .ga-preset-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        if (btn.dataset.users) document.getElementById("gaUserCount").value = btn.dataset.users;
        if (btn.dataset.dur !== undefined) document.getElementById("gaDuration").value = btn.dataset.dur;
        if (btn.dataset.loc) document.getElementById("gaLocation").value = btn.dataset.loc;
        if (btn.dataset.ref) document.getElementById("gaReferrer").value = btn.dataset.ref;
        if (btn.dataset.event) document.getElementById("gaEventType").value = btn.dataset.event;
        const refGroup = document.getElementById("gaCustomReferrerGroup");
        if (refGroup) refGroup.style.display = "none";
        document.getElementById("gaUserCount").focus();
    });
});

// Referrer selection change
const gaReferrer = document.getElementById("gaReferrer");
const gaCustomReferrerGroup = document.getElementById("gaCustomReferrerGroup");
if (gaReferrer && gaCustomReferrerGroup) {
    gaReferrer.addEventListener("change", () => {
        gaCustomReferrerGroup.style.display = gaReferrer.value === "custom" ? "flex" : "none";
    });
}

// Concurrency slider
const gaConcurrency = document.getElementById("gaConcurrency");
const concurrencyDisplay = document.getElementById("concurrencyDisplay");
if (gaConcurrency && concurrencyDisplay) {
    gaConcurrency.addEventListener("input", () => {
        concurrencyDisplay.innerText = `${gaConcurrency.value} streams`;
    });
}

const sendTrafficBtn = document.getElementById("sendTrafficBtn");
const cancelTrafficBtn = document.getElementById("cancelTrafficBtn");

if (sendTrafficBtn) {
    sendTrafficBtn.addEventListener("click", async () => {
        const urlInput = document.getElementById("targetUrl").value.trim();
        const userCount = parseInt(document.getElementById("gaUserCount").value, 10) || 1000;
        const durationMin = parseFloat(document.getElementById("gaDuration").value) || 0;
        const locationVal = document.getElementById("gaLocation").value || "global";
        const deviceVal = document.getElementById("gaDevice").value || "all";
        const proxyVal = document.getElementById("gaProxy") ? document.getElementById("gaProxy").value.trim() : "";
        const measurementIdVal = document.getElementById("gaMeasurementId") ? document.getElementById("gaMeasurementId").value.trim() : "";

        let effReferrer = gaReferrer ? gaReferrer.value : "google";
        if (effReferrer === "custom") {
            effReferrer = document.getElementById("gaCustomReferrer") ? document.getElementById("gaCustomReferrer").value.trim() : "google";
        }

        const eventName = document.getElementById("gaEventType") ? document.getElementById("gaEventType").value : "page_view";
        const concurrencyVal = gaConcurrency ? parseInt(gaConcurrency.value, 10) : 40;
        const utmSource = document.getElementById("utmSource") ? document.getElementById("utmSource").value.trim() : null;
        const utmMedium = document.getElementById("utmMedium") ? document.getElementById("utmMedium").value.trim() : null;
        const utmCampaign = document.getElementById("utmCampaign") ? document.getElementById("utmCampaign").value.trim() : null;

        const statusBox = document.getElementById("gaStatusBox");
        const btnSpinner = document.getElementById("gaSpinner");
        const btnText = document.getElementById("gaBtnText");

        if (!urlInput) {
            alert("Please enter the target website URL above first (e.g. https://lightningscraper.vercel.app)!");
            return;
        }

        // Loading UI state
        sendTrafficBtn.disabled = true;
        cancelTrafficBtn.style.display = "inline-flex";
        cancelTrafficBtn.disabled = false;
        btnSpinner.style.display = "inline-block";
        btnText.innerText = `Dispatching...`;
        statusBox.style.display = "block";
        statusBox.className = "ga-status-box info";

        const durationDesc = durationMin > 0 ? `spread over ${durationMin}m` : `instant concurrent`;
        statusBox.innerHTML = `
            ⏳ <b>Starting Traffic Job:</b><br>
            🎯 <b>Target:</b> ${urlInput} | <b>Users:</b> ${userCount} (${durationDesc})<br>
            🌍 <b>Location:</b> ${locationVal.toUpperCase()} | 📱 <b>Devices:</b> ${deviceVal.toUpperCase()}<br>
            🔗 <b>Referrer:</b> ${effReferrer} | ⚡ <b>Event:</b> ${eventName} (${concurrencyVal} streams)<br>
            🛡️ <b>Proxy Engine:</b> ${proxyVal ? 'Custom Active' : 'Auto Live Verified Multi-Country'}${measurementIdVal ? `<br>🏷️ <b>Specified Tag:</b> <code>${measurementIdVal}</code>` : ''}
        `;

        // Open live monitor deck
        const monitorDeck = document.getElementById("trafficMonitorDeck");
        if (monitorDeck) {
            monitorDeck.style.display = "block";
            document.getElementById("kpiTotal").innerText = userCount;
            document.getElementById("kpiCompleted").innerText = "0";
            document.getElementById("kpiFailed").innerText = "0";
            document.getElementById("kpiProgress").innerText = "0";
            document.getElementById("kpiProgressBar").style.width = "0%";
            document.getElementById("kpiRate").innerText = "0.0";
            document.getElementById("kpiMeasurementId").innerText = measurementIdVal || "Detecting...";
            document.getElementById("monitorStatusBadge").innerText = "ACTIVE RUNNING";
            document.getElementById("monitorStatusBadge").className = "monitor-badge";
            monitorDeck.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        try {
            const resp = await fetch("/api/ga-traffic", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    url: urlInput,
                    user_count: userCount,
                    duration_minutes: durationMin,
                    device: deviceVal,
                    location: locationVal,
                    proxy: proxyVal || null,
                    concurrency: concurrencyVal,
                    measurement_id: measurementIdVal || null,
                    referrer: effReferrer,
                    utm_source: utmSource || null,
                    utm_medium: utmMedium || null,
                    utm_campaign: utmCampaign || null,
                    event_name: eventName
                })
            });

            const data = await resp.json();

            if (!resp.ok) {
                throw new Error(data.detail || "Failed to trigger traffic.");
            }

            currentTrafficJobId = data.job_id;
            
            // Start real-time polling monitor every 500ms
            clearInterval(trafficPollInterval);
            trafficPollInterval = setInterval(async () => {
                if (!currentTrafficJobId) {
                    clearInterval(trafficPollInterval);
                    return;
                }

                try {
                    const stResp = await fetch(`/api/ga-status/${currentTrafficJobId}`);
                    if (!stResp.ok) return;
                    const st = await stResp.json();

                    // Update KPIs
                    document.getElementById("kpiCompleted").innerText = st.completed || 0;
                    document.getElementById("kpiTotal").innerText = st.target_count || userCount;
                    document.getElementById("kpiFailed").innerText = st.failed || 0;
                    document.getElementById("kpiProgress").innerText = st.progress_percent || 0;
                    document.getElementById("kpiProgressBar").style.width = `${Math.min(st.progress_percent || 0, 100)}%`;
                    document.getElementById("kpiRate").innerText = st.rate_per_sec || 0;
                    document.getElementById("kpiElapsed").innerText = `${st.elapsed_seconds || 0}s`;
                    if (st.measurement_id) {
                        document.getElementById("kpiMeasurementId").innerText = st.measurement_id;
                    }

                    // Update Country Distribution
                    const countryListEl = document.getElementById("countryBreakdownList");
                    if (countryListEl && st.country_stats && Object.keys(st.country_stats).length > 0) {
                        countryListEl.innerHTML = Object.entries(st.country_stats).map(([country, cnt]) => `
                            <div class="breakdown-item">
                                <span class="breakdown-key">🌐 ${country}</span>
                                <span class="breakdown-val">${cnt} hits</span>
                            </div>
                        `).join('');
                        document.getElementById("countryTotalCount").innerText = `${Object.keys(st.country_stats).length} regions`;
                    }

                    // Update Device Distribution
                    const devListEl = document.getElementById("deviceBreakdownList");
                    if (devListEl && st.device_stats && Object.keys(st.device_stats).length > 0) {
                        devListEl.innerHTML = Object.entries(st.device_stats).map(([dev, cnt]) => `
                            <div class="breakdown-item">
                                <span class="breakdown-key">📱 ${dev}</span>
                                <span class="breakdown-val">${cnt} users</span>
                            </div>
                        `).join('');
                        document.getElementById("deviceTotalCount").innerText = `${Object.keys(st.device_stats).length} models`;
                    }

                    // Update Live Terminal Logs
                    const logsEl = document.getElementById("terminalLogs");
                    if (logsEl && st.recent_logs && st.recent_logs.length > 0) {
                        logsEl.innerHTML = st.recent_logs.map(line => {
                            const isSucc = line.includes("SUCCESS");
                            return `<div class="log-line ${isSucc ? 'success' : 'dropped'}">${line}</div>`;
                        }).join('');
                        logsEl.scrollTop = logsEl.scrollHeight;
                    }

                    // Check if job completed or cancelled
                    if (st.status === "completed" || st.status === "cancelled" || st.status === "failed") {
                        clearInterval(trafficPollInterval);
                        sendTrafficBtn.disabled = false;
                        cancelTrafficBtn.style.display = "none";
                        btnSpinner.style.display = "none";
                        btnText.innerText = "🚀 Send Active Users";

                        const isCancelled = st.status === "cancelled";
                        document.getElementById("monitorStatusBadge").innerText = isCancelled ? "STOPPED" : "COMPLETED 100%";
                        document.getElementById("monitorStatusBadge").className = isCancelled ? "monitor-badge cancelled" : "monitor-badge";

                        statusBox.className = isCancelled ? "ga-status-box error" : "ga-status-box success";
                        statusBox.innerHTML = `
                            <b>${isCancelled ? '🛑 Traffic Stopped by User' : '✅ Traffic Completed Successfully!'}</b><br>
                            🏷️ <b>Detected GA4 Tag:</b> <code>${st.measurement_id || 'G-XXXXXXXXXX'}</code><br>
                            ⚡ <b>Active Users Delivered:</b> ${st.completed} / ${st.target_count}<br>
                            ⏱️ <b>Total Time:</b> ${st.time_taken_seconds || st.elapsed_seconds}s (${st.rate_per_sec} hits/sec)<br>
                            📊 <b>Live Check:</b> Open your Google Analytics dashboard (<b>Realtime / Active users in last 30 minutes</b>).
                        `;
                    }
                } catch (polErr) {
                    console.error("Telemetry poll error", polErr);
                }
            }, 600);

        } catch (err) {
            statusBox.className = "ga-status-box error";
            statusBox.innerHTML = `❌ <b>Error:</b> ${err.message}`;
            sendTrafficBtn.disabled = false;
            cancelTrafficBtn.style.display = "none";
            btnSpinner.style.display = "none";
            btnText.innerText = "🚀 Send Active Users";
        }
    });
}

if (cancelTrafficBtn) {
    cancelTrafficBtn.addEventListener("click", async () => {
        if (!currentTrafficJobId) {
            cancelTrafficBtn.disabled = true;
            return;
        }
        cancelTrafficBtn.innerText = "Stopping...";
        cancelTrafficBtn.disabled = true;
        try {
            await fetch("/api/ga-cancel", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ job_id: currentTrafficJobId })
            });
            const statusBox = document.getElementById("gaStatusBox");
            if (statusBox) {
                statusBox.innerHTML += `<br><b>Stopping ongoing requests... Please wait a moment.</b>`;
            }
// =========================================================
// GSC (GOOGLE SEARCH CONSOLE) DUAL ENGINE HANDLER
// =========================================================
const btnModeGA4 = document.getElementById("btnModeGA4");
const btnModeGSC = document.getElementById("btnModeGSC");
const gaControlsContainer = document.getElementById("gaControlsContainer");
const gscControlsContainer = document.getElementById("gscControlsContainer");

if (btnModeGA4 && btnModeGSC) {
    btnModeGA4.addEventListener("click", () => {
        btnModeGA4.classList.add("active");
        btnModeGSC.classList.remove("active");
        if (gaControlsContainer) gaControlsContainer.style.display = "block";
        if (gscControlsContainer) gscControlsContainer.style.display = "none";
    });
    btnModeGSC.addEventListener("click", () => {
        btnModeGSC.classList.add("active");
        btnModeGA4.classList.remove("active");
        if (gscControlsContainer) gscControlsContainer.style.display = "block";
        if (gaControlsContainer) gaControlsContainer.style.display = "none";
    });
}

// GSC Query presets click
document.querySelectorAll(".gsc-preset-chip").forEach(btn => {
    btn.addEventListener("click", () => {
        if (btn.dataset.kws) document.getElementById("gscKeywords").value = btn.dataset.kws;
        if (btn.dataset.domain) document.getElementById("gscGoogleDomain").value = btn.dataset.domain;
        if (btn.dataset.rank) document.getElementById("gscTargetRank").value = btn.dataset.rank;
        document.getElementById("gscKeywords").focus();
    });
});

const sendGscTrafficBtn = document.getElementById("sendGscTrafficBtn");
if (sendGscTrafficBtn) {
    sendGscTrafficBtn.addEventListener("click", async () => {
        const urlInput = document.getElementById("targetUrl").value.trim();
        const rawKws = document.getElementById("gscKeywords") ? document.getElementById("gscKeywords").value.trim() : "";
        const googleDomain = document.getElementById("gscGoogleDomain") ? document.getElementById("gscGoogleDomain").value : "google.com";
        const clicksCount = parseInt(document.getElementById("gscCount").value, 10) || 500;
        const targetRank = parseInt(document.getElementById("gscTargetRank").value, 10) || 1;
        const pingSitemap = document.getElementById("gscPingSitemap") ? document.getElementById("gscPingSitemap").checked : true;
        const deviceVal = document.getElementById("gscDevice") ? document.getElementById("gscDevice").value : "all";

        const statusBox = document.getElementById("gscStatusBox");
        const btnSpinner = document.getElementById("gscSpinner");
        const btnText = document.getElementById("gscBtnText");

        if (!urlInput) {
            alert("Please enter the target website URL above first!");
            return;
        }

        const keywordsList = rawKws.split(",").map(k => k.trim()).filter(k => k.length > 0);
        if (keywordsList.length === 0) {
            keywordsList.push("web scraper", "fastest html scraper", "lightning scraper");
        }

        // Loading UI state
        sendGscTrafficBtn.disabled = true;
        btnSpinner.style.display = "inline-block";
        btnText.innerText = "Dispatching GSC Clicks...";
        statusBox.style.display = "block";
        statusBox.className = "ga-status-box info";
        statusBox.innerHTML = `
            ⏳ <b>Starting GSC Organic Simulation:</b><br>
            🎯 <b>Target:</b> ${urlInput} | <b>Clicks:</b> ${clicksCount} on ${googleDomain}<br>
            🔍 <b>Keywords:</b> ${escapeHtml(keywordsList.slice(0, 3).join(", "))}${keywordsList.length > 3 ? '...' : ''}<br>
            🏆 <b>Simulated Rank:</b> #${targetRank} | 🤖 <b>Googlebot Ping:</b> ${pingSitemap ? 'Active (sitemap.xml)' : 'Off'}
        `;

        // Open live monitor deck
        const monitorDeck = document.getElementById("trafficMonitorDeck");
        if (monitorDeck) {
            monitorDeck.style.display = "block";
            document.getElementById("kpiTotal").innerText = clicksCount;
            document.getElementById("kpiCompleted").innerText = "0";
            document.getElementById("kpiFailed").innerText = "0";
            document.getElementById("kpiProgress").innerText = "0";
            document.getElementById("kpiProgressBar").style.width = "0%";
            document.getElementById("kpiRate").innerText = "0.0";
            document.getElementById("kpiMeasurementId").innerText = googleDomain;
            document.getElementById("monitorStatusBadge").innerText = "GSC SEARCH ACTIVE";
            document.getElementById("monitorStatusBadge").className = "monitor-badge";
            monitorDeck.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        try {
            const resp = await fetch("/api/gsc-traffic", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    url: urlInput,
                    keywords: keywordsList,
                    google_domain: googleDomain,
                    clicks_count: clicksCount,
                    target_rank: targetRank,
                    ping_sitemap: pingSitemap,
                    duration_minutes: 0,
                    device: deviceVal,
                    location: "global",
                    concurrency: 30
                })
            });

            const data = await resp.json();
            if (!resp.ok) {
                throw new Error(data.detail || "Failed to trigger GSC traffic.");
            }

            currentTrafficJobId = data.job_id;

            // Poll live telemetry
            clearInterval(trafficPollInterval);
            trafficPollInterval = setInterval(async () => {
                if (!currentTrafficJobId) {
                    clearInterval(trafficPollInterval);
                    return;
                }

                try {
                    const stResp = await fetch(`/api/ga-status/${currentTrafficJobId}`);
                    if (!stResp.ok) return;
                    const st = await stResp.json();

                    document.getElementById("kpiCompleted").innerText = st.completed || 0;
                    document.getElementById("kpiTotal").innerText = st.target_count || clicksCount;
                    document.getElementById("kpiFailed").innerText = st.failed || 0;
                    document.getElementById("kpiProgress").innerText = st.progress_percent || 0;
                    document.getElementById("kpiProgressBar").style.width = `${Math.min(st.progress_percent || 0, 100)}%`;
                    document.getElementById("kpiRate").innerText = st.rate_per_sec || 0;
                    document.getElementById("kpiElapsed").innerText = `${st.elapsed_seconds || 0}s`;

                    // Update Live Terminal Logs
                    const logsEl = document.getElementById("terminalLogs");
                    if (logsEl && st.recent_logs && st.recent_logs.length > 0) {
                        logsEl.innerHTML = st.recent_logs.map(line => {
                            const isSucc = line.includes("GSC CLICK") || line.includes("GOOGLEBOT");
                            return `<div class="log-line ${isSucc ? 'success' : 'dropped'}">${line}</div>`;
                        }).join('');
                        logsEl.scrollTop = logsEl.scrollHeight;
                    }

                    if (st.status === "completed" || st.status === "cancelled" || st.status === "failed") {
                        clearInterval(trafficPollInterval);
                        sendGscTrafficBtn.disabled = false;
                        btnSpinner.style.display = "none";
                        btnText.innerText = "🚀 Launch GSC Organic Clicks";

                        statusBox.className = "ga-status-box success";
                        statusBox.innerHTML = `
                            <b>✅ GSC Organic Search Simulation Completed!</b><br>
                            ⚡ <b>Organic Clicks Delivered:</b> ${st.completed} / ${st.target_count}<br>
                            🌐 <b>Search Engine:</b> https://www.${googleDomain}/<br>
                            🤖 <b>Googlebot Re-index:</b> Sitemap Ping dispatched to Google Search crawlers.<br>
                            📊 <b>Status:</b> Check your Google Search Console Performance Report (updated within 24-48 hours by Google).
                        `;
                    }
                } catch (polErr) {
                    console.error("GSC poll error", polErr);
                }
            }, 600);

        } catch (err) {
            statusBox.className = "ga-status-box error";
            statusBox.innerHTML = `❌ <b>Error:</b> ${err.message}`;
            sendGscTrafficBtn.disabled = false;
            btnSpinner.style.display = "none";
            btnText.innerText = "🚀 Launch GSC Organic Clicks";
        }
    });
}


// =========================================================
// THEME SWITCHER
// =========================================================
const themeToggleBtn = document.getElementById("themeToggleBtn");
const themeIcon = document.getElementById("themeIcon");
const themeText = document.getElementById("themeText");

function applyTheme(theme) {
    if (theme === "light") {
        document.documentElement.setAttribute("data-theme", "light");
        if (themeIcon) themeIcon.innerText = "🌙";
        if (themeText) themeText.innerText = "Dark Theme";
    } else {
        document.documentElement.removeAttribute("data-theme");
        if (themeIcon) themeIcon.innerText = "☀️";
        if (themeText) themeText.innerText = "Light Theme";
    }
    localStorage.setItem("lightning_theme", theme);
}

const savedTheme = localStorage.getItem("lightning_theme") || "light";
applyTheme(savedTheme);

if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
        const currentTheme = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
        const newTheme = currentTheme === "light" ? "dark" : "light";
        applyTheme(newTheme);
    });
}
