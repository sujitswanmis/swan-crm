import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const DEFAULT_MODELS = [
  "gpt-4o-mini",
  "gpt-4o",
  "gpt-4-turbo",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-5",
  "gpt-5-mini",
  "gpt-5.4-mini",
  "gpt-5.5",
  "gpt-5.5-instant",
  "gpt-5.5-thinking",
  "gpt-5.5-pro",
  "o3-mini",
  "o1"
];

export async function GET() {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    let fetchedModels = [];

    if (apiKey) {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        cache: 'no-store'
      });

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.data)) {
          // Filter for general chat/completion models
          fetchedModels = data.data
            .map(m => m.id)
            .filter(id => {
              const isChatPrefix = id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4');
              const isExcluded = id.includes('embedding') || 
                                 id.includes('tts') || 
                                 id.includes('whisper') || 
                                 id.includes('transcribe') || 
                                 id.includes('realtime') || 
                                 id.includes('audio') || 
                                 id.includes('image');
              return isChatPrefix && !isExcluded;
            });
        }
      }
    }

    // Merge default/custom models & fetched OpenAI models, deduplicating
    const allModelsSet = new Set([
      "gpt-4o-mini",
      "gpt-4o",
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-5",
      "gpt-5-mini",
      "gpt-5.4-mini",
      "gpt-5.5-instant",
      "gpt-5.5-thinking",
      "gpt-5.5-pro",
      "o3-mini",
      "o1",
      ...fetchedModels
    ]);

    // Helper to calculate model rank score for descending order
    const getModelScore = (model) => {
      const explicit = {
        'gpt-5.5-pro': 553,
        'gpt-5.5-thinking': 552,
        'gpt-5.5-instant': 551,
        'gpt-5.5': 550,
        'gpt-5.4-pro': 543,
        'gpt-5.4-mini': 542,
        'gpt-5.4': 540,
        'gpt-5.2': 520,
        'gpt-5.1': 510,
        'gpt-5-pro': 503,
        'gpt-5-mini': 501,
        'gpt-5': 500,
        'gpt-4.1': 410,
        'gpt-4.1-mini': 409,
        'gpt-4o': 405,
        'gpt-4o-mini': 404,
        'gpt-4-turbo': 401,
        'gpt-4': 400,
        'gpt-3.5-turbo': 350,
        'o3-mini': 200,
        'o1': 100
      };
      if (explicit[model] !== undefined) return explicit[model];

      const match = model.match(/(\d+(?:\.\d+)?)/);
      if (match) {
        return parseFloat(match[1]) * 100;
      }
      return 0;
    };

    const sortedModels = Array.from(allModelsSet).sort((a, b) => {
      const scoreA = getModelScore(a);
      const scoreB = getModelScore(b);
      if (scoreA !== scoreB) {
        return scoreB - scoreA; // Descending
      }
      return b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' });
    });

    return NextResponse.json({ models: sortedModels, liveSynced: fetchedModels.length > 0 }, { status: 200 });
  } catch (error) {
    console.error('Error fetching AI models:', error);
    return NextResponse.json({ models: DEFAULT_MODELS, liveSynced: false }, { status: 200 });
  }
}
