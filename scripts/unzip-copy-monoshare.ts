import { move, remove, copyFileSync, ensureDirSync, createFileSync, removeSync } from "fs-extra"
import * as admZip from "adm-zip"
import { resolve, relative, sep } from "path"
import { readdirSync, statSync, existsSync, writeFileSync } from "fs"

/**
 * 区分主流程的tag
 * **该tag同名文件夹**下的swagger.json生成的service，位于`mono-shared/src/swagger-service`
 * 其余tag的生成于`mono-shared/src/other-business-swagger-service`
 */
export const MAIN_BUSINESS_TAG = "normal"
const OTHER_BUSINESS_SWAGGER_DIRECTORY_NAME = "other-business-swagger-service"
const OTHER_BUSINESS_SWAGGER_DIRECTORY = resolve(
  `${__dirname}/../packages/mono-shared/src/${OTHER_BUSINESS_SWAGGER_DIRECTORY_NAME}`,
  )

ensureDirSync(`${OTHER_BUSINESS_SWAGGER_DIRECTORY}/services`)
// 拷贝share-http-client.services
const copyServicesRelativePath = relative(
  `${OTHER_BUSINESS_SWAGGER_DIRECTORY}/services`,
  `${__dirname}/../packages/mono-shared/src/services`,
).replace(new RegExp(`\\${sep}`, "g"), "/")
/** share-http-client.services 文件内容 */
const shareClientFileContent = `export { ShareHttpClient } from "${copyServicesRelativePath}/share-http-client.service"`
/** share-http-client.services 文件名 */
const shareClientFileName = "share-http-client.service.ts"
/** share-http-client.services 文件路径 */
const shareClientFilePath = `${OTHER_BUSINESS_SWAGGER_DIRECTORY}/services/${shareClientFileName}`

const unzip = (fileTag: string): void => {
  const zip = new admZip(`${__dirname}/${fileTag}/buffer.zip`)
  zip.extractAllTo(`${__dirname}/${fileTag}/test`, /*overwrite*/true)
  copy(fileTag)
}

const copy = (fileTag: string): void => {
  const path = resolve(`${__dirname}/${fileTag}/test`)
  const dir = readdirSync(path)[0]
  const dirPath = resolve(`${__dirname}/${fileTag}/test/${dir}`)
  remove(`${dirPath}/configuration.ts`)
  remove(`${dirPath}/encoder.ts`)
  remove(`${dirPath}/variables.ts`)
  remove(`${dirPath}/api.module.ts`)
  remove(`${dirPath}/index.ts`)
  const pathMonoShare = fileTag === MAIN_BUSINESS_TAG
  ? resolve(`${__dirname}/../packages/mono-shared/src/swagger-service`)
  : resolve(`${OTHER_BUSINESS_SWAGGER_DIRECTORY}/${fileTag}`)
  // mkdirSync(pathMonoShare)
  move(dirPath, pathMonoShare, (err) => {
    if (err) {
      console.log(fileTag, err)
      return console.error(err)
    }
    // remove(`${__dirname}/${fileTag}/test/`).then(() => {} , (error) => console.log(error))
    // remove(`${__dirname}/${fileTag}/buffer.zip`).then(() => {} , (error) => console.log(error))
    // remove(`${__dirname}/${fileTag}/swagger.json`).then(() => {} , (error) => console.log(error))
    remove(`${__dirname}/${fileTag}/`).then(() => {} , (error) => console.log(error))
    console.log(fileTag, "success!")
  })
}

removeSync(resolve(`${__dirname}/../packages/mono-shared/src/swagger-service`))
removeSync(OTHER_BUSINESS_SWAGGER_DIRECTORY)
readdirSync(__dirname).forEach((currentFileName: string) => {
  const currentFilePath = resolve(`${__dirname}/${currentFileName}`)
  if (statSync(currentFilePath).isDirectory()) {
    unzip(currentFileName)
    if (!existsSync(shareClientFilePath)) {
      try {
        createFileSync(shareClientFilePath)
        writeFileSync(shareClientFilePath, shareClientFileContent)
      } catch {
        process.exitCode = 1
        throw new Error("create swagger service fail")
        // 读取失败就退出，不用跑后面的程序了
      }
    }
  }
})
