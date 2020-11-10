import { IShareHttpClient, IShareHttpOptions, GROUP_TYPE, System } from "@mono-shared/models/interfaces"
import { Observable, Observer, of, throwError, OperatorFunction, timer, forkJoin, race } from "rxjs"
import { config } from "@config"
import { UtilService } from "./util.service"
import { tap, catchError, mapTo, share, retryWhen, delay, take, switchMap, map } from "rxjs/operators"
import { Injectable } from "../amini/core"
import { RuntimeService } from "./runtime.service"
import { StorageKey } from "@/app"
import { PerformanceMonitorId } from "./monitor-id.interfaces"
import { PerformanceMonitorService } from "./performance-monitor.service"
import { HttpErrorCode } from "./http-error.interface"
import { RouteService } from "@/pages/services/route.service"
import { MonoCommonService } from "@mono-shared/services/mono-common.service"
import { DefaultService } from "@mono-shared/services/swagger.service"
import { DecryptAndEncryptService, IDecryptDtail } from "./decrypt-and-encrypt.service"
import { Lock } from "@mono-shared/decorators/Lock"
import { wxlog } from "@core/decorators/qjl-wxlog"

export const skipErrorOptions: IShareHttpOptions = {
  isSkipDefaultLoginCheck: true,
  /** 跳过页面标记 */
  isSkipPageMarking: true,
  /** 不显示默认错误信息 */
  hideErrorToast: true,
}

/** 后端返回的 基础请求响应 */
export interface IBaseRes {
  data?: any
  code?: number
  msg?: string
  success?: boolean
  statusCode?: number
  encrypted?: boolean
}

interface IErrorRes {
  statusCode: number
  data: IBaseRes
}

const queryString = (obj: object): string => {
  const keys = Object.keys(obj).sort()
  let str = ""
  keys.forEach((k) => {
    if (obj[k] === undefined || obj[k] === null) { return }
    // str += `&${k}=${obj[k]}`
    str += `&${k}=${encodeURIComponent(obj[k])}`
  })

  return str.slice(1)
}

const enum FrontErrorMessage {
  LOGIN = "前端登陆转换操作",
}

// TODO: 等产品确定
export const needShowErrorSceneList: number[] = [
  // 小程序卡片
  1007, 1008, 1096,
  // 通知
  1014, 1043, 1107,
  // 会话
  1088, 1073, 1074, 1081, 1082,
  // 公众号文章
  1058,
  // 二维码
  1011, 1012, 1013, 1047, 1048, 1049,
]

const showContactServiceErrorCode: number[] = [
  1401,
]

const needNotShowErrorUrlList: string[] = [
  "/pages/seq-detail/detail-start-group/detail-start-group",
  "/pages/seq-detail/detail-go-group-buy/detail-go-group-buy",
  "/pages/seq-detail/detail-group-buy/detail-group-buy",
  "/pages/seq-detail/detail-sign-up/detail-sign-up",
  "/pages/seq-detail/detail-together-buy/detail-together-buy",
  "/pages/seq-detail/detail-interact/detail-interact",
  "/pages/seq-detail/detail-read/detail-read",
  "/pages/seq-detail/detail-elect/detail-elect",
  "/pages/seq-detail/detail-fee/detail-fee",
  "/pages/seq-detail/community-moment-detail/community-moment-detail",
  "/pages/seq-detail/detail-together-buy-v2/detail-together-buy-v2",
  "/pages/seq-detail/detail-market/detail-market",
  "/pages/seq-detail/detail-mutual-sale-parent/detail-mutual-sale-parent",
  "/pages/seq-detail/detail-mutual-sale-child/detail-mutual-sale-child",
  "/pages/seq-detail/detail-form/detail-form",
]

const REFRESH_STORAGE_CODE = 1209

// 需要加密的接口 没有加hash
const REFRESH_NEED_TO_ENCRYPT_LIST_CODE = 1700

// 增加加密的接口校验出错
const ENCRYPT_DATA_ERR_CODE = 1701

const HEADER_HASH = "hash"

const EMPTY_TOKEN_WHILTE_LIST: string[] = [
  "/user/login/wx_login",
  // "/user/all_activities_inner_act_without_token",
  // "/user/gh_company/activity_order_visit_data",
  // "/user/playing_ways_activity",
  "/sys/encrypt/get_encrypt_request_list",
  "/activity/guest/pre_detail",
  "/sys/url_manager/full_link",
]

