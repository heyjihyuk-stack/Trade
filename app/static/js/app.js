/**
 * Trading Desk Console - Bloomberg-style Terminal
 * Main Application JavaScript
 */

// ============================================================
// STATE
// ============================================================
const state = {
    selectedSymbol: 'AAPL',
    watchlist: ['AAPL','MSFT','GOOGL','AMZN','NVDA','META','TSLA','JPM','V','WMT'],
    quotes: {},
    chart: null,
    candleSeries: null,
    volumeSeries: null,
    ws: null,
    terminalHistory: [],
    chartPeriod: '6mo',
    chartInterval: '1d',
};

// ============================================================
// CLOCK
// ============================================================
function updateClock() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    document.getElementById('clock').textContent = `${h}:${m}:${s} ${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
}
setInterval(updateClock, 1000);
updateClock();

// ============================================================
// API HELPERS
// ============================================================
async function api(path, opts = {}) {
    const res = await fetch(path, {
        headers: { 'Content-Type': 'application/json' },
        ...opts,
    });
    return res.json();
}

// ============================================================
// MARKET DATA / WATCHLIST
// ============================================================
async function refreshQuotes() {
    const data = await api(`/api/market/quotes?symbols=${state.watchlist.join(',')}`);
    if (Array.isArray(data)) {
        data.forEach(q => { state.quotes[q.symbol] = q; });
        renderWatchlist(data);
    }
}

function renderWatchlist(quotes) {
    const tbody = document.getElementById('watchlist-body');
    if (!quotes.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-dim)">No data</td></tr>';
        return;
    }

    tbody.innerHTML = quotes.map(q => {
        const cls = q.change >= 0 ? 'positive' : 'negative';
        const selected = q.symbol === state.selectedSymbol ? 'selected' : '';
        const arrow = q.change >= 0 ? '▲' : '▼';
        return `<tr class="${selected}" onclick="selectSymbol('${q.symbol}')">
            <td class="symbol">${q.symbol}</td>
            <td class="price">${q.price.toFixed(2)}</td>
            <td class="${cls}">${arrow} ${Math.abs(q.change).toFixed(2)}</td>
            <td class="${cls}">${q.change_pct >= 0 ? '+' : ''}${q.change_pct.toFixed(2)}%</td>
            <td style="color:var(--text-dim)">${formatVolume(q.volume)}</td>
            <td style="color:var(--text-dim)">${q.high.toFixed(2)}</td>
            <td style="color:var(--text-dim)">${q.low.toFixed(2)}</td>
        </tr>`;
    }).join('');
}

function formatVolume(v) {
    if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
    if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    return v.toString();
}

function selectSymbol(symbol) {
    state.selectedSymbol = symbol;
    document.getElementById('chart-symbol').textContent = symbol;
    document.getElementById('tech-symbol').textContent = symbol;
    refreshQuotes();
    loadChart(symbol);
    loadTechnicals();
}

function addSymbolPrompt() {
    const sym = prompt('Enter ticker symbol:');
    if (sym) {
        const s = sym.toUpperCase().trim();
        if (!state.watchlist.includes(s)) {
            state.watchlist.push(s);
            if (state.ws && state.ws.readyState === WebSocket.OPEN) {
                state.ws.send(JSON.stringify({ type: 'add_symbol', symbol: s }));
            }
            refreshQuotes();
            terminalLog('info', `Added ${s} to watchlist`);
        }
    }
}

// ============================================================
// CHART (Lightweight Charts)
// ============================================================
function initChart() {
    const container = document.getElementById('chart-container');
    state.chart = LightweightCharts.createChart(container, {
        width: container.clientWidth,
        height: container.clientHeight,
        layout: {
            background: { type: 'solid', color: '#0f1520' },
            textColor: '#94a3b8',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
        },
        grid: {
            vertLines: { color: 'rgba(42, 53, 72, 0.3)' },
            horzLines: { color: 'rgba(42, 53, 72, 0.3)' },
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
            vertLine: { color: '#f97316', width: 1, style: 2, labelBackgroundColor: '#f97316' },
            horzLine: { color: '#f97316', width: 1, style: 2, labelBackgroundColor: '#f97316' },
        },
        rightPriceScale: {
            borderColor: '#2a3548',
            scaleMargins: { top: 0.1, bottom: 0.2 },
        },
        timeScale: {
            borderColor: '#2a3548',
            timeVisible: true,
        },
    });

    state.candleSeries = state.chart.addCandlestickSeries({
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderUpColor: '#22c55e',
        borderDownColor: '#ef4444',
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444',
    });

    state.volumeSeries = state.chart.addHistogramSeries({
        color: '#3b82f6',
        priceFormat: { type: 'volume' },
        priceScaleId: '',
    });

    state.chart.priceScale('').applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
    });

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
        state.chart.applyOptions({
            width: container.clientWidth,
            height: container.clientHeight,
        });
    });
    resizeObserver.observe(container);
}

async function loadChart(symbol) {
    symbol = symbol || state.selectedSymbol;
    const data = await api(`/api/market/chart/${symbol}?period=${state.chartPeriod}&interval=${state.chartInterval}`);
    if (Array.isArray(data) && data.length) {
        state.candleSeries.setData(data.map(d => ({
            time: d.time,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
        })));
        state.volumeSeries.setData(data.map(d => ({
            time: d.time,
            value: d.volume,
            color: d.close >= d.open ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)',
        })));
        state.chart.timeScale().fitContent();
    }
}

function changeChartPeriod(period, interval, btn) {
    state.chartPeriod = period;
    state.chartInterval = interval;
    document.querySelectorAll('#panel-chart .controls button').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    loadChart();
}

// ============================================================
// TECHNICAL INDICATORS
// ============================================================
async function loadTechnicals() {
    const symbol = state.selectedSymbol;
    document.getElementById('tech-placeholder').style.display = 'none';
    document.getElementById('tech-content').style.display = 'block';
    document.getElementById('tech-content').innerHTML = '<div style="padding:20px;text-align:center"><div class="spinner"></div> Loading...</div>';

    const data = await api(`/api/market/technicals/${symbol}`);

    if (!data || data.error || !data.price) {
        document.getElementById('tech-content').innerHTML = '<div style="padding:20px;color:var(--red)">Failed to load technicals</div>';
        return;
    }

    const rsiClass = data.rsi < 30 ? 'bullish' : data.rsi > 70 ? 'bearish' : 'neutral';
    const macdClass = data.macd_histogram > 0 ? 'bullish' : 'bearish';

    document.getElementById('tech-content').innerHTML = `
        <div style="padding:8px;font-size:12px">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <!-- Price & MAs -->
                <div class="analysis-section">
                    <div class="section-title">Moving Averages</div>
                    <div class="section-body">
                        <div style="display:flex;justify-content:space-between;padding:2px 0">
                            <span>SMA(20)</span>
                            <span class="${data.above_sma_20 ? 'positive' : 'negative'}">${data.sma_20}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:2px 0">
                            <span>SMA(50)</span>
                            <span class="${data.above_sma_50 ? 'positive' : 'negative'}">${data.sma_50}</span>
                        </div>
                        ${data.sma_200 ? `<div style="display:flex;justify-content:space-between;padding:2px 0">
                            <span>SMA(200)</span>
                            <span class="${data.above_sma_200 ? 'positive' : 'negative'}">${data.sma_200}</span>
                        </div>` : ''}
                        <div style="margin-top:6px;font-size:10px;color:var(--text-dim)">
                            ${data.above_sma_20 ? '<span class="tech-tag bullish">Above SMA20</span>' : '<span class="tech-tag bearish">Below SMA20</span>'}
                            ${data.above_sma_50 ? '<span class="tech-tag bullish">Above SMA50</span>' : '<span class="tech-tag bearish">Below SMA50</span>'}
                        </div>
                    </div>
                </div>

                <!-- RSI -->
                <div class="analysis-section">
                    <div class="section-title">RSI (14)</div>
                    <div class="section-body">
                        <div style="font-size:24px;font-weight:700" class="${rsiClass === 'bullish' ? 'positive' : rsiClass === 'bearish' ? 'negative' : ''}">${data.rsi}</div>
                        <div class="confidence-bar">
                            <span style="font-size:10px">0</span>
                            <div class="bar-track">
                                <div class="bar-fill" style="width:${data.rsi}%;background:${data.rsi < 30 ? 'var(--green)' : data.rsi > 70 ? 'var(--red)' : 'var(--yellow)'}"></div>
                            </div>
                            <span style="font-size:10px">100</span>
                        </div>
                        <span class="tech-tag ${rsiClass}">${data.rsi < 30 ? 'OVERSOLD' : data.rsi > 70 ? 'OVERBOUGHT' : 'NEUTRAL'}</span>
                    </div>
                </div>

                <!-- MACD -->
                <div class="analysis-section">
                    <div class="section-title">MACD</div>
                    <div class="section-body">
                        <div style="display:flex;justify-content:space-between;padding:2px 0">
                            <span>MACD Line</span>
                            <span>${data.macd}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:2px 0">
                            <span>Signal</span>
                            <span>${data.macd_signal}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:2px 0">
                            <span>Histogram</span>
                            <span class="${macdClass === 'bullish' ? 'positive' : 'negative'}">${data.macd_histogram}</span>
                        </div>
                        <span class="tech-tag ${macdClass}">${data.macd_histogram > 0 ? 'BULLISH MOMENTUM' : 'BEARISH MOMENTUM'}</span>
                    </div>
                </div>

                <!-- Bollinger Bands -->
                <div class="analysis-section">
                    <div class="section-title">Bollinger Bands</div>
                    <div class="section-body">
                        <div style="display:flex;justify-content:space-between;padding:2px 0">
                            <span>Upper</span>
                            <span style="color:var(--red)">${data.bb_upper}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:2px 0">
                            <span>Middle</span>
                            <span>${data.bb_middle}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:2px 0">
                            <span>Lower</span>
                            <span style="color:var(--green)">${data.bb_lower}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:2px 0;margin-top:4px">
                            <span>Price</span>
                            <span style="font-weight:700">${data.price}</span>
                        </div>
                        <div style="font-size:10px;margin-top:4px;color:var(--text-dim)">
                            ${data.price > data.bb_upper ? '<span class="tech-tag bearish">ABOVE UPPER BB</span>' :
                              data.price < data.bb_lower ? '<span class="tech-tag bullish">BELOW LOWER BB</span>' :
                              '<span class="tech-tag neutral">WITHIN BANDS</span>'}
                        </div>
                    </div>
                </div>
            </div>

            <div class="analysis-section" style="margin-top:8px">
                <div class="section-title">Volume</div>
                <div class="section-body">
                    <span>20-Day Avg: ${formatVolume(data.volume_avg_20d)}</span>
                </div>
            </div>
        </div>
    `;
}

// ============================================================
// AI ANALYSIS
// ============================================================
async function runAnalysis(symbol) {
    symbol = symbol || state.selectedSymbol;
    const placeholder = document.getElementById('analysis-placeholder');
    const content = document.getElementById('analysis-content');

    placeholder.style.display = 'none';
    content.style.display = 'block';
    content.innerHTML = `<div style="text-align:center;padding:40px"><div class="spinner"></div><br><br>Running AI analysis on ${symbol}...<br><span style="color:var(--text-dim);font-size:11px">Analyzing fundamentals, technicals, sentiment & risk</span></div>`;
    terminalLog('info', `Running AI analysis on ${symbol}...`);

    const data = await api('/api/analysis/run', {
        method: 'POST',
        body: JSON.stringify({ symbol, analysis_date: null }),
    });

    if (data.error) {
        content.innerHTML = `<div style="color:var(--red);padding:20px">${data.error}</div>`;
        return;
    }

    const decisionClass = data.decision.includes('BUY') ? 'buy' :
                          data.decision.includes('SELL') ? 'sell' : 'hold';

    const confidencePct = (data.confidence || 0.5) * 100;
    const confColor = confidencePct > 70 ? 'var(--green)' : confidencePct > 50 ? 'var(--yellow)' : 'var(--red)';

    content.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
            <span class="decision-badge ${decisionClass}">${data.decision}</span>
            <div style="flex:1">
                <div style="font-size:10px;color:var(--text-dim);text-transform:uppercase">Confidence</div>
                <div class="confidence-bar">
                    <div class="bar-track">
                        <div class="bar-fill" style="width:${confidencePct}%;background:${confColor}"></div>
                    </div>
                    <span style="font-size:12px;font-weight:700">${confidencePct.toFixed(0)}%</span>
                </div>
            </div>
        </div>

        <div class="analysis-section">
            <div class="section-title">Fundamental Analysis</div>
            <div class="section-body">${escapeHtml(data.fundamental_summary || 'N/A')}</div>
        </div>

        <div class="analysis-section">
            <div class="section-title">Technical Analysis</div>
            <div class="section-body">${escapeHtml(data.technical_summary || 'N/A')}</div>
        </div>

        <div class="analysis-section">
            <div class="section-title">Sentiment</div>
            <div class="section-body">${escapeHtml(data.sentiment_summary || 'N/A')}</div>
        </div>

        <div class="analysis-section">
            <div class="section-title">Risk Assessment</div>
            <div class="section-body">${escapeHtml(data.risk_assessment || 'N/A')}</div>
        </div>

        <div style="font-size:10px;color:var(--text-dim);margin-top:8px">
            Analysis timestamp: ${data.timestamp}
        </div>
    `;

    terminalLog('success', `Analysis complete for ${symbol}: ${data.decision} (${confidencePct.toFixed(0)}% confidence)`);
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

