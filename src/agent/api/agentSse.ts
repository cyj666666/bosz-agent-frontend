/**
 * agent 模块 — SSE（Server-Sent Events）客户端
 *
 * 为什么自己写而不引依赖：
 *   源工程用 `@microsoft/fetch-event-source`（POST）与 `event-source-polyfill`（GET），
 *   宿主工程两个依赖都没有，且原生 `fetch` + `ReadableStream` 已足够表达同样语义。
 *
 * 与源工程 `@/utils/sse.js` 的【关键差异】（都源自宿主约定，不是随意改动）：
 *   1) 鉴权头：源工程发 `X-Access-Token`，而宿主 `AuthInterceptor` **只认
 *      `Authorization: Bearer <token>`**，照抄会导致 SSE 请求 401。
 *   2) 结束标志做成【双保险】：源工程靠服务端发一条 `data: finished!` 收尾。
 *      后端两条链路的情况不同——`CallLlmUtil.finishEmitter` 会发，
 *      而 `OpenAiChatUtil` 原本漏发（已于 2026-09-15 补齐）。
 *      为避免"服务端忘记发 → 前端永远转圈"，这里同时监听
 *      「收到 finished!」与「响应流自然结束」，先到者为准。
 *
 * 数据契约（与后端 OpenAiChatUtil 对齐）：
 *   `data: {"answer":"内容片段","code":200,"prompt_tokens":12,...}`
 *   - 知识库类提问取 `answer`；普通对话类取 `content`
 *   - 首帧的 `content` 是 prompt 本身（不是回答），故本模块**优先取 answer，其次取 content**
 */
import { useAppStore } from '../../store';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export interface AgentSseChunk {
  /** 本次增量文本 */
  text: string;
  /** 首帧携带的 prompt（仅用于调试展示，一般不用） */
  prompt?: string;
  promptTokens?: number;
  completionTokens?: number;
}

export interface AgentSseOptions {
  /** 相对路径，如 '/agent/get'（不带 baseURL） */
  url: string;
  /** 请求体（会 JSON.stringify，且自动补 stream 等由调用方给全） */
  body: Record<string, unknown>;
  onChunk: (chunk: AgentSseChunk) => void;
  /** 流结束（收到 finished! 或响应流自然结束，只回调一次） */
  onDone?: () => void;
  onError?: (err: unknown) => void;
}

export interface AgentSseHandle {
  abort: () => void;
}

/**
 * 解析 SSE 响应流（POST / GET 两种发起方式共用）
 *
 * 按行解析：后端每帧只发一行 `data: ...`，故不做完整的 SSE 事件聚合。
 */
async function parseSseStream(
  response: Response,
  onChunk: (chunk: AgentSseChunk) => void,
  finish: () => void,
  controller: AbortController,
): Promise<void> {
  if (!response.body) {
    throw new Error('SSE 响应无 body，当前环境可能不支持流式读取');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  /** 未跨块的残余行 */
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const rawLine = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      const line = rawLine.replace(/\r$/, '');

      // 忽略空行、注释行、event: 行
      if (!line || line.startsWith(':') || line.startsWith('event:')) continue;
      if (!line.startsWith('data:')) continue;

      const payload = line.slice(5).trim();
      if (!payload) continue;

      if (payload === 'finished!') {
        finish();
        controller.abort();
        return;
      }

      try {
        const json = JSON.parse(payload) as Record<string, unknown>;
        const answer = json.answer;
        const content = json.content;
        const text = typeof answer === 'string' ? answer : typeof content === 'string' ? content : '';
        if (!text) continue;
        onChunk({
          text,
          prompt: typeof json.prompt === 'string' ? json.prompt : undefined,
          promptTokens: typeof json.prompt_tokens === 'number' ? json.prompt_tokens : undefined,
          completionTokens: typeof json.completion_tokens === 'number' ? json.completion_tokens : undefined,
        });
      } catch {
        // 非 JSON 帧（例如后端直接 send(String)）按纯文本增量处理
        onChunk({ text: payload });
      }
    }
  }

  // 双保险：服务端没发 finished! 时，靠流结束收尾
  finish();
}

/** 启动一个 POST SSE 请求；返回句柄用于取消 */
export function agentSse(options: AgentSseOptions): AgentSseHandle {
  const { url, body, onChunk, onDone, onError } = options;
  const controller = new AbortController();
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    onDone?.();
  };

  const run = async () => {
    try {
      const token = useAppStore.getState().token;
      const response = await fetch(BASE_URL + url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=utf-8',
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`SSE 请求失败：HTTP ${response.status}`);
      }
      await parseSseStream(response, onChunk, finish, controller);
    } catch (err) {
      // 主动 abort 不算错误
      if (controller.signal.aborted) {
        finish();
        return;
      }
      onError?.(err);
      finish();
    }
  };

  void run();

  return {
    abort: () => {
      controller.abort();
    },
  };
}

/** GET 型 SSE 的参数 */
export interface AgentSseGetOptions {
  /** 相对路径，如 '/agent/KnowledgeBase/config/summaryAnswer' */
  url: string;
  /** 查询参数（会拼到 URL 上） */
  params: Record<string, unknown>;
  onChunk: (chunk: AgentSseChunk) => void;
  onDone?: () => void;
  onError?: (err: unknown) => void;
}

/**
 * 启动一个 GET SSE 请求（源工程 `sendSse` / `EventSourcePolyfill` 的等价实现）
 *
 * 用法场景：黑盒配置预览、知识库结果校验等「服务端用 SseEmitter 推、客户端用 EventSource 收」的接口。
 *
 * ⚠️ query 拼接**刻意复刻源工程 `buildSseUrlWithSearchParams` 的行为**：
 *   - 跳过 `url` 键；第一个参数用 `?`，其余用 `&`；
 *   - **只对 `inputParam` 做 encodeURIComponent**，其他参数原样拼接。
 *   这一点看起来像源实现的疏漏，但改成「全部编码」会改变实际发出的 query 串
 *   （例如含 JSON 的 `inputParam` 与含中文的 `entName` 编码结果不同），
 *   而后端是按「已编码形态」解析的，故保持一致更安全。
 */
export function agentSseGet(options: AgentSseGetOptions): AgentSseHandle {
  const { url, params, onChunk, onDone, onError } = options;
  const controller = new AbortController();
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    onDone?.();
  };

  const queryString = Object.keys(params)
    .filter((key) => key !== 'url')
    .reduce((prev, curr, index) => {
      const val = params[curr];
      const rendered = curr === 'inputParam' ? encodeURIComponent(String(val ?? '')) : String(val ?? '');
      return prev + (index === 0 ? '?' : '&') + curr + '=' + rendered;
    }, '');

  const run = async () => {
    try {
      const token = useAppStore.getState().token;
      const response = await fetch(BASE_URL + url + queryString, {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`SSE 请求失败：HTTP ${response.status}`);
      }
      await parseSseStream(response, onChunk, finish, controller);
    } catch (err) {
      if (controller.signal.aborted) {
        finish();
        return;
      }
      onError?.(err);
      finish();
    }
  };

  void run();

  return {
    abort: () => {
      controller.abort();
    },
  };
}
