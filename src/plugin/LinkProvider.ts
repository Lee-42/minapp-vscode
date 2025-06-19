/******************************************************************
 MIT License http://www.opensource.org/licenses/mit-license.php
 Author Mora <qiuzhongleiabc@126.com> (https://github.com/qiu8310)
*******************************************************************/

/**
 * 文档链接提供者
 * 
 * 这个类实现了 VSCode 的 DocumentLinkProvider 接口，为模板文件中的文件路径提供智能跳转功能。
 * 当用户 Ctrl+点击 或 Cmd+点击 链接时，可以直接跳转到对应的文件。
 * 
 * 🎯 **主要功能**：
 * - 🔗 **路径识别**: 自动识别模板中的文件路径链接
 * - 📁 **多路径支持**: 支持相对路径、绝对路径和远程URL
 * - 🎛️ **可配置属性**: 可自定义哪些属性支持链接跳转（如 src、href 等）
 * - 🔍 **智能解析**: 支持多个根目录的路径解析
 * - 🌐 **远程链接**: 支持 HTTP/HTTPS 等远程链接的处理
 * 
 * 💡 **使用场景**：
 * - 📷 图片路径：`<image src="./images/logo.png" />`
 * - 📄 页面跳转：`<navigator url="/pages/detail/index" />`
 * - 🎨 样式文件：`@import "./common/style.wxss"`
 * - 🌐 外部链接：`<web-view src="https://example.com" />`
 * 
 * 🔧 **技术特性**：
 * - 🚀 **高性能**: 使用正则表达式进行快速文本匹配
 * - 🎯 **精确定位**: 准确计算链接在文档中的位置
 * - 📂 **文件存在性检查**: 只为存在的文件创建链接
 * - ⚙️ **灵活配置**: 支持用户自定义链接属性名称
 */

// 导入 VSCode API 相关类型
import { 
  DocumentLinkProvider,  // 文档链接提供者接口
  DocumentLink,          // 文档链接对象，表示一个可点击的链接
  CancellationToken,     // 取消令牌，用于中断长时间运行的操作
  TextDocument,          // 文档对象
  Uri,                   // 统一资源标识符，用于表示文件路径或URL
  Range                  // 文档范围，表示链接在文档中的位置
} from 'vscode'

// 导入内部模块
import { Config } from './lib/config'  // 扩展配置类型

// 导入 Node.js 内置模块
import * as fs from 'fs'    // 文件系统操作模块
import * as path from 'path' // 路径处理工具模块

/**
 * 文档链接提供者实现类
 * 
 * 实现 VSCode 的 DocumentLinkProvider 接口，为编辑器提供文档链接功能。
 * 当用户将鼠标悬停在链接上时，会显示链接提示；点击时会跳转到对应文件。
 */
export default class implements DocumentLinkProvider {
  /**
   * 构造函数
   * @param config 扩展配置对象，包含链接属性名称等设置
   */
  constructor(public config: Config) {}

  /**
   * 提供文档链接的核心方法
   * 
   * 当 VSCode 需要获取文档中的所有链接时会调用此方法。
   * 这是 DocumentLinkProvider 接口的必需实现方法。
   * 
   * @param doc 当前文档对象
   * @param token 取消令牌，用于中断操作
   * @returns Promise<DocumentLink[]> 文档链接数组
   */
  async provideDocumentLinks(doc: TextDocument, token: CancellationToken): Promise<DocumentLink[]> {
    return this.getLinks(doc)
  }

  /**
   * 获取文档中所有链接的私有方法
   * 
   * 这是链接识别和解析的核心实现，包含以下步骤：
   * 1. 🔍 检查配置的链接属性名称
   * 2. 📂 准备路径解析的根目录列表
   * 3. 🔍 使用正则表达式匹配所有可能的链接
   * 4. 🎯 对每个匹配项进行路径解析和验证
   * 5. 📋 创建有效的 DocumentLink 对象
   * 
   * @param doc 当前文档对象
   * @returns DocumentLink[] 文档链接数组
   */
  private getLinks(doc: TextDocument) {
    const links: DocumentLink[] = []
    
    // 🎛️ 获取配置的链接属性名称列表
    // 例如：['src', 'href', 'url'] 等用户自定义的属性
    const { linkAttributeNames } = this.config
    
    // 🚫 如果没有配置链接属性，直接返回空数组
    if (!linkAttributeNames.length) return links

    // 📂 准备路径解析的根目录列表
    const roots = this.config.getResolveRoots(doc)  // 从配置获取解析根目录
    const rootsWithDir = [path.dirname(doc.fileName), ...roots]  // 包含当前文件目录和配置的根目录

    // 🔍 构建正则表达式来匹配链接属性
    // 匹配模式：属性名="路径值" 或 属性名='路径值'
    // 例如：src="./images/logo.png" 或 href='/pages/index'
    const regexp = new RegExp(`\\b(${linkAttributeNames.join('|')})=['"]([^'"]+)['"]`, 'g')
    
    // 🌐 远程链接检测正则表达式
    // 匹配以协议开头的URL，如 http://、https://、ftp:// 等
    const remote = /^\w+:\/\//

    // 🔍 在文档文本中搜索所有匹配的链接
    doc.getText().replace(regexp, (raw: string, tag: string, key: string, index: number) => {
      // 🌐 检查是否为远程链接
      const isRemote = remote.test(key)
      let file: string | undefined

      if (isRemote) {
        // 🌐 远程链接：直接使用原始URL
        file = key
      } else if (key.startsWith('/')) {
        // 📁 绝对路径解析：从配置的根目录开始查找
        // 在所有根目录中寻找第一个存在的文件
        file = roots.map(root => path.join(root, key)).find(f => fs.existsSync(f))
      } else {
        // 📂 相对路径解析：从当前文件目录和根目录开始查找
        // 优先从当前文件目录开始，然后尝试配置的根目录
        file = rootsWithDir.map(dir => path.resolve(dir, key)).find(file => fs.existsSync(file))
      }

      // ✅ 如果找到了有效的文件路径，创建文档链接
      if (file) {
        // 🎯 计算链接在文档中的精确位置
        // offset: 属性值开始位置（跳过属性名和等号、引号）
        const offset = index + tag.length + 2  // tag.length + '="'.length
        const startPoint = doc.positionAt(offset)              // 链接开始位置
        const endPoint = doc.positionAt(offset + key.length)   // 链接结束位置
        
        // 🔗 创建 DocumentLink 对象
        // Range: 链接在文档中的范围
        // Uri: 目标文件的统一资源标识符
        links.push(new DocumentLink(
          new Range(startPoint, endPoint),                    // 链接范围
          isRemote ? Uri.parse(file) : Uri.file(file)         // 目标URI（远程或本地文件）
        ))
      }
      
      // 📝 返回原始字符串（replace 方法要求的返回值）
      return raw
    })

    return links
  }
}
