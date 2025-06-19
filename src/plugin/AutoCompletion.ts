/******************************************************************
MIT License http://www.opensource.org/licenses/mit-license.php
Author Mora <qiuzhongleiabc@126.com> (https://github.com/qiu8310)
*******************************************************************/

/**
 * 自动补全基类
 * 
 * 这是一个抽象基类，为 WXML、Pug、Vue 等模板语言提供统一的自动补全功能。
 * 包含了完整的补全项创建、渲染和管理逻辑，是整个自动补全系统的核心。
 * 
 * 🎯 **核心功能**：
 * - 🏷️  **组件补全**: 创建标签名称、组件的自动补全项
 * - 🔧 **属性补全**: 提供组件属性和属性值的智能补全
 * - ⚡ **事件补全**: 支持事件绑定和特殊属性的补全
 * - 🎨 **样式补全**: CSS类名的自动补全和智能提示
 * - 📝 **代码片段**: 支持用户自定义的代码片段补全
 * - 🔒 **闭合标签**: 智能的标签闭合补全
 * - 🔍 **方法补全**: JavaScript/TypeScript 方法的自动补全
 * 
 * 🏗️ **设计模式**：
 * - 📐 **抽象基类**: 定义通用的补全逻辑和接口
 * - 🎭 **模板方法**: 提供可重写的钩子方法
 * - 🔧 **策略模式**: 根据不同语言采用不同的补全策略
 * - 🎯 **工厂模式**: 统一创建各种类型的补全项
 */

// 导入 VSCode API 相关类型
import {
  CompletionItem,          // 自动补全项对象
  CompletionItemKind,      // 补全项类型枚举（模块、字段、方法等）
  SnippetString,           // 代码片段字符串，支持占位符和跳转
  MarkdownString,          // Markdown 格式的文档字符串
  TextDocument,            // 文档对象
  Position,                // 文档位置（行号和列号）
  Range,                   // 文档范围（起始位置到结束位置）
} from 'vscode'

// 导入自动补全数据和逻辑
import {
  TagItem,                      // 标签项类型定义
  TagAttrItem,                  // 标签属性项类型定义
  autocompleteSpecialTagAttr,   // 特殊标签属性补全逻辑
  autocompleteTagAttr,          // 标签属性补全逻辑
  autocompleteTagAttrValue,     // 标签属性值补全逻辑
  autocompleteTagName,          // 标签名称补全逻辑
} from '../common/src'

// 导入 Node.js 内置模块
import * as path from 'path'  // 路径处理工具

// 导入内部模块
import { Config } from './lib/config'                                                        // 扩展配置
import { getCustomOptions, getTextAtPosition, getRoot, getEOL, getLastChar } from './lib/helper'  // 工具函数集合
import { LanguageConfig } from './lib/language'                                             // 语言配置类型
import { getTagAtPosition } from './getTagAtPosition/'                                       // 获取位置标签信息
import * as s from './res/snippets'                                                         // 代码片段定义
import { getClass } from './lib/StyleFile'                                                  // 样式类名获取
import { getCloseTag } from './lib/closeTag'                                                // 闭合标签生成
import { getProp } from './lib/ScriptFile'                                                  // 脚本属性获取

/**
 * 自动补全基类
 * 
 * 抽象基类，定义了自动补全的通用逻辑和接口。
 * 具体的实现类（如 WxmlAutoCompletion、PugAutoCompletion）需要继承此类。
 */
export default abstract class AutoCompletion {
  /**
   * 抽象属性：语言标识符
   * 子类必须实现此属性，用于区分不同的模板语言
   */
  abstract id: 'wxml' | 'wxml-pug'

  /**
   * 判断是否为 Pug 语言
   * @returns boolean 是否为 Pug 模板语言
   */
  get isPug(): boolean {
    return this.id === 'wxml-pug'
  }

  /**
   * 获取属性引号样式
   * 根据语言类型返回相应的引号样式配置
   * @returns string 引号字符（单引号或双引号）
   */
  get attrQuote(): string {
    return this.isPug ? this.config.pugQuoteStyle : this.config.wxmlQuoteStyle
  }

