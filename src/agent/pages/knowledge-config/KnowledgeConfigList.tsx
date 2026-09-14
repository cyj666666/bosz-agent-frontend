/**
 * 知识配置管理 — 页面入口（骨架）
 *
 * 对应原 amar-agent-admin 的 views/knowledge/KnownConfigList.vue。
 * 待实现：左侧知识库分组树 + 右侧知识库列表 + 配置弹窗（Prompt 条件组 / 输出要求 / 黑盒参数 /
 * 溯源配置 / 版本发布 / 预览）。
 */
import AgentPlaceholder from '../../components/AgentPlaceholder';

export default function KnowledgeConfigList() {
  return (
    <AgentPlaceholder
      title="知识配置管理"
      note="骨架占位。待实现：知识库分组树、知识库 CRUD、配置弹窗（Prompt 条件组、输出要求、黑盒参数、溯源配置、版本发布、流式预览）。"
    />
  );
}
