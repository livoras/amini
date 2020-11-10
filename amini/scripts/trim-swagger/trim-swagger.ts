const fs = require("fs")

const parseArgs = (funcStr: string): string[] => {
  const f = funcStr.match(/function\s?\(([\s\S]+?)\)/)
  if (!f) { return [] }
  const argStr = f[1]
  const args = argStr.split(",").map((s) => s.trim()).filter((s) => !!s && s !== "options")
  return args
}

const parseFuncName = (funcStr: string): string => {
  return funcStr.match(/\.prototype\.(\w+)/)![1]
}

const parseRequireArgs = (funcStr: string): string[] => {
  const caps = funcStr.match(/if\s?\((\w+)\s?===\s?null\s?\|\|\s?(\w+)\s?===\s?undefined\)\s?\{/g)
  if (!caps)  { return [] }
  return caps.map((argStr) => {
    const argName = argStr.match(/if\s?\((\w+)\s?===\s?null\s?\|\|\s?(\w+)\s?===\s?undefined\)\s?\{/)![1]
    return argName
  })
}

const parseUrl = (funcStr: string): string => {
  const caps = funcStr.match(/this\.httpClient\.[\w]+\(([\s\S]+?)\,/)
  let raw: string[] = []
  try {
    raw = caps![1].split("+")
  } catch (error) {
    console.log(funcStr)
  }
  const args: string[] = []
  let url  = ""
  raw.forEach((s) => {
    s = s.trim().replace(/"/g, '')
    const cap = s.match(/encodeURIComponent\(String\((\w+?)\)\)/)
    if (!cap) {
      url += s
    } else {
      url += `{{${cap[1]}}}`
    }
  })
  return url
}

const httpNamesMap = {
  "GET": "g",
  "POST": "p",
  "UPDATE": "u",
  "DELETE": "d",
  "PUT": "t",
  "HEAD": "h",
  "OPTIONS": "o",
  "PATCH": "c",
}

const restoreRequiredArgs = (args: string[], r: number) => {
  const ret = []
  let i = args.length - 1
  while (r > 0) {
    const isRequired = (r & 1) > 0
    if (isRequired) { ret.unshift(args[i]) }
    r = r >> 1
    i--
  }
  return ret
}

export const trimSwagger = (content: string): string => {
// const content = fs.readFileSync(f, "utf-8")
let isFirstReplace = true
let serviceName = ''

const getUtilStr = () => {
  if (!isFirstReplace) { return "" }
  isFirstReplace = false
  return `
    const { g, p, u, d, t, h, o, c } = core_1.mhttp(${serviceName}.prototype);
    `
}

const makeServiceName = (a: string) => {
  serviceName = a.match(/(\w+)\.prototype/)![1]
}

const getPartitialR = (args: string[], partitials: string[]): number => {
  const p = new Set(partitials)
  let r = 0
  args.forEach((a) => {
    if (p.has(a)) {
      r = r << 1 | 1
    } else {
      r = r << 1 | 0
    }
  })
  return r
}

const replacePathVariablesToIndex = (path: string, args: string[]): string => {
  args.forEach((s, i) => {
    path = path.replace(new RegExp(`\\{\\{${s}\\}\\}`, 'g'), `$${i}`)
  })
  return path
}

const caps = content.replace(/\w+\.prototype\.[\s\S]+?Using[\s\S]+?return[\s\S]+?\};/g, (a: string) => {
  makeServiceName(a)
  const args = parseArgs(a)
  const funcName = parseFuncName(a)
  const url = replacePathVariablesToIndex(parseUrl(a), args)
  const parseName = funcName.match(/(\w+)?Using([a-zA-Z]+)(\d*)/)
  if (!parseName) {
    throw new Error(`Swagger 函数名分析失败 ${funcName}`)
  }
  const coreName = parseName[1]
  const method = parseName[2]
  const num = parseName[3]
  const m = httpNamesMap[method]
  if (!m) {
    throw new Error(`未找到对应的 http 方法 ${method}`)
  }
  const requiredArgs = parseRequireArgs(a)
  const r = getPartitialR(args, requiredArgs)
  const restoreRequired = restoreRequiredArgs(args, r)
  console.assert(JSON.stringify(restoreRequired) === JSON.stringify(requiredArgs), "必要参数要一致", funcName)
  // console.log("========== Function Name ==========", funcName)
  // console.log("url --> ", url)
  // console.log("args => ", args)
  // console.log("required args => ", requiredArgs)
  // console.log("core name -> ", coreName)
  // console.log("method -> ", method)
  // console.log("require n -> ", r)
  // console.log("========================================")
  return `${getUtilStr()}${m}('${num ? num + ":" : ""}${url}', '${coreName}'${args.length > 0 ? "," + JSON.stringify(args) : ""}${r === 0 ? '' : ', ' + r});`
})
return caps

}

// const f = "./swagger.js"
// const t = "./gen.js"
// trimSwagger(f, t)
// console.log(caps)
