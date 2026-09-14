/**
 * agent 模块 — Markdown 渲染
 *
 * 对应源工程 `views/knowledge/components/MdMsg.vue`（同样用 markdown-it）。
 *
 * 安全性说明：`markdown-it` 默认 `html: false`，即**不解析内联 HTML、会把标签转义**，
 * 因此用在 `dangerouslySetInnerHTML` 上不会引入脚本注入（内容来自大模型输出，
 * 这条默认设置正好是我们想要的）。**不要**为了"支持 HTML"去改 `html: true`。
 */
import { useMemo } from 'react';
import markdownIt from 'markdown-it';

const md = markdownIt({
  // 单个换行也当换行（大模型输出的段落常是单换行）
  breaks: true,
  // 自动识别裸链接
  linkify: true,
});

interface MarkdownTextProps {
  content?: string;
  /** 空内容时的占位文案，传空字符串则不渲染占位 */
  placeholder?: string;
}

export default function MarkdownText({ content, placeholder = '-' }: MarkdownTextProps) {
  const html = useMemo(() => (content ? md.render(content) : ''), [content]);

  if (!content) {
    return placeholder ? <span style={{ color: '#999' }}>{placeholder}</span> : null;
  }

  return <div className="agent-markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}
