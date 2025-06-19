#### 安装这个顺序查看代码
1. package.json
2. extension.ts
3. HoverProvider.ts。 几个工具函数的实现getLanguage、getTagAtPosition、hoverComponentMarkdown
4. WxmlFormatter.ts
5. WxmlAutoCompletion.ts, 几个补全建议项 
6. AutoCompletion.ts 
* createComponentSnippetItem
* createComponentAttributeSnippetItems: 
    - autoCompleteClassNames: 遍历所有的样式文件
    - autoCompleteMethods: 遍历所有的js文件
7. LinkProvider.ts

8. WxmlDocumentHighlight.ts: 标签匹配高亮

9. 语法着色 wxml.tmLanguage.json

## 🎨 语法着色 (wxml.tmLanguage.json) 详细解释

### 📋 基本概念
- **TextMate 语法定义文件**：通过正则表达式和模式匹配实现语法高亮
- **声明式配置**：不需要编写 TypeScript 代码，只需配置文件
- **与文档高亮区别**：语法着色是给代码元素着色，文档高亮是标签配对高亮

### 🏗️ 文件结构

#### 1. **基本信息**
```json
{
  "name": "WXML",                    // 语言名称
  "scopeName": "text.html.wxml",     // 作用域名称，用于主题颜色匹配
  "uuid": "ca2e4260-5d62-45bf-8cf1-d8b5cc19c8f9"  // 唯一标识符
}
```

#### 2. **repository - 可重用语法规则库**
- **wxml-interpolations**: 插值语法 `{{ expression }}`
- **wxml-directives**: 指令语法 `bind:tap`, `wx:if`
- **tag-stuff**: 标签内容规则集合
- **string-double-quoted/single-quoted**: 字符串处理
- **entities**: HTML 实体处理

#### 3. **patterns - 主匹配规则（按优先级）**
1. 🔗 **插值表达式** `{{ }}` - 最高优先级
2. 🏷️ **自闭合标签对** `<view>内容</view>`
3. 📄 **XML 声明** `<?xml version="1.0"?>`
4. 💬 **HTML 注释** `<!-- 注释 -->`
5. 🎨 **特殊标签**: 
   - `<wxs>` 内部按 JavaScript 语法高亮
   - `<template>` 内部递归 WXML 语法
6. 📋 **HTML 标签分类**:
   - 结构标签 (body, head, html)
   - 块级标签 (div, p, h1-h6, etc.)
   - 内联标签 (span, a, strong, etc.)
7. 🎨 **自定义标签** - 微信小程序组件

### 🎯 Scope 名称作用
| Scope 名称 | 颜色作用 | 示例 |
|------------|----------|------|
| `entity.name.tag.html` | 🏷️ 标签名颜色 | `<view>` 中的 "view" |
| `entity.other.attribute-name.html` | 🎛️ 属性名颜色 | `class="container"` 中的 "class" |
| `string.quoted.double.html` | 📖 字符串颜色 | `"container"` |
| `support.constant.handlebars.wxml` | 🔗 插值括号颜色 | `{{}}` |
| `comment.block.html` | 💬 注释颜色 | `<!-- 注释 -->` |

### 🔧 在 package.json 中的配置
```json
{
  "languages": [
    {
      "id": "wxml",
      "extensions": [".wxml"],
      "configuration": "./syntaxes/wxml.language-configuration.json"
    }
  ],
  "grammars": [
    {
      "language": "wxml",
      "scopeName": "text.html.wxml",
      "path": "./syntaxes/wxml.tmLanguage.json",
      "embeddedLanguages": {
        "text.html": "html",
        "source.js": "js"
      }
    }
  ]
}
```

### 🚀 实现功能
1. 🎨 **完整的 WXML 语法高亮**
2. 🔗 **微信小程序插值语法** `{{ data }}`
3. 🎛️ **事件绑定和数据绑定指令** `bind:tap`, `wx:if`
4. 📝 **JavaScript 代码嵌入** (在 `{{}}` 和 `<wxs>` 中)
5. 🏷️ **标准 HTML 标签和自定义组件支持**
6. 🌈 **多层嵌套语法支持** (WXML + JS + HTML)

### 💡 工作原理
1. 用户打开 `.wxml` 文件
2. VSCode 根据文件扩展名识别语言类型
3. 加载 `wxml.tmLanguage.json` 进行语法解析
4. 根据正则匹配给不同语法元素分配 scope
5. VSCode 主题根据 scope 进行着色渲染

## 🔄 VSCode 语法着色完整工作流程详解

### 第一步：插件安装和注册 📦

当用户安装这个扩展时：