// ============================================================
// PORTFOLIO
// ============================================================
async function loadPortfolio() {
    const data = await api('/api/portfolio/summary');
    const container = document.getElementById('tab-portfolio');

    const pnlClass = data.total_unrealized_pnl >= 0 ? 'positive' : 'negative';

    let html = `
        <div class="portfolio-summary">
            <div class="portfolio-stat">
                <span class="label">Total Value</span>
                <span class="value">$${formatNumber(data.total_value)}</span>
            </div>
            <div class="portfolio-stat">
                <span class="label">Cash</span>
                <span class="value">$${formatNumber(data.cash)}</span>
            </div>
            <div class="portfolio-stat">
                <span class="label">Positions Value</span>
                <span class="value">$${formatNumber(data.positions_value)}</span>
            </div>
            <div class="portfolio-stat">
                <span class="label">Unrealized P&L</span>
                <span class="value ${pnlClass}">${data.total_unrealized_pnl >= 0 ? '+' : ''}$${formatNumber(data.total_unrealized_pnl)} (${data.total_unrealized_pnl_pct >= 0 ? '+' : ''}${data.total_unrealized_pnl_pct}%)</span>
            </div>
            <div class="portfolio-stat">
                <span class="label">Positions</span>
                <span class="value">${data.num_positions}</span>
            </div>
        </div>
    `;

    if (data.positions && data.positions.length > 0) {
        html += `<table class="positions-table">
            <thead><tr>
                <th>Symbol</th><th>Shares</th><th>Avg Cost</th><th>Current</th><th>Mkt Value</th><th>P&L</th><th>P&L %</th>
            </tr></thead>
            <tbody>`;
        data.positions.forEach(p => {
            const pcls = p.unrealized_pnl >= 0 ? 'positive' : 'negative';
            html += `<tr>
                <td class="symbol" style="cursor:pointer" onclick="selectSymbol('${p.symbol}')">${p.symbol}</td>
                <td>${p.shares}</td>
                <td>$${p.avg_cost.toFixed(2)}</td>
                <td>$${p.current_price.toFixed(2)}</td>
                <td>$${formatNumber(p.market_value)}</td>
                <td class="${pcls}">${p.unrealized_pnl >= 0 ? '+' : ''}$${formatNumber(p.unrealized_pnl)}</td>
                <td class="${pcls}">${p.unrealized_pnl_pct >= 0 ? '+' : ''}${p.unrealized_pnl_pct.toFixed(2)}%</td>
            </tr>`;
        });
        html += '</tbody></table>';
    } else {
        html += '<div style="color:var(--text-dim);padding:8px">No open positions. Use NEW ORDER or BUY command to trade.</div>';
    }

    container.innerHTML = html;
}

