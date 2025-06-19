/******************************************************************
MIT License http://www.opensource.org/licenses/mit-license.php
Author Mora <qiuzhongleiabc@126.com> (https://github.com/qiu8310)
*******************************************************************/

/**
 * VSCode扩展入口文件
 * 
 * 这个文件是整个微信小程序VSCode扩展的核心入口文件，负责：
 * 1. 🚀 启动管理：初始化所有功能模块
 * 2. 🔧 服务注册：向VSCode注册各种语言服务
 * 3. ⚙️ 自动配置：配置VSCode以支持小程序开发
 * 4. 🎛️ 功能协调：协调各个插件模块的工作
 * 5. 📱 多语言支持：同时支持WXML、Pug、Vue三种模板语言
 */

// 导入VSCode API核心模块
import { ExtensionContext, commands, languages, workspace } from 'vscode'

// 导入各种语言服务提供者
import LinkProvider from './plugin/LinkProvider'                    // 文件路径跳转功能
import HoverProvider from './plugin/HoverProvider'                  // 悬停提示功能
import WxmlFormatter from './plugin/WxmlFormatter'                  // WXML代码格式化
import { PropDefinitionProvider } from './plugin/PropDefinitionProvider'  // 属性定义跳转
import WxmlAutoCompletion from './plugin/WxmlAutoCompletion'        // WXML自动补全
import PugAutoCompletion from './plugin/PugAutoCompletion'          // Pug模板自动补全
import VueAutoCompletion from './plugin/VueAutoCompletion'          // Vue模板自动补全
import WxmlDocumentHighlight from './plugin/WxmlDocumentHighlight'  // 文档内容高亮
import ActiveTextEditorListener from './plugin/ActiveTextEditorListener'  // 编辑器监听器，用于变量装饰

// 导入配置管理和命令模块
import { config, configActivate, configDeactivate } from './plugin/lib/config'  // 扩展配置管理
import { createMiniprogramComponent } from './commands/createMiniprogramComponent'  // 创建小程序组件命令
import { COMMANDS, CONTEXT_KEYS } from './commands/constants'  // 命令和上下文常量定义

/**
 * 扩展激活函数
 * 
 * 当满足以下条件之一时，VSCode会调用此函数激活扩展：
 * - 工作区包含 project.config.json 文件（小程序项目配置）
 * - 工作区包含 app.wxss 文件（小程序全局样式）
 * - 打开 .wxml、.pug 或 .vue 文件
 * 
 * @param context VSCode扩展上下文，用于管理扩展生命周期
 */
