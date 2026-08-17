const COMMISSION_RATE = 0.2;

const state = {
  data: null,
  selectedPeriod: "",
  selectedPlatform: "all",
  selectedProduct: "all",
  periodOrder: [],
  periodLabels: {},
  sidebarCollapsed: false
};

const elements = {
  layoutGrid: document.getElementById("layoutGrid"),
  sidebarPanel: document.getElementById("sidebarPanel"),
  sidebarToggleIcon: document.getElementById("sidebarToggleIcon"),
  burgerLineTop: document.getElementById("burgerLineTop"),
  burgerLineMid: document.getElementById("burgerLineMid"),
  burgerLineBottom: document.getElementById("burgerLineBottom"),
  periodFilter: document.getElementById("periodFilter"),
  platformFilter: document.getElementById("platformFilter"),
  productFilter: document.getElementById("productFilter"),
  kpiGrid: document.getElementById("kpiGrid"),
  revenueTrendLine: document.getElementById("revenueTrendLine"),
  revenueTrendLabels: document.getElementById("revenueTrendLabels"),
  forecastRevenue: document.getElementById("forecastRevenue"),
  forecastDelta: document.getElementById("forecastDelta"),
  forecastSuggestions: document.getElementById("forecastSuggestions"),
  funnelList: document.getElementById("funnelList"),
  driverCards: document.getElementById("driverCards"),
  qualityActivityCards: document.getElementById("qualityActivityCards"),
  engagementBars: document.getElementById("engagementBars"),
  alertsList: document.getElementById("alertsList"),
  topList: document.getElementById("topList"),
  productsTable: document.getElementById("productsTable"),
  platformsTable: document.getElementById("platformsTable"),
  campaignsTable: document.getElementById("campaignsTable")
};

const formatCurrency = (value) =>
  new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);

const formatNumber = (value) =>
  new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(value);

const formatPercent = (value) => `${(value * 100).toFixed(1)}%`;