```json
// package.json 中的关键配置
{
  "contributes": {
    "languages": [
      {
        "id": "wxml",                    // ①定义新语言ID
        "extensions": [".wxml"],         // ②绑定文件扩展名
        "configuration": "./syntaxes/wxml.language-configuration.json"
      }
    ],
    "grammars": [
      {
        "language": "wxml",              // ③关联到上面的语言ID
        "scopeName": "text.html.wxml",   // ④定义作用域名称
        "path": "./syntaxes/wxml.tmLanguage.json"  // ⑤指向语法文件
      }
    ]
  }
}
```

**VSCode 做了什么**：
- 🔗 注册新的语言类型 "wxml"
- 📝 将 `.wxml` 扩展名与这个语言类型绑定
- 📋 记录语法定义文件的位置

### 第二步：文件打开触发 📂

当用户打开 `page.wxml` 文件时：

```
用户操作: 打开 page.wxml
    ↓
VSCode检查: 文件扩展名是 .wxml
    ↓
VSCode查找: 哪个语言注册了 .wxml 扩展名？
    ↓
VSCode发现: "wxml" 语言注册了这个扩展名
    ↓
VSCode加载: ./syntaxes/wxml.tmLanguage.json 文件
```

### 第三步：语法解析器初始化 🧮

VSCode 内置了 **TextMate 语法解析引擎**：

```javascript
// VSCode 内部伪代码
class TextMateGrammar {
  constructor(grammarPath) {
    this.rules = JSON.parse(fs.readFileSync(grammarPath))
    this.patterns = this.rules.patterns
    this.repository = this.rules.repository
  }
  
  // 解析文档的核心方法
  tokenizeLine(lineText) {
    let tokens = []
    let position = 0
    
    // 按照 patterns 的顺序逐一匹配
    for (let pattern of this.patterns) {
      let match = pattern.regex.exec(lineText.substring(position))
      if (match) {
        tokens.push({
          text: match[0],
          scope: pattern.name,  // 这就是 scope 名称！
          range: [position, position + match[0].length]
        })
        position += match[0].length
      }
    }
    
    return tokens
  }
}
```

### 第四步：逐行扫描和标记 🔍

对于每一行 WXML 代码，TextMate 引擎都会：

```xml
<!-- 示例 WXML 代码 -->
<view class="container" bind:tap="handleTap">
  {{ message }}
</view>
```

**扫描过程**：

```javascript
// 第1行: <view class="container" bind:tap="handleTap">
[
  { text: "<", scope: "punctuation.definition.tag.begin.html" },
  { text: "view", scope: "entity.name.tag.html" },           // 🏷️ 标签名
  { text: "class", scope: "entity.other.attribute-name.html" }, // 🎛️ 属性名
  { text: "=", scope: "punctuation.separator.key-value.html" },
  { text: "\"container\"", scope: "string.quoted.double.html" }, // 📖 字符串
  { text: "bind:tap", scope: "meta.directive.wxml" },        // 🎛️ WXML指令
  { text: "=", scope: "punctuation.separator.key-value.html" },
  { text: "\"handleTap\"", scope: "string.quoted.double.html" },
  { text: ">", scope: "punctuation.definition.tag.end.html" }
]

// 第2行: {{ message }}
[
  { text: "{{", scope: "support.constant.handlebars.wxml" }, // 🔗 插值开始
  { text: "message", scope: "source.js" },                   // 📝 JS变量
  { text: "}}", scope: "support.constant.handlebars.wxml" }  // 🔗 插值结束
]

// 第3行: </view>
[
  { text: "</", scope: "punctuation.definition.tag.begin.html" },
  { text: "view", scope: "entity.name.tag.html" },           // 🏷️ 结束标签
  { text: ">", scope: "punctuation.definition.tag.end.html" }
]
```

### 第五步：主题映射和着色 🎨

VSCode 主题文件（如 Dark+ 主题）包含 scope 到颜色的映射：

```json
// 主题文件 dark_plus.json (简化版)
{
  "tokenColors": [
    {
      "scope": "entity.name.tag.html",
      "settings": { "foreground": "#4FC1FF" }        // 🔵 蓝色标签名
    },
    {
      "scope": "entity.other.attribute-name.html", 
      "settings": { "foreground": "#92C5F7" }        // 🔷 浅蓝色属性名
    },
    {
      "scope": "string.quoted.double.html",
      "settings": { "foreground": "#CE9178" }        // 🟤 橙色字符串
    },
    {
      "scope": "support.constant.handlebars.wxml",
      "settings": { "foreground": "#FF6B6B" }        // 🔴 红色插值括号
    }
  ]
}
```

