/******************************************************************
 MIT License http://www.opensource.org/licenses/mit-license.php
 Author Mora <qiuzhongleiabc@126.com> (https://github.com/qiu8310)
*******************************************************************/

/**
 * WXML 文档高亮提供者
 * 
 * 这个类实现了 VSCode 的 DocumentHighlightProvider 接口，为 WXML 模板文件提供标签配对高亮功能。
 * 当用户将光标放在某个标签上时，会自动高亮显示对应的开始/结束标签，提升代码可读性。
 * 
 * 🎯 **主要功能**：
 * - 🏷️ **标签配对识别**: 自动识别 XML/WXML 标签的开始和结束配对
 * - 🎨 **智能高亮**: 光标在开始标签时高亮结束标签，反之亦然
 * - 🔍 **嵌套支持**: 正确处理复杂的标签嵌套结构
 * - 🚫 **自闭合标签处理**: 智能识别自闭合标签，避免错误匹配
 * - 📝 **注释过滤**: 忽略注释和属性内容，只关注标签结构
 * 
 * 💡 **使用场景**：
 * - 📱 WXML 模板编辑：`<view>内容</view>` 的配对高亮
 * - 🎨 组件标签导航：`<custom-component></custom-component>` 的快速定位
 * - 🔧 代码调试：快速找到不匹配的标签对
 * - 📖 代码阅读：在复杂嵌套结构中快速理解标签层次
 * 
 * 🔧 **技术特性**：
 * - 🚀 **高性能算法**: 使用栈结构进行 O(n) 时间复杂度的标签匹配
 * - 🎯 **精确定位**: 准确计算标签在文档中的位置范围
 * - 🛡️ **错误容错**: 处理格式不正确的 WXML 代码
 * - 📊 **实时响应**: 光标移动时即时更新高亮效果
 * 
 * 🌟 **算法核心**：
 * 1. 🔍 检测光标位置是否在标签上
 * 2. 🏷️ 识别当前标签是开始标签还是结束标签
 * 3. 📚 使用栈算法找到匹配的配对标签
 * 4. 🎨 返回需要高亮的范围列表
 */

// 导入 VSCode API 相关类型
import { 
  DocumentHighlightProvider,  // 文档高亮提供者接口
  TextDocument,               // 文档对象，表示编辑器中的文本文件
  Position,                   // 位置对象，表示文档中的行列坐标
  CancellationToken,          // 取消令牌，用于中断长时间运行的操作
  Range,                      // 范围对象，表示文档中的文本区域
  DocumentHighlight           // 文档高亮对象，表示需要高亮的区域
} from 'vscode'

// 导入内部模块
import { Config } from './lib/config'  // 扩展配置类型

/**
 * 标签匹配正则表达式
 * 
 * 用于匹配 XML/WXML 中的开始标签和结束标签：
 * - `<([\w:-]+)`: 匹配开始标签，如 `<view`, `<custom-component`
 * - `<\/([\w:-]+)>`: 匹配结束标签，如 `</view>`, `</custom-component>`
 * 
 * 🔍 **匹配示例**：
 * - `<view>` → 捕获组1: "view", 捕获组2: undefined
 * - `</view>` → 捕获组1: undefined, 捕获组2: "view"
 * - `<my-component>` → 捕获组1: "my-component", 捕获组2: undefined
 */
const TagRegexp = /<([\w:-]+)|<\/([\w:-]+)>/g

/**
 * WXML 文档高亮提供者实现类
 * 
 * 实现 VSCode 的 DocumentHighlightProvider 接口，为编辑器提供标签配对高亮功能。
 * 当用户将光标放在标签上时，自动高亮显示对应的配对标签。
 */
export default class WxmlDocumentHighlight implements DocumentHighlightProvider {
  /**
   * 构造函数
   * @param config 扩展配置对象，包含高亮相关的设置
   */
  constructor(public config: Config) {}

