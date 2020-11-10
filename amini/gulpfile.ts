// tslint:disable: variable-name
const path = require("path")
import fs = require("fs")
import JSON5 = require("json5")
import Vinyl = require("vinyl")
import { BufferFile } from "vinyl"
import { trimSwagger } from "./scripts/trim-swagger/trim-swagger"
import { trimClasses } from "./scripts/trim-classes/index"

const env = process.env.NODE_ENV || "dev"
console.log("==============")
console.log("env:", env)
/** 获取配置 */
const getConfig = (): any => {
  // 有缓存，所以重复 require 都不会取到最新内容
  const rawConfig = require(`./src/environments/config.${env}`).config
  try {
    if (env === "dev") {
      const customConfig = require("./src/environments/config.custom").config
      Object.assign(rawConfig, customConfig)
    }
  } catch (err) { }
  return rawConfig
}

// 记录 gulpfile 修改时间，如果gulpfile 修改了就全量编译
const currentModifyTime = fs.statSync("./gulpfile.ts").mtime
console.log("gulpfile last modify:", currentModifyTime)
const RECORD_TIME_FILE = "./.gulpfile_last_modify"
let gulpHasChanged = false
try {
  const gulpRecordTime = new Date(fs.readFileSync(RECORD_TIME_FILE).toString())
  console.log("gulpfile record time:", gulpRecordTime)
  gulpHasChanged = currentModifyTime.getTime() > gulpRecordTime.getTime() + 1000
  if (gulpHasChanged) { console.log("gulp has changed")}
} catch (err) {}
console.log("=============")

import gulp = require("gulp")
const through = require("through2")
const filter = require("gulp-filter")
const replace = require("gulp-replace-path")
const gulpData = require("gulp-data")
const lazypipe = require("lazypipe")
const rename = require("gulp-rename")
const changed = require("gulp-changed")

const gulpChangedInPlace = require("gulp-changed-in-place")
/** 只适用于没有 output 的任务，例如 lint format report 等 */
const changedInPlace = (opt = {}): any => gulpChangedInPlace({
  firstPass: true,
  howToDetermineDifference: "modification-time",
  ...opt,
})
const header = require("gulp-header")
const footer = require("gulp-footer")
const del = require("del")
const mergeJson = require("gulp-merge-json")

const tsCompiler = require("gulp-typescript")
import tslint = require("tslint")
const noop = through.obj

const gulpTslint = require("gulp-tslint")

const template = require("gulp-art-template4-enhanced")
const stripComments = require("gulp-strip-comments")

const lessCompiler = require("gulp-less")
const LessCleanCss = require("less-plugin-clean-css")
const cleanCss = new LessCleanCss()
/* ************************ 路径 ******************************* */

type pathMap = Array<[string, string, boolean]>

const distDir = "dist"
const srcDir = "src"
const rxjsDist = "vendors/rxjs-dist"
const libDir = "vendors"
const monoDir = "../mono-shared/src"
const appJsonSrc = `${srcDir}/app.json`
/** 需要编译的ts文件路径 */
const tsSrc = [`${srcDir}/**/*.ts`, `!${srcDir}/**/*.spec.ts`, `!${srcDir}/_config.ts`]
const monoTsSrc = [`${monoDir}/**/*.ts`, `!${monoDir}/swagger-service/*.ts`, `!${monoDir}/**/*.spec.ts`]
const routeServiceSrc = [`${srcDir}/pages/services/route.service.art`]
/** 需要lint 的ts文件 */
const lintSrc = tsSrc.concat(monoTsSrc).concat("!" + routeServiceSrc[0].replace("art", "ts"))
/** 需要编译的less */
const lessSrc = [`${srcDir}/**/*.less`, `!${srcDir}/styles/variables.less`]
/** 需要编译的 art  */
const artSrc = [`${srcDir}/pages/**/*.art`]
  .concat("!" + routeServiceSrc[0])
