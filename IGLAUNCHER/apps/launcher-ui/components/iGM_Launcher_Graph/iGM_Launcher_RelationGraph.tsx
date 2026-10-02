/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Graph/iGM_Launcher_RelationGraph.tsx
 * 所属层：前端 / 组件层
 * 路由：G_ResourceCenter（SPA 页 id：resourceCenter）内嵌
 * 模块：iGM_Launcher_RelationGraph
 * 作用：以 SVG 径向布局绘制资源中心关系图（中心节点在圆心，周边节点按 ring 分层）
 * 内容：经 resource:graph 桥接加载图数据；中心节点高亮（更大、强调色描边）；
 *       边按 compatible（实线）/ dependency（虚线）/ derived（点线）区分线型与颜色并配图例；
 *       点击节点以该节点为新中心重新加载，中心为版本 / 资源时分别给出下载入口；
 *       支持滚轮缩放（0.4x-3x）与鼠标拖拽平移，提供「重置视图」；
 *       加载 / 失败 / 空态均有本地化文案，缺失节点引用的边安全跳过（不产生 NaN）。
 *
 * 说明：不引入任何第三方图库，布局由本组件按 ring 自行计算；
 *       缩放与平移只在 SVG 内部做变换，不改变页面滚动。
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { AlertCircle, Download, Loader2, Maximize2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type {
  iGM_Launcher_ResourceGraphData,
  iGM_Launcher_ResourceGraphNode,
} from "@igm-launcher/shared";
import {
  iGM_Launcher_Badge as IGM_Launcher_Badge,
  iGM_Launcher_Button as IGM_Launcher_Button,
} from "@/components/iGM_Launcher_Primitives/iGM_Launcher_Primitives";
import { iGM_Launcher_BridgeCall } from "@/components/iGM_Launcher_Bridge/iGM_Launcher_BridgeClient";
import styles from "./iGM_Launcher_RelationGraph.module.css";

// 类型定义 //
/** 组件入参 */
interface iGM_Launcher_RelationGraphProps {
  /** 初始中心版本号（与 centerResourceId 二选一，版本号优先） */
  centerVersion?: string;
  /** 初始中心资源 id */
  centerResourceId?: string;
  /** 中心或节点为版本时的下载 / 安装入口（跳转 gameInstall） */
  onOpenVersion: (version: string) => void;
  /** 中心或节点为资源时的前往下载入口（携资源节点，切到资源下载视图并按名称检索） */
  onOpenResource: (node: iGM_Launcher_ResourceGraphNode) => void;
}

/** 计算后的节点坐标 */
interface iGM_Launcher_GraphPlaced {
  node: iGM_Launcher_ResourceGraphNode;
  x: number;
  y: number;
}

/** 当前请求的中心（版本号或资源 id 二选一） */
interface iGM_Launcher_GraphCenter {
  version?: string;
  resourceId?: string;
}

/* SVG 逻辑坐标系尺寸（viewBox），实际显示尺寸由 CSS 决定 */
const IGM_GRAPH_VIEW = 720;
const IGM_GRAPH_HALF = IGM_GRAPH_VIEW / 2;
/** 第一圈起始半径与最小圈间距 */
const IGM_GRAPH_BASE_RADIUS = 108;
/** 缩放范围 */
const IGM_GRAPH_MIN_ZOOM = 0.4;
const IGM_GRAPH_MAX_ZOOM = 3;

// 核心逻辑 //

/** 数值夹紧 */
function iGM_Launcher_Clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 标签超长截断（资源标题可能很长） */
function iGM_Launcher_ShortLabel(label: string, max = 14): string {
  const text = label.trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function iGM_Launcher_RelationGraph({
  centerVersion,
  centerResourceId,
  onOpenVersion,
  onOpenResource,
}: iGM_Launcher_RelationGraphProps) {
  const t = useTranslations("relationGraph");

  const [center, setCenter] = useState<iGM_Launcher_GraphCenter>(() => ({
    version: centerVersion,
    resourceId: centerResourceId,
  }));
  const [graph, setGraph] = useState<iGM_Launcher_ResourceGraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  // 视图变换：缩放与平移（平移为屏幕像素）
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const svgRef = useRef<SVGSVGElement>(null);
  // 拖拽起点与是否发生位移（位移超过阈值时抑制节点点击）
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const movedRef = useRef(false);

  // 上游中心变化（如版本库加载完成后传入最新正式版）时同步重新加载
  useEffect(() => {
    setCenter({ version: centerVersion, resourceId: centerResourceId });
  }, [centerVersion, centerResourceId]);

  const hasCenter = Boolean(center.version || center.resourceId);

  const loadGraph = useCallback(async () => {
    if (!center.version && !center.resourceId) {
      setGraph(null);
      return;
    }
    setLoading(true);
    setFailed(false);
    const response = await iGM_Launcher_BridgeCall("resource:graph", {
      version: center.version || undefined,
      resourceId: center.resourceId || undefined,
    });
    setLoading(false);
    if (!response.success || !response.data?.graph) {
      // 不暴露原始错误串，统一展示本地化提示与可操作建议
      setGraph(null);
      setFailed(true);
      return;
    }
    setGraph(response.data.graph);
    // 切中心后回到默认视图，避免旧平移造成节点跑出可视区
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [center.version, center.resourceId]);

  useEffect(() => {
    void loadGraph();
  }, [loadGraph]);

  /* ---------- 径向布局 ---------- */

  const placed = useMemo<iGM_Launcher_GraphPlaced[]>(() => {
    if (!graph || graph.nodes.length === 0) return [];
    const safeRing = (node: iGM_Launcher_ResourceGraphNode): number =>
      Number.isFinite(node.ring) && node.ring > 0 ? Math.floor(node.ring) : 0;
    const maxRing = Math.max(1, ...graph.nodes.map(safeRing));
    const outerMax = IGM_GRAPH_HALF - 56;
    const gap = Math.max(76, (outerMax - IGM_GRAPH_BASE_RADIUS) / maxRing);
    const radiusOf = (ring: number): number =>
      ring <= 0 ? 0 : IGM_GRAPH_BASE_RADIUS + (ring - 1) * gap;

    // 按 ring 分组，同圈节点均分角度（从正上方开始）
    const byRing = new Map<number, iGM_Launcher_ResourceGraphNode[]>();
    for (const node of graph.nodes) {
      const ring = safeRing(node);
      const list = byRing.get(ring) ?? [];
      list.push(node);
      byRing.set(ring, list);
    }

    const result: iGM_Launcher_GraphPlaced[] = [];
    for (const [ring, nodes] of byRing) {
      const radius = radiusOf(ring);
      const sorted = [...nodes].sort((a, b) => a.label.localeCompare(b.label));
      sorted.forEach((node, index) => {
        const angle = -Math.PI / 2 + (index / sorted.length) * Math.PI * 2;
        result.push({
          node,
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
        });
      });
    }
    return result;
  }, [graph]);

  const positionById = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const item of placed) map.set(item.node.id, { x: item.x, y: item.y });
    return map;
  }, [placed]);

  /** 两端都在节点集合内的边（缺失节点安全跳过） */
  const edges = useMemo(() => {
    if (!graph) return [];
    return graph.edges
      .map((edge) => {
        const from = positionById.get(edge.from);
        const to = positionById.get(edge.to);
        if (!from || !to) return null;
        return { edge, from, to };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [graph, positionById]);

  const centerNode = graph?.nodes.find((node) => node.center) ?? null;

  /* ---------- 交互 ---------- */

  // 滚轮缩放：以非被动原生监听器注册，避免浏览器默认滚动
  useEffect(() => {
    const element = svgRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setZoom((current) =>
        iGM_Launcher_Clamp(
          current * (event.deltaY < 0 ? 1.12 : 1 / 1.12),
          IGM_GRAPH_MIN_ZOOM,
          IGM_GRAPH_MAX_ZOOM,
        ),
      );
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    dragRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
    movedRef.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) movedRef.current = true;
    setPan({ x: drag.panX + dx, y: drag.panY + dy });
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  /** 点击节点：以该节点为新中心重新加载 */
  const handleNodeClick = (node: iGM_Launcher_ResourceGraphNode) => {
    if (movedRef.current) return;
    if (node.center) return;
    if (node.kind === "version") setCenter({ version: node.label });
    else setCenter({ resourceId: node.id });
  };

  /** 中心节点的操作入口 */
  const renderCenterActions = () => {
    if (!centerNode) return null;
    return (
      <div className={styles.centerBar}>
        <span className={styles.centerLabel}>{centerNode.label}</span>
        <IGM_Launcher_Badge tone={centerNode.kind === "version" ? "accent" : "neutral"}>
          {t(centerNode.kind === "version" ? "kind_version" : "kind_resource")}
        </IGM_Launcher_Badge>
        {centerNode.kind === "version" ? (
          <IGM_Launcher_Button variant="primary" onClick={() => onOpenVersion(centerNode.label)}>
            <Download size={14} strokeWidth={2} />
            {t("actionDownloadVersion")}
          </IGM_Launcher_Button>
        ) : (
          <IGM_Launcher_Button variant="primary" onClick={() => onOpenResource(centerNode)}>
            <Download size={14} strokeWidth={2} />
            {t("actionOpenResource")}
          </IGM_Launcher_Button>
        )}
      </div>
    );
  };

  return (
    <div className={styles.wrap}>
      {/* 工具栏：图例 + 重置视图 */}
      <div className={styles.toolbar}>
        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={`${styles.legendLine} ${styles.legendCompatible}`} />
            {t("legend_compatible")}
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.legendLine} ${styles.legendDependency}`} />
            {t("legend_dependency")}
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.legendLine} ${styles.legendDerived}`} />
            {t("legend_derived")}
          </span>
        </div>
        <IGM_Launcher_Button variant="ghost" onClick={resetView}>
          <Maximize2 size={14} strokeWidth={1.8} />
          {t("resetView")}
        </IGM_Launcher_Button>
      </div>

      {centerNode ? renderCenterActions() : null}

      {!hasCenter ? (
        <p className={styles.stateText}>{t("noCenter")}</p>
      ) : loading ? (
        <p className={styles.stateText}>
          <Loader2 size={14} strokeWidth={1.8} className={styles.spin} />
          {t("loading")}
        </p>
      ) : failed ? (
        <p className={styles.errorText}>
          <AlertCircle size={14} strokeWidth={1.8} />
          {t("loadFailed")}
          <span className={styles.hintText}>{t("loadFailedHint")}</span>
        </p>
      ) : !graph || graph.nodes.length === 0 ? (
        <p className={styles.stateText}>{t("empty")}</p>
      ) : (
        <>
          <svg
            ref={svgRef}
            className={styles.canvas}
            viewBox={`0 0 ${IGM_GRAPH_VIEW} ${IGM_GRAPH_VIEW}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            role="img"
            aria-label={t("title")}
          >
            <g transform={`translate(${IGM_GRAPH_HALF} ${IGM_GRAPH_HALF})`}>
              <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
                {/* 同心圆参考线 */}
                {Array.from(new Set(placed.filter((item) => item.node.ring > 0).map((item) => item.node.ring))).map(
                  (ring) => {
                    const sample = placed.find((item) => item.node.ring === ring);
                    const radius = sample ? Math.hypot(sample.x, sample.y) : 0;
                    return (
                      <circle
                        key={`ring-${ring}`}
                        cx={0}
                        cy={0}
                        r={radius}
                        className={styles.ring}
                      />
                    );
                  },
                )}

                {/* 关系边：按 relation 区分线型与颜色 */}
                {edges.map(({ edge, from, to }, index) => (
                  <line
                    key={`${edge.from}-${edge.to}-${edge.relation}-${index}`}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    className={`${styles.edge} ${
                      edge.relation === "dependency"
                        ? styles.edgeDependency
                        : edge.relation === "derived"
                          ? styles.edgeDerived
                          : styles.edgeCompatible
                    }`}
                  />
                ))}

                {/* 节点 */}
                {placed.map(({ node, x, y }) => {
                  const isCenter = node.center || node.id === graph.centerId;
                  const radius = isCenter ? 30 : 20;
                  return (
                    <g
                      key={node.id}
                      className={styles.node}
                      transform={`translate(${x} ${y})`}
                      onClick={() => handleNodeClick(node)}
                    >
                      <circle
                        r={radius}
                        className={`${styles.nodeCircle} ${
                          node.kind === "version" ? styles.nodeVersion : styles.nodeResource
                        } ${isCenter ? styles.nodeCenter : ""}`}
                      />
                      <text
                        y={radius + 14}
                        textAnchor="middle"
                        className={`${styles.nodeLabel} ${isCenter ? styles.nodeLabelCenter : ""}`}
                      >
                        {iGM_Launcher_ShortLabel(node.label, isCenter ? 18 : 14)}
                      </text>
                    </g>
                  );
                })}
              </g>
            </g>
          </svg>
          <p className={styles.hintText}>{t("clickHint")}</p>
        </>
      )}
    </div>
  );
}

// 导出 //
export default iGM_Launcher_RelationGraph;
