import { Observable, Subject } from "rxjs"
import { SuperSetData } from "./SuperSetData"
import { config } from "@config"
import { IGlobalData } from "@/app"

/**
 * 组件关系类型
 * [SuperComponent组件用 interface]
 */
interface IWxComponentEmitOpts {
  bubbles?: boolean,
  composed?: boolean,
  capturePhase?: boolean,
}
/**
 * 组件关系类型
 * [SuperComponent组件用 类型]
 */
export type componentRelationType = "child" | "parent" | "ancestor" | "descendant"

/**
 * 组件关系类型
 * [SuperComponent组件用 类型]
 */
type propType = NumberConstructor | StringConstructor | BooleanConstructor | ObjectConstructor | ArrayConstructor | null

/** 组件的属性定义类型 */
export interface IComponentProp<Data> {
  /** key: Class 定义属性 */
  [prop: string]: {
    /** 类型 */
    type: propType,
    /** 默认值 */
    value?: any,
    // TODO: 怎么可以定义 this 为子类
    /** 监听器 */
    observer?: (this: SuperComponent<Data>, newValue: any, oldValue: any, path: string) => void,
  } | propType,
}

export interface IBaseComponentData {
  /** 图片资源路径 */
  resHost: string,
  /** 上传图片路径 */
  uploadHost: string,
  /** navbar 高度 */
  navHeight: number
  /** 是否iphonex */
  isIPhoneX: boolean
  /** 系统 */
  system: "ios" | "android"
}

/**
 * 小程序组件基类
 * 最新的依赖注入框架可以使组件也能够初始化非官方属性
 */
export class SuperComponent<T> extends SuperSetData<T> implements Component.ComponentInstance<T> {
  public data: T = {} as T
  protected unloadObservable?: Observable<any>
  private unloadSubject?: Subject<any>

  constructor() {
    super()
  }

  public created(): void {
    const app = getApp() as App.AppInstance<{}> & { globalData: IGlobalData }
    this.unloadSubject = new Subject<any>()
    this.unloadObservable = this.unloadSubject.asObservable()
    // created 里面 setData 无效，如果不加setTimeout数据就渲染不出来
    setTimeout(() => {
      this.setData({
        resHost: config.resHost,
        uploadHost: config.uploadHost,
        navHeight: app.globalData.navHeight,
        system: app.globalData.system,
        isIPhoneX: app.globalData.isIPhoneX || false,
      } as any)
    })
  }

  public attached(): void {}

  public ready(): void {}

  public detached(): void {
    if (this.unloadSubject) {
      this.unloadSubject.next()
    }
  }
  /** 触发事件 */
  public triggerEvent(event: string, data?: any, opts?: IWxComponentEmitOpts): void { }
  /** 获取关系组件的节点，path 是组件的相对路径 */
  public getRelationNodes(path: string): any { }
}

/** 全部属性都变为 string 类型 */
export type AllString<T> = {
  [P in keyof T]: string
}

/**
 * [SuperComponent组件用 类型]
 */
type getPropType<T> = {
  [P in keyof T]: T[P] extends { type: propType } ? T[P]["type"] : T[P]
}

/**
 * [SuperComponent组件用 类型]
 */
type mapConstructor<T> = {
  [P in keyof T]: T[P] extends NumberConstructor ? number
  : T[P] extends StringConstructor ? string
  : T[P] extends BooleanConstructor ? boolean
  : T[P] extends ObjectConstructor ? object
  : T[P] extends ArrayConstructor ? any[]
  : null
}

/**
 * 获取组件定义属性字面量的类型
 * [TODO: 如何根据字面量获取类型（keyof 获取到key），即使字面量写上了索引类型（现在keyof 只获取到索引类型）]
 * [SuperComponent组件用 类型]
 */
export type getPropertiesType<P> = Partial<mapConstructor<getPropType<P>>>

/** 获取组件 已混合 自定义数据类型 与 参数字面量类型 的 Data 类型 */
export type getComponentData<CustomData, Properties> = CustomData
  & Pick<
    getPropertiesType<Properties>,
    // 去掉已经定义在CustomData 里更详细的字段
    Exclude<keyof getPropertiesType<Properties>, keyof CustomData>
  >
