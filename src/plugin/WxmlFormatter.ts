/**
 * WXML 格式化服务提供者
 * 
 * 这个类实现了 VSCode 的文档格式化接口，为 WXML 文件提供代码格式化功能。
 * 支持多种格式化引擎，用户可以根据需要选择：
 * 
 * 🎨 **Prettier**: 流行的代码格式化工具，支持多种语言
 * 🔧 **js-beautify**: 专门的HTML/CSS/JS美化工具
 * 💎 **prettyHtml**: 专为HTML设计的格式化器
 * 🏠 **内置格式化器**: 扩展自带的WXML专用格式化器
 * 
 * 支持的格式化操作：
 * 📄 **整个文档格式化**: 格式化整个文件
 * 📝 **选定范围格式化**: 只格式化选中的代码块
 * ⚙️ **配置化**: 支持用户自定义格式化选项
 */

// 导入 VSCode API 相关类型
import {
  FormattingOptions,                    // 格式化选项（缩进、空格等）
  DocumentFormattingEditProvider,       // 整个文档格式化接口
  DocumentRangeFormattingEditProvider,  // 选定范围格式化接口
  workspace,                           // 工作区配置访问
  TextDocument,                        // 文档对象
  TextEdit,                           // 文本编辑操作
  Range,                              // 文档范围
  window,                             // VSCode 窗口对象，用于显示消息
} from 'vscode'

// 导入第三方格式化库
import * as Prettier from 'prettier'  // Prettier 格式化库

// 导入内部模块
import { parse } from '../wxml-parser'        // WXML 解析器
import { Config } from './lib/config'         // 扩展配置类型
import { getEOL } from './lib/helper'         // 获取行结束符工具函数
import { requireLocalPkg } from './lib/requirePackage'  // 本地包加载工具
import type { HTMLBeautifyOptions } from 'js-beautify'   // js-beautify 的类型定义

/**
 * VSCode 内置的 html.format 配置转换为 js-beautify.html 的配置
 * 
 * 这个函数用于兼容性处理，将 VSCode 的 HTML 格式化配置转换为
 * js-beautify 库能够理解的配置格式。
 * 
 * 转换规则：camelCase -> snake_case
 * 
 * 参考文档：
 * - VSCode HTML 格式化: https://code.visualstudio.com/docs/languages/html#_formatting
 * - js-beautify 配置: https://github.com/beautify-web/js-beautify#css--html
 * 
 * @param buildIntHtmlFormatConfig VSCode 内置的 HTML 格式化配置
 * @returns js-beautify 格式的配置对象
 */
function htmlFormatToJsBeautify(buildIntHtmlFormatConfig: Record<string, any>) {

  /**
   * 将驼峰命名转换为下划线命名
   * 例如：maxLineLength -> max_line_length
   * 
   * @param str 驼峰命名的字符串
   * @returns 下划线命名的字符串
   */
  function camelCaseTosnake_case(str: string) {
    return str.replace(/[A-Z]/g, (match, offset) => (offset ? '_' : '') + match.toLowerCase())
  }

  // 遍历配置对象，转换键名格式
  const btConf = Object.keys(buildIntHtmlFormatConfig).reduce((btConf, key) => {
    // 跳过函数类型的配置项
    if (typeof buildIntHtmlFormatConfig[key] == 'function') return btConf
    
    // 转换键名并复制值
    const bk = camelCaseTosnake_case(key);
    (btConf as any)[bk] = (buildIntHtmlFormatConfig as any)[key]
    return btConf
  }, {} as HTMLBeautifyOptions)

  return btConf
}

// Prettier 类型别名，用于类型安全
type PrettierType = typeof Prettier

/**
 * WXML 格式化器实现类
 * 
 * 实现 VSCode 的两个格式化接口：
 * - DocumentFormattingEditProvider: 整个文档格式化
 * - DocumentRangeFormattingEditProvider: 选定范围格式化
 */
export default class implements DocumentFormattingEditProvider, DocumentRangeFormattingEditProvider {
  /**
   * 构造函数
   * @param config 扩展配置对象，包含格式化相关的用户设置
   */
  constructor(public config: Config) { }

