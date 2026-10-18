/**
 * 文件路径：apps/launcher-ui/components/iGM_LauncherV2_Horizon/iGM_LauncherV2_Horizon.tsx
 * 所属层：前端 / 页面组件层
 * 路由：G_Main（视界页签）
 * 模块：iGM_LauncherV2_Horizon
 * 作用：视界管理页：列举、新建、切换、删除视界，并进入单个视界详情查看目录树与存档
 * 内容：视界（Horizon）取代原「实例」概念，每个视界是 horizons/ 下一个独立的
 *       mods / resourcepacks / shaderpacks / saves / config 目录集合；
 *       切换视界即把当前游戏的 gameDir 指向该视界，实现多版本隔离；
 *       新建改为表单弹窗：填写名称并选择已下载版本与加载器，校验失败在表单内给出
 *       行内错误，提交中显示进行中文案，结果由外壳 horizon:result 回推，绝无静默失败；
 *       删除需二次确认，且删除当前视界后自动清空当前选择；
 *       点击列表行主信息区进入「视界详情」，详情内含「文件目录 / 世界列表」两个标签页，
 *       分别展示该视界目录树（递归可折叠）与 saves 目录下的存档列表；
 *       已接入多语言（简体中文 / English，next-intl，命名空间 horizon）
 * 说明：所有目录操作由 Bun 主进程执行，界面只投递指令并展示回推结果；
 *       目录树与存档列表分别由 iGM_LauncherV2_UseHorizonTree / UseHorizonWorlds 订阅，
 *       已下载版本列表由 iGM_LauncherV2_UseInstalledVersions 订阅
 */

// 导入依赖 //
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertCircle,
  ArrowLeft,
  Boxes,
  CheckCircle2,
  FileText,
  Folder,
  FolderOpen,
  Layers,
  Loader,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  iGM_LauncherV2_Card as IGM_LauncherV2_Card,
} from "@/components/iGM_LauncherV2_Primitives/iGM_LauncherV2_Primitives";
import {
  iGM_LauncherV2_OnHorizonResult as IGM_LauncherV2_OnHorizonResult,
  iGM_LauncherV2_UseAuth as IGM_LauncherV2_UseAuth,
  iGM_LauncherV2_UseHorizons as IGM_LauncherV2_UseHorizons,
  iGM_LauncherV2_UseHorizonTree as IGM_LauncherV2_UseHorizonTree,
  iGM_LauncherV2_UseHorizonWorlds as IGM_LauncherV2_UseHorizonWorlds,
  iGM_LauncherV2_UseInstalledVersions as IGM_LauncherV2_UseInstalledVersions,
} from "@/components/iGM_LauncherV2_HostBridge/iGM_LauncherV2_HostBridge";
import type {
  iGM_LauncherV2_Horizon,
  iGM_LauncherV2_HorizonNode,
} from "@/lib/iGM_LauncherV2_Constants";
import { IGM_LAUNCHERV2_GUEST_HORIZON_LIMIT } from "@/lib/iGM_LauncherV2_Constants";
import styles from "./iGM_LauncherV2_Horizon.module.css";

// 类型定义 //

/** 视界详情内的标签页：文件目录 / 世界列表 */
type iGM_LauncherV2_HorizonDetailTab = "tree" | "worlds";

/** 新建视界表单的提交状态 */
type iGM_LauncherV2_HorizonSubmitState = "idle" | "pending";

// 常量与文案 //

/** 新建视界可选的加载器（仅作为展示名记录，具体加载器版本由资源中心的安装流程决定；label 为 i18n 键） */
const IGM_HORIZON_LOADER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "horizon.loader.vanilla" },
  { value: "Fabric", label: "Fabric" },
  { value: "Forge", label: "Forge" },
  { value: "NeoForge", label: "NeoForge" },
];

/** 视界名称的兜底后缀：未选加载器时用于自动命名 */
const IGM_HORIZON_LOADER_FALLBACK = "Vanilla";