  /**
   * 提供文档高亮的核心方法
   * 
   * 当用户将光标放在某个位置时，VSCode 会调用此方法来获取需要高亮的区域。
   * 这是 DocumentHighlightProvider 接口的必需实现方法。
   * 
   * 🔄 **工作流程**：
   * 1. 🎯 检查光标位置是否在有效的标签名上
   * 2. 🏷️ 判断当前标签的类型（开始标签或结束标签）
   * 3. 🔍 根据标签类型查找对应的配对标签
   * 4. 📋 返回所有需要高亮的范围列表
   * 
   * @param doc 当前文档对象
   * @param pos 光标位置
   * @param _token 取消令牌（当前未使用）
   * @returns DocumentHighlight[] 需要高亮的区域数组
   */
  provideDocumentHighlights(doc: TextDocument, pos: Position, _token: CancellationToken): DocumentHighlight[] {
    // 🎯 获取光标位置的单词范围（标签名）
    // 使用正则 /[\w:-]+/ 匹配标签名，支持连字符和冒号（如 custom-component, wx:if）
    const range = doc.getWordRangeAtPosition(pos, /[\w:-]+/)
    
    // 🚫 如果光标不在有效的标签名上，直接返回空数组
    if (!range) return []

    // 📄 获取文档内容和当前标签名
    const content = doc.getText()
    const name = doc.getText(range)
    
    // 📋 初始化结果数组，默认包含当前标签的范围
    const res: Range[] = [range]

    // 🏷️ 判断当前是否为开始标签（前面有 '<' 字符）
    if (prev(doc, range.start) === '<') {
      // 🚀 处理开始标签的情况
      // 需要找到对应的结束标签进行配对高亮
      
      // 📍 获取标签名结束位置的偏移量
      const nextStartIndex = doc.offsetAt(range.end)
      
      // 📝 获取标签名之后的文本内容，并进行标准化处理
      // 标准化可以去除注释、属性等干扰内容，只保留标签结构
      const nextText = this.normalize(content.slice(nextStartIndex))

      // 🔍 检查是否为自闭合标签（如 <image ... />）
      // 自闭合标签不需要寻找结束标签
      if (!/^[^<>]*\/>/.test(nextText)) {
        // ✅ 不是自闭合标签，需要寻找匹配的结束标签
        const nextEndIndex = this.findMatchedEndTag(name, nextText)
        
        if (typeof nextEndIndex === 'number') {
          // 🎯 找到了匹配的结束标签，计算其精确位置
          // +2 是为了跳过 '</' 两个字符
          res.push(
            new Range(
              doc.positionAt(nextStartIndex + nextEndIndex + 2),           // 结束标签名开始位置
              doc.positionAt(nextStartIndex + nextEndIndex + 2 + name.length)  // 结束标签名结束位置
            )
          )
        }
      }
    } else if (prev(doc, range.start, 2) === '</' && next(doc, range.end, 1) === '>') {
      // 🏁 处理结束标签的情况
      // 需要找到对应的开始标签进行配对高亮
      
      // 📍 获取结束标签开始位置的偏移量（-2 是为了跳过 '</' 字符）
      const prevEndIndex = doc.offsetAt(range.start) - 2
      
      // 📝 获取结束标签之前的文本内容，并进行标准化处理
      const prevText = this.normalize(content.slice(0, prevEndIndex))
      
      // 🔍 寻找匹配的开始标签
      const prevStartIndex = this.findMatchedStartTag(name, prevText)
      
      if (typeof prevStartIndex === 'number') {
        // 🎯 找到了匹配的开始标签，计算其精确位置
        // +1 是为了跳过 '<' 字符
        res.push(new Range(
          doc.positionAt(prevStartIndex + 1),                    // 开始标签名开始位置
          doc.positionAt(prevStartIndex + 1 + name.length)       // 开始标签名结束位置
        ))
      }
    }

    // 🎨 将所有范围转换为 DocumentHighlight 对象并返回
    return res.map(r => new DocumentHighlight(r))
  }

