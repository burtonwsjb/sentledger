/** @jsxImportSource hono/jsx */
import type { Child } from "hono/jsx";
import { raw } from "hono/html";
import { env } from "../env";

export const Logo = () => (
  <svg viewBox="0 0 32 32" aria-hidden="true">
    <rect x="3" y="3" width="26" height="26" rx="7" fill="var(--accent)" />
    <path d="M9 11h10M9 16h7M9 21h5" stroke="var(--paper)" stroke-width="2.2" stroke-linecap="round" />
    <path d="M18.5 20.5l2.6 2.6 5-5.4" stroke="var(--paper)" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);

const I = (d: string) => () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{raw(d)}</svg>
);
export const Icons = {
  send: I('<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4Z"/>'),
  eye: I('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'),
  ledger: I('<path d="M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4Z"/><path d="M8 9h8M8 13h8M8 17h4"/>'),
  lock: I('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  plug: I('<path d="M9 2v6M15 2v6"/><path d="M6 8h12v4a6 6 0 0 1-12 0Z"/><path d="M12 18v4"/>'),
  code: I('<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>'),
  file: I('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6"/>'),
  chart: I('<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>'),
  users: I('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>'),
  template: I('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>'),
  hash: I('<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>'),
  shield: I('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>'),
  scale: I('<path d="M12 3v18M5 21h14M6 7h12M6 7l-3 7a3 3 0 0 0 6 0Zm12 0-3 7a3 3 0 0 0 6 0Z"/>'),
  wrench: I('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4Z"/>'),
  building: I('<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3"/>'),
  briefcase: I('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>'),
  cpu: I('<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>'),
  mail: I('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'),
  clock: I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  download: I('<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>'),
};

const NAV = [
  ["/features", "Features"], ["/use-cases", "Use cases"], ["/developers", "Developers"], ["/integrations", "Integrations"],
  ["/security", "Security"], ["/pricing", "Pricing"],
] as const;

export function Layout(props: { title: string; description: string; path: string; children: Child; noindex?: boolean }) {
  const full = props.path === "/" ? "SentLedger — Sent-message records, tracking and evidence timelines" : `${props.title} · SentLedger`;
  const url = `${env.PUBLIC_URL}${props.path === "/" ? "" : props.path}`;
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{full}</title>
        <meta name="description" content={props.description} />
        <link rel="canonical" href={url} />
        {props.noindex && <meta name="robots" content="noindex" />}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="SentLedger" />
        <meta property="og:title" content={full} />
        <meta property="og:description" content={props.description} />
        <meta property="og:url" content={url} />
        <meta name="twitter:card" content="summary" />
        <meta name="theme-color" content="#0f5c4d" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Source+Serif+4:opsz,wght@8..60,500;8..60,600&display=swap" />
        <link rel="stylesheet" href="/site.css" />
        {raw(`<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "SoftwareApplication", name: "SentLedger", applicationCategory: "BusinessApplication", operatingSystem: "Web", url: env.PUBLIC_URL, description: "Sent-message records, email tracking, secure files and exportable evidence timelines, from a web app or API." })}</script>`)}
      </head>
      <body>
        <a class="skip" href="#main">Skip to content</a>
        <header class="nav" id="nav">
          <div class="wrap">
            <a class="logo" href="/" aria-label="SentLedger home"><Logo />SentLedger</a>
            <nav class="nav-links" aria-label="Primary">
              {NAV.map(([href, label]) => <a href={href} aria-current={props.path.startsWith(href) ? "page" : undefined}>{label}</a>)}
              <a class="mobile-only" href="/app/login">Log in</a>
              <a class="mobile-only" href="/app/signup"><b>Start free trial</b></a>
            </nav>
            <div class="nav-cta">
              <a class="btn btn-ghost" href="/app/login">Log in</a>
              <a class="btn btn-primary" href="/app/signup">Start free trial</a>
            </div>
            <button class="menu-btn" aria-expanded="false" aria-controls="nav" type="button" data-menu>Menu</button>
          </div>
        </header>
        <main id="main">{props.children}</main>
        <footer>
          <div class="wrap">
            <div class="foot">
              <div>
                <a class="logo" href="/"><Logo />SentLedger</a>
                <p style="margin-top:14px;max-width:26em;font-size:.92rem">A clear record of what you sent, when it was delivered, and what happened next — from the web app or through the API.</p>
              </div>
              <div><h4>Product</h4><ul><li><a href="/features">Features</a></li><li><a href="/pricing">Pricing</a></li><li><a href="/integrations">Integrations</a></li><li><a href="/security">Security &amp; privacy</a></li></ul></div>
              <div><h4>Developers</h4><ul><li><a href="/developers">API overview</a></li><li><a href="/developers/reference">API reference</a></li><li><a href="/v1/openapi.json">OpenAPI spec</a></li><li><a href="/developers#webhooks">Webhooks</a></li></ul></div>
              <div><h4>Company</h4><ul><li><a href="/use-cases">Use cases</a></li><li><a href="/contact">Contact sales</a></li><li><a href="/contact?topic=support">Support</a></li><li><a href="/abuse">Report abuse</a></li></ul></div>
              <div><h4>Legal</h4><ul><li><a href="/legal/terms">Terms of Service</a></li><li><a href="/legal/privacy">Privacy Policy</a></li><li><a href="/legal/acceptable-use">Acceptable Use</a></li><li><a href="/legal/cookies">Cookie Policy</a></li></ul></div>
            </div>
            <div class="copy"><span>© {new Date().getFullYear()} SentLedger. All rights reserved.</span><span>Tracked events are technical records, not proof of reading. <a href="/security#limits">Learn why</a>.</span></div>
          </div>
        </footer>
        <script src="/site.js" defer></script>
      </body>
    </html>
  );
}

