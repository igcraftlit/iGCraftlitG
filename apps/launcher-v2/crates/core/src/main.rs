/**
 * 文件路径：crates/core/src/main.rs
 * 所属层：Rust 原生核心 / Sidecar 进程层
 * 路由：全局（由 Bun 主进程经标准输入输出调用）
 * 模块：iGM_LauncherV2_Core
 * 作用：iGM CraftCeon Launcher 的 Rust 底层核心入口，模块一仅验证通信管道
 * 内容：基于 Tokio 的异步行循环，逐行读取标准输入中的 JSON 指令，
 *       目前仅处理 {"cmd":"ping"} 并回复 {"status":"ok"}，
 *       另支持 {"cmd":"shutdown"} 用于优雅退出；未知指令与非法 JSON 一律返回错误对象，
 *       每条回复单行输出并立即 flush，保证与 Bun 侧的一问一答配对。
 */

// 导入依赖 //
use std::process::ExitCode;

use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader, BufWriter};

// 类型定义 //
/// 核心版本号：与启动器 26.4.0 保持一致，随启动器发版同步
const IGM_CORE_VERSION: &str = "26.4.0";

// 核心逻辑 //

/// 处理单条指令：返回待写回的 JSON 文本；返回 None 表示要求进程退出。
fn handle_command(line: &str) -> Option<String> {
    let parsed: Value = match serde_json::from_str(line) {
        Ok(value) => value,
        Err(error) => {
            return Some(
                json!({
                    "status": "error",
                    "message": format!("invalid json: {error}"),
                })
                .to_string(),
            )
        }
    };

    let cmd = parsed.get("cmd").and_then(Value::as_str).unwrap_or("");

    match cmd {
        // 模块一：连通性验证，仅证明 stdio 管道已打通
        "ping" => Some(
            json!({
                "status": "ok",
                "core": "igm_core",
                "version": IGM_CORE_VERSION,
            })
            .to_string(),
        ),
        "shutdown" => None,
        other => Some(
            json!({
                "status": "error",
                "message": format!("unknown cmd: {other}"),
            })
            .to_string(),
        ),
    }
}

/// 异步主循环：逐行读取指令，写回单行 JSON 响应，直到输入结束或收到 shutdown。
async fn run() -> std::io::Result<()> {
    let mut reader = BufReader::new(tokio::io::stdin()).lines();
    let mut writer = BufWriter::new(tokio::io::stdout());

    while let Some(line) = reader.next_line().await? {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        match handle_command(trimmed) {
            Some(reply) => {
                writer.write_all(reply.as_bytes()).await?;
                writer.write_all(b"\n").await?;
                writer.flush().await?;
            }
            None => break,
        }
    }

    Ok(())
}

// 导出 //
#[tokio::main]
async fn main() -> ExitCode {
    match run().await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("[igm_core] stdio 循环异常：{error}");
            ExitCode::FAILURE
        }
    }
}
