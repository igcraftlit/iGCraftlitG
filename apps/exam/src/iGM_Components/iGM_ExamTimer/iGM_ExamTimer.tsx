/**
 * 文件路径：apps/exam/src/iGM_Components/iGM_ExamTimer/iGM_ExamTimer.tsx
 * 所属层：前端 / 通用组件层
 * 路由：E_ExamDetail（/detail）
 * 模块：iGM_ExamTimer
 * 作用：实验计时器样式的考试倒计时（等宽数字、秒级跳动、刻度盘装饰）
 * 内容：时/分/秒三段等宽数字、进度弧、超时提示、暂停与重置
 * 说明：以考试时长（分钟）为基准倒计时；不做交卷拦截，仅作显示
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import styles from "./iGM_ExamTimer.module.css";

// 类型定义 //
interface iGM_ExamTimerProps {
  /** 考试时长（分钟），为空时不计时 */
  durationMinutes: number | null;
}

/** 拆分后的时间片段 */
interface iGM_Exam_ClockParts {
  hours: string;
  minutes: string;
  seconds: string;
  totalSeconds: number;
}

// 核心逻辑 //
/** 秒数 → 时分秒片段（两位补零） */
function iGM_Exam_SplitClock(totalSeconds: number): iGM_Exam_ClockParts {
  const safe = Math.max(0, totalSeconds);
  return {
    hours: String(Math.floor(safe / 3600)).padStart(2, "0"),
    minutes: String(Math.floor((safe % 3600) / 60)).padStart(2, "0"),
    seconds: String(safe % 60).padStart(2, "0"),
    totalSeconds: safe,
  };
}

/** 实验计时器 */
export function iGM_ExamTimer({ durationMinutes }: iGM_ExamTimerProps) {
  const total = Math.max(0, (durationMinutes ?? 0) * 60);
  const [remaining, setRemaining] = useState(total);
  const [running, setRunning] = useState(total > 0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** 重置到考试总时长 */
  const reset = useCallback(() => {
    setRemaining(total);
    setRunning(total > 0);
  }, [total]);

  // 时长变化时重置
  useEffect(() => {
    reset();
  }, [reset]);

  // 秒级跳动
  useEffect(() => {
    if (!running || remaining <= 0) return;
    tickRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          setRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [running, remaining]);

  const parts = iGM_Exam_SplitClock(remaining);
  const elapsedRatio = total > 0 ? 1 - parts.totalSeconds / total : 0;
  const expired = total > 0 && parts.totalSeconds === 0;

  return (
    <div className={`${styles.timer} ${expired ? styles.expired : ""}`}>
      <div className={styles.headRow}>
        <span className={`igm-mono ${styles.head}`}>SESSION TIMER</span>
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.ctrl}
            onClick={() => setRunning((v) => !v)}
            disabled={expired || total === 0}
            title={running ? "Pause" : "Resume"}
            aria-label={running ? "Pause timer" : "Resume timer"}
          >
            {running ? <Pause size={13} strokeWidth={1.9} /> : <Play size={13} strokeWidth={1.9} />}
          </button>
          <button
            type="button"
            className={styles.ctrl}
            onClick={reset}
            disabled={total === 0}
            title="Reset"
            aria-label="Reset timer"
          >
            <RotateCcw size={13} strokeWidth={1.9} />
          </button>
        </div>
      </div>

      <div className={`igm-mono ${styles.clock}`}>
        <span className={styles.seg}>{parts.hours}</span>
        <span className={styles.colon}>:</span>
        <span className={styles.seg}>{parts.minutes}</span>
        <span className={styles.colon}>:</span>
        <span className={styles.seg}>{parts.seconds}</span>
      </div>

      {/* 刻度盘进度 */}
      <div className={styles.gauge} aria-hidden>
        <span
          className={styles.gaugeFill}
          style={{ width: `${Math.round(elapsedRatio * 100)}%` }}
        />
      </div>

      <p className={`igm-mono ${styles.caption}`}>
        {total === 0 ? "NO TIME LIMIT" : expired ? "TIME EXPIRED" : "ELAPSED"}
      </p>
    </div>
  );
}

// 导出 //
export default iGM_ExamTimer;