/** 需要编译的 wxml */
const pageWxmlSrc = [`${srcDir}/**/*.wxml`, `!${srcDir}/**/components/**/*.wxml`]
const componentWxmlSrc = [`${srcDir}/**/components/**/*.wxml`]
/** 无需编译，仅复制的文件 */
const srcCopyList = [
  `${srcDir}/**/*.+(js|wxss|json|wxs)`,
  `${srcDir}/**/*.+(png|gif|jpeg|jpg)`,
]
/** lib  */
const libCopyList = [
  `${libDir}/**/*.js`,
]
/** config 文件位置 */
const configPath = [`${srcDir}/environments/*.ts`]

const rxjsPath: pathMap = [
  // ['"rxjs"', `${rxjsDist}/index`, true],
  // ["rxjs/operators", `${rxjsDist}/operators/index`, false],
  // ["rxjs/internal", `${rxjsDist}/internal`, false],
  ['"rxjs"', `${libDir}/rxjs`, true],
  ["rxjs/operators", `${libDir}/rxjs-operators`, false],
  ["rxjs/internal", `${libDir}/rxjs-internal`, false],
]

/* ************************ ts ******************************* */
interface IPathItem {
  name: string
  url: string
}

/** 生成routeService的方法名 */
const genMethodName = (pathStr: string): string => {
  const nameList =  pathStr.split("/").slice(1)
  const len = nameList.length
  const firstPathIndex = len > 2
    ? nameList[0] === nameList[1] ? 1 : 0
    : 0
  const lastPathIndex = nameList[len - 1] === nameList[len - 2] ? -1 : undefined
  return nameList
    // 去掉多余的第一个名字，去掉多余的最后名字
    .slice( firstPathIndex, lastPathIndex)
    .map<string>((str) => str
      .replace(/^\S/, (c) => c.toUpperCase())
      .replace(/-(.)/g, (c, c1) => c1.toUpperCase()),
    )
    .join("")
}

/** 编译路由服务 TODO: LoadParmas */
const routeService = (): any => {
  return gulp.src(routeServiceSrc, { base: "./src", since: gulp.lastRun(routeService) })
    .pipe(gulpData(() => {
      // 解析 app.json 路径
      const appSetting = require("./" + appJsonSrc)
      const mainPages: string[] = appSetting.pages
      const subPackages: Array<{root: string, pages: string[]}> = appSetting.subpackages
      const pathList: IPathItem[] = mainPages.map((pathStr) => {
        return {
          name: genMethodName(pathStr),
          url: "/" + pathStr,
        }
      }).concat(
        subPackages.reduce<IPathItem[]>((ret, pack) => {
          const root = pack.root
          const list = pack.pages
          return ret.concat(
            list.map((p) => ({
              name: genMethodName(root + "/" + p),
              url: "/" + root + "/" + p,
            })),
          )
        }, []),
      )
      return { pathList }
    }))
    .pipe(template({}, {
      cache: true,
    }, {
      ext: ".ts",
    }))
    .pipe(gulp.dest(srcDir))
}

exports.route = routeService

// 适配分隔符
const changeSep = (pathStr: string): string => {
  return pathStr.replace(new RegExp(`\\${path.sep}`, "ig"), "/")
}

// 路径别名映射： from to 是否结果需要带双引号
// 注意 小程序 不支持引用文件夹自动搜索index.js  需要明确指出
// target 以 src 为基准
const resolveToRelativePath: pathMap = [
  ['"tslib"', "vendors/tslib", true],
  ['"@config"', "environments/config", true],
  ["@angular/core", "core/amini/core", false],
  ['@angular/forms"', 'core/amini/forms/index"', false],
  ["@angular/forms", "core/amini/forms", false],
  ['@mono-shared/utils"', 'mono-shared/utils/index"', false],
  ["@mono-shared", "mono-shared", false],
  ["@core", "core", false],
  ["@/", "", false],
  ...rxjsPath,
]

// 改变根路径
const replacePrefix = (to: string, from: string, withDoubleQuotes: boolean = false): string => {
  to = changeSep(to)
  from = changeSep(from)
  // 注意这一行的 ./
  const modulePath = changeSep(path.relative(from, to))
  if (modulePath === "..") { return "" }
  // 多了一层？
  const upperOneLayer = modulePath.replace("../", "")
  const withLastSlash = upperOneLayer.slice(-2) === ".."
    ? upperOneLayer + "/"
    : upperOneLayer
  return withDoubleQuotes ? `"${withLastSlash}"` : withLastSlash
}