  /**
   * 构造函数
   * @param config 扩展配置对象，包含用户的各种自定义设置
   */
  constructor(public config: Config) { }

  /**
   * 获取自定义选项
   * 
   * 从配置中提取当前文档相关的自定义选项，包括文件名和解析根目录。
   * 这些选项影响补全的范围和行为。
   * 
   * @param doc 当前文档对象
   * @returns 自定义选项对象或 undefined
   */
  getCustomOptions(doc: TextDocument): {
    filename: string;
    resolves: string[];
  } | undefined {
    return getCustomOptions(this.config, doc)
  }

  /**
   * 渲染标签补全项
   * 
   * 将标签数据转换为 VSCode 的 CompletionItem 对象，包括：
   * - 标签名称和类型
   * - 必需属性的代码片段
   * - 自闭合标签的特殊处理
   * - Markdown 文档和排序权重
   * 
   * @param tag 标签项数据，包含组件信息和元数据
   * @param sortText 排序文本，控制补全项在列表中的顺序
   * @returns CompletionItem VSCode 补全项对象
   */
  renderTag(tag: TagItem, sortText: string): CompletionItem {
    const c = tag.component
    const item = new CompletionItem(c.name, CompletionItemKind.Module)

    const { attrQuote, isPug } = this
    const allAttrs = c.attrs || []
    
    // 🔍 筛选必需属性和具有子属性的属性
    // 这些属性会自动添加到代码片段中，提高开发效率
    const attrs = allAttrs
      .filter(a => a.required || a.subAttrs)
      .map((a, i) => (isPug ? '' : ' ') + `${a.name}=${attrQuote}${this.setDefault(i + 1, a.defaultValue)}${attrQuote}`)

    let extraSpace = ''
    // 🎯 智能触发：如果没有必需属性但有其他属性，触发属性补全
    if (!attrs.length && allAttrs.length) {
      item.command = autoSuggestCommand()
      extraSpace = ' '
    }

    const len = attrs.length + 1
    let snippet: string
    
    if (isPug) {
      // 🎭 Pug 语法：标签名(属性列表)
      snippet = `${c.name}(${attrs.join(' ')}\${${len}})\${0}`
    } else {
      // 🏷️ WXML 语法：<标签名 属性列表>内容</标签名>
      if (this.config.selfCloseTags.includes(c.name)) {
        // 🔒 自闭合标签：<input />
        snippet = `${c.name}${attrs.join('')}${extraSpace}\${${len}} />\${0}`
      } else {
        // 📖 普通标签：<view>内容</view>
        snippet = `${c.name}${attrs.join('')}${extraSpace}\${${len}}>\${${len + 1}}</${c.name}>\${0}`
      }
    }
    
    item.insertText = new SnippetString(snippet)
    item.documentation = new MarkdownString(tag.markdown)
    item.sortText = sortText
    return item
  }

