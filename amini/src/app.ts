
import { ShareHttpClient } from "@mono-shared/services/share-http-client.service"
import { HttpClient, needShowErrorSceneList } from "@core/services/http-client.service"
import { wxApp } from "@core/amini/core"
import { Observable, of, Observer, interval, throwError } from "rxjs"
import { finalize, share, takeWhile, filter, tap, retryWhen, delay, take, switchMap } from "rxjs/operators"
import "vendors/ald-stat"
import "vendors/qjl-demo"
import "vendors/array-includes"
import "vendors/array-every"
import "vendors/polyfill/string.polyfill"

if (!Number.isNaN) {
  Object.defineProperty(Number.prototype, "isNaN", {
    value: (value: any): boolean => {
      const n = Number(value)
      return n !== n
    },
  })
}

import { config } from "@config"
import { rxwx } from "@core/amini/rxwx"
import { UtilService } from "@core/services/util.service"
import { MQTTService } from "@mono-shared/services/mqtt/mqtt.service"
import { DefaultService, ApiResponseProWxLoginDTO, WxLoginParam, ApiResponseProUserDTO } from "@mono-shared/services/swagger.service"
import { Lock } from "@mono-shared/decorators/Lock"
import { wxlog } from "@core/decorators/qjl-wxlog"
import { TimeService } from "@mono-shared/utils/time.service"
import { ReportEvent } from "@core/amini/report-event"
import { LogService } from "@core/amini/log.service"
import { GRAY_FEATURE_CODE, GrayFeatureService } from "@mono-shared/services/gray-feature.service"
import { PerformanceMonitorService } from "@core/services/performance-monitor.service"
import { GROUP_TYPE_TEXT, GROUP_TYPE } from "@mono-shared/models/interfaces"

export interface IUserInfo {
  headimgurl: string
  nickname: string
  city: string
  sex: 0 | 1 | 2
  uid: number
  // _user.language = _user.language;
  // _user.province = _user.province;
}

const loginWhiteList: string[] = [
  "/pages/nav/nav",
]

const enum UpdateType {
  NO_UPDATE = 1,
  CHOOSE_TO_UPDATE = 2,
  FORCE_UPDATE = 3,
}

export const enum StorageKey {
  /** token */
  TOKEN = "token",
  /** 用户ID */
  UID = "plus_uid",
  /** 个人的GroupId */
  PERSONAL_GROUP_ID = "person_group_id",
  /** 今日是否登陆过小程序 */
  TODAY_VISIT = "todayVisit",
  /** 个人首页名称 */
  PERSONAL_NIKE_NAME = "person_nike_name",
  /** email地址 */
  EMAIL_ADDRESS = "e-mail-address",
  /** uid取模上报错误日志的模 */
  REPORT_ERROR_UID_MOD = "reportErrorUidMod",
  /** 个人头像 */
  PERSONAL_HEAD_IMAGE = "person_head_image",
  /** 数据中心用token */
  DATA_CENTER_TOKEN = "data_center_token",
  /** 个人验证信息 */
  PERSONAL_REAL_AUTH = "person_real_auth",
  /** IM_SDK_APP_ID */
  TIM_SDK_APP_ID = "TIM_SDK_APP_ID",
  // /** 主页切换气泡坐标位置 */
  // SWITCH_BTN_POSITION = "switch_btn_position",
  /** 需要加密的接口列表 */
  NEED_TO_ENCRYPT_LIST = "need-to-encrypt-list",
}

/** 全局数据 */
export interface IGlobalData {
  /** 手机类型 */
  system: "ios" | "android"
  isDevTools: boolean
  isPc: boolean
  isIPhoneX: boolean
  /** 状态栏高度 */
  statusBarHeight: number
  /** 自定义 navbar 高度 */
  navHeight: number
  enterScene: App.SceneValues
  enterSceneOnLaunch: App.SceneValues
  inviteUid: number
  qrSource: string
  userInfo: IUserInfo
  systemInfo: wx.GetSystemInfoSuccessCallbackResult
  /** 手机型号类型 */
  phoneType: string
  // 初始化url
  initUrl: string
  /** 腾讯云ID */
  TIM_SDK_APP_ID: number
  [key: string]: any
  /** 是否没有个人头像 */
  hasNoHeaderImg?: boolean
}