  /**
   * 格式化核心方法
   * 
   * 根据用户配置选择相应的格式化引擎进行代码格式化。
   * 
   * 支持的格式化引擎：
   * 1. 🎨 **Prettier**: 通用代码格式化工具，配置灵活
   * 2. 🔧 **js-beautify**: HTML 专用美化工具，支持详细配置
   * 3. 💎 **prettyHtml**: 专为 HTML 设计，支持 Prettier 集成
   * 4. 🏠 **内置格式化器**: 基于 WXML 解析器的专用格式化器
   * 
   * @param doc 要格式化的文档
   * @param range 格式化的范围
   * @param options VSCode 提供的格式化选项（缩进等）
   * @param prefix 行前缀（用于保持缩进）
   * @returns Promise<TextEdit[]> 格式化后的文本编辑操作数组
   */
  async format(doc: TextDocument, range: Range, options: FormattingOptions, prefix = ''): Promise<TextEdit[]> {
    // 获取要格式化的代码文本
    const code = doc.getText(range)
    let content: string = code
    
    /**
     * Prettier 配置解析函数
     * 
     * 优先使用项目本地的 Prettier 配置，支持 .prettierrc 等配置文件
     * 同时启用 EditorConfig 支持，确保格式化结果符合项目规范
     */
    const resolveOptions = (prettier?: PrettierType) =>
      (prettier || requireLocalPkg<PrettierType>(doc.uri.fsPath, 'prettier')).resolveConfig(doc.uri.fsPath, {
        editorconfig: true,  // 启用 EditorConfig 支持
      })

    try {
      if (this.config.wxmlFormatter === 'prettier') {
        // 🎨 使用 Prettier 格式化
        // 动态加载项目本地的 Prettier 版本，确保格式化结果一致
        const prettier: PrettierType = requireLocalPkg(doc.uri.fsPath, 'prettier')
        
        // 合并用户配置和项目配置
        const prettierOptions = await resolveOptions(prettier)
        content = await prettier.format(code, { ...this.config.prettier, ...prettierOptions })
        
      } else if (this.config.wxmlFormatter === 'jsBeautifyHtml') {
        // 🔧 使用 js-beautify 格式化
        const jsb_html = require('js-beautify').html
        let conf = this.config.jsBeautifyHtml;
        
        // 如果配置为使用 VSCode 内置 HTML 格式化配置
        if (this.config.jsBeautifyHtml === 'useCodeBuiltInHTML') {
          // 获取 VSCode 的 HTML 格式化配置
          const buildIntHtmlFormatConfig = workspace.getConfiguration('html.format')
          // 转换为 js-beautify 格式
          conf = htmlFormatToJsBeautify(buildIntHtmlFormatConfig)
        }
        
        content = jsb_html(code, conf)
        
      } else if (this.config.wxmlFormatter === 'prettyHtml') {
        // 💎 使用 prettyHtml 格式化
        let prettyHtmlOptions = this.config.prettyHtml
        
        // 如果启用了 Prettier 集成
        if (prettyHtmlOptions.usePrettier) {
          const prettierOptions = await resolveOptions()
          // 将 Prettier 配置合并到 prettyHtml 配置中
          prettyHtmlOptions = { ...prettyHtmlOptions, ...prettierOptions, prettier: prettierOptions }
        }

        /**
         * 特殊处理说明：
         * 
         * prettyHtml 的 npm 版本会将 `<input />` 转化成 `<input>`（去掉自闭合标签的斜杠），
         * 但 https://github.com/prettyhtml/pretty-html-web 中的版本不会有这个问题。
         * 
         * 为了避免这个问题，我们使用了该仓库中的版本，并将生成的 js 文件
         * 放在了 ../../res/prettyhtml.js 中直接引用。
         */
        content = require('../../res/prettyhtml.js')(code, prettyHtmlOptions).contents
        
      } else {
        // 🏠 使用内置的 WXML 格式化器
        // 基于自定义的 WXML 解析器，专门为微信小程序模板设计
        content = parse(code).toXML({
          prefix,                                           // 行前缀，用于保持缩进
          eol: getEOL(doc),                                // 行结束符（\n 或 \r\n）
          preferSpaces: options.insertSpaces,              // 是否使用空格而不是制表符
          tabSize: options.tabSize,                        // 制表符大小
          maxLineCharacters: this.config.formatMaxLineCharacters,  // 单行最大字符数
          removeComment: false,                            // 保留注释
          reserveTags: this.config.reserveTags,            // 不格式化的保留标签
        })
      }
    } catch (e) {
      // 格式化出错时显示错误信息
      // 包含具体的格式化引擎名称，便于用户定位问题
      window.showErrorMessage(`${this.config.wxmlFormatter} format error: ` + (e as any)?.message)
    }

    // 返回文本编辑操作，用格式化后的内容替换原有范围
    return [new TextEdit(range, content)]
  }

  /**
   * 提供整个文档格式化功能
   * 
   * 实现 DocumentFormattingEditProvider 接口的核心方法。
   * 当用户使用 "格式化文档" 命令时会调用此方法。
   * 
   * @param doc 要格式化的文档
   * @param options VSCode 提供的格式化选项
   * @returns Promise<TextEdit[]> 格式化操作数组
   */
  provideDocumentFormattingEdits(doc: TextDocument, options: FormattingOptions): Promise<TextEdit[]> {
    // 检查是否禁用了格式化功能
    if (this.config.disableFormat) {
      return Promise.resolve([]);
    }
    
    // 创建覆盖整个文档的范围
    // 从第一行的开始位置到最后一行的结束位置
    const range = new Range(doc.lineAt(0).range.start, doc.lineAt(doc.lineCount - 1).range.end)
    
    // 调用格式化方法
    return this.format(doc, range, options)
  }

  /**
   * 提供选定范围格式化功能
   * 
   * 实现 DocumentRangeFormattingEditProvider 接口的核心方法。
   * 当用户选中代码并使用 "格式化选定内容" 命令时会调用此方法。
   * 
   * @param doc 要格式化的文档
   * @param range 要格式化的范围
   * @param options VSCode 提供的格式化选项
   * @returns Promise<TextEdit[]> 格式化操作数组
   */
  provideDocumentRangeFormattingEdits(
    doc: TextDocument,
    range: Range,
    options: FormattingOptions
  ): Promise<TextEdit[]> {
    // 检查是否禁用了格式化功能
    if (this.config.disableFormat) {
      return Promise.resolve([]);
    }
    
    // 🔍 智能缩进保持功能
    // 获取选定范围起始位置的前导空白（空格或制表符）
    // 这样可以在格式化时保持原有的缩进级别
    const prefixRange = doc.getWordRangeAtPosition(range.start, /[ \t]+/)
    const prefix = prefixRange ? doc.getText(prefixRange) : ''
    
    // 调用格式化方法，传入前缀以保持缩进
    return this.format(doc, range, options, prefix)
  }
}