### 第六步：渲染到编辑器 🖼️

VSCode 渲染引擎将 tokens 转换为带颜色的 HTML：

```html
<!-- 最终渲染结果 -->
<span style="color: #569CD6">&lt;</span>
<span style="color: #4FC1FF">view</span>
<span style="color: #92C5F7">class</span>
<span style="color: #D4D4D4">=</span>
<span style="color: #CE9178">"container"</span>
<span style="color: #92C5F7">bind:tap</span>
<span style="color: #D4D4D4">=</span>
<span style="color: #CE9178">"handleTap"</span>
<span style="color: #569CD6">&gt;</span>
```

## 🔧 关键技术点

### 1. **TextMate 语法引擎** 🧮
- VSCode 内置了 Microsoft 开发的 TextMate 语法解析器
- 支持复杂的正则表达式和嵌套匹配
- 高性能：增量解析，只重新解析修改的部分

### 2. **Scope 系统** 🎯
- 每个语法元素都被分配一个 scope 名称
- Scope 采用层次化命名：`entity.name.tag.html`
- 主题通过 scope 名称来定义颜色

### 3. **优先级匹配** 📋
- `patterns` 数组的顺序决定匹配优先级
- 先匹配的规则会覆盖后匹配的规则
- 插值表达式 `{{ }}` 通常优先级最高

### 4. **嵌入语言支持** 🔗
```json
"embeddedLanguages": {
  "source.js": "js"  // {{ }} 内部按 JavaScript 语法解析
}
```

## 💡 为什么这样设计？

### 优势 ✅
- **性能优秀**：正则匹配比 AST 解析快得多
- **扩展性强**：任何人都可以定义新语言的语法
- **主题兼容**：一套 scope 系统适用于所有语言
- **增量更新**：只需重新解析修改的行

### 局限性 ⚠️
- **无语义理解**：只能做词法分析，不能理解语法含义
- **正则复杂**：复杂语法的正则表达式难以维护
- **嵌套限制**：深度嵌套的语法结构处理困难

## 🎉 总结

整个过程就是：**文件扩展名 → 语言识别 → 语法解析 → Token化 → 主题映射 → 颜色渲染**

VSCode 通过这套机制，让插件开发者只需要写一个 JSON 配置文件，就能为任何语言提供语法高亮功能，这就是为什么 VSCode 能支持数百种编程语言的原因！🚀

## 🛠️ TMLanguage 文件实际开发方法

### 📋 开发现状真相

**重要提醒**：很少有开发者从零开始编写 `tmLanguage.json` 文件！实际开发中都是使用以下简便方法。

### 1. **基于现有语言修改** 🔄 （最常用方法）

大多数开发者采用这种方法：

```bash
# 常见的改造路径
HTML → WXML (微信小程序)
Vue → Wepy (微信小程序框架)  
JavaScript → TypeScript
CSS → SCSS/LESS
Markdown → MDX
PHP → Blade (Laravel 模板)
```

**实际开发流程**：
1. 🔍 找到相似的现有语言文件
2. 📋 复制基础结构
3. 🛠️ 修改特定的语法规则
4. ➕ 添加自定义的模式匹配

### 2. **使用自动化工具** 🤖

#### **Yeoman 脚手架工具** （官方推荐）
```bash
# VSCode 官方提供的脚手架
npm install -g yo generator-code
yo code

# 选择 "New Language Support"
# 可以从现有的 tmLanguage 文件开始
```

#### **专门的 TMLanguage 工具**
- **TmLanguage-Syntax-Highlighter** (VSCode 扩展) - 语法高亮和智能提示
- **vscode-tmlanguage** (已归档，但仍可用) - 文件转换工具
- **在线 TMLanguage 编辑器** - 浏览器端编辑器

### 3. **使用 YAML 简化编写** 📝

很多开发者用 YAML 写语法文件，然后转换为 JSON：

```yaml
# 比 JSON 更易读和维护
name: WXML
scopeName: text.html.wxml
patterns:
  - include: '#wxml-interpolations'
  - include: '#tags'

repository:
  wxml-interpolations:
    patterns:
      - name: expression.embedded.wxml
        begin: '\{\{'
        end: '\}\}'
        patterns:
          - include: source.js#expression
```

然后用工具转换：
```bash
# 安装转换工具
npm install js-yaml --save-dev

# 转换为 JSON
npx js-yaml syntaxes/wxml.yaml > syntaxes/wxml.json
```

### 4. **获取 Scope 名称的方法** 🎯

开发者获取 scope 名称的常用方法：

