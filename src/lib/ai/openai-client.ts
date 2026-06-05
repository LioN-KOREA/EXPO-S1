// PRD #19 PoC — OpenAI Chat Completions fetch 래퍼.
// - 모델: gpt-4o-mini
// - 헤더: OpenAI-Beta: no-training
// - 타임아웃: 10초 (AbortController)
// - 응답: content + token 수 + 비용
//
// 본 PoC 단계에서는 단순 throw. S1 정식 구현 시 status enum 분리.

export const OPENAI_MODEL = 'gpt-4o-mini';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const TIMEOUT_MS = 10_000;

// gpt-4o-mini 가격 ($ per 1M tokens, 2026-05 기준)
const PRICE_INPUT_PER_M = 0.15;
const PRICE_OUTPUT_PER_M = 0.6;

export interface OpenAIRequest {
  system: string;
  user: string;
  temperature: number;
}

export interface OpenAIResponse {
  content: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  model: string;
  durationMs: number;
}

interface ChatCompletionResponse {
  choices: Array<{ message: { content: string | null } }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
}

export class OpenAIError extends Error {
  constructor(message: string, public readonly kind: 'timeout' | 'http_5xx' | 'rate_limit' | 'invalid_response' | 'auth' | 'unknown', public readonly httpStatus?: number) {
    super(message);
    this.name = 'OpenAIError';
  }
}

function calcCost(promptTokens: number, completionTokens: number): number {
  const cost = (promptTokens / 1_000_000) * PRICE_INPUT_PER_M + (completionTokens / 1_000_000) * PRICE_OUTPUT_PER_M;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export async function callOpenAI(req: OpenAIRequest): Promise<OpenAIResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new OpenAIError('OPENAI_API_KEY 환경변수 누락', 'auth');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'OpenAI-Beta': 'no-training',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
        temperature: req.temperature,
      }),
      signal: controller.signal,
    });

    if (res.status === 429) {
      throw new OpenAIError(`OpenAI rate limit: ${res.status}`, 'rate_limit', res.status);
    }
    if (res.status >= 500) {
      throw new OpenAIError(`OpenAI 서버 오류: ${res.status}`, 'http_5xx', res.status);
    }
    if (res.status === 401 || res.status === 403) {
      throw new OpenAIError(`OpenAI 인증 실패: ${res.status}`, 'auth', res.status);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new OpenAIError(`OpenAI 호출 실패: ${res.status} ${text}`, 'unknown', res.status);
    }

    const data = (await res.json()) as ChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string' || content.trim() === '') {
      throw new OpenAIError('OpenAI 응답에 본문 없음', 'invalid_response');
    }

    const promptTokens = data.usage?.prompt_tokens ?? 0;
    const completionTokens = data.usage?.completion_tokens ?? 0;

    return {
      content: content.trim(),
      promptTokens,
      completionTokens,
      costUsd: calcCost(promptTokens, completionTokens),
      model: data.model ?? OPENAI_MODEL,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    if (err instanceof OpenAIError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new OpenAIError(`OpenAI 타임아웃 (${TIMEOUT_MS}ms)`, 'timeout');
    }
    throw new OpenAIError(err instanceof Error ? err.message : 'OpenAI 호출 실패', 'unknown');
  } finally {
    clearTimeout(timer);
  }
}
