'use server';

import { createClient as createAdminClient } from '@supabase/supabase-js';

const getAdminSupabase = () => {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
};

const DEFAULT_AI_CONFIG = {
  active_provider: 'openai', // 'openai' | 'gemini' | 'claude'
  openai: {
    api_key: '',
    default_model: 'gpt-4o-mini',
    is_active: true
  },
  gemini: {
    api_key: '',
    default_model: 'gemini-2.0-flash',
    is_active: false
  },
  claude: {
    api_key: '',
    default_model: 'claude-3-5-sonnet',
    is_active: false
  }
};

function getStorageKey(companyOrTenantId) {
  if (!companyOrTenantId) return 'ai_config_default';
  const clean = String(companyOrTenantId).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  return `ai_config_${clean}`;
}

function maskApiKey(key = '') {
  if (!key || typeof key !== 'string') return '';
  const trimmed = key.trim();
  if (trimmed.length <= 8) return '••••••••';
  return `${trimmed.slice(0, 4)}••••••••${trimmed.slice(-4)}`;
}

/**
 * Get tenant AI configuration (OpenAI, Gemini, Claude keys and models)
 */
export async function getTenantAiConfig(companyOrTenantId) {
  try {
    const admin = getAdminSupabase();
    const storageKey = getStorageKey(companyOrTenantId);

    const { data, error } = await admin
      .from('global_role_permissions')
      .select('permissions')
      .eq('id', storageKey)
      .maybeSingle();

    let config = { ...DEFAULT_AI_CONFIG };
    if (!error && data?.permissions) {
      config = {
        ...DEFAULT_AI_CONFIG,
        ...data.permissions,
        openai: { ...DEFAULT_AI_CONFIG.openai, ...(data.permissions.openai || {}) },
        gemini: { ...DEFAULT_AI_CONFIG.gemini, ...(data.permissions.gemini || {}) },
        claude: { ...DEFAULT_AI_CONFIG.claude, ...(data.permissions.claude || {}) },
      };
    }

    const workspaceKeys = {
      openai: Boolean(config.openai.api_key && config.openai.api_key.trim().length > 5),
      gemini: Boolean(config.gemini.api_key && config.gemini.api_key.trim().length > 5),
      claude: Boolean(config.claude.api_key && config.claude.api_key.trim().length > 5)
    };
    const systemKeys = {
      openai: Boolean(process.env.OPENAI_API_KEY?.trim()),
      gemini: Boolean((process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY)?.trim()),
      claude: Boolean((process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY)?.trim())
    };

    // Return safe masked version for UI display
    return {
      success: true,
      config: {
        active_provider: config.active_provider || 'openai',
        openai: {
          default_model: config.openai.default_model || 'gpt-4o-mini',
          is_active: Boolean(config.openai.is_active),
          is_configured: workspaceKeys.openai,
          has_system_fallback: !workspaceKeys.openai && systemKeys.openai,
          is_available: workspaceKeys.openai || systemKeys.openai,
          masked_key: maskApiKey(config.openai.api_key)
        },
        gemini: {
          default_model: config.gemini.default_model || 'gemini-2.0-flash',
          is_active: Boolean(config.gemini.is_active),
          is_configured: workspaceKeys.gemini,
          has_system_fallback: !workspaceKeys.gemini && systemKeys.gemini,
          is_available: workspaceKeys.gemini || systemKeys.gemini,
          masked_key: maskApiKey(config.gemini.api_key)
        },
        claude: {
          default_model: config.claude.default_model || 'claude-3-5-sonnet',
          is_active: Boolean(config.claude.is_active),
          is_configured: workspaceKeys.claude,
          has_system_fallback: !workspaceKeys.claude && systemKeys.claude,
          is_available: workspaceKeys.claude || systemKeys.claude,
          masked_key: maskApiKey(config.claude.api_key)
        }
      }
    };
  } catch (err) {
    console.error('getTenantAiConfig Error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Save tenant AI configuration
 */
export async function saveTenantAiConfig(companyOrTenantId, newConfig) {
  try {
    const admin = getAdminSupabase();
    const storageKey = getStorageKey(companyOrTenantId);

    // Fetch existing raw config to preserve keys if not changed
    const { data: existingData } = await admin
      .from('global_role_permissions')
      .select('permissions')
      .eq('id', storageKey)
      .maybeSingle();

    const existingConfig = existingData?.permissions || DEFAULT_AI_CONFIG;

    // Resolve keys: if incoming key has "••••", keep existing key
    const resolveKey = (newKey, oldKey) => {
      if (!newKey) return '';
      if (newKey.includes('••••')) return oldKey || '';
      return newKey.trim();
    };

    const finalConfig = {
      active_provider: newConfig.active_provider || existingConfig.active_provider || 'openai',
      openai: {
        api_key: resolveKey(newConfig.openai?.api_key, existingConfig.openai?.api_key),
        default_model: newConfig.openai?.default_model || existingConfig.openai?.default_model || 'gpt-4o-mini',
        is_active: newConfig.openai?.is_active ?? existingConfig.openai?.is_active ?? true
      },
      gemini: {
        api_key: resolveKey(newConfig.gemini?.api_key, existingConfig.gemini?.api_key),
        default_model: newConfig.gemini?.default_model || existingConfig.gemini?.default_model || 'gemini-2.0-flash',
        is_active: newConfig.gemini?.is_active ?? existingConfig.gemini?.is_active ?? false
      },
      claude: {
        api_key: resolveKey(newConfig.claude?.api_key, existingConfig.claude?.api_key),
        default_model: newConfig.claude?.default_model || existingConfig.claude?.default_model || 'claude-3-5-sonnet',
        is_active: newConfig.claude?.is_active ?? existingConfig.claude?.is_active ?? false
      },
      updated_at: new Intl.DateTimeFormat('en-CA', { 
        timeZone: 'Asia/Kolkata', 
        year: 'numeric', month: '2-digit', day: '2-digit', 
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false 
      }).format(new Date())
    };

    const { error: upsertErr } = await admin
      .from('global_role_permissions')
      .upsert({
        id: storageKey,
        permissions: finalConfig
      }, { onConflict: 'id' });

    if (upsertErr) throw upsertErr;

    return { success: true, message: 'AI Configuration saved successfully' };
  } catch (err) {
    console.error('saveTenantAiConfig Error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Get raw server-side AI configuration (for API routes only, unmasked)
 */
export async function getRawTenantAiConfig(companyOrTenantId) {
  try {
    const admin = getAdminSupabase();
    const storageKey = getStorageKey(companyOrTenantId);

    const { data } = await admin
      .from('global_role_permissions')
      .select('permissions')
      .eq('id', storageKey)
      .maybeSingle();

    if (data?.permissions) {
      return data.permissions;
    }

    // Fallback to default if not found
    return DEFAULT_AI_CONFIG;
  } catch (err) {
    console.error('getRawTenantAiConfig Error:', err);
    return DEFAULT_AI_CONFIG;
  }
}

/**
 * Test API key validity with the provider
 */
export async function testAiProviderKey(provider, apiKey, model, companyOrTenantId) {
  try {
    let keyToTest = apiKey;

    // If key contains bullets, retrieve the raw saved key from DB
    if (!keyToTest || keyToTest.includes('••••')) {
      const rawConfig = await getRawTenantAiConfig(companyOrTenantId);
      keyToTest = rawConfig[provider]?.api_key || '';
    }

    // Fallback to environment variable if empty
    if (!keyToTest) {
      if (provider === 'openai') keyToTest = process.env.OPENAI_API_KEY || '';
      else if (provider === 'gemini') keyToTest = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';
      else if (provider === 'claude') keyToTest = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '';
    }

    if (!keyToTest) {
      return { success: false, error: 'No API key provided or found to test.' };
    }

    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${keyToTest}` }
      });
      if (res.ok) {
        return { success: true, message: 'OpenAI API Key verified successfully!' };
      }
      const data = await res.json().catch(() => ({}));
      return { success: false, error: data?.error?.message || `HTTP ${res.status} from OpenAI` };
    }

    if (provider === 'gemini') {
      const targetModel = model || 'gemini-2.0-flash';
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${keyToTest}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Ping test. Reply with pong.' }] }]
        })
      });
      if (res.ok) {
        return { success: true, message: 'Google Gemini API Key verified successfully!' };
      }
      const data = await res.json().catch(() => ({}));
      return { success: false, error: data?.error?.message || `HTTP ${res.status} from Gemini` };
    }

    if (provider === 'claude') {
      const targetModel = model || 'claude-3-5-sonnet-20241022';
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': keyToTest,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: targetModel,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Ping' }]
        })
      });
      if (res.ok) {
        return { success: true, message: 'Anthropic Claude API Key verified successfully!' };
      }
      const data = await res.json().catch(() => ({}));
      return { success: false, error: data?.error?.message || `HTTP ${res.status} from Anthropic` };
    }

    return { success: false, error: `Unknown provider: ${provider}` };
  } catch (err) {
    console.error('testAiProviderKey Error:', err);
    return { success: false, error: err.message };
  }
}
