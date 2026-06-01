// scripts/json_format.cjs
'use strict';
const fs = require('fs');
const path = require('path');

async function execute(input) {
  const { inputPath, outputPath, indent } = input;

  if (!inputPath) {
    return { success: false, error: '缺少必需参数 inputPath' };
  }

  const resolvedInput = path.resolve(inputPath);
  if (!fs.existsSync(resolvedInput)) {
    return { success: false, error: `文件不存在: ${resolvedInput}` };
  }

  let raw;
  try {
    raw = fs.readFileSync(resolvedInput, 'utf-8');
  } catch (e) {
    return { success: false, error: `读取文件失败: ${e.message}` };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { success: false, error: `JSON 解析失败: ${e.message}` };
  }

  const spaces = typeof indent === 'number' && indent > 0 ? indent : 2;
  const formatted = JSON.stringify(parsed, null, spaces) + '\n';

  const resolvedOutput = outputPath ? path.resolve(outputPath) : resolvedInput;

  try {
    const dir = path.dirname(resolvedOutput);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(resolvedOutput, formatted, 'utf-8');
  } catch (e) {
    return { success: false, error: `写入文件失败: ${e.message}` };
  }

  const stats = fs.statSync(resolvedOutput);
  const sameFile = resolvedOutput === resolvedInput;

  return {
    success: true,
    result: sameFile
      ? `格式化完成，已覆盖原文件: ${resolvedOutput} (${(stats.size / 1024).toFixed(1)} KB)`
      : `格式化完成，输出至: ${resolvedOutput} (${(stats.size / 1024).toFixed(1)} KB)`,
    outputPath: resolvedOutput,
    size: stats.size,
  };
}

module.exports = { execute };