#### **VSCode 内置工具** 🔍 （最重要的调试工具）
- **命令面板** → `Developer: Inspect Editor Tokens and Scopes`
- **快捷键**：`Ctrl+Shift+P` → 搜索 "inspect tokens"
- **实时查看**：任何代码位置的 scope 名称
- **功能详解**：
  - 显示当前 token 的所有 scope
  - 显示主题规则的匹配情况
  - 显示语法高亮的层次结构

#### **参考现有主题** 🎨
```json
// 查看流行主题的 scope 定义
// 如 Dark+ 主题，One Dark Pro 等
{
  "scope": "entity.name.tag.html",
  "settings": { "foreground": "#4FC1FF" }
}
```

#### **TextMate 官方文档** 📚
- **官方 Scope 命名约定**
- **常用 Scope 列表**
- **最佳实践指南**

### 5. **实际的开发工作流** ⚡

```
选择相似的现有语言 → 复制基础模板 → 使用 YAML 编写语法规则 
    ↓
转换为 JSON → 使用 Scope Inspector 调试 → 测试和优化 
    ↓
发布语言扩展
```

### 6. **实际工作量评估** ⏱️

| 复杂程度 | 开发时间 | 工作内容 | 示例 |
|---------|---------|---------|------|
| **简单修改** | 2-4小时 | 基于现有语言，修改关键词和模式 | HTML → WXML |
| **中等复杂** | 1-3天 | 添加新的语法结构，嵌入语言支持 | JavaScript → TypeScript |
| **完全新语言** | 1-2周 | 从头设计语法规则，全面测试 | 创建全新的 DSL |

### 7. **推荐的学习路径** 📈

#### **初学者路径** 🌱
1. **从简单开始**：修改现有语言的关键词
2. **使用工具**：Yeoman 脚手架 + YAML 编写
3. **学习调试**：熟练使用 VSCode 的 Token Inspector

#### **进阶路径** 🚀
4. **学习 Scope**：理解 scope 命名规则和层次
5. **参考社区**：GitHub 上的优秀语法文件
6. **迭代优化**：不断测试和改进性能

### 8. **社区资源和工具** 🌐

#### **GitHub 资源**
- 搜索 "tmlanguage" 查看示例
- 热门语言扩展的源代码
- TextMate Grammar 社区贡献

#### **VSCode 工具扩展**
```bash
# 推荐安装的开发辅助扩展
code --install-extension RedCMD.tmlanguage-syntax-highlighter  # 语法高亮支持
code --install-extension ms-vscode.theme-tester               # 主题测试工具
```

#### **在线资源**
- **VSCode Marketplace** - 参考其他语言扩展
- **TextMate Grammar 文档** - 官方规范
- **Stack Overflow** - 解决具体问题

### 9. **开发最佳实践** 💡

#### **性能优化**
- ⚡ 使用高效的正则表达式
- 📊 避免过度复杂的嵌套规则
- 🔍 定期测试大文件的解析性能

#### **维护性考虑**
- 📝 使用 YAML 提高可读性
- 💬 添加详细的注释说明
- 🧪 编写测试用例验证语法

#### **兼容性处理**
- 🌐 遵循 TextMate 标准规范
- 🎨 确保主题兼容性
- 🔄 支持多种文件格式转换

### 10. **常见陷阱和解决方案** ⚠️

#### **正则表达式陷阱**
```json
// ❌ 错误：可能导致无限回溯
"match": "(.*)+"

// ✅ 正确：使用非贪婪匹配
"match": "(.*?)"
```

#### **Scope 命名陷阱**
```json
// ❌ 错误：自定义 scope 名称
"name": "my.custom.scope"

// ✅ 正确：遵循标准命名
"name": "entity.name.tag.html"
```

#### **性能陷阱**
- 避免过于宽泛的正则模式
- 合理使用 `repository` 重用模式
- 测试大文件的解析性能

## 🎯 总结：现实开发情况

**现实情况**：很少有人从零开始写 tmLanguage.json！

**推荐做法**：
1. 🔍 **找到相似的现有语言** - 最重要的第一步
2. 🛠️ **使用工具和脚手架** - Yeoman 生成器
3. 📝 **用 YAML 简化编写** - 提高可读性和维护性
4. 🔧 **使用 VSCode 内置调试工具** - Token Inspector 是关键
5. 🤝 **利用社区资源和示例** - 站在巨人的肩膀上

**工作量对比**：
- ❌ **从零开始**：几周的专业工作
- ✅ **使用推荐方法**：几小时到几天的配置和调试

这样，开发一个语法高亮扩展就变成了一个可管理的任务，而不是一个令人望而却步的项目！🎉
