/** 站点状态枚举 - 3 层 DEF + OPTIONS + GROUPS 样例 */
export const STATUS_DEF = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  PENDING: "pending",
} as const;

export const STATUS_OPTIONS = [
  { value: "active", label: "启用", color: "green" },
  { value: "inactive", label: "停用", color: "gray" },
  { value: "pending", label: "待审核", color: "yellow" },
] as const;

export const STATUS_GROUPS = [
  { value: "all", label: "全部" },
  { value: "enabled", label: "启用中", match: ["active"] },
  { value: "disabled", label: "已停用", match: ["inactive"] },
] as const;