const tsProject =  tsCompiler.createProject("tsconfig.compile.json")
/** 编译ts文件 */
const ts = (): any => {
  // 使用 tsProject.src 的目的是为了也包含 typings，不然修改时就会报错
  // 但 ./tsconfig.json 要包含全部的ts文件，因为vscode 只识别这个文件，包括 *.spec 等不需要编译的文件，
  // 因此编译时可以使用另外的 tsconfig.json 例如 tsconfig.ts.json
  let piper =
    tsProject.src()
    .pipe(changed(distDir, { extension: ".js" }))
    .pipe(tsProject())

  piper = resolveToRelativePath.reduce((p, pathsToProcess) => {
    const [ currentPattern, targetPattern, isWithQuotes ] = pathsToProcess
    // __absolutePath__ 一定要用这个参数名
    // tslint:disable-next-line: variable-name
    return p.pipe(replace(currentPattern, (match: any, __absolutePath__: string): string => {
      let to = `${__dirname}/${srcDir}/${targetPattern}`
      if (currentPattern === "@/") {
        to = `${__dirname}/${srcDir}`
      }
      return replacePrefix(to, __absolutePath__, isWithQuotes)
    }))
  }, piper)

  return piper
    .pipe(through.obj((file: any, _: any, callback: any): void => {
      // console.log(file.contents.toString())
      if (!file.path.match(/swagger/g)) {
        file.contents = Buffer.from(trimClasses(file.contents.toString()))
      }
      callback(null, file)
    }))
    .pipe(gulp.dest(distDir))
}

exports.ts = ts