  /**
   * 标准化文档内容的私有方法
   * 
   * 为了准确进行标签匹配，需要过滤掉可能干扰匹配的内容：
   * - 📝 HTML/XML 注释：`<!-- 注释内容 -->`
   * - 🏷️ 标签属性值：`src="./image.png"` 中的引号内容
   * - 🚫 自闭合标签：`<image src="..." />` 整个标签
   * 
   * 🔧 **处理策略**：
   * 使用空格替换这些内容，保持文档长度不变，确保位置偏移量的准确性。
   * 
   * @param content 原始文档内容
   * @returns 标准化后的内容，只保留标签结构
   */
  private normalize(content: string) {
    // 🔄 替换函数：将匹配的内容替换为相同长度的空格
    // 这样可以保持文档的字符位置不变，确保偏移量计算的准确性
    const replacer = (raw: string) => new Array(raw.length).fill(' ').join('')

    return (
      content
        .replace(/<!--.*?-->/g, replacer)           // 🗑️ 去除 HTML/XML 注释
        .replace(/("[^"]*"|'[^']*')/g, replacer)    // 🗑️ 去除属性值（双引号或单引号）
        // .replace(/>[\s\S]*?</g, (raw) => '>' + replacer(raw.substr(2)) + '<') // 🗑️ 去除标签内容（已注释）
        .replace(/<[\w:-]+\s+[^<>]*\/>/g, replacer) // 🗑️ 去除自闭合标签
    )
  }

  /**
   * 向前查找匹配的结束标签
   * 
   * 从开始标签位置向后搜索，使用栈算法找到对应的结束标签。
   * 这个方法处理标签的嵌套结构，确保找到正确的配对标签。
   * 
   * 🧮 **算法原理**（栈匹配）：
   * 1. 🏷️ 遇到开始标签：入栈
   * 2. 🏁 遇到结束标签：出栈
   * 3. 📊 当栈为空时遇到目标结束标签，说明找到了匹配
   * 
   * 📚 **示例**：
   * ```xml
   * <view>
   *   <text>内容</text>  ← 这对标签会被正确跳过
   * </view>              ← 找到匹配的结束标签
   * ```
   * 
   * @param name 要匹配的标签名
   * @param nextContent 开始标签之后的文档内容
   * @returns number | undefined 匹配的结束标签位置，如果没找到则返回 undefined
   */
  private findMatchedEndTag(name: string, nextContent: string) {
    // 🔄 重置正则表达式的 lastIndex，确保从头开始匹配
    TagRegexp.lastIndex = 0
    
    let mat: RegExpExecArray | null
    const stack: string[] = []  // 📚 用于存储嵌套标签的栈
    
    // 🔍 循环匹配所有标签
    while ((mat = TagRegexp.exec(nextContent))) {
      const [, startName, endName] = mat  // 解构匹配结果：[完整匹配, 开始标签名, 结束标签名]
      
      if (startName) {
        // 🏷️ 遇到开始标签：入栈
        stack.push(startName)
      } else if (endName) {
        // 🏁 遇到结束标签：出栈处理
        const last = stack.pop()
        
        if (!last) {
          // 📊 栈已空，说明这是最外层的结束标签
          if (endName === name) {
            // ✅ 找到了匹配的结束标签，返回其位置
            return mat.index
          }
        } else if (last !== endName) {
          // ❌ 标签不匹配，WXML 格式错误，停止搜索
          // 例如：<view><text></view> 这种情况
          break
        }
        // ✅ 标签正确匹配，继续搜索
      }
    }
    
    // 🚫 没有找到匹配的结束标签
    return
  }

  /**
   * 向后查找匹配的开始标签
   * 
   * 从结束标签位置向前搜索，使用栈算法找到对应的开始标签。
   * 由于是反向搜索，算法逻辑与 findMatchedEndTag 相反。
   * 
   * 🧮 **算法原理**（反向栈匹配）：
   * 1. 🏷️ 遇到开始标签：入栈并记录位置
   * 2. 🏁 遇到结束标签：出栈
   * 3. 📊 搜索完成后，栈中剩余的最后一个开始标签就是匹配的标签
   * 
   * 📚 **示例**：
   * ```xml
   * <view>                ← 找到匹配的开始标签
   *   <text>内容</text>   ← 这对标签会被正确处理
   * </view>
   * ```
   * 
   * @param name 要匹配的标签名
   * @param prevContent 结束标签之前的文档内容
   * @returns number | undefined 匹配的开始标签位置，如果没找到则返回 undefined
   */
  private findMatchedStartTag(name: string, prevContent: string) {
    // 🔄 重置正则表达式的 lastIndex，确保从头开始匹配
    TagRegexp.lastIndex = 0
    
    let mat: RegExpExecArray | null
    const stack: [string, number][] = []  // 📚 栈存储标签名和位置的元组
    
    // 🔍 循环匹配所有标签
    while ((mat = TagRegexp.exec(prevContent))) {
      const [, startName, endName] = mat  // 解构匹配结果
      
      if (startName) {
        // 🏷️ 遇到开始标签：入栈并记录位置
        stack.push([startName, mat.index])
      } else if (endName) {
        // 🏁 遇到结束标签：出栈处理
        const last = stack.pop()
        
        if (!last) {
          // 📊 栈已空但遇到结束标签，说明结构不匹配，停止搜索
          break
        } else if (last[0] !== endName) {
          // ❌ 标签不匹配，WXML 格式错误，停止搜索
          break
        }
        // ✅ 标签正确匹配，继续搜索
      }
    }
    
    // 📊 返回栈中最后一个开始标签的位置
    // 这就是与当前结束标签匹配的开始标签
    const l = stack[stack.length - 1]
    return l ? l[1] : undefined
  }
}

/**
 * 获取指定位置之后的文本内容
 * 
 * 这是一个辅助函数，用于获取光标位置之后指定长度的文本内容。
 * 主要用于检查标签的后续字符，如检查是否为 '>' 字符。
 * 
 * @param doc 文档对象
 * @param pos 起始位置
 * @param length 要获取的字符长度，默认为1
 * @returns 指定位置之后的文本内容
 */
function next(doc: TextDocument, pos: Position, length = 1) {
  const start = new Position(pos.line, pos.character)
  const end = new Position(pos.line, pos.character + length)
  return doc.getText(new Range(start, end))
}

/**
 * 获取指定位置之前的文本内容
 * 
 * 这是一个辅助函数，用于获取光标位置之前指定长度的文本内容。
 * 主要用于检查标签的前导字符，如检查是否为 '<' 或 '</' 字符。
 * 
 * @param doc 文档对象
 * @param pos 起始位置
 * @param length 要获取的字符长度，默认为1
 * @returns 指定位置之前的文本内容
 */
function prev(doc: TextDocument, pos: Position, length = 1) {
  const start = new Position(pos.line, pos.character - length)
  const end = new Position(pos.line, pos.character)
  return doc.getText(new Range(start, end))
}