// 兼容低版本
function compatible(): void {
  // 兼容旧版本
  if (!wx.setBackgroundColor) { wx.setBackgroundColor = (): void => { } }
}
compatible()

rxwx.init()
const reportConfig = {
  /** 必填 */
  appFunction: App,
  /** 必填 */
  pageFunction: Page,
  componentFunction: Component,
  /** 请求Host */
  statsHost: config.reportHost,
  /** 请求Url，如果为空则为测试模式，可以看log用 */
  reportUrl: "/userAction",
  /** 行为记录周期（秒） */
  actPeriod: 6,
  /** 心跳记录周期（秒） */
  hbPeriod: 15,
  /** 心跳onHide过期周期（毫秒） */
  onHidePeriod: 60,
  /** 小程序相关配置 */
  appName: "qunjielong",
  version: "1.0.0",
  clientType: "wxMini",
  canReport: false,
  getUid: (): number => parseInt(wx.getStorageSync(StorageKey.UID), 10),
}

const logConfig = {
  /** 请求Host */
  logHost: config.reportHost,
  /** 错误信息上报的URL */
  reportErrorUrl: "/frontLog/pushErrorLog",
}

const uid = parseInt(wx.getStorageSync(StorageKey.UID), 10)
const reportEvent = new ReportEvent()
reportEvent.initProcessApp(reportConfig, uid)

const enum firstLoginEnum {
  OLD_USER,
  NEW_USER,
}

@wxApp()
export class QunjielongApp implements App.AppInstance {
  public globalData = {} as IGlobalData
  /** 登录中，保证不会重复请求 */
  private loginRequestObs?: Observable<ApiResponseProWxLoginDTO> | null
  private loginFailCount: number = 0
  private ignoreUrlList: string[] = ["/nav/nav", "/authorization/authorization", "login/login"]
  private errList: Set<number> = new Set([])
  constructor(
    private shareHttpClient: ShareHttpClient,
    private httpClient: HttpClient,
    private utils: UtilService,
    private apiService: DefaultService,
    private timeService: TimeService,
    private proMqtt: MQTTService,
    private logService: LogService,
    private grayFeatService: GrayFeatureService,
    private monitor: PerformanceMonitorService,
  ) {
    this.logService.initLogService(logConfig)
    this.shareHttpClient.setClient(this.httpClient)
    this.grayFeatService.setApiService(this.apiService)
    MQTTService.apiURL = config.mqttServerUrl
    MQTTService.tokenUrl = "/sys/mqtt/login"
  }

  public onLaunch(options: App.ILaunchShowOption): void {
    wxlog.info("1. app onLaunch start")
    const data = this.globalData
    this.monitor.timeStart("开始 onLaunch -> 开始 onLoad 时间", 2001)
    this.monitor.timeStart("开始 onLaunch -> 开始 nav onLoad 时间", 2002)
    this.monitor.timeStart("开始 onLaunch -> onLoad -> 结束 onShow 时间", 2003)
    this.monitor.timeStart("启动小程序到进入个人主页的时间")
    this.setStorage("total-loading-images", "799") // for ktt
    wx.getSystemInfo({
      success: (res: wx.GetSystemInfoSuccessCallbackResult): void => {
        if (res.system && res.system.toLowerCase().indexOf("ios") >= 0) {
          data.system = "ios"
        } else {
          data.system = "android"
        }
        data.phoneType = `${res.brand} ${res.model}`
        // 适配 iphone X
        if (res.model && /iphone\s?(x|12)/i.test(res.model)) {
          data.isIPhoneX = true
        }
        data.statusBarHeight = res.statusBarHeight
        data.navHeight = res.statusBarHeight + 46
        data.systemInfo = res
        wxlog.info("2. app onLaunch end")
        data.isDevTools = res.platform === "devtools"
        data.isPc = !!res.system
          && (res.system.toLowerCase().indexOf("windows") >= 0 || res.system.toLowerCase().indexOf("macos") >= 0)
      },
    })
    data.initUrl = options.path
    data.scene = options.scene
    this.checkAppUpdateInPlus()
    setTimeout(() => {
      // 初始化加密接口列表
      this.httpClient.getNeedToEncryptList()
      this.checkFlushCache()
      this.initCanReport(true)
      this.proMqtt.initMqtt()
      this.setUserPersonalGroupId()
      this.getTIMAppId()
    })

    this.globalData.enterSceneOnLaunch = options.scene
  }

