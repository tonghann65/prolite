export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const userAgent = request.headers.get("user-agent") || "";
    const clientIP = request.headers.get("cf-connecting-ip") || "unknown";

    // 1. ប្រព័ន្ធទប់ស្កាត់ Bot មិនល្អ និង Script ស្វ័យប្រវត្តិ
    const isBadBot = /curl|wget|python|php|crawler|spider|scraper/i.test(userAgent);
    if (isBadBot && url.pathname !== "/" && url.pathname !== "/index.html" && !url.pathname.startsWith("/api/list")) {
      return new Response("Access Denied for Bots", { status: 403 });
    }

    // ភ្ជាប់ទៅកាន់ GitHub Pages របស់អ្នក
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return fetch("https://tonghann65.github.io/prolite/");
    }

    if (url.pathname === "/api/list") {
      const { results } = await env.DB.prepare(
        "SELECT * FROM links ORDER BY created_at DESC"
      ).all();
      return Response.json(results);
    }

    // 2. API បង្កើត Link ព្រមទាំងប្រព័ន្ធ Rate Limiting ការពារ IP Spam
    if (url.pathname === "/api/create" && request.method === "POST") {
      try {
        const now = Date.now();
        // ពិនិត្យមើលថាតើតារាង rate_limits មានឬអត់ ដើម្បីការពារ Error
        const checkRate = await env.DB.prepare(
          "SELECT last_created FROM rate_limits WHERE ip = ? LIMIT 1"
        ).bind(clientIP).all();

        if (checkRate && checkRate.results && checkRate.results.length > 0) {
          const lastCreated = checkRate.results[0].last_created;
          if (now - lastCreated < 4000) { // រង់ចាំយ៉ាងតិច ៤ វិនាទី ទើបអាចបង្កើតម្ដងទៀត
            return Response.json(
              { success: false, error: "Rate limit exceeded. Please wait a few seconds." },
              { status: 429 }
            );
          }
          await env.DB.prepare(
            "UPDATE rate_limits SET last_created = ? WHERE ip = ?"
          ).bind(now, clientIP).run();
        } else {
          await env.DB.prepare(
            "INSERT OR REPLACE INTO rate_limits (ip, last_created) VALUES (?, ?)"
          ).bind(clientIP, now).run();
        }
      } catch (e) {
        // ប្រសិនបើមិនទាន់បង្កើតតារាង rate_limits វានឹងរំលងស្វ័យប្រវត្តិដោយមិនធ្វើឱ្យខូចកូដ
      }

      const body = await request.json();
      
      if (!body.slug || !body.url) {
        return Response.json({ success: false, error: "Missing slug or url" }, { status: 400 });
      }

      await env.DB.prepare(
        "INSERT INTO links (slug, original_url, title, created_at) VALUES (?, ?, ?, ?)"
      ).bind(
        body.slug,
        body.url,
        body.title || "",
        Date.now()
      ).run();
      
      return Response.json({ success: true });
    }

    if (url.pathname === "/api/update" && request.method === "POST") {
      const body = await request.json();
      await env.DB.prepare(
        "UPDATE links SET original_url=?, title=? WHERE slug=?"
      ).bind(
        body.url,
        body.title || "",
        body.slug
      ).run();
      return Response.json({ success: true });
    }

    if (url.pathname.startsWith("/api/delete/")) {
      const slug = url.pathname.split("/").pop();
      await env.DB.prepare("DELETE FROM links WHERE slug=?")
        .bind(slug)
        .run();
      return Response.json({ success: true });
    }

    // 3. ប្រព័ន្ធ Redirect និងបូកចំនួន Click យ៉ាងរលូន
    const slug = url.pathname.substring(1);

    if (slug && !slug.startsWith("api")) {
      const { results } = await env.DB.prepare(
        "SELECT original_url FROM links WHERE slug=? LIMIT 1"
      ).bind(slug).all();

      if (results && results.length > 0) {
        await env.DB.prepare(
          "UPDATE links SET clicks = clicks + 1 WHERE slug = ?"
        ).bind(slug).run();

        return Response.redirect(results[0].original_url, 302);
      }
    }

    return new Response("404 Not Found", { status: 404 });
  }
}