export const SITE_JS = `
(function(){
  var b=document.querySelector('[data-menu]'),n=document.getElementById('nav');
  if(b&&n)b.addEventListener('click',function(){var o=n.classList.toggle('open');b.setAttribute('aria-expanded',o?'true':'false')});
  document.querySelectorAll('[data-tabs]').forEach(function(g){
    var btns=g.querySelectorAll('[role=tab]');
    btns.forEach(function(t){t.addEventListener('click',function(){
      btns.forEach(function(x){x.setAttribute('aria-selected','false');var p=document.getElementById(x.getAttribute('aria-controls'));if(p)p.hidden=true});
      t.setAttribute('aria-selected','true');var p=document.getElementById(t.getAttribute('aria-controls'));if(p)p.hidden=false;
    })});
  });
  var tg=document.querySelector('[data-billing-toggle]');
  if(tg){tg.querySelectorAll('button').forEach(function(btn){btn.addEventListener('click',function(){
    tg.querySelectorAll('button').forEach(function(x){x.setAttribute('aria-pressed','false')});btn.setAttribute('aria-pressed','true');
    var y=btn.dataset.interval==='year';document.querySelectorAll('[data-m]').forEach(function(el){el.textContent=y?el.dataset.y:el.dataset.m});
    document.querySelectorAll('[data-per]').forEach(function(el){el.textContent=y?el.dataset.pery:el.dataset.perm});
  })})}
  document.querySelectorAll('form[data-api]').forEach(function(f){f.addEventListener('submit',function(e){
    e.preventDefault();var out=f.querySelector('[data-result]'),btn=f.querySelector('button[type=submit]');btn.disabled=true;
    var d={};new FormData(f).forEach(function(v,k){if(v!=='')d[k]=v});
    fetch(f.getAttribute('data-api'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)})
    .then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j}})})
    .then(function(r){out.hidden=false;out.className='alert '+(r.ok?'ok':'err');out.textContent=r.ok?(f.dataset.success||'Thanks — we received your message.'):((r.j.error&&r.j.error.message)||'Something went wrong.');if(r.ok)f.reset()})
    .catch(function(){out.hidden=false;out.className='alert err';out.textContent='Network error. Please try again.'})
    .finally(function(){btn.disabled=false});
  })});
})();
`;