export function activate(context: ExtensionContext): void {
  // 激活配置系统，开始监听配置变化
  configActivate()

  // 如果没有禁用自动配置，则执行自动配置
  if (!config.disableAutoConfig) {
    autoConfig()
  }

  // 创建各种功能服务实例
  const formatter = new WxmlFormatter(config)                    // WXML格式化器
  const autoCompletionWxml = new WxmlAutoCompletion(config)      // WXML自动补全服务
  const hoverProvider = new HoverProvider(config)               // 悬停提示服务
  const linkProvider = new LinkProvider(config)                 // 文件链接跳转服务
  const autoCompletionPug = new PugAutoCompletion(config)       // Pug模板自动补全
  const autoCompletionVue = new VueAutoCompletion(autoCompletionPug, autoCompletionWxml)  // Vue模板自动补全（复用Pug和WXML的补全逻辑）
  const documentHighlight = new WxmlDocumentHighlight(config)   // 文档高亮服务
  const propDefinitionProvider = new PropDefinitionProvider(config)  // 属性定义跳转服务

  // 定义支持的语言类型
  const wxml = config.documentSelector.map(l => schemes(l))  // WXML相关语言（可配置，默认支持wxml）
  const pug = schemes('wxml-pug')                           // Pug模板语言
  const vue = schemes('vue')                                // Vue单文件组件
  const enter = config.showSuggestionOnEnter ? ['\n'] : [] // 是否在按回车键时触发自动补全

  // 向VSCode注册所有服务和功能
  context.subscriptions.push(
    // 注册命令：创建小程序组件
    commands.registerCommand(COMMANDS.createComponent, createMiniprogramComponent),

    // 注册编辑器监听器：给模板中的JS变量添加特殊颜色装饰
    new ActiveTextEditorListener(config),

    // 注册悬停提示服务：支持WXML、Pug、Vue文件
    languages.registerHoverProvider([pug, vue].concat(wxml), hoverProvider),

    // 注册文件链接服务：支持WXML、Pug文件中的路径跳转
    languages.registerDocumentLinkProvider([pug].concat(wxml), linkProvider),

    // 注册文档高亮服务：高亮匹配的标签对
    languages.registerDocumentHighlightProvider(wxml, documentHighlight),

    // 注册格式化服务：支持整个文档和选定范围的格式化
    languages.registerDocumentFormattingEditProvider(wxml, formatter),
    languages.registerDocumentRangeFormattingEditProvider(wxml, formatter),

    // 注册定义跳转服务：支持WXML、Pug文件中的属性定义跳转
    languages.registerDefinitionProvider([pug].concat(wxml), propDefinitionProvider),

    // 注册自动补全服务
    // WXML自动补全：支持多种触发字符 < 空格 : @ . - " ' / 以及可选的回车
    languages.registerCompletionItemProvider(
      wxml,
      autoCompletionWxml,
      '<',     // 标签开始
      ' ',     // 空格（属性分隔）
      ':',     // 绑定属性
      '@',     // 事件绑定
      '.',     // 属性修饰符
      '-',     // 连字符
      '"',     // 双引号
      "'",     // 单引号
      '/',     // 自闭合标签
      ...enter // 可选的回车触发
    ),
    
    // Pug自动补全：支持Pug语法特有的触发字符
    languages.registerCompletionItemProvider(pug, autoCompletionPug, '\n', ' ', '(', ':', '@', '.', '-', '"', "'"),
    
    // Vue自动补全：结合WXML和Pug的触发字符
    languages.registerCompletionItemProvider(vue, autoCompletionVue, '<', ' ', ':', '@', '.', '-', '(', '"', "'")
  )

  // 标记插件已激活状态，用于控制命令和菜单的显示
  commands.executeCommand('setContext', CONTEXT_KEYS.init, true);
}

/**
 * 扩展停用函数
 * 
 * 当扩展被禁用、卸载或VSCode关闭时调用
 * 主要用于清理资源和取消监听
 */
export function deactivate(): void {
  configDeactivate()  // 停用配置系统，清理配置相关资源
}

/**
 * 自动配置VSCode设置
 * 
 * 为了提供更好的微信小程序开发体验，自动配置VSCode的相关设置：
 * 1. 文件关联配置：让VSCode正确识别小程序文件类型
 * 2. Emmet支持：让WXML文件支持Emmet快捷输入
 * 
 * 配置完成后会自动设置 disableAutoConfig 为 true，避免重复配置
 */
function autoConfig() {
  const c = workspace.getConfiguration()  // 获取VSCode配置对象
  
  // 定义需要更新的配置项
  const updates: { key: string; map: any }[] = [
    {
      // 文件关联配置：让VSCode正确识别小程序相关文件
      key: 'files.associations',
      map: {
        '*.cjson': 'jsonc',      // 小程序配置文件，支持注释的JSON
        '*.wxss': 'css',         // 小程序样式文件，按CSS语法处理
        '*.wxs': 'javascript',   // 小程序脚本文件，按JavaScript语法处理
      },
    },
    {
      // Emmet语言支持配置：让WXML支持Emmet快捷输入
      key: 'emmet.includeLanguages',
      map: {
        wxml: 'html',  // WXML文件使用HTML的Emmet规则
      },
    },
  ]

  // 遍历并更新配置
  updates.forEach(({ key, map }) => {
    const oldMap = c.get(key, {}) as any  // 获取现有配置
    const appendMap: any = {}
    
    // 只添加不存在的配置项，避免覆盖用户自定义配置
    Object.keys(map).forEach(k => {
      if (!oldMap.hasOwnProperty(k)) appendMap[k] = map[k]
    })
    
    // 如果有新配置需要添加，则更新到全局设置
    if (Object.keys(appendMap).length) {
      c.update(key, { ...oldMap, ...appendMap }, true)
    }
  })

  // 标记自动配置已完成，避免下次启动重复配置
  c.update('minapp-vscode.disableAutoConfig', true, true)
}

/**
 * 创建语言选择器辅助函数
 * 
 * 用于创建VSCode语言服务注册时需要的语言选择器对象
 * 
 * @param key 语言标识符
 * @returns 语言选择器对象，指定文件协议和语言类型
 */
export function schemes(key: string): any {
  return { scheme: 'file', language: key }
}