  /**
   * 渲染标签属性补全项
   * 
   * 将属性数据转换为 CompletionItem，处理不同类型的属性：
   * - 布尔属性的特殊处理
   * - 枚举值的自动补全触发
   * - 默认值的智能设置
   * - class 属性的特殊处理
   * 
   * @param tagAttr 标签属性项数据
   * @param sortText 排序文本
   * @param kind 补全项类型，默认为字段类型
   * @returns CompletionItem VSCode 补全项对象
   */
  renderTagAttr(tagAttr: TagAttrItem, sortText: string, kind?: CompletionItemKind): CompletionItem {
    const a = tagAttr.attr
    const item = new CompletionItem(a.name, kind === undefined ? CompletionItemKind.Field : kind)
    
    // 🔧 智能默认值处理
    let defaultValue = a.defaultValue
    if (!this.isDefaultValueValid(defaultValue)) {
      defaultValue = a.enum && a.enum[0].value
    }

    const { attrQuote, isPug } = this

    if (a.boolean) {
      // ✅ 布尔属性处理
      // Pug 中的 false 值需要显式指定，WXML 中布尔属性通常只写属性名
      item.insertText = new SnippetString(isPug && defaultValue === 'false' ? `${a.name}=false` : a.name)
    } else {
      // 📝 普通属性处理
      let value = a.addBrace ? '{{${1}}}' : this.setDefault(1, defaultValue)

      // 🎯 智能补全触发：检查是否有可选值
      const values = a.enum ? a.enum : a.subAttrs ? a.subAttrs.map(sa => ({ value: sa.equal })) : []
      if (values.length) {
        value = '${1}'
        item.command = autoSuggestCommand()  // 触发进一步的值补全
      }

      item.insertText = new SnippetString(`${a.name}=${attrQuote}${value}${attrQuote}$0`)
    }

    item.documentation = new MarkdownString(tagAttr.markdown)
    item.sortText = sortText

    // 🎨 class 属性特殊处理：触发 CSS 类名补全
    if (a.name === 'class') item.command = autoSuggestCommand()

    return item
  }

  /**
   * 渲染代码片段补全项
   * 
   * 将用户自定义的代码片段转换为补全项，支持：
   * - 多行代码片段的处理
   * - 引号样式的统一替换
   * - Pug 语法的特殊处理
   * 
   * @param doc 当前文档，用于获取行结束符
   * @param name 片段名称
   * @param snippet 片段数据
   * @param sortText 排序文本
   * @returns CompletionItem VSCode 补全项对象
   */
  renderSnippet(doc: TextDocument, name: string, snippet: s.Snippet, sortText: string): CompletionItem {
    const item = new CompletionItem(name + ' snippet', CompletionItemKind.Snippet)

    const eol = getEOL(doc)
    let body = Array.isArray(snippet.body) ? snippet.body.join(eol) : snippet.body
    
    // 🔄 引号样式统一：将占位符 ___ 替换为配置的引号样式
    body = body.replace(/___/g, this.attrQuote)

    // 🎭 Pug 语法适配：移除 WXML 的 < 触发符
    if (!this.isPug && body.startsWith('<')) body = body.substr(1)
    
    item.insertText = new SnippetString(body)
    item.documentation = new MarkdownString(snippet.markdown || snippet.description)
    item.sortText = sortText
    return item
  }

  /**
   * 设置默认值占位符
   * 
   * 根据默认值类型生成相应的 Snippet 占位符：
   * - 普通值：${index:defaultValue}
   * - 布尔值：${index|true,false|}
   * - 无效值：${index}
   * 
   * @param index 占位符索引，用于 Tab 跳转顺序
   * @param defaultValue 默认值
   * @returns string Snippet 占位符字符串
   */
  private setDefault(index: number, defaultValue: any) {
    if (!this.isDefaultValueValid(defaultValue)) return '${' + index + '}'
    
    if (typeof defaultValue === 'boolean' || defaultValue === 'true' || defaultValue === 'false') {
      // 🔘 布尔值：提供选择列表
      return `{{\${${index}|true,false|}}}`
    } else {
      // 📝 普通值：提供默认值提示
      return `\${${index}:${String(defaultValue).replace(/['"]/g, '')}}`
    }
  }

  /**
   * 检查默认值是否有效
   * 
   * @param defaultValue 待检查的默认值
   * @returns boolean 是否为有效的默认值
   */
  private isDefaultValueValid(defaultValue: any) {
    return defaultValue !== undefined && defaultValue !== ''
  }

