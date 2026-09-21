export const SITE_CSS = String.raw`
:root{
  --paper:#f7f6f2;--paper-2:#efede6;--card:#ffffff;--ink:#14181a;--ink-2:#3b4246;--muted:#667075;--line:#dfddd4;--line-2:#e9e7df;
  --accent:#0f5c4d;--accent-2:#0b4a3e;--accent-soft:#e1efe9;--accent-ink:#0b4a3e;--gold:#a8741a;--gold-soft:#f6ecd8;
  --danger:#a33a2c;--warn:#8a5a00;--ok:#1b6b45;--shadow:0 1px 2px rgba(20,24,26,.05),0 8px 24px -12px rgba(20,24,26,.18);
  --serif:"Source Serif 4",Georgia,"Times New Roman",serif;--sans:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  --r:12px;--max:1160px;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --paper:#0e1211;--paper-2:#131816;--card:#161c1a;--ink:#edf1ef;--ink-2:#c4ccc8;--muted:#8d9894;--line:#27302d;--line-2:#1f2624;
  --accent:#58c2a6;--accent-2:#7bd3bb;--accent-soft:#16302a;--accent-ink:#9fe0ce;--gold:#e0b25c;--gold-soft:#2a2213;
  --danger:#f08a7a;--warn:#e7b85a;--ok:#6fd39e;--shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px -12px rgba(0,0,0,.6);
}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.6 var(--sans);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
a{color:var(--accent);text-decoration-thickness:1px;text-underline-offset:3px}a:hover{color:var(--accent-2)}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:4px}
img,svg{max-width:100%}
.wrap{max-width:var(--max);margin:0 auto;padding:0 20px}
.skip{position:absolute;left:-999px;top:8px;background:var(--card);padding:8px 12px;border-radius:8px;z-index:100}.skip:focus{left:12px}
h1,h2,h3{font-family:var(--serif);font-weight:600;letter-spacing:-.015em;line-height:1.15;margin:0 0 .5em;color:var(--ink)}
h1{font-size:clamp(2.2rem,5.2vw,3.9rem)}h2{font-size:clamp(1.7rem,3.4vw,2.5rem)}h3{font-size:1.25rem}
p{margin:0 0 1em;color:var(--ink-2)}.lead{font-size:clamp(1.05rem,1.6vw,1.25rem);color:var(--ink-2);max-width:40em}
.eyebrow{font:600 .78rem/1 var(--sans);letter-spacing:.12em;text-transform:uppercase;color:var(--accent);margin-bottom:14px;display:inline-flex;gap:8px;align-items:center}
.eyebrow::before{content:"";width:18px;height:1px;background:currentColor}
.mono{font-family:var(--mono);font-size:.86em}
/* header */
.nav{position:sticky;top:0;z-index:40;background:color-mix(in srgb,var(--paper) 88%,transparent);backdrop-filter:saturate(1.2) blur(10px);border-bottom:1px solid var(--line-2)}
.nav .wrap{display:flex;align-items:center;gap:24px;height:64px}
.logo{display:flex;align-items:center;gap:10px;font:700 1.12rem/1 var(--sans);letter-spacing:-.02em;color:var(--ink);text-decoration:none}
.logo svg{width:26px;height:26px}
.nav-links{display:flex;gap:4px;margin-left:12px}.nav-links a{color:var(--ink-2);text-decoration:none;padding:8px 10px;border-radius:8px;font-size:.94rem}
.nav-links a:hover,.nav-links a[aria-current="page"]{color:var(--ink);background:var(--paper-2)}
.nav-cta{margin-left:auto;display:flex;gap:10px;align-items:center}
.mobile-only{display:none}
.menu-btn{display:none;margin-left:auto;background:none;border:1px solid var(--line);border-radius:8px;padding:8px 10px;color:var(--ink);font:inherit}
@media (max-width:520px){.nav-cta{display:none}}
@media (max-width:920px){.nav-links,.nav-cta .btn-ghost{display:none}.menu-btn{display:block}.nav-cta{margin-left:0}
  .nav.open .nav-links .mobile-only{display:block}
  .nav.open .nav-links{display:flex;position:absolute;top:64px;left:0;right:0;flex-direction:column;background:var(--paper);border-bottom:1px solid var(--line);padding:12px 20px 20px;margin:0}}
/* buttons */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:10px;padding:11px 18px;font:600 .95rem/1.1 var(--sans);text-decoration:none;border:1px solid transparent;cursor:pointer;transition:background .15s,border-color .15s,transform .15s;white-space:nowrap}
.btn-primary{background:var(--accent);color:#fff}.btn-primary:hover{background:var(--accent-2);color:#fff}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .btn-primary{color:#07130f}:root:not([data-theme="light"]) .btn-primary:hover{color:#07130f}}
.btn-ghost{background:transparent;color:var(--ink);border-color:var(--line)}.btn-ghost:hover{background:var(--paper-2);color:var(--ink)}
.btn-lg{padding:14px 22px;font-size:1rem}
/* sections */
section{padding:88px 0}.section-tight{padding:56px 0}.alt{background:var(--paper-2);border-top:1px solid var(--line-2);border-bottom:1px solid var(--line-2)}
.center{text-align:center}.center .lead{margin-left:auto;margin-right:auto}
.grid{display:grid;gap:20px}.g2{grid-template-columns:repeat(2,1fr)}.g3{grid-template-columns:repeat(3,1fr)}.g4{grid-template-columns:repeat(4,1fr)}
@media (max-width:900px){.g3,.g4{grid-template-columns:repeat(2,1fr)}}@media (max-width:620px){.g2,.g3,.g4{grid-template-columns:1fr}section{padding:64px 0}}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:24px;box-shadow:var(--shadow)}
.card h3{font-family:var(--sans);font-size:1.02rem;font-weight:650;letter-spacing:-.01em;margin-bottom:6px}.card p{font-size:.95rem;margin:0}
.icon{width:38px;height:38px;border-radius:10px;background:var(--accent-soft);color:var(--accent-ink);display:grid;place-items:center;margin-bottom:14px}
.icon svg{width:20px;height:20px}
/* hero */
.hero{padding:72px 0 40px;position:relative;overflow:hidden}
.hero-grid{display:grid;grid-template-columns:1.02fr 1fr;gap:56px;align-items:center}
@media (max-width:980px){.hero-grid{grid-template-columns:1fr;gap:40px}}
.hero-cta{display:flex;gap:12px;flex-wrap:wrap;margin:28px 0 18px}.fine{font-size:.86rem;color:var(--muted)}
.rule{height:1px;background:repeating-linear-gradient(90deg,var(--line) 0 6px,transparent 6px 10px);margin:0}
/* product preview: ledger */
.preview{background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:0 30px 60px -30px rgba(20,24,26,.35),var(--shadow);overflow:hidden}
.preview-bar{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--line-2);font-size:.82rem;color:var(--muted)}
.dots{display:flex;gap:6px}.dots i{width:9px;height:9px;border-radius:50%;background:var(--line)}
.pv-head{padding:18px 20px 14px;border-bottom:1px solid var(--line-2)}
.pv-sub{font-size:.8rem;color:var(--muted)}.pv-subject{font:600 1.02rem/1.35 var(--sans);margin:4px 0 10px;color:var(--ink)}
.chips{display:flex;flex-wrap:wrap;gap:6px}.chip{font:500 .74rem/1 var(--sans);padding:5px 8px;border-radius:999px;background:var(--paper-2);color:var(--ink-2);border:1px solid var(--line-2)}
.chip.ok{background:var(--accent-soft);color:var(--accent-ink);border-color:transparent}.chip.warn{background:var(--gold-soft);color:var(--gold);border-color:transparent}
.tl{list-style:none;margin:0;padding:10px 20px 16px}
.tl li{display:grid;grid-template-columns:18px 1fr auto;gap:12px;padding:10px 0;position:relative}
.tl li::before{content:"";position:absolute;left:8px;top:28px;bottom:-6px;width:1px;background:var(--line)}.tl li:last-child::before{display:none}
.tl .dot{width:17px;height:17px;border-radius:50%;border:2px solid var(--accent);background:var(--card);margin-top:3px}
.tl .dot.gold{border-color:var(--gold)}.tl .dot.muted{border-color:var(--line)}
.tl b{display:block;font-size:.9rem;font-weight:600;color:var(--ink)}.tl span{font-size:.8rem;color:var(--muted)}.tl time{font:500 .76rem var(--mono);color:var(--muted);white-space:nowrap;padding-top:2px}
.hash{font:.72rem/1.4 var(--mono);color:var(--muted);padding:12px 20px;border-top:1px solid var(--line-2);background:var(--paper);display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
.hash .ok{color:var(--ok)}
/* logos/trust strip */
.strip{display:flex;flex-wrap:wrap;gap:10px 28px;align-items:center;justify-content:center;color:var(--muted);font-size:.92rem}
.strip span{display:inline-flex;align-items:center;gap:8px}
/* split feature */
.split>*,.grid>*,.hero-grid>*{min-width:0}
.split{display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:center}.split.rev>:first-child{order:2}
@media (max-width:900px){.split{grid-template-columns:1fr;gap:32px}.split.rev>:first-child{order:0}}
.checks{list-style:none;padding:0;margin:18px 0 0}.checks li{padding:7px 0 7px 30px;position:relative;color:var(--ink-2)}
.checks li::before{content:"";position:absolute;left:0;top:11px;width:18px;height:18px;border-radius:50%;background:var(--accent-soft) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%230f5c4d' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 12l5 5L20 7'/%3E%3C/svg%3E") center/11px no-repeat}
/* code block */
pre.code{background:#0f1413;color:#dfe8e4;border-radius:12px;padding:20px;overflow:auto;font:.84rem/1.6 var(--mono);margin:0;border:1px solid #1f2a27}
.code .k{color:#7fd1b9}.code .s{color:#e8c07d}.code .c{color:#6f7f7a}
.tabs{display:flex;gap:4px;margin-bottom:10px;flex-wrap:wrap}.tabs button{font:500 .82rem var(--sans);padding:6px 10px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--ink-2);cursor:pointer}
.tabs button[aria-selected="true"]{background:var(--ink);color:var(--paper);border-color:var(--ink)}
/* table preview */
.mtable{width:100%;border-collapse:collapse;font-size:.86rem}.mtable th{text-align:left;font-weight:600;color:var(--muted);font-size:.74rem;text-transform:uppercase;letter-spacing:.06em;padding:10px 14px;border-bottom:1px solid var(--line)}
.mtable td{padding:12px 14px;border-bottom:1px solid var(--line-2);color:var(--ink-2)}.mtable tr:last-child td{border-bottom:0}
.status{display:inline-flex;align-items:center;gap:6px;font-weight:500;font-size:.8rem}.status::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
.s-open{color:var(--accent)}.s-deliv{color:var(--ink-2)}.s-bounce{color:var(--danger)}.s-click{color:var(--gold)}
/* pricing */
.plans{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}@media (max-width:1000px){.plans{grid-template-columns:repeat(2,1fr)}}@media (max-width:620px){.plans{grid-template-columns:1fr}}
.plan{display:flex;flex-direction:column}.plan.featured{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent),var(--shadow)}
.plan .price{font:600 2rem/1.1 var(--serif);margin:10px 0 2px}.plan .per{font-size:.85rem;color:var(--muted)}.plan ul{list-style:none;padding:0;margin:18px 0 22px;flex:1}
.plan li{padding:6px 0;font-size:.92rem;color:var(--ink-2);border-bottom:1px dashed var(--line-2)}.plan li:last-child{border:0}
.toggle{display:inline-flex;background:var(--paper-2);border:1px solid var(--line);border-radius:10px;padding:4px;margin:18px 0 32px}
.toggle button{border:0;background:none;padding:8px 14px;border-radius:7px;font:600 .88rem var(--sans);color:var(--ink-2);cursor:pointer}.toggle button[aria-pressed="true"]{background:var(--card);color:var(--ink);box-shadow:var(--shadow)}
/* faq */
details{border-bottom:1px solid var(--line);padding:18px 0}details summary{cursor:pointer;font-weight:600;list-style:none;display:flex;justify-content:space-between;gap:16px;color:var(--ink)}
details summary::-webkit-details-marker{display:none}details summary::after{content:"+";font:400 1.4rem/1 var(--sans);color:var(--muted)}details[open] summary::after{content:"–"}
details p{margin:12px 0 0}
/* prose (legal) */
.prose{max-width:760px}.prose h2{font-size:1.5rem;margin-top:2em}.prose h3{font-size:1.1rem;font-family:var(--sans);margin-top:1.6em}.prose li{color:var(--ink-2);margin:.35em 0}
.note{border-left:3px solid var(--gold);background:var(--gold-soft);padding:14px 16px;border-radius:0 10px 10px 0;color:var(--ink-2);font-size:.94rem}
/* forms */
.form{display:grid;gap:14px}.form label{display:grid;gap:6px;font-weight:600;font-size:.9rem}
.form input,.form select,.form textarea{font:inherit;padding:11px 12px;border-radius:9px;border:1px solid var(--line);background:var(--card);color:var(--ink)}
.form textarea{min-height:140px;resize:vertical}.form .hp{position:absolute;left:-5000px}
.alert{padding:12px 14px;border-radius:9px;font-size:.92rem}.alert.ok{background:var(--accent-soft);color:var(--accent-ink)}.alert.err{background:#f9e3df;color:var(--danger)}
/* cta band */
.band{background:var(--ink);color:var(--paper);border-radius:20px;padding:56px;display:grid;grid-template-columns:1.4fr 1fr;gap:32px;align-items:center}
.band h2{color:var(--paper)}.band p{color:color-mix(in srgb,var(--paper) 75%,transparent)}
@media (max-width:820px){.band{grid-template-columns:1fr;padding:36px 24px}}
.band .btn-ghost{color:var(--paper);border-color:color-mix(in srgb,var(--paper) 30%,transparent)}.band .btn-ghost:hover{background:color-mix(in srgb,var(--paper) 10%,transparent);color:var(--paper)}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .band{background:#1c2422;color:var(--ink)}:root:not([data-theme="light"]) .band h2{color:var(--ink)}:root:not([data-theme="light"]) .band p{color:var(--ink-2)}:root:not([data-theme="light"]) .band .btn-ghost{color:var(--ink);border-color:var(--line)}}
/* footer */
footer{border-top:1px solid var(--line);padding:56px 0 40px;margin-top:40px;font-size:.92rem}
.foot{display:grid;grid-template-columns:1.5fr repeat(4,1fr);gap:28px}@media (max-width:820px){.foot{grid-template-columns:1fr 1fr}}
.foot h4{font:600 .78rem var(--sans);letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:0 0 12px}
.foot ul{list-style:none;padding:0;margin:0}.foot li{margin:7px 0}.foot a{color:var(--ink-2);text-decoration:none}.foot a:hover{color:var(--ink)}
.copy{margin-top:40px;color:var(--muted);font-size:.84rem;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
.kicker{display:flex;gap:10px;align-items:baseline}.kicker .n{font:600 .8rem var(--mono);color:var(--accent)}
.stat{font:600 2.2rem/1 var(--serif);color:var(--ink)}
.badge{display:inline-block;font:600 .72rem var(--sans);letter-spacing:.04em;padding:4px 8px;border-radius:6px;background:var(--accent-soft);color:var(--accent-ink)}
.limits{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}@media (max-width:700px){.limits{grid-template-columns:1fr}}
.limits div{border:1px solid var(--line);border-radius:10px;padding:16px;background:var(--card)}.limits b{display:block;margin-bottom:4px}
.limits p{font-size:.9rem;margin:0}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`;
