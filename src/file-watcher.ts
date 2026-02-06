/**
 * 文件监视器
 * 监视身份映射表文件变化并自动重载
 */

import fs from "node:fs";
import path from "node:path";

export type FileChangeCallback = () => void;

export class FileWatcher {
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly debounceMs: number;

  constructor(debounceMs: number = 1000) {
    this.debounceMs = debounceMs;
  }

  /**
   * 开始监视文件
   * @param filePath 文件路径
   * @param callback 文件变化回调
   */
  watch(filePath: string, callback: FileChangeCallback): void {
    // 如果已经在监视，先停止
    this.unwatch(filePath);

    // 确保文件存在
    if (!fs.existsSync(filePath)) {
      console.log(`[FileWatcher] 文件不存在，跳过监视: ${filePath}`);
      return;
    }

    try {
      const watcher = fs.watch(filePath, (eventType) => {
        if (eventType === "change") {
          // 防抖处理，避免频繁触发
          this.debounce(filePath, callback);
        }
      });

      this.watchers.set(filePath, watcher);
      console.log(`[FileWatcher] 开始监视: ${filePath}`);
    } catch (err) {
      console.error(`[FileWatcher] 监视失败: ${filePath}`, err);
    }
  }

  /**
   * 停止监视文件
   * @param filePath 文件路径
   */
  unwatch(filePath: string): void {
    const watcher = this.watchers.get(filePath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(filePath);
      console.log(`[FileWatcher] 停止监视: ${filePath}`);
    }

    // 清除防抖定时器
    const timer = this.debounceTimers.get(filePath);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(filePath);
    }
  }

  /**
   * 停止所有监视
   */
  unwatchAll(): void {
    for (const [filePath, watcher] of this.watchers) {
      watcher.close();
      console.log(`[FileWatcher] 停止监视: ${filePath}`);
    }
    this.watchers.clear();

    // 清除所有防抖定时器
    for (const [filePath, timer] of this.debounceTimers) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  /**
   * 防抖处理
   */
  private debounce(filePath: string, callback: FileChangeCallback): void {
    // 清除之前的定时器
    const existingTimer = this.debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // 设置新的定时器
    const timer = setTimeout(() => {
      console.log(`[FileWatcher] 文件变化: ${filePath}`);
      callback();
      this.debounceTimers.delete(filePath);
    }, this.debounceMs);

    this.debounceTimers.set(filePath, timer);
  }
}

// 全局单例
let globalWatcher: FileWatcher | null = null;

/**
 * 获取全局文件监视器
 */
export function getGlobalFileWatcher(): FileWatcher {
  if (!globalWatcher) {
    globalWatcher = new FileWatcher();
  }
  return globalWatcher;
}
