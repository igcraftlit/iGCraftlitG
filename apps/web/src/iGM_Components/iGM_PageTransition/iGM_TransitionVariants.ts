/**
 * 文件路径：apps/web/src/iGM_Components/iGM_PageTransition/iGM_TransitionVariants.ts
 * 所属层：前端 / 通用组件层（动效配置）
 * 路由：全局
 * 模块：iGM_PageTransition
 * 作用：全站页面切换动效的唯一令牌来源（时长 / 缓动 / 位移 / 模糊 / 交错步距）
 * 内容：理念映射——
 *        探索：入场纵向位移 + 模糊消散（从未知到清晰）
 *        求真：干净利落、无拖影、时长收敛于 200–400ms
 *        梦想与创造：内容模块 40ms 阶梯交错渐显（建造过程）
 *        创新：极轻微缩放打破生硬切换
 *       CSS 侧同名变量定义于 app/iGM_Globals.css（--igm-motion-*），
 *       本文件仅供客户端 JS 读取（如主题淡入计时），两侧数值必须保持一致
 */

// 导入依赖 //
// （纯常量模块，无外部依赖）

// 类型定义 //
/** 动效时长集合（毫秒） */
export interface iGM_MotionDurationSet {
  /** 全局页面切换入场（320ms，落在 200–400ms 约束区间） */
  page: number;
  /** 页面内部模块交错渐显单项时长 */
  item: number;
  /** 侧边导航高亮 / 箭头等微交互 */
  nav: number;
  /** 主题切换全局短淡入 */
  theme: number;
}

// 核心逻辑 //
/**
 * 统一缓动：强减速 ease-out 曲线（easeOutQuint 近似），
 * 起手明确、收束干净，杜绝 bounce / 回弹拖影
 */
export const iGM_MotionEase = "cubic-bezier(0.22, 1, 0.36, 1)";

/** 动效时长（毫秒），与 iGM_Globals.css 的 --igm-motion-* 一一对应 */
export const iGM_MotionDuration: iGM_MotionDurationSet = {
  page: 320,
  item: 280,
  nav: 200,
  theme: 200,
};

/** 入场初始纵向位移（像素），向上归位，探索感来源 */
export const iGM_MotionOffsetY = 12;

/** 入场初始模糊（像素），由模糊到清晰，寓意求真 */
export const iGM_MotionBlur = 4;

/** 创新：入场初始微缩比例（0.992 → 1，仅可感知的空间纵深，不制造跳变） */
export const iGM_MotionEnterScale = 0.992;

/** 内部模块交错步距（毫秒），同组卡片 / 列表 / 标题依序渐显 */
export const iGM_MotionStaggerStep = 40;

/** 首批模块相对页面入场的启动延迟（毫秒），等画面焦点建立后再“建造” */
export const iGM_MotionStaggerBase = 70;

/** 参与交错的最大模块数：超出部分立即呈现，避免长列表久等 */
export const iGM_MotionStaggerLimit = 8;

/** 降低动态偏好媒体查询，JS 侧降级判断使用 */
export const iGM_ReducedMotionQuery = "(prefers-reduced-motion: reduce)";

/**
 * 计算第 index 个模块（0 起）的交错延迟
 * @param index 模块在同级中的序号
 * @returns 实际延迟毫秒；超出上限的模块返回 0（立即呈现）
 */
export function iGM_GetStaggerDelay(index: number): number {
  if (index < 0 || index >= iGM_MotionStaggerLimit) return 0;
  return iGM_MotionStaggerBase + index * iGM_MotionStaggerStep;
}

// 导出 //
export default {
  ease: iGM_MotionEase,
  duration: iGM_MotionDuration,
  offsetY: iGM_MotionOffsetY,
  blur: iGM_MotionBlur,
  enterScale: iGM_MotionEnterScale,
  staggerStep: iGM_MotionStaggerStep,
  staggerBase: iGM_MotionStaggerBase,
  staggerLimit: iGM_MotionStaggerLimit,
  reducedMotionQuery: iGM_ReducedMotionQuery,
  getStaggerDelay: iGM_GetStaggerDelay,
};
