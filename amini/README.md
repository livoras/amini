## 群接龙小程序脚手架

## 命令

开发（监听修改），将开发者工具目录设为 dist
为了避免开发过程中，开发者工具不断编译，可以将开发者工具的自动编译模式改为手动
```sh
npm start
```

构建：清空dist、获取接口服务、编译
```sh
npm run build
```

删除dist
```sh
npm run clean
```

检查代码
```sh
npm run lint # or npm lint --fix
```

自动测试
```
npm test
```

## 规范

#### 目录

- `dist` 生成文件，小程序开发者工具指向这个文件夹
- `scripts` 一些辅助脚本
  - `scaffold` 脚手架配置文件，使用插件 code-template-tool 生成文件夹，需要配置文件目录为这里
- `src` 源文件
  - `assets` 图片、字体资源
  - `core` 框架层代码 例如 `amini`
    - `test` 测试代码
    - `amini` 依赖注入框架, 里面的 `forms` 是 angular 的form 的移植
    - `typings` 小程序api 接口声明文件
    - `classes` 类文件(`SuperPage` 页面父类，新建页面必须继承, `SuperComponent` 组件父类，新建组件必须继承)
    - `decorators` 装饰器
    - `services` 小程序 **业务无关**的各种工具类、服务类（注意：工具必须配上测试） 
  - `environments` 环境，现有两个环境 `config.dev.ts`,`config.prod.ts`, 可以新建 `config.custom.ts` 覆盖开发环境，**只能覆盖开发环境**
  - `pages` 页面文件，内部划分按 模块 =>（页面 + 服务 + 页面组件）**务必使用code-template生成**
    - `components` 全局通用组件，页面组件放回自己的文件夹，避免增大主包
    - 模块（例子）
      - 页面文件夹
      - services
      - mixins, wxs, components ...
    - `mixins` 通用 mixin
    - `services`  **业务相关** 全局通用服务
    - `wxs` 通用的页面数据渲染的工具方法
  - `styles` 通用样式文件，公共的样式类放这里（例如: flex.less）
    - `variables.less` 全局通用变量，**只能定义变量**
  - `typings` 通用类型声明
    - `global.d.ts` 自定义全局类型
  - `config.ts` 环境文件，gitignore；使用 `_config.js` 改名
  - `app.(ts|json|less)` 小程序入口
 - `vendors` 第三方库，相当于 node_modules
- `project.config.json` gitignore 小程序开发者工具环境文件，使用 `_project.config.json` 改名

mono packages 上另外的模块
- `mono-shared` 两端通用代码，编译时复制进来(不要修改本地代码，没用), **平台无关**的公共方法，（注意：工具必须配上测试） 

#### 目录规范

1.文件命名：

- 页面、组件： xx-xx.ts
- services： xx-xx.service.ts
- 类文件： ClassName.ts
- 测试文件： xx-xx.spec.ts

2.pages 文件组织规则：

- pages 顶层 components services mixins wxs 全局通用。注意不要乱放文件，避免增大主包
- pages 按模块划分，每个模块有自己的页面文件夹、服务、组件、mixin。
- 每个模块的入口页面直接放在模块根目录（无需文件夹包住），其他页面独立文件夹
- mixins 放 **生命周期**、**页面事件** 共用的逻辑
- 文件命名 xx-xx

3.工具类组织规则：

- 业务相关的工具方法放 pages/**/services 里（具体的存放层级看跨度），例如 要发请求的方法（collectFormId），与具体数据处理相关的方法（zone-validators）
- 业务无关的工具方法放 core/util/util.services 例如 showModal
- **小程序无关**的工具方法，放 mono-shared, 例如 max min
- 必须在对应位置写测试

#### page-wrapper

`src/pages` 里面每个页面文件都会在编译时包裹在一个 `page-wrapper` 组件内，
会等待首次`onLoad` `onShow` 执行的接口，根据请求状态改变页面状态 `LOADING` `SUCCESS` `FAIL`

每个也会包裹在 `formid-collector` 里面，需要传活动id的，则要定义 `this.data.actId`

自定义loading样式：现在 loading 状态是显示微信自带的 loading 动画，可以通过 slot自定义
```html
<view slot="loading"></view>  
```
自定义 fail 样式，需要调用 SuperPage 方法 `toggleCustomFailPage` 才能生效
```html  
<view slot="fail"></view>  
```

`SuperPage` 提供以下 api 来使用这个组件：
- `setPageStatus(status: PAGE_STATUS, statusCode: number): void` 改变页面状态，有 `LOADING` `SUCCESS` `FAIL`三种状态，`LOADING` 什么都不显示，只显示加载动画；`SUCCESS` 显示页面内容；`FAIL` 显示重新加载的画面。
- `setErrorTips(msg: string): void` 显示顶部红色提示，3000 ms 自动消失
- `setFailMessage(msg: string): void` 设置 `FAIL` 页面显示的错误信息
- `toggleCustomFailPage(isCustom: boolean): void` 使用自定义的 错误 样式
- `showDataListLoading(): void` 显示列表底部的加载动画，可以通过 `.bottom-loading-wrapper` `.bottom-loading` 修改样式
- `hideDataListLoading(): void` 隐藏列表底部的加载动画
- `hidePageWrapperNavbar(): void` 隐藏 page-wrapper 自带的 navbar

`SuperPage` 提供以下事件、生命周期回调：
- `onAllDataLoaded` 所有 onLoad onShow 中首次发送的请求响应后触发
- `handleFormIdCollectDone` 收集 formid 成功的回调，参数有 `e.detail.formId`
- `handleRetryLoadData` 数据加载失败后 点击重试按钮的回调，默认是 redirect 到当前页面