async function loadTradeHistory() {
    const data = await api('/api/portfolio/history');
    const container = document.getElementById('tab-trades');

    if (!data.length) {
        container.innerHTML = '<div style="color:var(--text-dim);padding:8px">No trades yet.</div>';
        return;
    }

    container.innerHTML = data.map(t => {
        const cls = t.side === 'BUY' ? 'positive' : 'negative';
        const time = new Date(t.timestamp).toLocaleTimeString();
        return `<div class="trade-item">
            <span class="trade-side ${cls}">${t.side}</span>
            <span class="symbol">${t.symbol}</span>
            <span>${t.quantity} @ $${t.price.toFixed(2)}</span>
            <span style="color:var(--text-dim)">Total: $${formatNumber(t.total)}</span>
            <span class="trade-time">${time}</span>
        </div>`;
    }).join('');
}

function formatNumber(n) {
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ============================================================
// BOTTOM TAB SWITCHER
// ============================================================
function switchBottomTab(tabName, btn) {
    document.querySelectorAll('.bottom-bar .tab').forEach(t => t.classList.remove('active'));
    if (btn) btn.classList.add('active');

    ['portfolio', 'trades', 'terminal', 'order'].forEach(t => {
        const el = document.getElementById(`tab-${t}`);
        if (el) el.style.display = t === tabName ? 'block' : 'none';
    });

    if (tabName === 'portfolio') loadPortfolio();
    if (tabName === 'trades') loadTradeHistory();
    if (tabName === 'order') renderOrderForm();
}

// ============================================================
// ORDER ENTRY (inline in bottom bar)
// ============================================================
function renderOrderForm() {
    const container = document.getElementById('tab-order');
    container.innerHTML = `
        <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">
            <div class="form-group" style="margin:0;width:100px">
                <label>Symbol</label>
                <input type="text" id="inline-order-symbol" value="${state.selectedSymbol}" style="text-transform:uppercase;padding:4px 8px;font-size:12px">
            </div>
            <div class="form-group" style="margin:0;width:80px">
                <label>Side</label>
                <select id="inline-order-side" style="padding:4px 8px;font-size:12px">
                    <option value="BUY">BUY</option>
                    <option value="SELL">SELL</option>
                </select>
            </div>
            <div class="form-group" style="margin:0;width:100px">
                <label>Quantity</label>
                <input type="number" id="inline-order-qty" value="100" min="1" style="padding:4px 8px;font-size:12px">
            </div>
            <div class="form-group" style="margin:0;width:100px">
                <label>Type</label>
                <select id="inline-order-type" style="padding:4px 8px;font-size:12px" onchange="document.getElementById('inline-limit-group').style.display=this.value==='LIMIT'?'block':'none'">
                    <option value="MARKET">MARKET</option>
                    <option value="LIMIT">LIMIT</option>
                </select>
            </div>
            <div class="form-group" id="inline-limit-group" style="margin:0;width:100px;display:none">
                <label>Limit Price</label>
                <input type="number" id="inline-order-limit" step="0.01" style="padding:4px 8px;font-size:12px">
            </div>
            <button class="btn btn-buy" onclick="submitInlineOrder()" style="height:28px;font-size:11px">SUBMIT</button>
            <div id="inline-order-result" style="font-size:11px;margin-left:8px"></div>
        </div>
        <div style="margin-top:8px;font-size:10px;color:var(--text-dim)">
            Quick: type "BUY 100 AAPL" or "SELL 50 TSLA" in the command bar
        </div>
    `;
}

async function submitInlineOrder() {
    const symbol = document.getElementById('inline-order-symbol').value.toUpperCase();
    const side = document.getElementById('inline-order-side').value;
    const qty = parseInt(document.getElementById('inline-order-qty').value);
    const type = document.getElementById('inline-order-type').value;
    const limitPrice = parseFloat(document.getElementById('inline-order-limit')?.value) || null;

    if (!symbol || !qty || qty <= 0) {
        document.getElementById('inline-order-result').innerHTML = '<span class="error">Invalid order parameters</span>';
        return;
    }

    const order = { symbol, side, quantity: qty, order_type: type };
    if (type === 'LIMIT' && limitPrice) order.limit_price = limitPrice;

    const result = await api('/api/portfolio/trade', { method: 'POST', body: JSON.stringify(order) });
    const resultEl = document.getElementById('inline-order-result');

    if (result.success) {
        resultEl.innerHTML = `<span class="success">✓ ${side} ${qty} ${symbol} @ $${result.trade.price} | Cash: $${formatNumber(result.cash_remaining)}</span>`;
        terminalLog('success', `Order filled: ${side} ${qty} ${symbol} @ $${result.trade.price}`);
        loadPortfolio();
    } else {
        resultEl.innerHTML = `<span class="error">✗ ${result.error}</span>`;
        terminalLog('error', `Order rejected: ${result.error}`);
    }
}

// Modal-based order (for backward compat)
function openOrderModal(symbol, side) {
    document.getElementById('order-symbol').value = symbol || state.selectedSymbol;
    if (side) document.getElementById('order-side').value = side;
    document.getElementById('order-modal').style.display = 'flex';
}

function closeOrderModal() {
    document.getElementById('order-modal').style.display = 'none';
}

document.getElementById('order-type')?.addEventListener('change', function() {
    document.getElementById('limit-price-group').style.display = this.value === 'LIMIT' ? 'block' : 'none';
});

document.getElementById('order-side')?.addEventListener('change', function() {
    const btn = document.getElementById('order-submit-btn');
    btn.className = this.value === 'BUY' ? 'btn btn-buy' : 'btn btn-sell';
    btn.textContent = this.value === 'BUY' ? 'Submit Buy' : 'Submit Sell';
});

async function submitOrder() {
    const symbol = document.getElementById('order-symbol').value.toUpperCase();
    const side = document.getElementById('order-side').value;
    const qty = parseInt(document.getElementById('order-qty').value);
    const type = document.getElementById('order-type').value;
    const limitPrice = parseFloat(document.getElementById('order-limit-price').value) || null;

    if (!symbol || !qty) { alert('Please fill all fields'); return; }

    const order = { symbol, side, quantity: qty, order_type: type };
    if (type === 'LIMIT' && limitPrice) order.limit_price = limitPrice;

    const result = await api('/api/portfolio/trade', { method: 'POST', body: JSON.stringify(order) });
    if (result.success) {
        terminalLog('success', `Order filled: ${side} ${qty} ${symbol} @ $${result.trade.price}`);
        closeOrderModal();
        loadPortfolio();
    } else {
        terminalLog('error', `Order rejected: ${result.error}`);
        alert(result.error);
    }
}

// ============================================================
// COMMAND TERMINAL
// ============================================================
function terminalLog(type, msg) {
    state.terminalHistory.push({ type, msg, time: new Date().toLocaleTimeString() });
    renderTerminal();
}

function renderTerminal() {
    const container = document.getElementById('tab-terminal');
    container.innerHTML = '<div class="terminal-output">' +
        state.terminalHistory.map(h =>
            `<div><span style="color:var(--text-dim)">[${h.time}]</span> <span class="${h.type}">${h.msg}</span></div>`
        ).join('') +
        '</div>';
    container.scrollTop = container.scrollHeight;
}

// ============================================================
// COMMAND BAR
// ============================================================
document.getElementById('command-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        const cmd = this.value.trim();
        if (cmd) {
            processCommand(cmd);
            this.value = '';
        }
    }
});