  public onShow(options: App.ILaunchShowOption): void {
    wxlog.info("1. app onShow start")
    reportEvent.setScene(options.scene)
    this.globalData.enterScene = options.scene
    this.globalData.initUrl = options.path
    this.globalData.inviteUid = options.query && options.query.inviteUid
    this.globalData.qrSource = options.query && options.query.source
    wxlog.info("2. app onShow end")
  }

  public onError(msg: string): void {
    // 避免同一错误多次报错 & 加页面路径 避免延迟 导致定位错误
    const hash = this.hashCode(msg)
    if (this.errList.has(hash)) {
      return
    }
    wxlog.setFilterMsg(String(hash))
    this.errList.add(hash)
    const url = this.getCurrentPageUrlWithArgs()
    wxlog.error("app onError", msg, url || "没有页面栈")
    this.grayFeatService.canIUseFeature(GRAY_FEATURE_CODE.REPORT_ERROR).subscribe((canReportError) => {
      this.logService.reportError(msg, uid, canReportError)
    })
  }

  /** 获取用户信息 */
  public getUserInfo(): Observable<IUserInfo> {
    if (this.globalData.userInfo) {
      return of(this.globalData.userInfo)
    } else {
      return new Observable((observer: Observer<IUserInfo>): void => {
        wx.getUserInfo({
          success: (res: wx.GetUserInfoSuccessCallbackResult): void => {
            this.globalData.userInfo = this.globalData.userInfo || {}
            const store = this.globalData.userInfo
            const info = res.userInfo
            store.headimgurl = info.avatarUrl
            store.nickname = info.nickName
            store.city = info.city
            store.sex = info.gender
            observer.next(store)
            observer.complete()
          },
          fail: (res: wx.GeneralCallbackResult): void => {
            console.error("getUserInfo error:", res)
            observer.next(this.globalData.userInfo)
            observer.complete()
          },
        })
      })
    }
  }

  /** 获取上报对象 */
  public getReportEvent(): ReportEvent {
    return reportEvent
  }

