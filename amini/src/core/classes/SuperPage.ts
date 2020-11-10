import { SuperSetData } from "./SuperSetData"
import { Observable, Subject, timer } from "rxjs"
import { takeUntil } from "rxjs/operators"
import { HttpClient } from "@core/services/http-client.service"
import { config } from "@config"
import { IGlobalData, StorageKey } from "@/app"
import { getInstanceByServiceOrCacheIfNotExist, mixinInjectorSymbol } from "@angular/core"
import { wxlog } from "@core/decorators/qjl-wxlog"
import { UtilService } from "@core/services/util.service"
import { PerformanceMonitorId } from "@core/services/monitor-id.interfaces"
import { PerformanceMonitorService } from "@core/services/performance-monitor.service"
import { Computed } from "./computed"
import { mixin } from "@mono-shared/utils/mixin"
import { IReportEventParams } from "@core/amini/report-event"

/** 页面状态 */
export const enum PAGE_STATUS {
  /** 加载中，显示加载动画 */
  LOADING = "LOADING",
  /** 加载成功，显示正常页面 */
  SUCCESS = "SUCCESS",
  /** 加载失败，显示失败重试页面 */
  FAIL = "FAIL",
}

const ignoreSceneCodeArr = [
  /** 微信爬虫 */
  1129,
  /** 浮窗进入 */
  1131,
]

export interface IBasePageData {
  /** 图片资源路径 */
  resHost: string,  /** 上传图片路径 */
  uploadHost: string,
  /** navbar 高度 */
  navHeight: number
  /** 是否 iphonex */
  isIPhoneX: boolean
  /** 系统 */
  system: "ios" | "android"
  /** 小程序名称 */
  appName: string
  /** 页面的状态 */
  pageStatus: PAGE_STATUS
  /** 页面状态码 （就是后端返回的httpCode） */
  pageStatusCode: number
  /** 自定义错误样式 */
  customFailPage: boolean
  /** 加载失败的提示语 */
  failMessage: string
  /** 是否显示 dataList 加载时 底部动画 */
  isDataListLoading: boolean
  /** 错误提示 */
  errorTips: string
  /** 错误页隐藏标题栏 */
  pageWrapperHideNavbar: boolean
  /** 错误页显示 返回首页 按钮 */
  showBackHomeButton: boolean
  /** 隐藏动画 */
  isHiddenAnimate: boolean
  /** */
  url: string
  /** 背景颜色自定义设置 */
  customPageWrapBackgroundColor?: string
  /** 是否显示coverView圆角 */
  isCoverViewRadius?: boolean
}

const monitor: PerformanceMonitorService = getInstanceByServiceOrCacheIfNotExist(PerformanceMonitorService)
let isSetLaunchToLoadTime = false
let loadedCount: number = 0

/**
 * Page 基类
 */
export class SuperPage<T> extends SuperSetData<T | IBasePageData, T & IBasePageData> implements Page.PageInstance {

  // 微信page中的API 输入选择器 获取对应的组件实例（第一个）
  public selectComponent!: (selector: string) => any

  // 微信page中的API 输入选择器 获取对应的组件实例数组
  public selectAllComponents!: (selector: string) => any[]

  public isIgnoreParamsReport: boolean = false

  public loadParamsCache?: string

  /** 用于判断页面是否隐藏 */
  public isHideInSuperPage: boolean = false
  public url: string = ""

  protected unloadObservable!: Observable<void>

  protected animate!: any
  private unloadSubject!: Subject<void>
  private loadOption: any
  private http: HttpClient
  private utilInSuperPage: UtilService
  private isOpenLoadParamsGroupIdAndActIdControl: boolean = false
  /** 是否第一次onShow */
  private isFirstTimeOnShow: boolean = true
  /** 是否停止标记请求错误展示 */
  private isStopMarkRequest: boolean = false
  constructor() {
    super()
    this.http = getInstanceByServiceOrCacheIfNotExist(HttpClient)
    this.utilInSuperPage = getInstanceByServiceOrCacheIfNotExist(UtilService)
  }

