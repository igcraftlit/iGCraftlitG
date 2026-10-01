/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Instance/iGM_Launcher_InstanceResourcesPanel.tsx
 * 所属层：前端 / 组件层
 * 路由：G_Instances_Edit（实例编辑页）
 * 模块：iGM_Launcher_InstanceResourcesPanel
 * 作用：展示某个实例目录下玩家已放入的模组、光影、材质包与数据包
 * 内容：数据来自主进程 instance:resources 桥接方法（遍历 mods / shaderpacks /
 *       resourcepacks / datapacks），按分组列出文件名、大小与修改时间，
 *       并提供「打开目录」跳转；仅启动器端可查看，网站端不暴露该能力。
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderOpen, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  iGM_Launcher_FormatSize,
  type iGM_Launcher_InstanceResources,
} from "@igm-launcher/shared";
import {
  iGM_Launcher_Badge as IGM_Launcher_Badge,
  iGM_Launcher_Button as IGM_Launcher_Button,
  iGM_Launcher_Card as IGM_Launcher_Card,
} from "@/components/iGM_Launcher_Primitives/iGM_Launcher_Primitives";
import { iGM_Launcher_BridgeCall } from "@/components/iGM_Launcher_Bridge/iGM_Launcher_BridgeClient";
import styles from "./iGM_Launcher_InstanceResourcesPanel.module.css";

// 类型定义 //
interface iGM_Launcher_InstanceResourcesPanelProps {
  /** 实例目录绝对路径（即实例的 gameDir） */
  dir: string;
  /** 实例名，仅用于面板标题 */
  instanceName: string;
  /** 面板标题（分组卡片标题由调用方传入，避免依赖具体页面文案） */
  title: string;
}

// 核心逻辑 //
/** 目录键 -> 展示名称 */
function iGM_Launcher_ResourceGroupLabel(
  t: (key: string) => string,
  key: string,
): string {
  if (key === "mods") return t("folderMods");
  if (key === "shaderpacks") return t("folderShaders");
  if (key === "resourcepacks") return t("folderResourcepacks");
  if (key === "datapacks") return t("folderDatapacks");
  return key;
}

export function iGM_Launcher_InstanceResourcesPanel({
  dir,
  instanceName,
  title,
}: iGM_Launcher_InstanceResourcesPanelProps) {
  const t = useTranslations("instanceRes");

  const [resources, setResources] = useState<iGM_Launcher_InstanceResources | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /** 扫描实例目录下已安装的资源 */
  const load = useCallback(
    async (target: string) => {
      setLoading(true);
      setError("");
      const response = await iGM_Launcher_BridgeCall("instance:resources", {
        instanceDir: target,
      });
      setLoading(false);
      if (!response.success || !response.data) {
        setResources(null);
        setError(response.message || t("scanFailed"));
        return;
      }
      setResources(response.data.resources);
    },
    [t],
  );

  // 切换实例时重新扫描；目录为空时不请求
  useEffect(() => {
    if (!dir) {
      setResources(null);
      setError("");
      return;
    }
    void load(dir);
  }, [dir, load]);

  /** 在系统文件管理器中打开目录；系统未接管时静默忽略 */
  const openPath = useCallback(async (path: string) => {
    await iGM_Launcher_BridgeCall("shell:open-path", { openPath: path });
  }, []);

  return (
    <IGM_Launcher_Card className={styles.panel}>
      <div className={styles.head}>
        <h2 className={styles.title}>
          {title} · {instanceName}
        </h2>
        <IGM_Launcher_Button
          variant="ghost"
          disabled={loading || !dir}
          onClick={() => void load(dir)}
        >
          <RefreshCw size={14} strokeWidth={1.8} />
          {loading ? t("scanning") : t("refresh")}
        </IGM_Launcher_Button>
      </div>
      <p className={styles.desc}>{t("subtitle")}</p>

      {error ? (
        <p className={styles.error}>{error}</p>
      ) : resources === null || loading ? (
        <p className={styles.empty}>{t("scanning")}</p>
      ) : resources.total === 0 ? (
        <>
          <p className={styles.empty}>{t("empty")}</p>
          <p className={styles.hint}>{t("emptyHint")}</p>
        </>
      ) : (
        <div className={styles.groups}>
          {resources.groups.map((group) => (
            <div key={group.key} className={styles.group}>
              <div className={styles.groupHead}>
                <span className={styles.groupName}>
                  {iGM_Launcher_ResourceGroupLabel(t, group.key)}
                </span>
                <IGM_Launcher_Badge tone={group.files.length > 0 ? "accent" : "muted"}>
                  {t("fileCount", { count: group.files.length })}
                </IGM_Launcher_Badge>
                <IGM_Launcher_Button
                  variant="ghost"
                  className={styles.open}
                  onClick={() => void openPath(group.dir)}
                >
                  <FolderOpen size={13} strokeWidth={1.8} />
                  {t("openFolder")}
                </IGM_Launcher_Button>
              </div>
              {group.files.length > 0 ? (
                <ul className={styles.files}>
                  {group.files.map((file) => (
                    <li key={file.path} className={styles.file}>
                      <span className={styles.fileName} title={file.path}>
                        {file.name}
                      </span>
                      <span className={styles.fileMeta}>
                        {iGM_Launcher_FormatSize(file.size)}
                      </span>
                      <span className={styles.fileMeta}>
                        {file.modifiedAt ? file.modifiedAt.slice(0, 10) : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </IGM_Launcher_Card>
  );
}

// 导出 //
export default iGM_Launcher_InstanceResourcesPanel;