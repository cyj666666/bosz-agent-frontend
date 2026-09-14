/**
 * agent 模块 — SSE（Server-Sent Events）客户端
 *
 * 为什么自己写而不引依赖：
 *   源工程用 `@microsoft/fetch-event-source`，宿主工程没有该依赖且不需要为它引入；
 *   原生 `fetch` + `ReadableStream` 已足够表达同样的语义（POST + 流式读取 + 可取消）。
 *
 * 与源工程 `@/utils/sse.js` 的 postSendSse 的两处【关键差异】（都源自宿主约定）：
 *   1) 鉴权头：源工程发 `X-Access-Token`，而宿主 `AuthInterceptor` **只认
 *      `Authorization: Bearer <token>`**，照抄会导致 SSE 请求 401。
 *   2) 结束标志做成【双保险】：源工程靠服务端发一条 `data: finished!` 收尾。
 *      但后端 `OpenAiChatUtil` 的流式分支是否一定发这条，取决于具体调用链
 *      （`KnowledgeBaseConfigServiceImpl` 里有发，底层工具类里没有）。
 *      为避免"服务端忘记发 → 前端永远转圈"，这里同时监听
 *      「收到 finished!」与「响应流自然结束」两种结束信号，先到者为准。
 *
 * 数据契约（与后端 OpenAiChatUtil 对齐）：
 *   `data: {"answer":"内容片段","code":200,"prompt_tokens":12,...}`
 *   - 知识库类提问取 `answer`；普通对话类取 `content`
 *   - 首帧的 `content` 是 prompt 本身（不是回答），故本函数**优先取 answer，其次取 content**
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
      if (!response.body) {
        throw new Error('SSE 响应无 body，当前环境可能不支持流式读取');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      /** 未跨块的残余行 */
      let buffer = '';

      // 逐块读取并按 SSE 規範按「行」解析
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE 事件以空行分隔；这里简化为按行处理（后端每帧只发一行 data）
        let idx: number;
        while ((idx = buffer.indexOf('\n')) >= 0) {
          const rawLine = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          const line = rawLine.replace(/\r$/, '');

          // 忽略空行与注释行、event: 行
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
