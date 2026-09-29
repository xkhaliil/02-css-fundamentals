/* ==========================================================================
   Kit — interactive components for the CSS lecture.
   Kit.init(root) upgrades every component inside `root` once.
   Pages call it on load; the deck calls it lazily per slide.
   ========================================================================== */
(function () {
  "use strict";

  const Kit = (window.Kit = {});
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const MO = "⟦", MC = "⟧"; // mark open / close inside code samples
  const inDeck = (el) => !!el.closest(".deck");

  function dedent(s) {
    s = String(s).replace(/^\s*\n/, "").replace(/\s+$/, "");
    const lines = s.split("\n");
    const ind = lines.filter((l) => l.trim()).map((l) => l.match(/^[ \t]*/)[0].length);
    const min = ind.length ? Math.min(...ind) : 0;
    return lines.map((l) => l.slice(min)).join("\n");
  }
  Kit.dedent = dedent;

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null) el.append(kid);
    return el;
  }

  /* ------------------------------------------------------------------------
     Syntax highlighting
     ------------------------------------------------------------------------ */
  function hlValue(v) {
    const re = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(!\s*important)|(#[0-9a-fA-F]{3,8}\b)|(--[\w-]+)|([\w-]+)(?=\()|(-?(?:\d*\.)?\d+(?:%|[a-zA-Z]+)?)|([⟦⟧])/g;
    let out = "", last = 0, m;
    while ((m = re.exec(v))) {
      out += esc(v.slice(last, m.index));
      const t = m[0];
      if (m[1]) out += `<span class="t-str">${esc(t)}</span>`;
      else if (m[2]) out += `<span class="t-imp">${esc(t)}</span>`;
      else if (m[3]) out += `<span class="t-hex">${t}</span>`;
      else if (m[4]) out += `<span class="t-var">${t}</span>`;
      else if (m[5]) out += `<span class="t-fn">${t}</span>`;
      else if (m[6]) out += `<span class="t-num">${t}</span>`;
      else out += t === MO ? "<mark>" : "</mark>";
      last = re.lastIndex;
    }
    out += esc(v.slice(last));
    // bare keywords (tomato, bold, solid…) get the value colour too
    return `<span class="t-val">${out}</span>`;
  }
  function wrapTrim(cls, s) {
    const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/);
    return m[2] ? `${esc(m[1])}<span class="${cls}">${esc(m[2])}</span>${esc(m[3])}` : esc(s);
  }
  function hlAt(chunk) {
    const m = chunk.match(/^([\s\S]*?)(@[\w-]+)([\s\S]*)$/);
    if (!m) return hlValue(chunk);
    return esc(m[1]) + `<span class="t-at">${m[2]}</span>` + hlValue(m[3]);
  }
  const NESTING_AT = /^\s*@(media|supports|layer|container|document|scope|starting-style)\b/;

  function hlCSS(src, startInDecls) {
    let out = "", i = 0;
    const n = src.length;
    const stack = startInDecls ? ["decls"] : [];
    let sub = "prop", prelude = "";
    const top = () => (stack.length ? stack[stack.length - 1] : "rules");
    const stopAt = (stops, from) => {
      let j = from;
      while (j < n && !stops.includes(src[j]) && !src.startsWith("/*", j)) {
        if (src[j] === '"' || src[j] === "'") {
          const q = src[j++];
          while (j < n && src[j] !== q && src[j] !== "\n") j++;
        }
        j++;
      }
      return Math.min(j, n);
    };
    while (i < n) {
      if (src.startsWith("/*", i)) {
        let j = src.indexOf("*/", i + 2);
        j = j < 0 ? n : j + 2;
        out += `<span class="t-c">${esc(src.slice(i, j))}</span>`;
        i = j;
        continue;
      }
      const ch = src[i];
      if (ch === MO || ch === MC) { out += ch === MO ? "<mark>" : "</mark>"; i++; continue; }
      if (top() === "rules") {
        const j = stopAt("{};" + MO + MC, i);
        const chunk = src.slice(i, j);
        if (chunk) {
          prelude += chunk;
          out += /^\s*@/.test(prelude) ? hlAt(chunk) : wrapTrim("t-sel", chunk);
        }
        i = j;
        if (i < n) {
          const c = src[i];
          if (c === "{") { stack.push(NESTING_AT.test(prelude) ? "rules" : "decls"); sub = "prop"; prelude = ""; out += '<span class="t-p">{</span>'; i++; }
          else if (c === "}") { stack.pop(); prelude = ""; out += '<span class="t-p">}</span>'; i++; }
          else if (c === ";") { prelude = ""; out += '<span class="t-p">;</span>'; i++; }
        }
        continue;
      }
      if (sub === "prop") {
        const j = stopAt(":;{}" + MO + MC, i);
        const chunk = src.slice(i, j);
        const c = src[j];
        if (c === "{") { out += wrapTrim("t-sel", chunk) + '<span class="t-p">{</span>'; stack.push("decls"); i = j + 1; continue; }
        out += wrapTrim("t-prop", chunk);
        i = j;
        if (c === ":") { out += '<span class="t-p">:</span>'; sub = "val"; i++; }
        else if (c === ";") { out += '<span class="t-p">;</span>'; i++; }
        else if (c === "}") { out += '<span class="t-p">}</span>'; stack.pop(); sub = "prop"; i++; }
        continue;
      }
      // value
      const j = stopAt(";}" + MO + MC, i);
      out += hlValue(src.slice(i, j));
      i = j;
      const c = src[i];
      if (c === ";") { out += '<span class="t-p">;</span>'; sub = "prop"; i++; }
      else if (c === "}") { out += '<span class="t-p">}</span>'; stack.pop(); sub = "prop"; i++; }
    }
    return out;
  }

  function hlTag(t) {
    const m = t.match(/^(<\/?)([\w-]+)([\s\S]*?)(\/?>)$/);
    if (!m) return esc(t);
    let a = "", last = 0, mm;
    const raw = m[3];
    const ar = /([^\s=]+)(?:(\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+))?/g;
    while ((mm = ar.exec(raw))) {
      a += esc(raw.slice(last, mm.index));
      a += `<span class="t-attr">${esc(mm[1])}</span>`;
      if (mm[2]) {
        const val = mm[3] || "";
        const isStyle = mm[1].toLowerCase() === "style" && /^["']/.test(val);
        a += `<span class="t-p">${esc(mm[2])}</span>` + (isStyle
          ? `<span class="t-aval">${val[0]}</span>${hlCSS(val.slice(1, -1), true)}<span class="t-aval">${val.slice(-1)}</span>`
          : `<span class="t-aval">${esc(val)}</span>`);
      }
      last = ar.lastIndex;
    }
    a += esc(raw.slice(last));
    return `<span class="t-p">${esc(m[1])}</span><span class="t-tag">${m[2]}</span>${a}<span class="t-p">${esc(m[4])}</span>`;
  }

  function hlHTML(src) {
    const re = /<!--[\s\S]*?-->|(<style\b[^>]*>)([\s\S]*?)(<\/style>)|<\/?[a-zA-Z][\w-]*(?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*\s*\/?>|[⟦⟧]/g;
    let out = "", last = 0, m;
    while ((m = re.exec(src))) {
      out += esc(src.slice(last, m.index));
      const t = m[0];
      if (t === MO) out += "<mark>";
      else if (t === MC) out += "</mark>";
      else if (t.startsWith("<!--")) out += `<span class="t-c">${esc(t)}</span>`;
      else if (m[1]) out += hlTag(m[1]) + hlCSS(m[2]) + hlTag(m[3]);
      else out += hlTag(t);
      last = re.lastIndex;
    }
    out += esc(src.slice(last));
    return out.replace(/⟦/g, "<mark>").replace(/⟧/g, "</mark>");
  }
  const hl = (lang, src) => (lang === "html" ? hlHTML(src) : lang === "css" ? hlCSS(src) : esc(src).replace(/⟦/g, "<mark>").replace(/⟧/g, "</mark>"));
  Kit.hl = hl;

  function upgradeCode(root) {
    root.querySelectorAll('script[type="text/x-code"]').forEach((s) => {
      const pre = h("pre", { class: "code " + (s.className || "") });
      pre.innerHTML = hl(s.dataset.lang || "css", dedent(s.textContent));
      if (s.getAttribute("style")) pre.setAttribute("style", s.getAttribute("style"));
      s.replaceWith(pre);
    });
    root.querySelectorAll("pre.code[data-lang]:not([data-ready])").forEach((pre) => {
      pre.dataset.ready = "";
      pre.innerHTML = hl(pre.dataset.lang, dedent(pre.textContent));
    });
  }

  /* ------------------------------------------------------------------------
     Live editor
     ------------------------------------------------------------------------ */
  const FONT_LINK = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;700&family=Space+Mono:wght@400;700&display=swap">';
  const KEY_FORWARD = "<script>addEventListener('keydown',function(e){if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if(['ArrowRight','ArrowLeft','PageUp','PageDown'].indexOf(e.key)>-1){parent.postMessage({deckKey:e.key},'*')}});document.addEventListener('click',function(e){var a=e.target.closest('a[href]');if(a&&!a.getAttribute('href').startsWith('#'))e.preventDefault()})<\/script>";
  const PREVIEW_BASE = "body{margin:20px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.4}";

  function LiveEditor(root) {
    const get = (r) => {
      const s = root.querySelector(`:scope > script[data-role="${r}"]`);
      return s ? dedent(s.textContent) : null;
    };
    const html = get("html") || "";
    const base = get("base") || "";
    const locked = get("locked");
    const checks = JSON.parse(get("checks") || "null");
    const raw = root.hasAttribute("data-raw"); // browser defaults only
    const ta0 = root.querySelector(":scope > textarea");
    const initial = dedent(ta0 ? ta0.value : "");
    const fileName = root.dataset.file || "style.css";
    const zoom = parseFloat(root.dataset.zoom || (inDeck(root) ? "1.45" : "1"));
    root.textContent = "";

    // editor pane
    const pre = h("pre", { "aria-hidden": "true" });
    const ta = h("textarea", { spellcheck: "false", autocapitalize: "off", autocomplete: "off", "aria-label": fileName + " editor" });
    ta.value = initial;
    const htmlView = h("pre", { class: "html-view", hidden: true });
    htmlView.innerHTML = hlHTML(html);
    const code = h("div", { class: "live-code" }, pre, ta, htmlView);
    const tabCss = h("button", { class: "live-tab", "aria-selected": "true", type: "button", text: fileName });
    const tabs = [tabCss];
    let tabHtml;
    if (root.hasAttribute("data-show-html")) {
      tabHtml = h("button", { class: "live-tab", "aria-selected": "false", type: "button", text: "index.html" });
      tabs.push(tabHtml);
      const pick = (showHtml) => {
        htmlView.hidden = !showHtml;
        tabCss.setAttribute("aria-selected", String(!showHtml));
        tabHtml.setAttribute("aria-selected", String(showHtml));
      };
      tabCss.onclick = () => pick(false);
      tabHtml.onclick = () => pick(true);
    }
    const reset = h("button", { class: "live-btn", type: "button", text: "↺ reset", title: "Back to the starting code" });
    const bar = h("div", { class: "live-bar" }, h("i", { class: "dot" }), h("i", { class: "dot" }), h("i", { class: "dot" }), tabs, h("span", { class: "spacer" }), reset);
    const pane = h("div", { class: "live-pane" }, bar);
    if (locked) {
      const lp = h("pre", { class: "code" });
      lp.innerHTML = hlCSS(locked);
      pane.append(h("div", { class: "live-locked" }, h("span", { class: "live-locked-label", text: "🔒 already in the stylesheet — read only" }), lp));
    }
    pane.append(code);

    // preview pane
    const frame = h("iframe", { title: "Preview", loading: "eager" });
    const previewPane = h("div", { class: "live-preview" }, frame, h("span", { class: "live-preview-label", text: root.dataset.label || "preview" }));
    root.append(pane, previewPane);

    let checkList;
    if (checks) {
      checkList = h("ul", { class: "live-checks", "aria-live": "polite" });
      root.append(checkList);
    }

    const doc = `<!doctype html><html lang="en"><head><meta charset="utf-8">${raw ? "" : FONT_LINK}<style>${raw ? "" : PREVIEW_BASE}</style><style>${base}</style><style>${locked || ""}</style><style id="__user"></style>${KEY_FORWARD}</head><body>${html}</body></html>`;

    const paint = () => {
      pre.innerHTML = hlCSS(ta.value) + "\n ";
      pre.scrollTop = ta.scrollTop;
      pre.scrollLeft = ta.scrollLeft;
    };
    let fallbackTimer;
    const apply = () => {
      let d = null;
      try { d = frame.contentDocument; } catch (e) { d = null; }
      const u = d && d.getElementById("__user");
      if (u) { u.textContent = ta.value; runChecks(d); }
      else {
        clearTimeout(fallbackTimer);
        fallbackTimer = setTimeout(() => { frame.srcdoc = doc.replace('<style id="__user"></style>', `<style id="__user">${ta.value}</style>`); }, 250);
      }
    };
    frame.addEventListener("load", () => {
      try {
        const u = frame.contentDocument.getElementById("__user");
        if (u && u.textContent !== ta.value) u.textContent = ta.value;
        runChecks(frame.contentDocument);
      } catch (e) { /* cross-origin fallback: styles already baked in */ }
    });
    frame.srcdoc = doc;

    function fit() {
      const w = previewPane.clientWidth, hgt = previewPane.clientHeight;
      frame.style.width = w / zoom + "px";
      frame.style.height = hgt / zoom + "px";
      frame.style.transform = `scale(${zoom})`;
    }
    new ResizeObserver(fit).observe(previewPane);
    fit();

    function norm(d, prop, value) {
      const p = d.createElement("div");
      p.style.cssText = "position:absolute;left:-9999px;top:0";
      p.style.setProperty(prop, value);
      d.body.append(p);
      const v = d.defaultView.getComputedStyle(p).getPropertyValue(prop);
      p.remove();
      return v;
    }
    function runChecks(d) {
      if (!checks || !d || !d.body) return;
      const css = ta.value;
      const selectorsOnly = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{[^}]*\}/g, "{}");
      checkList.textContent = "";
      let allPass = true;
      for (const c of checks) {
        let pass = false, cls = "";
        if (c.forbid) {
          const bad =
            c.forbid === "important" ? /!\s*important/i.test(css) :
            c.forbid === "id" ? /#[\w-]/.test(selectorsOnly) :
            c.forbid === "non-type" ? /[.#\[:]/.test(selectorsOnly) :
            new RegExp(c.forbid, "i").test(css);
          pass = !bad;
          if (bad) cls = "fail-constraint";
        } else if (c.require) {
          pass = new RegExp(c.require, "i").test(css);
        } else {
          const el = d.querySelector(c.sel);
          if (el) {
            const actual = d.defaultView.getComputedStyle(el, c.pseudo || null).getPropertyValue(c.prop).trim();
            const want = c.raw ? c.is : norm(d, c.prop, c.is).trim();
            pass = c.not ? actual !== want : actual === want;
          }
        }
        if (!pass) allPass = false;
        checkList.append(h("li", { class: pass ? "pass" : cls, text: c.label }));
      }
      if (allPass && css.trim() !== initial.trim()) {
        checkList.append(h("li", { class: "solved-msg", text: root.dataset.solved || "✓ Solved" }));
        root.classList.add("solved");
      } else root.classList.remove("solved");
    }

    let raf;
    ta.addEventListener("input", () => {
      paint();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(apply);
    });
    ta.addEventListener("scroll", () => { pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; });
    ta.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") { ta.blur(); return; }
      if (e.key === "Tab") {
        e.preventDefault();
        document.execCommand("insertText", false, "  ");
      } else if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
        const before = ta.value.slice(0, ta.selectionStart);
        const line = before.slice(before.lastIndexOf("\n") + 1);
        let indent = line.match(/^\s*/)[0];
        if (/\{\s*$/.test(line)) indent += "  ";
        e.preventDefault();
        document.execCommand("insertText", false, "\n" + indent);
      } else if (e.key === "}" ) {
        const before = ta.value.slice(0, ta.selectionStart);
        const line = before.slice(before.lastIndexOf("\n") + 1);
        if (/^\s{2,}$/.test(line)) {
          e.preventDefault();
          ta.setSelectionRange(ta.selectionStart - 2, ta.selectionStart);
          document.execCommand("insertText", false, "}");
        }
      }
    });
    reset.addEventListener("click", () => { ta.value = initial; paint(); apply(); });
    paint();

    root.liveEditor = {
      get: () => ta.value,
      set: (v) => { ta.value = v; paint(); apply(); },
      frame,
    };
  }

  /* ------------------------------------------------------------------------
     Specificity
     ------------------------------------------------------------------------ */
  const IDENT = /^-?(?:[_a-zA-Z -￿]|\\.)(?:[\w -￿-]|\\.)*/;
  const LEGACY_PE = /^(before|after|first-line|first-letter)$/i;

  function splitTop(s) {
    const out = [];
    let depth = 0, cur = "", q = null;
    for (const ch of s) {
      if (q) { cur += ch; if (ch === q) q = null; continue; }
      if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
      if (ch === "(" || ch === "[") depth++;
      else if (ch === ")" || ch === "]") depth--;
      if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
    }
    out.push(cur);
    return out;
  }
  function findClose(s, from, open, close) {
    let depth = 0, q = null;
    for (let k = from; k < s.length; k++) {
      const ch = s[k];
      if (q) { if (ch === q) q = null; continue; }
      if (ch === '"' || ch === "'") { q = ch; continue; }
      if (ch === open) depth++;
      else if (ch === close) { depth--; if (depth === 0) return k; }
    }
    return -1;
  }
  const cmp = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  function maxSpec(list) {
    let best = [0, 0, 0];
    for (const part of splitTop(list)) {
      if (!part.trim()) continue;
      const s = specOf(part.trim()).s;
      if (cmp(s, best) > 0) best = s;
    }
    return best;
  }
  function specOf(sel) {
    const toks = [];
    let a = 0, b = 0, c = 0, i = 0;
    const n = sel.length;
    while (i < n) {
      const ch = sel[i];
      if (/\s/.test(ch) || ">+~".includes(ch)) {
        let j = i;
        while (j < n && (/\s/.test(sel[j]) || ">+~".includes(sel[j]))) j++;
        toks.push({ t: sel.slice(i, j), k: "comb" });
        i = j;
        continue;
      }
      if (ch === "*" || ch === "&") { toks.push({ t: ch, k: "z" }); i++; continue; }
      if (ch === "#" || ch === ".") {
        const m = sel.slice(i + 1).match(IDENT);
        if (!m) throw new Error(`Expected a name after "${ch}"`);
        toks.push({ t: ch + m[0], k: ch === "#" ? "a" : "b" });
        ch === "#" ? a++ : b++;
        i += 1 + m[0].length;
        continue;
      }
      if (ch === "[") {
        const k = findClose(sel, i, "[", "]");
        if (k < 0) throw new Error("Unclosed [ bracket");
        toks.push({ t: sel.slice(i, k + 1), k: "b" });
        b++;
        i = k + 1;
        continue;
      }
      if (ch === ":") {
        const pe = sel[i + 1] === ":";
        let j = i + (pe ? 2 : 1);
        const m = sel.slice(j).match(IDENT);
        if (!m) throw new Error('Expected a name after ":"');
        const name = m[0].toLowerCase();
        j += m[0].length;
        let arg = null;
        if (sel[j] === "(") {
          const k = findClose(sel, j, "(", ")");
          if (k < 0) throw new Error("Unclosed ( bracket");
          arg = sel.slice(j + 1, k);
          j = k + 1;
        }
        const text = sel.slice(i, j);
        if (pe || (LEGACY_PE.test(name) && arg == null)) { c++; toks.push({ t: text, k: "c" }); }
        else if (name === "where") toks.push({ t: text, k: "z", note: "always 0" });
        else if (["is", "not", "has", "matches", "-webkit-any"].includes(name)) {
          const best = maxSpec(arg || "");
          a += best[0]; b += best[1]; c += best[2];
          toks.push({ t: text, k: best[0] ? "a" : best[1] ? "b" : best[2] ? "c" : "z", note: `= its strongest argument (${best.join(",")})` });
        } else if (/^nth-(last-)?child$/.test(name) && arg && /\sof\s/i.test(arg)) {
          const best = maxSpec(arg.split(/\sof\s/i)[1]);
          a += best[0]; b += best[1] + 1; c += best[2];
          toks.push({ t: text, k: "b" });
        } else { b++; toks.push({ t: text, k: "b" }); }
        i = j;
        continue;
      }
      const m = sel.slice(i).match(IDENT);
      if (m) { toks.push({ t: m[0], k: "c" }); c++; i += m[0].length; continue; }
      throw new Error(`Unexpected character "${ch}"`);
    }
    return { s: [a, b, c], toks };
  }
  function validSelector(sel) {
    try { document.createDocumentFragment().querySelector(sel); return true; } catch (e) { return false; }
  }
  Kit.specificity = (sel) => splitTop(sel).map((p) => specOf(p.trim()));
  Kit.compareSpec = cmp;

  function scoreHTML(s) {
    const lab = ["ID", "CLASS", "TYPE"];
    return `<div class="spec-score">${s.map((v, k) => `<span class="${"abc"[k]}${v ? "" : " zero"}">${v}<small>${lab[k]}</small></span>`).join("")}</div>`;
  }
  Kit.scoreHTML = scoreHTML;
  function tokensHTML(toks) {
    return toks.map((t) => `<span class="spec-tok ${t.k}"${t.note ? ` title="${esc(t.note)}"` : ""}>${esc(t.t)}</span>`).join("");
  }

  function SpecCalc(root) {
    const values = (root.dataset.value || "nav a:hover").split("||");
    const compare = root.hasAttribute("data-compare");
    root.textContent = "";
    const inputs = (compare ? values.slice(0, 2) : values.slice(0, 1)).map((v) =>
      h("input", { class: "spec-input", value: v, spellcheck: "false", autocapitalize: "off", "aria-label": "Selector" }));
    const rows = h("div", { class: "spec-rows" });
    const verdict = h("div", { class: "spec-error" });
    inputs.forEach((inp) => root.append(inp));
    root.append(rows, verdict);
    if (compare) {
      inputs[0].style.marginBottom = "0.5em";
    }
    function render() {
      rows.textContent = "";
      verdict.textContent = "";
      const results = [];
      for (const inp of inputs) {
        const sel = inp.value.trim();
        if (!sel) continue;
        try {
          if (!validSelector(sel)) throw new Error("The browser rejects this selector — the whole rule would be ignored.");
          for (const part of splitTop(sel)) {
            const r = specOf(part.trim());
            const row = h("div", { class: "spec-row", html: `<div class="spec-tokens">${tokensHTML(r.toks)}</div>${scoreHTML(r.s)}` });
            rows.append(row);
            results.push({ r, row });
          }
        } catch (e) {
          verdict.textContent = "⚠ " + e.message;
        }
      }
      if (compare && results.length === 2) {
        const d = cmp(results[0].r.s, results[1].r.s);
        if (d === 0) { verdict.textContent = "Tie → the rule that comes later in the CSS wins."; verdict.style.color = "var(--ink)"; }
        else { (d > 0 ? results[0] : results[1]).row.classList.add("winner"); verdict.textContent = (d > 0 ? "Top" : "Bottom") + " selector wins."; verdict.style.color = "var(--ink)"; }
      } else verdict.style.color = "";
    }
    inputs.forEach((inp) => {
      inp.addEventListener("input", render);
      inp.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") inp.blur(); });
    });
    render();
  }


  /* ------------------------------------------------------------------------
     Specificity duel — rows of "A vs B", result revealed as a deck step
     ------------------------------------------------------------------------ */
  function SpecDuel(root) {
    root.querySelectorAll(".duel-row").forEach((row) => {
      const a = row.dataset.a, b = row.dataset.b;
      const ra = specOf(a).s, rb = specOf(b).s;
      const d = cmp(ra, rb);
      const verdict = d > 0 ? "◀ wins" : d < 0 ? "wins ▶" : "tie → the later rule wins";
      row.innerHTML = `<code class="duel-sel${d > 0 ? " win" : ""}">${esc(a)}</code><span class="duel-vs">vs</span><code class="duel-sel${d < 0 ? " win" : ""}">${esc(b)}</code>` +
        `<div class="duel-res step">${scoreHTML(ra)}<b class="${d === 0 ? "tie" : ""}">${verdict}</b>${scoreHTML(rb)}</div>`;
    });
  }

  /* ------------------------------------------------------------------------
     Selector tester — a selector is a question to the DOM
     ------------------------------------------------------------------------ */
  const VOID = new Set(["input", "img", "br", "hr", "meta", "link", "source", "wbr", "area", "col"]);
  const SEL_PREVIEW_CSS = `
    :host{all:initial;display:block;font:19px/1.4 system-ui,sans-serif;color:#17140f;padding:14px}
    *{box-sizing:border-box}
    a{color:#2f49ff}
    h1,h2,h3{margin:.3em 0;line-height:1.1}
    h1{font-size:1.6em} h2{font-size:1.25em} h3{font-size:1.05em}
    p{margin:.3em 0}
    ul{margin:.3em 0;padding-left:1.2em}
    nav ul{display:flex;gap:.8em;list-style:none;padding:0}
    section,header,footer,article,li,nav,form{display:block}
    .vendor-list{display:grid;grid-template-columns:1fr 1fr;gap:6px;list-style:none;padding:0}
    .vendor-card{border:1px solid #ccc;border-radius:6px;padding:6px 8px}
    .tag{font-size:.75em;background:#eee;padding:1px 6px;border-radius:99px}
    .badge{font-size:.75em;color:#b3290b}
    input{font:inherit;padding:2px 6px;width:100%}
    label{display:block;margin-top:.3em}
    .__hit{outline:3px solid #ff5a36!important;outline-offset:2px;background-color:rgba(255,90,54,.14)!important;border-radius:3px}
  `;

  function SelTester(root) {
    const src = dedent(root.querySelector(':scope > script[type="text/plain"]').textContent);
    const extraCss = root.querySelector(':scope > script[data-role="preview-css"]');
    const presets = (root.dataset.presets || "").split("|").filter(Boolean);
    const start = root.dataset.value || presets[0] || "";
    root.textContent = "";

    const tpl = document.createElement("template");
    tpl.innerHTML = src;
    const tree = document.createElement("div");
    tree.append(tpl.content.cloneNode(true));
    const els = [...tree.querySelectorAll("*")];
    const idx = new Map(els.map((e, k) => [e, k]));

    // pretty-print the tree as lines, remembering which element each line belongs to
    const lines = [];
    const openTag = (e) => "<" + e.localName + [...e.attributes].map((a) => (a.value === "" ? " " + a.name : ` ${a.name}="${a.value}"`)).join("") + ">";
    (function walk(node, depth) {
      for (const ch of node.childNodes) {
        if (ch.nodeType === 3) {
          const t = ch.textContent.replace(/\s+/g, " ").trim();
          if (t) lines.push({ html: esc(t), depth, el: null });
          continue;
        }
        if (ch.nodeType !== 1) continue;
        const id = idx.get(ch);
        const tag = ch.localName;
        if (VOID.has(tag)) lines.push({ html: hlHTML(openTag(ch)), depth, el: id, open: true, close: true });
        else if (ch.children.length === 0 && ch.textContent.trim().length < 46) {
          lines.push({ html: hlHTML(openTag(ch) + ch.textContent.replace(/\s+/g, " ").trim() + `</${tag}>`), depth, el: id, open: true, close: true });
        } else {
          lines.push({ html: hlHTML(openTag(ch)), depth, el: id, open: true });
          walk(ch, depth + 1);
          lines.push({ html: hlHTML(`</${tag}>`), depth, el: id, close: true });
        }
      }
    })(tree, 0);

    const input = h("input", { class: "sel-input", value: start, spellcheck: "false", autocapitalize: "off", "aria-label": "CSS selector" });
    const count = h("div", { class: "sel-count", "aria-live": "polite" });
    const presetRow = h("div", { class: "sel-presets" });
    const code = h("pre", { class: "sel-code" });
    const lineEls = lines.map((l) => {
      const span = h("span", { class: "sel-line", html: "  ".repeat(l.depth) + l.html });
      code.append(span);
      return span;
    });
    const preview = h("div", { class: "sel-preview" });
    const shadow = preview.attachShadow({ mode: "open" });
    const clone = tree.cloneNode(true);
    const cloneEls = [...clone.querySelectorAll("*")];
    shadow.innerHTML = `<style>${SEL_PREVIEW_CSS}${extraCss ? extraCss.textContent : ""}</style>`;
    shadow.append(...clone.childNodes);
    shadow.addEventListener("click", (e) => e.preventDefault());

    root.append(h("div", { class: "sel-head" }, input, count), presetRow, h("div", { class: "sel-body" }, code, preview));
    presets.forEach((p) => {
      const b = h("button", { class: "chip-btn", type: "button", text: p });
      b.onclick = () => { input.value = p; run(); };
      presetRow.append(b);
    });

    function run() {
      const sel = input.value.trim();
      presetRow.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.textContent === sel)));
      cloneEls.forEach((e) => e.classList.remove("__hit"));
      lineEls.forEach((e) => e.classList.remove("hit", "inside"));
      count.classList.remove("bad");
      if (!sel) { count.textContent = "type a selector"; return; }
      let hits;
      try { hits = tree.querySelectorAll(sel); }
      catch (e) { count.textContent = "invalid → rule ignored"; count.classList.add("bad"); return; }
      const set = new Set([...hits].map((e) => idx.get(e)));
      set.forEach((k) => cloneEls[k].classList.add("__hit"));
      let depthInside = 0;
      const insideStack = [];
      lines.forEach((l, k) => {
        if (l.el != null && set.has(l.el)) {
          lineEls[k].classList.add("hit");
          if (l.open && !l.close) insideStack.push(l.el);
          else if (l.close && !l.open) insideStack.pop();
          return;
        }
        if (insideStack.length) lineEls[k].classList.add("inside");
      });
      void depthInside;
      let msg = `${hits.length} match${hits.length === 1 ? "" : "es"}`;
      if (/::/.test(sel)) msg = "pseudo-elements aren't in the DOM";
      else if (hits.length === 0 && /:(hover|focus|active|checked|visited)/.test(sel)) msg = "0 now — waits for that state";
      count.textContent = msg;
      const first = code.querySelector(".hit");
      if (first) {
        const top = first.offsetTop - code.offsetTop;
        if (top < code.scrollTop || top > code.scrollTop + code.clientHeight - 30) code.scrollTop = top - 20;
      }
    }
    input.addEventListener("input", run);
    input.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") input.blur(); });
    new ResizeObserver(() => { if (code.clientHeight) run(); }).observe(code);
    run();
  }

  /* ------------------------------------------------------------------------
     :nth-child() playground
     ------------------------------------------------------------------------ */
  function NthPlay(root) {
    const count = +(root.dataset.count || 20);
    const presets = (root.dataset.presets || "odd|even|3|3n|3n+1|n+5|-n+3").split("|");
    root.textContent = "";
    const input = h("input", { value: root.dataset.value || "2n+1", spellcheck: "false", "aria-label": "nth-child formula" });
    const form = h("div", { class: "nth-form" }, h("span", { text: "li:nth-child(" }), input, h("span", { text: ")" }));
    const list = h("ul", { class: "nth-grid" });
    for (let k = 1; k <= count; k++) list.append(h("li", { text: k }));
    const note = h("div", { class: "nth-note" });
    const presetRow = h("div", { class: "sel-presets" });
    presets.forEach((p) => {
      const b = h("button", { class: "chip-btn", type: "button", text: p });
      b.onclick = () => { input.value = p; run(); };
      presetRow.append(b);
    });
    root.append(form, list, presetRow, note);
    function run() {
      const v = input.value.trim();
      list.querySelectorAll("li").forEach((li) => li.classList.remove("hit"));
      presetRow.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.textContent === v)));
      try {
        const hits = [...list.querySelectorAll(`li:nth-child(${v})`)];
        hits.forEach((li) => li.classList.add("hit"));
        const m = v.replace(/\s/g, "").match(/^([+-]?\d*)n([+-]\d+)?$/);
        let expl = hits.length ? "matches " + hits.map((li) => li.textContent).join(", ") : "matches nothing";
        if (m) {
          const A = m[1] === "" || m[1] === "+" ? 1 : m[1] === "-" ? -1 : +m[1];
          const B = +(m[2] || 0);
          const ex = [0, 1, 2, 3].map((nv) => A * nv + B);
          expl = `n = 0, 1, 2, 3 … → ${ex.join(", ")} …  (only positions ≥ 1 exist)`;
        }
        note.textContent = expl;
      } catch (e) {
        note.textContent = "⚠ not a valid formula";
      }
    }
    input.addEventListener("input", run);
    input.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") input.blur(); });
    run();
  }

  /* ------------------------------------------------------------------------
     Colour lab — HSL knobs + contrast
     ------------------------------------------------------------------------ */
  function hsl2rgb(hh, s, l) {
    s /= 100; l /= 100;
    const k = (n) => (n + hh / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return [f(0), f(8), f(4)].map((x) => Math.round(x * 255));
  }
  const hex = (rgb) => "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
  function lum(rgb) {
    const c = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(x, y) {
    const [p, q] = [lum(x), lum(y)].sort((m, n) => n - m);
    return (p + 0.05) / (q + 0.05);
  }
  Kit.contrast = contrast;

  function ColorLab(root) {
    const [H0, S0, L0] = (root.dataset.value || "9,100,61").split(",").map(Number);
    const state = { h: H0, s: S0, l: L0 };
    root.textContent = "";
    const mk = (key, max, label) => {
      const r = h("input", { type: "range", min: 0, max, value: state[key], "aria-label": label });
      const o = h("output");
      r.addEventListener("input", () => { state[key] = +r.value; paint(); });
      return { row: h("label", { class: "cl-slider" }, h("span", { text: key.toUpperCase() }), r, o), r, o };
    };
    const H = mk("h", 360, "Hue"), S = mk("s", 100, "Saturation"), L = mk("l", 100, "Lightness");
    const codes = h("div", { class: "cl-codes" });
    const sampleW = h("div", { class: "cl-sample" });
    const sampleB = h("div", { class: "cl-sample" });
    const palette = h("div", { class: "cl-palette" });
    const swatch = h("div", { class: "cl-swatch" }, sampleW, sampleB);
    root.append(h("div", { class: "cl-sliders" }, H.row, S.row, L.row, codes), h("div", {}, swatch, palette));
    function paint() {
      const { h: hh, s, l } = state;
      const rgb = hsl2rgb(hh, s, l);
      H.o.textContent = hh + "°"; S.o.textContent = s + "%"; L.o.textContent = l + "%";
      H.r.style.background = "linear-gradient(90deg," + [0, 60, 120, 180, 240, 300, 360].map((x) => `hsl(${x} ${s}% ${l}%)`).join(",") + ")";
      S.r.style.background = `linear-gradient(90deg, hsl(${hh} 0% ${l}%), hsl(${hh} 100% ${l}%))`;
      L.r.style.background = `linear-gradient(90deg, #000, hsl(${hh} ${s}% 50%), #fff)`;
      codes.innerHTML = [
        ["hsl", `hsl(${hh} ${s}% ${l}%)`],
        ["hex", hex(rgb)],
        ["rgb", `rgb(${rgb.join(" ")})`],
      ].map(([k, v]) => `<div><span>${k}</span><span>${v}</span></div>`).join("");
      swatch.style.background = `hsl(${hh} ${s}% ${l}%)`;
      const cw = contrast(rgb, [255, 255, 255]), cb = contrast(rgb, [23, 20, 15]);
      const tag = (c) => `<small class="${c < 4.5 ? "fail" : ""}">${c.toFixed(2)}:1 ${c >= 7 ? "AAA" : c >= 4.5 ? "AA ✓" : "✗ fails"}</small>`;
      sampleW.innerHTML = `<span style="color:#fff">Night Market</span>${tag(cw)}`;
      sampleB.innerHTML = `<span style="color:#17140f">Night Market</span>${tag(cb)}`;
      palette.textContent = "";
      for (let k = 1; k <= 9; k++) {
        const lv = k * 10;
        const c = hsl2rgb(hh, s, lv);
        const cell = h("div", { text: lv, title: `hsl(${hh} ${s}% ${lv}%)` });
        cell.style.background = `hsl(${hh} ${s}% ${lv}%)`;
        cell.style.color = lum(c) > 0.35 ? "#000" : "#fff";
        cell.style.cursor = "pointer";
        if (Math.abs(lv - l) < 5) cell.style.outline = "0.15em solid var(--ink)";
        cell.onclick = () => { state.l = lv; L.r.value = lv; paint(); };
        palette.append(cell);
      }
    }
    root.querySelectorAll("input").forEach((i) => i.addEventListener("keydown", (e) => { if (e.key === "Escape") i.blur(); }));
    paint();
  }

  /* ------------------------------------------------------------------------
     Contrast pair — check YOUR text colour on YOUR background
     ------------------------------------------------------------------------ */
  function hexToRgb(hx) {
    const m = String(hx).trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!m) return null;
    let v = m[1];
    if (v.length === 3) v = v.split("").map((c) => c + c).join("");
    return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
  }
  function ContrastPair(root) {
    const [fg0, bg0] = (root.dataset.value || "#17140f,#ff6347").split(",");
    root.textContent = "";
    const mk = (label, val) => {
      const color = h("input", { type: "color", value: val, "aria-label": label + " colour" });
      const text = h("input", { type: "text", value: val, spellcheck: "false", "aria-label": label + " hex" });
      color.addEventListener("input", () => { text.value = color.value; paint(); });
      text.addEventListener("input", () => { if (hexToRgb(text.value)) { color.value = "#" + text.value.replace("#", ""); paint(); } });
      text.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") text.blur(); });
      return { el: h("label", {}, h("span", { text: label }), color, text), color };
    };
    const F = mk("text", fg0), B = mk("background", bg0);
    const sample = h("div", { class: "cp-sample" });
    root.append(h("div", { class: "cp-controls" }, F.el, B.el), sample);
    function paint() {
      const f = hexToRgb(F.color.value), b = hexToRgb(B.color.value);
      const c = contrast(f, b);
      sample.style.background = B.color.value;
      sample.style.color = F.color.value;
      const badge = (ok, t) => `<i class="${ok ? "" : "fail"}">${ok ? "✓" : "✗"} ${t}</i>`;
      sample.innerHTML = `<b>Harbour Night Market</b><span>Vendors open at 19:00. Bring cash for the stalls.</span><div class="cp-score">${c.toFixed(2)} : 1 ${badge(c >= 4.5, "body text 4.5")}${badge(c >= 3, "large text 3")}</div>`;
    }
    paint();
  }

  /* ------------------------------------------------------------------------
     Box model lab
     ------------------------------------------------------------------------ */
  function BoxLab(root) {
    const st = { width: 260, padding: 30, border: 10, margin: 30, sizing: "content-box" };
    root.textContent = "";
    const mk = (key, max, color, label) => {
      const r = h("input", { type: "range", min: 0, max, value: st[key], "aria-label": label });
      const o = h("output");
      r.addEventListener("input", () => { st[key] = +r.value; paint(); });
      r.addEventListener("keydown", (e) => { if (e.key === "Escape") r.blur(); });
      const sw = h("i", { class: "sw" });
      sw.style.background = color;
      return { row: h("label", { class: "bl-row" }, h("span", {}, sw, key), r, o), o };
    };
    const W = mk("width", 400, "#9fc4e7", "width"), P = mk("padding", 70, "#c3deb7", "padding"), B = mk("border", 40, "#2b2b2b", "border"), M = mk("margin", 70, "#f9cc9d", "margin");
    const bContent = h("button", { type: "button", text: "content-box", "aria-pressed": "true" });
    const bBorder = h("button", { type: "button", text: "border-box", "aria-pressed": "false" });
    const setSizing = (v) => { st.sizing = v; bContent.setAttribute("aria-pressed", String(v === "content-box")); bBorder.setAttribute("aria-pressed", String(v === "border-box")); paint(); };
    bContent.onclick = () => setSizing("content-box");
    bBorder.onclick = () => setSizing("border-box");
    const math = h("div", { class: "bl-math" });
    const box = h("div", { class: "bl-box" });
    const marginEl = h("div", { class: "bl-margin" }, box);
    const ruler = h("div", { class: "bl-ruler" });
    const stage = h("div", { class: "bl-stage" }, h("div", {}, ruler, marginEl));
    root.append(
      h("div", { class: "bl-controls" },
        W.row, P.row, B.row, M.row,
        h("div", { class: "bl-row" }, h("span", { text: "box-sizing" }), h("div", { class: "bl-toggle" }, bContent, bBorder)),
        math),
      stage);
    function paint() {
      W.o.textContent = st.width + "px"; P.o.textContent = st.padding + "px"; B.o.textContent = st.border + "px"; M.o.textContent = st.margin + "px";
      Object.assign(box.style, { width: st.width + "px", padding: st.padding + "px", borderWidth: st.border + "px", boxSizing: st.sizing, minHeight: "0" });
      marginEl.style.padding = st.margin + "px";
      const outer = st.sizing === "content-box" ? st.width + 2 * st.padding + 2 * st.border : Math.max(st.width, 2 * st.padding + 2 * st.border);
      const content = st.sizing === "content-box" ? st.width : Math.max(0, st.width - 2 * st.padding - 2 * st.border);
      box.textContent = `content ${content}px`;
      ruler.textContent = `← ${box.offsetWidth || outer}px on screen →`;
      math.innerHTML = st.sizing === "content-box"
        ? `width ${st.width}<br>+ padding 2 × ${st.padding}<br>+ border 2 × ${st.border}<br>= <b>${outer}px</b> visible box<br><span style="color:var(--muted)">+ margin 2 × ${st.margin} = ${outer + 2 * st.margin}px of space</span>`
        : `width ${st.width} = the whole visible box: <b>${outer}px</b><br>content shrinks to ${content}px<br><span style="color:var(--muted)">+ margin 2 × ${st.margin} = ${outer + 2 * st.margin}px of space</span>`;
      requestAnimationFrame(() => { ruler.textContent = `← ${box.offsetWidth}px on screen →`; });
    }
    new ResizeObserver(() => { if (box.offsetWidth) ruler.textContent = `← ${box.offsetWidth}px on screen →`; }).observe(box);
    paint();
  }

  /* ------------------------------------------------------------------------
     Units lab — real iframe, so vw is honest
     ------------------------------------------------------------------------ */
  function UnitsLab(root) {
    const st = { root: 16, parent: 24, vw: 900 };
    root.textContent = "";
    const mk = (key, min, max, label) => {
      const r = h("input", { type: "range", min, max, value: st[key], "aria-label": label });
      const o = h("b");
      r.addEventListener("input", () => { st[key] = +r.value; paint(); });
      r.addEventListener("keydown", (e) => { if (e.key === "Escape") r.blur(); });
      return { el: h("label", { class: "ul-control" }, h("span", {}, label, o), r), o };
    };
    const R = mk("root", 10, 32, "html font-size (browser setting) "), P = mk("parent", 10, 40, ".parent font-size "), V = mk("vw", 360, 1400, "viewport width ");
    const frame = h("iframe", { title: "Units preview" });
    const stage = h("div", { class: "ul-stage" }, frame);
    root.append(h("div", { class: "ul-controls" }, R.el, P.el, V.el), stage);
    const rows = [
      ["240px", "width:240px", "never changes"],
      ["15rem", "width:15rem", "× html font-size"],
      ["10em", "width:10em", "× this element's font-size (inherited from .parent)"],
      ["50%", "width:50%", "× parent's width"],
      ["30vw", "width:30vw", "× 1% of viewport width"],
      ["30ch", "width:30ch", "× width of the “0” glyph"],
    ];
    frame.srcdoc = `<!doctype html><html><head><style>
      html{font-size:16px}
      body{margin:14px;font-family:system-ui,sans-serif}
      .parent{border:2px dashed #b9ad97;border-radius:8px;padding:10px 12px;font-size:24px}
      .parent > p{margin:0 0 8px;font:600 16px/1.2 ui-monospace,Menlo,monospace;color:#6f665a}
      .row{display:grid;grid-template-columns:86px 1fr;align-items:center;margin:8px 0}
      .row code{font:700 17px ui-monospace,Menlo,monospace}
      .bar{height:34px;border-radius:5px;background:#ff5a36;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 8px;box-sizing:border-box;white-space:nowrap;overflow:hidden}
      .bar span{font:700 16px ui-monospace,Menlo,monospace}
      .bar small{font:500 14px system-ui;opacity:.9}
      .row:nth-child(3) .bar{background:#2f49ff}.row:nth-child(4) .bar{background:#7b4dff}.row:nth-child(5) .bar{background:#12a26f}.row:nth-child(6) .bar{background:#f5a300}.row:nth-child(7) .bar{background:#17140f}
      .text{display:flex;gap:18px;align-items:baseline;margin-top:10px;flex-wrap:wrap}
      .text span{font-weight:800;line-height:1}
      .text code{display:block;font:600 14px ui-monospace,Menlo,monospace;color:#6f665a;margin-top:4px}
    </style>${KEY_FORWARD}</head><body><div class="parent"><p>.parent — every bar below lives here</p>${rows.map(([u, css, why]) => `<div class="row"><code>${u}</code><div class="bar" style="${css}"><span></span><small>${why}</small></div></div>`).join("")}
      <div class="text"><div><span style="font-size:1.5rem">Aa</span><code>1.5rem</code></div><div><span style="font-size:1.5em">Aa</span><code>1.5em</code></div><div><span style="font-size:24px">Aa</span><code>24px</code></div><div><span style="font-size:4vw">Aa</span><code>4vw</code></div></div></div></body></html>`;
    frame.addEventListener("load", paint);
    function fit() {
      const sw = stage.clientWidth, sh = stage.clientHeight;
      const scale = Math.min(1.35, sw / st.vw);
      frame.style.width = st.vw + "px";
      frame.style.height = sh / scale + "px";
      frame.style.transform = `scale(${scale})`;
    }
    function paint() {
      R.o.textContent = st.root + "px"; P.o.textContent = st.parent + "px"; V.o.textContent = st.vw + "px";
      fit();
      let d;
      try { d = frame.contentDocument; } catch (e) { return; }
      if (!d || !d.body) return;
      d.documentElement.style.fontSize = st.root + "px";
      const par = d.querySelector(".parent");
      if (!par) return;
      par.style.fontSize = st.parent + "px";
      requestAnimationFrame(() => {
        d.querySelectorAll(".bar").forEach((b) => {
          b.firstChild.textContent = Math.round(parseFloat(d.defaultView.getComputedStyle(b).width)) + "px";
        });
        d.querySelectorAll(".text span").forEach((s) => {
          s.nextElementSibling.textContent = s.nextElementSibling.textContent.split(" ")[0] + " = " + Math.round(parseFloat(d.defaultView.getComputedStyle(s).fontSize)) + "px";
        });
      });
    }
    new ResizeObserver(paint).observe(stage);
  }

  /* ------------------------------------------------------------------------
     Countdown timer
     ------------------------------------------------------------------------ */
  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25, 0.5].forEach((t) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.2);
        o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + t);
        o.stop(ctx.currentTime + t + 0.22);
      });
    } catch (e) { /* no audio, no problem */ }
  }
  function Timer(btn) {
    const total = Math.round(parseFloat(btn.dataset.min || "5") * 60);
    let left = total, t = null, endAt = 0;
    const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    const label = btn.dataset.label ? btn.dataset.label + " " : "";
    const show = () => { btn.textContent = label + fmt(left); };
    btn.title = "Click: start / pause · Double-click: reset";
    btn.type = "button";
    btn.addEventListener("click", () => {
      if (btn.classList.contains("done")) { reset(); return; }
      if (t) { clearInterval(t); t = null; btn.classList.remove("running"); return; }
      endAt = Date.now() + left * 1000;
      btn.classList.add("running");
      t = setInterval(() => {
        left = Math.max(0, Math.round((endAt - Date.now()) / 1000));
        show();
        if (left === 0) { clearInterval(t); t = null; btn.classList.remove("running"); btn.classList.add("done"); beep(); }
      }, 250);
    });
    const reset = () => { clearInterval(t); t = null; left = total; btn.classList.remove("running", "done"); show(); };
    btn.addEventListener("dblclick", reset);
    show();
  }

  /* ------------------------------------------------------------------------
     Brief generator for the final makeover
     ------------------------------------------------------------------------ */
  const MOODS = [
    ["Midnight Arcade", "CRT glow, chunky pixels, high-score energy.", ["#0d0221", "#ff2a6d", "#05d9e8", "#f9f871"]],
    ["Swiss Poster, 1962", "A strict grid, giant type, one loud red.", ["#ffffff", "#111111", "#e30613", "#d9d9d9"]],
    ["Grandma's Recipe Card", "Warm paper, serif type, a coffee stain.", ["#f6ecd9", "#6b3e26", "#c8553d", "#90a955"]],
    ["Acid Rave Flyer, 1994", "Smiley faces, clashing neon, zero chill.", ["#ccff00", "#ff00aa", "#111111", "#00e5ff"]],
    ["Tokyo Train Timetable", "Dense, precise, colour-coded lines.", ["#ffffff", "#1b1b1b", "#00a0e9", "#f39800"]],
    ["Luxury Perfume Launch", "Whitespace, thin serif, whispered prices.", ["#faf7f2", "#1a1a1a", "#b89b72", "#e8e1d6"]],
    ["Botanical Field Guide", "Latin names, ink sketches, pressed leaves.", ["#f3efe0", "#2f3e2e", "#6a994e", "#bc4749"]],
    ["Newspaper Front Page", "Columns, rules, a headline that screams.", ["#f7f4ec", "#111111", "#8a8a8a", "#b3001b"]],
    ["Mission Control", "Dark consoles, monospace readouts, one warning light.", ["#0b1320", "#9ae6b4", "#f6ad55", "#e2e8f0"]],
    ["Candy Shop", "Pastel stripes, round corners, sugar rush.", ["#fff0f6", "#ff85c0", "#95de64", "#69c0ff"]],
    ["Film Noir", "Black, white, venetian-blind shadows.", ["#0a0a0a", "#f2f2f2", "#7a7a7a", "#c0a062"]],
    ["Seaside Ice-Cream Van", "Mint, strawberry, hand-painted lettering.", ["#e6fff7", "#ff6b8b", "#3ec1a8", "#ffd166"]],
  ];
  const PALETTES = [
    ["One colour only", "Ignore the swatches: one colour plus lighter and darker versions of it (the colour playground makes shades)."],
    ["Black, white + one", "Black, white and exactly one accent colour. Use it sparingly."],
    ["Opposites attract", "Two colours from opposite sides of the colour wheel — orange and blue, red and teal."],
    ["Pastel only", "Soft, light backgrounds (think ice cream). Text stays dark."],
    ["Dark mode", "Background lightness under 15 %. Text must pass 4.5:1 contrast."],
    ["Named colours only", "Only CSS colour names: tomato, rebeccapurple, papayawhip…"],
    ["Stolen palette", "Take the four swatches on the mood card as custom properties."],
  ];
  const CONSTRAINTS = [
    ["No px", "Not a single px — except for borders."],
    ["One radius", "A single --radius variable used for every rounded corner."],
    ["Five variables", "At least five custom properties. Change one, restyle the page."],
    ["No emoji", "Decorate only with CSS: borders, gradients, shadows."],
    ["Monospace everything", "One monospace family for the whole page. Make it look intentional."],
    ["Two fonts max", "One family for headings, one for text. That's it."],
    ["Zero radius", "border-radius: 0 on everything. Sharp is the look."],
    ["Huge headline", "The h1 is at least 5rem. Everything else stays calm."],
    ["em for spacing", "Paddings and margins in em, so they grow with the text."],
  ];
  function Brief(root) {
    root.textContent = "";
    const cards = h("div", { class: "brief-cards" });
    const btn = h("button", { class: "brief-draw", type: "button", text: "🎲 Draw a brief" });
    root.append(cards, btn);
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    function render(m, p, c) {
      cards.innerHTML = `
        <div class="brief-card"><small>A night market in the style of</small><strong>${m[0]}</strong><p>${m[1]}</p><div class="swatches">${m[2].map((x) => `<i style="background:${x}" title="${x}"></i>`).join("")}</div></div>
        <div class="brief-card"><small>Colour rule</small><strong>${p[0]}</strong><p>${p[1]}</p></div>
        <div class="brief-card"><small>Constraint</small><strong>${c[0]}</strong><p>${c[1]}</p></div>`;
    }
    btn.addEventListener("click", () => {
      root.classList.add("shuffling");
      let k = 0;
      const t = setInterval(() => {
        render(pick(MOODS), pick(PALETTES), pick(CONSTRAINTS));
        if (++k > 9) { clearInterval(t); root.classList.remove("shuffling"); }
      }, 70);
    });
    render(MOODS[0], PALETTES[PALETTES.length - 1], CONSTRAINTS[0]);
  }

  /* ------------------------------------------------------------------------
     init
     ------------------------------------------------------------------------ */
  const REGISTRY = [
    [".live", LiveEditor],
    [".spec-calc", SpecCalc],
    [".spec-duel", SpecDuel],
    [".sel-tester", SelTester],
    [".nth-play", NthPlay],
    [".color-lab", ColorLab],
    [".contrast-pair", ContrastPair],
    [".box-lab", BoxLab],
    [".units-lab", UnitsLab],
    ["button.timer", Timer],
    [".brief", Brief],
  ];
  Kit.init = function (root) {
    root = root || document;
    upgradeCode(root);
    for (const [sel, fn] of REGISTRY) {
      root.querySelectorAll(sel).forEach((el) => {
        if (el.dataset.kitReady) return;
        el.dataset.kitReady = "1";
        try { fn(el); } catch (e) { console.error("Kit component failed", sel, e); }
      });
    }
  };

  // Inside an iframe on a slide: hand arrow keys to the deck.
  if (window.parent !== window) {
    document.addEventListener("keydown", (e) => {
      const t = e.target;
      if (t.closest && t.closest("input, textarea, select, [contenteditable]")) return;
      if (["ArrowRight", "ArrowLeft", "PageUp", "PageDown"].includes(e.key)) window.parent.postMessage({ deckKey: e.key }, "*");
    });
  }

  if (!document.querySelector(".deck")) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => Kit.init());
    else Kit.init();
  }
})();
