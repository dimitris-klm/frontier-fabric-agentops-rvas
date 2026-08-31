#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   Frontier Fabric AgentOps RVAS — static site builder
   Renders every Markdown file in the repo into a branded, self-contained HTML
   page (next to its source) so visitors never leave GitHub Pages. Also emits
   builder-data.json for the delivery composer (builder.html) and code-index.json
   for the in-site code viewer's landing page (code.html).

   Usage:  npm run build      (from repo root)
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { marked, Marked } = require('marked');

const ROOT = path.resolve(__dirname, '..');
const REPO = 'microsoft/frontier-fabric-agentops-rvas';
const REPO_URL = `https://github.com/${REPO}`;
const BLOB = `${REPO_URL}/blob/main`;
const SITE_TITLE = 'Frontier Fabric AgentOps RVAS';
const EXCLUDE_DIRS = new Set(['.git', '.agents', '.azure', '__pycache__', 'node_modules', 'tools']);

const CAT_LABEL = { challenges: 'Challenges', coach: 'Coach', docs: 'Docs', resources: 'Resources', root: 'Home' };

// ── helpers ────────────────────────────────────────────────────────────────
const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const stripTags = (s) => String(s).replace(/<[^>]*>/g, '');

function slugifyBase(raw) {
  return stripTags(String(raw))
    .toLowerCase()
    .replace(/[`*_~]/g, '')
    .replace(/[^\w\u00C0-\uFFFF\- ]+/g, '') // drop punctuation/emoji, keep word chars + spaces + hyphen
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function walkMarkdown(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
    }
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkMarkdown(full, acc);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) acc.push(full);
  }
  return acc;
}

function listFilesFlat(dir) {
  const out = [];
  (function rec(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (EXCLUDE_DIRS.has(e.name)) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) rec(full);
      else out.push(path.relative(ROOT, full).split(path.sep).join('/'));
    }
  })(dir);
  return out.sort();
}

// Grouped manifest of viewable reference-implementation source files, consumed by
// code.html when opened with no ?path= (its landing view). Uses the same filter as
// the per-component README file trees so the two stay in sync. Component labels and
// descriptions are reused from site-data.json when present.
function buildCodeIndex() {
  const labels = {};
  try {
    const sd = JSON.parse(fs.readFileSync(path.join(ROOT, 'site-data.json'), 'utf8'));
    for (const it of (sd.items || [])) {
      const m = String(it.url || '').match(/^resources\/([^/]+)\//);
      if (m && !labels[m[1]]) labels[m[1]] = { label: it.name, desc: it.description || '', tags: it.tags || [] };
    }
  } catch { /* fall back to derived labels */ }

  const titleCase = (s) => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const resRoot = path.join(ROOT, 'resources');
  const groups = [];
  if (fs.existsSync(resRoot)) {
    const comps = fs.readdirSync(resRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name).sort();
    for (const comp of comps) {
      const files = listFilesFlat(path.join(resRoot, comp)).filter((f) => {
        if (/README\.md$/i.test(f)) return false;
        if (/\.html$/i.test(f) && fs.existsSync(path.join(ROOT, f.replace(/\.html$/i, '.md')))) return false;
        return true;
      }).map((f) => ({ path: f, name: f.split('/').slice(2).join('/') }));
      if (!files.length) continue;
      const meta = labels[comp] || {};
      groups.push({
        id: comp,
        label: meta.label || titleCase(comp),
        desc: meta.desc || '',
        tags: meta.tags || [],
        readme: `resources/${comp}/README.html`,
        count: files.length,
        files,
      });
    }
  }
  const total = groups.reduce((n, g) => n + g.count, 0);
  fs.writeFileSync(path.join(ROOT, 'code-index.json'), JSON.stringify({ total, groups }, null, 2) + '\n');
  return { groups: groups.length, total };
}

const categoryOf = (rel) => {
  if (rel.startsWith('challenges/')) return 'challenges';
  if (rel.startsWith('coach/')) return 'coach';
  if (rel.startsWith('docs/')) return 'docs';
  if (rel.startsWith('resources/')) return 'resources';
  return 'root';
};

const relPrefix = (rel) => '../'.repeat(rel.split('/').length - 1);

function firstH1(md) {
  const m = md.match(/^#\s+(.+?)\s*$/m);
  return m ? m[1].replace(/[#*`]/g, '').trim() : null;
}

