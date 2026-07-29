export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const userAgent = request.headers.get("user-agent") || "";

    // 1. Root route
    if (path === "/" || path === "/index.html") {
      return fetch("https://tonghann65.github.io/prolite/");
    }

    // 2. API: List links
    if (path === "/api/list") {
      const results = await env.DB.prepare(
        "SELECT * FROM links ORDER BY created_at DESC"
      ).all();
      return Response.json(results.results);
    }

    // 3. API: Create link
    if (path === "/api/create" && request.method === "POST") {
      const body = await request.json();
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

    // 4. API: Update link
    if (path === "/api/update" && request.method === "POST") {
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

    // 5. Short Link Redirection & Bot Preview Handler (D1 Database)
    const slug = path.slice(1);
    if (slug) {
      // ទាញយកទិន្នន័យពី D1 Database តាមរយៈ Slug
      const link = await env.DB.prepare(
        "SELECT * FROM links WHERE slug = ?"
      ).bind(slug).first();

      if (!link) {
        return new Response("Link not found or expired.", { status: 404 });
      }

      const ua = userAgent.toLowerCase();
      const isSocialBot = ua.includes("twitterbot") || ua.includes("telegrambot");

      if (isSocialBot) {
        const html = `<!DOCTYPE html>
        <html lang="km">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${link.title || "Preview"}</title>
            
            <!-- Twitter Summary Large Image Card Meta Tags -->
            <meta name="twitter:card" content="summary_large_image">
            <meta name="twitter:title" content="${link.title || "Exclusive Video"}">
            <meta name="twitter:description" content="Click to view">
            <meta name="twitter:image" content="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe">
        </head>
        <body></body>
        </html>`;

        return new Response(html, {
          headers: { "Content-Type": "text/html;charset=UTF-8" },
        });
      }

      // សម្រាប់អ្នកប្រើប្រាស់ធម្មតា ឱ្យ Redirect ទៅកាន់ Original URL ភ្លាមៗ
      return Response.redirect(link.original_url, 302);
    }

    return new Response("Not found", { status: 404 });
  },
};
