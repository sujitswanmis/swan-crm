import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

import * as cheerio from 'cheerio';
import pdf from 'pdf-parse';

export async function POST(req) {
  try {
    const formData = await req.formData();
    const title = formData.get('title');
    const type = formData.get('type') || 'text';
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
      if (!file) return NextResponse.json({ error: 'PDF file is required' }, { status: 400 });
      try {
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const pdfData = await pdf(buffer);
        content = pdfData.text.replace(/\s+/g, ' ').trim();
        if (!content) throw new Error("Could not extract text from PDF");
      } catch (err) {
        return NextResponse.json({ error: 'Failed to parse PDF: ' + err.message }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key missing' }, { status: 500 });
    }

    // 1. Generate Embeddings using OpenAI
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

    // 2. Save to Supabase
    const { data, error } = await supabase
      .from('company_documents')
      .insert({
        title,
        content,
        embedding
      })
      .select('id, title, created_at')
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, document: data });

  } catch (error) {
    console.error('Knowledge Base Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('company_documents')
      .select('id, title, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    return NextResponse.json({ documents: data });
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