function safeDivide(numerator, denominator) {
  if (!denominator) {
    return 0;
  }
  return numerator / denominator;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function cloneObject(value) {
  return JSON.parse(JSON.stringify(value));
}

function monthLabel(date) {
  return date.toLocaleDateString("es-ES", { month: "short", year: "numeric" });
}

function shiftDateMonth(baseDateText, targetMonth) {
  const parsed = new Date(baseDateText);
  const day = Number.isNaN(parsed.getTime()) ? 1 : parsed.getDate();
  return new Date(targetMonth.getFullYear(), targetMonth.getMonth(), day).toISOString().slice(0, 10);
}

function scalePeriodTemplate(template, factor, monthDate) {
  const scaled = cloneObject(template);

  scaled.usersActive = Math.round(template.usersActive * factor);
  scaled.signups = Math.round(template.signups * factor);

  scaled.subscriptions.mrr = Math.round(template.subscriptions.mrr * factor);
  scaled.subscriptions.churnRate = clamp(template.subscriptions.churnRate * (1 + (1 - factor) * 0.3), 0.02, 0.22);
  scaled.subscriptions.permanenciaRate = clamp(template.subscriptions.permanenciaRate * factor, 0.4, 0.96);
  scaled.subscriptions.completionRate = clamp(template.subscriptions.completionRate * factor, 0.35, 0.95);

  scaled.satisfaction.nps = Math.round(clamp(template.satisfaction.nps * factor, 20, 90));
  scaled.satisfaction.csat = Math.round(clamp(template.satisfaction.csat * factor, 45, 99));

  scaled.quality.qualifiedLeadRate = clamp(template.quality.qualifiedLeadRate * factor, 0.15, 0.9);
  scaled.quality.attendanceRate = clamp(template.quality.attendanceRate * factor, 0.2, 0.95);
  scaled.quality.passRate = clamp(template.quality.passRate * factor, 0.2, 0.95);

  Object.values(scaled.platformMetrics).forEach((metric, index) => {
    const platformBias = 1 + (index - 1) * 0.02;
    const totalFactor = factor * platformBias;

    metric.reach = Math.round(metric.reach * totalFactor);
    metric.impressions = Math.round(metric.impressions * totalFactor);
    metric.clicks = Math.round(metric.clicks * totalFactor);
    metric.interactions = Math.round(metric.interactions * totalFactor);
    metric.cost = Math.round(metric.cost * totalFactor);
    metric.posts = Math.max(1, Math.round(metric.posts * totalFactor));
    metric.stories = Math.max(0, Math.round(metric.stories * totalFactor));
    metric.reels = Math.max(0, Math.round(metric.reels * totalFactor));
    metric.videos = Math.max(0, Math.round(metric.videos * totalFactor));

    Object.keys(metric.productSales).forEach((productId) => {
      metric.productSales[productId] = Math.max(0, Math.round(metric.productSales[productId] * totalFactor));
    });
  });

  scaled.campaigns = scaled.campaigns.map((campaign, index) => {
    const campaignFactor = factor * (1 + (index - 1) * 0.02);
    return {
      ...campaign,
      reach: Math.round(campaign.reach * campaignFactor),
      conversions: Math.round(campaign.conversions * campaignFactor),
      revenue: Math.round(campaign.revenue * campaignFactor),
      cost: Math.round(campaign.cost * campaignFactor),
      startDate: shiftDateMonth(campaign.startDate, monthDate),
      endDate: shiftDateMonth(campaign.endDate, monthDate)
    };
  });

  return scaled;
}

function buildTwelveMonthPeriods(rawData) {
  const periods = rawData.periods || {};
  const currentTemplate = periods.mes_actual || Object.values(periods)[0];
  const previousTemplate = periods.mes_anterior || currentTemplate;

  const newPeriods = {};
  const periodOrder = [];
  const periodLabels = {};

  for (let index = 0; index < 12; index += 1) {
    const monthDate = new Date();
    monthDate.setDate(1);
    monthDate.setMonth(monthDate.getMonth() - index);

    const periodId = `p${index}`;
    const label = monthLabel(monthDate);
    let periodData;

    if (index === 0) {
      periodData = cloneObject(currentTemplate);
    } else if (index === 1) {
      periodData = cloneObject(previousTemplate);
    } else {
      const wave = 1 + Math.sin(index * 0.75) * 0.05;
      const decay = 1 - index * 0.028;
      const factor = clamp(decay * wave, 0.62, 1);
      periodData = scalePeriodTemplate(previousTemplate, factor, monthDate);
    }

    newPeriods[periodId] = periodData;
    periodOrder.push(periodId);
    periodLabels[periodId] = label;
  }

  return {
    ...rawData,
    periods: newPeriods,
    periodOrder,
    periodLabels
  };
}

function getCurrentPeriodData() {
  return state.data.periods[state.selectedPeriod];
}

function getPreviousPeriodData() {
  const currentIndex = state.periodOrder.indexOf(state.selectedPeriod);
  const previousId = state.periodOrder[currentIndex + 1];
  return state.data.periods[previousId] || getCurrentPeriodData();
}

function getFilteredPlatformEntries(periodData) {
  const entries = Object.entries(periodData.platformMetrics);
  if (state.selectedPlatform === "all") {
    return entries;
  }
  return entries.filter(([platformId]) => platformId === state.selectedPlatform);
}

function aggregateTotals(periodData) {
  const platformEntries = getFilteredPlatformEntries(periodData);
  const productsMap = Object.fromEntries(state.data.products.map((item) => [item.id, item]));

  const totals = {
    reach: 0,
    impressions: 0,
    clicks: 0,
    interactions: 0,
    cost: 0,
    posts: 0,
    stories: 0,
    reels: 0,
    videos: 0,
    conversions: 0,
    revenue: 0,
    usersActive: periodData.usersActive,
    signups: periodData.signups,
    mrr: periodData.subscriptions.mrr,
    churnRate: periodData.subscriptions.churnRate,
    permanenciaRate: periodData.subscriptions.permanenciaRate,
    completionRate: periodData.subscriptions.completionRate,
    nps: periodData.satisfaction.nps,
    csat: periodData.satisfaction.csat,
    qualifiedLeadRate: periodData.quality.qualifiedLeadRate,
    attendanceRate: periodData.quality.attendanceRate,
    passRate: periodData.quality.passRate
  };

  platformEntries.forEach(([, metric]) => {
    totals.reach += metric.reach;
    totals.impressions += metric.impressions;
    totals.clicks += metric.clicks;
    totals.interactions += metric.interactions;
    totals.cost += metric.cost;
    totals.posts += metric.posts;
    totals.stories += metric.stories;
    totals.reels += metric.reels;
    totals.videos += metric.videos;

    Object.entries(metric.productSales).forEach(([productId, units]) => {
      if (state.selectedProduct !== "all" && state.selectedProduct !== productId) {
        return;
      }
      totals.conversions += units;
      totals.revenue += units * productsMap[productId].price;
    });
  });

  totals.commissions = totals.revenue * COMMISSION_RATE;
  totals.conversionRate = safeDivide(totals.conversions, totals.reach);
  totals.ctr = safeDivide(totals.clicks, totals.reach);
  totals.engagementRate = safeDivide(totals.interactions, totals.reach);
  totals.avgPrice = safeDivide(totals.revenue, totals.conversions);
  totals.marginRate = safeDivide(totals.revenue - totals.cost, totals.revenue);
  totals.costPerResult = safeDivide(totals.cost, totals.conversions);
  totals.roi = safeDivide(totals.revenue - totals.cost, totals.cost);

  return totals;
}

function computeDelta(currentValue, previousValue) {
  const delta = safeDivide(currentValue - previousValue, previousValue);
  return Number.isFinite(delta) ? delta : 0;
}

function getKpis(currentTotals, previousTotals) {
  return [
    {
      title: "Comisiones",
      value: formatCurrency(currentTotals.commissions),
      delta: computeDelta(currentTotals.commissions, previousTotals.commissions),
      helper: "Suma de comisiones"
    },
    {
      title: "Revenue",
      value: formatCurrency(currentTotals.revenue),
      delta: computeDelta(currentTotals.revenue, previousTotals.revenue),
      helper: "Ingresos totales"
    },
    {
      title: "ROI",
      value: formatPercent(currentTotals.roi),
      delta: computeDelta(currentTotals.roi, previousTotals.roi),
      helper: "(Ingresos - costes) / costes"
    },
    {
      title: "Conversion",
      value: formatPercent(currentTotals.conversionRate),
      delta: computeDelta(currentTotals.conversionRate, previousTotals.conversionRate),
      helper: "Conversiones / alcance"
    },
    {
      title: "Engagement",
      value: formatPercent(currentTotals.engagementRate),
      delta: computeDelta(currentTotals.engagementRate, previousTotals.engagementRate),
      helper: "Interacciones / alcance"
    },
    {
      title: "Coste por resultado",
      value: formatCurrency(currentTotals.costPerResult),
      delta: computeDelta(currentTotals.costPerResult, previousTotals.costPerResult) * -1,
      helper: "Coste / conversiones"
    }
  ];
}

function getProductBreakdown(periodData) {
  const salesMap = Object.fromEntries(state.data.products.map((item) => [item.id, 0]));
  const costMap = Object.fromEntries(state.data.products.map((item) => [item.id, 0]));

  getFilteredPlatformEntries(periodData).forEach(([, platformMetric]) => {
    const totalUnitsInPlatform = Object.values(platformMetric.productSales).reduce((sum, units) => sum + units, 0);

    Object.entries(platformMetric.productSales).forEach(([productId, units]) => {
      salesMap[productId] += units;
      const costShare = safeDivide(units, totalUnitsInPlatform) * platformMetric.cost;
      costMap[productId] += costShare;
    });
  });

  return state.data.products.map((product) => {
    const conversions = state.selectedProduct === "all" || state.selectedProduct === product.id ? salesMap[product.id] : 0;
    const revenue = conversions * product.price;
    const commissions = revenue * COMMISSION_RATE;
    const allocatedCost = state.selectedProduct === "all" || state.selectedProduct === product.id ? costMap[product.id] : 0;
    return {
      id: product.id,
      name: product.name,
      price: product.price,
      conversions,
      revenue,
      commissions,
      allocatedCost,
      roi: safeDivide(revenue - allocatedCost, allocatedCost)
    };
  });
}

function getPlatformBreakdown(periodData) {
  const productsMap = Object.fromEntries(state.data.products.map((item) => [item.id, item]));

  return getFilteredPlatformEntries(periodData).map(([platformId, metric]) => {
    let conversions = 0;
    let revenue = 0;

    Object.entries(metric.productSales).forEach(([productId, units]) => {
      if (state.selectedProduct !== "all" && state.selectedProduct !== productId) {
        return;
      }
      conversions += units;
      revenue += units * productsMap[productId].price;
    });

    const roi = safeDivide(revenue - metric.cost, metric.cost);
    const engagementRate = safeDivide(metric.interactions, metric.reach);
    const conversionRate = safeDivide(conversions, metric.reach);

    return {
      platformId,
      name: state.data.platforms.find((item) => item.id === platformId).name,
      reach: metric.reach,
      interactions: metric.interactions,
      conversions,
      revenue,
      roi,
      engagementRate,
      conversionRate,
      activity: metric.posts + metric.stories + metric.reels + metric.videos
    };
  });
}

function getCampaignRows(periodData) {
  return periodData.campaigns
    .filter((campaign) => state.selectedPlatform === "all" || campaign.platform === state.selectedPlatform)
    .filter((campaign) => state.selectedProduct === "all" || campaign.product === state.selectedProduct)
    .map((campaign) => {
      const roi = safeDivide(campaign.revenue - campaign.cost, campaign.cost);
      return {
        ...campaign,
        conversionRate: safeDivide(campaign.conversions, campaign.reach),
        roi
      };
    });
}

function renderKpiCards(kpis) {
  elements.kpiGrid.innerHTML = kpis
    .map((kpi) => {
      const isPositive = kpi.delta >= 0;
      const deltaTone = isPositive ? "text-emerald-700 bg-emerald-100" : "text-rose-700 bg-rose-100";
      const deltaSignal = `${isPositive ? "+" : ""}${(kpi.delta * 100).toFixed(1)}%`;

      return `
        <article class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">${kpi.title}</h3>
          <p class="mt-2 text-2xl font-black tabular-nums text-slate-900">${kpi.value}</p>
          <p class="mt-2 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${deltaTone}">${deltaSignal}</p>
          <p class="mt-2 text-xs text-slate-600">${kpi.helper}</p>
        </article>
      `;
    })
    .join("");
}

function renderFunnel(currentTotals) {
  const stages = [
    { label: "Alcance", value: currentTotals.reach },
    { label: "Clics", value: currentTotals.clicks },
    { label: "Leads", value: currentTotals.signups },
    { label: "Conversiones", value: currentTotals.conversions }
  ];

  const maxValue = Math.max(...stages.map((stage) => stage.value), 1);

  elements.funnelList.innerHTML = stages
    .map((stage) => {
      const width = safeDivide(stage.value, maxValue) * 100;
      return `
        <li>
          <div class="flex items-center justify-between text-sm">
            <span class="font-medium text-slate-700">${stage.label}</span>
            <span class="font-semibold tabular-nums text-slate-900">${formatNumber(stage.value)}</span>
          </div>
          <div class="mt-1 h-2 w-full rounded-full bg-slate-200">
            <div class="h-2 rounded-full bg-gradient-to-r from-blue-700 to-blue-400" style="width: ${width.toFixed(1)}%"></div>
          </div>
        </li>
      `;
    })
    .join("");
}

function renderDriverCards(platformBreakdown, productBreakdown, currentTotals) {
  const topPlatform = [...platformBreakdown].sort((a, b) => b.roi - a.roi)[0];
  const topProduct = [...productBreakdown].sort((a, b) => b.revenue - a.revenue)[0];

  const cards = [
    {
      title: "Mejor plataforma por ROI",
      primary: topPlatform ? topPlatform.name : "Sin datos",
      secondary: topPlatform ? `ROI ${formatPercent(topPlatform.roi)}` : ""
    },
    {
      title: "Producto con mayor ingreso",
      primary: topProduct ? topProduct.name : "Sin datos",
      secondary: topProduct ? formatCurrency(topProduct.revenue) : ""
    },
    {
      title: "Precio medio",
      primary: formatCurrency(currentTotals.avgPrice),
      secondary: "Revenue / conversiones"
    },
    {
      title: "MRR",
      primary: formatCurrency(currentTotals.mrr),
      secondary: "Facturacion recurrente mensual"
    }
  ];

  elements.driverCards.innerHTML = cards
    .map(
      (card) => `
      <article class="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <h4 class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">${card.title}</h4>
        <p class="mt-2 text-lg font-black tabular-nums text-slate-900">${card.primary}</p>
        <p class="mt-1 text-xs text-slate-600">${card.secondary}</p>
      </article>
    `
    )
    .join("");
}

function renderQualityActivityCards(currentTotals, platformBreakdown) {
  const cards = [
    {
      title: "Leads cualificados",
      value: formatPercent(currentTotals.qualifiedLeadRate),
      helper: "Calidad del embudo"
    },
    {
      title: "Attendance rate",
      value: formatPercent(currentTotals.attendanceRate),
      helper: "Asistencia a acciones clave"
    },
    {
      title: "Pass rate",
      value: formatPercent(currentTotals.passRate),
      helper: "Conversion final"
    },
    {
      title: "Actividad total",
      value: formatNumber(platformBreakdown.reduce((sum, row) => sum + row.activity, 0)),
      helper: "Posts + stories + reels + videos"
    },
    {
      title: "Churn",
      value: formatPercent(currentTotals.churnRate),
      helper: "Tasa de bajas"
    },
    {
      title: "NPS / CSAT",
      value: `${currentTotals.nps} / ${currentTotals.csat}`,
      helper: "Lealtad y satisfaccion"
    }
  ];

  elements.qualityActivityCards.innerHTML = cards
    .map(
      (card) => `
      <article class="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <h4 class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">${card.title}</h4>
        <p class="mt-2 text-xl font-black tabular-nums text-slate-900">${card.value}</p>
        <p class="mt-1 text-xs text-slate-600">${card.helper}</p>
      </article>
    `
    )
    .join("");
}

function renderEngagementBars(platformBreakdown) {
  const maxValue = Math.max(...platformBreakdown.map((item) => item.engagementRate), 1);

  elements.engagementBars.innerHTML = platformBreakdown
    .map((platform) => {
      const width = safeDivide(platform.engagementRate, maxValue) * 100;
      return `
        <li>
          <div class="flex items-center justify-between text-sm">
            <span class="font-medium text-slate-700">${platform.name}</span>
            <span class="font-semibold tabular-nums text-slate-900">${formatPercent(platform.engagementRate)}</span>
          </div>
          <div class="mt-1 h-2 w-full rounded-full bg-slate-200">
            <div class="h-2 rounded-full bg-gradient-to-r from-blue-600 to-sky-400" style="width: ${width.toFixed(1)}%"></div>
          </div>
        </li>
      `;
    })
    .join("");
}

function renderMiniBar(value, maxValue, toneClass) {
  const width = Math.max(8, safeDivide(value, maxValue) * 100);
  return `
    <div class="h-2 w-24 rounded-full bg-slate-200">
      <div class="h-2 rounded-full ${toneClass}" style="width: ${width.toFixed(1)}%"></div>
    </div>
  `;
}

function renderDualBar(primaryValue, primaryMax, secondaryValue, secondaryMax) {
  const primaryWidth = Math.max(8, safeDivide(primaryValue, primaryMax) * 100);
  const secondaryWidth = Math.max(8, safeDivide(secondaryValue, secondaryMax) * 100);
  return `
    <div class="space-y-1">
      <div class="h-1.5 w-24 rounded-full bg-slate-200"><div class="h-1.5 rounded-full bg-blue-600" style="width: ${primaryWidth.toFixed(1)}%"></div></div>
      <div class="h-1.5 w-24 rounded-full bg-slate-200"><div class="h-1.5 rounded-full bg-sky-500" style="width: ${secondaryWidth.toFixed(1)}%"></div></div>
    </div>
  `;
}

function renderRevenueTrend() {
  const rows = [...state.periodOrder].reverse().map((periodId) => {
    const periodData = state.data.periods[periodId];
    const totals = aggregateTotals(periodData);
    return {
      periodId,
      label: state.periodLabels[periodId],
      revenue: totals.revenue
    };
  });

  const maxRevenue = Math.max(...rows.map((row) => row.revenue), 1);
  const minRevenue = Math.min(...rows.map((row) => row.revenue), maxRevenue);
  const span = Math.max(maxRevenue - minRevenue, 1);

  const points = rows
    .map((row, index) => {
      const x = safeDivide(index, Math.max(rows.length - 1, 1)) * 100;
      const y = 30 - safeDivide(row.revenue - minRevenue, span) * 24;
      return { ...row, x, y };
    });

  const linePoints = points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  const areaPoints = `0,30 ${linePoints} 100,30`;

  elements.revenueTrendLine.innerHTML = `
    <defs>
      <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2563EB" stop-opacity="0.28"></stop>
        <stop offset="100%" stop-color="#E2E8F0" stop-opacity="0.05"></stop>
      </linearGradient>
    </defs>
    <line x1="0" y1="30" x2="100" y2="30" stroke="#CBD5E1" stroke-width="0.4"></line>
    <polygon points="${areaPoints}" fill="url(#trendFill)"></polygon>
    <polyline points="${linePoints}" fill="none" stroke="#1D4ED8" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"></polyline>
    ${points
      .map((point) => {
        const isCurrent = point.periodId === state.selectedPeriod;
        return `<circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="${isCurrent ? "1.4" : "1"}" fill="${isCurrent ? "#1D4ED8" : "#64748B"}"></circle>`;
      })
      .join("")}
  `;

  const labelsToShow = [points[0], points[3], points[7], points[points.length - 1]].filter(Boolean);
  elements.revenueTrendLabels.innerHTML = labelsToShow
    .map((point) => {
      const isCurrent = point.periodId === state.selectedPeriod;
      return `
        <li class="rounded-lg border ${isCurrent ? "border-blue-300" : "border-slate-200"} bg-white px-2 py-1.5">
          <p class="truncate font-semibold uppercase tracking-[0.08em] text-slate-700">${point.label}</p>
          <p class="mt-1 font-bold tabular-nums text-slate-900">${formatCurrency(point.revenue)}</p>
        </li>
      `;
    })
    .join("");
}

function linearForecast(values) {
  const n = values.length;
  const xMean = safeDivide((n - 1) * n, 2 * n);
  const yMean = safeDivide(values.reduce((acc, value) => acc + value, 0), n);

  let numerator = 0;
  let denominator = 0;

  values.forEach((value, index) => {
    numerator += (index - xMean) * (value - yMean);
    denominator += (index - xMean) * (index - xMean);
  });

  const slope = safeDivide(numerator, denominator);
  const nextValue = Math.max(0, values[n - 1] + slope);
  return {
    nextValue,
    slope
  };
}

function buildSuggestions(currentTotals, platformBreakdown, productBreakdown) {
  const weakestPlatform = [...platformBreakdown].sort((a, b) => a.conversionRate - b.conversionRate)[0];
  const bestProduct = [...productBreakdown].sort((a, b) => b.revenue - a.revenue)[0];

  const suggestions = [];

  if (currentTotals.ctr < 0.09) {
    suggestions.push("Aumentar CTR: probar 2 nuevas creatividades por plataforma y refrescar CTA.");
  }
  if (weakestPlatform) {
    suggestions.push(`Mejorar conversion en ${weakestPlatform.name}: activar retargeting con oferta de cierre.`);
  }
  if (bestProduct) {
    suggestions.push(`Escalar ${bestProduct.name}: priorizar presupuesto en los anuncios con mayor ROAS.`);
  }
  if (currentTotals.churnRate > 0.08) {
    suggestions.push("Reducir churn: activar secuencia de retencion durante los primeros 7 dias.");
  }

  return suggestions.slice(0, 3);
}

function renderForecast(currentTotals, platformBreakdown, productBreakdown) {
  const revenueSeries = [...state.periodOrder]
    .reverse()
    .map((periodId) => aggregateTotals(state.data.periods[periodId]).revenue);

  const forecast = linearForecast(revenueSeries);
  const delta = computeDelta(forecast.nextValue, currentTotals.revenue);

  elements.forecastRevenue.textContent = formatCurrency(forecast.nextValue);
  elements.forecastDelta.textContent = `${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(1)}% vs periodo actual`;

  const suggestions = buildSuggestions(currentTotals, platformBreakdown, productBreakdown);
  elements.forecastSuggestions.innerHTML = suggestions
    .map(
      (item) => `
      <li class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
        ${item}
      </li>
    `
    )
    .join("");
}

function renderAlerts(currentTotals, previousTotals, platformBreakdown) {
  const alerts = [];
  const conversionDelta = computeDelta(currentTotals.conversionRate, previousTotals.conversionRate);

  if (conversionDelta < -0.15) {
    alerts.push(`Caida fuerte de conversion: ${formatPercent(conversionDelta)} respecto al periodo comparado.`);
  }
  if (currentTotals.roi < 0.2) {
    alerts.push(`ROI global bajo (${formatPercent(currentTotals.roi)}). Revisar coste por canal.`);
  }

  const worstPlatform = [...platformBreakdown].sort((a, b) => a.roi - b.roi)[0];
  if (worstPlatform && worstPlatform.roi < 0.1) {
    alerts.push(`${worstPlatform.name} con retorno critico (${formatPercent(worstPlatform.roi)}).`);
  }
  if (currentTotals.churnRate > 0.08) {
    alerts.push(`Churn elevado (${formatPercent(currentTotals.churnRate)}). Reforzar retencion.`);
  }
  if (!alerts.length) {
    alerts.push("Sin alertas criticas. El rendimiento se mantiene estable.");
  }

  elements.alertsList.innerHTML = alerts
    .map(
      (message) => `
      <li class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        ${message}
      </li>
    `
    )
    .join("");
}

function renderTopList(productBreakdown, platformBreakdown, campaigns) {
  const topProduct = [...productBreakdown].sort((a, b) => b.revenue - a.revenue)[0];
  const topPlatform = [...platformBreakdown].sort((a, b) => b.roi - a.roi)[0];
  const topCampaign = [...campaigns].sort((a, b) => b.roi - a.roi)[0];
  const opportunity = [...platformBreakdown].sort((a, b) => a.conversionRate - b.conversionRate)[0];

  const items = [
    topProduct ? `Top producto: ${topProduct.name} (${formatCurrency(topProduct.revenue)}).` : "Top producto: sin datos.",
    topPlatform ? `Top plataforma: ${topPlatform.name} (ROI ${formatPercent(topPlatform.roi)}).` : "Top plataforma: sin datos.",
    topCampaign ? `Top campana: ${topCampaign.name} (ROI ${formatPercent(topCampaign.roi)}).` : "Top campana: sin datos.",
    opportunity ? `Oportunidad: subir conversion en ${opportunity.name} (actual ${formatPercent(opportunity.conversionRate)}).` : "Oportunidad: sin datos."
  ];

  elements.topList.innerHTML = items
    .map(
      (item) => `
      <li class="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-slate-700">
        ${item}
      </li>
    `
    )
    .join("");
}

function renderTable(container, columns, rows) {
  const header = columns
    .map((column) => `<th scope="col" class="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-700">${column.label}</th>`)
    .join("");

  const body = rows
    .map((row) => {
      const cells = columns
        .map((column) => `<td class="whitespace-nowrap px-3 py-2 text-sm text-slate-700">${column.render(row)}</td>`)
        .join("");
      return `<tr class="border-t border-slate-200">${cells}</tr>`;
    })
    .join("");

  container.innerHTML = `
    <table class="min-w-full border-collapse">
      <thead class="bg-slate-50">
        <tr>${header}</tr>
      </thead>
      <tbody>
        ${body || `<tr><td colspan="${columns.length}" class="px-3 py-4 text-sm text-slate-700">Sin datos para estos filtros.</td></tr>`}
      </tbody>
    </table>
  `;
}

function renderOperationalTables(productBreakdown, platformBreakdown, campaigns) {
  const maxProductRevenue = Math.max(...productBreakdown.map((row) => row.revenue), 1);
  const maxPlatformConversions = Math.max(...platformBreakdown.map((row) => row.conversions), 1);
  const maxPlatformEngagement = Math.max(...platformBreakdown.map((row) => row.engagementRate), 1);
  const maxCampaignRevenue = Math.max(...campaigns.map((row) => row.revenue), 1);

  renderTable(
    elements.productsTable,
    [
      { label: "Producto", render: (row) => row.name },
      { label: "Precio", render: (row) => formatCurrency(row.price) },
      { label: "Comisiones", render: (row) => formatCurrency(row.commissions) },
      { label: "Conversiones", render: (row) => formatNumber(row.conversions) },
      { label: "Pulso", render: (row) => renderMiniBar(row.revenue, maxProductRevenue, "bg-emerald-500") },
      { label: "ROI", render: (row) => formatPercent(row.roi) }
    ],
    productBreakdown
  );

  renderTable(
    elements.platformsTable,
    [
      { label: "Plataforma", render: (row) => row.name },
      { label: "Alcance", render: (row) => formatNumber(row.reach) },
      { label: "Engagement", render: (row) => formatPercent(row.engagementRate) },
      { label: "Conversiones", render: (row) => formatNumber(row.conversions) },
      {
        label: "Mix visual",
        render: (row) => renderDualBar(row.conversions, maxPlatformConversions, row.engagementRate, maxPlatformEngagement)
      },
      { label: "Mejor metrica", render: (row) => (row.roi > 0.4 ? "ROI" : "Engagement") }
    ],
    platformBreakdown
  );

  renderTable(
    elements.campaignsTable,
    [
      { label: "Campana", render: (row) => row.name },
      { label: "Fechas", render: (row) => `${row.startDate} a ${row.endDate}` },
      {
        label: "Canal / Producto",
        render: (row) => `${state.data.platforms.find((platform) => platform.id === row.platform).name} / Producto ${row.product}`
      },
      { label: "Conversiones", render: (row) => formatNumber(row.conversions) },
      { label: "Impacto", render: (row) => renderMiniBar(row.revenue, maxCampaignRevenue, "bg-blue-500") },
      { label: "Rendimiento", render: (row) => `ROI ${formatPercent(row.roi)} | Conv ${formatPercent(row.conversionRate)}` }
    ],
    campaigns
  );
}

function syncSidebarState() {
  const collapsed = state.sidebarCollapsed;

  elements.sidebarPanel.classList.toggle("hidden", collapsed);
  elements.layoutGrid.classList.toggle("lg:grid-cols-[40px_1fr]", collapsed);
  elements.layoutGrid.classList.toggle("lg:grid-cols-[40px_272px_1fr]", !collapsed);

  if (elements.burgerLineTop && elements.burgerLineMid && elements.burgerLineBottom) {
    if (collapsed) {
      elements.burgerLineTop.style.transform = "translateY(0) rotate(0deg)";
      elements.burgerLineMid.style.opacity = "1";
      elements.burgerLineBottom.style.transform = "translateY(0) rotate(0deg)";
    } else {
      elements.burgerLineTop.style.transform = "translateY(6px) rotate(45deg)";
      elements.burgerLineMid.style.opacity = "0";
      elements.burgerLineBottom.style.transform = "translateY(-6px) rotate(-45deg)";
    }
  }

  elements.sidebarToggleIcon.setAttribute("aria-label", collapsed ? "Mostrar sidebar" : "Ocultar sidebar");
  elements.sidebarToggleIcon.setAttribute("aria-expanded", String(!collapsed));
}

function updateFilters() {
  elements.periodFilter.innerHTML = state.periodOrder
    .map((periodId) => `<option value="${periodId}">${state.periodLabels[periodId]}</option>`)
    .join("");
  elements.periodFilter.value = state.selectedPeriod;

  elements.platformFilter.innerHTML =
    '<option value="all">Todas</option>' + state.data.platforms.map((platform) => `<option value="${platform.id}">${platform.name}</option>`).join("");
  elements.platformFilter.value = state.selectedPlatform;

  elements.productFilter.innerHTML =
    '<option value="all">Todos</option>' + state.data.products.map((product) => `<option value="${product.id}">${product.name}</option>`).join("");
  elements.productFilter.value = state.selectedProduct;
}

function renderDashboard() {
  const currentPeriod = getCurrentPeriodData();
  const currentTotals = aggregateTotals(currentPeriod);
  const previousTotals = aggregateTotals(getPreviousPeriodData());
  const productBreakdown = getProductBreakdown(currentPeriod);
  const platformBreakdown = getPlatformBreakdown(currentPeriod);
  const campaigns = getCampaignRows(currentPeriod);

  renderKpiCards(getKpis(currentTotals, previousTotals));
  renderRevenueTrend();
  renderForecast(currentTotals, platformBreakdown, productBreakdown);
  renderFunnel(currentTotals);
  renderDriverCards(platformBreakdown, productBreakdown, currentTotals);
  renderQualityActivityCards(currentTotals, platformBreakdown);
  renderEngagementBars(platformBreakdown);
  renderAlerts(currentTotals, previousTotals, platformBreakdown);
  renderTopList(productBreakdown, platformBreakdown, campaigns);
  renderOperationalTables(productBreakdown, platformBreakdown, campaigns);
}

function bindEvents() {
  elements.sidebarToggleIcon.addEventListener("click", () => {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    syncSidebarState();
  });

  elements.periodFilter.addEventListener("change", (event) => {
    state.selectedPeriod = event.target.value;
    renderDashboard();
  });

  elements.platformFilter.addEventListener("change", (event) => {
    state.selectedPlatform = event.target.value;
    renderDashboard();
  });

  elements.productFilter.addEventListener("change", (event) => {
    state.selectedProduct = event.target.value;
    renderDashboard();
  });
}

async function bootstrap() {
  const response = await fetch("./src/data/dashboardData.json");
  const sourceData = await response.json();
  state.data = buildTwelveMonthPeriods(sourceData);
  state.periodOrder = state.data.periodOrder;
  state.periodLabels = state.data.periodLabels;
  state.selectedPeriod = state.periodOrder[0];

  updateFilters();
  bindEvents();
  syncSidebarState();
  renderDashboard();
}

bootstrap();
