/**
 * create-docx — Word 文档创建工具脚本
 * LLM 通过 tool_use 调用，从 Markdown 内容生成 .docx 文件
 */

async function execute(input, context) {
  const { filePath, content } = input
  if (!filePath || !content) {
    return { success: false, error: '缺少 filePath 或 content 参数' }
  }

  const result = await context.nativeTools.document.createDocx(filePath, content)
  if (result.success) {
    return {
      success: true,
      message: `Word 文档已保存: ${filePath}`,
      fileSize: result.fileSize,
    }
  }
  return result
}

module.exports = { execute }
