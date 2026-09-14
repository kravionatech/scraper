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

// Presets click
document.querySelectorAll(".preset-chips .chip").forEach(chip => {
    chip.addEventListener("click", () => {
        document.getElementById("targetUrl").value = chip.dataset.url;
        document.getElementById("customName").value = chip.dataset.selName;
        document.getElementById("customSelector").value = chip.dataset.sel;
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

    const customName = document.getElementById("customName").value.trim();
    const customSelector = document.getElementById("customSelector").value.trim();
    const bypassCache = document.getElementById("bypassCache").checked;

    const custom_selectors = [];
    if (customSelector) {
        custom_selectors.push({
            name: customName || "custom",
            selector: customSelector
        });
    }

    try {
        const res = await fetch("/api/scrape", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                url: urlInput,
                custom_selectors: custom_selectors,
                bypass_cache: bypassCache
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
        customContent.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">No custom selector specified. Expand "Custom CSS Selectors & Options" above to target specific tags, classes, or IDs.</p>`;
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

    // 6. Raw JSON
    document.getElementById("rawJsonCode").innerText = JSON.stringify(data, null, 2);
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

// Export actions
document.getElementById("copyJsonBtn").addEventListener("click", () => {
    if (!currentData) return;
    navigator.clipboard.writeText(JSON.stringify(currentData, null, 2));
    alert("JSON copied to clipboard!");
});

document.getElementById("downloadJsonBtn").addEventListener("click", () => {
    if (!currentData) return;
    const blob = new Blob([JSON.stringify(currentData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scrape_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
});

document.getElementById("downloadCsvBtn").addEventListener("click", () => {
    if (!currentData) return;
    let csv = "Type,Field,Value\n";
    csv += `"Metadata","Title","${(currentData.title || '').replace(/"/g, '""')}"\n`;
    csv += `"Metadata","URL","${(currentData.url || '').replace(/"/g, '""')}"\n`;
    csv += `"Metadata","Description","${(currentData.description || '').replace(/"/g, '""')}"\n`;

    (currentData.headings || []).forEach(h => {
        csv += `"Heading","${h.tag}","${h.text.replace(/"/g, '""')}"\n`;
    });

    (currentData.links || []).forEach(l => {
        csv += `"Link","${(l.text || '').replace(/"/g, '""')}","${l.url.replace(/"/g, '""')}"\n`;
    });

    if (currentData.custom_data) {
        for (const [key, val] of Object.entries(currentData.custom_data)) {
            if (Array.isArray(val)) {
                val.forEach(item => {
                    csv += `"Custom","${key}","${String(item).replace(/"/g, '""')}"\n`;
                });
            } else {
                csv += `"Custom","${key}","${String(val).replace(/"/g, '""')}"\n`;
            }
        }
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scrape_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
});

// GA4 Traffic Generator Handler
let currentTrafficJobId = null;
let trafficPollInterval = null;

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

        const statusBox = document.getElementById("gaStatusBox");
        const btnSpinner = document.getElementById("gaSpinner");
        const btnText = document.getElementById("gaBtnText");

        if (!urlInput) {
            alert("Please enter the target website URL above first (e.g. https://kraviona.site)!");
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
            🛡️ <b>Proxy Engine:</b> ${proxyVal ? 'Custom Active' : 'Auto Live Verified International Proxies'}${measurementIdVal ? `<br>🏷️ <b>Specified Tag:</b> <code>${measurementIdVal}</code>` : ''}
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
            // Smooth scroll to monitor deck
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
                    concurrency: 40,
                    measurement_id: measurementIdVal || null
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
        } catch (e) {
            console.error("Failed to cancel job", e);
        }
    });
}

// Enterprise Light/Dark Theme Switcher
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

// Set Light Theme by default as requested by user
const savedTheme = localStorage.getItem("lightning_theme") || "light";
applyTheme(savedTheme);

if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
        const currentTheme = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
        const newTheme = currentTheme === "light" ? "dark" : "light";
        applyTheme(newTheme);
    });
}



