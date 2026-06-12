// Shared helpers for discovering and validating cloud LLM models.
// Model lists come from each provider's official models API — never from
// scraping documentation pages, which produces non-model slugs and duplicates.
import axios from 'axios';

const ANTHROPIC_API_VERSION = '2023-06-01';

/**
 * Fetch available Anthropic models from the official Models API.
 * https://docs.anthropic.com/en/api/models-list
 */
export async function fetchAnthropicModels(apiKey: string): Promise<string[]> {
  const response = await axios.get('https://api.anthropic.com/v1/models', {
    params: { limit: 100 },
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_API_VERSION
    },
    timeout: 10000
  });

  const ids = (response.data?.data || [])
    .map((model: any) => model?.id)
    .filter((id: any): id is string => typeof id === 'string' && id.startsWith('claude'));

  return [...new Set<string>(ids)];
}

/**
 * Cheap Anthropic connectivity/key check. Uses the Models API rather than a
 * chat completion so it costs no tokens and never depends on a specific
 * (possibly retired) model ID.
 */
export async function testAnthropicConnection(apiKey: string): Promise<boolean> {
  const response = await axios.get('https://api.anthropic.com/v1/models', {
    params: { limit: 1 },
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_API_VERSION
    },
    timeout: 10000
  });
  return response.status === 200;
}

/**
 * Build OpenAI auth headers. The OpenAI-Organization header is only sent
 * when an organization is actually configured - sending it with an empty
 * value makes OpenAI reject the request.
 */
export function buildOpenAIHeaders(apiKey: string, organization?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${apiKey}`
  };
  if (organization && organization.trim()) {
    headers['OpenAI-Organization'] = organization.trim();
  }
  return headers;
}

// Special-purpose OpenAI models that can't serve chat completions
const OPENAI_NON_CHAT_PATTERN = /(embedding|whisper|tts|audio|realtime|image|dall-e|moderation|transcribe|search-preview|computer-use|davinci|babbage|instruct)/i;
const OPENAI_CHAT_PREFIX_PATTERN = /^(gpt-|o\d|chatgpt-)/i;

/**
 * Reduce the raw /v1/models list to chat-capable models, deduplicated and
 * sorted newest-family-first.
 */
export function filterOpenAIChatModels(modelIds: string[]): string[] {
  const chatModels = modelIds.filter(
    id => OPENAI_CHAT_PREFIX_PATTERN.test(id) && !OPENAI_NON_CHAT_PATTERN.test(id)
  );
  // Plain reverse-lexicographic keeps newer families first (gpt-5 > gpt-4 > gpt-35)
  return [...new Set(chatModels)].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

/**
 * gpt-5-family and o-series reasoning models reject the legacy `max_tokens`
 * parameter (they require `max_completion_tokens`) and only support the
 * default temperature.
 */
export function isOpenAIReasoningFamily(model: string): boolean {
  return /^(gpt-5|o\d)/i.test(model);
}

/**
 * Build the token-limit/temperature portion of an OpenAI (or Azure OpenAI)
 * chat completion request appropriate for the target model family.
 */
export function buildOpenAICompletionParams(
  model: string,
  maxTokens: number,
  temperature: number
): Record<string, number> {
  if (isOpenAIReasoningFamily(model)) {
    return { max_completion_tokens: maxTokens };
  }
  return { max_tokens: maxTokens, temperature };
}

/**
 * Cheap Gemini connectivity/key check via the models listing endpoint -
 * costs no tokens and never depends on a specific (possibly retired) model.
 */
export async function testGeminiConnection(apiKey: string): Promise<boolean> {
  const response = await axios.get('https://generativelanguage.googleapis.com/v1beta/models', {
    params: { key: apiKey, pageSize: 1 },
    timeout: 10000
  });
  return response.status === 200;
}

/**
 * Claude Opus 4.7+ and the Fable/Mythos-class models removed sampling
 * parameters - sending `temperature` (or top_p/top_k) returns a 400
 * "`temperature` is deprecated for this model".
 */
export function anthropicRejectsSamplingParams(model: string): boolean {
  return /^claude-(opus-4-(7|8|9)|opus-[5-9]|fable|mythos)/i.test(model);
}

/**
 * Build the token-limit/temperature portion of an Anthropic messages
 * request appropriate for the target model family.
 */
export function buildAnthropicCompletionParams(
  model: string,
  maxTokens: number,
  temperature: number
): Record<string, number> {
  if (anthropicRejectsSamplingParams(model)) {
    return { max_tokens: maxTokens };
  }
  return { max_tokens: maxTokens, temperature };
}

/**
 * Validate a (possibly cached) model list. Returns the cleaned list; callers
 * should refetch when the cleaned list differs from the input, since that
 * means the cache was written by older fetch logic (doc-scraping artifacts,
 * unfiltered non-chat models).
 */
export function sanitizeModelList(provider: string, models: string[]): string[] {
  // Drop entries with characters no real model ID contains (markdown escapes,
  // @date variants, etc.)
  const clean = models.filter(id => typeof id === 'string' && /^[a-z0-9][a-z0-9.\-_:]*$/i.test(id));
  if (provider === 'openai' || provider === 'azure-openai') {
    return filterOpenAIChatModels(clean);
  }
  return [...new Set(clean)];
}

// Fallbacks used only when the provider's models API is unreachable.
// Keep in sync with currently served models.
export const FALLBACK_ANTHROPIC_MODELS = [
  'claude-opus-4-8',
  'claude-opus-4-7',
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-sonnet-4-5',
  'claude-opus-4-5',
  'claude-haiku-4-5'
];

export const FALLBACK_OPENAI_MODELS = [
  'gpt-5',
  'gpt-5-mini',
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo'
];

export const FALLBACK_GEMINI_MODELS = [
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.0-flash'
];

export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-6';
export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