  /**
   * 创建组件标签名称的自动补全
   * 
   * 这是标签补全的核心方法，提供：
   * - 🏠 自定义组件的补全（优先级最高）
   * - 🔧 原生组件的补全
   * - 📝 用户自定义代码片段的补全
   * - 🔍 前缀过滤和智能匹配
   * 
   * @param lc 语言配置，包含组件信息和语法规则
   * @param doc 当前文档对象
   * @param pos 当前光标位置
   * @param prefix 可选的前缀字符串，用于过滤补全项
   * @returns Promise<CompletionItem[]> 补全项数组
   */
  async createComponentSnippetItems(lc: LanguageConfig, doc: TextDocument, pos: Position, prefix?: string): Promise<CompletionItem[]> {
    // 🔍 获取所有可用的标签信息
    const res = await autocompleteTagName(lc, this.getCustomOptions(doc))
    
    // 🎯 过滤函数：根据前缀筛选匹配的项目
    const filter = (key: string) => key && (!prefix || prefix.split('').every(c => key.includes(c)))
    const filterComponent = (t: TagItem) => filter(t.component.name)

    // 📋 创建补全项列表，自定义组件优先
    const items = [
      ...res.customs.filter(filterComponent).map(t => this.renderTag(t, 'a')), // 自定义组件：排序权重 'a'
      ...res.natives.filter(filterComponent).map(t => this.renderTag(t, 'c')), // 原生组件：排序权重 'c'
    ]

    // 📝 添加代码片段补全
    const userSnippets = this.config.snippets
    const allSnippets: s.Snippets = this.isPug
      ? { ...s.PugSnippets, ...userSnippets.pug }      // Pug 代码片段
      : { ...s.WxmlSnippets, ...userSnippets.wxml }    // WXML 代码片段
    
    items.push(
      ...Object.keys(allSnippets)
        .filter(k => filter(k))
        .map(k => {
          const snippet = allSnippets[k]
          
          // 🔍 智能文档继承：如果片段没有文档，尝试从对应组件获取
          if (!snippet.description) {
            const ck = k.split(' ')[0] // 取出名称中的第一段
            const found = res.natives.find(it => it.component.name === (ck || k))
            if (found) snippet.markdown = found.markdown
          }
          
          return this.renderSnippet(doc, k, allSnippets[k], 'b') // 代码片段：排序权重 'b'
        })
    )

    // 🎯 前缀范围处理：如果有前缀，设置替换范围
    if (prefix) {
      items.forEach(it => {
        it.range = new Range(new Position(pos.line, pos.character - prefix.length), pos)
      })
    }

    return items
  }

