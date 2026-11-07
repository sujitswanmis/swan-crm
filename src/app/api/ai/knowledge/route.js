import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

import * as cheerio from 'cheerio';

export async function POST(req) {
  try {
    const formData = await req.formData();
    const title = formData.get('title');
    const type = formData.get('type') || 'text';
    const visibility = formData.get('visibility') || 'internal';
    let content = '';

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    if (type === 'text') {
      content = formData.get('content');
      if (!content) return NextResponse.json({ error: 'Content is required for text type' }, { status: 400 });
    } else if (type === 'url') {
      const url = formData.get('url');
      if (!url) return NextResponse.json({ error: 'URL is required' }, { status: 400 });
      try {
        const response = await fetch(url);
        const html = await response.text();
        const $ = cheerio.load(html);
        // Remove scripts and styles
        $('script, style, nav, footer, header').remove();
        content = $('body').text().replace(/\s+/g, ' ').trim();
        if (!content) throw new Error("Could not extract any text from the URL");
      } catch (err) {
        return NextResponse.json({ error: 'Failed to scrape URL: ' + err.message }, { status: 400 });
      }
    } else if (type === 'pdf') {
      const file = formData.get('file');
      content = formData.get('content');
      
      if (!content && !file) {
        return NextResponse.json({ error: 'PDF file or extracted content is required' }, { status: 400 });
      }
      
      if (!content) {
        try {
          if (typeof global.DOMMatrix === 'undefined') {
            global.DOMMatrix = class DOMMatrix {};
          }
          let pdfParser = require('pdf-parse');
          if (pdfParser && pdfParser.default) {
            pdfParser = pdfParser.default;
          }
          const bytes = await file.arrayBuffer();
          const buffer = Buffer.from(bytes);
          const pdfData = await pdfParser(buffer);
          content = pdfData.text.replace(/\s+/g, ' ').trim();
          if (!content) throw new Error("Could not extract text from PDF");
        } catch (err) {
          return NextResponse.json({ error: 'Failed to parse PDF: ' + err.message }, { status: 400 });
        }
      }
    } else {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    const tenantId = formData.get('tenantId') || formData.get('company') || '';
    const branch = formData.get('branch') || '';

    // 1. Generate Embeddings using OpenAI
    let apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey && tenantId) {
      try {
        const { getRawTenantAiConfig } = require('@/app/actions/aiConfig');
        const rawConfig = await getRawTenantAiConfig(tenantId);
        if (rawConfig?.openai?.api_key) {
          apiKey = rawConfig.openai.api_key;
        }
      } catch (_) {}
    }

    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key missing for knowledge embedding. Please configure OpenAI API Key in AI Admin.' }, { status: 500 });
    }

    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: content,
      })
    });

    if (!embeddingResponse.ok) {
      const errorData = await embeddingResponse.json();
      throw new Error(`OpenAI Embedding Error: ${errorData.error?.message}`);
    }

    const embeddingData = await embeddingResponse.json();
    const embedding = embeddingData.data[0].embedding;

    // 2. Save to Supabase with optional tenant & branch tags
    const tenantPrefix = tenantId ? `[tenant:${tenantId}]` : '';
    const branchPrefix = (branch && branch.toLowerCase() !== 'all') ? `[branch:${branch}]` : '';
    const dbTitle = `${tenantPrefix}${branchPrefix}[${visibility}][${type}]${title}`;
    const { data, error } = await supabase
      .from('company_documents')
      .insert({
        title: dbTitle,
        content,
        embedding
      })
      .select('id, title, created_at')
      .single();

    if (error) {
      throw error;
    }

    // Return document with clean title, type, and branch
    return NextResponse.json({ 
      success: true, 
      document: {
        id: data.id,
        title: title,
        type: type,
        visibility: visibility,
        tenantId: tenantId || null,
        branch: branch || 'all',
        created_at: data.created_at
      } 
    });

  } catch (error) {
    console.error('Knowledge Base Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const reqTenantId = searchParams.get('tenantId') || '';
    const reqCompany = searchParams.get('company') || '';
    const rawFilter = reqTenantId || reqCompany || '';

    const { data, error } = await supabase
      .from('company_documents')
      .select('id, title, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    // Parse the [tenant:xyz], [branch:abc], [visibility], and [type] prefix from titles
    const parsedDocuments = (data || []).map(doc => {
      let rawTitle = doc.title || '';
      let docTenant = null;
      let docBranch = null;

      // Check for [tenant:xxx] prefix
      const tenantMatch = rawTitle.match(/^\[tenant:([^\]]+)\](.*)$/);
      if (tenantMatch) {
        docTenant = tenantMatch[1];
        rawTitle = tenantMatch[2];
      }

      // Check for [branch:xxx] prefix
      const branchMatch = rawTitle.match(/^\[branch:([^\]]+)\](.*)$/);
      if (branchMatch) {
        docBranch = branchMatch[1];
        rawTitle = branchMatch[2];
      }

      let docType = 'text';
      let docVisibility = 'internal';
      let cleanTitle = rawTitle;

      const fullMatch = rawTitle.match(/^\[(public|internal)\]\[(text|url|pdf)\](.*)$/);
      if (fullMatch) {
        docVisibility = fullMatch[1];
        docType = fullMatch[2];
        cleanTitle = fullMatch[3];
      } else {
        const typeMatch = rawTitle.match(/^\[(text|url|pdf)\](.*)$/);
        if (typeMatch) {
          docType = typeMatch[1];
          cleanTitle = typeMatch[2];
        }
      }

      // Auto-detect branch for existing legacy documents if not explicitly tagged
      if (!docBranch) {
        const titleLower = cleanTitle.toLowerCase();
        if (titleLower.includes('multitech') || titleLower.includes('nsmlr') || titleLower.includes('raian')) {
          docBranch = 'NSMLR';
        } else if (titleLower.includes('nstlp') || titleLower.includes('paharuwal') || titleLower.includes('technologies')) {
          docBranch = 'NSTLP';
        } else {
          docBranch = 'all';
        }
      }

      return {
        id: doc.id,
        title: cleanTitle,
        type: docType,
        visibility: docVisibility,
        tenantId: docTenant,
        branch: docBranch,
        created_at: doc.created_at
      };
    });

    // Filter by tenant if provided
    let finalDocuments = parsedDocuments;
    if (rawFilter && rawFilter.toLowerCase() !== 'all') {
      const tLower = reqTenantId.toLowerCase().trim();
      const cLower = reqCompany.toLowerCase().trim();

      const SWAN_IDENTIFIERS = [
        '00000000-0000-0000-0000-000000000001',
        'tnt00002',
        'swan',
        'nsmlr',
        'nstlp',
        'nstl',
        'nse',
        'nse-1',
        'nse-2',
        'nse-6',
        'nscpl',
        'nsacpl'
      ];

      const isSwanRequest = SWAN_IDENTIFIERS.some(id => (tLower && tLower.includes(id)) || (cLower && cLower.includes(id)));

      finalDocuments = parsedDocuments.filter(d => {
        if (!d.tenantId) {
          // Untagged documents belong to primary/swan workspace
          return isSwanRequest;
        }
        const docTenantLower = d.tenantId.toLowerCase().trim();
        if (isSwanRequest) {
          return SWAN_IDENTIFIERS.some(id => docTenantLower.includes(id));
        }
        return docTenantLower === tLower || (cLower && docTenantLower === cLower);
      });
    }

    return NextResponse.json({ documents: finalDocuments });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });
    
    const { error } = await supabase.from('company_documents').delete().eq('id', id);
    if (error) throw error;
    
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
