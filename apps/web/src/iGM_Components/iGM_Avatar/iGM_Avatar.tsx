/**
 * 文件路径：apps/web/src/iGM_Components/iGM_Avatar/iGM_Avatar.tsx
 * 所属层：前端 / 通用组件层
 * 路由：G_Community、G_Post、G_User、G_UserPosts、G_UserComments
 * 模块：iGM_Avatar
 * 作用：统一头像展示——优先显示头像图片 URL，缺省时以昵称/用户名首字符占位
 * 内容：尺寸（sm/default/lg）、图片加载失败自动回退首字符占位
 * 说明：本模块暂不实现头像上传，头像为用户填写的外部图片 URL
 */

// 导入依赖 //
"use client";

import { useState } from "react";
import styles from "./iGM_Avatar.module.css";

// 类型定义 //
export interface iGM_AvatarProps {
  /** 头像图片地址，为空时使用首字符占位 */
  src: string | null | undefined;
  /** 用于取首字符的名称（昵称或用户名） */
  name: string;
  /** 尺寸规格 */
  size?: "sm" | "default" | "lg";
}

// 核心逻辑 //
/** 头像：图片 URL 或首字符占位 */
export function iGM_Avatar({ src, name, size = "default" }: iGM_AvatarProps) {
  const [failed, setFailed] = useState(false);

  const sizeClass =
    size === "sm"
      ? styles.avatarSm
      : size === "lg"
        ? styles.avatarLg
        : "";
  const initial = (name.trim().charAt(0) || "?").toUpperCase();

  if (src && !failed) {
    return (
      <span className={`${styles.avatar} ${sizeClass}`}>
        <img
          src={src}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  return (
    <span
      className={`${styles.avatar} ${sizeClass}`}
      aria-hidden
    >
      {initial}
    </span>
  );
}

// 导出 //
export default iGM_Avatar;
