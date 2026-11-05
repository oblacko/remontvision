// Клиент OpenRouter Agent SDK поверх нашего прокси.
// SDK использует HTTPClient, поэтому подменяем fetcher на proxyFetch;
// иначе OpenRouter отвечает 403 с серверного IP.
import { OpenRouter, stepCountIs, maxCost } from '@openrouter/agent';
import { HTTPClient } from '@openrouter/sdk';
import { proxyFetch } from './proxy.js';

export const AGENT_MODEL = process.env.AGENT_MODEL || 'deepseek/deepseek-v4.1-flash-1017';

let client = null;

async function fetcher(input, init) {
  if (typeof Request !== 'undefined' && input instanceof Request) {
    const body = ['GET', 'HEAD'].includes(input.method) ? undefined : await input.text();
    const res = await proxyFetch(input.url, {
      method: input.method,
      headers: Object.fromEntries(input.headers.entries()),
      body,
      signal: input.signal,
    });
    // node-fetch (SOCKS) отдаёт Node-стрим, а SDK ждёт web Response.
    const bytes = await res.arrayBuffer();
    return new Response(bytes, {
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries()),
    });
  }
  return proxyFetch(input, init);
}

export function getAgentClient() {
  if (!client) {
    client = new OpenRouter({
      apiKey: process.env.OPENROUTER_API_KEY || '',
      httpReferer: process.env.APP_URL || 'http://localhost:3000',
      appTitle: 'remontvision',
      httpClient: new HTTPClient({ fetcher }),
    });
  }
  return client;
}

function extractJson(text) {
  const raw = String(text || '');
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

// Один вызов агента без тулов: vision/JSON. Возвращает parsed + usage.
export async function callAgentJson({
  instructions,
  inputText,
  images = [],
  model = AGENT_MODEL,
  maxCostUsd = 0.02,
  maxSteps = 2,
} = {}) {
  const content = [
    { type: 'input_text', text: String(inputText || '') },
    ...images.filter(Boolean).map(url => ({ type: 'input_image', imageUrl: url, detail: 'auto' })),
  ];
  const result = getAgentClient().callModel({
    model,
    instructions,
    input: [{ role: 'user', content }],
    text: { format: { type: 'json_object' } },
    stopWhen: [stepCountIs(maxSteps), maxCost(maxCostUsd)],
  });
  const text = await result.getText();
  let usage = null;
  try {
    const response = await result.getResponse();
    usage = response?.usage || null;
  } catch { /* usage не критичен */ }
  return { parsed: extractJson(text), text, usage, cost: usage?.cost ?? null };
}

// Агент с тулами: SDK сам крутит цикл tool-call → execute → model.
export async function callAgentWithTools({
  instructions,
  inputText,
  images = [],
  tools = [],
  model = AGENT_MODEL,
  maxCostUsd = 0.05,
  maxSteps = 8,
  onToolResult = null,
} = {}) {
  const content = [
    { type: 'input_text', text: String(inputText || '') },
    ...images.filter(Boolean).map(url => ({ type: 'input_image', imageUrl: url, detail: 'auto' })),
  ];
  const result = getAgentClient().callModel({
    model,
    instructions,
    input: [{ role: 'user', content }],
    tools,
    parallelToolCalls: true,
    stopWhen: [stepCountIs(maxSteps), maxCost(maxCostUsd)],
  });
  if (onToolResult) {
    (async () => {
      try {
        for await (const event of result.getFullResponsesStream()) {
          if (event?.type === 'tool.result') onToolResult(event);
        }
      } catch { /* стрим не должен ломать основной вызов */ }
    })();
  }
  const text = await result.getText();
  let usage = null;
  try {
    const response = await result.getResponse();
    usage = response?.usage || null;
  } catch { /* usage не критичен */ }
  return { parsed: extractJson(text), text, usage, cost: usage?.cost ?? null };
}
