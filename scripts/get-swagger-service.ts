// TODO: 需要安装adm-zip
import { request, RequestOptions } from "http"
import { writeFileSync, readdirSync } from "fs"
import { resolve } from "path"
import * as admZip from "adm-zip"
import { move, remove } from "fs-extra"

const swaggerUrl = "https://petstore.swagger.io/v2/swagger.json"

const downLoadService = (jsonUrl: string): void => {

  let buffer = Buffer.alloc(0)

  const postData = JSON.stringify({
    json_url: jsonUrl,
    lang: "typescript-angular",
  })

  const postOptions: RequestOptions = {
    host: "codegen.c668cd7995c9e420690c4d19a9fde2748.cn-shanghai.alicontainer.com",
    port: 80,
    path: "/swagger-codegen",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  }

  const postReq = request(postOptions, (res: any) => {
    res.on("data", (chunk: any) => {
      buffer = Buffer.concat([buffer, chunk])
    })

    res.on("end", () => {
      writeFileSync(`${__dirname}/buffer.zip`, buffer)
    })
  })

  postReq.write(postData)
  postReq.end()
}

downLoadService(swaggerUrl)