  /** 登录，单例 */
  @Lock(1500)
  // tslint:disable-next-line: no-big-function
  public login(): Observable<ApiResponseProWxLoginDTO> {
    this.loginRequestObs = new Observable((observer: Observer<ApiResponseProWxLoginDTO>): void => {
      this.monitor.timeStart("wx.login 时间")
      wx.login({
        success: (res: wx.LoginSuccessCallbackResult): void => {
          this.monitor.timeEnd("wx.login 时间")
          const code = res.code
          this.monitor.timeStart("wx.getUserInfo 时间")
          wx.getUserInfo({
            withCredentials: true,
            success: (info: wx.GetUserInfoSuccessCallbackResult): void => {
              this.monitor.timeEnd("wx.getUserInfo 时间")
              wx.showLoading({ title: "正在登录", mask: true, })
              this.utils.setGlobalData("userInfo", info.userInfo, true)
              const wxLoginParam = this.getWxLoginParam(info, code)
              this.monitor.timeStart("wxLoginUsingPOST 时间")
              this.apiService.wxLoginUsingPOST(wxLoginParam, { isSkipDefaultLoginCheck: true })
                .subscribe(
                  /** 获取成功 */
                  (loginRes: ApiResponseProWxLoginDTO) => {
                    this.monitor.timeEnd("wxLoginUsingPOST 时间")
                    if (!loginRes.data!.token) { return console.error("登录返回缺少token") }
                    this.setStorage(StorageKey.TOKEN, loginRes.data!.token)
                    this.setStorage(StorageKey.UID, loginRes.data!.uid)
                    this.globalData.userInfo.uid = loginRes.data!.uid!
                    observer.next(loginRes)
                    this.setVisitNumber()
                    this.updatePersonGroupIdObs().subscribe()
                    this.proMqtt.initMqtt()
                    this.reportNewUser(loginRes.data!.firstLogin === firstLoginEnum.NEW_USER)
                    this.initCanReport()
                    this.getTIMAppId()
                  },
                  /** 获取失败 */
                  (err: any) => {
                    this.handleLoginError(err, observer)
                  },
                  /** complete */
                  () => {
                    wx.hideLoading({})
                    observer.complete()
                  })
            },
            fail: (err: any): void => {
              this.loginFailWithoutAuthorization(observer, err)
            },
          })
        },
        fail: (err): void => {
          wx.hideLoading({})
          observer.error(err)
          observer.complete()
        },
      })
    }).pipe(finalize(() => {
      // 防止页面重复登录
      this.loginRequestObs = null
    }))
    return this.loginRequestObs.pipe(share())
  }

  @Lock(1500)
  public loginSilence(): Observable<ApiResponseProWxLoginDTO> {
    this.loginRequestObs = new Observable((observer: Observer<ApiResponseProWxLoginDTO>): void => {
      wx.login({
        success: (res: wx.LoginSuccessCallbackResult): void => {
          const code = res.code
          this.apiService.wxLoginSilenceUsingPOST(
            { code, scene: 0 },
            { isSkipDefaultLoginCheck: true },
          ).subscribe(
            (loginRes: ApiResponseProWxLoginDTO) => {
              console.log("loginSilence success", loginRes)
              if (!loginRes.data!.token) { return console.error("静默登录失败：缺少token") }

              this.setStorage(StorageKey.TOKEN, loginRes.data!.token)
              this.setStorage(StorageKey.UID, loginRes.data!.uid)
              if (this.globalData.userInfo) {
                this.globalData.userInfo.uid = loginRes.data!.uid!
              }
              observer.next(loginRes)

              this.reportNewUser(loginRes.data!.firstLogin === firstLoginEnum.NEW_USER)
            },
            (error: any) => {
              console.error("loginSilence fail", error)
              observer.error(error)
            },
            () => {
              observer.complete()
            },
          )
        },
      })
    }).pipe(finalize(() => {
      // 防止页面重复登录
      this.loginRequestObs = null
    }))

    return this.loginRequestObs.pipe(share())
  }

  /** 获取本地数据缓存 */
  public getStorage(key: string): any {
    try {
      let value = this.globalData[key]
      if (value === undefined) {
        value = wx.getStorageSync(key)
        this.globalData[key] = value
      }
      return value
    } catch (e) {
      wxlog.error("App getStorage 函数报错!")
      return ""
    }
  }

  /** 设置数据本地缓存，注意value 是可以 JSON.stringify */
  public setStorage(key: string, value: any, isSetGlobal: boolean = true): void {
    if (isSetGlobal) {
      this.globalData[key] = value
    }
    /** 无需同步 */
    wx.setStorage({ key, data: value })
  }

  /** 移除本地数据缓存 */
  public removeStorage(key: string): void {
    delete this.globalData[key]
    /** 无需同步 */
    wx.removeStorage({ key })
  }

