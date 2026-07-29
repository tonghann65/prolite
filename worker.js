export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const userAgent = request.headers.get("user-agent") || "";
    const clientIP = request.headers.get("cf-connecting-ip") || "unknown";

    // 1. ប្រព័ន្ធការពារ៖ ប្លុក Bot ទាំងអស់ (រួមទាំង Twitterbot និង Social Bots ផ្សេងទៀត)
    if (/bot|crawler|spider|curl|wget|python|php|twitterbot|facebookexternalhit|telegrambot|whatsapp/i.test(userAgent)) {
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

    // API បង្កើត Link (រួមបញ្ចូល Rate Limiting ការពារ IP Spam)
    if (url.pathname === "/api/create" && request.method === "POST") {
      try {
        const now = Date.now();
        const checkRate = await env.DB.prepare(
          "SELECT last_created FROM rate_limits WHERE ip = ? LIMIT 1"
        ).bind(clientIP).all();

        if (checkRate && checkRate.results.length > 0) {
          const lastCreated = checkRate.results[0].last_created;
          if (now - lastCreated < 5000) { // រង់ចាំយ៉ាងតិច ៥ វិនាទី ទើបអាចបង្កើតម្ដងទៀត
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
            "INSERT INTO rate_limits (ip, last_created) VALUES (?, ?)"
          ).bind(clientIP, now).run();
        }
      } catch (e) {
        // រំលងប្រសិនបើមិនទាន់បង្កើតតារាង rate_limits ក្នុង D1 Database
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
        body.title || "", // ជួសជុល Syntax Error
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

    // 2. ប្រព័ន្ធ Redirect ប្រកបដោយសុវត្ថិភាព និងបូកចំនួន Click
    const slug = url.pathname.substring(1);

    if (slug && !slug.startsWith("api")) {
      const { results } = await env.DB.prepare(
        "SELECT original_url FROM links WHERE slug=? LIMIT 1"
      ).bind(slug).all();

      if (results && results.length > 0 && results[0].original_url) {
        try {
          const targetUrl = new URL(results[0].original_url);
          if (targetUrl.protocol === "http:" || targetUrl.protocol === "https:") {
            await env.DB.prepare(
              "UPDATE links SET clicks = clicks + 1 WHERE slug = ?"
            ).bind(slug).run();

            return Response.redirect(targetUrl.href, 302);
          }
        } catch (e) {
          // URL មិនត្រឹមត្រូវ
        }
      }
    }

    return new Response("404 Not Found", { status: 404 });
  }
}