  /**
   * 创建组件属性的自动补全
   * 
   * 根据当前位置的上下文提供不同类型的补全：
   * - 🏷️ 标签名位置：提供组件名补全
   * - 🎨 属性值位置：提供属性值补全（样式类名、方法名等）
   * - 🔧 属性名位置：提供属性名补全
   * 
   * @param lc 语言配置
   * @param doc 当前文档
   * @param pos 光标位置
   * @returns Promise<CompletionItem[]> 补全项数组
   */
  async createComponentAttributeSnippetItems(lc: LanguageConfig, doc: TextDocument, pos: Position): Promise<CompletionItem[]> {
    // 🔍 获取当前位置的标签信息
    const tag = getTagAtPosition(doc, pos)
    if (!tag) return []
    
    if (tag.isOnTagName) {
      // 🏷️ 在标签名上：提供标签名补全
      return this.createComponentSnippetItems(lc, doc, pos, tag.name)
    }
    
    if (tag.isOnAttrValue && tag.attrName) {
      // 📝 在属性值上：根据属性类型提供相应补全
      const attrValue = tag.attrs[tag.attrName]
      
      if (tag.attrName === 'class' || /^[\w\d-]+-class/.test(tag.attrName)) {
        // 🎨 CSS 类名补全
        const existsClass = (tag.attrs[tag.attrName] || '') as string
        return this.autoCompleteClassNames(doc, existsClass ? existsClass.trim().split(/\s+/) : [])
        
      } else if (typeof attrValue === 'string') {
        if (tag.attrName.startsWith('bind') || tag.attrName.startsWith('catch')) {
          // ⚡ 事件处理函数补全
          return this.autoCompleteMethods(doc, attrValue.replace(/"|'/, ''))
          
        } else if (attrValue.trim() === '') {
          // 🔍 属性值枚举补全
          const values = await autocompleteTagAttrValue(tag.name, tag.attrName, lc, this.getCustomOptions(doc))
          if (!values.length) return []
          
          // 🎯 智能范围检测：检测引号范围，精确替换
          let range = doc.getWordRangeAtPosition(pos, /['"]\s*['"]/)
          if (range) {
            range = new Range(
              new Position(range.start.line, range.start.character + 1),
              new Position(range.end.line, range.end.character - 1)
            )
          }
          
          return values.map(v => {
            const it = new CompletionItem(v.value, CompletionItemKind.Value)
            it.documentation = new MarkdownString(v.markdown)
            it.range = range
            return it
          })
        }
      }
      return []
    } else {
      // 🔧 在属性名位置：提供属性名补全
      const res = await autocompleteTagAttr(tag.name, tag.attrs, lc, this.getCustomOptions(doc))
      let triggers: CompletionItem[] = []

      const { natives, basics } = res
      const noBasics = lc.noBasicAttrsComponents || []

      // 🎛️ 添加触发器补全项（特殊前缀）
      if (!noBasics.includes(tag.name)) {
        triggers = [...Object.keys(lc.custom), ...lc.event.prefixes]
          .filter(k => k.length > 1)
          .map(k => {
            const item = new CompletionItem(k, CompletionItemKind.Constant)
            item.sortText = 'z'  // 最低优先级
            item.command = autoSuggestCommand()  // 触发进一步补全
            return item
          })
      }

      return [
        ...natives.map(a => this.renderTagAttr(a, 'a')),  // 原生属性：高优先级
        ...basics.map(a => this.renderTagAttr(a, 'b')),   // 基础属性：中优先级
        ...triggers,                                       // 触发器：低优先级
      ]
    }
  }

  /**
   * 创建特殊属性的自动补全
   * 
   * 处理带有特殊前缀的属性补全，如：
   * - WXML: wx:、bind:、catch:
   * - Vue: :、@、v-
   * - 修饰符: .stop、.prevent、.sync 等
   * 
   * 支持的前缀类型：
   * - 🎛️ 事件前缀：bind:、catch:、@
   * - 🔧 数据绑定：:、wx:
   * - 🎯 修饰符：.stop、.prevent 等
   * 
   * @param lc 语言配置
   * @param doc 当前文档
   * @param pos 光标位置
   * @returns Promise<CompletionItem[]> 补全项数组
   */
  async createSpecialAttributeSnippetItems(lc: LanguageConfig, doc: TextDocument, pos: Position): Promise<CompletionItem[]> {
    // 📝 获取当前位置的前缀文本
    const prefix = getTextAtPosition(doc, pos, /[:@\w\d\.-]/) as string
    if (!prefix) return []

    // 🔍 获取当前标签信息
    const tag = getTagAtPosition(doc, pos)
    if (!tag) return []

    // 🎯 判断是否为事件前缀
    const isEventPrefix = lc.event.prefixes.includes(prefix)

    // 🔧 处理修饰符补全
    if (!isEventPrefix && !lc.custom.hasOwnProperty(prefix)) {
      let modifiers: string[] = []
      
      if (prefix.endsWith('.')) {
        // ⚡ 事件修饰符：@click.stop、bind:tap.once 等
        if (lc.event.prefixes.some(p => prefix.startsWith(p))) {
          modifiers = lc.event.modifiers
        } else {
          // 🎛️ 自定义前缀修饰符
          const customPrefix = Object.keys(lc.custom).find(p => prefix.startsWith(p))
          if (customPrefix) modifiers = lc.custom[customPrefix].modifiers
        }
      }

      return modifiers.map(m => new CompletionItem(m, CompletionItemKind.Constant))
    }

    // 📋 获取特殊属性补全数据
    const res = await autocompleteSpecialTagAttr(prefix, tag.name, tag.attrs, lc, this.getCustomOptions(doc))
    const kind = isEventPrefix ? CompletionItemKind.Event : CompletionItemKind.Field
    
    return [
      ...res.customs.map(c => this.renderTagAttr(c, 'a', kind)),  // 自定义特殊属性
      ...res.natives.map(c => this.renderTagAttr(c, 'b', kind)),  // 原生特殊属性
    ]
  }

  /**
   * CSS 样式类名自动补全
   * 
   * 扫描项目中的样式文件，提供可用的 CSS 类名补全。
   * 支持多种样式文件格式，并避免重复的类名。
   * 
   * 功能特性：
   * - 📁 多文件扫描：支持项目中的所有样式文件
   * - 🔍 智能去重：避免显示重复的类名
   * - 📄 文件信息：显示类名来源文件
   * - 📝 文档支持：显示类名的相关文档
   * 
   * @param doc 当前文档
   * @param existsClassNames 已存在的类名列表，用于去重
   * @returns Promise<CompletionItem[]> 类名补全项数组
   */
  async autoCompleteClassNames(doc: TextDocument, existsClassNames: string[]): Promise<CompletionItem[]> {
    const items: CompletionItem[] = []
    
    // 🔍 获取所有相关的样式文件
    const stylefiles = getClass(doc, this.config)
    const root = getRoot(doc)

    // 📁 遍历所有样式文件
    stylefiles.forEach((stylefile, sfi) => {
      stylefile.styles.forEach(sty => {
        // 🎯 去重处理：避免重复的类名
        if (!existsClassNames.includes(sty.name)) {
          existsClassNames.push(sty.name)
          
          const i = new CompletionItem(sty.name)
          i.kind = CompletionItemKind.Variable
          
          // 📄 显示文件来源信息
          i.detail = root ? path.relative(root, stylefile.file) : path.basename(stylefile.file)
          i.sortText = 'style' + sfi  // 按文件顺序排序
          i.documentation = new MarkdownString(sty.doc)
          
          items.push(i)
        }
      })
    })

    return items
  }

  /**
   * 闭合标签自动补全
   * 
   * 智能检测当前位置是否需要闭合标签，并生成对应的补全项。
   * 支持自动检测标签层级和智能范围替换。
   * 
   * 工作原理：
   * 1. 🔍 检测 </ 模式
   * 2. 📊 分析标签层级
   * 3. 🎯 生成对应的闭合标签
   * 4. 🔧 处理已有的 > 字符
   * 
   * @param doc 当前文档
   * @param pos 光标位置
   * @returns Promise<CompletionItem[]> 闭合标签补全项数组
   */
  async createCloseTagCompletionItem(doc: TextDocument, pos: Position): Promise<CompletionItem[]> {
    // 📝 获取从文档开始到当前位置的所有文本
    const text = doc.getText(new Range(new Position(0, 0), pos))
    
    // 🔍 检查是否符合闭合标签的模式 </*
    if (text.length < 2 || text.substr(text.length - 2) !== '</') {
      return []
    }
    
    // 🧮 计算应该闭合的标签
    const closeTag = getCloseTag(text)
    if (closeTag) {
      const completionItem = new CompletionItem(closeTag)
      completionItem.kind = CompletionItemKind.Property
      completionItem.insertText = closeTag

      // 🎯 智能范围处理：如果下一个字符是 >，则替换整个区域
      const nextPos = new Position(pos.line, pos.character + 1)
      if (getLastChar(doc, nextPos) === '>') {
        completionItem.range = new Range(pos, nextPos)
        completionItem.label = closeTag.substr(0, closeTag.length - 1)  // 移除 > 字符
      }
      
      return [completionItem]
    }

    return []
  }

  /**
   * 方法名自动补全
   * 
   * 扫描当前文件的 JavaScript/TypeScript 代码，提取可用的方法名
   * 进行智能补全。支持生命周期函数的特殊处理和优先级排序。
   * 
   * 功能特性：
   * - 🔍 智能扫描：自动识别文件中的方法定义
   * - 📊 优先级排序：生命周期函数排在最后
   * - 📁 位置信息：显示方法定义的文件和行号
   * - 🎯 前缀过滤：支持按前缀筛选方法名
   * 
   * @param doc 当前文档
   * @param prefix 方法名前缀，空字符串表示查找所有方法
   * @returns CompletionItem[] 方法补全项数组
   */
  autoCompleteMethods(doc: TextDocument, prefix: string): CompletionItem[] {
    /**
     * 📋 生命周期和组件函数优先级列表
     * 
     * 这些函数在补全列表中显示在最后，因为它们通常是：
     * - 🔄 页面生命周期函数（onLoad、onShow 等）
     * - 🧩 组件生命周期函数（created、attached 等）
     * - ⚡ 系统回调函数（onPullDownRefresh 等）
     * 
     * 列表中的顺序决定了显示顺序
     */
    const lowPriority = [
      'onPullDownRefresh',  // 下拉刷新
      'onReachBottom',      // 上拉触底
      'onPageScroll',       // 页面滚动
      'onShow',             // 页面显示
      'onHide',             // 页面隐藏
      'onTabItemTap',       // 标签页点击
      'onLoad',             // 页面加载
      'onReady',            // 页面初次渲染完成
      'onResize',           // 页面尺寸改变
      'onUnload',           // 页面卸载
      'onShareAppMessage',  // 分享
      'error',              // 错误处理
      'creaeted',           // 组件创建
      'attached',           // 组件挂载
      'ready',              // 组件布局完成
      'moved',              // 组件移动
      'detached',           // 组件卸载
      'observer',           // 数据监听器
    ]
    
    // 🔍 从文件中提取方法信息
    const methods = getProp(doc.uri.fsPath, 'method', (prefix || '[\\w_$]') + '[\\w\\d_$]*')
    const root = getRoot(doc)
    
    return methods.map(l => {
      const c = new CompletionItem(l.name, getMethodKind(l.detail))
      
      // 📁 文件位置信息
      const filePath = root ? path.relative(root, l.loc.uri.fsPath) : path.basename(l.loc.uri.fsPath)
      
      // 📊 优先级计算：生命周期函数的优先级更低
      const priotity = lowPriority.indexOf(l.name) + 1
      
      c.detail = `${filePath}\n[${l.loc.range.start.line}行,${l.loc.range.start.character}列]`
      c.documentation = new MarkdownString('```ts\n' + l.detail + '\n```')
      
      /**
       * 🎯 排序显示规则：
       * 1. 🔤 普通函数（如 `onTap`）- 最高优先级
       * 2. 🔒 私有函数（如 `_save`）- 中等优先级
       * 3. 🔄 生命周期函数（如 `onShow`）- 最低优先级
       */
      if (priotity > 0) {
        c.detail += '(生命周期函数)'
        c.kind = CompletionItemKind.Field
        c.sortText = '}'.repeat(priotity)  // 使用重复的 } 字符降低优先级
      } else {
        // 🔒 下划线开头的私有函数排序稍后
        c.sortText = l.name.replace('_', '{')  // { 的 ASCII 值比 _ 大，排序靠后
      }
      
      return c
    })
  }
}

/**
 * 判断方法声明的类型
 * 
 * 根据方法声明的语法形式判断是属性式声明还是方法式声明：
 * - 属性式：`foo: () => {}` 或 `foo: function() {}`
 * - 方法式：`foo() {}` 或 `function foo() {}`
 * 
 * @param text 方法声明的文本
 * @returns CompletionItemKind 方法类型（Property 或 Method）
 */
function getMethodKind(text: string) {
  return /^\s*[\w_$][\w_$\d]*\s*:/.test(text) ? CompletionItemKind.Property : CompletionItemKind.Method
}

/**
 * 创建自动建议命令
 * 
 * 返回一个 VSCode 命令对象，用于触发下一级的自动补全。
 * 这在多级补全场景中非常有用，如属性值的枚举补全。
 * 
 * @returns VSCode 命令对象
 */
function autoSuggestCommand() {
  return {
    command: 'editor.action.triggerSuggest',
    title: 'triggerSuggest',
  }
}
