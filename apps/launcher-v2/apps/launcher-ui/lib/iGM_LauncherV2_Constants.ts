/**
 * 文件路径：apps/launcher-ui/lib/iGM_LauncherV2_Constants.ts
 * 所属层：前端 / 常量与类型层
 * 路由：全局
 * 模块：iGM_LauncherV2_Constants
 * 作用：界面侧共享常量与宿主消息契约（与 apps/shell 保持一致）
 * 内容：应用名 / 版本号 / 开发地址、宿主消息的收发联合类型
 * 说明：界面不依赖 electrobun SDK，仅通过预加载脚本注入的两个全局通道通信
 */

// 导入依赖 //
/* （无外部依赖） */

// 类型定义 //

/** 界面发往外壳的宿主消息 */
export type iGM_LauncherV2_OutboundMessage =
  | { type: "window:minimize" }
  | { type: "window:toggle-maximize" }
  | { type: "window:close" }
  | { type: "auth:status" }
  | { type: "auth:login" }
  | { type: "auth:logout" }
  | { type: "core:ping" };

/** 社区账号登录状态 */
export type iGM_LauncherV2_AuthState = "logged-out" | "pending" | "logged-in";

/** 已登录的社区账号公开视图（不含任何令牌） */
export interface iGM_LauncherV2_AuthUser {
  uid: string;
  nickname: string;
  avatar: string;
}

/** 外壳回推给界面的宿主消息 */
export type iGM_LauncherV2_InboundMessage =
  | {
      type: "auth:state";
      state: iGM_LauncherV2_AuthState;
      user: iGM_LauncherV2_AuthUser | null;
      message?: string;
    }
  | {
      type: "core:status";
      state: "ok" | "unavailable";
      detail: string;
      version?: string;
    };

declare global {
  interface Window {
    /** Electrobun 预加载脚本注入：界面 -> 外壳的宿主消息通道 */
    __electrobunSendToHost?: (message: iGM_LauncherV2_OutboundMessage) => void;
    /** Electrobun 预加载脚本注入的宿主通道对象（外壳 -> 界面） */
    __electrobun?: {
      receiveMessageFromHost?: (message: unknown) => void;
      receiveMessageFromBun?: (message: unknown) => void;
    };
    /** 预加载脚本在页面接管接收器之前缓存的消息 */
    __electrobunPendingHostMessages?: unknown[];
  }
}

// 核心逻辑 //

/** 应用展示名 */
export const IGM_LAUNCHERV2_APP_NAME = "iGM CraftCeon Launcher";

/** 启动器版本号 */
export const IGM_LAUNCHERV2_VERSION = "26.4.0";

/** 界面开发服务器地址（外壳开发模式加载） */
export const IGM_LAUNCHERV2_DEV_URL = "http://localhost:3211";

/** 社区授权本地回调地址（与 .env 的 IGCRAFTLIT_REDIRECT_URI 一致） */
export const IGM_LAUNCHERV2_REDIRECT_URI = "http://localhost:8080/callback";

// 导出 //
/* 常量与类型已于上方命名导出 */