const badDepContent = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });`
const notEmptyModelsPath = new Set()

const monoTsProject = tsCompiler.createProject("../mono-shared/tsconfig.compile.json")
const monoTs = (): any => {
  const DEST = distDir + "/mono-shared"
  let piper =
    monoTsProject.src()
    .pipe(changed(DEST, { extension: ".js" }))
    .pipe(monoTsProject())

  // 注意只用了前n个
  piper = resolveToRelativePath.slice(0, 4).concat(rxjsPath)
    .reduce((p, alias) => {
      const [currentPattern, targetPattern, quotes] = alias
      return p.pipe(replace(currentPattern, (_: any, __absolutePath__: string): string => {
        const to = path.resolve(path.join(monoDir, targetPattern))
        const result = changeSep(path.relative(__absolutePath__, to))
        return quotes ? `"${result}"` : result
      }))
    }, piper)
  // TODO: 删掉多余的文件
  return piper
    // 搬运js
    .pipe(gulp.src([`${monoDir}/**/*.js`], { base: monoDir }))
    // 移除空的models
    .pipe(filter((file: any): boolean => {
      const { contents } = file
      const isEmpty = contents.toString().trim() === badDepContent
      // if (file.path.match("virtualTelParam")) {
      //   console.log(contents.toString())
      // }
      if (!isEmpty) {
        notEmptyModelsPath.add(file.path.replace(/[\S\s]+?mono\-shared[\/\\]src/g, ""))
        // console.log("--->", file.path)
      }
      return !isEmpty
    }), { restore: true })
    .pipe(
      // tslint:disable-next-line: only-arrow-functions
      through.obj(function(file: any, _: any, callback: any): void {
        if (file.path.match(/swagger/g)) {
          file.contents = Buffer.from(trimSwagger(file.contents.toString()))
        }
        callback(null, file)
      }),
    )
    .pipe(gulp.dest(DEST))
}
exports.monoTs = monoTs

exports.compileTs = gulp.parallel(ts, monoTs)

const removeEmptyDepsInModels = (): any => {
  // console.log(notEmptyModelsPath)
  return gulp.src(distDir + "/mono-shared/**/models.js")
    .pipe(
      through.obj((file: any, _: any, callback: any) => {
        const content = file.contents.toString().trim()
        const lines = content.split("\n")
        const resultLines = []
        for (const line of lines) {
          const cap = line.match(/require\(\"(\.[\s\S]+?)\"\)/)
          if (!cap) {
            resultLines.push(line)
          } else {
            const p = cap[1]
            const dep = (path.resolve(path.join(path.dirname(file.path), p)) + ".js")
              .replace(/[\S\s]+?mono\-shared/g, "")
            // console.log(dep, "-->")
            if (notEmptyModelsPath.has(dep) || dep.match("tslib")) {
              resultLines.push(line)
            }
            // if (fs.existsSync(dep)) {
            //   console.log("EXIST -> ", dep)
            // } else {
            //   console.log("NOT EXIST -> ", dep)
            // }
            // if (fs.existsSync(dep) && fs.readFileSync(dep, "utf-8") !== badDepContent) {
            //   resultLines.push(dep)
            // }
          }
        }
        file.contents = Buffer.from(resultLines.join("\n"))
        callback(null, file)
      }),
    ).pipe(
      gulp.dest(distDir + "/mono-shared"),
    )
}

// 导入config 可以使用 tslint-sonart
const tslintProgram = tslint.Linter.createProgram("./tsconfig.json")

/** lint */
const lintTs = (): void => {
  return gulp.src(lintSrc, { base: "./src", since: gulp.lastRun(lintTs) })
    .pipe(changedInPlace())
    .pipe(gulpTslint({
      program: tslintProgram,
      formatter: "stylish",
    }))
    .pipe(gulpTslint.report({
      summarizeFailureOutput: true,
      allowWarnings: true,
    }))
}

exports.lintTs = lintTs

/* ************************ html ******************************* */

/**  原本 ModifiedTime 基础上再检查 gulpfile 的修改时间 */
function hasChanged(stream: any, sourceFile: any, targetPath: string): Promise<void> {
  return new Promise((resolve: any, reject: any): void => {
    fs.stat(targetPath, (err, targetStat) => {
      if (err) { return reject(err) }
      resolve(targetStat)
    })
  }).then((targetStat: any) => {
    const fileChanged = sourceFile.stat && sourceFile.stat.mtime > targetStat.mtime
    if (gulpHasChanged || fileChanged) {
      stream.push(sourceFile)
    }
  })
}

const pageWrapper = lazypipe()
  // 如果page-wrapper 包 formid-collector, page-wrapper 就用不了自定义slot
  // tslint:disable: max-line-length
  .pipe(header, `
    <page-wrapper customFail="{{customFailPage}}" status="{{pageStatus}}" statusCode="{{pageStatusCode}}" failMessage="{{failMessage}}" errorTips="{{errorTips}}" isDataListLoading="{{isDataListLoading}}" hideNavbar="{{pageWrapperHideNavbar}}" showBackHomeButton="{{showBackHomeButton}}" backgroundColor="{{customPageWrapBackgroundColor}}" pageWrapperRequestErrorMsg="{{pageWrapperRequestErrorMsg}}" isTopTipsUseCoverView="{{isTopTipsUseCoverView}}" bind:retry="handleRetryLoadData" bind:backPersonHome="handleBackPersonHome">
  `)
  .pipe(footer, `
    </page-wrapper>
  `)

/** 编译 art */
const art = (): any => {
  // 1. 监听 *.art 包括 template
  // 2. 只处理 *.art 不包括 template
  return gulp.src(artSrc.concat(`!${srcDir}/**/*.template.art`), { base: "./src", since: gulp.lastRun(art) })
    // 只要有文件通过就处理 *.art
    .pipe(changed(distDir, { extension: ".wxml", hasChanged }))
    // 补上过滤掉的 *.art, 过滤无需编译的文件
    .pipe(env === "dev" ? gulp.src(artSrc.concat(`!${srcDir}/**/*.template.art`), { base: "./src" }) : noop())
    .pipe(template({}, {
      minimize: true,
      // htmlMinifierOptions: {
      //   removeComments: true,
      //   ignoreCustomComments: [/desc:/],
      // },
      cache: true,
    }, {
      ext: ".wxml",
      // 小程序，art 不能使用标准语法的 {{}}
      standardRule: /{{%([@#]?)[ \t]*(\/?)([\w\W]*?)[ \t]*%}}/,
    }))
    .pipe(stripComments())
    .pipe(pageWrapper())
    .pipe(gulp.dest(distDir))
}

/** 编译 page wxml */
const pageWxml = (): any => {
  return gulp.src(pageWxmlSrc, { base: "src", since: gulp.lastRun(pageWxml) })
    .pipe(changed(distDir, { hasChanged }))
    .pipe(pageWrapper())
    .pipe(stripComments())
    .pipe(gulp.dest(distDir))
}

/** 编译 组件 wxml */
const componentWxml = (): any => {
  return gulp.src(componentWxmlSrc, { base: "src", since: gulp.lastRun(componentWxml) })
    .pipe(changed(distDir))
    .pipe(stripComments())
    .pipe(gulp.dest(distDir))
}

/** 处理 wxml */
const wxml = gulp.parallel(pageWxml, componentWxml)

/* ************************ css ******************************* */

const less = (): any => {
  return gulp.src(lessSrc, { base: "src", since: gulp.lastRun(less) })
    .pipe(changed(distDir, { extension: ".wxss", hasChanged }))
    // 引用公共变量
    .pipe(header('@import (reference) "src/styles/variables.less";\n'))
    .pipe(lessCompiler({
      plugins: [
        cleanCss,
      ],
      globalVars: {
        imgUrl: `"${getConfig().resHost}/ss/app/image"`,
      },
    }))
    // 改引用路径后缀
    .pipe(replace(/@import\s*['"](.*)\.\s*less\s*['"]\s*;/g, "@import '$1.wxss';"))
    // 改文件后缀
    .pipe(rename({ extname: ".wxss" }))
    .pipe(gulp.dest(distDir))
}

/* ************************ copy ******************************* */

/** 复制不需编译的文件 */
const copySrc = (): any => {
  return gulp.src(srcCopyList, { base: "src", since: gulp.lastRun(copySrc) })
    .pipe(changed(distDir))
    .pipe(gulp.dest(distDir))
}
/** 复制rxjs 并且更正 tslib 路径 */
const copyLib = (): any => {
  return gulp.src(libCopyList, { base: ".", since: gulp.lastRun(copyLib) })
    .pipe(filter(["**", `!${rxjsDist}/**/*.js`]))
    .pipe(changed(distDir))
    // .pipe(replace('"tslib"', (match: any, __absolutePath__: any): string => {
    //   const from = changeSep(__absolutePath__)
    //   const to = changeSep(`${__dirname}/vendors`)
    //   const upper = `..${path.sep}`
    //   return `"${changeSep(path.relative(from, to).replace(upper, "") + "/tslib")}"`
    // }))
    .pipe(gulp.dest(distDir))
}

const copy = gulp.parallel(copySrc, copyLib)

/* ************************ config ******************************* */

/** 复制 小程序开发者工具配置 */
const PROJECT_PATH = "project.config.json"
const copyWxProjectConfig = (cb: any): any => {
  if (fs.existsSync(PROJECT_PATH)) {
    // 覆盖自定义的 project.config.json: packOptions appid miniprogramRoot compileType
    const projectConfig = require("./_project.config.json")
    return gulp.src([PROJECT_PATH, "_project.config.json"])
      .pipe(mergeJson({
        fileName: PROJECT_PATH,
        endObj: {
          packOptions: projectConfig.packOptions,
          // appid: projectConfig.appid,
          miniprogramRoot: projectConfig.miniprogramRoot,
          compileType: projectConfig.compileType,
        },
      }))
      .pipe(gulp.dest("./"))
  } else {
    return gulp.src(["./_project.config.json"])
      .pipe(rename(PROJECT_PATH))
      .pipe(gulp.dest("./"))
  }
}

/** 复制合并后的小程序开发者工具配置到dist，必须在copyWxProjectConfig后执行 */
const copyWxProjectConfigToDist = (): any => {
  const DIST_PRJ_CONFIG = `./dist/${PROJECT_PATH}`
  return gulp.src(fs.existsSync(DIST_PRJ_CONFIG) ? [PROJECT_PATH, DIST_PRJ_CONFIG] : PROJECT_PATH)
    .pipe(mergeJson({
      fileName: PROJECT_PATH,
      endObj: {
        miniprogramRoot: "",
      },
    }))
    .pipe(gulp.dest(distDir))
}

// 放在这里保持缓存
let customJson: object
let mainJson: object
/** 编译出 config.js config.wxs 导出对应环境的配置 */
const compileConfig = (): any => {

  const reg = /=\s*(\{[\s\S]+\})/

  return gulp.src(configPath, { since: gulp.lastRun(compileConfig) })
    .pipe(filter([env === "dev" ? "**/config.+(dev|custom).ts" : `**/config.${env}.ts`]))
    .pipe(through.obj((chunk: BufferFile, _: any, cb: any) => {
      if (!chunk) { return cb() }
      // transform
      const content = chunk.contents.toString()
      const matcher = content.match(reg)![1] || "{}"
      const configJson = JSON5.parse(matcher)
      if (chunk.path.indexOf("custom") > -1) {
        customJson = configJson
        return cb()
      } else {
        mainJson = configJson
        return cb()
      }
    }, function flush(this: any, cb: any): void {
      // flush
      const destConfig = Object.assign({}, mainJson, customJson || {})
      const dest = `module.exports.config = ${JSON.stringify(destConfig)}`
      this.push(new Vinyl({
        path: path.resolve(__dirname, "config.js"),
        contents: Buffer.from(dest),
      }))
      cb()
    }))
    .pipe(gulp.dest(`${distDir}/environments`))
    .pipe(rename({ extname: ".wxs" }))
    .pipe(gulp.dest(`${distDir}/pages/wxs`))
}

const config2wxs = gulp.series(
  ...(env === "dev"
    ? [copyWxProjectConfig, copyWxProjectConfigToDist, compileConfig]
    : [copyWxProjectConfig, compileConfig]),
)
exports.config2wxs = config2wxs

/* ************************ misc ******************************* */

/** 清空dist，build 的时候执行 */
const clean = (cb: any): any => {
  return del([distDir], cb)
}
exports.clean = clean

/** 默认任务 */
const defaultTask = gulp.series(
  routeService,
  gulp.parallel(
    config2wxs,
    lintTs,
    ts,
    monoTs,
    less,
    art,
    copy,
    wxml,
  ),
  function recordGulpfileModify(cb: any): void {
    // 完整跑完一次才记录时间
    if (gulpHasChanged) {
      fs.writeFile(RECORD_TIME_FILE, currentModifyTime + "", () => {})
      gulpHasChanged = false
    }
    cb()
  },
  removeEmptyDepsInModels,
)

exports.default = defaultTask

/** 重新编译 */
exports.build = gulp.series(
  clean,
  defaultTask,
)

/**
 * 监听列表
 * [路径, 任务func, 监听删除 生成后的扩展名(不变 "")(不监听删除 false)]
 */
const watchMap: Array<[string[], any, string?]> = [
  [routeServiceSrc.concat(appJsonSrc), routeService],
  [tsSrc, ts, "js"],
  [monoTsSrc, monoTs, "js"],
  [lintSrc, lintTs],
  [srcCopyList, copySrc, ""],
  [libCopyList, copyLib, ""],
  [lessSrc.slice(0, 1), less, "wxss"],
  [configPath, config2wxs],
  [artSrc, art, "wxml"],
  [pageWxmlSrc.slice(0, 1), wxml, ""],
]

/** 监听任务 */
exports.watch = gulp.series(
  defaultTask,
  function watchAll(): void {
    watchMap.forEach((task) => {
      const watchTask = gulp.watch(task[0], gulp.series(task[1]))
      // 注册删除监听 没第三个参数就不用监听
      if (typeof task[2] !== "string") { return }
      watchTask.on("unlink", (filePath: string) => {
        // 适配构建后的文件名
        const renameFilePath = task[2]
          ? filePath.replace(/\..+?$/, "." + task[2])
          : filePath
        console.log("del file path:", renameFilePath)
        const filePathFromSrc = path.relative(path.resolve(srcDir), renameFilePath)

        const destFilePath = path.resolve(distDir, filePathFromSrc)

        del.sync(destFilePath)
      })
    })
  },
)
// tslint:disable-next-line: max-file-line-count
