/*
 * Bağımlılıksız zaman serisi grafiği: eksenler, iki y ekseni, referans çizgileri,
 * datasheet referans noktaları ve fareyle değer okuma.
 *
 *   const ch = new LineChart(canvas, {
 *     xLabel: 'dk', left: {min, max, label}, right: {min, max, label},
 *     series: [{key, color, axis:'left'|'right', label, width, dash}],
 *     refLines: [{axis, value, color, label}],
 *   });
 *   ch.draw(rows, {xKey:'t', xScale: 1/60, overlays: [{points:[[x,y]], axis, color, label}]});
 */
(function (root) {
  'use strict';

  function niceStep(range, target) {
    const raw = range / Math.max(1, target);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
  }
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  class LineChart {
    constructor(canvas, opts) {
      this.c = canvas;
      this.o = opts;
      this.hoverX = null;
      this.last = null;
      canvas.addEventListener('pointermove', e => {
        const r = canvas.getBoundingClientRect();
        this.hoverX = e.clientX - r.left;
        if (this.last) this.draw(this.last.rows, this.last.opt);
      });
      canvas.addEventListener('pointerleave', () => {
        this.hoverX = null;
        if (this.last) this.draw(this.last.rows, this.last.opt);
      });
    }

    size() {
      // Boyut kapsayıcıdan okunur; canvas'ın kendi tampon boyutu yerleşime geri beslenmez.
      const dpr = window.devicePixelRatio || 1;
      const box = this.c.parentElement.getBoundingClientRect();
      const cs = getComputedStyle(this.c);
      const w = Math.floor(cs.position === 'absolute' ? this.c.clientWidth : box.width);
      const h = Math.floor(cs.position === 'absolute' ? this.c.clientHeight : box.height);
      if (this.c.width !== Math.round(w * dpr) || this.c.height !== Math.round(h * dpr)) {
        this.c.width = Math.round(w * dpr);
        this.c.height = Math.round(h * dpr);
      }
      const ctx = this.c.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { ctx, w, h };
    }

    draw(rows, opt = {}) {
      this.last = { rows, opt };
      const { ctx, w, h } = this.size();
      if (!w || !h) return;
      const o = this.o;
      const grid = css('--chart-grid') || '#1d2a36';
      const axis = css('--chart-axis') || '#5d6f80';
      const text = css('--muted') || '#91a2b3';
      // pad: aynı x eksenini paylaşan paneller hizalı kalsın diye sabit kenar boşlukları
      const M = { l: (o.pad && o.pad.l) || 42, r: (o.pad && o.pad.r) != null ? o.pad.r : (o.right ? 42 : 14), t: 18, b: o.hideX ? 14 : 26 };
      const pw = w - M.l - M.r, ph = h - M.t - M.b;
      ctx.clearRect(0, 0, w, h);
      ctx.font = `11px ${css('--font-data') || 'ui-monospace, monospace'}`;

      const xKey = opt.xKey || 't', xs = opt.xScale || 1;
      let x0 = opt.xMin ?? 0;
      let x1 = opt.xMax ?? Math.max(x0 + (o.minSpan || 10), rows.length ? rows[rows.length - 1][xKey] * xs : 0,
        ...o.series.filter(s => s.rows && s.rows.length).map(s => s.rows[s.rows.length - 1][xKey] * xs));
      (opt.overlays || []).forEach(ov => ov.points.forEach(p => { if (opt.xMax == null) x1 = Math.max(x1, p[0]); }));
      const X = v => M.l + (v - x0) / (x1 - x0 || 1) * pw;
      const Y = (v, ax) => { const a = o[ax || 'left']; return M.t + ph - (v - a.min) / (a.max - a.min) * ph; };

      // Izgara + eksen etiketleri
      ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.fillStyle = text;
      const xStep = niceStep(x1 - x0, Math.max(3, pw / 90));
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let v = Math.ceil(x0 / xStep) * xStep; v <= x1 + 1e-9; v += xStep) {
        const x = X(v);
        ctx.beginPath(); ctx.moveTo(x, M.t); ctx.lineTo(x, M.t + ph); ctx.stroke();
        if (!o.hideX) ctx.fillText(+v.toFixed(2) + '', x, M.t + ph + 6);
      }
      if (!o.hideX) { ctx.textAlign = 'right'; ctx.fillText(o.xLabel || '', w - M.r, M.t + ph + 16); }
      const yAxis = (ax, side) => {
        const a = o[ax]; if (!a) return;
        const st = a.step || niceStep(a.max - a.min, Math.max(3, ph / 45));
        ctx.textAlign = side === 'l' ? 'right' : 'left'; ctx.textBaseline = 'middle';
        for (let v = Math.ceil(a.min / st) * st; v <= a.max + 1e-9; v += st) {
          const y = Y(v, ax);
          if (side === 'l') { ctx.strokeStyle = grid; ctx.beginPath(); ctx.moveTo(M.l, y); ctx.lineTo(M.l + pw, y); ctx.stroke(); }
          ctx.fillStyle = a.color || text;
          ctx.fillText(+v.toFixed(3) + '', side === 'l' ? M.l - 6 : M.l + pw + 6, y);
        }
        // Eksen birimi: eksenin tepesinde, yatay
        ctx.fillStyle = a.color || text; ctx.textBaseline = 'alphabetic';
        ctx.textAlign = side === 'l' ? 'right' : 'left';
        ctx.fillText(a.label || '', side === 'l' ? M.l - 6 : M.l + pw + 6, M.t - 8);
      };
      yAxis('left', 'l'); yAxis('right', 'r');
      ctx.strokeStyle = axis; ctx.strokeRect(M.l + .5, M.t + .5, pw, ph);

      ctx.save(); ctx.beginPath(); ctx.rect(M.l, M.t, pw, ph); ctx.clip();
      // Referans çizgileri
      (o.refLines || []).forEach(r => {
        const y = Y(r.value, r.axis);
        ctx.strokeStyle = r.color; ctx.setLineDash([5, 5]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(M.l, y); ctx.lineTo(M.l + pw, y); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = r.color; ctx.textAlign = r.right ? 'right' : 'left'; ctx.textBaseline = r.below ? 'top' : 'bottom';
        ctx.fillText(r.label, r.right ? M.l + pw - 6 : M.l + 6, r.below ? y + 2 : y - 2);
      });
      // Datasheet üst üste bindirmeleri
      (opt.overlays || []).forEach(ov => {
        ctx.fillStyle = ov.color; ctx.strokeStyle = ov.color;
        ov.points.forEach(p => {
          ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1], ov.axis), 3, 0, Math.PI * 2);
          ov.hollow ? ctx.stroke() : ctx.fill();
        });
      });
      // Seriler
      o.series.forEach(s => {
        if (s.hidden) return;
        ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 2; ctx.setLineDash(s.dash || []);
        ctx.beginPath();
        let started = false;
        for (const r of (s.rows || rows)) {
          const v = typeof s.key === 'function' ? s.key(r) : r[s.key];
          if (v == null || !isFinite(v)) { started = false; continue; }
          const x = X(r[xKey] * xs), y = Y(v, s.axis);
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke(); ctx.setLineDash([]);
      });
      ctx.restore();

      // Fare ile okuma
      if (this.hoverX != null && rows.length && this.hoverX >= M.l && this.hoverX <= M.l + pw) {
        const xv = x0 + (this.hoverX - M.l) / pw * (x1 - x0);
        let best = rows[0];
        for (const r of rows) if (Math.abs(r[xKey] * xs - xv) < Math.abs(best[xKey] * xs - xv)) best = r;
        const x = X(best[xKey] * xs);
        ctx.strokeStyle = axis; ctx.beginPath(); ctx.moveTo(x, M.t); ctx.lineTo(x, M.t + ph); ctx.stroke();
        const lines = [`${(best[xKey] * xs).toFixed(1)} ${o.xLabel || ''}`].concat(o.series.filter(s => !s.hidden).map(s => {
          const v = typeof s.key === 'function' ? s.key(best) : best[s.key];
          return { t: `${s.label}: ${v == null ? '—' : v.toFixed(s.digits ?? 3)}`, c: s.color };
        }));
        const bw = 150, bh = 16 * lines.length + 8;
        const bx = x + 10 + bw > M.l + pw ? x - bw - 10 : x + 10;
        ctx.fillStyle = css('--tooltip-bg') || 'rgba(8,12,17,.92)'; ctx.strokeStyle = axis;
        ctx.fillRect(bx, M.t + 6, bw, bh); ctx.strokeRect(bx + .5, M.t + 6.5, bw, bh);
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        lines.forEach((l, k) => { ctx.fillStyle = typeof l === 'string' ? css('--text') : l.c; ctx.fillText(typeof l === 'string' ? l : l.t, bx + 8, M.t + 11 + k * 16); });
      }
    }
  }

  root.LineChart = LineChart;
})(typeof self !== 'undefined' ? self : this);