function processCommand(input) {
    const parts = input.toUpperCase().split(/\s+/);
    const cmd = parts[0];

    terminalLog('cmd', `> ${input}`);

    switch (cmd) {
        case 'HELP':
            terminalLog('info', 'Available commands:');
            terminalLog('info', '  [SYMBOL]          - Select symbol (e.g., AAPL)');
            terminalLog('info', '  ANALYZE [SYMBOL]  - Run AI analysis');
            terminalLog('info', '  BUY [QTY] [SYM]  - Buy shares (e.g., BUY 100 AAPL)');
            terminalLog('info', '  SELL [QTY] [SYM]  - Sell shares');
            terminalLog('info', '  ADD [SYMBOL]      - Add to watchlist');
            terminalLog('info', '  REMOVE [SYMBOL]   - Remove from watchlist');
            terminalLog('info', '  PORTFOLIO         - Show portfolio');
            terminalLog('info', '  TRADES            - Show trade history');
            terminalLog('info', '  CHART [SYMBOL]    - Load chart');
            terminalLog('info', '  TECH [SYMBOL]     - Load technicals');
            terminalLog('info', '  CLEAR             - Clear terminal');
            break;

        case 'ANALYZE':
            runAnalysis(parts[1] || state.selectedSymbol);
            break;

        case 'BUY':
        case 'SELL': {
            const qty = parseInt(parts[1]);
            const sym = parts[2] || state.selectedSymbol;
            if (!qty || qty <= 0) {
                terminalLog('error', `Usage: ${cmd} [quantity] [symbol]`);
                break;
            }
            api('/api/portfolio/trade', {
                method: 'POST',
                body: JSON.stringify({ symbol: sym, side: cmd, quantity: qty, order_type: 'MARKET' }),
            }).then(r => {
                if (r.success) {
                    terminalLog('success', `${cmd} ${qty} ${sym} @ $${r.trade.price} | Cash: $${formatNumber(r.cash_remaining)}`);
                    loadPortfolio();
                } else {
                    terminalLog('error', r.error);
                }
            });
            break;
        }

        case 'ADD': {
            const sym = parts[1];
            if (sym && !state.watchlist.includes(sym)) {
                state.watchlist.push(sym);
                refreshQuotes();
                terminalLog('success', `Added ${sym} to watchlist`);
            }
            break;
        }

        case 'REMOVE': {
            const sym = parts[1];
            state.watchlist = state.watchlist.filter(s => s !== sym);
            refreshQuotes();
            terminalLog('success', `Removed ${sym} from watchlist`);
            break;
        }

        case 'PORTFOLIO':
            switchBottomTab('portfolio', document.querySelector('.tab'));
            break;

        case 'TRADES':
            switchBottomTab('trades');
            break;

        case 'CHART':
            if (parts[1]) selectSymbol(parts[1]);
            else loadChart();
            break;

        case 'TECH':
            if (parts[1]) { state.selectedSymbol = parts[1]; document.getElementById('tech-symbol').textContent = parts[1]; }
            loadTechnicals();
            break;

        case 'CLEAR':
            state.terminalHistory = [];
            renderTerminal();
            break;

        default:
            // Treat as symbol selection if it looks like a ticker
            if (/^[A-Z]{1,5}$/.test(cmd)) {
                selectSymbol(cmd);
                terminalLog('info', `Selected ${cmd}`);
            } else {
                terminalLog('error', `Unknown command: ${cmd}. Type HELP for commands.`);
            }
    }

    // Switch to terminal tab to show output
    if (cmd !== 'PORTFOLIO' && cmd !== 'TRADES') {
        switchBottomTab('terminal', document.querySelectorAll('.tab')[2]);
    }
}