// 核心逻辑 //

/* ---- 工具函数 ---- */

/** 文件字节数格式化为易读单位（B / KB / MB） */
function iGM_LauncherV2_FormatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(2)} MB`;
}

/** 毫秒时间戳格式化为 YYYY-MM-DD HH:mm */
function iGM_LauncherV2_FormatTime(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    ` ${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/* ---- 子组件：目录树 ---- */

/**
 * 视界目录树的递归渲染。目录节点带展开/折叠，文件显示格式化大小；
 * 缩进按层级递进，默认全部展开（点击目录回写折叠集合）。
 */
function IGM_LauncherV2_HorizonTreeRows({
  nodes,
  depth,
  collapsed,
  onToggle,
}: {
  nodes: iGM_LauncherV2_HorizonNode[];
  depth: number;
  collapsed: Set<string>;
  onToggle: (path: string) => void;
}) {
  const t = useTranslations();

  return (
    <>
      {nodes.map((node) => {
        const children = node.children ?? [];
        const canExpand = node.dir && children.length > 0;
        const isCollapsed = collapsed.has(node.path);
        return (
          <li key={node.path} className={styles.treeItem}>
            <div className={styles.treeRow} style={{ paddingLeft: depth * 16 }}>
              {canExpand ? (
                <button
                  type="button"
                  className={styles.treeToggle}
                  aria-label={t(
                    isCollapsed ? "horizon.tree.collapse" : "horizon.tree.expand",
                    { name: node.name },
                  )}
                  aria-expanded={!isCollapsed}
                  onClick={() => onToggle(node.path)}
                >
                  {isCollapsed ? (
                    <Folder size={14} strokeWidth={2.2} />
                  ) : (
                    <FolderOpen size={14} strokeWidth={2.2} />
                  )}
                </button>
              ) : (
                <span className={styles.treeIcon}>
                  {node.dir ? (
                    <Folder size={14} strokeWidth={2.2} />
                  ) : (
                    <FileText size={14} strokeWidth={2.2} />
                  )}
                </span>
              )}
              <span className={styles.treeName}>{node.name}</span>
              {node.dir ? null : (
                <span className={styles.treeSize}>{iGM_LauncherV2_FormatSize(node.size)}</span>
              )}
            </div>
            {canExpand && !isCollapsed ? (
              <ul className={styles.treeList}>
                <IGM_LauncherV2_HorizonTreeRows
                  nodes={children}
                  depth={depth + 1}
                  collapsed={collapsed}
                  onToggle={onToggle}
                />
              </ul>
            ) : null}
          </li>
        );
      })}
    </>
  );
}

/* ---- 子组件：视界详情 ---- */

/**
 * 视界详情视图：顶部展示名称 / 路径 / 模组数并提供返回、切换与删除；
 * 下方两个标签页分别渲染目录树与世界列表，各自带刷新与加载提示。
 */
function IGM_LauncherV2_HorizonDetail({
  item,
  onBack,
  onSelect,
  onRemove,
}: {
  item: iGM_LauncherV2_Horizon;
  onBack: () => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const t = useTranslations();
  const [tab, setTab] = useState<iGM_LauncherV2_HorizonDetailTab>("tree");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState(false);
  const tree = IGM_LauncherV2_UseHorizonTree(item.id);
  const worldData = IGM_LauncherV2_UseHorizonWorlds(item.id);

  const toggleFolder = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <IGM_LauncherV2_Card className={styles.panel}>
      <div className={styles.detailHead}>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={t("horizon.backToList")}
          onClick={onBack}
        >
          <ArrowLeft size={16} strokeWidth={2.2} />
        </button>

        <div className={styles.detailMain}>
          <div className={styles.rowTitleLine}>
            <Layers size={15} strokeWidth={2.2} className={styles.iconDim} />
            <span className={styles.rowTitle}>{item.name}</span>
            {item.current ? (
              <span className={styles.rowTagOn}>
                <CheckCircle2 size={12} strokeWidth={2.4} />
                {t("horizon.currentTag")}
              </span>
            ) : null}
          </div>
          <span className={styles.rowSub}>{item.path}</span>
          <span className={styles.rowMeta}>
            <Boxes size={12} strokeWidth={2.2} />
            {t("horizon.modCount", { count: item.modCount })}
          </span>
        </div>

        <div className={styles.rowActions}>
          {pendingDelete ? (
            <>
              <button
                type="button"
                className={`${styles.actionButton} ${styles.actionButtonDanger}`}
                onClick={() => onRemove(item.id)}
              >
                <span>{t("horizon.confirmDelete")}</span>
              </button>
              <button
                type="button"
                className={styles.actionButton}
                onClick={() => setPendingDelete(false)}
              >
                <span>{t("common.cancel")}</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={styles.actionButton}
                disabled={item.current}
                onClick={() => onSelect(item.id)}
              >
                <span>{item.current ? t("common.currentUse") : t("horizon.switchTo")}</span>
              </button>
              <button
                type="button"
                className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                aria-label={t("horizon.deleteThis")}
                onClick={() => setPendingDelete(true)}
              >
                <Trash2 size={15} strokeWidth={2.2} />
              </button>
            </>
          )}
        </div>
      </div>

      <div className={styles.tabBar}>
        <div className={styles.tabBarTabs}>
          <button
            type="button"
            className={`${styles.tab} ${tab === "tree" ? styles.tabOn : ""}`}
            onClick={() => setTab("tree")}
          >
            <span>{t("horizon.tab.tree")}</span>
          </button>
          <button
            type="button"
            className={`${styles.tab} ${tab === "worlds" ? styles.tabOn : ""}`}
            onClick={() => setTab("worlds")}
          >
            <span>{t("horizon.tab.worlds")}</span>
          </button>
        </div>
        <button
          type="button"
          className={styles.actionButton}
          onClick={() => (tab === "tree" ? tree.reload() : worldData.reload())}
        >
          <RefreshCw size={14} strokeWidth={2.2} />
          <span>{t("common.refresh")}</span>
        </button>
      </div>

      {tab === "tree" ? (
        tree.loading ? (
          <p className={styles.empty}>{t("horizon.tree.loading")}</p>
        ) : tree.nodes.length === 0 ? (
          <p className={styles.empty}>{t("horizon.tree.empty")}</p>
        ) : (
          <div className={styles.treeScroll}>
            <ul className={styles.treeRoot}>
              <IGM_LauncherV2_HorizonTreeRows
                nodes={tree.nodes}
                depth={0}
                collapsed={collapsed}
                onToggle={toggleFolder}
              />
            </ul>
          </div>
        )
      ) : worldData.loading ? (
        <p className={styles.empty}>{t("horizon.worlds.loading")}</p>
      ) : worldData.worlds.length === 0 ? (
        <p className={styles.empty}>{t("horizon.worlds.empty")}</p>
      ) : (
        <div className={styles.worldScroll}>
          <ul className={styles.worldList}>
            {worldData.worlds.map((world) => (
              <li key={world.path} className={styles.worldRow}>
                <span className={styles.worldIcon}>
                  <Save size={15} strokeWidth={2.2} />
                </span>
                <div className={styles.worldMain}>
                  <span className={styles.worldName}>{world.name}</span>
                  <span className={styles.worldPath}>{world.path}</span>
                </div>
                <span className={styles.worldSize}>{iGM_LauncherV2_FormatSize(world.size)}</span>
                <span className={styles.worldTime}>{iGM_LauncherV2_FormatTime(world.modifiedAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </IGM_LauncherV2_Card>
  );
}

/* ---- 主组件：视界页 tab ---- */

export function iGM_LauncherV2_Horizon() {
  const t = useTranslations();
  const horizons = IGM_LauncherV2_UseHorizons();
  const installed = IGM_LauncherV2_UseInstalledVersions();
  const auth = IGM_LauncherV2_UseAuth();
  /** 游客（未登录社区账号）：视界数量受上限约束，界面提前给出提示 */
  const isGuest = !(auth.state === "logged-in" && auth.user);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  /** 新建视界表单弹窗是否打开 */
  const [createOpen, setCreateOpen] = useState(false);
  /** 表单：视界名称 */
  const [formName, setFormName] = useState("");
  /** 表单：所选已下载版本 id（空串表示未选择） */
  const [formVersion, setFormVersion] = useState("");
  /** 表单：所选加载器展示名（空串表示原版） */
  const [formLoader, setFormLoader] = useState("");
  /** 名称是否被用户手动改过；未改过时随版本与加载器自动命名 */
  const [nameTouched, setNameTouched] = useState(false);
  /** 表单校验错误：行内展示，绝不静默 return */
  const [formError, setFormError] = useState("");
  /** 提交流程状态：pending 期间按钮禁用并显示进行中文案 */
  const [submitState, setSubmitState] = useState<iGM_LauncherV2_HorizonSubmitState>("idle");
  /** 本次提交的结果提示：成功后保留在面板上作为反馈 */
  const [resultMessage, setResultMessage] = useState("");

  /** 加载器展示名：空值统一回落为 Vanilla */
  const loaderLabel = formLoader || IGM_HORIZON_LOADER_FALLBACK;

  // 名称随「版本 + 加载器」自动命名；用户手动改过之后不再覆盖
  useEffect(() => {
    if (!createOpen || nameTouched) return;
    setFormName(formVersion ? `${formVersion}-${loaderLabel}` : "");
  }, [createOpen, formVersion, loaderLabel, nameTouched]);

  // 弹窗打开期间若已下载版本才回推到位（首帧为空），自动补选最新的一项
  useEffect(() => {
    if (!createOpen || formVersion) return;
    if (installed.versions.length > 0) setFormVersion(installed.versions[0]);
  }, [createOpen, formVersion, installed.versions]);

  // 订阅外壳回推的新建结果：成功则收起弹窗，失败则把错误留在表单内展示
  useEffect(() => {
    if (!createOpen) return;
    return IGM_LauncherV2_OnHorizonResult((result) => {
      setSubmitState("idle");
      setResultMessage(result.message);
      if (result.ok) {
        setCreateOpen(false);
        setFormName("");
        setFormVersion("");
        setFormLoader("");
        setNameTouched(false);
        setFormError("");
      } else {
        setFormError(result.message);
      }
    });
  }, [createOpen]);

  // 打开新建弹窗：重置表单并刷新本地已下载版本列表
  const openCreate = () => {
    const firstVersion = installed.versions[0] ?? "";
    setCreateOpen(true);
    setFormVersion(firstVersion);
    setFormLoader("");
    setNameTouched(false);
    setFormError("");
    setResultMessage("");
    setFormName(firstVersion ? `${firstVersion}-${IGM_HORIZON_LOADER_FALLBACK}` : "");
    installed.reload();
  };

  // Esc 关闭新建弹窗（提交进行中不关闭，避免误操作）
  useEffect(() => {
    if (!createOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && submitState === "idle") setCreateOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [createOpen, submitState]);

  /** 提交新建：校验失败给出行内错误，校验通过则投递 IPC 并进入 pending */
  const submit = () => {
    if (submitState === "pending") return;
    const trimmed = formName.trim();
    if (!trimmed) {
      setFormError(t("horizon.modal.nameRequired"));
      return;
    }
    // 本地存在已下载版本时必须选一个绑定；一个都没有时允许先建目录、启动前再补下载
    if (installed.versions.length > 0 && !formVersion) {
      setFormError(t("horizon.modal.versionRequired"));
      return;
    }
    setFormError("");
    setResultMessage("");
    setSubmitState("pending");
    horizons.create(trimmed, formVersion || undefined, loaderLabel);
  };

  const detailItem = detailId
    ? horizons.items.find((entry) => entry.id === detailId) ?? null
    : null;

  if (detailItem) {
    return (
      <div className={styles.wrap}>
        <IGM_LauncherV2_HorizonDetail
          item={detailItem}
          onBack={() => setDetailId(null)}
          onSelect={(id: string) => horizons.select(id)}
          onRemove={(id: string) => {
            horizons.remove(id);
            setDetailId(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <IGM_LauncherV2_Card className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>{t("horizon.title")}</h2>
            <p className={styles.panelDesc}>{t("horizon.desc")}</p>
          </div>
          <div className={styles.headActions}>
            <button type="button" className={styles.actionButton} onClick={() => horizons.refresh()}>
              <RefreshCw size={14} strokeWidth={2.2} />
              <span>{t("common.refresh")}</span>
            </button>
            <button
              type="button"
              className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
              onClick={openCreate}
            >
              <Plus size={14} strokeWidth={2.2} />
              <span>{t("horizon.create")}</span>
            </button>
          </div>
        </div>

        {resultMessage ? <p className={styles.notice}>{resultMessage}</p> : null}
        {isGuest ? (
          <p className={styles.notice}>
            {t("horizon.guestLimit", { limit: IGM_LAUNCHERV2_GUEST_HORIZON_LIMIT })}
          </p>
        ) : null}
      </IGM_LauncherV2_Card>

      <IGM_LauncherV2_Card className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>{t("horizon.list.title")}</h2>
            <p className={styles.panelDesc}>
              {t("horizon.list.current", {
                value: horizons.currentId || t("horizon.list.notChosen"),
              })}
            </p>
          </div>
          <span className={styles.rootHint}>{horizons.horizonsRoot || "-"}</span>
        </div>

        {!horizons.loaded ? (
          <p className={styles.empty}>{t("horizon.list.loading")}</p>
        ) : horizons.items.length === 0 ? (
          <p className={styles.empty}>{t("horizon.list.empty")}</p>
        ) : (
          <ul className={styles.list}>
            {horizons.items.map((item) => (
              <li key={item.id} className={styles.listRow}>
                <button
                  type="button"
                  className={styles.rowMain}
                  title={t("horizon.list.viewDetail")}
                  aria-label={t("horizon.list.viewDetailOf", { name: item.name })}
                  onClick={() => setDetailId(item.id)}
                >
                  <div className={styles.rowTitleLine}>
                    <Layers size={15} strokeWidth={2.2} className={styles.iconDim} />
                    <span className={styles.rowTitle}>{item.name}</span>
                    {item.current ? (
                      <span className={styles.rowTagOn}>
                        <CheckCircle2 size={12} strokeWidth={2.4} />
                        {t("horizon.currentTag")}
                      </span>
                    ) : null}
                  </div>
                  <span className={styles.rowSub}>{item.path}</span>
                  <span className={styles.rowMeta}>
                    <Boxes size={12} strokeWidth={2.2} />
                    {t("horizon.modCount", { count: item.modCount })}
                  </span>
                </button>

                <div className={styles.rowActions}>
                  {pendingDelete === item.id ? (
                    <>
                      <button
                        type="button"
                        className={`${styles.actionButton} ${styles.actionButtonDanger}`}
                        onClick={() => {
                          horizons.remove(item.id);
                          setPendingDelete(null);
                        }}
                      >
                        <span>{t("horizon.confirmDelete")}</span>
                      </button>
                      <button
                        type="button"
                        className={styles.actionButton}
                        onClick={() => setPendingDelete(null)}
                      >
                        <span>{t("common.cancel")}</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={styles.actionButton}
                        disabled={item.current}
                        onClick={() => horizons.select(item.id)}
                      >
                        <span>{item.current ? t("common.currentUse") : t("horizon.switchTo")}</span>
                      </button>
                      <button
                        type="button"
                        className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                        aria-label={t("horizon.deleteThis")}
                        onClick={() => setPendingDelete(item.id)}
                      >
                        <Trash2 size={15} strokeWidth={2.2} />
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </IGM_LauncherV2_Card>

      {/* 新建视界表单弹窗：填写名称、选择已下载版本与加载器，确认后才真正创建 */}
      {createOpen ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <IGM_LauncherV2_Card className={styles.modalCard}>
            <div className={styles.modalHead}>
              <h3 className={styles.modalTitle}>{t("horizon.create")}</h3>
              <button
                type="button"
                className={styles.iconButton}
                aria-label={t("horizon.modal.close")}
                disabled={submitState === "pending"}
                onClick={() => setCreateOpen(false)}
              >
                <X size={15} strokeWidth={2.4} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {/* 配置项一：视界名称 */}
              <div className={styles.modalField}>
                <span className={styles.modalLabel}>{t("horizon.modal.nameLabel")}</span>
                <input
                  className={styles.modalInput}
                  value={formName}
                  placeholder={t("horizon.modal.namePlaceholder")}
                  autoFocus
                  onChange={(event) => {
                    setNameTouched(true);
                    setFormName(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") submit();
                  }}
                />
              </div>

              {/* 配置项二：绑定已下载版本 */}
              <div className={styles.modalField}>
                <span className={styles.modalLabel}>{t("horizon.modal.versionLabel")}</span>
                {installed.versions.length === 0 ? (
                  <select className={styles.select} value="" disabled>
                    <option value="">
                      {installed.loading
                        ? t("horizon.modal.versionsLoading")
                        : t("horizon.modal.versionsEmpty")}
                    </option>
                  </select>
                ) : (
                  <select
                    className={styles.select}
                    value={formVersion}
                    onChange={(event) => setFormVersion(event.target.value)}
                  >
                    {installed.versions.map((version) => (
                      <option key={version} value={version}>
                        {version}
                      </option>
                    ))}
                  </select>
                )}
                {installed.versions.length === 0 ? (
                  <p className={styles.modalHintWarn}>
                    <AlertCircle size={12} strokeWidth={2.2} />
                    <span>{t("horizon.modal.versionsEmptyHint")}</span>
                  </p>
                ) : null}
              </div>

              {/* 配置项三：加载器 */}
              <div className={styles.modalField}>
                <span className={styles.modalLabel}>{t("horizon.modal.loaderLabel")}</span>
                <select
                  className={styles.select}
                  value={formLoader}
                  onChange={(event) => setFormLoader(event.target.value)}
                >
                  {IGM_HORIZON_LOADER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(option.label)}
                    </option>
                  ))}
                </select>
              </div>

              {formError ? (
                <p className={styles.modalError} role="alert">
                  <AlertCircle size={13} strokeWidth={2.2} />
                  <span>{formError}</span>
                </p>
              ) : null}
            </div>

            <div className={styles.modalFoot}>
              <button
                type="button"
                className={styles.actionButton}
                disabled={submitState === "pending"}
                onClick={() => setCreateOpen(false)}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
                disabled={submitState === "pending"}
                onClick={submit}
              >
                {submitState === "pending" ? (
                  <Loader size={14} strokeWidth={2.2} />
                ) : (
                  <Layers size={14} strokeWidth={2.2} />
                )}
                <span>
                  {submitState === "pending"
                    ? t("horizon.modal.creating")
                    : t("horizon.modal.confirmCreate")}
                </span>
              </button>
            </div>
          </IGM_LauncherV2_Card>
        </div>
      ) : null}
    </div>
  );
}

// 导出 //
export default iGM_LauncherV2_Horizon;