  public onLoad(opt?: any): void {
    const mixinProps = (this as any).__mixin_props__
    mixinProps.forEach((k: string) => this[k] = this)
    delete (this as any).__mixin_props__

    this.mergeComputed()
    this.bindingUnloadObservable()
    this.makeRoute()
    if (!this.isNav()) {
      monitor.timeEnd("开始 onLaunch -> 开始 onLoad 时间")
      monitor.timeStart("开始 onLoad -> 结束 onShow 的数据加载白屏时间", 2004)
      loadedCount++
    }
    this.loadOption = opt
    this.addLoadParamsGroupIdAndActIdControl(this.loadOption)
    const app = getApp() as App.AppInstance<{}> & { globalData: IGlobalData }
    this.setData({
      resHost: config.resHost,
      uploadHost: config.uploadHost,
      appName: config.appName,
      navHeight: app.globalData.navHeight,
      system: app.globalData.system,
      // pageStatus: PAGE_STATUS.LOADING,
      isIPhoneX: app.globalData.isIPhoneX || false,
    } as any)
    const hasNoHeaderImg = app.globalData.hasNoHeaderImg
    if (hasNoHeaderImg) {
      // 删除无头像标记，防止无限跳页
      delete app.globalData.hasNoHeaderImg
      wx.navigateTo({
        url: "/pages/authorization/authorization?backToPrevPage=true",
      })
      return
    }
    if (this.loadOption && this.loadOption.pageStatusSuccess) {
      this.setPageStatus(PAGE_STATUS.SUCCESS, 200)
    } else {
      this.setPageStatus(PAGE_STATUS.LOADING, 0)
    }
    /** 需要流畅切换页面场景
     * @param hideWrapper 隐藏页面载入时的空白页
     * 使用说明： 如页面需要使用此功能，则跳转到该页面时在页面参数内加上 hideWrapper = true
     */
    if (!(this.loadOption && this.loadOption.hideWrapper)) {
      this.http.startMarkRequestNeedWaited()
    }

    if (this.computed) {
      try {
        this.computedInstance = new Computed(this)
      } catch (e) {
        monitor.sum("page computed error")
        throw e
      }
    }
  }

  public onReady(): void { }

  // tslint:disable-next-line: cognitive-complexity
  public onShow(): void {
    this.isHideInSuperPage = false
    this.setData({ isCoverViewRadius: true })
    const isPageFail = (this.data as IBasePageData).pageStatus === PAGE_STATUS.FAIL
    // if (this.loadOption.isShowCustomeFailMsg) { return }
    if (!this.isFirstTimeOnShow && isPageFail) { return }
    this.isFirstTimeOnShow = false
    this.clearLoadParamsGroupIdAndActIdControl(this.loadOption)
    if (!(this.loadOption && this.loadOption.hideWrapper)) {
      this.http.startMarkRequestNeedWaited()
    }
    setTimeout(() => {
      this.http.endMarkRequestNeedWaited()
        .pipe(
          takeUntil(this.unloadObservable),
        )
        .subscribe(
          (res) => {
            this.setPageStatus(PAGE_STATUS.SUCCESS, 200)
            this.onAllDataLoaded()
            if (!this.isNav()) {
              monitor.timeEnd("开始 onLoad -> 结束 onShow 的数据加载白屏时间")
              if (!isSetLaunchToLoadTime) {
                isSetLaunchToLoadTime = true
                monitor.timeEnd("开始 onLaunch -> onLoad -> 结束 onShow 时间")
              }
            }
          },
          (err) => {
            const setFailMessage = (): void => {
              this.setPageStatus(PAGE_STATUS.FAIL, err.statusCode)
              this.setFailMessage(err.data && err.data.msg)
            }
            if (this.isNeedBreakOff()) { return }
            if (err.statusCode === 401) {
              //  401 不处理
              // wx.hideLoading({})
            } else if (err.statusCode === 403 && err.data && typeof err.data.data === "string") {
              setFailMessage()
              /** 用户时间查看页面错误时间 */
              const USER_CHECK_ERR_TIME = 1500
              timer(USER_CHECK_ERR_TIME).subscribe(() => {
                const url = "/" + err.data.data
                wx.redirectTo({ url })
              })
            } else {
              setFailMessage()
            }
          },
        )
    })
  }

  public onHide(): void {
    console.log("hide")
    this.isHideInSuperPage = true
    this.setData({ isCoverViewRadius: false })
  }

  public onUnload(): void {
    this.unloadSubject.next()
  }

  /**
   * 自定义生命周期:
   * 所有 标记 的数据初始加载完后触发，失败也算加载完
   * 如果数据在 onShow 加载，则每次 onShow 后触发一次
   * 如果没有标记任何需要等待的数据不会触发
   */
  public onAllDataLoaded(): void {
  }