  /** 获取 登录时用的 redirectUrl 参数 */
  public getCurrentPageUrlWithArgs(): string {
    const pages = getCurrentPages()    // 获取加载的页面
    const currentPage = pages[pages.length - 1]    // 获取当前页面的对象
    const url = currentPage && currentPage.route    // 当前页面url
    if (!url) { return "" }
    const options = (currentPage as any).options    // 如果要获取url中所带的参数可以查看options
    // 拼接url的参数
    let urlWithArgs = "/" + url + "?"
    Object.keys(options).forEach((key: any) => {
      const value = options[key]
      urlWithArgs += key + "=" + value + "&"
    })
    urlWithArgs = urlWithArgs.substring(0, urlWithArgs.length - 1)
    return urlWithArgs
  }

  public checkAppUpdateInPlus(): void {
    const updateManager = wx.getUpdateManager()
    updateManager.onCheckForUpdate(() => {
      console.log("请求完新版本信息的回调")
    })
    updateManager.onUpdateReady(() => {
      console.log("新的版本已经下载好")
      this.checkCurrentPageAndToken()
    })
    updateManager.onUpdateFailed(() => {
      console.log("新版本下载失败")
    })
  }

  public updatePersonGroupIdObs(): Observable<ApiResponseProUserDTO> {
    return this.apiService.searchUserInfoUsingGET().pipe(
      tap((res) => {
        if (!res.data) { return }
        this.setStorage(StorageKey.PERSONAL_HEAD_IMAGE, res.data.headimgurl)
        this.setStorage(StorageKey.PERSONAL_GROUP_ID, res.data.personGhId)
        this.setStorage(StorageKey.PERSONAL_NIKE_NAME, res.data.nickname)
        this.setStorage(StorageKey.PERSONAL_REAL_AUTH, res.data.realAuthFlag)
      }),
    )
  }

  // 获取决口登录参数
  private getWxLoginParam(info: wx.GetUserInfoSuccessCallbackResult, code: string): WxLoginParam {
    const { encryptedData, iv, signature } = info
    const { avatarUrl, city, country, gender, language, nickName, province } = info.userInfo
    return {
      code,
      avatarUrl,
      city,
      country,
      encryptedData,
      gender: gender as any,
      iv,
      language,
      nickName,
      province,
      signature,
      scene: this.globalData.scene,
      phoneType: this.globalData.phoneType,
    }
  }

  private handleLoginError(err: any, observer: Observer<ApiResponseProWxLoginDTO>): void {
    if (err.code === 1207) {
      wx.hideToast({})
      wx.hideLoading({})
      const Page = this.utils.getPage()
      Page.setData?.({
        pageWrapperRequestErrorMsg: err.msg,
      })
    } else if (++this.loginFailCount > 5) {
      wx.showToast({ title: "登录失败次数过多，请稍后重新启动小程序", icon: "none" })
    } else {
      wx.showToast({ title: err.title, icon: "none" })
      observer.error(err)
    }
  }

  private checkCurrentPageAndToken(): void {
    let isStopInterval = false
    interval(3000).pipe(
      takeWhile(() => !isStopInterval),
      filter(() => {
        const pages = getCurrentPages()
        const currentPage = pages[pages.length - 1]
        const url = currentPage.route
        const isHasIgnoreUrl = this.ignoreUrlList.some((item) => {
          return (url || "").indexOf(item) > -1
        })
        return !!url && !isHasIgnoreUrl
      }),
    ).subscribe(() => {
      isStopInterval = true
      this.getCurrentUpdateInfo()
    })
  }

  private getCurrentUpdateInfo(): void {
    this.apiService.refreshCheckUsingGET(config.version, { hideErrorToast: true })
      .pipe(
        retryWhen((errors) => errors.pipe(delay(2000), take(5))),
        tap((res) => {
          const data = res.data!
          const level = data.level
          const params: wx.ShowModalOption = {
            title: data.title!,
            content: data.content!,
            confirmColor: data.confirmColor || "#09ba07",
            confirmText: data.confirmText!,
          }
          if (level === UpdateType.CHOOSE_TO_UPDATE) {
            rxwx.showModal(params).subscribe((ret) => {
              if (ret.confirm) { this.applyUpdate() }
            })
          } else if (level === UpdateType.FORCE_UPDATE) {
            params.showCancel = false
            rxwx.showModal(params).subscribe(() => this.applyUpdate())
          }
        }),
      ).subscribe()
  }

