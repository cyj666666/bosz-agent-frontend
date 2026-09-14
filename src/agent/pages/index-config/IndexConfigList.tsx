/**
 * 指标配置 — 页面入口（骨架）
 *
 * 对应原 amar-agent-admin 的 views/index/ConfigList.vue。
 * 待实现：左侧分组树 + 右侧指标表格 + 新增/配置/复制/移动/删除/快速引入/关联校验/批量同步/刷新缓存。
 */
import AgentPlaceholder from '../../components/AgentPlaceholder';

export default function IndexConfigList() {
  return (
    <AgentPlaceholder
      title="指标配置"
      note="骨架占位。待实现：分组树、指标 CRUD、数据源配置（Sql/Api/参数集/知识库四选一）、关联校验、批量同步。"
    />
  );
}
