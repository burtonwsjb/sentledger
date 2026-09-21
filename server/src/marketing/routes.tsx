/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import { env } from "../env";
import { db } from "../lib/db";
import type { AppEnv } from "../lib/auth";
import { SITE_CSS } from "./css";
import { SITE_JS } from "./layout";
import { Abuse, Contact, Developers, Features, Home, Integrations, Pricing, Reference, Security, UseCases } from "./pages";
import { AcceptableUse, Cookies, Privacy, Terms } from "./legal";

export const marketing = new Hono<AppEnv>();

const cache = (c: any, seconds = 300) => c.header("Cache-Control", `public, max-age=${seconds}, stale-while-revalidate=86400`);

marketing.get("/site.css", (c) => { cache(c, 3600); return c.body(SITE_CSS, 200, { "Content-Type": "text/css; charset=utf-8" }); });
marketing.get("/site.js", (c) => { cache(c, 3600); return c.body(SITE_JS, 200, { "Content-Type": "application/javascript; charset=utf-8" }); });

marketing.get("/", (c) => { cache(c); return c.html(<Home />); });
marketing.get("/features", (c) => { cache(c); return c.html(<Features />); });
marketing.get("/pricing", async (c) => {
  cache(c, 120);
  const { data } = await db.from("plans").select("id, name, description, price_monthly_cents, price_annual_cents, entitlements").eq("is_public", true).order("sort");
  return c.html(<Pricing plans={(data ?? []) as any[]} />);
});
marketing.get("/security", (c) => { cache(c); return c.html(<Security />); });
marketing.get("/developers", (c) => { cache(c); return c.html(<Developers />); });
marketing.get("/developers/reference", (c) => {
  cache(c);
  // Scalar renders the live OpenAPI spec; it needs inline styles/scripts it injects itself.
  c.header("Content-Security-Policy", "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'");
  return c.html(<Reference />);
});
marketing.get("/integrations", (c) => { cache(c); return c.html(<Integrations />); });
marketing.get("/use-cases", (c) => { cache(c); return c.html(<UseCases />); });
marketing.get("/contact", (c) => c.html(<Contact topic={c.req.query("topic")} />));
marketing.get("/abuse", (c) => c.html(<Abuse />));
marketing.get("/legal/terms", (c) => { cache(c); return c.html(<Terms />); });
marketing.get("/legal/privacy", (c) => { cache(c); return c.html(<Privacy />); });
marketing.get("/legal/acceptable-use", (c) => { cache(c); return c.html(<AcceptableUse />); });
marketing.get("/legal/cookies", (c) => { cache(c); return c.html(<Cookies />); });
marketing.get("/login", (c) => c.redirect("/app/login"));
marketing.get("/signup", (c) => c.redirect("/app/signup"));

marketing.get("/robots.txt", (c) => c.text(`User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /t/\nDisallow: /f/\nDisallow: /u/\nSitemap: ${env.PUBLIC_URL}/sitemap.xml\n`));
marketing.get("/sitemap.xml", (c) => {
  const paths = ["", "/features", "/pricing", "/security", "/developers", "/developers/reference", "/integrations", "/use-cases", "/contact", "/legal/terms", "/legal/privacy", "/legal/acceptable-use", "/legal/cookies"];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((p) => `<url><loc>${env.PUBLIC_URL}${p}</loc></url>`).join("")}</urlset>`;
  return c.body(xml, 200, { "Content-Type": "application/xml" });
});