const TIMEOUT_RETRY_LIST: string[] = [
  "/activity/create_activity/get_group_deliver_list_for_add_child_activity",
  "/sys/wx_safety_audit/create_session_key",
  "/gh/open_day/check_icon",
  "/sys/draw_share_image/activity_detail/",
]

@Injectable()
export class HttpClient implements IShareHttpClient {
  public isTryToReload: boolean = false
  /** 是否开始标记需要等待接口 */
  private marking: boolean = false
  /** 被标记需要等待的接口 */
  private markedRequest: Array<Observable<IBaseRes | IErrorRes>> = []
  private isLogining: boolean = false

  constructor(
    private utils: UtilService,
    private routeService: RouteService,
    private runtimeService: RuntimeService,
    private aliMonitor: PerformanceMonitorService,
    private commonService: MonoCommonService,
    private decryptAndEncryptService: DecryptAndEncryptService,
    private apiService: DefaultService,
  ) {

  }

  public get<T>(url: string, params?: object, options?: IShareHttpOptions): Observable<T> {
    return this.handledRequest("GET", url, params, options) as Observable<T>
  }

  public post<T>(url: string, params?: object, options?: IShareHttpOptions): Observable<T> {
    return this.handledRequest("POST", url, params, options) as Observable<T>
  }

  public delete<T>(url: string, params?: object, options?: IShareHttpOptions): Observable<T> {
    return this.handledRequest("DELETE", url, params, options) as Observable<T>
  }

  public put<T>(url: string, params?: object, options?: IShareHttpOptions): Observable<T> {
    return this.handledRequest("PUT", url, params, options) as Observable<T>
  }

  public head<T>(url: string, params?: object, options?: IShareHttpOptions): Observable<T> {
    return this.handledRequest("HEAD", url, params, options) as Observable<T>
  }
  public options<T>(url: string, params?: object, options?: IShareHttpOptions): Observable<T> {
    return this.handledRequest("OPTIONS", url, params, options) as Observable<T>
  }
  public patch<T>(url: string, params?: object, options?: IShareHttpOptions): Observable<T> {
    return this.handledRequest("PATCH", url, params, options) as Observable<T>
  }

  /** 开始记录需要等待的接口，这些接口全部完成的时候会触发 onAllDataLoaded，与 pager-wrapper 互动 */
  public startMarkRequestNeedWaited(): void {
    this.marking = true
  }

  /** 结束标记接口，返回 布尔值，true 全部加载完，false：有接口 fail 掉 */
  public endMarkRequestNeedWaited(): Observable<{ success: boolean, err?: IErrorRes }> {
    this.marking = false
    const requestList = this.markedRequest
    this.clearMarkedRequest()
    // 保证不发请求时页面页正常
    const obs = requestList.length === 0
      ? of(1) // 必须发个参数才有效
      : forkJoin(...requestList)
    return obs
      .pipe(
        catchError((err) => throwError(err)),
        mapTo({ success: true }),
      )
  }

  /** 手动 clear markRequest */
  public clearMarkedRequest(): void {
    this.markedRequest = []
  }
  /** 获取加密接口列表 */
  @Lock()
  public getNeedToEncryptList(): void {
    this.apiService.getEncryptRequestListUsingGET().subscribe((res) => {
      // 判断返回结果类型
      if (res && res.data && Array.isArray(res.data)) {
        const app = this.utils.getApp()
        app.setStorage(StorageKey.NEED_TO_ENCRYPT_LIST, res.data)
      } else {
        console.warn("获取的加密接口列表数据不是数组")
      }
    })
  }

  /* ************************ 请求处理 AOP ******************************* */

  /** 请求 AOP，登录校验，统一接口 */
  private handledRequest(
    method: wx.RequestOption["method"],
    url: string,
    params?: object,
    options?: IShareHttpOptions,
  ): Observable<IBaseRes> {
    return this.request(method, url, params, options)
    .pipe(
      retryWhen((errors) => {
        return errors.pipe(
          map((err: any) => {
            if (err.statusCode !== 403 || err.data?.code !== REFRESH_NEED_TO_ENCRYPT_LIST_CODE) {
              // 非特定错误 直接抛出错误
              throw err
            }
            // 特定错误 拦截错误 触发重试
          }),
          take(3),
        )
      }),
      this.commonCatchError(options),
    )
  }