  /** 收集 formid 成功, e.detail = {formId} */
  public handleFormIdCollectDone(e: WXEvent): void {
  }

  /** 数据加载失败后重试，默认执行一次 onLoad onShow, 可覆盖 */
  public handleRetryLoadData(): void {
    const opt = this.loadOption || {}
    const query = Object.keys(opt).reduce<string>((ret, key) => {
      return `${ret}${!ret ? "?" : "&"}${key}=${opt[key]}`
    }, "")
    wx.redirectTo({
      url: "/" + (this as any).__route__ + query,
    })
  }

  /** 返回个人首页 */
  public handleBackPersonHome(): void {
    wx.reLaunch({
      url: "/pages/homepage/customer-homepage/customer-homepage?navHome=1",
    })
  }

  /** 忽略下一次调用 groupId 或 actId 的上报 */
  public ignoreParamReport(): void {
    this.isIgnoreParamsReport = true
  }

  /** 使用前端的错误提示 */
  public stopMarkRequest(): void {
    this.isStopMarkRequest = true
  }

  /**
   * 创建动画 从小程序基础库 2.9.0 开始支持一种更友好的动画创建方式，用于代替旧的 wx.createAnimation 。它具有更好的性能和更可控的接口。
   * 参考文件地址：https://developers.weixin.qq.com/miniprogram/dev/framework/view/animation.html
   *
   * @private
   * @param {string} selector 选择器（同 SelectorQuery.select 的选择器格式）
   * @param {any[]} keyframes 关键帧信息
   * @param {number} duration 动画持续时长（毫秒为单位）
   * @param {() => void} [callback] 动画完成后的回调函数
   * @memberof SuperPage
   */
  public createAnimate(
    selector: string,
    keyframes: any[],
    duration: number,
    callback?: () => void,
  ): void {
    if (this.animate) {
      this.setData({ isHiddenAnimate: false } as any)
      this.animate(selector, keyframes, duration, callback)
    } else {
      this.setData({ isHiddenAnimate: true } as any)
    }
  }

  public customReport(params: IReportEventParams): void {
    this.utilInSuperPage.getApp().getReportEvent().customEventReport(params)
  }

  /** 7.0.15 安卓新功能 - 右上角收藏 */
  protected onAddToFavorites(): any {
    return {
      imageUrl: this.utilInSuperPage.apiImage("/sys/draw_share_image/gh_share"),
    }
  }

  /**
   * 返回mixin的类型，欺骗TS
   *
   * @protected createMixinObject
   * @memberof SuperPage
   */
  protected readonly createMixinObject: <MIXIN>() => MIXIN = () => mixinInjectorSymbol as any

  protected timeStart(id: string, wxReportId?: number): void {
    console.error("请使用 @PagePerfTrack() 来启动页面监控")
  }

  protected timeEnd(id: string): void {
    console.error("请使用 @PagePerfTrack() 来启动页面监控")
  }

  protected getLoadedCount(): number {
    return loadedCount
  }

  /** 设置页面状态 */
  protected setPageStatus(status: PAGE_STATUS, code?: number): void {
    this.setData({ pageStatus: status, pageStatusCode: code || 0 } as any)
  }

  /** 设置加载失败时显示的提示 */
  protected setFailMessage(msg: string = ""): void {
    this.setData({ failMessage: msg } as any)
  }

  /** 显示顶部红色错误提示 */
  protected setErrorTips(msg: string): void {
    this.setData({ errorTips: msg } as any)
  }

  /** page-wrapper 使用自定义错误样式 */
  protected toggleCustomFailPage(isCustom: boolean): void {
    this.setData({ customFailPage: isCustom } as any)
  }

  /** page-wrapper 使用自定义背景颜色 */
  protected handleChangePageBackgroundColor(color: string): void {
    this.setData({ customPageWrapBackgroundColor: color } as any)
  }

  /** 显示底部`加载中`的提示，一般用于列表触底加载 */
  protected showDataListLoading(): void {
    this.setData({ isDataListLoading: true } as any)
  }

  /** 隐藏底部`加载中`提示 */
  protected hideDataListLoading(): void {
    this.setData({ isDataListLoading: false } as any)
  }

  /** 隐藏 page-wrapper 的 navbar */
  protected hidePageWrapperNavbar(): void {
    this.setData({ pageWrapperHideNavbar: true } as any)
  }

