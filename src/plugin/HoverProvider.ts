/******************************************************************
MIT License http://www.opensource.org/licenses/mit-license.php
Author Mora <qiuzhongleiabc@126.com> (https://github.com/qiu8310)
*******************************************************************/

/**
 * 悬停提示服务提供者
 * 
 * 这个类实现了 VSCode 的 HoverProvider 接口，为 WXML、Pug、Vue 文件提供悬停提示功能。
 * 当用户将鼠标悬停在代码上时，会显示相关的帮助信息，包括：
 * 
 * 🏷️  **标签悬停**: 悬停在标签名上时显示组件的详细文档
 * 🔧  **属性悬停**: 悬停在属性名上时显示属性的使用说明
 * 📝  **支持格式**: 返回 Markdown 格式的富文本提示
 * 🎯  **智能识别**: 自动识别悬停位置是标签名还是属性名
 */

// 导入 VSCode API 相关类型
import { HoverProvider, TextDocument, Position, CancellationToken, Hover, MarkdownString } from 'vscode'

// 导入悬停内容生成函数
import { hoverComponentAttrMarkdown, hoverComponentMarkdown } from '../common/src'  // 组件和属性的 Markdown 文档生成器

// 导入工具函数
import { getTagAtPosition } from './getTagAtPosition/'  // 获取指定位置的标签信息
import { Config } from './lib/config'  // 扩展配置类型定义
import { getLanguage, getCustomOptions } from './lib/helper'  // 语言识别和自定义选项获取

/**
 * 悬停提示服务实现类
 * 
 * 实现 VSCode 的 HoverProvider 接口，为模板文件提供智能悬停提示
 */
export default class implements HoverProvider {
  /**
   * 构造函数
   * @param config 扩展配置对象，包含用户自定义的各种设置
   */
  constructor(public config: Config) {}

  /**
   * 提供悬停提示的核心方法
   * 
   * 当用户在编辑器中悬停鼠标时，VSCode 会调用此方法获取提示内容。
   * 
   * 工作流程：
   * 1. 🚫 检查操作是否被取消
   * 2. 🔍 识别当前文档的语言类型（wxml/pug/vue）
   * 3. 🏷️  获取悬停位置的标签信息
   * 4. ⚙️  获取自定义配置选项
   * 5. 📝 根据悬停位置生成相应的 Markdown 文档
   * 6. 🎯 返回 Hover 对象或 null
   * 
   * @param document 当前编辑的文档对象
   * @param position 鼠标悬停的位置（行号和列号）
   * @param token 取消令牌，用于中断长时间运行的操作
   * @returns Promise<Hover | null> 悬停提示对象或 null（无提示）
   */
  async provideHover(document: TextDocument, position: Position, token: CancellationToken): Promise<Hover | null> {
    // 🚫 检查操作是否被用户或系统取消
    // 这是性能优化的重要步骤，避免执行不必要的计算
    if (token.isCancellationRequested) {
      return null;
    }

    // 🔍 识别当前文档的语言类型
    // 支持的语言：wxml、wxml-pug、vue
    // 如果不是支持的语言类型，直接返回 null
    const language = getLanguage(document, position)
    if (!language) return null

    // 🏷️ 获取悬停位置的标签信息
    // 解析当前位置的 HTML/XML 标签结构，包括：
    // - 标签名称
    // - 是否悬停在标签名上
    // - 悬停位置的单词（可能是属性名）
    // - 标签的其他相关信息
    const tag = getTagAtPosition(document, position)
    if (!tag) return null

    // ⚙️ 获取当前文档的自定义配置选项
    // 这些选项可能影响悬停提示的内容和格式
    const co = getCustomOptions(this.config, document)

    // 📝 根据悬停位置生成相应的 Markdown 文档
    let markdown: string | undefined

    if (tag.isOnTagName) {
      // 🏷️ 悬停在标签名上：显示组件的详细文档
      // 例如：<view> 标签的功能说明、支持的属性列表、使用示例等
      markdown = await hoverComponentMarkdown(tag.name, language, co)
    } else if (!tag.isOnTagName && tag.posWord && !/^(wx|bind|catch):/.test(tag.posWord)) {
      // 🔧 悬停在属性名上：显示属性的使用说明
      // 条件说明：
      // - !tag.isOnTagName: 不在标签名上
      // - tag.posWord: 存在悬停位置的单词
      // - !/^(wx|bind|catch):/.test(tag.posWord): 排除微信小程序的特殊属性前缀
      //   这些特殊属性（如 wx:if、bind:tap、catch:touchstart）不需要显示悬停提示
      markdown = await hoverComponentAttrMarkdown(tag.name, tag.posWord, language, co)
    }

    // 🎯 返回悬停提示对象
    // 如果有 markdown 内容，创建 Hover 对象；否则返回 null
    // MarkdownString 支持富文本格式，可以显示代码、链接、加粗等样式
    return markdown ? new Hover(new MarkdownString(markdown)) : null
  }
}