  private applyUpdate(): void {
    const updateManager = wx.getUpdateManager()
    updateManager.applyUpdate()
  }

  // tslint:disable-next-line: cognitive-complexity
  private checkFlushCache(): void {
    if (!this.utils.getToken()) { return }
    this.apiService.getFrontFlushCacheResultUsingGET().subscribe((res) => {
      if (!res.data) {
        const oldPersonalGroupId = this.getStorage(StorageKey.PERSONAL_GROUP_ID)
        this.updatePersonGroupIdObs().subscribe()
        this.utils.getGlobalData("homeDataInfo")
        const pages = getCurrentPages()
        const currentPage = pages[pages.length - 1]
        const url = currentPage && currentPage.route
        const options = (currentPage as any).options
        if (!url) {
          this.redirectToHome()
          return
        }
        const groupIdToNumber = Number(options.groupId)
        if (!groupIdToNumber) {
          // 没有groupId的 或者groupId 是非数字字符串的 或者 groupId="0" 不作处理
          return
        } else if (options.groupId && groupIdToNumber === Number(oldPersonalGroupId)) {
          // 如果只有俩都是数字的情况下才会相等
          options.groupId = this.getStorage(StorageKey.PERSONAL_GROUP_ID)
          this.utils.redirectTo(url, options)
        } else if (!needShowErrorSceneList.includes(this.globalData.enterScene || 0)) {
          // 在这里排除二维码情况 其他情况 groupId无法处理 回首页
          this.redirectToHome()
          return
        }
      }
    })
    try {
    } catch { }
  }

  private redirectToHome(): void {
    this.utils.redirectTo("/pages/homepage/customer-homepage/customer-homepage", {
      navHome: 1,
      groupType: GROUP_TYPE.CUSTOMER,
    })
  }

  /** 登录未授权失败回调 */
  private loginFailWithoutAuthorization(observer: Observer<ApiResponseProWxLoginDTO>, err: any): void {
    // if (this.loginFailCount === 0) {
    //   wx.redirectTo({
    //     url: "/pages/authorization/authorization?redirectUrl="
    //       + encodeURIComponent(this.getCurrentPageUrlWithArgs()),
    //   })
    //   wx.showToast({ title: "小程序尚未获取授权", icon: "none" })
    //   of({})
    //   return
    // }
    if (this.loginFailCount === 0) {
      const pathWithArg = this.getCurrentPageUrlWithArgs()
      const isWhitePath = loginWhiteList.find((item) => {
        return pathWithArg.indexOf(item) > -1
      })
      const PageType = this.getPageType()
      if (PageType.isDetail && !PageType.isDetailStartParent) {
        this.goToDetailGuest(PageType.isDetailGuest)
      } else if (!PageType.isQcCode) {
        // 只有nav跳前置页
        const defaultBeforeLoginPage = "/pages/homepage/customer-homepage/customer-homepage"
        wx.redirectTo({
          url: isWhitePath
            ? `${defaultBeforeLoginPage}?redirectUrl=${encodeURIComponent(pathWithArg)}`
            : "/pages/authorization/authorization?redirectUrl=" + encodeURIComponent(pathWithArg),
        })
      } else {}
      /** 这玩意好像没有 complete 掉 */
      observer.complete()
      return
    }
    console.log("login err", err)
    observer.error(err)
    observer.complete()
  }

  private getPageType(): {
    isDetail: boolean,
    isDetailGuest: boolean,
    isDetailStartParent: boolean,
    isQcCode: boolean,
  } {
    const pathWithArg = this.getCurrentPageUrlWithArgs()
    return {
      isDetail: pathWithArg.includes("seq-detail/detail-"),
      isDetailGuest: pathWithArg.includes("seq-detail/detail-guest-mode"),
      isDetailStartParent: pathWithArg.includes("seq-detail/detail-start-group"),
      isQcCode: pathWithArg.includes("qc-code-route/qc-code-route"),
    }
  }