  /** 错误页显示 返回首页 按钮 */
  protected showBackPersonHomeButton(): void {
    this.setData({ showBackHomeButton: true } as any)
  }

  /** 空白方法用于部分时候的，阻止冒泡 */
  protected noop(): void { }

  /** 添加actId和groupId的监控 */
  private addLoadParamsGroupIdAndActIdControl(opt: any): void {
    this.isOpenLoadParamsGroupIdAndActIdControl = true
    if (!opt) { return }
    this.loadParamsCache = { ...opt }
    opt.__actId__ = opt.actId
    opt.__groupId__ = opt.groupId
    Object.defineProperty(opt, "actId", {
      get: (): any => {
        this.reportLoadParams(opt.__actId__, "actId")
        return opt.__actId__
      },
      configurable: true,
    })
    Object.defineProperty(opt, "groupId", {
      get: (): any => {
        this.reportLoadParams(opt.__groupId__, "groupId", false)
        return opt.__groupId__
      },
      configurable: true,
    })
  }

  private reportLoadParams(reportParams: any, keyName: string, checkNum: boolean = true): void {
    if (this.isIgnoreParamsReport) {
      this.isIgnoreParamsReport = false
    } else {
      const enterScene = this.utilInSuperPage.getGlobalData("enterScene", true)
      const isIgnoreScene = ignoreSceneCodeArr.includes(Number(enterScene))
      if (isIgnoreScene) { return }
      if (checkNum) {
        this.report(keyName, reportParams)
      } else {
        this.reportString(keyName, reportParams)
      }
    }
  }

  //  关闭监控
  private clearLoadParamsGroupIdAndActIdControl(opt: any): void {
    if (!this.isOpenLoadParamsGroupIdAndActIdControl || !opt) { return }
    delete this.loadParamsCache
    this.isOpenLoadParamsGroupIdAndActIdControl = false
    delete opt.actId
    delete opt.groupId
    if (opt.__actId__) { opt.actId = opt.__actId__ }
    if (opt.__groupId__) { opt.groupId = opt.__groupId__ }
    delete opt.__actId__
    delete opt.__groupId__
  }

  private makeRoute(): void {
    const pages = getCurrentPages()
    if (pages && pages.length > 0) {
      this.url = pages[pages.length - 1].route || ""
    }
  }

  private isNav(): boolean {
    return !!this.url.match("/nav/nav")
  }

  // 上报数字 - 之后替换
  private report(key: string, params: string): void {
    const result = Number(params)
    try {
      if (result < 1 || Number.isNaN(result)) {
        console.log("错误警告", key, params, this.loadParamsCache)
        this.utilInSuperPage.reportException(
          `loadOption ${key}`,
          this.loadParamsCache,
          PerformanceMonitorId.LOAD_PARAMS_IS_EXCEPTION,
        )
      }
    } catch (error) {
      wxlog.setFilterMsg("onLoad 上报 报错")
      wxlog.warn({
        key: `loadOption ${key}`,
        value: this.loadParamsCache,
      })
      console.error("report 报错")
    }
  }

  // 上报string - 之后替换
  private reportString(key: string, params: string): void {
    try {
      if (!params) {
        console.log("错误警告", key, params, this.loadParamsCache)
        this.utilInSuperPage.reportException(
          `loadOption ${key}`,
          this.loadParamsCache,
          PerformanceMonitorId.LOAD_PARAMS_IS_EXCEPTION,
        )
      }
    } catch (error) {
      wxlog.setFilterMsg("onLoad 上报 报错")
      wxlog.warn({
        key: `loadOption ${key} undefined`,
        value: this.loadParamsCache,
      })
      console.error("report 报错")
    }
  }

  private bindingUnloadObservable(): void {
    this.unloadSubject = new Subject<void>()
    this.unloadObservable = this.unloadSubject.asObservable()
  }

  /** 校验是否需要使用前端的错误提示 */
  private isNeedBreakOff(): boolean {
    if (this.isStopMarkRequest) {
      this.isStopMarkRequest = false
      this.http.clearMarkedRequest()
      return true
    }
    return false
  }

  private mergeComputed(): void {
    const mixinComputed = (this as any).mixinComputed
    if (mixinComputed && Object.keys(mixinComputed).length) {
      if (typeof this.computed !== "object") {
        this.computed = {}
      }
      Object.assign(this.computed, mixinComputed)
    }
    delete (this as any).mixinComputed
  }

}
