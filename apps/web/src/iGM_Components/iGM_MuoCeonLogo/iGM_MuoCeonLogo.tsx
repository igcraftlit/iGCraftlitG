/**
 * 文件路径：apps/web/src/iGM_Components/iGM_MuoCeonLogo/iGM_MuoCeonLogo.tsx
 * 所属层：前端 / 通用组件层
 * 路由：/G_Auth/login、/auth/muoceon
 * 模块：iGM_MuoCeonLogo
 * 作用：MuoCeon 账号体系品牌图标（内联 SVG，免外部资源请求）
 * 内容：猫耳 + C 形圆环 + 尾巴 + 怀里金色小点，青色渐变描边
 * 说明：渐变 id 全局固定，同页多实例共用同一视觉定义；图标仅作装饰，
 *       无障碍名称由外层按钮或标题提供
 */

// 导入依赖 //
import type { CSSProperties } from "react";

// 类型定义 //
interface iGM_MuoCeonLogoProps {
  /** 图标边长（像素），默认 40 */
  size?: number;
  className?: string;
  style?: CSSProperties;
}

// 核心逻辑 //
/** MuoCeon 品牌图标 */
export function iGM_MuoCeonLogo({
  size = 40,
  className,
  style,
}: iGM_MuoCeonLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      style={style}
      role="img"
      aria-label="MuoCeon"
      focusable="false"
    >
      <defs>
        <linearGradient
          id="iGM_MuoCeonRing"
          x1="60"
          y1="60"
          x2="452"
          y2="452"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#06B6D4" />
          <stop offset="1" stopColor="#0E7490" />
        </linearGradient>
      </defs>
      {/* 猫耳 */}
      <path
        d="M158.5 100 L175 32 L230.4 73.8 Z"
        fill="url(#iGM_MuoCeonRing)"
        stroke="url(#iGM_MuoCeonRing)"
        strokeWidth="12"
        strokeLinejoin="round"
      />
      <path
        d="M353.5 100 L337 32 L281.6 73.8 Z"
        fill="url(#iGM_MuoCeonRing)"
        stroke="url(#iGM_MuoCeonRing)"
        strokeWidth="12"
        strokeLinejoin="round"
      />
      {/* 身体：C 形圆环（缺口朝右） */}
      <path
        d="M386.1 125.9 A184 184 0 1 0 386.1 386.1"
        fill="none"
        stroke="url(#iGM_MuoCeonRing)"
        strokeWidth="38"
        strokeLinecap="round"
      />
      {/* 尾巴 */}
      <path
        d="M386.1 386.1 C 436 406, 470 362, 452 306 C 435 252, 392 282, 330 346 C 278 390, 196 388, 182 322"
        fill="none"
        stroke="url(#iGM_MuoCeonRing)"
        strokeWidth="30"
        strokeLinecap="round"
      />
      {/* 怀里的小点 */}
      <circle cx="256" cy="256" r="20" fill="#FFB020" />
    </svg>
  );
}

// 导出 //
export default iGM_MuoCeonLogo;
