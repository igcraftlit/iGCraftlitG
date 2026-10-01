/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_StatusBar/iGM_Launcher_StatusBar.tsx
 * 所属层：前端 / 底部状态栏层
 * 路由：全局
 * 模块：iGM_Launcher_StatusBar
 * 作用：展示版本、登录状态、默认 Java、当前选中实例与网络状态
 * 内容：数据全部来自状态中心，随实例 / Java / 账户操作实时更新；
 *       点击登录状态、Java、实例分别跳转对应页面
 */

// 导入依赖 //
"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Boxes, Coffee, Tag, UserRound, Wifi, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { IGM_LAUNCHER_VERSION } from "@igm-launcher/shared";
import { iGM_Launcher_UseStore } from "@/components/iGM_Launcher_Store/iGM_Launcher_StoreProvider";
import { iGM_Launcher_UseShellLayout } from "@/components/iGM_Launcher_AppShell/iGM_Launcher_AppShell";
import styles from "./iGM_Launcher_StatusBar.module.css";

// 类型定义 //
/* （无额外类型） */

// 核心逻辑 //
export function iGM_Launcher_StatusBar() {
  const t = useTranslations("footer");
  const tAccount = useTranslations("account");
  const { navigate } = iGM_Launcher_UseShellLayout();
  const { account, javas, defaultJavaId, instances, selectedInstanceId } =
    iGM_Launcher_UseStore();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(window.navigator.onLine);
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const defaultJava = javas.find((runtime) => runtime.id === defaultJavaId);
  const selectedInstance = instances.find((instance) => instance.id === selectedInstanceId);
  const signedIn = account.signedIn;

  return (
    <footer className={styles.statusbar}>
      <div className={styles.group}>
        <span className={styles.item} title={t("version", { version: IGM_LAUNCHER_VERSION })}>
          <Tag size={12} strokeWidth={1.8} />
          <span>{t("version", { version: IGM_LAUNCHER_VERSION })}</span>
        </span>

        <button
          type="button"
          className={styles.itemButton}
          title={signedIn ? account.uid : tAccount("signIn")}
          onClick={() => navigate(signedIn ? "account" : "accountLogin")}
        >
          {signedIn ? (
            <>
              <UserRound size={12} strokeWidth={1.8} />
              <span className={styles.name}>{account.userName}</span>
              <BadgeCheck size={12} strokeWidth={1.8} className={styles.verified} />
            </>
          ) : (
            <>
              <UserRound size={12} strokeWidth={1.8} />
              <span>{t("notSignedIn")}</span>
            </>
          )}
        </button>
      </div>

      <div className={styles.group}>
        <button
          type="button"
          className={styles.itemButton}
          title={defaultJava ? defaultJava.path : t("javaNotFound")}
          onClick={() => navigate("java")}
        >
          <Coffee size={13} strokeWidth={1.8} />
          <span>
            {defaultJava
              ? t("javaDefault", { version: defaultJava.version })
              : t("javaNotFound")}
          </span>
        </button>

        <button
          type="button"
          className={styles.itemButton}
          title={selectedInstance ? selectedInstance.directory : t("noInstanceSelected")}
          onClick={() => navigate("instances")}
        >
          <Boxes size={13} strokeWidth={1.8} />
          <span className={styles.name}>
            {selectedInstance
              ? t("selectedInstance", { name: selectedInstance.name })
              : t("noInstanceSelected")}
          </span>
        </button>

        <span className={`${styles.item} ${online ? styles.online : styles.offline}`}>
          {online ? <Wifi size={13} strokeWidth={1.8} /> : <WifiOff size={13} strokeWidth={1.8} />}
          <span>{online ? t("networkOnline") : t("networkOffline")}</span>
        </span>
      </div>
    </footer>
  );
}

// 导出 //
export default iGM_Launcher_StatusBar;