// ============================================================
// WEBSOCKET
// ============================================================
function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}/ws/market`;

    state.ws = new WebSocket(wsUrl);

    state.ws.onopen = () => {
        terminalLog('success', 'Connected to market data stream');
        state.ws.send(JSON.stringify({ type: 'watchlist', symbols: state.watchlist }));
    };

    state.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'quotes' && Array.isArray(msg.data)) {
            msg.data.forEach(q => { state.quotes[q.symbol] = q; });
            renderWatchlist(msg.data);
            updateIndices(msg.data);
        }
    };

    state.ws.onclose = () => {
        terminalLog('warn', 'Market data stream disconnected. Reconnecting...');
        setTimeout(connectWebSocket, 3000);
    };

    state.ws.onerror = () => {
        // Will trigger onclose
    };
}

function updateIndices(quotes) {
    // Use major ETFs as index proxies if in watchlist
    const sp = quotes.find(q => q.symbol === 'SPY');
    const nas = quotes.find(q => q.symbol === 'QQQ');
    const dow = quotes.find(q => q.symbol === 'DIA');

    if (sp) {
        const el = document.getElementById('idx-sp500');
        el.textContent = `${sp.price.toFixed(2)} ${sp.change_pct >= 0 ? '▲' : '▼'}${Math.abs(sp.change_pct).toFixed(2)}%`;
        el.className = sp.change_pct >= 0 ? 'positive' : 'negative';
    }
    if (nas) {
        const el = document.getElementById('idx-nasdaq');
        el.textContent = `${nas.price.toFixed(2)} ${nas.change_pct >= 0 ? '▲' : '▼'}${Math.abs(nas.change_pct).toFixed(2)}%`;
        el.className = nas.change_pct >= 0 ? 'positive' : 'negative';
    }
    if (dow) {
        const el = document.getElementById('idx-dow');
        el.textContent = `${dow.price.toFixed(2)} ${dow.change_pct >= 0 ? '▲' : '▼'}${Math.abs(dow.change_pct).toFixed(2)}%`;
        el.className = dow.change_pct >= 0 ? 'positive' : 'negative';
    }
}

// ============================================================
// INIT
// ============================================================
async function init() {
    terminalLog('info', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    terminalLog('info', '  TRADING DESK CONSOLE v1.0');
    terminalLog('info', '  Bloomberg-style Terminal powered by TradingAgents AI');
    terminalLog('info', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    terminalLog('info', 'Type HELP for available commands');

    // Load initial data
    initChart();
    await refreshQuotes();
    await loadChart('AAPL');
    loadTechnicals();
    loadPortfolio();

    // Connect WebSocket for live updates
    connectWebSocket();

    // Focus command input
    document.getElementById('command-input').focus();
}

// Start
init();