  /** 错误统一处理 */
  private commonCatchError(options: IShareHttpOptions = {}): OperatorFunction<IErrorRes | IBaseRes, IBaseRes> {
    return catchError((err: IErrorRes) => {
      if (options.isShowLoading) { wx.hideLoading({}) }
      if (!options.hideErrorToast && !showContactServiceErrorCode.includes(err.data.code!)) {
        wx.showToast({ title: err.data && err.data.msg || "请求错误", icon: "none" })
      }
      if (!options.hideContactServiceModal && showContactServiceErrorCode.includes(err.data.code!)) {
        const Page = this.utils.getPage()
        Page.setData?.({
          pageWrapperRequestErrorMsg: err.data.msg,
        })
      }
      console.error("request error: ", err.data && err.data.msg)
      const errRes = err.data
        ? { ...err.data, statusCode: err.statusCode }
        : { errMsg: "httpClient请求错误" }
      return throwError(errRes)
    })
  }

  private relogin(): void {
    if (this.isLogining) { return }
    console.log("正在重新登陆....")
    this.aliMonitor.sum(PerformanceMonitorId.RELOGIN_TIME, 1)
    this.isLogining = true
    const app = this.utils.getApp()
    this.runtimeService.time("relogin")
    app.login()
      .pipe(retryWhen((errors) => errors.pipe(delay(2000), take(5))))
      .subscribe(
        () => {
          // console.log("PERFOR: 登陆成功!")
          // wx.showToast({ title: "登录成功" })
          // timer(500).subscribe(() => {
          const Pages = this.utils.getPage()
          const currentPageUrl = "/" + Pages.route
          const params = (Pages as any).options || {}
          this.utils.redirectTo(currentPageUrl, params)
          const loginTime = this.runtimeService.timeEnd("relogin")
          this.reportLoginTime(loginTime)
          // })
        },
        () => {},
        () => {
          this.isLogining = false
        },
      )
  }

  private reportLoginTime(loginTime: number): void {
    /** 慢慢发请求，不着急 */
    this.aliMonitor.avg(PerformanceMonitorId.RELOGIN_WASTAGE, loginTime)
  }

  /* ************************ 底层请求封装 ******************************* */

  /** 去除无效参数 */
  private removeEmptyParam(params: object): object {
    return Object.keys(params)
      .filter((key: any) => params[key] !== undefined && params[key] !== null)
      .reduce((ret: object, key: any) => ({ ...ret, [key]: params[key] }), {})
  }

  /** data中 非object 的参数 转换为 queryString */
  private createQueryString(data: object): string {
    const querystringObj = Object.keys(data)
      .filter((key: any) => typeof data[key] !== "object")
      .reduce((ret: object, key: any) => ({ ...ret, [key]: data[key] }), {})
    return queryString(querystringObj)
  }

  /** data 中首个对象属性就是 body */
  private createBody(data: object): object {
    const bodyKey = Object.keys(data).find((key: any) => typeof data[key] === "object")
    return bodyKey ? data[bodyKey] : null
  }

  /** 创建url */
  private createUrl({ url, host = config.host, query = "" }: { url: string, host?: string, query?: string }): string {
    const result = (/^https?:/.test(url) ? url : host + url) + (query ? `?${query}` : "")
    return this.commonService.resolveUrl(result)
  }

  /** 判断接口是否需要加密 */
  private needToEncrypt(url: string, needToEncryptList: string[]): boolean {
    return needToEncryptList.indexOf(url) >= 0
  }
  /** 获取加密后的字符串 */
  private addSignToQuery(url: string, query: string, body: object): string {
    if (!query && !body) {
      return query
    }
    let hashStr = url
    if (query) {
      hashStr += "?" + query
    }
    if (body !== null && typeof body === "object") {
      hashStr += JSON.stringify(body)
    }
    return this.decryptAndEncryptService.encrypt(hashStr)
  }

