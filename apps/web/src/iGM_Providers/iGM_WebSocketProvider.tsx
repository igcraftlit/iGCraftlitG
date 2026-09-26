/**
 * 文件路径：apps/web/src/iGM_Providers/iGM_WebSocketProvider.tsx
 * 所属层：前端 / Provider 层
 * 路由：全局（挂载于 iGM_Providers 内，AuthProvider 之后）
 * 模块：iGM_WebSocketProvider
 * 作用：全局 WebSocket 连接管理——登录态变化时自动连接/断开
 * 内容：连接状态、在线用户列表、实时通知流、心跳保活与自动重连
 * 说明：仅在客户端运行；身份凭据由浏览器自动携带 Cookie；
 *       断线后指数退避自动重连，最多 10 次
 */

// 导入依赖 //
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { iGM_UseAuth } from "./iGM_AuthProvider";
import {
  iGM_GetWsUrl,
  type iGM_WsMessage,
  type iGM_WsMessageEvent,
  type iGM_WsNotification,
  type iGM_WsOnlineUser,
} from "../iGM_Services/iGM_RealtimeClient";
import { iGM_ApiGetMessageUnreadCount } from "../iGM_Services/iGM_MessageClient";

// 类型定义 //
interface iGM_WebSocketContextValue {
  /** 是否已连接 */
  connected: boolean;
  /** 在线用户数（服务端广播的聚合值） */
  onlineCount: number;
  /** 在线用户列表（去重，公开信息） */
  onlineUsers: iGM_WsOnlineUser[];
  /** 实时通知流（最多保留最近 50 条） */
  notifications: iGM_WsNotification[];
  /** 清空实时通知流 */
  clearNotifications: () => void;
  /** 模块十：私信实时事件流（最多保留最近 50 条，页面按会话过滤） */
  messageEvents: iGM_WsMessageEvent[];
  /** 模块十：私信未读总数 */
  messageUnreadCount: number;
  /** 模块十：重新拉取私信未读数（标记已读后调用） */
  refreshMessageUnread: () => Promise<void>;
}

interface iGM_WebSocketProviderProps {
  children: ReactNode;
}

// 核心逻辑 //
const iGM_WebSocketContext = createContext<iGM_WebSocketContextValue | null>(null);

/** 心跳间隔：30 秒 */
const iGM_PingIntervalMs = 30 * 1000;
/** 最大重连次数 */
const iGM_MaxReconnect = 10;

/** 全局 WebSocket Provider */
export function iGM_WebSocketProvider({ children }: iGM_WebSocketProviderProps) {
  const { status, user } = iGM_UseAuth();
  const [connected, setConnected] = useState(false);
  const [onlineCount, setOnlineCount] = useState(0);
  const [onlineUsers, setOnlineUsers] = useState<iGM_WsOnlineUser[]>([]);
  const [notifications, setNotifications] = useState<iGM_WsNotification[]>([]);
  const [messageEvents, setMessageEvents] = useState<iGM_WsMessageEvent[]>([]);
  const [messageUnreadCount, setMessageUnreadCount] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectCountRef = useRef(0);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  /** 从后端同步私信未读总数 */
  const refreshMessageUnread = useCallback(async () => {
    try {
      const response = await iGM_ApiGetMessageUnreadCount();
      setMessageUnreadCount(response.data?.unreadCount ?? 0);
    } catch {
      // 未读数同步失败不阻塞页面
    }
  }, []);

  useEffect(() => {
    // 仅在登录后连接；未登录或登出时断开并清空状态
    if (status !== "authenticated") {
      setConnected(false);
      setOnlineCount(0);
      setOnlineUsers([]);
      setNotifications([]);
      setMessageEvents([]);
      setMessageUnreadCount(0);
      reconnectCountRef.current = 0;
      return;
    }

    // 登录后先同步一次私信未读数
    void refreshMessageUnread();

    let disposed = false;

    function connect() {
      if (disposed) return;
      // 已有连接则跳过
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
      if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) return;

      const wsUrl = iGM_GetWsUrl("/G_Realtime/ws");
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (disposed) {
          ws.close();
          return;
        }
        reconnectCountRef.current = 0;
        setConnected(true);
        // 启动心跳
        if (pingTimerRef.current) clearInterval(pingTimerRef.current);
        pingTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, iGM_PingIntervalMs);
      };

      ws.onmessage = (event) => {
        if (disposed) return;
        try {
          const message = JSON.parse(event.data as string) as iGM_WsMessage;
          if (message.type === "onlineList") {
            setOnlineCount(message.count);
            setOnlineUsers(message.users);
          } else if (message.type === "notification") {
            setNotifications((prev) => {
              const next = [message.notification, ...prev];
              return next.slice(0, 50);
            });
          } else if (
            message.type === "message" ||
            message.type === "messageRecall" ||
            message.type === "messageRead"
          ) {
            // 模块十：私信事件入环形缓冲；对端发来的新消息增加未读
            setMessageEvents((prev) => [message, ...prev].slice(0, 50));
            if (
              message.type === "message" &&
              message.message.senderId !== user?.id
            ) {
              setMessageUnreadCount((prev) => prev + 1);
            }
          }
        } catch {
          // 忽略格式错误的消息
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        setConnected(false);
        if (pingTimerRef.current) {
          clearInterval(pingTimerRef.current);
          pingTimerRef.current = null;
        }
        // 自动重连（指数退避，上限 10 次）
        if (reconnectCountRef.current < iGM_MaxReconnect) {
          const delay = Math.min(1000 * 2 ** reconnectCountRef.current, 30000);
          reconnectCountRef.current += 1;
          reconnectTimerRef.current = setTimeout(() => {
            if (!disposed) connect();
          }, delay);
        }
      };

      ws.onerror = () => {
        // 触发 onclose 走统一重连逻辑
        ws.close();
      };

      wsRef.current = ws;
    }

    connect();

    return () => {
      disposed = true;
      if (pingTimerRef.current) {
        clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [status, user?.id, refreshMessageUnread]);

  return (
    <iGM_WebSocketContext.Provider
      value={{
        connected,
        onlineCount,
        onlineUsers,
        notifications,
        clearNotifications,
        messageEvents,
        messageUnreadCount,
        refreshMessageUnread,
      }}
    >
      {children}
    </iGM_WebSocketContext.Provider>
  );
}

/** 读取 WebSocket 上下文的 Hook */
export function iGM_UseWebSocket(): iGM_WebSocketContextValue {
  const context = useContext(iGM_WebSocketContext);
  if (!context) {
    throw new Error("iGM_UseWebSocket 必须在 iGM_WebSocketProvider 内使用");
  }
  return context;
}

// 导出 //
export default iGM_WebSocketProvider;
