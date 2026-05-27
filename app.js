(() => {
  "use strict";

  const STORAGE_KEY = "tankbuch.entries.v1";

  const dateInput = document.getElementById("date");
  const odometerInput = document.getElementById("odometer");
  const litersInput = document.getElementById("liters");
  const totalCostInput = document.getElementById("totalCost");
  const fullTankInput = document.getElementById("fullTank");
  const form = document.getElementById("entryForm");
  const formError = document.getElementById("formError");
  const historyList = document.getElementById("historyList");
  const emptyState = document.getElementById("emptyState");
  const exportBtn = document.getElementById("exportBtn");
  const importBtn = document.getElementById("importBtn");
  const importFile = document.getElementById("importFile");
  const confirmDialog = document.getElementById("confirmDialog");
  const confirmText = document.getElementById("confirmText");

  const avgEl = document.getElementById("avgConsumption");
  const lastDistanceEl = document.getElementById("lastDistance");
  const lastConsumptionEl = document.getElementById("lastConsumption");
  const totalLitersEl = document.getElementById("totalLiters");

  const centPerKmEl = document.getElementById("centPerKm");
  const costThisMonthEl = document.getElementById("costThisMonth");
  const costThisYearEl = document.getElementById("costThisYear");
  const costProjectedEl = document.getElementById("costProjected");

  const trendAlertEl = document.getElementById("trendAlert");
  const trendAlertTextEl = document.getElementById("trendAlertText");
  const trendAlertCostEl = document.getElementById("trendAlertCost");

  const formTitleEl = document.getElementById("formTitle");
  const submitBtn = document.getElementById("submitBtn");
  const cancelEditBtn = document.getElementById("cancelEditBtn");

  let editingId = null;

  const numberFmt = new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const litersFmt = new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const consumptionFmt = new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const centFmt = new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const eurFmt = new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  const eurFmt2 = new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const priceFmt = new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });
  const pricePerLiterFmt = new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
  const pctFmt = new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
  const dateFmt = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  function loadEntries() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isValidEntry);
    } catch {
      return [];
    }
  }

  function saveEntries(entries) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }

  function isValidEntry(e) {
    return (
      e &&
      typeof e.id === "string" &&
      typeof e.date === "string" &&
      typeof e.odometer === "number" &&
      typeof e.liters === "number" &&
      typeof e.fullTank === "boolean"
    );
  }

  function uid() {
    return (
      Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    );
  }

  function parseGermanNumber(value) {
    if (typeof value !== "string") return Number(value);
    return Number(value.replace(/\s/g, "").replace(",", "."));
  }

  function sortedAsc(entries) {
    return [...entries].sort((a, b) => {
      if (a.odometer !== b.odometer) return a.odometer - b.odometer;
      return a.date.localeCompare(b.date);
    });
  }

  // Cost of a single fillup. Prefers the receipt total when stored,
  // falls back to liters x pricePerLiter for legacy entries.
  function entryCost(e) {
    if (typeof e.totalCost === "number" && e.totalCost > 0) return e.totalCost;
    if (
      typeof e.pricePerLiter === "number" &&
      e.pricePerLiter > 0 &&
      e.liters > 0
    ) {
      return e.liters * e.pricePerLiter;
    }
    return null;
  }

  // Derived price per liter for display. Computes from total when available.
  function entryPricePerLiter(e) {
    if (typeof e.totalCost === "number" && e.totalCost > 0 && e.liters > 0) {
      return e.totalCost / e.liters;
    }
    if (typeof e.pricePerLiter === "number" && e.pricePerLiter > 0) {
      return e.pricePerLiter;
    }
    return null;
  }

  // Computes consumption per entry between full tanks.
  // Standard method: distance from last full tank to this full tank,
  // divided by sum of liters at all fillups since (and including) this one,
  // attributed to this full-tank entry. Cost is tracked per interval too,
  // but only when every fillup in the interval has a price.
  function computeConsumption(entries) {
    const asc = sortedAsc(entries);
    const consumptionById = new Map();
    const ordered = [];

    let lastFullIdx = -1;
    let litersSinceLastFull = 0;
    let costSinceLastFull = 0;
    let allHavePrice = true;

    for (let i = 0; i < asc.length; i++) {
      const e = asc[i];
      if (lastFullIdx === -1) {
        if (e.fullTank) {
          lastFullIdx = i;
        }
        litersSinceLastFull = 0;
        costSinceLastFull = 0;
        allHavePrice = true;
        continue;
      }

      litersSinceLastFull += e.liters;
      const entryCostValue = entryCost(e);
      if (entryCostValue !== null) {
        costSinceLastFull += entryCostValue;
      } else {
        allHavePrice = false;
      }

      if (e.fullTank) {
        const distance = e.odometer - asc[lastFullIdx].odometer;
        if (distance > 0 && litersSinceLastFull > 0) {
          const consumption = (litersSinceLastFull / distance) * 100;
          const cost = allHavePrice ? costSinceLastFull : null;
          const centPerKm =
            cost !== null && distance > 0 ? (cost / distance) * 100 : null;
          const data = {
            id: e.id,
            date: e.date,
            consumption,
            distance,
            litersUsed: litersSinceLastFull,
            cost,
            centPerKm,
          };
          consumptionById.set(e.id, data);
          ordered.push(data);
        }
        lastFullIdx = i;
        litersSinceLastFull = 0;
        costSinceLastFull = 0;
        allHavePrice = true;
      }
    }

    return { byId: consumptionById, ordered };
  }

  // Weighted recent vs. older comparison. Returns null when there is not
  // enough history to draw a conclusion, or no meaningful upward trend.
  function computeTrend(ordered) {
    if (ordered.length < 6) return null;
    const split = ordered.length >= 8 ? 4 : 3;
    const recent = ordered.slice(-split);
    const older = ordered.slice(0, -split);
    if (older.length < 3) return null;

    function weightedAvg(arr) {
      let dist = 0;
      let liters = 0;
      for (const c of arr) {
        dist += c.distance;
        liters += c.litersUsed;
      }
      return dist > 0 ? (liters / dist) * 100 : null;
    }

    const recentAvg = weightedAvg(recent);
    const olderAvg = weightedAvg(older);
    if (recentAvg === null || olderAvg === null || olderAvg <= 0) return null;

    const diffAbs = recentAvg - olderAvg;
    const diffPct = (diffAbs / olderAvg) * 100;
    if (diffPct < 5) return null; // no meaningful upward trend

    return {
      recentCount: recent.length,
      recentAvg,
      olderAvg,
      diffAbs,
      diffPct,
      severe: diffPct >= 10,
    };
  }

  function computeCostByPeriod(entries) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    let totalCost = 0;
    let costThisMonth = 0;
    let costThisYear = 0;
    let priceCount = 0;
    let firstPriceDate = null;
    let lastPriceDate = null;

    for (const e of entries) {
      const cost = entryCost(e);
      if (cost === null || cost <= 0) continue;
      totalCost += cost;
      priceCount++;
      const d = new Date(e.date + "T00:00:00");
      if (isNaN(d)) continue;
      if (!firstPriceDate || d < firstPriceDate) firstPriceDate = d;
      if (!lastPriceDate || d > lastPriceDate) lastPriceDate = d;
      if (d.getFullYear() === currentYear) {
        costThisYear += cost;
        if (d.getMonth() === currentMonth) {
          costThisMonth += cost;
        }
      }
    }

    // Projection: based on actual usage timespan. Needs at least 30 days
    // of price history to avoid wild guesses from a single fillup.
    let projectedYearlyCost = null;
    let projectionBasisDays = 0;
    if (priceCount >= 2 && firstPriceDate && lastPriceDate) {
      const days = Math.max(
        1,
        (lastPriceDate - firstPriceDate) / (1000 * 60 * 60 * 24)
      );
      if (days >= 30) {
        projectedYearlyCost = (totalCost / days) * 365;
        projectionBasisDays = Math.round(days);
      }
    }

    return {
      totalCost,
      costThisMonth,
      costThisYear,
      projectedYearlyCost,
      projectionBasisDays,
      priceCount,
    };
  }

  function computeStats(entries) {
    const asc = sortedAsc(entries);
    const { byId: consumptions, ordered } = computeConsumption(entries);

    let totalDistance = 0;
    let totalLitersBetweenFulls = 0;
    let totalDistanceWithCost = 0;
    let totalCostBetweenFulls = 0;
    for (const data of ordered) {
      totalDistance += data.distance;
      totalLitersBetweenFulls += data.litersUsed;
      if (data.cost !== null) {
        totalDistanceWithCost += data.distance;
        totalCostBetweenFulls += data.cost;
      }
    }

    const avg =
      totalDistance > 0
        ? (totalLitersBetweenFulls / totalDistance) * 100
        : null;

    const avgCentPerKm =
      totalDistanceWithCost > 0
        ? (totalCostBetweenFulls / totalDistanceWithCost) * 100
        : null;

    const totalLiters = asc.reduce((sum, e) => sum + e.liters, 0);

    let lastDistance = null;
    let lastConsumption = null;
    if (asc.length >= 2) {
      lastDistance = asc[asc.length - 1].odometer - asc[asc.length - 2].odometer;
    }
    for (let i = asc.length - 1; i >= 0; i--) {
      const c = consumptions.get(asc[i].id);
      if (c) {
        lastConsumption = c.consumption;
        break;
      }
    }

    const cost = computeCostByPeriod(entries);
    const trend = computeTrend(ordered);

    // Estimate financial impact of trend over a year, using latest price.
    let trendCostPerYear = null;
    if (trend) {
      const recentPriced = [...entries]
        .filter((e) => entryPricePerLiter(e) !== null)
        .sort((a, b) => a.date.localeCompare(b.date));
      const recentPrice =
        recentPriced.length > 0
          ? entryPricePerLiter(recentPriced[recentPriced.length - 1])
          : null;
      // Assume 15 000 km/year as a reasonable default if we have no annual data
      let kmPerYear = 15000;
      if (asc.length >= 2) {
        const firstD = new Date(asc[0].date + "T00:00:00");
        const lastD = new Date(asc[asc.length - 1].date + "T00:00:00");
        const days = Math.max(
          1,
          (lastD - firstD) / (1000 * 60 * 60 * 24)
        );
        if (days >= 60) {
          const km = asc[asc.length - 1].odometer - asc[0].odometer;
          kmPerYear = (km / days) * 365;
        }
      }
      if (recentPrice && kmPerYear > 0) {
        // diffAbs is in L/100km. Extra liters per year:
        const extraLitersPerYear = (trend.diffAbs / 100) * kmPerYear;
        trendCostPerYear = extraLitersPerYear * recentPrice;
      }
    }

    return {
      avg,
      avgCentPerKm,
      totalLiters,
      lastDistance,
      lastConsumption,
      consumptions,
      cost,
      trend,
      trendCostPerYear,
    };
  }

  function renderStats(stats) {
    avgEl.textContent =
      stats.avg !== null ? consumptionFmt.format(stats.avg) : "–";
    lastDistanceEl.textContent =
      stats.lastDistance !== null && stats.lastDistance > 0
        ? numberFmt.format(stats.lastDistance)
        : "–";
    lastConsumptionEl.textContent =
      stats.lastConsumption !== null
        ? consumptionFmt.format(stats.lastConsumption)
        : "–";
    totalLitersEl.textContent =
      stats.totalLiters > 0 ? litersFmt.format(stats.totalLiters) : "–";

    centPerKmEl.textContent =
      stats.avgCentPerKm !== null ? centFmt.format(stats.avgCentPerKm) : "–";
    costThisMonthEl.textContent =
      stats.cost.costThisMonth > 0
        ? eurFmt2.format(stats.cost.costThisMonth)
        : "–";
    costThisYearEl.textContent =
      stats.cost.costThisYear > 0
        ? eurFmt2.format(stats.cost.costThisYear)
        : "–";
    costProjectedEl.textContent =
      stats.cost.projectedYearlyCost !== null
        ? eurFmt.format(stats.cost.projectedYearlyCost)
        : "–";
  }

  function renderTrend(stats) {
    if (!stats.trend) {
      trendAlertEl.hidden = true;
      return;
    }
    const t = stats.trend;
    const main =
      `Dein Verbrauch ist in den letzten ${t.recentCount} Tankungen um ` +
      `${pctFmt.format(t.diffPct)} % gestiegen ` +
      `(${consumptionFmt.format(t.recentAvg)} statt vorher ${consumptionFmt.format(t.olderAvg)} L/100 km).`;
    trendAlertTextEl.textContent = main;

    if (stats.trendCostPerYear && stats.trendCostPerYear > 20) {
      trendAlertCostEl.textContent =
        `Geschätzte Mehrkosten pro Jahr: ca. ${eurFmt.format(stats.trendCostPerYear)}.`;
      trendAlertCostEl.hidden = false;
    } else {
      trendAlertCostEl.hidden = true;
    }

    trendAlertEl.classList.toggle("severe", t.severe);
    trendAlertEl.hidden = false;
  }

  function renderHistory(entries, consumptions) {
    historyList.innerHTML = "";
    const desc = sortedAsc(entries).reverse();

    if (desc.length === 0) {
      emptyState.hidden = false;
      return;
    }
    emptyState.hidden = true;

    for (const e of desc) {
      const li = document.createElement("li");
      li.className = "history-entry";

      const top = document.createElement("div");
      top.className = "entry-top";

      const dateEl = document.createElement("span");
      dateEl.className = "entry-date";
      const d = new Date(e.date + "T00:00:00");
      dateEl.textContent = isNaN(d) ? e.date : dateFmt.format(d);

      const consEl = document.createElement("span");
      const cData = consumptions.get(e.id);
      if (cData) {
        consEl.className = "entry-consumption";
        consEl.textContent = `${consumptionFmt.format(cData.consumption)} L/100 km`;
      } else {
        consEl.className = "entry-consumption no-data";
        consEl.textContent = "–";
      }

      top.append(dateEl, consEl);

      const details = document.createElement("div");
      details.className = "entry-details";
      details.innerHTML =
        `<span>Stand: <strong>${numberFmt.format(e.odometer)} km</strong></span>` +
        `<span>Getankt: <strong>${litersFmt.format(e.liters)} L</strong></span>`;
      const totalCost = entryCost(e);
      if (totalCost !== null) {
        details.innerHTML += `<span>Summe: <strong>${eurFmt2.format(totalCost)}</strong></span>`;
        const ppl = entryPricePerLiter(e);
        if (ppl !== null) {
          details.innerHTML += `<span>≈ <strong>${pricePerLiterFmt.format(ppl)}/L</strong></span>`;
        }
      }

      const badges = document.createElement("div");
      badges.className = "entry-badges";
      if (e.fullTank) {
        const b = document.createElement("span");
        b.className = "badge full";
        b.textContent = "Voll";
        badges.appendChild(b);
      } else {
        const b = document.createElement("span");
        b.className = "badge";
        b.textContent = "Teil";
        badges.appendChild(b);
      }

      const actions = document.createElement("div");
      actions.className = "entry-actions";

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "entry-edit";
      editBtn.textContent = "Bearbeiten";
      editBtn.addEventListener("click", () => startEdit(e.id));

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "entry-delete";
      delBtn.textContent = "Löschen";
      delBtn.addEventListener("click", () => deleteEntry(e.id));

      actions.append(editBtn, delBtn);

      if (editingId === e.id) li.classList.add("entry-editing");

      li.append(top, details, badges, actions);
      historyList.appendChild(li);
    }
  }

  function render() {
    const entries = loadEntries();
    const stats = computeStats(entries);
    renderStats(stats);
    renderTrend(stats);
    renderHistory(entries, stats.consumptions);
  }

  function showError(msg) {
    formError.textContent = msg;
    formError.hidden = false;
  }

  function clearError() {
    formError.hidden = true;
    formError.textContent = "";
  }

  function validateEntry(entries, newEntry, excludeId = null) {
    // Odometer must be strictly increasing over the timeline.
    const others = entries.filter((e) => e.id !== excludeId);
    const asc = sortedAsc(others);
    const beforeOnDate = asc.filter(
      (e) => e.date < newEntry.date || e.date === newEntry.date
    );
    const after = asc.filter((e) => e.date > newEntry.date);

    const maxBefore = beforeOnDate.reduce(
      (m, e) => Math.max(m, e.odometer),
      -Infinity
    );
    const minAfter = after.reduce(
      (m, e) => Math.min(m, e.odometer),
      Infinity
    );

    if (newEntry.odometer <= maxBefore) {
      return `Der Kilometerstand muss größer sein als ${numberFmt.format(maxBefore)} km (letzter bekannter Stand bis zu diesem Datum).`;
    }
    if (newEntry.odometer >= minAfter && isFinite(minAfter)) {
      return `Der Kilometerstand muss kleiner sein als ${numberFmt.format(minAfter)} km (nächster bekannter Stand nach diesem Datum).`;
    }
    return null;
  }

  function startEdit(id) {
    const entries = loadEntries();
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;

    editingId = id;
    dateInput.value = entry.date;
    odometerInput.value = String(entry.odometer);
    litersInput.value = String(entry.liters).replace(".", ",");
    const cost = entryCost(entry);
    totalCostInput.value =
      cost !== null
        ? cost.toFixed(2).replace(".", ",")
        : "";
    fullTankInput.checked = entry.fullTank;

    formTitleEl.textContent = "Tankung bearbeiten";
    submitBtn.textContent = "Änderungen speichern";
    cancelEditBtn.hidden = false;
    clearError();
    render();
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function cancelEdit() {
    editingId = null;
    form.reset();
    setDefaultDate();
    fullTankInput.checked = true;
    formTitleEl.textContent = "Neue Tankung";
    submitBtn.textContent = "Tankung speichern";
    cancelEditBtn.hidden = true;
    clearError();
    render();
  }

  cancelEditBtn.addEventListener("click", cancelEdit);

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    clearError();

    const date = dateInput.value;
    const odometer = parseGermanNumber(odometerInput.value);
    const liters = parseGermanNumber(litersInput.value);
    const totalCostRaw = totalCostInput.value.trim();
    const totalCost = totalCostRaw === "" ? null : parseGermanNumber(totalCostRaw);
    const fullTank = fullTankInput.checked;

    if (!date) {
      showError("Bitte ein Datum angeben.");
      return;
    }
    if (!Number.isFinite(odometer) || odometer < 0) {
      showError("Bitte einen gültigen Kilometerstand angeben.");
      return;
    }
    if (!Number.isFinite(liters) || liters <= 0) {
      showError("Bitte eine gültige Litermenge angeben.");
      return;
    }
    if (totalCost !== null && (!Number.isFinite(totalCost) || totalCost < 0)) {
      showError("Die Summe ist ungültig.");
      return;
    }

    const entries = loadEntries();
    const newEntry = {
      id: editingId || uid(),
      date,
      odometer,
      liters,
      fullTank,
    };
    if (totalCost !== null && totalCost > 0) {
      newEntry.totalCost = totalCost;
    }

    const err = validateEntry(entries, newEntry, editingId);
    if (err) {
      showError(err);
      return;
    }

    if (editingId) {
      const idx = entries.findIndex((e) => e.id === editingId);
      if (idx === -1) {
        editingId = null;
        showError("Eintrag nicht mehr gefunden.");
        return;
      }
      entries[idx] = newEntry;
    } else {
      entries.push(newEntry);
    }
    saveEntries(entries);

    editingId = null;
    form.reset();
    setDefaultDate();
    fullTankInput.checked = true;
    formTitleEl.textContent = "Neue Tankung";
    submitBtn.textContent = "Tankung speichern";
    cancelEditBtn.hidden = true;
    render();
  });

  function deleteEntry(id) {
    const entries = loadEntries();
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    const label = `${dateFmt.format(new Date(entry.date + "T00:00:00"))} – ${litersFmt.format(entry.liters)} L`;
    confirmText.textContent = `Diesen Eintrag löschen?\n${label}`;
    confirmDialog.returnValue = "";
    confirmDialog.showModal();
    confirmDialog.addEventListener(
      "close",
      () => {
        if (confirmDialog.returnValue === "confirm") {
          const filtered = entries.filter((e) => e.id !== id);
          saveEntries(filtered);
          if (editingId === id) cancelEdit();
          else render();
        }
      },
      { once: true }
    );
  }

  function setDefaultDate() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    dateInput.value = `${yyyy}-${mm}-${dd}`;
  }

  // Export/Import for backup
  exportBtn.addEventListener("click", () => {
    const data = JSON.stringify(loadEntries(), null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `tankbuch-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  });

  importBtn.addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", async () => {
    const file = importFile.files && importFile.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed) || !parsed.every(isValidEntry)) {
        throw new Error("Ungültiges Format");
      }
      const existing = loadEntries();
      const existingIds = new Set(existing.map((e) => e.id));
      const merged = existing.concat(
        parsed.filter((e) => !existingIds.has(e.id))
      );
      saveEntries(merged);
      render();
      alert(`${parsed.length} Einträge importiert.`);
    } catch (e) {
      alert("Import fehlgeschlagen: " + e.message);
    } finally {
      importFile.value = "";
    }
  });

  setDefaultDate();
  render();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {
        // Offline-Modus optional, kein Fehler nach außen
      });
    });
  }
})();