  /** 通用请求 */
  // tslint:disable:cognitive-complexity
  // tslint:disable-next-line:no-big-function
  private request(
    method: wx.RequestOption["method"],
    url: string,
    params: object = {},
    option: IShareHttpOptions = {},
  ): Observable<IBaseRes | IErrorRes> {
    const app = this.utils.getApp()
    const data = this.removeEmptyParam(params)
    const querystring = this.createQueryString(data)
    const body = this.createBody(data)
    // 微信 7.0.10 写了一个 loading 不消失的 bug，我们帮他们擦一下屁股。
    // 暂时注释掉：https://developers.weixin.qq.com/community/develop/doc/000c647011cec8fab3a9624b756c00?highline=7.0.10jiazha
    // 已恢复
    if (option.isShowLoading) {
      wx.showLoading({
        title: option.showLoadingTitle ? option.showLoadingTitle : "加载中",
      })
    }
    // tslint:disable-next-line: no-big-function
    const requestObs = Observable.create((observer: Observer<IBaseRes>) => {
      // console.log("---->", url)
      /** 如果发现没有 token 直接走重新登陆 */
      const authToken = app.getStorage(StorageKey.TOKEN)
      const uid = app.getStorage(StorageKey.UID)
      if (!authToken && !option.isSkipDefaultLoginCheck && !EMPTY_TOKEN_WHILTE_LIST.includes(url)) {
        /** 上报 token 为空的情况 */
        if (!this.isLogining) {
          setTimeout(() => {
            this.aliMonitor.sum(PerformanceMonitorId.REQUEST_WITH_EMPTY_TOKEN)
            if (app.getStorage(StorageKey.UID)) {
              /** 上报 token 为空但是 UID 不为空的情况 */
              this.aliMonitor.sum(PerformanceMonitorId.REQUEST_WITH_EMPTY_TOKEN_BUT_NONEMPYTY_UID)
            }
          })
        }
        this.relogin()
        observer.complete()
        return
      }
      const needToEncryptList = app.getStorage(StorageKey.NEED_TO_ENCRYPT_LIST) || []
      const hashHeader = {}
      if (this.needToEncrypt(url, needToEncryptList)) {
        this.aliMonitor.sum("增加hash请求头数量")
        hashHeader[HEADER_HASH] = this.addSignToQuery(url, querystring, body)
      }
      wx.request({
        url: this.createUrl({ url, host: option.host, query: querystring }),
        method,
        header: {
          "content-type": option.contentType || "application/json",
          "companyId": config.companyId,
          "Authorization": authToken,
          "rc": config.randomCode,
          uid,
          "version": config.encryptVersion || "",
          "device-type": app.globalData.system === "ios" ? System.IOS : System.ANDROID,
          "sceneCode": app.globalData.enterScene,
          ...(option.headers || {}),
          ...(config.routerHeader || {}),
          ...hashHeader,
        },
        data: body,
        success: (res: wx.RequestSuccessCallbackResult): void => {
          // 请求到服务器
          if (res.statusCode >= 200 && res.statusCode < 400) {
            const { encrypted = "" } = res.header
            const result = res.data as IAnyObject
            if (encrypted && result && typeof result === "object") {
              // tslint:disable-next-line: max-line-length
              this.decryptAndEncryptService.decrypt(result.data).subscribe((decryptDetail: IDecryptDtail) => {
                  // 解密数据后得到data 和解密时间
                  const { decryptData , duration = 0 } = decryptDetail || {}
                  result.data = decryptData
                   // 根据解密时间做相应的上报
                  this.aliMonitor.avg("平均解密时间", duration)
                  if (duration > 50) {
                     this.aliMonitor.avg("平均解密时间大于50", duration)
                   }
                  if (duration > 300) {
                     this.aliMonitor.avg("平均解密时间大于300", duration)
                   }
                  if (duration > 1000) {
                    // 解密时间大于1000毫秒的 通过log上报，去排查问题
                    // tslint:disable-next-line: max-line-length
                    const decryptMessage = `解密时间为：${duration}ms 请求路径及参数:uid: ${uid} url:${url} query:${querystring} body:${body && JSON.stringify(body)}`
                    wxlog.info(decryptMessage)
                  }
                  observer.next(result)
                  observer.complete()
                }, (err) => {
                  observer.error(err)
                })
              return
            }
            observer.next(res.data as any)
          } else {
            const errMessage = {
              statusCode: res.statusCode,
              data: res.data,
            } as IErrorRes
            // 登录失败，尝试重新登录
            if (
              /** 不跳过登录检查的请求 */
              !option.isSkipDefaultLoginCheck &&
              /** 是 401 */
              res.statusCode === 401
            ) {
              this.relogin()
            } else if (this.needCheckIsFromOldQrCode(errMessage, option)) {
              this.checkIsFromOldQrCode(option)
            } else {
              // 如果是权限的错误 则特殊处理
              if (res.statusCode === 403) {
                this.handleForbidenErr(app, res, url)
              }
              observer.error(errMessage)
            }
          }
          observer.complete()
        },
        fail: (err: wx.GeneralCallbackResult): void => {
          // 网络错误
          observer.error({
            statusCode: HttpErrorCode.NETWORK_ERROR,
            data: {
              code: HttpErrorCode.NETWORK_ERROR,
              msg: "网络连接错误",
              extra: "New Error",
              success: false,
            },
          } as IErrorRes)
          observer.complete()
        },
      })
    }).pipe(
      tap(() => {
        if (option.isShowLoading) { wx.hideLoading({}) }
      }),
      share(),
    )
    if (this.marking && !option.isSkipPageMarking) { this.markedRequest.push(requestObs) }
    if (!this.isInTimeoutRetryList(url)) { return requestObs }
    return race(timer(5000), requestObs).pipe(
      switchMap((result: any) => {
        const isOverTime = result === 0
        if (isOverTime) {
          this.aliMonitor.sum(PerformanceMonitorId.HTTP_RETRY, 1)
          return this.request(method, url, params, option)
        } else {
          return of(result)
        }
      }),
    )
  }

