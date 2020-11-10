import { config } from "../packages/mini/src/environments/config.dev"

/**
 * swagger配置
 */
export interface ISwaggerConfig {
  /** swagger最终拉取地址 */
  url?: string,
  /** swagger标识符，为生成的文件夹名称 */
  name: string,
  /** swagger json默认地址 */
  defaultUrl: string,
  /** swagger拉取地址在config文件的配置key */
  keyInConfigFile?: string,
}

/**
 * 区分主流程的tag
 * **该tag同名文件夹**下的swagger.json生成的service，位于`mono-shared/src/swagger-service`
 * 其余tag的生成于`mono-shared/src/other-business-swagger-service`
 */
export const MAIN_BUSINESS_NAME = "normal"

const env = process.env.NODE_ENV || "dev"
const configSettings = require(`../packages/mini/src/environments/config.${env}`)
try {
  if (env === "dev") {
    const customConfig = require("../packages/mini/src/environments/config.custom")
    Object.assign(configSettings.config, customConfig.config)
  }
} catch (err) { }

const gatewaySwaggerHost = configSettings.config.gatewaySwaggerHost

const reportSwaggerHost = "https://col.qunjielong.com"

export const swaggerFromUrls: ISwaggerConfig[] = [
  // 主流程
  {
    defaultUrl: "http://8089.office.qunjielong.com/v2/api-docs",
    name: MAIN_BUSINESS_NAME,
    keyInConfigFile: "swaggerHost",
  },
  // 增值服务——服务商
  {
    name: "gateway-agent",
    // defaultUrl: "http://18080.office.qunjielong.com/agent/v2/api-docs",
    defaultUrl: `${config.agentHost}/agent/v2/api-docs`,
  },
  {
    name: "log",
    // defaultUrl: "http://8384.office.qunjielong.com/v2/api-docs",
    defaultUrl: `${reportSwaggerHost}/v2/api-docs`,
  },
]
