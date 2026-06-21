/**
 * create-xlsx — Excel 创建工具脚本
 */

async function execute(input, context) {
  const { filePath, data } = input
  if (!filePath || !data) {
    return { success: false, error: '缺少 filePath 或 data 参数' }
  }
  if (!Array.isArray(data)) {
    return { success: false, error: 'data 参数必须是二维数组' }
  }
  if (data.length > 0 && !Array.isArray(data[0])) {
    return { success: false, error: 'data 的每一行必须是数组（二维数组格式）' }
  }

  try {
    const result = await context.nativeTools.document.createXlsx(filePath, data)
    if (result.success) {
      return {
        success: true,
        message: `Excel 文件已保存: ${filePath}`,
        fileSize: result.fileSize,
      }
    }
    return result
  } catch (err) {
    return { success: false, error: `创建 Excel 失败: ${err.message}` }
  }
}

module.exports = { execute }