  private needCheckIsFromOldQrCode(errMessage: IErrorRes, option: IShareHttpOptions): boolean {
    return errMessage.statusCode === 400 &&
      errMessage.data &&
      errMessage.data.code === REFRESH_STORAGE_CODE &&
      !option.isSkipCheckGroupId
  }

  /**
   * 处理403 forbidden的情况
   * @param app 全局app
   * @param res 返回结果
   * @param url 路径
   */
  private handleForbidenErr(app: any, res: any, url: string): void {
    /** 没有特定状态码 则不做任何处理 */
    if (!res.data || !res.data.code) {
      return
    }
    switch (res.data.code) {
    // 没有加校验值的错误码
    case REFRESH_NEED_TO_ENCRYPT_LIST_CODE:
      this.aliMonitor.sum("没有增加hash头")
      // 重新获取需要加密的接口列表 增加当前url
      const needToEncryptList = app.getStorage(StorageKey.NEED_TO_ENCRYPT_LIST) || []
      app.setStorage(StorageKey.NEED_TO_ENCRYPT_LIST, needToEncryptList.concat(url))
      this.getNeedToEncryptList()
      break
    // 校验出错 则上报校验出错
    case ENCRYPT_DATA_ERR_CODE:
      this.aliMonitor.sum("hash校验出错")
      break
    default:
      break
    }
  }

  private isInTimeoutRetryList(url: string): boolean {
    try {
      for (const t of TIMEOUT_RETRY_LIST) {
        if (url.includes(t)) { return true }
      }
    } catch (e) {
      return false
    }
    return false
  }

  private checkIsFromOldQrCode(option: IShareHttpOptions): void {
    option.hideErrorToast = true
    wx.hideLoading({})
    wx.hideToast({})
    if (this.isTryToReload) { return }
    this.isTryToReload = true
    try {
      const app = this.utils.getApp()
      const { initUrl, enterScene } = app.globalData
      app.updatePersonGroupIdObs().subscribe(() => {
        this.utils.getGlobalData("homeDataInfo")
        const pages = getCurrentPages()
        const currentPage = pages[pages.length - 1]
        const options = currentPage && (currentPage as any).options
        if (needShowErrorSceneList.includes(enterScene || 0) && !needNotShowErrorUrlList.includes(initUrl || "")) {
          this.routeService.goUtilPagesErrorPage({
            type: "redirectTo",
            data: options,
          })
        } else {
          setTimeout(() => {
            this.routeService.goHomepageCustomerHomepage({
              type: "reLaunch",
              data: { navHome: 1, groupType: GROUP_TYPE.CUSTOMER },
            })
            this.isTryToReload = false
          }, 1000)
        }
      })
      setTimeout(() => {
        this.isTryToReload = false
      }, 5000)
    } catch {
      this.isTryToReload = false
    }
  }
}