  private goToDetailGuest(isDetailGuest: boolean): void {
    if (isDetailGuest) { return }
    const pathWithArg = this.getCurrentPageUrlWithArgs()
    const pages = getCurrentPages()    // 获取加载的页面
    const currentPage = pages[pages.length - 1]    // 获取当前页面的对象
    const options = (currentPage as any).options    // 如果要获取url中所带的参数可以查看options
    wx.redirectTo({
      url: "/pages/seq-detail/detail-guest-mode/detail-guest-mode"
        + `?actId=${options.actId}&redirectUrl=${encodeURIComponent(pathWithArg)}`,
    })
  }

  private setVisitNumber(): void {
    /** 获取当天时间 */
    const lastSettingTime = this.getStorage(StorageKey.TODAY_VISIT) || 0
    const isExceed = this.timeService.getCurrentDay() - lastSettingTime > 0
    if (isExceed) {
      this.setStorage(StorageKey.TODAY_VISIT, this.timeService.getCurrentDay())
      this.apiService.addVisitNumUsingPUT({ isSkipDefaultLoginCheck: true }).subscribe()
    }
  }

  // private

  private getTIMAppId(): void {
    const token = this.getStorage(StorageKey.TOKEN)
    if (!token) { return }
    if (!this.globalData.TIM_SDK_APP_ID) {
      this.apiService.getAppIdUsingGET({ isSkipDefaultLoginCheck: true }).pipe(
        retryWhen((errors) => errors.pipe(delay(2000), take(5))),
      ).subscribe((res) => {
        this.globalData.TIM_SDK_APP_ID = Number(res.data)
        this.utils.setGlobalData("TIM_SDK_APP_ID", Number(res.data))
      })
    }
  }

  private setUserPersonalGroupId(): void {
    // onLaunch 中 setTimeout 会在初始化完成前执行该函数， 导致出现异常
    if (this && this.getStorage) {
      try {
        const token = this.getStorage(StorageKey.TOKEN)
        const personGroupId = this.getStorage(StorageKey.PERSONAL_GROUP_ID)
        const personNikeName = this.getStorage(StorageKey.PERSONAL_NIKE_NAME)
        const personPic = this.getStorage(StorageKey.PERSONAL_HEAD_IMAGE)
        const realAuthFlag = this.getStorage(StorageKey.PERSONAL_REAL_AUTH)
        if (token && (!personGroupId || !personNikeName || !personPic || !realAuthFlag)) {
          this.updatePersonGroupIdObs().subscribe()
        }
      } catch (error) {
        wxlog.setFilterMsg("getStorage")
        wxlog.info("getStorage this报错", "setUserPersonalGroupId", "app")
      }

    } else {
      setTimeout(() => this.setUserPersonalGroupId, 100)
    }
  }

  private hashCode(str: string): number {
    let hash = 0
    let i
    let chr
    if (str.length === 0) { return hash }
    for (i = 0; i < str.length; i++) {
      chr = str.charCodeAt(i)
      // tslint:disable:no-bitwise
      hash = ((hash << 5) - hash) + chr
      hash |= 0
    }
    return hash
  }

  private reportNewUser(isFirstLogin: boolean): void {
    // 新用户才上报
    if (!isFirstLogin) {
      return
    }
    const scene = this.globalData.enterScene
    this.httpClient.get(`${config.reportHost}/registeredSource`, {
      uid: this.globalData.userInfo.uid,
      scene,
    }, {
      isSkipPageMarking: true,
      hideErrorToast: true,
    }).subscribe()
  }

  private initCanReport(isSkipDefaultLoginCheck: boolean = false): void {
    this.grayFeatService.canIUseFeature(
      GRAY_FEATURE_CODE.REPORT_EVENT,
      isSkipDefaultLoginCheck,
    ).subscribe((canReport) => {
      reportEvent.changeCanReport(canReport)
    })
  }

  // tslint:disable-next-line: max-file-line-count
}
