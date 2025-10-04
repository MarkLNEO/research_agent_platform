import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ResearchRequest {
  query: string;
  url?: string;
  type: "search" | "extract" | "both";
  max_results?: number;
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  displayUrl: string;
}

interface ExtractedContent {
  url: string;
  content: string;
  success: boolean;
  error?: string;
}

async function searchDuckDuckGo(query: string, maxResults: number = 10): Promise<SearchResult[]> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo search failed: ${response.status}`);
    }

    const html = await response.text();

    const results: SearchResult[] = [];
    const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([^<]*)<\/a>/g;

    let match;
    while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
      let cleanUrl = match[1];

      if (cleanUrl.includes('uddg=')) {
        const urlMatch = cleanUrl.match(/uddg=([^&]+)/);
        if (urlMatch && urlMatch[1]) {
          cleanUrl = decodeURIComponent(urlMatch[1]);
        }
      }

      results.push({
        title: match[2].trim(),
        url: cleanUrl,
        snippet: match[3].trim(),
        displayUrl: cleanUrl.replace(/^https?:\/\//, '').split('/')[0]
      });
    }

    return results.slice(0, maxResults);
  } catch (error) {
    console.error('DuckDuckGo search error:', error);
    return [];
  }
}

async function extractContentWithJina(url: string): Promise<ExtractedContent> {
  try {
    const jinaUrl = `https://r.jina.ai/${url}`;

    const response = await fetch(jinaUrl, {
      headers: {
        'Accept': 'application/json',
        'X-Return-Format': 'markdown',
      },
    });

    if (!response.ok) {
      return {
        url,
        content: '',
        success: false,
        error: `Jina extraction failed: ${response.status}`
      };
    }

    const content = await response.text();

    return {
      url,
      content: content.slice(0, 50000),
      success: true
    };
  } catch (error) {
    console.error('Jina extraction error:', error);
    return {
      url,
      content: '',
      success: false,
      error: String(error)
    };
  }
}

async function extractMultipleUrls(urls: string[]): Promise<ExtractedContent[]> {
  const promises = urls.map(url => extractContentWithJina(url));
  return await Promise.all(promises);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { query, url, type = "both", max_results = 10 }: ResearchRequest = await req.json();

    if (!query && !url) {
      throw new Error("Either query or url must be provided");
    }

    const result: any = {};

    if (type === "search" || type === "both") {
      if (query) {
        console.log(`Searching DuckDuckGo for: ${query}`);
        result.search_results = await searchDuckDuckGo(query, max_results);
      }
    }

    if (type === "extract" || type === "both") {
      if (url) {
        console.log(`Extracting content from: ${url}`);
        result.extracted_content = await extractContentWithJina(url);
      } else if (result.search_results && result.search_results.length > 0) {
        console.log(`Extracting content from top search results`);
        const topUrls = result.search_results.slice(0, 3).map((r: SearchResult) => r.url);
        result.extracted_contents = await extractMultipleUrls(topUrls);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        ...result
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    console.error("Error in web-research function:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: String(error?.message || error)
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
