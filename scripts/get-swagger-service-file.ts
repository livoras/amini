import { get } from "http"
import { writeFileSync, createReadStream, createWriteStream, mkdirSync, existsSync } from "fs"
import { resolve } from "path"
import { get as httpsGet } from "https"
import { ISwaggerConfig, swaggerFromUrls } from "./swagger-config"
const request = require("request")

let swaggerUrls: ISwaggerConfig[] = []
try {
  const env = process.env.NODE_ENV || "dev"
  const config = require(`../packages/mini/src/environments/config.${env}`)
  try {
    if (env === "dev") {
      const customConfig = require("../packages/mini/src/environments/config.custom")
      Object.assign(config.config, customConfig.config)
    }
  } catch (err) { }
  swaggerUrls = swaggerFromUrls.map((swaggerConfigItem: ISwaggerConfig): ISwaggerConfig => {
    swaggerConfigItem.url = swaggerConfigItem.keyInConfigFile && config.config[swaggerConfigItem.keyInConfigFile]
      ? config.config[swaggerConfigItem.keyInConfigFile].includes("?")
        ? config.config[swaggerConfigItem.keyInConfigFile]
        : `${config.config[swaggerConfigItem.keyInConfigFile]}/v2/api-docs`
      : swaggerConfigItem.defaultUrl
    return swaggerConfigItem
  })
} catch (error) {
  console.error(error)
}
const downloadJSON = (url: string, fileTag: string= ""): void => {
  console.log("downloading", fileTag, url)
  const funcs = [get, httpsGet]
  const index = url.indexOf("https") === -1 ? 0 : 1
  funcs[index](url, (res) => {
    let str = ""
    res.setEncoding("utf-8")
    res.on("data", (chunk) => { str += chunk })
    res.on("end", () => {
      console.log("downloaded", fileTag, url, res.statusCode)
      const targetDir = `${__dirname}/${fileTag}`
      if (!existsSync(targetDir)) {
        mkdirSync(targetDir)
      }
      const filePath = resolve(`${targetDir}/swagger.json`)
      writeFileSync(filePath, str)
      downloadService(filePath, fileTag)
    })
  })
}

const downloadService = (filePath: string, fileTag: string= ""): void => {
  const postData = createReadStream(filePath)
  const r = request.post(
    "http://192.168.0.144:2333/swagger-codegen-file",
    // "http://2333.office.qunjielong.com/swagger-codegen-file",
    // "http://swaggergen.office.qunjielong.com:8888/swagger-codegen-file",
  )
  const form = r.form()
  form.append("swagger", postData)
  r.pipe(
    createWriteStream(resolve(`${__dirname}/${fileTag}/buffer.zip`))
      .on("close", () => {
        swaggerFromUrls.shift()
        if (swaggerFromUrls.length > 0) {
          downloadJSON(swaggerFromUrls[0].url!, swaggerFromUrls[0].name)
        }
      }),
  )
}

// swaggerFromUrls.forEach((swaggerConfig) => {
//   downloadJSON(swaggerConfig.url!, swaggerConfig.name)
// })
downloadJSON(swaggerFromUrls[0].url!, swaggerFromUrls[0].name)