function challengeNum(rel) {
  const m = rel.match(/challenge-(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// Resolve a relative link (from a source dir) to a repo-root-relative path (no anchor).
function resolveRootRel(sourceRel, href) {
  const srcDir = path.posix.dirname(sourceRel);
  return path.posix.normalize(path.posix.join(srcDir, href));
}

function parseHours(est) {
  const nums = (String(est).match(/\d+(?:\.\d+)?/g) || []).map(Number);
  if (!nums.length) return [null, null];
  return nums.length === 1 ? [nums[0], nums[0]] : [nums[0], nums[1]];
}

// ── configure a per-file marked renderer ───────────────────────────────────
function makeMarked(sourceRel, ctx) {
  const rootRel = relPrefix(sourceRel);
  const slugCounts = new Map();
  const uniqueSlug = (raw) => {
    let base = slugifyBase(raw) || 'section';
    const n = slugCounts.get(base) || 0;
    slugCounts.set(base, n + 1);
    return n ? `${base}-${n}` : base;
  };

  const renderer = {
    heading(text, level, raw) {
      const id = uniqueSlug(raw);
      if (level === 2 || level === 3) ctx.headings.push({ level, id, text: stripTags(text) });
      const anchor = (level === 2 || level === 3)
        ? `<a class="anchor" href="#${id}" aria-hidden="true">#</a>` : '';
      return `<h${level} id="${id}">${text}${anchor}</h${level}>\n`;
    },

    link(href, title, text) {
      const t = title ? ` title="${escapeHtml(title)}"` : '';
      if (/^(https?:)?\/\//i.test(href) || /^mailto:/i.test(href)) {
        return `<a href="${escapeHtml(href)}"${t} target="_blank" rel="noopener">${text}</a>`;
      }
      if (href.startsWith('#')) return `<a href="${escapeHtml(href)}"${t}>${text}</a>`;

      // relative link — split anchor
      const hashIdx = href.indexOf('#');
      let pathPart = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
      const frag = hashIdx >= 0 ? href.slice(hashIdx) : '';
      if (pathPart === '') return `<a href="${escapeHtml(href)}"${t}>${text}</a>`; // pure anchor

      let out, external = false;
      if (/\.md$/i.test(pathPart)) {
        out = pathPart.replace(/\.md$/i, '.html') + frag;                    // md → html (same dir)
      } else {
        const targetRel = resolveRootRel(sourceRel, pathPart).replace(/\/$/, '');
        const abs = path.join(ROOT, targetRel);
        const isDir = pathPart.endsWith('/') || (fs.existsSync(abs) && fs.statSync(abs).isDirectory());
        if (isDir) {
          if (fs.existsSync(path.join(ROOT, targetRel, 'README.md'))) {
            out = `${rootRel}${targetRel}/README.html${frag}`;               // dir has a rendered README
          } else {
            const comp = targetRel.match(/^(resources\/[^/]+)(?:\/|$)/);     // inside a resource component?
            if (comp && fs.existsSync(path.join(ROOT, comp[1], 'README.md'))) {
              out = `${rootRel}${comp[1]}/README.html${frag}`;              // → component page (has file tree)
            } else {
              out = `${REPO_URL}/tree/main/${targetRel}${frag}`;            // fall back to GitHub tree
              external = true;
            }
          }
        } else {
          // code / other repo file → same-origin code viewer, keeps user on Pages
          out = `${rootRel}code.html?path=${encodeURIComponent(targetRel)}${frag}`;
          ctx.codeLinks = true;
        }
      }
      const ext = external ? ' target="_blank" rel="noopener"' : '';
      return `<a href="${escapeHtml(out)}"${t}${ext}>${text}</a>`;
    },

    code(code, infostring) {
      const lang = (infostring || '').trim().split(/\s+/)[0];
      if (lang === 'mermaid') {
        ctx.hasMermaid = true;
        return `<div class="mermaid">${escapeHtml(code)}</div>\n`;
      }
      ctx.hasCode = true;
      const cls = lang ? ` class="language-${escapeHtml(lang)}"` : '';
      return `<pre><button class="code-copy" type="button" aria-label="Copy code">Copy</button>`
           + `<code${cls}>${escapeHtml(code)}</code></pre>\n`;
    },

    table(header, body) {
      return `<div class="table-wrap"><table><thead>${header}</thead><tbody>${body}</tbody></table></div>\n`;
    },
  };

  const inst = new Marked({ gfm: true, breaks: false });
  inst.use({ renderer });
  return inst;
}

// ── HTML page template ──────────────────────────────────────────────────────
function renderPage(o) {
  const rp = o.rootRel;
  const tocHtml = o.headings.length >= 3 ? `
      <aside class="toc" aria-label="On this page">
        <div class="toc-title">On this page</div>
        <ul>
          ${o.headings.map(h => `<li><a class="h${h.level}" href="#${h.id}">${h.text}</a></li>`).join('\n          ')}
        </ul>
      </aside>` : '';
  const shellClass = tocHtml ? 'doc-shell' : 'doc-shell no-toc';

  const crumb = [`<a href="${rp}index.html">Home</a>`];
  if (o.category !== 'root') {
    const catIndex = { challenges: 'challenges/README.html', coach: 'coach/README.html', resources: 'resources/README.html' }[o.category];
    crumb.push('<span class="sep">/</span>');
    crumb.push(catIndex ? `<a href="${rp}${catIndex}">${CAT_LABEL[o.category]}</a>` : `<span>${CAT_LABEL[o.category]}</span>`);
  }
  crumb.push('<span class="sep">/</span>');
  crumb.push(`<span>${escapeHtml(o.shortTitle)}</span>`);

  const scripts = [];
  scripts.push(`<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css">`);

  let hero = '';
  if (o.category === 'challenges' && o.meta) {
    const roleChips = (o.meta.roles || []).map(r => `<span class="chip">${escapeHtml(r)}</span>`).join('');
    hero = `
        <div class="meta-row">
          <span class="chip cat-challenges">${escapeHtml(o.meta.badge || 'Challenge')}</span>
          ${o.meta.est ? `<span class="chip"><span class="k">Est.</span> ${escapeHtml(o.meta.est)}</span>` : ''}
          ${o.meta.level ? `<span class="chip"><span class="k">Level</span> ${escapeHtml(o.meta.level)}</span>` : ''}
          ${roleChips}
        </div>`;
  } else if (o.category !== 'root') {
    hero = `<div class="meta-row"><span class="chip cat-${o.category}">${CAT_LABEL[o.category]}</span></div>`;
  }

  const pager = o.pager ? `
        <nav class="pager" aria-label="Challenge navigation">
          ${o.pager.prev ? `<a class="prev" href="${o.pager.prev.href}"><div class="dir">← Previous</div><div class="ttl">${escapeHtml(o.pager.prev.title)}</div></a>` : `<a class="prev disabled"></a>`}
          ${o.pager.next ? `<a class="next" href="${o.pager.next.href}"><div class="dir">Next →</div><div class="ttl">${escapeHtml(o.pager.next.title)}</div></a>` : `<a class="next disabled"></a>`}
        </nav>` : '';

  const filetree = o.filetree || '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(o.shortTitle)} · ${SITE_TITLE}</title>
  <meta name="description" content="${escapeHtml(o.description || o.shortTitle)}">
  <link rel="icon" type="image/png" href="${rp}assets/logos/favicon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700;800&family=Inter:wght@400;500;600;700&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${rp}assets/css/site.css">
  ${scripts.join('\n  ')}
  <link rel="stylesheet" href="${rp}assets/css/brand.css">
  <link rel="stylesheet" href="${rp}assets/css/shell.css">
</head>
<body>
  <div class="orb orb-1"></div>
  <div class="orb orb-2"></div>

  <header class="nav" role="banner">
    <div class="nav-inner">
      <a class="brand" href="${rp}index.html" aria-label="RVAS — Frontier Fabric AgentOps">
        <img src="${rp}assets/img/logo-full.png" alt="RVAP" class="rvap-nav-logo" height="32">
      </a>
      <nav class="nav-links" id="navLinks" aria-label="Primary">
        <a href="${rp}index.html">Home</a>
        <a href="${rp}builder.html">Builder</a>
        <a href="${rp}code.html">Code</a>
        <a class="cta" href="${rp}builder.html">Compose your delivery →</a>
        <a class="gh" href="${REPO_URL}" target="_blank" rel="noopener">GitHub ↗</a>
      </nav>
      <div class="nav-actions">
        <button class="icon-btn nav-toggle" type="button" aria-label="Open navigation menu" aria-expanded="false" aria-controls="navLinks">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
        </button>
      </div>
    </div>
  </header>

  <div class="doc-wrap">
    <div class="${shellClass}">
      ${tocHtml}
      <main class="doc-main">
        <div class="breadcrumb">${crumb.join(' ')}</div>${hero}
        <article class="article prose">
${o.body}
        </article>
        ${filetree}
        ${pager}
        <div class="source-bar">
          <a href="${rp}index.html">← Back to all content</a>
          <a href="${BLOB}/${o.sourceRel}" target="_blank" rel="noopener">View source on GitHub ↗</a>
        </div>
      </main>
    </div>
  </div>

  <footer class="footer" role="contentinfo">
    <div class="footer-inner">
      <a class="brand" href="${rp}index.html" aria-label="RVAS — Frontier Fabric AgentOps">
        <img src="${rp}assets/img/logo-full.png" alt="RVAP" class="rvap-nav-logo" height="28">
      </a>
      <p>Build an AgentOps Control Tower on Microsoft Fabric. Build. Innovate. Scale real value.</p>
      <nav class="footer-links" aria-label="Footer">
        <a href="${rp}index.html">Home</a>
        <a href="${rp}builder.html">Builder</a>
        <a href="${rp}code.html">Code</a>
        <a href="${rp}builder.html">Compose your delivery</a>
      </nav>
    </div>
  </footer>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
  ${o.hasMermaid ? `<script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
    mermaid.initialize({ startOnLoad: false, theme: 'base', themeVariables: {
      primaryColor:'#EAF2FD', primaryBorderColor:'#1A77E3', primaryTextColor:'#032254',
      lineColor:'#6B7280', fontFamily:'Inter, Segoe UI, sans-serif' } });
    mermaid.run({ querySelector: '.mermaid' });
  </script>` : ''}
  <script>
    // syntax highlight (skip mermaid)
    if (window.hljs) document.querySelectorAll('pre code').forEach(el => window.hljs.highlightElement(el));
    // copy buttons
    document.querySelectorAll('.code-copy').forEach(btn => {
      btn.addEventListener('click', () => {
        const code = btn.parentElement.querySelector('code');
        navigator.clipboard.writeText(code.innerText).then(() => {
          const t = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => btn.textContent = t, 1400);
        });
      });
    });
    // TOC scroll-spy
    (function () {
      const links = [...document.querySelectorAll('.toc a')];
      if (!links.length) return;
      const map = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
      const obs = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            links.forEach(l => l.classList.remove('active'));
            const a = map.get(e.target.id); if (a) a.classList.add('active');
          }
        });
      }, { rootMargin: '0px 0px -75% 0px', threshold: 0 });
      document.querySelectorAll('.prose h2[id], .prose h3[id]').forEach(h => obs.observe(h));
    })();
  </script>
  <script src="${rp}assets/js/shell.js"></script>