注意：onLoad onShow 中需要收集的接口都不能放在 setData 的回调中，不然手机不到

#### css 规范

原则：尽量复用，避免冗余，样式代码划分清晰（抽组件的时候可以快速找到对应样式）

- 都使用 less, import 其他文件时使用 `@import (css) 'xxx.less'`，适配小程序
- `app.less` 全局样式，但只能引用 `styles/*.less` 的文件（避免冗余，组件也可引入）
- 各页面的 less 各自样式
- `styles` 放置各通用样式的文件，例如 `flex.less`
- `styles/variables.less` 定义 less 变量，**只能**定义变量，因为所有less文件都会引入该文件 
- 注意：不可使用 标签选择器（例如：page）、 id 选择器 、 属性选择器；因为 组件不支持这些选择器

#### 自动测试

使用 [ava](https://github.com/avajs/ava)

文件名： *.spec.ts

所有工具类都必须在对应位置写测试，可以使用模板 `test-file` 生成测试文件

以后组件也要配上测试

## 更新脚手架

原则是先更新脚手架，再合并到使用的项目。

1. 如果以脚手架作为项目根目录，可以直接 `git pull http://git.shangshi360.com/wangwenjie/qunjielong-mini-boilerplate.git dev` 到本地
2. 如果以脚手架作为项目某个子目录，可以使用 `git subtree pull --prefix=your/path http://git.shangshi360.com/wangwenjie/qunjielong-mini-boilerplate.git dev --squash` 其中 your/path 就是脚手架在当前项目的子目录

## 内部工具

1. rxwx 用 Observable 形式封装 wx 接口
2. `./scripts` forEachFile 可以遍历文件，查找符合条件的文件，并执行自定义操作

## 注意事项

- 所有跳转都用 api 来跳转，不能在 wxml 里面跳转
- 使用 rxjs.subject 来替代以前的 notification
- rxjs error 的时候是不会触发 `subscribe` 第三个参数的(`onComplete`)，可以使用 `finalize` 代替， error 也会触发
- 不能直接引用 swagger 生成的接口文件， 只能引用 mono-shared 里面的 swagger.service.ts
- gulp 任务 lintTs 如果遇到 `invaild source file`， 请重新 start
- 不准写 static 方法，原因是为了统一，免得还要考量用不用 static
- 使用 amini-form 最低版本是 2.1.2，遇到 关于 form 的报错可以检查一下 lib 版本
- code template tool 用不了的话，重新设置一下 templatePath
- ios textarea auto-heigh 高度变得很大并且与文本内容长度正相关。这问题初始渲染时立刻赋值就可出现，只要先渲染出 textarea，再延迟赋值就可以解决

**【有坑就写这里】**

## vscode 插件推荐

- relative path 生成相对路径
- code template tool 文件模板
- Toggle Quotes 快速切换三种字符串引号





## TODO 

- [x] request 重写
- [x] app.js 重写
- [x] 重写 util
- [x] 小程序 angular 代码共享方案(tsconfig path alias 到mono的文件夹，编译时直接编译到dist)
- [x] 更新新建模板脚手架
- [x] amini 更新
- [x] css 规范
- [x] 使用 less
- [x] 文件目录规范，代码存放定义
- [x] tslint 最严格
- [x] tslint sonart vscode 插件
- [x] 小程序接口全部 rx 化， 接口提示
- [x] 有用的组件拷贝
- [x] 更新 wx.d.ts
- [x] 分离源码
- [x] gulp watch (编译提示)
- [x] 定义接口前考虑好，一个接口是否会多处共用（例如：商品），参考库表设计 （后端生成service，应该可以避免该问题）
- [x] 小程序开发测试调通
- [x] _config 没有config的话 就自动复制
- [x] 使用 subtree 来更新脚手架
- [x] 限定 组件 页面 必须继承过 对应的父类(SuperComponent SuperPage)
- [x] 自动测试 core helper，通用组件 （解决，ts编译问题）
- [x] 发送通知（使用 service subject）
- [x] 模板编译 gulpfile
- [x] _project.config.json 每次构建要自动复制
- [x] tsconfig 包含 scripts，但不编译他(gulp 使用自定义 src 不再使用 `project.src()`)
- [x] less 插入公共标签 (gulp-less globalVars)
- [ ] core deepclone 循环引用问题
- [ ] 命令生成脚手架
- [ ] 文档编译 gulpfile
- [ ] 埋点系统
- [ ] 本地图片 wxss 使用需要转为 base64
- [ ] vscode 插件： wxml 对应属性跳转到 ts 文件
- [ ] observable 后捕获（先 subscribe 再捕获）
- [ ] lerna 管理公共包
- [x] page-wrapper 菊花，下拉，multi slot 自定义loading。
- [ ] gulp-tslint 对于文件新建会报错
- [ ] 组件 test
- [x] prod dev 两个环境
- [ ] 生产环境删除开发环境的检查代码
- [ ] 分离 ts 与 html， 纯 ts 描述 html 交互逻辑，输出描述文档，彻底分离。
- [ ] gulp service 读取 ILoadParams
- [ ] rxjs-tslint-rule
- [ ] 生产环境 console 管理
- [x] page-wrapper 不用clean 就可以更新: changed 监听 gulpfile 修改时间
- [ ] setValue 改成 rxjs 并且优化下找路径
- [ ] DataList 改进api，加入翻页选择器（全选反选）功能
