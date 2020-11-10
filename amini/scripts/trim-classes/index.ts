const fs = require("fs")

// export const trimClasses = (f: string, t: string) => {
export const trimClasses = (content: string) => {
  // const content = fs.readFileSync(f, 'utf-8')
  const classesMap = {}
  let i = 0
  const ret = content.replace(/(\w+)\.prototype\.(\w+)\s?=\s?function\s?/g, (a: string, b: string, c: string) => {
    let prefix = ""
    if (!classesMap[b]) {
      classesMap[b] = '$' + i
      prefix = `var ${classesMap[b]} = ${b}.prototype;\n`
      i++
    }
    return prefix + `${classesMap[b]}.${c} = function`
  })
  // fs.writeFileSync(t, ret)
  return ret
}

// trimClasses("./eg.js", "gen.js")