</body>
</html>
`;
}

// ── build ───────────────────────────────────────────────────────────────────
function build() {
  const files = walkMarkdown(ROOT).map(f => path.relative(ROOT, f).split(path.sep).join('/'));

  // First pass: titles + challenge/coach metadata for pagers & builder.
  const titles = {};                       // rootRel -> {title, shortTitle}
  const challengeMeta = {};                // num -> meta
  const coachByNum = {};                   // num -> {rel, title}

  for (const rel of files) {
    const md = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const h1 = firstH1(md) || path.basename(rel, '.md');
    const shortTitle = h1.replace(/^Challenge\s+\d+\s*[—–-]\s*/i, '').replace(/^Coach Guide[:—–-]\s*/i, '').trim();
    titles[rel] = { title: h1, shortTitle };

    const cat = categoryOf(rel);
    const num = challengeNum(rel);
    if (cat === 'challenges' && num !== null) {
      const metaLine = (md.match(/Est\.\s*time:\*\*\s*([^\n]+)/i) || [])[1] || '';
      const est = (metaLine.match(/^([^·]+?)\s*(?:·|$)/) || [])[1]?.trim() || '';
      const level = (metaLine.match(/Level:\*\*\s*([^·]+?)\s*(?:·|$)/i) || [])[1]?.trim() || '';
      const rolesRaw = (metaLine.match(/Roles:\*\*\s*([^\n]+?)\s*$/i) || [])[1]?.trim() || '';
      const roles = rolesRaw ? rolesRaw.split(/,\s*/).map(s => s.trim()).filter(Boolean) : [];
      const [hmin, hmax] = parseHours(est);
      challengeMeta[num] = {
        num, rel, htmlRel: rel.replace(/\.md$/, '.html'),
        title: h1, shortTitle, badge: `CH ${String(num).padStart(2, '0')}` + (num === 6 ? ' · Stretch' : ''),
        est, level, roles, hoursMin: hmin, hoursMax: hmax,
      };
    }
    if (cat === 'coach' && num !== null) coachByNum[num] = { rel, title: h1, shortTitle };
  }

  // Enrich challenge meta with dependsOn + theme from challenges/README.md table.
  const chReadme = fs.existsSync(path.join(ROOT, 'challenges/README.md'))
    ? fs.readFileSync(path.join(ROOT, 'challenges/README.md'), 'utf8') : '';
  const rowRe = /^\|\s*\*\*(\d+)\*\*\s*\|\s*\[([^\]]+)\]\(([^)]+)\)[^|]*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/gm;
  let m;
  while ((m = rowRe.exec(chReadme)) !== null) {
    const num = parseInt(m[1], 10);
    const depends = m[4].trim();
    const dependsOn = /^[—–-]$/.test(depends) ? [] : (depends.match(/\d+/g) || []).map(Number);
    const theme = m[6].trim();
    if (challengeMeta[num]) { challengeMeta[num].dependsOn = dependsOn; challengeMeta[num].theme = theme; }
  }

  // Render every markdown file.
  let rendered = 0;
  for (const rel of files) {
    const md = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const cat = categoryOf(rel);
    const num = challengeNum(rel);
    const rootRel = relPrefix(rel);

    // Strip the challenge metadata blockquote (shown as chips instead).
    let body = md;
    if (cat === 'challenges' && num !== null) {
      body = body.replace(/^>\s*\*\*Est\.\s*time:\*\*[^\n]*\n/im, '');
    }

    const ctx = { headings: [], hasCode: false, hasMermaid: false, codeLinks: false };
    const inst = makeMarked(rel, ctx);
    const html = inst.parse(body);

    // Description = first non-empty paragraph, stripped.
    const firstPara = (md.split(/\n#{1,6}\s|\n>|\n```/)[0].split(/\n\n/).map(s => s.trim())
      .find(s => s && !s.startsWith('#') && !s.startsWith('>')) || titles[rel].shortTitle);
    const description = stripTags(firstPara).replace(/[*`\[\]]/g, '').slice(0, 180);

    // Pager for challenges / coach guides.
    let pager = null;
    if (cat === 'challenges' && num !== null) {
      const prev = challengeMeta[num - 1], next = challengeMeta[num + 1];
      pager = {
        prev: prev ? { href: path.basename(prev.htmlRel), title: prev.shortTitle } : null,
        next: next ? { href: path.basename(next.htmlRel), title: next.shortTitle } : null,
      };
    } else if (cat === 'coach' && num !== null) {
      const prev = coachByNum[num - 1], next = coachByNum[num + 1];
      pager = {
        prev: prev ? { href: path.basename(prev.rel).replace(/\.md$/, '.html'), title: prev.shortTitle } : null,
        next: next ? { href: path.basename(next.rel).replace(/\.md$/, '.html'), title: next.shortTitle } : null,
      };
    }

    // File tree for resource component READMEs (resources/<name>/README.md).
    let filetree = '';
    const rm = rel.match(/^resources\/([^/]+)\/README\.md$/);
    if (rm) {
      const compDir = path.join(ROOT, 'resources', rm[1]);
      const list = listFilesFlat(compDir).filter(f => {
        if (/README\.md$/i.test(f)) return false;
        // Drop generated HTML pages (any X.html that has a rendered X.md sibling)
        if (/\.html$/i.test(f) && fs.existsSync(path.join(ROOT, f.replace(/\.html$/i, '.md')))) return false;
        return true;
      });
      if (list.length) {
        const items = list.map(f => {
          const name = f.split('/').slice(1).join('/'); // drop 'resources/'
          return `<li><a href="${rootRel}code.html?path=${encodeURIComponent(f)}"><span class="ic">›</span>${escapeHtml(name.replace('resources/', ''))}</a></li>`;
        }).join('\n            ');
        filetree = `
        <div class="filetree">
          <div class="filetree-head">📁 ${escapeHtml(rm[1])} — ${list.length} files · click any file to view it here (syntax-highlighted)</div>
          <ul>
            ${items}
          </ul>
        </div>`;
      }
    }

    const out = renderPage({
      shortTitle: titles[rel].shortTitle,
      description,
      category: cat,
      sourceRel: rel,
      rootRel,
      headings: ctx.headings,
      body: html,
      hasMermaid: ctx.hasMermaid,
      meta: num !== null ? challengeMeta[num] : null,
      pager,
      filetree,
    });

    const outPath = path.join(ROOT, rel.replace(/\.md$/, '.html'));
    fs.writeFileSync(outPath, out);
    rendered++;
  }

  // Emit builder-data.json (ordered by challenge number).
  const builder = Object.values(challengeMeta)
    .sort((a, b) => a.num - b.num)
    .map(c => ({
      num: c.num,
      badge: c.badge,
      title: c.shortTitle,
      url: c.htmlRel,
      est: c.est,
      hoursMin: c.hoursMin,
      hoursMax: c.hoursMax,
      level: c.level,
      roles: c.roles,
      theme: c.theme || '',
      dependsOn: c.dependsOn || [],
      stretch: c.num === 6,
    }));
  fs.writeFileSync(path.join(ROOT, 'builder-data.json'), JSON.stringify({ challenges: builder }, null, 2) + '\n');

  const codeIndex = buildCodeIndex();

  console.log(`✓ Rendered ${rendered} pages`);
  console.log(`✓ builder-data.json: ${builder.length} challenges`);
  console.log(`✓ code-index.json: ${codeIndex.total} files · ${codeIndex.groups} components`);
}

build();
